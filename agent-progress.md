# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/` and remain available in Git history.

## Current Verified State

- Branch `fix/sw/live-observation-deployment-picker-layering` includes `origin/dev` through `ad1464ba` after resolving the active merge conflicts.
- The legacy `practice` Deployment profile is removed; `demo_web_service` is the default live profile, and imported migration `0054` rewrites legacy rows before removing the enum value.
- Live Observation renders bounded traffic motion, a task-count-responsive Fargate fleet, and collapsed operational analysis without development-only traffic or Task preview controls.
- Delayed first CloudWatch points retain request and capacity evidence, and stopped sessions no longer continue the countdown.
- The approved sandbox traffic run sent exactly 963 requests with 963 HTTP 200 responses. The failed observation acceptance triggered approved cleanup, and the `liveobs-7cccab4b` AWS resource set was verified absent.
- Deployment `57bda2bf-88af-4e15-8674-0b2ef20f1e8c` is `DESTROYED` with cleared state and current-plan pointers.
- Repository ECS delivery carries runtime Secret names through analysis, uses an isolated preflight placeholder, generates `CHECK_IN_SIGNING_SECRET` during approved Apply, maps its Secrets Manager ARN into every Task, and leaves `INSTANCE_ID` unset for hostname-based observation.
- Windows subprocess, local environment isolation, generated architecture knowledge, resource catalog, typography, and Workspace source-contract regressions are repaired. Focused tests pass; final merged-result checks are pending.
- `feature_list.json` retains one separately owned aggregate `in_progress` item: `ARCHITECTURE-BOARD-COMPILER-409`.

## Session Record

### 2026-07-20 - Integrate current dev before PR

- Merged `origin/dev` through `ad1464ba`, retaining both the runtime Secret delivery contract and the removal of the legacy `practice` profile.
- Adapted runtime Secret safety tests to the current `demo_web_service` profile without weakening generated-secret or least-privilege IAM validation.
- Preserved the imported profile-removal migration and UI refinements without editing their migration files.

### 2026-07-20 - Repair repository verification baseline

- Made the shared contract test invoke `pnpm` correctly on Windows and isolated API tests from local `.env` values.
- Regenerated Architecture Board knowledge and aligned Repository ECS, Workspace, typography, and resource-catalog tests with current behavior.
- Kept schema-less Terraform items visible but disabled until an editable parameter contract exists.

### 2026-07-20 - Add repository runtime-secret delivery contract

- Added names-only runtime Secret evidence, isolated preflight placeholders, Terraform-generated signing material, Secrets Manager storage, exact execution-role read access, and ECS Task Definition secret mapping.
- Preserved the approved Secret mapping across application releases while replacing only the image.
- Removed the fixed `INSTANCE_ID=fargate` value so hostname fallback can identify distinct Tasks.

### 2026-07-20 - Exercise and fail closed the Live Observation traffic run

- Sent the approved maximum of 963 bounded requests; all returned HTTP 200 and no additional traffic was generated.
- Retained delayed CloudWatch evidence, stopped inactive countdowns, and removed temporary development controls.
- Completed approved manual cleanup after automatic Destroy could not read internal Terraform state, then verified the scoped AWS resources absent.

## Known Risk

- End-to-end Live Observation animation and provider-confirmed scale-out remain unaccepted because the active UI session missed the traffic before the delayed-snapshot fix.
- Automatic cleanup remains blocked for this credential layout until the approved cleanup operator can read the internal deployment-state object.
- No new AWS resources or traffic may be created without a new explicit approval.

## Next Action

1. Complete the merged-result harness, lint, typecheck, build, and test checks.
2. Push this focused branch and open a Korean PR against `dev`.
3. Re-analyze `audience-live-check` only after merge; obtain separate explicit approval before any future Apply or traffic run.
