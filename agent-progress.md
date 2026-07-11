# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `feat/ck/287-ai-diagram`.
- Local `dev` and `origin/dev` point to `61313fc4`; latest production ECS cutover, worker isolation, and rollback safeguards are merged into this branch.
- Architecture Draft uses Amazon Q retrieval evidence, deterministic deployable materialization, NDJSON progress streaming, and containment-aware board layout.
- The current uncommitted work improves operational requirement enforcement, typed generation errors, external user flow, and private-subnet placement markers.
- No cloud deployment or Terraform mutation was run during this merge.

## Session Record

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

- Regenerate representative chat, voice, burst, and high-availability diagrams in Chrome and review their Terraform previews before user acceptance.
