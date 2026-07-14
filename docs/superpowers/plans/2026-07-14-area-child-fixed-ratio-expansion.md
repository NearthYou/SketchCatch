# 영역 자식 1.3배 확장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 영역의 실제 부족 공간을 계산하는 방식을 제거하고, 현재 직접 자식들의 너비와 높이 합계에 `1.3`을 곱해 baseline 크기에 더하는 결정적 자동 확장으로 변경한다.

**Architecture:** 기존 `reconcileAreaNodeGeometry(previousNodes, currentNodes, changedNodeIds)` 인터페이스와 baseline 저장·복원, 영향 영역 탐색, deepest-first 처리는 유지한다. `reconcileArea()`의 목표 geometry 계산만 직접 자식 위치 기반 합집합에서 직접 자식 크기 합계 기반 중앙 확장으로 교체해 모든 확정 이벤트가 새 규칙을 자동으로 공유하게 한다.

**Tech Stack:** TypeScript, Node.js test runner, pnpm workspace

## Global Constraints

- 부모 목표 너비는 `baseline.width + sum(directChild.width * 1.3)`이다.
- 부모 목표 높이는 `baseline.height + sum(directChild.height * 1.3)`이다.
- 목표 위치는 baseline 중심을 유지하도록 좌우와 상하로 같은 양만큼 확장한다.
- 자식 위치, 부모 경계 부족분, padding은 목표 geometry 계산에 사용하지 않는다.
- 자식 제거 시 남은 직접 자식 크기로 다시 계산하고, 마지막 자식 제거 시 baseline을 복원한다.
- 중첩 영역은 기존처럼 deepest-first로 계산해 바깥 영역이 안쪽 영역의 최종 크기를 사용한다.
- 자동 확장 OFF와 부모 후보 판정 동작은 변경하지 않는다.
- 현재 브랜치의 기존 미커밋 변경을 보존하고 관련 hunk만 커밋한다.

---

### Task 1: 직접 자식 크기 합계 기반 목표 geometry

**Files:**
- Modify: `apps/web/features/diagram-editor/area-node-geometry.test.ts`
- Modify: `apps/web/features/diagram-editor/area-node-geometry.ts`

**Interfaces:**
- Consumes: `DiagramNode.size`, `DiagramNode.metadata.parentAreaNodeId`, `DiagramNode.metadata.areaAutoSizeBaseline`
- Produces: 기존 `reconcileAreaNodeGeometry(previousNodes, currentNodes, changedNodeIds): DiagramNode[]`의 새 `1.3` 배 확장 결과

- [ ] **Step 1: 이미 baseline 안에 있는 첫 자식도 `1.3` 배만큼 확장되는 실패 테스트를 작성한다.**

```ts
test("reconcileAreaNodeGeometry expands by 1.3 times the child size without measuring overflow", () => {
  const area = makeArea("area", undefined, { x: 0, y: 0 }, { width: 100, height: 100 });
  const child = makeResource("child", area.id, { x: 20, y: 20 }, { width: 40, height: 20 });

  const result = reconcileAreaNodeGeometry([area], [area, child], new Set([child.id]));

  assert.deepEqual(geometryOf(getNode(result, area.id)), {
    position: { x: -26, y: -13 },
    size: { width: 152, height: 126 }
  });
});
```

- [ ] **Step 2: focused test를 실행해 기존 부족분 계산 결과 때문에 실패하는 것을 확인한다.**

Run: `pnpm --dir apps/web exec tsx --test features/diagram-editor/area-node-geometry.test.ts`

Expected: 첫 자식 테스트가 현재 `{ position: { x: 0, y: -8 }, size: { width: 100, height: 108 } }` 결과와 달라 FAIL

- [ ] **Step 3: 여러 자식 합산, 일부 제거, 중첩 영역의 기대값을 같은 규칙으로 고정한다.**

```ts
test("reconcileAreaNodeGeometry sums 1.3 times every remaining direct child size", () => {
  const area = makeAreaWithBaseline(
    "area",
    undefined,
    { x: -39, y: -26 },
    { width: 178, height: 152 },
    { position: { x: 0, y: 0 }, size: { width: 100, height: 100 } }
  );
  const first = makeResource("first", area.id, { x: 20, y: 20 }, { width: 40, height: 20 });
  const second = makeResource("second", area.id, { x: 60, y: 50 }, { width: 20, height: 20 });

  const result = reconcileAreaNodeGeometry(
    [area, first, second],
    [area, second],
    new Set([first.id])
  );

  assert.deepEqual(geometryOf(getNode(result, area.id)), {
    position: { x: -13, y: -13 },
    size: { width: 126, height: 126 }
  });
});
```

```ts
test("reconcileAreaNodeGeometry uses the final nested area size for its parent", () => {
  const outer = makeArea("outer", undefined, { x: 0, y: 0 }, { width: 180, height: 130 });
  const inner = makeArea("inner", outer.id, { x: 100, y: 80 }, { width: 80, height: 60 });
  const child = makeResource("child", inner.id, { x: 120, y: 100 }, { width: 40, height: 40 });

  const result = reconcileAreaNodeGeometry([outer, inner], [outer, inner, child], new Set([child.id]));

  assert.deepEqual(geometryOf(getNode(result, inner.id)), {
    position: { x: 74, y: 54 },
    size: { width: 132, height: 112 }
  });
  assert.deepEqual(geometryOf(getNode(result, outer.id)), {
    position: { x: -85.80000000000001, y: -72.80000000000001 },
    size: { width: 351.6, height: 275.6 }
  });
});
```

- [ ] **Step 4: 위치 기반 padding 계산을 직접 자식 크기 합계 기반 중앙 확장으로 교체한다.**

```ts
const AREA_CHILD_EXPANSION_MULTIPLIER = 1.3;

function getExpandedGeometry(
  baseline: AreaGeometry,
  directChildren: readonly DiagramNode[]
): AreaGeometry {
  const size = directChildren.reduce(
    (expandedSize, child) => ({
      width: expandedSize.width + child.size.width * AREA_CHILD_EXPANSION_MULTIPLIER,
      height: expandedSize.height + child.size.height * AREA_CHILD_EXPANSION_MULTIPLIER
    }),
    { ...baseline.size }
  );
  const center = {
    x: baseline.position.x + baseline.size.width / 2,
    y: baseline.position.y + baseline.size.height / 2
  };

  return {
    position: { x: center.x - size.width / 2, y: center.y - size.height / 2 },
    size
  };
}
```

`reconcileArea()`은 직접 자식이 있을 때 `getExpandedGeometry(baseline, directChildren)` 결과와 baseline metadata를 사용한다. 기존 padding 상수와 `getPaddedChildBounds()`는 제거한다.

- [ ] **Step 5: geometry focused tests를 다시 실행한다.**

Run: `pnpm --dir apps/web exec tsx --test features/diagram-editor/area-node-geometry.test.ts`

Expected: PASS

- [ ] **Step 6: geometry 변경을 커밋한다.**

```bash
git add apps/web/features/diagram-editor/area-node-geometry.ts apps/web/features/diagram-editor/area-node-geometry.test.ts
git commit -m "Fix: 영역 자식 크기 기준 1.3배 확장"
```

### Task 2: 확정 이벤트 회귀와 하네스 기록

**Files:**
- Modify: `apps/web/features/diagram-editor/drag-transaction.test.ts`
- Modify: `agent-progress.md`

**Interfaces:**
- Consumes: Task 1의 `reconcileAreaNodeGeometry(...)` 결과
- Produces: drag-in, drag-out, 삭제 복원이 유지된다는 회귀 증거와 세션 기록

- [ ] **Step 1: drag-in 기대값을 자식 크기 `1.3` 배 중앙 확장으로 변경한다.**

```ts
assert.deepEqual(parentAfter.position, { x: -26, y: -26 });
assert.deepEqual(parentAfter.size, { width: 152, height: 152 });
```

자식 크기가 `40 × 40`, 부모 baseline이 `100 × 100`인 fixture에서 위 값을 사용한다. drag-out 테스트는 마지막 자식 제거 후 `100 × 100` baseline 복원과 metadata 제거를 계속 검증한다.

- [ ] **Step 2: drag transaction과 전체 영역 관련 focused tests를 실행한다.**

Run: `pnpm --dir apps/web exec tsx --test features/diagram-editor/area-node-geometry.test.ts features/diagram-editor/drag-transaction.test.ts features/diagram-editor/area-nodes.test.ts features/diagram-editor/area-node-movement.test.ts features/diagram-editor/diagram-editor-layout.test.ts`

Expected: PASS

- [ ] **Step 3: repository 필수 검증을 실행한다.**

Run: `pnpm lint && pnpm typecheck && pnpm build && pnpm harness:check && git diff --check`

Expected: exit 0. 기존 비관련 warning 또는 전체 테스트 baseline 실패는 변경 범위와 분리해 기록한다.

- [ ] **Step 4: `agent-progress.md`에 구현과 검증 결과를 영어로 추가한다.**

```md
### 2026-07-14 - Expand areas by current child sizes

- Replaced overflow-based area sizing with deterministic baseline plus direct-child dimensions multiplied by 1.3.
- Preserved centered growth, deepest-first nested reconciliation, shrink-on-removal, and final baseline restoration.
- Verification: focused Web tests, lint, typecheck, build, harness check, and diff check passed.
```

- [ ] **Step 5: 관련 변경만 선택적으로 커밋한다.**

```bash
git add apps/web/features/diagram-editor/drag-transaction.test.ts
git commit -m "Test: 영역 1.3배 확장 회귀 검증"
```

`agent-progress.md`에 기존 사용자 변경이 섞여 있으면 커밋하지 않고 working tree에 보존한다.
