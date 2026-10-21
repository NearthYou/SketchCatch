import assert from "node:assert/strict";
import test from "node:test";
import type { DiagramNode } from "@sketchcatch/types";
import { applyAddedApplicationAutoScalingTargetReferences } from "./application-auto-scaling-references";

test("a newly added Application Auto Scaling target immediately binds the existing policy", () => {
  const policy = createResourceNode("policy", "aws_appautoscaling_policy", "requests", {
    name: "request-scaling",
    resourceId: "service/example-cluster/example-service",
    scalableDimension: "ecs:service:DesiredCount",
    serviceNamespace: "ecs"
  });
  const target = createResourceNode(
    "target",
    "aws_appautoscaling_target",
    "manual_target",
    {}
  );

  const result = applyAddedApplicationAutoScalingTargetReferences([policy, target], target.id);
  const updatedPolicy = result.find((node) => node.id === policy.id);

  assert.deepEqual(updatedPolicy?.parameters?.values, {
    name: "request-scaling",
    resourceId: "aws_appautoscaling_target.manual_target.resource_id",
    scalableDimension: "aws_appautoscaling_target.manual_target.scalable_dimension",
    serviceNamespace: "aws_appautoscaling_target.manual_target.service_namespace"
  });
});

test("automatic binding does not guess when another target or multiple policies exist", () => {
  const firstPolicy = createResourceNode("policy-1", "aws_appautoscaling_policy", "requests", {});
  const secondPolicy = createResourceNode("policy-2", "aws_appautoscaling_policy", "cpu", {});
  const existingTarget = createResourceNode(
    "target-1",
    "aws_appautoscaling_target",
    "existing_target",
    {}
  );
  const addedTarget = createResourceNode(
    "target-2",
    "aws_appautoscaling_target",
    "manual_target",
    {}
  );
  const nodes = [firstPolicy, secondPolicy, existingTarget, addedTarget];

  assert.deepEqual(
    applyAddedApplicationAutoScalingTargetReferences(nodes, addedTarget.id),
    nodes
  );
});

function createResourceNode(
  id: string,
  resourceType: string,
  resourceName: string,
  values: Record<string, unknown>
): DiagramNode {
  return {
    id,
    type: resourceType,
    kind: "resource",
    label: resourceName,
    position: { x: 0, y: 0 },
    size: { width: 124, height: 96 },
    locked: false,
    zIndex: 0,
    parameters: {
      fileName: "main.tf",
      resourceName,
      resourceType,
      values
    }
  };
}
