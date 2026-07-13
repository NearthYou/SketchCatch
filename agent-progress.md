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

### 2026-07-13 - Stabilize actual cost chart typography

- Goal: Keep chart typography compact and professional at every dashboard width.
- Completed:
  - Recomputed the SVG coordinate width from its rendered container with `ResizeObserver` so labels no longer scale with the card.
  - Fixed the chart height at 220 px and retained the `DESIGN.md` 13 px caption token at its true rendered size.
  - Added a source-level regression for responsive width, fixed height, and typography token usage.
- Verification:
  - 16 focused chart tests and the full test suite passed.
  - `pnpm lint` passed with the pre-existing `live-observations` `setNow` warning.
  - `pnpm typecheck`, `pnpm build`, and `git diff --check` passed.
- Review:
  - Spec review found no issues; standards review finding about the caption token was fixed in `dcda929b`.

### 2026-07-13 - Restore API test baseline for issue #364

- Goal: Restore the 23 failing API baseline tests without hiding deployment safety or product-contract regressions.
- Completed:
  - Deferred deployment S3 artifact storage initialization until artifact access is required so domain and safety errors remain observable without S3 configuration.
  - Corrected Terraform reference and nested-block rendering for archive data, hyphenated resource names, CloudFront, and Kubernetes selectors.
  - Aligned AI architecture materialization with serverless SPA, optional-load-balancer Fargate, and EKS capability constraints.
  - Updated stale repository, Q business, LLM explanation, demo asset, and priority resource coverage tests to current contracts.
- Verification:
  - `pnpm --dir apps/api test` (1,257 passed)
  - `pnpm lint` passed with the pre-existing `live-observations` `setNow` warning.
  - `pnpm typecheck`
  - `pnpm build`
  - `pnpm harness:check`
  - `git diff --check` passed with CRLF conversion warnings only.
- Risk:
  - Root `pnpm test` still reports an unrelated Web CSS expectation around the mobile `.canvasToolbar` bottom offset; no Web source behavior was changed in this workstream.
  - No Terraform apply/destroy, cloud mutation, or Git/CI/CD handoff was performed.

### 2026-07-13 - Restore Web source-regression baseline for issue #362

- Goal: Align stale Web source-regression expectations with the current Area expansion and compact toolbar contracts.
- Completed:
  - Updated Area auto-expansion coverage to follow child-node entry detection.
  - Updated compact canvas toolbar coverage for the current left-centered placement.
  - Made related catalog, fixture, and CSS source assertions resilient to current generated content and Windows line endings.
  - Merged the latest `origin/dev` without conflicts.
- Verification:
  - 172 focused Web tests passed.
  - Full Web suite passed (1,024 tests).
  - `pnpm lint` passed with the pre-existing `live-observations` `setNow` warning.
  - `pnpm typecheck`
  - `pnpm build`
  - `pnpm harness:check`
  - `git diff --check`
- Risk:
  - This work changes test contracts only; no Web runtime behavior or cloud infrastructure was changed.

## Next Action

- Run repository checks and publish issue #362 for review.
