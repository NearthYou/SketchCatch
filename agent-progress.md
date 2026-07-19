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

### 2026-07-19 - Harden Direct Deployment Apply recovery boundaries

- Bound approved Plans to the exact Terraform state baseline (deployment, object key, lineage hash, and serial) and added migration `0053`; Apply blocks stale state before AWS credentials or mutation.
- Fenced no-change release and post-Apply persistence, preserved partial/cancelled outcomes, added graceful worker cancellation with a 120-second ECS stop timeout, checkpointed state before optional result persistence, and classified release failures as `application_release`.
- Focused Plan/Apply/worker regressions pass 65/65. Migration compatibility, infrastructure structure, Terraform formatting, lint, typecheck, build, harness, and diff checks pass. The full suite was intentionally skipped; no cloud mutation or deployment was performed.

### 2026-07-19 - Document Direct Deployment Apply audit improvements

- Added a Korean implementation plan under `docs/jh/07.19` for five Apply audit findings: Plan/Apply state identity drift, no-change release fencing/outcome handling, ECS worker cancellation, post-Apply evidence persistence, and application release failure-stage classification.
- The plan defines safety invariants, implementation slices, focused regressions, completion criteria, and deployment stop conditions without changing runtime behavior.
- Harness and diff checks pass. No API contract, DB migration, dependency, Terraform execution, AWS mutation, deployment, Git handoff, commit, or push was performed.

### 2026-07-19 - Restore detailed Direct Deployment preparation errors

- Routed foreground deployment action failures through the existing preparation-aware error formatter so save, Terraform preparation, architecture snapshot, and artifact upload failures retain their specific safe guidance.
- Added a caller-level regression that failed against the generic fallback and passed after reconnecting the formatter; focused Direct Deployment checks pass 31/31.
- Harness, lint, typecheck, production build, and diff checks pass. No API contract, DB migration, dependency, AWS mutation, Terraform execution, deployment, commit, or push was performed.

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

- Generic Deploy now opens Direct Deployment for the selected project instead of restoring a previously active CI/CD tab; explicit CI/CD entry still opens CI/CD.
- CI/CD now loads the Board-provenance Repository, monitoring config, and readiness atomically from `ProjectDeliveryProfile`; it never substitutes another active Repository when the current Board has no source provenance.
- Removed the redundant Source Repository card and its stale-freshness helper from Delivery while preserving GitHub permission and readiness gates. Focused Web tests pass 10/10, Delivery Profile API tests pass 4/4, and harness, lint, typecheck, build, and diff checks pass.
- The maintained Web suite remains at 906/910 with four unrelated existing failures: three Resource Catalog contracts and one stale Workspace external-link source assertion. Browser automation reached only the login gate, so the authenticated modal was not visually replayed. No deployment, cloud mutation, DB migration, dependency, lockfile, commit, or push was performed.

### 2026-07-19 - Collapse pre-deployment safety details by default

- Replaced the pre-deployment safety result container with a native `details` disclosure: severity and title stay visible, while the summary, Trivy state, metrics, and findings start collapsed and remain keyboard accessible.
- Added a focused source/style regression for the closed default, semantic summary, focus state, chevron state, and reduced motion; the focused 2/2 check, harness, lint, typecheck, build, and diff checks pass.
- The full maintained test command still fails on the existing artifact heartbeat cancellation plus four existing Web failures (three Resource Catalog contracts and one external-link contract). Browser automation reached only the unauthenticated landing, so the signed-in deployment result was not visually replayed. No deployment, cloud mutation, DB migration, dependency, lockfile, or Git handoff was performed.

### 2026-07-19 - Exclude CodeConnection from AWS connection deletion

- Removed GitHub CodeConnection from the general AWS connection deletion preview, confirmation fingerprint, and remote cleanup input; only the explicit GitHub build disconnect path may delete it.
- A connection with no CodeBuild resources now skips AWS cleanup even when CodeConnection metadata exists, allowing local AWS connection deletion to continue without the reported CodeConnections failure.
- Replaced the misleading AWS Connector Marketplace checkout link with the official direct GitHub App installation and Repository permission URL.
- Focused API tests pass 46/46 and focused Web tests pass 13/13; lint, typecheck, production build, harness, and browser console checks pass. The broader Web suite remains at 904/908 with three unrelated Resource Catalog failures and one existing Workspace external-link contract failure. The direct GitHub App path reaches Repository permission selection without Marketplace billing. No AWS mutation, GitHub App installation, DB migration, deployment, Git handoff, commit, or push was performed.

### 2026-07-19 - Complete the dev deployment and clarify operational guidance

- Approved the exact pending AWS CodeConnection `sketchcatch-ee0c1542-github`, verified the `jh-9999/audience-live-check` checkout, approved a `+36` Terraform Plan, and completed Direct Deployment release `v20260718-163748-496-af663e` in 9m03s. The public CloudFront URL rendered the `Live Check-In` application before cleanup.
- Fixed progress presentation so `preflight`, `application_release`, and `rollback` no longer show misleading Plan/Apply copy. Pending GitHub authorization now identifies the exact generated AWS connection name and `Update pending connection` action.
- The user completed Destroy after the successful verification. The former public URL now returns HTTP 403 and no longer serves the application; exact AWS inventory cleanup could not be independently enumerated because the local AWS CLI has no credentials.
- Focused Web regressions pass 21/21. `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` pass. The full `pnpm test` remains red on unrelated existing suites: three resource-catalog expectations, one Workspace external-link source-pattern test, and one API artifact-registry heartbeat timer cancellation.

### 2026-07-19 - Make CodeBuild preparation concurrency-safe

- Recovered managed CodeBuild `ResourceAlreadyExistsException` races by re-reading ownership and reconciling the project created by the competing request.
- Made preparation start and completion atomic so stale starts and late failures cannot replace a successful `ready` state for the same runtime fingerprint. Moved ECS build preparation plus exact Repository checkout verification behind the Plan API, where concurrent requests for the same Deployment now join one RUNNING Plan sequence.
- Focused API regressions pass 107/107; lint, typecheck, build, harness, and diff checks pass. Production ECS run `29655224723` succeeded from pushed `dev` SHA `3d0c8ee2`; root, API health, and DB health returned HTTP 200. Full tests retain the documented unrelated baseline failures.
- Settings now refreshes CodeConnection from AWS and opens GitHub's installed-app settings for AWS Connector permission recovery; focused tests pass 12/12.

### 2026-07-19 - Recover transient Destroy refresh and remove ECS release revisions

- Traced the reported `/releases` HTTP 500 to a transient non-JSON local Web/API proxy interruption; successful snapshot refresh now clears only errors owned by the recoverable deployment snapshot path.
- Direct ECS rollback now deregisters the exact application-created Task Definition revision after the trusted runtime restore, with account/region/ARN validation and a revision-scoped STS session policy.
- Deregistered the three unused demo revisions (`5`, `7`, and `9`). Exact AWS inventory verification returned `CLEANUP_RESULT remaining=0`; the browser shows `DESTROYED`, 36 resources removed, and zero remaining Resources or Outputs.
- Focused API tests pass 11/11 and the Web regression passes 24/24. Affected ESLint and direct API/Web typechecks pass; final root harness, lint, typecheck, build, and diff checks are recorded by the finishing verification run.
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
