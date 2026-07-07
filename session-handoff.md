# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Branch: `codex/github-installed-repo-discovery`
- Worktree: `C:\Users\siwon\Desktop\Jungle\Week17~21\SketchCatch-worktrees\aws-runtime-policy-deploy-fix`
- GitHub chooser now loads repositories from live GitHub App installations, not only saved SketchCatch rows.
- Local checks pass on latest `origin/dev`.

## Changes This Session

- Added GitHub App installation listing to `GitHubAppClient`.
- Added installed repository discovery service and route.
- Added shared installed repository candidate response types.
- Updated Deployment Panel to load installed repositories on GitHub connect and directly connect the selected repo.
- Added backend and frontend regression tests.

## Broken Or Unverified

- No known broken behavior remains locally.
- Production deployment is still pending for this branch.

## Verification

- `pnpm harness:check`
- `pnpm --filter @sketchcatch/api exec tsx --test src/source-repositories/github-app-client.test.ts src/source-repositories/source-repository-service.test.ts src/routes/source-repositories.test.ts`
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/api.test.ts features/workspace/workspace-right-panel-layout.test.ts`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`

## Best Next Action

- Push, open PR to `dev`, merge after CI, then deploy production.
