# Agent Progress

This file is the short, English-only working log for the current agent context. Keep it concise.

## Current Verified State

Branch/worktree:

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

Next steps:

- Review and either update or fix the unrelated diagram editor handle-id tests before relying on full `pnpm test` as a green gate.
