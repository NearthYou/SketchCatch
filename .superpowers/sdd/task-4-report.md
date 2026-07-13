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
