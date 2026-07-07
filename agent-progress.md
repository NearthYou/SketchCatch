# Agent Progress

This file is the short, English-only working log for the current agent context. Keep it concise.

## Current Verified State

Branch/worktree:

- Branch: `codex/github-installed-repo-discovery`
- Worktree: `C:\Users\siwon\Desktop\Jungle\Week17~21\SketchCatch-worktrees\aws-runtime-policy-deploy-fix`
- Base: latest `origin/dev`

Current branch work:

- Diagnosed that the GitHub repository chooser only used saved SketchCatch `sourceRepositories` rows.
- Added GitHub App installation discovery so repos authorized in GitHub App settings can appear before any SketchCatch connection row exists.
- Added an installed-repositories API returning GitHub App-accessible repositories plus a signed project state.
- Updated Deployment Panel to list installed GitHub App repositories first and directly connect a selected repo.
- Kept GitHub App install/permission expansion as the fallback path.

Verification:

- `pnpm harness:check`
- `pnpm --filter @sketchcatch/api exec tsx --test src/source-repositories/github-app-client.test.ts src/source-repositories/source-repository-service.test.ts src/routes/source-repositories.test.ts`
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/api.test.ts features/workspace/workspace-right-panel-layout.test.ts`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`

## Session Record

2026-07-07:

- Rebased the GitHub installed repository discovery fix onto latest `origin/dev`.
- Resolved the only rebase conflict in this progress file.
- Reran harness, focused tests, lint, typecheck, and build successfully.

Next steps:

- Push, open PR, merge after CI, and deploy production.
