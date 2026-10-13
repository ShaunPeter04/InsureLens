# Documentation audit

Date: 13 October 2026. Scope: GitHub and MCA demonstration documentation; source/configuration inspection and lightweight read-only verification.

## Documentation created or updated

| File | Purpose |
| --- | --- |
| [README.md](README.md) | Overview/problem statement, implemented modules, stack, architecture diagram, Ubuntu/Linux and WSL setup, placeholder environment, service startup, catalog initialization caveat, tests, structure, limitations, screenshot placeholders and academic disclaimer. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Components, data/storage boundaries, endpoint inventory, authentication, recommendations, claimability, rejection/recovery, PDF extraction, rules versus ML and failure handling; Mermaid diagrams. |
| [client/README.md](client/README.md) | Replaced generic Vite boilerplate with frontend commands and links to the project documentation. |
| [server/.env.example](server/.env.example) | Completed the setup template with the required `ML_SERVICE_URL`, optional `CLIENT_URL` and an explicit JWT-secret placeholder. No real environment file changed. |

## Inspected evidence

Read frontend/backend manifests and lockfile/installed package metadata, the public environment template, Vite routing/proxy configuration, React authentication/HTTP/page code, Express startup/middleware/routes/models/services/validation, FastAPI recommendation/extraction/prediction code, Python pins, runtime model filenames and checked-in artifact presence, and test/live-audit/seed scripts.

Reviewed [VALIDATION_AUDIT.md](VALIDATION_AUDIT.md), [INTEGRATION_AUDIT.md](INTEGRATION_AUDIT.md), [RECOMMENDATION_CHANGES.md](RECOMMENDATION_CHANGES.md), [WAITING_PERIOD_AUDIT.md](WAITING_PERIOD_AUDIT.md), [REGRESSION_AUDIT.md](REGRESSION_AUDIT.md), [PDF_WORKFLOW_AUDIT.md](PDF_WORKFLOW_AUDIT.md), [PDF_HARDENING_REPORT.md](PDF_HARDENING_REPORT.md), [SERVICE_RESILIENCE_AUDIT.md](SERVICE_RESILIENCE_AUDIT.md) and [FINAL_UI_AUDIT.md](FINAL_UI_AUDIT.md). Older PDF/OCR/default-term and oldest-member-only descriptions are historical; current documentation follows the updated code and later reports.

Only public configuration/schema/source artifacts were used for documentation. `server/.env`, document contents and user records were not opened or copied. No secrets, JWTs, actual connection credentials or personal insurance data were published.

## Verified implementation details

| Detail | Evidence / documented outcome |
| --- | --- |
| Runtime commands | `client` has `dev`, `lint`, `build`, `preview`; `server` has `dev` and `start`. Root has no `package.json`. Uvicorn target is `main:app` from `ml-service/`. |
| Required configuration | Express requires nonempty `MONGO_URI`, `JWT_SECRET`, `ML_SERVICE_URL`; `PORT` defaults to 5000, CORS `CLIENT_URL` to localhost:5173. |
| Development routing | Vite `/api` proxy points to localhost:5000; browser paths are from `client/src/App.jsx`. No application `VITE_*` configuration was found. |
| API paths | Endpoint tables checked against Express route mounts/handlers and FastAPI route registration. No Express `/health` was invented. |
| Node prerequisites | Observed Node 24.20.0/npm 11.19.0; documented Node 24.x satisfies installed Vite, ESLint and Mongoose engine constraints and supports the browser harness. |
| Python prerequisites | Existing venv uses Python 3.14.4. Installed NumPy/SciPy metadata requires Python >=3.12; documentation distinguishes this inferred minimum from the observed environment. |
| Recommendation responsibility | Deterministic Python scoring, top five candidates; active catalog only. Unknown annual premiums remain insufficient information; selected adults' recorded age bounds checked individually. |
| Claimability responsibility | Express rules and shared waiting calculator; no FastAPI call. Catalog estimates are preliminary; uploaded score/payment estimates remain null/manual-review. |
| Rejection responsibility | Express rule guidance plus optional FastAPI text classification. Runtime artifacts are `rejection_logistic_v2.joblib` and `rejection_classifier.joblib`, not tree V2. |
| Authentication | bcrypt salt cost 10; one-hour JWT; localStorage user/token; backend ownership scope; local logout without refresh/revocation workflow. |
| PDF limits | One multipart `policyDocument`, 10 MB, 1–50 pages, 200,000 characters, every page readable, >=100 characters; encryption/scans/mixed-image documents rejected. OCR is not an active endpoint capability despite remaining declared libraries. |
| PDF storage/review | Original private disk file; bounded rule-evidence snippets, sanitized responses, unverified terms; local acknowledgment is not persisted certification. |
| Failure behavior | Browser 20-second default/40-second upload; upstream recommendation 10 seconds, rejection ML 5 seconds, extraction 30 seconds; Python extraction response 20 seconds. MongoDB readiness gate and in-memory retry-receipt limits documented. |
| Seed operation | Existing script deletes all catalog policies before insertion. Clearly separated from normal startup and restricted in documentation to intentional disposable-database initialization. It was not run. |
| Test entry points | Node built-in runner and Python unittest commands; `server npm test` remains a failing placeholder and frontend has no `npm test`. Optional live audit modes are not read-only and are distinguished from synthetic UI tests. |
| Publication boundaries | Existing `.gitignore` covers `.env`, `venv/` and dependencies, but does not explicitly cover uploads. Documentation identifies private runtime documents as excluded from publication without modifying them. |

Platform installation instructions were cross-checked against [Node.js downloads](https://nodejs.org/en/download), [MongoDB's Ubuntu installation guide](https://www.mongodb.com/docs/v8.0/tutorial/install-mongodb-on-ubuntu/), [Microsoft WSL installation](https://learn.microsoft.com/en-us/windows/wsl/install) and [WSL systemd guidance](https://learn.microsoft.com/en-us/windows/wsl/systemd/). These are setup references, not evidence of fresh installation in this workspace.

## Checks performed in this documentation task

- Verified local linked paths, Markdown fence balance and Bash code-block syntax without executing installation/startup/seed/live-audit commands.
- Checked documented npm scripts, required/optional variables, Express route mounts/methods, registered FastAPI routes, Python pins/installed metadata, runtime model-file existence and Node CLI options. Both component lockfiles' root dependency/devDependency ranges match their package manifests.
- `ml-service/venv/bin/python -m pip check` — passed: no broken requirements in the existing environment.
- `ml-service/venv/bin/python -m uvicorn --help` — passed; documented `--host`, `--port`, `--reload` and application target syntax supported.
- Performed a non-starting FastAPI import/introspection with bytecode writes disabled; no model training, inference, network request or database write was needed.
- Checked documentation/template whitespace and scanned newly written files for credential-shaped material; examples contain placeholders and loopback addresses only.

Final local checker result: **passed, zero failures** across four documentation files, 67 relative links, 15 Bash code blocks checked with `bash -n`, 22 Express method/path entries and 29 Python dependency pins. Six Mermaid declarations/fence blocks passed the lightweight structural review; this is not a rendering test. FastAPI's four application endpoints and default docs/OpenAPI routes were confirmed by import introspection. Four referenced JavaScript entrypoints passed `node --check`, and the installed Node CLI exposes `--test-isolation`.

`git diff --check` passed. The local checker also confirmed both runtime model artifacts exist, the template has exactly the five documented variables, and no JWT/private-key/credential-bearing MongoDB URI patterns appear in the newly written documentation. Results are available in `/tmp/insurelens-documentation-results.json` for this session. The checker did not open the real `.env` or invoke application workflows.

Earlier audit reports contain their own test results. Full application suites, frontend builds, browser audits and live integration were not rerun for this documentation-only task.

## Remaining gaps and limitations

- Fresh dependency installation, Ubuntu service provisioning and Windows/WSL execution were not performed. `mongod` and `mongosh` were not available on the inspected PATH, so the local MongoDB startup/ping commands were checked against the official guide rather than executed. This does not establish whether a database service exists elsewhere.
- Python >=3.12 is inferred from current dependency metadata; installation/serialized-model compatibility across every Python/OS version has not been demonstrated. Preserve the pinned dependencies for the known environment and check prediction behavior after environment changes.
- Browser harness commands assume a Linux Chrome binary, isolated profile and local sockets. WSL Chrome availability/networking may require additional setup. Live audit scripts write synthetic records and depend on services, indexes and catalog contents; review their cleanup output.
- Mermaid blocks were source-reviewed but not rendered through GitHub or a Mermaid renderer here. No Markdown/Mermaid dependency was installed for this task.
- No sanitized GitHub screenshots were prepared. The README includes explicit textual placeholders rather than nonexistent image links.
- GitHub repository owner/URL, project author/institution/license and production hosting configuration were not established. No ownership, license or deployment claims were invented. The clone URL is explicitly a placeholder.
- Root startup/test orchestration, a working backend `npm test` wrapper, production proxy/static hosting and a nonempty Python-service README remain absent. The documentation provides the existing direct commands without adding application features.

Application logic, schemas, scoring, model artifacts, catalog definitions, uploaded originals and user records were unchanged during this task. Existing workspace changes from previous tasks were preserved.
