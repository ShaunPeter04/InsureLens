# InsureLens service resilience audit

Completed 12 October 2026. Reviewed the latest integration, regression, waiting-period and PDF-hardening reports before changing code. Final evidence: [SERVICE_RESILIENCE_RESULTS.json](SERVICE_RESILIENCE_RESULTS.json).

## Findings and fixes

1. **Unchecked rejection predictions:** Express previously treated any successful JSON response as available ML, including `{}` or malformed scores. It now validates prediction strings, Boolean flags, finite class scores in 0–1, reasons and the existing evaluation note. Invalid JSON/schema, unavailable services and timeouts produce `available: false` with no invented prediction/score. Upstream data cannot override the validated availability flag. The UI distinguishes completed rule analysis with unavailable ML from completed analysis with predictions. Retrying ML reuses the saved rejection case.
2. **Unbounded browser requests:** Axios had no default timeout. All existing requests now default to 20 seconds; PDF upload explicitly allows 40 seconds to cover its backend extraction window. Existing catches/finally blocks receive understandable transport messages, release loading guards and preserve entered form data. Automatic write retries are not introduced.
3. **Malformed data could reach rendering:** A shared HTTP response guard rejects invalid policy/saved-policy/family/case list envelopes, incomplete creation identities and unsafe catalog-detail shapes before state updates. Existing recommendation and analysis validators remain active; rejection response validation now also guards available prediction metadata. Malformed responses appear as errors rather than empty success results or crashes.
4. **Lost creation responses could duplicate records:** Existing refs reused known saved case IDs after analysis failure, but did not cover a POST that committed without its response reaching the browser. Claim, rejection, policy-save and PDF-upload requests now use stable per-form retry keys. Owner/route/payload-scoped Express receipts reuse the successful response and serialize concurrent retries. Changed payloads with a reused key are rejected. PDF replay discards only the repeated request's own temporary file.
5. **Uncertain database write acknowledgments:** A write failure after creation begins may not establish whether MongoDB committed. Such requests return an explicit save-status-unknown message; the receipt prevents another automatic attempt within its window. Users are told to check their saved records. PDF originals are retained when persistence is uncertain, rather than deleting a document that may already belong to a saved policy. Known validation/duplicate failures still clean their own failed temporary upload.
6. **MongoDB failure buffering/startup handling:** Express checks actual connection readiness before API routes and returns HTTP 503 with `Retry-After` when disconnected/connecting. Mongoose buffering is disabled; selection/connect, socket and query waits are bounded. Express can answer safe 503 responses while the initial Mongo connection retries. Initial failures log no connection string. Established connections retain the driver's normal reconnection behavior.
7. **Recommendation error coverage:** Connection reset, temporary DNS failure and network timeout codes now join existing refusal/DNS/timeout handling. Malformed upstream recommendations remain HTTP 502; outages remain 503 and timeouts 504.

No schema, insurance definition, scoring weight, waiting-period calculation, authentication/JWT implementation or existing document was changed. Earlier PDF-hardening changes already in the workspace were preserved.

## Architecture distinction

**Claimability does not call FastAPI.** It uses Express rules, saved policy terms and hospitalization details. FastAPI absence therefore must not disable its rule analysis. Rejection combines Express rule analysis with optional ML classification: a valid rule result can be returned while ML is unavailable, but the UI labels that partial state explicitly. Recommendations require ML and return an error when their service fails. PDF processing retains its existing safe extraction error/timeout behavior.

## Failure scenarios actually tested

| Scenario | Execution and outcome | Final status |
| --- | --- | --- |
| ML unavailable during recommendations | Actual recommendation route on a temporary Express server, upstream connection refused; HTTP 503 | PASSED |
| ML unavailable during Claimability | Same temporary Express service with unreachable ML address; real stored synthetic case still analyzed with existing rule result/manual safeguards | PASSED |
| ML unavailable during rejection | Actual rejection route, real synthetic linked case; rule results remained available and `available: false` | PASSED |
| Malformed upstream JSON/schema | Disposable HTTP upstream returned invalid JSON or unexpected object; recommendations 502, rejection no available/fabricated predictions | PASSED |
| Recommendation upstream timeout | Disposable HTTP service accepted request without replying; real 10-second backend timeout returned 504 | PASSED |
| Rejection upstream timeout | Same controlled service; real 5-second timeout preserved rules and reported timeout | PASSED |
| MongoDB unavailable | An actual isolated Mongoose connection failed to an unused loopback port; actual readiness gate returned 503 promptly, then resumed with the healthy connection | PASSED |
| ML recovery | Restored temporary server's upstream to actual FastAPI; real recommendations and loaded model predictions returned | PASSED |
| Lost successful creation response | Replayed owner-scoped POST with same key against actual route/MongoDB; one saved hospitalization | PASSED |
| Browser recommendation error/recovery | CDP intercepted a request with controlled 503; inputs/loading guard preserved, double-click sent one request, retry returned actual results | PASSED |
| Browser request timeout | CDP held a request until the real 20-second Axios timeout; clear error, enabled form, preserved coverage input | PASSED |
| Browser malformed policy list | Injected unexpected list shape; understandable error without a blank page | PASSED |
| Browser lost POST response and analysis failure | Creation reached actual application/MongoDB; its successful browser response was replaced with 503. Retry reused the receipt, a subsequent analysis error was injected, and final retry succeeded with exactly one hospitalization | PASSED |
| Browser unavailable ML/recovery | Browser analysis response was obtained from the temporary real rejection route with unavailable ML; UI showed rules/ML distinction. Retry through actual healthy services reused one rejection case | PASSED |
| Uncertain write acknowledgment | Automated middleware/route tests; no second write, HTTP 503 status-check message, possibly saved PDF retained | PASSED (automated) |

**Injection boundaries matter:** shared FastAPI and MongoDB were never stopped. The temporary Express instance mounted actual application routes and accessed only audit-owned synthetic records. Outages/timeouts used disposable local endpoints in that instance's process configuration. Browser errors were controlled Chrome interceptions. Healthy recovery used the actual services. The Mongo check tested a real failed client connection and readiness-gate recovery, not a stopped MongoDB server or a replica-set outage. No production fault switches were added.

## Verification results

| Check | Result |
| --- | --- |
| Existing JavaScript suite plus focused resilience tests | PASSED: 53 tests, 0 failures (7 new focused tests) |
| Existing Python suite | PASSED: 29 tests, 0 failures |
| Backend syntax | PASSED: 36 files, including startup code |
| Targeted frontend lint | PASSED |
| Frontend production build | PASSED |
| Actual service/configuration checks | PASSED: 6 |
| Existing live API workflows | PASSED: 63 |
| Controlled live failure/recovery checks | PASSED: 10 |
| Headless Chrome | PASSED: 19, including 5 controlled failure/recovery scenarios |
| Verified cleanup | PASSED: 11 |

Final **FAILED: 0; BLOCKED: 0**. Counts describe checks; individual checks can make several requests. Expected injected HTTP errors were explicitly tracked separately from unexpected failures. Browser checks found no uncaught JavaScript exceptions or unexpected transport/HTTP failures.

The first Chrome run failed three harness checks because the test used `annualPremiumBudget` instead of the actual form's `budget` field and inspected async select options before their controls existed. Harness names/waits were corrected; complete subsequent live/browser runs passed. No application algorithm was changed to satisfy those assertions. The final uncertain-write message/file-retention path was then verified through the full automated suite; a destructive live Mongo write-acknowledgment failure was not injected.

## Safety and cleanup

The final live run removed only 3 verified synthetic accounts, 1 saved policy, 4 hospitalization cases, 3 rejection cases and its isolated Chrome profile. Temporary HTTP/Express servers and the failed Mongo client connection were closed; process-local test environment overrides were restored. Intermediate audits also passed verified cleanup. Existing users, catalog products and uploaded documents were preserved. Before/after catalog hashes matched. No secrets, tokens, credentials, connection strings or personal insurance documents appear in logs/evidence.

## Files changed in this task

Backend:

- `server/server.js`
- `server/middleware/databaseAvailability.js` (new)
- `server/middleware/idempotency.js` (new)
- `server/utils/mlPredictionValidation.js` (new)
- `server/services/rejectionMLService.js`
- `server/routes/recommendations.js`
- `server/routes/claimCases.js`
- `server/routes/rejectionCases.js`
- `server/routes/userPolicies.js`
- `server/tests/serviceResilience.test.js` (new)
- `server/scripts/serviceResilienceCases.js` (new)
- `server/scripts/liveIntegrationAudit.js` (`--resilience` mode and CDP fault tracking)

Frontend:

- `client/src/main.jsx`
- `client/src/utils/httpClient.js` (new)
- `client/src/utils/serviceResilience.js` (new)
- `client/src/utils/analysisResponseValidation.js`
- `client/src/pages/Claimability.jsx`
- `client/src/pages/RejectionAnalysis.jsx`
- `client/src/pages/MyPolicies.jsx`
- `client/src/pages/Recommendations.jsx`
- `SERVICE_RESILIENCE_AUDIT.md` and `SERVICE_RESILIENCE_RESULTS.json`

## Remaining limitations

- **Retry receipts are process-local and expire after ten minutes.** They protect retries in the tested running process, not multiple Express replicas, backend restarts, TTL expiration or a browser reload that loses its key. Durable exactly-once writes would require additional persistence/uniqueness design, deliberately excluded to preserve schemas. Receipts are bounded to 1,000 entries per route module; saturation fails safely with 503. Do not treat this as distributed transaction protection.
- **Ambiguous commits require manual reconciliation.** A database acknowledgment failure may leave a saved record or a retained private upload. The UI does not claim success and asks users to inspect saved records; no unsafe automatic deletion/retry occurs. Reconciliation across receipt expiry/restart remains incomplete.
- **NOT TESTED live:** physically stopping the shared database/ML services, replica-set failover, startup with the real Mongo service offline, long-duration driver reconnection under load, worker exhaustion, multiple instances and process crashes during writes. These were avoided to protect shared state. Readiness/retry code and ambiguous writes have automated coverage.
- **No automatic browser retries** and no new offline cache. Existing list pages can be revisited/reloaded to fetch again; forms retain values during same-page failed submissions. Navigating away/reloading does not persist drafts or retry identities.
- **PDF limitation remains:** timing out a response cannot forcibly stop a Python parsing worker. OCR/general insurer parsing remain limited as documented in the PDF report; no OCR configuration or insurance-rule changes were made.
- The entire app was not fuzzed against every possible malformed endpoint payload. Selected list/detail/create/analysis responses now have guards; this audit certifies only the scenarios above.

The tested local application is suitable for an MCA demonstration of both normal behavior and controlled failure recovery, with these limits disclosed. It does not certify production availability or claim eligibility.

Reproduce with configured services: `node server/scripts/liveIntegrationAudit.js --resilience` (local socket/Chrome permission required). Automated checks: `node --test --test-isolation=none server/tests/*.test.js`; `ml-service/venv/bin/python -m unittest discover -s ml-service -p 'test_*.py'`; frontend `npm run build`. Targeted lint covered `src/main.jsx`, the HTTP/resilience/analysis utilities and the four modified pages.
