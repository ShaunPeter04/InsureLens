# InsureLens frontend

React, React Router and Axios application built with Vite. See the [project README](../README.md) for prerequisites, backend/Python configuration, MongoDB setup, tests and insurance decision-support limitations, and [ARCHITECTURE.md](../ARCHITECTURE.md) for data flows.

From this directory, with the dependencies installed:

```bash
npm ci
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
npm run lint
npm run build
```

Vite proxies relative `/api` requests to Express at `http://localhost:5000` through [vite.config.js](vite.config.js). No `VITE_*` environment variables are currently used. The production build writes `dist/`; production hosting needs separate API proxy and client-side routing configuration.

The optional synthetic browser audit is [scripts/uiAudit.mjs](scripts/uiAudit.mjs). Its isolated Chrome setup is documented in the root README. There is no frontend `npm test` script.
