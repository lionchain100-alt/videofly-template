# Project Tasks

Last reconciled: 2026-11-02

## Control rules

- Stable IDs follow the V1.2 audit; checked means implementation and evidence are recorded.
- WIP limit: one active work package. Production activation remains outside these local audit tasks.

## Active milestone

Milestone: Local V1.2 core with four-channel billing/refunds; current full audit records remaining implementation and deferred real-provider gates.
Active task: IDLE-000

Definition of Ready: AUD-010 passed; Owner authorized remote CI and supplied access through the existing GitHub account/fork.
Definition of Done: actual same-commit source/quality success, fixed install/lint/types/Linux standalone output, 15 migrations/two initializations/ten business suites/auth checks, Actions evidence and unchanged local instances.

## Backlog

- [x] AUD-010 Clear265 historical lint diagnostics and1low dependency advisory. Depends on: AUD-009. Acceptance: unchanged rules/exclusions, empty/refused waivers, scoped448/root460 zero checks, narrow renderer override/all advisories0,14mail variants/intercepted SDK, ten business suites/UI/storage/isolation/production and unchanged snapshots/recovery; aud-010-results.json and parent AUD-010-LINT-SECURITY-GUIDE.md. Rehearsal site sources and deferred deployment/platform gates retained.

- [x] AUD-009 Local clean latest-template initialization, CI automatic quality workflow and static production configuration checks. Depends on: AUD-008. Acceptance: new Cedar Tools, frozen install/15 migrations/two initializations, factory/CI/configuration guards, retained ten suites/UI/storage/two-peer isolation/production build and recovery; aud-009-results.json and parent AUD-009-INITIALIZATION-CI-PREFLIGHT-GUIDE.md. Actual hosted CI/deployment/platform acceptance are not claimed.

- [x] CI-001 Actual GitHub-hosted source and integration jobs passed on lionchain100-alt/videofly-template, branch ci/ci-001-20261102. Depends on: AUD-010 and owned fork authorization. Acceptance: real Actions run41407071964 / d49248c, both jobs successful; fixed install/lint/types/Linux build/migrations/two initializations/ten business suites/auth passed. Evidence ci-001-results.json and parent CI-001-GITHUB-ACTIONS-GUIDE.md. Explicit standalone output guard and final evidence commit also run remotely; latest run is linked by the recovery index. No merge/deployment/platform acceptance.

- [ ] REL-001 Fixed HTTPS pre-release deployment, genuine OAuth/email/verified Owner, production DB/private storage/Worker supervision, offsite restore/rollback and per-channel release acceptance. Depends on: Owner resumes deployment and supplies owned domain/hosting/account configuration; CI-001. Acceptance: real environment evidence and separate platform receipts. Local AUD-009 scope is complete.

- [x] AUD-008 UI business continuity across presets, 12 theme/language combinations at 390/768/1440, keyboard/focus, SEO/legacy routes and production authentication configuration. Depends on: AUD-007. Acceptance: browser/DB single-task/hold/settlement evidence, accessibility/responsiveness matrix, SEO/disabled-route/auth configuration checks, retained suites/storage/isolation/build and source recovery. Actual OAuth/mail delivery remains HTTPS/account-backed. Evidence: aud-008-results.json and parent AUD-008-UI-SEO-AUTH-GUIDE.md.

- [x] AUD-007 Model capability configuration, immutable price/execution snapshots, per-user limits, atomic site cost reservations and audited cost review. Depends on: AUD-006. Acceptance: concurrent limits/budgets, historical compatibility, uncertain outcomes, admin permissions/audit, retained suites/storage/isolation/production checks and source recovery. Local defaults authorized: 5/minute, 50/day, USD10/day and USD100/month. Evidence: aud-007-results.json and parent AUD-007-MODEL-BUDGET-GUIDE.md.

- [x] AUD-006 Private R2/S3 assets/uploads, encrypted database/file backup and isolated restore, worker heartbeats/readiness. Depends on: AUD-005. Acceptance: local S3 protocol/private API, database plus file restoration/tamper guards, current worker health, retained suites and build; real R2 independent private test bucket provisioned under Owner authorization and verified. Evidence: aud-006-results.json and parent AUD-006-STORAGE-RECOVERY-GUIDE.md.

- [x] AUD-005 Payment exception queries, persisted verified-event replay, evidence-backed reconciliation and query-only refund recovery. Depends on: RFN-001. Acceptance: 12 operation groups, 3 browser/API groups, all nine retained suites, six isolation groups, typecheck/build/production guards, data snapshot and source recovery; aud-005-results.json and parent AUD-005-PAYMENT-OPERATIONS-GUIDE.md. Actual provider acceptance remains deferred.

- [x] REV-001 Update V1.2 overall review after AUD-004/RFN-001. Depends on: RFN-001 evidence. Acceptance: parent `V1.2-整体检查与后续实施建议-2026-11-02.md`, `v12-review-20261102.json`, 39 acceptance IDs, deployment-only real-payment gates, link/state checks. Read-only review; no financial replay or new paid calls.

- [x] RFN-001 Add local Stripe/Creem test refunds with signed callback/query reconciliation, source-only reclaim, consumed/frozen rules, duplicate protection and complete retained regression. Depends on: AUD-004. Acceptance: 13 refund groups, real local browser/API guards, all eight retained suites, production build/isolation, second-site isolation, clean data snapshot and source recovery; refunds-results.json and parent FOUR-CHANNEL-REFUND-GUIDE.md. Real provider tests deferred by Owner.

- [ ] IDLE-000 No active implementation; await the Owner's next requested work. Depends on: None. Acceptance: scheduling marker only, not an unfinished audit deliverable or permission request.

- [x] AUD-001 Restore admin overview and verify summary/video statistics. Depends on: None. Acceptance: `scripts/test-admin-dashboard.ts` and parent `ADMIN-OVERVIEW-REGRESSION.md`.
- [x] AUD-002 Establish recovery points and upgrade dependencies without changing current capabilities. Depends on: AUD-001. Acceptance: six integration/API suites, browser/production isolation, frozen install/typecheck/build, audit and recovery; evidence `docs/project-state/aud-002-results.json` and parent `AUD-002-SECURITY-UPGRADE.md`.
- [x] AUD-003 Unify site configuration and rehearse a second independent site. Depends on: AUD-002. Acceptance: `docs/project-state/aud-003-results.json`, four detailed QA records and parent `AUD-003-SITE-REUSE-GUIDE.md`.

- [x] AUD-004 Unify Stripe/Creem purchases and subscription cycle fulfillment; preserve PayPal/Waffo/refunds. Depends on: AUD-003. Acceptance: local scope passed; `aud-004-results.json`, detailed billing/browser/production/isolation records and parent `AUD-004-BILLING-GUIDE.md`. Real-account testing deferred by Owner (DEC-AUD004-LOCAL-20261101).

- [ ] BILL-001 Verify Stripe/Creem actual test-account checkout/refunds, two paid periods, public signed callbacks, duplicate delivery and state changes. Depends on: Owner resumes after HTTPS deployment and supplies provider accounts/products/keys. Acceptance: real test receipts and reconciliation; no fixture substitution. Production-money acceptance is separately governed by R05/AUD-009.

Next gates: CI-001 hosted CI evidence, then REL-001 actual deployment and BILL-001 platform acceptance when the Owner resumes. AUD-009 local scope is complete; no production activation or external platform acceptance is inferred.

## Blocked / decision-needed register

No blocker for completed local AUD-004 and RFN-001. Stripe account is absent; Creem store/API/products/webhook are not yet configured because a product HTTPS URL is not available. Owner explicitly deferred these external gates. Production activation, real new-provider refunds, tax/complex cash reconciliation and disputes remain separate unverified scopes.
