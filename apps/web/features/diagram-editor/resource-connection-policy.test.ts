import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramEdge, DiagramNode } from "../../../../packages/types/src";
import { isAwsDiagramConnectionAllowed } from "./aws-resource-connection-policy";

const ALLOWED_RESTRICTED_PAIRS = [
  ["aws_volume_attachment", "aws_ebs_volume"],
  ["aws_volume_attachment", "aws_instance"],
  ["aws_route_table_association", "aws_route_table"],
  ["aws_route_table_association", "aws_subnet"],
  ["aws_route_table_association", "aws_internet_gateway"],
  ["aws_iam_role_policy_attachment", "aws_iam_role"],
  ["aws_iam_role_policy_attachment", "aws_iam_policy"],
  ["aws_lb_target_group_attachment", "aws_lb_target_group"],
  ["aws_lb_target_group_attachment", "aws_instance"],
  ["aws_lb_target_group_attachment", "aws_lambda_function"],
  ["aws_lb_target_group_attachment", "aws_ecs_service"],
  ["aws_lb_target_group_attachment", "aws_ecs_task_definition"],
  ["aws_wafv2_web_acl_association", "aws_wafv2_web_acl"],
  ["aws_wafv2_web_acl_association", "aws_lb"],
  ["aws_wafv2_web_acl_association", "aws_api_gateway_stage"],
  ["aws_wafv2_web_acl_association", "aws_apigatewayv2_stage"],
  ["aws_wafv2_web_acl_association", "aws_cognito_user_pool"]
] as const;

test("allows unregistered and unknown resource pairs", () => {
  assert.equal(
    isAwsDiagramConnectionAllowed(makeCandidate("aws_s3_bucket", "aws_lambda_function")),
    true
  );
  assert.equal(isAwsDiagramConnectionAllowed(makeCandidate(undefined, "aws_instance")), true);
});

test("allows every declared restricted counterpart in both directions", () => {
  for (const [restrictedType, counterpartType] of ALLOWED_RESTRICTED_PAIRS) {
    assert.equal(
      isAwsDiagramConnectionAllowed(makeCandidate(restrictedType, counterpartType)),
      true,
      `${restrictedType} should connect to ${counterpartType}`
    );
    assert.equal(
      isAwsDiagramConnectionAllowed(makeCandidate(counterpartType, restrictedType)),
      true,
      `${counterpartType} should connect to ${restrictedType}`
    );
  }
});

test("blocks undeclared counterparts for restricted resources in both directions", () => {
  const restrictedTypes = new Set(ALLOWED_RESTRICTED_PAIRS.map(([restrictedType]) => restrictedType));

  for (const restrictedType of restrictedTypes) {
    assert.equal(
      isAwsDiagramConnectionAllowed(makeCandidate(restrictedType, "aws_s3_bucket")),
      false,
      `${restrictedType} should not connect to an undeclared S3 counterpart`
    );
    assert.equal(
      isAwsDiagramConnectionAllowed(makeCandidate("aws_s3_bucket", restrictedType)),
      false,
      `S3 should not connect to restricted ${restrictedType}`
    );
  }
});

test("preserves self, locked-node, and directed duplicate guards", () => {
  const sameNode = makeNode("same", "aws_instance");
  assert.equal(
    isAwsDiagramConnectionAllowed({ sourceNode: sameNode, targetNode: sameNode, edges: [] }),
    false
  );
  assert.equal(
    isAwsDiagramConnectionAllowed({
      sourceNode: makeNode("source", "aws_instance", true),
      targetNode: makeNode("target", "aws_s3_bucket"),
      edges: []
    }),
    false
  );
  assert.equal(
    isAwsDiagramConnectionAllowed({
      sourceNode: makeNode("source", "aws_instance"),
      targetNode: makeNode("target", "aws_s3_bucket", true),
      edges: []
    }),
    false
  );
  assert.equal(
    isAwsDiagramConnectionAllowed({
      sourceNode: makeNode("source", "aws_instance"),
      targetNode: makeNode("target", "aws_s3_bucket"),
      edges: [makeEdge("source", "target")]
    }),
    false
  );
  assert.equal(
    isAwsDiagramConnectionAllowed({
      sourceNode: makeNode("target", "aws_s3_bucket"),
      targetNode: makeNode("source", "aws_instance"),
      edges: [makeEdge("source", "target")]
    }),
    true
  );
});

function makeCandidate(
  sourceResourceType: string | undefined,
  targetResourceType: string | undefined
) {
  return {
    sourceNode: makeNode("source", sourceResourceType),
    targetNode: makeNode("target", targetResourceType),
    edges: []
  };
}

function makeNode(id: string, resourceType: string | undefined, locked = false): DiagramNode {
  return {
    id,
    type: resourceType ?? "sketchcatch_design",
    kind: resourceType ? "resource" : "design",
    position: { x: 0, y: 0 },
    size: { width: 56, height: 56 },
    label: id,
    locked,
    zIndex: 0,
    ...(resourceType
      ? {
          parameters: {
            resourceType,
            resourceName: id,
            fileName: "main",
            values: {}
          }
        }
      : {})
  };
}

function makeEdge(sourceNodeId: string, targetNodeId: string): DiagramEdge {
  return {
    id: `${sourceNodeId}-${targetNodeId}`,
    sourceNodeId,
    targetNodeId
  };
}
