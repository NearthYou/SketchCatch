# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/` and remain available in Git history.

## Current Verified State

- Branch `codex/fix-error-progress-completion` includes `origin/dev` through `d189cda3` and keeps the compact Workspace AI Terraform error-analysis gauge visible through an explicit successful 100% completion state.
- The parked JH Workspace changes are restored on `dev`: Deployment uses the shorter `배포` label and intrinsic action width, Settings omits redundant CodeBuild authorization copy, and Project Draft loading uses the server draft whenever one exists without rendering the removed local-recovery chooser.
- Terraform reverse sync accepts references to its allowlisted utility resources, so generated Runtime Secret values such as `random_password.check_in_signing.result` round-trip without a false manual-edit warning.
- The Direct Deployment branch includes `origin/dev` through `fce1d6c0`, removes duplicate deployment summaries, and keeps selected history details within the active filter. Eighty-six focused Web tests and the root harness, lint, typecheck, and build checks pass.
- The legacy `practice` Deployment profile is removed; `demo_web_service` is the default live profile, and imported migration `0054` rewrites legacy rows before removing the enum value.
- Live Observation renders bounded traffic motion, a task-count-responsive Fargate fleet, and collapsed operational analysis without development-only traffic or Task preview controls.
- Delayed first CloudWatch points retain request and capacity evidence, and stopped sessions no longer continue the countdown.
- The approved sandbox traffic run sent exactly 963 requests with 963 HTTP 200 responses. The failed observation acceptance triggered approved cleanup, and the `liveobs-7cccab4b` AWS resource set was verified absent.
- Deployment `57bda2bf-88af-4e15-8674-0b2ef20f1e8c` is `DESTROYED` with cleared state and current-plan pointers.
- Repository ECS delivery carries runtime Secret names through analysis. Both strict AI and Fixed Template drafts now generate `CHECK_IN_SIGNING_SECRET` during approved Apply, map the same Secrets Manager ARN into the IAM policy and every Task, and leave `INSTANCE_ID` unset for hostname-based observation.
- Public ECS/Web release verification accepts both the legacy `sessionId` check-in response and the stateless signed `sessionToken` response while retaining the required 201 status and ISO expiry check.
- Windows subprocess, local environment isolation, generated architecture knowledge, resource catalog, typography, and Workspace source-contract regressions are repaired.
- Sixty focused Repository runtime-Secret, deployment-action, and failure-visibility regressions pass; the final post-review 50-test subset also passes. `pnpm lint` and `pnpm typecheck` pass. Root `pnpm build` reported all five tasks successful before the known Turbo exit hang. The full Web suite passes 1,090 of 1,098 tests; its eight failures are outside the changed runtime-Secret paths. Root `pnpm test` still exposes ten unrelated API baseline failures and one lease-heartbeat cancellation; its one Repository source-contract failure was corrected and passes focused verification.
- `feature_list.json` retains one separately owned aggregate `in_progress` item: `ARCHITECTURE-BOARD-COMPILER-409`.

## Session Record

### 2026-07-20 - Show explicit AI error-analysis completion

- Reproduced the fast local response advancing only to 17% before the progress gauge disappeared; the request result replaced the loading state without an observable completion phase.
- Added an explicit hidden/running/complete presentation model. Successful single and batch analysis now render `100%` with the `완료` label for 800ms without delaying the result; failed, cancelled, or stale requests do not claim completion.
- Added transition, presentation, accessibility, exception-boundary, and Workbench wiring regressions. All 36 focused checks pass.
- Addressed all three PR review threads: Terraform code preparation now stays inside the handled analysis boundary, and completion-state transitions no longer share an effect with the 800ms hide timer.
- Local Chrome QA observed `8% -> 10% -> 12% -> 15% -> 17% -> 100% 완료`, with the completion gauge retained before hiding.
- Post-review `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass. Root `pnpm test` remains non-green on unrelated existing Architecture Board knowledge and Live Observation contract baselines; the changed Workspace AI checks pass.
- No dependency, lockfile, database migration, cloud, or deployment change was made.

### 2026-07-20 - Server-synchronized deployment progress

- Replaced elapsed-time/log-volume Web estimates and delayed 1% catch-up with a read-only `DeploymentProgressSnapshot` contract and API backed by the existing Deployment and Terraform completion logs.
- Apply/Destroy show unique current-attempt Resource completion capped at 99% while running. The backend keeps unmeasurable stages indeterminate, while the Web labels stage-based fallback values explicitly as `약 n%`, replaces them with measured Resource percentages, prevents the final release stage from regressing below 99%, and renders the progress output without wrapping. Only `SUCCESS`/`DESTROYED` report exact 100%. Polling is no-store, single-flight, abortable, and stale-response guarded.
- Focused verification passed: progress service 8/8, deployment route Plan/Apply/Destroy/Cancel/progress 10/10, directly related Web checks 56/56, progress presentation 11/11, and progress source/layout contracts 2/2. Authenticated Chrome CSSOM inspection confirmed the intrinsic output column and `white-space: nowrap`. `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and all five `pnpm build` tasks succeeded; Turbo stayed alive after its success summary and was terminated.
- Evaluator review: Accept (12/12), with no hard-fail condition. No DB migration, Terraform/AWS mutation, deployment execution, worker/approval/cancel/cleanup logic change, dependency change, commit, or push was performed.

### 2026-07-20 - Restore parked JH Workspace changes on dev

- Reapplied the tracked changes from the retained `Refactor/jh/498-배포-ui-수정` WIP stash on top of current `dev`, preserving the separate Terraform reverse-sync commit and both sides of the progress-log conflict.
- Restored the compact Deployment label and intrinsic action width, removed redundant Settings authorization copy, and made an existing server Project Draft authoritative over a dirty IndexedDB draft while preserving server-less local fallback and real save-conflict handling.
- Focused Workspace and Settings checks pass 77/77. Root lint, typecheck, and all five build tasks pass; the completed Turbo build process was terminated after the known exit hang. The full Web suite passes 1,039 of 1,041 tests, with two unchanged Live Observation source-marker failures outside the restored files.
- No dependency, lockfile, DB migration, Terraform execution, cloud mutation, production deployment, or Git/CI/CD handoff was performed.

### 2026-07-20 - Accept generated utility references during Terraform reverse sync

- Reproduced the generated ECS Runtime Secret warning at `aws_secretsmanager_secret_version.check_in_signing` and confirmed `random_password.check_in_signing.result` was rejected even though `random_password` was already an allowlisted utility resource.
- Reused the existing utility-resource allowlist when parsing resource references, preserving the narrow parser boundary while supporting both current utility resource types.
- Verified the Runtime Secret red-green regression and all 54 Terraform-to-Diagram tests. Root lint, typecheck, and build pass. The full API suite passes 1,444 tests and retains the known unrelated 10 failures plus one lease-heartbeat cancellation.
- No Terraform generation, deployment artifact, database, dependency, cloud resource, or Git/CI/CD behavior was changed.

### 2026-07-20 - Keep Deployment History details aligned with filters

- Reproduced the empty `변경 없음` filter retaining the previously selected version's Resource, Output, and log disclosures while the history table had no rows.
- Added red-green regressions, constrained automatic history selection to the visible filtered version IDs, preserved a visible manual selection when a newer version is filtered out, and hid secondary details when the active filter is empty.
- Integrated current `origin/dev` through `fce1d6c0`; the only merge conflict was the shared progress record, and both Direct Deployment and AI progress records were preserved.
- Eighty-six focused Direct Deployment tests and 33 incoming AI progress tests pass. `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` pass. No API/shared contract, dependency, DB migration, Terraform execution, cloud, or deployment change was made.

### 2026-07-20 - Synchronize dev and the Direct Deployment UI branch

- Fetched the force-updated remote `dev`, aligned local `dev` exactly at `266f0a81`, and merged it into `Refactor/jh/498-배포-ui-수정` while preserving the branch-specific Direct Deployment record and the newer completed sandbox state.
- The only merge conflict was `agent-progress.md`; no product behavior or imported migration was manually changed during conflict resolution.
- Seventy focused Direct Deployment tests, `pnpm harness:check`, `pnpm lint`, and `pnpm typecheck` pass. `pnpm build` reported all five package tasks successful; the known Turbo exit hang was terminated after the success summary.

### 2026-07-20 - Keep the Deployment validation action readable

- Renamed the primary Deployment console tab from `직접 배포` to `배포`.
- Replaced the fixed 152 px action-button basis and width with intrinsic sizing while retaining the 44 px control height and full-width mobile layout. Authenticated Chrome QA at 1345x1003 and 390x844 confirmed that the validation label is not clipped.
- Focused Direct Deployment regressions pass 85/85; root harness, lint, typecheck, and all five build tasks pass. The completed build process was stopped after Turbo remained attached to the existing user-owned Next dev server. No deployment, cloud mutation, contract, migration, dependency, commit, or push was performed.

### 2026-07-20 - Remove the local draft recovery chooser

- Removed the Workspace dialog that asked users to choose between a dirty IndexedDB draft and the latest server draft. When a server draft exists, Workspace now opens it and synchronizes the local cache to the same revision; server-less local fallback and real 409 conflict handling remain intact.
- TDD regressions pass 31/31; root lint, typecheck, and production build pass. The full Web suite exposed unrelated branch-baseline failures in Architecture knowledge artifact and AI chat source assertions, then its long-running diagram adapter test was stopped after more than ten minutes. No API, DB migration, dependency, cloud mutation, deployment, commit, or push was performed.

### 2026-07-20 - Remove duplicate Direct Deployment UI summaries

- Removed repeated Direct Deployment Plan, scope, build-readiness, and change summaries; separated current-run logs from selected history logs and kept first-Plan logs reachable from the shared workspace. Empty history now shows only onboarding content, while populated history keeps metrics, filters, the table, unique selected-version facts, and history logs without repeating scope or change counts.
- Six focused Web test files pass 85/85 after merging the latest `origin/dev`; root `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` also pass on the merged result. The earlier full `pnpm test` run before this merge had 21 unrelated API failures from missing `DATABASE_URL`/`zstd` and existing contract/AI expectations; none cover the changed Web files.
- Authenticated read-only Chrome QA passed at 1863x970, 1440x900, 1024x768, and 390x844 for both empty and populated history fixtures. No deployment action, API/shared contract/DB/dependency change, Terraform execution, AWS mutation, Git/CI/CD handoff, or push was performed.

### 2026-07-20 - Plan Architecture Board readability and section focus

- Audited the current Diagram Editor panel defaults, initial Fit behavior, resource-name preference, zoom LOD, connection handles, containment metadata, findings contract, and Compiler quality metrics.
- Added a Korean implementation plan for contextual read mode, minimum readable LOD, explicit connection mode, provider-neutral functional sections, section focus/checks, and semantic layout improvements.
- Kept physical containment separate from functional sections and specified view-only collapsed nodes/aggregated edges so section navigation cannot mutate Diagram or Terraform semantics.
- No source code, dependency, lockfile, database migration, cloud, or deployment change was made.

### 2026-07-20 - Add compact AI error analysis progress

- Added a 44px circular progress gauge to the error-analysis card header with a numeric percentage and a visible estimated-state label.
- Combined elapsed time with completed-item counts for single and batch analysis, while capping an active request below 100% until the API actually completes.
- Preserved the gauge DOM across batch-item changes and reset only its elapsed-time estimate so the stroke transition remains visible.
- Added calculation, rendered accessibility, Workbench integration, and remount-prevention regressions; all 33 focused checks pass.
- `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass. The full Web suite was also attempted and remains non-green only on unrelated current-`dev` Architecture Board, thumbnail, Diagram Editor, and Live Observation baselines.
- No dependency, lockfile, database migration, cloud, or deployment change was made.

### 2026-07-20 - Accept stateless public check-in verification

- Reproduced direct Deployment `48a82459-0414-4fb3-9384-b72431071f06` failing only at `public_health`; ECS health, frontend upload/activation, and CloudFront invalidation all succeeded.
- Confirmed the deployed repository contract intentionally replaced `sessionId` with an opaque signed `sessionToken`; the published frontend marker still matched the pinned commit, so concurrent repository pushes did not mix artifacts.
- Added a red-green regression and minimally extended the public check-in verifier to accept either the legacy UUID or the stateless two-segment token together with an ISO expiry.
- Retried only the pinned frontend release for the same Deployment; the retry job and all six retry steps succeeded, promoting the Deployment and Application Release to success without rebuilding or changing ECS.
- Thirty focused release and Git/CI/CD settings tests, lint, and typecheck pass. A clean retry of the root build completed all five package tasks successfully; the local Turbo process still required termination after printing its success summary.
- Diagnosed repository variables for `jh-9999/audience-live-check` as stale from project `7b618d82`; current project `f584d0c2` has valid monitoring configuration but no Git/CI/CD handoff, so its current values have not yet been applied.
- Confirmed local handoff creation is intentionally blocked while `SKETCHCATCH_PUBLIC_BASE_URL` is `http://localhost:3000`; the production HTTPS origin is required so GitHub Actions can call the release API.

### 2026-07-20 - Make the Architecture Board read-first and connection-explicit

- Existing boards now open with both side panels collapsed; empty wide boards open only the Resource panel, and resource names are visible by default.
- Board labels preserve a 12px minimum screen-space size while low-detail overview labels are hidden instead of rendered too small.
- Added an explicit Connection mode with candidate outlines, hover/focus connection points, and one keyboard focus target per eligible node.
- Applied the existing local database migrations and verified PostgreSQL and Redis health without creating or editing migration files.
- Focused diagram tests, lint, typecheck, build, and browser fixture checks passed; the broad test run was stopped at the user's request.
- Semantic section clustering and automatic layout changes remain deferred outside this workstream.

### 2026-07-20 - Compact the active progress log for CI

- Moved eight older 2026-07-20 completion records to `docs/agent-history/2026-07.md` after CI reported that `agent-progress.md` exceeded its 24,000-byte limit.
- Kept all archived content intact and left application code, dependencies, database migrations, cloud resources, and deployment behavior unchanged.

### 2026-07-20 - Streamline AI architecture clarification

- Reduced the deterministic Architecture Draft intake to six product questions: website type, traffic, database, region, monthly budget, and management preference.
- Added default assumptions for HTTPS, a three-second loading target, 99.9% availability, WebSocket when realtime is requested, and private S3 plus CloudFront when file upload is requested.
- Preserved explicit natural-language requirements over defaults and retained provider follow-up clarification for genuinely ambiguous details.
- Verified 22 focused Architecture Draft tests, focused TypeScript checking, and ESLint on the two changed service files. Unrelated tests were intentionally not run.
- Root lint passed. Root typecheck and build remain blocked by the pre-existing getRepositoryRequiredRuntimeSecrets reference error in repository-start-client.tsx; that unrelated worktree change was not modified.

## Known Risk

- Error-analysis percentage remains an elapsed-time estimate because the current AI endpoint does not expose server-side stages; the active item rises from 8% to 94%, then a real successful response shows 100% for 800ms.
- Existing saved Project Drafts are not rewritten. The affected project must be re-analyzed and its Fixed Template Board regenerated before preparing a new deployment.
- The local test project `b99f92aa-fb46-4822-ae2f-ca9e4e88e4f9` was saved by the stale Web process and must be re-analyzed/regenerated or replaced after the Web restart.
- Root `pnpm test` is not green because ten unrelated API baseline tests fail and `application-artifact-registry.test.ts` still has one cancelled lease-heartbeat test.
- The full Web suite is not green because eight architecture-board/compiler tests outside this workstream fail; the runtime-Secret regression subset is green.
- End-to-end Live Observation animation and provider-confirmed scale-out remain unaccepted because the active UI session missed the traffic before the delayed-snapshot fix.
- Automatic cleanup remains blocked for this credential layout until the approved cleanup operator can read the internal deployment-state object.
- No new AWS resources or traffic may be created without a new explicit approval.

## Next Action

1. Re-run the local new-project Repository flow against the restarted Web server and confirm the generated Board contains the runtime Secret chain.
2. Deploy `dev` through the normal reviewed workflow when a production release is approved; no DB migration is required for these changes.
3. Consider server-reported progress stages only if the AI error-analysis contract later exposes them.
