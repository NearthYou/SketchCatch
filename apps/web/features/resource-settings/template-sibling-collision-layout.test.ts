import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramJson, DiagramNode } from "../../../../packages/types/src";
import { getResourceNodeVisualBounds } from "../diagram-editor/resource-node-visual-footprint";
import { resolveTemplateSiblingVisualCollisions } from "./template-sibling-collision-layout";

test("resolveTemplateSiblingVisualCollisions separates overlapping resource captions on the 40px grid", () => {
  const first = resourceNode("first", { x: 80, y: 120 });
  const later = resourceNode("later", { x: 120, y: 120 });

  const resolved = resolveTemplateSiblingVisualCollisions(createDiagram([first, later]));
  const resolvedFirst = requireNode(resolved, "first");
  const resolvedLater = requireNode(resolved, "later");

  assert.deepEqual(resolvedFirst.position, first.position);
  assert.equal(intersects(resolvedFirst, resolvedLater), false);
  assert.equal(resolvedLater.position.x % 40, 0);
  assert.equal(resolvedLater.position.y % 40, 0);
});

test("resolveTemplateSiblingVisualCollisions moves an Area subtree as one unit", () => {
  const firstArea = areaNode("first-area", { x: 80, y: 80 });
  const laterArea = areaNode("later-area", { x: 80, y: 80 });
  const child = resourceNode("child", { x: 120, y: 120 }, "later-area");

  const resolved = resolveTemplateSiblingVisualCollisions(
    createDiagram([firstArea, laterArea, child])
  );
  const resolvedArea = requireNode(resolved, "later-area");
  const resolvedChild = requireNode(resolved, "child");
  const areaDelta = {
    x: resolvedArea.position.x - laterArea.position.x,
    y: resolvedArea.position.y - laterArea.position.y
  };
  const childDelta = {
    x: resolvedChild.position.x - child.position.x,
    y: resolvedChild.position.y - child.position.y
  };

  assert.equal(intersects(requireNode(resolved, "first-area"), resolvedArea), false);
  assert.deepEqual(childDelta, areaDelta);
});

test("resolveTemplateSiblingVisualCollisions expands a parent to contain a child visual footprint", () => {
  const vpc = areaNode("vpc", { x: 80, y: 80 });
  const instance = resourceNode("instance", { x: 200, y: 200 }, "vpc");

  const resolved = resolveTemplateSiblingVisualCollisions(createDiagram([vpc, instance]));
  const resolvedVpc = requireNode(resolved, "vpc");
  const resolvedInstance = requireNode(resolved, "instance");
  const childBounds = getResourceNodeVisualBounds(resolvedInstance);

  assert.ok(childBounds.x >= resolvedVpc.position.x);
  assert.ok(childBounds.y >= resolvedVpc.position.y);
  assert.ok(childBounds.x + childBounds.width <= resolvedVpc.position.x + resolvedVpc.size.width);
  assert.ok(childBounds.y + childBounds.height <= resolvedVpc.position.y + resolvedVpc.size.height);
  assert.equal(resolvedVpc.size.width % 40, 0);
  assert.equal(resolvedVpc.size.height % 40, 0);
});

test("resolveTemplateSiblingVisualCollisions keeps a collapsed helper inside its parent without expanding it", () => {
  const securityGroup = areaNode("security-group", { x: 80, y: 80 });
  const launchTemplate = hiddenLaunchTemplateNode(
    "launch-template",
    { x: 400, y: 400 },
    "security-group"
  );

  const resolved = resolveTemplateSiblingVisualCollisions(
    createDiagram([securityGroup, launchTemplate])
  );
  const resolvedParent = requireNode(resolved, "security-group");
  const resolvedHelper = requireNode(resolved, "launch-template");

  assert.deepEqual(resolvedParent.size, securityGroup.size);
  assert.ok(resolvedHelper.position.x >= resolvedParent.position.x);
  assert.ok(resolvedHelper.position.y >= resolvedParent.position.y);
  assert.ok(
    resolvedHelper.position.x + resolvedHelper.size.width <=
      resolvedParent.position.x + resolvedParent.size.width
  );
  assert.ok(
    resolvedHelper.position.y + resolvedHelper.size.height <=
      resolvedParent.position.y + resolvedParent.size.height
  );
});

function createDiagram(nodes: readonly DiagramNode[]): DiagramJson {
  return { edges: [], nodes, viewport: { x: 0, y: 0, zoom: 1 } };
}

function areaNode(id: string, position: DiagramNode["position"]): DiagramNode {
  return {
    id,
    kind: "resource",
    label: id,
    locked: false,
    parameters: {
      fileName: "main",
      resourceName: id,
      resourceType: "aws_vpc",
      terraformBlockType: "resource",
      values: {}
    },
    position,
    size: { height: 160, width: 160 },
    type: "aws_vpc",
    zIndex: 1
  };
}

function resourceNode(
  id: string,
  position: DiagramNode["position"],
  parentAreaNodeId?: string
): DiagramNode {
  return {
    id,
    kind: "resource",
    label: id,
    locked: false,
    metadata: parentAreaNodeId ? { parentAreaNodeId } : undefined,
    position,
    size: { height: 48, width: 48 },
    type: "aws_instance",
    zIndex: 100
  };
}

function hiddenLaunchTemplateNode(
  id: string,
  position: DiagramNode["position"],
  parentAreaNodeId: string
): DiagramNode {
  return {
    ...resourceNode(id, position, parentAreaNodeId),
    parameters: {
      fileName: "main",
      resourceName: id,
      resourceType: "aws_launch_template",
      terraformBlockType: "resource",
      values: {}
    },
    type: "aws_launch_template"
  };
}

function requireNode(diagram: DiagramJson, id: string): DiagramNode {
  const node = diagram.nodes.find((candidate) => candidate.id === id);
  assert.ok(node, `Expected ${id}`);
  return node;
}

function intersects(left: DiagramNode, right: DiagramNode): boolean {
  const a = getResourceNodeVisualBounds(left);
  const b = getResourceNodeVisualBounds(right);

  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}
