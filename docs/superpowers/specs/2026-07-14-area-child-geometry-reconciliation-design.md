# 영역 자식 Geometry 재조정 설계

## 목표

Architecture Board의 영역 노드가 다른 영역의 자식이 될 수 있음을 드래그 중에 명확히 표시하고, 자식 변경이 확정된 시점에만 크기를 다시 계산하도록 한다. 자식이 추가되거나 이동하면 필요한 만큼 확장하고, 자식이 줄어들면 남은 자식을 감싸는 범위까지 축소한다. 마지막 자식이 제거되면 자동 확장 전 사용자가 설정했던 위치와 크기로 정확히 복원한다.

## 현재 문제

- 영역 노드를 다른 영역으로 드래그하면 부모 후보가 하이라이트되지 않는다. 현재 `findInnermostAreaDropTarget()`은 드래그 중인 노드가 영역이면 즉시 `null`을 반환하지만, drag stop의 부모 할당은 자식 영역 전체가 후보 영역에 포함되면 정상 처리한다. 따라서 드래그 피드백과 최종 결과가 일치하지 않는다.
- 영역 또는 일반 리소스가 부모 영역에 들어오면 현재 로직은 자식 크기의 `1.5` 배만큼 부모와 조상 영역을 누적 확장한다. 자식을 삭제하거나 다른 영역으로 이동해도 삭제 경로는 노드와 부모 관계만 정리하므로 확장된 영역 크기가 줄어들지 않는다.

## 사용자 동작

- 영역을 다른 영역으로 드래그할 때 자식 영역의 전체 bounding box가 들어간 가장 안쪽 부모 후보를 하이라이트한다.
- 하이라이트된 부모 후보와 drag stop 후 저장되는 `parentAreaNodeId`는 같은 판정 함수를 사용한다. 일부만 겹친 영역, 자기 자신, 자신의 자손 영역은 부모 후보로 표시하지 않는다.
- 자식이 없던 영역에 첫 자식이 들어오면 현재 `position`과 `size`를 자동 크기 기준값으로 저장한다.
- 자식이 있는 동안 영역은 `기준 사각형 ∪ 직접 자식 bounding box + padding`을 감싸는 크기를 사용한다.
- 자식이 일부 제거되거나 다른 영역으로 이동하면 남은 직접 자식 기준으로 다시 축소한다.
- 마지막 직접 자식이 제거되면 저장한 기준 `position`과 `size`를 복원하고 기준 metadata를 제거한다.
- 자식이 있는 동안 사용자가 영역을 직접 리사이즈하면 완료된 수동 geometry를 새로운 기준값으로 저장한다. 현재 자식이 그 범위를 벗어나면 최종 표시 크기는 자식까지 감싸도록 확장한다.
- 자식이 있는 영역을 사용자가 이동하면 기준 위치에도 동일한 이동량을 적용한다. 이후 마지막 자식을 제거해도 이동 전 위치로 되돌아가지 않는다.
- `영역 자동 확장` 설정이 꺼져 있으면 기준값을 만들거나 자동 재조정하지 않는다.

## 데이터 계약

`DiagramNodeMetadata`에 다음 provider-neutral 보드 편집 metadata를 추가한다.

```ts
type DiagramNodeMetadata = {
  parentAreaNodeId?: string;
  areaAutoSizeBaseline?: {
    position: { x: number; y: number };
    size: { width: number; height: number };
  };
};
```

`areaAutoSizeBaseline`은 Terraform resource/data 생성에 사용하지 않는다. 프로젝트 draft와 Terraform synchronization request가 DiagramJson을 왕복할 때 손실되지 않도록 shared type과 두 API Zod schema에 같은 구조를 추가한다. 좌표는 finite number, 크기는 finite positive number로 검증한다.

기존 저장 데이터에 이 필드가 없으면 현재 영역 geometry를 보수적인 기준으로 사용한다. 자식이 모두 제거된 후 metadata를 삭제하므로 다음 자동 크기 주기는 당시의 최신 수동 geometry에서 다시 시작한다.

## Geometry 계산

계산은 직접 자식 관계인 `metadata.parentAreaNodeId`만 사용한다. 전체 노드를 한 번 순회해 `parentAreaNodeId -> direct children` map을 만든다.

영역별 목표 사각형은 다음 두 사각형의 합집합이다.

1. `areaAutoSizeBaseline` 사각형
2. 직접 자식 bounding box에 좌우 `12px`, 상단 `28px`, 하단 `12px` padding을 더한 사각형

직접 자식이 없으면 baseline을 그대로 복원한다. baseline도 없는 legacy 영역은 현재 geometry를 유지한다. 중첩 영역은 가장 깊은 영역부터 계산해 안쪽 영역의 최종 geometry가 바깥 영역의 자식 bounding box에 반영되도록 한다. 순환하거나 존재하지 않는 부모 참조는 방문 집합으로 중단하고 해당 경로를 변경하지 않는다.

## 실행 경계

재조정은 React render, `pointermove`, drag preview에서 실행하지 않는다. 다음 확정 이벤트의 기존 diagram transaction 안에서 한 번만 실행한다.

- Palette resource drop
- 기존 노드 drag stop과 영역 간 재배치
- 붙여넣기
- 노드 삭제
- 자식이 있는 영역의 수동 resize 완료
- 자식이 있는 영역 또는 그 조상 영역의 이동 완료

Undo/Redo, 초기 draft load, preview render에서는 저장된 geometry를 그대로 복원한다. Template 적용이나 Terraform synchronization처럼 완성된 DiagramJson 전체를 교체하는 경로도 별도 사용자 편집 이벤트가 발생하기 전에는 자동 정규화하지 않는다.

부모 후보 하이라이트 판정은 기존 drag preview 갱신 시점에 실행하되 geometry를 변경하지 않는다. 일반 리소스는 기존 중심점 포함 기준을 유지하고, 영역 자식은 최종 부모 할당과 동일한 전체 bounding box 포함 기준을 사용한다. 여러 후보가 포함 조건을 만족하면 면적이 가장 작은 영역을 선택하고, 면적이 같으면 높은 `zIndex`를 우선한다.

## 구현 경계

`area-node-expansion.ts`의 누적 `1.5` 배 확장을 순수 geometry reconciliation 모듈로 교체한다. 모듈은 노드 배열과 영향받은 영역 ID를 받아 변경된 영역 노드만 새 객체로 반환한다. 이벤트 연결은 `DiagramEditor.tsx`와 `drag-transaction.ts`에 유지하되, 크기 계산 자체는 React와 React Flow에 의존하지 않는다.

영역 자식의 부모 후보 판정은 `area-node-movement.ts`의 실제 부모 할당 로직과 `area-nodes.ts`의 드래그 하이라이트 로직이 공유하는 순수 함수로 분리한다. 이 함수는 전체 포함, 자기 자신 제외, 자손 제외, 가장 안쪽 영역 선택 규칙을 한곳에서 책임진다. 일반 리소스의 기존 중심점 기반 하이라이트 동작은 변경하지 않는다.

하나의 `commitDiagramUpdate()` 또는 drag finalize transaction 안에서 부모 할당, baseline 갱신, geometry 재조정을 순서대로 수행한다. 따라서 사용자 동작 하나는 history 항목 하나와 React state 갱신 한 번만 만든다.

## 성능

확정 이벤트당 전체 노드 grouping은 `O(N)`, 영향받은 영역과 조상 재계산은 `O(A + C)`이다. 여기서 `A`는 영향받은 영역 수, `C`는 해당 직접 자식 수다. 포인터 이동 중에는 실행하지 않고 geometry가 실제로 달라진 영역만 새 객체로 만들기 때문에 일반적인 수십~수백 노드 보드에서 추가 렌더 부담은 제한적이다.

## 검증

- 영역을 다른 영역 안으로 완전히 드래그하면 실제 부모로 지정될 영역이 하이라이트된다.
- 영역이 후보 영역과 일부만 겹치면 하이라이트되지 않고 drag stop 후에도 부모로 지정되지 않는다.
- 자기 자신과 자신의 자손 영역은 하이라이트 또는 부모 후보가 되지 않는다.
- 일반 리소스의 중심점 기반 부모 하이라이트는 기존 동작을 유지한다.
- 첫 자식 추가 시 기존 영역 geometry가 baseline으로 저장되고 필요한 방향으로만 확장된다.
- 일부 자식 제거 시 baseline보다 작아지지 않으면서 남은 자식까지 축소된다.
- 마지막 자식 제거 시 원래 baseline 위치와 크기가 복원되고 metadata가 제거된다.
- 자식이 다른 영역으로 이동하면 이전 영역과 새 영역을 같은 transaction에서 재조정한다.
- 중첩 영역은 안쪽부터 바깥쪽으로 재조정된다.
- 자식이 있는 동안 수동 resize한 geometry가 새 baseline이 된다.
- 영역 이동 시 baseline 위치가 같은 delta만큼 이동한다.
- 자동 확장 설정이 꺼져 있으면 자동 geometry와 baseline이 변경되지 않는다.
- 기존 draft와 Terraform API schema는 baseline이 없는 DiagramJson도 계속 허용한다.
- 관련 focused tests 이후 `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm harness:check`, `git diff --check`를 실행한다.

## 제외 범위

- 자식 자동 정렬 또는 grid layout
- 드래그 중 실시간 영역 resize preview
- 사용자에게 baseline을 직접 편집하는 별도 UI
- Terraform HCL에 baseline metadata를 반영하는 동작
