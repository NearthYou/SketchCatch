# Task 4 Report — Immutable Deployment Architecture GET API

## Outcome

Implemented the owner-scoped, immutable Deployment Architecture read path:

- `getDeploymentLiveObservationArchitecture(input, repository)` first calls `getDeployment` so inaccessible deployments remain hidden as `404`.
- The service loads `deployment.architectureId` through `findArchitectureInProject`; it never reads the mutable project draft.
- The service returns the saved `ArchitectureJson` together with the Deployment ID, Architecture ID, and approved Terraform artifact SHA-256.
- Missing Architecture snapshots map to `404`; missing or malformed 64-character hexadecimal approval hashes map to `409`.
- `GET /api/deployments/:deploymentId/live-observation-architecture` is always registered and performs no AWS SDK or Terraform operation.

## Files

Task 4 changes:

- `apps/api/src/deployments/deployment-service.ts`
  - Consumes `DeploymentLiveObservationArchitectureResponse`.
  - Adds `getDeploymentLiveObservationArchitecture`.
- `apps/api/src/routes/deployments.ts`
  - Adds the authenticated GET route and existing deployment error mapping.
- `apps/api/src/routes/deployments.test.ts`
  - Adds focused route coverage for immutable snapshot success, owner isolation, missing Architecture, and invalid approved hash.
- `.superpowers/sdd/task-4-report.md`
  - This handoff report.

Consumed but not edited by Task 4:

- `packages/types/src/index.ts`
  - Concurrent Task 1 added `DeploymentLiveObservationArchitectureResponse` in the shared worktree.

Existing unrelated changes in `apps/api/src/routes/deployments.ts` and `apps/api/src/routes/deployments.test.ts` (the `prepareProjectBuildEnvironment` `architectureId` work) were preserved.

## Commands and Results

Startup requirement:

```bash
pnpm harness:check
```

Result: PASS (`Harness check passed.`)

RED verification after adding the focused tests and before registering the route:

```bash
pnpm --filter @sketchcatch/api exec tsx --test --test-name-pattern="live-observation-architecture" src/routes/deployments.test.ts
```

Result: expected FAIL, 0 passed / 4 failed. Every request reached Fastify's unregistered-route `404` behavior.

GREEN verification after the implementation:

```bash
pnpm --filter @sketchcatch/api exec tsx --test --test-name-pattern="live-observation-architecture" src/routes/deployments.test.ts
```

Result: PASS, 4 passed / 0 failed.

Final verification after nullable-hash type narrowing:

```bash
pnpm --filter @sketchcatch/api exec tsx --test --test-name-pattern="live-observation-architecture" src/routes/deployments.test.ts
```

Result: PASS, 4 passed / 0 failed.

No broad test suite, lint, typecheck, or build command was run because the task explicitly limited verification to focused route tests. No test outside `src/routes/deployments.test.ts` was run.

## Self-review

- Spec: all Task 4 response fields and error boundaries are covered.
- Ownership: the service reuses `getDeployment`; Architecture lookup occurs only after the Project access check succeeds.
- Immutability: the success test makes draft access throw, yet the route returns the persisted Architecture snapshot.
- Side effects: the route only reads the deployment, owning project, and Architecture snapshot; no feature flag, cloud gateway, Terraform runner, or draft repository is involved.
- Scope: no schema, migration, Terraform, certificate, shared type, harness tracker, progress, or handoff file was edited by Task 4.
- Shared dirty files: unrelated hunks in both route files were left intact.

No Task 4 correctness or scope finding remains from self-review.

## Concerns / Handoff

- The response type is supplied by concurrent Task 1 and is currently an uncommitted shared-worktree dependency. Task 4 must land with that shared type.
- Focused `tsx --test` execution transpiles and runs the route tests but is not a substitute for the repository's full lint/typecheck/build gates. The root integrator should run the broader required checks after all concurrent tasks settle.
- Per instruction, nothing was staged or committed.

## Integration Follow-up — ResourceType Fixture

The success fixture originally used `type: "S3_BUCKET"`, which is not part of the shared `ResourceType` contract. Only that fixture value was changed to the valid `type: "S3"`; production behavior was unchanged.

RED reproduction before the fixture change:

```bash
pnpm --filter @sketchcatch/api typecheck
```

Result: expected FAIL with `TS2322` at `src/routes/deployments.test.ts(1848,56)`, specifically reporting that `"S3_BUCKET"` is not assignable to `ResourceType`.

Final focused route verification:

```bash
pnpm --filter @sketchcatch/api exec tsx --test --test-name-pattern="live-observation-architecture" src/routes/deployments.test.ts
```

Result: PASS, 4 passed / 0 failed.

Final API type verification:

```bash
pnpm --filter @sketchcatch/api typecheck
```

Result: PASS (`tsc --noEmit -p tsconfig.json`, exit code 0).

This follow-up supersedes the earlier statement that typecheck was not run: API typecheck now passes. Full lint and build remain intentionally unrun. Nothing was staged or committed.
