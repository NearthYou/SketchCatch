# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `test/sw/378-deployment-sandbox-e2e` with latest `origin/dev` (`847a8206`) merged.
- Issues #370-#377 and the current dev UI, diagram, and deployment updates are integrated.
- The sandbox preflight passed against AWS account `614935468487`, `ap-northeast-2`, a verified local API connection, and `NearthYou/sketchcatch-deployment-sandbox`.
- Direct Terraform runs labeled `infrastructure`, `application`, and `full_stack` each reached Apply success, healthy Output probes, and Destroyed; provider cleanup returned zero demo ASGs, ALBs, active EC2 instances, S3 buckets, and CloudWatch log groups.
- Full-stack traffic produced 12 accepted API requests, 12 CloudWatch log events, and a `traffic_requests` metric sum of 12.
- Full issue #378 acceptance is not verified: the earlier live Direct application/full-stack runs predate the new ApplicationRelease path, and GitOps cannot start without a GitHub App installation and credentials. The feature remains `in_progress`.
- The missing Direct release path is now implemented locally: application/full_stack prepare immutable CodeBuild artifacts, verify AWS runtime evidence, persist ApplicationRelease, and application-only cleanup restores an approved previous revision without Terraform state.
- Focused deployment/release integration passes 109 tests, Web target state passes 10 tests, and workspace lint, typecheck, and build pass.
- GitHub App `4294146` is installed only on `NearthYou/sketchcatch-deployment-sandbox` as installation `146476093`; its private key is stored outside the repository with restricted ACL.
- AWS CodeConnections `sketchcatch-sandbox-github` exists in `PENDING`. The GitHub `AWS Connector for GitHub` OAuth page renders its Authorize button disabled, so CodeBuild project creation and live release execution remain blocked.

## Session Record

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

## Next Action

- Complete the pending AWS Connector for GitHub authorization and verify the CodeConnections status is `AVAILABLE`.
- Create the prepared sandbox CodeBuild project, then run the new Direct ApplicationRelease path live.
- Run the GitOps runtime matrix, rollback drills, QR/notification checks, final cleanup, and strict report verification before opening the PR.
