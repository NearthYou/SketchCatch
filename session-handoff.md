# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Current branch: `feature/sw/306-deployment-worker-runtime`.
- Active workstream: `ECS-MIGRATION-000`, issue #306.
- Worker targeted tests, API lint, API typecheck, and API build pass.
- API build produces `dist/deployment-worker.cjs`.
- Full repository harness, lint, typecheck, and build pass.
- No live AWS or Terraform mutation commands were run.

## Changes This Session

- Added DeploymentJob worker orchestration with RUNNING status and requester access-context validation.
- Worker cleanup now explicitly terminates the one-off process with its final exit code.
- Unsupported runtime operation values fail with a clear error and a FAILED job.
- Reused existing init/plan/apply/destroy-plan/destroy services.
- Added masked SUCCEEDED/FAILED/CANCELLED job finalization.
- Added the worker process entrypoint and same-image Docker command override support.
- Updated deployment docs with the worker command and activation prerequisites.

## Broken Or Unverified

- The requested API test command runs the full suite and exits 1 on 3 unrelated pre-existing tests; all Phase 6 worker tests pass.
- Local Docker image verification is pending because Docker Desktop was not running.
- Worker-specific ECS task definition, IAM roles, security group, and live smoke remain pending outside this phase.
- Production must keep `DEPLOYMENT_WORKER_MODE=in_process` until those resources and smoke evidence exist.

## Best Next Action

- Add the worker-specific ECS task definition, IAM roles, security group, and smoke evidence before enabling ECS worker mode in production.
