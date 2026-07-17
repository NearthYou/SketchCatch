import assert from "node:assert/strict";
import test from "node:test";

import type { DiagramEdge, DiagramNode } from "../../../../packages/types/src";

import { getDiagramVisualBounds } from "./resource-node-visual-footprint";
import type { DiagramFlowEdge } from "./types";

const nodes: readonly DiagramNode[] = [
  {
    id: "source",
    type: "aws_s3_bucket",
    kind: "resource",
    position: { x: 0, y: 0 },
    size: { width: 100, height: 100 },
    label: "Source",
    iconUrl: "/icons/source.svg",
    locked: false,
    zIndex: 1
  },
  {
    id: "target",
    type: "aws_lambda_function",
    kind: "resource",
    position: { x: 300, y: 0 },
    size: { width: 100, height: 100 },
    label: "Target",
    iconUrl: "/icons/target.svg",
    locked: false,
    zIndex: 1
  }
];

const authoredEdge: DiagramEdge = {
  id: "source-target",
  sourceNodeId: "source",
  targetNodeId: "target",
  label: "long routed connection",
  route: {
    svgPath: "M 100 50 L 100 900 L 300 900 L 300 50",
    sourcePoint: { x: 100, y: 50 },
    targetPoint: { x: 300, y: 50 },
    waypoints: [
      { x: 100, y: 50 },
      { x: 100, y: 900 },
      { x: 300, y: 900 },
      { x: 300, y: 50 }
    ],
    labelPosition: { x: 200, y: 930 }
  }
};

const renderedAuthoredEdge: DiagramFlowEdge = {
  id: authoredEdge.id,
  source: authoredEdge.sourceNodeId,
  target: authoredEdge.targetNodeId,
  type: "diagramEdge",
  label: authoredEdge.label,
  data: {
    authoredRoute: authoredEdge.route,
    edge: authoredEdge,
    isAnimated: false,
    isAuthoredRouteStale: false,
    pathKind: "smoothstep"
  }
};

test("diagram visual bounds include rendered authored edge routes and label size", () => {
  const bounds = getDiagramVisualBounds(nodes, [renderedAuthoredEdge]);

  assert.equal(bounds.x, -6);
  assert.equal(bounds.y, 0);
  assert.equal(bounds.width, 412);
  assert.ok(bounds.height >= 939);
});

test("diagram visual bounds include generated curves, markers, and labels", () => {
  const edge: DiagramEdge = {
    id: "generated-edge",
    sourceNodeId: "source",
    targetNodeId: "target",
    label: "generated connection"
  };
  const renderedEdge: DiagramFlowEdge = {
    id: edge.id,
    source: edge.sourceNodeId,
    sourceHandle: "source-handle-left",
    target: edge.targetNodeId,
    targetHandle: "target-handle-left",
    type: "diagramEdge",
    label: edge.label,
    data: {
      edge,
      isAnimated: false,
      isAuthoredRouteStale: false,
      pathKind: "default"
    }
  };
  const bounds = getDiagramVisualBounds(nodes, [renderedEdge]);

  assert.ok(bounds.x < -14);
  assert.ok(bounds.y <= 0);
  assert.ok(bounds.x + bounds.width >= 406);
});
