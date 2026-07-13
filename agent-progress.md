# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `feature/sw/371-project-deployment-release-ledger` based on merged issue #370 (`5160a377`).
- Issue #371 is implemented and locally verified: one project target, structured build evidence, shared Direct/GitOps release ledger, and common History UI.
- Migration `0035_project_release_ledger.sql` applies successfully after migrations 0000-0034 on PostgreSQL 16.
- No cloud mutation or production database migration was performed.

## Session Record

### 2026-07-14 - Project deployment target and release ledger

- Added provider-neutral runtime/scope/source contracts, one target row per project, and a shared application release ledger with version, commit, digest, provider revision, health, rollback, and Output URL evidence.
- Added authenticated target/release APIs, verified connection ownership and region checks, safe structured build presets, secret-like evidence rejection, legacy Deployment adapters, and migration backfill.
- Added project target settings and a Direct/GitOps release History view.
- Verification passed: #371 API focus 63/63, Web 1,138/1,138, PostgreSQL migrations 0000-0035, migration compatibility, lint, typecheck, and build.
- API full suite passed 1,443/1,448 before two fixture expectations were updated; those two now pass in the focused suite. The remaining three failures are unchanged Windows symlink fixture `EPERM` setup failures.

### 2026-07-14 - Integrate latest dev into issue #370

- Merged `origin/dev` at `186ff261`; only this progress file required manual resolution.
- Preserved the active Live Observation workstream while carrying forward dev's Template Portal, Board thumbnail, storage, cost, and shared UI changes.
- Post-merge verification passed: Live Observation API 171/171 and Web 63/63, Web full 1,135/1,135, Redis 29/29, harness, lint, typecheck, build, and whitespace checks.
- API passed 1,428/1,431; the only failures occur before product code because Windows Developer Mode is disabled and three new dev-side security fixtures cannot create symlinks (`EPERM`).

### 2026-07-14 - Live Observation v2 production path

- Added the provider-neutral observation snapshot, atomic Store, capability-scoped public collector, server-side AWS evidence refresh, and operator/audience UI.
- Bound evidence to the selected Deployment and exact Target Group period, validated coherent runtime ownership, and masked credentials and sensitive headers.
- Removed the unused v1 routes/services/providers and demo-only presenter traffic-boost Store contract.
- Pre-merge verification passed: API full suite, Web 1,069/1,069, Redis 8 integration 29/29, harness, lint, typecheck, build, and whitespace checks.
- External acceptance remains unverified: the in-app browser blocks localhost, Chrome launch was not approved, and AWS STS is unavailable. No cloud mutation was attempted.

## Next Action

- Commit and push issue #371, open its Korean PR, wait at least five minutes, resolve review/CI feedback, and merge to `dev`.
- Then create or refresh the issue #372 branch from `dev` and reduce Direct Deployment to the specified three-stage Save/Deploy flow.
