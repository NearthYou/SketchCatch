# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `feature/sw/361-deployment-cicd-console`.
- The approved design separates Direct Deployment and CI/CD into independent screens inside the existing full-screen console.
- Project repository monitoring defaults to enabled and requires a branch plus explicit app and infrastructure paths before execution.
- Repository recommendation guarantees 2-3 unique candidates and validates question IDs, semantics, and duplicate prompts before display.
- Deployment type is hidden when repository evidence is decisive and shown only for ambiguous analysis.
- CI/CD handoff is a prominent standalone setting; its GitHub App repository panel appears only while enabled.
- Public Repository setup confirms Template and CI/CD before opening a separate follow-up-question stage.
- Follow-up questions depend on the selected Template, affect diagram creation, and use direct clickable choices.
- Tasks 1-9 of issue #361 pass focused API/Web integration, the full Web suite, and repository completion gates.
- CI/CD polling, RDS records, approval gates, notification limits, and CI/CD-vs-Runtime log separation are recorded in the canonical architecture and deployment docs.
- Migration and credentialed browser acceptance remain unrun because this worktree has no `DATABASE_URL`, local stack, or test credentials.

## Session Record

### 2026-07-13 - Integrate and document the Deployment/CI/CD console

- Documented the separate Direct/Pipeline Run record boundaries, 5s active/30s idle polling, RDS source of truth, accepted-change gates, session-deduplicated notifications, safe Output links, and Live Observation Runtime log boundary.
- Focused API command passed 103/103: `pnpm --dir apps/api exec tsx --test src/db/schema-contract.test.ts src/git-cicd/git-cicd-monitoring-service.test.ts src/git-cicd/git-cicd-pipeline-run-service.test.ts src/git-cicd/github-actions-run-provider.test.ts src/git-cicd/git-cicd-workflows.test.ts src/routes/git-cicd-handoffs.test.ts src/source-repositories/github-app-client.test.ts`.
- Focused Web command passed 82/82: `pnpm --dir apps/web exec tsx --test features/workspace/api.test.ts features/workspace/cicd-console-state.test.ts features/workspace/deployment-output-links.test.ts features/workspace/workspace-notifications.test.ts features/workspace/deployment-cicd-console-layout.test.ts features/workspace/deployment-panel-apply-confirmation.test.ts`.
- Full Web command passed 1051/1051: `pnpm --filter @sketchcatch/web test`.
- Completion commands passed: `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`. Lint retained the pre-existing `setNow` warning and build retained the existing Next.js multi-lockfile warning.
- `pnpm --filter @sketchcatch/api db:migrate` was not run because no approved local non-production `DATABASE_URL` was configured. The browser journey was not run because ports 3000/4000, test credentials, GitHub state, and AWS state were unavailable; no external mutation ran.
- Task 8 reviewer ledger remains explicit: manager lifecycle wiring is covered by pure behavior and source-level integration tests, not a mounted React/browser integration test.

### 2026-07-13 - Add deployment completion notifications and safe Output links

- Added a session-deduplicated project observer that survives console closure, plus deployment-owned accessible Output cards and authoritative apply-only Direct notifications.
- Verification: review-focused and full Web tests plus Web lint/typecheck/build passed; no external mutation ran. Existing API `setNow` and Next multi-lockfile warnings remain.

### 2026-07-13 - Split Direct Deployment and CI/CD console screens

- Split Direct Deployment and CI/CD into focused screens with common full-screen behavior, screen-local state, strict monitoring settings, polling, logs, and recovery states.
- Verification: 35 focused and 564 workspace tests plus root lint/typecheck/build/harness/diff passed; no external mutation ran. Existing warnings remain.

### 2026-07-13 - Add Web CI/CD clients and pure console state helpers

- Added authenticated CI/CD clients plus pure polling, selection, terminal notification, stale-state, and sensitive-first HTTP(S) Output helpers.
- Verification: 56 focused tests plus root/Web lint/typecheck/build/harness/diff passed; no external mutation ran. Existing warnings remain.

### 2026-07-13 - Expose authenticated Pipeline Run APIs

- Added project-owned Pipeline Run list/detail/log/refresh routes with strict validation, typed ISO DTOs, newest-first cursor pagination, and incremental log reads.
- Review fixes moved stable `(createdAt, id)` keyset pagination into RDS/service, added explicit stale refresh responses, and removed the route refresh precheck/double lookup.
- Preserved persisted history access after monitoring is disabled while keeping refresh behind the enabled-and-valid monitoring target.
- Reused one lazy GitHub App client across handoff, pipeline-status, and run providers; no real GitHub or deployment mutation ran.
- Verification: 53 focused API/app tests, schema/migration and repository query contracts, lazy-config smoke, API/root lint, typecheck, build, harness, and diff checks passed; lint retains one pre-existing `setNow` warning.

### 2026-07-13 - Discover and persist commit-scoped Pipeline Runs

- Added read-only GitHub Actions run, commit-file, job, and masked log reads.
- Grouped exact SketchCatch workflows by commit SHA and classified monitored app/infra changes with segment-safe paths.
- Added idempotent transactional Pipeline Run, six-stage, and deterministic log persistence with stale-state fallback.
- Verification: 29 focused tests, API typecheck/lint, full build, harness, and diff checks passed; lint retains one pre-existing `setNow` warning.
- No real GitHub, AWS, Terraform, database migration, or deployment mutation ran.
- Reviewer fixes added exact generated release-step mapping, full GitHub pagination, latest-attempt selection, fail-closed status semantics, and unseen-SHA-only commit-file discovery.

### 2026-07-13 - Validate and persist repository CI/CD monitoring settings

- Added atomic RDS-only monitoring defaults, lazy read-only GitHub validation, safe path normalization, and stable errors.
- Blocked handoff creation until monitoring is enabled and valid, then rendered validated app/infra paths into approved workflows.
- Verification: 62 focused API tests, API typecheck, API lint, full build, harness, and diff checks passed; lint retains one pre-existing `setNow` warning, and no real GitHub, AWS, Terraform, or repository mutation ran.
### 2026-07-13 - Design separate Deployment and CI/CD console screens

- Defined independent Deployment and CI/CD information architectures inside the existing full-screen console.
- Kept Direct Deployment records separate from commit-scoped Pipeline Runs and CI/CD logs.
- Defined repository-level branch, app path, and infrastructure path monitoring settings, completion notifications, and accessible Output URL actions.
- Defined polling-based GitHub Actions observation, browser Notification fallback behavior, error handling, compatibility, and acceptance tests.
- Added a nine-task TDD implementation plan covering contracts, migration, monitoring validation, Pipeline Run synchronization, API routes, UI separation, notifications, Outputs, and end-to-end verification.
- Verification: design self-review and `git diff --check` passed; no product code, Terraform, Git handoff, or cloud mutation ran.

### 2026-07-13 - Repair Terraform nested-block merge regression

- Fast-forwarded the local branch to the remote `dev` merge commit that CI evaluated and reproduced the duplicate `aws_launch_template` key failure.
- Consolidated both branch variants into one Launch Template nested-block set while preserving IAM profile, metadata, monitoring, network interface, and tag support.
- Kept the pending direct-resource rename boundary fix and its regression intact across the fast-forward.
- Verification: full typecheck, 20 focused Terraform/rename regressions, lint, build, harness, and diff checks pass. Lint retains one pre-existing API unused-argument warning.

### 2026-07-13 - Add and review diagram-based Live Observation for ECS Fargate and ASG

- Added diagram-derived main traffic paths, REST polling-compatible snapshots, CloudWatch Agent/ASG and ECS Fargate observability, and presentation-focused capacity visualization.
- Moved AI simulation results out of the chat dock and kept bottleneck, cost, and failure analysis in the simulation panel.
- Represented each accepted request as one 28px particle moving sequentially across analyzed connector segments; observation remains idle until traffic is explicitly started.
- Final review added metadata-free ECS/ASG capacity inference scoped to the selected controller, five-request bursts, disconnect-safe SSE startup, automatically expiring per-observation simulated traffic, metric-correct request thresholds, real Traffic API audience links with explicit simulation fallback, and polling listener cleanup.
- Verification: focused Web tests passed 82/82 plus 9 diagram tests, focused API tests passed 38/38 plus 18 service/route tests; harness, lint, typecheck, and build passed. No AWS or Terraform mutation ran.
- PR review: Kubernetes `depends_on` addresses now render as references and both polling/SSE delay messages use valid Korean text; 21 Terraform and 31 modal tests passed.

### 2026-07-12 - Implement issue #349 repository template recommendations

- Goal: Extend connected Repository Analysis into a template candidate recommendation flow for issue #349.
- Completed:
  - Added shared deployment type, dynamic question, answer, and template recommendation DTOs.
  - Extended Repository Analysis results with inferred deployment type, CI/CD default, max-five questions, and supported template candidates.
  - Added backend recommendation endpoint for user deployment type, CI/CD, and answer payloads.
  - Kept final template validation constrained to supported `TemplateId` values from stored analysis or recommendation candidates.
  - Updated the repository start UI with deployment single-select, CI/CD checkbox, dynamic questions, and candidate cards.
  - Documented the contract in `docs/data-models.md`.
- Verification:
  - `pnpm --filter @sketchcatch/types typecheck`
  - `pnpm --filter @sketchcatch/api typecheck`
  - `pnpm --filter @sketchcatch/web typecheck`
  - `pnpm --dir apps/api exec tsx --test src/source-repositories/repository-analysis.test.ts src/routes/source-repositories.test.ts src/source-repositories/source-repository-service.test.ts`
  - `pnpm --dir apps/web exec tsx --test features/workspace/api.test.ts features/workspace/project-github-settings.test.ts features/workspace/repository-start-template-recommendation.test.ts`
  - `pnpm harness:check`
  - `pnpm lint` passed with the pre-existing `live-observations` `setNow` warning.
  - `pnpm typecheck`
  - `pnpm build`
  - `git diff --check` passed with CRLF conversion warnings only.
- Risk:
  - No GitHub PR, cloud deployment, Terraform apply, or infrastructure mutation was run.

### 2026-07-12 - Add public GitHub URL repository start

- Goal: Let users start Repository Analysis by pasting a public GitHub repository URL without first connecting GitHub in settings.
- Completed:
  - Added a Repository URL and branch form to the Repository start screen.
  - Wired the form to the existing public `/ai/source-repository-analysis` client.
  - Displayed detected signals, evidence files, recommendation reason, and the matched template.
  - Saved the recommended template board to the project draft before opening the workspace.
  - Kept URL analysis visible even if connected GitHub repository status cannot be loaded.
  - Added a project settings handoff when public evidence cannot be read, covering private/restricted repositories and branch mismatches.
- Verification:
  - `pnpm --dir apps/web exec tsx --test features/workspace/repository-start-template-recommendation.test.ts`
  - `pnpm --dir apps/web typecheck`
  - `pnpm harness:check`
  - `pnpm lint` passed with the pre-existing `live-observations` `setNow` warning.
  - `pnpm typecheck`
  - `pnpm build`
  - `git diff --check` passed with CRLF conversion warnings only.
  - `pnpm lint` passed with the pre-existing `live-observations` `setNow` warning; `pnpm typecheck`, `pnpm build`, and `pnpm harness:check` passed.

### 2026-07-12 - Inline public Repository URL start on new project screen

- Goal: Keep GitHub Repository start on the new project screen and remove the separate Repository URL entry step from the primary journey.
- Completed:
  - Changed Repository start action to open an inline URL/branch panel instead of routing to `/workspace/repository`.
  - Wired public GitHub URL analysis into the new project screen, creating the project only after a supported template recommendation is found.
  - Saved the recommended template board draft before opening the workspace.
  - Kept private/restricted repository guidance pointed at GitHub permissions in settings.
  - Added regression coverage for the inline Repository URL form action.
- Verification:
  - `pnpm --dir apps/web exec tsx --test app/workspace/new/workspace-start-options.test.ts features/workspace/repository-start-template-recommendation.test.ts`
  - `pnpm --dir apps/web typecheck`
  - `pnpm harness:check`
  - `pnpm lint` passed with the pre-existing `live-observations` `setNow` warning.
  - `pnpm typecheck`
  - `pnpm build` passed; Next/Turbopack emitted a non-fatal `.next/dev/cache/turbopack` symlink metadata warning.
  - `git diff --check` passed with CRLF conversion warnings only.
  - `pnpm harness:check`
  - `pnpm lint` passed with the pre-existing `live-observations` `setNow` warning.
  - `pnpm typecheck`
  - `pnpm build`
  - `git diff --check` passed with CRLF conversion warnings only.
- Risk:
  - Browser visual verification was skipped because Playwright/browser automation dependencies are not installed in this worktree.

### 2026-07-13 - Harden CI/CD console refresh and recovery

- Goal: Address Task 7 review findings without entering Task 8 output or notification scope.
- Completed:
  - Preserved API ordering when an older active run becomes terminal and stopped refreshing terminal runs.
  - Preserved valid explicit run selections; automatic selection follows the active run, then the newest run after it becomes terminal.
  - Centralized permission recovery for successful list, detail, refresh, and settings requests.
  - Isolated logs errors so logs retry does not clear unrelated screen errors.
  - Matched frontend monitored-path completeness and normalization to the backend boundary.
- Verification:
  - Focused state/layout tests passed, 19/19; all Web tests passed, 1034/1034.
  - Web and root lint/typecheck/build passed. Root lint retained the pre-existing API `setNow` warning.
  - `pnpm harness:check` and `git diff --check` passed; diff check reported line-ending conversion warnings only.
- Risk:
  - Browser visual verification was not repeated because these fixes are state-boundary changes covered by focused and workspace tests.

- 2026-07-13 Task 8 Minor review: Scoped Output clipboard feedback to the selected Deployment/Pipeline Run and current links, including late-Promise ownership; focused tests 17/17 and Web/root lint/typecheck/build passed. Existing warnings remain, and the source-regex integration-test limitation is ledger-only.

### 2026-07-13 - Connect Pipeline Run Outputs to accepted handoff metadata

- Goal: Close the Task 9 review gap by persisting trusted CI/CD Web/API URLs instead of implying Terraform Output provenance.
- Completed:
  - Selected the latest non-draft/non-cancelled handoff for the same Source Repository and monitored target branch.
  - Persisted only valid HTTP(S) `staticSiteUrl`/`apiBaseUrl` values as `appUrl`/`apiUrl`, linked `handoffId`, refreshed late accepted values, and preserved existing non-null metadata across temporary null lookups.
  - Added service and PostgreSQL query/upsert contract coverage; clarified conditional handoff provenance in architecture/deployment docs.
  - Archived two older July 12 entries in `docs/agent-history/2026-07.md`.
- Verification:
  - Focused API 109/109 and focused Web 82/82 passed.
  - `pnpm lint` passed with the pre-existing `setNow` warning; `pnpm typecheck` and `pnpm build` passed. Build retained the existing Next.js multiple-lockfile root warning and changed no tracked generated file.
  - Full `pnpm test` did not pass: API 1282/1305 passed and Web passed. The 23 unrelated API failures were: `embedded Python Traffic API compiles and exposes OPTIONS, traffic, and health handlers`; ten `runDeploymentInit`/`runDeploymentDestroyPlan` tests; `findUnsupportedLiveApplyResourceTypesFromTerraformShowJson allows demo web service resources only for the demo profile`; two AI route tests plus `POST /api/ai/source-repository-analysis reads nested public repository evidence`; five Q/template-selection tests; `src/services/terraform/aws-priority-resource-coverage.test.ts`; `renders the requested CloudFront nested values back as blocks`; and `all AWS templates generate Terraform Preview from their shared definitions`.
  - Structured mismatches included `undefined` vs `true` for embedded Python, missing `S3_BUCKET_NAME` vs expected deployment errors, added S3 `contentType`, omitted `aws_iam_role`, `three-tier-web-app` vs `template-api-db`, extra `spa-cloudfront-s3`, `true` vs `false` in the Q-backed plan, list-shaped `custom_origin_config` vs an HCL block, and quoted archive references vs unquoted references. The remaining assertion failures emitted no structured actual/expected pair.
- Risk:
  - No DB migration, browser journey, GitHub/AWS mutation, Terraform Apply/Destroy, push, or external notification was run.

## Next Action

- Review the Task 9 follow-up commit. Investigate the unrelated full API-suite baseline failures separately; run migration and credentialed browser acceptance only with an approved safe environment.
