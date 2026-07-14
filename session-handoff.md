# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Direct ECS evidence from the prior run remains valid, including persisted release/history/notifications and CloudWatch metrics.
- ECS GitOps Infra run `29334708442` and App run `29334822683` succeeded for SHA `3a12e55c13e7be1a769cfbe920b112516d8c14ce`, digest `20ec77dba90b910f1a37fd1f9194b0ff4829f789d6548abf3b21262df04632e1`, and task definition revision 7.
- Project refresh returns `stale=false`; all seven CI stages succeeded, 1,161 masked logs persisted, and release/history includes the matching SHA, digest, revision, URL, and healthy 1/1 ECS evidence.
- The AWS Connection external ID was rotated and the old value was rejected. Destroy run `29337235499` removed the sandbox stack and manual cleanup removed GitOps task definitions and the task role.
- Direct resource queries are zero. Three deleted ECS ARNs remain only in the eventually consistent Resource Groups tag index.

## Verification

- After fast-forwarding to `origin/dev` at `2fe0296a`, 76 focused GitHub client/provider/persistence/workflow tests pass, including red-green coverage for historical stale handling and actual-job stage precedence.
- `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` pass.

## Changes This Session

- Reopened Issue #378, passed the live sandbox preflight, and restored the execution-role trust to the current encrypted AWS Connection external ID.
- Added persisted Web Push provider status evidence and runtime-aware GitOps artifact cleanup with migration and focused regression coverage.
- Hardened GitHub run selection/log hydration and nullable handoff persistence.
- Added S3 backend enforcement and real ECS immediate replacement/rollback behavior.
- Fixed stale aggregation and stage mapping, then persisted final ECS GitOps evidence through the normal API.

## Broken Or Unverified

- Static/Lambda/EC2-ASG execution, rollback drills, QR public session, and Web Push provider delivery remain unverified.
- Full API tests include pre-existing Windows symlink EPERM and AI diagram expectation failures; do not report the full suite as passing.

## Best Next Action

- Keep the completed cleanup intact and recreate only the resources required by a new approved sandbox run.
- Provision separate project targets for Static, Lambda, and EC2/ASG, then rerun the remaining matrix and rollback tests.
