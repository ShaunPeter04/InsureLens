# Final live smoke test — InsureLens

Date: 13 October 2026 (Asia/Kolkata). Scope: current local application before GitHub submission. Read [README.md](README.md) and [ARCHITECTURE.md](ARCHITECTURE.md) before execution.

**All ten requested checks have passing live evidence after startup recovery and targeted reruns.** No blocking application defect was confirmed and no application code was changed. Two intermediate browser automation failures are disclosed below; this is not a claim that every intermediate run passed.

## Requested checks

| # | Check | Final status | Observed evidence |
| --- | --- | --- | --- |
| 1 | Application starts successfully | PASS | Started Express, FastAPI and React/Vite using documented commands. Located the existing MongoDB container in Docker Desktop, started it and verified real MongoDB connection/ping. Express API, Vite/proxy and FastAPI health checks passed. |
| 2 | Login and authenticated navigation | PASS | Real synthetic-account registration/login and JWT-protected requests passed. Chrome logged in, displayed Dashboard, rejected unauthenticated protected navigation and followed all seven authenticated navigation destinations. |
| 3 | Policy catalog and details | PASS | Actual catalog API and policy detail returned successfully; Chrome opened a catalog card's detail page. Catalog was read, not reseeded. |
| 4 | Recommendations | PASS | Vite → Express → actual FastAPI returned five ranked candidates; Chrome rendered recommendation cards. Existing results are decision-support matches, not verified quotes/coverage. |
| 5 | My Policies | PASS | Owned saved-policy API and browser listing worked for this run's synthetic catalog/uploaded policies. |
| 6 | Claimability Analysis | PASS | Real synthetic hospitalization creation and analysis passed; Chrome submitted valid input and displayed financial/rule results. Uploaded-policy results displayed unverified score and unknown financial estimates. |
| 7 | Rejection Analysis & Recovery | PASS | Real linked synthetic rejection creation/analysis passed with both actual model predictions; Chrome rendered results. Uploaded-policy review display passed on rerun. |
| 8 | Safe synthetic text PDF upload | PASS | Generated fictional PDFs with the existing `pdf_test_fixture.py`; uploaded through Vite → Express → FastAPI → MongoDB. Explicit zero and missing terms remained distinct; private-response checks and both downstream analyses passed. Browser displayed extraction review/acknowledgment and unknown amounts. |
| 9 | ML failure handling | PASS | Actual route handlers on an isolated temporary Express server returned recommendation 503 for an unreachable upstream, retained Claimability rules, and returned Rejection rules with `mlPrediction.available: false`. Recovery used the actual FastAPI service. Browser recommendation error/retry passed; the final focused browser check displayed unavailable ML, retained rules, recovered and verified that retry did not duplicate the rejection. |
| 10 | No critical browser console errors | PASS | Browser runtime exception capture and unexpected HTTP/transport checks were clear. Rerun/focused runner additionally captured `Runtime.consoleAPICalled` errors; none were reported. Expected controlled outage responses were tracked separately. |

## Startup recovery

Initially all application ports were offline. The first database-gated audit stopped without creating records because MongoDB was unavailable. The default Docker context contained only unrelated stopped demonstration containers; the `desktop-linux` context's daemon was stopped.

After the user confirmed Docker use, started the installed `docker-desktop` user service, found the existing `mongo:latest` container `naughty_carver` mapped to port 27017, and started that container. Express reconnected through its normal connection retry. No MongoDB installation, new database/container, catalog seed, migration or configuration change was performed.

Normal services were left running after the smoke test. The final read-only probe returned HTTP 200 for Express, Vite and FastAPI; MongoDB's existing container remained up. Audit-owned temporary servers and browser processes were closed by cleanup.

## Commands executed

Read/inspected documentation, startup code, and the existing live/PDF/resilience test modules; ran `git status --short` and `git diff --check`. Configuration checks printed only presence/loopback flags, never values of secrets.

Service discovery/startup commands:

```bash
# Repository root; probe initially failed, then passed after startup.
node server/scripts/serviceRegressionProbe.js

# Existing Docker service discovery; no container recreation.
ss -ltn
docker ps --format '{{.Names}} {{.Status}} {{.Ports}}'
docker ps -a --format '{{.Names}} {{.Image}} {{.Status}}'
docker images --format '{{.Repository}}:{{.Tag}}'
docker context ls --format '{{.Name}} {{.Current}}'
docker compose ls --all --format json
docker --context desktop-linux ps -a --format '{{.Names}} {{.Image}} {{.Status}} {{.Ports}}'
systemctl list-unit-files 'mongo*' --no-pager
systemctl --user status docker-desktop --no-pager
systemctl --user start docker-desktop
docker --context desktop-linux start naughty_carver
```

The default `mongod` executable/config/data locations and selected installation directories were checked read-only while locating MongoDB. No executable/service was found there; the existing Docker Desktop instance was used instead.

Application startup commands, in separate terminals:

```bash
# Working directory: server/
npm start

# Working directory: ml-service/
venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload

# Working directory: client/
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Test commands, from the repository root:

```bash
# Initial run: exited at MongoDB connection check; no records created.
INTEGRATION_RESULT_PATH=/tmp/insurelens-final-smoke-live.json node server/scripts/liveIntegrationAudit.js --pdf

# Runtime-only composition of existing isolated test infrastructure.
node --check /tmp/insurelens-final-smoke-runner.cjs
node --check /tmp/insurelens-final-smoke-workflows.cjs
node /tmp/insurelens-final-smoke-runner.cjs

# Focused rerun for the one intermittent ML-recovery browser check.
node --check /tmp/insurelens-final-smoke-focused.cjs
node /tmp/insurelens-final-smoke-focused.cjs

# Final read-only verification.
node server/scripts/serviceRegressionProbe.js
docker --context desktop-linux ps --format '{{.Names}} {{.Status}}'
git diff --check
```

The main `/tmp` runner was executed twice. It reused [liveIntegrationAudit.js](server/scripts/liveIntegrationAudit.js), [pdfHardeningCases.js](server/scripts/pdfHardeningCases.js) and selected [serviceResilienceCases.js](server/scripts/serviceResilienceCases.js) checks. The temporary composition kept the existing baseline/cleanup and PDF tests, selected four server-side outage/recovery checks and two browser failure checks, and skipped extended timeout/malformed-response resilience scenarios. The focused rerun selected only the setup/login/record creation and ML-unavailable recovery checks needed for diagnosis. Helpers did not modify repository application or test source.

An isolated headless Chrome was also started during initial diagnostics and stopped without using an account:

```bash
google-chrome --headless --no-sandbox --disable-gpu --remote-debugging-address=127.0.0.1 --remote-debugging-port=9229 --user-data-dir=/tmp/insurelens-final-smoke-chrome about:blank
```

The reused audit infrastructure launched its own isolated Chrome profiles and removed them after each completed run. The local environment required elevated execution permissions for sockets, Docker Desktop and Chrome; no dependencies were installed.

## Run evidence and intermediate failures

| Run | Local time | Results |
| --- | --- | --- |
| First completed live smoke | 21:05:44–21:06:05 IST | 6 service, 63 API and 14 PDF/failure checks passed. Browser: 18/19 passed; uploaded-rejection automation failed during evaluation. All 13 cleanup checks passed. |
| Main rerun | 21:08:22–21:09:05 IST | Same service/API/PDF/failure checks passed; uploaded-rejection display passed with null-safe polling for asynchronously loaded selects. Browser: 18/19 passed; the ML-unavailable/retry check timed out. All 13 cleanup checks passed. |
| Final focused ML rerun | 21:11:33–21:11:39 IST | 6 service, 6 API, 4 failure/recovery, 5 browser/error checks and 8 cleanup checks passed; no failures or blocked checks. |

The uploaded-rejection harness originally accessed a select's `.options` before guarding its existence during page loading. The temporary runner added null-safe polling, and that check passed. The later ML recovery timeout did not reproduce in the isolated focused run. These observations do not establish a blocking application defect; no application change was justified. The combined multi-workflow browser harness remains intermittently timing-sensitive.

Session evidence (no passwords or tokens):

- `/tmp/insurelens-final-smoke-first.json`
- `/tmp/insurelens-final-smoke-second.json`
- `/tmp/insurelens-final-smoke-focused.json`

These are session-local evidence files, not portable GitHub artifacts. Future full reproduction can use the repository's documented `node server/scripts/liveIntegrationAudit.js --pdf` and `--resilience` modes; those broader modes are not identical to this focused composition and create isolated synthetic records.

## Data preservation and cleanup

Each run verified that its random synthetic account namespace was absent before writing. Audit Mongoose connections disabled automatic index/collection creation. All record deletion was scoped to positively identified synthetic owners/IDs; uploaded originals were removed only after matching the run's owner, policy number and stored path.

Across the three completed runs, verified cleanup removed **8 synthetic accounts, 7 synthetic saved policies, 11 synthetic hospitalization cases, 12 synthetic rejection cases and 4 synthetic PDF originals**. All cleanup checks passed. The first database-blocked attempt created nothing. Completed main runs verified the catalog's before/after hash matched. Existing user records, saved policies, private originals and catalog definitions were not edited by the test. No credential or private document contents are included in this report.

## Remaining demonstration limitations

- Results cover guided synthetic workflows, not every diagnosis, insurer format, device, concurrent session or production deployment. Full lint/build/unit suites were not rerun for this focused live task.
- Failure checks used actual application route handlers with an unreachable upstream in an isolated temporary Express instance, and controlled Chrome interceptions. The shared FastAPI/MongoDB services were not deliberately shut down during failure testing; replica failover and real process-crash recovery were not tested.
- The PDF end-to-end upload was exercised by the API harness; Chrome verified the resulting uploaded review/analysis displays. Native browser file-chooser interaction was not separately exercised.
- Browser evidence covers headless Chrome. Two combined-harness timing failures needed reruns; broad multi-workflow automation is not claimed to be consistently green.
- Premium affordability, full family eligibility, PED/specific-illness applicability and policy wording still require insurer/manual verification. Uploaded estimates remain unknown; ML scores are synthetic-data, uncalibrated signals, not claim/appeal probabilities.
- Text PDFs only: no OCR, scanned/encrypted-document support or general insurer-independent extraction guarantee. Academic prototype and decision-support disclaimers still apply.
