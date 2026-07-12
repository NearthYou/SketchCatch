import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramJson, DiagramNode } from "../../../../packages/types/src";
import { arrangeTemplateTopology } from "./template-topology-layout";

test("arrangeTemplateTopology keeps resolvable API resources inside their VPC and orders the flow", () => {
  const arranged = arrangeTemplateTopology(createVpcApiDiagram());
  const vpc = requireNode(arranged, "vpc");
  const ec2 = requireNode(arranged, "ec2");
  const rds = requireNode(arranged, "rds");

  assert.equal(ec2.metadata?.parentAreaNodeId, "vpc");
  assert.equal(rds.metadata?.parentAreaNodeId, "vpc");
  assertContains(vpc, ec2);
  assertContains(vpc, rds);
  assert.ok(ec2.position.x < rds.position.x);
});

test("arrangeTemplateTopology lifts shared subnet references to their common VPC", () => {
  const arranged = arrangeTemplateTopology(createMultiSubnetDiagram());
  const loadBalancer = requireNode(arranged, "load-balancer");
  const vpc = requireNode(arranged, "vpc");

  assert.equal(loadBalancer.metadata?.parentAreaNodeId, "vpc");
  assertContains(vpc, loadBalancer);
});

test("arrangeTemplateTopology preserves an unresolved resource at root", () => {
  const arranged = arrangeTemplateTopology(createDiagram([
    resourceNode("unknown", "aws_instance", { subnetId: "aws_subnet.missing.id" })
  ]));

  assert.equal(requireNode(arranged, "unknown").metadata?.parentAreaNodeId, undefined);
});

test("arrangeTemplateTopology keeps a node with a missing explicit parent in the root layout", () => {
  const orphan: DiagramNode = {
    ...resourceNode("orphan", "aws_instance", {}),
    metadata: { parentAreaNodeId: "missing-area" }
  };
  const arranged = arrangeTemplateTopology(createDiagram([orphan]));

  assert.equal(requireNode(arranged, "orphan").position.x, 120);
  assert.equal(requireNode(arranged, "orphan").position.y, 120);
});

function createVpcApiDiagram(): DiagramJson {
  return createDiagram([
    areaNode("vpc", "aws_vpc", "network"),
    resourceNode("ec2", "aws_instance", { vpcId: "aws_vpc.network.id" }),
    resourceNode("rds", "aws_db_instance", { vpcId: "aws_vpc.network.id" })
  ], [{ id: "ec2-rds", sourceNodeId: "ec2", targetNodeId: "rds", type: "smoothstep" }]);
}

function createMultiSubnetDiagram(): DiagramJson {
  return createDiagram([
    areaNode("vpc", "aws_vpc", "network"),
    areaNode("subnet-a", "aws_subnet", "a", { vpcId: "aws_vpc.network.id" }),
    areaNode("subnet-c", "aws_subnet", "c", { vpcId: "aws_vpc.network.id" }),
    resourceNode("load-balancer", "aws_lb", {
      subnets: ["aws_subnet.a.id", "aws_subnet.c.id"]
    })
  ]);
}

function createDiagram(nodes: DiagramNode[], edges: DiagramJson["edges"] = []): DiagramJson {
  return { edges, nodes, viewport: { x: 0, y: 0, zoom: 1 } };
}

function areaNode(
  id: string,
  resourceType: string,
  resourceName: string,
  values: Record<string, unknown> = {}
): DiagramNode {
  return {
    id,
    kind: "resource",
    label: id,
    locked: false,
    parameters: { fileName: "main", resourceName, resourceType, terraformBlockType: "resource", values },
    position: { x: 0, y: 0 },
    size: { height: 48, width: 48 },
    type: resourceType,
    zIndex: 1
  };
}

function resourceNode(
  id: string,
  resourceType: string,
  values: Record<string, unknown>
): DiagramNode {
  return areaNode(id, resourceType, id, values);
}

function requireNode(diagram: DiagramJson, id: string): DiagramNode {
  const node = diagram.nodes.find((candidate) => candidate.id === id);
  assert.ok(node, `Expected ${id} node`);
  return node;
}

function assertContains(parent: DiagramNode, child: DiagramNode): void {
  assert.ok(child.position.x >= parent.position.x, `${parent.id} must contain ${child.id} on the left`);
  assert.ok(child.position.y >= parent.position.y, `${parent.id} must contain ${child.id} on the top`);
  assert.ok(
    child.position.x + child.size.width <= parent.position.x + parent.size.width,
    `${parent.id} must contain ${child.id} on the right`
  );
  assert.ok(
    child.position.y + child.size.height <= parent.position.y + parent.size.height,
    `${parent.id} must contain ${child.id} on the bottom`
  );
}
