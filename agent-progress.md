# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `feat/ck/350-ai-diagram-fallback`.
- Latest `origin/dev` at `99db7f61` is merged, including the current dashboard UI/UX and Deployment/CI/CD console updates.
- Strict `audience-live-check` Repository evidence produces a minimal ECS Fargate architecture without unsupported persistence, autoscaling, or AWS-native CI/CD resources.
- Generated Terraform passes the Direct Deployment safety gate and `terraform validate` with AWS provider v6.54.0.
- Real Plan and Apply created 33 resources, the current Repository API and web builds worked through CloudFront and ECS, and cleanup finished as `DESTROYED` with direct AWS absence checks.

## Session Record

### 2026-07-14 - Structural AI diagram auto-layout

- Replaced fixed draft slots with a deterministic graph, containment, repeated-structure, support-lane, candidate-scoring layout engine; isolated AWS role and Area-size knowledge behind the first provider mapping.
- Added shared obstacle-safe route segments and quality metrics for resource overlap, sibling Area overlap, parent boundaries, edge crossings, resource and Area-title intersections, backward flow, route length, empty space, portrait canvas shape, repeated alignment, and main-flow continuity.
- Preserved saved resource positions/sizes/locks and explicit Template positions; a saved Area keeps its position and only grows when an added child would cross its boundary.
- Verified full resource identity, parameters, containment, and edge semantics are unchanged by layout; added a large failure-like multi-AZ VPC fixture plus Serverless and patch regressions.
- Chrome verification passed the 11-node Serverless fixture and the 18-resource VPC/ALB/Fargate/Data fixture with separate CI/CD, IAM, and Observability lanes. The live `/workspace/ai` generation request returned 503, so saved patch behavior is integration-tested but not claimed as live-screen verified.
- Verification: all 60 focused tests, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed; lint retains the existing Live Observation `setNow` warning. The full Web run passed 1,123/1,124 with the unrelated Korean day-period locale baseline producing `AM` instead of `오전`.
- No Terraform, deployment, cloud, push, or PR mutation was performed. Next action: restore the live AI endpoint and repeat the saved-Board patch screen check when the API is available.

### 2026-07-14 - Catalog diagram layout references

- Reviewed all 23 good and 9 failure images under `docs/diagram-layout-reference`.
- Added a linked README entry for every image with a reusable layout observation or a concrete readability failure.
- Omitted source metadata so the catalog focuses only on reusable layout observations and concrete readability failures.
- Verification: image-to-entry coverage is 32/32 and `pnpm harness:check` passed. Documentation only; no code, Terraform, deployment, or cloud mutation changed.

### 2026-07-14 - Refine Repository analysis controls

- Renamed the Repository start heading to `GitHub Repository` and the handoff connection section to `CI/CD Connection` in Korean UI copy.
- Prevented branch selection from colliding with URL analysis, replaced the large back action with a 32px icon control above the selected Template, and reduced question choices to compact content-width controls.
- Aligned question hover and selected visuals while retaining persistent radio state and accessible focus treatment.
- Chrome verification confirmed 12px gaps between URL, branch, and analysis controls; a 32x32 back control; 88x38 boolean choices; and matching hover/selected colors.
- Verification: focused Repository start regression, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed. Lint retains the pre-existing Live Observation `setNow` warning.

### 2026-07-13 - Clarify strict Repository Fargate network placement

- Replaced public task placement with two private app subnets while keeping the internet-facing ALB in the two public subnets.
- Added one cost-conscious NAT egress path so private tasks can pull ECR images and deliver CloudWatch logs without public IP assignment.
- Nested the ALB under its public-subnet security group and the visible Fargate runtime under its private-subnet task security group.
- Replaced ambiguous ECR and CloudWatch edges with explicit image-pull and `awslogs` labels, and labeled the SG-to-SG TCP 8080 rule.
- Added strict validation and regression assertions for subnet selection, public IP assignment, NAT count, containment, security-group rules, and non-duplicated Browser ingress.
- Verification: strict Repository regression and all 58 Architecture Draft tests passed; API typecheck passed; direct API-to-Board-to-Terraform conversion produced zero Terraform syntax diagnostics.
- Risk: Chrome visual verification was blocked by the expired local SketchCatch login. No deployment, Terraform apply/destroy, migration, or cloud mutation was performed.

### 2026-07-13 - Select analyzed public repository branches

- Removed the free-text branch field from the initial Repository URL start form.
- Resolved the first analysis revision from GitHub `default_branch`, with `main`, `master`, and first-branch fallbacks when metadata is unavailable.
- Added paginated public branch discovery to the analysis response and exposed it through the designed, keyboard-accessible shared SelectMenu after the first analysis.
- Reanalysis now sends the selected branch and refreshes evidence, recommendations, and the selected revision for that branch.
- Chrome verification confirmed a URL-only first form, `master` auto-selection for `octocat/Hello-World`, all three returned branches, and successful reanalysis on `test`.
- Verification: 3 focused API route tests, 20 focused Web tests, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `git diff --check` passed. Lint retains the pre-existing `setNow` warning in the Live Observation store contract.

### 2026-07-13 - Route Repository fallback into AI diagram chat

- Added the `원하는 구성이 없나요? AI로 새 설계 만들기` action below public Repository recommendations.
- Preserved the current project identity while routing to the dedicated pre-Board `/workspace/ai` conversation.
- Reused the Repository project on approval instead of creating a duplicate project; AI output remains a preview until the user accepts `Board에 적용`.
- Chrome verification confirmed the CTA, project-preserving `/workspace/ai` URL, dedicated conversation, empty PREVIEW, and absence of Board controls.
- Verification: 3 focused Web regressions, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm harness:check`, and `git diff --check` passed. Lint retains the pre-existing `setNow` warning in the Live Observation store contract.

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

- Merged `origin/dev` at `885c1a09`, including Template Design contracts and the separated Direct Deployment/CI/CD console.
- Combined load-balancer exclusion sizing with Repository CI/CD IAM role sizing and kept strict evidence authoritative over newly expanded Template resources.
- Preserved path-specific CloudFront/Kubernetes nested blocks and Resource AZ, Design AZ, physical containment, and conflicting-VPC diagnostics.
- Removed an automatic-merge duplicate in Terraform AZ synchronization while retaining existing Diagram parent hierarchy.
- Verification: 78 focused merge regressions, `pnpm harness:check`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `git diff --check` passed. Lint retains the pre-existing `setNow` warning.
- Risk: migrations `0032` and `0033` were not applied, and no cloud or deployment mutation was performed.

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

- Restore the live AI endpoint and repeat the saved-Board patch screen check when the API is available; no layout implementation continuation is required.
