import assert from "node:assert/strict";
import { test } from "node:test";
import type { ResourceNode } from "@sketchcatch/types";
import { createConfigurationFindings } from "./aiPreDeploymentConfiguration.js";

test("IAM policy attachments require attachment fields instead of an inline policy document", () => {
  const attachment = makeIamPolicyNode({
    terraformResourceType: "aws_iam_role_policy_attachment",
    role: "aws_iam_role.execution.name",
    policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
  });

  assert.deepEqual(createConfigurationFindings(attachment), []);
});

test("IAM policy attachments still report a genuinely missing policy ARN", () => {
  const attachment = makeIamPolicyNode({
    terraformResourceType: "aws_iam_role_policy_attachment",
    role: "aws_iam_role.execution.name"
  });

  const findings = createConfigurationFindings(attachment);

  assert.equal(findings.length, 1);
  assert.match(findings[0]?.description ?? "", /policyArn/u);
});

function makeIamPolicyNode(config: ResourceNode["config"]): ResourceNode {
  return {
    id: "execution-policy",
    type: "IAM_POLICY",
    label: "ECS Execution Policy",
    positionX: 0,
    positionY: 0,
    config
  };
}
