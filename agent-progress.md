# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `feature/sw/295-ecs-worker-task-dispatch`.
- Active workstream: `ECS-MIGRATION-000`, Phase 5 API-side ECS worker RunTask dispatch.
- Phases 1, 2, 3, and 4 are merged into `dev`.
- Phase 5 keeps public deployment API response shapes stable and preserves in-process background execution unless `DEPLOYMENT_WORKER_MODE=ecs`.
- Phase 5 must not run live AWS commands.

## Session Record

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

- Goal: Highlight signup password policy failures and password mismatch messages in red.
- Completed:
  - Added a compound auth error selector so the later generic help-text color cannot override `authErrorText`.
  - Added regression coverage for the DESIGN.md signup error color.
- Verification:
  - Playwright reproduced the bug as computed color `rgb(96, 100, 108)`.
  - Playwright verified all rendered password error messages use `rgb(159, 29, 35)` after the fix.
  - `pnpm --filter @sketchcatch/web exec tsx features/auth/signup-page.test.ts` passed.
  - `pnpm lint` passed.
  - `pnpm typecheck` passed.
  - `pnpm build` passed.

### 2026-07-10 - DESIGN.md signup page alignment

- Goal: Align `/signup` with the existing DESIGN.md-based `/login` experience while preserving signup validation and legal-document behavior.
- Completed:
  - Replaced the legacy blueprint signup shell, logo image, and auth classes with the shared `authDesignPage` login structure.
  - Added signup-width, availability check, consent action, password toggle, status, and legal dialog styles using the existing auth design tokens.
  - Kept the existing signup form state, duplicate checks, password policy, consent requirements, and submit behavior unchanged.
  - Added source-level regression coverage for the signup shell and signup-specific design tokens.
- Verification:
  - `pnpm --filter @sketchcatch/web exec tsx features/auth/login-page.test.ts` passed.
  - `pnpm --filter @sketchcatch/web exec tsx features/auth/signup-page.test.ts` passed.
  - Playwright desktop screenshots confirmed the login-matched sky wash, white card, black CTA, and light legal dialog.
  - Playwright at 375px confirmed all inputs and buttons fit without horizontal overflow.
  - `pnpm lint` passed.
  - `pnpm typecheck` passed.
  - `pnpm build` passed.

### 2026-07-10 - Responsive dashboard logout placement

- Goal: Keep logout available in the dashboard header when the responsive layout hides the desktop sidebar footer.
- Completed:
  - Added a compact account footer variant that reuses the existing auth logout flow.
  - Placed the compact logout action beside the SketchCatch brand below the 920px dashboard breakpoint.
  - Preserved the desktop account footer as the only visible desktop logout action.
  - Added regression coverage for the responsive header placement and visibility rules.
- Verification:
  - Reproduced the issue at 667px with Playwright: `FAIL: logout button hidden`.
  - Verified the fix at 667px: one visible logout button at `539,20,108,40`.
  - Verified 375px has no brand/button overlap and no page-level horizontal overflow.
  - Verified 1440px keeps only the desktop sidebar logout visible.
  - `pnpm --filter @sketchcatch/web exec tsx features/dashboard/design-dashboard.test.ts` passed.
  - `pnpm lint` passed.
  - `pnpm typecheck` passed.
  - `pnpm build` passed.

### 2026-07-10 - Dashboard login/logout UX fix

- Goal: Make the landing login flow show the login screen instead of auto-forwarding an existing session to `/dashboard`, and replace the design dashboard safety footer with account name plus logout.
- Completed:
  - Removed the login form's `status === "authenticated"` auto-redirect so `/login` remains visible when a previous refresh session exists.
  - Added a client-side design dashboard account footer that reads the current auth user, calls existing `logout()`, and returns to `/login`.
  - Replaced the `Deployment Safety Gate` sidebar copy with the account footer and styled it with the DESIGN.md black 8px CTA and white-canvas dashboard tokens.
  - Added source-level regression coverage for the login form and design dashboard footer.
- Verification:
  - `pnpm harness:check` passed before and after edits.
  - `pnpm --filter @sketchcatch/web lint` passed.
  - `pnpm --filter @sketchcatch/web typecheck` passed after Next regenerated `.next/types`.
  - `pnpm --filter @sketchcatch/web exec tsx features/auth/login-page.test.ts` passed.
  - `pnpm --filter @sketchcatch/web exec tsx features/dashboard/design-dashboard.test.ts` passed.
  - `pnpm lint` passed.
  - `pnpm typecheck` passed.
  - `pnpm build` passed.
- Risk:
  - `pnpm --filter @sketchcatch/web test` still fails in this sandbox with `spawn EPERM` across every `node:test` file; targeted single-process test execution passed for the changed coverage.
  - Pre-existing `apps/web/next-env.d.ts` local modification was not touched.

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
