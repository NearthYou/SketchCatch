# Live Observation Traffic Particle Size Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Increase received-traffic particles to a presentation-visible 16px while keeping them bounded to connector endpoints and inactive before a traffic burst.

**Architecture:** Preserve the existing `LiveObservationDiagramMap` burst rendering and change only its CSS presentation contract. Update the source-based regression test first so it proves the particle diameter, glow, centering, and endpoint bounds.

**Tech Stack:** React, TypeScript, CSS Modules, Node test runner with `tsx`.

## Global Constraints

- Particle diameter is exactly 16px.
- Border remains 3px blue and outer glow becomes 6px translucent blue.
- Particle motion remains conditional on an accepted-event burst.
- Particle movement starts before the connector and ends at its endpoint.
- Existing reduced-motion behavior and visible-particle cap remain unchanged.

---

### Task 1: Enlarge the bounded traffic particle

**Files:**
- Modify: `apps/web/features/workspace/live-observation-modal.test.ts`
- Modify: `apps/web/features/workspace/workspace.module.css`

**Interfaces:**
- Consumes: `.liveObservationPresentationSegmentParticle` and `@keyframes liveObservationPresentationSegmentParticle`.
- Produces: a 16px circular particle that follows the existing `burst`-driven rendering path.

- [ ] **Step 1: Write the failing presentation contract test**

Change the particle assertion in `live-observation-modal.test.ts` to require the approved geometry:

```ts
assert.match(
  getCssRule(stylesSource, "liveObservationPresentationSegmentParticle"),
  /border:\s*3px solid #3974e8[\s\S]*border-radius:\s*50%[\s\S]*box-shadow:\s*0 0 0 6px[\s\S]*height:\s*16px[\s\S]*top:\s*-8px[\s\S]*width:\s*16px/
);
assert.match(stylesSource, /from \{ left:\s*-16px; opacity:\s*0; \}/);
assert.match(stylesSource, /to \{ left:\s*calc\(100% - 8px\); opacity:\s*0; \}/);
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
cd apps/web
pnpm exec tsx --test features/workspace/live-observation-modal.test.ts
```

Expected: FAIL because the current particle is 10px with a 5px glow and 10px start offset.

- [ ] **Step 3: Implement the approved 16px geometry**

Update `workspace.module.css`:

```css
.liveObservationPresentationSegmentParticle {
  animation: liveObservationPresentationSegmentParticle 920ms ease-in-out both;
  background: #ffffff;
  border: 3px solid #3974e8;
  border-radius: 50%;
  box-sizing: border-box;
  box-shadow: 0 0 0 6px rgba(57, 116, 232, 0.14);
  height: 16px;
  left: 0;
  position: absolute;
  top: -8px;
  width: 16px;
  z-index: 4;
}

@keyframes liveObservationPresentationSegmentParticle {
  from { left: -16px; opacity: 0; }
  8% { opacity: 1; }
  90% { opacity: 1; }
  to { left: calc(100% - 8px); opacity: 0; }
}
```

- [ ] **Step 4: Verify focused behavior**

Run:

```bash
cd apps/web
pnpm exec tsx --test features/workspace/live-observation-modal.test.ts features/workspace/live-observation.test.ts
```

Expected: all focused tests PASS, including burst-only activation and reduced-motion assertions.

- [ ] **Step 5: Run repository gates**

Run:

```bash
pnpm harness:check
pnpm lint
pnpm typecheck
pnpm build
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web/features/workspace/live-observation-modal.test.ts apps/web/features/workspace/workspace.module.css agent-progress.md
git commit -m "Fix: 트래픽 입자 가시성 강화"
```
