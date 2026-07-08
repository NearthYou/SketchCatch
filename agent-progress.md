# Agent Progress

Short English-only working log for the current agent context.

## 2026-07-08 S3 And EC2 Demo Smoke Scope

- Branch/worktree: `codex/demo-s3-ec2-smoke` in `C:\Users\siwon\.codex\worktrees\d98a\SketchCatch`.
- Scope: make the live demo smoke stop before ALB/ASG and deploy only S3 static website plus one EC2 API instance.
- Reverted the abandoned IAM role permission expansion path and did not keep those changes.
- Updated Terraform artifact safety so only managed SketchCatch demo user data is allowed on `aws_instance` in demo live profiles.
- Changed `scripts/smoke/live-demo-web-service.ps1` to generate S3 website + EC2 API Terraform by default, with no ALB, ASG, launch template, target group, or listener.
- The smoke now verifies `static_site_url`, `api_base_url`, and `api_instance_id`.
- Left unrelated untracked `pr-handoff-payload-flow-diagram.md` untouched.

Verification:

- `pnpm harness:check` - passed before edits.
- `pnpm --filter @sketchcatch/api exec tsx --test src/deployments/terraform-artifact-safety.test.ts src/deployments/deployment-safety-gate.test.ts`
- PowerShell script parse check for `scripts/smoke/live-demo-web-service.ps1`
- Generated smoke Terraform, then `terraform init -backend=false -input=false` and `terraform validate`
- `git diff --check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`

## 2026-07-08 Demo Web Service Approval Gate Fix

- Branch/worktree: `codex/demo-safety-gate-ack` in `C:\Users\siwon\.codex\worktrees\d98a\SketchCatch`.
- Scope: unblock `scripts/smoke/live-demo-web-service.ps1` when the demo profile intentionally creates public web resources.
- Added live profile context to deployment safety gate warning creation.
- Kept ordinary high Trivy findings blocking, but made known `demo_web_service` public web findings acknowledgement-only for the managed demo resource addresses.
- Hardened the smoke Terraform with launch template IMDSv2, security group rule descriptions, and ALB invalid-header dropping.
- Updated the smoke script to submit acknowledgement ids from `planSummary.warnings` during approve.
- Left unrelated untracked `pr-handoff-payload-flow-diagram.md` untouched.

Verification:

- `pnpm harness:check` - passed before edits.
- `pnpm --filter @sketchcatch/api exec tsx --test src/deployments/deployment-safety-gate.test.ts src/deployments/deployment-plan-service.test.ts`
- PowerShell script parse check for `scripts/smoke/live-demo-web-service.ps1`
- `git diff --check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm harness:check` - passed after build.

## 2026-07-08 Demo Smoke PowerShell Compatibility Fix

- Branch/worktree: `dev` in `C:\Users\siwon\.codex\worktrees\d98a\SketchCatch`.
- Scope: unblock `scripts/smoke/live-demo-web-service.ps1` on Windows PowerShell runtimes without `SHA256.HashData`.
- Replaced the managed demo user-data hash call with `SHA256.Create().ComputeHash()` and disposed the hasher.
- Resolved relative `/api/...` project asset upload URLs to the configured API root and attached bearer auth for API uploads in both live demo and S3 smoke scripts.
- Left unrelated untracked `pr-handoff-payload-flow-diagram.md` untouched.

Verification:

- `pnpm harness:check` - passed before edits.
- Extracted and invoked `New-ManagedDemoUserDataBase64`; it produced base64 user data with the managed SHA-256 marker.
- Extracted and invoked `Resolve-ProjectAssetUpload`; it converted `/api/projects/.../upload-content` to `https://sketchcatch.net/api/projects/.../upload-content` and preserved auth/content-type headers.
- `pnpm harness:check` - passed after edits.

## 2026-07-08 S3 Public Access Deployment Gate Fix

- Branch/worktree: `codex/s3-public-access-default` in `C:\Users\siwon\Desktop\Jungle\Week17~21\SketchCatch-worktrees\s3-public-access-default`.
- Scope: remove the confusing S3 public-access warning path for service buckets.
- Terraform rendering now adds an `aws_s3_bucket_public_access_block` companion resource for every rendered `aws_s3_bucket` unless the board already has an explicit public access block for that bucket.
- The companion sets `block_public_acls`, `block_public_policy`, `ignore_public_acls`, and `restrict_public_buckets` to `true`.
- Pre-deployment analysis now deduplicates repeated findings for the same resource, title, and recommended fix so the UI does not show the same root issue many times.
- Verified generated S3 bucket Terraform scans with no Trivy findings after the default public access block is added.

Verification:

- `pnpm harness:check` - passed before edits.
- `pnpm --filter @sketchcatch/api exec tsx --test src/services/aiPreDeploymentCheck.test.ts`
- `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/diagram-to-terraform.test.ts src/services/terraform/terraform-preview.test.ts`
- Manual tsx smoke: generated `aws_s3_bucket` plus public access block and Trivy scanner returned `[]`.
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm harness:check` - passed after edits.

## 2026-07-08 Deployment Console UX Cleanup

- Branch/worktree: `codex/deployment-ux-cleanup` in `C:\Users\siwon\Desktop\Jungle\Week17~21\SketchCatch-worktrees\deployment-ux-cleanup`.
- Scope: reduce deployment console clutter and remove nested/split scrolling.
- Kept the primary deployment screen focused on the three-step flow: save, review, deploy.
- Moved records, results, Git/CI/CD handoff, and logs into collapsed secondary disclosures.
- Removed the expanded console split pane, resize handle, and separate logs column.
- Removed inner scrolling from pre-deployment findings and deployment logs so the console has one main scroll path.
- Updated layout regression tests to enforce the simplified information architecture.

Verification:

- `pnpm harness:check` - passed before edits.
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-right-panel-layout.test.ts` - passed, 63 tests.
- `pnpm lint` - passed.
- `pnpm typecheck` - passed.
- `pnpm build` - passed.
- `pnpm harness:check` - passed after build.
- Local web server returned HTTP 200 on `http://localhost:3000`.
- Browser screenshot QA was not run because Playwright is not installed in the local REPL environment.

## 2026-07-08 UI Contrast Fix

- Branch/worktree: `codex/contrast-fix` in `C:\Users\siwon\Desktop\Jungle\Week17~21\SketchCatch-worktrees\contrast-fix`.
- Scope: restore readable contrast for the workspace Issues panel and disabled project action menu items.
- Fixed a stale workspace CSS block so Issues panel overrides are syntactically isolated.
- Removed obsolete `panelPlan*` CSS that should not exist now that the right panel has only Issues and Deploy actions.
- Raised disabled project menu contrast without making disabled actions look active.

Verification:

- `pnpm harness:check` - passed before edits.
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-right-panel-layout.test.ts` - passed, 63 tests.
- `pnpm --filter @sketchcatch/web exec tsx --test features/projects/project-delete-flow.test.ts` - passed, 4 tests.
- `pnpm lint` - passed.
- `pnpm typecheck` - passed.
- `pnpm build` - passed.
- `pnpm harness:check` - passed after edits.

## Current Verified State

- Branch/worktree: `codex/github-app-204-settings` in `C:\Users\siwon\Desktop\Jungle\Week17~21\SketchCatch-worktrees\git-cicd-handoff-create-fix`.
- PR #241 was merged to `dev` and deployed to production by GitHub Actions run `28888021622`.
- Production health and DB health returned `ok`.
- Production Git/CI/CD live smoke created PR #14 in `NearthYou/sketchcatch-iac-handoff-test`.
- Smoke status is `passed_or_waiting`: repository settings applied, 5 variables applied, pipeline status is `pr_created`, infra is `waiting_for_merge`.

- Branch: `feat/ys/142-cost-risk-분석-구현`
- Worktree: `C:\krafton_jungle\SketchCatch`
- Scope: switch the existing Deployment Safety Gate finding source to Trivy-backed Terraform security analysis while preserving the current gate/warning JSON shape.

Current branch work:

- Added a shared pre-deployment analysis service that merges Trivy Terraform findings with existing cost/config/product policy findings.
- Wired `/api/ai/pre-deployment-check` to accept Terraform files, run the shared analysis, and add cached/limited AI explanations only for the UI path.
- Wired deployment plan generation to use the same deterministic shared analysis without AI explanations.
- Added a Trivy adapter that writes Terraform files to a temp directory, runs `trivy config`, and maps rule id, severity, resource, file, and line to `CheckFinding`.
- Added Docker/EC2/GitHub Actions deployment support for a pinned Trivy binary and `TRIVY_CACHE_DIR` cache volume.
- Enforced approval blocking for `blocksApproval` warnings and required acknowledgement ids for acknowledgement-only warnings.
- Updated the frontend button flow to fail fast on Terraform diagnostics errors, send Terraform files to the API, and keep the existing `수정` source-location navigation.

Verification:

- `trivy --version` reports `0.72.0`.
- Local Trivy CLI smoke on a public SSH Terraform sample returns `AWS-0107`, `HIGH`, line `8`, and resource `aws_security_group.open_ssh`.
- Focused API tests pass: Trivy parser, merged analysis, AI route cache/terraformFiles, safety gate warning mapping, approval blocking, deployment plan Trivy analysis.
- Focused web tests pass: pre-deployment API payload, diagnostics fail-fast helper, approval acknowledgement payload, deployment action blocking, layout/source checks.
- `pnpm lint` passes.
- `pnpm typecheck` passes.
- `pnpm build` passes.
- Local Playwright smoke on `http://localhost:3000/workspace` confirms: public SSH Terraform input -> `검사 실행` -> `/api/terraform/validate` -> `/api/ai/pre-deployment-check` -> HIGH Trivy finding rendered -> `수정` navigates to `main.tf:8`.
- Fixed a local 500 after `검사 실행` by bounding AI safety explanation generation; Trivy/policy findings now return with deterministic fallback if explanation generation stalls.
- Applied local runtime DB migrations after Git/CI/CD handoff reads failed on missing `git_cicd_handoffs.source_deployment_id`.
- Localized Trivy pre-deployment finding titles/recommendations, deterministic fallback explanations, and pre-deployment issue labels to Korean.
- Updated the pre-deployment finding list to render every finding inside a scrollable list instead of truncating after three items.
- Lifted pre-deployment check result state from `DeploymentPanel` to `WorkspaceRightPanel`, so results survive leaving and returning to the deployment tab within the same project.

Known issue outside this work:

- Full `pnpm test` currently fails in web diagram editor source-shape tests unrelated to this change, starting with `features/diagram-editor/DiagramNodeView.test.ts` expecting legacy handle ids like `source-handle-${handle.side}` while the current source uses `source-${handle.id}`.
- Branch: `fix/ck/diagram-position`
- Worktree: `C:\Jungle\SketchCatch`
- Base: local `dev` updated to `384429c0` and merged into this branch.
- Branch/worktree: `codex/deployment-button-labels` in `C:\Users\siwon\Desktop\Jungle\Week17~21\SketchCatch-worktrees\deployment-button-labels`.
- Base: latest `origin/dev`.
- Scope: Deployment panel UX simplification and Git/CI/CD handoff action labels.
- Deploy no longer renders inside the right panel. Deploy and Plan open the full-screen deployment console.
- The deployment console now presents the main path as three steps: save, pre-deployment check/review, deploy.
- Direct deployment action buttons were consolidated into one contextual deploy action.
- Noisy deployment record metadata was reduced; errors stay visible in a reserved alert slot.
- Git/CI/CD handoff buttons now use user-facing labels with concise helper text.
- Branch/worktree: `codex/github-project-settings` in `C:\Users\siwon\Desktop\Jungle\Week17~21\SketchCatch-worktrees\github-project-settings`.
- Base: latest `origin/dev` at the start of this worktree.
- Scope: move GitHub source repository setup out of the deployment panel and fix the deployment console open path.
- Deployment now opens the full-screen console without closing the right panel host first.
- GitHub repository connection now lives in project creation and project settings.
- Deployment panel only shows source repository status, a project GitHub settings link, and Git/CI/CD handoff actions.
- Branch/worktree: `codex/deploy-console-reopen` in `C:\Users\siwon\Desktop\Jungle\Week17~21\SketchCatch-worktrees\deploy-console-reopen`.
- Base: latest `origin/dev` after PR #250 was merged.
- Scope: harden the deployment console open path and improve low-contrast UI text.
- Deployment console now renders through a `document.body` portal so collapsed right-panel layout cannot hide it.
- Project GitHub settings Korean copy is intact, and low-contrast disabled/muted dashboard and deployment text has higher opacity/contrast.
- The right-panel Plan split button/action strip has been removed; deployment entry is consolidated through Deploy.

## Session Record

2026-07-08:

- Fixed production AI provider configuration injection so the deploy workflow writes `AI_BILLING_MODE`, Bedrock, and Amazon Q settings into `/etc/sketchcatch/api.env`.
- Added EC2 runtime IAM permissions for Bedrock Runtime `InvokeModel` and Amazon Q Business `ChatSync`.
- Added deployment regression tests that assert the production workflow injects AI provider env and the runtime policy keeps the required provider permissions.

Verification:

- `pnpm harness:check`
- `node --test scripts\deploy-runtime-iam-policy.test.mjs`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`

- Reworked Terraform Preview explanation to evaluate the Terraform-backed diagram with six Well-Architected agent-style assessments and a consensus recommendation.
- Kept detected resources in the API contract for compatibility, but removed them from the primary Preview explanation UI.
- Increased Preview explanation readability with larger summary/conclusion text and two-column assessment cards in the chat dock and legacy workspace AI panel.

Verification:

- `pnpm --filter @sketchcatch/api exec tsx --test src/services/aiTerraformPreviewExplanation.test.ts src/routes/ai.test.ts`
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/ai-workspace-api.test.ts features/workspace/workspace-right-panel-layout.test.ts`
- `pnpm --filter @sketchcatch/web typecheck`
- `pnpm --filter @sketchcatch/types typecheck`
- `pnpm --filter @sketchcatch/api typecheck`
- `pnpm --filter @sketchcatch/api lint`
- `pnpm --filter @sketchcatch/web lint`
- `pnpm harness:check`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- Browser attempt: local `http://localhost:3000/workspace/ai` redirected to `/login`, so visual verification was blocked by missing login state. Dev server was stopped after the check.

- Removed the per-diagnostic AI explanation button from the Terraform error summary in the code panel.
- Restored the Issues tab to the light workspace panel styling and removed the late dark override that made issue cards hard to read.
- Treated Terraform Code, Issues, and Terraform issue AI resolution as one internal workflow so the unsaved Terraform leave dialog does not appear while moving between them.

Verification:

- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-right-panel-layout.test.ts`
- `pnpm --filter @sketchcatch/web typecheck`
- `pnpm harness:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`

- Fixed Terraform fast diagnostics so multiline list continuations inside resource/data blocks are not reported as body syntax errors.
- Verified the user-provided sample no longer reports false `attribute_syntax` errors for AMI owners and security group ID list entries; remaining errors are the standalone `erere`, unresolved references, and unsupported S3 provider arguments.

Verification:

- `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-diagnostics.test.ts`
- `pnpm --filter @sketchcatch/api typecheck`
- `pnpm --filter @sketchcatch/api lint`
- `pnpm harness:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`

- Fixed the Issues tab scroll container by giving the Issues panel a fixed height chain and moving vertical overflow to the Terraform diagnostics body.
- Added a layout regression assertion so the Issues panel keeps `min-height: 0`, `overflow-y: auto`, and stable scrollbar gutter.

Verification:

- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-right-panel-layout.test.ts`
- `pnpm --filter @sketchcatch/web typecheck`
- `pnpm --filter @sketchcatch/web lint`
- `pnpm harness:check`
- Implemented the Trivy-backed Deployment Safety Gate conversion across shared types, API analysis, deployment plan warnings/approval, frontend flow, Docker deploy config, and docs.
- Removed temporary Playwright artifacts after local UI smoke.
- Debugged and fixed `POST /api/ai/pre-deployment-check` stalling/500 risk by adding a safety explanation timeout and fallback regression test.
- Ran local runtime migration and confirmed `git_cicd_handoffs.source_deployment_id=true`.
- Verified `http://localhost:3000/api/ai/pre-deployment-check` with public SSH Terraform returns `status=200`, `findings=1`, `sourceLocation.line=8`, and `resourceAddress=aws_security_group.open_ssh`.
- Localized the pre-deployment issue display for common Trivy findings including IMDSv2, RDS backup retention, RDS encryption, public SSH/RDP, public RDS, S3 public access, and IAM wildcard permissions.
- Verified `http://localhost:3000/api/ai/pre-deployment-check` returns Korean titles and fallback summaries for IMDSv2, RDS backup retention, RDS encryption, SSH/RDP, generic Trivy, and IAM findings.
- Removed the three-finding display cap from `DeploymentPreDeploymentSummary`; the pre-deployment finding list now scrolls with all findings rendered.
- Preserved pre-deployment check state across deployment tab unmount/remount by storing analysis, request state, error message, and fingerprint in `WorkspaceRightPanel`; project changes reset the stored check state.
- Corrected diagram edge handling so only `contains`/`hosts` are removed as area containment; runtime and configuration relationships remain visible.
- Added endpoint-based styling so IAM/KMS/AMI/security configuration relationships render as thin solid dependency lines even when the AI label is generic.
- Kept async/event/log/monitoring relationships dashed, Terraform/deploy relationships operational dashed, and runtime HTTPS/data relationships solid.
- Reworked generated diagram readability for shared architecture conversion/normalization paths, not just one QA fixture.
- Added readable topology lanes, route scoring, area/resource collision protection, and tests for compact mixed cloud area drafts.
- Updated AI architecture draft support so Amazon Q allowed `ResourceNode.type` values are derived from shared resource definitions instead of a hard-coded subset.
- Added fallback draft handling for explicitly requested resource-panel catalog items such as EKS Cluster, DynamoDB Table, SQS Queue, and Auto Scaling Group.
- Kept negated resource requests such as "no EC2" from being re-added as explicit panel resources.
- Updated unsupported-resource handling so panel-backed resources are no longer reported as omitted, while unsupported workflow automation such as CI/CD handoff remains guarded.
- Merged latest `dev` into `fix/ck/diagram-position`; the only manual conflict was this progress log.
- Added full-screen-only deployment console hosting from `WorkspaceRightPanel`.
- Added a three-step deployment workflow in `DeploymentPanel`.
- Combined pre-deployment check and review creation into one visible step.
- Routed Plan, approval, Apply, and Cleanup through one contextual deployment button.
- Reduced duplicated Direct Deployment action buttons and low-value metadata rows.
- Added responsive styling and source-layout regression coverage.

Verification:

- Review and either update or fix the unrelated diagram editor handle-id tests before relying on full `pnpm test` as a green gate.
- `pnpm harness:check`
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-right-panel-layout.test.ts`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`

- Removed the fallback/basic LLM explanation block from the Terraform Preview explanation result so the panel focuses on the six assessment agents and conclusion.
- Removed the inline Terraform error card list from the code panel, leaving only the compact Issues navigation banner when Terraform errors exist.
- Fixed fast Terraform diagnostics so standalone invalid top-level lines and non-attribute resource body lines, including Korean random text, produce one blocking syntax diagnostic before sync-to-diagram can cascade extra issues.

Verification:

- `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-diagnostics.test.ts`
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-right-panel-layout.test.ts`
- `pnpm --filter @sketchcatch/web typecheck`
- `pnpm --filter @sketchcatch/api typecheck`
- `pnpm --filter @sketchcatch/web lint`
- `pnpm --filter @sketchcatch/api lint`
- `pnpm harness:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`

- Fixed AI Architecture Draft to Diagram conversion so Terraform reference strings are rewritten after resource naming conventions change declaration names.
- Prevented Terraform Preview rendering from emitting AI semantic metadata fields such as `bucketPurpose`, `servicePurpose`, `originResourceId`, and `publicAccessBlock` as provider arguments.
- Added regression coverage for stale reference rewrites across IAM, AMI, Subnet, Security Group, EC2, and CloudWatch alarm dimensions, plus Terraform rendering metadata filtering.

Verification:

- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-ai-diagram-adapter.test.ts`
- `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-preview.test.ts`
- `pnpm --filter @sketchcatch/web typecheck`
- `pnpm --filter @sketchcatch/api typecheck`
- `pnpm harness:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`

- Added browser speech recognition to the full-screen new-project AI start composer with a mic button, listening state, and shared Korean status/error handling.
- Added static regression coverage for the new voice button wiring, SpeechRecognition support helper, and responsive composer styling.

Verification:

- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-new-project-start-mode.test.ts`
- `pnpm --filter @sketchcatch/web typecheck`
- `pnpm harness:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build` (first run timed out at the command limit; rerun with a longer timeout passed from cache)
- Local dev server started at `http://localhost:3000`; `/workspace/new` returned HTTP 200.
- Browser screenshot attempt was blocked because the local Playwright browser binary is not installed.

- Corrected diagram edge handling so only `contains`/`hosts` are removed as area containment; runtime and configuration relationships remain visible.
- Added endpoint-based styling so IAM/KMS/AMI/security configuration relationships render as thin solid dependency lines even when the AI label is generic.
- Kept async/event/log/monitoring relationships dashed, Terraform/deploy relationships operational dashed, and runtime HTTPS/data relationships solid.
- Reworked generated diagram readability for shared architecture conversion/normalization paths, not just one QA fixture.
- Added readable topology lanes, route scoring, area/resource collision protection, and tests for compact mixed cloud area drafts.
- Updated AI architecture draft support so Amazon Q allowed `ResourceNode.type` values are derived from shared resource definitions instead of a hard-coded subset.
- Added fallback draft handling for explicitly requested resource-panel catalog items such as EKS Cluster, DynamoDB Table, SQS Queue, and Auto Scaling Group.
- Kept negated resource requests such as "no EC2" from being re-added as explicit panel resources.
- Updated unsupported-resource handling so panel-backed resources are no longer reported as omitted, while unsupported workflow automation such as CI/CD handoff remains guarded.
- Merged latest `dev` into `fix/ck/diagram-position`; the only manual conflict was this progress log.
Known risks:

- PR #234 and PR #235 were merged and deployed before this branch update.
- Latest `dev` includes Git/CI/CD handoff permission messaging, repository settings, cost usage work, and production smoke follow-up updates.
- The dev-side production smoke blocker remains GitHub App permission approval for generated PR files, especially workflow files.
- Merged and deployed the GitHub App repository settings fixes through PRs #237, #238, #239, #240, and #241.
- Reran production live smoke after PR #241 deployment and verified repository settings apply now passes.
- Left generated handoff PR #14 open for review/merge because real AWS mutation requires explicit approval.

## Remaining Demo Work

- Run focused checks after the merge if more code changes are made.
- Push `fix/ck/diagram-position` and open/update the PR into `dev` when ready.
- Merge a generated handoff PR only when real AWS apply is approved.
- Run the downstream GitHub Actions pipeline and verify live static/API URLs.
- Run cleanup/destroy verification after any real AWS deployment.
- This is a UI workflow change; no real AWS apply, GitHub repository mutation, or browser click QA was run locally.
- Fixed the deployment console reopen path by moving the expanded deployment panel into a body-level portal.
- Raised contrast for disabled workspace creation, dashboard muted/subtle text, disabled dashboard buttons, and disabled deployment buttons.
- Rechecked the project GitHub settings client copy while preserving the project-level repository connection flow.
- Removed the obsolete right-panel Plan split button and its unused CSS/test expectations.
- Added a fixed AI Architecture Draft path for the exact selected-answer flow: dynamic web application, medium traffic, simple DB data, SPA frontend, complex backend, Korea/Seoul, 50-200만원 budget, optional HTTP, no upload, no realtime, semi-managed operations, 3s loading, 10-100MB site, daytime traffic, and 99.9% availability.
- The fixed draft bypasses Amazon Q only for that selected-answer combination and returns a SketchCatch-style AWS/Terraform deployment topology: VPC, public/private app/private DB subnets, IGW, NAT gateways, ALB/listener/target group, launch template, Auto Scaling Group, RDS, DB subnet group, S3, CloudFront, IAM runtime nodes, and Secrets Manager.
- Added regression coverage proving the exact path bypasses the provider, fallback generation returns the same fixed draft, and a similar non-matching budget choice still uses the existing provider flow.
- Added a fixed Terraform Preview override for that selected-answer path. The generated diagram carries a private marker, and `/terraform/generate` returns the attached SketchCatch reference Terraform code, including CodePipeline, CodeBuild, CodeDeploy, artifact/static S3 buckets, CloudFront, ALB/ASG, RDS, NAT, IAM, and Secrets Manager resources.
- Reworked the fixed diagram fixture from the provided screenshot grid: the reference canvas now uses the original `2270x1534` screenshot coordinate system, including the region frame, CI/CD groups, static frontend, VPC, public/private app subnets, ASG/app SG, EC2/AMI nodes, RDS subnets, and right-side route labels.
- Disabled all automatic generated Region/AZ wrapping, resource naming layout, readable topology layout, collision resolution, and area fitting for this private marker only; other AI drafts still use the normal layout pipeline.
- Added display-only diagram nodes for unsupported visual resources so CodePipeline, CodeBuild, CodeDeploy, Git repository, Secrets Manager details, SG rules, route labels, and static S3 policy/OAC labels still show icon/name on the canvas without entering Terraform rendering.
- Tightened the fixed fixture so every explicit child node/area box fits fully inside its parent area, including area-inside-area cases such as VPC, subnets, ASG/app SG, DB subnet group, private DB subnets, and RDS SG.
- Added authored edge handles for this fixture so visual flow edges use the intended source/target sides instead of the generic router choosing different handles.

Verification:

- `pnpm harness:check` - passed before edits.
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-right-panel-layout.test.ts` - passed, 63 tests.
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-right-panel-layout.test.ts` - passed after Plan removal, 62 tests.
- `pnpm --filter @sketchcatch/api exec tsx --test src/services/aiArchitectureDrafts.test.ts` - passed, 21 tests.
- `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-preview.test.ts` - passed, 18 tests.
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-ai-diagram-adapter.test.ts` - passed, 28 tests.
- `pnpm --filter @sketchcatch/api typecheck` - passed.
- `pnpm --filter @sketchcatch/web typecheck` - passed.
- `pnpm --filter @sketchcatch/api lint` - passed.
- `pnpm harness:check` - passed after edge/area fixes.
- `pnpm lint` - passed.
- `pnpm typecheck` - passed.
- `pnpm build` - passed.
- `pnpm harness:check` - passed after edits.

Known risks:

- Full web source-test sweep was not rerun after the final Plan removal; targeted layout coverage passed.
- Browser click QA against production still needs to run after merge/deploy.
- CodePipeline, CodeBuild, CodeDeploy, and some fine-grained resources are display-only canvas nodes for this exact selected-answer path; the fixed Terraform Preview code remains the source of deployable IaC for those resources.

Previous 2026-07-08 session:

- Removed in-panel GitHub repository chooser/install actions from `DeploymentPanel`.
- Added `/projects/[projectId]/settings` with a project GitHub repository settings client.
- Added a project creation checkbox to start GitHub repository connection after creating a blank project.
- Added regression coverage for deployment console opening, project-level GitHub ownership, and project creation GitHub handoff.

Verification:

- `pnpm harness:check` - passed before edits.
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-right-panel-layout.test.ts` - passed, 63 tests.
- `pnpm --filter @sketchcatch/web exec tsx --test app/workspace/new/workspace-start-options.test.ts` - passed, 6 tests.
- `pnpm --filter @sketchcatch/web exec tsx --test --test-reporter spec` - new project GitHub settings tests passed; 3 unrelated baseline source tests failed.
- `pnpm lint` - passed.
- `pnpm typecheck` - passed.
- `pnpm build` - passed.
- `pnpm harness:check` - passed after edits.

Known risks:

- Full web source-test sweep still has 3 unrelated baseline failures in reverse workspace, workspace auth gate, and legacy AI route assertions.
- Browser click QA against production has not been run yet in this worktree.

### 2026-07-08 - Local Deploy button console visibility fix

- Goal: Fix the local right-panel `Deploy` action not visibly opening the deployment console.
- Completed:
  - Made `DeploymentPanel` render the expanded deployment overlay whenever it is hosted in `fullScreenOnly` mode.
  - Removed the obsolete right-panel `panelPlan*` CSS block whose missing closing brace was swallowing later rules.
  - Updated workspace right-panel layout source coverage for the full-screen deployment overlay condition.
- Verification:
  - `pnpm harness:check` - passed before edits.
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-right-panel-layout.test.ts` - passed, 63 tests.
  - `pnpm --filter @sketchcatch/web typecheck` - passed.
  - `pnpm --filter @sketchcatch/web lint` - passed.
  - `pnpm lint` - passed.
  - `pnpm typecheck` - passed.
  - `pnpm build` - passed.
- Known risks:
  - Browser click QA reached only the unauthenticated landing page locally; the authenticated Deploy click itself still needs user-session confirmation.

### 2026-07-08 - Deployment review UI list and stage button fix

- Goal: Fix the broken deployment review stage button layout and render all pre-deployment findings instead of the `외 N개 항목` truncation row.
- Completed:
  - Removed the three-finding cap from `DeploymentPreDeploymentSummary`; every finding now renders inside the existing scrollable list.
  - Pinned deployment stage action buttons to the action column so the review button cannot fall into the narrow stage-number column.
  - Kept full-screen deployment select sizing tied to the overlay-open state.
  - Added source-layout regression coverage for full finding rendering, scrollable findings, and stable stage action button placement.
- Verification:
  - `pnpm harness:check` - passed before edits.
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-right-panel-layout.test.ts` - passed, 63 tests.
  - `pnpm --filter @sketchcatch/web typecheck` - passed.
  - `pnpm --filter @sketchcatch/web lint` - passed.
  - `pnpm lint` - passed.
  - `pnpm typecheck` - passed.
  - `pnpm build` - passed.
  - `pnpm harness:check` - passed after edits.

- Updated local `dev` to `838a3e94` and merged it into `fix/ck/245-terraform-error`.
- Resolved the only manual conflict in this progress log, preserving both branch records.

Verification:

- `pnpm harness:check`
- `pnpm lint`
- `pnpm build`
- `pnpm typecheck` (first run failed because `.next/types/validator.ts` was absent before build regenerated Next types; rerun passed)

- Addressed PR #252 review feedback for browser voice input timer typing and dynamic no-speech timeout messaging.
- Updated Terraform diagnostics to report top-level `key = value` attributes as syntax errors instead of ignoring them.
- Added regression coverage for invalid top-level Terraform attributes.

Verification:

- `pnpm --filter @sketchcatch/api test`
- `pnpm --filter @sketchcatch/web typecheck`
- `pnpm harness:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- Browser click QA against production has not been run yet in this worktree.
