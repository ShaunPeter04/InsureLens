# InsureLens targeted live regression audit

Completed 12 October 2026. Evidence: [REGRESSION_AUDIT_RESULTS.json](REGRESSION_AUDIT_RESULTS.json). This report describes actual local-service and headless Chrome executions.

## Final results

| Verification | Status | Results |
| --- | --- | --- |
| Service/configuration checks | PASSED | 6 checks |
| Existing live API workflows | PASSED | 63 checks |
| Targeted live API regressions | PASSED | 26 checks |
| Headless Chrome | PASSED | 19 checks, including 5 targeted checks |
| Verified cleanup | PASSED | 11 checks |
| JavaScript automated suite | PASSED | 40 tests |
| Python automated suite | PASSED | 21 tests |
| Backend syntax | PASSED | 19 route/service/script/test files |
| Frontend production build | PASSED | Vite build completed |
| Targeted frontend lint | PASSED | Recommendation, Claimability, Rejection components and validation utilities |

Final failures: **0**. Final blocked checks: **0**.

## Actual services

MongoDB connected and answered a real ping; the saved-policy uniqueness index exists. Express on port 5000, Vite on 5173 and FastAPI on 8000 were already running. No additional service startup, port/configuration changes or dependency installation was necessary. The loaded ML request schema includes insured members. Real recommendation requests traversed Vite → Express → FastAPI. Linked rejection analyses returned available predictions from both loaded ML models. Secrets were neither printed nor included in the evidence.

## Recommendation regressions

PASSED individual recommendations, multiple-member families, documented adult age-cap violations, absent eligibility definitions, absent premiums, supplied budgets with unknown premiums, five malformed payload cases and empty results. Actual catalog premiums are unavailable: recommendations remain candidates, assessments are insufficient information, and cards explicitly say affordability cannot be verified. Unknown premiums are never marked within budget.

An actual catalog product's age cap was tested against families with an eligible and an over-age member through the real FastAPI scorer. Missing age definitions were tested using a transient request copy of that product with its eligibility object omitted; the stored product was unchanged. Child/relationship rules unsupported by catalog data remain insufficient information. Tests do not manufacture adult or child eligibility rules.

## Waiting-period regressions

Both live analysis endpoints returned identical complete waiting-period objects for all ten scenarios below. Each linked rejection analysis also returned real ML predictions.

| Scenario | Initial status in both modules | Status |
| --- | --- | --- |
| Admission before commencement | Date Inconsistency | PASSED |
| During initial period | Waiting Period Not Completed | PASSED |
| After initial period | Waiting Period Completed | PASSED |
| Exact initial boundary | Manual Review Required | PASSED |
| Missing admission date | Insufficient Information | PASSED |
| Malformed legacy admission date | Insufficient Information | PASSED |
| Impossible legacy calendar date | Insufficient Information | PASSED |
| Missing waiting-period definitions | Insufficient Information | PASSED |
| Specific-illness anniversary | Initial completed; specific timeline requires manual review | PASSED |
| PED anniversary | Initial completed; PED timeline requires manual review | PASSED |

The real catalog supplied 30-day initial, 24-month specific-illness and 36-month PED terms for the selected fixture. Additional audit-owned uploaded-policy records copied these terms with explicit synthetic source text, or omitted them to exercise missing definitions. These are synthetic saved-policy fixtures, not evidence of a real policy upload. Leap-day commencement on 2020-02-29 produced calendar anniversaries 2022-02-28 and 2023-02-28. Specific-illness and PED applicability remained unverified, with `passed: null`. All results retained manual review. Initial completion did not guarantee claim approval; unclear boundaries did not become verified recovery conclusions.

New impossible-date write requests were rejected with HTTP 400. Corrupt legacy dates were injected only into this run's owned hospitalization records after verifying the record ID, owner and unique synthetic hospital name.

## Browser regressions

Real headless Chrome exercised registration/login, protected navigation, Dashboard, Profile, Policies, Recommendations, My Policies, Claimability and Rejection Analysis. Targeted checks verified unknown-premium warnings, family uncertainty messages, recommendation validation and empty-result states, and both waiting-period displays. Boundary displays remained 31/1/2024 under an America/Los_Angeles browser timezone. Claimability displayed its approval disclaimer; rejection boundary recovery required further evidence. Recommendation and hospitalization double submissions generated one creation/request each. No uncaught JavaScript errors, unexpected HTTP errors or failed network requests were observed.

## Defects fixed and reruns

The first run FAILED one corrupted legacy-date assertion: Mongoose hydration normalized stored `2024-02-30` into March, masking the invalid original value. Both modules flagged inconsistent dates, but could not identify the invalid calendar input. Analysis now reads hospitalization records with `lean()` so strict calendar validation receives stored values. Claimability keeps saved-policy/product population hydrated to preserve its existing policy-default detection. No insurance calculation, schema or stored record was changed by this fix. The impossible-date case passed on every subsequent live run; automated cross-module tests now assert raw reads and insufficient-information handling.

Intermediate browser runs FAILED a baseline rejection test because its automation selected a saved policy before asynchronous options had loaded, or selected a hospitalization before its policy filter completed. The harness now waits for both exact options before selection. The final complete browser rerun passed. This was a test synchronization issue; no UI modification was needed.

Automated tests initially FAILED after the query change because older query stubs lacked `lean()`. Those stubs were updated and the complete 40-test suite reran successfully. All initial failures are resolved; the final evidence records the final full run.

## Files changed in this task

- `server/routes/claimCases.js`: preserve raw hospitalization dates in analysis reads.
- `server/routes/rejectionCases.js`: preserve raw linked hospitalization dates.
- `server/tests/insuranceValidation.test.js`: adapt analysis query stubs.
- `server/tests/waitingPeriodAnalyzer.test.js`: require raw reads and assert impossible-date status.
- `server/scripts/liveIntegrationAudit.js`: reusable `--regression` mode and browser synchronization.
- `server/scripts/targetedRegressionCases.js`: live recommendation, waiting-period and Chrome scenarios.
- `server/scripts/serviceRegressionProbe.js`: secret-safe service/schema/process checks.
- `REGRESSION_AUDIT.md` and `REGRESSION_AUDIT_RESULTS.json`: report and sanitized evidence.

Existing workspace changes from earlier tasks were preserved.

## Safety and cleanup

The final run removed 3 verified synthetic users, 5 saved policies, 13 hospitalization cases and 13 linked rejection cases, plus its temporary Chrome profile. Embedded synthetic family members were removed with their synthetic account. Every run used a fresh namespace and verified ownership before cleanup; cleanup checks passed on intermediate runs too. Existing users were not updated or deleted. The catalog still contained 10 products and its before/after hash matched. MongoDB was not reset/reseeded; insurance definitions were not changed.

## Remaining limitations and demonstration readiness

- **Medium, documented data limitation:** unavailable premiums prevent verified affordability. The UI accurately warns about this.
- **Medium, documented data limitation:** incomplete family relationship/child-age terms prevent definitive family eligibility. Results correctly expose uncertainty.
- **Medium, policy-wording limitation:** exact waiting-period boundaries, PED/specific applicability and exceptions require manual evidence review. Neither module guarantees approval.
- **NOT TESTED:** production deployment, multi-user load, deliberate live service shutdown/outage, new PDF extraction uploads, and every catalog/diagnosis combination. This audit did not fabricate premiums or stop shared services to simulate failures.
- **BLOCKED:** none in the final execution. No unresolved Critical or High defect was found in the exercised workflows.

**Ready for an MCA demonstration of the tested local build**, with the documented decision-support limitations explained. This is not a production certification or a guarantee of insurance eligibility.

## Reproduction

With the configured services running: `node server/scripts/serviceRegressionProbe.js`, then `node server/scripts/liveIntegrationAudit.js --regression`. These commands need local socket/browser permissions and create only isolated synthetic records. Automated checks: `node --test --test-isolation=none server/tests/*.test.js`; `ml-service/venv/bin/python -m unittest discover -s ml-service -p 'test_*.py'`; frontend `npm run build`. Targeted lint used `npx --no-install eslint src/pages/Recommendations.jsx src/components/RecommendationCard.jsx src/pages/Claimability.jsx src/pages/RejectionAnalysis.jsx src/utils/insuranceValidation.js src/utils/analysisResponseValidation.js` from `client/`.
