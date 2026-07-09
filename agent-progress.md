# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `feat/ck/287-ai-diagram`.
- Current scope: make AI architecture drafts and patch previews use the shared left-panel Terraform resource catalog as selectable generation material.
- The shared catalog now has ResourceType values for formerly UNKNOWN panel resources including caller identity, SSM Parameter, CodeBuild, CodeDeploy, CodePipeline, and CodeStar connection.
- The AI draft prompt, top-level payload, and referenceKnowledge payload now receive the same generated resource catalog.
- Generated CI/CD resources now carry deploy-ready default config guidance and pass Terraform Preview, diagnostics, and live apply safety support checks.
- Amazon Q preview self-validation now rejects missing explicitly requested resource-panel types and undersized EC2 fleets before accepting a draft.
- Amazon Q preview self-validation now also rejects no-upload violations, disconnected ALB/ASG/EC2 runtime paths, EC2 fleets not distributed across requested private subnets, and EC2 fleets visually grouped into one private subnet box.
- Architecture Drafts can now optionally use OpenAI as a Requirement Normalizer before Amazon Q; Amazon Q remains the diagram generator and deterministic validation remains the acceptance gate.
- Targeted API tests plus full lint/typecheck/build passed during this session.
- No Terraform apply/destroy, deployment, AWS calls, or cloud mutation was run.

## Session Record

### 2026-07-10 - AI EC2 subnet visual placement guardrail

- Goal: Fix AI draft outputs that kept showing EC2 fleets visually grouped in one subnet, disconnected ASG/ALB placement, and upload/media buckets from neutral file answers.
- Completed:
  - Added Amazon Q preview validation for EC2 fleets that are semantically split by subnet references but visually placed inside only one private subnet box.
  - Updated the workspace ArchitectureJson adapter so EC2 nodes with explicit `subnetId` are not forced into a shared security-group parent when that would collapse multiple subnet placements into one visual area.
  - Treated neutral file answers such as "file is anything / not related to EC2" as non-upload requirements and stopped content/reservation purpose buckets unless `file_upload` is actually selected.
  - Added API and web regression tests for visual subnet spread, neutral file answers, and shared-security-group EC2 subnet placement.
- Verification:
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/aiArchitectureDrafts.test.ts` passed.
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-ai-diagram-adapter.test.ts` passed.
  - `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed.
- Risk:
  - No real AWS, Terraform apply/destroy, deployment, or Git/CI/CD handoff was run.

### 2026-07-10 - OpenAI requirement normalizer for Amazon Q drafts

- Goal: Let AI Architecture Drafts use OpenAI only to normalize user requirements before Amazon Q generates the diagram.
- Completed:
  - Added an opt-in OpenAI Requirement Normalizer provider controlled by `AI_ARCHITECTURE_REQUIREMENT_NORMALIZER=openai`.
  - Added a sanitized `ArchitectureIntentPlan` contract for required resources, resource quantities, forbidden capabilities, runtime topology, region, database, availability, and Amazon Q brief lines.
  - Sent normalized requirements to Amazon Q payloads and prompts while keeping Amazon Q as the diagram generator.
  - Extended Amazon Q preview self-validation so normalized required resources, quantities, forbidden file upload capability, and ALB/ASG/EC2 topology are enforced before accepting a draft.
  - Added regression coverage for the normalizer-to-Amazon-Q contract and repair payload validation issues.
- Verification:
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/aiArchitectureDrafts.test.ts` passed.
  - `pnpm --filter @sketchcatch/api typecheck` passed.
  - `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed.
- Risk:
  - The OpenAI normalizer is opt-in and is not a deployment or cloud mutation path. No Terraform apply/destroy, deployment, AWS calls, or cloud mutation was run.

### 2026-07-10 - AI draft runtime topology validation

- Goal: Stop accepting Amazon Q diagrams that place requested CI/CD and runtime resources as disconnected icons or contradict selected questionnaire answers.
- Completed:
  - Added runtime topology validation for ALB to ASG/EC2 traffic paths.
  - Added ASG-to-EC2 fleet validation when ASG is requested as part of an EC2 runtime.
  - Added private subnet spread validation for prompts that request EC2 placement across two private subnets.
  - Expanded no-file-upload detection for Korean answers such as `파일 업로드는 없고`.
  - Prevented `관리 복잡도` and `간단한 데이터` from being misread as complex backend or low-budget signals.
- Verification:
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/aiArchitectureDrafts.test.ts src/services/aiArchitectureResourceQuantities.test.ts` passed.
  - `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed.
- Risk:
  - This changes deterministic AI preview validation only. No Terraform apply/destroy, deployment, AWS calls, or cloud mutation was run.

### 2026-07-10 - AI draft explicit resource validation

- Goal: Prevent Amazon Q drafts from accepting diagrams that only partially satisfy explicit CI/CD and multi-EC2 resource requests.
- Completed:
  - Fixed explicit EC2/S3 quantity parsing for Korean and English count phrases such as `EC2 3대` and `3 EC2 instances`.
  - Added Amazon Q preview validation for missing explicitly requested supported resource-panel types.
  - Added Amazon Q preview validation for requested EC2 fleet counts that are not visible in the returned ArchitectureJson.
  - Updated detailed-brief test fixtures so required ASG/VPC resources are actually represented.
- Verification:
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/aiArchitectureResourceQuantities.test.ts src/services/aiArchitectureDrafts.test.ts` passed.
  - `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed.
- Risk:
  - This is deterministic validation only. No Terraform apply/destroy, deployment, AWS calls, or cloud mutation was run.

### 2026-07-10 - AI draft resource-panel catalog coverage

- Goal: Let the AI auto draft and diagram patch flow generate every Terraform resource from the main left resource panel as catalog-backed resources.
- Completed:
  - Added ResourceType coverage for previously UNKNOWN panel resources.
  - Sent the shared resource panel catalog to Amazon Q draft prompts and payloads.
  - Updated deterministic fallback drafts to add explicitly requested panel resources with exact Terraform resource/data metadata.
  - Updated patch preview add-resource recognition to derive keywords from the shared catalog.
  - Preserved AI-provided `config.terraformResourceType` during web ArchitectureJson to DiagramJson conversion.
  - Added API and web regression tests for catalog-backed automatic draft, patch preview, and diagram conversion behavior.
- Verification:
  - `pnpm --filter @sketchcatch/api typecheck` passed.
  - `pnpm --filter @sketchcatch/web typecheck` passed.
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/aiArchitectureDrafts.test.ts src/services/aiArchitecturePatchPreview.test.ts` passed.
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-ai-diagram-adapter.test.ts` passed.
  - `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed.
- Risk:
  - This changes draft selection and patch recognition only; no deployment or cloud mutation was run.

### 2026-07-10 - AI generated resource catalog payload sync

- Goal: Ensure the resource information sent to AI includes the newly generatable resource-panel items.
- Completed:
  - Extracted a shared API-side generated resource catalog helper from shared resource definitions.
  - Reused the same catalog in the Amazon Q draft prompt, top-level payload, and `referenceKnowledge.generatedResourceCatalog`.
  - Added payload assertions for CodeBuild, CodeDeploy, CodePipeline, and SSM Parameter catalog entries.
- Verification:
  - `pnpm --filter @sketchcatch/api typecheck` passed.
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/aiArchitectureDrafts.test.ts` passed.
  - `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed.
- Risk:
  - Payload size increases because referenceKnowledge now carries the generated resource catalog, but it stays derived from the shared compact resource definitions.

### 2026-07-10 - AI-generated resource deployment readiness

- Goal: Make newly generatable AI resources deploy-ready by SketchCatch Terraform Preview and deployment safety standards.
- Completed:
  - Added deployment default config and deployment notes to the shared AI resource catalog for CI/CD and data-source resources.
  - Reused deployment defaults in deterministic fallback drafts and architecture patch previews.
  - Allowed CodeBuild, CodeDeploy, CodePipeline, CodeStar connection, IAM role companions, caller identity, and SSM parameter through deployment support checks.
  - Added Terraform Preview, diagnostics, resource definition, plan summary, and artifact safety tests for the generated CI/CD/data-source resources.
- Verification:
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-preview.test.ts src/deployments/terraform-artifact-safety.test.ts src/deployments/deployment-plan-summary.test.ts src/services/terraform/resource-definitions-source-shape.test.ts src/services/aiArchitectureDrafts.test.ts src/services/aiArchitecturePatchPreview.test.ts` passed.
  - `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed.
- Risk:
  - No Terraform apply/destroy or AWS API call was run. Some AWS resources still require real user-owned IAM policy scope, repository IDs, and CodeStar connection authorization before a production apply.

### 2026-07-10 - Merge latest dev into AI fixed-response removal branch

- Goal: Bring latest `dev` into `chore/ck/281-delete-code-diagram`.
- Completed:
  - Fetched `origin` and fast-forwarded local `dev` from `7487b3b2` to `7ed51f19`.
  - Merged local `dev` into `chore/ck/281-delete-code-diagram`.
  - Resolved conflicts in `agent-progress.md`, `apps/web/features/workspace/workspace-ai-diagram-adapter.ts`, and `packages/types/src/index.ts`.
  - Kept upstream `diagramBorderStyle` support while preserving this branch's removal of fixed SketchCatch reference marker behavior.
  - Combined upstream expanded ResourceType coverage with this branch's runtime `RESOURCE_TYPES` constant.
- Verification:
  - `pnpm --filter @sketchcatch/api exec tsx --test src/routes/aiDesignSimulation.test.ts src/routes/aiAwsProviders.test.ts` passed.
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-ai-diagram-adapter.test.ts` passed.
  - `pnpm --filter @sketchcatch/api typecheck` passed.
  - `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed.
- Risk:
  - Merge resolution touched shared types and workspace diagram conversion, but focused API/web tests and full checks passed.

### 2026-07-09 - AI fixed-response removal and ResourceType validation fix

- Goal: Let Amazon Q generate web deployment answers instead of using a hardcoded selected-answer code/diagram path.
- Completed:
  - Removed fixed selected-answer SketchCatch web deployment draft, fixed diagram fixture, and fixed Terraform Preview marker override.
  - Removed web-side fixed-reference layout bypass so ArchitectureJson drafts use the normal diagram conversion pipeline unless an exact `diagramJson` is returned.
  - Fixed intermittent AI chat 400s caused by stale route-level ResourceType enums rejecting generated ArchitectureJson nodes such as `LOAD_BALANCER`.
  - Promoted the shared ResourceType list to a runtime `RESOURCE_TYPES` constant and reused it in AI, project architecture, and Reverse Engineering route validation.
- Verification:
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/aiArchitectureDrafts.test.ts` passed.
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-preview.test.ts` passed.
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-ai-diagram-adapter.test.ts` passed.
  - `pnpm --filter @sketchcatch/api exec tsx --test src/routes/aiDesignSimulation.test.ts src/routes/aiAwsProviders.test.ts` passed after the ResourceType schema fix.
  - `pnpm --filter @sketchcatch/api typecheck` passed.
  - `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm harness:check` passed before the latest dev merge.
- Risk:
  - No real AWS IAM, IAM Identity Center, CloudFormation, Terraform apply, Terraform destroy, or deployment mutation was performed.

### 2026-07-10 - Upstream dev context

- `dev` includes ECS/Fargate foundation Terraform under `infra/aws/terraform`.
- `dev` includes expanded AWS resource catalog/type coverage and workspace UI/UX refinements.
- Known upstream ECS follow-up remains: image publishing, GitHub Actions rewrite, task secrets, Route53 cutover, and Terraform plan/apply are future work.
