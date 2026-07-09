# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `feature/sw/293-deployment-runtask-jobs`.
- Active workstream: `ECS-MIGRATION-000`, Phase 4 deployment job model for future ECS RunTask execution.
- Phases 1, 2, and 3 are merged into `dev`.
- Phase 4 keeps public deployment API response shapes stable and preserves the existing in-process background execution behavior.
- Phase 4 must not run live AWS commands.

## Session Record

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
