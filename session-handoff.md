# Session Handoff

Use this file only for compact continuation context. Write it in English. Keep old history out unless it is required for the next session.

## Currently Verified

Current branch:

- `codex/aws-runtime-policy-deploy-fix`

Current worktree:

- `C:\Users\siwon\Desktop\Jungle\Week17~21\SketchCatch-worktrees\aws-runtime-policy-deploy-fix`

## Changes This Session

- Added `Apply EC2 runtime IAM policy` to the production deploy workflow.
- Added bounded IAM permission documentation for the GitHub deployment role.
- Added `scripts/deploy-runtime-iam-policy.test.mjs`.
- Compressed `agent-progress.md` and `session-handoff.md`.
- Updated `AGENTS.md` and `scripts/check-harness.mjs` so these files stay concise and English-only.

## Broken Or Unverified

Latest user issue:

- Stack creation succeeds from the AWS connection Quick Create flow.
- Account ID verification fails with HTTP 400 from `verify-created-role`.

Most likely root cause:

- Production `SketchCatch-EC2-Role` has not been updated with the new runtime policy that allows `sts:AssumeRole` on `SketchCatchTerraformExecutionRole-*`.
- The app code was deployed, but the production workflow did not apply `infra/aws/iam/ec2-runtime-policy.json` to the real EC2 runtime role.

Verification already run:

- `node --test scripts/deploy-runtime-iam-policy.test.mjs`
- `pnpm harness:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `git diff --check`

## Best Next Action

Operational next step:

- Merge the PR and run `Deploy Production`.
- If the deploy workflow fails with `AccessDenied` during `Apply EC2 runtime IAM policy`, manually grant the real `GitHubActionsDeployRole` the documented `AllowSketchCatchRuntimePolicyUpdate` permission and rerun deploy.
- Once deploy succeeds, retry the same AWS Account ID verification in SketchCatch.
