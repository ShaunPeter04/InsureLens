from pydantic import BaseModel
from fastapi import FastAPI
from typing import Optional


app=FastAPI()

class UserRequirements(BaseModel):
    requiredCoverage: float
    coverageType: str

    age: int
    gender: str
    city: str

    annualIncome: Optional[float] = None
    budget: Optional[float] = None

    preExistingDiseases: list[str] = []

    isSmokerOrTobaccoUser: bool = False
    alcoholConsumption: Optional[str] = None
    hasHighRiskOccupation: bool = False

    coPaymentPreference: Optional[float] = 0

    roomRentPreference: Optional[str] = "No Restriction"


class RecommendationRequest(BaseModel):
    userRequirements: UserRequirements
    policies: list[dict]

def get_matched_coverage(coverage_amounts, required_coverage):
    eligible_coverages = [
        amount
        for amount in coverage_amounts
        if amount >= required_coverage
    ]

    if not eligible_coverages:
        return None

    return min(eligible_coverages)


def calculate_policy_score(policy, requirements):

    policy_types = policy.get("policyType", [])

    # Coverage type eligibility
    if requirements.coverageType not in policy_types:
        return None

    # Get policy eligibility rules
    eligibility = policy.get("eligibility", {})

    # Family Floater eligibility
    if requirements.coverageType == "Family Floater":
        if not eligibility.get("familyFloaterAllowed", False):
            return None

    # Age eligibility
    min_age = eligibility.get("minAge", 18)
    max_age = eligibility.get("maxAge", 65)

    if requirements.age < min_age or requirements.age > max_age:
        return None

    min_age = eligibility.get("minAge", 18)
    max_age = eligibility.get("maxAge", 65)

    if requirements.age < min_age or requirements.age > max_age:
        return None
    
    matched_coverage = get_matched_coverage(
        policy.get("coverageAmounts", []),
        requirements.requiredCoverage
    )

    if matched_coverage is None:
        return None

    score = 0

    # Coverage: 30 points
    coverage_ratio = requirements.requiredCoverage / matched_coverage

    coverage_score = min(
    coverage_ratio,
    1
    ) * 30
    score += coverage_score

        # Co-payment: 15 points
    policy_copay = policy.get("coPaymentPercentage", 0)
    preferred_copay = requirements.coPaymentPreference

    if policy_copay <= preferred_copay:
        copay_score = 15
    else:
        difference = policy_copay - preferred_copay

        copay_score = max(
            0,
            15 - (difference / 100 * 15)
        )

    score += copay_score

        # Room-rent limit: 15 points
    room_rent = policy.get("roomRentLimit", {})

    has_cap = room_rent.get("hasCap", False)
    room_type = room_rent.get("roomTypeAllowed", "No Restriction")

    if requirements.roomRentPreference == "No Restriction":

        if not has_cap and room_type == "No Restriction":
            room_rent_score = 15

        elif not has_cap:
            room_rent_score = 12

        elif room_type == "Single Private AC":
            room_rent_score = 10

        elif room_type == "Twin Sharing":
            room_rent_score = 7

        else:
            room_rent_score = 4

    else:
        # User is flexible about room-rent restrictions
        if not has_cap:
            room_rent_score = 15
        else:
            room_rent_score = 10

    score += room_rent_score



    # Pre-existing disease handling: 15 points
    user_peds = requirements.preExistingDiseases

    waiting_periods = policy.get("waitingPeriods", {})

    ped_wait_months = waiting_periods.get(
        "preExistingDiseasesMonths",
        36
    )

    if len(user_peds) == 0:
        ped_score = 0
        ped_applicable = False

    else:
        ped_applicable = True

        if ped_wait_months <= 12:
            ped_score = 15
        elif ped_wait_months <= 24:
            ped_score = 12
        elif ped_wait_months <= 36:
            ped_score = 9
        else:
            ped_score = 5

    if ped_applicable:
        score += ped_score

        # General waiting periods: 10 points
    initial_wait = waiting_periods.get("initialDays", 30)
    specific_wait = waiting_periods.get(
        "specificIllnessesMonths",
        24
    )

    # Initial waiting period: max 5 points
    if initial_wait <= 30:
        initial_wait_score = 5
    elif initial_wait <= 60:
        initial_wait_score = 3
    elif initial_wait <= 90:
        initial_wait_score = 1
    else:
        initial_wait_score = 0

    # Specific illness waiting period: max 5 points
    if specific_wait <= 12:
        specific_wait_score = 5
    elif specific_wait <= 24:
        specific_wait_score = 4
    elif specific_wait <= 36:
        specific_wait_score = 2
    else:
        specific_wait_score = 0

    waiting_period_score = (
        initial_wait_score + specific_wait_score
    )

    score += waiting_period_score

        # Hospitalization coverage: 15 points
    hospitalization = policy.get("hospitalizationCoverage", {})

    inpatient_covered = hospitalization.get(
        "inpatientCovered",
        False
    )

    daycare_covered = hospitalization.get(
        "daycareTreatmentsCovered",
        False
    )

    pre_days = hospitalization.get(
        "preHospitalizationDays",
        0
    )

    post_days = hospitalization.get(
        "postHospitalizationDays",
        0
    )

    # Inpatient coverage: 5 points
    inpatient_score = 5 if inpatient_covered else 0

    # Daycare coverage: 3 points
    daycare_score = 3 if daycare_covered else 0

    # Pre-hospitalization: 3 points
    if pre_days >= 60:
        pre_hospital_score = 3
    elif pre_days >= 30:
        pre_hospital_score = 2
    else:
        pre_hospital_score = 1

    # Post-hospitalization: 4 points
    if post_days >= 90:
        post_hospital_score = 4
    elif post_days >= 60:
        post_hospital_score = 3
    elif post_days >= 30:
        post_hospital_score = 2
    else:
        post_hospital_score = 1

    hospitalization_score = (
        inpatient_score
        + daycare_score
        + pre_hospital_score
        + post_hospital_score
    )

    score += hospitalization_score

        # Normalize score to 100 based on applicable factors
    max_applicable_score = 100 if ped_applicable else 85

    normalized_score = (
        score / max_applicable_score
    ) * 100

    return {
    "totalScore": round(normalized_score, 2),
    "breakdown": {
        "coverage": round(coverage_score, 2),
        "coPayment": round(copay_score, 2),
        "roomRent": round(room_rent_score, 2),
    "preExistingDisease": {
        "applicable": ped_applicable,
        "score": round(ped_score, 2)
    },     
   "waitingPeriods": {
            "score": round(waiting_period_score, 2),
            "initialWaiting": round(initial_wait_score, 2),
            "specificIllnessWaiting": round(specific_wait_score, 2)
        },
        "hospitalization": {
           "score": round(hospitalization_score, 2),
            "inpatient": round(inpatient_score, 2),
            "daycare": round(daycare_score, 2),
            "preHospitalization": round(pre_hospital_score, 2),
            "postHospitalization": round(post_hospital_score, 2)
        }
    }
}


@app.post("/recommend")
def recommend(request: RecommendationRequest):
    requirements = request.userRequirements
    recommendations = []

    for policy in request.policies:

        # Calculate recommendation score
        score_result = calculate_policy_score(
        policy,
        requirements
    )

        # None means policy does not meet required coverage
        if score_result is None:
            continue

        matched_coverage = get_matched_coverage(
            policy.get("coverageAmounts", []),
            requirements.requiredCoverage
        )

        recommendations.append({
        "policyId": str(policy.get("_id", "")),
        "insuranceCompany": policy.get("insuranceCompany"),
        "policyName": policy.get("policyName"),
        "matchedCoverage": matched_coverage,
        "score": score_result["totalScore"],
        "scoreBreakdown": score_result["breakdown"]
    })

    # Highest score first
    recommendations.sort(
        key=lambda item: item["score"],
        reverse=True
    )

    return {
        "recommendations": recommendations[:5]
    }