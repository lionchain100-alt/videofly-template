# Project Status

Last updated: 2026-11-02
Current stage: RFN-001 local four-channel refund QA passed; real Stripe/Creem tests deferred by Owner
Active task: IDLE-000
Canonical specification: `docs/project-state/contract.md`
Current registry: None required
Capability registry: `docs/project-state/capabilities.json`
Source recovery point: local tag `refunds-local-20261102`; before tag `refunds-before-20261102` at AUD-004. Parent recovery index `.recovery/refunds-current-after.json`; archives exclude credentials, database and generated assets. Previous AUD-002/003/004 recovery indexes remain intact.

## Critical Resume State

### Active objective
No active implementation. RFN-001 local integration/regression is complete. Owner explicitly deferred real Stripe/Creem refunds and public callback acceptance until HTTPS deployment. This is not production activation or account-backed acceptance.

### Verified completed
- Existing login/Studio, DeepSeek summary, Kie video, atomic credits/admin, common purchases and subscription renewal/cancel/resume remain protected. All eight retained suites passed against this candidate; no new real payment/model/refund calls.
- Stripe/Creem use the existing refund command, admin/CSRF checks, immutable UUID, per-user/order locks, original source hold/reclaim/release and audited waiver. Migration 0010 expands only the refund provider constraint. Existing PayPal/Waffo provider adapters and accepted records remain preserved.
- Stripe partial/full refunds resolve the original PaymentIntent or one invoice payment. Signed refunds use authenticated API queries. Creem uses its full-transaction refund endpoint; query and signed callback share a transaction-level identity. Signed ref_ ID is retained when available. Explicit failed attempts cannot capture a later refund attempt's hold.
- Consumed/expired/frozen sources block backend cash calls. External refunds reclaim only their original source, record shortfall, gate new tasks and allow existing tasks to settle. Failed-task release repays original-source debt atomically; consumed loss waiver remains audited and idempotent. Unknown cash outcomes keep reservations and only query; duplicate/concurrent events cannot debit twice. Refunds do not cancel subscriptions.
- 13 refund groups, three browser/API groups, billing UI/contract, production isolation, typecheck/build and six independent-site isolation groups passed. Main keeps 2 users, 5 tasks, 3 orders and 3 refunds; no fixture users or new-channel orders/refunds/subscriptions remain.
- Main Web + three Workers restored at 3000. Aurora Notes was not running at verification entry; restarted using its existing independent AUD-003 source/configuration and eight migrations. Its database, keys and files remain separate; no upgrade was applied.
- Evidence: `docs/project-state/refunds-results.json` and its linked detail records. Usage/configuration and current boundaries: parent `FOUR-CHANNEL-REFUND-GUIDE.md`.

### Pending or needs review
- BILL-001 remains deferred: Stripe test account; completed Creem store with HTTPS product URL, products/API/webhook credentials; real payment and refund receipts/public notifications, recurring paid periods and provider-side retry/async behavior. Stripe/Creem flags remain false. No new Creem store/product/key was created.
- Added automated refunds cover standard USD cash matching the stored order. Creem partial, tax-inclusive/multiple-payment/ambiguous cash cases require manual reconciliation. Complex billing, disputes and production refund activation remain separate scopes.
- Source recovery is not a database or secret backup. The second site is intentionally not synchronized to these new billing/refund modules.

### Blockers
None for completed local work. External account/product gates wait for the Owner to resume after deployment.

### Exact next action
Inspect http://localhost:3000/zh/admin/orders using the existing local administrator and parent FOUR-CHANNEL-REFUND-GUIDE.md. Keep Stripe/Creem disabled until separately requested HTTPS/account-backed acceptance; use the documented isolated tests to reproduce local financial behavior without real provider calls.
