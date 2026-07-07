# Agent Progress

Short English-only working log for the current agent context.

## Current Verified State

- Branch/worktree: `codex/github-project-settings` in `C:\Users\siwon\Desktop\Jungle\Week17~21\SketchCatch-worktrees\github-project-settings`.
- Base: latest `origin/dev` at the start of this worktree.
- Scope: move GitHub source repository setup out of the deployment panel and fix the deployment console open path.
- Deployment now opens the full-screen console without closing the right panel host first.
- GitHub repository connection now lives in project creation and project settings.
- Deployment panel only shows source repository status, a project GitHub settings link, and Git/CI/CD handoff actions.

## Session Record

2026-07-08:

- Removed in-panel GitHub repository chooser/install actions from `DeploymentPanel`.
- Added `/projects/[projectId]/settings` with a project GitHub repository settings client.
- Added a project creation checkbox to start GitHub repository connection after creating a blank project.
- Added regression coverage for deployment console opening, project-level GitHub ownership, and project creation GitHub handoff.

Verification:

- `pnpm harness:check` - passed before edits.
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-right-panel-layout.test.ts` - passed, 63 tests.
- `pnpm --filter @sketchcatch/web exec tsx --test app/workspace/new/workspace-start-options.test.ts` - passed, 6 tests.
- `pnpm --filter @sketchcatch/web exec tsx --test --test-reporter spec` - new project GitHub settings tests passed; 3 unrelated baseline source tests failed.
- `pnpm lint` - passed.
- `pnpm typecheck` - passed.
- `pnpm build` - passed.
- `pnpm harness:check` - passed after edits.

Known risks:

- Full web source-test sweep still has 3 unrelated baseline failures in reverse workspace, workspace auth gate, and legacy AI route assertions.
- Browser click QA against production has not been run yet in this worktree.
