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
