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

### 2026-07-18 - Merge current origin/dev into local dev

- Merged the 10 incoming `origin/dev` commits into the 2 local `dev` commits without rewriting either history.
- Resolved the only conflict in `agent-progress.md` by retaining both current work records and keeping previously archived records in `docs/agent-history/2026-07.md`.
- Focused API tests pass 99/99 and focused Web tests pass 44/44; lint, typecheck, build, harness, and diff checks pass. Lint retains one unrelated existing unused-import warning.

### 2026-07-18 - Surface CodeConnections repository authorization failures

- Mapped CodeBuild `OAuthProviderException` failures during project reconciliation and checkout verification to the safe 409 `CODECONNECTION_REPOSITORY_ACCESS_REQUIRED` contract instead of leaking the upstream invalid-token message as a 502.
- Persisted failed repository-verification evidence and changed the AWS connection Settings presentation so `AVAILABLE` means OAuth connected but repository access remains unverified, with a direct AWS Connector installation/permission action.
- Focused API tests pass 20/20 and focused Web tests pass 22/22; lint, typecheck, build, and diff checks pass. Lint retains one unrelated existing unused-import warning in `project-deletion-service.test.ts`.
- The broad test run still contains unrelated failures in existing artifact, project deletion, and Workspace navigation suites. No AWS mutation, Terraform execution, DB migration, deployment, Git handoff, commit, or push was performed.

### 2026-07-18 - Repair self-managed AI Draft generation

- Resolved the contradiction where the final self-managed server choice required EC2 while the Amazon Q plan still forbade the EC2 runtime, without overriding an explicit EC2 opt-out.
- Treated current single-region deployments with future multi-region expansion as roadmap notes in both Korean and English.
- Replayed the reported questionnaire in the local browser; the real preview contains the EC2 fleet, Launch Template, Auto Scaling Group, target group, and load balancer with no new browser errors.
- The complete AI Architecture Draft suite passes 79/79, related Workspace AI tests pass 9/9, and lint, typecheck, build, harness, and diff checks pass.

### 2026-07-18 - Remove the post-analysis Delivery card

- Removed the post-analysis Delivery card and preload; error recovery remains. Risk: no browser QA.
- Focused 7/7, Web lint/typecheck/build, harness, and diff checks pass. Next: review and push; no deployment or migration.

### 2026-07-18 - Preserve Reverse Engineering history during AWS connection deletion

- Fixed AWS connection deletion for connections referenced by Reverse Engineering scans by making the reference nullable with `ON DELETE SET NULL` in migration `0051`; scan results now remain available with a deleted-connection label.
- Added the preserved scan count to the deletion preview and kept the deletion modal open on failure with a user summary, retry path, and separate diagnostic disclosure.
- The original live HTTP reproduction now returns 204 with `connection=0, scan=1, detached=1`; focused API tests pass 26/26 and focused Web tests pass 6/6. Migration compatibility, harness, lint, typecheck, and build pass; lint retains one unrelated existing unused-import warning.
- Restored the project-deletion modal's 40px close control and visible 18px X icon; the focused deletion-flow suite passes 14/14.
- GitHub build disconnect now treats remote cleanup as best-effort, detaches local metadata with HTTP 204, and logs incomplete cleanup; focused API tests pass 26/26. The broad API run has unrelated failures (1370 pass, 3 fail, 1 cancelled).
- Applied migration `0051` only to the local development database. No AWS mutation, Terraform apply/destroy, Deployment, Git handoff, push, or secret output occurred. No continuation handoff is required; the next action is review and commit of the implementation changes.

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

### 2026-07-18 - Reorder approved Plan actions

- Reordered the approved Plan actions so `배포 실행` appears before `Plan 승인 취소` without changing either action's behavior, styling, or state gates.
- The focused action-order regression passes 2/2. Browser access was healthy, but the signed-in account had no remaining projects, so the approved-Plan visual state could not be rendered without creating project state.

### 2026-07-18 - Address PR #476 S3 prefix review

- Restricted project and deployment artifact deletion prefixes to the explicit identifier character set before issuing any S3 list or delete command.
- Added regressions for traversal-like, whitespace, dotted, and encoded-separator prefixes; the focused storage suite passes 4/4.
- API typecheck and harness pass. API lint passes with one unrelated existing unused-import warning in `project-deletion-service.test.ts`. No AWS, Terraform, deployment, project deletion, or database mutation was performed.

### 2026-07-18 - Gate full-stack preparation on a confirmed deployment target

- Direct Deployment now checks the current project deployment target before saving or preparing a Full Stack/Application run and links missing setup to the existing CI/CD Delivery surface.
- Deployment prepare conflicts now explain the Source Repository, build configuration, and AWS connection prerequisites and identify the failure as target selection before any worker starts.
- Focused Web tests pass 32/32; root lint, typecheck, build, harness, and diff checks pass. No Deployment, Terraform execution, AWS mutation, Git handoff, push, or DB migration was performed.

### 2026-07-18 - Separate GitHub login from Repository authorization

- GitHub OAuth remains a SketchCatch login mechanism only; Git/CI/CD Repository settings now use the connected GitHub App installation token with no user OAuth fallback endpoints or UI.
- Removed the legacy public OAuth-required handoff state, replaced the permission recovery code with `github_app_permission_required`, and documented the required GitHub App user-authorization credentials.
- Focused API tests pass 18/18 and focused Web tests pass 37/37. Root harness, lint, typecheck, build, and diff checks pass.
- The legacy physical `github_oauth_required` database column remains mapped under an internal compatibility name, while new handoffs write `false`; no migration, GitHub mutation, cloud mutation, commit, or push was performed.

### 2026-07-18 - Update the GitHub authorization branch from dev

- Fast-forwarded local `dev` and `codex/fix-github-auth-boundary` to `origin/dev` at `ba5bb2ec` while preserving the branch's staged work and separate unstaged UI changes.
- Kept the newer dev AWS connection envelope and client compatibility fix where it superseded the branch-local duplicate; harness, typecheck, and staged/unstaged diff checks pass.
- No commit or push was performed.

### 2026-07-18 - Keep CI/CD Repository connection project-scoped

- Replaced the Delivery card's new-project analysis link with the shared `select_repository` navigation so users select a GitHub App Repository for the current project and return to CI/CD afterward.
- The focused Repository navigation regressions pass 27/27. Root lint and typecheck pass, and the Web and API production builds complete successfully.
- No Repository connection, GitHub mutation, deployment, DB migration, commit, or push was performed.

### 2026-07-18 - Keep deployment target persistence synchronized

- Board ECS synchronization and Terraform output reconciliation now persist `runtimeConfig`, canonical `runtimeTarget`, and `deploymentTargetFingerprint` together using the locked project's AWS account and region.
- Both paths repair stale target identity even when the runtime configuration is already current; development diagnostics now point fingerprint preflight failures to the persisted target fields instead of CodeBuild logs.
- Focused regressions pass 33/33 and the runtime identity contract passes 8/8. Root lint and typecheck pass; direct API and Web production builds exit successfully. No database migration, deployment, cloud mutation, commit, or push was performed.

### 2026-07-18 - Synchronize the prepared release after Terraform outputs

- Terraform output reconciliation now locks and updates the pending ApplicationRelease together with the Project Deployment Target, including both target and ECS coordinate fingerprints.
- A partially synchronized or failed full-stack retry repairs the prepared release only when its previous target matches the reconstructed pre-Terraform target in the same AWS account, region, health path, and ECS coordinates; real target drift remains blocked.
- Latest focused API regressions pass 20/20 and failure-presentation tests pass 10/10. API/Web typechecks, changed-file API lint, API bundling, harness, and diff checks pass. No database migration, deployment retry, cloud mutation, commit, or push was performed.

### 2026-07-18 - Remove the demo deployment from AWS

- Removed the user-approved 36-resource `audience-live-check` deployment from account `724702275121`; exact-ID verification reported `CLEANUP_RESULT remaining=0`.
- Removed the CloudShell helper files. Repository and Git state were unchanged.

### 2026-07-18 - Accept Terraform-managed ECS runtime replacements

- Fixed full-stack output reconciliation so an approved Terraform Apply can replace Task Definition, IAM role, ALB/Target Group, S3, CloudFront, and derived URL coordinates while stable prepared ECR, cluster, service, container, and port coordinates remain fail-closed and state-inventory verified.
- Removed the duplicate full-stack target synchronization writer, made target and pending ApplicationRelease metadata reconcile atomically, synchronized Board container-port changes before Plan, and corrected the developer diagnostic for post-Apply output conflicts.
- Added the harness and 212 deployment/GitOps transition checks to CI. Focused checks, lint, typecheck, build, and harness pass; the broader `pnpm test:core` still exposes unrelated pre-existing API/Web failures. No deployment, AWS mutation, DB migration, commit, or push was performed.

### 2026-07-18 - Detach local workers and simplify deployment results

- Added `local_process` mode so Terraform survives API hot reload, with persisted PIDs, cancellation, and dispatch-race protection; worker/startup tests pass 23/23 and route tests pass 2/2.
- Deployment logs have an internal scroll area.
- Removed the duplicate recent-result card and redesigned Deployment History as a large responsive table and detail panel; zero counts are omitted, completed Destroy counts stay neutral, and release IDs are collapsed.
- The focused deployment-flow suite passes 20/20. Root lint and typecheck pass, Web and root builds complete compilation, harness and diff checks pass; root lint retains one unrelated existing API test warning. No Terraform, AWS, database, migration, commit, or push action was performed.

### 2026-07-18 - Close Direct and GitOps redeploy transition gaps

- Reproduced and fixed target-only partial-write recovery during an ECS full-stack redeploy by persisting the prepared Output URL snapshot, including explicit `null`, beside the prepared coordinates fingerprint.
- Legacy pending releases now add that snapshot on their next preparation without rebuilding the immutable artifact; Direct/GitOps activation, restart recovery, and manual rollback reject baselines from a different deployment target fingerprint.
- CI now runs every API deployment and Git/CI/CD test instead of a selected subset. The CI-equivalent matrix passes 446 API and 65 Web checks; lint, typecheck, and build pass with one unrelated existing API test-file unused-import warning.
- No Terraform, AWS, database, migration, Git commit, or push action was performed.

### 2026-07-18 - Remove the Init-to-Plan race and make deployment commands idempotent

- Confirmed deployment `e1b99057-9e2d-414c-b65d-c9ddb829dbe0` received its Plan request while the durable Init job was still running; Init later succeeded and returned the Deployment to `PENDING`, so Terraform and worker recovery were not the cause.
- Direct review now starts one Plan worker, whose existing Plan service performs Terraform init, instead of starting a separate Init worker and queuing Plan in client state. Matching durable Init, Plan, Apply, Destroy Plan, Destroy, and frontend retry requests return the current `202` snapshot without dispatching a duplicate; a different active operation remains a conflict.
- GitHub Actions now includes the Direct Deployment route suite and all four Git/CI/CD route suites. The CI-equivalent matrix passes 523 API and 66 Web checks, the deployment route suite passes 64/64, and root typecheck passes.
- The broader API suite still has unrelated existing artifact-heartbeat/project-deletion failures, and the broader Web suite still has three Resource Catalog failures plus one external-link contract failure. No Terraform, AWS, database, migration, deployment, GitHub handoff, commit, or push action was performed.

### 2026-07-18 - Repair CI/CD readiness after successful Direct deployment

- Initial release readiness now validates the producer's exact `commitSha:releaseCandidateId` marker, and read-only Delivery inspection recognizes a persisted target only after canonical fingerprint verification.
- Legacy ECS web targets derive missing duplicate evidence from their confirmed paths; an explicit refresh persists that normalized evidence while GET remains read-only.
- The focused readiness suite passes 89 checks; API lint, typecheck, and build pass. The live project profile is ready with zero required actions. No database, AWS, deployment, migration, commit, or push mutation was performed.
