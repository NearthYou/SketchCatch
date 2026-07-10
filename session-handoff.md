# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Current branch: `feat/ck/287-ai-diagram`.
- Active workstream: `ECS-MIGRATION-000`.
- Architecture Draft uses one Q Business retrieval-mode request for all selected indexed patterns and validates every expected document citation.
- Missing batch citations and transient batch failures are recovered through bounded, exact-document Q revalidation.
- Verified pattern document IDs persist through the shared Runtime Cache when `REDIS_URL` is configured.
- `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, focused AI tests, Terraform formatting, and `git diff --check` passed.
- Live Q retrieval and Architecture Draft generation were exercised without infrastructure mutation.

## Changes This Session

- Removed sequential per-pattern Q requests and replaced them with one OR-filtered request that must cite all selected pattern documents.
- Added one-hour verified-citation caching and in-flight request coalescing.
- Wired that verification cache to Redis and removed concurrent initial cache reads that degraded the adapter.
- Q generation failures now surface as `503 service_unavailable`; they no longer return a template draft as if generation succeeded.
- Nginx and ECS ALB request budgets are 120 seconds for externally variable Q latency.

## Broken Or Unverified

- Uncached Q Business latency is variable; observed retrieval latency ranged from about 11 to 47 seconds.
- A completely empty Redis still performs one Q verification cycle; later API processes reuse the persisted citations.
- The separate ECS migration workstream remains in progress and is not changed by this Architecture Draft fix.

## Best Next Action

- Keep production `REDIS_URL` configured, deploy the API/Nginx/ALB changes, then measure cold-cache and warm-cache `/api/ai/architecture-draft` latency.
