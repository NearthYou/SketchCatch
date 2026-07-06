import { test } from "node:test";
import assert from "node:assert/strict";
import type { ResourceNode, ResourceType } from "@sketchcatch/types";
import { createSecurityFindings } from "./aiPreDeploymentSecurity.js";

test("createSecurityFindings detects public SSH rules with Terraform-style keys", () => {
  const findings = createSecurityFindings(
    createNode("SECURITY_GROUP", {
      ingress: [
        {
          from_port: 22,
          to_port: 22,
          cidr_blocks: ["0.0.0.0/0"]
        }
      ]
    })
  );

  assert.deepEqual(findings.map((finding) => finding.id), ["security-open-ssh-node-1"]);
  assert.equal(findings[0]?.severity, "high");
});

test("createSecurityFindings detects public RDS and S3 access", () => {
  const rdsFindings = createSecurityFindings(
    createNode("RDS", {
      publiclyAccessible: true
    })
  );
  const s3Findings = createSecurityFindings(
    createNode("S3", {
      policy: {
        Statement: [
          {
            Effect: "Allow",
            Principal: "*",
            Action: "s3:GetObject",
            Resource: "arn:aws:s3:::example/*"
          }
        ]
      }
    })
  );

  assert.deepEqual(rdsFindings.map((finding) => finding.id), ["security-public-rds-node-1"]);
  assert.deepEqual(s3Findings.map((finding) => finding.id), ["security-public-s3-node-1"]);
});

test("createSecurityFindings detects IAM wildcard action and resource policies", () => {
  const findings = createSecurityFindings(
    createNode("UNKNOWN", {
      policyDocument: {
        Statement: [
          {
            Effect: "Allow",
            Action: "iam:*",
            Resource: "*"
          }
        ]
      }
    })
  );

  assert.deepEqual(findings.map((finding) => finding.id), ["permission-iam-wildcard-node-1"]);
  assert.equal(findings[0]?.category, "permission");
});

function createNode(type: ResourceType, config: Record<string, unknown>): ResourceNode {
  return {
    id: "node-1",
    type,
    label: type,
    positionX: 0,
    positionY: 0,
    config
  };
}
