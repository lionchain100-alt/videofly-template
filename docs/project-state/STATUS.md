# Project Status

Last updated: 2026-11-02
Current stage: AUD-006 local storage/recovery/runtime QA and actual private R2 test-bucket integration passed
Active task: IDLE-000
Canonical specification: `docs/project-state/contract.md`
Current registry: None required
Capability registry: `docs/project-state/capabilities.json`
Source recovery point: local tag `aud-006-local-20261102`; before `aud-006-before-20261102`; parent index `.recovery/aud-006-current-after.json`. Previous recovery indexes retained. Source archives exclude credentials, databases and generated assets.
Current review: parent 2026-11-02 V1.2 review is a dated snapshot; its top note links this later implementation. Current usage: parent `AUD-006-STORAGE-RECOVERY-GUIDE.md`.

## Critical Resume State

### Active objective
No active implementation. AUD-006 local scope and actual R2 private test-bucket connection are complete. V1.2 overall remains incomplete; production recovery and actual payment-provider acceptance remain separate gates.

### Verified completed
- Private R2 test bucket, scoped credentials saved only locally, no r2.dev/public domain. Main writes new assets to S3; old local MP4 remains available. Owner/admin-only image and video access, Range/HEAD/download, image MIME/size/quota reservation and per-site object scope are implemented.
- Encrypted database plus local/S3 file backups and portable independent-database restore verified. Main never overwritten; final genuine-data restore target laconic_local_restore_aud006_verified, paths in aud-006-results.json. Secret backup key remains in main env and must be escrowed separately. Source recovery does not include this data.
- Worker instance heartbeats and loop progress, public bounded /api/ready and private /zh/admin/runtime. Web plus text/video/payments Workers restored; all checks ready. Maintenance is dry-run by default and does not delete registered video results.
- Nine storage/recovery groups, four actual R2-backed private API groups, actual R2 probe, all nine retained business suites, six second-site isolation groups, desktop/mobile runtime UI, production guards and typecheck/build pass. No new model or payment/refund platform calls. Evidence: aud-006-results.json and linked records.
- Main remains 2 users, 5 tasks, 1 legacy asset, 3 orders, 3 refunds, admin 190 available/0 frozen/0 refund reserve, 13 migrations, 0 private-upload fixtures. Aurora Notes stays independent AUD-003/eight migrations/102 credits with its own DB/keys/files.

### Pending or needs review
- BILL-001: actual Stripe/Creem test checkout/refund, two paid periods and fixed public callbacks after HTTPS deployment. Both enabled flags remain false. Production-money R05 remains separate. Waffo authoritative-query/statement protocol and complete real-platform reconciliation remain unverified.
- Automatic offsite scheduled backup/retention, remote production DB/PITR, production failover, external alert delivery and process supervision remain deployment/operations follow-ups. Local-only encrypted backups do not protect against total machine loss. Original env and backup key must be retained separately.
- Accepted tools are summary and text-to-video. Unverified legacy image-model flows need an explicit private-image handoff before activation. Failed upload orphan cleanup and historic file lifecycle are not broad automatic deletion features.
- AUD-007 model/budget governance, AUD-008 full UI/SEO/production auth and AUD-009 CI/fixed deployment remain. Latest-template clean initialization and production disaster recovery still require separate acceptance.

### Blockers
None for completed local scope. External provider/account/HTTPS and production recovery gates await Owner-directed deployment work.

### Exact next action
Open http://localhost:3000/zh/admin/runtime with the existing local administrator and read parent AUD-006-STORAGE-RECOVERY-GUIDE.md. Keep BACKUP_ENCRYPTION_KEY independently in the Owner's password manager. Next recommended implementation is AUD-007; it is not started.
