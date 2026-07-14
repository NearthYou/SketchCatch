# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Branch: `test/sw/378-deployment-sandbox-e2e`; issues #370-#377 are merged.
- The #378 preflight verifies local STS and the sandbox API's live AWS Connection account/region, while denying known production targets.
- The evidence verifier requires Direct 3 scopes, GitOps 4 runtimes, correlated release/Output evidence, per-runtime rollback, live observation/notifications, and zero remaining temporary artifacts.

## Verification

- `pnpm test:sandbox-e2e` passes 18/18.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm harness:check` pass.
- Baseline workspace tests pass except the three unchanged Windows symlink fixture setup errors (`EPERM`): API 1,529/1,532.

## Changes This Session

- Added `scripts/smoke/deployment-sandbox-e2e.mjs` plus focused tests and package commands.
- Documented the approved non-production execution matrix and cleanup gate in `docs/deployment.md`.
- Added the active #378 workstream to `feature_list.json`.

## Broken Or Unverified

- The current preflight has no authenticated non-production AWS profile, non-production API/token, verified AWS Connection, or sandbox GitHub repository.
- The configured AWS profiles identify only production account `555980271919` and are not eligible for mutation.
- No live Direct/GitOps run, browser Push delivery, rollback injection, or provider cleanup evidence exists yet.

## Best Next Action

- Configure the documented `SKETCHCATCH_SANDBOX_*` environment variables and rerun `pnpm sandbox:e2e preflight`.
- After it reports `ready: true`, execute the seven-run matrix, rollback drills, observation/notification checks, and cleanup; then verify the final report.
