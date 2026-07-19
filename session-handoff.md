# Session Handoff

Use this file only for compact continuation context. Write it in English and reference durable artifacts instead of repeating them.

## Currently Verified

- Branch: `fix/sw/live-observation-deployment-picker-layering`; conflicts from merging `origin/dev` at `252e7085` are resolved and staged, but the merge commit and push are not complete.
- Focused Live Observation and Design Analysis checks pass 51/51. Root harness, lint, typecheck, build, and diff checks pass.
- Browser QA confirms the successful Direct Deployment opens in Live Observation without an event-selection runtime error. The modal is open with Deployment `57bda2bf-88af-4e15-8674-0b2ef20f1e8c` selected and status `시작 전`.
- The approved sandbox Apply completed successfully at 2026-07-20 00:55 KST in account `614935468487`, region `ap-northeast-2`, with exact changes `+36 ~0 -0`. No traffic has been generated.

## Changes This Session

- Compacted the active trackers and moved stale 2026-07-19 context into `docs/agent-history/2026-07.md` without duplicating records already archived.
- Raised the Live Observation overlay above known Workspace floating surfaces.
- Changed an empty eligible-Deployment list from an enabled blank native picker to one disabled unavailable option.
- Wrapped the Direct Deployment launch callback so the click event cannot become a Deployment selection.
- Restarted the local API with the safe `sketchcatch-sandbox-operator` profile after confirming the prior failure was the stale runtime credential path.
- Generated and approved the exact bounded Plan, completed Apply, and opened the successful Deployment in Live Observation.

## Broken Or Unverified

- Live scale-out is not yet accepted because the user has not issued the exact `지금 시작` instruction.
- The successful sandbox resources are live and may accrue charges until Destroy completes.
- Do not generate any requests before `지금 시작`; cap the run at 963 requests. On `정리해`, complete Destroy within 30 minutes. On traffic-test failure, start Destroy immediately.

## Best Next Action

1. Conclude the already resolved `origin/dev` merge commit without pushing.
2. Wait for `지금 시작`; then start the Live Observation session and the bounded traffic run while monitoring animation, provider metrics, and ECS/Fargate scale-out.
3. Destroy on `정리해` within 30 minutes, or immediately if the traffic test fails.

## Suggested Skills

- Use `review` for the focused UI/test diff before publication.
- Use `qa` to repeat the browser picker regression check if the implementation changes.
