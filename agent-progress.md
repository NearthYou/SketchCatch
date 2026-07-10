# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `feat/ck/287-ai-diagram`.
- Current scope: keep Amazon Q Business architecture planning and validation while integrating the latest `dev` changes.
- Local `dev` and `origin/dev` point to `314b0c35`.
- Architecture Draft uses optional OpenAI normalization, pattern-scoped Anonymous Q retrieval, and deterministic backend materialization/validation with safe fallback.
- Latest deployment warning, dashboard project inventory, cost UI, and ECS worker dispatch hardening from `dev` are included.
- Production must keep `DEPLOYMENT_WORKER_MODE=in_process` until the worker task definition, entrypoint, roles, security group, and runtime are implemented.
- No Terraform apply/destroy, deployment execution, or cloud mutation was run during the merge.

## Session Record

### 2026-07-10 - Generalize page-driven Q architecture drafts

- Goal: Verify and fix Architecture Drafts whose natural-language requirements do not exactly match one of the six indexed patterns while still using every current project-page selection.
- Completed:
  - Kept the six cited Q patterns as verified backbones while preserving explicit supplemental panel resources such as EKS, SQS, DynamoDB, EventBridge, WAF, and ACM.
  - Added page-answer runtime inference for generic shops, mobile APIs, microservices, static sites, and complex backends inside the Architecture Draft-only Q provider.
  - Added consistent EC2/ALB negation, topology sanitization, supplemental edges, orphan prevention, and one retry without changing other OpenAI or Q explanation paths.
  - Added security and cost policy for TLS, least-privilege IAM, logging, secrets, encryption, WAF, availability, and recurring-cost gates.
- Verification:
  - 65 focused AI API tests passed, including seven page-selection supplemental/security scenarios, 42 exact pattern profiles, and 12 stable materializations.
  - A live Anonymous Q run used the current page's 15 selections plus natural language for 10 non-exact scenarios; all 10 were Q-backed, passed required/forbidden/orphan checks, and produced 10 distinct signatures across 18 ChatSync calls.
  - `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` passed.
- Risk:
  - Supplemental resources reuse the closest cited backbone and backend deployment catalog; a new standalone architecture family still needs its own reviewed Q pattern document before it can become an independent backbone.
  - Anonymous Q retrieval consumes existing application capacity, so live regression runs remain intentionally bounded.

### 2026-07-10 - Stabilize Anonymous Q architecture generation

- Goal: Produce distinct, deployable Architecture Drafts from project answers without a paid Q Business Creator subscription.
- Completed:
  - Added normalized pattern IDs and exact `pattern_id` retrieval filters for six verified architecture patterns.
  - Changed Q retrieval to one cited request per selected pattern and made the backend materialize only canonical, deployable resources and topology.
  - Added generic EC2, serverless, SPA, ECS Fargate, GitHub CI/CD, Multi-AZ RDS, and composed-pattern handling, including explicit EC2 negation.
  - Preserved the existing OpenAI and Amazon Q explanation paths by routing only `architecture_draft` through the dedicated retrieval provider.
- Verification:
  - `node docs/diagram-templates/verify.mjs` passed for six patterns, 104 supported resource types, and 154 source repositories.
  - 64 focused API tests passed, including 42 exact project-answer pattern selections and 12 repeatable canonical materializations.
  - A live Anonymous Q run used 10 `ChatSync` retrieval calls across six profiles; all six used `amazon_q`, had zero orphan nodes, and produced six distinct signatures.
  - `terraform fmt -check infra/aws/terraform` passed.
  - `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` passed.
- Risk:
  - Q Business retrieval usage still consumes the existing anonymous application's capacity, and the index must be re-ingested after pattern document changes.
  - The canonical registry currently covers the six verified pattern families; new families require a reviewed pattern document and canonical topology before activation.

### 2026-07-10 - Signup password error highlight fix
### 2026-07-10 - Harden ECS worker dispatch after merged PR review

- Goal: Address valid post-merge review findings on PR #296 without running live AWS commands.
- Completed:
  - Re-read all five unresolved review threads with thread resolution and outdated state.
  - Made missing `RunTask` task ARNs fail dispatch instead of leaving an untraceable running job.
  - Made stale ECS cancellation paths terminalize the active deployment job before the existing deployment fail-safe runs.
  - Made ECS task verification or stop API failures return a retryable result so the route responds with 503 and preserves the active lock against concurrent Terraform execution.
  - Made JSON worker config parser casts explicit after runtime validation.
  - Clarified that ECS worker mode must remain disabled until worker runtime and infrastructure exist, and documented public-IP and cluster-scoped IAM requirements.
- Verification:
  - `pnpm harness:check` passed before and after edits.
  - `pnpm lint` passed.
  - `pnpm typecheck` passed.
  - `pnpm build` passed.
  - `git diff --check` passed.
- Risk:
  - No new tests were added or run per user direction.
  - The worker task definition, worker roles, worker security group, and worker process are not implemented yet.

### 2026-07-10 - Start ECS Phase 5 API worker dispatch

- Goal: Add API-side ECS worker dispatch so Terraform execution can move from in-process background jobs to ECS RunTask one-off worker tasks when explicitly enabled.
- Completed:
  - Merged Phase 4 PR #294 into `dev`.
  - Created GitHub issue #295.
  - Created linked branch `feature/sw/295-ecs-worker-task-dispatch` from updated `dev` with `gh issue develop`.
  - Added `DEPLOYMENT_WORKER_MODE` and ECS worker dispatch env validation for cluster, task definition, subnets, security groups, container name, command, static worker env, and public IP setting.
  - Added ECS/local deployment worker dispatcher abstraction using `RunTask`, `DescribeTasks`, and `StopTask`.
  - Wired deployment init/plan/apply/destroy-plan/destroy routes to create a `DeploymentJob` and dispatch ECS RunTask when ECS worker mode is enabled.
  - Wired cancel to call ECS StopTask when an active job has an ECS task ARN; otherwise the existing stale RUNNING fail-safe still marks the deployment failed.
  - Added `init` to `deployment_job_operation` with migration `0028_deployment_job_init_operation.sql`.
  - Added route/config/dispatcher tests and updated `docs/deployment.md` with env and least-privilege IAM requirements.
- Verification so far:
  - `pnpm harness:check` passed.
  - `pnpm lint` passed.
  - `pnpm typecheck` passed.
  - `pnpm build` passed.
  - `pnpm --filter @sketchcatch/api exec tsx --test src/deployments/deployment-worker-dispatcher.test.ts src/config/env.test.ts src/routes/deployments.test.ts` passed.
  - `pnpm --filter @sketchcatch/api typecheck` passed.
  - `pnpm --filter @sketchcatch/api lint` passed.
  - `pnpm --filter @sketchcatch/api test -- deployments` ran the whole API suite because the package script does not filter test files; Phase 5 tests passed, but pre-existing unrelated AI fixture and missing docs/jh fixture failures were reported.
- Risk:
  - Worker runtime is still out of scope; ECS-dispatched tasks need Phase 6 code to consume `SKETCHCATCH_DEPLOYMENT_JOB_ID` and finish deployment state updates.
  - The requested API deployments test command currently exits 1 because of unrelated pre-existing failures in `aiLlmExplanationRoutes.test.ts` and a missing `docs/jh/000_AWS리소스목록_JH.md` fixture.
  - No live AWS commands should be run in Phase 5.

### 2026-07-10 - Start ECS Phase 4 deployment job model

- Goal: Add a deployment job model for Terraform execution jobs so Phase 5 can dispatch ECS RunTask one-off workers.
- Completed:
  - Created GitHub issue #293.
  - Created linked branch `feature/sw/293-deployment-runtask-jobs` from `dev` with `gh issue develop`.
  - Read root `AGENTS.md`, `docs/sw/agents.md`, `docs/sw/spec.md`, `docs/sw/plan.md`, and `apps/api/AGENTS.md`.
  - Added `deployment_jobs` DB schema/migration with operation/status enums, requester/access context, source deployment state, ECS task ARN placeholder, timestamps, error summary, and active-job duplicate protection.
  - Added internal deployment job repository/service helpers for create, dispatching/running, task ARN recording, success, failure, and cancellation transitions.
  - Added deployment job service tests for creation, state transitions, duplicate protection, and masked failure/cancellation recording.
  - Updated `docs/data-models.md` with the internal `DeploymentJob` contract while noting public Deployment API shapes remain stable.
- Verification so far:
  - `pnpm harness:check` passed before Phase 4 edits.
  - `pnpm harness:check` passed after Phase 4 edits.
  - `pnpm lint` passed.
  - `pnpm typecheck` passed.
  - `pnpm build` passed.
  - `pnpm --filter @sketchcatch/api exec tsx --test src/deployments/deployment-job-service.test.ts` passed.
  - `pnpm --filter @sketchcatch/api lint` passed.
  - `pnpm --filter @sketchcatch/api typecheck` passed.
  - `pnpm --filter @sketchcatch/api test -- deployment` ran the whole API suite because the package script does not filter test files; the new deployment job tests passed, but pre-existing unrelated AI fixture and missing docs/jh fixture failures were reported.
- Risk:
  - Phase 4 does not dispatch ECS tasks; Phase 5 must wire the job model into deployment routes and worker dispatcher config.
  - The requested API deployment test command currently exits 1 because of unrelated pre-existing failures in `aiLlmExplanationRoutes.test.ts` and a missing `docs/jh/000_AWS리소스목록_JH.md` fixture.
  - No live AWS commands should be run in Phase 4.

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

### 2026-07-10 - Enable a dedicated Amazon Q Business Creator application
- Goal: Enable Q Business Creator mode without changing the anonymous retrieval application that serves the architecture knowledge index.
- Completed:
  - Confirmed AWS rejects Creator mode updates for `ANONYMOUS` applications and left the existing retrieval application unchanged.
  - Created a separate active `AWS_IAM_IDC` Q Business application, enabled `creatorModeControl`, assigned the existing IAM Identity Center user, and created a `Q_BUSINESS` subscription.
- Verification:
  - The new application's chat controls report `creatorModeControl=ENABLED`.
  - The original anonymous application's retrieval mode and indexed pattern documents were not modified.
- Risk:
  - Creator-mode `ChatSync` is not yet callable from the SketchCatch backend. IAM Identity Center applications require identity-aware SigV4 credentials through trusted identity propagation; the current backend uses ordinary ECS task credentials and an optional `userId` only.
  - The application must not replace `AMAZON_Q_APPLICATION_ID` until a compatible OIDC identity token, TIP credential provider, and end-to-end Creator-mode call are implemented and verified.

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

### 2026-07-10 - Recover Q citation gaps and persist verification cache
- Goal: Eliminate repeat `503 service_unavailable` responses and long Q revalidation after API restarts.
- Completed:
  - Added Q-only recovery for omitted batch citations and transient batch failures; missing patterns are reverified individually with bounded concurrency.
  - Persisted successful `applicationId + patternId + documentId` verification in Runtime Cache and wired the AI route's shared cache into the Architecture Draft provider.
  - Changed persistent cache reads to sequential access to avoid Redis initial-connection races that previously degraded into empty in-memory fallback state.
  - Added local ignored `.env.local` configuration for the running Redis development container.
- Verification:
  - Q provider tests (13), Q quality tests (2), Architecture Draft tests (35), the HTTP 503 route test, lint, typecheck, build, and harness checks passed.
  - A clean API process read six persisted pattern verifications and returned an EC2/CI/CD preview in 7.2 seconds without Runtime Cache degradation.
  - Fresh-process HTTP checks returned Q-backed previews for serverless in 3.9 seconds and Fargate in 3.6 seconds.
- Risk:
  - A completely empty Redis still needs one live Q verification cycle; indexed document IDs are cached for one hour after that verified cycle.
