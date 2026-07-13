# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `feature/sw/374-lambda-gitops-release` based on merged issue #373 (`6450d62d`).
- Issues #371-#373 are merged after CI and review feedback resolution.
- Issue #374 Lambda AllAtOnce GitOps release is verified and ready for PR review.
- No cloud mutation or production database migration was performed.

## Session Record

### 2026-07-14 - Repository-confirmed Lambda AllAtOnce GitOps release

- Added Lambda runtime coordinates, one-current-SAM evidence gating, and project settings for function, alias, CodeDeploy, Output URL, and health path.
- Added immutable SAM ZIP publication, digest-to-CodeSha256 verification, CodeDeployDefault.LambdaAllAtOnce alias promotion, automatic deployment rollback, and explicit health-failure alias restoration.
- Added bounded masked Lambda evidence parsing, AWS Lambda and CodeDeploy re-query verification, weighted-alias drift rejection, and shared release ledger reconciliation.
- Verification passed: focused API 100/100, target-state 8/8, migration compatibility, PostgreSQL migrations 0000-0038, harness, lint, typecheck, build, and whitespace checks.
- The full Web suite passed. The API suite passed 1,481/1,484; only the three unchanged Windows symlink fixture setup errors (`EPERM`) remain.
- Sandbox deployment, rollback, and cleanup evidence remain assigned to issue #378; no AWS mutation was attempted.

### 2026-07-14 - Repository-confirmed ECS/Fargate GitOps release

- Added confirmed ECS runtime coordinates and source-analysis Docker evidence gates to the single project deployment target.
- Added CodeBuild/ECR immutable digest publication, ECS all-at-once replacement with circuit-breaker rollback, and GitHub Actions build/publish/deploy/health stages.
- Added bounded masked release-evidence parsing, AWS ECS re-query verification, idempotent ApplicationRelease reconciliation, and release details in the CI/CD activity view.
- Verification passed: focused API 87/87, target-state 6/6, migration compatibility, harness, lint, typecheck, build, and whitespace checks.
- The full Web suite passed. The API suite passed 1,468/1,471; only the three unchanged Windows symlink fixture setup errors (`EPERM`) remain.
- Sandbox deployment, rollback, and cleanup evidence remain assigned to issue #378; no cloud mutation was attempted.

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

- Open the Korean issue #374 PR, wait at least five minutes, resolve review and CI feedback, and merge to `dev`.
- Start issue #375 from the updated `dev` branch after issue #374 merges.
