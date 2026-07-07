# Agent Progress

This file is the short, English-only working log for the current agent context. Keep it concise.

## Current Verified State

- Branch/worktree: `codex/github-app-204-settings` in `C:\Users\siwon\Desktop\Jungle\Week17~21\SketchCatch-worktrees\git-cicd-handoff-create-fix`.
- PR #241 was merged to `dev` and deployed to production by GitHub Actions run `28888021622`.
- Production health and DB health returned `ok`.
- Production Git/CI/CD live smoke created PR #14 in `NearthYou/sketchcatch-iac-handoff-test`.
- Smoke status is `passed_or_waiting`: repository settings applied, 5 variables applied, pipeline status is `pr_created`, infra is `waiting_for_merge`.

- Branch: `fix/ck/diagram-position`
- Worktree: `C:\Jungle\SketchCatch`
- Base: local `dev` updated to `384429c0` and merged into this branch.

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

Verification:

- `pnpm harness:check`
- `.\node_modules\.bin\tsx.CMD --test features\workspace\workspace-ai-diagram-adapter.test.ts features\diagram-editor\flow-mappers.test.ts` from `apps/web`
- Browser verification against `http://localhost:3000/workspace?projectName=Diagram%20Fresh%20Check&diagramFixture=conventions`: 11 nodes, 9 edges, 5 thin dependency edges, 2 dashed async edges, no resource-resource overlaps, and no sampled edge-resource hits.
- Browser verification against the generated project workspace: 22 nodes, 10 edges, 1 thin dependency edge, 2 dashed async edges, and no sampled edge-resource hits.
- `.\node_modules\.bin\tsx.CMD --test src\services\aiArchitectureDrafts.test.ts src\routes\ai.test.ts` from `apps/api`
- `pnpm lint` (passed; Turbo cache rename warnings only)
- `pnpm typecheck` (passed; Turbo cache rename warnings only)
- `pnpm build` (first sandboxed run hit Next.js `.next` unlink EPERM; elevated rerun passed)
## Completed Fixes

- GitHub App config path now uses the shared `GIT_APP_*` env loader.
- GitHub App permission messages distinguish PR creation and repository settings permission gaps.
- Blank repository variables are skipped before applying GitHub repository settings.
- Smoke script sends explicit JSON bodies and records useful API error evidence.
- GitHub App client now treats `204 No Content` as a successful empty response.

## Verification

- `pnpm harness:check`
- `pnpm --filter @sketchcatch/api exec tsx --test src/source-repositories/github-app-client.test.ts`
- `pnpm --filter @sketchcatch/api exec tsx --test src/git-cicd/git-cicd-repository-settings-service.test.ts src/routes/git-cicd-handoffs.test.ts`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- Production smoke report: `docs/sw/git-cicd-live-smoke-pr-created-current.json`

Dev merge context:

- PR #234 and PR #235 were merged and deployed before this branch update.
- Latest `dev` includes Git/CI/CD handoff permission messaging, repository settings, cost usage work, and production smoke follow-up updates.
- The dev-side production smoke blocker remains GitHub App permission approval for generated PR files, especially workflow files.
- Merged and deployed the GitHub App repository settings fixes through PRs #237, #238, #239, #240, and #241.
- Reran production live smoke after PR #241 deployment and verified repository settings apply now passes.
- Left generated handoff PR #14 open for review/merge because real AWS mutation requires explicit approval.

## Remaining Demo Work

- Run focused checks after the merge if more code changes are made.
- Push `fix/ck/diagram-position` and open/update the PR into `dev` when ready.
- Merge a generated handoff PR only when real AWS apply is approved.
- Run the downstream GitHub Actions pipeline and verify live static/API URLs.
- Run cleanup/destroy verification after any real AWS deployment.
