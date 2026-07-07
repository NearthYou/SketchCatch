# Agent Progress

This file is the short, English-only working log for the current agent context. Keep it concise.

## Current Verified State

Branch/worktree:

- Branch: `codex/github-existing-repo-first`
- Worktree: `C:\Users\siwon\Desktop\Jungle\Week17~21\SketchCatch-worktrees\aws-runtime-policy-deploy-fix`
- Base: latest `dev` imported through `codex/aws-runtime-policy-deploy-fix`

## Session Record

2026-07-07:

- Changed Deployment Panel GitHub connect behavior so it opens an in-app repository chooser first.
- Added a chooser action for known SketchCatch GitHub source repositories and kept GitHub App install/configure as the explicit add-permissions path.
- Added a selected-source-repository callback URL route so inactive previous GitHub connections can reopen repository selection.
- Added a GitHub callback page button for GitHub App install/permission expansion when the desired repository is missing.
- Addressed PR #227 review feedback: modal-local errors are visible, `sourceRepositoryId` route params require UUIDs, and route tests use UUID fixture IDs.
- Updated AI-generated diagram conversion to apply diagram conventions: resource naming prefixes, solid/dashed edge semantics, containment edge hiding, and collision avoidance for regular resource nodes.
- Added `DiagramEdgeStyle.lineStyle` support through shared types, API validation, React Flow rendering, and dashboard thumbnails.
- Documented the edge line-style contract in `docs/data-models.md`.
- Added board-only `User / Client` and `Internet` design palette items without adding Terraform resource definitions.
- Normalized loaded workspace/project diagrams so existing saved diagrams also receive naming conventions, containment edge removal, inferred line styles, collision fixes, and rerouted handles.
- Updated resource labels to display convention-based names from `resourceName`, including generated names such as `cdn_public_entry`, `bucket_web_assets`, `vpc_main`, and `subnet_public_a`.
- Verified the normal workspace UI at `/workspace?projectName=Diagram%20Convention%20QA`: no always-visible edge labels, dashed async/monitoring edges visible, no resource-resource overlaps, and no sampled edge-resource intersections.

Verification:

- `pnpm harness:check`
- `pnpm --filter @sketchcatch/api exec tsx --test src/source-repositories/source-repository-service.test.ts src/routes/source-repositories.test.ts`
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-right-panel-layout.test.ts`
- `.\node_modules\.bin\tsx.CMD --test features\workspace\workspace-ai-diagram-adapter.test.ts features\diagram-editor\flow-mappers.test.ts` from `apps/web` with elevated sandbox permissions because Node test runner spawn was blocked by EPERM.
- `.\node_modules\.bin\tsx.CMD --test src\routes\project-draft-schemas.test.ts` from `apps/api` with elevated sandbox permissions because Node test runner spawn was blocked by EPERM.
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build` (first sandboxed run hit Next.js `.next` unlink EPERM; elevated rerun passed)
- `.\node_modules\.bin\tsx.CMD --test features\resource-settings\catalog.test.ts features\diagram-editor\diagram-utils.test.ts` from `apps/web` with elevated sandbox permissions because Node test runner spawn was blocked by EPERM.
- Final `pnpm harness:check`
- Browser DOM verification on `http://localhost:3000/workspace?projectName=Diagram%20Convention%20QA`: `labeledCount: 0`, `dashedCount: 4`, `overlaps: []`, `edgeHits: []`.

Next steps:

- Push the branch and open a PR into `dev` when ready.

2026-07-08:

- Fixed board-only `User / Client` and `Internet` design nodes so dropped nodes retain `iconUrl`.
- Updated design node rendering to show the retained icon instead of the generic `D` glyph when an icon is available.
- Updated icon-backed design node rendering so `User / Client` and `Internet` use the same icon tile layout as regular resource nodes while remaining non-Terraform design nodes.
- Reworked generated diagram readability for shared architecture conversion/normalization paths, not just the QA fixture.
- Added readable topology lanes for common serverless/resource groups and route ordering so runtime/storage, observability, and control-plane edges compete for handles more predictably.
- Updated route scoring to account for React Flow handle stubs, prior route overlap/crossing, shared handles, endpoint node re-entry, and control-plane/runtime endpoint preferences.
- Verified the convention fixture in the real workspace UI: 11 nodes, 9 edges, 4 dashed edges, no resource-resource overlaps, no edge-resource hits, no line crossings, and no line overlap beyond endpoint stubs.

Verification:

- `pnpm harness:check`
- `.\node_modules\.bin\tsx.CMD --test features\diagram-editor\diagram-utils.test.ts` from `apps/web` with elevated sandbox permissions because Node test runner spawn was blocked by EPERM.
- `.\node_modules\.bin\tsx.CMD --test features\resource-settings\catalog.test.ts features\diagram-editor\diagram-utils.test.ts` from `apps/web` with elevated sandbox permissions because Node test runner spawn was blocked by EPERM.
- `.\node_modules\.bin\tsx.CMD --test features\diagram-editor\DiagramNodeView.test.ts features\diagram-editor\diagram-utils.test.ts` from `apps/web` with elevated sandbox permissions because Node test runner spawn was blocked by EPERM.
- `.\node_modules\.bin\tsx.CMD --test features\workspace\workspace-ai-diagram-adapter.test.ts features\diagram-editor\flow-mappers.test.ts` from `apps/web` with elevated sandbox permissions because Node test runner spawn was blocked by EPERM.
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build` (first sandboxed run hit Next.js `.next` unlink EPERM; elevated rerun passed)
- Final `pnpm harness:check`
- Browser visual verification was attempted against `http://localhost:3000/workspace?projectName=Diagram%20Convention%20QA`, but the existing dev server/browser session returned the Next dev payload instead of a hydrated app UI.
- Browser DOM/SVG verification passed against `http://localhost:3000/workspace?projectName=Diagram%20Convention%20QA%20Readable&diagramFixture=conventions`: `nodeCount: 11`, `edgeCount: 9`, `dashedCount: 4`, `overlaps: []`, `edgeHits: []`, `lineOverlaps: []`, `crossings: []`.
