# Retained local capability contract

The Owner authorized AUD-002 to establish recovery versions and upgrade vulnerable dependencies while preserving login, AI tasks, credits, payments and refunds. This is an internal compatible change, not authorization to activate production payments or change pricing/availability.

Original specification: parent workspace [V1.2](../../../videofly-completion-plan-v1.2.md). Audit and implementation evidence remain in the parent guides; dated earlier findings are not silently rewritten.

| Capability | Observable retained contract | Executable evidence |
| --- | --- | --- |
| CAP-001 Login/authorization | Existing local password/session works; wrong password and disabled/member administrative access denied; role cannot be supplied by user. Local password remains disabled in production. | admin operations integration + candidate browser/auth smoke |
| CAP-002 UI presets/Studio | Same three presets and bounded local editor; production editor/config mutation closed; no real charges from preview. | candidate browser/production Studio smoke; current schema/renderer |
| CAP-003 Text task | DeepSeek flash request contract retained; UUID replay submits once; success settles once; definite failures release original credits. | test-text-tasks.ts |
| CAP-004 Video task | Kie Wan 2.7 parameters unchanged; uncertain submission never blind-retries; successful asset storage can retry without another generation. Private result and Range access retained. | test-video-jobs.mjs + candidate stored-video/browser check |
| CAP-005 Credits/admin | Atomic hold/settle/release, original expiry, no overspend; audited idempotent manual grants; overview counts match current task view. | test-admin-operations.mjs, test-admin-dashboard.ts and task suites |
| CAP-006 Purchase/payment | PayPal sandbox and Waffo test remain enabled with same products/config; signed notifications fulfill once; no credit from return URL; legacy Stripe/Creem remain unconfigured, not claimed accepted. | test-payment-orders.ts + candidate purchase/history/auth smoke |
| CAP-007 Refund | Test-only backend cash refund; source reservation/reclaim, cumulative ceil policy, no repeated debit; consumed/frozen review and audited waiver retained. | test-refunds.ts + candidate existing-refund ledger smoke |

Current prices, provider models and feature configuration are preserved from the recovery baseline; tests use dedicated temporary fixtures and do not authorize new real charges. Known production/second-site/four-channel gaps remain governed by the original V1.2 plan.
