# Session Handoff

## Active Unmerged Branch

- `codex/increase-live-observation-refresh` contains only a 1,000 ms to 500 ms Live Observation Store snapshot SSE cadence change and its contract test.
- The canceled Live Observation UI experiments were fully reverted; no UI source change remains.
- Focused tests, lint, typecheck, build, harness, and diff checks pass. AWS provider cache remains 10 seconds, so the change does not increase AWS polling cadence.
- Do not merge this branch into `dev` unless the user explicitly asks.

Use this file only for compact continuation context. Write it in English and reference durable artifacts instead of repeating them.

## Prior Production Baseline

- Branch `codex/fix-deployment-live-observation` contains current `origin/dev` at `334e33c5`; repair commit `7ef4b6a5` is deployed from exact branch SHA `59b0abee` and published in PR #532.
- Production workflow `29876627509` passed. The API service is stable on `sketchcatch-production-api:58`.
- Fresh observation `c815c2b8-9eb9-44f2-aeba-0eec1f31394b` remained active. Chrome verified one running Fargate Task, audience `connected`, repeat participation, heartbeat continuity, and Store-backed request growth `+1 -> +2 -> +3` with no audience console errors.
- Redis 8 integration passes 31/31; harness, lint, typecheck, and all five production builds pass. No migration or dependency change exists.

## Changes This Session

- The API and shared contract validly emitted optional `endpoints.audienceApplicationUrl`, but the Redis Lua reader still required exactly two endpoint keys. It therefore rejected every newly written production session as corrupt and exposed HTTP 503 `LIVE_OBSERVATION_CACHE_UNAVAILABLE` on the first read.
- The Lua contract now accepts the optional field only when it is a string, and a public-behavior integration regression covers the real manifest shape.

## Broken Or Unverified

- PR #532 must finish CI and merge into `dev` if this handoff is read before the current session completes.
- Provider-confirmed load-triggered scale-out remains a separate blocked acceptance cycle and requires explicit approval. Do not create new traffic or mutate user Deployment resources without that approval.

## Best Next Action

1. Merge PR #532 after CI succeeds.
2. Run a separately approved load cycle only if provider-confirmed scale-out acceptance is required.
