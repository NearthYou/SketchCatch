# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `feature/sw/312-ecs-alb-path-routing`.
- Active workstream: `ECS-MIGRATION-000`, Phase 8 ALB path routing and nginx steady-state removal.
- Issue: #312.
- No live AWS, Terraform plan/apply, ALB, or Route53 mutation command has run in this phase.

## Session Record

### 2026-07-10 - Split ECS API/web routing at the ALB

- Goal: Remove nginx from the ECS steady-state path and route API and web traffic directly to separate Fargate services.
- Completed so far:
  - Added API and web task definitions, services, target groups, security-group rules, and ALB path rules.
  - Routed `/api`, `/api/*`, `/health`, and `/health/db` to API port 4000; the default action routes to web port 3000.
  - Removed nginx from the ECS task/service and ECS image deployment workflow.
  - Retained nginx Docker, ECR, log-group, EC2/SSM workflow, and deploy assets as legacy rollback dependencies.
  - Split ECS deploy rendering and rollout into API then web service updates.
  - Added a Terraform routing contract test and a Fastify forwarded-header regression test.
  - Updated architecture, deployment, Terraform, and ECS migration planning docs.
  - Addressed PR #313 feedback by aligning the single API container limits with the task allocation and adding a regression assertion.
- Verification:
  - `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed on the final implementation diff.
  - Terraform fmt and validate passed; `terraform test` passed HTTP and HTTPS routing contracts (2 tests).
  - API app tests passed 8 tests, including ALB forwarded headers.
  - `scripts/smoke/ecs-ops-preflight.ps1 -PreflightOnly` passed with `mutationCommandsExecuted = false`.
  - Workflow Prettier, IAM/tracker JSON parsing, and `git diff --check` passed.
- Risk:
  - API and web deployment is sequential, not atomic; a partial rollout needs revision-aware rollback.
  - Default desired count now runs one API task and one web task, increasing steady-state Fargate cost.
  - API and web still share the existing ECS task role and service security group to preserve current runtime/RDS allowlists; least-privilege separation remains follow-up work.
  - Live target health, authentication, forwarded headers, and Route53 behavior remain unverified until separately approved smoke/cutover work.

## Next Action

- Run full repository and Terraform/static verification, publish the PR, wait five minutes, resolve review feedback, and merge only with green checks and no unresolved threads.
