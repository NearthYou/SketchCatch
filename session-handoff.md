# Session Handoff

## Currently Verified

- Branch `codex/live-observation-feedback` keeps the focused infrastructure flow and simplifies the surrounding Live Observation UI.
- Latest `origin/dev` through `a4b87dd6` is merged into the branch; the sole progress-log conflict preserved both histories.
- Live Observation now uses the latest one-minute CloudWatch request count when Store pressure has decayed, so request rate, Task forecast, Design Simulation, and the next action appear from the same traffic evidence.
- The traffic-surge banner, raw log groups, and chronological incident timeline are no longer rendered.
- Up to three observed problems remain visible for the current observation session; matching evidence refreshes without reordering the cards, and a new session resets them.
- Task forecasts render only when the provider-observed actual count differs from the request-based projection; steady and unavailable capacity do not show a misleading expected count. Scale-out and scale-in forecast cards use continuous low-amplitude `예상 중` motion.
- Rolling active traffic uses four stable particle lanes per connector, reuses their keys at the cap, and moves them with compositor-only `translate3d` animation. Connector paint is clipped and the Task stage reserves the architecture maximum capacity, keeping horizontal scroll geometry fixed during animation.
- The failure fixture was browser-verified for readable layout, no console issues, and connector/node frames that continue changing across a 1.15-second sample.
- The latest Task forecast, motion, Template, and authored Terraform regressions pass; root lint, root typecheck, and all root build tasks pass. Browser QA recorded one constant scroll width across 40 animation samples and no forecast card in the steady-capacity state.
- Root `pnpm build` reported all five package tasks successful, but the Turbo runner did not exit after completion and was terminated.
- `codex/live-observation-feedback` at `a173b45c9df410e4394bed9a4fa3cfe90d882433` was production-deployed by GitHub Actions run `30062741359`; Web, API, and worker release jobs completed successfully.
- Production `/`, `/health`, and `/health/db` return 200, while unauthenticated `/api/projects` returns the expected 401.
- Authenticated production QA accepted four real audience check-ins, preserved the Task forecast phase before settling to actual/expected 1, kept the judgment and next action visible after stop, and observed continuous connector motion at a high accumulated request count.
- The new Architecture/demo request-per-Task target is 5 instead of 10. Existing Deployments are unchanged until a separately approved Plan/Apply. No DB migration, dependency change, Terraform action, provider scale-out load cycle, deployment, or new infrastructure resource was performed.

## Changes This Session

- Added a session-scoped signal ledger and regression coverage.
- Simplified the signal detail to evidence and available next actions.
- Removed the two obsolete rendered log/timeline components.
- Improved dashboard spacing, typography, record-card hierarchy, telemetry wording, Task transitions, sustained motion, fixed scroll geometry, and change-only forecast wording.
- Added a focused performance contract for particle count, transform-only keyframes, and compositor hints.
- Deployed the exact branch SHA to production and completed HTTP, authenticated UI, audience check-in, persistence, Task transition, animation, and browser-console verification.
- Deployed the follow-up provider-traffic judgment fix and completed production HTTP and authentication-boundary smoke.

## Broken Or Unverified

- Provider-confirmed production scale-out was not exercised; the production acceptance used four audience check-ins and did not run the separately gated load profile.
- Root Turbo still has the known post-success non-exit behavior on this Windows environment; the changed Web package build exits successfully.

## Best Next Action

1. Review and merge the focused Live Observation UI commits.
2. Use production workflow run `30062741359` as the latest deployment evidence.
3. Run a separately approved provider load cycle only if production scale-out acceptance is required.
