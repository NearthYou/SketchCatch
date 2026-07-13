# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `feat/ck/350-ai-diagram-fallback`.
- Latest `origin/dev` at `99db7f61` is merged, including the current dashboard UI/UX and Deployment/CI/CD console updates.
- Strict `audience-live-check` Repository evidence produces a minimal ECS Fargate architecture without unsupported persistence, autoscaling, or AWS-native CI/CD resources.
- Generated Terraform passes the Direct Deployment safety gate and `terraform validate` with AWS provider v6.54.0.
- Real Plan and Apply created 29 resources, ALB `/health` returned HTTP 200, and cleanup finished as `DESTROYED` with AWS Console absence checks.

## Session Record

### 2026-07-14 - Catalog diagram layout references

- Reviewed all 23 good and 9 failure images under `docs/diagram-layout-reference`.
- Added a linked README entry for every image with a reusable layout observation or a concrete readability failure.
- Omitted source metadata so the catalog focuses only on reusable layout observations and concrete readability failures.
- Verification: image-to-entry coverage is 32/32 and `pnpm harness:check` passed. Documentation only; no code, Terraform, deployment, or cloud mutation changed.

### 2026-07-14 - Make strict Repository Fargate drafts application-delivery ready

- Added a private S3 origin contract with CloudFront OAC, public-access blocking, a scoped bucket policy, and a bootstrap `index.html` for the first infrastructure apply.
- Routed `/api/*` through the same public CloudFront HTTPS endpoint to the ALB HTTP origin, removing browser mixed-content failures without inventing an ACM domain.
- Added repository-derived AWS names, ECS runtime environment values, explicit log-group dependency, CI/CD delivery edges, and Terraform outputs for S3, CloudFront, ECR, ECS, and the unified API URL.
- Fixed the Architecture-to-Diagram adapter to prefer an explicitly authored Terraform resource type, preventing companion resources from inheriting invalid parent defaults such as `force_destroy` on `aws_s3_bucket_public_access_block`.
- Made optional frontend, ECR, CloudWatch, and GitHub Actions edges conditional so API-only evidence cannot produce dangling references to unsupported services.
- Chrome verification recreated `whiskend/audience-live-check`, saved 33 Terraform resources, passed pre-deployment checks, and completed an AWS-backed Plan with `+33 ~0 -0 +/-0`. No Apply or cloud mutation was run.
- Verification: all 59 Architecture Draft tests plus focused Terraform renderer, Repository request, and Diagram adapter tests passed; `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed. Full `pnpm test` reached 1,110/1,111 Web tests and retains the unrelated locale baseline where this Windows runtime formats the Korean day-period marker as `AM`.

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

### 2026-07-13 - Make strict Repository Fargate drafts Terraform-valid

- Goal: Remove unsupported inference from the `audience-live-check` draft and prove that its generated Terraform is valid before Direct Deployment.
- Completed:
  - Preserved authored Terraform resource and block identities when Architecture Drafts become DiagramJson, fixing the IAM policy attachment being rendered as `aws_iam_policy`.
  - Prevented Board and Template metadata from leaking into generated HCL.
  - Added nested-block rendering for ECR image scanning and CloudFront origin configuration.
  - Replaced incomplete CloudFront values with provider-valid origin, cache behavior, restriction, and default certificate blocks.
  - Removed the undeployable placeholder ACM certificate and exposed ALB TLS as a pending user-confirmed domain/certificate requirement.
  - Added an initial public 8080 `/health` smoke image so the first ECS deployment can stabilize before GitHub Actions publishes the repository image to ECR.
- Verification:
  - Focused Web adapter tests: 35 passed.
  - Focused Terraform graph/rendering tests: 16 passed.
  - Focused Architecture Draft tests: 58 passed.
  - Generated strict Repository Terraform passed the `demo_web_service_with_rds` safety gate.
  - `terraform init -backend=false` and `terraform validate` passed with AWS provider v6.54.0.
  - API/Web lint and typecheck passed; API lint retains the pre-existing unused `setNow` warning.
  - `pnpm build` passed.
- Risk:
  - Real Plan, Apply, health verification, and Destroy are pending because Chrome is logged out and every local AWS CLI profile has an expired session.
  - Root `pnpm test` still has unrelated existing Web failures in dashboard timezone, node-toolbar token, and mobile canvas-toolbar assertions; all changed-path tests pass.

### 2026-07-13 - Verify Repository Fargate precheck and live deployment

- Fixed subtype-aware pre-deployment requirements so `aws_iam_role_policy_attachment` validates `role` and `policyArn` instead of requiring an inline policy document.
- Expanded the generated AWS Connection execution policy for the ECS, ECR, ELB, CloudFront, Logs, and IAM operations used by the supported Fargate Template.
- Replaced the invalid nginx smoke configuration quoting with a shell-safe command and added structural regression coverage for the ECS entry point and command.
- Made single-task Fargate drafts emit CloudFront, ALB, target group, ECS cluster, and ECS service Terraform outputs without requiring autoscaling.
- Live evidence: pre-deployment findings 0; Plan `+22 ~0 -0 +/-0`; Apply SUCCESS; ALB `/health` returned `HTTP 200` with body `ok`; approved Destroy Plan `+0 ~0 -22 +/-0` completed without an error.
- AWS Console verification: CloudFront 0, ECS clusters 0, active task definitions 0, ECR repositories 0, ALBs 0, target groups 0, and CloudWatch log groups 0 after cleanup. Two older `sketchcatch-demo-vpc` leftovers were also removed; the verified connection role and AWS-managed service-linked roles were retained.
- Verification: 76 focused API tests, `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` passed. Lint retains the pre-existing unused `setNow` warning.

### 2026-07-14 - Prove strict Repository Fargate deploy and cleanup

- Goal: Correct the Repository-derived Fargate topology, prove Direct Deployment in AWS, and leave no deployment-owned infrastructure behind.
- Completed:
  - Placed the internet-facing ALB in two public subnets and the single Fargate task in two private app subnets with one explicit NAT egress path.
  - Added explicit ALB SG ingress, Task SG TCP 8080, ECR image-pull, CloudWatch log, and CI/CD control-plane labels while keeping unsupported persistence and scale-out resources absent.
  - Removed visual `tier` metadata from Terraform arguments before rendering.
  - Raised Plan and Destroy Plan execution from the generic 60-second command limit to the 15-minute deployment mutation limit.
  - Allowed state-backed cleanup to be replanned and destroyed after a cleanup Plan failure.
  - Preserved generated Terraform `output` blocks through virtual-file routing and accepted them as non-Diagram configuration during validation and sync.
- Live verification:
  - Pre-deployment check returned zero findings.
  - Plan completed with `29 to add`; Apply completed with 29 resources; ALB `/health` returned HTTP 200 and `ok`.
  - An interrupted first cleanup removed 14 resources. The corrected cleanup Plan completed after 126.6 seconds with 15 remaining resources, and Destroy finished with `15 destroyed` and deployment status `DESTROYED`.
  - AWS Console showed CloudFront 0, ECS clusters 0, ALBs 0, ECR repositories 0, CloudWatch log groups 0, the deployment S3 bucket at 0 matches, both IAM roles at 0 matches, and no matching VPC or EIP. The NAT Gateway remains only as an AWS `Deleted` history row.
- Verification:
  - 15 focused deployment Plan/Destroy API tests passed.
  - 23 deployment action tests passed.
  - 92 Terraform diagnostics/sync tests passed.
  - 25 Terraform virtual-file and palette pipeline tests passed.
- Risk:
  - The successful live artifact predated the output-preservation fix. Regression tests prove the corrected artifact path; a future deployment will persist Live Observation outputs without requiring another AWS mutation in this session.

## Next Action
- Use the Git/CI/CD handoff to replace the bootstrap web object and smoke ECS revision with the repository build artifacts before production traffic.
