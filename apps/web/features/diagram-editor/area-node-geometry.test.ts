import assert from "node:assert/strict";
import test from "node:test";
import type { DiagramJson, DiagramNode } from "@sketchcatch/types";

import { reconcileAreaNodeGeometry } from "./area-node-geometry";
import { applyAreaNodeMovement } from "./area-node-movement";
import { normalizeDiagramResourceNodeGeometry } from "./resource-node-geometry";

test("자동 표시 프레임은 자식 변화로 자동 확대되지 않는다", () => {
  const frame = autoFrame();
  const child = resourceNode(frame.id);
  const movedChild = { ...child, position: { x: 220, y: 160 } };

  const result = reconcileAreaNodeGeometry(
    [frame, child],
    [frame, movedChild],
    new Set([child.id])
  );

  assert.deepEqual(result.find((node) => node.id === frame.id), frame);
});

test("자동 표시 프레임을 움직여도 저장된 자식이 따라가지 않는다", () => {
  const frame = autoFrame();
  const child = resourceNode(frame.id);
  const movedFrame = { ...frame, position: { x: 220, y: 180 } };

  const result = applyAreaNodeMovement(
    [frame, child],
    [movedFrame, child],
    new Set([frame.id])
  );

  assert.deepEqual(result.find((node) => node.id === child.id)?.position, child.position);
});

test("과거 Resource parent가 자동 프레임이어도 geometry 정규화가 조용히 지우지 않는다", () => {
  const frame = autoFrame();
  const child = resourceNode(frame.id);
  const diagram: DiagramJson = {
    nodes: [frame, child],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const result = normalizeDiagramResourceNodeGeometry(diagram);

  assert.equal(
    result.nodes.find((node) => node.id === child.id)?.metadata?.parentAreaNodeId,
    frame.id
  );
});

/** geometry 경계 테스트용 full-tuple 자동 프레임을 만듭니다. */
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

/** 과거 parent 값을 가진 Resource fixture를 만듭니다. */
function resourceNode(parentAreaNodeId: string): DiagramNode {
  return {
    id: "resource-a",
    type: "aws_instance",
    kind: "resource",
    position: { x: 80, y: 80 },
    size: { width: 48, height: 48 },
    label: "API Server",
    locked: false,
    zIndex: 2,
    metadata: { parentAreaNodeId },
    parameters: {
      resourceType: "aws_instance",
      resourceName: "api",
      fileName: "main.tf",
      values: {}
    }
  };
}
