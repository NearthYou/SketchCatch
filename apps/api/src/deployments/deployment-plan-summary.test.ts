import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DeploymentPlanSummaryParseError,
  createDeploymentPlanSummaryFromTerraformShowJson
} from "./deployment-plan-summary.js";

test("createDeploymentPlanSummaryFromTerraformShowJson counts create update delete and replace actions", () => {
  const summary = createDeploymentPlanSummaryFromTerraformShowJson(
    JSON.stringify({
      resource_changes: [
        {
          address: "aws_vpc.main",
          change: {
            actions: ["create"]
          }
        },
        {
          address: "aws_instance.web",
          change: {
            actions: ["update"]
          }
        },
        {
          address: "aws_s3_bucket.old",
          change: {
            actions: ["delete"]
          }
        },
        {
          address: "aws_security_group.web",
          change: {
            actions: ["delete", "create"]
          }
        },
        {
          address: "aws_subnet.public",
          change: {
            actions: ["create", "delete"]
          }
        },
        {
          address: "data.aws_ami.latest",
          change: {
            actions: ["read"]
          }
        },
        {
          address: "aws_route_table.main",
          change: {
            actions: ["no-op"]
          }
        }
      ]
    })
  );

  assert.deepEqual(summary, {
    createCount: 1,
    updateCount: 1,
    deleteCount: 1,
    replaceCount: 2,
    blocked: false,
    warnings: []
  });
});

test("createDeploymentPlanSummaryFromTerraformShowJson records unsupported action warnings", () => {
  const summary = createDeploymentPlanSummaryFromTerraformShowJson(
    JSON.stringify({
      resource_changes: [
        {
          address: "aws_instance.imported",
          change: {
            actions: ["import"]
          }
        },
        {
          address: "aws_instance.missing_action",
          change: {}
        }
      ]
    })
  );

  assert.equal(summary.createCount, 0);
  assert.equal(summary.warnings.length, 2);
  assert.equal(
    summary.warnings[0]?.message,
    "Unsupported Terraform plan action for aws_instance.imported: import"
  );
  assert.equal(
    summary.warnings[1]?.message,
    "Unsupported Terraform plan action for aws_instance.missing_action: missing actions"
  );
});

test("createDeploymentPlanSummaryFromTerraformShowJson skips malformed resource changes", () => {
  const summary = createDeploymentPlanSummaryFromTerraformShowJson(
    JSON.stringify({
      resource_changes: [
        null,
        "not-a-resource-change",
        ["not-a-resource-change"],
        {
          address: "aws_instance.web",
          change: {
            actions: ["create"]
          }
        }
      ]
    })
  );

  assert.equal(summary.createCount, 1);
  assert.equal(summary.warnings.length, 0);
});

test("createDeploymentPlanSummaryFromTerraformShowJson rejects invalid JSON", () => {
  assert.throws(
    () => createDeploymentPlanSummaryFromTerraformShowJson("{not-json"),
    (error) => {
      assert.equal(error instanceof DeploymentPlanSummaryParseError, true);
      assert.equal((error as Error).message, "Terraform plan JSON could not be parsed");

      return true;
    }
  );
});
