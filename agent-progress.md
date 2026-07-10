# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `feat/ck/287-ai-diagram`.
- Current scope: keep Amazon Q Business architecture planning, deployable materialization, and readable board layout aligned.
- Local `dev` and `origin/dev` point to `314b0c35`.
- Architecture Draft uses optional OpenAI normalization, pattern-scoped Anonymous Q retrieval, and deterministic backend materialization/validation without a generated success fallback.
- Latest deployment warning, dashboard project inventory, cost UI, and ECS worker dispatch hardening from `dev` are included.
- Production must keep `DEPLOYMENT_WORKER_MODE=in_process` until the worker task definition, entrypoint, roles, security group, and runtime are implemented.
- No Terraform apply/destroy, deployment execution, or cloud mutation was run during the merge.

## Session Record

### 2026-07-10 - Amazon Q Business architecture planning
- Goal: Use Q Business as the Architecture Draft planner without changing other OpenAI or Q explanation paths.
- Completed:
  - Added target-scoped `CREATOR_MODE`, compact ChatSync planning input, typed plan parsing, deterministic materialization, exclusion cleanup, and backend validation.
  - Preserved legacy full-preview compatibility and safe fallback for malformed, contradictory, or unmaterializable Q plans.
- Verification:
  - Focused API tests (53), `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed; `pnpm test` still had three unrelated web baseline failures.
- Risk:
  - Live Q connectivity works, but the application has `creatorModeControl=DISABLED`; no AWS configuration mutation was performed.

### 2026-07-10 - Merge latest dev into AI diagram branch
- Goal: Update local `dev` and integrate it into `feat/ck/287-ai-diagram` while preserving Amazon Q work and local generated-file changes.
- Completed:
  - Fast-forwarded local `dev` to `origin/dev` at `314b0c35` and merged it into the AI branch.
  - Resolved progress-history conflicts by keeping the latest upstream records and the current Amazon Q planning record.
- Verification:
  - `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and 53 focused AI API tests passed.
- Risk:
  - No Terraform apply/destroy, deployment execution, or cloud mutation was run.

### 2026-07-10 - Build diagram pattern knowledge package
- Goal: Create six verified AWS architecture pattern documents for S3 and Amazon Q Business ingestion.
- Completed:
  - Reviewed the AWS Terraform best-practices repository, the 90-page Prescriptive Guidance, all 154 aws-samples Terraform/HCL search results, and relevant AWS Solutions/official service guidance.
  - Added six independent pattern documents, a manifest, Amazon Q metadata sidecars, a full source inventory, review evidence, and a reproducible verifier under `docs/diagram-templates`.
  - Confirmed the live Q Business application/index is active in `ap-southeast-2`, but has no data source; existing project buckets are in `ap-northeast-2` and are not a valid ready ingestion target.
- Verification:
  - `node docs/diagram-templates/verify.mjs` passed for six patterns, 104 supported resource types, and 154 source repositories.
  - All 25 external references in the pattern and review documents returned successful HTTP responses.
- Risk:
  - Automatic S3 connector sync requires an IAM-authorized crawler role and data source; direct ingestion must be rerun after document changes.

### 2026-07-10 - Index diagram patterns in Amazon Q Business
- Goal: Upload the verified pattern package to S3 and make all six documents retrievable from the live Q Business index.
- Completed:
  - Created a dedicated `ap-southeast-2` S3 knowledge bucket with ownership enforcement, public access blocking, versioning, and SSE-S3.
  - Uploaded exactly six Markdown documents (40,447 bytes) under the architecture-pattern prefix.
  - Confirmed the Developer SSO role cannot create the connector IAM role; no partial IAM role or data source was created.
  - Used the official direct `BatchPutDocument` Blob path to ingest all six S3-backed source documents without a crawler role.
- Verification:
  - `BatchPutDocument` accepted six documents with zero failures.
  - Retrieval-mode checks for ALB/ASG/EC2, serverless API, SPA, ECS Fargate, GitHub CodeDeploy CI/CD, and Multi-AZ RDS each returned the exact expected citation title and document.
- Risk:
  - The index is current, but no automatic S3 connector sync exists. Re-run direct ingestion after changing a pattern document unless an authorized crawler role/data source is added later.

### 2026-07-10 - Bound Architecture Draft latency and remove false success fallbacks
- Goal: Prevent long Architecture Draft requests from ending as generic HTTP 500 responses while preserving verified Amazon Q output.
- Completed:
  - Replaced sequential per-pattern Q Business calls with one retrieval-mode `ChatSync` request using an OR attribute filter.
  - Required every selected canonical pattern document ID to be cited before materializing the deterministic plan.
  - Added one-hour successful citation caching and in-flight request coalescing; provider failures now return an explicit `503 service_unavailable` instead of a template preview.
  - Raised Nginx API proxy and ECS ALB idle timeouts to 120 seconds so variable Q latency is not converted into a gateway failure at the previous 60-second boundary.
  - Added the shared `service_unavailable` API contract and Korean client messaging.
- Verification:
  - Live Q retrieval cited all six indexed pattern documents in one request in 11.9 seconds.
  - Live end-to-end Architecture Draft returned `amazon_q` previews; a repeated cached request completed in 5.3 seconds.
  - Focused Q tests (9), Q quality tests (2), Architecture Draft tests (35), and the HTTP 503 route test passed.
  - `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `terraform fmt -check infra/aws/terraform/alb.tf`, and `git diff --check` passed.
- Risk:
  - Uncached Q Business latency remains externally variable (observed roughly 11-47 seconds), but only one Q request is sent and the 120-second transport budget prevents the prior 60-second cutoff.
  - Without `REDIS_URL`, the citation cache is process-local; configured Runtime Cache persistence is required to keep restarts fast.

### 2026-07-10 - Recover Q citation gaps and stabilize Architecture Draft latency
- Goal: Eliminate repeat `503 service_unavailable` responses, restart revalidation, and the web proxy's cold-Q timeout without introducing generated fallbacks.
- Completed:
  - Added bounded retries for transient batch and exact-pattern Q failures while preserving citation validation and deterministic materialization.
  - Persisted versioned successful pattern verification for seven days, started all-six-pattern cache warm-up during AI route initialization, and retained request coalescing.
  - Added a dedicated Next Route Handler with a 115-second backend request budget so cold Q responses are not cut off by the generic rewrite path.
  - Preserved backend status and JSON bodies; Q failures still surface explicitly and never become template previews.
- Verification:
  - Q/Architecture Draft tests (54), web proxy tests (2), lint, typecheck, build, and harness checks passed.
  - Live web-path checks returned four distinct Q-backed serverless, Fargate, EC2/ASG, and GitHub CI/CD previews in 4.0-6.4 seconds.
  - Exact topology checks returned three EC2 instances, one ASG, one ALB, and every requested Code* resource for the CI/CD case.
- Risk:
  - Completely cold Q retrieval remains externally variable, but initialization warm-up overlaps idle time and the dedicated route preserves up to 115 seconds for the exact Q response.

### 2026-07-10 - Verify and repair Q-backed architecture materialization
- Completed:
  - Confirmed live Q Business retrieval returns the exact SPA, Fargate, and Multi-AZ RDS documents and their deployment rules with all three expected citations.
  - Made the cited canonical plan authoritative over stale normalizer additions and resolved `complex backend + fully managed` to Fargate unless Lambda is explicit.
  - Rebuilt Fargate network, IAM, logging, ALB, upload, and RDS resources by semantic role; removed Lambda/DynamoDB/ACM/WAF leakage and orphan nodes.
  - Added Terraform nested rendering for ECS network, load balancer, and deployment rollback blocks.
- Verification:
  - Live API returned Q-backed `spa-cloudfront-s3 + ecs-fargate + multi-az-rds` with six role-specific subnets, `target_type=ip`, two private tasks, two DB subnets, no Lambda references, and no orphan nodes.
  - Focused Architecture Draft/Q/Terraform tests (61), lint, typecheck, and full build passed.
- Risk:
  - Anonymous Q Business remains retrieval evidence, not a structured diagram generator; the backend deterministically materializes and validates the cited patterns.

### 2026-07-11 - Stream Architecture Draft progress to the workspace
- Goal: Replace the opaque Architecture Draft loading message with truthful backend-driven progress.
- Completed:
  - Added NDJSON progress events for requirement preparation, normalization, Q evidence lookup, validation, and diagram materialization.
  - Added a 115-second streaming Next proxy, chunk-safe web parser, typed streamed errors, and CORS header preservation.
  - Added an accessible five-step workspace progress panel with completed, active, and pending states.
- Verification:
  - Live localhost streaming delivered every stage and a Q-backed result; browser QA confirmed the progress panel, completion transition, and zero console errors.
  - New API stream tests (3) and affected web tests (26) passed; lint, typecheck, build, and harness checks passed.
- Risk:
  - Three pre-existing `ai.test.ts` expectations remain failing in isolation (EKS warning text, Korean quantity extraction, and equivalent-wording S3 count); none execute the new stream path.

### 2026-07-11 - Repair contradictory Amazon Q EC2 spread plans
- Goal: Stop valid Q-backed drafts from becoming 500/503 errors when Q requests private-subnet spread with only one EC2.
- Completed:
  - Reconciled EC2 quantity and runtime `computeCount` to at least two whenever the Q plan requires private-subnet spread, while preserving larger explicit quantities.
  - Added bounded cause-chain logging for streamed draft failures without adding a generated fallback.
- Verification:
  - Live direct API, Next proxy, and Chrome flows returned `source=amazon_q`; Chrome displayed a 31-resource `alb-asg-ec2 + spa-cloudfront-s3 + multi-az-rds` PREVIEW.
  - Architecture Draft tests (36), lint, typecheck, build, and diff checks passed.
- Risk:
  - Three pre-existing isolated route tests still fail for unrelated deterministic draft expectations.

### 2026-07-11 - Preserve Q layouts and harden deployable EC2 materialization
- Goal: Keep the Amazon Q-backed layout as the visual baseline while repairing only invalid topology, parameters, overlaps, and routing.
- Completed:
  - Materialized ALB/ASG/EC2 plans with two-AZ public, app, and DB tiers, NAT routing, launch identity, observability, private uploads, and deployable Terraform parameters.
  - Fixed questionnaire upload parsing so the answer block stops at the next question and cannot inherit words from another prompt.
  - Preserved authored resource positions by default; retained collision, containment, and edge-overlap safeguards without deleting semantic edges.
  - Changed the AI start preview to route orthogonal lines from the selected node handles instead of drawing every edge from node centers.
- Verification:
  - Architecture Draft tests (37), Q Business/profile tests (20), Terraform graph/preview tests (32), and web diagram adapter tests (33) passed.
  - `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` passed.
- Risk:
  - Compact Q plans select cited patterns but do not carry coordinates; deterministic materialization supplies positions in that response mode, while full Q preview responses retain Q-authored coordinates.

### 2026-07-11 - Correct SSE semantics and multi-AZ board layout

- Goal: Make the reported Q-backed dynamic web draft semantically deployable and visually readable.
- Completed:
  - Materialized chat SSE as HTTP message submission plus an ALB-backed event stream with a 120-second idle timeout and PostgreSQL `LISTEN/NOTIFY` fan-out.
  - Preserved image uploads as a private purpose-specific S3 bucket, sized medium databases at 50 GB, removed a false CloudFront-to-ALB origin, and scoped upload IAM permissions.
  - Generated distinct AZ areas from subnet configuration, kept shared security groups at VPC scope, inherited ALB listener placement, and compacted canonical EC2 coordinates.
- Verification:
  - 70 API/Q/Terraform tests and 34 web adapter tests passed.
  - A live Amazon Q browser flow returned `alb-asg-ec2 + multi-az-rds`; the preview contained both AZs, upload storage, SSE and fan-out paths, and no browser errors.
  - The full preview bounds improved from `2536x3048` to `2264x1686`; lint, typecheck, build, and diff checks passed.
- Risk:
  - Dense deployable networking still produces many meaningful route and dependency edges; they are preserved and routed instead of removed.
