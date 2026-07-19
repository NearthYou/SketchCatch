# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/` and remain available in Git history.

## Current Verified State

- Branch `codex/remove-practice-profile` removes the legacy `practice` Deployment live profile from shared types, API validation, runtime defaults, and the database enum.
- Migration `0054_remove_practice_live_profile.sql` converts existing `practice` rows to `demo_web_service` before rebuilding the enum; the compatible API normalizes legacy rows during rollout.
- The previous uncommitted work from `Refactor/jh/498-배포-ui-수정` remains recoverable in `stash@{0}`.
- Focused profile, migration, safety, route, and web checks pass. Root harness, migration compatibility, lint, typecheck, build, and diff checks pass. The full API suite still exposes 12 unrelated existing failures and one cancelled artifact timer test.
- The approved sandbox cycle used `SketchCatchSandboxOperator` for account `614935468487` in `ap-northeast-2`. Deployment `57bda2bf-88af-4e15-8674-0b2ef20f1e8c` applied exactly `+36 ~0 -0` and completed successfully at 2026-07-20 00:55 KST. No traffic has been generated.
- `feature_list.json` retains one separately owned aggregate `in_progress` item: `ARCHITECTURE-BOARD-COMPILER-409`.

## Session Record

### 2026-07-20 - Remove the legacy Deployment live profile

- Removed `practice` from the public Deployment profile contract and made `demo_web_service` the default live apply profile, including Application Auto Scaling resources.
- Added migration `0054` to rewrite existing rows before removing the PostgreSQL enum value, plus code-first compatibility for safe rollout ordering.
- Removed the unused duplicate frontend profile recommendation helper and updated API/web fixtures and contract documentation.
- Verified focused tests, migration compatibility, lint, typecheck, build, and diff checks. The unrelated full-suite baseline failures remain outside this workstream.

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
- Production still requires the compatible API/worker image to be deployed before the approved, snapshot-backed `0054` migration runs.

## Next Action

1. Review and merge `codex/remove-practice-profile`, deploy the compatible API/worker image, then run the approved production migration workflow with an RDS snapshot.
2. On the user's exact `지금 시작`, start observation and run at most 963 requests while monitoring traffic animation and ECS/Fargate scale-out.
3. On `정리해`, complete Destroy within 30 minutes; on any traffic-test failure, start Destroy immediately.
