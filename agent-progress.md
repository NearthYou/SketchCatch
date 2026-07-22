# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/` and remain available in Git history.

## Current Verified State

- Public Repository Analysis no longer special-cases `chaekang/audience-live-check`; it resolves the current selected branch SHA and reads real repository evidence while general Fixed Template and authored demo flows remain available.
- Branch `codex/fix-error-progress-completion` includes `origin/dev` through `d189cda3` and keeps the compact Workspace AI Terraform error-analysis gauge visible through an explicit successful 100% completion state.
- The parked JH Workspace changes are restored on `dev`: Deployment uses the shorter `배포` label and intrinsic action width, Settings omits redundant CodeBuild authorization copy, and Project Draft loading uses the server draft whenever one exists without rendering the removed local-recovery chooser.
- Terraform reverse sync accepts references to its allowlisted utility resources, so generated Runtime Secret values such as `random_password.check_in_signing.result` round-trip without a false manual-edit warning.
- The Direct Deployment branch includes `origin/dev` through `fce1d6c0`, removes duplicate deployment summaries, and keeps selected history details within the active filter. Eighty-six focused Web tests and the root harness, lint, typecheck, and build checks pass.
- The legacy `practice` Deployment profile is removed; `demo_web_service` is the default live profile, and imported migration `0054` rewrites legacy rows before removing the enum value.
- Live Observation keeps its bounded traffic motion and presents a separate, read-only Signal Dashboard: at most three deterministic, evidence-backed signals distinguish confirmed facts, possible causes, and what is still unknown without adding live AWS actions.
- Delayed first CloudWatch points retain request and capacity evidence, and stopped sessions no longer continue the countdown.
- Production API task definition `sketchcatch-production-api:58` accepts manifests with the optional audience application URL. A fresh Chrome acceptance session stayed active while the audience app connected and the Store-backed request count advanced from `+1` to `+3` across repeat participation and heartbeat traffic.
- The approved sandbox traffic run sent exactly 963 requests with 963 HTTP 200 responses. The failed observation acceptance triggered approved cleanup, and the `liveobs-7cccab4b` AWS resource set was verified absent.
- Deployment `57bda2bf-88af-4e15-8674-0b2ef20f1e8c` is `DESTROYED` with cleared state and current-plan pointers.
- Repository ECS delivery carries runtime Secret names through analysis. Both strict AI and Fixed Template drafts now generate `CHECK_IN_SIGNING_SECRET` during approved Apply, map the same Secrets Manager ARN into the IAM policy and every Task, and leave `INSTANCE_ID` unset for hostname-based observation.
- Public ECS/Web release verification accepts both the legacy `sessionId` check-in response and the stateless signed `sessionToken` response while retaining the required 201 status and ISO expiry check.
- Windows subprocess, local environment isolation, generated architecture knowledge, resource catalog, typography, and Workspace source-contract regressions are repaired.
- The CI/CD tab now presents one current task, a four-Phase readiness flow, flat checklist rows, and right-side setup drawers in the project deployment blue. Current Plan handoffs and Pipeline runs stay scoped, global refresh synchronizes GitHub state, and desktop/390px authenticated browser checks pass.
- CI/CD Phase 2 now depends only on the verified AWS target, matching Region, supported runtime kind, and current confirmed Repository build config. Plan-time checkout verification and deployment URLs are secret-safe Phase 3 evidence, so the Phase header and its four rows share the same server readiness result.
- CI/CD Phase 3 now applies and verifies GitHub Repository settings, one target-branch Environment policy, scoped AWS trust, and PR state in one resumable action. Failed Pipelines can create a safe retry PR without Destroy or Direct redeployment, and workflow project binding is checked before external work.
- Sixty focused Repository runtime-Secret, deployment-action, and failure-visibility regressions pass; the final post-review 50-test subset also passes. `pnpm lint` and `pnpm typecheck` pass. Root `pnpm build` reported all five tasks successful before the known Turbo exit hang. The full Web suite passes 1,090 of 1,098 tests; its eight failures are outside the changed runtime-Secret paths. Root `pnpm test` still exposes ten unrelated API baseline failures and one lease-heartbeat cancellation; its one Repository source-contract failure was corrected and passes focused verification.
- `feature_list.json` retains one separately owned aggregate `in_progress` item: `ARCHITECTURE-BOARD-COMPILER-409`.

## Session Record

### 2026-07-22 - Ignore CI/CD handoffs from replaced Repository connections

- Reproduced the production failure with a deterministic Web regression: reconnecting the same GitHub Repository creates a new Source Repository id, while the previous selector reused a handoff by Deployment and accepted Plan only.
- Updated setup handoff selection to require the current Source Repository id, so a handoff tied to the inactive pre-reconnect record is ignored and the approved setup flow creates a fresh handoff.
- Verification passes: 54 focused CI/CD Web tests, root lint, root typecheck, all five production builds, diff checks, and the final harness check.
- No database migration, dependency change, AWS mutation, Terraform execution, deployment, or handoff creation was performed. GitHub issue #537 and its review branch were created after verification.


### 2026-07-22 - Repair the production Live Observation manifest contract

- Reproduced the post-reboot production failure with a fresh ECS task: session creation succeeded, but the first read returned HTTP 503 `LIVE_OBSERVATION_CACHE_UNAVAILABLE`.
- Isolated the failure to the Redis Lua manifest validator. The API and shared schema validly emit optional `endpoints.audienceApplicationUrl`, while the validator still required exactly the older two endpoint keys and rejected the newly written session as corrupt.
- Updated the validator to accept the optional string field and added a public-behavior Redis integration regression. The test failed before the fix and the Redis 8 suite now passes 31/31.
- Merged current `origin/dev` at `334e33c5`, then passed harness, lint, typecheck, all five production builds, and the Redis integration suite.
- Deployed exact branch SHA `59b0abee` through production workflow `29876627509`; Web and API ECS services stabilized, with the API on task definition revision 58.
- Chrome acceptance created public observation `c815c2b8-9eb9-44f2-aeba-0eec1f31394b`, observed one running Fargate Task, connected the deployed audience application, and confirmed request growth `+1 -> +2 -> +3` across participation and heartbeat. The audience console had no errors.
- No database migration, dependency, lockfile, Terraform execution, or user Deployment resource mutation was performed in this repair. The mutation was limited to the explicitly approved SketchCatch production service release.

### 2026-07-22 - Complete the external audience receipt handoff

- Confirmed current `dev` at `a45c399b` already exposes the scoped `sketchcatch_observation_url`, origin-bound bootstrap, Store-only `/receipts`, production Redis namespace, and Signal Dashboard contract; this feature branch adds Redis client recovery and typed SSE diagnostics.
- Reproduced the external audience gap with a deterministic red test that observed only the real participation request instead of participation -> bootstrap -> receipt. Branch `codex/fix-browser-check-in-route` now validates the scoped HTTPS URL, keeps its capability in memory, and sends unique best-effort receipts only after successful check-ins and heartbeats.
- Audience commit `b96e8f0` passes all 50 tests, typecheck, production build, and targeted Biome checks. Nine focused SketchCatch API tests and 28 focused Web tests pass.
- Repository-wide audience lint remains non-green only because 26 pre-existing CRLF-formatted files are outside Biome's expected line ending; all changed source files pass.
- No dependency, lockfile, migration, Terraform execution, cloud mutation, deployment, push, or Git/CI/CD handoff was performed.
- Merged the latest `origin/dev` at `b5553be1`; the only textual conflict was this session log, and both Live Observation and CI/CD readiness records were preserved without a product-code conflict.
- Post-merge verification passes 29 focused API tests, 43 focused Web tests, all 11 Redis 8 integration cases, harness, lint, typecheck, and all five production builds.

### 2026-07-22 - Recover Live Observation after Redis command failures

- Production CloudWatch evidence for observation `0fa61f2f-9e99-44b2-8683-b2fc7cbf8f7e` showed every SSE request opening with HTTP 200 and closing in about 6 ms while every snapshot fallback returned HTTP 503. The route contract maps this pattern to `LIVE_OBSERVATION_CACHE_UNAVAILABLE`, not an AWS provider-observation failure.
- Reproduced the store defect with an open Redis client whose command fails: the previous implementation reused that poisoned client forever because reconnect is disabled and `isOpen` remains true.
- The Redis store now discards and destroys the failed client without replaying the ambiguous command; the next request creates a fresh connection. The Web modal now renders the safe API error code, HTTP status, path, and request ID while automatic reconnect continues.
- The focused Redis recovery test, Web diagnostic test, and Redis 8 integration suite pass (30/30). Root lint, typecheck, and all five production builds pass.
- Review found that SSE HTTP failures still discarded their response diagnostics. SSE failures now reuse the typed API error conversion, including no-response and missing-body handling, and the source-regex contract test was replaced with a fetch-level behavior test.
- Chrome exposed the actual audience failure as `TypeError: Failed to execute 'fetch' on 'Window': Illegal invocation`: the native fetch function was passed to `ky` without its Window receiver. The default fetch is now bound to `globalThis`, a receiver-sensitive regression test passes, and local Chrome verification recorded one POST 201 followed by repeated heartbeat POST 200 responses with the UI in `✓ 참여 중 · 연결됨` state.
- The separate `audience-live-check` branch `codex/fix-browser-check-in-route` moves browser calls to `/api/participations` while retaining `/api/check-ins` as the release-verification compatibility alias. Its focused tests, full 48-test suite, typecheck, build, and changed-file lint pass.
- Broad API and Web suites still expose pre-existing Architecture Compiler, generated artifact, artifact-loader, and AI Architecture Draft baseline failures outside this workstream. The changed Live Observation tests pass.
- Merged `origin/dev` at `587e4443` into `codex/fix-deployment-live-observation`; the only textual conflict was this session log, and both histories were preserved. The combined Redis recovery, SSE diagnostics, Store-backed traffic warning, AI recommendation, and bounded Terraform draft flows pass 10 focused API tests, 27 focused Web tests, the Redis 8 integration suite, harness, lint, typecheck, and all production builds.
- Refreshed `origin/dev` to `a45c399b` and merged its Signal Dashboard rebuild. The only code conflict kept the typed SSE failure diagnostics while dropping the dashboard's removed legacy capacity import. Ninety-four focused TypeScript tests and six CSS-loaded Signal Dashboard component tests pass together with harness, lint, typecheck, and production builds.
- No dependency, lockfile, migration, Terraform execution, cloud mutation, deployment, or Git/CI/CD handoff was performed.

### 2026-07-22 - Align CI/CD readiness phase boundaries

- Completed the task-focused four-phase CI/CD redesign and aligned the Phase 2 header and rows with the server-owned verified AWS target, Region, runtime, and current Repository build config.
- Moved Plan-time checkout verification and secret-safe Static Site/API output evidence into Phase 3. The Plan CTA only opens Direct Deployment and never starts Plan or Apply itself.
- Updated stale API readiness fixtures to include the persisted Phase 2 deployment target, preserving the production readiness contract while repairing the four CI failures.
- Merged the latest `origin/dev`, preserved both Workspace panel regression intents, retained the updated historical Live Observation plan, and resolved every conflict marker.
- Focused API and Web regressions, lint, typecheck, build, harness, and diff checks passed. No database migration, provider mutation, deployment, or Git handoff was performed.

### 2026-07-22 - Remove the duplicate AWS connection step description

- Hid the empty-state AWS Role description from the connection step header while retaining it in the expanded body and preserving the verified account/region summary.
- Seven focused Settings tests, lint, typecheck, build, final harness, and two-axis review pass. No full test suite was run.
- No API, shared contract, database migration, dependency, deployment, or cloud mutation change was made.

### 2026-07-22 - Restructure Settings connection flow

- Reworked the existing Settings integrations into one ordered GitHub App -> AWS account -> AWS CodeBuild GitHub authorization flow, with completed steps collapsed and the current or error step expanded.
- Preserved all existing API clients, DTOs, shared types, actions, and connected AWS account management. Long CodeBuild failure details now remain behind an `오류 상세` disclosure with a neutral summary.
- Verification passed: 14 focused Web tests, `pnpm lint`, `pnpm typecheck`, `pnpm build`, diff checks, and two-axis review. Authenticated browser smoke was unavailable because the in-app browser session was signed out.
- No database migration, dependency change, cloud mutation, deployment action, or Git/CI/CD handoff was performed.

### 2026-07-22 - Connect real audience traffic to immediate Live Observation warnings

- Removed the separate public per-IP limiter, `Retry-After` propagation, and audience countdown while retaining the Store safety envelope of 20 events/second, 120 events/10 seconds, 10,000 events/session, and a 15-minute session lifetime.
- Added an optional audience application URL to the v4 manifest with backward-compatible CloudFront derivation for existing manifests. The external audience app receives a scoped observation receipt URL and emits best-effort receipts only after successful real check-in and heartbeat requests.
- Latched immediate Store-backed pressure warnings until a user-approved Project Draft save succeeds. The only automatic Terraform edit requires exactly one `aws_appautoscaling_target` and one numeric `max_capacity`, increments it by one, and never runs Plan, Apply, deployment, or cloud mutation.
- Added AI recommendation context, explicit editor navigation after save, revision-conflict protection, contract documentation, and focused API/Web regressions.
- Verification passed: 24 focused API tests, 28 focused Web tests, `pnpm lint`, `pnpm typecheck`, `pnpm build`, final harness, and two-axis review. Review fixes separated Store-only receipts from legacy probes, moved warning latch state outside the modal, streamed Store snapshots before provider refresh, and removed the unused Runtime Cache dependency.
- Root `pnpm test` remains non-green in pre-existing `aiArchitectureDrafts.test.ts` expectations outside this workstream; the changed Live Observation subsets pass.
- The external `audience-live-check` clone passes typecheck, build, 49 tests, and changed-file Biome checks. Its root lint remains non-green because of existing repository-wide CRLF formatting findings outside the changed files.
- No database migration, dependency change, secret access, Terraform execution, deployment, or cloud mutation was performed.

### 2026-07-22 - Reduce Diagram resource label size

- Reduced only the labels beneath Diagram resource icons from an effective 18px to 13px while preserving the two-line clamp, icon spacing, edge labels, and area headings.
- Lint, typecheck, build, harness, and two-axis review pass. No feature or browser test suite was run.

### 2026-07-22 - Strengthen Workspace panel borders

- Increased the Diagram Editor's neutral border contrast for both outer panel boundaries and internal separators/controls: regular lines now use `#d4d4d4`, while strong lines use `#c8c8c8`.
- Lint, typecheck, build, harness, and two-axis review pass. No feature or browser test suite was run.

### 2026-07-21 - Simplify fallback cost headings

- Removed the marked `예상` qualifier from the fallback monthly and daily cost headings while preserving the explicit `실제` labels for AWS-backed data.
- Lint, typecheck, build, harness, and two-axis review pass. No feature or browser test suite was run.

### 2026-07-21 - Remove visible sample identifiers from Cost Usage

- Replaced visible `sample-*`, `Sample`, `예시`, and test-only wording in fallback Cost Usage content with neutral DB/ALB names and estimated-cost labels. Internal fallback identifiers remain unchanged, and live AWS recommendation conditions retain their original wording.
- Lint, typecheck, build, harness, and two-axis review pass. No feature or browser test suite was run.

### 2026-07-21 - Shorten the Live Observation public traffic cooldown

- Fast-forwarded the issue branch from `c3ac5a8e` to current `origin/dev` at `13ed1cb6`, then restored the Live Observation request work on top.
- Reproduced the audience page dropping the server `Retry-After` value and the public collector enforcing a 30-request fixed minute, which could leave one client waiting almost 60 seconds.
- Replaced the long window with two global per-IP safeguards aligned to the Store envelope: 20 requests per second and 120 requests per 10 seconds. Human-paced requests no longer encounter a minute cooldown; excessive traffic waits normally one second and at most ten seconds.
- Propagated the exact cooldown through the collector error, HTTP `Retry-After`, CORS exposure, audience client, session state, disabled action, and automatic ready-state recovery.
- Added five API/Web regressions for both rate windows, HTTP/CORS delivery, client parsing, and cooldown suppression. The existing four traffic-burst regressions remain green.
- Focused verification passes 9/9. Root harness, lint, typecheck, all five production builds, and diff checks pass on the updated branch.
- Preserved the latest dev progress record and archive during stash conflict resolution; no product-code merge conflict occurred.
- No dependency, lockfile, database migration, Terraform execution, cloud mutation, Deployment action, or Git/CI/CD handoff was performed.

### 2026-07-21 - Remove the Repository-specific audience demo bypass

- Removed the fixed analysis response, frozen revision, synthetic architecture facts, strict URL profile, and Web-only Architecture Draft branch for `chaekang/audience-live-check`.
- Public analysis now resolves the selected branch SHA and reads its tree and evidence files; Repository Board generation uses the same analyzed Template path as every other repository.
- Focused Repository API and Web checks pass 18/18, and the retained general Fixed Template checks pass 4/4. Harness, lint, typecheck, build, and diff checks pass. The broad AI Draft file still has 15 unrelated baseline failures.
- No dependency, lockfile, database migration, Terraform execution, cloud mutation, deployment, or Git/CI/CD handoff was performed.
- 2026-07-21: Added a UI-only target environment selector to the new-project screen with equally selectable AWS, GCP, Azure, and On-premise options. The selection is intentionally not persisted or sent to project creation APIs. The focused environment test, browser selection check, lint, typecheck, and build pass. The full Web suite remains at 1,095/1,099 because of four pre-existing Architecture Board/compiler failures outside this change.

### 2026-07-22 - Keep Live Observation traffic visible

- Reserved a non-shrinking desktop traffic viewport above the Signal Dashboard and added a 20px separation; mobile keeps its existing content-sized layout.
- Browser QA confirmed a 410px desktop flow, a 20px gap, and no mobile horizontal overflow. Focused Live Observation checks, harness, lint, typecheck, build, and diff checks pass.

## Known Risk

- The manifest-contract repair and audience receipt flow are production-verified, but provider-confirmed scale-out remains a separate blocked acceptance item.
- Error-analysis percentage remains an elapsed-time estimate because the current AI endpoint does not expose server-side stages; the active item rises from 8% to 94%, then a real successful response shows 100% for 800ms.
- Existing saved Project Drafts are not rewritten. The affected project must be re-analyzed and its Fixed Template Board regenerated before preparing a new deployment.
- The local test project `b99f92aa-fb46-4822-ae2f-ca9e4e88e4f9` was saved by the stale Web process and must be re-analyzed/regenerated or replaced after the Web restart.
- Root `pnpm test` is not green because ten unrelated API baseline tests fail and `application-artifact-registry.test.ts` still has one cancelled lease-heartbeat test.
- The full Web suite remains at 1,121/1,125 because four architecture-board/compiler tests outside the CI/CD workstream fail; the 102-test focused CI/CD subset is green.
- Provider-confirmed scale-out remains unaccepted because the production acceptance traffic intentionally covered session, receipt, SSE, and heartbeat continuity rather than a load-triggered capacity change.
- Automatic cleanup remains blocked for this credential layout until the approved cleanup operator can read the internal deployment-state object.
- No new AWS resources or traffic may be created without a new explicit approval.

## Next Action

1. Re-run the local new-project Repository flow against the restarted Web server and confirm the generated Board contains the runtime Secret chain.
2. Use a separately approved load cycle if provider-confirmed Live Observation scale-out must be accepted; no DB migration is required.
3. Consider server-reported progress stages only if the AI error-analysis contract later exposes them.
