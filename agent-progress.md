# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `codex/workspace-parameter-editing`.
- Scoped work: Workspace infrastructure settings Tasks 1-4, including final-review fixes and integrated verification.
- The branch covers new-node safe defaults, parameter-reference edge metadata/synchronization, parameter editing, and Terraform Preview output without cloud mutation.
- `feature_list.json` and `session-handoff.md` remain unchanged by scoped-task instruction.

## Session Record

### 2026-07-10 - Start ECS Phase 5 API worker dispatch

- Goal: Add API-side ECS worker dispatch so Terraform execution can move from in-process background jobs to ECS RunTask one-off worker tasks when explicitly enabled.
- Completed:
  - Merged Phase 4 PR #294 into `dev`.
  - Created GitHub issue #295.
  - Created linked branch `feature/sw/295-ecs-worker-task-dispatch` from updated `dev` with `gh issue develop`.
  - Added `DEPLOYMENT_WORKER_MODE` and ECS worker dispatch env validation for cluster, task definition, subnets, security groups, container name, command, static worker env, and public IP setting.
  - Added ECS/local deployment worker dispatcher abstraction using `RunTask`, `DescribeTasks`, and `StopTask`.
  - Wired deployment init/plan/apply/destroy-plan/destroy routes to create a `DeploymentJob` and dispatch ECS RunTask when ECS worker mode is enabled.
  - Wired cancel to call ECS StopTask when an active job has an ECS task ARN; otherwise the existing stale RUNNING fail-safe still marks the deployment failed.
  - Added `init` to `deployment_job_operation` with migration `0028_deployment_job_init_operation.sql`.
  - Added route/config/dispatcher tests and updated `docs/deployment.md` with env and least-privilege IAM requirements.
- Verification so far:
  - `pnpm harness:check` passed.
  - `pnpm lint` passed.
  - `pnpm typecheck` passed.
  - `pnpm build` passed.
  - `pnpm --filter @sketchcatch/api exec tsx --test src/deployments/deployment-worker-dispatcher.test.ts src/config/env.test.ts src/routes/deployments.test.ts` passed.
  - `pnpm --filter @sketchcatch/api typecheck` passed.
  - `pnpm --filter @sketchcatch/api lint` passed.
  - `pnpm --filter @sketchcatch/api test -- deployments` ran the whole API suite because the package script does not filter test files; Phase 5 tests passed, but pre-existing unrelated AI fixture and missing docs/jh fixture failures were reported.
- Risk:
  - Worker runtime is still out of scope; ECS-dispatched tasks need Phase 6 code to consume `SKETCHCATCH_DEPLOYMENT_JOB_ID` and finish deployment state updates.
  - The requested API deployments test command currently exits 1 because of unrelated pre-existing failures in `aiLlmExplanationRoutes.test.ts` and a missing `docs/jh/000_AWS리소스목록_JH.md` fixture.
  - No live AWS commands should be run in Phase 5.

### 2026-07-10 - Start ECS Phase 4 deployment job model

- Goal: Add a deployment job model for Terraform execution jobs so Phase 5 can dispatch ECS RunTask one-off workers.
- Completed:
  - Created GitHub issue #293.
  - Created linked branch `feature/sw/293-deployment-runtask-jobs` from `dev` with `gh issue develop`.
  - Read root `AGENTS.md`, `docs/sw/agents.md`, `docs/sw/spec.md`, `docs/sw/plan.md`, and `apps/api/AGENTS.md`.
  - Added `deployment_jobs` DB schema/migration with operation/status enums, requester/access context, source deployment state, ECS task ARN placeholder, timestamps, error summary, and active-job duplicate protection.
  - Added internal deployment job repository/service helpers for create, dispatching/running, task ARN recording, success, failure, and cancellation transitions.
  - Added deployment job service tests for creation, state transitions, duplicate protection, and masked failure/cancellation recording.
  - Updated `docs/data-models.md` with the internal `DeploymentJob` contract while noting public Deployment API shapes remain stable.
- Verification so far:
  - `pnpm harness:check` passed before Phase 4 edits.
  - `pnpm harness:check` passed after Phase 4 edits.
  - `pnpm lint` passed.
  - `pnpm typecheck` passed.
  - `pnpm build` passed.
  - `pnpm --filter @sketchcatch/api exec tsx --test src/deployments/deployment-job-service.test.ts` passed.
  - `pnpm --filter @sketchcatch/api lint` passed.
  - `pnpm --filter @sketchcatch/api typecheck` passed.
  - `pnpm --filter @sketchcatch/api test -- deployment` ran the whole API suite because the package script does not filter test files; the new deployment job tests passed, but pre-existing unrelated AI fixture and missing docs/jh fixture failures were reported.
- Risk:
  - Phase 4 does not dispatch ECS tasks; Phase 5 must wire the job model into deployment routes and worker dispatcher config.
  - The requested API deployment test command currently exits 1 because of unrelated pre-existing failures in `aiLlmExplanationRoutes.test.ts` and a missing `docs/jh/000_AWS리소스목록_JH.md` fixture.
  - No live AWS commands should be run in Phase 4.

### 2026-07-10 - Draft Board 17-to-40 visual-system design

- Goal: Expand the Board-only design work from cosmetic polish to a renderer visual-system rewrite while preserving product, domain, API, storage, Terraform, and editor behavior contracts.
- Completed:
  - Added `docs/jh/007_아키텍처보드시각디자인40점개선설계_JH.md` as a review draft.
  - Defined the Resource Object, icon normalization, Area surface, Edge grammar, state, zoom, accessibility, geometry migration, and visual-regression requirements.
  - Converted the 17/40 audit into ten explicit 4-point acceptance gates; all ten must pass for a 40/40 result.
  - Recorded the existing 48x48 source versus 56x56 canonical documentation drift and required one-step synchronization with the proposed 136x72 visual default.
- Verification:
  - Reviewed the draft for placeholders, score arithmetic, contract boundaries, legacy geometry conflicts, and dirty-worktree overlap.
  - `git diff --check` passed for tracked changes.
  - `pnpm harness:check` passed after the documentation change.
  - No source code, product contract, API, infrastructure, cloud resource, or live Board state was changed.
- Risk:
  - The design is not approved yet; no detailed implementation plan or renderer edit has started.
  - `docs/jh` is ignored by Git, so the local draft is not visible in normal `git status` and was not committed.
  - The workspace already contains unrelated Board geometry changes; future implementation must not mix them into this visual workstream.
- Next action: Obtain user approval on the written visual design, then write the file-by-file implementation plan in `docs/jh`.

### 2026-07-10 - Complete workspace resource visual behavior

- Goal: Keep workspace resource nodes icon-only and interactive while fixing naming, area expansion, and dimmed-node selection behavior.
- Completed:
  - Removed DATA badges, kept board labels uppercase, and preserved Terraform identities.
  - Set regular catalog, fallback, template, AI, and Terraform-created nodes to `48 x 48` with icon-only selection geometry and external labels.
  - Added hollow square resize handles, opaque icon frames, and `28 x 28` resize minimums.
  - Preserved blank `resourceName` and `fileName` values during editing instead of restoring `main`.
  - Limited centered ancestor-area growth to new palette drops (`+ 2 * child size`) and removed expansion from existing-node drag.
  - Kept dimmed regular nodes selectable, draggable, and pointer-addressable.
  - Stopped saved-workspace normalization from rewriting names such as `ami`, `renamed`, and `ec2_instance` into node-ID-derived strings; new Architecture Draft naming conventions remain unchanged.
- Verification:
  - Final focused resource, naming, geometry, area-expansion, interaction, template, and adapter tests passed (106/106).
  - `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed.
  - Full web suite: 739/742 passed; the only failures are three deleted AWS inventory-document coverage tests that receive 0 resources instead of the expected 112.
  - Playwright measured a new EC2 at `48 x 48`, VPC growth from `(420,372,240,160)` to `(372,324,336,256)` after a new drop, and no further VPC growth after moving the existing EC2.
  - Browser QA confirmed icon-only handles, external uppercase labels, blank-name validation without `main` refill, and selection switching through dimmed nodes.
  - Final independent workspace review: approved with no critical, important, or minor findings.
- Risk:
  - The shared worktree contains extensive concurrent Board, API, deployment, Live Observation, documentation, and type changes. Commits through `1ae9fa53` contain only this workstream's safely isolated changes; the final Board visual-system integration and saved-name fix remain unstaged because their files overlap the concurrent user-owned Board rewrite.
  - `output/playwright/workspace-resource-icon-final.png` is an unstaged QA artifact. Existing unrelated deletions and modifications were preserved.
- Next action: When the concurrent Board rewrite is ready, review and stage its files as one cohesive change while preserving the verified 48px resource integration and saved-name behavior; do not stage unrelated API or infrastructure work with it.

### 2026-07-10 - Complete Architecture Board visual 40/40 workstream

- Goal: Expand the Board-only design scope into a verified renderer visual system without changing domain, API, storage, Terraform, or deployment contracts.
- Completed:
  - Replaced the conflicting Board design and implementation drafts with canonical `docs/jh/007_아키텍처보드시각디자인40점개선설계_JH.md` and `008_아키텍처보드시각디자인40점개선구현계획_JH.md`.
  - Completed the 48px Resource Stencil, 112x82 visual footprint, bounded LOD labels, optical icon normalization, 18px neutral fallback glyph, Area depth surfaces, custom Edge layers, patch states, and unobscured viewport frame.
  - Compacted the Node toolbar to 108x36 and Edge toolbar to 148x36; verified keyboard disclosure behavior and 44px coarse targets.
  - Separated observability and control lanes at shared Lambda endpoints, prevented incoming/outgoing handle sharing, and limited smooth endpoint stubs to 8 logical pixels.
  - Added deterministic conventions, 126-item gallery, stress, Area, Edge, preview, and state fixtures plus panel-collapsed Playwright evidence under `output/playwright/board-visual-40/`.
  - Independent final visual review scored all ten rubric rows 4/4 for 40/40 with no remaining P0/P1/P2 findings.
- Verification:
  - Consolidated Board regression suite passed 275/275.
  - Fresh browser context rendered 11 nodes and 9 edges with no console warnings, console errors, or page errors.
  - `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` passed.
- Risk:
  - The shared worktree still contains extensive unrelated API, deployment, infrastructure, Live Observation, documentation, and lockfile changes; none were reverted, staged, committed, or pushed.
  - `docs/jh` and Playwright evidence are ignored/local in this repository unless explicitly force-added.
  - No cloud, Terraform, deployment, or Git mutation was performed.
- Next action: If this work should be versioned, review and stage only the cohesive Board renderer, tests, canonical docs, and selected evidence while excluding unrelated dirty-worktree changes.

### 2026-07-11 - Verify cinematic Live Observation signal map

- Completed: Verified the 1440px/96vh Live Observation dialog, shared left-to-right signal map with browser/AWS evidence bands, finite actual-InService-only pulses, and reduced-motion fallback.
- Verification: Focused mock preview, modal, signal-map, and Live Observation tests passed 26/26 after aligning the EC2 route branches; Web and repository `lint`, `typecheck`, and `build` passed; `pnpm harness:check` and `git diff --check` passed.
- Limits/Safety: No authenticated browser smoke test ran because no prepared signed-in session or safe data was available. No API, cloud, Terraform, or deployment action was performed. Shared-worktree changes were preserved; nothing was staged or committed.

### 2026-07-11 - Restore light Board and add eight-direction resize

- Goal: Revert the rejected premium dark Board treatment while preserving icon-only Resource nodes and enlarged connection targets, then improve Area headers and node resizing.
- Completed:
  - Restored the previous light Board canvas, chrome, Area, Edge, label, and state palette; removed the rejected dark-theme spec and plan.
  - Rounded Area header icons to 4px and removed the header bottom divider.
  - Added top, right, bottom, and left resize handles alongside the four existing corner handles.
  - Kept Resource resizing square; side resizing preserves the opposite edge and centers the orthogonal axis.
  - Moved the selected right-side connection source 18px outside the node so its 28px target no longer blocks the resize side.
  - Updated the ignored local Board design/implementation docs to match full-fill icons and eight-direction resize, and removed stale current 40/40 claims pending a new independent audit.
- Verification:
  - Focused light-theme, Area header, Edge, node-style, and resize tests passed 93/93.
  - Consolidated Board regression suite passed 285/285.
  - Playwright confirmed eight resize controls on selected Area and Resource nodes; a real right-side mouse drag resized a Resource from 48x48 to 72x72 while preserving square geometry and the left edge.
  - Evidence: `output/playwright/board-visual-40/light-board-area-header-rounded-no-divider.png` and `output/playwright/board-visual-40/resource-side-resize-48-to-72.png`.
  - `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm harness:check`, and `git diff --check` passed.
- Risk:
  - The prepared browser fixture still records expected 401 responses from `/api/terraform/generate` because only auth identity endpoints are mocked; no cloud, Terraform, deployment, or Git mutation was performed.
  - The shared worktree still contains unrelated user-owned changes and one unrelated active harness item (`ECS-MIGRATION-000`); none were reverted, staged, or committed.

### 2026-07-11 - Remove Area header tint and restore entry expansion

- Goal: Show only the Area icon and text in the header, and expand Area containment when an existing Resource enters a new Area.
- Completed:
  - Removed the translucent Area header fill while preserving the rounded icon and divider-free header.
  - Found that existing-node drag intentionally skipped the palette-drop expansion helper; replaced that stale behavior with parent-transition detection in the drag transaction.
  - Expanded the newly assigned parent and its Area ancestors by twice the child width and height while preserving each Area center.
  - Limited expansion to regular Resources whose `parentAreaNodeId` changes to a non-empty new parent, preventing repeated growth during same-parent movement and excluding Area-node movement.
- Verification:
  - Focused Area header, entry-expansion, drag-transaction, and layout tests passed 34/34.
  - Consolidated Board regression suite passed 286/286.
  - Playwright computed `backgroundColor: rgba(0, 0, 0, 0)` and `borderBottomWidth: 0px` for the Area header.
  - A real existing `36x36px` Resource drag changed Region screen bounds from `(335, 732.375, 195, 135)` to `(299, 696.375, 267, 207)`, proving centered `+72px` width and height growth.
  - Evidence: `output/playwright/board-visual-40/existing-resource-area-entry-expansion.png`.
  - `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm harness:check`, and `git diff --check` passed.
- Risk:
  - The prepared browser fixture still records expected 401 responses from `/api/terraform/generate` because only auth identity endpoints are mocked; the Board behavior itself does not depend on that request.
  - The shared worktree still contains unrelated user-owned changes and one unrelated active harness item (`ECS-MIGRATION-000`); none were reverted, staged, committed, or pushed.

### 2026-07-11 - Remove side-resize hover rails and add vertical source ports

- Goal: Keep Resource face resizing cursor-only and allow connections to start from the top, right, or bottom.
- Completed:
  - Removed the side-handle `::after` pill and pointer-hover shadow that produced the full-length pale blue rail while preserving all four side hit areas and resize cursors.
  - Enabled top, right, and bottom connection sources while keeping the left handle target-only and preserving stored handle IDs.
  - Offset all selected source ports 18 logical pixels outward and increased the node-toolbar offset to 34px so the top port's 28px hit target remains unobscured.
- Verification:
  - TDD RED failed for the right-only source gate and side-handle rail rules before implementation; focused tests then passed 20/20.
  - Final Diagram Editor regression suite passed 225/225.
  - Playwright measured `boxShadow: none` and pseudo-element `content: none` on all four hovered side handles while preserving `ns-resize` and `ew-resize` cursors.
  - Browser center-point hit tests confirmed top, right, and bottom sources were individually clickable; real pointer drags from both the top and bottom sources each created one Edge, then the fixture was restored with Undo.
  - Evidence: `output/playwright/board-visual-40/resource-side-hover-detail.png`.
  - `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm harness:check`, and `git diff --check` passed.
- Risk:
  - The browser fixture emitted four expected `/api/terraform/generate` 401 responses and one React setState-during-render warning when a temporary fixture Edge was created; the Edge was still created and then removed, and the separate warning was not changed in this visual scope.
  - No cloud, Terraform, deployment, staging, commit, or push action was performed; unrelated shared-worktree changes were preserved.

### 2026-07-11 - Make purple the default Area boundary color

- Goal: Render default Board Area boundaries in brand purple while preserving explicit Area colors and regular Resource borders.
- Completed:
  - Changed the Area display fallback and legacy gray/blue defaults to `#6f4cf6` without migrating stored diagram data.
  - Aligned the Area border palette to start with purple, retained selectable blue as `#1f6feb`, and added the accessible Korean name `보라`.
  - Preserved explicit non-legacy Area colors, border styles, depth surfaces, selection rings, and the regular Resource border color.
- Verification:
  - TDD RED failed on the former `#cbd5e1` fallback and legacy palette; focused tests passed 5/5 and 20/20 after implementation.
  - Diagram Editor regression suite passed 226/226.
  - Playwright confirmed all seven default/legacy gallery Areas compute to `rgb(111, 76, 246)`; the Area matrix preserved every explicit non-legacy color while normalizing only legacy blue.
  - Evidence: `output/playwright/board-visual-40/area-default-purple-region.png`.
  - `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm harness:check`, and `git diff --check` passed.
- Risk: The prepared browser fixture still emits expected `/api/terraform/generate` 401 responses because only auth identity endpoints are mocked; no cloud, Terraform, deployment, staging, commit, or push action was performed.

### 2026-07-11 - Complete Live Observation perimeter-rail visual material

- Completed: Rebuilt Live Observation as the approved near-fullscreen white operational rails around a dominant dark map; HTML service nodes share exact rounded desktop/mobile perimeter geometry with static rails, finite pulses, selected-lane arrival feedback, responsive/reduced-motion variants, compact QR utility, and explicit pressure/QR error text. Follow-up fixes remount the SMIL layer per burst, double pulse duration/stagger to 1,520/110 ms, stack browser/AWS evidence as two horizontal bands, and keep simultaneous desktop upper/lower or mobile left/right rails geometrically separate from Audience through every EC2 branch.
- Verification:
  - The final five-file Live Observation suite passed 57/57 after the continuous dual-rail, paired-lane, repeat-replay, two-times-slower timing, two-band evidence, reduced-motion, QR failure, mobile overflow, dead-code, and shared-import RED/GREEN cycles.
  - Root `lint`, `typecheck`, `build`, `harness:check`, and `git diff --check` passed.
- Review/Limits/Safety: Root `pnpm test` was also run and still has unrelated failures: four Web failures in AWS inventory coverage/workspace shell tests and six API failures in Terraform execution/lock-file tests; the dual-rail focused suite is green. No authenticated browser render was available, so runtime visual comparison remains pending; all supplied references were inspected. Shared-worktree changes were preserved, and no API, dependency, lockfile, cloud, Terraform, or deployment action was performed.

### 2026-07-11 - Area placement feedback and auto-expansion control

- Goal/Completed: Highlight the actual Resource placement Area in light purple, remove Resource label fill, and make Area auto expansion user-controllable; added innermost-Area placement targeting for existing and palette drags plus a persistent default-ON toggle that gates expansion without disabling parenting or Terraform reference application.
- Browser: Confirmed one purple target (`#6f4cf6`), transparent label background, zero toolbar overlap, OFF/ON reload persistence, and a real OFF drop that assigned `state-area-reference-target` while the VPC stayed `390x270px`; evidence is under `output/playwright/board-visual-40/`.
- Verification/Safety: Diagram Editor 232/232 and workspace fixture 13/13 passed; root lint, typecheck, build, harness check, and diff check passed after the shared concurrent Live Observation type error was resolved. Expected mocked-session `/api/terraform/generate` 401s remained; no cloud, Terraform, deployment, staging, commit, or push action was performed.
