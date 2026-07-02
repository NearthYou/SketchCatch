import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createDeploymentSafetyGateWarningsFromTerraformShowJson,
  hasApprovalBlockingSafetyGateWarning
} from "./deployment-safety-gate.js";

test("createDeploymentSafetyGateWarningsFromTerraformShowJson blocks public RDS", () => {
  const warnings = createDeploymentSafetyGateWarningsFromTerraformShowJson(
    createPlanJson([
      {
        address: "aws_db_instance.main",
        type: "aws_db_instance",
        change: {
          actions: ["create"],
          after: {
            publicly_accessible: true
          }
        }
      }
    ])
  );

  assert.deepEqual(warnings, [
    {
      level: "high",
      message:
        "aws_db_instance.main exposes an RDS database publicly. Disable public accessibility and use private subnets before apply.",
      relatedResourceId: "aws_db_instance.main",
      code: "public_rds",
      source: "terraform_plan",
      blocksApproval: true,
      approvalRequired: false
    }
  ]);
  assert.equal(hasApprovalBlockingSafetyGateWarning(warnings), true);
});

test("createDeploymentSafetyGateWarningsFromTerraformShowJson blocks public SSH ingress", () => {
  const warnings = createDeploymentSafetyGateWarningsFromTerraformShowJson(
    createPlanJson([
      {
        address: "aws_security_group.web",
        type: "aws_security_group",
        change: {
          actions: ["create"],
          after: {
            ingress: [
              {
                from_port: 22,
                to_port: 22,
                cidr_blocks: ["0.0.0.0/0"]
              }
            ]
          }
        }
      }
    ])
  );

  assert.equal(warnings[0]?.code, "public_ssh");
  assert.equal(warnings[0]?.blocksApproval, true);
});

test("createDeploymentSafetyGateWarningsFromTerraformShowJson blocks S3 public access", () => {
  const warnings = createDeploymentSafetyGateWarningsFromTerraformShowJson(
    createPlanJson([
      {
        address: "aws_s3_bucket_public_access_block.assets",
        type: "aws_s3_bucket_public_access_block",
        change: {
          actions: ["create"],
          after: {
            block_public_acls: false,
            block_public_policy: true,
            ignore_public_acls: true,
            restrict_public_buckets: true
          }
        }
      },
      {
        address: "aws_s3_bucket_policy.assets",
        type: "aws_s3_bucket_policy",
        change: {
          actions: ["create"],
          after: {
            policy: JSON.stringify({
              Statement: [
                {
                  Effect: "Allow",
                  Principal: "*",
                  Action: "s3:GetObject",
                  Resource: "*"
                }
              ]
            })
          }
        }
      }
    ])
  );

  assert.deepEqual(
    warnings.map((warning) => warning.code),
    ["s3_public_access", "s3_public_access"]
  );
  assert.equal(hasApprovalBlockingSafetyGateWarning(warnings), true);
});

test("createDeploymentSafetyGateWarningsFromTerraformShowJson blocks excessive IAM", () => {
  const warnings = createDeploymentSafetyGateWarningsFromTerraformShowJson(
    createPlanJson([
      {
        address: "aws_iam_policy.admin",
        type: "aws_iam_policy",
        change: {
          actions: ["create"],
          after: {
            policy: JSON.stringify({
              Statement: [
                {
                  Effect: "Allow",
                  Action: "*",
                  Resource: "*"
                }
              ]
            })
          }
        }
      },
      {
        address: "aws_iam_role_policy_attachment.admin",
        type: "aws_iam_role_policy_attachment",
        change: {
          actions: ["create"],
          after: {
            policy_arn: "arn:aws:iam::aws:policy/AdministratorAccess"
          }
        }
      }
    ])
  );

  assert.deepEqual(
    warnings.map((warning) => warning.code),
    ["excessive_iam", "excessive_iam"]
  );
  assert.equal(hasApprovalBlockingSafetyGateWarning(warnings), true);
});

test("createDeploymentSafetyGateWarningsFromTerraformShowJson ignores no-op data and private resources", () => {
  const warnings = createDeploymentSafetyGateWarningsFromTerraformShowJson(
    createPlanJson([
      {
        address: "data.aws_ami.latest",
        mode: "data",
        type: "aws_ami",
        change: {
          actions: ["read"],
          after: {}
        }
      },
      {
        address: "aws_db_instance.private",
        type: "aws_db_instance",
        change: {
          actions: ["update"],
          after: {
            publicly_accessible: false
          }
        }
      },
      {
        address: "aws_security_group.private",
        type: "aws_security_group",
        change: {
          actions: ["no-op"],
          after: {
            ingress: [
              {
                from_port: 22,
                to_port: 22,
                cidr_blocks: ["0.0.0.0/0"]
              }
            ]
          }
        }
      }
    ])
  );

  assert.deepEqual(warnings, []);
  assert.equal(hasApprovalBlockingSafetyGateWarning(warnings), false);
});

function createPlanJson(resourceChanges: unknown[]): string {
  return JSON.stringify({
    resource_changes: resourceChanges.map((resourceChange) => ({
      mode: "managed",
      ...toRecord(resourceChange)
    }))
  });
}

function toRecord(value: unknown): Record<string, unknown> {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);

  return value as Record<string, unknown>;
}
