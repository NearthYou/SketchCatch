# Agent Progress

Short English-only working log for the current agent context.

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
=======
- Branch/worktree: `codex/deploy-console-reopen` in `C:\Users\siwon\Desktop\Jungle\Week17~21\SketchCatch-worktrees\deploy-console-reopen`.
- Base: latest `origin/dev` after PR #250 was merged.
- Scope: harden the deployment console open path and improve low-contrast UI text.
- Deployment console now renders through a `document.body` portal so collapsed right-panel layout cannot hide it.
- Project GitHub settings Korean copy is intact, and low-contrast disabled/muted dashboard and deployment text has higher opacity/contrast.
- The right-panel Plan split button/action strip has been removed; deployment entry is consolidated through Deploy.

## Session Record

2026-07-08:

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

Verification:

- `pnpm harness:check` - passed before edits.
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-right-panel-layout.test.ts` - passed, 63 tests.
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-right-panel-layout.test.ts` - passed after Plan removal, 62 tests.
- `pnpm lint` - passed.
- `pnpm typecheck` - passed.
- `pnpm build` - passed.
- `pnpm harness:check` - passed after edits.

Known risks:

- Full web source-test sweep was not rerun after the final Plan removal; targeted layout coverage passed.
- Browser click QA against production still needs to run after merge/deploy.

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