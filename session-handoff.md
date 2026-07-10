# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Current branch: `feat/ck/287-ai-diagram`.
- Active workstream: `ECS-MIGRATION-000`.
- Architecture Draft uses one Q Business retrieval-mode request for all selected indexed patterns and validates every expected document citation.
- `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, focused AI tests, Terraform formatting, and `git diff --check` passed.
- Live Q retrieval and Architecture Draft generation were exercised without infrastructure mutation.

## Changes This Session

- Removed sequential per-pattern Q requests and replaced them with one OR-filtered request that must cite all selected pattern documents.
- Added one-hour verified-citation caching and in-flight request coalescing.
- Q generation failures now surface as `503 service_unavailable`; they no longer return a template draft as if generation succeeded.
- Nginx and ECS ALB request budgets are 120 seconds for externally variable Q latency.

## Broken Or Unverified

- Uncached Q Business latency is variable; observed retrieval latency ranged from about 11 to 47 seconds.
- Citation caching is process-local, so a fresh API process performs one Q request before cached requests become fast.
- The separate ECS migration workstream remains in progress and is not changed by this Architecture Draft fix.

## Best Next Action

- Deploy the API/Nginx/ALB changes, then measure the production `/api/ai/architecture-draft` first and repeated request latency from the browser.
