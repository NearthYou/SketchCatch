# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/` and remain available in Git history.

## Current Verified State

- Branch `fix/sw/live-observation-deployment-picker-layering` contains the current Live Observation presentation work after the resolved `origin/dev` merge.
- Focused Live Observation checks pass 71/71; harness, lint, typecheck, build, and diff checks pass. Browser QA covers zero, five, and ten Task layouts plus 2, 25, and 120 request development-only bursts.
- Live Observation now renders bounded traffic motion, a task-count-responsive Fargate fleet, and a default-collapsed operational analysis that maps observations to status, capacity, failure, cost, and Terraform recommendations.
- Immediate rolling request evidence projects bounded Fargate capacity from the deployed `ALBRequestCountPerTarget` target. Predicted scale-out and scale-in remain visually distinct from provider-confirmed ECS Tasks.
- The approved sandbox cycle used `SketchCatchSandboxOperator` for account `614935468487` in `ap-northeast-2`. Deployment `57bda2bf-88af-4e15-8674-0b2ef20f1e8c` applied exactly `+36 ~0 -0` and completed successfully at 2026-07-20 00:55 KST. No traffic has been generated.
- `feature_list.json` retains one separately owned aggregate `in_progress` item: `ARCHITECTURE-BOARD-COMPILER-409`.

## Session Record

### 2026-07-20 - Refine Live Observation traffic and capacity presentation

- Removed the fake empty Task slot and render the Fargate fleet only when provider or development-preview capacity exists.
- Added development-only, API-free previews for 0/1/3/5/10 Tasks and 2/25/120 request bursts.
- Bounded high-volume traffic to five representative particles, with distinct FLOW/BUSY/SURGE line color, thickness, speed, and node reactions.
- Replaced the seven equal metric cards with a default-collapsed operational analysis and aligned its typography and surfaces with Workspace tokens.
- Kept QR closed by default and anchored its utility below the QR button.
- Added immediate request-based capacity projection while preserving AWS observations as the authoritative actual Task count. Browser QA confirms `actual 0 / predicted 5` renders five forecast-only cards.

### 2026-07-20 - Integrate latest dev for direct publication

- Merged `origin/dev` at `252e7085`, including PR #499's ProjectDraft recovery presentation and timestamp changes.
- Resolved the progress-log conflict by retaining the current workstream here and archiving PR #499's completed record under `docs/agent-history/2026-07.md`.
- Preserved both overlay intents in one regression: blocking draft recovery stays above Live Observation, while Live Observation stays above non-blocking Workspace surfaces.
- Full merged-result verification passes before the merge commit. No direct `dev` push has been performed.

### 2026-07-20 - Prepare the approved Live Observation sandbox cycle

- Revalidated the non-production caller and execution role, restarted the local API with the safe sandbox profile, and regenerated the exact infrastructure Plan `+36 ~0 -0`.
- Applied Deployment `57bda2bf-88af-4e15-8674-0b2ef20f1e8c` successfully in account `614935468487`, region `ap-northeast-2`; CloudFront, ALB, ECS/Fargate, and Application Auto Scaling resources are available.
- Reproduced and fixed Direct Deployment's click-event leakage into `LiveObservationSelection`, then confirmed the successful Deployment is selected in the open Live Observation modal with one available Fargate task.
- No traffic was sent. Wait for the user's exact `지금 시작` instruction before starting observation and the bounded maximum 963-request run; run Destroy within 30 minutes after `정리해`, or immediately on test failure.

### 2026-07-20 - Compact active agent context

- Removed stale branches and completed workstreams from the active trackers, grouped missing 2026-07-19 evidence in `docs/agent-history/2026-07.md`, and left exact detail discoverable in Git history.
- The cleanup changed no product code, contract, dependency, migration, or cloud state.

### 2026-07-20 - Keep the Live Observation Deployment picker usable

- Raised Live Observation above non-blocking Workspace notification and AI surfaces while preserving the blocking ProjectDraft recovery layer.
- Disabled the empty Deployment picker and added an unavailable placeholder instead of an enabled blank native menu.
- Prevented the Direct Deployment launch button from forwarding its click event as a Deployment selection.
- Added source-contract regressions for all three conditions. Focused checks pass 36/36 and browser QA confirms the empty-picker behavior.

## Known Risk

- Live scale-out is not yet accepted because the approved traffic run has not started. The sandbox resources are live and may accrue charges until Destroy completes.
- Root `pnpm test` still stops at the pre-existing `packages/types/src/git-cicd-readiness-contract.test.ts:117` assertion (`null !== 0`); the focused Live Observation suite passes and this file is unchanged.

## Next Action

1. Commit the focused UI work without pushing.
2. On the user's exact `지금 시작`, start observation and run at most 963 requests while monitoring traffic animation and ECS/Fargate scale-out.
3. On `정리해`, complete Destroy within 30 minutes; on any traffic-test failure, start Destroy immediately.
