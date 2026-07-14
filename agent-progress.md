# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `codex/ecs-deployment-speed`; the focused optimization commits are pushed to `origin/codex/ecs-deployment-speed`.
- Production ECS workflow run `29333857003` succeeded in 6m09s. Warm API/web build-push completed in 7s/6s, ECS stabilization in 3m13s/2m56s, and all public health endpoints returned 200.
- The measured API/web digests are `sha256:f9726dbead5597539a6501d709bd762890fbd3ba68c8fa551e2eee304800ee4c` and `sha256:383a249b11f9e8d5548a3c3daa82c976a24dd1f6b36a2fc42cb408c7f92d9997`.
- Read-only production runtime plan `29334381609` passed and reported no infrastructure changes, so the production state already matches the committed ECS/ALB timing values.
- Focused API tests, generator tests, Terraform tests, infrastructure checks, smoke preflight, lint, typecheck, build, and harness pass. The full workspace test attempt timed out after 15 minutes; no changed-path failure was observed.
- Issue #378 remains independently `in_progress`; this branch does not change or claim its unfinished four-runtime matrix.
- Previous verified sandbox evidence remains recorded below for that separate workstream.
- Direct ECS infrastructure deployment `3f2e03ec-8b5c-46e3-af74-43d4e21c368e` created 19 resources and Direct application deployment `13f0f6c2-1890-46ce-8044-be754c810b5f` persisted release `5fcb826c-4bb4-45c8-8f59-3bae9790a82e`.
- Direct evidence matched commit `9c4251baf058a8e0a6513236068d819fecfcdfd5`, ECR digest `3152546fc2cd37ce929dd63b20b161cae58124921fc27e7028a514db2f52a81e`, ECS task definition revision 2, and HTTPS health 200.
- The API returned five project deployments, 808 infrastructure logs, 17 application logs, and five persisted notifications. CloudWatch returned real ECS CPU metrics. Web Push delivery was not claimed because no browser subscription existed.
- Live Observation QR/session creation correctly returned 409 because the approved Terraform lacked the required custom hostname, ACM certificate, Route53 record, HTTPS ALB listener, and traffic outputs.
- GitHub handoff `843323c9-c437-4727-b586-5801b1771f6e` created sandbox PR #1. GitHub Actions run `29324643997` attempt 2 succeeded against merge SHA `8ac5cf93495942a6e88265b848168c75e0da1740`, ECR digest `0e9fd2191ae781549b72389d89249c0eb3da9e9156632b137c9724448e043a4c`, ECS task definition revision 3, and HTTPS health 200.
- GitOps service persistence did not pass: project pipeline refresh returned `stale=true` with no persisted runs because the successful manual run used the later workflow-fix merge SHA, while the handoff retained the cancelled initial infra run.
- Static, Lambda, and EC2/ASG GitOps were not started within the hard deadline; their required project targets and runtime infrastructure were absent.
- Application cleanup failed closed because the active GitOps revision 3 no longer matched the Direct release cleanup manifest's revision 2. Infrastructure destroy reached `DESTROYED`; CodeBuild, ECR, CloudWatch log groups, test S3 buckets and versions, CodeConnection, ALB/target groups, ECS cluster/task definitions, CloudFront, temporary OIDC, and the temporary operator policy all verify at zero.
- Focused changed-path tests pass 89/89 plus workflow tests 9/9. Workspace lint, typecheck, and build pass; the full API suite retains known unrelated failures and one now-corrected deployment-plan expectation.

## Session Record

### 2026-07-14 - Production ECS deployment speed optimization

- Parallelized API/web image jobs, added ECR registry cache, digest-only releases, pre-deploy stability evidence, and per-phase timing.
- Reduced Docker build contexts with filtered workspace installs and added the same remote-cache behavior to generated ECS/Fargate CodeBuild workflows.
- Tuned and verified ALB/ECS health timing without weakening minimum healthy percent or circuit-breaker rollback.
- Completed one real production release and post-deploy health smoke; the total improved from the 7m51s baseline to 6m09s, while the 5m30s stretch target remains unmet.

### 2026-07-14 - Real Direct ECS and bounded GitOps validation

- Completed a real Direct ECS infrastructure/app release with immutable commit, digest, task revision, persisted API logs/history/notifications, CloudWatch metrics, and repeated HTTPS 200 evidence.
- Fixed practice-profile ECS resource admission, minimal CodeBuild permissions, Bash buildspec execution, and invalid GitHub expression quoting with focused regression tests.
- Created and merged real sandbox GitOps PRs, applied repository variables and verified GitHub OIDC trust, and completed one real ECS GitHub Actions deployment.
- Preserved fail-closed behavior for QR, CI persistence, and cleanup mismatches instead of marking partial evidence as complete.

### 2026-07-14 - Integrate latest dev for sandbox continuation

- Merged `origin/dev` at `847a8206` into the Issue #378 worktree and preserved the sandbox recovery behavior.
- Resolved only `agent-progress.md` and `session-handoff.md`; current Issue #378 evidence remains the active state and unrelated dev session records remain archived.
- Focused merged-path verification passed: 30 API deployment/AWS connection tests and 23 Web deployment action tests.

### 2026-07-14 - Live sandbox Direct execution and recovery hardening

- Fixed invalid StepScaling `cooldown`, preserved cleanup-capable apply/destroy failure stages after destroy-plan errors, and added one bounded re-login retry for long-running smoke requests.
- Added explicit scope evidence and a 10-second sandbox target-group deregistration delay; focused tests and Terraform safety validation pass.
- Recovered and destroyed a partial failed apply, then completed all three labeled Direct runs and verified provider cleanup.
- Did not claim application release acceptance: `application_releases` remained empty after successful application/full-stack Terraform runs.
- GitOps four-runtime, rollback, QR session, Web Push provider delivery, and final combined report remain blocked on an installed GitHub App and on the missing Direct application release execution path.

### 2026-07-14 - Project deployment sandbox E2E gate

- Added a fail-closed CLI that compares local AWS STS identity with the approved account and the sandbox API's live verified AWS Connection account/region.
- Denied production AWS/API/GitHub targets and required explicit mutation approval, cleanup ownership, and a positive budget.
- Added strict evidence correlation for Direct three-scope and GitOps four-runtime completion, CI/release/Output identity, per-runtime rollback, QR/CloudWatch, Inbox/Web Push, Destroy, and ECR/S3/CodeBuild/CloudWatch cleanup.
- Verification passed 18 focused tests, lint, typecheck, build, and harness. Live preflight later passed with the approved sandbox configuration.

### 2026-07-14 - Merge latest dev into the Brainboard AWS Template branch

- Merged `origin/dev` at `e322afd2` into `feature/gg/381-brainboard-aws-templates` before PR completion without dropping either workstream.
- Preserved the branch's 24 Brainboard source fixtures, source-exact Board geometry, Terraform authority and refresh rules, repository Template ID boundary, Template start flow, Project Board thumbnails, Dashboard card improvements, and Workspace navigation fixes.
- Preserved dev's Repository AI, deployment/release, Live Observation, notification, authentication, and sandbox E2E updates.
- Verification passed: `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm migration:compatibility:check`, 114 focused API tests, 1,266 Web tests, 60 Brainboard type/source-contract tests, 37 capture tests, and `git diff --check`.
- Known environment limit: `pnpm catalog:check` and `pnpm templates:validate` cannot run Terraform because this machine has no Terraform executable (`spawn terraform ENOENT`). No Terraform Apply, Destroy, or AWS mutation was performed.
- Final build result: `pnpm build` stops before Web compilation because the ignored `apps/web/.codegraph` symlink targets a missing user-local path. Type/API/UI builds started successfully; this is the documented pre-existing local blocker.
- Applied both PR #393 Workspace Template color-token reviews after merging `origin/dev` at `e322afd2`; harness, lint, typecheck, 14 focused Web tests, and diff checks pass.
- Next: commit and push, resolve both review threads, wait for CI, and merge PR #393.

## Next Action

- Open and babysit the `codex/ecs-deployment-speed` PR against `dev`, address CI/review feedback, and merge only after GitHub reports it ready.
- No production Terraform apply is required for this change set.
- If pursuing the 5m30s stretch target, profile the 1m28s validation job and 3m13s API service stabilization before changing safety thresholds.
- Continue issue #378 only on its dedicated branch; do not mix its sandbox matrix work into this release optimization branch.
