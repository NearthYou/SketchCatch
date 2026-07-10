import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramEdge, DiagramNode } from "../../../../packages/types/src";
import {
  syncParameterReferenceEdges,
  syncParameterReferenceEdgesForNode
} from "./parameter-reference-edges";

test("syncs supported Terraform parameter references into deterministic edges", () => {
  const loadBalancer = makeNode("lb", "aws_lb", "web");
  const targetGroup = makeNode("target-group", "aws_lb_target_group", "web");
  const autoscalingGroup = makeNode("asg", "aws_autoscaling_group", "web", {
    targetGroupArns: ["aws_lb_target_group.web.arn"]
  });
  const autoscalingPolicy = makeNode("policy", "aws_autoscaling_policy", "scale_out", {
    autoscalingGroupName: "aws_autoscaling_group.web.name"
  });
  const listener = makeNode("listener", "aws_lb_listener", "http", {
    loadBalancerArn: "aws_lb.web.arn",
    defaultAction: [{ targetGroupArn: "aws_lb_target_group.web.arn" }]
  });
  const alarm = makeNode("alarm", "aws_cloudwatch_metric_alarm", "cpu", {
    alarmActions: ["aws_autoscaling_policy.scale_out.arn", "aws_sns_topic.alerts.arn"]
  });

  const listenerEdges = syncParameterReferenceEdgesForNode(
    [listener, loadBalancer, targetGroup, autoscalingGroup, autoscalingPolicy, alarm],
    [],
    listener.id
  );
  const asgEdges = syncParameterReferenceEdgesForNode(
    [listener, loadBalancer, targetGroup, autoscalingGroup, autoscalingPolicy, alarm],
    listenerEdges,
    autoscalingGroup.id
  );
  const alarmEdges = syncParameterReferenceEdgesForNode(
    [listener, loadBalancer, targetGroup, autoscalingGroup, autoscalingPolicy, alarm],
    asgEdges,
    alarm.id
  );
  const policyEdges = syncParameterReferenceEdgesForNode(
    [listener, loadBalancer, targetGroup, autoscalingGroup, autoscalingPolicy, alarm],
    alarmEdges,
    autoscalingPolicy.id
  );

  assert.deepEqual(
    policyEdges.map(toEdgeSummary),
    [
      ["listener", "lb", "loadBalancerArn"],
      ["listener", "target-group", "defaultAction[0].targetGroupArn"],
      ["asg", "target-group", "targetGroupArns[0]"],
      ["alarm", "policy", "alarmActions[0]"],
      ["policy", "asg", "autoscalingGroupName"]
    ]
  );
  assert.ok(policyEdges.every((edge) => edge.type === "smoothstep"));
  assert.ok(
    policyEdges.every(
      (edge) => edge.style?.lineStyle === "solid" && edge.style.width === "thin"
    )
  );
  assert.deepEqual(
    policyEdges.map((edge) => edge.metadata?.managedBy),
    Array(5).fill("parameter-reference")
  );
});

test("replaces and removes only the updated source node's automatic parameter-reference edges", () => {
  const firstTarget = makeNode("target-a", "aws_lb_target_group", "first");
  const secondTarget = makeNode("target-b", "aws_lb_target_group", "second");
  const source = makeNode("asg", "aws_autoscaling_group", "web", {
    targetGroupArns: ["aws_lb_target_group.first.arn"]
  });
  const otherSource = makeNode("other-asg", "aws_autoscaling_group", "other", {
    targetGroupArns: ["aws_lb_target_group.second.arn"]
  });
  const manualEdge: DiagramEdge = {
    id: "manual-edge",
    sourceNodeId: source.id,
    targetNodeId: firstTarget.id
  };
  const otherSourceAutomaticEdge: DiagramEdge = {
    id: "other-source-automatic-edge",
    sourceNodeId: otherSource.id,
    targetNodeId: secondTarget.id,
    metadata: {
      managedBy: "parameter-reference",
      parameterPath: "targetGroupArns[0]"
    }
  };

  const initialEdges = syncParameterReferenceEdgesForNode(
    [source, otherSource, firstTarget, secondTarget],
    [manualEdge, otherSourceAutomaticEdge],
    source.id
  );
  const updatedSource = makeNode("asg", "aws_autoscaling_group", "web", {
    targetGroupArns: ["aws_lb_target_group.second.arn"]
  });
  const replacedEdges = syncParameterReferenceEdgesForNode(
    [updatedSource, otherSource, firstTarget, secondTarget],
    initialEdges,
    updatedSource.id
  );
  const removedEdges = syncParameterReferenceEdgesForNode(
    [makeNode("asg", "aws_autoscaling_group", "web"), otherSource, firstTarget, secondTarget],
    replacedEdges,
    source.id
  );

  assert.deepEqual(
    replacedEdges.map(toEdgeSummary),
    [
      ["asg", "target-a", undefined],
      ["other-asg", "target-b", "targetGroupArns[0]"],
      ["asg", "target-b", "targetGroupArns[0]"]
    ]
  );
  assert.deepEqual(removedEdges.map(toEdgeSummary), [
    ["asg", "target-a", undefined],
    ["other-asg", "target-b", "targetGroupArns[0]"]
  ]);
});

test("recalculates automatic edges when a referenced target identity changes", () => {
  const listener = makeNode("listener", "aws_lb_listener", "http", {
    loadBalancerArn: "aws_lb.web.arn"
  });
  const matchingLoadBalancer = makeNode("lb", "aws_lb", "web");
  const renamedLoadBalancer = makeNode("lb", "aws_lb", "renamed");
  const manualEdge: DiagramEdge = {
    id: "manual-listener-edge",
    sourceNodeId: listener.id,
    targetNodeId: matchingLoadBalancer.id
  };

  const initialEdges = syncParameterReferenceEdges([listener, matchingLoadBalancer], [manualEdge]);
  const afterRename = syncParameterReferenceEdges([listener, renamedLoadBalancer], initialEdges);
  const afterMatchingIdentityIsRestored = syncParameterReferenceEdges(
    [listener, matchingLoadBalancer],
    afterRename
  );

  assert.deepEqual(initialEdges.map(toEdgeSummary), [
    ["listener", "lb", undefined],
    ["listener", "lb", "loadBalancerArn"]
  ]);
  assert.deepEqual(afterRename.map(toEdgeSummary), [["listener", "lb", undefined]]);
  assert.deepEqual(afterMatchingIdentityIsRestored.map(toEdgeSummary), [
    ["listener", "lb", undefined],
    ["listener", "lb", "loadBalancerArn"]
  ]);
});

function makeNode(
  id: string,
  resourceType: string,
  resourceName: string,
  values: Record<string, unknown> = {}
): DiagramNode {
  return {
    id,
    type: resourceType,
    kind: "resource",
    position: { x: 0, y: 0 },
    size: { width: 160, height: 96 },
    label: resourceName,
    locked: false,
    zIndex: 0,
    parameters: {
      terraformBlockType: "resource",
      resourceType,
      resourceName,
      fileName: "main",
      values
    }
  };
}

function toEdgeSummary(edge: DiagramEdge): [string, string, string | undefined] {
  return [edge.sourceNodeId, edge.targetNodeId, edge.metadata?.parameterPath];
}
