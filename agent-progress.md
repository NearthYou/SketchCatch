# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `feat/ck/287-ai-diagram`.
- Local `dev` and `origin/dev` point to `4d48f3f1`; latest Trivy scanner and production infrastructure check updates are merged into this branch.
- Architecture Draft uses Amazon Q retrieval evidence, deterministic deployable materialization, NDJSON progress streaming, and containment-aware board layout.
- The current uncommitted work makes Security Groups render as regular VPC-scoped resources while keeping subnet placement as the workload containment source of truth, and is verified.
- No cloud deployment or Terraform mutation was run during this merge.

## Session Record

### 2026-07-11 - Remove duplicated Trivy rule IDs from the scanner test

- Updated the Trivy ignore-file test to import `disabledTrivyTerraformRuleIds` from the scanner instead of maintaining a second hard-coded rule list.
- Verification: focused `trivy-terraform-scan.test.ts`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm harness:check` passed.
- Risk: none; the test now follows the production exclusion list automatically.
- Next action: review and commit the Trivy exclusion change when ready.

### 2026-07-11 - Disable Trivy ALB and Auto Scaling checks

- Configured each Terraform Trivy scan to generate an ignore file that excludes ALB rules AWS-0047, AWS-0052, AWS-0053, and AWS-0054 plus Auto Scaling launch configuration/template rules AWS-0008, AWS-0009, AWS-0122, AWS-0129, and AWS-0130.
- Kept all other Terraform Trivy checks enabled; the exclusion applies to the generated scan workspace only and does not change user Terraform source files.
- Verification: focused Trivy scanner tests, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm harness:check` passed.
- Risk: future Trivy check-bundle rule IDs require an explicit review before they are added to the exclusion list.
- Next action: add the product-specific ALB and ASG configuration warnings as non-blocking deployment checks when requested.

### 2026-07-11 - Recover production auth runtime configuration

- Traced signup/login failures to a one-character SSM `AUTH_TOKEN_SECRET` and missing OAuth client IDs in the ECS API task definition.
- Rotated the secret without exposing it, restarted the API service, and verified live signup, login, and account cleanup.
- Added production startup validation and deployment-time OAuth variable injection so invalid auth configuration fails before serving traffic.
- Kept container ALARM notifications, removed repetitive OK notifications, and excluded the known stale Server Action web log pattern.

### 2026-07-11 - Correct external traffic and subnet placement semantics

- Goal: Prevent global questionnaire drafts from showing a fake region and unclear one-item subnet contents.
- Completed:
  - Restored the `User / Client -> Internet -> public entry` visual flow and migrated saved diagrams on reload.
  - Added ALB placement markers to public subnets and clarified Fargate and RDS placement labels in private subnets.
  - Rejected descriptive pseudo-region values before they can become Availability Zones or runtime regions.
  - Added a clarification boundary for multi-region API/RDS requests because Terraform Preview and direct deployment currently use one AWS provider region.
- Verification:
  - Workspace diagram adapter tests passed 42/42.
  - Architecture Draft and requirement normalizer tests passed 42/42.
  - Chrome reload showed Internet, ALB A/B, Fargate A/B, and RDS Multi-AZ placement labels on the saved board.
  - `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed.

### 2026-07-11 - Relax draft and patch intent routing

- Goal: Treat colloquial resource attachment commands as diagram edits without making bare resource names unsafe.
- Completed:
  - Expanded architecture chat verbs for attach/connect/move and colloquial Korean creation requests.
  - Kept existing-board NAT/RDS/security-group attachment requests on patch while routing new service/structure requests to draft.
  - Added Korean NAT Gateway aliases and generated a connected Elastic IP plus public-subnet NAT bundle with Terraform references.
- Verification:
  - Workspace AI routing tests passed 11/11 and Architecture Patch Preview tests passed 28/28.
  - `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed.
- Risk:
  - The pre-existing `.workspaceStartForm .textInput:focus` source-contract test still fails independently of this routing change.

### 2026-07-11 - Merge latest dev into AI diagram branch

- Goal: Update `dev` and integrate it into `feat/ck/287-ai-diagram` without losing local AI diagram work.
- Completed:
  - Integrated the production ECS cutover, worker isolation, and rollback workflow safeguards from `origin/dev`.
  - Preserved the 120-second ALB timeout together with invalid-header dropping.
  - Preserved AI normalizer and Q retrieval environment settings in the refactored ECS API/worker environment model.
  - Preserved both AI-generated CI/CD live-apply support and legacy S3 Public Access Block artifact compatibility.
- Verification:
  - Deployment plan summary tests (7), restored API tests (50), restored web adapter tests (41), catalog check, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm harness:check`, Terraform format, initialization, and validation passed.
- Risk:
  - No cloud mutation was run while integrating the production changes.

### 2026-07-11 - Harden Architecture Draft requirements and error boundaries

- Goal: Catch detailed diagram omissions beyond the happy path and stop reporting every generation failure as a 503.
- Completed:
  - Fixed S3 quantity parsing so the `3` in `S3 bucket` is not interpreted as three buckets.
  - Preserved supported EKS resources and added distinct audit topology for auth, reservation, and content-board services.
  - Extracted operational requirement policy and validation for HTTPS, SSE/WebSocket/polling, burst scaling, 99.99% redundancy, RDS Multi-AZ, and voice transcription storage/IAM/flows.
  - Applied deterministic operational repairs to both Q previews and canonical plans before typed validation.
  - Extracted generation errors and mapped requirement quality to 422, malformed provider output to 502, provider availability to 503, and internal assembly faults to 500; stream terminal errors now include `statusCode`.
- Verification:
  - Architecture Draft service tests passed 39/39; full AI route tests passed 53/53; operational/quantity tests passed 7/7; web stream tests passed 8/8.
  - `pnpm lint`, `pnpm typecheck`, `pnpm catalog:check`, `pnpm build`, and focused harness checks passed.
- Risk:
  - The full API suite exceeded the 10-minute command limit before producing its buffered summary; the directly affected suites above completed successfully.

### 2026-07-11 - Enforce questionnaire topology and private-subnet placements

- Goal: Make the dynamic Fargate questionnaire result enforce HTTPS, SSE chat, burst scaling, and readable subnet placement.
- Completed:
  - Added deployable ECS Application Auto Scaling target and target-tracking policy resource support.
  - Required public ALB drafts with mandatory HTTPS to include ACM and a port 443 listener, and required SSE plus burst traffic to appear in actual topology.
  - Replaced the synthetic `User / Client -> Internet -> entry` chain with a direct user-to-public-entry flow.
  - Added board-only Fargate task and RDS primary/standby placement markers inside each referenced private subnet without duplicating Terraform resources.
- Verification:
  - Architecture Draft tests (39), web adapter tests (41), focused catalog/Terraform tests, lint, typecheck, catalog check, and full build passed before the `dev` merge.
- Risk:
  - The pre-existing full web suite has one unrelated CSS contract failure for the missing `.workspaceStartForm .textInput:focus` selector.
  - Existing saved resource configurations remain unchanged until the user accepts a regenerated Architecture Draft.

## Next Action

- 2026-07-11 update: Removed Security Groups from all board container paths so generated, saved, and manually added security groups render as regular VPC-scoped resource icons. Workload containment now prioritizes `subnetId` or explicit subnet references, while Security Groups remain visible through protection/allow edges and parameter references. Multi-subnet workloads keep placement markers instead of being forced into one subnet. Verification passed with focused flow, area, catalog, movement, workspace adapter, and API prompt tests, full API Architecture Draft tests, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm harness:check`.
- 2026-07-11 update: Updated local `dev` to `origin/dev` at `4d48f3f1` and merged it into `feat/ck/287-ai-diagram`. Resolved the only conflict in `agent-progress.md` by preserving both the latest Trivy/production history from `dev` and the AI diagram branch history. Verification passed with `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build`.
- 2026-07-11 update: Updated local `dev` to `origin/dev` at `a1031c4b` and merged it into `feat/ck/287-ai-diagram` with merge commit `cb5cddc5`. Resolved conflicts by taking the retired workflow/history deletions from `dev`, keeping the latest Workspace start UI from `dev`, combining Live Observation API error codes with architecture generation error codes, and preserving the AI diagram external-flow/subnet-placement adapter behavior. Fixed post-merge typecheck issues in runtime cache test stubs and Terraform nested-block metadata. Verification passed with `pnpm harness:check`, focused API architecture tests, `pnpm lint`, `pnpm typecheck`, and `pnpm build`.
- 2026-07-11 update: Fixed the Korean SSR dynamic web-app questionnaire path so Seoul semi-managed simple API answers produce ECS Fargate instead of EC2, keep SSR behind an ALB-origin CloudFront entry, use HTTPS/ACM, keep Multi-AZ RDS in `ap-northeast-2`, materialize mixed-file uploads as `sketchcatch-file-uploads-*` instead of image-only buckets, and label SSE notification paths without chat POST semantics. Added regression coverage for the SSR mixed-upload questionnaire and SSE notification validation. Verification passed with focused API tests, `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and final `pnpm harness:check`.
- 2026-07-11 update: Fixed the Korean SPA questionnaire Architecture Draft path so APAC semi-managed simple API answers produce a consistent ECS Fargate, CloudFront/S3, Multi-AZ RDS, image-upload, HTTP+SSE topology without mixing Seoul regions with Tokyo AZs. Added regression coverage for operational parsing, requirement resolution, and canonical draft materialization. Verification passed with focused API tests, `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and final `pnpm harness:check`.
- 2026-07-11 update: Fixed the SPA APAC microservices questionnaire path so fully managed/serverless, time-of-day traffic, mixed uploads, no realtime, and 99.99% availability produce separated ECS Fargate services, task definitions, target groups, and per-service autoscaling instead of one generic ECS service. Added cost-sensitive budget warnings for 10-50 manwon microservices/HA designs while preserving the existing $100 low-budget warning contract. Regression coverage now verifies answer-profile parsing, normalized resource quantities, service separation, upload bucket selection, no realtime edges, and APAC region placement. Verification passed with focused API tests, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm harness:check`.
- 2026-07-11 update: Collapsed low-signal parameter/helper resources from the rendered Architecture Board while preserving them in `DiagramJson` for Terraform and parameter workflows. App Auto Scaling target/policy, route table association, DB subnet group, ACM validation, IAM policy/profile, KMS alias, Lambda permission, and target group attachment nodes no longer render as separate board icons, and edges to those collapsed helpers are hidden from React Flow. Verification passed with focused web flow-mapper tests, focused API architecture tests, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm harness:check`.
- 2026-07-11 update: Fixed the global self-managed SPA questionnaire path so direct server operation selects the ALB + EC2 Auto Scaling pattern instead of Fargate, large traffic materializes four EC2 nodes with larger launch-template sizing, large/complex databases use 200GB `db.r6g.large` Multi-AZ RDS, and WebSocket API Gateway resources receive route, integration, and stage parameters. Regression coverage now verifies the global/large/self-managed/WebSocket questionnaire and updated deterministic canonical materialization. Verification passed with focused API architecture tests, operational requirement tests, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm harness:check`.
- 2026-07-11 update: Fixed the large self-managed API-server questionnaire path so burst/polling traffic no longer materializes as `t3.small` with ASG max 4 and `db.t4g.small`. The canonical EC2 plan now keeps four EC2 nodes, uses `m7i.large`, raises aggressive ASG max capacity to 12, switches bursty enterprise scaling to target tracking, sizes simple-but-large-traffic RDS to 50GB `db.r6g.large` Multi-AZ, and labels polling edges with a cost warning assumption. Regression coverage now verifies the API-server polling questionnaire and the updated global self-managed max capacity. Verification passed with focused API architecture tests, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm harness:check`.
- Regenerate representative chat, voice, burst, and high-availability diagrams in Chrome and review their Terraform previews before user acceptance.
