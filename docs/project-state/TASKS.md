# Project Tasks

Last reconciled: 2026-11-01

## Control rules

- Stable IDs follow the V1.2 audit; checked means implementation and evidence are recorded.
- WIP limit: one active work package. Production activation remains outside these local audit tasks.

## Active milestone

Milestone: Reusable local V1.2 template with canonical site configuration and an independent second instance.
Active task: IDLE-000

Definition of Ready: AUD-002 accepted; Owner authorized AUD-003 configuration and reuse rehearsal.
Definition of Done: single site manifest; consistent UI/API tool policy; independent second-site database, credentials, sessions, credits and files; cross-site UI import; six retained suites, both builds and production isolation; usage guide and synchronized evidence.

## Backlog

- [ ] IDLE-000 No active implementation; await the Owner's next requested work. Depends on: None. Acceptance: scheduling marker only, not an unfinished audit deliverable or permission request.

- [x] AUD-001 Restore admin overview and verify summary/video statistics. Depends on: None. Acceptance: `scripts/test-admin-dashboard.ts` and parent `ADMIN-OVERVIEW-REGRESSION.md`.
- [x] AUD-002 Establish recovery points and upgrade dependencies without changing current capabilities. Depends on: AUD-001. Acceptance: six integration/API suites, browser/production isolation, frozen install/typecheck/build, audit and recovery; evidence `docs/project-state/aud-002-results.json` and parent `AUD-002-SECURITY-UPGRADE.md`.
- [x] AUD-003 Unify site configuration and rehearse a second independent site. Depends on: AUD-002. Acceptance: `docs/project-state/aud-003-results.json`, four detailed QA records and parent `AUD-003-SITE-REUSE-GUIDE.md`.

## Blocked / decision-needed register

No external blocker for completed local AUD-003. Production OAuth/email, Stripe/Creem channel acceptance and production deployment remain separate unverified scopes.
