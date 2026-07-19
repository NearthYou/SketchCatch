# Session Handoff

Use this file only for compact continuation context. Write it in English and reference durable artifacts instead of repeating them.

## Currently Verified

- Branch: `dev`, synchronized with origin through `1b3c1330` and integrated with the reviewed profile-removal work. Previous uncommitted `Refactor/jh/498-배포-ui-수정` work is preserved in `stash@{0}`.
- The legacy `practice` Deployment profile is removed from the public contract and replaced by `demo_web_service`; migration `0054` rewrites existing rows before removing the enum value.
- Production ECS run `29700391499` deployed app SHA `2da6ba32d28e98afcbfad0e9f591915a48b5b461`; production migration run `29700681495` completed after snapshot `sketchcatch-production-pre-migration-29700681495` became available.
- Post-migration HTTPS checks for `/`, `/health`, and `/health/db` return 200.
- The merged result passes 130 focused API checks and 31 focused Web checks. Root harness, migration compatibility, lint, serial typecheck, build, and diff checks pass. The full API suite has unrelated baseline failures outside this diff.
- The approved sandbox Apply completed successfully at 2026-07-20 00:55 KST in account `614935468487`, region `ap-northeast-2`, with exact changes `+36 ~0 -0`. No traffic has been generated.

## Changes This Session

- Removed `practice` from shared types, API request validation, DB schema defaults, and live apply profile selection.
- Added code-first normalization so old DB rows behave as `demo_web_service` while the compatible image and migration roll out separately.
- Added `0054_remove_practice_live_profile.sql`, journal registration, migration regression tests, and updated deployment contract documentation.
- Removed the unused duplicate frontend profile recommender and updated affected fixtures.
- Deployed the compatible API, Web, and worker image first, then applied migration `0054` through the approved snapshot-backed workflow.

## Broken Or Unverified

- The full API suite reproduces 12 unrelated existing assertion failures and one cancelled artifact timer test; all tests changed or added by this workstream pass.
- Live scale-out is not yet accepted because the user has not issued the exact `지금 시작` instruction.
- The successful sandbox resources are live and may accrue charges until Destroy completes.
- Do not generate any requests before `지금 시작`; cap the run at 963 requests. On `정리해`, complete Destroy within 30 minutes. On traffic-test failure, start Destroy immediately.

## Best Next Action

1. Confirm the next user Deployment uses `demo_web_service` and no longer exposes the removed profile.
2. Wait for `지금 시작`; then start the Live Observation session and the bounded traffic run while monitoring animation, provider metrics, and ECS/Fargate scale-out.
3. Destroy on `정리해` within 30 minutes, or immediately if the traffic test fails.

## Suggested Skills

- Use `qa` only if Deployment profile UI behavior changes further.
