# 영역 자식 Geometry 재조정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 영역 자식 드래그 시 실제 부모 후보를 하이라이트하고, 확정된 자식 변경 후 부모 영역을 저장된 baseline과 남은 직접 자식 범위에 맞춰 확장·축소한다.

**Architecture:** 부모 후보 판정은 `area-nodes.ts`의 순수 함수 하나를 드래그 피드백과 부모 할당이 공유한다. 자동 크기는 `area-node-geometry.ts`가 이전·현재 노드와 변경 노드 ID를 받아 baseline 이동/갱신, 영향 영역 탐색, 안쪽부터 geometry 재조정을 한 transaction에서 수행한다.

**Tech Stack:** TypeScript, React, React Flow, Zod, Node.js test runner, pnpm workspace

## Global Constraints

- 현재 브랜치와 기존 미커밋 변경을 보존하고 관련 파일만 선택적으로 수정·커밋한다.
- `areaAutoSizeBaseline`은 provider-neutral 보드 metadata이며 Terraform HCL 생성에는 사용하지 않는다.
- 자동 geometry 재조정은 확정 이벤트에서만 실행하고 drag preview 또는 React render 중에는 실행하지 않는다.
- `영역 자동 확장`이 꺼져 있으면 baseline과 자동 geometry를 변경하지 않는다.
- 일반 리소스의 중심점 기반 부모 판정은 유지하고 영역 자식만 전체 bounding box 포함 기준을 사용한다.

---

### Task 1: Shared metadata와 API 왕복 계약

**Files:**
- Modify: `packages/types/src/index.ts`
- Modify: `apps/api/src/routes/project-draft-schemas.ts`
- Modify: `apps/api/src/routes/project-draft-schemas.test.ts`
- Modify: `apps/api/src/routes/terraform.ts`
- Modify: `apps/api/src/routes/terraform.test.ts`
- Modify: `docs/data-models.md`

**Interfaces:**
- Produces: `DiagramNodeMetadata.areaAutoSizeBaseline?: { position: { x: number; y: number }; size: { width: number; height: number } }`
- Consumes: 기존 `DiagramNode.position`, `DiagramNode.size`, project draft와 Terraform DiagramJson schema

- [ ] **Step 1: baseline 왕복과 유효성 검증 테스트를 추가한다.**

```ts
const areaAutoSizeBaseline = {
  position: { x: 100, y: 80 },
  size: { width: 240, height: 180 }
};

assert.deepEqual(parsed.diagramJson.nodes[0]?.metadata?.areaAutoSizeBaseline, areaAutoSizeBaseline);
assert.equal(parseWithNonPositiveSize.success, false);
```

- [ ] **Step 2: focused API tests가 `areaAutoSizeBaseline`을 제거하거나 거부해 실패하는 것을 확인한다.**

Run: `pnpm --dir apps/api exec tsx --test src/routes/project-draft-schemas.test.ts src/routes/terraform.test.ts`
Expected: baseline metadata assertion 또는 request status assertion FAIL

- [ ] **Step 3: shared type과 두 Zod schema를 같은 finite/positive 계약으로 구현하고 `docs/data-models.md`를 갱신한다.**

```ts
areaAutoSizeBaseline?: {
  position: { x: number; y: number };
  size: { width: number; height: number };
};
```

```ts
areaAutoSizeBaseline: z.object({
  position: z.object({ x: z.number().finite(), y: z.number().finite() }),
  size: z.object({
    width: z.number().finite().positive(),
    height: z.number().finite().positive()
  })
}).optional()
```

- [ ] **Step 4: focused API tests를 다시 실행한다.**

Run: `pnpm --dir apps/api exec tsx --test src/routes/project-draft-schemas.test.ts src/routes/terraform.test.ts`
Expected: PASS

- [ ] **Step 5: 계약 변경만 선택적으로 커밋한다.**

```bash
git add packages/types/src/index.ts apps/api/src/routes/project-draft-schemas.ts apps/api/src/routes/project-draft-schemas.test.ts apps/api/src/routes/terraform.ts apps/api/src/routes/terraform.test.ts docs/data-models.md
git commit -m "Feat: 영역 자동 크기 기준 계약 추가"
```

### Task 2: 영역 부모 후보 판정 공유

**Files:**
- Modify: `apps/web/features/diagram-editor/area-nodes.ts`
- Modify: `apps/web/features/diagram-editor/area-nodes.test.ts`
- Modify: `apps/web/features/diagram-editor/area-node-movement.ts`
- Modify: `apps/web/features/diagram-editor/area-node-movement.test.ts`

**Interfaces:**
- Produces: `findInnermostAreaDropTarget(childNode, nodes, ignoredAreaNodeIds?): DiagramNode | null`
- Consumes: 일반 리소스 중심점 포함, 영역 전체 box 포함, 자기 자신/자손/ignored ID 제외 규칙

- [ ] **Step 1: 영역 전체 포함 하이라이트, 일부 겹침 제외, 자손 제외 테스트를 먼저 작성한다.**

```ts
assert.equal(findInnermostAreaDropTarget(containedVpc, [region, containedVpc])?.id, region.id);
assert.equal(findInnermostAreaDropTarget(partialVpc, [region, partialVpc]), null);
assert.equal(findInnermostAreaDropTarget(region, [region, childVpc]), null);
```

- [ ] **Step 2: 기존 영역 제외 동작 때문에 focused tests가 실패하는 것을 확인한다.**

Run: `pnpm --dir apps/web exec tsx --test features/diagram-editor/area-nodes.test.ts features/diagram-editor/area-node-movement.test.ts`
Expected: contained area target assertion FAIL

- [ ] **Step 3: shared resolver를 구현하고 부모 할당도 같은 resolver를 호출하게 한다.**

```ts
export function findInnermostAreaDropTarget(
  childNode: DiagramNode,
  nodes: readonly DiagramNode[],
  ignoredAreaNodeIds: ReadonlySet<string> = new Set()
): DiagramNode | null;
```

- [ ] **Step 4: focused tests를 다시 실행한다.**

Run: `pnpm --dir apps/web exec tsx --test features/diagram-editor/area-nodes.test.ts features/diagram-editor/area-node-movement.test.ts`
Expected: PASS

- [ ] **Step 5: 부모 후보 판정 변경만 선택적으로 커밋한다.**

```bash
git add apps/web/features/diagram-editor/area-nodes.ts apps/web/features/diagram-editor/area-nodes.test.ts apps/web/features/diagram-editor/area-node-movement.ts apps/web/features/diagram-editor/area-node-movement.test.ts
git commit -m "Fix: 영역 드롭 부모 하이라이트 표시"
```

### Task 3: Baseline 기반 순수 geometry 재조정

**Files:**
- Create: `apps/web/features/diagram-editor/area-node-geometry.ts`
- Create: `apps/web/features/diagram-editor/area-node-geometry.test.ts`
- Delete: `apps/web/features/diagram-editor/area-node-expansion.ts`
- Delete: `apps/web/features/diagram-editor/area-node-expansion.test.ts`

**Interfaces:**
- Produces: `reconcileAreaNodeGeometry(previousNodes, currentNodes, changedNodeIds): DiagramNode[]`
- Consumes: `areaAutoSizeBaseline`, `parentAreaNodeId`, 좌우 12px/상단 28px/하단 12px padding

- [ ] **Step 1: 최초 baseline, 일부/마지막 자식 제거, 중첩 영역, 수동 resize, 영역 이동, legacy/cycle 테스트를 작성한다.**

```ts
const expanded = reconcileAreaNodeGeometry(beforeAdd, afterAdd, new Set([child.id]));
assert.deepEqual(getArea(expanded).metadata?.areaAutoSizeBaseline, originalGeometry);

const restored = reconcileAreaNodeGeometry(expanded, withoutChild, new Set([child.id]));
assert.deepEqual(pickGeometry(getArea(restored)), originalGeometry);
assert.equal(getArea(restored).metadata?.areaAutoSizeBaseline, undefined);
```

- [ ] **Step 2: 새 모듈이 없어 focused test가 실패하는 것을 확인한다.**

Run: `pnpm --dir apps/web exec tsx --test features/diagram-editor/area-node-geometry.test.ts`
Expected: module 또는 export missing FAIL

- [ ] **Step 3: 영향 영역과 조상을 모아 deepest-first로 계산하는 최소 구현을 작성한다.**

```ts
export function reconcileAreaNodeGeometry(
  previousNodes: readonly DiagramNode[],
  currentNodes: readonly DiagramNode[],
  changedNodeIds: ReadonlySet<string>
): DiagramNode[];
```

직접 자식이 있으면 baseline과 padded child bounds의 합집합을 사용하고, 직접 자식이 없으면 baseline을 복원한 뒤 metadata를 제거한다. 변경된 영역의 size가 달라졌으면 완료된 수동 geometry를 새 baseline으로 사용하고, position만 이동했으면 baseline position에도 같은 delta를 적용한다.

- [ ] **Step 4: geometry focused tests를 다시 실행한다.**

Run: `pnpm --dir apps/web exec tsx --test features/diagram-editor/area-node-geometry.test.ts`
Expected: PASS

- [ ] **Step 5: 기존 expansion 모듈을 제거하고 geometry 모듈만 커밋한다.**

```bash
git add apps/web/features/diagram-editor/area-node-geometry.ts apps/web/features/diagram-editor/area-node-geometry.test.ts apps/web/features/diagram-editor/area-node-expansion.ts apps/web/features/diagram-editor/area-node-expansion.test.ts
git commit -m "Feat: 영역 자식 geometry 재조정 추가"
```

### Task 4: 확정 이벤트 transaction 연결

**Files:**
- Modify: `apps/web/features/diagram-editor/drag-transaction.ts`
- Modify: `apps/web/features/diagram-editor/drag-transaction.test.ts`
- Modify: `apps/web/features/diagram-editor/DiagramEditor.tsx`
- Modify: `apps/web/features/diagram-editor/diagram-editor-layout.test.ts`

**Interfaces:**
- Consumes: `reconcileAreaNodeGeometry(previousNodes, currentNodes, changedNodeIds)`
- Produces: drag stop, palette drop, paste, delete, resize end에서 한 history transaction 안에 재조정된 nodes

- [ ] **Step 1: drag-out 이전 부모 축소, drag-in baseline 생성, 삭제 복원, paste와 resize source integration 테스트를 추가한다.**

```ts
const result = finalizeDraggedNodes({ ...input, snapshotNodes: beforeMove });
assert.deepEqual(parentAfter.size, baseline.size);
assert.equal(parentAfter.metadata?.areaAutoSizeBaseline, undefined);
```

- [ ] **Step 2: 기존 1.5배 확장과 삭제 무처리 때문에 focused tests가 실패하는 것을 확인한다.**

Run: `pnpm --dir apps/web exec tsx --test features/diagram-editor/drag-transaction.test.ts features/diagram-editor/diagram-editor-layout.test.ts`
Expected: baseline/reconcile integration assertions FAIL

- [ ] **Step 3: 각 확정 이벤트의 기존 transaction 안에서 부모 할당 후 재조정을 호출한다.**

```ts
const reconciledNodes = autoExpandAreasEnabled
  ? reconcileAreaNodeGeometry(snapshotNodes, nodesWithAssignedParents, movedNodeIds)
  : nodesWithAssignedParents;
```

삭제는 제거 전 노드 배열을 `previousNodes`로 전달하고, palette/paste는 추가 전 배열을 전달한다. resize end는 자동 확장이 켜진 경우 자식 parent를 먼저 해제하지 않고 수동 geometry를 baseline으로 반영한 뒤 자식 범위를 합친다.

- [ ] **Step 4: focused integration tests를 다시 실행한다.**

Run: `pnpm --dir apps/web exec tsx --test features/diagram-editor/drag-transaction.test.ts features/diagram-editor/diagram-editor-layout.test.ts`
Expected: PASS

- [ ] **Step 5: 기존 dirty hunk와 겹치지 않는 파일만 선택적으로 커밋하고, `DiagramEditor.tsx`와 `diagram-editor-layout.test.ts`는 기존 변경과 함께 working tree에 보존한다.**

```bash
git add apps/web/features/diagram-editor/drag-transaction.ts apps/web/features/diagram-editor/drag-transaction.test.ts
git commit -m "Fix: 영역 드래그 후 크기 재조정"
```

### Task 5: 전체 회귀와 하네스 기록

**Files:**
- Modify: `agent-progress.md`

**Interfaces:**
- Consumes: 모든 focused test와 repository required checks
- Produces: 검증 명령, 알려진 기존 경고/실패, 다음 행동 기록

- [ ] **Step 1: 관련 focused tests를 함께 실행한다.**

Run: `pnpm --dir apps/web exec tsx --test features/diagram-editor/area-nodes.test.ts features/diagram-editor/area-node-movement.test.ts features/diagram-editor/area-node-geometry.test.ts features/diagram-editor/drag-transaction.test.ts features/diagram-editor/diagram-editor-layout.test.ts`
Expected: PASS

- [ ] **Step 2: 필수 검증을 실행한다.**

Run: `pnpm lint && pnpm typecheck && pnpm build && pnpm harness:check && git diff --check`
Expected: exit 0; 기존 경고가 있으면 명시적으로 기록

- [ ] **Step 3: `agent-progress.md`에 범위·검증·리스크를 영어로 짧게 기록한다.**

```md
### 2026-07-14 - Reconcile area geometry after committed child changes

- Added shared area drop-target feedback and baseline-based area geometry reconciliation.
- Verification: focused API/Web tests, lint, typecheck, build, harness check, and diff check passed.
```

- [ ] **Step 4: 진행 기록만 선택적으로 커밋한다.**

```bash
git add agent-progress.md
git commit -m "Docs: 영역 geometry 검증 기록"
```
