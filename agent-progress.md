# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `test/sw/378-deployment-sandbox-e2e`; issue #378 remains `in_progress` because the complete four-runtime matrix and service-side GitOps persistence did not pass.
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

### 2026-07-14 - Complete Web UI clarity and accessibility improvements

- Clarified landing and authentication actions, added accessible password and legal-dialog interactions, and unified signup readiness and availability behavior.
- Raised user-facing Web text to at least 12px, strengthened muted text contrast, and added a recursive CSS regression test that covers pixel, decimal, relative, `calc`, and `clamp` values with documented shape-exception rules.
- Cancelled availability checks as soon as username or email input changes, and announced graphical overflow counts through the Live Observation map label.
- Verified public, dashboard, workspace entry, Architecture Board, Terraform, Reverse Engineering, and Template surfaces at 1440x900 and 390x844 with a local QA account that has no AWS, GitHub, or deployment privileges.
- Verification: Web tests passed 1,205/1,205 outside the restricted runner after its `spawn EPERM`; `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm harness:check`, and `git diff --check` passed.
- Risk: authenticated visual QA used fixture and disconnected states only; no cloud, deployment, Git handoff, or database mutation was performed.

### 2026-07-14 - Localize dashboard navigation and remove redundant overview copy

- Renamed the dashboard navigation to the requested Korean labels and reduced the top bar to the localized page title.
- Removed redundant overview eyebrows, explanatory filler, metric details, and empty project-description placeholders while preserving operational status data.
- Verified the authenticated dashboard at 1440x900 and 390x844 with no horizontal overflow, clipping, or unintended navigation wrapping.
- Verification: 10 focused dashboard tests, Web tests 1,207/1,207, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm harness:check`, and `git diff --check` passed.
- Risk: visual QA used a new local account with no projects or external connections; populated overview behavior is covered by focused source and data tests.

## Next Action

- Preserve the verified zero-resource cleanup result; recreate sandbox control-plane resources only for a new approved run.
- Fix GitOps run-to-handoff correlation so a workflow-fix commit can still persist CI logs and release history without accepting unrelated runs.
- Provision dedicated Static, Lambda, and EC2/ASG project targets before rerunning the remaining matrix; add a real custom domain/ACM/Route53 target before QR verification.
