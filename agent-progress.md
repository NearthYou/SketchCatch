# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/` and remain available in Git history.

## Current Verified State

- The current branch applies the supplied self-hosted LINE Seed Sans KR files across Web typography surfaces, with Regular as the body baseline and Bold for headings and emphasis.
- Board resource labels use a compact 12px computed size so long names fit more clearly within the existing two-line boundary.
- The automatic Board organization result remains compact while preserving the incoming `dev` comparison session and original/organized view selection.
- Incoming `dev` API, deployment, Git/CI/CD, AWS connection, Reverse Engineering, and data-contract changes remain accepted as the backend baseline.
- The merge resolution is complete and ready for the merge commit.

## Session Record

### 2026-07-19 - Reduce Board resource label size

- Reduced only icon-tile Resource labels from 18px to 12px while preserving Bold weight, two-line clamping, and the full-name tooltip.
- The focused DiagramNodeView suite passes 25/25. No broad test suite was run.

### 2026-07-19 - Replace Pretendard with Regular and Bold LINE Seed Sans KR typography

- Replaced all active Web and smoke-page Pretendard usage with the supplied LINE Seed Sans KR Thin, Regular, and Bold WOFF2 files and the official licensing notice; removed the obsolete Pretendard and intermediate Spoqa assets.
- Set the service body baseline to Regular 400 and mapped existing emphasis to Bold 700, avoiding synthetic intermediate weights.
- Focused typography and Diagram checks pass 126/126; browser QA found only computed 400 and 700 weights with no unexpected values. Harness, lint, typecheck, production build, and diff checks pass. The unnecessary broad test run stopped on one unrelated existing Git/CI/CD readiness contract failure in `packages/types`; no further broad test was run. No dependency, lockfile, database, deployment, cloud, or Git handoff change was made.

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

- No merge-owned check is failing.
- Broad test suites were not run because the user requested avoiding unnecessary tests; focused conflict regressions and all required repository checks passed.
- Previously documented environment-specific or unrelated broad-suite failures remain recorded in Git history and `docs/agent-history/2026-07.md`.
- No live AWS mutation, Terraform apply/destroy, Deployment, GitHub mutation, or Git handoff is authorized or performed by this merge resolution.

## Next Action

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
