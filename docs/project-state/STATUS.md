# Project Status

Last updated: 2026-11-02
Current stage: AUD-004 local QA passed; real Stripe/Creem acceptance deferred by Owner
Active task: IDLE-000
Canonical specification: `docs/project-state/contract.md`
Current registry: None required
Capability registry: `docs/project-state/capabilities.json`
Source recovery point: local tag `aud-004-local-20261102`; baseline `aud-004-before-20261101`; parent recovery index `.recovery/aud-004-current-after.json`. Source archives exclude credentials, database and generated assets.

## Critical Resume State

### Active objective
No active implementation. IDLE-000 is the scheduling marker. The Owner explicitly chose local implementation/regression now and real Creem testing after HTTPS deployment. This task does not claim production readiness or account-backed Stripe/Creem acceptance.

### Verified completed
- Four providers use the common purchase/order/receipt/package/ledger boundary. Stripe/Creem webhook adapters verify signed raw payloads and resolve paid receipts; return URLs cannot issue credits. New channels remain disabled in the local environment and UI.
- Scoped subscription projection and paid-period ledger handle first payment, renewal, concurrent/different-event replay, overlap/association validation, stale state, expiry and rollback/recovery. Old Stripe Customer association and Creem first-period grant adoption pass isolated regression.
- Period-end cancellation/resume change state only. Ended plans have no paid access and cannot be silently resumed. Historical receipts retain the original paid-period expiry. New-provider auto refunds are rejected before credit reservation; PayPal/Waffo refund behavior remains preserved.
- Seven retained suites, ten billing test groups, browser/API auth and submission contract, desktop/mobile, production isolation, typecheck/build, frozen install and second-site isolation passed. No new real-provider payment/model/refund calls.
- Main retains 2 users, 5 tasks, 3 orders, 3 refunds and zero real/new subscription records; fixture users/cycles/orders are removed. Main Web and three Workers restored. Aurora Notes remains its independent AUD-003 source/database/key/file instance at 3002; no automatic migration or SDK change.
- Stripe SDK/API pin: 23.1.0 / 2026-10-28.endive. Audit: 0 critical/high/moderate, 1 unchanged low deepmerge advisory under the prior applicability boundary.
- Results: `docs/project-state/aud-004-results.json` and detailed records. Usage/configuration: parent `AUD-004-BILLING-GUIDE.md`.

### Pending or needs review
- BILL-001: Stripe test account; completed Creem store with a product HTTPS URL; real test product/price IDs, API keys and webhook secrets; signed public callbacks and two account-backed billing periods. Deferred by Owner, not silently passed.
- No Creem store/product/key was created or extracted. Only its unsubmitted initial form was prepared; no temporary public site was published.
- New-provider refund/reversal, complex billing/price migrations and the later V1.2 operational/production gates remain unverified.

### Blockers
None for local completion. External account/product gates wait for the Owner to resume after deployment.

### Exact next action
Use http://localhost:3000/zh/buy-credits to inspect the unified interface; keep Stripe/Creem disabled. At the Owner's next request, use the root guide to configure test accounts and run account-backed acceptance before enabling them for users.
