# InsureLens PDF workflow audit

Audit date: 12 October 2026. Scope: source inspection, existing documentation/test evidence, read-only dependency and filesystem metadata checks, and three existing in-memory parser tests. Application code, dependencies, database and stored documents were not changed. This report is the only file created. Existing stored PDF contents were not opened.

**IMPLEMENTED** means code and wiring exist; it does not mean a live PDF workflow passed. **PARTIAL** means an important dependency, coverage or safeguard is incomplete. **MISSING** means no implementation was found in the inspected application. **NOT TESTED** identifies verification not performed.

## Findings against the requested questions

| Question | Status | Actual implementation |
| --- | --- | --- |
| PDF upload | IMPLEMENTED | My Policies multipart form → authenticated Express `POST /api/user-policies/upload` → disk storage. |
| PDF text extraction | IMPLEMENTED | Express forwards bytes to FastAPI `/extract-policy-text`; `pypdf.PdfReader` extracts page text. Live end-to-end extraction is NOT TESTED. |
| Scanned PDF/OCR | PARTIAL | `pdf2image` + `pytesseract` fallback exists. Tesseract is MISSING from this inspection environment's PATH; mixed text/image documents are inadequately handled. Successful OCR is NOT TESTED. |
| MongoDB storage | IMPLEMENTED | The upload route creates a `UserPolicy` with document metadata, full extracted text and structured terms. Original PDF bytes remain on disk, not in MongoDB. Actual PDF-derived persistence is NOT TESTED in the prior live audits or this inspection. |
| Recommendations consumption | MISSING | Recommendations loads active catalog `Policy` records only; it does not use uploaded `UserPolicy.extractedPolicyData`. This is a workflow distinction, not necessarily a defect. |
| Claimability consumption | IMPLEMENTED / PARTIAL | Uploaded terms are selected and used for waiting periods, hospitalization, room rent, exclusions, sub-limits and financial estimates. Unsupported/missing non-waiting terms can become misleading defaults. |
| Rejection consumption | IMPLEMENTED / PARTIAL | Uploaded terms feed shared waiting-period analysis and policy clauses for review. ML predictions use rejection reason/remarks, not PDF bytes or full policy text. |
| General insurance-policy parsing | PARTIAL | Regex-based, narrowly tailored parsing exists; it is not a general insurer-independent parser. No general extraction accuracy has been established. |
| Validation/error handling/privacy | PARTIAL | Authentication, ownership, 10 MB Express limit, metadata validation and failure cleanup exist. Content validation, direct-ML limits, provenance, private file permissions and precise errors need attention. |

## Documentation inspected

`VALIDATION_AUDIT.md`, `INTEGRATION_AUDIT.md`, `RECOMMENDATION_CHANGES.md`, `WAITING_PERIOD_AUDIT.md`, `REGRESSION_AUDIT.md`, the frontend README and `ml-service/READNME.md` were inspected. The ML README is empty; the frontend README is the Vite template. There is no useful documented OCR/system-dependency setup in these files.

The original integration audit explicitly did **not** test PDF upload, extraction or OCR. The regression audit used synthetic uploaded-policy database fixtures to test analysis, not actual uploaded PDFs. Earlier reports' zero-default waiting-period issue was subsequently mitigated: absent extracted waiting durations now remain `null`, and uploaded waiting terms require supporting stored text. Those improvements do not establish unknown handling for other extracted fields.

## Actual data flow and evidence

1. [MyPolicies.jsx](client/src/pages/MyPolicies.jsx), `handleUpload` around line 95: accepts one PDF and manually entered policy number, sum insured and policy start/end dates. File/type/size, finite coverage, calendar date/order and duplicate-number checks run before submission. A synchronous ref guard and disabled/loading button prevent repeated submission. The form posts `policyDocument` and metadata as multipart; errors appear in the existing UI.
2. [AuthContext.jsx](client/src/context/AuthContext.jsx), around line 10: Axios attaches the current JWT. [userPolicies.js](server/routes/userPolicies.js), upload route around line 189: `auth` runs before Multer. Owner comes from authentication, not the payload.
3. [policyUpload.js](server/middleware/policyUpload.js), lines 4–36: disk destination `uploads/policies`, generated timestamp/random basename plus the original extension, client MIME filter and 10 MB limit. This destination is relative to the server process working directory.
4. [userPolicies.js](server/routes/userPolicies.js), `extractPolicyText` around line 39: synchronously reads the stored PDF, sends it as multipart to configured `ML_SERVICE_URL` with a 30-second Axios timeout.
5. [main.py](ml-service/main.py), `/extract-policy-text` around line 641: checks MIME, reads all bytes, extracts every page's available text, and invokes OCR if the entire extracted text is shorter than 100 characters. OCR rasterizes the entire document at 200 DPI and uses English Tesseract. Fewer than 100 characters after processing returns HTTP 422. Otherwise `extract_basic_policy_info` runs and returns text, structured terms and extraction metadata.
6. [userPolicies.js](server/routes/userPolicies.js), lines 225–309, and [UserPolicy.js](server/models/UserPolicy.js): create an owner-scoped uploaded saved policy, persist manual metadata, text and selected parsed fields. Success retains the file. Handler failures remove only that request's upload. No extracted-term preview/edit/confirmation step exists before saving.
7. Saved-policy listing omits `uploadedDocument.extractedText` but returns other saved metadata/terms. My Policies cards show document name and extraction method, not a complete term-review interface. There is no original-document download/view or uploaded-policy correction/delete route in this router.

FastAPI returns `pageCount`, `characterCount` and `requiresOcr`, but the upload route does not persist them. `requiresOcr` actually means OCR was used, rather than a pending OCR requirement.

## Which fields are extracted, and how reliable are they?

No field is established as reliably extracted across arbitrary insurers, PDF layouts or scans. The following is the supported pattern scope, not an accuracy claim. Evidence: [main.py](ml-service/main.py), `extract_basic_policy_info`, lines 330–638.

| Field | Supported extraction | Reliability / unknown handling |
| --- | --- | --- |
| Insurance company | Name matching words ending `Insurance Company Limited` | PARTIAL; other legal names/layouts may not match. Returns empty string when absent. |
| Policy name | Literal `SAMPOORNA AROGYA - GROUP` | PARTIAL, template-specific; arbitrary policy names are MISSING. |
| Initial waiting days | `Initial waiting period: N days` | IMPLEMENTED for matching text; missing stays `null`. Focused synthetic-text tests passed. |
| Specific-illness waiting months | `Specific waiting period: N months`, or `List of Diseases excluded for N months:` | IMPLEMENTED for matching text; list-associated duration overrides the first match. Conflicting clauses remain for manual review downstream. |
| Specific illness/procedure list | Bounded clause window, Roman marker removal, semicolon splitting | PARTIAL; start/end markers and cleanup are tailored to a particular wording/layout and can collect unrelated fragments. |
| PED waiting months | `Pre-Existing disease - N months` | IMPLEMENTED for matching text; absent stays `null`. No clinical applicability is established by extraction. |
| Room-rent percentage | Specific `Room Rent, Boarding & Nursing Charges (N% of Sum Insured` wording | PARTIAL; no general fixed-amount/category parsing. Absent becomes zero and `hasCap: false`, which does **not** prove no restriction. |
| Inpatient coverage/minimum hours | Phrase `stays for at least N hours` | PARTIAL; phrase match sets coverage true. Absent becomes false/zero, which does **not** prove exclusion or a zero-hour rule. |
| Daycare coverage | Literal section marker `I.A.5 - DAY CARE SURGERY/PROCEDURES` | PARTIAL; absent becomes false. Heading presence is not a full contractual determination. |
| Major exclusions | Eight hardcoded phrase patterns: obesity, gender change, cosmetic surgery, hazardous sports, breach of law, excluded providers, infertility and maternity | PARTIAL; substring mentions lack exception/negation interpretation. This is not a complete exclusions extractor. |
| Sub-limits | Seven percentage templates: room rent, ambulance, domiciliary, congenital disease, advanced treatment, outpatient and funeral | PARTIAL; broad cross-line regex may associate an unrelated later percentage. Amount caps, units and full applicability are incomplete. |
| Policy number, sum insured, start/end dates | User enters these in the upload form | MISSING automatic extraction; current validated manual entry is implemented. |
| Annual premium, premium frequency/scope, eligibility ages, family relationships | No parser output | MISSING. Do not derive premium from sum insured or infer family rules. |
| Co-payment, deductible, fixed daily room cap, allowed room category, PED rules and important conditions | Some schema fields exist, but parser/upload mapping does not populate them | MISSING extraction; Mongoose defaults can mask absence (zero financial values, `No Restriction`, empty arrays). |

The present parser is deterministic regex extraction, not ML policy understanding. Text extraction alone cannot certify terms, reconcile endorsements or interpret policy exceptions. OCR errors can corrupt both numbers and clause wording without being detected.

## Consumption by the analysis modules

- **Recommendations:** [recommendations.js](server/routes/recommendations.js), around line 417, queries only active catalog products. Uploaded information is neither a recommendation candidate source nor a user-requirements source. Extending that workflow is unnecessary for a basic PDF demonstration and would require eligibility/pricing inputs the parser does not supply.
- **Claimability:** [claimCases.js](server/routes/claimCases.js), around lines 130–145, chooses `extractedPolicyData` for uploaded policies and validates stored term types. Around line 276, `hasCap: false` yields “This policy has no room-rent cap.” Around lines 399–403, absent co-payment/deductible fall back to zero. Type validation cannot detect unsupported values that already became plausible defaults. Financial estimates can therefore look more complete than the document evidence supports, despite the existing preliminary-estimate disclaimer.
- **Rejection Analysis:** [rejectionCases.js](server/routes/rejectionCases.js), around line 220, chooses uploaded terms. [rejectionAnalyzer.js](server/services/rejectionAnalyzer.js), around lines 300–341, uses relevant terms as clauses to review, including exclusions, room rent, co-payment and deductible. Predictions are separately derived from reason/remarks by the ML service; a PDF is not independently adjudicated by the models.
- **Waiting periods:** [waitingPeriodAnalyzer.js](server/services/waitingPeriodAnalyzer.js), around lines 40–63, requires matching extracted source text for uploaded durations, rejecting absent/conflicting definitions as unknown. Calendar boundaries are shared across both modules; positive exact boundaries and specific/PED applicability retain manual review. Extraction does not establish that a disease is pre-existing or that an initial waiting period guarantees approval.

## Validation, errors and privacy

### Existing protections — IMPLEMENTED

- Authenticated upload; saved-policy lists and analysis queries enforce the authenticated owner.
- Frontend and Express check nonempty files, declared PDF MIME and maximum 10 MB; frontend `accept` guides file selection. Multer accepts one named file and translates its errors into JSON.
- Required coverage/dates use existing validation; policy numbers are optional, trimmed/bounded and duplicates are rejected. The per-user nonempty policy-number index guards numbered duplicates.
- Express sets a 30-second extraction request timeout. Failed handler requests unlink their own unsaved files; saved originals are retained.
- `pypdf` parsing rejects many malformed files through its error path; insufficient extracted text returns FastAPI 422. This is parsing failure handling, not comprehensive content validation.
- The Express upload catch returns generic errors rather than logging document contents. Saved-policy listing excludes full extracted text. No public `express.static` upload mount was found in [server.js](server/server.js).
- Root `.gitignore` excludes `uploads/`; no tracked `server/uploads` files were found.

### Gaps and risks — PARTIAL / MISSING

| Priority | Finding | Evidence / consequence |
| --- | --- | --- |
| High | Unknown non-waiting terms become facts | Parser/upload/schema defaults can imply no room cap, no co-payment/deductible, or no coverage. Financial conclusions need provenance/unknown handling before using arbitrary uploads. |
| High | OCR cannot currently rely on installed Tesseract | Python OCR packages and Poppler tools exist; the Tesseract executable was not found on this environment's PATH. `main.py` does not configure an alternative executable. Current scanned-PDF claims in the UI are unsupported by successful verification. |
| High if externally exposed | FastAPI extraction has no auth, byte/page/work limits or OCR timeout in its endpoint | Direct clients bypass Express's 10 MB limit. It reads/renders the whole file and does synchronous CPU/subprocess work inside an async handler. Small compressed files may be expensive. Express timeout does not stop server-side OCR. Deployment exposure itself is NOT TESTED. |
| Medium | Client MIME is trusted; no PDF signature/content validation before storage | A renamed non-PDF can reach the parser. Original extension is preserved independently of MIME. No explicit encrypted/password-protected PDF handling, attachment/active-content checks or malware scanning was found. |
| Medium | Mixed scanned/text pages are silently skipped | OCR triggers only on aggregate text under 100 characters. A cover page with text can prevent OCR on scanned policy pages. Partial OCR output over the threshold can also count as successful. |
| Medium | Incomplete extraction can be saved without useful policy rules | Any document with at least 100 extracted characters can succeed even if all policy regexes fail. No typed extraction-response contract, per-field confidence, source page/snippet, conflict report or user-confirmation workflow exists. |
| Medium | Limited actionable errors | FastAPI distinguishes some extraction failures, but Express converts most ML 400/422/500/timeouts to generic HTTP 500 “Failed to upload policy PDF.” FastAPI's generic error includes `str(error)`, potentially exposing parser/system details to direct callers. |
| Medium | Local-file access/retention is not hardened | Read-only metadata inspection found upload directories mode `0775` and the existing stored file mode `0664`. Those mode bits permit local group write/read and other-user file read, subject to parent permissions/ACLs. Files are not publicly served, but this is not an explicit owner-only storage policy. No application encryption, retention/deletion policy, consent notice or authenticated document retrieval endpoint was found. Disk/database/platform encryption outside the app is NOT TESTED. |
| Low/Medium | Metadata exposure and lifecycle gaps | The successful upload response serializes the whole saved document, including full extracted text and local file metadata. Listing hides text but not local paths. No content-hash duplicate detection, crash/orphan reconciliation or saved-document lifecycle cleanup is implemented. Multiple uploads without a policy number can repeat. |
| Low | Metadata/setup omissions | Page/character counts are discarded. Upload directory creation is not handled by Multer; startup requires a suitable working directory and existing writable folder. OCR/Poppler setup and supported formats are undocumented. |

File-size filtering reduces risk but does not establish safe parsing or privacy. No stored document text, original names, connection strings, tokens or personal contents were printed during this audit.

## Verification performed and not performed

| Check | Result |
| --- | --- |
| Installed Python dependency metadata | IMPLEMENTED: `pypdf 6.19.0`, `pdf2image 1.17.0`, `pytesseract 0.3.13`, `python-multipart 0.0.32` present in the project venv |
| OCR system commands | PARTIAL: `pdftoppm` and `pdfinfo` found; Tesseract MISSING on inspection PATH |
| Existing focused parser tests | PASSED: 3 tests for absent durations, explicit durations including zero, and not inferring zero from free-text exceptions |
| Prior upload automated tests | Existing mocked tests cover metadata, duplicate checks, failed-file cleanup, persisted null waiting terms and middleware errors. They do not establish real PDF extraction. Not rerun here because they write temporary files. |
| Real PDF upload → extraction → MongoDB → analysis | NOT TESTED |
| Scanned/mixed/encrypted/corrupt/large PDF processing | NOT TESTED |
| General insurer field accuracy and OCR confidence | NOT TESTED |
| Browser upload/error behavior | NOT TESTED |
| Deployment network isolation, TLS, ACLs and encryption | NOT TESTED |

Executed only the existing focused Python tests with bytecode writing disabled: `PYTHONDONTWRITEBYTECODE=1 ml-service/venv/bin/python -m unittest discover -s ml-service -p 'test_waiting_period_extraction.py' -v`. They use synthetic text in memory; no uploads, database writes or package installations occurred.

## Recommended minimum viable MCA solution — proposals only

**Use a constrained text-PDF demonstration first.** Reuse the existing authenticated My Policies upload, manual sum-insured/date entry, saved-policy schema and shared waiting-period analysis. Demonstrate extraction assistance, not comprehensive policy interpretation or guaranteed approval. Keep Recommendations catalog-based.

1. **Make the supported scope explicit.** Limit the first demonstration to a reviewed English text PDF matching supported clause patterns. Mark extracted information as requiring verification. Say scanned PDFs are unavailable until their OCR dependency and workflow have actually passed testing; do not promise OCR merely because the Python package is installed.
2. **Guard unknown values before analysis.** For uploaded policies only, require document-backed terms for financial/coverage conclusions. If a term is absent, unsupported or conflicting, show insufficient information/manual review and avoid a verified monetary estimate. Never equate parser/schema zero/false defaults with insurer-confirmed terms. Reuse the waiting-period source-verification approach where suitable; preserve catalog behavior and shared waiting rules. A constrained demo can defer a full persisted editing workflow, but cannot substitute assumed terms.
3. **Add a small extraction summary.** Within the existing upload UI, show recognized fields, supporting text where available and unknown fields. Require user review of manually entered dates/coverage. Avoid a new policy recommendation engine, broad parser redesign or OCR model work. A future confirmed-term editor should persist explicit verification/provenance rather than an unrecorded checkbox.
4. **Harden the existing boundary.** Validate PDF signature plus parser validity; apply the same file-size/page/work limits at FastAPI; use bounded processing/timeouts. Keep the ML service private. Translate invalid/encrypted/insufficient-text and unavailable-service errors into actionable sanitized messages. Keep originals in private storage and omit local paths/full text from ordinary responses; document retention. Preserve cleanup scoped to the current upload.
5. **Run a small synthetic end-to-end acceptance set.** Use a generated fictional text policy with known clauses, one missing-clauses document, contradictory clauses, invalid MIME/non-PDF, encrypted/corrupt files, oversize/page-limit cases and ML failure. Verify correct saved terms/unknowns, ownership, repeat-click prevention, failure cleanup and consistent Claimability/Rejection displays. Use only isolated audit records and verified cleanup when this testing is separately authorized.

**Defer for speed:** automatic extraction of policy numbers/dates/premiums, arbitrary insurer formats, multilingual OCR, scanned table reconstruction, uploaded-policy recommendation scoring and production document-management features. If scanned support is mandatory for the demonstration, first install/configure Tesseract under separate approval and test a small English synthetic scan plus a mixed-page PDF; retaining the current aggregate-character fallback would not be sufficient.

The existing text-PDF path is a useful foundation, but **PDF upload/OCR is not yet verified as demo-ready**. The quickest defensible demonstration scope is a supported text PDF with explicit review and unknown handling, after a small live upload test. No proposed changes were implemented in this audit.
