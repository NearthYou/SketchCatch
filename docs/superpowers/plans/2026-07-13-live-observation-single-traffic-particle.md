# Live Observation Single Traffic Particle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render one 28px circle per accepted request and hand that circle across connector segments without duplicating the same request on multiple segments.

**Architecture:** Add a pure diagram-particle timing module that assigns non-overlapping segment windows and calculates the complete burst lifetime. The diagram renderer consumes those timings, while the modal keeps bursts alive until the final logical request reaches the final segment.

**Tech Stack:** React, TypeScript, CSS Modules, Node test runner with `tsx`.

## Global Constraints

- Particle diameter is exactly 28px with a 3px blue border and 8px translucent glow.
- One accepted request produces one logical particle.
- Segment windows for the same logical request never overlap.
- Separate logical requests start 180ms apart.
- Each segment window lasts 560ms.
- Existing accepted-event counting, boost rate, observation transport, capacity state, particle cap, and reduced-motion behavior remain unchanged.

---

### Task 1: Add deterministic sequential particle timing

**Files:**
- Create: `apps/web/features/workspace/live-observation-diagram-particles.ts`
- Create: `apps/web/features/workspace/live-observation-diagram-particles.test.ts`

**Interfaces:**
- Produces: `LIVE_OBSERVATION_DIAGRAM_SEGMENT_DURATION_MS`, `LIVE_OBSERVATION_DIAGRAM_REQUEST_STAGGER_MS`, `LIVE_OBSERVATION_DIAGRAM_ARRIVAL_DURATION_MS`, `getLiveObservationDiagramParticleDelayMs(segmentIndex, requestIndex)`, and `getLiveObservationDiagramBurstLifetimeMs(segmentCount, particleCount)`.

- [x] **Step 1: Write failing timing tests**

Create `live-observation-diagram-particles.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  LIVE_OBSERVATION_DIAGRAM_SEGMENT_DURATION_MS,
  getLiveObservationDiagramBurstLifetimeMs,
  getLiveObservationDiagramParticleDelayMs
} from "./live-observation-diagram-particles";

test("one logical request occupies only one connector segment at a time", () => {
  const firstStart = getLiveObservationDiagramParticleDelayMs(0, 0);
  const secondStart = getLiveObservationDiagramParticleDelayMs(1, 0);
  const thirdStart = getLiveObservationDiagramParticleDelayMs(2, 0);

  assert.equal(firstStart, 0);
  assert.equal(secondStart, LIVE_OBSERVATION_DIAGRAM_SEGMENT_DURATION_MS);
  assert.equal(thirdStart, LIVE_OBSERVATION_DIAGRAM_SEGMENT_DURATION_MS * 2);
  assert.ok(firstStart + LIVE_OBSERVATION_DIAGRAM_SEGMENT_DURATION_MS <= secondStart);
  assert.ok(secondStart + LIVE_OBSERVATION_DIAGRAM_SEGMENT_DURATION_MS <= thirdStart);
});

test("separate requests keep a short readable stagger", () => {
  assert.equal(getLiveObservationDiagramParticleDelayMs(0, 0), 0);
  assert.equal(getLiveObservationDiagramParticleDelayMs(0, 1), 180);
  assert.equal(getLiveObservationDiagramParticleDelayMs(2, 1), 1_300);
});

test("burst lifetime includes the final segment and final request", () => {
  assert.equal(getLiveObservationDiagramBurstLifetimeMs(0, 4), 0);
  assert.equal(getLiveObservationDiagramBurstLifetimeMs(5, 0), 0);
  assert.equal(getLiveObservationDiagramBurstLifetimeMs(5, 1), 3_040);
  assert.equal(getLiveObservationDiagramBurstLifetimeMs(5, 4), 3_580);
});
```

- [x] **Step 2: Run the timing tests and verify RED**

Run:

```bash
cd apps/web
pnpm exec tsx --test features/workspace/live-observation-diagram-particles.test.ts
```

Expected: FAIL because `live-observation-diagram-particles.ts` does not exist.

- [x] **Step 3: Implement the timing module**

Create `live-observation-diagram-particles.ts`:

```ts
export const LIVE_OBSERVATION_DIAGRAM_SEGMENT_DURATION_MS = 560;
export const LIVE_OBSERVATION_DIAGRAM_REQUEST_STAGGER_MS = 180;
export const LIVE_OBSERVATION_DIAGRAM_ARRIVAL_DURATION_MS = 240;

export function getLiveObservationDiagramParticleDelayMs(
  segmentIndex: number,
  requestIndex: number
): number {
  return (
    Math.max(0, Math.floor(segmentIndex)) * LIVE_OBSERVATION_DIAGRAM_SEGMENT_DURATION_MS +
    Math.max(0, Math.floor(requestIndex)) * LIVE_OBSERVATION_DIAGRAM_REQUEST_STAGGER_MS
  );
}

export function getLiveObservationDiagramBurstLifetimeMs(
  segmentCount: number,
  particleCount: number
): number {
  const safeSegmentCount = Math.max(0, Math.floor(segmentCount));
  const safeParticleCount = Math.max(0, Math.floor(particleCount));
  if (safeSegmentCount === 0 || safeParticleCount === 0) return 0;

  return (
    safeSegmentCount * LIVE_OBSERVATION_DIAGRAM_SEGMENT_DURATION_MS +
    (safeParticleCount - 1) * LIVE_OBSERVATION_DIAGRAM_REQUEST_STAGGER_MS +
    LIVE_OBSERVATION_DIAGRAM_ARRIVAL_DURATION_MS
  );
}
```

- [x] **Step 4: Run the timing tests and verify GREEN**

Run the Step 2 command again.

Expected: 3 tests PASS.

---

### Task 2: Apply sequential timing and 28px presentation

**Files:**
- Modify: `apps/web/features/workspace/live-observation-diagram.ts`
- Modify: `apps/web/features/workspace/live-observation-diagram.test.ts`
- Modify: `apps/web/features/workspace/LiveObservationDiagramMap.tsx`
- Modify: `apps/web/features/workspace/LiveObservationModal.tsx`
- Modify: `apps/web/features/workspace/live-observation-modal.test.ts`
- Modify: `apps/web/features/workspace/workspace.module.css`

**Interfaces:**
- Consumes: timing exports from Task 1 and `createLiveObservationDiagramModel(diagram, null)`.
- Produces: `getLiveObservationDiagramSegmentCount(diagram): number`, sequential animation delays, complete burst cleanup timing, and 28px particle geometry.

- [x] **Step 1: Write failing integration tests**

Import `getLiveObservationDiagramSegmentCount` in `live-observation-diagram.test.ts`. In the existing ECS path test, after its local `diagram` fixture is created, add:

```ts
assert.equal(getLiveObservationDiagramSegmentCount(diagram), 5);
```

Add a separate unavailable-path assertion:

```ts
test("returns zero traffic segments for an unavailable diagram", () => {
  assert.equal(getLiveObservationDiagramSegmentCount({ nodes: [], edges: [] }), 0);
});
```

Update `live-observation-modal.test.ts` to require:

```ts
assert.match(diagramMapSource, /getLiveObservationDiagramParticleDelayMs\(index, particleIndex\)/);
assert.doesNotMatch(diagramMapSource, /index \* 90 \+ particleIndex \* 180/);
assert.match(modalSource, /getLiveObservationDiagramBurstLifetimeMs\(\s*observationDiagramSegmentCount,/);
assert.match(
  getCssRule(stylesSource, "liveObservationPresentationSegmentParticle"),
  /border:\s*3px solid #3974e8[\s\S]*box-shadow:\s*0 0 0 8px[\s\S]*height:\s*28px[\s\S]*top:\s*-14px[\s\S]*width:\s*28px/
);
assert.match(stylesSource, /from \{ left:\s*-28px; opacity:\s*0; \}/);
assert.match(stylesSource, /to \{ left:\s*calc\(100% - 14px\); opacity:\s*0; \}/);
```

- [x] **Step 2: Run focused tests and verify RED**

Run:

```bash
cd apps/web
pnpm exec tsx --test features/workspace/live-observation-diagram.test.ts features/workspace/live-observation-modal.test.ts
```

Expected: FAIL because segment counting, sequential delays, complete lifetime, and 28px geometry are not implemented.

- [x] **Step 3: Add the diagram segment-count helper**

Export from `live-observation-diagram.ts`:

```ts
export function getLiveObservationDiagramSegmentCount(diagram: DiagramJson): number {
  const model = createLiveObservationDiagramModel(diagram, null);
  return model.status === "ready" ? model.stages.length : 0;
}
```

- [x] **Step 4: Apply sequential timing in the renderer**

Import the Task 1 duration and delay helper in `LiveObservationDiagramMap.tsx`. Replace the inline delay with:

```tsx
style={{
  animationDelay: `${getLiveObservationDiagramParticleDelayMs(index, particleIndex)}ms`,
  animationDuration: `${LIVE_OBSERVATION_DIAGRAM_SEGMENT_DURATION_MS}ms`
}}
```

This keeps duplicate DOM elements hidden outside their non-overlapping segment windows, so one logical request has only one visible circle.

- [x] **Step 5: Keep each burst alive for the full analyzed path**

In `LiveObservationModal.tsx`, memoize:

```ts
const observationDiagramSegmentCount = useMemo(
  () => getLiveObservationDiagramSegmentCount(diagramJson),
  [diagramJson]
);
```

Replace both calls to `getLiveObservationSignalBurstLifetimeMs` with:

```ts
getLiveObservationDiagramBurstLifetimeMs(
  observationDiagramSegmentCount,
  requestFlowBurst.visibleParticleCount
)
```

Use `mockRequestFlowBurst.visibleParticleCount` in the mock effect and include `observationDiagramSegmentCount` in both dependency arrays.

- [x] **Step 6: Apply 28px particle geometry**

Update `workspace.module.css`:

```css
.liveObservationPresentationSegmentParticle {
  background: #ffffff;
  border: 3px solid #3974e8;
  border-radius: 50%;
  box-shadow: 0 0 0 8px rgba(57, 116, 232, 0.14);
  height: 28px;
  top: -14px;
  width: 28px;
}

@keyframes liveObservationPresentationSegmentParticle {
  from { left: -28px; opacity: 0; }
  8% { opacity: 1; }
  90% { opacity: 1; }
  to { left: calc(100% - 14px); opacity: 0; }
}
```

- [x] **Step 7: Run focused tests and repository gates**

Run:

```bash
cd apps/web
pnpm exec tsx --test features/workspace/live-observation-diagram-particles.test.ts features/workspace/live-observation-diagram.test.ts features/workspace/live-observation-modal.test.ts features/workspace/live-observation.test.ts
cd ../..
pnpm harness:check
pnpm lint
pnpm typecheck
pnpm build
```

Expected: focused tests and all repository gates PASS.

- [x] **Step 8: Verify in the authenticated browser and clean up**

Open Live Observation, start a session, run a short presenter boost, and inspect computed styles. Confirm particle width and height are 28px and that one request index has at most one visible segment particle at a time. Stop the boost and end the observation session immediately after verification.

- [x] **Step 9: Commit**

```bash
git add apps/web/features/workspace/live-observation-diagram-particles.ts apps/web/features/workspace/live-observation-diagram-particles.test.ts apps/web/features/workspace/live-observation-diagram.ts apps/web/features/workspace/live-observation-diagram.test.ts apps/web/features/workspace/LiveObservationDiagramMap.tsx apps/web/features/workspace/LiveObservationModal.tsx apps/web/features/workspace/live-observation-modal.test.ts apps/web/features/workspace/workspace.module.css agent-progress.md docs/superpowers/plans/2026-07-13-live-observation-single-traffic-particle.md
git commit -m "Fix: 트래픽 요청 입자 순차 전달"
```
