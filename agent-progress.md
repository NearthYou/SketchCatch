# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `feature/sw/288-ecs-deploy-workflow`.
- Active workstream: `ECS-MIGRATION-000`, Phase 2 deploy workflow.
- Phase 1 ECS/Fargate foundation is merged into `dev` and applied in AWS account `555980271919`.
- Terraform backend: `s3://sketchcatch-terraform-state-555980271919-ap-northeast-2/production/ecs-foundation/terraform.tfstate`.
- ECS service `sketchcatch-production-app` exists with `desiredCount=0`, `runningCount=0`, and `pendingCount=0`; Route53 cutover has not happened.
- Phase 2 must add ECR push and ECS service update workflow support without running a live deploy from local tooling.
- Phase 2 implementation added a manual ECS deploy workflow, documented required variables, and kept the EC2/SSM workflow intact as rollback.

## Session Record

### 2026-07-10 - Start ECS Phase 2 deploy workflow

- Goal: Implement Phase 2 only: ECR push and ECS service update workflow while preserving EC2/SSM rollback.
- Completed:
  - Created GitHub issue #288 for Phase 2.
  - Created linked branch `feature/sw/288-ecs-deploy-workflow` with `gh issue develop` from `dev`.
  - Read `docs/sw/spec.md`, `docs/sw/plan.md`, and `docs/sw/agents.md` for ECS migration constraints.
  - Added `.github/workflows/deploy-ecs.yml` as a separate manual ECS workflow that builds api/web/nginx images, pushes them to ECR, renders a new task definition revision, and updates the ECS service.
  - Kept `.github/workflows/deploy.yml` unchanged as the EC2/SSM rollback path.
  - Updated `infra/aws/iam/github-actions-deploy-policy.json` with ECR push, ECS service update/task-definition registration, and ECS task-role pass permissions.
  - Updated `docs/deployment.md` with the Phase 2 ECS deployment flow and required GitHub variables.
- Verification:
  - `pnpm harness:check` passed before Phase 2 edits.
  - JSON policy parsing passed with Node.
- Risk:
  - No live ECS deploy, AWS apply, Route53 change, or cloud mutation should be run during Phase 2 implementation.
  - ECS smoke still requires ECR images, task secrets, and an explicit desired count change in a later step.

### 2026-07-10 - ECS foundation Terraform plan/apply attempt

- Goal: Intentionally run Terraform plan/apply for the merged ECS/Fargate foundation.
- Completed:
  - Fast-forwarded local `dev` to latest `origin/dev`.
  - Initialized the S3 backend with bucket `sketchcatch-terraform-state-555980271919-ap-northeast-2`, key `production/ecs-foundation/terraform.tfstate`, and region `ap-northeast-2`.
  - Verified `sketchcatch-dev` can call STS in account `555980271919`; `sketchcatch-admin` and `sketchcatch-caller` credentials were invalid.
  - Ran `terraform plan -out=tfplan` with the provided VPC, subnet, artifact bucket, and public URL variables plus `ecs_desired_count=0`.
  - Ran `terraform apply tfplan`; apply created non-IAM foundation resources before failing on IAM role creation.
  - Re-ran apply after permission updates; final apply completed and created the ECS IAM roles/policies, task definition, and ECS service.
- Created resources recorded in Terraform state:
  - ECR repositories and lifecycle policies for `api`, `web`, and `nginx`.
  - CloudWatch log groups for `api`, `web`, and `nginx`.
  - ECS cluster `sketchcatch-production-cluster`.
  - Parallel ECS ALB, HTTP listener, and Fargate `ip` target group.
  - ECS ALB and ECS service security groups plus related ingress/egress rules.
  - ECS execution/task roles, inline policies, task definition, and ECS service.
- Verification:
  - `terraform plan -input=false -no-color -detailed-exitcode` returned no changes after final apply.
  - `aws ecs describe-services` confirmed `sketchcatch-production-app` is `ACTIVE` with `desiredCount=0`, `runningCount=0`, and `pendingCount=0`.
- Risk:
  - Live AWS resources now exist and may incur cost, especially the parallel ALB and CloudWatch/ECR storage.
  - `ecs_desired_count=0` intentionally prevents Fargate task startup before images and task secrets are ready.
- Next action:
  - Push images to ECR, wire ECS deploy workflow and task secrets, then raise `ecs_desired_count` for ECS smoke testing without Route53 cutover.

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
