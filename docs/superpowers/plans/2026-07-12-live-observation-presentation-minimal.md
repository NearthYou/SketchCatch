# Live Observation Presentation Minimal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 저장된 DiagramJson을 그래프로 분석해 현재 관측 대상까지의 메인 트래픽 경로만 동적으로 추출하고, SketchCatch Board 톤의 발표용 일자 애니메이션으로 표시한다.

**Architecture:** `live-observation-diagram.ts`가 DiagramJson과 snapshot을 받아 결정적인 presentation model을 만드는 순수 경계가 된다. React 컴포넌트는 이 model만 렌더링하고, 기존 modal의 polling/SSE와 backend snapshot 계약은 변경하지 않는다.

**Tech Stack:** TypeScript, React 19, CSS Modules, Node test runner, Next.js 16

## Global Constraints

- 메인 경로의 리소스 종류와 단계 수를 고정하지 않는다.
- 원본 DiagramJson의 node와 방향성 edge를 유일한 토폴로지 근거로 사용한다.
- 화면에는 분석된 메인 경로와 capacity 분기만 표시한다.
- Workspace의 흰색, `#fafafa`, 얇은 회색 선, 실제 AWS 아이콘 톤을 사용한다.
- 정상 흐름은 파랑, launching은 주황, critical pressure는 빨강으로 제한한다.
- reduced motion에서는 이동 입자를 제거한다.
- backend API와 `LiveObservationSnapshot` 계약은 변경하지 않는다.

## File Structure

- Modify `packages/types/src/index.ts`: 명시적인 observation node role을 provider-neutral union으로 확장한다.
- Modify `apps/web/features/workspace/live-observation-diagram.ts`: 그래프 탐색, 경로 점수화, capacity 상태 계산을 담당한다.
- Modify `apps/web/features/workspace/live-observation-diagram.test.ts`: ECS, ASG, 명시적 역할, 실패 경로를 검증한다.
- Modify `apps/web/features/workspace/LiveObservationDiagramMap.tsx`: presentation model 전용 일자 렌더러를 담당한다.
- Modify `apps/web/features/workspace/workspace.module.css`: Board-native 레이아웃과 상태/입자 애니메이션을 담당한다.
- Modify `apps/web/features/workspace/live-observation-modal.test.ts`: modal이 동적 presentation renderer를 한 번만 사용하며 고정 토폴로지를 가지지 않는지 검증한다.
- Modify `agent-progress.md`: 완료 결과와 검증 근거를 기록한다.

---

### Task 1: Dynamic Main Path Model

**Files:**
- Modify: `packages/types/src/index.ts`
- Modify: `apps/web/features/workspace/live-observation-diagram.ts`
- Test: `apps/web/features/workspace/live-observation-diagram.test.ts`

**Interfaces:**
- Consumes: `DiagramJson`, `LiveObservationSnapshot | null`
- Produces: `createLiveObservationDiagramModel(diagram, snapshot): LiveObservationDiagramModel`
- Produces model fields: `status`, `stages`, `capacityUnits`, `pressureLevel`

- [ ] **Step 1: Write failing dynamic-path tests**

Add tests that construct this ECS graph:

```ts
site -> alb -> listener -> targetGroup -> service -> taskA/taskB
role -> taskDefinition -> service
logs -> taskDefinition
scalingPolicy -> scalingTarget -> service
```

Assert `model.stages.map(stage => stage.node.id)` equals the traffic route and excludes IAM, Logs, Task Definition, and scaling configuration. Add an ASG graph with a different source and stages, an explicit-role graph where metadata wins, and a disconnected capacity graph that returns `status: "unavailable"`.

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
cd apps/web
pnpm exec tsx --test features/workspace/live-observation-diagram.test.ts
```

Expected: FAIL because the current model returns every board node and has no `stages` or `status`.

- [ ] **Step 3: Extend provider-neutral observation roles**

Change the shared metadata contract to:

```ts
liveObservationRole?:
  | "traffic-source"
  | "traffic-hop"
  | "capacity-controller"
  | "capacity-unit"
  | "support";
```

- [ ] **Step 4: Implement deterministic graph analysis**

Implement a presentation model with these shapes:

```ts
type LiveObservationPresentationRole = "source" | "hop" | "controller";

type LiveObservationPresentationStage = {
  node: DiagramNode;
  role: LiveObservationPresentationRole;
};

type LiveObservationCapacityUnit = {
  node: DiagramNode;
  observationState: "active" | "inactive" | "launching";
};

type LiveObservationDiagramModel =
  | { status: "ready"; stages: readonly LiveObservationPresentationStage[]; capacityUnits: readonly LiveObservationCapacityUnit[]; pressureLevel: LiveObservationSnapshot["live"]["pressureLevel"] }
  | { status: "unavailable"; reason: "capacity-missing" | "path-missing" };
```

Build predecessor/successor maps from DiagramJson edges. Start from explicit `capacity-unit` nodes, identify their shared upstream controller, enumerate acyclic predecessor paths, and score each path using explicit observation roles first, traffic-capable resource definitions second, support-resource penalties third, and stable node-id ordering last. Keep capacity branches outside `stages`.

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
cd apps/web
pnpm exec tsx --test features/workspace/live-observation-diagram.test.ts
cd ../..
pnpm --filter @sketchcatch/types typecheck
pnpm --filter @sketchcatch/web typecheck
```

Expected: all focused tests and both typechecks PASS.

### Task 2: Board-Native Presentation Renderer

**Files:**
- Modify: `apps/web/features/workspace/LiveObservationDiagramMap.tsx`
- Modify: `apps/web/features/workspace/workspace.module.css`
- Modify: `apps/web/features/workspace/live-observation-modal.test.ts`

**Interfaces:**
- Consumes: `LiveObservationDiagramModel` from Task 1
- Preserves component props: `{ burst, diagram, snapshot }`
- Renders no absolute board coordinates and no non-path context nodes

- [ ] **Step 1: Write failing source-shape assertions**

Assert that `LiveObservationDiagramMap.tsx` renders `model.stages`, `model.capacityUnits`, and an unavailable state, and no longer imports `isAreaNode`, calculates SVG paths from original coordinates, or renders `model.nodes`.

- [ ] **Step 2: Run focused modal tests and verify failure**

Run:

```bash
cd apps/web
pnpm exec tsx --test features/workspace/live-observation-modal.test.ts
```

Expected: FAIL because the current renderer draws the complete board.

- [ ] **Step 3: Replace the renderer**

Render a horizontally scrollable, minimum-width flow surface:

```tsx
<ol className={styles.liveObservationPresentationPath}>
  {model.stages.map((stage) => <PresentationStage key={stage.node.id} stage={stage} />)}
  <li className={styles.liveObservationCapacityStage}>...</li>
</ol>
```

Use actual `node.iconUrl`, short labels, accessible role/state text, stable capacity slots, and a clear unavailable message. Remount burst particles with `burst.sequence`. Do not hardcode resource labels or stage count.

- [ ] **Step 4: Replace full-board CSS with Board-native presentation CSS**

Use `var(--workspace-surface, #ffffff)`, `var(--workspace-surface-muted, #fafafa)`, `var(--workspace-line, #f0f0f3)`, and `var(--workspace-text, #171717)`. Add marching connector highlights, burst particles, stage pulse rings, critical route color, launching task pop, stable capacity-slot dimensions, horizontal overflow, and `prefers-reduced-motion` overrides.

- [ ] **Step 5: Run focused tests, lint, and typecheck**

Run:

```bash
cd apps/web
pnpm exec tsx --test features/workspace/live-observation-diagram.test.ts features/workspace/live-observation-modal.test.ts features/workspace/live-observation.test.ts
cd ../..
pnpm --filter @sketchcatch/web lint
pnpm --filter @sketchcatch/web typecheck
```

Expected: focused tests, lint, and typecheck PASS.

### Task 3: Runtime and Browser Verification

**Files:**
- Modify: `agent-progress.md`

**Interfaces:**
- Uses current local project `cb8dd5bf-3424-4bd4-ad06-3c16f8ccf245`
- Uses existing simulated provider and polling transport

- [ ] **Step 1: Verify the actual project model**

Load the project draft and confirm the selected route begins at the audience site, reaches the observed ECS Service through its traffic edges, excludes support chains, and exposes both capacity-unit nodes.

- [ ] **Step 2: Verify browser behavior**

Open the project, launch Live Observation, and verify desktop and mobile widths. Confirm one horizontal main path, readable labels, request particles, critical color, stable layout during scale-out, Task 2 pop, and no Region/VPC/AZ/Subnet nodes in the observation stage.

- [ ] **Step 3: Run required repository checks**

Run:

```bash
pnpm harness:check
pnpm lint
pnpm typecheck
pnpm build
```

Expected: all required checks PASS. Record any unrelated full-suite test failures separately.

- [ ] **Step 4: Record progress and commit**

Update `agent-progress.md` with implementation, focused tests, browser verification, required checks, and the no-real-AWS-apply risk. Run `pnpm harness:check` again, inspect `git diff --check`, then commit with:

```bash
git commit -m "Feat: 다이어그램 기반 발표용 관측 경로 구현"
```
