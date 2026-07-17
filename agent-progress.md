# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- `/workspace/ai` is rebuilt as a new conversation surface with a selected-option trail, a decorative AWS Resource Orbit, and a Compiler-authoritative final Preview.
- Clicked assistant options are semantic, current-session selections; direct input, voice input, retry, and candidate exclusion remain separate concerns.
- The Orbit uses deterministic presentation-only selections from the actual AWS Resource icon catalog and does not restore or depend on backend progress stages.
- A final Preview appears only from a successful Architecture Board Compiler proposal and renders that proposal's Diagram read-only until explicit Board application.
- The deleted progress card, requirement list, history panel, mobile tabs, route-only summary, and other unused presentation/progress contracts remain deleted.
- Cancellation, stale-response rejection, retry, candidate exclusion/undo, clarification, Compiler, explicit approval, and save boundaries remain in functional code.

## Session Record

### 2026-07-18 - Correct Cross-account AWS S3 Template mapping

- Verified the public Brainboard Template and its cloned Board in Chrome: one Region, two Group areas (`Prod account` and `Test account`), one S3 Bucket, two S3 Object Resources, and two authored relationships.
- Replaced the incorrect AWS Account presentation mapping and empty text primitives with the existing Palette Group area while preserving the three Terraform Resources, containment, and source geometry.
- Recaptured the committed WebP from the actual SketchCatch Board and bound its manifest hash to the corrected Diagram.
- Added regression coverage for the source-capture `design-group` Area identity, Palette-backed Resources, containment, and thumbnail Diagram hash.
- Focused tests, harness, lint, typecheck, build, and Architecture Board knowledge checks pass. The aggregate Compiler evidence check still rejects an unrelated `repository:three-tier-web-app` candidate switch (`siblingAreaOverlapCount` 8 > 6 and `backwardEdgeCount` 6 > 4); the baseline was not relaxed.

### 2026-07-17 - Rebuild Workspace AI conversation and compiled preview

- Added a responsibility-separated route shell, transcript, composer, selected-option model and accessible trail, deterministic option-to-resource mapper, decorative AWS Resource Orbit, and read-only final Architecture Preview.
- Recorded exactly one clicked assistant option per single-select question before submitting it; direct and voice input do not enter the trail, while failed, cancelled, and retried requests retain the click record.
- Built the Orbit only from enabled `resourceCatalog` entries whose icon URLs use `/Resource-Icons_07312025/`; stable option state produces stable composition and each click changes only a bounded subset.
- Kept the Orbit explicitly decorative and replaced it, without a fake morph, only after the Compiler returns the actual Diagram used by the final pan/zoom Preview.
- Preserved actual candidate exclusion/undo and the explicit Board-application boundary without reviving server progress APIs or the deleted Workspace AI presentation.
- Browser QA covered 1440x900, 1024x768, both sides of the 959px breakpoint, and 390x844. It verified option accumulation, bounded Orbit changes, continuous multi-ring motion, the click pulse/kick/excursion response, the separate Orbit exit and final Diagram reveal, pan/zoom, mobile reachability, zero horizontal overflow, and zero new console errors or warnings after the viewer-anchor fix. Board application was not used.
- Passed focused Workspace AI/Compiler tests 94/94, full Web regression 545/545, `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`.
- No real cloud apply, deployment, user-project mutation, Git handoff, push, or PR was performed.

### 2026-07-17 - Clear the Workspace AI rebuild baseline

- Audited the new-project, existing-project, Repository, storage, workflow, API, service, shared-type, Compiler, candidate-exclusion, approval, and save paths before removing presentation code.
- Deleted the old `/workspace/ai` client, CSS, UI test, progress/preview components, route-only Compiler summary, and stale progress implementation plan; the route now returns `null` without a placeholder.
- Reduced the progress transport to a candidate-only observational snapshot and removed UI-only progress models and unconsumed request fields end-to-end.
- Preserved Repository preview behavior in a Repository-local component and moved the Workspace AI chat storage-key helper out of its presentation component.
- Added `docs/superpowers/specs/2026-07-17-workspace-ai-rebuild-baseline.md` as the only implementation baseline for the next UI.
- Passed the rebuild evidence Web tests 55/55, focused API tests 77/77, full Web regression 528/528, harness, lint, typecheck, build, and diff checks. Independent review returned Ready with no Critical, Important, or Minor findings.

### 2026-07-17 - Implement live AI Draft progress preview (#448)

- Superseded by the cleanup record above; the implementation and verification below are historical evidence and do not describe the current `/workspace/ai` route.
- Added shared progress/exclusion contracts, API snapshot streaming, strict NDJSON validation, caller abort propagation, and reverse-proxy no-buffering headers while preserving the existing JSON paths.
- Added the responsive progress pane, requirement/question summaries, provisional diagram, compact history, exclusion/undo, in-place cancel/retry, final transition diff, mobile pane tabs, and last-good projection retention.
- Direct browser QA passed at 1440x900, 1024x768, 390x844, and the 720/721 boundary: no horizontal overflow, mobile send/tab/final scrolling, desktop simultaneous panes, pan/zoom, clarification handoff, server-authorized exclusion and undo, retained retry state, final replacement, and reload non-persistence. The disposable local QA account and its active tokens were removed; `Board에 적용` was not used and no user project was created.
- Structured clarification answers now remain one confirmed `question: answer` fact, and provider-originated clarification emits a new full snapshot with the pending question before the terminal result.
- Passed focused API 79/79, focused Web 43/43, full Web 527/527, `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`. Final whole-branch re-review is Ready with no findings.

### 2026-07-16 - Implement ApplicationArtifact Registry v1

- Added all seven artifact kinds, strict v2 evidence DTOs, canonical identity, persistent Postgres claims, read-only AWS verification, and project-scoped artifact listing.
- Direct preparation reuses a verified artifact without CodeBuild; GitOps registers its already-built artifact and links verified releases while preserving v1 evidence fallback.
- RDS stores identity/metadata only. User artifact bytes stay in the user's ECR/S3 or provider storage; Redis is not a source of truth.
- Review hardening added locale-independent ordering, path normalization, whitespace-preserving build inputs, full identity checks, exact GitOps references, runtime namespace checks, lease heartbeats, and provider-computed S3 digest verification.
- No real credentials, live AWS mutation, Terraform apply/destroy, user deployment, or Git handoff were performed.

### 2026-07-16 - Address PR #438 review feedback

- Added fail-closed runtime build-input validation and normalized repeated key delimiters before secret-shape detection.
- Preferred async streaming over full-body buffering for S3 digest verification and stopped claim heartbeats immediately after renewal failure.
- Verified the four regressions red/green; focused PR 2 tests pass 59/59, and harness, lint, typecheck, and build pass.
- No migration, credential use, live AWS mutation, Terraform apply/destroy, or user deployment was added.

### 2026-07-16 - Follow up merged PR #439 review

- Scoped runtime Secret contract regexes to their Terraform set literals, selected the named worker container, and used `try(..., [])` for nullable Secret lists so unrelated markers cannot satisfy the checks.
- Passed harness, production infrastructure structure check, Terraform formatting, lint, typecheck, build, and diff check. Terraform validate/test remain blocked locally because AWS provider 6.54.0 is not cached; no Terraform or AWS mutation was performed.

### 2026-07-16 - Complete runtime Apply validator repair

- Corrected the jq resource-address escaping used by the complete runtime Apply guard and added a structural regression check for valid and invalid forms.
- Passed harness, production infrastructure structure check, Prettier, lint, typecheck, build, and diff check. Local Terraform validate/test could not initialize the AWS provider before the timeout; no Terraform apply or AWS mutation was performed.

### 2026-07-16 - Complete runtime deployment reconciliation

- Complete runtime Apply validation compares planned API and worker Secret references with Terraform state and verifies that the worker execution policy retains every existing secret reference.
- The API ECS service reconciles task definition changes while retaining autoscaling ownership of desired count.
- Synthetic jq checks passed for retained and intentionally removed Secret references; harness, structure check, formatting, lint, typecheck, build, and diff check passed.

### 2026-07-16 - Complete runtime policy and post-apply verification

- Complete runtime Apply validation reads the existing worker execution inline policy from state when Plan JSON masks prior policy data, then verifies every worker Task Definition Secret reference after Apply.
- Synthetic jq checks passed when prior permissions were retained and failed when a prior permission or Secret reference was removed; no Secret value was emitted.

### 2026-07-17 - Complete runtime post-apply task definition verification

- Plan JSON also masks the desired task definition payload, so the complete Apply guard verifies GitHub App runtime inputs in the applied API and worker task definitions from Terraform state.
- Synthetic jq checks passed with both required inputs and failed when the worker Client ID environment entry was removed.

### 2026-07-17 - Complete runtime partial-apply resume guard

- The first approved Apply partially completed the reviewed runtime plan, then stopped because the deploy role lacked ELB tag readback and task-definition deregistration authorization.
- The deploy-policy source now grants only those two missing actions, and the complete runtime guard accepts either the original full reviewed envelope or the exact residual envelope. No state operation, import, or unreviewed apply was used.
- Harness, production infrastructure structure check, Terraform formatting, lint, typecheck, and build pass. Local Terraform validate/test remain blocked by the uncached AWS provider package.

### 2026-07-17 - Improve Architecture Board UI interactions

- Closed the controlled AI Workbench before competing observation, deployment, right-panel, and auto-organize preview surfaces open.
- Corrected Fit View visual bounds, anchored the auto-organize preview beside the left panel, scaled resource contents with their containers, and removed the empty-board `Resource` guidance while preserving view switching.
- Added a single-template detail preview with image, description, metrics, and tags. Sidebar and full-library selection no longer apply immediately; only the preview confirmation applies the template.
- Focused contract tests, browser smoke checks, lint, typecheck, and build pass. No DB migration, infrastructure mutation, deployment, or Git handoff was performed.

## Broken Or Unverified

- The session-wide `pnpm test` run originally reported three Web failures. The owned AI chat contract failure is fixed and its focused suite passes; two unchanged failures remain in the generated architecture artifact line-ending assertion and GitHub account settings contract. The full suite was not rerun after the focused fix.
- `pnpm test` stops in `@sketchcatch/types` at 40/43 on the same three pre-existing three-tier Template security-scope/position/parent assertions. This branch does not modify those Template sources or failing tests.
- `pnpm --filter @sketchcatch/api test` passes 710/713. The remaining three unchanged filesystem security tests fail during Windows symlink setup with `EPERM`, before their assertions.
- Generated AWS workflows were syntax-checked and provider behavior was exercised with test doubles only. Live AWS acceptance was intentionally not run.

## Next Action

- Monitor the Ready PR targeting `dev`, resolve any actionable review or branch-owned CI failure, and merge only through normal review.

### 2026-07-17 - Merge latest dev into deployment fixes

- Updated local dev to origin/dev at 783d30b7 and merged it into fix/ck/430-deploy-bug-fix.
- Resolved deployment conflicts by retaining dev runtime-convergence and no-change optimization behavior together with live Terraform log streaming, heartbeat progress, state restoration, destroy-plan transitions, and explicit destroy approval labels.
- Kept the dev AI Workbench structure and restored parameter-only before/after previews inside its result artifact.
- Focused web behavior tests passed (58/58 after the Workbench token fix); Terraform runner/live-log tests passed (4/4). API service tests and workspace typecheck could not load new dev dependencies (@aws-sdk/client-ecr, @tanstack/react-query) because the local dependency tree has not been refreshed.

### 2026-07-17 - Repair Direct Deployment result layout

- Restored deployment-history CSS module styles lost during the dev merge and placed step actions directly above the recent-result card.
- Removed the duplicate Destroy confirmation, renamed the approved action to Destroy 실행, and starts Destroy directly from the approved-plan action.
- Removed repeated action hints and joined WEB ENTRY POINT output links to the deployment summary.
- Focused Direct Deployment tests pass 14/14; harness check passes; browser verification confirmed the repaired history and action layout. No Terraform or AWS mutation was performed.

### 2026-07-17 - Restore Agent Review result UI and detail quality

- Restored the prior card-based Review Summary and six-pillar Review Checks presentation, including severity colors and readable problem/action labels.
- Restored Amazon Q review instructions, Terraform evidence payloads, and long-response validation so review content stays concrete and complete.
- Workspace lint and harness checks pass. The focused web build compiled and type-checked before a Windows `spawn EPERM`; API typecheck is blocked only by existing deployment live-log timer typing errors.
- Removed Next Step and Technical Details from Agent Review only; browser verification confirmed the dedicated Workbench now ends after the six review cards.

### 2026-07-17 - Restore Error Analysis content and improve review readability

- Restored the prior Error Analysis title, cause, raw Terraform message, resolution steps, and expandable original-code presentation while retaining the current provider recovery path.
- Increased Agent Review typography across the summary and all six review cards for easier reading.
- Changed both default and Amazon Q review prompts to separate criterion, judgment, and confirmation with line breaks instead of pipe characters.
- Workspace lint passed with one unrelated existing Direct Deployment warning; harness and browser checks confirmed the Agent Review presentation. The current board had no Terraform error, so the Error Analysis result was not visually reproduced.

### 2026-07-17 - Restore Agent Review progress and severity colors

- Restored the four-stage waiting presentation for Terraform analysis, risk checks, mandatory Amazon Q review, and result formatting so the Review tab never appears empty during a request.
- Promoted missing or unverifiable Well-Architected evidence to medium severity and strengthened yellow/red card surfaces while preserving white for normal checks.
- Focused Workbench tests pass 31/31; web lint passes with one unrelated Direct Deployment warning. Chrome confirmed medium cards render yellow on the current localhost review result.

### 2026-07-17 - Normalize Direct Deployment action buttons

- Fixed Direct Deployment action buttons at 152x44 so two actions plus their gap stay within the 320px result rail.
- Kept the action group anchored to a stable start position while centering icon and label content inside each button.
- Idle buttons use a white surface with inherited dark icon color; running actions use filled state colors.
- Focused Direct Deployment tests pass 15/15, and browser-computed layout confirms a 312px two-button footprint inside the 320px rail. No Terraform or AWS mutation was performed.

### 2026-07-17 - Separate Agent Review strengths and required fixes

- Replaced mixed and repeated Review Summary entries with exactly two groups: verified strengths and required fixes.
- Removed directive sentences from strength summaries and paired each prioritized risk with a separate concrete problem and correction line.
- Focused presentation and Workbench tests pass 26/26; web lint passes with one unrelated Direct Deployment warning. Chrome DOM verification confirmed the two groups and separated problem/correction lines.

### 2026-07-17 - Repair Terraform live-log timer typing

- Isolated the heartbeat scheduler behind a Node-only timer adapter so DOM timer overloads cannot widen its handle to `number | Timeout`.
- Captured the injected heartbeat callback through an asserted collection so strict control-flow analysis no longer narrows the test call to `never`.
- API typecheck, focused live-log tests (2/2), API lint, API build, and harness pass. Root typecheck remains blocked by malformed ignored `.next` route types in the local web build cache.

### 2026-07-17 - Address PR #455 review feedback

- Normalized serialized deployment timestamps, tolerated missing AI review and architecture arrays, and ignored Terraform output arriving after live-log completion.
- Added red/green regressions for all six unresolved review threads; focused API tests pass 15/15 and focused Web tests pass 11/11.
- Harness, workspace typecheck, workspace lint, and API build pass. The root build timed out after four minutes while local Next processes remained active; no Terraform or AWS mutation was performed.

### 2026-07-17 - Merge latest dev into PR #455 branch

- Merged `dev` at `5fe4b23f` into `fix/ck/430-deploy-bug-fix` and resolved deployment API and workspace UI conflicts without dropping live Terraform logs, state restoration, release recovery, or rollback behavior.
- Combined the latest apply-result repository contract and execution fences with single-owner Terraform state persistence and approval revocation.
- Workspace typecheck passes, and focused Web deployment tests pass 48/48.
- Focused API deployment tests pass 20 cases with one skipped; apply and plan test files remain blocked before test execution by a missing `@aws-sdk/client-ecr/dist-cjs/runtimeConfig` file in the installed dependency package.
- Workspace lint passes. The production build reaches Next.js but is blocked by another incomplete installed package (`@tanstack/react-query/build/modern/types.js`); focused Web typecheck and lint still pass after the final merge cleanup.

### 2026-07-17 - Restore release-candidate multipart S3 permissions

- Added the missing `ListMultipartUploadParts` and `AbortMultipartUpload` permissions to both production API and trusted worker task policies, with structure checks that require both roles to retain them.
- Multipart completion failures now preserve the S3 operation, object key, provider error name, and HTTP status; the public storage interface and deployment failure-stage contract are unchanged.
- Focused release-candidate tests (3/3), production infrastructure structure checks, Terraform formatting and validation, all workspace lint/typecheck commands, API/shared-package builds, sandbox safety tests (25/25), harness, formatting, and diff checks pass.
- Full API, web, and types suites still expose unrelated `dev` failures caused by missing test environment values/tools, sandbox socket restrictions, and pre-existing contract assertions. The API build passes; the webpack web build compiles but stops on the existing invalid Next Route export in `architecture-draft/route.ts`.
- No Terraform plan/apply, AWS mutation, or deployment was performed. After review and merge, an operator-approved runtime Terraform plan/apply is required before the deployed task roles receive the permissions.
