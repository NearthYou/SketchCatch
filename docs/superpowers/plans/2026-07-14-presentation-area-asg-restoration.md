# Presentation Area 분리와 ASG Area 복원 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** presentation 전용 템플릿 프레임은 표시와 기존 레이아웃만 유지하고 빈 공간 상호작용에서는 제외하며, 모든 ASG를 실제 Area로 복원하고 템플릿 ASG에 `presentationArea: true`를 기록한다.

**Architecture:** `isAreaNode()`는 시각 프레임 판정으로 유지한다. `isPresentationOnlyAreaNode()`, `findAreaBlankInteractionNodeAtPoint()`, `isAreaDropParentNode()`를 추가해 빈 공간 선택과 신규 drop 부모 판정을 분리한다. ASG는 기본 Area 타입에 포함하므로 `presentationArea: true`가 있어도 실제 상호작용 Area로 남는다.

**Tech Stack:** TypeScript, React, React Flow, Node test runner, `tsx`, pnpm

## Global Constraints

- `presentationArea` shared type과 Terraform/AWS 계약은 변경하지 않는다.
- ECS Cluster, API Gateway, Kubernetes Namespace의 템플릿 프레임 렌더링과 기존 자식 배치를 유지한다.
- Security Group은 시각 범위로 유지하고 빈 공간 상호작용 및 신규 drop 부모에서는 제외한다.
- ASG는 일반 보드와 템플릿 모두 실제 Area이며 빈 공간 선택, 자식 이동, resize, drop 부모를 지원한다.
- 템플릿 ASG는 `metadata.presentationArea: true`를 가지며 40px 그리드의 작성된 크기를 사용한다.
- 새로운 runtime dependency를 추가하지 않는다.
- 현재 index에 다른 작업이 staged 상태이므로 source commit은 만들지 않는다. 관련 diff와 검증 결과를 최종 handoff에 분리해 기록한다.
- 실제 AWS, Terraform apply, deploy, destroy는 실행하지 않는다.

---

### Task 1: Area 역할 판정 분리

**Files:**
- Modify: `apps/web/features/diagram-editor/area-nodes.test.ts`
- Modify: `apps/web/features/diagram-editor/area-nodes.ts`

**Interfaces:**
- Consumes: `DiagramNode.metadata.presentationArea`, 기존 `isAreaNode()`, `isContainmentAreaNode()`
- Produces: `isPresentationOnlyAreaNode(node): boolean`, `isAreaDropParentNode(node): boolean`, `findAreaBlankInteractionNodeAtPoint(nodes, point): DiagramNode | null`

- [ ] **Step 1: presentation 전용 hit-test와 ASG Area 회귀 테스트 작성**

`area-nodes.test.ts`에 다음 동작을 추가한다.

```ts
test("presentation-only frame blocks blank interaction without falling through to its VPC", () => {
  const vpc = makeResourceNode({
    id: "vpc-1",
    resourceType: "aws_vpc",
    position: { x: 0, y: 0 },
    size: { width: 600, height: 500 },
    zIndex: 1
  });
  const ecs = makeResourceNode({
    id: "ecs-1",
    metadata: { parentAreaNodeId: vpc.id, presentationArea: true },
    resourceType: "aws_ecs_cluster",
    position: { x: 100, y: 100 },
    size: { width: 360, height: 260 },
    zIndex: 2
  });

  assert.equal(isAreaNode(ecs), true);
  assert.equal(isPresentationOnlyAreaNode(ecs), true);
  assert.equal(findAreaBlankInteractionNodeAtPoint([vpc, ecs], { x: 200, y: 200 }), null);
  assert.equal(findAreaBlankInteractionNodeAtPoint([vpc, ecs], { x: 40, y: 40 })?.id, vpc.id);
});

test("ASG stays an interactive drop Area even with presentation metadata", () => {
  const asg = makeResourceNode({
    id: "asg-1",
    metadata: { presentationArea: true },
    resourceType: "aws_autoscaling_group",
    position: { x: 100, y: 100 },
    size: { width: 320, height: 240 }
  });

  assert.equal(isAreaNode(asg), true);
  assert.equal(isContainmentAreaNode(asg), true);
  assert.equal(isPresentationOnlyAreaNode(asg), false);
  assert.equal(isAreaDropParentNode(asg), true);
  assert.equal(findAreaBlankInteractionNodeAtPoint([asg], { x: 200, y: 200 })?.id, asg.id);
});
```

presentation ECS 내부의 일반 리소스를 drop 후보로 검사할 때 ECS를 건너뛰고 VPC를 반환하는 테스트도 추가한다.

- [ ] **Step 2: RED 확인**

Run:

```bash
pnpm --dir apps/web exec tsx --test features/diagram-editor/area-nodes.test.ts
```

Expected: 새 export가 없거나 ASG가 Area가 아니어서 FAIL.

- [ ] **Step 3: 역할별 판정 최소 구현**

`area-nodes.ts`에서 `aws_autoscaling_group`을 `resourceAreaNodeTypes`에 복원하고 명시적 ASG 제외 조건을 제거한다. 다음 경계를 추가한다.

```ts
export function isPresentationOnlyAreaNode(node: DiagramNode): boolean {
  return (
    node.kind === "resource" &&
    node.metadata?.presentationArea === true &&
    !resourceAreaNodeTypes.has(getResourceNodeType(node))
  );
}

export function isAreaDropParentNode(node: DiagramNode): boolean {
  return isContainmentAreaNode(node) && !isPresentationOnlyAreaNode(node);
}

export function findAreaBlankInteractionNodeAtPoint(
  nodes: readonly DiagramNode[],
  point: DiagramNode["position"]
): DiagramNode | null {
  const visualArea = findInnermostAreaNodeAtPoint(nodes, point);

  if (
    !visualArea ||
    isPresentationOnlyAreaNode(visualArea) ||
    isSecurityGroupScopeNode(visualArea)
  ) {
    return null;
  }

  return visualArea;
}
```

`findInnermostAreaDropTarget()`과 persisted drop-parent hit-test는 `isAreaDropParentNode()`를 사용한다. 기존 `isContainmentAreaNode()`는 이미 저장된 template layout child 관계를 보존하기 위해 유지한다.

- [ ] **Step 4: GREEN 확인**

Run:

```bash
pnpm --dir apps/web exec tsx --test features/diagram-editor/area-nodes.test.ts
```

Expected: PASS.

- [ ] **Step 5: checkpoint 확인**

```bash
git diff --check -- apps/web/features/diagram-editor/area-nodes.ts apps/web/features/diagram-editor/area-nodes.test.ts
```

Expected: 출력 없음. 현재 dirty index 보호를 위해 source commit은 만들지 않는다.

### Task 2: DiagramEditor 빈 공간 선택 연결

**Files:**
- Create: `apps/web/features/diagram-editor/diagram-editor-area-blank-interaction.test.ts`
- Modify: `apps/web/features/diagram-editor/DiagramEditor.tsx`

**Interfaces:**
- Consumes: `findAreaBlankInteractionNodeAtPoint(nodes, point)`
- Produces: presentation 전용 프레임의 빈 공간 클릭은 선택 해제, 실제 Area와 ASG 빈 공간 클릭은 기존 선택·드래그 유지

- [ ] **Step 1: Editor wiring 회귀 테스트 작성**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  fileURLToPath(new URL("./DiagramEditor.tsx", import.meta.url)),
  "utf8"
);

test("DiagramEditor uses blank-interaction Area hit testing for pointer and pane clicks", () => {
  assert.equal(source.match(/findAreaBlankInteractionNodeAtPoint/g)?.length, 3);
  assert.doesNotMatch(source, /findInnermostAreaNodeAtPoint/);
});
```

- [ ] **Step 2: RED 확인**

Run:

```bash
pnpm --dir apps/web exec tsx --test features/diagram-editor/diagram-editor-area-blank-interaction.test.ts
```

Expected: `findAreaBlankInteractionNodeAtPoint` 사용 횟수가 없어 FAIL.

- [ ] **Step 3: Editor hit-test 교체**

`DiagramEditor.tsx`의 import와 `getAreaNodeFromPointerEvent`, `handlePaneClick` 두 호출을 `findAreaBlankInteractionNodeAtPoint()`로 교체한다. selection, double-click inspect, drag state 코드는 변경하지 않는다.

- [ ] **Step 4: GREEN 확인**

Run:

```bash
pnpm --dir apps/web exec tsx --test features/diagram-editor/diagram-editor-area-blank-interaction.test.ts features/diagram-editor/area-nodes.test.ts
```

Expected: PASS.

- [ ] **Step 5: checkpoint 확인**

```bash
git diff --check -- apps/web/features/diagram-editor/DiagramEditor.tsx apps/web/features/diagram-editor/diagram-editor-area-blank-interaction.test.ts
```

Expected: 출력 없음. 기존 staged `DiagramEditor.tsx` 변경은 그대로 유지한다.

### Task 3: 일반 ASG Area geometry 복원

**Files:**
- Modify: `apps/web/features/resource-settings/catalog.test.ts`
- Modify: `apps/web/features/resource-settings/catalog.ts`
- Modify: `apps/web/features/diagram-editor/palette-area-node-size.test.ts`
- Modify: `apps/web/features/diagram-editor/node-resize-bounds.test.ts`
- Modify: `apps/web/features/diagram-editor/node-resize-bounds.ts`
- Modify: `apps/web/features/diagram-editor/resource-node-geometry.test.ts`
- Modify: `apps/web/features/diagram-editor/resource-node-geometry.ts`

**Interfaces:**
- Consumes: `isAreaNode()`의 ASG 판정
- Produces: catalog ASG 기본 `200×130`, palette 추가 시 `400×260`, resize 최소 `100×65`, legacy ASG Area 크기 보존

- [ ] **Step 1: ASG geometry 기대값을 Area 기준으로 변경**

다음을 테스트에 먼저 반영한다.

```ts
assert.deepEqual(getResourceSize("aws_autoscaling_group"), { width: 200, height: 130 });
assert.deepEqual(getNodeResizeBounds(makeResourceNode("aws_autoscaling_group")), {
  minWidth: 100,
  minHeight: 65,
  maxWidth: Number.MAX_SAFE_INTEGER,
  maxHeight: Number.MAX_SAFE_INTEGER
});
```

`palette-area-node-size.test.ts`의 `AREA_EXPECTATIONS`에 ASG의 catalog `200×130`, Board `400×260`을 복원한다. `resource-node-geometry.test.ts`는 알려진 ASG Area 크기 `200×130`, `400×260`, `320×240`이 위치와 크기를 그대로 유지하고 ASG child의 `parentAreaNodeId`가 ASG를 가리키는지 검증한다.

- [ ] **Step 2: RED 확인**

Run:

```bash
pnpm --dir apps/web exec tsx --test features/resource-settings/catalog.test.ts features/diagram-editor/palette-area-node-size.test.ts features/diagram-editor/node-resize-bounds.test.ts features/diagram-editor/resource-node-geometry.test.ts
```

Expected: 현재 catalog `48×48`, 제한된 resize, ASG parent 정규화 때문에 FAIL.

- [ ] **Step 3: ASG Area geometry 구현**

`catalog.ts`에 다음 기본값을 복원한다.

```ts
const autoscalingGroupAreaSize = { width: 200, height: 130 };
```

ASG catalog presentation은 `size: autoscalingGroupAreaSize`를 사용한다. `node-resize-bounds.ts`에는 ASG의 무제한 max와 `100×65` minimum을 복원한다. `resource-node-geometry.ts`에서는 `LEGACY_AUTOSCALING_GROUP_AREA_SIZES`와 ASG를 `48×48`로 축소하는 분기를 제거한다. ASG가 `isAreaNode()`에서 조기 반환되므로 작성된 geometry와 parent가 유지된다.

- [ ] **Step 4: GREEN 확인**

Run:

```bash
pnpm --dir apps/web exec tsx --test features/resource-settings/catalog.test.ts features/diagram-editor/palette-area-node-size.test.ts features/diagram-editor/node-resize-bounds.test.ts features/diagram-editor/resource-node-geometry.test.ts
```

Expected: PASS.

- [ ] **Step 5: checkpoint 확인**

```bash
git diff --check -- apps/web/features/resource-settings/catalog.ts apps/web/features/resource-settings/catalog.test.ts apps/web/features/diagram-editor/palette-area-node-size.test.ts apps/web/features/diagram-editor/node-resize-bounds.ts apps/web/features/diagram-editor/node-resize-bounds.test.ts apps/web/features/diagram-editor/resource-node-geometry.ts apps/web/features/diagram-editor/resource-node-geometry.test.ts
```

Expected: 출력 없음.

### Task 4: 템플릿 ASG presentation Area 작성

**Files:**
- Modify: `packages/types/src/template-definitions.ts`
- Modify: `packages/types/src/template-layout-contract.test.ts`
- Modify: `apps/web/features/resource-settings/template-resource-materializer.test.ts`
- Modify: `apps/web/features/resource-settings/template-library.test.ts`

**Interfaces:**
- Consumes: `TemplatePresentationPlacement.presentationArea`, ASG Area 판정과 geometry
- Produces: `three-tier-web-app`의 ASG `metadata.presentationArea === true`, `320×320` Area, 내부 app Security Group과 Launch Template

- [ ] **Step 1: 작성된 ASG 템플릿 계약을 먼저 변경**

`template-layout-contract.test.ts`의 `three-tier-web-app` 기대값을 다음처럼 바꾼다.

```ts
"app-security-group": at(1080, 840, "application-group", { width: 240, height: 280 }),
"launch-template": at(1160, 880, "application-group"),
"application-group": at(1040, 800, "vpc", { width: 320, height: 320 }, true),
```

`template-resource-materializer.test.ts`에서 ASG를 일반 `48px` 기대 목록에서 제거하고 다음을 검증한다.

```ts
assert.equal(isAreaNode(asg), true);
assert.deepEqual(asg.size, { width: 320, height: 320 });
assert.equal(asg.metadata?.presentationArea, true);
```

ASG 내부 app Security Group과 Launch Template의 `parentAreaNodeId`가 ASG ID인지도 검증한다.

- [ ] **Step 2: RED 확인**

Run:

```bash
pnpm --dir apps/web exec tsx --test ../../packages/types/src/template-layout-contract.test.ts features/resource-settings/template-resource-materializer.test.ts features/resource-settings/template-library.test.ts
```

Expected: 현재 ASG에 size와 `presentationArea`가 없고 내부 노드 parent가 VPC여서 FAIL.

- [ ] **Step 3: 템플릿 placement 구현**

`template-definitions.ts`의 `three-tier-web-app` 배치를 다음처럼 바꾼다.

```ts
"app-security-group": layoutAt(1080, 840, "application-group", { width: 240, height: 280 }),
"launch-template": layoutAt(1160, 880, "application-group"),
"application-group": layoutAt(1040, 800, "vpc", { width: 320, height: 320 }, true),
```

이 배치는 ASG가 `1040..1360 × 760..1120` 범위에서 app Security Group과 Launch Template을 포함하고, 아래 DB Security Group과 경계를 공유하되 겹치지 않게 한다.

- [ ] **Step 4: GREEN 및 template layout 검증**

Run:

```bash
pnpm --dir apps/web exec tsx --test ../../packages/types/src/template-layout-contract.test.ts features/resource-settings/template-resource-materializer.test.ts features/resource-settings/template-library.test.ts features/resource-settings/template-sibling-collision-integration.test.ts
```

Expected: PASS; sibling collision과 Area containment 오류가 없어야 한다.

- [ ] **Step 5: checkpoint 확인**

```bash
git diff --check -- packages/types/src/template-definitions.ts packages/types/src/template-layout-contract.test.ts apps/web/features/resource-settings/template-resource-materializer.test.ts apps/web/features/resource-settings/template-library.test.ts
```

Expected: 출력 없음.

### Task 5: 전체 회귀 검증과 handoff

**Files:**
- Modify only if required by a directly failing ASG/presentation Area expectation: focused diagram/template tests
- Preserve: all unrelated staged Terraform, Workspace, docs changes

**Interfaces:**
- Consumes: Tasks 1-4 결과
- Produces: 검증 명령과 알려진 baseline을 기록한 완료 handoff

- [ ] **Step 1: Diagram/Template focused suite 실행**

```bash
pnpm --dir apps/web exec tsx --test \
  features/diagram-editor/area-nodes.test.ts \
  features/diagram-editor/diagram-editor-area-blank-interaction.test.ts \
  features/diagram-editor/area-node-movement.test.ts \
  features/diagram-editor/drag-transaction.test.ts \
  features/diagram-editor/flow-mappers.test.ts \
  features/diagram-editor/node-resize-bounds.test.ts \
  features/diagram-editor/palette-area-node-size.test.ts \
  features/diagram-editor/resource-node-geometry.test.ts \
  features/resource-settings/catalog.test.ts \
  features/resource-settings/template-resource-materializer.test.ts \
  features/resource-settings/template-library.test.ts \
  features/resource-settings/template-sibling-collision-integration.test.ts \
  ../../packages/types/src/template-layout-contract.test.ts
```

Expected: PASS.

- [ ] **Step 2: 필수 프로젝트 검증**

```bash
pnpm harness:check
pnpm lint
pnpm typecheck
pnpm build
```

Expected: 모두 exit code 0. 기존 lint warning이 있으면 변경 전 baseline과 동일한지 기록한다.

- [ ] **Step 3: clean-state 점검**

```bash
git diff --check
git status --short
```

Expected: whitespace 오류 없음. 기존 staged 변경과 이번 source 변경을 구분해 보고한다.

- [ ] **Step 4: progress 기록**

`agent-progress.md`에 presentation 전용 frame hit-test 분리, ASG Area 복원, 템플릿 ASG metadata/geometry, 실행한 검증과 알려진 위험을 영어로 간결히 추가한다. 현재 `agent-progress.md`의 기존 staged 내용은 보존한다.
