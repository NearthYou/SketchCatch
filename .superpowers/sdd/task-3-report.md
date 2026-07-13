# Task 3 RED/GREEN Report

## Scope

Implemented repository CI/CD monitoring settings for issue #361: durable defaults, path normalization, read-only GitHub validation, strict GET/PUT routes, handoff gating, and validated workflow path triggers.

## RED evidence

1. `pnpm --dir apps/api exec tsx --test src/git-cicd/git-cicd-monitoring-service.test.ts`
   - Failed with `ERR_MODULE_NOT_FOUND` for the new monitoring service.
2. `pnpm --dir apps/api exec tsx --test src/source-repositories/github-app-client.test.ts`
   - Three new tests failed because `validateRepositoryBranch` and `validateRepositoryDirectory` did not exist.
3. `pnpm --dir apps/api exec tsx --test src/routes/git-cicd-handoffs.test.ts`
   - Three monitoring route tests failed with HTTP 404.
4. `pnpm --dir apps/api exec tsx --test src/git-cicd/git-cicd-workflows.test.ts`
   - Failed because the infra workflow still rendered the hard-coded generated Terraform path.
5. `pnpm --dir apps/api exec tsx --test --test-name-pattern="blocked until monitoring" src/routes/git-cicd-handoffs.test.ts`
   - Failed because handoff creation returned 201 for a `required` monitoring config instead of 409.
6. `pnpm --dir apps/api exec tsx --test src/git-cicd/git-cicd-workflows.test.ts`
   - Failed because the new app push event did not satisfy the release job condition.

## GREEN result

- Root paths normalize to `.`; subdirectories normalize separators and reject empty, absolute, scheme-prefixed, and traversal paths.
- GET creates a durable enabled/default-branch/root-path config with `validationStatus: required` when the active accessible repository has no row.
- Disabled PUT persists normalized RDS values as `required` without provider reads.
- Enabled PUT validates branch and both directories using read-only GitHub App calls, with stable missing/file/permission error codes.
- Handoff creation requires an enabled, valid monitoring config and a matching validated branch before invoking the provider.
- Approved `appPath` and `infraPath` feed workflow push filters; app push events can execute the release job.
- Workflow file writes remain inside the existing explicit handoff/provider operation. No real GitHub, AWS, or Terraform mutation ran.

## Verification

- Focused service, client, route, and workflow tests: 62 passed, 0 failed.
- `pnpm --filter @sketchcatch/api typecheck`: passed.
- `pnpm --filter @sketchcatch/api lint`: passed with one pre-existing `setNow` warning in `live-observation-store-contract.ts`.
- `pnpm build`: passed (5/5 packages); Next.js emitted the existing multiple-workspace-root warning.
- `pnpm harness:check`: passed.
- `git diff --check`: passed (line-ending conversion warnings only).

## Review

No secrets, network calls outside injected fetch fakes, dependency changes, schema changes, or direct infrastructure/Git mutations were introduced. Evaluator result: Accept; all safety hard-fail conditions are absent.
