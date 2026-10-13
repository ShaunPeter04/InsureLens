# InsureLens validation audit

This audit adds validation at request, stored-analysis, and response boundaries. It preserves database schemas, catalog definitions, scoring weights, insurance rules, JWT behavior, and ML predictions. No live database operations, migrations, reseeding, or user-data edits were performed.

## Findings and fixes

| Module | Confirmed gaps fixed or checks retained |
| --- | --- |
| Registration/Login | Reject malformed bodies and field types before string operations; reject whitespace-only credentials; reuse profile validation for names, addresses, dates, dropdowns and income; normalize persisted profile fields and duplicate lookups; remove password hash from registration response; synchronous submission guards. |
| Profile | Existing update validation and ownership checks retained. Align calendar-day validation with other modules using Asia/Kolkata. |
| My Policies | Existing ID, dates, coverage, duplicate, upload and ownership validation retained. |
| Hospitalization cases | Existing text, dates/times, amounts, dropdowns, family/policy ownership and expense-total validation retained. |
| Recommendations | Reject coerced booleans/arrays as amounts, nonfinite values, invalid selections/types, malformed disease arrays and family IDs. Validate profile-derived age (0–120), gender/income, and member ownership. Support existing title-case family genders while normalizing new edits. Validate family-member forms/routes. Validate catalog scoring data and ML response shapes/IDs. Guard repeated submissions; show empty-result and service-failure messages. |
| Claimability | Revalidate stored hospitalization data, policy dates, sum insured and terms before analysis, including legacy records. Reject missing/nonfinite terms, bad arrays and inconsistent dates with actionable errors. Validate response fields consumed by the UI. Preserve existing ownership checks and retries that reuse created cases. |
| Rejection Analysis | Preserve input and ownership checks. Reject missing/foreign linked hospitalizations on analysis; validate response arrays before rendering. Preserve unavailable-ML behavior and case reuse on retries. |

Budget is optional in the existing UI/API; when supplied it must be positive and finite. Diseases support both existing selections and custom names, with bounded text arrays. Age is derived from authenticated profile/family birth dates; per-policy age matching stays in the existing scorer. Admission before policy commencement remains an analysis outcome, rather than an invalid hospitalization record.

Room rent is a daily rate, not a total room charge, so no direct comparison with total hospital bill was added. Room-type restrictions without a numeric daily cap remain valid: these occur in existing catalog products, and claimability retains its existing “not verified/manual review” result. Claim documents are not uploaded in the current claimability workflow; policy PDF validation remains in My Policies.

## Files changed in this audit

- `client/src/pages/Recommendations.jsx`
- `client/src/pages/Claimability.jsx`
- `client/src/pages/RejectionAnalysis.jsx`
- `client/src/pages/Login.jsx`
- `client/src/pages/Register.jsx`
- `client/src/utils/authValidation.js`
- `client/src/utils/profileValidation.js`
- `client/src/utils/insuranceValidation.js`
- `client/src/utils/recommendationValidation.js` (new)
- `client/src/utils/analysisResponseValidation.js` (new)
- `server/routes/recommendations.js`
- `server/routes/claimCases.js`
- `server/routes/familyMembers.js`
- `server/routes/auth.js`
- `server/routes/rejectionCases.js`
- `server/utils/authValidation.js`
- `server/utils/profileValidation.js`
- `server/utils/insuranceValidation.js`
- `server/utils/recommendationValidation.js` (new)
- `server/utils/analysisValidation.js` (new)
- `server/tests/insuranceValidation.test.js`
- `server/tests/validationAudit.test.js` (new)
- `ml-service/main.py` (request models only; scoring unchanged)
- `ml-service/recommendation_validation.py` (new)
- `ml-service/test_recommendation_validation.py` (new)
- `VALIDATION_AUDIT.md` (new)

Existing changes from earlier work in other files were preserved.

## Verification

- Full JavaScript validation suite: `node --test --test-isolation=none server/tests/*.test.js` — 22 tests pass.
- FastAPI/Pydantic validation and scoring checks: `ml-service/venv/bin/python -m unittest discover -s ml-service -p 'test_*.py' -v` — 4 tests pass.
- Backend JavaScript syntax checks: every project `.js` file outside `node_modules`.
- Python syntax checks: modified/new Python files.
- Frontend: `npm run build --prefix client`.
- Targeted ESLint: changed frontend pages and validation utilities.

The tests cover valid and malformed requests, frontend/backend agreement, calendar dates, coercion, finite amounts, ownership filtering, duplicates, upload errors, invalid stored terms, malformed service responses, empty recommendations and ML timeout/unavailability. All 10 existing catalog definitions pass the scoring-data validation. Database and network calls are mocked; no real user data is involved.

Initial test failures found an extensionless ESM import and a disease-list limit checked after deduplication. Both were fixed. No test failures remain.

## Existing algorithmic issues reported separately

These were identified from the existing implementation and were not changed:

1. Recommendation scoring accepts budget, income, gender, smoking, alcohol and high-risk occupation fields but does not use them in its current score calculation. In particular, annual budget is not used to filter premiums.
2. Family Floater matching uses the eldest selected person's age; it does not check every selected member against separate age eligibility rules.
3. Claimability approximates waiting months using days divided by 30.44; rejection waiting-period analysis uses calendar-month addition. Boundary-date results may differ.
4. Rejection waiting-period analysis reads `specificIllnessesConditions`, while uploaded policies store `specificIllnessConditions`; catalog Policy schema has no condition-list field. Diagnosis matching across these paths needs a separate insurance-rule review.
5. Uploaded policy extraction stores default zero/false values for absent terms. Validation cannot distinguish an explicitly confirmed zero from an extraction default without additional provenance information.

## Live-test readiness and limitations

Validation is ready for live end-to-end testing with MongoDB and FastAPI running. Browser interactions, real PDF extraction, actual unique-index behavior, and real ML connectivity have not been tested here. Existing application-level checks for unnumbered saved-policy duplicates do not provide a cross-server atomic uniqueness guarantee. Review the algorithmic issues above before treating analysis results as production insurance decisions.


## Recommendation algorithm follow-up

Subsequent changes are documented in `RECOMMENDATION_CHANGES.md`. Annual budget handling now reports unverified affordability when reliable annual pricing is unavailable, while retaining unknown-price policies. Family recommendations now receive all selected members, apply available adult entry-age bounds per person, and label missing child/relationship rules as insufficient information. The earlier eldest-only limitation is addressed; missing insurer pricing/eligibility data remains explicit. The results above describe the original audit run and do not claim live verification of this later revision.


## Waiting-period follow-up

Later changes are documented in `WAITING_PERIOD_AUDIT.md`. Claimability and Rejection now share calendar-aware waiting-period dates/statuses. Exact positive-duration boundary days remain for wording review; PED/specific-illness applicability is not inferred from text. Missing extraction definitions remain unknown, and both pages use the backend's UTC calendar boundaries. Earlier audit results are historical; live integration of this revision must be rerun.
