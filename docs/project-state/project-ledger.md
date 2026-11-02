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

## 2026-11-01/02 — AUD-004 local billing and subscription regression

- Owner requested Stripe/Creem common fulfillment and existing subscription renewal/cancel/resume, retaining PayPal/Waffo/refunds. Only a Creem login account was available; its initial store form rejected localhost and required HTTPS. Owner explicitly chose local work now and real Creem testing after deployment (DEC-AUD004-LOCAL-20261101). No store or public preview was created.
- Added four-provider dispatch, immutable order kind/product mapping, signed adapters and paid-period subscription ledger with atomic common credit fulfillment. Removed auth-plugin minting callbacks; legacy Creem webhook/access/management paths use the common boundary. Existing Stripe associations and exact Creem first-period grants can be linked without replaying credit issuance.
- Added migration 0009; no reset of existing data. Updated Stripe SDK/API to verified 23.1.0 / 2026-10-28.endive. Optional empty secret fields now normalize to undefined while required fields remain validated. Common purchase/pricing/subscription UI follows provider/product availability.
- Evidence: aud-004-results.json; seven retained suites; ten billing groups; browser/API and production isolation; frozen install, typecheck/build, security threshold and independent second-site isolation. All money/provider records in the new tests were isolated fixtures and cleaned. No new real-provider calls.
- Preserved main 2 users/5 tasks/3 orders/3 refunds. Stripe/Creem stay disabled, no subscriptions retained; main Web/Workers restored and the independent 3002 instance remains at AUD-003. Capability baseline advanced to the accepted nine-capability AUD-003 registry; additive CAP-010 records local billing gates only.
- Resulting state: AUD-004 local scope QA passed; IDLE-000. Real Stripe/Creem receipts, public signed notifications and recurring periods remain BILL-001, explicitly deferred. New-provider refunds/complex billing/production release are not implied.
- Recovery: aud-004-before-20261101 -> aud-004-local-20261102 and parent .recovery/aud-004-current-after.json. Exact next gate: Owner resumes account-backed testing after HTTPS deployment.

## 2026-11-02 — RFN-001 local Stripe/Creem refunds

- Owner requested backend refunds, original-source credit recovery, consumed/frozen rules and duplicate callback protection; real platform testing explicitly deferred until HTTPS deployment. CAP-007 expanded additively from the accepted AUD-004 baseline (ten protected capabilities retained).
- Implemented provider-specific refund create/query adapters under the common refund service. Stripe uses durable idempotency/metadata and invoice-payment association. Creem official POST accepts a transaction ID for full refund and returns status only; its full-transaction identity unifies query/callback, and failed attempt identities stay distinct. Added migration 0010 without resetting data. Raw signed events requery provider facts; event fingerprint conflicts fail.
- Existing source-only reserve/reclaim/release/debt/waiver rules apply to new channels. Frozen/consumed/expired sources block cash calls; external refunds gate new tasks while existing work settles. Standard USD cash must match the stored order; tax/ambiguous receipts require manual reconciliation. Period refunds do not implicitly cancel subscriptions.
- Verified 13 refund groups (concurrent requests/delivery, failed-attempt retry, lost response query recovery, pending/failed outcome, partial rounding, subscription association, legacy order lookup, callback race, debt/waiver, transaction rollback/recovery and forgery/scope guards), three real local browser/API groups, all eight retained suites, billing browser, production auth/Studio isolation, typecheck/build and six second-site isolation groups. No new real provider calls.
- At isolation entry Aurora Notes Web/DB were stopped; restarted with its original AUD-003 source, credentials and eight migrations. Main restored Web + three Workers. Main still 2 users/5 tasks/3 orders/3 refunds; no fixture users/new-channel financial records remain. Temporary production listener stopped.
- Result: RFN-001 local QA passed; IDLE-000. BILL-001 real account acceptance remains deferred. Guide FOUR-CHANNEL-REFUND-GUIDE.md supersedes older refund-scope statements; historical QA files were preserved and fresh results saved separately.
- Recovery: refunds-before-20261102 -> refunds-local-20261102, parent .recovery/refunds-current-after.json. Exact next gate: Owner resumes account-backed purchase/refund/public callback tests after HTTPS deployment.

## 2026-11-02 — REV-001 V1.2 status and next-step review

- Owner requested an updated overall V1.2 review after local four-channel refunds, with deployment-only actual payment tests listed separately. Reconciled the original plan, 39 acceptance IDs, original AUD packages, source at 675bab847e88fd32fce773cc2ec17d1e8eb096fc and existing QA records.
- New verification was read-only SELECT/public HTTP GET; no login, financial/task submission, event replay, schema/config/key change or new real-provider call. Main retained 2 users/5 tasks/3 orders/3 refunds, available 190/frozen 0/refund reserve 0, with ten migrations; independent second site retained its eight-migration AUD-003 version and 102 test credits.
- Saved parent V1.2-整体检查与后续实施建议-2026-11-02.md and v12-review-20261102.json. Original November 1 report is historical; plan and state point to the new review. Existing eight-suite/13-refund-group QA is attributed to RFN-001, not falsely presented as a fresh rerun.
- Result: REV-001 complete, IDLE-000. Local main core is usable but V1.2 remains incomplete. AUD-005 exception operations/reconciliation is recommended next, then AUD-006 storage/data recovery/runtime, AUD-007 model/budget governance, AUD-008 UI/SEO/auth and AUD-009 deployment/CI. These recommendations are not implementation or activation authorization.
- BILL-001 now explicitly includes actual Stripe/Creem test refunds alongside purchases, two periods and public callbacks after HTTPS deployment; production-money R05 remains separate. Existing PayPal/Waffo actual test receipts are retained as passed history, with fixed-endpoint retesting and remaining cases listed separately.
- Recovery: business-code baseline remains refunds-local-20261102; review-only documents/snapshot are archived in parent .recovery/v12-review-current.json without altering previous recovery indexes. Exact next gate: Owner selects a scoped implementation package; no new credentials are needed to read the review or continue isolated AUD-005 work.

## 2026-11-02 — AUD-005 local payment operations delivered

- Owner requested exception queries, verified-event replay and receipt-backed compensation with permissions/reasons/audit, no repeated credits/refunds; real platform tests remain deferred. Added CAP-011 without removing retained capabilities.
- Added private /admin/payments and admin payment-ops API, four scoped views, immutable request/reason audit intents, durable lease recovery, current-role execution guard, event processing diagnostics and explicit review acknowledgment. Migration 0011 expands schema only. Order search/filter now includes four providers, user IDs and external receipts.
- Compensation reuses saved paid facts or authoritative read-only queries. PayPal operation queries never capture; Waffo snapshot/status never mints. Replay/refund recovery never creates another cash refund. Existing normal checkout/capture, models, pricing, flags, refund policies and second-site source remain preserved. Disputes/unmatched records get a review trail, not a claimed financial resolution.
- Evidence: 12 new operation groups, three browser/API groups, nine retained suites, six isolation groups, typecheck/build/production route isolation, and aud-005-results.json. Audit insertion failure prevents effects; post-effect finalization crash/lease expiry and a separate process recover exactly once. Browser response-loss/retry/reload passes. No new real-provider calls.
- Final snapshot: main 2 users/5 tasks/3 orders/3 refunds, 190 available/0 frozen/0 refund reserved, eleven migrations and no retained payment-operation fixtures. Second site remains independent AUD-003, eight migrations and 102 test credits. Web + three Workers restored; temporary production listener stopped.
- Result: AUD-005 local scope QA passed; IDLE-000. Actual Stripe/Creem, Waffo authoritative receipt/statement protocol and public fixed-endpoint acceptance remain external gates. AUD-006 storage/data recovery/runtime is recommended next, not started.
- Recovery: aud-005-before-20261102 -> aud-005-local-20261102, parent .recovery/aud-005-current-after.json. Current guide AUD-005-PAYMENT-OPERATIONS-GUIDE.md supersedes the review's pre-implementation AUD-005 gap.
