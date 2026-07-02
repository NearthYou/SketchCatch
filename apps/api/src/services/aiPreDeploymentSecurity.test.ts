import assert from "node:assert/strict";
import { test } from "node:test";
import type { ResourceNode } from "@sketchcatch/types";
import { createSecurityFindings } from "./aiPreDeploymentSecurity.js";

test("createSecurityFindings detects public RDS", () => {
  const findings = createSecurityFindings(
    createNode({
      type: "RDS",
      config: {
        publiclyAccessible: true
      }
    })
  );

  assert.equal(findings[0]?.id, "security-public-rds-resource-1");
  assert.equal(findings[0]?.severity, "high");
});

test("createSecurityFindings detects public S3 access", () => {
  const findings = createSecurityFindings(
    createNode({
      type: "S3",
      config: {
        acl: "public-read"
      }
    })
  );

  assert.equal(findings[0]?.id, "security-public-s3-resource-1");
  assert.equal(findings[0]?.severity, "high");
});

test("createSecurityFindings detects public SSH from IPv4 and IPv6", () => {
  const findings = createSecurityFindings(
    createNode({
      type: "SECURITY_GROUP",
      config: {
        ingress: [
          {
            from_port: 22,
            to_port: 22,
            ipv6_cidr_blocks: ["::/0"]
          }
        ]
      }
    })
  );

  assert.equal(findings[0]?.id, "security-open-ssh-resource-1");
  assert.equal(findings[0]?.severity, "high");
});

test("createSecurityFindings detects excessive IAM", () => {
  const findings = createSecurityFindings(
    createNode({
      type: "LAMBDA",
      config: {
        iamPolicy: {
          Statement: [
            {
              Effect: "Allow",
              Action: "*",
              Resource: "*"
            }
          ]
        }
      }
    })
  );

  assert.equal(findings[0]?.id, "security-excessive-iam-resource-1");
  assert.equal(findings[0]?.category, "permission");
  assert.equal(findings[0]?.severity, "high");
});

test("createSecurityFindings ignores private resources", () => {
  const findings = [
    ...createSecurityFindings(
      createNode({
        type: "RDS",
        config: {
          publiclyAccessible: false
        }
      })
    ),
    ...createSecurityFindings(
      createNode({
        type: "SECURITY_GROUP",
        config: {
          ingress: [
            {
              from_port: 22,
              to_port: 22,
              cidr_blocks: ["10.0.0.0/16"]
            }
          ]
        }
      })
    )
  ];

  assert.deepEqual(findings, []);
});

function createNode(
  overrides: Partial<ResourceNode> & Pick<ResourceNode, "type" | "config">
): ResourceNode {
  return {
    id: "resource-1",
    label: "Resource",
    positionX: 0,
    positionY: 0,
    ...overrides
  };
}
