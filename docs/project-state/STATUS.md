# Project Status

Last updated: 2026-11-02
Current stage: AUD-007 local model/price policy, call limits and estimated-cost budget QA passed
Active task: IDLE-000
Canonical specification: `docs/project-state/contract.md`
Current registry: None required
Capability registry: `docs/project-state/capabilities.json`
Source recovery point: local tag `aud-007-local-20261102`; before `aud-007-before-20261102`; parent index `.recovery/aud-007-current-after.json`. Previous recovery indexes retained. Source archives exclude credentials, databases and generated assets.
Current review: parent 2026-11-02 V1.2 review is a dated snapshot with later implementation notes. Current usage: parent `AUD-007-MODEL-BUDGET-GUIDE.md`; previous storage guide remains applicable.

## Critical Resume State

### Active objective
No active implementation. AUD-007 local scope passed. Owner accepted 5/minute and50/day per-user limits and USD10/day,USD100/month site budgets. V1.2 remains incomplete; actual model/payment-provider additions and production activation remain separate gates.

### Verified completed
- /zh/admin/ai and private admin API manage immutable model/default/sort/enable/credit/cost versions with reasons, role checks, optimistic revision and command replay. Secrets/transport binding remain environment-only; additional text model IDs need TEXT_AI_ALLOWED_MODELS. Current tool pages use the configured default. Legacy 9:16/other-provider live-acceptance boundaries are explicit.
- New tasks atomically reserve original credits and estimated supplier budget; duplicates reuse existing receipt, concurrent users cannot overspend site allocation. UI quote revisions prevent silent new-price submission. Saved model/parameters/credit/cost snapshots survive changes without repricing old jobs or orders.
- Durable dispatch permission prevents repeated paid POST after restart. Unknown costs survive failure/refund and date rollover; token/flat-price estimates do not masquerade as bills. Terminal operator statement confirmation retains evidence/reason/history and never alters credits or payments. Original video/manual-review chain remains separate and receipt-aware.
- Ten retained suites (nine prior plus governance), nine governance groups, three browser groups, six dual-site groups, real R2 private API and storage/restore regression, final runtime checks, typecheck/build and production boundary pass. Evidence aud-007-results.json. No new model or payment/refund provider calls.
- Main remains 2 users,5 tasks,1 legacy private MP4,3 orders,3 refunds,190 available/0 frozen/0 refund reserve,14 migrations. Policy revision1 has approved limits, two original profiles and 1/10 credit prices; no test users/cost/review/incident/version fixtures remain. Web and three Workers ready at3000. Aurora Notes stays independent AUD-003/eight migrations/102 credits with no governance-table/source upgrade.
- Latest genuine encrypted backup verified and restored to laconic_local_restore_aud007_verified, main unchanged; files and all source table fingerprints checked. Backup key remains in local env and must be escrowed independently. Source recovery does not include business backups.

### Pending or needs review
- BILL-001 actual Stripe/Creem test checkout/refund, two paid periods and fixed public callbacks after HTTPS deployment; flags remain false. Production-money R05 and Waffo authoritative statement/query protocol remain separate gates.
- Supplier invoice import/retrieval, automatic price synchronization and external account hard limits are not implemented. Current cost review is explicit operator attestation to a reference. Historic task costs are not invented, and outside-account calls are outside template estimates. New text models and live9:16 still require actual acceptance.
- AUD-008 full business UI/SEO/legacy-route/production-auth combinations and AUD-009 clean deployment/CI remain. Latest-template clean initialization, production disaster recovery/PITR/failover, automatic offsite backup/retention, supervisor and external alerts remain unverified operations gates.

### Blockers
None for completed local scope. Existing DeepSeek/Kie configuration suffices. Deployment-backed real-provider and production-account gates await Owner-directed work.

### Exact next action
Open http://localhost:3000/zh/admin/ai with the existing local administrator; read parent AUD-007-MODEL-BUDGET-GUIDE.md. Review configured estimates before using a different model; keep backup key independently. Next recommended implementation AUD-008 is not started.
