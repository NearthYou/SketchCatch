# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `feat/ck/287-ai-diagram`.
- Current scope: keep Amazon Q Business architecture planning and validation while integrating the latest `dev` changes.
- Local `dev` and `origin/dev` point to `314b0c35`.
- Architecture Draft uses OpenAI normalization, compact Amazon Q planning, and backend materialization/validation with safe fallback.
- Latest deployment warning, dashboard project inventory, cost UI, and ECS worker dispatch hardening from `dev` are included.
- Production must keep `DEPLOYMENT_WORKER_MODE=in_process` until the worker task definition, entrypoint, roles, security group, and runtime are implemented.
- No Terraform apply/destroy, deployment execution, or cloud mutation was run during the merge.

## Session Record

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

### 2026-07-10 - Amazon Q Business architecture planning
- Goal: Use Q Business as the Architecture Draft planner without changing other OpenAI or Q explanation paths.
- Completed:
  - Added target-scoped `CREATOR_MODE`, compact ChatSync planning input, typed plan parsing, deterministic materialization, exclusion cleanup, and backend validation.
  - Preserved legacy full-preview compatibility and safe fallback for malformed, contradictory, or unmaterializable Q plans.
- Verification:
  - Focused API tests (53), `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed; `pnpm test` still had three unrelated web baseline failures.
- Risk:
  - Live Q connectivity works, but the application has `creatorModeControl=DISABLED`; no AWS configuration mutation was performed.

### 2026-07-10 - Merge latest dev into AI diagram branch
- Goal: Update local `dev` and integrate it into `feat/ck/287-ai-diagram` while preserving Amazon Q work and local generated-file changes.
- Completed:
  - Fast-forwarded local `dev` to `origin/dev` at `314b0c35` and merged it into the AI branch.
  - Resolved progress-history conflicts by keeping the latest upstream records and the current Amazon Q planning record.
- Verification:
  - `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and 53 focused AI API tests passed.
- Risk:
  - No Terraform apply/destroy, deployment execution, or cloud mutation was run.

### 2026-07-10 - Build diagram pattern knowledge package
- Goal: Create six verified AWS architecture pattern documents for S3 and Amazon Q Business ingestion.
- Completed:
  - Reviewed the AWS Terraform best-practices repository, the 90-page Prescriptive Guidance, all 154 aws-samples Terraform/HCL search results, and relevant AWS Solutions/official service guidance.
  - Added six independent pattern documents, a manifest, Amazon Q metadata sidecars, a full source inventory, review evidence, and a reproducible verifier under `docs/diagram-templates`.
  - Confirmed the live Q Business application/index is active in `ap-southeast-2`, but has no data source; existing project buckets are in `ap-northeast-2` and are not a valid ready ingestion target.
- Verification:
  - `node docs/diagram-templates/verify.mjs` passed for six patterns, 104 supported resource types, and 154 source repositories.
  - All 25 external references in the pattern and review documents returned successful HTTP responses.
- Risk:
  - S3 upload and Q Business sync are not complete. They require an approved cloud change to create a region-compatible knowledge bucket, crawler role, and data source before syncing.
