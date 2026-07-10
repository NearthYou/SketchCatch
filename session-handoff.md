# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Current branch: `feature/sw/309-runtask-worker-ops-hardening`.
- Active workstream: `ECS-MIGRATION-000`, issue #309.
- Startup reconciliation and ECS task inspector tests pass.
- Full repository harness, lint, typecheck, and build pass on the final diff.
- The focused Phase 7 recovery suite passes 37 tests.
- Terraform fmt/init-without-backend/validate pass.
- ECS operations preflight passes without AWS access or mutation.
- No live AWS or Terraform mutation commands were run.

## Changes This Session

- API startup now reconciles active DeploymentJobs with ECS task state instead of failing every RUNNING deployment.
- Active and temporarily unverifiable tasks are protected; stopped, missing, and stale dispatch jobs are recovered.
- API, web, nginx, and worker log groups plus opt-in metric filters/alarms are defined.
- Added an AWS-free preflight and optional read-only ECS/log/HTTP inspection script.
- Added migration, Route53 cutover, EC2 rollback, and cleanup checklists.

## Broken Or Unverified

- The requested API command ran 882 tests; 879 passed and 3 pre-existing unrelated tests failed.
- Worker-specific ECS task definition, IAM roles, security group, and live smoke remain pending.
- CloudWatch alarms remain disabled by default and have not been applied.
- Production must keep `DEPLOYMENT_WORKER_MODE=in_process` until those resources and smoke evidence exist.

## Best Next Action

- Run full verification, review the diff, publish PR #309, resolve review feedback, and merge to `dev`.
