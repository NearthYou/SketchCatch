# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Branch: `feature/sw/372-direct-deploy-three-stage`; issue #372 is implemented and locally verified.
- Project save and deployment preparation are locked to one exact draft revision and snapshot hash.
- Direct Deployment exposes exactly `validation`, `approval`, and `deployment`; Apply and Destroy use the same external stages.
- Approval seals the prepared snapshot hash, and execute rejects missing or changed snapshot evidence.

## Verification

- Deployment-focused API tests and Web 1,145/1,145 passed.
- PostgreSQL 16 applied migrations 0000-0036 with `ON_ERROR_STOP=1`; migration compatibility passed.
- Harness, lint, typecheck, and build passed through `scripts/init-harness.ps1 -Full` on 2026-07-14.
- API passed 1,456/1,459; the only failures are three unchanged Windows symlink fixture setup errors (`EPERM`).

## Changes This Session

- Added revision-locked deployment preparation, snapshot-bound approval/execute guards, project save hotkeys, and the three-stage Direct Deployment UI.
- Updated shared contracts, migration/schema, API/Web tests, deployment documentation, and harness evidence.

## Broken Or Unverified

- Three unrelated filesystem security tests require Windows symlink privileges unavailable on this machine.
- No Terraform Apply/Destroy, cloud mutation, deployment mutation, or production database migration was performed.

## Best Next Action

- Commit/push issue #372, open its Korean PR, wait five minutes, resolve review/CI feedback, and merge to `dev`.
- Continue issue #373 from refreshed `dev` according to `docs/sw/spec2.md`, `docs/sw/plan2.md`, and `docs/sw/agents2.md`.
