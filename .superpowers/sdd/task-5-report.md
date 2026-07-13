# Task 5 TDD Report: Pipeline Run HTTP APIs

## RED

- Added authenticated route expectations for Pipeline Run list, detail, logs, and refresh.
- Ran `pnpm --dir apps/api exec tsx --test src/routes/git-cicd-handoffs.test.ts`.
- Observed the expected failure: the first new endpoint returned `404 Route not found` (28 existing tests passed, 1 new test failed).
- Expanded the RED coverage to pagination, strict validation, ownership, history after monitoring is disabled, incremental logs, and read-only refresh; all four new route cases failed because the routes were absent.

## GREEN

- Added strict Zod params/query parsing, default `limit=20`, maximum `limit=50`, newest-first cursor pagination, typed ISO DTO mapping, and `sinceSequence` log reads.
- Added a monitoring-independent `findPipelineRun`/`getPipelineRun` read path so persisted history remains readable after monitoring is disabled or invalid.
- Kept refresh behind the existing enabled-and-valid refresh target and mapped missing or inaccessible runs to the same stable 404 response.
- Composed the handoff, pipeline-status, and Pipeline Run providers around one lazy shared GitHub App client. App startup and non-GitHub requests do not require GitHub App configuration.
- Corrected test environment cleanup so an originally absent `SKETCHCATCH_PUBLIC_BASE_URL` is deleted instead of restored as the string `undefined`.

## Verification

- `pnpm --dir apps/api exec tsx --test src/app.test.ts src/routes/git-cicd-handoffs.test.ts src/git-cicd/git-cicd-pipeline-run-service.test.ts` — PASS, 49/49.
- GitHub App environment removed + `buildApp()` / `GET /health` smoke — PASS.
- `pnpm --filter @sketchcatch/api typecheck` — PASS.
- `pnpm --filter @sketchcatch/api lint` — PASS with one pre-existing `setNow` warning.
- `pnpm --filter @sketchcatch/api build` — PASS.
- `pnpm lint` — PASS with the same pre-existing warning.
- `pnpm typecheck` — PASS.
- `pnpm build` — PASS.

No real GitHub, Git, deployment, Terraform, AWS, or database mutation was executed. Route tests used injected fakes.

## Important Review Fixes — RED

- Added service and route regressions for repository-owned `limit + 1` pagination, project-scoped unknown/foreign cursors, insertion between pages, explicit stale refresh metadata, and a disabled refresh target.
- Ran the focused service and route suite and observed 6 expected failures: the service returned an unpaged array, invalid cursors returned empty 200 responses, refresh-unavailable used no typed error, refresh responses omitted stale metadata, and the route performed two refresh-target lookups.

## Important Review Fixes — GREEN

- Moved `(createdAt, id)` descending keyset pagination into the PostgreSQL repository and service. The repository resolves cursors inside the requested project, selects only `limit + 1` runs, and loads stages only for those selected run IDs.
- Added stable `GitCicdPipelineRunInvalidCursorError` and 400 mapping for unknown or foreign cursors; blank cursors remain strict Zod 400 responses.
- Added shared `GitCicdPipelineRunRefreshResponse` with sanitized stale-state metadata and documented the contract in `docs/data-models.md`.
- Made `refreshPipelineRun` the single refresh-target lookup and authorization operation. Disabled, invalid, missing, or inaccessible refresh targets now throw a typed error mapped to the stable Pipeline Run 404.
- Re-ran the app, service, and route suite: PASS, 53/53.
