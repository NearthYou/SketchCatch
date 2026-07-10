# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `feature/sw/309-runtask-worker-ops-hardening`.
- Active workstream: `ECS-MIGRATION-000`, Phase 7 recovery, observability, and smoke hardening.
- Phase 6 worker runtime is merged into `dev`.
- Production must keep `DEPLOYMENT_WORKER_MODE=in_process` until worker task infrastructure and approved smoke evidence exist.

## Session Record

### 2026-07-10 - Harden ECS recovery, observability, and smoke

- Goal: Prevent API restarts from failing active ECS worker deployments and add operational observability and non-mutating smoke gates.
- Completed:
  - Created issue #309 and linked branch `feature/sw/309-runtask-worker-ops-hardening` from merged Phase 6 `dev`.
  - Added startup reconciliation that compares active DeploymentJobs with ECS task status behind an inspector abstraction.
  - Preserved active or temporarily unverifiable ECS tasks, protected state-transition races for retry, failed stopped/missing tasks, and applied a five-minute dispatch grace period.
  - Kept the existing in-process interrupted deployment recovery behavior.
  - Added a worker CloudWatch log group and opt-in log metric filters and alarms for API, web, nginx, worker, ALB health, CPU, and memory.
  - Added `scripts/smoke/ecs-ops-preflight.ps1` with AWS-free preflight and separately gated read-only AWS/HTTP checks.
  - Added the recovery, observability, migration, Route53 cutover, EC2 rollback, and cleanup runbook to `docs/deployment.md`.
- Verification so far:
  - `pnpm harness:check` passed before edits.
  - Reconciliation, dispatcher, job, worker, runtime-cache, and startup tests passed (37 tests).
  - `pnpm --filter @sketchcatch/api typecheck` passed.
  - `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed on the final diff.
  - `pnpm --filter @sketchcatch/api test -- deployment` ran 882 tests; 879 passed and 3 pre-existing unrelated tests failed.
  - `terraform -chdir=infra/aws/terraform fmt -check -recursive` passed.
  - `terraform -chdir=infra/aws/terraform init -backend=false -input=false` passed without AWS state access.
  - `terraform -chdir=infra/aws/terraform validate` passed.
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/smoke/ecs-ops-preflight.ps1 -PreflightOnly` passed without AWS access or mutation.
- Risk:
  - Final Terraform fmt/validate and AWS-free ECS operations preflight passed with `mutationCommandsExecuted = false`.
  - `git diff --check` passed.
  - Worker-specific task definition, roles, security group, and live RunTask smoke are still missing.
  - CloudWatch custom metrics and alarms are cost-bearing and remain disabled by default.
  - Read-only AWS, HTTP, migration, Route53, Terraform plan/apply/destroy, and live worker smoke were not run.
  - EC2/SSM remains the production rollback path and ECS worker mode must stay disabled until approved live evidence exists.

### 2026-07-10 - Add Phase 6 deployment worker runtime

- Goal: Add the one-off ECS RunTask worker process that consumes a DeploymentJob and invokes existing deployment services.
- Completed:
  - Created issue #306 and linked branch `feature/sw/306-deployment-worker-runtime` from updated `dev`.
  - Added a worker orchestration service that reads and validates RUNNING jobs, verifies requester access context, invokes init/plan/apply/destroy-plan/destroy services, and records terminal job status.
  - Added secret-masked failure handling for thrown errors and FAILED deployment results.
  - Added `src/deployment-worker.ts`, `dist/deployment-worker.cjs` build wiring, and the `start:worker` command.
  - Kept Terraform and Trivy in the existing API image and documented the ECS command override.
  - Addressed PR #308 review feedback by explicitly exiting the one-off process after cleanup and rejecting unsupported runtime operation values.
  - Rebased onto the latest `dev` while preserving concurrent progress records and unrelated local changes.
  - Updated deployment documentation with worker behavior, DB source-of-truth, command, and remaining activation prerequisites.
- Verification so far:
  - `pnpm harness:check` passed before and after edits.
  - Worker targeted tests passed (7 tests).
  - `pnpm --filter @sketchcatch/api lint` passed.
  - `pnpm --filter @sketchcatch/api typecheck` passed.
  - Post-review `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed.
  - Post-review worker targeted tests passed (7 tests).
  - `pnpm --filter @sketchcatch/api build` passed and produced `dist/deployment-worker.cjs`.
  - `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed.
  - `pnpm --filter @sketchcatch/api test -- deployment` ran the whole API suite; all Phase 6 tests passed, while 3 pre-existing unrelated tests failed.
- Risk:
  - Worker-specific ECS task definition, task roles, security group, and live smoke are not part of this phase.
  - Local Docker image verification is pending because the Docker Desktop engine was not running.
  - The requested API test command still exits 1 for unrelated AI explanation fixtures and a missing AWS resource coverage fixture.
  - No live AWS or live Terraform mutation commands may run in this phase.

### 2026-07-10 - Make deployment warnings non-blocking

- Goal: Let Direct Deployment proceed even when high-risk Trivy or deployment safety warnings are present.
- Completed:
  - Changed Pre-Deployment/Safety Gate warning creation so high-risk findings, unsupported-resource warnings, and destructive-change warnings no longer set `blocksApproval`.
  - Removed approval-time rejection for stored blocking or acknowledgement-only warnings, so older plan summaries cannot block approval only because of warning metadata.
  - Updated workspace deployment action state so the Plan approval button stays enabled even when `planSummary.warnings` contains `blocksApproval: true`.
  - Updated `docs/data-models.md` to describe warning preservation without approval/deployment blocking.
- Verification:
  - `pnpm harness:check` passed before edits.
  - `pnpm --filter @sketchcatch/api exec tsx --test src/deployments/deployment-safety-gate.test.ts src/deployments/deployment-approval-service.test.ts src/deployments/deployment-plan-service.test.ts` passed.
  - `pnpm --filter @sketchcatch/web exec tsx features/workspace/deployment-actions.test.ts` passed.
  - `pnpm lint` passed.
  - `pnpm typecheck` passed.
  - `pnpm build` passed.
- Risk:
  - Terraform validation, plan creation, artifact/hash drift checks, approval snapshot checks, AWS account/region drift checks, and actual Terraform apply failures still remain hard gates. This change only removes warning metadata as an approval blocker.

### 2026-07-10 - Connect dashboard project inventory to live user projects

- Goal: Replace the static `/dashboard/projects` sample with projects owned by the authenticated user.
- Completed:
  - Added a focused DESIGN.md project inventory client backed by `GET /api/projects` through `listProjects()`.
  - Added selectable recent-work and recent-creation sorting, project-name search, loading/error/empty states, and workspace links carrying the real project ID.
  - Removed fake source, risk, and deployment-status columns from the live inventory surface.
  - Added responsive project inventory styles and source-level regression coverage.
- Verification:
  - Project inventory, project sorting, project search, and dashboard route tests passed.
  - `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm harness:check` passed.
  - Playwright verified search filtering, both sort orders, and 1440px and 375px layouts without horizontal overflow.
- Risk:
  - The Playwright session had no authenticated user cookie, so populated visual QA used a browser-only mocked `GET /api/projects` response. The existing API ownership tests cover active-user filtering.

### 2026-07-10 - Apply DESIGN.md cost dashboard UI

- Goal: Apply the selected cost operations prototype to `/dashboard/costs` without adding estimated-versus-actual comparison behavior.
- Completed:
  - Connected the live `CostsClient` to the DESIGN.md dashboard shell instead of the static cost sample.
  - Made actual AWS usage the default view and kept pre-deployment estimates in a separate tab.
  - Added verified AWS connection treatment, four usage metrics, a two-column trend/service layout, project usage navigation, and optimization review surfaces.
  - Added isolated DESIGN.md cost styles with responsive layouts and source-level route coverage.
- Verification:
  - Dashboard and cost feature tests passed.
  - `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm harness:check` passed.
  - Playwright verified both tabs at 1440px and 375px; mobile document width remained 375px.
- Risk:
  - The local browser had no authenticated user session, so populated AWS usage visual QA used browser-only mocked API responses. Production API contracts and backend behavior were not changed.

### 2026-07-10 - DESIGN.md cost dashboard prototype

- Goal: Explore `/dashboard/costs` UI directions without changing the service implementation or comparing estimated and actual costs.
- Completed:
  - Added a standalone HTML prototype with three switchable layouts: operations tabs, project workspace, and cost operations board.
  - Applied DESIGN.md typography, color, spacing, control, border, and responsive conventions.
  - Kept estimate and actual usage as separate decision views rather than a comparison metric.
- Verification:
  - Playwright verified all three variants at 1440px and 375px without horizontal overflow.
  - Playwright verified keyboard variant switching and zero console errors or warnings.
- Risk:
  - This is a disposable prototype under `output/prototypes`; no `/dashboard/costs` application code was changed.

### 2026-07-10 - Prevent duplicate dashboard logout requests

- Goal: Apply the selected review comment so repeated logout clicks cannot start duplicate requests.
- Completed:
  - Added local `isPending` state to the dashboard account footer.
  - Disabled logout while auth is loading or the current logout request is pending.
  - Reset pending state in `finally` for both success and failure paths.
  - Added focused regression coverage for the pending-state flow.
- Verification:
  - `pnpm --filter @sketchcatch/web exec tsx features/dashboard/design-dashboard.test.ts` passed.
  - `pnpm lint` passed.
  - `pnpm typecheck` passed.
  - `pnpm build` passed.
- Risk:
  - GitHub CLI is unavailable in this environment, so the PR review thread was not replied to or resolved.

### 2026-07-10 - Signup password error highlight fix
### 2026-07-10 - Harden ECS worker dispatch after merged PR review

- Goal: Address valid post-merge review findings on PR #296 without running live AWS commands.
- Completed:
  - Re-read all five unresolved review threads with thread resolution and outdated state.
  - Made missing `RunTask` task ARNs fail dispatch instead of leaving an untraceable running job.
  - Made stale ECS cancellation paths terminalize the active deployment job before the existing deployment fail-safe runs.
  - Made ECS task verification or stop API failures return a retryable result so the route responds with 503 and preserves the active lock against concurrent Terraform execution.
  - Made JSON worker config parser casts explicit after runtime validation.
  - Clarified that ECS worker mode must remain disabled until worker runtime and infrastructure exist, and documented public-IP and cluster-scoped IAM requirements.
- Verification:
  - `pnpm harness:check` passed before and after edits.
  - `pnpm lint` passed.
  - `pnpm typecheck` passed.
  - `pnpm build` passed.
  - `git diff --check` passed.
- Risk:
  - No new tests were added or run per user direction.
  - The worker task definition, worker roles, worker security group, and worker process are not implemented yet.

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
