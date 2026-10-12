# Waiting-period calculation audit

## Root causes

1. Claimability calculated waiting months as `floor(policyAgeDays / 30.44)`, while Rejection used calendar anniversaries. Month ends and leap years could give different results.
2. Each module independently calculated initial waiting periods. Claimability could pass a zero-day period even when admission preceded policy commencement.
3. Rejection read `specificIllnessesConditions`; uploaded policy data stores `specificIllnessConditions`. Claimability also used broad diagnosis/treatment substring matching to infer specific-illness and PED applicability and create claim blockers.
4. Missing waiting definitions could become zero through extraction/upload defaults or Mongoose defaults. Claimability rejected incomplete waiting information before it could return the same insufficient-information assessment as Rejection.
5. Exact boundary days were unconditionally treated as completed, although the stored numeric definitions do not describe inclusive/exclusive day wording.
6. Claimability's PED result was outside the `requiresReview` location consumed by its frontend, so that review block could be absent. Rejection rendered UTC-midnight dates in the browser's local timezone, allowing date shifts.

## Inventory of calculations and displays

| Location | Previous role | Current role |
| --- | --- | --- |
| `server/services/waitingPeriodAnalyzer.js` | Calendar dates for Rejection; separate initial calculation | Authoritative initial, specific-illness and PED calendar timelines for both modules |
| `server/routes/claimCases.js` | Independent initial days and approximate waiting months; text-based applicability/blockers | Calls the authoritative analyzer; adapts the same results into existing response fields |
| `server/services/rejectionAnalyzer.js` | Calls shared service, but initial verification status was conditional on rejection text | Uses the same initial status/date/message regardless of text classification; keeps applicability and recovery review separate |
| `server/utils/analysisValidation.js` | Rejects incomplete stored dates/definitions before Claimability could assess them | Explicit read-only analysis mode permits incomplete waiting inputs while retaining validation of other terms/amounts; writes remain strict |
| `ml-service/main.py` recommendation scoring | Scores numeric waiting durations without commencement/admission dates | Unchanged scoring weights and duration ranking; it does not calculate a hospitalization waiting end or eligibility timeline |
| `ml-service/main.py` policy extraction | Extracts durations; missing values defaulted to zero | Extracts durations only; missing definitions return null rather than invented zero |
| `server/routes/userPolicies.js` | Persists extracted waiting durations with zero fallback | Persists unknown durations as null in the existing nullable fields |
| `client/src/pages/Claimability.jsx` | Displays passed flags; PED review could be missing | Displays backend status, calendar boundary, timeline/applicability distinction, and policy wording to review |
| `client/src/pages/RejectionAnalysis.jsx` | Displays backend status and local-timezone date | Displays the same backend calendar boundary in UTC, plus timeline status and wording |
| `client/src/utils/waitingPeriodDisplay.js` | None | Date formatting only; no waiting-period calculations |

Training datasets and prediction labels do not calculate commencement/admission timelines. The rejection ML classifier remains text-based and unchanged. Frontend profile/family age calculations are unrelated and unchanged.

## Authoritative approach

`analyzeWaitingPeriods(policyData, userPolicy, claimCase)` is the single authoritative implementation. Both Claimability and Rejection call it directly.

- `policyStartDate` is the recorded commencement input; `admissionDate` is the admission input. Date objects are normalized to their UTC calendar day. String inputs must be a valid `YYYY-MM-DD` or midnight-UTC ISO JSON date. Impossible dates are rejected by parsing instead of being rolled into another month.
- Initial durations use UTC calendar-day addition. Specific-illness and PED durations use calendar-month anniversaries, clamped to the last day when the commencement day is unavailable in the target month. Each addition starts from the original commencement date, so Jan 31 + 2 months is Mar 31, rather than Mar 28/29.
- Definitions must be finite nonnegative integer numbers. Missing, negative, fractional, coerced or overflowing definitions remain insufficient information; they are not silently zero.
- A catalog field populated only by a Mongoose default is not treated as a recorded definition. Historical uploaded terms require matching extracted source text; absent or conflicting source definitions remain unknown. Explicitly extracted zero remains zero.
- Admission before commencement, an invalid/reversed policy period, invalid/reversed supplied discharge dates, and future hospitalization dates yield date inconsistency, never a successful waiting check.
- Missing or invalid waiting inputs in a read-only stored analysis return consistent insufficient-information results. Create/update request validation still rejects impossible dates and invalid hospitalization data. A request-body `validateDates:false` cannot bypass those checks.

Unrelated recommendation/claimability scoring weights, financial calculations, policy definitions, database schemas and user records were preserved. Existing response fields remain, with additive detailed waiting results. The obsolete approximate-month field/calculation was removed. No database connection or live data mutation was performed for this revision.

## Boundary-date behavior

These are calculated **recorded/nominal timelines**, not verified effective coverage dates or an approval guarantee.

| Situation | Initial timeline status | Initial passed flag |
| --- | --- | --- |
| Admission before recorded commencement | Date Inconsistency | false |
| Missing/impossible commencement or admission, or missing definition | Insufficient Information | null |
| Admission before a positive-duration calendar boundary | Waiting Period Not Completed | false |
| Admission exactly on a positive-duration calendar boundary | Manual Review Required | null |
| Admission after the calculated boundary | Waiting Period Completed | true, with review/approval disclaimer |
| Explicit recorded zero period at/after valid commencement | Waiting Period Completed | true, with other policy conditions still requiring review |

Examples: Jan 1 + 30 days gives Jan 31; Jan 31 + 1 month gives Feb 29 in 2024 and Feb 28 in 2023; Feb 29, 2024 + 12 months gives Feb 28, 2025. An admission exactly on these positive-duration boundaries remains for wording review. The data has no trusted structured inclusive/exclusive-boundary rule, so the code does not invent one.

Specific-illness and PED entries expose a separate `timelineStatus`/`completed` value. Their overall `status` remains Manual Review Required when a timeline can be calculated, because applicability is not established. Missing data and date inconsistency remain explicit rather than being labeled completed.

The canonical and historical specific-illness list keys are combined for exact diagnosis-match **hints**. These never establish applicability. Declared disease names and diagnosis mentions likewise do not automatically classify a hospitalization as PED. Waiting-period text matches no longer create automatic PED/specific-illness claim blockers.

Both modules retain manual-review safeguards. Completion of the initial timeline does not establish that the hospitalization meets other waiting periods, exclusions, disclosures or policy conditions, or that a rejection should be reversed.

## Cross-module consistency and regression results

The cross-module test invokes the real Claimability analysis route handler with mocked persistence and the real Rejection analysis service for identical policy/hospitalization inputs. It asserts equality of the complete authoritative waiting object, initial status and end date across **12 scenarios**, including before commencement, during/after the initial period, exact boundary, missing/invalid admission, leap/month-end dates, missing definitions and PED/specific-illness diagnosis mentions. Both response paths preserve manual review.

This is automated route/service regression testing, **not a live MongoDB/browser integration run**.

| Verification | Result |
| --- | --- |
| Full JavaScript suite (`node --test --test-isolation=none server/tests/*.test.js`) | PASSED: 40 tests, 0 failures |
| Full Python suite (`ml-service/venv/bin/python -m unittest discover -s ml-service -p 'test_*.py' -v`) | PASSED: 21 tests, 0 failures |
| Backend syntax checks | PASSED: all 30 project JavaScript files outside node_modules |
| Python syntax checks | PASSED: all top-level ML service Python files |
| Targeted frontend lint | PASSED: Claimability, Rejection Analysis and modified validation/display utilities |
| Frontend production build | PASSED |
| Live API/browser integration of this revision | NOT TESTED; must be rerun below |

Focused coverage includes all requested date/status cases, zero periods before commencement, strict invalid definitions, canonical/legacy condition lists, partial stored data, leap days, month ends, overflow, exact-boundary recovery safeguards, source/default provenance, extraction of explicit zero versus unknown, upload persistence of null, client date formatting and malformed waiting-response metadata.

Two initial test failures exposed fixtures with discharge dates earlier than their newly selected admission dates. The fixtures were corrected; the chronology checks were retained. No failing tests remain.

## Files changed

- `server/services/waitingPeriodAnalyzer.js`
- `server/services/rejectionAnalyzer.js`
- `server/routes/claimCases.js`
- `server/routes/userPolicies.js`
- `server/utils/analysisValidation.js`
- `server/utils/insuranceValidation.js`
- `server/tests/waitingPeriodAnalyzer.test.js` (new)
- `server/tests/insuranceValidation.test.js`
- `client/src/pages/Claimability.jsx`
- `client/src/pages/RejectionAnalysis.jsx`
- `client/src/utils/insuranceValidation.js`
- `client/src/utils/analysisResponseValidation.js`
- `client/src/utils/waitingPeriodDisplay.js` (new)
- `ml-service/main.py` (missing extraction definitions only; scoring/predictions unchanged)
- `ml-service/test_waiting_period_extraction.py` (new)
- `VALIDATION_AUDIT.md`, `INTEGRATION_AUDIT.md`, `RECOMMENDATION_CHANGES.md` (historical follow-up notes)
- `WAITING_PERIOD_AUDIT.md` (this report)

## Remaining policy-wording limitations

- Numeric durations do not specify inclusion/exclusion of the commencement or boundary day, time-of-day treatment, or special anniversary wording. Exact positive-duration boundary dates require review.
- `policyStartDate` may describe a renewal period rather than the original inception. There is no verified continuity/portability timeline in the schema; the code does not invent continuity credits or resets.
- Accident exceptions, optional buy-back/reduction covers, coverage-tier-dependent PED periods and other variations occur in stored wording. That wording is preserved and displayed for review, not converted into an unverified waiver or endorsement. Calculated boundaries use recorded scalar durations; effective duration needs insurer confirmation where the wording varies by configuration.
- There is no independently verified medical/disclosure evidence field establishing specific-illness or PED applicability. Exact names in a stored list or diagnosis are insufficient on their own.
- Catalog schema has no structured specific-illness condition list. Uploaded lists are supported, including the historical spelling, but missing lists require review.
- The legacy PDF parser recognizes a limited set of source patterns. Unsupported prose, conflicting durations or absent source text remain insufficient rather than being inferred. Existing stored defaults are not rewritten.

## Live integration that must be rerun

1. Reload/restart the normal Express and FastAPI services to load the revised code; run `server/scripts/liveIntegrationAudit.js` against the real services. Existing integration evidence is historical.
2. With isolated synthetic accounts/cases, compare Claimability and linked Rejection results before commencement, during the initial period, after it and on the exact boundary. Check matching dates/statuses and conservative recovery messages.
3. Repeat month-end/leap-year cases and partial legacy-data cases against real Mongoose hydration. Verify default-field provenance is retained and no missing definition becomes zero.
4. Upload synthetic policy PDFs with explicit positive/zero clauses, missing clauses and conflicting clauses. Verify persisted nulls, extracted-source checks and manual review through both analysis pages. Do not use real personal policy documents.
5. Check both real UI pages in multiple browser timezones, including PED review visibility, shared calendar boundaries, nominal timeline labels and policy-wording warnings. Confirm no wording suggests guaranteed approval or automatic PED classification.

Any live audit must preserve existing records and catalog definitions and clean only positively identified synthetic records. This revision did not run these live tests or claim they passed.
