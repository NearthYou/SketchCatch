# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `feat/ck/287-ai-diagram`.
- Local `dev` and `origin/dev` point to `4d48f3f1`; latest Trivy scanner and production infrastructure check updates are merged into this branch.
- Architecture Draft uses Amazon Q retrieval evidence, deterministic deployable materialization, NDJSON progress streaming, and containment-aware board layout.
- The current uncommitted work makes Security Groups render as regular VPC-scoped resources while keeping subnet placement as the workload containment source of truth, and is verified.
- No cloud deployment or Terraform mutation was run during this merge.

## Session Record

### 2026-07-11 - Add strict Architecture PatchPlan contract

- Goal: Convert natural-language edit requests into a strict JSON PatchPlan before any Architecture preview mutation.
- Completed:
  - Added shared `ArchitecturePatchPlan` and `JsonValue` types with allowed actions, operations, target, preserve paths, clarification question, and confidence.
  - Added `createArchitecturePatchPlan` as a pure planner that does not mutate ArchitectureJson or invent resource IDs.
  - Enforced conservative target resolution: multiple matching resources return `needs_clarification` instead of choosing one.
  - Planned EC2 relative sizing as `increase_one_step`, DB storage edits as `set_value config.allocatedStorage`, and explicit replacement wording as `unsupported`.
  - Attached `patchPlan` to patch preview and clarification responses for auditability while preserving the existing user-accepted preview flow.
  - Updated `docs/data-models.md` to document the PatchPlan DTO.
- Verification:
  - Full API patch preview tests passed 35/35.
  - `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed.
- Risk:
  - Existing preview generation still supports legacy add-resource bundles; the new strict planner is exposed alongside the preview path and can be used to tighten future application semantics.

### 2026-07-11 - Fix EC2 instance-type patch replacement

- Goal: Stop natural-language EC2 instance-size edits from replacing the selected EC2 node with a new default EC2 bundle.
- Completed:
  - Reproduced the Chrome-visible issue: the existing board already contained an old scattered `EC2 INSTANCE` node from a prior bad replacement preview.
  - Reproduced the backend bug with `ec2에서 인스턴스 타입 더 큰거로 바꿔줘`: the selected `t3.small` EC2 was removed and replaced by a new `t3.micro` EC2 bundle.
  - Routed EC2 instance-type and relative size wording away from replacement parsing and into in-place parameter modification.
  - Added deterministic EC2 size stepping so `t3.small` upsizes to `t3.medium` while preserving subnet and coordinates.
  - Preserved existing DiagramJson geometry, z-index, and parent area metadata when frontend patch previews update existing node parameters.
- Verification:
  - Full API patch preview tests passed 31/31.
  - Full workspace patch preview tests passed 3/3.
  - Direct backend check for the reported Korean request returned one `modify_resource` change for `ec2-1`, `instanceType: t3.medium`, unchanged subnet, and no new EC2 node.
  - `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed.
- Risk:
  - Existing saved boards that already accepted the old bad replacement keep the stray EC2 node until manually cleaned or regenerated.

### 2026-07-11 - Merge latest dev into AI diagram branch

- Goal: Update `dev` and integrate it into `feat/ck/287-ai-diagram` without losing local AI diagram work.
- Completed:
  - Integrated the production ECS cutover, worker isolation, and rollback workflow safeguards from `origin/dev`.
  - Preserved the 120-second ALB timeout together with invalid-header dropping.
  - Preserved AI normalizer and Q retrieval environment settings in the refactored ECS API/worker environment model.
  - Preserved both AI-generated CI/CD live-apply support and legacy S3 Public Access Block artifact compatibility.
- Verification:
  - Deployment plan summary tests (7), restored API tests (50), restored web adapter tests (41), catalog check, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm harness:check`, Terraform format, initialization, and validation passed.
- Risk:
  - No cloud mutation was run while integrating the production changes.

### 2026-07-11 - Fix DB-free mobile API diagram generation

- Goal: Make the low-budget Korean mobile API questionnaire produce a readable DB-free Architecture Draft instead of a noisy VPC/RDS/Terraform-helper diagram.
- Completed:
  - Treated the final `DB without` decision as authoritative over earlier data-size answers.
  - Forced low-budget DB-free API answers into an API Gateway plus Lambda serverless topology with image-upload S3 and CloudWatch observability.
  - Removed RDS, DB subnet groups, database security groups, database Secrets Manager credentials, and database labels when the user excludes the database.
  - Added polling cost-warning assumptions and edge labels for simple polling notification answers.
  - Hid API Gateway method/resource/integration/deployment/stage Terraform helper nodes from the rendered board and right resource list while preserving the REST API and Lambda resources.
- Verification:
  - Focused Architecture Draft service tests passed 46/46.
  - Focused web flow-mapper tests passed 30/30.
  - Focused resource-list summary tests passed 8/8.
  - `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed.
- Risk:
  - Existing saved boards keep their old generated resources until the draft is regenerated or replaced.

### 2026-07-11 - Fix inferred global SPA Architecture Draft resources

- Goal: Diagnose a representative questionnaire-generated diagram and fix missing topology/resource/parameter coverage.
- Completed:
  - Added backend inference when SPA answers imply backend work through database, upload, realtime, self-managed EC2, large database, or large traffic signals.
  - Recognized `single primary AWS region` and `CDN warning` as an explicit global deployment scope decision.
  - Recognized `event burst spikes` as bursty traffic and preserved larger EC2 fleet sizing instead of overwriting it with a default quantity.
  - Required CloudFront plus S3 static delivery for global/CDN/fast SPA answers and verified CloudFront-to-static-S3 origin edges.
  - Confirmed the generated diagnostic plan materializes CloudFront, two S3 buckets, ALB HTTPS listener, WebSocket API Gateway path, four `m7i.large` EC2 fleet nodes, ASG max 12, and 200GB `db.r6g.large` Multi-AZ RDS.
- Verification:
  - Focused diagnostic generation scripts inspected ArchitectureJson, DiagramJson, key resources, parameters, and edge checks.
  - Architecture Draft service tests passed 47/47.
  - `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed.
- Risk:
  - Existing saved boards keep old generated topology until regenerated or replaced.

### 2026-07-11 - Fix fully managed serverless SPA diagram diagnostics

- Goal: Restart the questionnaire-generation diagnosis with a new representative scenario and fix diagram, resource, and parameter issues found end to end.
- Completed:
  - Generated a small fully managed React SPA community-board scenario with simple API, DB included, image uploads, and polling notifications.
  - Diagnosed the generated ArchitectureJson, DiagramJson, rendered helper visibility, and right-panel resource-list validity.
  - Mapped fully managed simple API SPA answers to an explicit API Gateway plus Lambda serverless pattern without leaking EC2, ALB, ECS, or RDS.
  - Used DynamoDB for simple serverless persistence, kept CloudFront plus static S3 for the SPA shell, kept a separate image-upload S3 bucket, and preserved a polling cost-warning edge.
  - Added CloudFront and DynamoDB Terraform-required parameter defaults and ensured serverless Lambda has a matching IAM role while low-signal helper nodes stay hidden.
- Verification:
  - Restart diagnostic script passed with no issues, no visible helper nodes, and zero invalid resource-list items.
  - Architecture Draft service tests passed 48/48.
  - `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed.
- Risk:
  - Existing saved boards keep old generated topology until regenerated or replaced.

### 2026-07-11 - Repeat Architecture Draft diagnostics across static, CI/CD, and mobile API paths

- Goal: Run three more questionnaire-generation diagnostic passes, focusing on paths that had not been heavily corrected yet.
- Completed:
  - Diagnosed static portfolio, Git/CI/CD EC2 handoff, and APAC mobile API with voice transcription prompts through ArchitectureJson, DiagramJson, and right-panel resource-list validity checks.
  - Fixed static no-backend answers that previously materialized as an empty architecture by requiring CloudFront plus S3 static delivery.
  - Fixed Git/CI/CD handoff answers so natural CI/CD wording materializes CodeStar Connection, CodePipeline, CodeBuild, CodeDeploy, S3 artifacts, and the EC2 ASG runtime together.
  - Fixed APAC semi-managed mobile API answers with DB/upload/bursty traffic so they use ECS Fargate instead of a bare EC2 topology that failed ASG validation.
  - Filled EC2 fleet instance parameters and converted ALB listener and ASG nested blocks to catalog-valid Terraform shapes.
- Verification:
  - Three-scenario diagnostic script passed with zero invalid resource-list items and zero dangling diagram edges.
  - Architecture Draft service tests passed 51/51.
  - `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed.
- Risk:
  - Existing saved boards keep old generated topology until regenerated or replaced.

### 2026-07-11 - Fix DB-free serverless preview scaffold cleanup

- Goal: Diagnose the DB-free SSR/serverless questionnaire screenshot where VPC, subnet, NAT, and helper-looking resources were scattered away from the actual API flow.
- Completed:
  - Reproduced the issue with an Amazon Q preview response that mixed a valid API Gateway/Lambda/CloudFront/S3 path with unconnected VPC, subnet, and NAT scaffold nodes.
  - Added provider-preview sanitation that removes orphan VPC networking scaffolds when the accepted requirement excludes databases and the preview is otherwise API Gateway/Lambda serverless with no VPC-bound runtime.
  - Kept EC2/ALB runtime contradictions in the self-validation path so regeneration prompts still explain hard topology violations instead of silently deleting core runtime nodes.
  - Filled missing Lambda Terraform parameters without creating an extra visible IAM role node, using `var.lambda_execution_role_arn` for the required role input.
  - Added regression coverage proving the bad provider preview returns only API Gateway, Lambda, CloudFront, S3, CloudWatch, valid Lambda parameters, and no dangling edges.
- Verification:
  - Focused Architecture Draft service tests passed 52/52.
- Risk:
  - Existing saved boards keep old scattered preview resources until the Architecture Draft is regenerated.

### 2026-07-11 - Fix workspace preview adapter network scaffold leak

- Goal: Fix the Chrome-visible case where the running API no longer returned VPC resources, but the workspace preview still showed VPC, subnet, internet gateway, route table, and security group scaffold nodes.
- Completed:
  - Verified in Chrome that the workspace was still rendering stale preview/network scaffold nodes after the backend fix.
  - Confirmed the current local `/api/ai/architecture-draft` response has no `VPC`, `SUBNET`, or `NAT_GATEWAY` in `architectureJson` and no server-provided `diagramJson`.
  - Added frontend adapter sanitation in `convertArchitectureJsonToDiagramJson` and `normalizeDiagramJsonConventions` to remove orphan network scaffold nodes when a diagram is API Gateway plus Lambda serverless and has no VPC-bound runtime.
  - Kept external user/internet flow nodes while removing VPC, subnet, internet gateway, route table, route table association, NAT, EIP, VPC endpoint, and security group scaffold nodes when they are not connected to a real runtime dependency.
  - Added a focused workspace adapter regression test for already-created serverless preview diagrams containing orphan network scaffold nodes.
- Verification:
  - Focused new workspace adapter regression test passed.
  - Local `/api/ai/architecture-draft` end-to-end check passed for the reported Korean questionnaire prompt: backend `architectureJson` and frontend-converted `DiagramJson` both contained no VPC, subnet, route table, security group, DB, EC2, or ALB resources and had zero dangling edges.
  - Next.js Architecture Draft proxy test passed, and workspace apply-path coverage confirmed accepted drafts use `getDiagramJsonForArchitectureDraft(draft)` before `applyDiagramJson`.
  - `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm harness:check` passed.
- Risk:
  - The full `workspace-ai-diagram-adapter.test.ts` file still has pre-existing accumulated layout/name expectation failures unrelated to this new scaffold filter; the new targeted regression passes.

### 2026-07-11 - Connect Architecture Patch Preview through the frontend API route

- Goal: Verify that natural-language board edits such as resource additions and parameter changes reach the backend patch service and render as frontend previews.
- Completed:
  - Found that the web client posts patch edit requests to `/api/ai/architecture-patch-preview`, but the Next.js API proxy route was missing while the backend Fastify route existed.
  - Added the Next.js `architecture-patch-preview` proxy route to forward edit requests to backend `/api/ai/architecture-patch-preview`.
  - Added route coverage that preserves preview and clarification responses from the backend.
  - Verified the patch flow end to end with add-resource and modify-resource requests: backend `proposedArchitectureJson` added S3 resources and updated Lambda timeout/memory values, while the frontend patch preview model marked nodes as added or modified and carried the changed parameter values into `DiagramJson`.
  - Verified live `localhost:3000/api/ai/architecture-patch-preview` requests for S3 addition and Lambda parameter changes.
- Verification:
  - `pnpm --dir apps/web exec tsx --test app/api/ai/architecture-patch-preview/route.test.ts`
  - Focused API patch preview service tests for add and modify cases passed.
  - `pnpm --dir apps/web exec tsx --test features/workspace/workspace-ai-patch-preview.test.ts`
  - Focused web API client patch preview test passed.
  - `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm harness:check` passed.
- Risk:
  - Existing boards need a fresh patch request for the new proxy route to be used.

### 2026-07-11 - Fix DB storage patch intent routing

- Goal: Fix the edit flow where `db storage 200` asked the user to choose between S3 buckets instead of modifying the RDS database storage.
- Completed:
  - Reproduced the exact failure with a board containing two S3 buckets and one RDS database.
  - Added a regression test proving DB/RDS storage wording resolves to the RDS node and updates `allocatedStorage`.
  - Prioritized `db/database/rds + storage` wording as an RDS patch intent before generic storage/S3 matching.
  - Expanded RDS storage parsing to handle Korean shorthand such as `스토리지 200으로`, not only `200GB`.
  - Verified the live frontend proxy path returns `status: preview`, `resourceType: RDS`, no S3 candidates, and `allocatedStorage: 200`.
- Verification:
  - Focused DB storage regression test passed.
  - Full `aiArchitecturePatchPreview.test.ts` passed 29/29.
  - `aiAwsProviders.test.ts`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm harness:check` passed.
- Risk:
  - Existing failed clarification prompts in an open chat should be retried with a fresh edit request.

### 2026-07-11 - Stabilize S3 delete patch acceptance saves

- Goal: Diagnose intermittent failures where `s3 delete` sometimes did not persist after accepting the patch preview.
- Completed:
  - Verified API patch generation is deterministic: Korean `s3 삭제해줘` returned the same S3 remove preview 5/5 times through the live frontend proxy path.
  - Added regression coverage for Korean S3 delete requests with a single S3 node and with an explicitly selected S3 target.
  - Found the intermittent path in project draft persistence: manual save requests during an in-flight server save reused the old save promise and could miss a newly accepted delete patch.
  - Extended the server save-flight helper so manual saves queued during an in-flight save run one follow-up save when the draft is still dirty after the current save finishes.
  - Wired `ProjectWorkspaceDraftManager` manual saves to use that follow-up behavior, so accepted AI patch deletes are persisted after an overlapping save completes.
- Verification:
  - Full `aiArchitecturePatchPreview.test.ts` passed 30/30.
  - `project-draft-save-flight.test.ts`, `workspace-ai-patch-preview.test.ts`, focused workspace save source test, live 5-run S3 delete HTTP check, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed.
- Risk:
  - If an existing browser tab already has a failed delete clarification or stale preview, send a fresh delete request after the app reloads.

## Next Action

- 2026-07-11 update: Removed Security Groups from all board container paths so generated, saved, and manually added security groups render as regular VPC-scoped resource icons. Workload containment now prioritizes `subnetId` or explicit subnet references, while Security Groups remain visible through protection/allow edges and parameter references. Multi-subnet workloads keep placement markers instead of being forced into one subnet. Verification passed with focused flow, area, catalog, movement, workspace adapter, and API prompt tests, full API Architecture Draft tests, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm harness:check`.
- 2026-07-11 update: Updated local `dev` to `origin/dev` at `4d48f3f1` and merged it into `feat/ck/287-ai-diagram`. Resolved the only conflict in `agent-progress.md` by preserving both the latest Trivy/production history from `dev` and the AI diagram branch history. Verification passed with `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build`.
- 2026-07-11 update: Updated local `dev` to `origin/dev` at `a1031c4b` and merged it into `feat/ck/287-ai-diagram` with merge commit `cb5cddc5`. Resolved conflicts by taking the retired workflow/history deletions from `dev`, keeping the latest Workspace start UI from `dev`, combining Live Observation API error codes with architecture generation error codes, and preserving the AI diagram external-flow/subnet-placement adapter behavior. Fixed post-merge typecheck issues in runtime cache test stubs and Terraform nested-block metadata. Verification passed with `pnpm harness:check`, focused API architecture tests, `pnpm lint`, `pnpm typecheck`, and `pnpm build`.
- 2026-07-11 update: Fixed the Korean SSR dynamic web-app questionnaire path so Seoul semi-managed simple API answers produce ECS Fargate instead of EC2, keep SSR behind an ALB-origin CloudFront entry, use HTTPS/ACM, keep Multi-AZ RDS in `ap-northeast-2`, materialize mixed-file uploads as `sketchcatch-file-uploads-*` instead of image-only buckets, and label SSE notification paths without chat POST semantics. Added regression coverage for the SSR mixed-upload questionnaire and SSE notification validation. Verification passed with focused API tests, `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and final `pnpm harness:check`.
- 2026-07-11 update: Fixed the Korean SPA questionnaire Architecture Draft path so APAC semi-managed simple API answers produce a consistent ECS Fargate, CloudFront/S3, Multi-AZ RDS, image-upload, HTTP+SSE topology without mixing Seoul regions with Tokyo AZs. Added regression coverage for operational parsing, requirement resolution, and canonical draft materialization. Verification passed with focused API tests, `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and final `pnpm harness:check`.
- 2026-07-11 update: Fixed the SPA APAC microservices questionnaire path so fully managed/serverless, time-of-day traffic, mixed uploads, no realtime, and 99.99% availability produce separated ECS Fargate services, task definitions, target groups, and per-service autoscaling instead of one generic ECS service. Added cost-sensitive budget warnings for 10-50 manwon microservices/HA designs while preserving the existing $100 low-budget warning contract. Regression coverage now verifies answer-profile parsing, normalized resource quantities, service separation, upload bucket selection, no realtime edges, and APAC region placement. Verification passed with focused API tests, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm harness:check`.
- 2026-07-11 update: Collapsed low-signal parameter/helper resources from the rendered Architecture Board while preserving them in `DiagramJson` for Terraform and parameter workflows. App Auto Scaling target/policy, route table association, DB subnet group, ACM validation, IAM policy/profile, KMS alias, Lambda permission, and target group attachment nodes no longer render as separate board icons, and edges to those collapsed helpers are hidden from React Flow. Verification passed with focused web flow-mapper tests, focused API architecture tests, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm harness:check`.
- 2026-07-11 update: Fixed the global self-managed SPA questionnaire path so direct server operation selects the ALB + EC2 Auto Scaling pattern instead of Fargate, large traffic materializes four EC2 nodes with larger launch-template sizing, large/complex databases use 200GB `db.r6g.large` Multi-AZ RDS, and WebSocket API Gateway resources receive route, integration, and stage parameters. Regression coverage now verifies the global/large/self-managed/WebSocket questionnaire and updated deterministic canonical materialization. Verification passed with focused API architecture tests, operational requirement tests, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm harness:check`.
- 2026-07-11 update: Fixed the large self-managed API-server questionnaire path so burst/polling traffic no longer materializes as `t3.small` with ASG max 4 and `db.t4g.small`. The canonical EC2 plan now keeps four EC2 nodes, uses `m7i.large`, raises aggressive ASG max capacity to 12, switches bursty enterprise scaling to target tracking, sizes simple-but-large-traffic RDS to 50GB `db.r6g.large` Multi-AZ, and labels polling edges with a cost warning assumption. Regression coverage now verifies the API-server polling questionnaire and the updated global self-managed max capacity. Verification passed with focused API architecture tests, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm harness:check`.
- Regenerate representative chat, voice, burst, and high-availability diagrams in Chrome and review their Terraform previews before user acceptance.
