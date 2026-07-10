# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Current branch: `feat/ck/287-ai-diagram`.
- Active workstream: `ECS-MIGRATION-000`.
- Architecture Draft uses one Q Business retrieval-mode request for all selected indexed patterns and validates every expected document citation.
- Missing citations and transient batch or exact-document failures are recovered through bounded Q revalidation retries.
- Versioned verified pattern document IDs persist for seven days through the shared Runtime Cache when `REDIS_URL` is configured.
- AI route initialization starts verification warm-up for all six indexed patterns, and the dedicated Next route allows up to 115 seconds for a cold exact-Q response.
- `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, focused AI tests, Terraform formatting, and `git diff --check` passed.
- Live Q retrieval and Architecture Draft generation were exercised without infrastructure mutation.
- Live Q returned exact citations and deployment guidance for SPA, Fargate, and Multi-AZ RDS; the API materialized a matching role-specific graph with no orphan nodes.

## Changes This Session

- Removed sequential per-pattern Q requests and replaced them with one OR-filtered request that must cite all selected pattern documents.
- Added seven-day versioned verified-citation caching, initialization warm-up, and in-flight request coalescing.
- Wired that verification cache to Redis and added transient retries for both batch and exact-pattern retrieval.
- Q generation failures now surface as `503 service_unavailable`; they no longer return a template draft as if generation succeeded.
- Nginx and ECS ALB request budgets are 120 seconds; the dedicated Next Architecture Draft route uses a 115-second backend budget.
- Canonical Q plans now override stale normalizer resources, and complex fully managed backends select Fargate unless Lambda is explicit.
- Fargate materialization now separates public/app/DB subnets, NAT routes, IAM roles, logs, ALB target registration, upload storage, and Multi-AZ RDS configuration.
- Terraform renders ECS service network, load balancer, and deployment circuit-breaker blocks.

## Broken Or Unverified

- Uncached Q Business latency is variable; observed retrieval latency ranged from about 11 to 47 seconds.
- A completely empty Redis still performs one Q verification cycle, but warm-up starts during route initialization and later API processes reuse citations for seven days.
- The separate ECS migration workstream remains in progress and is not changed by this Architecture Draft fix.
- Anonymous Q Business supplies retrieval text and citations only; SketchCatch remains responsible for deterministic graph construction and semantic validation.

## Best Next Action

- Exercise the corrected Architecture Draft in the browser and inspect the generated Terraform plan before approving any deployment.
