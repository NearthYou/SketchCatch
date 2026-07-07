# Agent Progress

This file is the short, English-only working log for the current agent context. Keep it concise.

## Current Verified State

Branch/worktree:

- Branch: `codex/github-existing-repo-first`
- Worktree: `C:\Users\siwon\Desktop\Jungle\Week17~21\SketchCatch-worktrees\aws-runtime-policy-deploy-fix`
- Base: latest `dev` imported through `codex/aws-runtime-policy-deploy-fix`

## Session Record

2026-07-07:

- Changed Deployment Panel GitHub connect behavior so it opens an in-app repository chooser first.
- Added a chooser action for known SketchCatch GitHub source repositories and kept GitHub App install/configure as the explicit add-permissions path.
- Added a selected-source-repository callback URL route so inactive previous GitHub connections can reopen repository selection.
- Added a GitHub callback page button for GitHub App install/permission expansion when the desired repository is missing.
- Addressed PR #227 review feedback: modal-local errors are visible, `sourceRepositoryId` route params require UUIDs, and route tests use UUID fixture IDs.

Verification:

- `pnpm harness:check`
- `pnpm --filter @sketchcatch/api exec tsx --test src/source-repositories/source-repository-service.test.ts src/routes/source-repositories.test.ts`
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-right-panel-layout.test.ts`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- Final `pnpm harness:check`

Next steps:

- Push the branch and open a PR into `dev`.
