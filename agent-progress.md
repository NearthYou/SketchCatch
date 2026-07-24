# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/` and remain available in Git history.
## 2026-07-24 - Restore AI progress and calm deployment operations UI

- Restored streaming progress for plain existing-project Architecture Draft requests while retaining JSON validation for Repository analysis and evidence requests.
- Decoupled Live Observation resource pulse cycles from incoming traffic snapshot sequences so each pulse completes and repeats while traffic particles continue independently.
- Removed the Deployment Output card gradients and consolidated Deployment and CI/CD chrome onto the neutral Workspace palette while preserving warning and error semantics.
- Verification: focused AI workflow checks 33/33 and transcript render checks 3/3; Live Observation and deployment UI contract checks 26/26; focused flow render checks 5/5; harness, all five lint tasks, all five typecheck tasks, all five production build tasks, and diff checks pass.
- No schema, migration, dependency, Terraform, or direct cloud mutation was introduced by the code changes.


## 2026-07-24 - Restore existing-project AI diagram generation progress

- Traced the missing progress card to the existing-project transport policy: Repository AI entry supplied a Project ID, selected the JSON endpoint, emitted no progress snapshot, and therefore could never satisfy the transcript visibility gate.
- Made request capability determine the transport. Plain Draft requests now use the progress stream regardless of whether the Project already exists, while Repository analysis/evidence requests retain the JSON validation boundary.
- Verification: focused Workspace AI progress/state/stream checks 33/33, transcript render checks 3/3, all five lint tasks, all five typecheck tasks, all five production build tasks, harness, and diff checks pass.
- No API contract, schema, migration, dependency, cloud mutation, Terraform action, deployment, GitHub mutation, or push was performed.


## 2026-07-24 - Validate authored Terraform runtime Secrets from source

- Reproduced the production false positive: `random_password` is intentionally omitted from synchronized Diagram nodes while the Web prerequisite required that Diagram node even when the saved Terraform chain was complete.
- Made prepared `.tf` files authoritative for Web preflight, shared the exact Terraform Secret-chain validator with the API final guard, and retained Diagram fallback only when no Terraform artifact exists for the AI Fixed Template path.
- Replaced Repository re-analysis / Fixed Template regeneration remediation with a return to the current Terraform editor; corrected deployment and data-model contracts accordingly.
- Verification: Web focused regressions 65/65, API deployment-preparation regressions 11/11, harness, all five lint tasks, all five typecheck tasks, all five production build tasks, and diff checks pass.
- No DB migration, dependency metadata change, cloud mutation, production deployment, Terraform action, or Git/CI/CD handoff was performed. Production remains unchanged until this branch is merged and deployed.

## Current Verified State

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

### 2026-07-24 - Keep the authored scaling target manual

- Removed only `aws_appautoscaling_target` from the authored Fixed Template while preserving the scaling policy with deployable ECS literals.
- A manually added sole scaling target now immediately rewrites the sole policy's `resource_id`, `scalable_dimension`, and `service_namespace` to Terraform references; ambiguous multi-target or multi-policy Boards are left unchanged.
- Focused API and Web regressions, API/Web typechecks, Web lint, and the harness check pass. Application deployment behavior was explicitly left unchanged.

### 2026-07-24 - Generalize natural-language Architecture PatchPlan changes

- Added one deep parameter module that maps exact resource IDs, labels, and existing config names to existing scalar config paths while preserving value types and supporting multiple changes in one request.
- Exact config identities now outrank shared resource labels, so requests such as `ECS Service orders-api` modify only the named resource; ambiguous same-type requests still require clarification.
- Intent-backed provider plans can update validated existing scalar paths, while protected Terraform/template/diagram identities and type-incompatible operations are rejected.
- Review hardening adds boundary-aware parameter matching, destination-value parsing, clause-local booleans, parent-path disambiguation, integer/enum/domain validation, safe nested boolean updates, earliest-longest identity selection, and clarification for multi-item or respectively-style requests.
- Central validation rejects invalid Auto Scaling min/desired/max ordering, absent static provider paths, assigned-value target hijacking, and multi-parameter S3 omissions before any legacy preview path can apply them.
- Verification passes: 31 focused API PatchPlan tests, 3 Board application tests, root lint, root typecheck, root build, and harness checks.
- No DB migration, dependency change, cloud mutation, Terraform action, or deployment was performed.

### 2026-07-24 - Simplify canonical docs and code-adjacent evidence

- Renamed the cross-functional planning document to `docs/service-specification.md` and reduced `docs/README.md` to the canonical reading set.
- Consolidated durable architecture decisions into `docs/architecture.md`; removed the per-decision directory and updated project Skills to write future decisions to the canonical architecture document.
- Removed completed design plans and the unused template indexing package. Moved Architecture Board layout evidence beside the Web compiler tests and kept legacy template IDs unchanged for stored-data compatibility.
- Replaced legacy product-label phrases with neutral language in documentation and user-visible text, while leaving API paths and persisted identifiers unchanged.
- Shortened the authored AI preset's Terraform resource names and references without changing its internal node IDs. Scoped `Ctrl`/`Meta` plus wheel handling to a non-passive canvas listener so Chrome page zoom is not triggered with Board zoom.
- Verification passed: harness, `git diff --check`, canonical Markdown links, stale-path and legacy-label searches, all three package typechecks, API and Web lint, the authored preset regression, 10 shared-type checks, 92 focused Web checks, and the compiler evidence check. No build, deployment, Terraform CLI, AWS, dependency, lockfile, schema, or migration command was run.

### 2026-07-24 - Consolidate team contribution and personal documentation

- Analyzed all locally reachable Git refs by author identity, non-merge subjects, and repeated path ownership; added a concise five-person `README.md` contribution table without rankings or commit-count comparisons.
- Removed all contributor-specific documentation folders (`docs/gg`, `docs/sw`, `docs/ck`, `docs/ys`, and `docs/jh`) after relocating the shared README image and reusable verification evidence to project-owned paths. Deleted documents remain recoverable from Git history.
- Updated the docs navigation and naming rules around canonical documents and purpose-based shared collections; normalized decision filenames and removed two exact duplicate layout images.
- Confirmed the canonical product, architecture, data-model, development, and deployment documents already describe the current ECS/Fargate, RunTask, CI/CD, managed deployment, and cold-rollback topology; no speculative contract rewrite was made.
- Verification: harness, `git diff --check`, 48-file Markdown link scan, zero duplicate docs hashes, 35 focused fixture-path tests, root lint, root typecheck, and all five production builds pass.
- Deleted contributor documents remain recoverable from Git history.

### 2026-07-24 - Delay Workspace AI generation progress until clarification completes

- Issue #553 now renders the diagram-generation progress card only after the active stream emits a server progress snapshot; ordinary loading while validating an answer or returning the next clarification remains in the conversation state.
- Each request exposes only its own `requestSnapshot`, so a prior response cannot make the next clarification request look like generation has started.
- Preserved `DecorativeAwsOrbit`, Orbit motion, convergence, Preview transition, and all Orbit CSS definitions unchanged.
- The exact regression failed before implementation and passes afterward. The focused Workspace AI and Orbit regression set passes 34/34, Web ESLint passes, and `git diff --check` passes.
- Root pnpm checks remain unavailable in the isolated junction worktree because pnpm attempts a networked reinstall. Direct Web typecheck reaches only the two pre-existing invalid Next route helper exports; no changed file is involved.

### 2026-07-24 - Reframe the root README as a visual B2B product page

- Reordered the root README around customer outcomes, product proof, capability flow, understandable system architecture, technology roles, and approval-based deployment safety.
- Removed internal product jargon from the primary narrative and kept the AWS-first, Terraform-first, multi-cloud-ready positioning accurate.
- Added five visual assets rendered from the team-provided presentation and reused one checked-in product capture for the existing-cloud import journey.
- Kept local setup, verification commands, and detailed documentation links available in compact secondary sections.
- Documentation-only change; no dependency, lockfile, migration, cloud mutation, or deployment execution was involved.

### 2026-07-24 - Reduce legacy harness context

- Condensed exact root and infrastructure instruction duplicates, updated React Flow and Terraform wording to current implementation, and clarified that `scripts/init-harness.ps1` requires `pnpm` without changing product code, scripts, permissions, or safety boundaries.
- Archived 106 historical progress lines byte-for-byte under `docs/agent-history/2026-07.md`; current verified state, risks, next actions, and the latest 2026-07-24 records remain active.
- Applied the approved F6/F8/F9 follow-up: refreshed the handoff from `origin/dev` and corrected its conflicting workflow evidence, added two-stage tracker reading, and moved 19 ignored transient `.superpowers` files into the dated local archive without deleting tracked evidence.
- Verified the original harness-only diff with `pnpm harness:check`, `git diff --check`, scoped diff review, archive content comparison, and a zero-tracked-deletion check. The combined documentation cleanup was later reconciled with latest `origin/dev` and received the broader checks recorded above.
- Known risk: the 19 transient `.superpowers` files remain only in the ignored local archive and are not part of the repository diff.

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
