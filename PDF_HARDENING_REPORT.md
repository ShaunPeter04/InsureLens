# PDF policy workflow hardening report

Completed 12 October 2026. **Real text-PDF upload works**, verified through Vite → Express → FastAPI → MongoDB with fictional documents. Final evidence: [PDF_HARDENING_RESULTS.json](PDF_HARDENING_RESULTS.json).

## Problems found and changes

- Missing room-rent, hospitalization, co-payment, deductible, exclusions and sub-limit fields could become zero, false, unrestricted or empty lists. New uploads now explicitly store unknowns as `null` in the existing nullable schema. Missing exclusions/sub-limits never establish their absence.
- Narrow parsing did not extract even explicit co-payment/deductible clauses. Supported, unambiguous `Co-payment: N%` and `Deductible: INR N` clauses now preserve numeric values, including zero. Conflicting supported numeric clauses become unknown. Comma-formatted deductibles remain unsupported rather than being partially parsed as a smaller number.
- Uploaded-policy defaults could produce numeric scores and estimated payments. Uploaded Claimability now returns **Insufficient Information — Manual Review Required**, `claimabilityScore: null`, unknown room/hospitalization outcomes and null deduction/payable estimates. This is intentionally conservative even when some terms were extracted: applicability, endorsements and completeness have not been verified. The manually entered bill/sum-insured comparison remains a separate arithmetic check.
- Rejection retains its existing classification and ML predictions, but exposes uploaded policy terms as unverified rather than displaying legacy defaults as confirmed clauses. Both modules continue using the unchanged shared waiting-period calculator. Specific/PED applicability and exact boundaries remain for manual review.
- File acceptance relied on MIME alone. Express and FastAPI now check the PDF signature; FastAPI performs strict PDF parsing, rejects encrypted/malformed documents, enforces 10 MB, 1–50 pages and at most 200,000 extracted characters, and rejects empty/unreadable pages or insufficient text.
- Scanned/mixed-image documents are explicitly unsupported in this demonstration path. No OCR package or system dependency was installed/configured. The misleading frontend OCR promise was removed.
- FastAPI extraction runs outside the event loop with a 20-second response timeout; Express retains its 30-second service timeout. Safe actionable responses distinguish invalid documents, protected PDFs, timeouts, malformed extraction responses and unavailable extraction service. Backend response validation checks page/character counts and extraction method before saving.
- New files use generated UUID `.pdf` names and private `0600` permissions. Upload directory resolution no longer depends on the startup working directory; newly created directories use `0700`. Existing files/directories were not chmodded or deleted. Failed requests clean up only their own upload; Multer limits file/field/part counts.
- Full raw document text is no longer stored for new uploads. At most 12,000 characters of bounded rule-evidence lines are retained for source checks; the original PDF remains private on disk. Ordinary upload/list/case responses omit raw evidence and server file paths/names. Related error logs do not include document data or parser exception details.

## Unknowns and provenance

No schema migration or policy catalog change was needed. Existing records were not rewritten. Newly unavailable numeric, Boolean, room-category and list fields are explicitly null so Mongoose defaults cannot manufacture terms. Existing uploaded defaults remain stored as before, but the upload-specific analysis never uses them to certify coverage or payable amounts.

Saved-policy responses add an `extractionReview` summary. Supported numeric terms are compared with retained source evidence and labeled **Extracted — unverified**; missing/conflicting terms are **Unknown**. Source-backed zero is displayed as zero, not unknown. Complete exclusions and complete sub-limits always require review; detected mentions/percentage limits are identified as incomplete, unverified candidates. Manually entered policy number, coverage and dates are identified separately.

The existing My Policies cards, Claimability result and Rejection result now share a compact term-review panel. Users can acknowledge reviewing the fields against the original policy. **Acknowledgment is local UI state, not persisted certification and not permission to turn unknown terms into facts.** Extracted terms never become “verified” automatically or through that checkbox. A persisted insurer/endorsement verification workflow is outside this focused change.

Catalog Claimability keeps its numeric score/financial behavior. Recommendations, its scoring weights and catalog definitions are unchanged. Response validators/UI accept nullable uploaded scores and estimates only when the response identifies unverified extracted terms.

## Tests and results

| Check | Final result |
| --- | --- |
| Full JavaScript suite | PASSED: 46 tests, 0 failures; includes 6 focused PDF-hardening tests |
| Full Python suite | PASSED: 29 tests, 0 failures; includes 8 focused PDF tests |
| JavaScript syntax | PASSED: 30 backend route/service/utility/middleware/script/test files |
| Python syntax | PASSED: main and PDF modules |
| Frontend production build | PASSED |
| Targeted frontend ESLint | PASSED: modified pages, review component and response validator |
| Real service/config checks | PASSED: 6 checks |
| Existing live workflows | PASSED: 63 checks |
| Targeted live PDF workflows | PASSED: 10 checks |
| Headless Chrome | PASSED: 17 checks, including review acknowledgment and both uploaded analysis displays |
| Verified cleanup | PASSED: 13 checks |

**Final FAILED: 0. Final BLOCKED: 0.** These counts represent checks, some of which issue multiple actual requests.

Focused automated coverage includes a generated real text PDF, invalid MIME/signatures, malformed and encrypted PDFs, zero/unknown/conflicting terms, empty pages, byte/page limits, existing-schema null persistence, legacy-default handling, private-response sanitization, malformed legacy data, timeout/unavailable-service errors, temporary-file cleanup, unauthenticated upload, cross-module waiting results and frontend nullable-response compatibility. Existing automated/live checks also cover user-scoped access and catalog behavior.

The first JavaScript run exposed an old extraction mock missing newly required metadata; its fixture was updated. Another new test initially supplied an incomplete Express request stub; that stub was corrected. The first live run's assertion incorrectly expected no sub-limit from a fixture containing an explicit room-rent sub-limit; the assertion was corrected without changing insurance logic. Final complete reruns passed. Python async/thread-pool tests stalled in the restricted sandbox and passed outside it after execution approval; they are not reported as sandbox successes.

### Real upload verification

Two fictional text PDFs were uploaded through the actual frontend proxy and stored in MongoDB: one with supported waiting/room/co-payment/deductible clauses, and one without insurance definitions. Explicit zero co-payment survived storage and source-backed display; absent co-payment remained null. Missing exclusion lists remained null, and absent sub-limits remained null. Both records produced manual-review Claimability with null scores/payable estimates, identical cross-module waiting objects and live rejection-model predictions.

Real API tests rejected incorrect MIME/signature, malformed/encrypted files, a file over 10 MB and unauthenticated upload. Rejected requests left no temporary file. Another synthetic user could not analyze the uploaded owner's cases. Chrome displayed extracted/unknown fields, review acknowledgment, unknown amounts rather than zeros, and uploaded Rejection manual-review information. No uncaught JS errors, unexpected HTTP failures or failed network requests were observed in browser workflows.

The final audit removed only 2 verified synthetic PDF files, 3 synthetic users, 3 saved policies, 5 hospitalization cases, 5 rejection cases and its isolated browser profile. Intermediate runs also passed cleanup. The existing stored document remains present with its original permission mode; catalog before/after hashes matched. MongoDB was not reset/reseeded. Existing uploaded documents were not opened, altered or deleted.

## Files changed

Frontend:

- `client/src/components/PolicyExtractionReview.jsx` (new)
- `client/src/pages/MyPolicies.jsx`
- `client/src/pages/Claimability.jsx`
- `client/src/pages/RejectionAnalysis.jsx`
- `client/src/utils/analysisResponseValidation.js`

FastAPI:

- `ml-service/main.py`
- `ml-service/pdf_processing.py` (new)
- `ml-service/pdf_test_fixture.py` (new, synthetic fixture generator)
- `ml-service/test_pdf_processing.py` (new)

Express:

- `server/middleware/policyUpload.js`
- `server/routes/userPolicies.js`
- `server/routes/claimCases.js`
- `server/routes/rejectionCases.js`
- `server/services/uploadedPolicyReview.js` (new)
- `server/services/rejectionAnalyzer.js`
- `server/utils/pdfValidation.js` (new)
- `server/utils/analysisValidation.js`
- `server/tests/pdfHardening.test.js` (new)
- `server/tests/insuranceValidation.test.js`
- `server/scripts/liveIntegrationAudit.js` (`--pdf` mode)
- `server/scripts/pdfHardeningCases.js` (new)
- `PDF_HARDENING_REPORT.md` and `PDF_HARDENING_RESULTS.json`

No model schema, CSS, environment configuration, dependency manifest, authentication implementation, recommendation service or existing policy definition was changed.

## Remaining limitations

- **OCR: intentionally unavailable in the demo path.** Textless pages are rejected rather than silently skipping scanned policy terms. No OCR setup was performed. Legitimate blank pages also require a cleaned text-PDF copy under this conservative policy.
- **Parsing: limited supported English clause patterns.** General policy names, premiums, automatic schedule dates/numbers, fixed room caps/categories, arbitrary insurer formats, exception/negation interpretation and complete exclusions/sub-limit extraction remain incomplete. Extracted candidates are not contractual determinations.
- **Verification: manual-review only for uploaded coverage.** No persisted term correction/certification workflow exists; review acknowledgment does not enable payment estimates. Waiting timelines can still be displayed from recorded source-supported definitions without guaranteeing approval.
- **Processing isolation:** a response timeout does not forcibly terminate an already-running Python worker thread. Byte/page/text limits reduce exposure but do not bound all decompression/CPU behavior of a hostile PDF. Production use needs process isolation, concurrency/resource limits and cancellation. Worker exhaustion and deliberate live timeout injection were NOT TESTED; error mapping was automated-tested.
- **Deployment/privacy:** FastAPI remains an internal service without new service authentication; it should remain reachable only through the backend/trusted local environment. Production network isolation, TLS, encryption, antivirus, retention and crash-orphan reconciliation were NOT TESTED. Retained evidence snippets may contain sensitive contextual text and require protected storage. Existing stored documents retain their original permissions by requirement.

**Ready for a constrained MCA demonstration of text-PDF upload, extracted-term review and safe manual-review analysis.** It does not certify policy accuracy, payable amounts or production readiness.

Reproduce live checks with configured services using `node server/scripts/liveIntegrationAudit.js --pdf` (requires local-service/browser permission and creates/cleans isolated synthetic records). Automated commands: `node --test --test-isolation=none server/tests/*.test.js`, `ml-service/venv/bin/python -m unittest discover -s ml-service -p 'test_*.py'`, and `npm run build` from `client/`.
