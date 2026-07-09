# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `chore/ck/281-delete-code-diagram`.
- Local `dev` has been fast-forwarded to latest `origin/dev` as of 2026-07-10.
- Merge of latest `dev` into this branch is in progress and conflicts have been resolved locally.
- Scope from this branch: remove fixed SketchCatch web deployment draft/diagram/Terraform override, keep AI-generated ArchitectureJson on the normal conversion path, and share runtime ResourceType validation across API routes.
- Upstream `dev` includes expanded AWS ResourceType coverage, UI/UX refinements, and ECS/Fargate foundation files.
- No Terraform apply/destroy, deployment, AWS calls, or cloud mutation was run.

## Session Record

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
