import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramNode, ResourceConfig } from "../../../../packages/types/src";

import { refitSecurityGroupScopesForTargetChanges } from "./security-group-scope";

test("refitSecurityGroupScopesForTargetChanges refits both sides of an attachment switch", () => {
  const webSecurityGroup = makeResourceNode({
    height: 178,
    id: "web-security-group",
    resourceName: "web",
    resourceType: "aws_security_group",
    values: {},
    width: 180,
    x: 72,
    y: 56
  });
  const adminSecurityGroup = makeResourceNode({
    height: 260,
    id: "admin-security-group",
    resourceName: "admin",
    resourceType: "aws_security_group",
    values: {},
    width: 320,
    x: 600,
    y: 20
  });
  const previousInstance = makeResourceNode({
    id: "instance",
    resourceName: "app",
    resourceType: "aws_instance",
    values: { vpcSecurityGroupIds: ["aws_security_group.web.id"] },
    x: 100,
    y: 100
  });
  const currentInstance = makeResourceNode({
    id: "instance",
    resourceName: "app",
    resourceType: "aws_instance",
    values: { vpcSecurityGroupIds: ["aws_security_group.admin.id"] },
    x: 100,
    y: 100
  });

  const result = refitSecurityGroupScopesForTargetChanges({
    changedNodeIds: new Set([currentInstance.id]),
    currentNodes: [webSecurityGroup, adminSecurityGroup, currentInstance],
    previousNodes: [webSecurityGroup, adminSecurityGroup, previousInstance]
  });
  const resultById = new Map(result.map((node) => [node.id, node]));

  assert.deepEqual(resultById.get(webSecurityGroup.id)?.position, { x: 72, y: 56 });
  assert.deepEqual(resultById.get(webSecurityGroup.id)?.size, { width: 180, height: 120 });
  assert.deepEqual(resultById.get(adminSecurityGroup.id)?.position, { x: 72, y: 56 });
  assert.deepEqual(resultById.get(adminSecurityGroup.id)?.size, { width: 180, height: 178 });
});

test("refitSecurityGroupScopesForTargetChanges compacts an orphaned scope after target deletion", () => {
  const securityGroup = makeResourceNode({
    height: 240,
    id: "security-group",
    resourceName: "app",
    resourceType: "aws_security_group",
    values: {},
    width: 300,
    x: 72,
    y: 56
  });
  const target = makeResourceNode({
    id: "instance",
    resourceName: "app",
    resourceType: "aws_instance",
    values: { vpcSecurityGroupIds: ["aws_security_group.app.id"] },
    x: 100,
    y: 100
  });

  const result = refitSecurityGroupScopesForTargetChanges({
    changedNodeIds: new Set([target.id]),
    currentNodes: [securityGroup],
    previousNodes: [securityGroup, target]
  });
  const securityGroupAfter = result.find((node) => node.id === securityGroup.id);

  assert.deepEqual(securityGroupAfter?.position, securityGroup.position);
  assert.deepEqual(securityGroupAfter?.size, { width: 180, height: 120 });
});

test("refitSecurityGroupScopesForTargetChanges leaves a manually placed scope alone for unrelated parameter edits", () => {
  const securityGroup = makeResourceNode({
    height: 240,
    id: "security-group",
    resourceName: "app",
    resourceType: "aws_security_group",
    values: {},
    width: 300,
    x: 20,
    y: 40
  });
  const previousTarget = makeResourceNode({
    id: "instance",
    resourceName: "app",
    resourceType: "aws_instance",
    values: {
      instanceType: "t3.micro",
      vpcSecurityGroupIds: ["aws_security_group.app.id"]
    },
    x: 100,
    y: 100
  });
  const currentTarget = makeResourceNode({
    id: "instance",
    resourceName: "app",
    resourceType: "aws_instance",
    values: {
      instanceType: "t3.small",
      vpcSecurityGroupIds: ["aws_security_group.app.id"]
    },
    x: 100,
    y: 100
  });

  const result = refitSecurityGroupScopesForTargetChanges({
    changedNodeIds: new Set([currentTarget.id]),
    currentNodes: [securityGroup, currentTarget],
    previousNodes: [securityGroup, previousTarget]
  });
  const securityGroupAfter = result.find((node) => node.id === securityGroup.id);

  assert.equal(securityGroupAfter, securityGroup);
});

test("refitSecurityGroupScopesForTargetChanges expands a scope after target resize", () => {
  const securityGroup = makeResourceNode({
    height: 178,
    id: "security-group",
    resourceName: "app",
    resourceType: "aws_security_group",
    values: {},
    width: 180,
    x: 72,
    y: 56
  });
  const previousTarget = makeResourceNode({
    id: "instance",
    resourceName: "app",
    resourceType: "aws_instance",
    values: { vpcSecurityGroupIds: ["aws_security_group.app.id"] },
    x: 100,
    y: 100
  });
  const currentTarget = makeResourceNode({
    id: "instance",
    resourceName: "app",
    resourceType: "aws_instance",
    values: { vpcSecurityGroupIds: ["aws_security_group.app.id"] },
    width: 240,
    x: 100,
    y: 100
  });

  const result = refitSecurityGroupScopesForTargetChanges({
    changedNodeIds: new Set([currentTarget.id]),
    currentNodes: [securityGroup, currentTarget],
    previousNodes: [securityGroup, previousTarget]
  });
  const securityGroupAfter = result.find((node) => node.id === securityGroup.id);

  assert.deepEqual(securityGroupAfter?.position, { x: 72, y: 56 });
  assert.deepEqual(securityGroupAfter?.size, { width: 296, height: 178 });
});

/** SG scope와 attachment target을 같은 최소 fixture 형태로 만듭니다. */
function makeResourceNode({
  height = 72,
  id,
  resourceName,
  resourceType,
  values,
  width = 120,
  x,
  y
}: {
  height?: number;
  id: string;
  resourceName: string;
  resourceType: string;
  values: ResourceConfig;
  width?: number;
  x: number;
  y: number;
}): DiagramNode {
  return {
    id,
    kind: "resource",
    label: resourceName,
    locked: false,
    parameters: {
      fileName: "main",
      resourceName,
      resourceType,
      terraformBlockType: "resource",
      values
    },
    position: { x, y },
    size: { width, height },
    type: resourceType,
    zIndex: 0
  };
}
