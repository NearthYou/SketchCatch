# Agent Progress

## 2026-07-17 - Repair project resource-inclusive deletion

- Updated project deletion polling to recognize the current completed, unapproved Destroy Plan contract without relying on the retired `missing_approval` block state.
- Preserved the valid recovery path for failed Apply deployments with Terraform state and rejected stale Destroy Plan pointers while planning is still running.
- Kept Direct Deployment actions sequenced as Destroy Plan -> approval -> Destroy, without showing a second Destroy Plan action while approval is pending.
- Project deletion now removes every current object, historical version, and delete marker under the project and linked deployment S3 prefixes before deleting RDS records.
- Internal artifact cleanup is fail-closed: any S3 cleanup failure returns `managed_cleanup_failed`, retains project records, and allows a safe retry.
- Extended the API task IAM policy and production infrastructure check for prefix-scoped `s3:ListBucketVersions` and `s3:DeleteObjectVersion`.
- Aligned project deletion preview eligibility with the Destroy Plan contract: infrastructure cleanup now requires a persisted Terraform state pointer, while application cleanup remains state-independent.
- Added regressions for the missing-state race that previously exposed an impossible resource-inclusive delete action; focused project deletion and Destroy Plan tests pass 23/23.
- Verification passed: focused API tests 18/18, route contract tests 2/2, focused Web tests 37/37, production infrastructure structure check, workspace lint, typecheck, build, and `git diff --check`.
- No real cloud mutation, Terraform apply/destroy, project deletion, DB migration, or Git/CI/CD handoff was performed.

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

- Replaced the incorrect AWS Account presentation mapping and empty text primitives with existing Palette Group areas while preserving the three Terraform Resources, containment, and source geometry.
- Recaptured the committed WebP and bound its manifest hash to the corrected Diagram.
- Kept the existing Compiler visual baseline by excluding visual Security Group scope, summary links, and launch dependencies from main-flow quality.

### 2026-07-18 - Standardize presentation typography

- Added one auditable 6px presentation increment to every explicit and browser-default Web text size, including both inline text sizes, without changing existing base values; preserved one documented shape-only zero-size exception.
- Unified UI and code typography on the bundled Pretendard 1.3.9 family and kept the existing package-backed font loading path.
- Audited every CSS and inline font-family declaration, removed the landing page's duplicate font-face path, and routed the AI page through the shared Pretendard token.
- Added the official version-pinned Pretendard 1.3.9 dynamic-subset stylesheet to the generated standalone S3 audience page, which cannot inherit the Web app token, and aligned its body/title size and title weight with the presentation adjustments.
- Strengthened the typography contract to cover the package version, shared aliases, form-control inheritance, inline styles, and accidental local font-face reintroduction.
- Reduced all 448 explicit text weights above 400 by one 100-point Pretendard step, including browser-default headings and strong text, while preserving regular body weight and font-face metadata.
- Startup harness exposed an oversized progress log; duplicate archived records were removed, and the final harness passes.
- Confirmed local PostgreSQL and Redis are running, focused typography and dependent Web tests pass 135/135, the strengthened typography audit passes 4/4, and root lint/typecheck/build pass.
- No DB schema, migration, cloud mutation, Terraform execution, deployment, or Git/CI/CD handoff was performed.

## Broken Or Unverified

- The session-wide `pnpm test` run originally reported three Web failures. The owned AI chat contract failure is fixed and its focused suite passes; two unchanged failures remain in the generated architecture artifact line-ending assertion and GitHub account settings contract. The full suite was not rerun after the focused fix.
- `pnpm test` stops in `@sketchcatch/types` at 40/43 on the same three pre-existing three-tier Template security-scope/position/parent assertions. This branch does not modify those Template sources or failing tests.
- `pnpm --filter @sketchcatch/api test` passes 710/713. The remaining three unchanged filesystem security tests fail during Windows symlink setup with `EPERM`, before their assertions.
- Generated AWS workflows were syntax-checked and provider behavior was exercised with test doubles only. Live AWS acceptance was intentionally not run.

## Next Action
### 2026-07-18 - Confirm presentation typography on the target display

- Refresh the running local Web app and confirm the 6px increase and Pretendard rendering on the presentation TV; no further code change is pending unless visual acceptance requests one.

### 2026-07-17 - Automate resource-inclusive project deletion

- Replaced the two-step Destroy approval UI with one explicit confirmation that continues through plan, approval, destroy, S3 artifact cleanup, and project deletion.
- Added compact stage and percentage progress for planning, approval, cloud cleanup, and final project cleanup.
- Unified terminal Destroy eligibility so approved FAILED/aws_connection deployments with Terraform state are not rejected between approval and execution.
- Exact route and service regressions pass (55/55 and 7/7); approval and destroy-plan services pass (18/18 and 7/7); focused Web flow tests pass (11/11).
- Workspace lint and typecheck pass. API, types, and UI builds pass; the Web production build compiles successfully, then this Windows sandbox blocks the Next.js child process with spawn EPERM.

### 2026-07-18 - Expand project destroy recovery and AWS connection permissions

- Refreshed the project deletion preview after a successful Terraform Destroy when final SketchCatch cleanup fails, preventing retries from starting a stale Destroy Plan.
- Preserved managed-cleanup causes and logged masked AWS cause metadata for request-correlated diagnosis.
- Expanded generated AWS Connection policies and CloudFormation templates to cover every currently deployable AWS service family and required IAM lifecycle operations.
- Updated the live `chaekang` execution-role inline policy successfully. The other verified DB connection points to a role that no longer exists; pending connections have no role yet and will receive the new template when created.
- Focused Web tests pass 12/12 and focused API tests pass 31/31. Workspace lint and typecheck pass. The root build was stopped at the user's request after running without output for over two minutes.

### 2026-07-18 - Finish resource-inclusive project deletion cleanly

- Made project deletion progress advance gradually within each planning, approval, destroy, and final cleanup stage without showing 100% before completion.
- Changed SketchCatch artifact cleanup to best-effort after managed AWS cleanup, so an internal S3 prefix failure is logged but no longer preserves an otherwise deletable project record.
- Removed the post-success cleanup warning from the project list UI; managed AWS cleanup and database deletion failures remain blocking errors.
- Focused Web flow tests pass 13/13 and focused API deletion tests pass 16/16. Web and API workspace typechecks pass; no full build or broad integration suite was run per user request.

### 2026-07-18 - Prevent stale Terraform outputs from reaching Plan

- Removed generated Terraform output blocks when their managed resources disappear, including legacy output-only artifacts and direct node deletion.
- Upgraded module-wide undeclared resource references to blocking validation errors while preserving valid cross-file references.
- Added a server-side Plan preflight that rejects dangling references before AWS credential preparation or Terraform execution.
- Focused Web regression passes 1/1; focused API regressions pass 3/3; Web and API typechecks pass. Full build and broad suites were intentionally not run per user request.
### 2026-07-17 - Integrate Repository analysis with Workspace Delivery

- Public Repository analysis now creates a Board without GitHub authorization and persists one project-scoped Repository Analysis Record with repository, branch, commit, and selected template provenance.
- Added migration 0050, exact private Repository permission recovery, a read-only Project Delivery Profile, and one Workspace Delivery panel for GitHub, source, target, monitoring, and readiness settings.
- Focused API regressions pass 101/101 and focused Web regressions pass 28/28; harness, lint, typecheck, and production build pass. The Web full suite has one unrelated failure in concurrent deployment target work, and the API full suite was stopped after extended inactivity in existing external-dependency paths. No GitHub, cloud, deployment, or Terraform mutation was performed.

### 2026-07-17 - Centralize the Delivery deployment target editor

- Moved the deployment target client, state, styles, and tests from the compatibility route into one Workspace Delivery feature module and supplied the current Delivery Profile as its initial state.
- Added Repository Analysis Record evidence fallback, Runtime-specific missing-field reporting, saved-value locking, and post-save Delivery Profile/readiness refresh without starting a deployment, PR, or pipeline.
- Focused target, Delivery integration, and return-path regressions pass 31/31. Independent review fixes cover multi-connection selection, Runtime inference, non-fabricated evidence, non-ECS URL entry and summary, confirmed-field locking across Runtime changes, loading-state protection, and component responsibility separation. Workspace lint, typecheck, production build, harness, and diff checks pass.
- The Web full suite has one unchanged failure in `deployment-actions.test.ts` for the existing Destroy approval-state expectation; this work does not modify that module. No DB migration, GitHub mutation, cloud mutation, Terraform execution, deployment, or Git handoff was performed.

### 2026-07-17 - Add GitHub build disconnect

- Added a confirmed settings action that removes only SketchCatch-managed CodeBuild projects, roles, logs, build caches, and the shared CodeConnection while preserving the AWS account connection and deployed resources.
- Disconnect claims the CodeConnection, blocks active and newly starting build/deployment work, and keeps retryable metadata after cleanup failure.
- Review hardening added refresh CAS and cleanup-failure protection, atomic build-preparation and Direct/GitOps lease fencing, generation-safe one-hour stale-claim retry, preserved build history, and an explicit cleanup retry UI.
- Focused API and Web settings tests plus workspace lint, typecheck, production build, harness, and diff checks pass. No DB migration or live AWS cleanup was performed.
### 2026-07-17 - Restore release-candidate multipart S3 permissions

- Added the missing `ListMultipartUploadParts` and `AbortMultipartUpload` permissions to both production API and trusted worker task policies, with structure checks that require both roles to retain them.
- Multipart completion failures now preserve the S3 operation, object key, provider error name, and HTTP status; the public storage interface and deployment failure-stage contract are unchanged.
- Focused release-candidate tests (3/3), production infrastructure structure checks, Terraform formatting and validation, all workspace lint/typecheck commands, API/shared-package builds, sandbox safety tests (25/25), harness, formatting, and diff checks pass.
- Full API, web, and types suites still expose unrelated `dev` failures caused by missing test environment values/tools, sandbox socket restrictions, and pre-existing contract assertions. The API build passes; the webpack web build compiles but stops on the existing invalid Next Route export in `architecture-draft/route.ts`.
- No Terraform plan/apply, AWS mutation, or deployment was performed. After review and merge, an operator-approved runtime Terraform plan/apply is required before the deployed task roles receive the permissions.

### 2026-07-17 - Unify workspace observation and deployment controls

- Restored Live Observation in both expanded and collapsed right-panel layouts as an accessible icon-only control.
- Converted the project-bar Deployment action to the shared icon-button treatment and kept its black active state scoped only to the open Deployment console.
- Focused workspace tests pass 17/17; Web lint and typecheck pass; root lint, typecheck, and build pass. The full test run stops on the unrelated existing `git-cicd-readiness-contract` `null !== 0` failure in `packages/types`.
- Chrome visual automation was unavailable, so final signed-in visual confirmation remains manual. No Deployment, Terraform, AWS, or database mutation was performed.

### 2026-07-17 - Stabilize workspace overlay notifications

- Prevented callback identity changes from triggering overlay cleanup notifications during rerenders; reset notifications now run only on unmount and target the latest callbacks.
- Added a call-recording regression for callback replacement and cleanup behavior.
- Focused workspace tests pass 20/20; Web lint and typecheck pass.

### 2026-07-17 - Merge issue #448 work with current dev

- Merged `origin/dev` through `f2f0c8ff` and resolved Workspace, Diagram, AI start, ProjectDraft, and GitHub settings conflicts without dropping either branch's behavior.
- Updated the cached GitHub settings contract and restored the Destroy Plan approval/retry boundary using `failedAt`.
- Focused Module/Template regressions and full Web tests pass; harness, knowledge check, lint, typecheck, and build pass. Local full API tests remain environment-blocked by missing `DATABASE_URL` and `zstd`; affected API files match `origin/dev`.

### 2026-07-17 - Refocus the repository README

- Reworked the README around the problem, approval flow, and boundary between AI suggestions, deterministic validation, and user-authorized cloud mutation.
- Kept the AWS/Terraform-first MVP and provider-neutral product direction explicit while removing repeated implementation detail.
- Verified every relative README link and ran `pnpm harness:check` successfully. This was documentation-only, so runtime builds and product tests were not rerun.

### 2026-07-17 - Preserve dirty local ProjectDraft recovery

- Preserved dirty IndexedDB drafts during Workspace reload regardless of client/server clock skew and added an explicit choice between restoring one and replacing it with the latest server draft.
- Blocked manual, checkpoint, and page-exit server saves until recovery is decided; server replacement now updates IndexedDB only after explicit selection.
- Fixed the ProjectDraft save service CI type error by narrowing conditional updates to the observed non-null server revision; API typecheck and focused API tests pass 32/32.
- Focused ProjectDraft Web tests pass 37/37. Changed-file lint and direct API/Web typechecks pass. The local full Turbo wrapper could not start API/Web tasks because pnpm refused to purge copied temporary-worktree `node_modules` without a TTY. The Webpack build compiled, then the generated Next route check failed on pre-existing helper exports in architecture-draft and architecture-patch-preview routes. No DB migration, cloud mutation, deployment, or Git handoff was performed.

### 2026-07-17 - Harden Terraform module validation and palette audit

- Prevented duplicate module-level `required_providers`, retained per-file syntax boundaries, and made final merged deployment artifacts pass validation before persistence.
- Provider refresh now merges missing requirements while preserving user-owned default and aliased provider blocks; SketchCatch-managed EKS runtime provider blocks remain refreshable.
- Provider-schema validation passes all 155 enabled managed resources and all 5 enabled data sources. Direct Deployment safety remains unchanged: 61 resource types are plan-allowed and 94 stay blocked by the existing allowlist.
- Focused regressions pass (API 28/28, Web 23/23, Types 5/5). `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass on the latest merged `dev`.
- No Terraform apply/destroy, AWS mutation, credential access, or DB migration was performed for this work.

### 2026-07-18 - Merge current dev into Delivery integration

- Preserved public Repository analysis without GitHub, ProjectDraft revision fencing, Workspace Delivery ownership, exact private Repository recovery, and confirmed GitHub build cleanup while merging `origin/dev` through `04dc1c8f`.
- Kept dev migration 0049 and renumbered Repository Analysis Record migration to 0050 with the journal and migration contract updated.
- Focused API tests pass 49/49 and Web tests pass 50/50; lint, typecheck, build, harness, and diff checks pass. No live GitHub, AWS, deployment, or Terraform mutation was performed.

### 2026-07-18 - Integrate Delivery into the CI/CD deployment modal

- Moved the complete project Delivery workflow into the existing deployment modal's CI/CD tab and removed the duplicate Workspace right-panel entry and summary-only handoff.
- Added a responsive, token-aligned connection, pipeline configuration, readiness, and execution layout; legacy Delivery bookmarks now open the CI/CD modal directly.
- Focused Delivery tests pass 34/34; Impeccable detection, browser desktop/mobile checks, harness, lint, typecheck, build, and diff checks pass. No deployment, Git handoff, cloud mutation, or DB migration was performed.

### 2026-07-18 - Accept the safe pre-cache CodeBuild boundary

- Build-environment verification now accepts the exact legacy logs and CodeConnections permissions boundary used before optional ECR build caching, while continuing to reject all other boundary drift.
- The focused gateway suite passes 17/17; formatting, API lint/typecheck, root lint/typecheck/build, harness, and diff checks pass. Live dev verification and Terraform Plan completed successfully and stopped before Apply.
- No Terraform Apply, deployment, Git commit, push, or DB migration was performed. Existing environments can use the cold Docker-build fallback; the next action is user approval only if Apply is intended.

### 2026-07-18 - Align deployment safety documentation with current enforcement

- Clarified that deterministic High findings are recorded and shown before approval, while severity-only Plan approval blocking remains planned; the separate approval/apply boundary still prevents unapproved execution.
- Updated the root README, glossary, and ADR without changing the already-accurate canonical deployment policy or the active Architecture Board Compiler feature ownership.
- The safety-gate suite passes 8/8. Safety-gate plus deployment-plan suites pass 28/28 with the non-secret test setting `S3_BUCKET_NAME=test-project-assets`; the initial no-env run stopped 19 plan tests during setup.
- Harness and diff checks pass. No source, dependency, lockfile, migration, cloud mutation, deployment, or Git handoff changed; next action is documentation review and PR.

### 2026-07-18 - Merge latest dev into project deletion branch

- Merged `origin/dev` at `0f674b7d` into `fix/ck/457-project-delete-bug`.
- Preserved dev provider refresh, analysis-excluded deployment guards, Destroy retry behavior, and multipart IAM checks together with stale Terraform output cleanup and undeclared-reference Plan preflight.
- Focused API tests pass 5/5 and focused Web tests pass 4/4; API and Web typechecks, production infrastructure structure check, harness, and diff checks pass. Full build and broad suites were intentionally not run per user request.

### 2026-07-18 - Stabilize deployment connection and validation state contracts

- Made the AWS connection list API always return its canonical response envelope and added a rolling-deploy-compatible Web parser that never exposes an undefined connection list.
- Reset stale pre-deployment analysis and fingerprints whenever a new validation starts or fails, preventing an old Terraform diagnostic from being shown beside a newer request error.
- Added regressions for the route envelope, legacy/malformed client responses, stale validation state, and dangling Terraform outputs returning blocking diagnostics instead of HTTP 500.
- Focused API tests pass 3/3 and focused Web tests pass 2/2; API and Web typechecks, browser reload, console-error check, harness, and diff checks pass. Full build and broad suites were intentionally not run per user request. No AWS, Terraform, deployment, database, or Git mutation was performed.

### 2026-07-18 - Reorder approved Plan actions

- Reordered the approved Plan actions so `배포 실행` appears before `Plan 승인 취소` without changing either action's behavior, styling, or state gates.
- The focused action-order regression passes 2/2. Browser access was healthy, but the signed-in account had no remaining projects, so the approved-Plan visual state could not be rendered without creating project state.

### 2026-07-18 - Address PR #476 S3 prefix review

- Restricted project and deployment artifact deletion prefixes to the explicit identifier character set before issuing any S3 list or delete command.
- Added regressions for traversal-like, whitespace, dotted, and encoded-separator prefixes; the focused storage suite passes 4/4.
- API typecheck and harness pass. API lint passes with one unrelated existing unused-import warning in `project-deletion-service.test.ts`. No AWS, Terraform, deployment, project deletion, or database mutation was performed.
