# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Current branch: `feat/ck/287-ai-diagram`.
- Active workstream: `ECS-MIGRATION-000`.
- Architecture Draft uses one Q Business retrieval-mode request for all selected indexed patterns and validates every expected document citation.
- Missing citations and transient batch or exact-document failures are recovered through bounded Q revalidation retries.
- Versioned verified pattern document IDs persist for seven days through the shared Runtime Cache when `REDIS_URL` is configured.
- AI route initialization starts verification warm-up for all six indexed patterns, and the dedicated Next route allows up to 115 seconds for a cold exact-Q response.
- Architecture Draft generation streams real backend progress stages through NDJSON to an accessible workspace progress panel.
- `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, focused AI tests, Terraform formatting, and `git diff --check` passed.
- Live Q retrieval and Architecture Draft generation were exercised without infrastructure mutation.
- Live Q returned exact citations and deployment guidance for SPA, Fargate, and Multi-AZ RDS; the API materialized a matching role-specific graph with no orphan nodes.
- Contradictory Q plans that request EC2 private-subnet spread with one node are normalized to a deployable two-node minimum before materialization.
- Authored ArchitectureJson coordinates are now the default visual baseline; the web adapter only applies containment, collision, and edge-routing corrections.
- Canonical EC2 materialization includes deployable two-AZ networking, ALB/ASG/launch-template identity, upload storage when selected, Multi-AZ RDS, and observability.
- Chat SSE materialization now includes HTTP message submission, a 120-second ALB stream path, and PostgreSQL `LISTEN/NOTIFY` coordination for multi-instance fan-out.
- Board conversion creates one AZ area per configured zone and keeps subnet-spanning resources within their common VPC.
- AI previews represent Region, VPC, Availability Zone, and Subnet only through parent containment; those area nodes cannot be edge endpoints.
- AI-generated Auto Scaling Groups and Security Groups render as regular resource icons, preserving their operational arrows without empty area boxes.
- Public AI architectures add board-only User / Client and Internet nodes and show one representative external request path; internal-only ALBs do not.
- Internet Gateway is centered across the VPC top boundary after layout; NAT Gateway remains inside its public subnet and API Gateway remains outside VPC containment.

## Changes This Session

- Removed sequential per-pattern Q requests and replaced them with one OR-filtered request that must cite all selected pattern documents.
- Added seven-day versioned verified-citation caching, initialization warm-up, and in-flight request coalescing.
- Wired that verification cache to Redis and added transient retries for both batch and exact-pattern retrieval.
- Q generation failures now surface as `503 service_unavailable`; they no longer return a template draft as if generation succeeded.
- Nginx and ECS ALB request budgets are 120 seconds; the dedicated Next Architecture Draft route uses a 115-second backend budget.
- Canonical Q plans now override stale normalizer resources, and complex fully managed backends select Fargate unless Lambda is explicit.
- Fargate materialization now separates public/app/DB subnets, NAT routes, IAM roles, logs, ALB target registration, upload storage, and Multi-AZ RDS configuration.
- Terraform renders ECS service network, load balancer, and deployment circuit-breaker blocks.
- The Architecture Draft client consumes the dedicated stream, preserves typed Q failures, and displays completed/current/pending generation stages.
- Live direct API, Next proxy, and Chrome checks returned Q-backed previews after the EC2 spread invariant repair; no generated fallback was added.
- The preview renderer now uses selected edge handles and orthogonal paths instead of center-to-center curves; semantic edges remain intact.
- Upload questionnaire parsing reads only the answer block before the next question, preventing image/document words in the question from creating false upload resources.
- Image-upload prompts retain a private upload-purpose bucket even when Q selects no separate SPA static-delivery pattern.
- Shared security groups no longer absorb resources from multiple subnets, and listener placement follows the referenced ALB into the VPC.
- Live Q/browser verification reduced the reported preview bounds from `2536x3048` to `2264x1686` with distinct `ap-northeast-2a` and `ap-northeast-2b` areas.
- Exact Q DiagramJson previews now preserve Q coordinates while reapplying parent metadata and the area-only containment invariant.
- A live Q regeneration produced 43 resources and removed `binds`, `hosts ALB`, and `member` area arrows while retaining meaningful resource edges.
- A later live Q regeneration preserved the 43 deployable resources and added User / Client, Internet, `requests`, and `public traffic` presentation flow without Terraform impact.
- Live gateway verification measured the VPC at `y=400` and the centered IGW icon at `y=344..402`, while NAT Gateway A remained inside the VPC.

## Broken Or Unverified

- Uncached Q Business latency is variable; observed retrieval latency ranged from about 11 to 47 seconds.
- A completely empty Redis still performs one Q verification cycle, but warm-up starts during route initialization and later API processes reuse citations for seven days.
- The separate ECS migration workstream remains in progress and is not changed by this Architecture Draft fix.
- Anonymous Q Business supplies retrieval text and citations only; SketchCatch remains responsible for deterministic graph construction and semantic validation.
- Three pre-existing isolated route tests fail on EKS warning text, Korean quantity extraction, and equivalent-wording S3 counts; the new stream and web progress tests pass.
- The focused suites for this work pass; the broader web suite still has unrelated landing/start-page style expectation failures.
- Deployable network diagrams remain edge-dense because route associations, IAM, logging, scaling, and database dependencies are intentionally preserved.
- The twenty-case random project-query matrix is not complete; one post-fix live Q case is verified and nineteen remain.

## Best Next Action

- Inspect the kept `SSE Multi-AZ 검증` preview and its Terraform before approval; no cloud mutation has been run.
