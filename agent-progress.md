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

## Broken Or Unverified

- The session-wide `pnpm test` run originally reported three Web failures. The owned AI chat contract failure is fixed and its focused suite passes; two unchanged failures remain in the generated architecture artifact line-ending assertion and GitHub account settings contract. The full suite was not rerun after the focused fix.
- `pnpm test` stops in `@sketchcatch/types` at 40/43 on the same three pre-existing three-tier Template security-scope/position/parent assertions. This branch does not modify those Template sources or failing tests.
- `pnpm --filter @sketchcatch/api test` passes 710/713. The remaining three unchanged filesystem security tests fail during Windows symlink setup with `EPERM`, before their assertions.
- Generated AWS workflows were syntax-checked and provider behavior was exercised with test doubles only. Live AWS acceptance was intentionally not run.

## Next Action
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

### 2026-07-18 - Restore Workspace AI and integration setup

- Moved deterministic Architecture Draft clarification ahead of the Amazon Q availability gate, kept clarification provenance rule-based, blocked warm-up before credit approval, and gave Q Business its supported default region.
- Split GitHub installation read capability from new-connection setup capability, preserving existing installations during partial configuration while blocking unavailable OAuth starts across Settings, Repository, and CI/CD consumers.
- Verified the running local stack directly: the AI stream returns four clarification options, a complete real Amazon Q request returns an `amazon_q_business` Preview, GitHub Settings returns explicit non-error availability, and the AWS connection setup reached its CloudFormation handoff without applying it. Postgres and Redis remain healthy; no cloud mutation, deployment, or Terraform apply/destroy was performed.
- Focused regressions pass 93/93 API and 155/155 Web; `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm harness:check`, and `git diff --check` pass. The broader existing suite still has unrelated schema/zstd/repository and resource-catalog failures (API 4 failures with 2 cancelled; Web 3 failures).

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

### 2026-07-18 - Address PR #476 S3 prefix review

- Restricted project and deployment artifact deletion prefixes to the explicit identifier character set before issuing any S3 list or delete command.
- Added regressions for traversal-like, whitespace, dotted, and encoded-separator prefixes; the focused storage suite passes 4/4.
- API typecheck and harness pass. API lint passes with one unrelated existing unused-import warning in `project-deletion-service.test.ts`. No AWS, Terraform, deployment, project deletion, or database mutation was performed.
### 2026-07-18 - Validate and display every natural-language clarification answer

- Removed the keyword-only clarification bypass and applied question-specific validation to all 15 required Architecture Draft questions; explanation requests and unrelated answers now repeat the same question.
- Preserved the originating assistant question in both Workspace chat surfaces so accepted free-form answers select the matching existing option or add a disabled selected custom option.
- Focused API regressions pass 5/5, focused Web clarification tests pass 6/6, and paired chat selection/locking contracts pass 21/21; direct API and Web typechecks pass. Full suites and builds were intentionally not run per user request. No DB migration, cloud mutation, deployment, Terraform execution, or Git handoff was performed.
### 2026-07-18 - Probe natural-language architecture changes

- Added five new clarification examples and five real diagram patch examples outside the existing cases.
- Website type and traffic answers already passed; database storage, country-level region, and conversational photo-upload answers were expanded and now pass.
- EC2 sizing, RDS removal, S3 addition, EC2-to-Lambda replacement, and connected CloudFront addition all produce the requested Preview graph.
- Added complete Korean natural-language names and generated variants for every supported resource type, plus common service aliases and abbreviations. The exact `로드 밸런서 넣어줘` request now adds and connects a load balancer when there is one unambiguous compute target.
- Focused clarification regressions pass 6/6, patch regressions pass 3/3, complete alias coverage passes 2/2, and API typecheck passes.

### 2026-07-18 - Reject cross-question clarification answers

- Replaced digit-only and generic-word clarification acceptance with question-specific semantic evidence for traffic, budget, SSL, management, loading time, website size, traffic pattern, and downtime.
- `스프링부트 썼어` is accepted for the backend question but rejected for website size and traffic pattern; rejected answers now explain that they are unrelated before repeating the same question in both chat surfaces.
- Both diagram-generation chats now show a dedicated `반영된 답변` row with the accepted natural-language text while keeping every option for that answered question disabled.
- Cross-question coverage passes for all 15 required questions, four focused API regressions pass, focused Web feedback/selection checks pass, and API/Web typechecks pass. Full suites and builds were not run per user request.

### 2026-07-18 - Pin reported cross-question clarification regressions

- Reproduced the exact reported answers against the running Web-to-API path: `frontend` with a daily-user-count answer and `region` with a Spring Boot answer both repeat the same question.
- Confirmed that both live responses include the unrelated-answer validation message; the screenshots predate the committed validation and chat-state fixes.
- Added both exact user phrases to the all-question regression and ran only that focused test (1/1 pass), per the requested limited verification scope.
- No DB migration, cloud mutation, deployment, Terraform execution, or Git handoff was performed.

### 2026-07-19 - Refine diagram generation feedback and monthly budget parsing

- Both diagram-generation chats now hide generic generation progress during clarification and show the shared staged progress card only after the server starts final draft generation.
- Removed standalone accepted-answer receipt messages while retaining the disabled selected option or selected custom option on the answered question.
- Budget clarification accepts conversational monthly amounts such as `한달에 한 30정도로`, forwards the interpretation as monthly KRW ten-thousands, and maps 30 to the normal budget profile while excluding time, traffic, size, and percentage units.
- Focused Web progress/selection tests pass 11/11 and the final focused monthly-budget regressions pass 2/2; the all-question cross-category regression also passed earlier. API/Web typechecks passed before the final parser iteration. CSS parsing passes and Next.js compiled successfully; the sandbox stopped the build after compilation with `spawn EPERM`.
- Equivalent Diagram prop replacements no longer advance the Board revision, preventing a fresh AI proposal from being falsely marked stale while preserving real fingerprint/revision invalidation.
- Board approval content now stacks above its actions so the explanation remains readable in the narrow AI Workbench.
- The focused stale/layout regressions pass 75/75; Web typecheck, CSS formatting, and diff checks pass.
- No DB migration, cloud mutation, deployment, Terraform execution, or Git handoff was performed.
