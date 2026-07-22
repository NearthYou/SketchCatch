# Task 5 implementation report

## Outcome

Implemented the read-only deployed Architecture observation model, Architecture API client,
full React Flow map, aggregate provider-state copy, and fixed/Auto Scaling evidence labels.

No files were staged or committed. `LiveObservationModal.tsx`, `packages/types`, the API server,
harness/progress files, Terraform, DB schema/migrations, certificates, and deployment resources were
not edited by Task 5.

## Files changed

- `apps/web/features/workspace/api.ts`
  - Added `getLiveObservationArchitecture(deploymentId, signal)` for the authenticated immutable
    Architecture response endpoint.
  - Preserved the unrelated concurrent AWS connection settings hunk.
- `apps/web/features/workspace/live-observation-architecture.ts`
  - Converts `ArchitectureJson` with `convertArchitectureJsonToDiagramJson`.
  - Validates that every original Architecture Resource ID remains in the diagram.
  - Restores every original Architecture edge ID and exact source/target after presentation
    conversion, including containment edges omitted by the normal editor presentation.
  - Uses the exact seven-resource observable allowlist from the brief.
  - Maps the one provider snapshot state to `observed`, `delayed`, or `unavailable`; before a
    provider observation, supported nodes are `configured`.
  - Keeps unsupported Resources visible as `not_supported`.
  - Labels ECS Architectures without ASG/Application Auto Scaling Resources as `고정 용량`.
- `apps/web/features/workspace/live-observation-architecture.test.ts`
  - Covers original Resource/edge preservation, configured and unsupported states, aggregate
    state mapping, and fixed/Auto Scaling Architecture labels.
- `apps/web/features/workspace/LiveObservationDiagramMap.tsx`
  - Replaced the focused synthetic path view with the full Architecture React Flow map.
  - Forces `nodesDraggable={false}`, `nodesConnectable={false}`,
    `elementsSelectable={false}`, and `fitView`.
  - Shows icons, labels, original Architecture resource types, and observation badges.
  - Renders every model edge with animation disabled.
  - States explicitly that badges show one AWS session aggregate and are not per-Resource API
    success evidence.
  - Contains no request particles or unverified Resource bindings.
- `apps/web/features/workspace/live-observation.ts`
  - Added `capacityModeLabel` and `capacityDetailLabel`.
  - Uses desired capacity for fixed ECS and max capacity for Auto Scaling.
  - Preserves last numeric values for `delayed`; only `unavailable` blanks numeric evidence.
  - Preserved the unrelated concurrent Terraform Output URL fallback hunk.
- `apps/web/features/workspace/live-observation-provider-evidence.test.ts`
  - Covers fixed capacity, Auto Scaling, delayed value retention, and unavailable numeric blanks.
- `apps/web/features/workspace/workspace.module.css`
  - Added the full-map header, React Flow canvas, resource/area node, and state-badge styles.

## TDD evidence

RED:

```bash
pnpm --filter @sketchcatch/web exec tsx --test \
  features/workspace/live-observation-architecture.test.ts
```

Result: expected FAIL because `live-observation-architecture.js` did not exist.

```bash
pnpm --filter @sketchcatch/web exec tsx --test \
  features/workspace/live-observation-provider-evidence.test.ts
```

Result: expected FAIL, 0/4. Capacity labels were absent and delayed evidence was blanked.

GREEN/final focused verification:

```bash
pnpm --filter @sketchcatch/web exec tsx --test \
  features/workspace/live-observation-architecture.test.ts \
  features/workspace/live-observation-provider-evidence.test.ts \
  features/workspace/live-observation-output-url.test.ts
```

Result: PASS, 14/14.

Additional repository-required startup and scoped review checks:

```bash
pnpm harness:check
git diff --check -- <Task 5 files>
```

Result: both PASS.

## Self-review

- Spec: every original Architecture Resource is retained, every original edge endpoint is restored,
  the exact observable allowlist is used, and unsupported Resources are not hidden.
- Evidence honesty: supported badges use a single aggregate state and the UI explicitly disclaims
  per-Resource API success; unsupported Resources say `관측 데이터 없음`.
- Interaction: the graph is read-only; edge animation and request particles are absent.
- Capacity: fixed ECS uses healthy/running/desired and Auto Scaling uses healthy/running/max.
- Concurrency: no existing hunk was reverted in the shared dirty files.
- Scope: no modal, shared type, API server, infrastructure, DB, or harness tracker mutation was made.

## Concerns / follow-up

1. Task 6 still needs to fetch the Architecture on Deployment selection and pass
   `architecture`/the V2 `snapshot` to `LiveObservationDiagramMap`; Task 5 intentionally did not edit
   `LiveObservationModal.tsx`.
2. Per the task instruction, package typecheck, lint, build, full suites, and browser visual QA were
   not run. The parent integration pass should run its broader checks after Task 6 lands.
3. The existing focused-path CSS remains in `workspace.module.css` although the rewritten component
   no longer uses it. It was left untouched to keep the shared dirty stylesheet patch narrow; it can
   be removed in a dedicated cleanup after concurrent work merges.

## Review fixes

Addressed every finding in `.superpowers/sdd/task-5-review.md`:

- Added one hidden target `Handle` and one hidden source `Handle` to every Area and non-Area custom
  React Flow node through `LiveObservationEdgeEndpoints`.
- Kept both endpoints mounted with non-zero geometry so React Flow can resolve immutable edge
  endpoints; `opacity: 0`, `pointer-events: none`, `isConnectable={false}`, `aria-hidden`, and
  `tabIndex={-1}` prevent visual or interactive connection behavior.
- Added the original `resource.resourceType` to the Area-node header, including VPC and Subnet.
- Added focused source-contract regressions for both endpoint kinds, both custom-node branches,
  noninteractive/hidden endpoint styling, and Area resource-type output.

Review-fix RED:

```bash
pnpm --filter @sketchcatch/web exec tsx --test \
  features/workspace/live-observation-architecture.test.ts
```

Result before the fix: expected FAIL, 4/6 passed and 2/6 failed because the map had no Handles and
the Area branch did not render `resource.resourceType`.

Review-fix GREEN:

```bash
pnpm --filter @sketchcatch/web exec tsx --test \
  features/workspace/live-observation-architecture.test.ts
```

Result after the fix: PASS, 6/6.

Final Task 5 focused verification:

```bash
pnpm --filter @sketchcatch/web exec tsx --test \
  features/workspace/live-observation-architecture.test.ts \
  features/workspace/live-observation-provider-evidence.test.ts \
  features/workspace/live-observation-output-url.test.ts
```

Result: PASS, 16/16.

```bash
git diff --check -- <Task 5 files>
```

Result: PASS. No file was staged or committed, and no modal or unrelated file was edited for the
review fix.

## Final review fix #3

Addressed the Web UI finding in `.superpowers/sdd/final-review.md` without changing session, QR,
SSE, Output URL, or Deployment-selection race behavior:

- Pre-session `Auto Scaling` now requires an Architecture edge whose source is an `ECS_SERVICE`
  node and whose target is an `APPLICATION_AUTO_SCALING_TARGET` node.
- An unrelated EC2 `AUTO_SCALING_GROUP`, ASG policy, Application Auto Scaling Resource without the
  service-to-target edge, or any other scaling Resource elsewhere in the Architecture no longer
  changes ECS capacity mode.
- Once the Deployment-matched V2 snapshot has a provider payload, `capacity.max` is authoritative:
  `null` renders `고정 용량`; a number renders `Auto Scaling`, regardless of the pre-session graph.
- The modal capacity evidence card now renders `providerEvidence.capacityModeLabel` and
  `providerEvidence.capacityDetailLabel`. Fixed evidence therefore shows
  `정상 / 실행 / 희망` with healthy/running/desired, while Auto Scaling shows
  `정상 / 실행 / 최대` with healthy/running/max.
- Added regressions for a fixed ECS plus unrelated ASG/policy, an unbound scaling target, the exact
  service-to-target binding, provider mode overriding the graph in both directions, and modal
  consumption of both provider-derived labels.

Final-review RED:

```bash
pnpm --filter @sketchcatch/web exec tsx --test \
  features/workspace/live-observation-architecture.test.ts \
  features/workspace/live-observation-modal-contract.test.ts
```

Result before the fix: expected FAIL, 9/12 passed and 3/12 failed. An unbound target flipped the
pre-session mode, provider `max: null` did not override the graph, and the modal did not consume the
two capacity labels.

Final focused verification:

```bash
pnpm --filter @sketchcatch/web exec tsx --test \
  features/workspace/live-observation-architecture.test.ts \
  features/workspace/live-observation-provider-evidence.test.ts \
  features/workspace/live-observation-modal-contract.test.ts \
  features/workspace/live-observation-output-url.test.ts
pnpm --filter @sketchcatch/web typecheck
```

Result: focused tests PASS 22/22 and Web typecheck PASS.

```bash
git diff --check -- <Task 5/6 Web UI files>
```

Result: PASS. No file was staged or committed, and no unrelated file was edited for this fix.
