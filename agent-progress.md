# Agent Progress

Short English-only working log for the current agent context.

## Current Verified State

- Branch/worktree: `codex/github-project-settings` in `C:\Users\siwon\Desktop\Jungle\Week17~21\SketchCatch-worktrees\github-project-settings`.
- Base: latest `origin/dev` at the start of this worktree.
- Scope: move GitHub source repository setup out of the deployment panel and fix the deployment console open path.
- Deployment now opens the full-screen console without closing the right panel host first.
- GitHub repository connection now lives in project creation and project settings.
- Deployment panel only shows source repository status, a project GitHub settings link, and Git/CI/CD handoff actions.

## Session Record

2026-07-08:

- Fixed production AI provider configuration injection so the deploy workflow writes `AI_BILLING_MODE`, Bedrock, and Amazon Q settings into `/etc/sketchcatch/api.env`.
- Added EC2 runtime IAM permissions for Bedrock Runtime `InvokeModel` and Amazon Q Business `ChatSync`.
- Added deployment regression tests that assert the production workflow injects AI provider env and the runtime policy keeps the required provider permissions.

Verification:

- `pnpm harness:check`
- `node --test scripts\deploy-runtime-iam-policy.test.mjs`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`

- Reworked Terraform Preview explanation to evaluate the Terraform-backed diagram with six Well-Architected agent-style assessments and a consensus recommendation.
- Kept detected resources in the API contract for compatibility, but removed them from the primary Preview explanation UI.
- Increased Preview explanation readability with larger summary/conclusion text and two-column assessment cards in the chat dock and legacy workspace AI panel.

Verification:

- `pnpm --filter @sketchcatch/api exec tsx --test src/services/aiTerraformPreviewExplanation.test.ts src/routes/ai.test.ts`
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/ai-workspace-api.test.ts features/workspace/workspace-right-panel-layout.test.ts`
- `pnpm --filter @sketchcatch/web typecheck`
- `pnpm --filter @sketchcatch/types typecheck`
- `pnpm --filter @sketchcatch/api typecheck`
- `pnpm --filter @sketchcatch/api lint`
- `pnpm --filter @sketchcatch/web lint`
- `pnpm harness:check`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- Browser attempt: local `http://localhost:3000/workspace/ai` redirected to `/login`, so visual verification was blocked by missing login state. Dev server was stopped after the check.

- Removed the per-diagnostic AI explanation button from the Terraform error summary in the code panel.
- Restored the Issues tab to the light workspace panel styling and removed the late dark override that made issue cards hard to read.
- Treated Terraform Code, Issues, and Terraform issue AI resolution as one internal workflow so the unsaved Terraform leave dialog does not appear while moving between them.

Verification:

- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-right-panel-layout.test.ts`
- `pnpm --filter @sketchcatch/web typecheck`
- `pnpm harness:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`

- Fixed Terraform fast diagnostics so multiline list continuations inside resource/data blocks are not reported as body syntax errors.
- Verified the user-provided sample no longer reports false `attribute_syntax` errors for AMI owners and security group ID list entries; remaining errors are the standalone `erere`, unresolved references, and unsupported S3 provider arguments.

Verification:

- `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-diagnostics.test.ts`
- `pnpm --filter @sketchcatch/api typecheck`
- `pnpm --filter @sketchcatch/api lint`
- `pnpm harness:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`

- Fixed the Issues tab scroll container by giving the Issues panel a fixed height chain and moving vertical overflow to the Terraform diagnostics body.
- Added a layout regression assertion so the Issues panel keeps `min-height: 0`, `overflow-y: auto`, and stable scrollbar gutter.

Verification:

- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-right-panel-layout.test.ts`
- `pnpm --filter @sketchcatch/web typecheck`
- `pnpm --filter @sketchcatch/web lint`
- `pnpm harness:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`

- Removed the fallback/basic LLM explanation block from the Terraform Preview explanation result so the panel focuses on the six assessment agents and conclusion.
- Removed the inline Terraform error card list from the code panel, leaving only the compact Issues navigation banner when Terraform errors exist.
- Fixed fast Terraform diagnostics so standalone invalid top-level lines and non-attribute resource body lines, including Korean random text, produce one blocking syntax diagnostic before sync-to-diagram can cascade extra issues.

Verification:

- `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-diagnostics.test.ts`
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-right-panel-layout.test.ts`
- `pnpm --filter @sketchcatch/web typecheck`
- `pnpm --filter @sketchcatch/api typecheck`
- `pnpm --filter @sketchcatch/web lint`
- `pnpm --filter @sketchcatch/api lint`
- `pnpm harness:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`

- Fixed AI Architecture Draft to Diagram conversion so Terraform reference strings are rewritten after resource naming conventions change declaration names.
- Prevented Terraform Preview rendering from emitting AI semantic metadata fields such as `bucketPurpose`, `servicePurpose`, `originResourceId`, and `publicAccessBlock` as provider arguments.
- Added regression coverage for stale reference rewrites across IAM, AMI, Subnet, Security Group, EC2, and CloudWatch alarm dimensions, plus Terraform rendering metadata filtering.

Verification:

- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-ai-diagram-adapter.test.ts`
- `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-preview.test.ts`
- `pnpm --filter @sketchcatch/web typecheck`
- `pnpm --filter @sketchcatch/api typecheck`
- `pnpm harness:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`

- Added browser speech recognition to the full-screen new-project AI start composer with a mic button, listening state, and shared Korean status/error handling.
- Added static regression coverage for the new voice button wiring, SpeechRecognition support helper, and responsive composer styling.

Verification:

- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-new-project-start-mode.test.ts`
- `pnpm --filter @sketchcatch/web typecheck`
- `pnpm harness:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build` (first run timed out at the command limit; rerun with a longer timeout passed from cache)
- Local dev server started at `http://localhost:3000`; `/workspace/new` returned HTTP 200.
- Browser screenshot attempt was blocked because the local Playwright browser binary is not installed.

- Corrected diagram edge handling so only `contains`/`hosts` are removed as area containment; runtime and configuration relationships remain visible.
- Added endpoint-based styling so IAM/KMS/AMI/security configuration relationships render as thin solid dependency lines even when the AI label is generic.
- Kept async/event/log/monitoring relationships dashed, Terraform/deploy relationships operational dashed, and runtime HTTPS/data relationships solid.
- Reworked generated diagram readability for shared architecture conversion/normalization paths, not just one QA fixture.
- Added readable topology lanes, route scoring, area/resource collision protection, and tests for compact mixed cloud area drafts.
- Updated AI architecture draft support so Amazon Q allowed `ResourceNode.type` values are derived from shared resource definitions instead of a hard-coded subset.
- Added fallback draft handling for explicitly requested resource-panel catalog items such as EKS Cluster, DynamoDB Table, SQS Queue, and Auto Scaling Group.
- Kept negated resource requests such as "no EC2" from being re-added as explicit panel resources.
- Updated unsupported-resource handling so panel-backed resources are no longer reported as omitted, while unsupported workflow automation such as CI/CD handoff remains guarded.
- Merged latest `dev` into `fix/ck/diagram-position`; the only manual conflict was this progress log.

- Removed in-panel GitHub repository chooser/install actions from `DeploymentPanel`.
- Added `/projects/[projectId]/settings` with a project GitHub repository settings client.
- Added a project creation checkbox to start GitHub repository connection after creating a blank project.
- Added regression coverage for deployment console opening, project-level GitHub ownership, and project creation GitHub handoff.

Verification:

- `pnpm harness:check` - passed before edits.
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-right-panel-layout.test.ts` - passed, 63 tests.
- `pnpm --filter @sketchcatch/web exec tsx --test app/workspace/new/workspace-start-options.test.ts` - passed, 6 tests.
- `pnpm --filter @sketchcatch/web exec tsx --test --test-reporter spec` - new project GitHub settings tests passed; 3 unrelated baseline source tests failed.
- `pnpm lint` - passed.
- `pnpm typecheck` - passed.
- `pnpm build` - passed.
- `pnpm harness:check` - passed after edits.

Known risks:

- Full web source-test sweep still has 3 unrelated baseline failures in reverse workspace, workspace auth gate, and legacy AI route assertions.
- Browser click QA against production has not been run yet in this worktree.

- Updated local `dev` to `838a3e94` and merged it into `fix/ck/245-terraform-error`.
- Resolved the only manual conflict in this progress log, preserving both branch records.

Verification:

- `pnpm harness:check`
- `pnpm lint`
- `pnpm build`
- `pnpm typecheck` (first run failed because `.next/types/validator.ts` was absent before build regenerated Next types; rerun passed)

- Addressed PR #252 review feedback for browser voice input timer typing and dynamic no-speech timeout messaging.
- Updated Terraform diagnostics to report top-level `key = value` attributes as syntax errors instead of ignoring them.
- Added regression coverage for invalid top-level Terraform attributes.

Verification:

- `pnpm --filter @sketchcatch/api test`
- `pnpm --filter @sketchcatch/web typecheck`
- `pnpm harness:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
