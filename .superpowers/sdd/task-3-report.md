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

## Important review fixes

### RED

1. `pnpm --dir apps/api exec tsx --test --test-name-pattern="does not require GitHub App" src/routes/git-cicd-handoffs.test.ts`
   - Disabled PUT through the real default-provider path returned HTTP 500 when GitHub App environment variables were absent; expected 200.
2. `pnpm --dir apps/api exec tsx --test --test-name-pattern="concurrent default insert" src/git-cicd/git-cicd-monitoring-service.test.ts`
   - GET returned and persisted the default `required` config instead of preserving the concurrent `valid` winner.

### GREEN

- The route now passes the default GitHub monitoring provider as a factory. The service resolves that factory only after the disabled persistence early return, so disabled PUT does not read GitHub App configuration.
- `ensureDefaultConfig` now performs `INSERT ... ON CONFLICT DO NOTHING` and then reads the winning row. GET no longer uses the overwrite-capable PUT upsert path.
- The disabled/no-env route regression and concurrent validated-winner regression both pass.
- Focused service, client, route, and workflow tests: 64 passed, 0 failed.
- API typecheck passed.
- API lint passed with the same pre-existing `setNow` warning.
- Full build passed for 5/5 packages; the existing Next.js workspace-root warning remains.
- Final `pnpm harness:check` and `git diff --check` passed.
- No real GitHub, AWS, Terraform, or repository mutation ran.
