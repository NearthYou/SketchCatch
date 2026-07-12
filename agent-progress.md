# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `feat/ck/349-repo-analysis`.
- Issue #349 repository-analysis based template recommendation is implemented and committed locally.
- The latest follow-up fix maps missing `source_repositories` migrations to a stable API/UI message instead of exposing raw SQL.
- GitHub repository-start and callback screens now route permission expansion to project GitHub settings instead of opening GitHub App installation directly.
- Repository start now offers public GitHub URL analysis before any GitHub App connection, saving the recommended template board when opened.
- Local `db:migrate` could not be run in this shell because `DATABASE_URL` is empty.
- No cloud deployment, Terraform apply, or infrastructure mutation was run during this work session.

## Session Record

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
  - `pnpm lint` passed with the pre-existing `live-observations` `setNow` warning; `pnpm typecheck`, `pnpm build`, and `pnpm harness:check` passed.

### 2026-07-11 - Connect PatchPlan compiler to Bedrock

- Goal: Use the provided Bedrock system prompt and exact `PATCH_PLAN_INPUT_JSON` user message for natural-language Architecture PatchPlan compilation.
- Completed:
  - Added a configured Architecture Patch Preview factory that calls Bedrock only when Bedrock credits are enabled, otherwise preserving the deterministic fallback.
  - Added the PatchPlan compiler system prompt, exact user-message payload shape, provider JSON parsing, strict schema/path/id validation, and provider metadata with `routeTarget: architecture_patch_plan`.
  - Rejected Bedrock responses that guess among multiple matching resources before user selection, keeping clarification candidates intact.
  - Applied validated `modify_resource` operations to the actual preview config so EC2 upsize changes only `instanceType` and preserves subnet, position, and edges.
  - Updated PatchPlan preserve fields to match modify/remove/add contracts and reused the existing Bedrock text provider.
- Verification:
  - Focused Architecture Patch Preview tests passed 38/38, including Bedrock prompt payload, selected EC2 upsize, and invalid target-guess fallback coverage.
  - Focused API typecheck passed.
  - `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed.
- Risk:
  - Bedrock remains gated by `BEDROCK_CREDIT_CONFIRMED=true`; without that flag the deterministic PatchPlan fallback is used.

### 2026-07-11 - Add strict Architecture PatchPlan contract

- Goal: Convert natural-language edit requests into a strict JSON PatchPlan before any Architecture preview mutation.
- Completed:
  - Added shared `ArchitecturePatchPlan` and `JsonValue` types with allowed actions, operations, target, preserve paths, clarification question, and confidence.
  - Added `createArchitecturePatchPlan` as a pure planner that does not mutate ArchitectureJson or invent resource IDs.
  - Enforced conservative target resolution: multiple matching resources return `needs_clarification` instead of choosing one.
  - Planned EC2 relative sizing as `increase_one_step`, DB storage edits as `set_value config.allocatedStorage`, and explicit replacement wording as `unsupported`.
  - Aligned the PatchPlan JSON shape with the compiler objective: `action: null` for clarification/unsupported states, `candidateResourceIds`, scalar operation values, and full placement/relationship preserve paths.
  - Attached `patchPlan` to patch preview and clarification responses for auditability while preserving the existing user-accepted preview flow.
  - Updated `docs/data-models.md` to document the PatchPlan DTO.
- Verification:
  - Full API patch preview tests passed 36/36.
  - Focused PatchPlan compiler tests passed 5/5.
  - Direct JSON checks verified the exact field shape for EC2 upsize and ambiguous S3 delete requests.
  - `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed.

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

- Run `pnpm --filter @sketchcatch/api db:migrate` in the API runtime shell with `DATABASE_URL` configured, then retry GitHub Repository start.
