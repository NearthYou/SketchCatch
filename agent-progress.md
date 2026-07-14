# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `feature/sw/377-durable-deployment-notifications` based on merged issue #376 (`0fc9a4ff`).
- Issues #371-#376 are merged after CI and review feedback resolution.
- Issue #377 durable deployment Inbox, authenticated SSE, and Web Push is implemented and locally verified.
- No Web Push provider call, cloud mutation, GitHub mutation, or production database migration was performed.

## Session Record

### 2026-07-14 - Durable deployment Inbox, SSE, and Web Push

- Added transaction-bound idempotent notifications/outbox for Direct and GitOps terminal events, persistent per-user read state, authenticated SSE, and 90-day retention.
- Added AES-256-GCM subscription storage, public-address-pinned outbound Push delivery, bounded retries, expired/permanent subscription disabling, and explicit browser permission/service worker registration.
- Removed browser-session polling notifications and added a global Inbox that remains available when Push is denied, unsupported, or unavailable.
- Verification passed: focused API/Web tests, PostgreSQL migrations 0000-0041 and terminal trigger integration, migration compatibility, Terraform tests, lint, typecheck, build, and harness.
- Full Web and other workspace tests passed. API passed 1,525/1,528; the only failures are the three unchanged Windows symlink fixture setup errors (`EPERM`).
- Sandbox browser Push delivery remains assigned to issue #378; no external mutation was attempted.

### 2026-07-14 - Repository-confirmed Static S3/CloudFront GitOps release

- Added Vite, Create React App, and Next.js export output detection with current-revision handoff gating, structured lockfile install presets, and complete S3/CloudFront target coordinates.
- Added deterministic static manifests, immutable versioned S3 prefixes, checksum and VersionId evidence, CloudFront OriginPath switching, invalidation tracking, HTTPS verification, and previous-pointer rollback.
- Added bounded masked evidence parsing and verified AWS S3/CloudFront re-query before shared release-ledger persistence.
- Moved branch and monitored paths to project settings; the CI/CD console now contains only Activity, Logs, Output, and refresh execution controls with runtime-neutral stage labels.
- Verification passed: focused API 107/107, source route 17/17, target state 10/10, CI/CD layout 103/103, workflow bash syntax, PostgreSQL migrations 0000-0040, migration compatibility, lint, typecheck, build, and harness.
- Full Web and other workspace tests passed. The API suite has only the three unchanged Windows symlink fixture setup errors (`EPERM`).
- Sandbox deployment, rollback, and cleanup evidence remain assigned to issue #378; no AWS mutation was attempted.

### 2026-07-14 - Repository-confirmed EC2/ASG CodeDeploy AllAtOnce GitOps release

- Added AppSpec-confirmed EC2/ASG target coordinates, deterministic versioned S3 ZIP publication, SHA-256 and VersionId evidence, and CodeDeploy Server deployment-group checks.
- Added AllAtOnce deployment with automatic deployment-failure rollback plus explicit previous-bundle restoration for partial instance or HTTPS health failure.
- Added bounded masked release evidence, CodeDeploy/S3/ASG server re-query, exact target/success/Healthy-InService instance-set verification, and shared release-ledger reconciliation.
- Verification passed: focused workflow/provider/reconciler 31/31, PostgreSQL migrations 0000-0039, migration compatibility, lint, typecheck, build, harness, and whitespace checks.
- Full Web and other workspace tests passed. The API suite has only the three unchanged Windows symlink fixture setup errors (`EPERM`).
- Sandbox deployment, rollback, and cleanup evidence remain assigned to issue #378; no AWS mutation was attempted.

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

- Complete issue #377 PR review and merge, then start issue #378 sandbox E2E only with explicit non-production credentials and cleanup approval.
