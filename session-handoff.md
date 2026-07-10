# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Current branch: `feature/sw/295-ecs-worker-task-dispatch`.
- Active workstream: `ECS-MIGRATION-000`.
- Phase 5 issue: #295, `Feat: ECS worker task dispatch 추가`.
- Phase 5 scope is API dispatch/config/docs/tests only; do not run live AWS commands.
- Phase 4 PR #294 was merged into `dev`.
- Targeted Phase 5 tests passed:
  - `pnpm --filter @sketchcatch/api exec tsx --test src/deployments/deployment-worker-dispatcher.test.ts src/config/env.test.ts src/routes/deployments.test.ts`
  - `pnpm --filter @sketchcatch/api typecheck`
  - `pnpm --filter @sketchcatch/api lint`
- Full checks passed: `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`.

## Changes This Session

- Added ECS/local worker dispatcher abstraction.
- Added `DEPLOYMENT_WORKER_MODE` and ECS worker config validation.
- Wired deployment execution routes to create jobs and dispatch ECS RunTask in ECS mode.
- Wired cancel to stop active ECS tasks when a task ARN exists.
- Added `init` operation enum migration for deployment jobs.
- Updated deployment docs with worker env and API task role IAM.

## Broken Or Unverified

- `pnpm --filter @sketchcatch/api test -- deployments` does not filter and ran the full API suite; Phase 5 tests passed, but unrelated existing failures were reported in `aiLlmExplanationRoutes.test.ts` and `aws-priority-resource-coverage.test.ts`.
- Worker runtime implementation remains out of scope and is still required before real ECS worker execution can complete deployments.
- PR creation, review comment wait, comment resolution, and merge are still pending.

## Best Next Action

- Run required checks, update harness evidence, commit/push/open the Phase 5 PR to `dev`, wait for review comments, resolve any actionable comments, then merge.
