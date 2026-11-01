# Project Status

Last updated: 2026-11-01
Current stage: AUD-003 local QA passed; both development sites/workers restored
Active task: IDLE-000
Canonical specification: `docs/project-state/contract.md`
Current registry: None required
Capability registry: `docs/project-state/capabilities.json`
Source recovery point: `aud-003-reuse-20261101`; before tag `aud-003-before-20261101`; source recovery index in parent `.recovery/aud-003-current-after.json`. The AUD-002 recovery index is retained.

## Critical Resume State

### Active objective
No active implementation. IDLE-000 is the audit tool's scheduling marker. Preserve the completed local AUD-003 candidate; subsequent work requires the Owner's next request.

### Verified completed
- One strict `src/config/site.json` owns public branding/UI, language/routing, tool flags and non-secret instance identity. UI Studio reads/writes its UI section without importing another site's policy or credentials.
- Each tool and both tools closed: no executable front-end entry, closed routes/sitemap, POST 403 before provider/credits, direct service guard. Existing jobs/history/files and financial settlement remain available.
- Aurora Notes at 3002 / PostgreSQL 55433 created from empty database with new credentials; Chinese default, summary entry only, no AI/payment/storage keys. Common source comparison: 503 identical files, excluding site.json.
- Actual cross-database credentials, own/foreign/renamed sessions, same user/task ID credit/file isolation, second-site idempotent grants and cross-site UI import passed. Task/financial/file fixtures removed.
- Six retained integration/API suites, direct service/storage-prefix fixture, both builds/type checks, three-preset desktop/mobile browser checks, disabled routes/sitemap and production editor/password isolation passed.
- Final simultaneous browser sessions: main 190 available / 0 frozen, second 102 / 0. Main retains 2 users, 5 tasks, 1 asset, 3 orders and 3 refunds. Second has 2 test accounts and no tasks/orders/refunds/assets. Both Web servers and their three Workers are running.
- Dependency lock unchanged; audit remains 0 critical/high/moderate, 1 low (AUD-002 applicability review retained). No new real-provider AI/payment/refund calls.
- Evidence: `docs/project-state/aud-003-results.json` and detailed QA records. Usage: parent `AUD-003-SITE-REUSE-GUIDE.md`.

### Pending or needs review
- Second-site real AI/payment/storage acceptance remains unconfigured by design; fill only its own environment when needed.
- AUD-004 four-channel fulfillment/subscription checks and later production/storage/release work remain V1.2 recommendations, not active implementation.

### Blockers
None for local AUD-003 completion.

### Exact next action
Open 3000 or 3002 and use the site's local UI Studio; follow the parent reuse guide for configuration, restart and creating another independent source copy.
