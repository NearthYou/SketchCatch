# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Branch: `codex/github-existing-repo-first`
- Worktree: `C:\Users\siwon\Desktop\Jungle\Week17~21\SketchCatch-worktrees\aws-runtime-policy-deploy-fix`
- GitHub connect now opens an in-app repository chooser before GitHub App install/configure.

## Changes This Session

- Deployment Panel lists known GitHub source repositories first.
- Selecting a known repository opens the internal GitHub callback repository picker.
- GitHub App install/configure is now an explicit add-permissions action.
- Backend callback URL creation can target a selected known source repository, including inactive previous connections.
- GitHub callback page has an install/permission-expansion button when the desired repository is missing.
- PR #227 review feedback was addressed with modal-local error rendering and UUID route validation.

## Broken Or Unverified

- No known broken behavior remains in this branch.
- Production deployment has not been run from this branch.

## Verification

- `pnpm harness:check`
- Focused API source repository tests
- Focused web workspace layout test
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- Final `pnpm harness:check`

## Best Next Action

- Review the PR and merge to `dev`, then deploy if the production site should receive this UX change immediately.
