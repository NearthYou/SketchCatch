# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Current branch: `fix/sw/302-ecs-worker-dispatch-safety`.
- Active workstream: `ECS-MIGRATION-000`.
- Phase 5 PR #296 is merged; issue #302 tracks valid post-merge review hardening.
- `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` passed during this session.
- No live AWS commands were run.

## Changes This Session

- Missing ECS RunTask task ARNs now fail dispatch.
- Stale ECS cancellation paths terminalize the active deployment job.
- ECS verification/stop API failures return 503 while preserving the active lock for safe retry.
- Worker JSON config type boundaries and deployment/IAM guidance were tightened.

## Broken Or Unverified

- No tests were added or run per user direction.
- Worker runtime, task definition, roles, and worker security group are not implemented.
- Keep production `DEPLOYMENT_WORKER_MODE=in_process` until those Phase 6 resources exist.

## Best Next Action

- Run remaining static checks, publish the issue #302 fix PR, link it from PR #296 review threads, and resolve the addressed threads.
