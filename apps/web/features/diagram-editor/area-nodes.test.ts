import assert from "node:assert/strict";
import test from "node:test";
import type { DiagramNode } from "@sketchcatch/types";

import {
  findInnermostAreaDropTarget,
  isAreaDropParentNode,
  isAreaNode,
  isContainmentAreaNode
} from "./area-nodes";

test("자동 표시 프레임은 보이지만 Resource parent나 drop target이 되지 않는다", () => {
  const frame = autoFrame();
  const resource = resourceNode({ x: 80, y: 80 });

  assert.equal(isAreaNode(frame), true);
  assert.equal(isContainmentAreaNode(frame), false);
  assert.equal(isAreaDropParentNode(frame), false);
  assert.equal(findInnermostAreaDropTarget(resource, [frame, resource]), null);
});

test("prefix만 같은 사용자 Design Group은 기존 containment 동작을 유지한다", () => {
  const userGroup = {
    ...autoFrame(),
    metadata: { presentationCatalogItemId: "design-region" },
    label: "사용자 그룹"
  };
  const resource = resourceNode({ x: 80, y: 80 });

  assert.equal(isContainmentAreaNode(userGroup), true);
  assert.equal(findInnermostAreaDropTarget(resource, [userGroup, resource])?.id, userGroup.id);
});

test("Reverse Engineering 인프라 프레임은 보여도 실제 AWS parent가 되지 않는다", () => {
  const frame: DiagramNode = {
    ...autoFrame(),
    id: "reverse-infra-frame:project:demo",
    label: "프로젝트 · demo",
    metadata: {
      presentationCatalogItemId: "design-group",
      reverseEngineeringInfrastructureFrame: {
        source: "aws_scan",
        groupBy: "project",
        groupKey: "demo",
        memberNodeIds: ["resource-a"]
      }
    }
  };
  const resource = resourceNode({ x: 80, y: 80 });

  assert.equal(isAreaNode(frame), true);
  assert.equal(isContainmentAreaNode(frame), false);
  assert.equal(isAreaDropParentNode(frame), false);
  assert.equal(findInnermostAreaDropTarget(resource, [frame, resource]), null);
});

/** full-tuple 자동 표시 프레임을 Editor 경계 테스트용으로 만듭니다. */
function autoFrame(): DiagramNode {
  return {
    id: "board-auto-frame:group",
    type: "design_group",
    kind: "design",
    position: { x: 20, y: 20 },
    size: { width: 320, height: 220 },
    label: "자동 표시 영역",
    locked: false,
    zIndex: 0,
    metadata: { presentationCatalogItemId: "design-group" }
  };
}

/** drop target 안에 놓인 Resource fixture를 만듭니다. */
function resourceNode(position: DiagramNode["position"]): DiagramNode {
  return {
    id: "resource-a",
    type: "aws_instance",
    kind: "resource",
    position,
    size: { width: 48, height: 48 },
    label: "API Server",
    locked: false,
    zIndex: 2
  };
}
