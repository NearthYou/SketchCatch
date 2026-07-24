# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/` and remain available in Git history.
## Current Verified State

- 2026-07-24: Managed application deployment now waits for its durable Terraform Plan before automatic approval, reuses exact verified Repository checkout evidence from the existing project build environment, and lets automatic ECS validation/Plan continue as infrastructure when CI/CD build settings do not exist. Focused API tests pass 12/12, focused Web tests pass 58/58, and harness, lint, typecheck, and all five production builds pass. No schema, migration, dependency metadata, Terraform apply/destroy, cloud mutation, or user CI/CD handoff changed.
- 2026-07-24: Applied the pending local database migration `0057_reverse_engineering_scan_previews`. It creates the preview-persistence table required by the Reverse Engineering preview endpoint. Verified the 14-column table, migration ledger, and API `/health` plus `/health/db` afterward.
- 2026-07-24: Rebuilt the current Web standalone runtime and atomically refreshed the local launchd `com.sketchcatch.web.stable` service. Port 3000 now serves the current Reverse Engineering UI bundle and proxies unauthenticated GitHub-installation requests to the current API (401 expected). Replaced local runtimes remain under `web-runtime.backup.*` for rollback until visual confirmation.
- 2026-07-24: Reverse Engineering now opens both desktop panels at their minimum widths on the initial empty-board entry. Compact viewports still collapse both panels, and the existing resize controls remain available. Focused panel/reverse tests, lint, typecheck, and production builds passed before the refreshed Web runtime was started.
- 2026-07-24: Merged the latest dev branch into `fix/gg/484-settings`. A persisted AWS structure-analysis check now keeps its next action after refresh, and a blocked AWS disconnect dialog sends the user directly to that action. Focused Settings checks, harness, lint, Web typecheck, and production build pass.
- 2026-07-24: Restored AWS disconnect when an old structure-analysis helper record remains. The disconnect now blocks only active deployment state, keeps AWS-side structure-analysis settings intact, and shows the cleanup action instead of a retry-only dead end. Focused Settings tests passed 25/25, focused API tests passed 34/34, harness, lint, typecheck, and production build passed. Chrome automation could not attach to the running browser, so no live AWS deletion was executed.
- 2026-07-24: Audited the Reverse Engineering reader and permission contracts. API Gateway Stage and KMS Alias now remain in the preview when the Web UI normalizes a child selection to its parent scan family. The catalog route test covers all 68 scan selections; four Cloud Control-only aliases remain visible as manual-review resources and are not represented as Terraform-managed resources.
- Settings now offers only the Seoul region because the current connection, runtime credential, and deployment contract supports that region only. When an AWS Console shortcut cannot be created, the user can download the exact connection Template and continue approval in AWS Console instead of reaching a retry-only dead end.
- Re-ran the Reverse Engineering suite (382), Workspace start and preview suite (139), AWS connection and import-access suite (176), Settings suite (23), harness, root typecheck, and production build successfully. The root test command remains red only in unchanged AI architecture-draft and visual-baseline suites.

- 2026-07-24: Fixed Terraform block and source-line highlights drifting from enlarged code text. Highlight geometry now uses the editor's rendered font metrics through `em`-relative line height instead of the obsolete 19.2px baseline; the focused 3-test regression, root lint, root typecheck, and all five production builds pass.
- The new-project screen shows local AWS, multicolor Google Cloud, and Azure brand icons and uses a wider, larger start-method layout with single-line desktop copy.
- Workspace start cards keep every desktop title on one line, use subdued description typography, and place the AWS Role badge in the Reverse Engineering title row.
- Live Observation keeps up to three problem records stable per session, omits raw logs and the chronological timeline, and shows actual versus expected Task capacity with sustained traffic motion.
- High-traffic motion uses four stable particle lanes and compositor-only transforms instead of request-key churn and layout-bound `left` animation.
- Repository Template previews show a dynamic recommendation rank, use the clearer AI design action, and keep candidate navigation anchored independently of recommendation-reason length.
- Repository follow-up questions separate selected Template context, section hierarchy, individual prompts, and card-style answer choices.
- 2026-07-24: Fixed AI Architecture chat patches for Application Auto Scaling target values. Exact resource IDs and the sole matching scaling policy now resolve deterministically, nested target-tracking config shapes are preserved, supported local plans skip Bedrock latency, and no-op requests return clarification instead of fake success.
- Generalized Architecture PatchPlan changes now resolve exact resource identities and existing scalar config paths, handle intent-based add/modify/remove requests, and reject ambiguous targets or unsafe values before preview application.
- Added synchronous submission and patch-application locks. Board patch success now appears only after Project Draft persistence returns either an explicit local-save success or a valid saved server revision; missing callbacks and failed save results no longer claim success.
- Verified the focused API suite 7/7 and Web routing/consolidation suite 17/17, including the exact ecs_service_requests target value 50 to 5 regression, provider bypass, duplicate prevention, local-save results, and resolved { ok: false } handling.
- Root lint and typecheck passed. All five package production builds passed directly; the final Turbo wrapper did not exit after completing work, so it was terminated after package-level verification.
- Root pnpm test remains red in unrelated pre-existing Web baseline tests such as Settings CodeConnection refresh, Live Observation layout contracts, and Repository start behavior. The focused suites for this workstream pass.
- The AI Architecture patch work recorded above made no schema, dependency, shared-contract, cloud-resource, deployment, or migration changes.

## Session Record

## Known Risk

- Authenticated browser visual smoke testing for `/workspace/new` was not available in the clean browser session; the route redirected to login. Source-level regression coverage and the production build are green.
- The manifest-contract repair and audience receipt flow are production-verified, but provider-confirmed scale-out remains a separate blocked acceptance item.
- Error-analysis percentage remains an elapsed-time estimate because the current AI endpoint does not expose server-side stages; the active item rises from 8% to 94%, then a real successful response shows 100% for 800ms.
- Existing saved Project Drafts are not rewritten, but their authored Terraform remains authoritative and does not require Repository re-analysis or Fixed Template regeneration after this fix is deployed.
- The local test project `b99f92aa-fb46-4822-ae2f-ca9e4e88e4f9` may need a reload or re-save after the stale Web process restarts; runtime Secret validation alone no longer requires re-analysis.
- Root `pnpm test` is not green because ten unrelated API baseline tests fail and `application-artifact-registry.test.ts` still has one cancelled lease-heartbeat test.
- The full Web suite is 1,205/1,213. Eight unrelated baseline contracts fail across generated architecture knowledge, node/thumbnail presentation, typography audits, CI/CD styling, and Live Observation capacity layout.
- Provider-confirmed scale-out remains unaccepted because the production acceptance traffic intentionally covered session, receipt, SSE, and heartbeat continuity rather than a load-triggered capacity change.
- Automatic cleanup remains blocked for this credential layout until the approved cleanup operator can read the internal deployment-state object.
- No new AWS resources or traffic may be created without a new explicit approval.

## Next Action

1. After this branch is merged and deployed, retry the affected saved project validation without Repository re-analysis and confirm the authored Terraform chain passes.
2. Use a separately approved load cycle if provider-confirmed Live Observation scale-out must be accepted; no DB migration is required.
3. Consider server-reported progress stages only if the AI error-analysis contract later exposes them.

### 2026-07-24 - Stabilize Live Observation Task forecasts

- Reserved the Task stage from the architecture maximum capacity and clipped connector paint so Task transitions and traffic animation cannot resize the horizontal scroll geometry.
- Showed an expected Task count only when a provider-observed actual count differs from the request-based projection; unknown and steady capacity no longer render a misleading expectation.
- Added continuous, low-amplitude `예상 중` motion for both scale-out and scale-in without the prior fade/scale flash.
- Lowered the new ECS/Fargate Architecture and authored demo `ALBRequestCountPerTarget` default from 10 to 5 so request-driven scale-out is projected sooner.
- Browser QA sampled 40 animation frames: `scrollWidth`, `clientWidth`, and surface width each stayed constant, the scale-out state rendered one forecast card, and the steady state rendered zero forecast cards.
- Verification passed: six focused Web regressions, Template definitions, strict Repository Architecture, Template Terraform validation, authored Terraform preset, root lint, root typecheck, root build, diff check, and harness check.
- No migration, dependency change, cloud traffic, Terraform action, deployment, or infrastructure mutation was performed. Existing Deployments keep their approved scaling policy until a new approved Plan/Apply.

### 2026-07-24 - Advance Task forecasts and complete traffic motion

- Reproduced three focused failures: a second Task was not forecast at 500 accepted requests, scale-in remained labeled as expected, and burst lifetime ended before the final Task connector.
- Added a 500-request early scale-out step, made expected Tasks scale-out-only and visible on the first paint, and removed forecast units immediately when provider capacity catches up.
- Counted the ECS Service-to-Task connector in burst lifetime so particles and node pulses reach the Task group.
- Verification passes: 22 focused regressions, root lint, root typecheck, all five build tasks and 24 Web routes, diff check, and harness check. The root build exited successfully after 4m23s.
- No DB migration, dependency change, generated load, Terraform action, or infrastructure mutation was performed.

### 2026-07-24 - Separate deployment scopes and clarify observation feedback

- Manual scope changes now invalidate the previous Deployment Plan and approval before restarting validation, preventing an infrastructure-only selection from executing an older full-stack Plan. Successful infrastructure deployments offer a separate application-only continuation.
- Reworked the Web entry-point output as a distinct service-access card with copy, open, QR, and observation actions.
- Advanced the Task forecast threshold from 500 to 100 accepted requests without generating synthetic traffic.
- Restyled pre-deployment suggestions as a visible warning callout and replaced design-analysis wording with CloudWatch metrics, infrastructure-wide assessment, and likely bottleneck areas.
- Verification passed: 91 focused Web tests, Web lint, Web typecheck, `git diff --check`, and final harness check. Full builds and broad suites were intentionally skipped per the request for scoped fast verification.
- No DB migration, dependency change, generated load, Terraform action, deployment, or cloud mutation was performed.
### 2026-07-24 - Restore AI progress and application-only deployment UX

- Restored streamed progress for existing-project AI diagram generation while keeping clarification turns free of premature progress UI.
- Removed the deployment output gradient and `PUBLIC` badge, aligned Deployment/CI/CD colors with the neutral workspace palette, and made Live Observation resource pulses complete independently from traffic animation.
- Made application-only deployment a one-click flow that prepares, validates, records approval, and executes without a separate approval interaction. Missing ECS output metadata is safely reconciled from the latest verified live Terraform state before the application release.
- Application-only progress now uses app build/release wording, cleanup candidates remain visible after preflight errors, and Web entry-point URLs appear only after an application release reaches a completed or partially completed terminal state.
- Focused verification passed: 58 deployment-flow/progress Web tests, 122 deployment-plan/readiness API tests, and 23 output/Live Observation presentation tests. Root harness, lint, typecheck, and all five production builds pass; the first typecheck exposed and the final typecheck fixed one missing history-link import.
- No DB migration, dependency change, Terraform action, generated load, or cloud mutation was performed. Next action is the requested PR merge and `dev` production redeployment through the reviewed GitHub Actions workflow.

### 2026-07-25 - Refresh split application release targets

- Application-only ECS/Fargate releases now reconcile the target from the latest successful infrastructure deployment and its AWS connection before artifact preparation.
- Synchronization fails closed on connection, approved Apply Plan, output, resource, or build-evidence mismatch.
- Verification passed: 133 focused API tests, harness, lint, typecheck, and all five builds.
- No migration, dependency change, Terraform action, or cloud mutation was performed.
### 2026-07-24 - Clear Reverse Engineering presentation

- Replaced Reverse Engineering-only cards, panels, CSS, and presentation helpers with semantic controls backed by `useReverseEngineeringWorkflow`, while preserving scan, recovery, preview, apply, history, and source-exact Board flows.
- Removed the old UI-only tests and formatters, added pure scan-history coverage, and updated the technical learning guide to point at the retained workflow.
- Verification passed: focused Reverse Engineering tests, Web lint/typecheck/build, harness, migration compatibility, and diff checks. No API/type/provider/AWS permission, Terraform execution, or AWS mutation changes were made.

### 2026-07-24 - Repair Reverse Engineering preview runtime and scan presentation

- Repaired the detail dialog Portal styling and focus lifecycle so it opens as an opaque modal instead of an apparently stalled transparent overlay; removed the missing `useMemo` runtime path from the scan settings panel.
- Removed remaining candidate UI, duplicate side scan action, legacy preview notice, and Terraform/AWS implementation hints from the user-facing Reverse Engineering workbench.
- Made the AWS settings action conditional on a genuine connection or permission recovery path. Retryable partial scans now retain the usable Preview without sending users to settings.
- Normalized Resource Explorer and detailed-reader identities before merge. A read-only scan of the configured account now produces 309 resources rather than the prior 328, removing 19 duplicate representations while retaining the detailed record and source-type provenance.
- Added a responsive large-board organization path and explicit organizing state so a 300-plus-resource Preview remains responsive and shows progress before any layout work completes.
- Verification passed: 107 focused Reverse Engineering and layout tests, 72 API gateway tests, Web lint, Web typecheck, API lint/typecheck, API and Web builds, harness, and `git diff --check`. Browser smoke testing confirmed the opaque detail dialog, 309-resource current scan, no AWS settings link for the partial result, no candidate/duplicate scan UI, and successful organization without saving the Board.
- Three unrelated static `DiagramEditor` layout assertions remain stale on the base commit; their expected source snippets already differ from `HEAD` before this change. No AWS resource, Terraform state, deployment, or Board save was performed.

### 2026-07-25 - Repair Reverse Engineering detail toggles and startup panels

- Reproduced the detail-dialog defect in the browser: expanded accordion bodies existed but the modal grid constrained each parent section to 112px, clipping bodies such as the 443px coverage section and the large findings list.
- Made modal grid rows content-sized and scrollable, then replaced title-derived accordion IDs with stable section IDs. The four top-level `aria-controls` values are now unique instead of all collapsing to an empty Korean-title suffix.
- Replaced the large amber partial-scan card with a 48px compact status row that preserves the recovery action only when settings are genuinely required.
- Opened the Reverse Engineering start screen’s left panel at its 300px minimum width and placed the `시작 방식 다시 선택` navigation action inside it.
- Verification passed: browser reproduction before the fix failed with `section=112, body=443`; the same check passed afterward with `section=542, body=443`, category content rendered within the modal scroll area, the compact partial status was 48px high, and the initial left panel was open at 300px. Web lint, Web typecheck, 31 focused tests, and `git diff --check` pass. No Board save, Terraform action, or AWS mutation was performed.

### 2026-07-25 - Simplify Reverse Engineering scan settings header

- Removed the redundant startup instruction below the `스캔 설정` heading while preserving the preview-only description after a scan result exists.
- Verification passed: Web lint, Web typecheck, source absence check, and `git diff --check`. No AWS, Terraform, Board, or data mutation was performed.

### 2026-07-25 - Match the detail partial-scan status treatment

- Replaced the detailed scan-limit warning card with the same `partialScanStatus` row used in the preview result: the identical CircleAlert icon, heading, and supporting sentence are now rendered inside the detail accordion.
- Preserved the conditional settings recovery link below the shared status row when the scan result genuinely requires it.
- Verification passed: Web lint, Web typecheck, `git diff --check`, and source-level confirmation that both surfaces use the shared status class and copy. No AWS scan, Board save, Terraform action, or data mutation was performed.

### 2026-07-25 - Complete detail warning-status unification

- Replaced the remaining category-level unread-service warning in the detail dialog with the same compact `partialScanStatus` treatment, retaining only the affected service names as the supporting sentence.
- The detail dialog now contains no `warningNotice` warning cards; scan-limit and category-level read limits both use the shared status row.
- Verification passed: Web lint, Web typecheck, zero-detail-warning-card source check, and `git diff --check`. No AWS, Terraform, Board, or data mutation was performed.

### 2026-07-25 - Restore CI harness progress-log limit

- Reproduced the PR CI failure locally: `agent-progress.md` exceeded the harness 24,000-byte limit.
- Moved nine completed historical records to `docs/agent-history/2026-07.md`, keeping the active record below the limit without changing product code.
- Verification passed: `pnpm harness:check` and `git diff --check`.
