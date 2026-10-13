# Recommendation budgets and family eligibility

## Root causes and inspected data

The Express recommendation route assembled every selected insured person but forwarded only the eldest age to FastAPI. Scoring applied that one age to policy matching, so a younger adult below a recorded entry-age minimum could be missed. Validation also discarded policies with missing eligibility fields before uncertainty could be represented.

The form's annual budget was forwarded to FastAPI but unused. The Policy schema contains only `basePremium`, without pricing period, coverage-tier, insured-age, family-size or underwriting scope. Read-only inspection of the actual running public catalog confirmed 10 policies, all with `basePremium: null`. Its eligibility objects contain only `minAge`, `maxAge`, and `familyFloaterAllowed`; no relationship-specific, dependency or child-age rules are stored.

No database records, policy definitions, schema, authentication, scoring weights, ranking order, or unrelated claim calculations were changed.

## Implemented behavior

### Premiums

Every recommended policy includes an additive `premiumAssessment` with the supplied budget, known catalog base premium (if any), verified annual premium (currently unavailable), status and explanation. Existing cards display this information using existing CSS/layout classes.

Current catalog premiums are **Insufficient Information**: policies remain in the results, and the UI explicitly states that affordability cannot be verified. A nonzero base premium is shown only as a catalog base premium with unverified period/scope; it is not treated as an annual quote. Missing, invalid or unknown premiums do not discard otherwise valid policy terms. Sum insured is never used as premium.

The isolated `assess_budget` comparison handles **Within Budget**, **Above Budget**, missing annual premium and no supplied budget. It accepts an independently established annual premium, and its regression tests use clearly synthetic annual-quote fixtures. The production catalog adapter passes no verified annual premium because the stored schema provides none. There is no claim of live annual-premium filtering or invented quote integration: trusted pricing evidence is still needed for that.

### Families

The public recommendation request remains unchanged. Express derives and forwards an additive `insuredMembers` list from the authenticated user's selected records; client-supplied ages/member lists cannot override those records. Names and database identifiers are not needed by the scoring service and are not forwarded in this list. The legacy scalar age remains for individual matching and request compatibility.

FastAPI evaluates every selected person. For adults aged 18 or above, each available recorded entry-age bound is applied; any adult violating a recorded bound makes that family candidate **Ineligible**, so the policy is omitted. A satisfied complete adult range produces an **Eligible** age check. A missing age, missing bound or incomplete range produces **Insufficient Information**, with partial known bounds still enforced.

Age 18 is used to separate adult entry-age checks from child checks; it does not define a child's insurance minimum. Children are marked **Insufficient Information**, and are not rejected using a general/adult entry-age minimum. `familyFloaterAllowed: false` remains a documented exclusion.

Relationship and dependency eligibility are **Insufficient Information** because the catalog provides no such rules. Relationships are not excluded using UI choices or assumed insurer restrictions. Consequently, a family with all adults inside recorded ranges can pass the available age checks while its overall assessment remains unverified until the insurer confirms relationships/dependents/children. Unknown-rule candidates are retained and clearly labeled.

Existing individual coverage matching is preserved. Requests from older callers that omit the member list remain accepted but cannot claim verified family eligibility.

## Files changed

- `server/routes/recommendations.js`
- `server/utils/analysisValidation.js`
- `server/utils/recommendationValidation.js`
- `server/tests/recommendationAssessment.test.js` (new)
- `client/src/components/RecommendationCard.jsx`
- `client/src/utils/recommendationValidation.js`
- `ml-service/main.py`
- `ml-service/recommendation_validation.py`
- `ml-service/recommendation_assessment.py` (new)
- `ml-service/test_recommendation_assessment.py` (new)
- `ml-service/test_recommendation_validation.py`
- `VALIDATION_AUDIT.md` (historical audit follow-up note)
- `INTEGRATION_AUDIT.md` (historical audit follow-up note)
- `RECOMMENDATION_CHANGES.md` (this report)

Assessment fields are additive and optional in frontend/backend response validation so existing recommendation response contracts still work. Present metadata is validated before rendering.

## Verification

- Full JavaScript suite: `node --test --test-isolation=none server/tests/*.test.js` — **25 passed, 0 failed**.
- Full Python suite: `ml-service/venv/bin/python -m unittest discover -s ml-service -p 'test_*.py' -v` — **18 passed, 0 failed**.
- Backend syntax: **29 JavaScript files passed**.
- Modified/new Python syntax: **5 files passed**.
- Frontend production build: **passed**.
- Targeted ESLint for the recommendation card and response-validation helper: **passed**.

Regression coverage includes annual quote within/above budget, unknown/unscoped/invalid premium, retained unknown-price policies, multiple family members, a younger adult violating a documented minimum, a member violating a maximum, partial/missing rules, children and unknown relationships, scalar-only older requests, individual behavior, metadata validation and forwarding authenticated members instead of client-provided ones. Synthetic test prices/rules are never saved to MongoDB or inserted into real policy definitions.

## Remaining limitations

Reliable annual quotes and relationship/dependent-child eligibility remain unavailable in the stored policy data. Full affordability and family eligibility therefore require insurer confirmation. Other documented issues (waiting-period field mismatch, approximate month calculations and uploaded-term defaults) remain outside this change. Lifestyle preferences are still unused by the scorer.

The prior live integration results are historical and were not rerun against this algorithm revision. This task performed a read-only catalog inspection plus automated tests/build checks; it did not write to MongoDB. Running services may require their normal restart/reload to load the revised FastAPI and Express code.


## Waiting-period follow-up

Later changes are documented in `WAITING_PERIOD_AUDIT.md`. Claimability and Rejection now share calendar-aware waiting-period dates/statuses. Exact positive-duration boundary days remain for wording review; PED/specific-illness applicability is not inferred from text. Missing extraction definitions remain unknown, and both pages use the backend's UTC calendar boundaries. Earlier audit results are historical; live integration of this revision must be rerun.
