# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `fix/ck/270-delete-project-bug-fix`.
- Base: latest `origin/dev` has been merged into this branch.
- GitHub issue: #270, project deletion and AWS connection follow-up fixes.
- Scope: fix project deletion blockers after SSO/deployment history, add destroy-failure fallback behavior, clarify AWS connection deletion/verification errors, keep AI chat aware of unconfigured diagram resources, and preserve the compact harness state-file structure from `dev`.

## Session Record

2026-07-09:

- Merged latest `origin/dev`, including the harness state-file trim that archives older progress history under `docs/agent-history/`.
- Fixed project deletion order so Git/CI/CD handoff references are removed before project assets and architectures.
- Fixed verified-email OAuth linking so trusted Naver SSO profiles can attach to the existing active user instead of splitting ownership.
- Added a project deletion fallback that allows project metadata deletion after resource-included Terraform destroy planning/execution cannot proceed.
- Clarified AWS connection deletion conflicts when deployment history still references an AWS connection.
- Removed blocking local DB AWS connection/deployment records for user `herry612` at the user's request; this was metadata cleanup only and did not mutate AWS resources.
- Improved AWS Role verification diagnostics so STS `AccessDenied` is reported as an AssumeRole permission problem instead of a generic connection-test failure.
- Fixed AI board conversion so visible DiagramJson resource nodes without saved parameter values still count as architecture resources instead of making the AI chat behave like the board is empty.
- Addressed PR #274 review feedback: guarded destroy warning acknowledgement when `warnings` is missing, made API fallback Terraform names use `node.id` when non-ASCII labels normalize to `resource`, and deleted Git/CI/CD handoffs before deployment rows.
- Ran a local live S3 direct deployment smoke through the SketchCatch service API for the `test` user. Created project `48e9627e-732f-4574-8f98-4448f007da93`, uploaded a Terraform S3 artifact, created deployment `aa003d86-633b-4ec6-88ac-0441a0b67730`, approved the plan, and applied it successfully. Destroy was intentionally not run at the user's request.
- Fixed the cost usage page so selecting a project no longer reloads `/costs/usage` with a project-scoped query. The page now keeps the full account response for total cost and project options, then scopes daily trend, services, resources, waste, and recommendations locally for the selected project.
- Ran a second local live S3 direct deployment smoke to verify cost-usage project separation. Created project `8f1794b7-05bd-4c26-b0ff-b44a86b7347b`, uploaded a tagged Terraform S3 artifact, created deployment `c3282642-bb9a-40de-89f8-5fc1c5affc70`, acknowledged 2 non-blocking plan warnings, and applied it successfully. Destroy was intentionally not run at the user's request.

Verification:

- `pnpm harness:check` - passed before the #270 code changes.
- `pnpm --filter @sketchcatch/api exec tsx --test src/projects/project-deletion-service.test.ts` - passed after the project deletion fix.
- `pnpm --filter @sketchcatch/api exec tsx --test src/auth/oauth-users.test.ts src/routes/oauth.test.ts` - passed after the SSO account-linking fix.
- `pnpm --filter @sketchcatch/web exec tsx --test features/projects/project-delete-flow.test.ts` - passed after the destroy fallback UI/helper changes.
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/api-client-error-message.test.ts` - passed after AWS connection message updates.
- `pnpm --filter @sketchcatch/api exec tsx --test src/aws-connections/aws-connection-test-service.test.ts` - failed before the AssumeRole mapper change, then passed.
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-ai-panel-state.test.ts` - failed before the unconfigured resource conversion fix, then passed.
- `pnpm --filter @sketchcatch/api exec tsx --test src/services/diagram-to-architecture.test.ts` - passed after aligning API conversion behavior.
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-ai-diagram-adapter.test.ts` - passed after the conversion change.
- `pnpm --filter @sketchcatch/api exec tsx --test src/projects/project-deletion-service.test.ts src/services/diagram-to-architecture.test.ts` - passed after PR #274 review fixes.
- `pnpm --filter @sketchcatch/web exec tsx --test features/projects/project-delete-flow.test.ts` - passed after PR #274 review fixes.
- `pnpm lint` - passed.
- `pnpm typecheck` - passed.
- `pnpm build` - passed.
- `pnpm --filter @sketchcatch/web exec tsx --test features/costs/cost-usage-project-view.test.ts` - passed after adding project-scoped service-cost helper coverage.
- `pnpm --filter @sketchcatch/web exec tsx --test features/costs/cost-usage-charts.test.ts` - passed after the cost usage page changes.
- `pnpm typecheck` - passed after the cost usage page changes.
- `pnpm lint` - passed after the cost usage page changes.
- `pnpm build` - passed after the cost usage page changes.
- `pnpm harness:check` - passed before merging latest `origin/dev`.
- `pnpm harness:check` - passed before and after the live S3 deployment smoke.
- Manual Terraform provider cache warm-up using `%TEMP%\sketchcatch-terraform-plugin-cache` - passed after the initial service `terraform init` timed out while installing `hashicorp/aws` v5.100.0.
- SketchCatch deployment `aa003d86-633b-4ec6-88ac-0441a0b67730` - service status `SUCCESS`, plan created 2 resources, apply log recorded `2 added, 0 changed, 0 destroyed`, and state was uploaded to `deployments/aa003d86-633b-4ec6-88ac-0441a0b67730/state/terraform.tfstate`.
- AWS read-only verification with the stored connection role - `head-bucket` passed for `sketchcatch-smoke-sketchcatchtest-ap-northeast-2-db1076b6`, and all four S3 Public Access Block flags were `true`.
- SketchCatch deployment `c3282642-bb9a-40de-89f8-5fc1c5affc70` - service status `SUCCESS`, deployed `aws_s3_bucket.site` and `aws_s3_bucket_public_access_block.site`, and exposed `bucket_arn` plus `bucket_name` outputs.
- Cost usage API verification after deployment `c3282642-bb9a-40de-89f8-5fc1c5affc70` - full `/costs/usage` returned `dataSource=aws_cost_explorer`, `fallbackUsed=false`, 3 project rows, 4 resource rows, and 2 resources for project `8f1794b7-05bd-4c26-b0ff-b44a86b7347b`; project-scoped query returned 1 project row and 2 resource rows for that project.

Known risks:

- A real AWS S3 bucket remains live because the user explicitly asked not to run destroy: `sketchcatch-smoke-sketchcatchtest-ap-northeast-2-db1076b6`.
- A second real AWS S3 bucket remains live because the user explicitly asked not to run destroy: `sketchcatch-smoke-sketchcatchtest-ap-northeast-2-cc80e26d`.
- The earlier smoke project `2a7a30a3-21a3-4bd4-9861-38952fee1dc9` reached plan only and was not applied because blocking S3 safety warnings prevented approval.
