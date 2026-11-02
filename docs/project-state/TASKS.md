# Project Tasks

Last reconciled: 2026-11-02

## Control rules

- Stable IDs follow the V1.2 audit; checked means implementation and evidence are recorded.
- WIP limit: one active work package. Production activation remains outside these local audit tasks.

## Active milestone

Milestone: Local V1.2 core with four-channel billing/refunds; current full audit records remaining implementation and deferred real-provider gates.
Active task: IDLE-000

Definition of Ready: AUD-005 QA recorded; Owner authorized AUD-006 and independent private Cloudflare R2 test-bucket configuration.
Definition of Done: private assets/uploads, encrypted offline database/file backup and isolated restore, Worker heartbeat/readiness, actual private R2 round trip, retained business/production/isolation/browser checks and source recovery.

## Backlog

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

Suggested next implementation: AUD-007 model/budget governance, followed by AUD-008/009. These remain proposed and have not started. AUD-006 local scope and real private R2 test-bucket integration are complete. Actual provider receipt/bulk-statement reconciliation remains deferred under BILL-001 and deployment gates.

## Blocked / decision-needed register

No blocker for completed local AUD-004 and RFN-001. Stripe account is absent; Creem store/API/products/webhook are not yet configured because a product HTTPS URL is not available. Owner explicitly deferred these external gates. Production activation, real new-provider refunds, tax/complex cash reconciliation and disputes remain separate unverified scopes.
