# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Branch: `codex/git-cicd-permission-message`
- Worktree: `C:\Users\siwon\Desktop\Jungle\Week17~21\SketchCatch-worktrees\git-cicd-handoff-create-fix`
- Local tests, typecheck, lint, build, and harness check pass.

## Changes This Session

- Live production E2E smoke created a temporary SketchCatch user/project/architecture/Terraform artifact and connected an installed GitHub repository.
- Handoff creation failed with `github_oauth_required`, which points to missing GitHub App repository write permissions for PR/workflow file creation.
- Added `github_oauth_required` to shared API error codes and made the web/API message explain that Contents, Pull requests, and Workflows write access must be approved.

## Broken Or Unverified

- Actual GitHub PR creation remains blocked until the GitHub App permissions are updated and the installation owner approves the new permissions.

## Verification

- `pnpm --filter @sketchcatch/api exec tsx --test src/routes/git-cicd-handoffs.test.ts`
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/api.test.ts`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `pnpm harness:check`

## Best Next Action

- Merge and deploy this message fix, update the GitHub App repository permissions externally, then rerun the production E2E smoke.
