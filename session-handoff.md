# Session Handoff

Use this file only for compact continuation context. Write it in English and reference durable artifacts instead of repeating them.

## Currently Verified

- Branch: `fix/sw/live-observation-deployment-picker-layering`; the latest Live Observation UI work is local and unpushed.
- Focused Live Observation checks pass 71/71; harness, lint, typecheck, build, and diff checks pass.
- Browser QA confirms the successful Deployment opens in Live Observation, QR stays closed, empty capacity reserves no space, and `actual 0 / predicted 5` renders five forecast-only Task cards. Ten Tasks center as a 5x2 fleet, and a 120-request preview uses bounded representative particles.
- The approved sandbox Apply completed successfully at 2026-07-20 00:55 KST in account `614935468487`, region `ap-northeast-2`, with exact changes `+36 ~0 -0`. No traffic has been generated.

## Changes This Session

- Added development-only, API-free traffic and capacity preview controls.
- Reworked task transitions and fleet density for 0/1/3/5/10 capacity states.
- Reworked traffic motion for high visibility and bounded 2/25/120 request visualization.
- Replaced equal raw-metric cards with a collapsed operational decision analysis.
- Projected immediate request pressure into bounded predicted Task capacity while keeping AWS provider capacity authoritative as the actual count.

## Broken Or Unverified

- Live scale-out is not yet accepted because the user has not issued the exact `지금 시작` instruction.
- The successful sandbox resources are live and may accrue charges until Destroy completes.
- Root `pnpm test` stops at the unchanged baseline `packages/types/src/git-cicd-readiness-contract.test.ts:117` assertion (`null !== 0`); focused Live Observation tests pass 71/71.
- Do not generate any requests before `지금 시작`; cap the run at 963 requests. On `정리해`, complete Destroy within 30 minutes. On traffic-test failure, start Destroy immediately.

## Best Next Action

1. Commit the focused UI changes without pushing.
2. Wait for `지금 시작`; then start the Live Observation session and the bounded traffic run while monitoring animation, provider metrics, and ECS/Fargate scale-out.
3. Destroy on `정리해` within 30 minutes, or immediately if the traffic test fails.

## Suggested Skills

- Use `review` for the focused UI/test diff before publication.
- Use `qa` to repeat the browser picker regression check if the implementation changes.
