import assert from "node:assert/strict";
import { test } from "node:test";

import type { DiagramJson, DiagramNode } from "../../../../packages/types/src";

import {
  RESOURCE_NODE_DEFAULT_SIZE,
  normalizeDiagramResourceNodeGeometry
} from "./resource-node-geometry";

test("preserves the current 48px icon geometry without widening it", () => {
  const diagram = makeDiagram(makeResourceNode({
    position: { x: 100, y: 80 },
    size: { width: 48, height: 48 }
  }));

  const result = normalizeDiagramResourceNodeGeometry(diagram);

  assert.deepEqual(result.nodes[0]?.size, RESOURCE_NODE_DEFAULT_SIZE);
  assert.deepEqual(result.nodes[0]?.position, { x: 100, y: 80 });
  assert.deepEqual(result.edges, diagram.edges);
  assert.deepEqual(diagram.nodes[0]?.size, { width: 48, height: 48 });
});

test("normalizes a 56px legacy icon to 48px around its original center", () => {
  const result = normalizeDiagramResourceNodeGeometry(
    makeDiagram(makeResourceNode({
      position: { x: 100, y: 80 },
      size: { width: 56, height: 56 }
    }))
  );

  assert.deepEqual(result.nodes[0]?.size, RESOURCE_NODE_DEFAULT_SIZE);
  assert.deepEqual(result.nodes[0]?.position, { x: 104, y: 84 });
});

test("normalizes every known legacy ASG Area size to a centered 48px Resource", () => {
  const fixtures = [
    { size: { width: 200, height: 130 }, position: { x: 176, y: 121 } },
    { size: { width: 400, height: 260 }, position: { x: 276, y: 186 } },
    { size: { width: 320, height: 240 }, position: { x: 236, y: 176 } }
  ];

  for (const fixture of fixtures) {
    const result = normalizeDiagramResourceNodeGeometry(
      makeDiagram(makeResourceNode({
        position: { x: 100, y: 80 },
        resourceType: "aws_autoscaling_group",
        size: fixture.size
      }))
    );

    assert.deepEqual(result.nodes[0]?.size, RESOURCE_NODE_DEFAULT_SIZE);
    assert.deepEqual(result.nodes[0]?.position, fixture.position);
  }
});

test("reparents legacy ASG and Security Group children to the nearest real containment Area", () => {
  const vpc = makeResourceNode({ id: "vpc", resourceType: "aws_vpc", size: { width: 800, height: 600 } });
  const asg = makeResourceNode({
    id: "asg",
    parentAreaNodeId: vpc.id,
    resourceType: "aws_autoscaling_group",
    size: { width: 200, height: 130 }
  });
  const securityGroup = makeResourceNode({
    id: "security-group",
    parentAreaNodeId: vpc.id,
    resourceType: "aws_security_group",
    size: { width: 240, height: 180 }
  });
  const asgChild = makeResourceNode({ id: "asg-child", parentAreaNodeId: asg.id });
  const securityGroupChild = makeResourceNode({
    id: "security-group-child",
    parentAreaNodeId: securityGroup.id
  });

  const result = normalizeDiagramResourceNodeGeometry(
    makeDiagram(vpc, asg, securityGroup, asgChild, securityGroupChild)
  );

  assert.equal(result.nodes.find((node) => node.id === asgChild.id)?.metadata?.parentAreaNodeId, vpc.id);
  assert.equal(
    result.nodes.find((node) => node.id === securityGroupChild.id)?.metadata?.parentAreaNodeId,
    vpc.id
  );
});

test("removes self-referential and cyclic visual-only parent chains", () => {
  const selfParent = makeResourceNode({
    id: "self-parent",
    parentAreaNodeId: "self-parent",
    resourceType: "aws_security_group",
    size: { width: 240, height: 180 }
  });
  const first = makeResourceNode({
    id: "first",
    parentAreaNodeId: "second",
    resourceType: "aws_security_group",
    size: { width: 240, height: 180 }
  });
  const second = makeResourceNode({
    id: "second",
    parentAreaNodeId: "first",
    resourceType: "aws_security_group",
    size: { width: 240, height: 180 }
  });
  const result = normalizeDiagramResourceNodeGeometry(makeDiagram(selfParent, first, second));

  assert.equal(result.nodes.find((node) => node.id === selfParent.id)?.metadata?.parentAreaNodeId, undefined);
  assert.equal(result.nodes.find((node) => node.id === first.id)?.metadata?.parentAreaNodeId, undefined);
  assert.equal(result.nodes.find((node) => node.id === second.id)?.metadata?.parentAreaNodeId, undefined);
});

test("removes parent assignments that inherit a containment Area cycle", () => {
  const vpc = makeResourceNode({
    id: "vpc",
    parentAreaNodeId: "subnet",
    resourceType: "aws_vpc",
    size: { width: 800, height: 600 }
  });
  const subnet = makeResourceNode({
    id: "subnet",
    parentAreaNodeId: vpc.id,
    resourceType: "aws_subnet",
    size: { width: 600, height: 400 }
  });
  const instance = makeResourceNode({ id: "instance", parentAreaNodeId: subnet.id });

  const result = normalizeDiagramResourceNodeGeometry(makeDiagram(vpc, subnet, instance));

  assert.equal(result.nodes.find((node) => node.id === vpc.id)?.metadata?.parentAreaNodeId, undefined);
  assert.equal(result.nodes.find((node) => node.id === subnet.id)?.metadata?.parentAreaNodeId, undefined);
  assert.equal(result.nodes.find((node) => node.id === instance.id)?.metadata?.parentAreaNodeId, undefined);
});

test("preserves custom compact nodes and area geometry", () => {
  const compact = makeResourceNode({ id: "compact", size: { width: 80, height: 80 } });
  const area = makeResourceNode({
    id: "vpc",
    resourceType: "aws_vpc",
    size: { width: 240, height: 160 }
  });
  const result = normalizeDiagramResourceNodeGeometry(makeDiagram(compact, area));

  assert.deepEqual(result.nodes[0], compact);
  assert.deepEqual(result.nodes[1], area);
});

test("raises undersized custom resources only to the 28px resize minimum", () => {
  const result = normalizeDiagramResourceNodeGeometry(
    makeDiagram(makeResourceNode({
      position: { x: 100, y: 80 },
      size: { width: 20, height: 30 }
    }))
  );

  assert.deepEqual(result.nodes[0]?.size, { width: 28, height: 30 });
  assert.deepEqual(result.nodes[0]?.position, { x: 96, y: 80 });
});

function makeDiagram(...nodes: DiagramNode[]): DiagramJson {
  return {
    nodes,
    edges: nodes.length > 1
      ? [{ id: "edge", sourceNodeId: nodes[0]?.id ?? "", targetNodeId: nodes[1]?.id ?? "" }]
      : [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}

function makeResourceNode({
  id = "instance",
  parentAreaNodeId,
  position = { x: 0, y: 0 },
  resourceType = "aws_instance",
  size = { width: 48, height: 48 }
}: {
  id?: string;
  parentAreaNodeId?: string;
  position?: DiagramNode["position"];
  resourceType?: string;
  size?: DiagramNode["size"];
} = {}): DiagramNode {
  return {
    id,
    kind: "resource",
    label: id,
    locked: false,
    ...(parentAreaNodeId ? { metadata: { parentAreaNodeId } } : {}),
    parameters: {
      fileName: "main",
      resourceName: id,
      resourceType,
      terraformBlockType: "resource",
      values: {}
    },
    position,
    size,
    type: resourceType,
    zIndex: 1
  };
}
