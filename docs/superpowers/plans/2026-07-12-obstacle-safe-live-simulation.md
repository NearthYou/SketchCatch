# Obstacle-Safe Live Simulation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 생성 다이어그램의 화살표가 중간 리소스를 가로지르지 않게 하고, Live Observation에 접을 수 있는 AI 시뮬레이션과 극적인 동적 Capacity 관측을 제공한다.

**Architecture:** 엣지 장애물 회피 계산을 Diagram Editor 공용 순수 함수로 분리해 AI 다이어그램 정규화와 실제 React Flow 렌더가 같은 핸들 결정을 사용한다. Live Observation 모델은 최대 용량에서 최대 8개 슬롯과 초과 개수를 계산하고, 모달은 AI 결과 표시 토글과 실제/목업 부하 액션을 독립 상태로 관리한다.

**Tech Stack:** TypeScript, React 19, Next.js 16, React Flow, CSS Modules, Node test runner

## Global Constraints

- 기존 정렬과 `smoothstep` 엣지 표현을 유지한다.
- 시작·도착 리소스를 제외한 Resource 경계를 화살표가 통과하지 않는다.
- Area 노드는 경로 장애물에서 제외한다.
- AI 시뮬레이션 토글은 기본 ON이며 OFF에서도 계산 결과를 유지한다.
- 결과 순서는 `요약 문장 → 병목 후보 → 장애 대응 → 비용·다음 검토 → LLM 설명`이다.
- Capacity 개별 슬롯은 최대 8개이며 초과분은 `+N`으로 표시한다.
- 실제 AWS 부하와 개발 목업 부하는 UI에서 기존 데이터 출처 구분을 유지한다.
- 새 런타임 의존성을 추가하지 않는다.

---

### Task 1: 실제 렌더 경로의 장애물 회피

**Files:**
- Create: `apps/web/features/diagram-editor/obstacle-safe-edge-routing.ts`
- Create: `apps/web/features/diagram-editor/obstacle-safe-edge-routing.test.ts`
- Modify: `apps/web/features/diagram-editor/flow-mappers.ts`
- Modify: `apps/web/features/workspace/workspace-ai-diagram-adapter.ts`
- Test: `apps/web/features/workspace/workspace-ai-diagram-adapter.test.ts`

**Interfaces:**
- Produces: `getObstacleSafeEdgeHandles(sourceNode, targetNode, nodes, occupiedRoutes)`
- Produces: `createOccupiedOrthogonalRoute(edge, nodeById)`
- Consumes: `DiagramNode`, `DiagramEdge`, 네 방향 handle ID

- [ ] **Step 1: 중간 Resource를 피하는 실패 테스트 작성**

```ts
test("chooses vertical handles when a horizontal route crosses an intermediate resource", () => {
  const handles = getObstacleSafeEdgeHandles(source, target, [source, blocker, target], []);
  const route = createTestRoute(source, target, handles);

  assert.equal(getRouteNodeOverlapLength(route, blocker), 0);
});

test("ignores area nodes as routing obstacles", () => {
  const handles = getObstacleSafeEdgeHandles(source, target, [source, area, target], []);
  assert.deepEqual(handles, { sourceHandleId: "right", targetHandleId: "left" });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/web && pnpm exec tsx --test features/diagram-editor/obstacle-safe-edge-routing.test.ts`

Expected: FAIL because `getObstacleSafeEdgeHandles` does not exist.

- [ ] **Step 3: 기존 점수 계산을 공용 순수 함수로 이동**

```ts
export function getObstacleSafeEdgeHandles(
  sourceNode: DiagramNode,
  targetNode: DiagramNode,
  nodes: readonly DiagramNode[],
  occupiedRoutes: readonly OccupiedOrthogonalRoute[]
): EdgeHandlePair {
  return EDGE_HANDLE_PAIRS
    .map((handles) => ({ handles, score: scoreCandidate(handles, sourceNode, targetNode, nodes, occupiedRoutes) }))
    .sort(compareCandidateScores)[0]!.handles;
}
```

후보 점수는 `다른 Resource와 겹치는 길이 × 차단 가중치`, endpoint 방향성, 총 길이, 기존 route 교차 순으로 계산한다. Resource 겹침이 0인 후보가 하나라도 있으면 겹치는 후보보다 항상 우선한다.

- [ ] **Step 4: AI 정규화와 React Flow mapper가 같은 helper 사용**

```ts
const handles = getObstacleSafeEdgeHandles(sourceNode, targetNode, nodes, occupiedRoutes);

const flowEdge = {
  ...baseEdge,
  sourceHandle: toReactFlowHandleId(handles.sourceHandleId, "source"),
  targetHandle: toReactFlowHandleId(handles.targetHandleId, "target")
};
```

`toFlowEdges`는 edge 순서대로 occupied route를 누적한다. 사용자가 명시적으로 저장한 핸들도 다른 Resource와 충돌하면 렌더 시 안전한 핸들로 교체한다.

- [ ] **Step 5: 집중 테스트 통과 확인**

Run: `cd apps/web && pnpm exec tsx --test features/diagram-editor/obstacle-safe-edge-routing.test.ts features/diagram-editor/flow-mappers.test.ts features/workspace/workspace-ai-diagram-adapter.test.ts`

Expected: PASS, including the existing intermediate-resource routing test.

- [ ] **Step 6: 커밋**

```bash
git add apps/web/features/diagram-editor/obstacle-safe-edge-routing.ts apps/web/features/diagram-editor/obstacle-safe-edge-routing.test.ts apps/web/features/diagram-editor/flow-mappers.ts apps/web/features/workspace/workspace-ai-diagram-adapter.ts apps/web/features/workspace/workspace-ai-diagram-adapter.test.ts
git commit -m "Fix: 생성 다이어그램 화살표 장애물 회피"
```

### Task 2: 동적 Capacity 표시 모델

**Files:**
- Modify: `apps/web/features/workspace/live-observation-diagram.ts`
- Modify: `apps/web/features/workspace/live-observation-diagram.test.ts`
- Modify: `apps/web/features/workspace/LiveObservationDiagramMap.tsx`

**Interfaces:**
- Produces: `LiveObservationDiagramModel.capacityUnits`
- Produces: `LiveObservationDiagramModel.hiddenCapacityCount`
- Constant: `MAX_VISIBLE_CAPACITY_UNITS = 8`

- [ ] **Step 1: 2, 8, 12 Capacity 실패 테스트 작성**

```ts
test("caps visible capacity at eight and reports overflow", () => {
  const model = createLiveObservationDiagramModel(diagramWithOneCapacityTemplate(), snapshot({ max: 12 }));
  assert.equal(model.status, "ready");
  assert.equal(model.capacityUnits.length, 8);
  assert.equal(model.hiddenCapacityCount, 4);
});
```

추가 테스트는 max 2에서 슬롯 2개, max 8에서 슬롯 8개, desired 2에서 두 번째 슬롯이 `launching`인지 검증한다.

- [ ] **Step 2: 실패 확인**

Run: `cd apps/web && pnpm exec tsx --test features/workspace/live-observation-diagram.test.ts`

Expected: FAIL because capacity is limited to authored diagram nodes and `hiddenCapacityCount` is missing.

- [ ] **Step 3: Capacity 슬롯 계산 구현**

```ts
const requestedSlotCount = Math.max(
  capacityNodes.length,
  snapshot?.capacity.currentInstanceCount ?? 0,
  snapshot?.capacity.desiredCapacity ?? 0,
  snapshot?.capacity.maxCapacity ?? 0
);
const visibleSlotCount = Math.min(MAX_VISIBLE_CAPACITY_UNITS, requestedSlotCount);
const hiddenCapacityCount = Math.max(0, requestedSlotCount - visibleSlotCount);
```

작성된 capacity node가 부족하면 첫 capacity node를 표시 템플릿으로 복제하되 ID와 label은 표시 전용으로 생성하고 저장된 `DiagramJson`은 변경하지 않는다.

- [ ] **Step 4: Map에 `+N`과 동적 최소 너비 연결**

```tsx
{model.hiddenCapacityCount > 0 ? (
  <div className={styles.liveObservationCapacityOverflow}>+{model.hiddenCapacityCount}</div>
) : null}
```

`minimumWidth`는 stage 폭과 `capacityUnits.length * 94`, overflow badge 폭을 합산한다.

- [ ] **Step 5: 집중 테스트 통과 확인**

Run: `cd apps/web && pnpm exec tsx --test features/workspace/live-observation-diagram.test.ts features/workspace/live-observation-modal.test.ts`

Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add apps/web/features/workspace/live-observation-diagram.ts apps/web/features/workspace/live-observation-diagram.test.ts apps/web/features/workspace/LiveObservationDiagramMap.tsx
git commit -m "Feat: Capacity 슬롯 동적 확장"
```

### Task 3: 관측 헤더, AI 토글, 결과 축소, 부하 액션

**Files:**
- Modify: `apps/web/features/workspace/LiveObservationModal.tsx`
- Modify: `apps/web/features/workspace/WorkspaceAiPanelPieces.tsx`
- Modify: `apps/web/features/workspace/live-observation-mock-preview.ts`
- Modify: `apps/web/features/workspace/live-observation-modal.test.ts`
- Modify: `apps/web/features/workspace/workspace.module.css`

**Interfaces:**
- State: `isAiSimulationVisible`, initial `true`
- Produces: `advanceMockTrafficLoad(state)` without network side effects
- Reuses: `WorkspaceAiDesignSimulationResult`

- [ ] **Step 1: 헤더·토글·결과·부하 액션 실패 테스트 작성**

```ts
assert.match(modalSource, /useState\(true\)/);
assert.match(modalSource, /aria-pressed=\{isAiSimulationVisible\}/);
assert.match(modalSource, />실시간 트래픽 관측</);
assert.doesNotMatch(modalSource, /오토 스케일링 관측|실제 배포 근거를 15분/);
assert.doesNotMatch(resultSource, />요청 흐름</);
assert.match(resultSource, /aiResultSummary[\s\S]*병목 후보[\s\S]*장애 대응[\s\S]*비용·다음 검토/);
assert.doesNotMatch(modalSource, /\{session \? \(\s*<footer/);
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/web && pnpm exec tsx --test features/workspace/live-observation-modal.test.ts`

Expected: FAIL on old title, missing toggle, request flow card, and conditional footer.

- [ ] **Step 3: 상태 유지형 토글과 결과 순서 구현**

```tsx
<button
  aria-pressed={isAiSimulationVisible}
  className={styles.liveObservationSimulationToggle}
  onClick={() => setAiSimulationVisible((visible) => !visible)}
  type="button"
>
  {isAiSimulationVisible ? <ToggleRight /> : <ToggleLeft />}
</button>
```

결과 section은 토글 OFF에서 렌더하지 않지만 `designSimulation`, loading, error state는 초기화하지 않는다. `WorkspaceAiDesignSimulationResult`에서 request flow card와 관련 map만 제거한다.

- [ ] **Step 4: 헤더와 고정 Control Rail 구현**

```tsx
<span className={styles.liveObservationEyebrow}>LIVE OBSERVATION</span>
<h2 id="live-observation-title">실시간 트래픽 관측</h2>
```

Footer는 항상 렌더한다. 실제 세션이면 `startBoost`, 개발 목업이면 `setMockRequestFlowState(advanceMockTrafficLoad)`를 호출하고 둘 다 아니면 비활성화한다.

- [ ] **Step 5: 트래픽과 Capacity 전환 애니메이션 강화**

```css
.liveObservationCapacityUnit[data-observation-state="launching"] {
  animation: liveObservationCapacityLaunch 720ms cubic-bezier(.2,.8,.2,1) both;
}

.liveObservationCapacityUnit[data-observation-state="active"] .liveObservationPresentationNodePulse {
  animation: liveObservationCapacityActivated 900ms ease-out both;
}
```

목업 부하 액션은 즉시 sequence를 증가시켜 connector particle key를 교체한다. Reduced Motion에서는 두 keyframe을 제거한다.

- [ ] **Step 6: 집중 테스트 통과 확인**

Run: `cd apps/web && pnpm exec tsx --test features/workspace/live-observation-modal.test.ts features/workspace/live-observation-diagram.test.ts features/workspace/live-observation.test.ts`

Expected: PASS.

- [ ] **Step 7: 커밋**

```bash
git add apps/web/features/workspace/LiveObservationModal.tsx apps/web/features/workspace/WorkspaceAiPanelPieces.tsx apps/web/features/workspace/live-observation-mock-preview.ts apps/web/features/workspace/live-observation-modal.test.ts apps/web/features/workspace/workspace.module.css
git commit -m "Feat: 관측 시뮬레이션과 부하 제어 개선"
```

### Task 4: 브라우저 검증과 저장소 검사

**Files:**
- Modify: `agent-progress.md`

**Interfaces:**
- Uses project: `cb8dd5bf-3424-4bd4-ad06-3c16f8ccf245`
- Uses URL: `http://localhost:3000/workspace?projectId=cb8dd5bf-3424-4bd4-ad06-3c16f8ccf245`

- [ ] **Step 1: 데스크톱 브라우저 검증**

로그인 후 시뮬레이션을 열어 헤더 두 줄, 기본 ON 토글, 요약 우선 결과, 고정 부하 버튼을 확인한다. 부하 버튼을 눌러 connector particle, STARTING 확장, RUNNING 펄스를 캡처한다.

- [ ] **Step 2: Capacity 12 fixture 검증**

테스트 snapshot에서 개별 슬롯 8개와 `+4`가 한 줄로 표시되고 메인 경로 stage가 이동하지 않는지 확인한다.

- [ ] **Step 3: 모바일 및 Reduced Motion 검증**

390px viewport에서 Capacity 영역이 가로 스크롤되고 버튼·제목이 겹치지 않는지 확인한다. Reduced Motion에서 위치·크기 애니메이션이 없는지 확인한다.

- [ ] **Step 4: 필수 검사 실행**

```bash
pnpm harness:check
pnpm lint
pnpm typecheck
pnpm build
```

Expected: all four commands PASS. Run `pnpm --filter @sketchcatch/web test` and record unrelated failures separately if the known baseline remains red.

- [ ] **Step 5: 진행 기록 및 최종 커밋**

```bash
git add agent-progress.md
git commit -m "Docs: 관측 UI 검증 기록"
```
