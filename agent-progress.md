# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `feat/ck/349-repo-analysis`.
- Issue #349 repository-analysis based template recommendation is implemented and committed locally.
- New project Repository start now shows the Repository URL analysis panel above the primary `Repository 분석하기` action.
- Public GitHub URL analysis now reads repository tree evidence, including nested package, Dockerfile, framework config, and README paths.
- API startup now fails fast before listening when `DATABASE_URL` is not configured, instead of letting DB-backed routes such as `/api/auth/login` return a runtime 500.
- The latest follow-up fix maps missing `source_repositories` migrations to a stable API/UI message instead of exposing raw SQL.
- GitHub repository-start and callback screens now route permission expansion to project GitHub settings instead of opening GitHub App installation directly.
- New project Repository start now opens an inline public GitHub URL analysis panel instead of routing to the separate Repository start page.
- Local `db:migrate` could not be run in this shell because `DATABASE_URL` is empty.
- No cloud deployment, Terraform apply, or infrastructure mutation was run during this work session.

## Session Record

### 2026-07-12 - Deepen public GitHub URL evidence scan

- Goal: Fix shallow public Repository URL analysis that only checked root `README.md`, root `package.json`, root `Dockerfile`, and root `docker-compose.yml`.
- Completed:
  - Reproduced the user-visible issue with `https://github.com/chaekang/Jungle_AI_Board`, which has nested Dockerfiles and app package files under `apps/`.
  - Changed public URL analysis to read the GitHub recursive tree first, then fetch prioritized evidence paths under nested app roots.
  - Added request timeouts and per-file failure tolerance for public GitHub evidence fetches.
  - Reported actual evidence file paths instead of fixed root-level false entries.
  - Added Python/FastAPI runtime detection for public URL analysis.
- Verification:
  - `pnpm --dir apps/api exec tsx --test src/services/aiRepositoryAnalysis.test.ts src/routes/ai.test.ts`
  - `pnpm --dir apps/api typecheck`
  - Live route check for `https://github.com/chaekang/Jungle_AI_Board` returned nested Dockerfile/package evidence and `React`, `Node API`, `Python API`, `Database`, `Container` signals.
- Risk:
  - Public URL analysis still maps to the nearest supported Template; richer topology generation remains downstream Architecture Draft work.

### 2026-07-12 - Move Repository URL analysis above action button

- Goal: Put the inline Repository URL analysis panel above the `Repository 분석하기` button on the new project start screen.
- Completed:
  - Moved `RepositoryUrlStartPanel` before the action button group in the workspace new-project start client.
  - Added source-order regression coverage so the panel stays above the primary action.
- Verification:
  - `pnpm --dir apps/web exec tsx --test app/workspace/new/workspace-start-options.test.ts`
  - `pnpm --filter @sketchcatch/web typecheck`
  - `pnpm --filter @sketchcatch/web lint`
  - `pnpm build`
  - `pnpm lint` passed with the pre-existing `live-observations` `setNow` warning.
  - `pnpm typecheck`
- Risk:
  - Browser screenshot verification was skipped because Playwright/browser automation is not installed in this worktree. The local page was reachable at `http://localhost:3000/workspace/new`.

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

### 2026-07-12 - Localize Repository analysis page copy

- Goal: Remove English UI copy from the Repository analysis/recommendation page.
- Completed:
  - Translated the Repository page heading, URL analysis form, connected repository section, recommendation controls, select placeholders, buttons, empty/error states, and public template display names into Korean.
  - Kept product/acronym terms such as GitHub, URL, CI/CD, EC2/VM, ECS Fargate, and EKS as product identifiers.
  - Updated source regression coverage to assert the Korean copy and keep evidence file lists hidden.
- Verification:
  - `pnpm --dir apps/web exec tsx --test features/workspace/repository-start-template-recommendation.test.ts`
  - `pnpm --dir apps/web typecheck`
- Risk:
  - Browser visual verification has not been run yet in this worktree.

## Next Action

- Manually retry the Repository URL analysis page in the browser when the local API/database is running.
