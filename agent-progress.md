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
- The approved sandbox traffic run sent exactly 963 requests with 963 HTTP 200 responses. The failed observation acceptance triggered approved cleanup, and the `liveobs-7cccab4b` AWS resource set was verified absent.
- Deployment `57bda2bf-88af-4e15-8674-0b2ef20f1e8c` is `DESTROYED` with cleared state and current-plan pointers.
- Repository ECS delivery carries runtime Secret names through analysis. Both strict AI and Fixed Template drafts now generate `CHECK_IN_SIGNING_SECRET` during approved Apply, map the same Secrets Manager ARN into the IAM policy and every Task, and leave `INSTANCE_ID` unset for hostname-based observation.
- Public ECS/Web release verification accepts both the legacy `sessionId` check-in response and the stateless signed `sessionToken` response while retaining the required 201 status and ISO expiry check.
- Windows subprocess, local environment isolation, generated architecture knowledge, resource catalog, typography, and Workspace source-contract regressions are repaired.
- The CI/CD tab now presents one current task, a four-Phase readiness flow, flat checklist rows, and right-side setup drawers in the project deployment blue. Current Plan handoffs and Pipeline runs stay scoped, global refresh synchronizes GitHub state, and desktop/390px authenticated browser checks pass.
- CI/CD Phase 2 now depends only on the verified AWS target, matching Region, supported runtime kind, and current confirmed Repository build config. Plan-time checkout verification and deployment URLs are secret-safe Phase 3 evidence, so the Phase header and its four rows share the same server readiness result.
- Sixty focused Repository runtime-Secret, deployment-action, and failure-visibility regressions pass; the final post-review 50-test subset also passes. `pnpm lint` and `pnpm typecheck` pass. Root `pnpm build` reported all five tasks successful before the known Turbo exit hang. The full Web suite passes 1,090 of 1,098 tests; its eight failures are outside the changed runtime-Secret paths. Root `pnpm test` still exposes ten unrelated API baseline failures and one lease-heartbeat cancellation; its one Repository source-contract failure was corrected and passes focused verification.
- `feature_list.json` retains one separately owned aggregate `in_progress` item: `ARCHITECTURE-BOARD-COMPILER-409`.

## Session Record

### 2026-07-22 - Localize marked Workspace resource labels

- Replaced the marked Workspace labels with `리소스`, `템플릿`, `Terraform 리소스 검색`, and `보드 내 리소스`, including matching accessibility labels.
- Lint, typecheck, build, final harness, and diff checks pass. The focused source test could not start because the current workspace does not provide the `tsx` executable.
- No shared contract, database migration, dependency, deployment, cloud mutation, or Git/CI/CD handoff change was made.

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

## Known Risk

- Error-analysis percentage remains an elapsed-time estimate because the current AI endpoint does not expose server-side stages; the active item rises from 8% to 94%, then a real successful response shows 100% for 800ms.
- Existing saved Project Drafts are not rewritten. The affected project must be re-analyzed and its Fixed Template Board regenerated before preparing a new deployment.
- The local test project `b99f92aa-fb46-4822-ae2f-ca9e4e88e4f9` was saved by the stale Web process and must be re-analyzed/regenerated or replaced after the Web restart.
- Root `pnpm test` is not green because ten unrelated API baseline tests fail and `application-artifact-registry.test.ts` still has one cancelled lease-heartbeat test.
- The full Web suite remains at 1,121/1,125 because four architecture-board/compiler tests outside the CI/CD workstream fail; the 102-test focused CI/CD subset is green.
- End-to-end Live Observation animation and provider-confirmed scale-out remain unaccepted because the active UI session missed the traffic before the delayed-snapshot fix.
- Automatic cleanup remains blocked for this credential layout until the approved cleanup operator can read the internal deployment-state object.
- No new AWS resources or traffic may be created without a new explicit approval.

## Next Action

1. Re-run the local new-project Repository flow against the restarted Web server and confirm the generated Board contains the runtime Secret chain.
2. Deploy `dev` through the normal reviewed workflow when a production release is approved; no DB migration is required for these changes.
3. Consider server-reported progress stages only if the AI error-analysis contract later exposes them.
