# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `fix/ck/270-delete-project-bug-fix`.
- Base: latest `origin/dev` has been merged into this branch.
- GitHub issue: #270, project deletion and AWS connection follow-up fixes.
- Scope: fix project deletion blockers after SSO/deployment history, add destroy-failure fallback behavior, clarify AWS connection deletion/verification errors, keep AI chat aware of unconfigured diagram resources, and preserve the compact harness state-file structure from `dev`.

## Session Record

2026-07-09:

- Merged latest `origin/dev`, including the harness state-file trim that archives older progress history under `docs/agent-history/`.
- Fixed project deletion order so Git/CI/CD handoff references are removed before project assets and architectures.
- Fixed verified-email OAuth linking so trusted Naver SSO profiles can attach to the existing active user instead of splitting ownership.
- Added a project deletion fallback that allows project metadata deletion after resource-included Terraform destroy planning/execution cannot proceed.
- Clarified AWS connection deletion conflicts when deployment history still references an AWS connection.
- Removed blocking local DB AWS connection/deployment records for user `herry612` at the user's request; this was metadata cleanup only and did not mutate AWS resources.
- Improved AWS Role verification diagnostics so STS `AccessDenied` is reported as an AssumeRole permission problem instead of a generic connection-test failure.
- Fixed AI board conversion so visible DiagramJson resource nodes without saved parameter values still count as architecture resources instead of making the AI chat behave like the board is empty.
- Addressed PR #274 review feedback: guarded destroy warning acknowledgement when `warnings` is missing, made API fallback Terraform names use `node.id` when non-ASCII labels normalize to `resource`, and deleted Git/CI/CD handoffs before deployment rows.

Verification:

- `pnpm harness:check` - passed before the #270 code changes.
- `pnpm --filter @sketchcatch/api exec tsx --test src/projects/project-deletion-service.test.ts` - passed after the project deletion fix.
- `pnpm --filter @sketchcatch/api exec tsx --test src/auth/oauth-users.test.ts src/routes/oauth.test.ts` - passed after the SSO account-linking fix.
- `pnpm --filter @sketchcatch/web exec tsx --test features/projects/project-delete-flow.test.ts` - passed after the destroy fallback UI/helper changes.
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/api-client-error-message.test.ts` - passed after AWS connection message updates.
- `pnpm --filter @sketchcatch/api exec tsx --test src/aws-connections/aws-connection-test-service.test.ts` - failed before the AssumeRole mapper change, then passed.
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-ai-panel-state.test.ts` - failed before the unconfigured resource conversion fix, then passed.
- `pnpm --filter @sketchcatch/api exec tsx --test src/services/diagram-to-architecture.test.ts` - passed after aligning API conversion behavior.
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-ai-diagram-adapter.test.ts` - passed after the conversion change.
- `pnpm --filter @sketchcatch/api exec tsx --test src/projects/project-deletion-service.test.ts src/services/diagram-to-architecture.test.ts` - passed after PR #274 review fixes.
- `pnpm --filter @sketchcatch/web exec tsx --test features/projects/project-delete-flow.test.ts` - passed after PR #274 review fixes.
- `pnpm lint` - passed.
- `pnpm typecheck` - passed.
- `pnpm build` - passed.
- `pnpm harness:check` - passed before merging latest `origin/dev`.

Known risks:

- No real AWS IAM, IAM Identity Center, CloudFormation, Terraform apply, or Terraform destroy mutation was performed.
- The user still needs to apply caller-side `sts:AssumeRole` permission in AWS IAM Identity Center and confirm the target Role Trust Policy/External ID.
