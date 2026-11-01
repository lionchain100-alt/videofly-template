# Project ledger (append-only)

## 2026-11-01 — AUD-002 entry and recovery baseline

- Owner requested recoverable versions followed by dependency security upgrades preserving existing flows.
- Baseline commit: `0219ad75ad2ec4ad54c5f59fb66e42ee86a7d20d`; parent recovery snapshot has 617 verified files plus ZIP and complete Git bundle.
- Source archive excludes env secrets, database data, generated files and node_modules; it is not a database backup.
- First core upgrade batch passed task, credit, payment and refund fixture tests; final candidate remains in validation.
- Resulting state: AUD-002 active. No production activation or pricing/availability change.
- Blocker: None.
- Exact next gate: final candidate regression, build and after-recovery verification.

## 2026-11-01 — AUD-002 local upgrade and retained regression completed

- Upgraded/pinned security dependencies; removed absent Monorepo importers and unused direct RSC/devtools dependencies. Main Next remains 15; email preview uses a separate maintained UI.
- No `src/` business/config/migration change. Build type checking, retained-suite runner and security threshold command added.
- Evidence: `docs/project-state/aud-002-results.json`; six integration/API suites, browser/production isolation, email preview, frozen install and build.
- Production/all audits: zero critical/high/moderate, one unsuppressed low deepmerge with no upstream patch and documented applicability boundary.
- Baseline archive extraction verified all 617 hashes and frozen install; upgraded recovery bound to tag `aud-002-upgraded-20261101` and parent manifest.
- Resulting state: local QA passed; workers/3000 restored; financial data retained. Production activation not performed.
- Blocker: None for local completion.
- Exact next gate: preserve the candidate; AUD-003 remains proposed pending Owner direction.

## 2026-11-01 — AUD-003 configuration and independent reuse completed

- Owner requested canonical brand/language/tool controls and an independent second-site rehearsal. Main accepted tools, pricing, credentials and financial records were preserved; the announced second profile is Chinese/summary-only with blank provider keys.
- Added strict manifest, presentation-only Studio persistence, shared brand/locale routing and UI/API/service tool policy; retained in-flight jobs/history/settlement. Fixed legacy redirect specificity and root joining as part of routing unification.
- Added source-only site creation, separate native PostgreSQL clusters/credentials, empty-database baseline bootstrap, namespaced auth/files and common start/stop/restart helpers. Created Aurora Notes at 3002/55433 without copying the main environment/data.
- Evidence: aud-003-results.json and four detailed QA JSON records. 503 common source files match. Cross-cluster credentials, foreign/renamed cookies, identical user/task IDs, grants/replay, private files and UI import isolate correctly. Three presets pass desktop/mobile and both-off checks; both builds and production isolation pass; all six retained suites pass. No new real-provider calls.
- Temporary financial/task/file fixtures removed. Main remains 190 available/0 frozen, 5 tasks, 3 orders and 3 refunds; second is 102 test credits after the existing daily login bonus. Both local sites and their three Workers restored.
- Resulting state: AUD-003 local QA passed, IDLE-000. Recovery: local source tag aud-003-reuse-20261101 and parent .recovery/aud-003-current-after.json; credentials/database/assets excluded.
- Blocker: None. Next gate: Owner's next scoped request; second-site production/real-provider activation is not implied.
