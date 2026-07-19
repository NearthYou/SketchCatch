# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/` and remain available in Git history.

## Current Verified State

- The current branch applies the supplied self-hosted LINE Seed Sans KR files across Web typography surfaces, with Regular as the body baseline and Bold for headings and emphasis.
- Board resource labels use a compact 12px computed size so long names fit more clearly within the existing two-line boundary.
- Idle AI Workbench readiness banners are hidden while actionable statuses remain, and the compact auto-organize preview no longer exposes a view toggle.
- The automatic Board organization result remains compact while preserving the incoming `dev` comparison session and original/organized view selection.
- Incoming `dev` API, deployment, Git/CI/CD, AWS connection, Reverse Engineering, and data-contract changes remain accepted as the backend baseline.
- The merge resolution is complete and ready for the merge commit.

## Session Record

### 2026-07-19 - Merge dev while preserving dashboard typography

- Resolved the dashboard CSS conflict by keeping the incoming AWS OAuth `Ready` state and the branch's LINE Seed presentation tokens.
- Normalized the incoming AI Workbench choice labels to the same typography contract. Focused checks pass 18/18; lint, typecheck, build, harness, and diff checks pass.

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
