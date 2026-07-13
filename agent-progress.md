# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `feature/sw/372-direct-deploy-three-stage` based on merged issue #371 (`450e7181`).
- Issue #372 is implemented and locally verified: revision-locked save/prepare, exactly three Direct Deployment stages, snapshot-bound approval/execute, and summary-first project UI.
- Migration `0036_deployment_prepared_revision.sql` applies successfully after migrations 0000-0035 on PostgreSQL 16.
- No cloud mutation or production database migration was performed.

## Session Record

### 2026-07-14 - Revision-locked three-stage Direct Deployment

- Added project-level `Ctrl+S`/`Command+S` save and `저장하고 배포`, with deployment preparation allowed only after the exact saved project draft revision is available.
- Added immutable preparation revision/hash evidence, transactional stale-revision rejection, approval snapshot sealing, and execute-time drift blocking.
- Reduced the operator flow to `검증 -> 승인 -> 배포`, retained legacy Apply compatibility, and moved raw target, snapshot, and history data behind details.
- Verification passed: deployment-focused API tests, Web 1,145/1,145, PostgreSQL migrations 0000-0036, migration compatibility, harness, lint, typecheck, and build.
- API passed 1,456/1,459; the only failures are three unchanged Windows symlink fixture setup errors (`EPERM`).

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

- Commit and push issue #372, open its Korean PR, wait at least five minutes, resolve review/CI feedback, and merge to `dev`.
- Then create or refresh the issue #373 branch from `dev` and continue the prioritized `docs/sw/plan2.md` milestones without changing the RAG recommendation scope.
