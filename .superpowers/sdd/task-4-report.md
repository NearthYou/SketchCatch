# Task 4 RED/GREEN Report

## Status

Complete. Pipeline Runs are discovered from read-only GitHub Actions data, grouped by commit SHA, classified against segment-safe monitored paths, and persisted idempotently with six deterministic stages and masked logs.

## RED evidence

1. `pnpm --dir apps/api exec tsx --test src/git-cicd/git-cicd-pipeline-run-service.test.ts`
   - Failed with `ERR_MODULE_NOT_FOUND` for `git-cicd-pipeline-run-service.js` before the classifier existed.
2. `pnpm --dir apps/api exec tsx --test src/source-repositories/github-app-client.test.ts`
   - Failed because `listBranchWorkflowRuns` and `readWorkflowJobLog` did not exist.
3. `pnpm --dir apps/api exec tsx --test src/git-cicd/github-actions-run-provider.test.ts`
   - Failed with `ERR_MODULE_NOT_FOUND` before the provider existed.
4. The service persistence tests then failed because `createGitCicdPipelineRunService` was not exported.

Each failure was caused by the intended missing behavior rather than a typo or test setup error.

## GREEN implementation

- Added segment-safe app/infra change classification, including negative coverage for `apps/web-old` and `infra/terraform-old`.
- Added focused GitHub read models and GET-only calls for branch workflow runs, commit files, workflow jobs, and job logs.
- Reused `maskDeploymentMessage` in the GitHub client, provider, persistence input, and response paths.
- Grouped only exact `SketchCatch Infra` and `SketchCatch App` workflows by commit SHA.
- Mapped known job names to app build/deploy, Terraform plan/apply, and verify stages. Unknown jobs keep a null stage association rather than inventing semantics.
- Read job logs only after job completion so an unavailable in-progress log archive cannot turn a valid running snapshot stale.
- Added one `(sourceRepositoryId, commitSha)` run upsert, six `(pipelineRunId, kind)` stage upserts, and deterministic log replacement by sequence in one database transaction.
- Preserved prior status and `lastRefreshedAt` on provider failure and returned `stale: true` with a stable message.
- Added injected provider/fetch and in-memory persistence fakes; no external GitHub request or real database migration was run.

## Verification

- Focused pipeline/client tests: 29 passed.
- `pnpm --filter @sketchcatch/api typecheck`: passed.
- `pnpm --filter @sketchcatch/api lint`: passed with one pre-existing `setNow` warning.
- `pnpm build`: passed (5 packages).
- `pnpm harness:check`: passed before and after implementation.
- `git diff --check`: passed with CRLF conversion warnings only.

## Concerns

- The PostgreSQL transaction was typechecked and exercised through its repository contract, but no real database migration or database integration run was performed, as required by the task.
- GitHub Actions job-to-stage mapping deliberately recognizes only Plan, Apply, Build, Deploy, and Verify names within the two exact SketchCatch workflows. Expanding workflow semantics should be a planned contract change.
- No GitHub, AWS, Terraform, deployment, or repository mutation occurred.

## Reviewer Fixes RED/GREEN

### RED

The combined focused suite produced five expected failures:

- The exact generated App job `release` mapped to a null stage instead of its real steps.
- An older failed workflow attempt overrode a successful rerun.
- A queued run was reported as running.
- Runs, jobs, and commit files stopped after one page (`1` result instead of `101`).
- The same immutable commit files were fetched twice, and the second lookup failure made the refresh stale.

### GREEN

- Extended the focused GitHub job model with real step names and states. The existing generated steps map exactly as follows: `Upload release artifact` to `app_build`, `Refresh Auto Scaling Group` to `app_deploy`, and `Verify URLs` to `verify`. No stage is marked successful unless its corresponding GitHub step succeeded.
- Consolidated workflow reruns by `(commitSha, workflowName)` using `run_attempt`, then `updated_at`, then run id. Only the selected attempt supplies jobs, logs, URLs, and aggregate status.
- Implemented explicit queued, running, succeeded, skipped, cancelled, and failed stage semantics. All unrecognized completed conclusions fail closed; unknown nonterminal stage states remain `not_started` rather than being fabricated as running.
- Added complete `per_page=100&page=N` pagination for branch workflow runs, workflow jobs, and commit files, with two-page 101-item regression coverage for each endpoint.
- Added repository lookup of existing commit SHAs/scopes before immutable file discovery. Two refreshes perform two repository existence lookups but only one provider commit-file lookup, and the second refresh remains fresh.
- Reviewer-fix focused suite: 34 tests passed. API typecheck and lint passed; lint retains the pre-existing `setNow` warning.

### Deferred Minor

- `run_started_at` remains based on the GitHub workflow run `created_at` field. A separate follow-up may adopt a more precise provider timestamp if the GitHub contract and stored model are expanded; this minor issue was recorded and not changed here.

## Final Important Fixes RED/GREEN

### RED

- Mixed `failed + in_progress` workflows incorrectly aggregated to `failed` instead of remaining `running`.
- A distinct older run with `run_attempt=2` incorrectly beat a newer distinct run with `run_attempt=1`.

### GREEN

- Aggregate status now gives active selected workflows precedence: `in_progress` wins as `running`, then queued-like states win as `queued`; terminal failed/cancelled/succeeded evaluation occurs only after every selected workflow is terminal.
- Added mixed Infra/App regressions for failed/running, cancelled/running, failed/queued, failed/success, cancelled/success, and success/success combinations.
- `run_attempt` is compared only for the same GitHub run id. Distinct runs are ordered by `updated_at`, then `created_at`, then numeric run id.
- Replaced the unsafe distinct-id attempt test with a same-id rerun test and a newer-distinct-id attempt-one regression.
- Final focused suite: 36 tests passed. The deferred `run_started_at` Minor remains unchanged.
