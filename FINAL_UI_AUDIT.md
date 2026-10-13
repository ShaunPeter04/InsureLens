# Final UI/UX audit — InsureLens

Date: 13 October 2026

## Scope and approach

Reviewed Login, Registration, Dashboard, Profile, Policy Catalog, Policy Details, Recommendations, My Policies, Claimability Analysis, and Rejection Analysis & Recovery. Reused the existing green/amber palette, Inter and Source Serif typography, page containers, cards, buttons and form styles. No redesign, dependencies, API changes, scoring changes, insurance-rule changes, policy-definition changes or user-data writes were made for this audit.

The workspace already contained ongoing backend, PDF-hardening and resilience changes. Those were preserved; this report describes only the UI audit changes.

## Confirmed defects and fixes

| Defect / evidence | Fix |
| --- | --- |
| Chrome reproduced horizontal overflow on Dashboard, including desktop, from the viewport-width shell and padded content-box main container. | Use the available container width, border-box sizing, and the existing mobile page padding. |
| Seven navigation links extended beyond tablet and mobile viewports, pushing links and Logout off screen. | Wrap destinations; put the link group on its own row below 1200px. Preserve every destination and active state. |
| Mobile screenshot showed the catalog search input shrinking below the 44px height used by adjacent filters. | Disable flex growth/shrink on vertically stacked filter controls. |
| Wrapped catalog headings inherited the root's fixed line height, crowding adjacent lines. | Give headings a line height relative to their own font size. |
| Catalog filters had no accessible names; family editor and itemized expense labels were disconnected from inputs; custom disease inputs and saved family checkboxes lacked accessible names. | Add input IDs, matching labels and contextual accessible names. |
| Selected coverage, disease and co-payment buttons exposed their selection only visually. Expandable recommendation actions did not expose expansion state. | Add `aria-pressed` and `aria-expanded` using existing state. |
| Several input styles suppressed outlines, leaving only subtle border changes. Navigation focus lacked a contrasting shared treatment. | Add visible brand-colored focus outlines and white navigation outlines. |
| The light application declared support for automatic dark browser controls. | Declare the existing light color scheme consistently. |
| Policy Details loading/error states were bare paragraphs outside the normal page layout, without its return action. | Reuse its page/card/back-button styles and expose status/alert roles. |
| Catalog loading/error and several loading/success messages lacked live-region semantics. | Add `status`/`alert` roles without changing message text or request behavior. |
| Policy Details rendered missing numeric values as bare units, null deductible as ₹0, and missing booleans as negative coverage assertions. The existing response validator accepts missing/null term values. | Display “Unknown — confirm with insurer” for missing values. Preserve actual zero and false values. |
| Policy Details lacked a visible reminder about premiums and final eligibility. | Add a concise summary disclaimer requiring insurer confirmation and explaining that missing data does not establish unrestricted coverage. |
| Uploaded extraction review rendered boolean values blank because React does not render boolean children. Internal camelCase field names were hard to scan. | Display explicit Yes/No/Unknown values and readable field labels. Keep review acknowledgment and insurer-verification language. |
| Long policy text and identifiers could escape their content area. | Allow long text to wrap within the existing main content. |

## Page coverage

- Login and Registration: responsive panels and form grids, existing labels, password toggle and validation messages reviewed. No account creation or real login was performed.
- Dashboard: overflow fixed; retained its existing welcome-only content.
- Profile: display/edit layouts and labels checked; edit/cancel exercised without saving.
- Policy Catalog and Details: populated lists, filters, detail navigation, return action, empty/error states, mobile search size and unknown terms checked.
- Recommendations: four synthetic result cards at every audited width, expanded score breakdown and add-policy form, unknown annual-premium and uncertain family-eligibility notices checked. Existing scoring and budget/eligibility assessment messages retained.
- My Policies: saved/uploaded cards, upload form labels, empty/error states and extracted Yes/No/Unknown values checked. No PDF upload was submitted.
- Claimability Analysis: synthetic populated results, unverified checks, unknown financial values, extracted terms and the claim-approval disclaimer checked at every audited width. Added expense rows and their labels checked.
- Rejection Analysis & Recovery: synthetic populated results, extracted review, recovery guidance, uncalibrated ML score and manual-review warning checked at every audited width. ML-unavailable state checked with the rule-based result retained.

## Verification

- `cd client && npm run lint` — passed.
- `cd client && npm run build` — passed; Vite production bundle generated.
- `git diff --check` — passed.
- Headless Google Chrome via the Chrome DevTools Protocol: desktop 1440px, tablet 768px, mobile 375px and narrow mobile 320px; 900px viewport height. All ten routes checked at all four widths.
- Final browser result: 40 route/viewport checks and 52 interaction/state assertions passed; no horizontal overflow, unnamed visible inputs, or uncaught JavaScript exceptions in the tested scenarios. Expected API-error logging during simulated 503 responses is not treated as an application exception.
- Browser checks inspect horizontal overflow, accessible input names, headings, expanded forms, catalog/detail navigation, keyboard Tab navigation and visible focus, validation alerts, empty/error states, uncertainty notices and populated recommendation/analysis results.
- The audit uses an isolated browser profile with synthetic localStorage identity and intercepts all `/api/*` requests. Case submissions in the harness receive synthetic responses and never reach the backend.
- Mobile screenshot visually reviewed; confirmed filter height and heading spacing defects corrected.
- Reusable harness: `client/scripts/uiAudit.mjs`. Start Vite at `http://127.0.0.1:5173` and an isolated headless Chrome with remote debugging on port 9229; then run `node client/scripts/uiAudit.mjs` from the repository root. Requires Node with native WebSocket support and existing Chrome; installs no packages. Results and a screenshot are written to `/tmp/insurelens-ui-results.json` and `/tmp/insurelens-ui-mobile.png`.

## Remaining limitations

- Chrome desktop emulation covers layout and basic keyboard behavior; real touch devices, Safari/Firefox, full screen-reader testing and a formal WCAG conformance audit were not performed.
- Browser API responses are synthetic. This audit does not certify live authentication, PDF extraction quality, insurer document URLs, backend availability, ML accuracy or real claim/appeal outcomes.
- Backend scoring, validation, insurance logic and policy definitions remain outside this presentation audit. Unknown premiums and terms still require insurer confirmation; ML scores remain uncalibrated decision-support signals.
- Existing Google Fonts require network access; existing serif/sans-serif fallbacks remain available offline.
- Card heights may vary with policy wording and expanded sections. Existing layouts and content limits were retained where no usability defect was confirmed.
