# Project Status

Last updated: 2026-11-02
Current stage: V1.2 overall review updated after RFN-001 local QA; implementation gaps and deferred real-payment gates remain
Active task: IDLE-000
Canonical specification: `docs/project-state/contract.md`
Current registry: None required
Capability registry: `docs/project-state/capabilities.json`
Source recovery point: local tag `refunds-local-20261102`; before tag `refunds-before-20261102` at AUD-004. Parent recovery index `.recovery/refunds-current-after.json`; archives exclude credentials, database and generated assets. Previous AUD-002/003/004 recovery indexes remain intact.
Current review: parent `V1.2-整体检查与后续实施建议-2026-11-02.md`; read-only snapshot `docs/project-state/v12-review-20261102.json`. The RFN-001 recovery tag is the reviewed business-code baseline; the review/documentation supplement is indexed separately at parent `.recovery/v12-review-current.json`.

## Critical Resume State

### Active objective
No active implementation. REV-001 review and RFN-001 local integration/regression are complete. V1.2 overall is still incomplete. Owner explicitly deferred actual Stripe/Creem test refunds and public callback acceptance until HTTPS deployment; production-money acceptance is a separate later gate.

### Verified completed
- Existing login/Studio, DeepSeek summary, Kie video, atomic credits/admin, common purchases and subscription renewal/cancel/resume remain protected. All eight retained suites passed against this candidate; no new real payment/model/refund calls.
- Stripe/Creem use the existing refund command, admin/CSRF checks, immutable UUID, per-user/order locks, original source hold/reclaim/release and audited waiver. Migration 0010 expands only the refund provider constraint. Existing PayPal/Waffo provider adapters and accepted records remain preserved.
- Stripe partial/full refunds resolve the original PaymentIntent or one invoice payment. Signed refunds use authenticated API queries. Creem uses its full-transaction refund endpoint; query and signed callback share a transaction-level identity. Signed ref_ ID is retained when available. Explicit failed attempts cannot capture a later refund attempt's hold.
- Consumed/expired/frozen sources block backend cash calls. External refunds reclaim only their original source, record shortfall, gate new tasks and allow existing tasks to settle. Failed-task release repays original-source debt atomically; consumed loss waiver remains audited and idempotent. Unknown cash outcomes keep reservations and only query; duplicate/concurrent events cannot debit twice. Refunds do not cancel subscriptions.
- 13 refund groups, three browser/API groups, billing UI/contract, production isolation, typecheck/build and six independent-site isolation groups passed. Main keeps 2 users, 5 tasks, 3 orders and 3 refunds; no fixture users or new-channel orders/refunds/subscriptions remain.
- Main Web + three Workers restored at 3000. Aurora Notes was not running at verification entry; restarted using its existing independent AUD-003 source/configuration and eight migrations. Its database, keys and files remain separate; no upgrade was applied.
- Evidence: `docs/project-state/refunds-results.json` and its linked detail records. Usage/configuration and current boundaries: parent `FOUR-CHANNEL-REFUND-GUIDE.md`.
- REV-001 reconciled all 39 V1.2 acceptance IDs and original AUD-001~009 packages, with actual sandbox/test and production-money gates separated. New evidence is read-only DB/HTTP, not a rerun of all integration suites. Main data still 2 users/5 tasks/3 orders/3 refunds, administrator available 190/frozen 0/refund-reserved 0; main has 10 migrations and independent second site has 8.

### Pending or needs review
- BILL-001 remains deferred: Stripe test account; completed Creem store with HTTPS product URL, products/API/webhook credentials; real payment and refund receipts/public notifications, recurring paid periods and provider-side retry/async behavior. Stripe/Creem flags remain false. No new Creem store/product/key was created.
- Added automated refunds cover standard USD cash matching the stored order. Creem partial, tax-inclusive/multiple-payment/ambiguous cash cases require manual reconciliation. Complex billing, disputes and production refund activation remain separate scopes.
- Source recovery is not a database or secret backup. The second site is intentionally not synchronized to these new billing/refund modules.
- AUD-005~009 retain remaining local work: exception operations/reconciliation, production storage and data recovery/readiness, model/budget governance, business-across-layout/SEO/auth acceptance and CI/fixed deployment. Latest-template empty initialization and full UI matrix are not implied by historical second-site or UI tests.

### Blockers
None for completed local work. External account/product gates wait for the Owner to resume after deployment.

### Exact next action
Read the parent 2026-11-02 V1.2 review. Recommended next scoped implementation is AUD-005, payment exception operations and reconciliation, using isolated fixtures; it has not started. Keep Stripe/Creem disabled and defer actual platform/payment/refund acceptance until the Owner resumes after HTTPS deployment.
