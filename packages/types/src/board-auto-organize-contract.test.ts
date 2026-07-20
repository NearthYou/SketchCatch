import assert from "node:assert/strict";
import test from "node:test";
import type { DiagramJson, DiagramNode } from "./index";

import {
  hasSameBoardAutoOrganizeSemantics,
  isBoardAutoPresentationFrameNode,
  serializeBoardAutoOrganizeSemantics,
  serializeBoardAutoOrganizeSource
} from "./board-auto-organize-contract";

test("Board 자동 정리 source 직렬화는 viewport와 일시 선택만 제외한다", () => {
  const source = diagram();
  const otherViewport = {
    ...structuredClone(source),
    viewport: { x: 900, y: -300, zoom: 0.25 },
    selectedNodeIds: ["resource-a"],
    selectedEdgeIds: ["edge-a"]
  } as DiagramJson & {
    selectedEdgeIds: string[];
    selectedNodeIds: string[];
  };

  assert.equal(
    serializeBoardAutoOrganizeSource(source),
    serializeBoardAutoOrganizeSource(otherViewport)
  );

  otherViewport.nodes[0]!.position.x += 1;
  assert.notEqual(
    serializeBoardAutoOrganizeSource(source),
    serializeBoardAutoOrganizeSource(otherViewport)
  );
});

test("selected라는 Resource 설정은 일시 선택으로 오해하지 않고 의미에 남긴다", () => {
  const source = diagram();
  source.nodes[0]!.parameters!.values.selected = false;
  const changedSetting = structuredClone(source);
  changedSetting.nodes[0]!.parameters!.values.selected = true;
  const transientlySelected = {
    ...structuredClone(source),
    nodes: structuredClone(source.nodes).map((node, index) => ({
      ...node,
      ...(index === 0 ? { selected: true } : {})
    }))
  } as DiagramJson;

  assert.notEqual(
    serializeBoardAutoOrganizeSource(source),
    serializeBoardAutoOrganizeSource(changedSetting)
  );
  assert.equal(
    serializeBoardAutoOrganizeSource(source),
    serializeBoardAutoOrganizeSource(transientlySelected)
  );
  assert.equal(hasSameBoardAutoOrganizeSemantics(source, changedSetting), false);
});

test("Board 의미 직렬화는 허용된 화면 배치와 full-tuple 자동 프레임만 제외한다", () => {
  const source = diagram();
  const candidate = structuredClone(source);
  candidate.nodes[0]!.position = { x: 420, y: 260 };
  candidate.nodes[0]!.size = { width: 96, height: 72 };
  candidate.edges[0]!.sourceHandleId = "handle-bottom";
  candidate.edges[0]!.targetHandleId = "handle-top";
  candidate.edges[0]!.route = {
    ...candidate.edges[0]!.route!,
    svgPath: "M 420 260 L 700 400",
    sourcePoint: { x: 420, y: 260 },
    targetPoint: { x: 700, y: 400 },
    waypoints: [{ x: 560, y: 260 }]
  };
  candidate.nodes = candidate.nodes.filter((node) => node.id !== "board-auto-frame:old");
  candidate.nodes.push(autoFrame("board-auto-frame:new", false));

  assert.equal(
    serializeBoardAutoOrganizeSemantics(source),
    serializeBoardAutoOrganizeSemantics(candidate)
  );
  assert.equal(hasSameBoardAutoOrganizeSemantics(source, candidate), true);
});

test("Board 의미 직렬화는 화살표 방향과 사용자 Design Group을 유지한다", () => {
  const source = diagram();
  const changedArrow = structuredClone(source);
  changedArrow.edges[0]!.route!.arrowDirection = "target-to-source";
  const changedEdgeLayer = structuredClone(source);
  changedEdgeLayer.edges[0]!.zIndex = 99;
  const changedUserGroup = structuredClone(source);
  changedUserGroup.nodes.find((node) => node.id === "board-auto-frame:user")!.label = "바뀐 이름";

  assert.equal(hasSameBoardAutoOrganizeSemantics(source, changedArrow), false);
  assert.equal(hasSameBoardAutoOrganizeSemantics(source, changedEdgeLayer), false);
  assert.equal(hasSameBoardAutoOrganizeSemantics(source, changedUserGroup), false);
});

test("Board 의미 직렬화는 presentation 상태 전체를 유지한다", () => {
  const source = diagram();
  source.presentation = {
    geometryPolicy: "source-exact",
    initialViewportPending: true,
    sourceViewBox: { x: -40, y: -20, width: 900, height: 640 },
    terraformSourceFingerprint: "source-fingerprint"
  };
  const changedPolicy = structuredClone(source);
  changedPolicy.presentation!.geometryPolicy = "catalog-normalized";
  const changedViewBox = structuredClone(source);
  changedViewBox.presentation!.sourceViewBox!.x += 1;
  const changedViewportPolicy = structuredClone(source);
  changedViewportPolicy.presentation!.initialViewportPending = false;

  assert.equal(hasSameBoardAutoOrganizeSemantics(source, changedPolicy), false);
  assert.equal(hasSameBoardAutoOrganizeSemantics(source, changedViewBox), false);
  assert.equal(hasSameBoardAutoOrganizeSemantics(source, changedViewportPolicy), false);
});

test("자동 표시 프레임은 네 가지 소유권 값이 모두 맞아야 한다", () => {
  const owned = autoFrame("board-auto-frame:owned", false);

  assert.equal(isBoardAutoPresentationFrameNode(owned), true);
  assert.equal(
    isBoardAutoPresentationFrameNode({ ...owned, kind: "resource" }),
    false
  );
  assert.equal(isBoardAutoPresentationFrameNode({ ...owned, type: "design-group" }), false);
  assert.equal(
    isBoardAutoPresentationFrameNode({
      ...owned,
      metadata: { presentationCatalogItemId: "design-region" }
    }),
    false
  );
  assert.equal(isBoardAutoPresentationFrameNode({ ...owned, id: "user-frame" }), false);
});

/** 직렬화 테스트가 의미 값과 화면 값을 함께 가진 실제 Diagram을 사용하게 합니다. */
function diagram(): DiagramJson {
  return {
    nodes: [
      {
        id: "resource-a",
        type: "aws_instance",
        kind: "resource",
        position: { x: 40, y: 80 },
        size: { width: 48, height: 48 },
        label: "API Server",
        locked: false,
        zIndex: 2,
        parameters: {
          resourceType: "aws_instance",
          resourceName: "api",
          fileName: "main.tf",
          values: { instance_type: "t3.micro" }
        }
      },
      {
        id: "resource-b",
        type: "aws_s3_bucket",
        kind: "resource",
        position: { x: 320, y: 80 },
        size: { width: 48, height: 48 },
        label: "Assets",
        locked: false,
        zIndex: 2,
        parameters: {
          resourceType: "aws_s3_bucket",
          resourceName: "assets",
          fileName: "main.tf",
          values: { force_destroy: false }
        }
      },
      {
        ...autoFrame("board-auto-frame:user", false),
        id: "board-auto-frame:user",
        metadata: { presentationCatalogItemId: "design-region" },
        label: "사용자 그룹"
      },
      autoFrame("board-auto-frame:old", false)
    ],
    edges: [
      {
        id: "edge-a",
        sourceNodeId: "resource-a",
        targetNodeId: "resource-b",
        label: "uploads",
        route: {
          svgPath: "M 88 104 L 320 104",
          sourcePoint: { x: 88, y: 104 },
          targetPoint: { x: 320, y: 104 },
          waypoints: [],
          arrowDirection: "source-to-target"
        }
      }
    ],
    viewport: { x: 10, y: 20, zoom: 0.8 },
    variables: [
      {
        id: "instance-type",
        name: "instance_type",
        type: "string",
        value: "t3.micro",
        bindings: [{ nodeId: "resource-a", parameterKey: "instance_type" }],
        source: "user"
      }
    ]
  };
}

/** full-tuple 자동 표시 프레임 fixture를 한 곳에서 정확히 만듭니다. */
function autoFrame(id: string, locked: boolean): DiagramNode {
  return {
    id,
    type: "design_group",
    kind: "design",
    position: { x: 0, y: 0 },
    size: { width: 420, height: 220 },
    label: "자동 표시 영역",
    locked,
    zIndex: 0,
    metadata: { presentationCatalogItemId: "design-group" }
  };
}
