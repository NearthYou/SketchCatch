import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DeploymentPlanSummaryParseError,
  createDeploymentPlanSummaryFromTerraformShowJson,
  findUnsupportedLiveApplyResourceTypesFromTerraformShowJson
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

test("demo web service live apply allows ECS Fargate and Application Auto Scaling resources", () => {
  const terraformShowJson = JSON.stringify({
    resource_changes: [
      "aws_ecs_cluster",
      "aws_ecs_task_definition",
      "aws_ecs_service",
      "aws_appautoscaling_target",
      "aws_appautoscaling_policy",
      "aws_ecr_repository",
      "aws_eip",
      "aws_nat_gateway"
    ].map((type) => ({ mode: "managed", type, change: { actions: ["create"] } }))
  });

  assert.deepEqual(
    findUnsupportedLiveApplyResourceTypesFromTerraformShowJson(
      terraformShowJson,
      "demo_web_service"
    ),
    []
  );
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

test("findUnsupportedLiveApplyResourceTypesFromTerraformShowJson returns changed resources outside the MVP apply scope", () => {
  const unsupportedTypes = findUnsupportedLiveApplyResourceTypesFromTerraformShowJson(
    JSON.stringify({
      resource_changes: [
        {
          mode: "managed",
          type: "aws_vpc",
          change: {
            actions: ["create"]
          }
        },
        {
          mode: "managed",
          type: "aws_s3_bucket_versioning",
          change: {
            actions: ["create"]
          }
        },
        {
          mode: "managed",
          type: "aws_lambda_function",
          change: {
            actions: ["update"]
          }
        },
        {
          mode: "managed",
          type: "aws_cloudwatch_log_group",
          change: {
            actions: ["no-op"]
          }
        },
        {
          mode: "data",
          type: "aws_ami",
          change: {
            actions: ["read"]
          }
        }
      ]
    })
  );

  assert.deepEqual(unsupportedTypes, ["aws_lambda_function", "aws_s3_bucket_versioning"]);
});

test("findUnsupportedLiveApplyResourceTypesFromTerraformShowJson allows demo web service resources only for the demo profile", () => {
  const terraformShowJson = JSON.stringify({
    resource_changes: [
      {
        mode: "managed",
        type: "aws_lb",
        change: {
          actions: ["create"]
        }
      },
      {
        mode: "managed",
        type: "aws_autoscaling_group",
        change: {
          actions: ["create"]
        }
      },
      {
        mode: "managed",
        type: "aws_autoscaling_policy",
        change: {
          actions: ["create"]
        }
      },
      {
        mode: "managed",
        type: "aws_cloudwatch_metric_alarm",
        change: {
          actions: ["create"]
        }
      },
      {
        mode: "managed",
        type: "aws_cloudwatch_log_group",
        change: {
          actions: ["create"]
        }
      },
      {
        mode: "managed",
        type: "aws_iam_role",
        change: {
          actions: ["create"]
        }
      },
      {
        mode: "managed",
        type: "aws_iam_role_policy_attachment",
        change: {
          actions: ["create"]
        }
      },
      {
        mode: "managed",
        type: "aws_iam_instance_profile",
        change: {
          actions: ["create"]
        }
      },
      {
        mode: "managed",
        type: "aws_db_instance",
        change: {
          actions: ["create"]
        }
      }
    ]
  });

  assert.deepEqual(
    findUnsupportedLiveApplyResourceTypesFromTerraformShowJson(terraformShowJson),
    [
      "aws_autoscaling_group",
      "aws_autoscaling_policy",
      "aws_cloudwatch_log_group",
      "aws_cloudwatch_metric_alarm",
      "aws_db_instance",
      "aws_iam_instance_profile",
      "aws_iam_role_policy_attachment",
      "aws_lb"
    ]
  );
  assert.deepEqual(
    findUnsupportedLiveApplyResourceTypesFromTerraformShowJson(
      terraformShowJson,
      "demo_web_service"
    ),
    ["aws_db_instance"]
  );
  assert.deepEqual(
    findUnsupportedLiveApplyResourceTypesFromTerraformShowJson(
      terraformShowJson,
      "demo_web_service_with_rds"
    ),
    []
  );
});

test("findUnsupportedLiveApplyResourceTypesFromTerraformShowJson allows AI-generated CI/CD resources", () => {
  const unsupportedTypes = findUnsupportedLiveApplyResourceTypesFromTerraformShowJson(
    JSON.stringify({
      resource_changes: [
        {
          mode: "managed",
          type: "aws_codebuild_project",
          change: { actions: ["create"] }
        },
        {
          mode: "managed",
          type: "aws_codedeploy_app",
          change: { actions: ["create"] }
        },
        {
          mode: "managed",
          type: "aws_codedeploy_deployment_group",
          change: { actions: ["create"] }
        },
        {
          mode: "managed",
          type: "aws_codepipeline",
          change: { actions: ["create"] }
        },
        {
          mode: "managed",
          type: "aws_codestarconnections_connection",
          change: { actions: ["create"] }
        },
        {
          mode: "managed",
          type: "aws_iam_role",
          change: { actions: ["create"] }
        }
      ]
    })
  );

  assert.deepEqual(unsupportedTypes, []);
});
