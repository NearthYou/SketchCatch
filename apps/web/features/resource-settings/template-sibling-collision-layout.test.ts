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

test("resolveTemplateSiblingVisualCollisions keeps the board available when collision placement reaches its cap", () => {
  const tallArea = {
    ...areaNode("a-tall-area", { x: 80, y: 80 }),
    size: { height: 2_000, width: 160 }
  };
  const overlappingResource = resourceNode("z-overlapping-resource", { x: 80, y: 80 });
  const originalConsoleError = console.error;
  const errors: string[] = [];

  console.error = (message?: unknown) => {
    errors.push(String(message));
  };

  try {
    assert.doesNotThrow(() =>
      resolveTemplateSiblingVisualCollisions(createDiagram([tallArea, overlappingResource]), 1)
    );
  } finally {
    console.error = originalConsoleError;
  }

  assert.deepEqual(errors, ["Unable to place Template node without overlap: z-overlapping-resource"]);
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

test("resolveTemplateSiblingVisualCollisions preserves an explicit Security Group scope overlap", () => {
  const securityGroup = securityGroupNode("security-group", { x: 80, y: 80 });
  const target = resourceNode("target", { x: 136, y: 136 });
  const diagram = createDiagram(
    [securityGroup, target],
    [{ id: "security-group-target", sourceNodeId: securityGroup.id, targetNodeId: target.id }]
  );

  const resolved = resolveTemplateSiblingVisualCollisions(diagram);

  assert.deepEqual(requireNode(resolved, target.id).position, target.position);
  assert.equal(intersects(requireNode(resolved, securityGroup.id), requireNode(resolved, target.id)), true);
});

test("resolveTemplateSiblingVisualCollisions preserves IGW and Route Association boundary markers", () => {
  const vpc = networkAreaNode("vpc", "aws_vpc", { x: 80, y: 80 });
  const internetGateway = networkResourceNode(
    "internet-gateway",
    "aws_internet_gateway",
    { x: 40, y: 120 },
    { vpcId: "aws_vpc.vpc.id" }
  );
  const subnet = networkAreaNode("subnet", "aws_subnet", { x: 400, y: 80 });
  const association = networkResourceNode(
    "association",
    "aws_route_table_association",
    { x: 480, y: 40 },
    { subnetId: "aws_subnet.subnet.id" }
  );
  const diagram = createDiagram(
    [vpc, internetGateway, subnet, association],
    [{ id: "vpc-igw", sourceNodeId: vpc.id, targetNodeId: internetGateway.id }]
  );

  const resolved = resolveTemplateSiblingVisualCollisions(diagram);

  assert.deepEqual(requireNode(resolved, internetGateway.id).position, internetGateway.position);
  assert.deepEqual(requireNode(resolved, vpc.id).position, vpc.position);
  assert.deepEqual(requireNode(resolved, association.id).position, association.position);
  assert.deepEqual(requireNode(resolved, subnet.id).position, subnet.position);
});

// 테스트 그래프가 실제 semantic edge를 함께 전달하도록 최소 Diagram을 만듭니다.
function createDiagram(nodes: readonly DiagramNode[], edges: DiagramJson["edges"] = []): DiagramJson {
  return { edges: [...edges], nodes: [...nodes], viewport: { x: 0, y: 0, zoom: 1 } };
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

// Security Group fixture는 실제 Board에서 scope Area로 판별되는 resource type을 사용합니다.
function securityGroupNode(id: string, position: DiagramNode["position"]): DiagramNode {
  return {
    ...areaNode(id, position),
    parameters: {
      fileName: "main",
      resourceName: id,
      resourceType: "aws_security_group",
      terraformBlockType: "resource",
      values: {}
    },
    size: { height: 240, width: 240 },
    type: "aws_security_group"
  };
}

// Network boundary fixture는 실제 Terraform address를 values에 담습니다.
function networkResourceNode(
  id: string,
  resourceType: string,
  position: DiagramNode["position"],
  values: Record<string, unknown>
): DiagramNode {
  return {
    ...resourceNode(id, position),
    parameters: {
      fileName: "main",
      resourceName: id,
      resourceType,
      terraformBlockType: "resource",
      values
    },
    type: resourceType
  };
}

// VPC/Subnet fixture는 일반 resource와 같은 Terraform identity에 Area geometry만 더합니다.
function networkAreaNode(
  id: string,
  resourceType: "aws_vpc" | "aws_subnet",
  position: DiagramNode["position"]
): DiagramNode {
  return {
    ...networkResourceNode(id, resourceType, position, {}),
    size: { height: 160, width: 240 }
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
