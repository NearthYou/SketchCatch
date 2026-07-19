# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/` and remain available in Git history.

## Current Verified State

- Branch `fix/sw/live-observation-deployment-picker-layering` contains implementation commit `132346f0`; `origin/dev` has advanced to `252e7085` and still needs to be integrated before publication.
- The modal now sits above known Workspace floating surfaces. An empty eligible-Deployment list is disabled with an explicit placeholder, and Direct Deployment opens Live Observation without leaking the click event as a selection.
- Focused Live Observation and Design Analysis checks pass 36/36, browser QA confirms the empty-picker behavior, and `pnpm harness:check` passes on 2026-07-20.
- The sandbox execution-role preflight remains fail-closed with `sts:AssumeRole` AccessDenied. No Apply, traffic, Destroy, DB migration, dependency change, or push was performed for the current work.
- `feature_list.json` retains one separately owned aggregate `in_progress` item: `ARCHITECTURE-BOARD-COMPILER-409`.

## Session Record

### 2026-07-20 - Compact active agent context

- Removed stale branches and completed workstreams from the active trackers, grouped missing 2026-07-19 evidence in `docs/agent-history/2026-07.md`, and left exact detail discoverable in Git history.
- `pnpm harness:check` and `git diff --check` pass. The cleanup changed no product code, contract, dependency, migration, or cloud state.

### 2026-07-20 - Keep the Live Observation Deployment picker usable

- Raised the Live Observation modal stacking layer above every known Workspace notification and AI floating surface.
- Reproduced the black strip as an enabled native picker with zero options, then disabled the empty picker and added an unavailable placeholder.
- Prevented the Direct Deployment launch button from forwarding its click event as a Deployment selection.
- Added source-contract regressions for all three conditions. Focused checks pass 36/36, browser QA passes, and the repository harness passes.
- Preserved the cloud safety boundary: the unresolved sandbox role preflight does not authorize a retry or any infrastructure mutation.

## Known Risk

- Live scale-out is not accepted from the latest failed sandbox cycle. Resolve the role trust/permission path and obtain a fresh explicit approval before any new Plan/Apply/traffic/Destroy cycle.

## Next Action

1. Review and publish the focused UI fix to `dev` only when requested.
2. Keep cloud acceptance work blocked until `sts:AssumeRole` succeeds and a new bounded sandbox cycle is explicitly approved.
