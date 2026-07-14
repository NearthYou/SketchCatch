# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `Refactor/jh/360-우측-패널-파라미터-수정`; local `dev`/`origin/dev` at `e322afd2` is merged as `05a2add1`. The pre-sync staged, unstaged, and untracked changes were restored with their original index split.
- Terraform synchronization accepts balanced `jsonencode(...)` expressions as allowlisted opaque source and renders them without quotes.
- Terraform synchronization accepts the balanced `base64encode(templatefile(...))` Launch Template composition while rejecting unrelated encoded expressions.
- Terraform `variable`, `locals`, and `output` blocks are silently preserved outside the diagram while `module` and unknown blocks remain visible warnings.
- Repository recommendation guarantees 2-3 unique candidates and validates question IDs, semantics, and duplicate prompts before display.
- Deployment type is hidden when repository evidence is decisive and shown only for ambiguous analysis.
- CI/CD handoff is a prominent standalone setting; its GitHub App repository panel appears only while enabled.
- Public Repository setup confirms Template and CI/CD before opening a separate follow-up-question stage.
- Follow-up questions depend on the selected Template, affect diagram creation, and use direct clickable choices.

## Session Record
- 2026-07-15: Consolidated the current branch worktree for a `dev` pull request. `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `git diff --check`, and the secret-pattern scan passed. Full tests remain red: Web passes 1202/1203 with the known stale `showServerSaveToast()` expectation; API passes 1585/1591 with three Windows path-separator expectations, two repository Template node-count expectations, and one orphan IAM-role expectation. `origin/dev` is 90 commits ahead of the branch merge base, so PR review must include integration/conflict checks. No cloud mutation, Terraform apply/destroy, dependency, lockfile, or DB migration change was performed by this publishing session.
- 2026-07-14: Replaced the Direct Deployment left-side stage navigation with a top horizontal Stepper, then removed the redundant expanded-modal title, centered and enlarged the Deployment/CI/CD selector, and increased stage markers to 40px desktop/36px mobile while preserving flow state, content, actions, and API behavior. TDD RED/GREEN passed the focused Web layout suite 93/93; `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, scoped diff checks, and desktop/390px browser rendering checks passed. Full Web tests remain 1202/1203 on the unrelated existing `project-board-thumbnail-save-trigger.test.ts` save-lifecycle regex assertion. No deployment, cloud mutation, dependency, lockfile, or migration change was performed.
- 2026-07-14: Restored the Deployment modal route layout by assigning separate grid rows to the title, Deployment/CI/CD tabs, and active console. TDD reproduced the stretched-tab regression, the focused Web layout suite passed 93/93, and authenticated browser verification showed both routes using a 47px navigation row plus a 726px console area. Harness, lint, typecheck, build, and diff verification passed; no cloud, Terraform, Git/CI/CD, or deployment execution ran.
- 2026-07-14: Removed only the expanded right-panel Deploy shortcut while preserving the collapsed icon, Save and Deploy, and Live Observation; TDD RED reproduced two triggers, GREEN passed 92/92, harness/lint/typecheck/build/diff passed, and full Web remains 1201/1202 on the unrelated staged `showServerSaveToast()` assertion.
### 2026-07-14 - Expand areas by current child sizes

- Replaced overflow-based sizing with deterministic baseline plus direct-child dimensions multiplied by 1.3; preserved centered growth, deepest-first reconciliation, shrink/restoration, and disabled auto-expansion behavior. Focused Web tests, lint, typecheck, and build passed; lint retains one pre-existing unused-argument warning.
- Full `pnpm test` remains red on 7 unrelated Web catalog/template/start/CSS assertions and 16 unrelated API deployment/repository/Q-plan/catalog baselines.

### 2026-07-14 - Reconcile area geometry after committed child changes

- Added full-containment parent highlighting for area-to-area drag and shared the candidate rules with committed parent assignment.
- Replaced cumulative 1.5x growth with baseline-based expansion and shrinkage after drag, drop, paste, delete, and resize completion.
- Preserved manual area geometry as the baseline, restored it after the last direct child leaves, and kept auto-sizing disabled when the toolbar preference is off.
- Verification: focused API and Web tests, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm harness:check`, and `git diff --check` passed. Lint retains one pre-existing unused-argument warning.
- Full `pnpm test` remains red on unrelated dirty-worktree baselines: seven Web catalog/template/start/CSS assertions and an API live-apply resource expectation.

### 2026-07-14 - Remove the server-save confirmation toast

- Removed the `저장되었습니다.` toast state, timer, render path, animation, and responsive styles while preserving the project-bar save status and server persistence behavior.
- Verification: TDD RED failed on the toast-removal assertion; GREEN passed the focused Workspace source test, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm harness:check`, and `git diff --check`. Lint retains one pre-existing unused-argument warning.

### 2026-07-13 - Simplify the collapsed Workspace resource panel

- Removed the placeholder `Modules` accordion and its unused empty-state styles from the Workspace left Resources list while preserving the curated Modules view toggle.
- Removed the collapsed 48px shortcut rail so the Board immediately uses the full width; the project-bar toggle remains the reopen control.
- Added a source regression test covering the removed accordion.
- Verification: TDD RED failed on the removed Modules accordion and collapsed shortcut rail assertions; GREEN passed focused Resource Settings and Diagram Editor tests, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm harness:check`, and `git diff --check`. Lint retains one pre-existing unused-argument warning; the broader Diagram Editor source suite retains one unrelated current-worktree drag-transaction assertion failure.

### 2026-07-13 - Restore documented GitHub App installation path

- Reproduced the local GitHub App update callback with `installation_id` and `setup_action=update` but no signed `state` while the API used `/installations/select_target`.
- Changed only the installation entry URL to the documented `/installations/new` path and updated the service and route expectations; auth, callback UI, refresh, storage, and permissions were unchanged.
- Verification: TDD RED failed only on the two path assertions, GREEN passed API 32/32, and harness, lint, typecheck, build, and diff checks passed. Lint retains one pre-existing unused-argument warning.
- Remaining action: retry the local GitHub App connection from SketchCatch so the new signed state is generated; production requires the same change through the normal dev-to-main release flow.

### 2026-07-13 - Revert mis-scoped GitHub App changes

- Restored all GitHub App code and tests changed in this session byte-for-byte to the current `origin/dev` baseline and removed the added callback helper, tests, plan, and design files.
- Removed the related auth/callback contract addition and the superseded recovery progress record while preserving unrelated Terraform and diagram worktree changes.
- Verification: focused API tests passed 32/32, focused Web tests passed 3/3, blob comparisons matched `origin/dev`, and harness, lint, typecheck, build, and diff checks passed. Lint retains one pre-existing unused-argument warning.
- Remaining setup issue: local installation testing still requires an environment-specific GitHub App Setup URL; no GitHub App or cloud configuration was mutated.

### 2026-07-13 - Prevent render-phase draft updates during diagram history navigation

- Moved undo/redo diagram publication and selection resets out of the `setHistory` functional updater so React no longer updates `ProjectWorkspaceDraftManager` while rendering `DiagramEditorInner`.
- Added a regression guard covering both undo and redo render-phase callback boundaries.
- Verification: regression test passes 2/2; `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm harness:check`, and scoped `git diff --check` pass. Lint retains one pre-existing API unused-argument warning.
- Known baseline: the full Web suite passes 1002/1010; eight unrelated catalog, Live Observation template, new-project start, and CSS/source-contract tests fail in the existing worktree. Authenticated browser undo verification was unavailable because the isolated Playwright session redirected to login.

### 2026-07-13 - Allow constrained Direct Deployment template files

- Added the CloudFront origin-facing managed prefix-list data source and constrained demo Launch Template `base64encode(templatefile(...))` support.
- Restored module-local `.tftpl` bundle files while analyzing only `.tf` as HCL; unsafe paths, extensions, and other local file functions remain rejected.
- Verification: the supplied Terraform passes the target live-profile safety gate; focused tests pass 52/52; harness, lint, typecheck, build, and diff checks pass. Full API tests retain the known baseline of 1252/1268 passing with 16 unrelated Repository/AI failures; lint retains one pre-existing warning.

### 2026-07-13 - Support Launch Template user-data function composition

- Added allowlisted preservation for the exact balanced `base64encode(templatefile(...))` composition used by the Live Observation API bundle bootstrap.
- Kept arbitrary `base64encode(...)`, other nested functions, malformed delimiters, and trailing input unsupported.
- Verification: TDD RED reproduced the reported Launch Template warning; focused Terraform synchronization/rendering tests pass 52/52; `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass. Lint retains one pre-existing API unused-argument warning.

### 2026-07-13 - Remove misleading preserved Terraform block warnings

- Added one shared classification for `variable`, `locals`, and `output` blocks that are intentionally preserved without Architecture Board projection.
- Removed duplicate editor/sync manual-fix warnings for those standard blocks while retaining malformed-block errors and `module` warnings.
- Verification: TDD RED reproduced the reported warning; focused Terraform diagnostics and synchronization tests pass 95/95; `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass. Lint retains one pre-existing API unused-argument warning.

### 2026-07-13 - Support Terraform jsonencode expressions

- Added allowlisted, balanced `jsonencode(...)` preservation shared by Terraform-to-diagram sync and Terraform rendering without evaluating the expression.
- Kept arbitrary functions and malformed/trailing expressions unsupported, and preserved the existing `filebase64(...)` contract.
- Added regression coverage for the reported S3 bucket policy flow, malformed input, arbitrary functions, and unquoted regeneration.
- Verification: focused tests pass 3/3; `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm harness:check`, and `git diff --check` pass. Lint retains one pre-existing API unused-argument warning.
- Known baseline: `pnpm --dir apps/api test` passes 1242/1258; 16 current-branch failures remain outside this change, including Repository Template expectations and AI explanation response tests.

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
  - Repository recommendation test, web typecheck, harness, lint, full typecheck, build, and `git diff --check` passed; lint retained the pre-existing `live-observations` `setNow` warning.

### 2026-07-14 - Separate presentation-only frames and restore ASG Area behavior

- Goal/Completed: Presentation-only ECS/API/Namespace frames no longer select an Area on blank clicks; ASG is restored across catalog, palette, resize, geometry, movement, parenting, edge layers, and the three-tier template as a `presentationArea` containing its SG and Launch Template. Resource names remain visible at every zoom level, and blank space inside a real Area selects the innermost eligible Area while outside space clears selection. Approved design and plan are under `docs/superpowers/`.
- Verification/Risk: ASG-focused 216 tests plus 97 Area interaction/view/layout tests, authenticated browser checks, harness, lint, typecheck, build, and diff check passed; the 1280×720 Template capture was refreshed. Full `pnpm test` reached Web 1198/1199 with one unrelated pre-existing staged save-lifecycle assertion failure. No cloud, Terraform, push, or deployment action ran. Source remains unstaged because unrelated user changes, including `DiagramEditor.tsx`, were already staged; one local-only QA account was created for the capture.
## Next Action

- Review and commit the Terraform `jsonencode(...)` and standard configuration-block preservation changes when ready.
