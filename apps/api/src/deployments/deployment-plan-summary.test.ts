import assert from "node:assert/strict";
import test from "node:test";
import { createDeploymentPlanSummaryFromTerraformShowJson } from "./deployment-plan-summary.js";

test("Terraform import-only no-op changes remain represented in the Plan summary", () => {
  const summary = createDeploymentPlanSummaryFromTerraformShowJson(
    JSON.stringify({
      resource_changes: [
        {
          address: "aws_s3_bucket.existing_bucket",
          mode: "managed",
          type: "aws_s3_bucket",
          change: {
            actions: ["no-op"],
            importing: { id: "existing-bucket" }
          }
        },
        {
          address: "aws_s3_bucket.unchanged_bucket",
          mode: "managed",
          type: "aws_s3_bucket",
          change: { actions: ["no-op"] }
        }
      ]
    })
  );

  assert.equal(summary.importCount, 1);
  assert.equal(summary.createCount, 0);
  assert.equal(summary.updateCount, 0);
  assert.equal(summary.deleteCount, 0);
  assert.equal(summary.replaceCount, 0);
});
