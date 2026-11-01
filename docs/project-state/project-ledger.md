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
