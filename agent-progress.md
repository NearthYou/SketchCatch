# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `feature/sw/361-deployment-cicd-console`.
- The approved design separates Direct Deployment and CI/CD into independent screens inside the existing full-screen console.
- Project repository monitoring defaults to enabled and requires a branch plus explicit app and infrastructure paths before execution.
- Repository recommendation guarantees 2-3 unique candidates and validates question IDs, semantics, and duplicate prompts before display.
- Deployment type is hidden when repository evidence is decisive and shown only for ambiguous analysis.
- CI/CD handoff is a prominent standalone setting; its GitHub App repository panel appears only while enabled.
- Public Repository setup confirms Template and CI/CD before opening a separate follow-up-question stage.
- Follow-up questions depend on the selected Template, affect diagram creation, and use direct clickable choices.

## Session Record

### 2026-07-13 - Add Web CI/CD clients and pure console state helpers

- Added typed monitoring, paginated Pipeline Run, incremental log, detail, and stale-aware refresh clients using the existing authenticated API boundary.
- Added pure active/idle polling, terminal transition, notification key, current/history selection, stale detection, and safe deployment Output link helpers.
- Review fixes separated terminal state from notifiable completion: cancellation remains terminal but only succeeded/failed transitions are collected for notifications; API regressions cover queryless default lists and detail/log authentication.
- Sensitive Outputs are filtered before value parsing; only HTTP(S) static/app and API entry points become actions while other values remain available for detail rendering.
- Verification: 56 focused Web tests, root and Web/types lint and typecheck, full build, harness, and diff checks passed. Lint retained the pre-existing API `setNow` warning, and the build retained the existing Next.js multi-lockfile workspace-root warning.
- No external GitHub, deployment, Terraform, AWS, or database mutation ran.

### 2026-07-13 - Expose authenticated Pipeline Run APIs

- Added project-owned Pipeline Run list/detail/log/refresh routes with strict validation, typed ISO DTOs, newest-first cursor pagination, and incremental log reads.
- Review fixes moved stable `(createdAt, id)` keyset pagination into RDS/service, added explicit stale refresh responses, and removed the route refresh precheck/double lookup.
- Preserved persisted history access after monitoring is disabled while keeping refresh behind the enabled-and-valid monitoring target.
- Reused one lazy GitHub App client across handoff, pipeline-status, and run providers; no real GitHub or deployment mutation ran.
- Verification: 53 focused API/app tests, schema/migration and repository query contracts, lazy-config smoke, API/root lint, typecheck, build, harness, and diff checks passed; lint retains one pre-existing `setNow` warning.

### 2026-07-13 - Discover and persist commit-scoped Pipeline Runs

- Added read-only GitHub Actions run, commit-file, job, and masked log reads.
- Grouped exact SketchCatch workflows by commit SHA and classified monitored app/infra changes with segment-safe paths.
- Added idempotent transactional Pipeline Run, six-stage, and deterministic log persistence with stale-state fallback.
- Verification: 29 focused tests, API typecheck/lint, full build, harness, and diff checks passed; lint retains one pre-existing `setNow` warning.
- No real GitHub, AWS, Terraform, database migration, or deployment mutation ran.
- Reviewer fixes added exact generated release-step mapping, full GitHub pagination, latest-attempt selection, fail-closed status semantics, and unseen-SHA-only commit-file discovery.

### 2026-07-13 - Validate and persist repository CI/CD monitoring settings

- Added atomic RDS-only monitoring defaults, lazy read-only GitHub validation, safe path normalization, and stable errors.
- Blocked handoff creation until monitoring is enabled and valid, then rendered validated app/infra paths into approved workflows.
- Verification: 62 focused API tests, API typecheck, API lint, full build, harness, and diff checks passed; lint retains one pre-existing `setNow` warning, and no real GitHub, AWS, Terraform, or repository mutation ran.
### 2026-07-13 - Design separate Deployment and CI/CD console screens

- Defined independent Deployment and CI/CD information architectures inside the existing full-screen console.
- Kept Direct Deployment records separate from commit-scoped Pipeline Runs and CI/CD logs.
- Defined repository-level branch, app path, and infrastructure path monitoring settings, completion notifications, and accessible Output URL actions.
- Defined polling-based GitHub Actions observation, browser Notification fallback behavior, error handling, compatibility, and acceptance tests.
- Added a nine-task TDD implementation plan covering contracts, migration, monitoring validation, Pipeline Run synchronization, API routes, UI separation, notifications, Outputs, and end-to-end verification.
- Verification: design self-review and `git diff --check` passed; no product code, Terraform, Git handoff, or cloud mutation ran.

### 2026-07-13 - Repair Terraform nested-block merge regression

- Fast-forwarded the local branch to the remote `dev` merge commit that CI evaluated and reproduced the duplicate `aws_launch_template` key failure.
- Consolidated both branch variants into one Launch Template nested-block set while preserving IAM profile, metadata, monitoring, network interface, and tag support.
- Kept the pending direct-resource rename boundary fix and its regression intact across the fast-forward.
- Verification: full typecheck, 20 focused Terraform/rename regressions, lint, build, harness, and diff checks pass. Lint retains one pre-existing API unused-argument warning.

### 2026-07-13 - Add and review diagram-based Live Observation for ECS Fargate and ASG

- Added diagram-derived main traffic paths, REST polling-compatible snapshots, CloudWatch Agent/ASG and ECS Fargate observability, and presentation-focused capacity visualization.
- Moved AI simulation results out of the chat dock and kept bottleneck, cost, and failure analysis in the simulation panel.
- Represented each accepted request as one 28px particle moving sequentially across analyzed connector segments; observation remains idle until traffic is explicitly started.
- Final review added metadata-free ECS/ASG capacity inference scoped to the selected controller, five-request bursts, disconnect-safe SSE startup, automatically expiring per-observation simulated traffic, metric-correct request thresholds, real Traffic API audience links with explicit simulation fallback, and polling listener cleanup.
- Verification: focused Web tests passed 82/82 plus 9 diagram tests, focused API tests passed 38/38 plus 18 service/route tests; harness, lint, typecheck, and build passed. No AWS or Terraform mutation ran.
- PR review: Kubernetes `depends_on` addresses now render as references and both polling/SSE delay messages use valid Korean text; 21 Terraform and 31 modal tests passed.

### 2026-07-12 - Repair Repository candidate selection UI

- Goal: Replace the unreadable black template candidate rows with a clear comparison and selection surface.
- Completed:
  - Removed the broad result-panel button selector that overrode candidate styles.
  - Split candidate content into rank, title, fit, reasons, tradeoffs, and selected state.
  - Added responsive one-column candidate details and preserved source title casing.
  - Removed the duplicate deployment selector for repositories with decisive deployment evidence.
  - Shared the separated CI/CD handoff and follow-up question sections across public and connected Repository flows.
  - Made the public-flow GitHub App repository panel conditional on CI/CD handoff and reset it for each new URL analysis.
  - Split public Repository configuration and follow-up questions into separate confirmed steps.
  - Recomputed questions per selected Template, removed redundant/unused questions, reset stale answers, rendered full-box choices, and required every answer before board creation.
- Verification:
  - Focused recommendation tests, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed.
  - Lint retains only the pre-existing API `setNow` warning.
  - Live-tested `Jungle_AI_Board`: AI source, two unique candidates, relevant non-duplicated questions, and cache-covered repeat analysis.

### 2026-07-12 - Fail fast when API database URL is missing

- Goal: Diagnose `/api/auth/login` returning 500 with `DATABASE_URL is required`.
- Completed:
  - Reproduced the login failure with a minimal POST to `http://localhost:3000/api/auth/login`.
  - Added a startup regression test proving the API must reject missing `DATABASE_URL` before Terraform warmup, deployment recovery, or listen.
  - Added the `requireDatabaseUrl()` startup guard after the static AWS credential-source check.
- Verification:
  - `pnpm --dir apps/api exec tsx --test src/server-startup.test.ts`
  - `pnpm --filter @sketchcatch/api typecheck`
  - `pnpm harness:check`
  - `pnpm lint` passed with the pre-existing `live-observations` `setNow` warning.
  - `pnpm typecheck`
  - `pnpm build`
- Risk:
  - The already-running API process still needs to be restarted, and local login still requires a real `DATABASE_URL` configured outside git.

### 2026-07-12 - Implement issue #349 repository template recommendations

- Goal: Extend connected Repository Analysis into a template candidate recommendation flow for issue #349.
- Completed:
  - Added shared deployment type, dynamic question, answer, and template recommendation DTOs.
  - Extended Repository Analysis results with inferred deployment type, CI/CD default, max-five questions, and supported template candidates.
  - Added backend recommendation endpoint for user deployment type, CI/CD, and answer payloads.
  - Kept final template validation constrained to supported `TemplateId` values from stored analysis or recommendation candidates.
  - Updated the repository start UI with deployment single-select, CI/CD checkbox, dynamic questions, and candidate cards.
  - Documented the contract in `docs/data-models.md`.
- Verification:
  - `pnpm --filter @sketchcatch/types typecheck`
  - `pnpm --filter @sketchcatch/api typecheck`
  - `pnpm --filter @sketchcatch/web typecheck`
  - `pnpm --dir apps/api exec tsx --test src/source-repositories/repository-analysis.test.ts src/routes/source-repositories.test.ts src/source-repositories/source-repository-service.test.ts`
  - `pnpm --dir apps/web exec tsx --test features/workspace/api.test.ts features/workspace/project-github-settings.test.ts features/workspace/repository-start-template-recommendation.test.ts`
  - `pnpm harness:check`
  - `pnpm lint` passed with the pre-existing `live-observations` `setNow` warning.
  - `pnpm typecheck`
  - `pnpm build`
  - `git diff --check` passed with CRLF conversion warnings only.
- Risk:
  - No GitHub PR, cloud deployment, Terraform apply, or infrastructure mutation was run.

### 2026-07-12 - Handle missing Source Repository DB migrations

- Goal: Diagnose the raw SQL internal error shown when starting from a GitHub repository with an unmigrated API database.
- Completed:
  - Confirmed the failing query targets `source_repositories` columns added by existing migrations, especially the repository analysis columns.
  - Added route-level detection for PostgreSQL undefined table/column errors on `source_repositories`.
  - Returned a stable `service_unavailable` / `DATABASE_MIGRATION_REQUIRED` response instead of leaking the Drizzle query and params.
  - Added the web API error translation so Repository start screens show an actionable migration message.
- Verification:
  - `pnpm --dir apps/api exec tsx --test src/routes/source-repositories.test.ts`
  - `pnpm --dir apps/web exec tsx --test features/workspace/api-client-error-message.test.ts`
  - `pnpm --dir apps/api typecheck`
  - `pnpm --dir apps/web typecheck`
- Risk:
  - The actual runtime DB still needs `pnpm --filter @sketchcatch/api db:migrate` from a shell with `DATABASE_URL` configured.

### 2026-07-12 - Move GitHub permission expansion to settings

- Goal: Keep Repository start focused on selecting/analyzing repositories while managing GitHub App repository permission expansion from project settings.
- Completed:
  - Removed direct GitHub App install URL opening from the Repository start screen.
  - Replaced the Repository start permission action with a project GitHub settings link.
  - Changed the GitHub App callback permission action to route to project GitHub settings.
  - Added source-level regression coverage so start/callback screens no longer import `createGitHubSourceRepositoryInstallUrl`.
- Verification:
  - `pnpm --dir apps/web exec tsx --test features/workspace/repository-start-template-recommendation.test.ts features/workspace/github-callback-route.test.ts`
  - `pnpm --dir apps/web typecheck`
  - `pnpm harness:check`
  - `pnpm lint` passed with the pre-existing `live-observations` `setNow` warning.
  - `pnpm typecheck`
  - `pnpm build`

### 2026-07-12 - Add public GitHub URL repository start

- Goal: Let users start Repository Analysis by pasting a public GitHub repository URL without first connecting GitHub in settings.
- Completed:
  - Added a Repository URL and branch form to the Repository start screen.
  - Wired the form to the existing public `/ai/source-repository-analysis` client.
  - Displayed detected signals, evidence files, recommendation reason, and the matched template.
  - Saved the recommended template board to the project draft before opening the workspace.
  - Kept URL analysis visible even if connected GitHub repository status cannot be loaded.
  - Added a project settings handoff when public evidence cannot be read, covering private/restricted repositories and branch mismatches.
- Verification:
  - `pnpm --dir apps/web exec tsx --test features/workspace/repository-start-template-recommendation.test.ts`
  - `pnpm --dir apps/web typecheck`
  - `pnpm harness:check`
  - `pnpm lint` passed with the pre-existing `live-observations` `setNow` warning.
  - `pnpm typecheck`
  - `pnpm build`
  - `git diff --check` passed with CRLF conversion warnings only.
  - `pnpm lint` passed with the pre-existing `live-observations` `setNow` warning; `pnpm typecheck`, `pnpm build`, and `pnpm harness:check` passed.

### 2026-07-12 - Inline public Repository URL start on new project screen

- Goal: Keep GitHub Repository start on the new project screen and remove the separate Repository URL entry step from the primary journey.
- Completed:
  - Changed Repository start action to open an inline URL/branch panel instead of routing to `/workspace/repository`.
  - Wired public GitHub URL analysis into the new project screen, creating the project only after a supported template recommendation is found.
  - Saved the recommended template board draft before opening the workspace.
  - Kept private/restricted repository guidance pointed at GitHub permissions in settings.
  - Added regression coverage for the inline Repository URL form action.
- Verification:
  - `pnpm --dir apps/web exec tsx --test app/workspace/new/workspace-start-options.test.ts features/workspace/repository-start-template-recommendation.test.ts`
  - `pnpm --dir apps/web typecheck`
  - `pnpm harness:check`
  - `pnpm lint` passed with the pre-existing `live-observations` `setNow` warning.
  - `pnpm typecheck`
  - `pnpm build` passed; Next/Turbopack emitted a non-fatal `.next/dev/cache/turbopack` symlink metadata warning.
  - `git diff --check` passed with CRLF conversion warnings only.
  - `pnpm harness:check`
  - `pnpm lint` passed with the pre-existing `live-observations` `setNow` warning.
  - `pnpm typecheck`
  - `pnpm build`
  - `git diff --check` passed with CRLF conversion warnings only.
- Risk:
  - Browser visual verification was skipped because Playwright/browser automation dependencies are not installed in this worktree.

## Next Action

- Execute Task 7 from `docs/superpowers/plans/2026-07-13-deployment-cicd-console-separation.md` in the isolated #361 worktree.
