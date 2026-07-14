# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Direct infrastructure/app live deployment passed with exact commit, ECR digest, ECS task revision, persisted logs/release/history/notifications, CloudWatch metrics, and HTTPS 200 evidence.
- GitHub Actions ECS deployment passed on run `29324643997` attempt 2 with merge SHA `8ac5cf93495942a6e88265b848168c75e0da1740`, digest `0e9fd2191ae781549b72389d89249c0eb3da9e9156632b137c9724448e043a4c`, and task definition revision 3.
- GitOps API persistence remains broken: refresh returned stale with no runs and retained the cancelled initial infra run because the successful app run belonged to the later workflow-fix merge.
- QR remains correctly blocked by the missing custom-domain/ACM/Route53 traffic contract. Web Push provider delivery was not claimed without a browser subscription.
- Static, Lambda, and EC2/ASG runtimes were not started. Infrastructure reached `DESTROYED`, and all issue-scoped runtime/control-plane resource queries returned zero, including three deleted ECS task definitions.

## Verification

- Focused changed-path tests pass 89/89 and GitOps workflow tests pass 9/9.
- Workspace lint, typecheck, and build pass after the latest fixes.
- Run the final harness check after cleanup and documentation updates.

## Changes This Session

- Added the practice-profile ECS resource subset and least-privilege Direct CodeBuild permissions.
- Forced Direct and GitOps CodeBuild buildspecs to Bash and corrected GitHub expression string quoting for all four runtime workflows.
- Executed real Direct and ECS GitOps paths and recorded exact partial-completion blockers.

## Broken Or Unverified

- Application cleanup failed closed because active GitOps task definition revision 3 did not equal the Direct cleanup manifest's revision 2.
- GitOps CI log/release persistence, Static/Lambda/EC2-ASG execution, rollback drills, QR public session, and Web Push provider delivery remain unverified.
- Full API tests include pre-existing Windows symlink EPERM and AI diagram expectation failures; do not report the full suite as passing.

## Best Next Action

- Keep the completed cleanup intact and recreate only the resources required by a new approved sandbox run.
- Repair GitOps run correlation and persist the successful ECS run through the normal API before claiming ECS GitOps complete.
- Provision separate project targets for Static, Lambda, and EC2/ASG, then rerun the remaining matrix and rollback tests.
