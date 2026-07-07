# Agent Progress

This file is the short, English-only working log for the current agent context. Keep it concise. Do not append long historical transcripts.

## Current Verified State

Branch/worktree:

- Branch: `codex/aws-runtime-policy-deploy-fix`
- Worktree: `C:\Users\siwon\Desktop\Jungle\Week17~21\SketchCatch-worktrees\aws-runtime-policy-deploy-fix`
- Base: `origin/dev` after PR #221 was merged

User-reported issue:

- AWS CloudFormation Quick Create Stack now creates successfully.
- AWS Account ID verification still fails with HTTP 400 at `POST /api/aws/connections/:connectionId/verify-created-role`.

Diagnosis:

- PR #221 changed new user-account IAM Roles to `SketchCatchTerraformExecutionRole-<connection-prefix>`.
- The production Docker deploy updated the app containers, but the deploy workflow did not apply `infra/aws/iam/ec2-runtime-policy.json` to the real `SketchCatch-EC2-Role`.
- Therefore production can create the new Role, then fail STS `AssumeRole` during verification because the runtime role may still only allow the legacy fixed Role ARN.

Implemented in this branch:

- Added `Apply EC2 runtime IAM policy` to `.github/workflows/deploy.yml`.
- The deploy now runs `aws iam put-role-policy` for `SketchCatch-EC2-Role` before the Docker release deploy.
- Added a bounded deploy-role permission entry in `infra/aws/iam/github-actions-deploy-policy.json` for `iam:GetRole`, `iam:GetRolePolicy`, and `iam:PutRolePolicy` on `SketchCatch-EC2-Role`.
- Added `scripts/deploy-runtime-iam-policy.test.mjs` to catch missing runtime policy application.
- Documented the deploy-time runtime IAM policy application in `docs/deployment.md`.
- Compressed `agent-progress.md` and `session-handoff.md` into short English-only files.
- Updated `AGENTS.md` so future entries in those two files must be English.

Verification so far:

- `node --test scripts/deploy-runtime-iam-policy.test.mjs` failed before the workflow fix, then passed with 3 tests.
- `pnpm harness:check` passed.
- `pnpm lint` passed.
- `pnpm typecheck` passed.
- `pnpm build` passed.
- `git diff --check` passed with line-ending warnings only.

## Session Record

2026-07-07:

- Diagnosed the AWS Account ID verification 400 after successful Quick Create Stack creation.
- Added deploy-time runtime IAM policy application.
- Compressed `agent-progress.md` and `session-handoff.md` to English-only summaries.
- Updated `AGENTS.md` and `scripts/check-harness.mjs` so future state files stay concise and English.

Next steps:

- Re-run `pnpm harness:check` after the log compression.
- Commit, push, and open a PR.
- After merge, run `Deploy Production`.
- If deploy fails at `Apply EC2 runtime IAM policy` with `AccessDenied`, update the real `GitHubActionsDeployRole` once with the documented `AllowSketchCatchRuntimePolicyUpdate` permission, then rerun deploy.
- After deploy succeeds, retry AWS Account ID verification in SketchCatch.
