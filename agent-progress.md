# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `codex/workspace-parameter-editing`.
- Scoped work: Workspace infrastructure settings Tasks 1-4, including final-review fixes and integrated verification.
- The branch covers new-node safe defaults, parameter-reference edge metadata/synchronization, parameter editing, and Terraform Preview output without cloud mutation.
- `feature_list.json` and `session-handoff.md` remain unchanged by scoped-task instruction.

## Session Record

### 2026-07-10 - Complete Workspace infrastructure settings Task 4

- Goal: Record the Task 1-3 contracts and run the required integrated verification.
- Completed: Updated `docs/data-models.md` for new-node-only safe defaults in `parameters.values`, parameter-reference `DiagramEdge.metadata`, and Terraform Preview ASG `desiredCapacity` omission rules. Updated the ignored JH worklogs and Task 4 report. Fixed the Architecture Draft catalog lookup so `RDS_READ_REPLICA` retains its own catalog defaults instead of inheriting the general RDS defaults through `aws_db_instance`.
- Verification: `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed. `pnpm --filter @sketchcatch/web test` passed 640/640 after updating the Architecture Draft safe-default expectations.
- Final-review verification: the new RDS read-replica regression test was RED before the catalog fix and GREEN after it; `workspace-ai-diagram-adapter.test.ts` passed 30/30, `terraform.test.ts` passed 19/19, and Web/API typechecks plus `pnpm lint` passed.
- Test baseline: full `pnpm test` still exits 1 because eight pre-existing API tests fail in unchanged deployment path-normalization and AI `llmExplanation` areas; the Workspace-focused Web/API tests pass.
- Risk: `pnpm build` generated the production import in `apps/web/next-env.d.ts`; the controller restored the exact pre-existing dev-mode import (`./.next/dev/types/routes.d.ts`) and kept that file outside the commit. No user verification is pending for this generated-file restoration.
- Next action: Task 4 is complete; review and merge the full Task 1-4 branch.

### 2026-07-10 - Start ECS Phase 5 API worker dispatch

- Goal: Add API-side ECS worker dispatch so Terraform execution can move from in-process background jobs to ECS RunTask one-off worker tasks when explicitly enabled.
- Completed:
  - Merged Phase 4 PR #294 into `dev`.
  - Created GitHub issue #295.
  - Created linked branch `feature/sw/295-ecs-worker-task-dispatch` from updated `dev` with `gh issue develop`.
  - Added `DEPLOYMENT_WORKER_MODE` and ECS worker dispatch env validation for cluster, task definition, subnets, security groups, container name, command, static worker env, and public IP setting.
  - Added ECS/local deployment worker dispatcher abstraction using `RunTask`, `DescribeTasks`, and `StopTask`.
  - Wired deployment init/plan/apply/destroy-plan/destroy routes to create a `DeploymentJob` and dispatch ECS RunTask when ECS worker mode is enabled.
  - Wired cancel to call ECS StopTask when an active job has an ECS task ARN; otherwise the existing stale RUNNING fail-safe still marks the deployment failed.
  - Added `init` to `deployment_job_operation` with migration `0028_deployment_job_init_operation.sql`.
  - Added route/config/dispatcher tests and updated `docs/deployment.md` with env and least-privilege IAM requirements.
- Verification so far:
  - `pnpm harness:check` passed.
  - `pnpm lint` passed.
  - `pnpm typecheck` passed.
  - `pnpm build` passed.
  - `pnpm --filter @sketchcatch/api exec tsx --test src/deployments/deployment-worker-dispatcher.test.ts src/config/env.test.ts src/routes/deployments.test.ts` passed.
  - `pnpm --filter @sketchcatch/api typecheck` passed.
  - `pnpm --filter @sketchcatch/api lint` passed.
  - `pnpm --filter @sketchcatch/api test -- deployments` ran the whole API suite because the package script does not filter test files; Phase 5 tests passed, but pre-existing unrelated AI fixture and missing docs/jh fixture failures were reported.
- Risk:
  - Worker runtime is still out of scope; ECS-dispatched tasks need Phase 6 code to consume `SKETCHCATCH_DEPLOYMENT_JOB_ID` and finish deployment state updates.
  - The requested API deployments test command currently exits 1 because of unrelated pre-existing failures in `aiLlmExplanationRoutes.test.ts` and a missing `docs/jh/000_AWS리소스목록_JH.md` fixture.
  - No live AWS commands should be run in Phase 5.

### 2026-07-10 - Start ECS Phase 4 deployment job model

- Goal: Add a deployment job model for Terraform execution jobs so Phase 5 can dispatch ECS RunTask one-off workers.
- Completed:
  - Created GitHub issue #293.
  - Created linked branch `feature/sw/293-deployment-runtask-jobs` from `dev` with `gh issue develop`.
  - Read root `AGENTS.md`, `docs/sw/agents.md`, `docs/sw/spec.md`, `docs/sw/plan.md`, and `apps/api/AGENTS.md`.
  - Added `deployment_jobs` DB schema/migration with operation/status enums, requester/access context, source deployment state, ECS task ARN placeholder, timestamps, error summary, and active-job duplicate protection.
  - Added internal deployment job repository/service helpers for create, dispatching/running, task ARN recording, success, failure, and cancellation transitions.
  - Added deployment job service tests for creation, state transitions, duplicate protection, and masked failure/cancellation recording.
  - Updated `docs/data-models.md` with the internal `DeploymentJob` contract while noting public Deployment API shapes remain stable.
- Verification so far:
  - `pnpm harness:check` passed before Phase 4 edits.
  - `pnpm harness:check` passed after Phase 4 edits.
  - `pnpm lint` passed.
  - `pnpm typecheck` passed.
  - `pnpm build` passed.
  - `pnpm --filter @sketchcatch/api exec tsx --test src/deployments/deployment-job-service.test.ts` passed.
  - `pnpm --filter @sketchcatch/api lint` passed.
  - `pnpm --filter @sketchcatch/api typecheck` passed.
  - `pnpm --filter @sketchcatch/api test -- deployment` ran the whole API suite because the package script does not filter test files; the new deployment job tests passed, but pre-existing unrelated AI fixture and missing docs/jh fixture failures were reported.
- Risk:
  - Phase 4 does not dispatch ECS tasks; Phase 5 must wire the job model into deployment routes and worker dispatcher config.
  - The requested API deployment test command currently exits 1 because of unrelated pre-existing failures in `aiLlmExplanationRoutes.test.ts` and a missing `docs/jh/000_AWS리소스목록_JH.md` fixture.
  - No live AWS commands should be run in Phase 4.

### 2026-07-10 - Start ECS Phase 3 runtime config/secrets transition

- Goal: Implement Phase 3 only: replace ECS runtime dependence on generated env files with ECS task definition environment/secrets references while keeping EC2 rollback intact.
- Completed:
  - Created GitHub issue #290.
  - Created linked branch `feature/sw/290-ecs-secrets-config` from `dev` with `gh issue develop`.
  - Read root `AGENTS.md`, `docs/AGENTS.md`, `infra/AGENTS.md`, and ECS migration references under `docs/sw`.
  - Added Terraform runtime config guardrails so sensitive API env names cannot be passed through `api_environment`.
  - Restricted `api_secret_arns` to approved ECS API secret names and Secrets Manager/SSM ARN formats.
  - Added `runtime-config.tf` to document the ECS API secret name groups used by Phase 3.
  - Added an ECS deploy workflow check that fails if required sensitive API values are missing from task definition secrets or appear as plain environment variables.
  - Updated deployment/Terraform docs with GitHub vars, ECS environment, Secrets Manager, SSM SecureString, and EC2 rollback responsibilities.
- Verification:
  - `pnpm harness:check` passed before Phase 3 edits.
  - `pnpm harness:check` passed after Phase 3 edits.
  - `pnpm lint` passed.
  - `pnpm typecheck` passed.
  - `pnpm build` passed.
  - `terraform -chdir=infra/aws/terraform fmt -check -recursive` passed.
  - Static Node check confirmed `.github/workflows/deploy-ecs.yml` contains the runtime config validation and does not generate env files or presigned env downloads.
  - `terraform -chdir=infra/aws/terraform validate` passed without live AWS mutation.
- Risk:
  - No live AWS commands should be run in Phase 3.
  - ECS service is currently cost-bearing if left at `desiredCount=1` from the prior smoke session.
  - The RDS security group rule opened manually for ECS smoke should be captured in a later Terraform/drift follow-up.
