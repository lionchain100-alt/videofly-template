# Project Status

Last updated: 2026-11-02
Current stage: AUD-005 local payment operations QA passed; actual provider acceptance deferred
Active task: IDLE-000
Canonical specification: `docs/project-state/contract.md`
Current registry: None required
Capability registry: `docs/project-state/capabilities.json`
Source recovery point: local tag `aud-005-local-20261102`; before `aud-005-before-20261102`; parent index `.recovery/aud-005-current-after.json`. Previous recovery indexes retained. Archives exclude credentials, databases and generated assets.
Current review: parent 2026-11-02 V1.2 review is a dated gap snapshot; its top note links this later implementation. Current usage: parent `AUD-005-PAYMENT-OPERATIONS-GUIDE.md`.

## Critical Resume State

### Active objective
No active implementation. AUD-005 local exception console, trusted-event replay and compensation are complete. V1.2 overall remains incomplete; actual sandbox/test and production-money acceptance remain separate and deferred by Owner.

### Verified completed
- New /zh/admin/payments with order/event/refund/audit views; four-provider filtering, scoped searches, bounded pagination and processing/error metadata. Existing order console now supports four providers and receipt/user search.
- Scoped administrator-only JSON commands require 12–300 character reason, immutable UUID/target/action and durable audit intent before any side effect. Rechecks current actor state; leases and a separate resumed process recover. Changed request content conflicts; financial uniqueness guards different-ID repeats.
- Saved verified receipts and supported authoritative read-only queries compensate through original order/cycle/package/ledger boundaries. No new checkout/capture/cash-refund or model call. PayPal normal purchase capture remains unchanged. Waffo without signed actual receipt stays NEEDS_REVIEW; no mint from completed/priceSnapshot. Subscription active alone cannot grant.
- Refund replay/recheck uses existing source-only, expiry, frozen/consumed/debt and duplicate protection. Verified disputes/reversals/unmatched events have reasoned review acknowledgment; no automatic financial resolution is implied.
- Nine retained suites, 12 operation groups, three browser/API groups (response loss, immutable retry/reload, auth/CSRF, raw-fact rejection), six site-isolation groups, typecheck/build and production-private operation route checks passed. New real-provider calls: zero. Details: aud-005-results.json and linked records.
- Main remains 2 users, 5 tasks, 3 orders, 3 refunds, administrator 190 available/0 frozen/0 refund reserved; eleven applied migrations. Isolated operation/financial fixtures removed. Web and three Workers restored at 3000. Second independent site remains AUD-003/eight migrations, 102 credits, own keys/files/DB; no upgrade applied.

### Pending or needs review
- BILL-001: actual Stripe/Creem test checkout/refund, two paid periods and public callbacks after HTTPS deployment. No new Creem shop/API/product or Stripe account setup; both flags remain false. Production-money R05 remains a separate later gate.
- Waffo actual query/statement schema must prove captured amount before direct lost-notification compensation; use official signed resend/replay meanwhile. Bulk provider statement import/periodic real-platform reconciliation and dispute financial policies are not claimed completed.
- AUD-006 storage/data recovery/readiness, AUD-007 model/budget governance, AUD-008 full UI/SEO/production auth and AUD-009 CI/fixed deployment remain. Latest-template clean initialization and business-data backup restoration are still required; source archives do not replace them.

### Blockers
None for completed local scope. External provider/account/HTTPS gates wait for Owner to resume deployment-backed acceptance.

### Exact next action
Open http://localhost:3000/zh/admin/payments with the existing local administrator; read parent AUD-005-PAYMENT-OPERATIONS-GUIDE.md. Uncheck exception-only filtering to inspect successful historical records. Recommended next scoped implementation is AUD-006; it has not started. Keep Stripe/Creem disabled and do not substitute manual grants for payment compensation.
