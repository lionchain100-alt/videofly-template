# Project Tasks

Last reconciled: 2026-11-01

## Control rules

- Stable IDs follow the V1.2 audit; checked means implementation and evidence are recorded.
- WIP limit: one active work package. Production activation is outside AUD-002.

## Active milestone

Milestone: Preserve the local V1.2 baseline while upgrading security dependencies.
Active task: IDLE-000

Definition of Ready: AUD-001 verified; recoverable source baseline exists; upgrade is authorized by the Owner.
Definition of Done: recoverable before/after artifacts, compatible dependencies, reviewed remaining advisories, frozen install, typecheck/build and retained-capability regression, synchronized records.

## Backlog

- [ ] IDLE-000 No active implementation; await the Owner's next requested work. Depends on: None. Acceptance: scheduling marker only, not an unfinished AUD-002 deliverable or permission request.

- [x] AUD-001 Restore admin overview and verify summary/video statistics. Depends on: None. Acceptance: `scripts/test-admin-dashboard.ts` and parent `ADMIN-OVERVIEW-REGRESSION.md`.
- [x] AUD-002 Establish recovery points and upgrade dependencies without changing current capabilities. Depends on: AUD-001. Acceptance: six integration/API suites, browser/production isolation, frozen install/typecheck/build, audit and recovery; evidence `docs/project-state/aud-002-results.json` and parent `AUD-002-SECURITY-UPGRADE.md`.
- [ ] AUD-003 Unify site configuration and rehearse a second independent site. Depends on: AUD-002. Acceptance: parent V1.2 audit; not started by this task.

## Blocked / decision-needed register

No external blocker for local AUD-002. Production OAuth/email, Stripe/Creem channel acceptance and production deployment remain separate unverified scopes.
