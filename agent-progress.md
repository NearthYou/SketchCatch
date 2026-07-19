# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/` and remain available in Git history.

## Current Verified State

- `fix/ck/494-parameter-bug-fix` includes the latest `origin/dev` merge and the Repository/Fixed Template corrections prepared for the next `dev` merge.
- Repository board creation now saves the selected Fixed Template directly, without Amazon Q/OpenAI validation or clarification; Repository analysis provenance is still persisted.
- Built-in Template references, ECS layout/presentation, Template Terraform safety, NAT/Security Group dependencies, and focused Repository behavior tests pass.
- Scoped Types/API/Web lint, typecheck, and production builds pass. No DB migration, dependency change, Terraform Apply/Destroy, AWS mutation, or production deployment was performed.

## Session Record

### 2026-07-19 - Use Fixed Templates directly for Repository boards

- Removed the Amazon Q Architecture Draft and conflict-clarification path from public and connected Repository board creation; the selected Fixed Template is now saved directly while Repository analysis provenance remains recorded.
- Completed explicit NAT Gateway drafts with the referenced Elastic IP and made strict Repository validation exempt only Template-owned nodes.
- Updated the ECS autoscaling Template layout, routing, presentation parents, and semantic hash contracts.
- Focused verification passed: Repository 9/9, Template contracts 22/22, Template Terraform safety 2/2, Fixed Template/Repository API 6/6, NAT dependency 1/1, scoped lint/typecheck/build for Types/API/Web, harness, and diff checks.
- No broad unrelated test suite, DB migration, dependency change, cloud mutation, deployment, push, or PR was performed.

### 2026-07-19 - Separate Repository access and Architecture Draft failures

- Replaced the inferred public Repository error branch with explicit `repository_error` and `architecture_error` states so a Draft failure cannot render Repository recovery or trigger permission rechecks.
- Repository board generation no longer surfaces provider clarification questions; it keeps the selected Template context and reports one retryable generation failure instead.
- Added Repository route tests to the default Web test command so the regression runs in normal package verification.
- Focused Repository checks pass 15/15. Harness, lint, typecheck, and production build pass.
- The broad Web suite runs the new checks successfully but retains three unrelated existing Resource/Module knowledge and Workspace AI CSS contract failures.
- No API contract, dependency, lockfile, DB migration, cloud mutation, deployment, commit, or push was performed.

### 2026-07-19 - Address PR #485 review findings

- Fixed the chat suggestion selection fallback and guarded clarification response shape checks before using the in operator.
- Focused Web tests pass 7/7; harness, lint, typecheck, build, and diff checks pass.
- No database migration, cloud mutation, deployment, or dependency change was made.


### 2026-07-19 - Isolate the desktop AI Orbit from the conversation

- Rendered all three desktop Orbit layers as circles and constrained the decorative canvas to the space right of the active conversation panel.
- Preserved the existing mobile ellipse geometry, Orbit motion and convergence, and final Preview behavior.
- The 43 Workspace AI checks, root lint/typecheck/build, harness, and diff checks pass. Browser measurements at 1024x768 and 1440x900 show circular rings outside the conversation boundary; 390x844 retains the existing mobile scales with no console warnings or errors.
- The broader `pnpm test` remains red outside this change: API application integration checks cannot start in the isolated environment, and the existing Resource Catalog contracts fail three assertions before later Web tests are cancelled. None of those failing files changed here.

### 2026-07-19 - Separate AWS OAuth status from Repository verification

- Changed an `AVAILABLE` AWS CodeConnection from a permanent Repository warning to a connected success state that explains project save/validation performs the actual checkout verification.
- Preserved AWS Connector permission management, status refresh, and disconnect actions while renaming the presentation helper so it no longer models project Repository access.
- TDD focused checks pass 14/14; harness, lint, typecheck, build, and diff checks pass. The Web suite remains at the existing 914/917 because of three unrelated Resource Catalog contract failures; the root suite additionally retains the existing artifact heartbeat cancellation. Independent standards/spec review reported no findings.
- No API, shared contract, DB migration, dependency, AWS mutation, Terraform execution, deployment, or push was performed.

### 2026-07-19 - Keep GitOps build environments stable across application commits

- Removed the per-release `confirmedCommitSha` from the reusable Project Build Environment fingerprint while retaining exact commit checkout and resolved-SHA verification.
- GitOps release verification now accepts legacy commit-scoped fingerprints only after the explicit stored CodeBuild identity checks and live AWS contract verification remain in place.
- TDD regressions passed 2/2 after reproducing both failures; the focused release/build-environment suite passes 41/41. Harness, lint, typecheck, build, and diff checks pass. A scoped sub-agent review reported no Critical, Important, or Minor findings.
- The first full build retry encountered the earlier parallel Next.js build lock; the existing process completed and the subsequent single build exited successfully. No deployment rerun, AWS mutation, DB migration ownership, dependency, lockfile, commit, or push was performed.

### 2026-07-19 - Make Direct Deployment preparation and UI transitions race-safe

- Made identical saved-snapshot prepare requests reuse one active unapproved Deployment with migration `0052`; the key includes the target fingerprint, and Destroy Plan records are explicitly excluded from reuse.
- Separated foreground action failures from background snapshot/detail refresh, prevented polling from clearing action errors or selecting a later phase, and kept save, Pre-Deployment Check, and Plan behind one action up to explicit approval.
- Focused API route checks pass 69/69, focused Web checks pass 53/53, and CodeBuild race checks pass 40/40. Harness, migration compatibility, lint, typecheck, production build, and diff checks pass. The broad Web suite had 912/917 before two stale source-contract tests were fixed; the three remaining failures are unrelated Resource Catalog contracts. No AWS mutation, Terraform Apply/Destroy, or production deployment was performed.

### 2026-07-19 - Use the current Board source automatically for Deployment

- Resolved Web conflicts with the current branch as the design authority and `dev` as the API/backend authority.
- Preserved both sides where compatible, including the new Board auto-organize comparison state, deployment history structure, AI Orbit behavior, and current branch typography and compact result presentation.
- Retained the imported `dev` API and migration changes without editing their implementation.
- Verification passed: focused auto-organize and deployment regressions 25/25, the broader focused merge set 91/92 before its single stale typography assertion was corrected, Pretendard typography audit 4/4, harness, lint, typecheck, production build, and diff check.

### 2026-07-19 - Self-host the supplied Pretendard variable font

- Replaced the package-backed Pretendard dynamic subset with the supplied Pretendard 1.3.9 variable WOFF2 and bundled its license.
- Authenticated browser QA previously covered 26 public and signed-in views; all 7,153 visible HTML elements resolved to `Pretendard, sans-serif` with zero exceptions.
- Focused typography audit, runtime font response, lint, typecheck, production build, and diff checks previously passed.

### 2026-07-19 - Preserve current Board deployment provenance

- Generic Deploy opens Direct Deployment for the selected project, while explicit CI/CD entry remains separate.
- CI/CD uses Board-provenance Repository, monitoring, and readiness data without substituting an unrelated active Repository.
- The redundant Delivery source card was removed while permission and readiness gates remain intact.

### 2026-07-19 - Preserve deployment and AWS connection safety changes

- Pre-deployment safety details start collapsed and remain keyboard accessible.
- General AWS connection deletion excludes GitHub CodeConnection; the dedicated GitHub build disconnect remains its only deletion path.
- Reverse Engineering scan history remains preserved when an AWS connection is deleted through the imported `dev` migration and API changes.

### 2026-07-18 - Preserve current branch presentation adjustments

- Live Observation guidance keeps its original wording and width while using the requested smaller text size.
- AI Workbench desktop navigation remains icon-only with mode-specific titles.
- Automatic organization results remain minimal and omit change summaries, review lists, and technical details.

## Broken Or Unverified

- No check related to Repository Fixed Template selection or Template deployment generation is failing.
- Broad unrelated test suites were intentionally not run at the user's request.
- A deployed `dev` smoke test has not been performed in this session; no cloud or production mutation was authorized.

## Next Action

- Merge the verified branch into `dev` through the normal review path and deploy it.
- After deployment, smoke-test Repository analysis by selecting a Fixed Template and confirming the Board opens without any clarification step.

### 2026-07-19 - Tighten Workspace AI conversation spacing

- Expanded the desktop transcript, suggestion, composer, and composer metadata widths so the conversation panel uses its available space consistently.
- Let the selected-option trail extend to an 18px right inset, and size its heading column to its content instead of reserving a wide empty column. The existing mobile layout remains unchanged.
- Browser checks pass at 390×844, 1024×768, 1440×900, and 1920×900 with no horizontal overflow or console errors. Workspace AI tests pass 43/43; harness, lint, typecheck, build, and diff checks pass.

### 2026-07-19 - Distinguish daily traffic from concurrent users

- Traffic clarification matching now interprets daily visitors and concurrent users as separate dimensions before numeric option matching.
- `일일 500명` maps to the medium option while `동시 접속자 500명` remains large; `스프링부트 썼어` reuses the existing complex business logic option instead of creating a custom option.
- Focused Web/API regressions and the harness are recorded by the finishing verification run. No database migration, deployment, cloud mutation, or push was performed.

### 2026-07-19 - Advance AI diagram generation progress sooner

- Reduced the staged diagram-generation interval from 3 seconds to 1.5 seconds and added a final draft preparation stage.
- The first visible transition now occurs after 1.5 seconds, and the progress card continues through five stages while the AI response is pending.
- The focused Web status regression and harness are recorded by the finishing verification run. No database migration, deployment, cloud mutation, or push was performed.

### 2026-07-19 - Remove the selected text from AI Start choices

- Removed the visible `선택됨` suffix from selected `/workspace/ai` answer buttons while retaining `aria-pressed` and selected-button styling.
- Removed the unused label style and added a source regression for the route-specific transcript.
- The focused Web regression and harness are recorded by the finishing verification run. No database migration, deployment, cloud mutation, or push was performed.

### 2026-07-19 - Keep AI Start progress moving across card remounts

- Moved `/workspace/ai` diagram-generation step ownership from the conditional progress card into the persistent conversation transcript.
- The card now receives a controlled step, so rerenders or remounts cannot reset the visible progress to requirement analysis; the shared Workspace dock retains its local fallback timer.
- The focused Web regression and harness are recorded by the finishing verification run. No database migration, deployment, cloud mutation, or push was performed.

### 2026-07-19 - Ask Amazon Q to resolve unsatisfied architecture requirements

- Replaced the terminal requirements-unsatisfied 422 path with a dedicated Amazon Q conflict-diagnosis request after generation and repair both fail validation.
- Amazon Q receives the original requirement, accepted answers, decision space, normalized requirement, and exact validation issues; its question and preserve-versus-relax choices are returned unchanged through the existing clarification flow.
- The focused API regression and API typecheck pass. No database migration, deployment, cloud mutation, or push was performed.

### 2026-07-19 - Route conflict diagnosis through the real Amazon Q provider

- Fixed the production Amazon Q Business provider, which previously ignored the conflict prompt and always returned another locally generated canonical plan, causing the replacement HTTP 502.
- Conflict requests now call Amazon Q Business ChatSync with the exact validation failures and user requirement. JSON and plain-text/numbered Q answers both become the existing clarification question and choices without server-side trade-off selection.
- Workspace AI draft failures now keep full diagnostics in the browser console and show one short transcript message instead of duplicated developer diagnostics.
- Focused API provider/parser and Web presentation regressions pass; API/Web typechecks pass. No database migration, deployment, cloud mutation, or push was performed.

### 2026-07-19 - Classify natural-language technology stack answers

- Added one shared frontend/backend technology-stack classifier used by API answer validation, canonical prompt context, architecture profiles, and Web selection presentation.
- React/Vue/Svelte-style SPA stacks, Next/Nuxt/Remix-style SSR stacks, Flutter/React Native mobile stacks, simple API frameworks, complex backend frameworks, and microservice stacks now reuse their existing answer option instead of creating a custom choice.
- Database product names do not infer data volume because the technology alone does not answer that question.
- Three shared classifier regressions, focused API/Web integrations, cross-package typechecks, and the harness pass. No database migration, deployment, cloud mutation, or push was performed.

### 2026-07-19 - Reconcile durable Plan acceptance after an HTTP response failure

- Shaped the Plan API's accepted Deployment response before creating or dispatching durable worker work, so response serialization failures cannot leave an unacknowledged worker running.
- Reconciled a validation request error only when polling observes the exact pending Deployment still running or carrying its Plan artifact; unrelated foreground failures remain visible.
- Focused API checks pass 70/70 and focused Web checks pass 52/52. Root lint, typecheck, and production build pass; the final harness and diff checks are recorded by the finishing verification run.
- No DB migration, dependency change, AWS mutation, Terraform Apply/Destroy, deployment, or direct push to `dev` was performed.

### 2026-07-19 - Move Plan build preparation behind durable worker acceptance

- Traced the reported Plan HTTP 500 to Next.js development proxy's 30-second timeout: the API spent about 34 seconds preparing CodeBuild and verifying Repository access before it created the durable worker job.
- The Plan route now returns its accepted Deployment after durable dispatch, while the worker runs build-environment preparation inside the Plan execution lease and heartbeat boundary. Preparation failures remain recorded as `build_environment` failures.
- The reported Deployment `eae903e0-926c-46d7-b819-99b124246373` completed despite the proxy error and produced a pending `36 create / 0 update / 0 delete` Plan with no failure stage or error summary.
- Focused API regressions pass 106/106; root lint, typecheck, build, final harness, and diff checks are recorded by the finishing verification run. No DB migration, dependency change, AWS mutation by Codex, Terraform Apply/Destroy, deployment rerun, or direct push to `dev` was performed.

### 2026-07-19 - Advance approved Plans and refresh durable build readiness

- Fixed Direct Deployment so a successful Plan approval selects the deployment step instead of leaving the user on the disabled approval panel.
- Added Project Build Environment hydration to durable Plan polling, preventing an early HTTP 202 response from leaving `ready + verified` infrastructure displayed as `준비 필요`.
- The reported Deployment `8eb279cb-cea8-417f-88af-d31cd21926d0` is pending with matching current/approved Plan artifacts; its build environment is `ready + verified`. The live browser now shows step 3, `Repository 검증 완료`, and the deployment action without console errors.
- TDD regressions passed RED then GREEN; focused Web checks pass 56/56. Root lint, typecheck, build, final harness, and diff checks are recorded by the finishing verification run. No deployment execution, approval revocation, AWS mutation, DB migration, dependency change, or direct push to `dev` was performed.


### 2026-07-19 - Restore Direct Deployment validation recovery

- Confirmed the GitHub App installation already grants `jh-9999/audience-live-check` access, the managed Seoul CodeConnection is `Available`, and the managed CodeBuild project checked out the confirmed SHA successfully twice. The Workspace was showing an older failed verification record rather than a disconnected global integration.
- Fixed Direct Deployment step selection so a previously selected idle deployment step falls back to the current validation step. The failed Workspace now exposes both `저장 후 검증 실행` and `Repository 빌드 권한 다시 확인` instead of an empty action area.
- The regression passed RED then GREEN and the authenticated browser reproduced the repaired action path. Focused Web checks pass 26/26; root harness, lint, typecheck, production build, and diff checks pass. No GitHub save, CodeConnection reapproval, CodeBuild start, deployment, AWS mutation, DB migration, dependency change, or push was performed.

### 2026-07-19 - Complete AI diagram parameters from requirements

- Completed VPC dependencies, core defaults, SSM data-source defaults, and requirement-sensitive profiles across traffic, budget, database, management, availability, upload, and realtime selections.
- Normalized generated nested-block objects recursively against the Terraform catalog, so required CloudFront origin, cache behavior, restrictions, certificate, and geo restriction blocks no longer render empty or fail list validation.
- Focused API parameter checks pass 14/14, Web adapter/parameter checks pass 49/49, and root lint, typecheck, build, harness, and diff checks pass. The unrelated concurrent conflict-resolution failures remain documented in history.
- No DB migration, dependency change, cloud mutation, Terraform execution, deployment, or Git/CI/CD handoff was performed.

### 2026-07-19 - Use OpenAI for Architecture Draft validation-conflict choices

- Replaced the post-retry Architecture Draft conflict diagnosis call from Amazon Q Business with an OpenAI Responses Structured Output resolver. The resolver receives the original request, selected Template, normalized requirement, Repository evidence, decision space, validation issues, and the final failed ArchitectureJson when available.
- Only a `needs_clarification` question with 2-4 choices is accepted from OpenAI. Missing keys, malformed output, or provider failures use a local validation-conflict clarification and never reinterpret an Amazon Q retrieval miss as a user question.
- Added a focused regression proving Amazon Q is called only for the original draft and repair attempts, while the repeated validation failure is sent to the OpenAI resolver and returned with OpenAI metadata. API typecheck and harness pass; the focused regression passed before a later host `spawn EPERM` retry. The full draft suite remains 92/103 because 11 concurrent uncommitted validation/operating-condition regressions fail outside this change. Root lint and typecheck pass; root build exceeded the 59-second command ceiling twice without a completion result. Scoped diff check passes, while the repository-wide diff check is blocked by an unrelated blank line in docs/agent-history/2026-07.md.
- No DB migration, dependency change, cloud mutation, Terraform execution, deployment, commit, or push was performed.
### 2026-07-19 - Prefer fixed Template resources during strict Repository validation

- Exempted resources owned by the selected fixed Template from strict Repository inferred-resource rejection and preserved the Template's original scaling relationships.
- Chrome reproduction now creates the Board successfully with the ECS scaling target and policy present; browser console warnings/errors are empty.
- Focused regression, lint, typecheck, build, harness, and diff checks pass. Full tests still stop on three unrelated shared-contract failures; the broader Architecture Draft file has nine pre-existing non-template failures.
