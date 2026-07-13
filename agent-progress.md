# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `Feat/jh/346-시뮬레이션-기능-구현-및-테스트`.
- Repository recommendation guarantees 2-3 unique candidates and validates question IDs, semantics, and duplicate prompts before display.
- Deployment type is hidden when repository evidence is decisive and shown only for ambiguous analysis.
- CI/CD handoff is a prominent standalone setting; its GitHub App repository panel appears only while enabled.
- Public Repository setup confirms Template and CI/CD before opening a separate follow-up-question stage.
- Follow-up questions depend on the selected Template, affect diagram creation, and use direct clickable choices.

## Session Record

### 2026-07-13 - Split estimated and actual project costs with folder tabs

- Added deployment-aware cost contracts across Direct Deployment and Git/CI/CD, including Destroy lifecycle handling.
- Added separate estimated-cost and actual-usage panels, project scoping, honest sample/allocation copy, keyboard tabs, and the requested compact folder-style tab surface from `DESIGN.md`; removed the final header and tab helper copy per visual feedback.
- Follow-up UX: direct expected-user input with validation, refresh feedback on both normal and empty states, and scroll-free responsive folder tabs.
- Follow-up commits: `ad7fb94b`, `104cb8bc`, `c80dac82`, `aaccecfa`.
- Commits: `4819f64c`, `ff16587d`, `ac29756a`, `da99fdb7`, `a0aeefe0`.
- Verification: 6 focused API tests, 19 focused Web tests, lint, typecheck, build, and harness pass. Lint retains one unrelated unused-argument warning.
- Risk: authenticated visual browser QA was blocked because the in-app browser had no session and Chrome control was unavailable. The full Web suite retains seven unrelated baseline failures outside cost files.

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

### 2026-07-12 - Open board after public Repository template recommendation

- Goal: Ensure a successful public Repository URL recommendation creates the project draft and opens the workspace instead of stopping on a no-template message.
- Completed:
  - Confirmed the reported repository analysis returned `template-api-db` with React, Node API, Python API, Database, and Container signals.
  - Mapped legacy public Repository Analysis template ids such as `template-api-db` to supported board `TemplateDefinition` ids.
  - Kept the inline new-project Repository URL flow creating and saving the recommended template diagram before routing to the workspace.
  - Added regression coverage for `template-api-db` producing a board with ALB, ASG, and RDS resources.
- Verification:
  - `pnpm --dir apps/web exec tsx --test features/resource-settings/template-library.test.ts app/workspace/new/workspace-start-options.test.ts features/workspace/repository-start-template-recommendation.test.ts`
  - `pnpm --dir apps/web typecheck`
  - `pnpm --dir apps/api exec tsx --test src/services/aiRepositoryAnalysis.test.ts src/routes/ai.test.ts`
  - `pnpm harness:check`
  - `pnpm lint` passed with the pre-existing `live-observations` `setNow` warning.
  - `pnpm typecheck`
  - `pnpm build`
  - `git diff --check` passed with CRLF conversion warnings only.
- Risk:
  - Browser visual verification has not been rerun yet in this worktree.

### 2026-07-12 - Split public Repository analysis from board creation

- Goal: Keep the new-project Repository URL flow from showing raw analysis details or opening the board before the user accepts the recommendation.
- Completed:
  - Changed the new project Repository URL action to create a project and route to the Repository analysis step instead of calling analysis or saving a board draft inline.
  - Passed Repository URL and branch into `/workspace/repository` so that page owns analysis, template recommendation, deployment type, CI/CD, and follow-up questions.
  - Replaced the public Repository analysis detail card with a recommendation/question step that does not render evidence files or detected file lists.
  - Moved board draft saving and `/workspace` navigation behind the final `Create board` action.
- Verification:
  - `pnpm --dir apps/web exec tsx --test app/workspace/new/workspace-start-options.test.ts features/workspace/repository-start-template-recommendation.test.ts`
  - `pnpm --dir apps/web typecheck`
- Risk:
  - Browser visual verification has not been run yet in this worktree.

### 2026-07-13 - Refine actual cost notice and chart readability

- Goal: Clarify fallback project cost allocation and make the actual usage chart readable at a glance.
- Completed:
  - Reworded the fallback allocation notice to explain that AWS project cost data may arrive later.
  - Added readable date labels on the X axis and dollar labels on the Y axis.
  - Limited long ranges to six date ticks and added a stable zero-cost `$0`, `$2`, `$4` scale.
  - Reduced data points to a 2 px radius and aligned chart colors and captions with `DESIGN.md`.
  - Prevented duplicate Y-axis labels for one-cent usage data.
- Verification:
  - `pnpm --dir apps/web exec tsx --test features/costs/cost-usage-charts.test.ts features/costs/cost-dashboard-client.test.ts features/costs/cost-usage-copy.test.ts` (19 passed)
  - `pnpm test -- --output-logs=errors-only`
  - `pnpm lint` passed with the pre-existing `live-observations` `setNow` warning.
  - `pnpm typecheck`
  - `pnpm build`
  - `pnpm harness:check`
  - `git diff --check`
- Risk:
  - Authenticated browser visual QA was not available; the supplied screenshot and source-level UI regression tests were used as the visual contract.

## Next Action

- Confirm the refined chart visually with authenticated actual-usage data when browser automation is available.
