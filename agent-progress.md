# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `feature/sw/290-ecs-secrets-config`.
- Active workstream: `ECS-MIGRATION-000`, Phase 3 runtime config/secrets transition.
- Phase 1 ECS/Fargate foundation and Phase 2 ECS deploy workflow are merged into `dev`.
- Live ECS smoke was completed before this Phase 3 branch: service `sketchcatch-production-app` reached `desired=1`, `running=1`, ALB target health was healthy, `/health` returned 200, `/health/db` returned 200, and root page returned 200.
- Phase 3 implementation is code/docs only and must not run live AWS commands.

## Session Record

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
