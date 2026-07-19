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

### 2026-07-18 - Let project deletion survive managed AWS cleanup failures

- Project deletion now treats the project CodeBuild and dedicated IAM Role cleanup as best-effort, while still attempting it before deleting local records.
- AWS cleanup or inventory failure no longer returns `managed_cleanup_failed`; the API returns the normal deletion response, removes project records, and writes a non-secret warning for possible remote leftovers.
- Active Deployment, worker-job, and execution-lease deletion guards remain unchanged. Focused project deletion tests pass 40/40; harness, lint, typecheck, build, and diff checks pass.
- No live AWS cleanup, cloud mutation, deployment, migration, commit, or push was performed.

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
