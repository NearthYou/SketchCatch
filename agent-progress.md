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

### 2026-07-13 - Merge latest dev into AI diagram fallback branch

- Fast-forwarded `feat/ck/350-ai-diagram-fallback` to latest `origin/dev`.
- Reapplied the stashed Template-unselected AI fallback work after conflicts in API route, Repository start UI, CSS, data model docs, and progress log.
- Kept the latest Repository Analysis recommendation flow from `dev` and restored the fallback request resolver, UI CTA, and documentation contract.
- Verification: `pnpm harness:check`, `pnpm --dir apps/api exec tsx --test src/routes/ai-repository-handoff.test.ts`, `pnpm --dir apps/web exec tsx --test features/workspace/repository-template-fallback.test.ts app/workspace/repository/repository-start-client.test.ts`, `pnpm typecheck`, `pnpm lint`, and `pnpm build` passed. Lint retained one pre-existing API unused-argument warning in `apps/api/src/live-observations/live-observation-store-contract.ts`.

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

## Next Action

- Decide whether public Repository board creation should remain AI-assisted Template generation or be changed to full Architecture Draft AI generation after stabilizing `/ai/architecture-draft` provider/runtime requirements.

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
