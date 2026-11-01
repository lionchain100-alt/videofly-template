# Retained local capability contract

The Owner authorized AUD-002 to establish recovery versions and upgrade dependencies, then AUD-003 to unify branding, languages and tool policy and create an independent second local site. Main-site models, pricing, credentials and availability remain preserved. The second site's narrower configuration and blank provider keys are part of the authorized reuse rehearsal. Production activation remains separate.

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

Current main-site prices, provider models and channel configuration are preserved from the recovery baseline; tests use temporary fixtures and do not make new real charges. Four-channel and production gaps remain governed by V1.2.

## AUD-003 site instance contract

- CAP-008 is owned by `src/config/site-manifest.ts` and `src/config/site-server.ts`: one strict `src/config/site.json` contains public brand/UI, enabled/default languages, tool policy, origin and non-secret instance identity. Credentials belong only to each instance's environment. UI v1 import/export remains presentation-only; Studio updates/rollbacks preserve identity and policy and reject stale revisions.
- The supported translation set is en/zh. Enabled languages drive routing, locale links, alternates and sitemap. The default locale has no prefix; disabled language prefixes return 404. Branding drives public/auth/admin/mail text, metadata, icon and share image. A new site does not require editing common services.
- Closed tools have no visible/executable entry in any of the three presets or shared navigation. Tool/related model pages return 404; model list is empty. Authenticated new submissions return 403 / TOOL_DISABLED at both API and task-service boundaries, before input processing/provider configuration/credit hold. Missing provider credentials return 503 without charging. Disabling a tool preserves existing jobs, result/history access and financial settlement/refunds.
- Configuration changes require a local restart for a consistent full application snapshot (development HMR also updates files). Production requires rebuilding and restarting. The service boundary additionally reads current policy from disk, so a stale client cannot submit to a closed tool.
- CAP-009 is owned by `scripts/create-local-site.mjs`: source-only copy; separate PostgreSQL server/role/password and data directory, fresh auth/admin secrets, namespace for cookies and files, blank AI/payment/storage keys. Empty databases bootstrap from the original baseline SQL and then the same checksummed migrations. Existing databases are never reset.
- Aurora Notes is the recorded second instance at 3002, database 55433, Chinese default/only, summary entry enabled, video closed, no provider keys. Its generic `src/` code (except site.json), scripts and dependency lock are identical to the candidate template. Its inherited template capability records do not constitute real-provider acceptance on that instance.
- Isolation evidence uses actual local HTTP/auth/database/file operations, including simultaneous own sessions, rejected foreign and renamed session cookies, cross-cluster credential rejection, same user/task IDs with separate ledgers/files, idempotent second-site grants and cross-site UI import. R2 namespace writes use an isolated adapter fixture; no real R2 deployment is claimed.
- Executable gates: `test-site-isolation.mjs`, `test-site-service-policy.ts`, `test-site-browser.mjs`, `test-site-production.mjs`, six retained suites and both builds. Usage and scope: parent `AUD-003-SITE-REUSE-GUIDE.md`. Subsequent implementation needs its own requested scope.
