# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- `codex/fix-live-observation-redis-readiness` connects the current ECS API/worker security groups to the external Runtime Cache security group on Redis port only and fails plans closed when the connection is required but missing.
- PR #423 is open. Review-only run `29385936278` passed with `2 add, 0 change, 0 destroy`; complete runtime run `29385795235` contains unrelated drift and must not be used for the incident repair.
- Static and Terraform plan regressions, harness, lint, typecheck, and build pass; no production mutation has occurred.
- Production Git/CI/CD handoff request `req-c2` failed before GitHub mutation because project `0bdf56aa-68b7-4382-b37f-31d8996136c1` has no confirmed project deployment target; the GitHub repository has no stale SketchCatch branch or PR.
- The approved Terraform apply plan is current, but Git/CI/CD must remain blocked until the user saves a verified project deployment target and a real external HTTPS output URL.
- Direct ECS evidence from the prior run remains valid, including persisted release/history/notifications and CloudWatch metrics.
- ECS GitOps Infra run `29334708442` and App run `29334822683` succeeded for SHA `3a12e55c13e7be1a769cfbe920b112516d8c14ce`, digest `20ec77dba90b910f1a37fd1f9194b0ff4829f789d6548abf3b21262df04632e1`, and task definition revision 7.
- Project refresh returns `stale=false`; all seven CI stages succeeded, 1,161 masked logs persisted, and release/history includes the matching SHA, digest, revision, URL, and healthy 1/1 ECS evidence.
- The AWS Connection external ID was rotated and the old value was rejected. Destroy run `29337235499` removed the sandbox stack and manual cleanup removed GitOps task definitions and the task role.
- Direct resource queries are zero. Three deleted ECS ARNs remain only in the eventually consistent Resource Groups tag index.

## Verification

- Focused Git/CI/CD regressions pass: API 2/2 and Web 15/15. Repository-wide lint, typecheck, and build pass.
- Full `pnpm test` still fails only on the known three pre-existing three-tier Template layout/parent contract assertions in `packages/types`.
- After merging `origin/dev` at `f16a4546` and resolving PR feedback, current code verification passes 25 sandbox orchestration tests, 88 maintained API deployment tests, 40 maintained Web deployment tests, harness, lint, typecheck, build, and diff checks.
- Local API/proxy/Redis/certificate/TLS/log/fixture-clone cleanup is complete. Read-only AWS checks show zero Issue #378 ECR, CodeBuild, and S3 resources.
- The latest `dev` test policy is preserved: 52 essential protection files remain and removed feature-specific suites were not reintroduced.

## Changes This Session

- Added CI/CD deployment-target preflight and a direct project-settings recovery link before any PR-creation POST.
- Replaced the misleading generic duplicate-information conflict with neutral state-conflict guidance and mapped stable target/output URL preconditions to actionable Korean messages.
- Added stable `PROJECT_DEPLOYMENT_TARGET_REQUIRED` API signaling and regression coverage.
- Completed the code-side acceptance runner as a fail-closed three-stage orchestration contract with exact Direct/GitOps matrices, cleanup-on-failure, event hooks, and verification-gated success.
- Added standalone SAM/CodeDeploy application-unit detection, application-local Static lockfile selection, and source-root npm/yarn installs in generated workflows.
- Reconnected the private fixture repository after its GitHub App installation changed and confirmed Static/Lambda/EC2 evidence at fixture commit `97c98d2640d7af3af79bfcb10f4bd3780addb02d`.
- Reopened Issue #378, passed the live sandbox preflight, and restored the execution-role trust to the current encrypted AWS Connection external ID.
- Added persisted Web Push provider status evidence and runtime-aware GitOps artifact cleanup with migration and focused regression coverage.
- Hardened GitHub run selection/log hydration and nullable handoff persistence.
- Added S3 backend enforcement and real ECS immediate replacement/rollback behavior.
- Fixed stale aggregation and stage mapping, then persisted final ECS GitOps evidence through the normal API.

## Broken Or Unverified

- Production Live Observation still returns `503 LIVE_OBSERVATION_COLLECTOR_UNAVAILABLE` until the approved Runtime Cache ingress plan is applied and the public bootstrap returns the expected not-found response.
- Static/Lambda/EC2-ASG execution, rollback drills, QR public session, and Web Push provider delivery remain unverified.
- Full API tests include pre-existing Windows symlink EPERM and AI diagram expectation failures; do not report the full suite as passing.

## Best Next Action

- After separate apply approval, apply only the two targets reviewed in run `29385936278`, then verify `404 LIVE_OBSERVATION_COLLECTOR_NOT_FOUND` for a nonexistent observation UUID and run a refresh-only plan.
- Save the project's verified deployment target and real external HTTPS output URL in project settings before retrying CI/CD PR creation.
- Merge the code-completion PR after focused CI and review.
- Keep Issue #378 open for a separately approved real-environment acceptance run covering Static, Lambda, EC2/ASG, rollback, QR/CloudWatch, and Web Push.
