# Session Handoff

Use this file only for compact continuation context. Write it in English and reference durable artifacts instead of repeating them.

## Currently Verified

- Branch: `fix/sw/live-observation-deployment-picker-layering`; the latest Live Observation work is local and unpushed.
- The selected Deployment manifest is adapter-v4 `valid`. Delayed first CloudWatch points retain request and ECS capacity evidence, and stopped sessions do not keep counting down.
- The approved traffic cap is exhausted: exactly 963 requests were sent, all returned HTTP 200, and no scale-out was observed during the immediate provider check.
- The failed UI observation triggered approved fail-closed cleanup. All `liveobs-7cccab4b` resources were verified absent in account `614935468487`, region `ap-northeast-2`.
- Deployment `57bda2bf-88af-4e15-8674-0b2ef20f1e8c` is `DESTROYED` with state and current-plan pointers cleared.
- Development-only traffic and Task preview buttons were removed from the Live Observation header.
- Verification passes: harness, API Live Observation 64/64, Web Live Observation 71/71, lint, typecheck, build, and diff checks.
- Repository ECS analysis records runtime Secret names only. Preflight injects isolated placeholders; approved Terraform Apply generates `CHECK_IN_SIGNING_SECRET`, stores it in Secrets Manager, grants the ECS execution role exact read access, and maps its ARN into every Task.
- Fixed `INSTANCE_ID` injection is removed for this strict Repository ECS path so hostname-based `servedBy` can identify distinct Tasks. Stateless repository evidence keeps bounded Fargate capacity 1–3.

## Changes This Session

- Fixed target-tracking block materialization, delayed first-snapshot evidence, and stopped-session countdown behavior.
- Removed temporary development-only preview controls while preserving bounded real traffic particles and capacity forecasts.
- Exercised the approved 963-request run and completed manual verified cleanup after automatic Destroy Plan could not read internal Terraform state.
- Added and verified the names-only Secret analysis, preflight placeholder, deployment Secret ARN mapping, release-clone preservation, and hostname-based instance identity contract. No AWS mutation was performed.

## Broken Or Unverified

- End-to-end traffic animation and scale-out remain unaccepted because the original active session missed the traffic before the delayed-snapshot fix.
- Automatic cleanup remains blocked for this credential layout unless the approved cleanup operator can read the internal deployment-state object.
- Root `pnpm test` stops at the unchanged baseline `packages/types/src/git-cicd-readiness-contract.test.ts:117` assertion (`null !== 0`).
- Focused tests for Secret analysis/preflight/deployment mapping and scaling pass; lint, typecheck, build, and diff checks pass.
- Do not generate more traffic or recreate AWS resources without a new explicit approval.

## Best Next Action

1. Re-analyze the updated audience repository, inspect the Terraform preview, and obtain a new explicit approval before Apply.
2. Fix the internal state-storage cleanup credential path before any future approved sandbox cycle.

## Suggested Skills

- Use `review` for the focused UI/test diff before publication.
- Use `qa` to repeat browser regressions if the implementation changes.
