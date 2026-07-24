import assert from "node:assert/strict";
import test from "node:test";
import type { DiagramJson, DiagramNode } from "@sketchcatch/types";

import {
  isOwnedAutoFrame,
  reconcilePresentationFrames
} from "./board-auto-organize-frames";

test("잠기지 않은 full-tuple 자동 프레임만 자동 조정할 수 있다", () => {
  const lockedOwnedFrame = autoFrame("board-auto-frame:locked", true, 20);
  const unlockedOwnedFrame = autoFrame("board-auto-frame:replace", false, 40);
  const staleOwnedFrame = autoFrame("board-auto-frame:stale", false, 60);
  const prefixOnlyUserFrame = {
    ...autoFrame("board-auto-frame:user", false, 80),
    metadata: { presentationCatalogItemId: "design-region" }
  };
  const source = frameDiagram([
    lockedOwnedFrame,
    unlockedOwnedFrame,
    staleOwnedFrame,
    prefixOnlyUserFrame
  ]);
  const replacement = autoFrame("board-auto-frame:replace", false, 240);
  const added = {
    ...autoFrame("board-auto-frame:added", false, 480),
    metadata: {
      parentAreaNodeId: "resource-a",
      presentationCatalogItemId: "design-group"
    },
    parameters: {
      resourceType: "aws_instance",
      resourceName: "must-not-leak",
      fileName: "main.tf",
      values: { instance_type: "m7i.large" }
    }
  };
  const candidate = frameDiagram([replacement, added]);

  assert.equal(isOwnedAutoFrame(unlockedOwnedFrame), true);
  assert.equal(isOwnedAutoFrame(prefixOnlyUserFrame), false);

  const reconciled = reconcilePresentationFrames(source, candidate);
  assert.deepEqual(findNode(reconciled, lockedOwnedFrame.id), lockedOwnedFrame);
  assert.deepEqual(findNode(reconciled, prefixOnlyUserFrame.id), prefixOnlyUserFrame);
  assert.deepEqual(findNode(reconciled, replacement.id)?.position, replacement.position);
  assert.equal(findNode(reconciled, staleOwnedFrame.id), undefined);
  assert.equal(findNode(reconciled, added.id)?.parameters, undefined);
  assert.equal(findNode(reconciled, added.id)?.metadata?.parentAreaNodeId, undefined);
});

test("후보가 사용자 Design Group을 빠뜨려도 자동 프레임 정리는 삭제하지 않는다", () => {
  const userGroup = {
    ...autoFrame("user-authored-group", false, 120),
    id: "user-authored-group",
    label: "사용자 운영 영역"
  };
  const source = frameDiagram([userGroup]);
  const candidate = frameDiagram([]);

  const reconciled = reconcilePresentationFrames(source, candidate);

  assert.deepEqual(findNode(reconciled, userGroup.id), userGroup);
});

test("source edge가 참조하는 잠기지 않은 자동 프레임은 endpoint와 함께 보존한다", () => {
  const referencedFrame = autoFrame("board-auto-frame:referenced", false, 120);
  const source = frameDiagram([referencedFrame]);
  source.edges.push({
    id: "frame-guide",
    sourceNodeId: referencedFrame.id,
    targetNodeId: "resource-a",
    label: "표시 연결",
    metadata: { presentationRole: "detail" }
  });
  const candidate = structuredClone(source);
  candidate.nodes = candidate.nodes.filter((node) => node.id !== referencedFrame.id);

  const reconciled = reconcilePresentationFrames(source, candidate);
  const resultingNodeIds = new Set(reconciled.nodes.map((node) => node.id));

  assert.deepEqual(findNode(reconciled, referencedFrame.id), referencedFrame);
  assert.equal(
    reconciled.edges.every(
      (edge) =>
        resultingNodeIds.has(edge.sourceNodeId) &&
        resultingNodeIds.has(edge.targetNodeId)
    ),
    true
  );
});

test("자동 프레임은 같은 ID의 기존 Resource와 겹쳐 추가되지 않는다", () => {
  const source = frameDiagram([]);
  const sourceResource = source.nodes[0]!;
  sourceResource.id = "board-auto-frame:resource";
  const collidingFrame = autoFrame(sourceResource.id, false, 240);
  const candidate: DiagramJson = {
    ...structuredClone(source),
    nodes: [structuredClone(sourceResource), collidingFrame]
  };

  const reconciled = reconcilePresentationFrames(source, candidate);

  assert.deepEqual(
    reconciled.nodes.filter((node) => node.id === sourceResource.id),
    [sourceResource]
  );
});

/** 프레임 조정 결과에서 원하는 노드를 안전하게 찾습니다. */
function findNode(diagram: DiagramJson, nodeId: string): DiagramNode | undefined {
  return diagram.nodes.find((node) => node.id === nodeId);
}

/** full-tuple 소유권을 만족하는 표시 프레임을 만듭니다. */
function autoFrame(id: string, locked: boolean, x: number): DiagramNode {
  return {
    id,
    type: "design_group",
    kind: "design",
    position: { x, y: 20 },
    size: { width: 220, height: 140 },
    label: "자동 표시 영역",
    locked,
    zIndex: 0,
    metadata: { presentationCatalogItemId: "design-group" }
  };
}

/** Resource와 프레임을 함께 가진 최소 Diagram fixture를 만듭니다. */
function frameDiagram(frames: readonly DiagramNode[]): DiagramJson {
  return {
    nodes: [
      {
        id: "resource-a",
        type: "aws_instance",
        kind: "resource",
        position: { x: 100, y: 100 },
        size: { width: 48, height: 48 },
        label: "API Server",
        locked: false,
        zIndex: 2,
        parameters: {
          resourceType: "aws_instance",
          resourceName: "api",
          fileName: "main.tf",
          values: {}
        }
      },
      ...frames.map((frame) => structuredClone(frame))
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}
