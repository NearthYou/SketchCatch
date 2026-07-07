# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Branch: `feat/ys/142-cost-risk-분석-구현`
- Worktree: `C:\krafton_jungle\SketchCatch`
- Trivy is available locally as `0.72.0`.
- Focused API and web tests for the Trivy-backed pre-deployment check pass.
- `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass.
- Local Playwright smoke confirms `검사 실행` renders a HIGH public SSH Trivy finding and the `수정` button opens `main.tf:8`.

## Changes This Session

- Added a shared Trivy-backed pre-deployment analysis service for UI checks and deployment plan safety gates.
- Added Terraform file support to `/api/ai/pre-deployment-check`; UI calls this only after syntax/schema diagnostics pass.
- Added cached and concurrency-limited AI finding explanations for the UI path.
- Added deterministic deployment-plan safety analysis without AI calls.
- Added Trivy Terraform scan adapter and parser tests.
- Added `TRIVY_MISCONFIGURATION` warning code and kept IAM/RDS/S3/SSH mappings when safely classifiable.
- Enforced approval rejection for `blocksApproval` warnings and acknowledgement ids for acknowledgement-only warnings.
- Added API Docker image Trivy install and EC2/GitHub deploy `TRIVY_CACHE_DIR` wiring.
- Updated relevant docs and tests.

## Broken Or Unverified

- Full `pnpm test` is not green because of existing/unrelated web diagram editor source-shape tests. The first reproduced failure is `features/diagram-editor/DiagramNodeView.test.ts`, which expects legacy handle ids matching `source-handle-${handle.side}` while current source uses `source-${handle.id}`.
- Production deployment was not attempted.

## Verification

- `pnpm harness:check`
- `trivy --version`
- Local Trivy CLI smoke with a public SSH Terraform sample
- `pnpm --filter @sketchcatch/api exec tsx --test --test-reporter=dot src/services/terraform/trivy-terraform-scan.test.ts src/services/aiPreDeploymentCheck.test.ts src/routes/ai.test.ts src/deployments/deployment-safety-gate.test.ts src/deployments/deployment-approval-service.test.ts src/deployments/deployment-plan-service.test.ts`
- `pnpm --filter @sketchcatch/web exec tsx --test --test-reporter=dot features/workspace/api.test.ts features/workspace/pre-deployment-diagnostics.test.ts features/workspace/deployment-actions.test.ts features/workspace/workspace-right-panel-layout.test.ts`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- Local Playwright smoke on `http://localhost:3000/workspace`

## Best Next Action

- Run the final `pnpm harness:check`, then address the unrelated diagram editor tests if full-suite green is required before PR.
