"""Evidence-based assessments, independent of the existing scoring weights.

The catalog has only an unscoped basePremium, not an annual insured-person quote.
General entry-age ranges support adult checks; they do not define child eligibility.
No relationship restrictions are inferred from the list of selectable relationships.
"""
import math


def finite_number(value):
    return type(value) in (int, float) and math.isfinite(value) and value >= 0


def assess_budget(annual_premium, budget):
    """Compare only an independently established annual premium, never sum insured.

    This pure comparison is also the seam for future verified quote integration.
    The current catalog adapter cannot establish such a quote and passes None.
    """
    if annual_premium is None or not finite_number(annual_premium) or annual_premium <= 0:
        return {"status": "Insufficient Information", "annualPremium": None, "budget": budget,
                "message": "A reliable annual premium is unavailable. Affordability cannot be verified; obtain an insurer quote for the selected coverage and insured people."}
    if budget is None:
        return {"status": "No Budget Provided", "annualPremium": annual_premium, "budget": None,
                "message": "No annual premium budget was supplied."}
    within = annual_premium <= budget
    return {"status": "Within Budget" if within else "Above Budget", "annualPremium": annual_premium, "budget": budget,
            "message": "The verified annual premium is within your budget." if within else "The verified annual premium exceeds your budget."}


def assess_catalog_premium(policy, budget):
    # Do not reinterpret basePremium as annual: period, insured ages, member count,
    # coverage tier, and underwriting scope are not defined in the stored schema.
    assessment = assess_budget(None, budget)
    base = policy.get("basePremium")
    assessment["basePremium"] = base if finite_number(base) and base > 0 else None
    if assessment["basePremium"] is not None:
        assessment["message"] = "A catalog base premium is recorded, but its pricing period and quote scope are unspecified. Annual affordability cannot be verified; obtain an insurer quote."
    return assessment


def assess_family_eligibility(policy, members):
    eligibility = policy.get("eligibility") or {}
    allowed = eligibility.get("familyFloaterAllowed")
    minimum, maximum = eligibility.get("minAge"), eligibility.get("maxAge")
    known_minimum, known_maximum = finite_number(minimum), finite_number(maximum)
    known_range = known_minimum and known_maximum and minimum <= maximum
    checks = []
    if not members:
        return {"status": "Ineligible" if allowed is False else "Insufficient Information", "members": [],
                "message": "This policy does not support family coverage." if allowed is False else "Insured member details are missing. Family eligibility cannot be verified."}
    for member in members:
        age = member.age
        if age is None or not (known_minimum or known_maximum):
            age_status = "Insufficient Information"
            reason = "The member's age or the policy's recorded entry-age range is unavailable."
        elif age < 18:
            age_status = "Insufficient Information"
            reason = "Child-specific age rules are not stored. The general entry-age range is not used to reject children."
        elif (known_minimum and age < minimum) or (known_maximum and age > maximum):
            age_status = "Ineligible"
            reason = "This adult is outside the policy's recorded entry-age range."
        elif known_range:
            age_status = "Eligible"
            reason = "This adult is within the policy's recorded entry-age range."
        else:
            age_status = "Insufficient Information"
            reason = "The available age bound is satisfied, but the full entry-age range is unavailable."
        # The current Policy schema has no allowed-relationship or dependency rules.
        checks.append({"memberType": member.memberType, "relationship": member.relationship,
                       "age": age, "ageStatus": age_status,
                       "relationshipStatus": "Insufficient Information", "message": reason})
    if allowed is False or any(check["ageStatus"] == "Ineligible" for check in checks):
        status = "Ineligible"
        message = "The policy does not support family coverage or a selected adult violates its recorded entry-age range."
    else:
        status = "Insufficient Information"
        message = "All selected members were checked against available rules. Relationship, dependency and any child-specific eligibility rules are unavailable; confirm the full family with the insurer."
    return {"status": status, "members": checks, "message": message}
