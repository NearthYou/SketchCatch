# AWS Access Task 4 Report

## Seam A — bounded import-access probe

### RED

- Required four-file command: 27 passed, 2 failed.
- Expected failures were the missing `aws-import-access-probe` module and missing
  `nextActionForRecord` export.
- Review-driven RED: the probe test failed on missing Lambda/S3 bounded primitives.
- Lease-driven RED: 16 passed, 2 failed because concurrent checks both probed and a non-target
  Policy did not gate the probe.

### GREEN

- `pnpm --filter @sketchcatch/api exec tsx --test src/aws-connections/aws-import-access-probe.test.ts src/aws-connections/aws-import-access-service.test.ts src/aws-connections/aws-connection-service.test.ts src/reverse-engineering/aws-reverse-engineering-gateway.test.ts`
  — 67/67 passed.
- `pnpm --filter @sketchcatch/api exec tsc --noEmit` — passed after the concurrently owned
  gateway changes settled.
- Owned API ESLint files — passed.
- `pnpm --filter @sketchcatch/types typecheck` — passed.
- `git diff --check` — passed.

### Files

- `apps/api/src/aws-connections/aws-import-access-catalog.ts`
- `apps/api/src/aws-connections/aws-import-access-probe.ts`
- `apps/api/src/aws-connections/aws-import-access-probe.test.ts`
- `apps/api/src/aws-connections/aws-import-access-repository.ts`
- `apps/api/src/aws-connections/aws-import-access-service.ts`
- `apps/api/src/aws-connections/aws-import-access-service.test.ts`
- `packages/types/src/index.ts`

### Self-review

- The production executor registry has exactly the 15 literal catalog keys and runs them
  sequentially with one shared successful AssumeRole credential object.
- Every list/search call is bounded to its first response and detail reads use at most the first
  seed resource. Empty lists succeed.
- Resource Explorer uses `GetDefaultView -> GetView -> Search`; missing setup, access denial, and
  transient errors remain distinct safe outcomes, and Search `ResourceNotFound` is transient.
- AssumeRole provider/SSO/expiry and unknown network failures become safe retries; explicit target
  Role trust/identity failures require connection settings.
- Lambda policy absence and common S3 optional configuration absence prove readable access instead
  of creating false limited states.
- Read checks claim a row lease and operation ID before inspection/probing, require exact target
  Manager and Policy state, and finish with an operation CAS. Concurrent checks run one probe.
  A 90-second AbortSignal deadline is below the dedicated five-minute read-operation lease and is
  bound to every production probe SDK and signed Query request. Exact Manager/Policy inspection
  runs before that probe deadline and keeps the AWS SDK's own timeout/retry behavior; it is not
  raced in a way that could leave a background inspection mutating command state.
- A new claim and any failed exact-state gate clear prior read summaries so stale readiness cannot
  appear beside a retry/connection state.
- Persisted summaries contain only `serviceKey -> safe outcome`; public labels come from the catalog.
  Provider errors, request IDs, paths, and ARNs are not persisted or returned.
- No schema/migration, dependency, or AWS mutation change belongs to this seam.

### Concerns

- None in Seam A after review fixes.

## Seam B — complete reverse-reader pagination with safe partial results

### RED

- Later-page failures originally discarded earlier items or stopped ECS before describing the
  accumulated cluster/service seeds.
- Explicit AWS SDK readers, EC2/RDS signed Query readers, S3 `ListBuckets`, and AMI discovery had
  missing continuation paths.
- Review-driven RED covered a provider returning the same opaque token repeatedly and the bounded
  `DescribeImages` page size.

### GREEN

- `pnpm --filter @sketchcatch/api exec tsx --test src/reverse-engineering/aws-reverse-engineering-gateway.test.ts`
  — 23/23 passed.
- One shared collector retains accumulated items and returns one safe classified diagnostic on a
  later-page error or repeated token. Provider errors and tokens are never returned.
- Every explicit SDK reader follows its native continuation field. ECS continues describing all
  accumulated seeds and deduplicates shared task definitions.
- All six EC2 signed Query readers and the RDS reader sign only allowlisted `NextToken`/`Marker`
  parameters, URL-encode opaque values, and parse only their pagination fields.
- S3 uses bounded `ListBuckets` pagination and AMI discovery uses `MaxResults: 1000` plus
  `NextToken`.

### Files

- `apps/api/src/reverse-engineering/aws-reverse-engineering-gateway.ts`
- `apps/api/src/reverse-engineering/aws-reverse-engineering-gateway.test.ts`
- `apps/api/src/reverse-engineering/aws-reverse-engineering-query.ts`
- `apps/api/src/reverse-engineering/aws-reverse-engineering-parsers.ts`

## Seam C — exact cleanup and connection-deletion guard

### RED

- Cleanup could complete after Stack disappearance while exact IAM artifacts still lingered.
- A replacement Stack or a final unproven AccessDenied could be mistaken for prior verified
  cleanup.
- Connection deletion did not recheck import-access state at preview, claim/retry, and final
  transaction boundaries.
- Review found that a read-only Settings GET created `check_required`, which then blocked deletion
  despite the user never starting import-access setup.

### GREEN

- Cleanup inspects stored exact Stack identities and expected artifacts in Policy-then-Manager
  order. Only the caller deletes customer Stacks; the gateway exposes no `DeleteStack` operation.
- Stack absence with lingering Policy or Manager artifacts remains `cleanup_required`; a final
  AccessDenied is accepted only after the persisted exact Manager-cleanup marker.
- Deletion permits only no child row or `cleanup_complete`, rechecks the guard on fresh/retry claim,
  and locks/rechecks both rows in the final transaction. A `cleanup_complete` child is deleted
  atomically before its parent connection.
- `getState` now performs a non-mutating repository lookup and synthesizes public
  `check_required` only when no row exists. Mutating commands remain the only row creators.
- `retry_required` actions use `operationKind` first and a bounded safe-error-code table only as a
  legacy fallback.

### Files

- `apps/api/src/aws-connections/aws-import-access-gateway.ts`
- `apps/api/src/aws-connections/aws-import-access-gateway.test.ts`
- `apps/api/src/aws-connections/aws-import-access-repository.ts`
- `apps/api/src/aws-connections/aws-import-access-service.ts`
- `apps/api/src/aws-connections/aws-import-access-service.test.ts`
- `apps/api/src/aws-connections/aws-connection-service.ts`
- `apps/api/src/aws-connections/aws-connection-service.test.ts`
- `apps/api/src/routes/aws-connections.test.ts`

## Final verification

- Focused Task 4 suite (probe, import gateway/service, deletion service, reverse gateway, and both
  route suites) — 118/118 passed.
- `pnpm --filter @sketchcatch/api typecheck` — passed.
- `pnpm --filter @sketchcatch/api lint` — passed.
- `pnpm --filter @sketchcatch/types typecheck` — passed.
- `pnpm harness:check` — passed.
- `git diff --check` — passed.
- Full API suite was sampled as an additional non-gating check: 1511 tests passed; seven unrelated
  existing/worktree failures remained (schema contract, missing local `zstd`, and AI draft tests),
  and the long-running app test was interrupted after three minutes. None touched Task 4 files or
  failed in the focused 118-test suite.

## Commits

- `ca4aa179` — preserve safe partial reverse-reader pagination.
- `6410e9d9` — bounded import-access read probe and status/lease handling.
- `c6760a97` — exact cleanup and connection-deletion boundaries.
- `c13b7864` — complete EC2/RDS Query, S3, and AMI pagination.
- `dca5737a` — stop repeated pagination tokens safely.
- `a395a60d` — make state GET read-only and map operation-specific retries.

## Remaining cross-seam note

- Settings must expose `prepareCleanup` for persisted setup states where a user can stop after AWS
  artifacts exist. Task 5 owns that UI entry point and received the exact status contract;
  synthesized/no-row `check_required` intentionally does not show cleanup.
- Task 4 adds no schema, migration, dependency, generated artifact, or customer-side delete call.
