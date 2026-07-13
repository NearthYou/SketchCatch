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

### 2026-07-13 - Constrain Repository diagrams to authoritative evidence

- Reproduced the `audience-live-check` Repository flow producing an over-inferred ECS board and a later `422` during strict regeneration.
- Added structured Repository architecture facts for static S3/CloudFront delivery, ECS Fargate, ECR, ALB, CloudWatch, GitHub Actions, TLS, one task, Docker health checks, exclusions, and missing IaC definitions.
- Made strict Repository evidence rebuild the Architecture Intent Plan and final ECS diagram deterministically instead of inheriting generic private subnet, NAT, autoscaling, AWS-native CI/CD, persistence, realtime, or authentication assumptions.
- Configured the evidence-backed API contract as ALB HTTPS -> one ECS Fargate service on port 8080 with `/health`, with GitHub Actions represented as an external actor.
- Separated AWS managed services from the VPC boundary and removed redundant delivery edges; added adapter coverage for non-overlapping managed-service and VPC areas.
- Removed candidate-ranking prose and contradictory broad signals from strict AI prompts so unsupported recommendations cannot become architecture requirements.
- Chrome verification before the final layout adjustment confirmed successful generation with 26 nodes, no `422`, and no forbidden NAT, CodePipeline, CodeBuild, autoscaling, RDS, Redis, WebSocket, or Cognito resources. The Chrome login expired before the final post-layout screenshot; deterministic adapter coverage verifies the managed-service/VPC separation.
- Verification: 58 Architecture Draft tests, 42 Web recommendation/adapter tests, 8 Repository analysis tests, the `.git` route regression, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm harness:check`, and `git diff --check` passed. Lint retains the pre-existing unused `setNow` warning in the Live Observation store contract.

### 2026-07-13 - Eliminate generated ECS board diagnostics

- Reproduced six diagnostics on the generated `audience-live-check` ECS Fargate board: two Terraform round-trip warnings and four false Subnet/VPC placement warnings.
- Allowed bare Terraform resource addresses only in `depends_on`, aligned nested-block parsing with the generator's shared generic nested-block contract, and preserved existing Diagram area parents during Availability Zone sync.
- Updated architecture containment checks to accept matching VPC ancestors or full geometric containment, covering the single-parent VPC/AZ representation without hiding missing references or partial overlaps.
- Added regressions for ECS dependencies, Application Auto Scaling nested metrics, VPC parent preservation, nested area ancestors, and AZ-grouped Subnets.
- Chrome verification on the same saved project: Terraform diagnostics `2 -> 0`, Architecture diagnostics `4 -> 0`, total issue badge `6 -> 0`.
- Verification: 57 focused API Terraform tests, 40 focused Web architecture tests, `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed. Lint retains the pre-existing unused `setNow` warning in the Live Observation store contract.

### 2026-07-13 - Merge latest dev into AI diagram fallback branch

- Fast-forwarded `feat/ck/350-ai-diagram-fallback` to latest `origin/dev`.
- Reapplied the stashed Template-unselected AI fallback work after conflicts in API route, Repository start UI, CSS, data model docs, and progress log.
- Kept the latest Repository Analysis recommendation flow from `dev` and restored the fallback request resolver, UI CTA, and documentation contract.
- Verification: `pnpm harness:check`, `pnpm --dir apps/api exec tsx --test src/routes/ai-repository-handoff.test.ts`, `pnpm --dir apps/web exec tsx --test features/workspace/repository-template-fallback.test.ts app/workspace/repository/repository-start-client.test.ts`, `pnpm typecheck`, `pnpm lint`, and `pnpm build` passed. Lint retained one pre-existing API unused-argument warning in `apps/api/src/live-observations/live-observation-store-contract.ts`.

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

### 2026-07-13 - Public Repository AI recommendation and question recovery

- Goal: Verify whether public Repository start sends evidence to AI, renders AI answers, and creates a board for `https://github.com/chaekang/Jungle_DB_API_W8`.
- Completed:
  - Confirmed `/ai/source-repository-analysis` calls the repository template AI ranker and returns `rankingSource: "ai"` for the reported repository.
  - Fixed the UI recommendation step so backend handoff-level questions are rendered when AI-ranked candidates contain empty `questions` arrays.
  - Removed the Template-unselected AI fallback UI and contract surface added on this branch because it created a confusing second generation path.
  - Applied pending local DB migrations; the observed board-save failure was caused by the local `project_drafts` table missing the `terraform_files` column.
  - Browser-verified the public Repository flow: AI-ranked ECS/EKS recommendations render, follow-up questions render, answers create and save a workspace board.
- Verification:
  - `pnpm --dir apps/web exec tsx --test app/workspace/repository/repository-start-client.test.ts features/workspace/public-repository-recommendation.test.ts`
  - `pnpm --dir apps/web typecheck`
  - `pnpm --dir apps/api typecheck`
  - `pnpm lint` passed with the pre-existing `live-observations` `setNow` warning.
  - `pnpm typecheck`
  - `pnpm build`
  - `pnpm harness:check`
- Risk:
  - Full Architecture Draft AI generation through `/ai/architecture-draft` is separate from the Repository recommendation flow; probing it showed environment-dependent failures (`422` from the running API route and expired AWS SSO in a direct configured call). The current Repository start path uses AI for ranking/questions and deterministic Template-based board creation.

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

### 2026-07-13 - Repeated Chrome verification of Repository AI responses

- Created and saved the local project `AI 응답 반복 검증` from `chaekang/Jungle_DB_API_W8`; the resulting workspace contains the expected six-resource ECS Fargate diagram.
- Three analyses inside the five-minute cache window returned the exact same recommendation text and scores because `/ai/source-repository-analysis` caches the complete result by raw Repository URL and branch.
- Two cache-bypassed analyses produced different AI-written recommendation reasons, confirming fresh model responses, while both retained the same 87% ECS Fargate and 67% EKS confidence values supplied as deterministic baseline scores in the AI input.
- Re-running `pnpm --dir apps/api db:migrate` was required before the local draft save succeeded.

### 2026-07-13 - Repository-specific AI recommendation profiles

- Reproduced that unrelated Docker repositories received the same ECS/EKS candidates and 87%/67% scores because container candidates and baseline confidence were fixed before the AI call.
- Added repository topology profiling so single-service containers and frontend/backend/relational-database multi-service repositories receive different supported candidates, deterministic confidence, and evidence-specific reasons.
- Removed deterministic confidence and canned reasons from the OpenAI input; the model now receives the repository profile plus supported Template descriptions and calculates confidence independently.
- Added NestJS package detection and FastAPI/uvicorn Docker evidence detection so backend Application Units are preserved.
- Bumped the public Repository analysis cache namespace to invalidate stale recommendations.
- Verified real API results: `Jungle_DB_API_W8` receives ECS/EKS recommendations based on local CSV persistence, while `Jungle_AI_Board` detects FastAPI, NestJS, React/Vite and receives three-tier, ECS, and EKS candidates with distinct scores and reasons.

### 2026-07-13 - Template-first Amazon Q Repository diagrams

- Replaced deterministic public Repository board creation with the real `/ai/architecture-draft` Amazon Q path.
- Kept the selected Template as the fixed core, merged only compatible answer-driven resources, and made conflicting runtime preferences advisory.
- Added repository-inferred Architecture Draft context without inventing unsupported upload, realtime, or certificate requirements.
- Reflowed merged root resources into topology lanes while preserving resource identity, Terraform type, parameters, and edges.
- Flattened Template Terraform values into resource config and resolved all `@ref` and `@address` placeholders to final Terraform addresses.
- Removed incompatible CodeDeploy Server resources from non-EC2 Templates.
- Added semantic Template merging for equivalent public network and ECS role resources while preserving distinct private DB, runtime, and CI/CD resources.
- Added CodeBuild and CodePipeline service roles and stable Terraform names for the CI/CD dependency chain.
- Live verification for `chaekang/Jungle_DB_API_W8`: relational/API/direct-host answers produced an Amazon Q ECS Fargate draft with 49 Board resources and RDS, no EC2, no upload resources, no CodeDeploy Server resources, no unresolved Template placeholders, and zero dangling references across 83 Terraform references. The no-database/managed variant kept ECS and omitted RDS.
- Verification: 4 focused API regressions, 41 focused Web regressions, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm harness:check` passed. Lint retains the pre-existing unused `setNow` warning in the Live Observation store contract.

### 2026-07-13 - Fix `.git` public Repository URL evidence loss

- Reproduced `https://github.com/whiskend/audience-live-check.git` returning empty evidence because public GitHub parsing kept the `.git` suffix and queried a nonexistent repository.
- Normalized public GitHub repository URLs before tree/raw evidence fetches and bumped the analysis cache namespace to avoid stale empty results.
- Added fallback UI copy so legacy comparison candidates never render a blank recommendation reason.
- Chrome verification: re-running URL analysis now selects ECS Fargate first with populated reasons and CI/CD enabled for the sample repository.
- Verification: `pnpm --dir apps/api exec tsx --test --test-name-pattern "clone URLs ending in .git" src/routes/ai.test.ts`; `pnpm --dir apps/web exec tsx --test features/workspace/public-repository-recommendation.test.ts`; `pnpm harness:check`; `pnpm lint`; `pnpm typecheck`; `pnpm build`.
- Note: running the full `apps/api/src/routes/ai.test.ts` file still shows two unrelated baseline failures in repository-template and template-selection assertions.

## Next Action

- Push or open a PR for the Repository URL and Template-first Repository Architecture Draft fixes.
