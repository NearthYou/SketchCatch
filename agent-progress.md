# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/` and remain available in Git history.

## Current Verified State

- Branch `codex/ai-error-analysis-progress-v2` is based on the current `origin/dev` at `0e064877` and adds compact circular estimated progress to Workspace AI Terraform error analysis.
- The legacy `practice` Deployment profile is removed; `demo_web_service` is the default live profile, and imported migration `0054` rewrites legacy rows before removing the enum value.
- Live Observation renders bounded traffic motion, a task-count-responsive Fargate fleet, and collapsed operational analysis without development-only traffic or Task preview controls.
- Delayed first CloudWatch points retain request and capacity evidence, and stopped sessions no longer continue the countdown.
- The approved sandbox traffic run sent exactly 963 requests with 963 HTTP 200 responses. The failed observation acceptance triggered approved cleanup, and the `liveobs-7cccab4b` AWS resource set was verified absent.
- Deployment `57bda2bf-88af-4e15-8674-0b2ef20f1e8c` is `DESTROYED` with cleared state and current-plan pointers.
- Repository ECS delivery carries runtime Secret names through analysis. Both strict AI and Fixed Template drafts now generate `CHECK_IN_SIGNING_SECRET` during approved Apply, map the same Secrets Manager ARN into the IAM policy and every Task, and leave `INSTANCE_ID` unset for hostname-based observation.
- Windows subprocess, local environment isolation, generated architecture knowledge, resource catalog, typography, and Workspace source-contract regressions are repaired.
- Focused runtime-Secret, deployment-action, and failure-visibility regressions pass. `pnpm lint` and `pnpm typecheck` pass. Root `pnpm build` reported all five tasks successful but Turbo did not exit; direct Types/Config/UI/API/Web package builds all exited 0. The full `pnpm test` run still exposes two unchanged stale Live Observation source-contract failures and one unchanged lease-heartbeat cancellation.
- `feature_list.json` retains one separately owned aggregate `in_progress` item: `ARCHITECTURE-BOARD-COMPILER-409`.

## Session Record

### 2026-07-20 - Add compact AI error analysis progress

- Added a 44px circular progress gauge to the error-analysis card header with a numeric percentage and a visible estimated-state label.
- Combined elapsed time with completed-item counts for single and batch analysis, while capping an active request below 100% until the API actually completes.
- Added calculation, rendered accessibility, and Workbench integration regressions; all 33 focused checks pass.
- `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass. The full Web suite was also attempted and remains non-green only on unrelated current-`dev` Architecture Board, thumbnail, Diagram Editor, and Live Observation baselines.
- No dependency, lockfile, database migration, cloud, or deployment change was made.

### 2026-07-20 - Complete Fixed Template runtime Secret convergence

- Corrected the earlier diagnosis: the production runtime-Secret support was only applied to the strict AI Architecture path; Repository Fixed Template Board creation bypassed it.
- Passed Repository Analysis `runtime_secret` facts into Fixed Template generation and conditionally added generated password material, Secrets Manager Secret/Version, exact execution-role read policy, ECS Task secret mapping, and dependency edges.
- Added a fail-closed `full_stack` preparation guard that compares the confirmed build contract with the rendered Terraform and rejects missing or cross-wired runtime Secret references before Plan creation.
- Hid stale Apply Plan approval for non-`PENDING` deployments and kept the stored deployment failure summary visible from every Direct Deployment step.
- No migration or cloud mutation was performed.

### 2026-07-20 - Diagnose chaekang GitOps API health failure

- Reproduced GitHub run `29702236763` failing at `Preflight api_health` after the current production deployment.
- Compared it with successful `jh-9999/audience-live-check` run `29701336062`: the app workflows and checked-in Terraform are identical, while only the failing repository's API now requires `CHECK_IN_SIGNING_SECRET` in production.
- Verified the failing repository variables are populated and the OIDC release request succeeds; GitHub Actions configuration is not the failing boundary.
- Confirmed the checked-in Terraform task definition has no runtime Secret mapping. A local minimized execution of the failing repository throws `CHECK_IN_SIGNING_SECRET is required in production` without the value and succeeds with a 36-byte value.
- The signed-in SketchCatch session can access successful project `7b618d82` but gets an ownership-hiding 404 for failing project `4b06fa5d`, so the current account cannot re-analyze or update the failing project.
- Root cause: project `4b06fa5d` retains a pre-runtime-secret Repository Analysis and approved infrastructure artifact. It needs owner access, fresh analysis, and a newly approved Terraform Apply before another application release.
- Production diff `2da6ba32..8e72a20d` adds runtime-Secret support through `f00f1ce4`; it does not remove the release path. The failing `chaekang` repository has no earlier App workflow run, while the successful `jh-9999` comparator uses an API revision without the production signing-Secret requirement.

### 2026-07-20 - Verify repository runtime Secret fix on current dev

- Fast-forwarded local `dev` from `6db37d66` to `8e72a20d` and confirmed it matches `origin/dev`.
- Traced `chaekang/audience-live-check` run `29702236763`: GitHub variables and OIDC succeeded, while the API container exited during `api_health` because production startup required `CHECK_IN_SIGNING_SECRET`.
- Confirmed merged commit `f00f1ce4` already fixes this contract by detecting the Secret name, injecting an isolated preflight placeholder, and generating an approved Secrets Manager/ECS Task mapping for runtime.
- Focused verification passed: 99 API tests across preflight, Repository Analysis, Terraform rendering, and safety; 18 Web deployment-target tests.
- No duplicate production-code change was made. Production still requires the current `dev` deployment followed by Repository re-analysis and a newly approved deployment plan for the affected project.
- Production ECS workflow run `29703545489` completed successfully from remote `dev` SHA `8e72a20d`; validation, API/Web image builds, worker task registration, and API/Web service stabilization all passed.
- Post-deployment smoke checks passed: `https://sketchcatch.net/health` returned `{\"status\":\"ok\"}`, and `/` plus `/workspace` returned HTTP 200. No production DB migration was required or run.

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

- Error-analysis percentage is an elapsed-time estimate because the current AI endpoint does not expose server-side progress; the active item rises from 8% to 94% and disappears only on the real completion state.
- Existing saved Project Drafts are not rewritten. The affected project must be re-analyzed and its Fixed Template Board regenerated before preparing a new deployment.
- Root `pnpm test` is not green because unchanged baseline tests fail in `live-observation-modal-contract.test.ts` (two stale source markers) and `application-artifact-registry.test.ts` (one cancelled lease-heartbeat test).
- End-to-end Live Observation animation and provider-confirmed scale-out remain unaccepted because the active UI session missed the traffic before the delayed-snapshot fix.
- Automatic cleanup remains blocked for this credential layout until the approved cleanup operator can read the internal deployment-state object.
- No new AWS resources or traffic may be created without a new explicit approval.

## Next Action

1. Deploy the reviewed `dev` commit through the normal production workflow; no DB migration is required.
2. Sign in as the owner of project `4b06fa5d`, re-analyze the current repository revision, regenerate the Fixed Template Board, and prepare a new Plan for explicit approval.
3. Observe the compact gauge against a real delayed error-analysis response and consider server-reported stages only if the API contract later exposes them.
