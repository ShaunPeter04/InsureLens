# InsureLens live integration audit

Final live run: **12 October 2026, 10:41:08 IST–10:41:25 IST**. Evidence: `INTEGRATION_AUDIT_RESULTS.json`. Reproducible audit: `node server/scripts/liveIntegrationAudit.js` (requires local network and Chrome access).

## Overall result

| Area | PASSED | FAILED | BLOCKED | NOT TESTED |
| --- | ---: | ---: | ---: | ---: |
| Services/configuration | 6 | 0 | 0 | 0 |
| Live API checks | 63 | 0 | 0 | 0 |
| Real Chrome browser checks | 14 | 0 | 0 | 0 |
| Verified cleanup checks | 11 | 0 | 0 | 0 |

**Ready for an MCA project demonstration of the tested core workflows**, with the existing algorithmic limitations disclosed below. This is an integration result, not a certification of insurance-rule correctness or production readiness.

## Services and environment

MongoDB, Express (5000), React/Vite (5173), and FastAPI (8000) were already running. No duplicate application service was started or restarted, and no ports, dependencies, or configuration were changed. The audit launched a separate temporary headless Chrome process and stopped it after testing.

Required configuration values were checked for presence without printing them. The configured frontend origin and Express/FastAPI ports matched the existing Vite proxy. CORS preflight accepted the configured frontend origin. Initial sandbox socket access was denied; the live audit used explicitly approved execution outside that sandbox.

| Check | Result | Evidence |
| --- | --- | --- |
| MongoDB connection and ping | PASSED | Connected; read-only ping succeeded; automatic index creation disabled |
| Required configuration present | PASSED | Required values present; secrets not recorded; configured ports match the existing Vite proxy |
| Frontend-to-backend CORS preflight | PASSED | Live running service verified |
| Express availability | PASSED | Live running service verified |
| Vite frontend and API proxy | PASSED | Live running service verified |
| FastAPI health | PASSED | Live running service verified |

## Actual MongoDB integration

**PASSED:** connected to the configured MongoDB instance and executed a real database ping. Automatic Mongoose index and collection creation were disabled for the audit connection. The existing user/policy-number unique index was confirmed present.

Three isolated synthetic accounts were used: two registered through the API and one registered through the browser. Profile updates, saved policies, hospitalizations, and linked rejections were persisted through the running Express service. Cross-account queries returned empty lists or authorization-safe errors as expected. Invalid updates returned 400 without bypassing the API validation.

Cleanup verified the synthetic account namespace was absent before writes, then verified each user ID and synthetic email and each related record's ID and owner before deletion. The final run removed **3 synthetic users, 1 saved policy, 2 hospitalization cases, and 2 rejection cases**. All three synthetic email identities were absent afterward. The two earlier audit runs were also cleaned successfully.

The existing catalog contained 10 products. Its API representation was hashed before and after testing and remained unchanged. No existing account was edited or deleted; no policies were seeded, reset, or modified. Temporary Chrome profiles were removed after their processes exited.

## Live API results

Requests used actual HTTP services. Application workflow requests passed through the real Vite `/api` proxy; backend availability and CORS were also checked directly. No database, HTTP, scoring, or model mocks were used in this live run. Synthetic passwords and tokens stayed in process/browser memory and were not printed or included in the evidence.

| Test | Result | Evidence |
| --- | --- | --- |
| Registration synthetic account 1 | PASSED | Expected live HTTP status and response verified |
| Registration synthetic account 2 | PASSED | Expected live HTTP status and response verified |
| Duplicate normalized email rejected | PASSED | Expected live HTTP status and response verified |
| Invalid registration body rejected | PASSED | Expected live HTTP status and response verified |
| Login valid credentials | PASSED | Expected live HTTP status and response verified |
| Login wrong password rejected | PASSED | Expected live HTTP status and response verified |
| Login malformed fields rejected | PASSED | Expected live HTTP status and response verified |
| Protected route without token denied | PASSED | Expected live HTTP status and response verified |
| Protected route invalid token denied | PASSED | Expected live HTTP status and response verified |
| Protected route valid token | PASSED | Expected live HTTP status and response verified |
| Profile retrieval excludes credentials | PASSED | Expected live HTTP status and response verified |
| Profile valid update preserves zero income | PASSED | Expected live HTTP status and response verified |
| Profile invalid update: Whitespace | PASSED | Expected live HTTP status and response verified |
| Profile invalid update: Impossible date | PASSED | Expected live HTTP status and response verified |
| Profile invalid update: Negative amount | PASSED | Expected live HTTP status and response verified |
| Profile invalid update: Invalid amount type | PASSED | Expected live HTTP status and response verified |
| Profile invalid update: Invalid gender | PASSED | Expected live HTTP status and response verified |
| Profile invalid update: Duplicate mobile | PASSED | Expected live HTTP status and response verified |
| Profile ignores credential and owner changes | PASSED | Expected live HTTP status and response verified |
| Catalog policy details | PASSED | Expected live HTTP status and response verified |
| Catalog invalid ObjectId rejected | PASSED | Expected live HTTP status and response verified |
| Save valid catalog policy | PASSED | Expected live HTTP status and response verified |
| Duplicate saved policy rejected | PASSED | Expected live HTTP status and response verified |
| Save invalid policy: Invalid ID | PASSED | Expected live HTTP status and response verified |
| Save invalid policy: Invalid coverage type | PASSED | Expected live HTTP status and response verified |
| Save invalid policy: Negative coverage | PASSED | Expected live HTTP status and response verified |
| Save invalid policy: Impossible date | PASSED | Expected live HTTP status and response verified |
| Save invalid policy: Reversed dates | PASSED | Expected live HTTP status and response verified |
| Saved policies owned listing | PASSED | Expected live HTTP status and response verified |
| Other account cannot list first user policies | PASSED | Expected live HTTP status and response verified |
| Recommendations through Express to actual FastAPI | PASSED | Received 5 ranked recommendations |
| Recommendations invalid input: Negative coverage | PASSED | Expected live HTTP status and response verified |
| Recommendations invalid input: NaN text | PASSED | Expected live HTTP status and response verified |
| Recommendations invalid input: Invalid budget | PASSED | Expected live HTTP status and response verified |
| Recommendations invalid input: Invalid percentage | PASSED | Expected live HTTP status and response verified |
| Recommendations invalid input: Malformed diseases | PASSED | Expected live HTTP status and response verified |
| Recommendations invalid input: Invalid lifestyle type | PASSED | Expected live HTTP status and response verified |
| Recommendations empty results handled | PASSED | Expected live HTTP status and response verified |
| FastAPI malformed direct request rejected | PASSED | Expected live HTTP status and response verified |
| Create valid hospitalization case | PASSED | Expected live HTTP status and response verified |
| Hospitalization invalid input: Impossible date | PASSED | Expected live HTTP status and response verified |
| Hospitalization invalid input: Future date | PASSED | Expected live HTTP status and response verified |
| Hospitalization invalid input: Negative bill | PASSED | Expected live HTTP status and response verified |
| Hospitalization invalid input: Missing bill | PASSED | Expected live HTTP status and response verified |
| Hospitalization invalid input: Invalid room amount | PASSED | Expected live HTTP status and response verified |
| Hospitalization invalid input: Invalid diagnosis | PASSED | Expected live HTTP status and response verified |
| Hospitalization invalid input: Expenses exceed bill | PASSED | Expected live HTTP status and response verified |
| Hospitalization invalid input: Invalid policy ID | PASSED | Expected live HTTP status and response verified |
| Other account cannot use foreign saved policy | PASSED | Expected live HTTP status and response verified |
| Claimability valid stored analysis | PASSED | Expected live HTTP status and response verified |
| Repeated analysis does not duplicate hospitalization | PASSED | Expected live HTTP status and response verified |
| Other account cannot analyze foreign hospitalization | PASSED | Expected live HTTP status and response verified |
| Claimability invalid ObjectId rejected | PASSED | Expected live HTTP status and response verified |
| Create linked rejection case | PASSED | Expected live HTTP status and response verified |
| Rejection requires linked waiting-period hospitalization | PASSED | Expected live HTTP status and response verified |
| Rejection rejects negative amount | PASSED | Expected live HTTP status and response verified |
| Rejection rejects impossible date | PASSED | Expected live HTTP status and response verified |
| Other account cannot create foreign linked rejection | PASSED | Expected live HTTP status and response verified |
| Rejection analysis through actual ML models | PASSED | Rule analysis and loaded ML model prediction returned |
| Other account cannot retrieve foreign rejection | PASSED | Expected live HTTP status and response verified |
| Other account cannot analyze foreign rejection | PASSED | Expected live HTTP status and response verified |
| Rejection invalid ObjectId rejected | PASSED | Expected live HTTP status and response verified |
| Policy catalog unchanged after audit | PASSED | Expected live HTTP status and response verified |

## Actual FastAPI and ML integration

**PASSED:** FastAPI `/health`, live Express-to-FastAPI `/recommend`, empty recommendations, and direct invalid recommendation payload rejection. Valid recommendations returned five ranked policies using actual scoring code.

**PASSED:** linked rejection analysis returned `mlPrediction.available: true` from the real Logistic Regression and Decision Tree model files. The browser displayed both prediction sections. Claimability analysis runs locally in Express; its real response was validated and rendered in Chrome.

## Real browser results

The installed Google Chrome was automated through its DevTools protocol using Node's built-in WebSocket client; Playwright/Puppeteer were not installed. All actions ran against the real React application and actual API services.

Registration, login, dashboard, profile, catalog details, recommendations, saved policies, hospitalization creation/analysis, and linked rejection analysis were exercised. Protected navigation redirected an unauthenticated browser to login. Navigation links reached the expected pages; asynchronous forms and results completed. Submitting the hospitalization form twice synchronously sent exactly one creation request. No uncaught JavaScript exceptions, uncanceled network failures, or unexpected browser HTTP errors were observed.

| Test | Result | Evidence |
| --- | --- | --- |
| Registration invalid input | PASSED | Real headless Chrome UI actions and DOM assertions |
| Registration valid input and automatic Dashboard navigation | PASSED | Real headless Chrome UI actions and DOM assertions |
| Unauthenticated protected navigation | PASSED | Real headless Chrome UI actions and DOM assertions |
| Login and Dashboard | PASSED | Real headless Chrome UI actions and DOM assertions |
| Profile view and edit | PASSED | Real headless Chrome UI actions and DOM assertions |
| Policies navigation and detail | PASSED | Real headless Chrome UI actions and DOM assertions |
| Recommendations results | PASSED | Real headless Chrome UI actions and DOM assertions |
| My Policies saved result | PASSED | Real headless Chrome UI actions and DOM assertions |
| Claimability create and analyze | PASSED | Real headless Chrome UI actions and DOM assertions |
| Rejection Analysis with ML result | PASSED | Real headless Chrome UI actions and DOM assertions |
| Navigation links and completed loading states | PASSED | Real headless Chrome UI actions and DOM assertions |
| Unexpected HTTP errors | PASSED | 0 browser HTTP responses with status 400 or greater |
| Uncaught JavaScript errors | PASSED | 0 uncaught runtime exceptions |
| Failed network requests | PASSED | 0 uncanceled transport failures |

The initial browser run had two **FAILED harness checks**, not confirmed application bugs: a dashboard assertion ran before React rendered the destination, and the generic field setter used an input setter on a textarea. The harness was corrected to wait for rendered content and use the proper native textarea setter. Both checks passed on reruns. No application code was changed to make tests pass.

## Files changed

- `server/scripts/liveIntegrationAudit.js` — explicit live API/Chrome audit with synthetic data, response assertions, ownership tests, and verified cleanup.
- `INTEGRATION_AUDIT_RESULTS.json` — sanitized final-run evidence.
- `INTEGRATION_AUDIT.md` — this report.

Application code, schemas, configuration, dependencies, and algorithms were not changed during this integration audit. Existing workspace changes from previous tasks were preserved. The new live-audit script passed Node syntax checking; the live checks themselves act as regression checks for the observed workflows.

## Remaining bugs and limitations by severity

The following existing issues were identified in `VALIDATION_AUDIT.md` and remain unchanged. No new application integration bug was demonstrated by this run.

| Severity | Issue | Status/impact |
| --- | --- | --- |
| Critical | None observed in the tested integration workflows | PASSED within this audit's scope; no general security or production certification implied. |
| High | Specific-illness condition field mismatch: rejection waiting-period logic reads `specificIllnessesConditions`, while uploaded policy data stores `specificIllnessConditions`; catalog schema has no condition-list field | Existing algorithm/schema alignment issue. Specific diagnosis applicability may be missed; requires separate rule review. This audit used synthetic fever and did not validate clinical rule correctness. |
| Medium | Budget, smoking, alcohol, high-risk occupation, income and gender are accepted inputs but are not used by the current recommendation scorer | Existing behavior; do not present budget as an enforced premium filter in a demonstration. |
| Medium | Family Floater recommendation eligibility uses only the eldest selected age | Existing behavior; individual member age eligibility is not fully evaluated. |
| Medium | Claimability uses approximate waiting months (30.44 days), while rejection analysis adds calendar months | Existing behavior; boundary-date results can differ. |
| Medium | Uploaded policy extraction substitutes zero/false defaults for missing terms | Existing behavior; absent information can be indistinguishable from confirmed zero values. Real extraction was NOT TESTED in this run. |
| Low | Unnumbered saved-policy duplicates rely on application prechecks rather than an atomic cross-server unique constraint | Numbered-policy uniqueness was verified live; concurrent unnumbered insertion races were NOT TESTED. |

## Explicitly not tested

- Real policy PDF uploads, OCR, corrupt/large documents, and document extraction: **NOT TESTED**. Catalog policy saving was tested.
- Family-member creation/editing and multi-member live Family Floater recommendations: **NOT TESTED** in this run; request-level ownership and synthetic self recommendations were tested.
- Service outage injection, process restart recovery, timeout resilience, concurrent multi-server writes, performance/load and long-duration use: **NOT TESTED** live. Healthy service communication passed; prior validation tests covered mocked failures.
- Clinical/insurance correctness and calibrated ML accuracy: **NOT TESTED**. Existing model outputs and UI rendering were verified.

No required core workflow remains BLOCKED. The tested application is suitable for a guided MCA demonstration with all four services running and these limits explained.


## Recommendation algorithm follow-up

Subsequent changes are documented in `RECOMMENDATION_CHANGES.md`. Annual budget handling now reports unverified affordability when reliable annual pricing is unavailable, while retaining unknown-price policies. Family recommendations now receive all selected members, apply available adult entry-age bounds per person, and label missing child/relationship rules as insufficient information. The earlier eldest-only limitation is addressed; missing insurer pricing/eligibility data remains explicit. The results above describe the original audit run and do not claim live verification of this later revision.


## Waiting-period follow-up

Later changes are documented in `WAITING_PERIOD_AUDIT.md`. Claimability and Rejection now share calendar-aware waiting-period dates/statuses. Exact positive-duration boundary days remain for wording review; PED/specific-illness applicability is not inferred from text. Missing extraction definitions remain unknown, and both pages use the backend's UTC calendar boundaries. Earlier audit results are historical; live integration of this revision must be rerun.
