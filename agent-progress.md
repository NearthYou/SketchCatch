# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `fix/gg/355-review-followup-v2`.
- Six AWS Template Boards preserve 103 deployable Resources and their Terraform semantics while adding 28 parameterless, Catalog-backed Design presentation nodes.
- All authored positions and Area sizes use the 40px grid; sibling collision, parent containment, and visible-edge caption-crossing checks pass.
- Authenticated Board QA passed 12 visual and structural checks for each Template. Evidence is in `docs/gg/feat-infrastructure-template/017_AWS템플릿Design실화면QA_gg.md`.

## Session Record

### 2026-07-13 - Add compact Catalog-backed Design layers to AWS Templates

- Added a presentation graph separate from deployable Resources and semantic relationships, including User/Client, Internet, Source Repository, Region, Availability Zone, and role-specific Group lanes.
- Kept the exact deployable counts Static 6, Minimal 12, Full 16, 3-Tier 30, ECS 20, and EKS 19; the semantic Resource total remains 103 and the presentation-only Design total is 28.
- Reworked all six authored layouts onto a compact 40px grid and corrected the remaining ECS/EKS caption, containment, and edge-routing conflicts.
- Kept Template gallery Resource counts and resource sorting based on parameterized deployable nodes, so Design nodes do not inflate user-facing Resource totals.
- Verified all six Templates through the real authenticated new-project and Board flow; 72/72 visual and structural checks passed and the created project IDs are recorded in document 017.
- Verification: 60 focused Template/Catalog/layout tests and 4 direct Template library regressions passed; `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `git diff --check` passed. Lint retains one pre-existing API unused-argument warning.
- `pnpm build` is blocked before Web compilation by the pre-existing ignored broken `apps/web/.codegraph` symlink (`ENOENT stat`), as anticipated by the task contract; the symlink was not changed.
- Risk: no Terraform plan/apply/destroy, AWS mutation, deployment API mutation, or approval-flow action ran.

### 2026-07-13 - Verify AWS Template Board placement against live Board screens

- Completed the PNG-to-Board layout work on `fix/gg/355-review-followup-v2` without changing Resource IDs, types, counts, Terraform values, relationship semantics, API calls, or approval behavior.
- Confirmed all six Template Boards through an authenticated local Chrome session at the real `/workspace?templateId=...` route: Static (6), Minimal (12), Full (16), 3-Tier (30), ECS (20), and EKS (19).
- Confirmed the 103/103 Catalog key/type/icon/kind match and documented that role labels are existing human-readable labels, not Terraform logical names or fabricated resources.
- Recorded 12 independent checks per Template: Board opening, count, Catalog materialization, label boundary, flow, containment, support rails, PNG layer order, collision, crop, edge crossing, and viewport.
- Corrected only two inaccurate prose descriptions in the placement contract; no production source behavior changed in this documentation follow-up.
- Verification: focused Template suite (39 tests), Web/types typecheck, full typecheck, lint, harness, and `git diff --check` passed after this documentation update. `pnpm build` remains blocked by the pre-existing ignored broken `apps/web/.codegraph` symlink (`ENOENT stat`), not by Template code.
- Risk: no Terraform plan/apply/destroy, AWS mutation, API mutation, or approval-flow action ran.
- Clean-state checklist: the tracker has one unrelated `in_progress` item, this Template work is evidence-backed `passing`, no secrets were read or written, and no background process was started by this session.

### 2026-07-13 - Resolve PR #366 review and synchronize latest dev

- Fixed the source-export runtime import that failed the clean CI Web build and pushed the focused correction to the PR branch.
- Verified the Gemini AZ suggestion against Template materialization and the API Terraform renderer, replied with the contract evidence, and resolved the only review thread without introducing a fingerprint/renderer mismatch.
- Merged the latest `origin/dev` API baseline repair while preserving the Template QA records and keeping already archived shared work out of this active log.
- Verification before the dev merge: clean worktree build passed, PR checks passed, and the focused fingerprint, materializer, and infrastructure graph suites passed 45/45.
- Risk: no Terraform plan/apply/destroy, AWS mutation, deployment API mutation, or approval-flow action ran; local Web and API development servers were started for the user.

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

## Next Action

- No Template Design/layout implementation is pending. If the Template graph changes later, rerun the focused suite and the live Board QA checklist in `017`.
