import assert from "node:assert/strict";
import { test } from "node:test";
import type { ArchitectureJson, ResourceType } from "@sketchcatch/types";
import { analyzeCost, createCostEstimateRequest } from "./cost-analysis.js";

process.env.NODE_ENV = "test";

test("analyzeCost estimates NAT Gateway and ALB from Terraform resource type metadata", async () => {
  const result = await analyzeCost(
    createCostEstimateRequest({
      architectureJson: createArchitectureJson([
        { id: "nat", type: "UNKNOWN", terraformResourceType: "aws_nat_gateway" },
        { id: "alb", type: "UNKNOWN", terraformResourceType: "aws_lb" }
      ]),
      expectedUserCount: 1000,
      period: "month",
      region: "ap-northeast-2"
    })
  );

  const nat = result.resources.find((resource) => resource.resourceId === "nat");
  const alb = result.resources.find((resource) => resource.resourceId === "alb");

  assert.equal(nat?.monthlyEstimate.amount, 32.85);
  assert.equal(nat.supportLevel, "fallback_estimate");
  assert.equal(alb?.monthlyEstimate.amount, 16.2);
  assert.equal(alb.supportLevel, "fallback_estimate");
});

test("analyzeCost returns resource estimates for the requested period", async () => {
  const result = await analyzeCost(
    createCostEstimateRequest({
      architectureJson: createArchitectureJson([
        { id: "ec2", type: "UNKNOWN", terraformResourceType: "aws_instance" }
      ]),
      expectedUserCount: 1000,
      period: "week",
      region: "ap-northeast-2"
    })
  );

  const ec2 = result.resources.find((resource) => resource.resourceId === "ec2");

  assert.equal(result.totalMonthlyEstimate.amount, 8.5);
  assert.equal(result.totalEstimate.amount, 1.98);
  assert.equal(ec2?.monthlyEstimate.amount, 8.5);
  assert.equal(ec2?.periodEstimate.amount, 1.98);
});

test("analyzeCost scales capacity and usage estimates by expected user count", async () => {
  const baseResult = await analyzeCost(
    createCostEstimateRequest({
      architectureJson: createArchitectureJson([
        { id: "ec2", type: "UNKNOWN", terraformResourceType: "aws_instance" },
        { id: "s3", type: "UNKNOWN", terraformResourceType: "aws_s3_bucket" },
        { id: "alb", type: "UNKNOWN", terraformResourceType: "aws_lb" }
      ]),
      expectedUserCount: 1000,
      period: "month",
      region: "ap-northeast-2"
    })
  );
  const doubleResult = await analyzeCost(
    createCostEstimateRequest({
      architectureJson: createArchitectureJson([
        { id: "ec2", type: "UNKNOWN", terraformResourceType: "aws_instance" },
        { id: "s3", type: "UNKNOWN", terraformResourceType: "aws_s3_bucket" },
        { id: "alb", type: "UNKNOWN", terraformResourceType: "aws_lb" }
      ]),
      expectedUserCount: 2000,
      period: "month",
      region: "ap-northeast-2"
    })
  );

  const baseEc2 = baseResult.resources.find((resource) => resource.resourceId === "ec2");
  const doubleEc2 = doubleResult.resources.find((resource) => resource.resourceId === "ec2");
  const baseS3 = baseResult.resources.find((resource) => resource.resourceId === "s3");
  const doubleS3 = doubleResult.resources.find((resource) => resource.resourceId === "s3");
  const baseAlb = baseResult.resources.find((resource) => resource.resourceId === "alb");
  const doubleAlb = doubleResult.resources.find((resource) => resource.resourceId === "alb");

  assert.equal(baseEc2?.monthlyEstimate.amount, 8.5);
  assert.equal(doubleEc2?.monthlyEstimate.amount, 17);
  assert.equal(baseS3?.monthlyEstimate.amount, 0.46);
  assert.equal(doubleS3?.monthlyEstimate.amount, 0.92);
  assert.equal(baseAlb?.monthlyEstimate.amount, 16.2);
  assert.equal(doubleAlb?.monthlyEstimate.amount, 32.4);
});

test("analyzeCost uses expanded instance fallback amounts when Pricing API is unavailable", async () => {
  const result = await analyzeCost(
    createCostEstimateRequest({
      architectureJson: createArchitectureJson([
        {
          config: { instanceType: "m6i.large" },
          id: "ec2-large",
          type: "UNKNOWN",
          terraformResourceType: "aws_instance"
        },
        {
          config: { instanceClass: "db.r6i.xlarge" },
          id: "rds-large",
          type: "UNKNOWN",
          terraformResourceType: "aws_db_instance"
        },
        {
          config: { nodeType: "cache.r6g.large" },
          id: "cache-large",
          type: "UNKNOWN",
          terraformResourceType: "aws_elasticache_replication_group"
        }
      ]),
      expectedUserCount: 1000,
      period: "month",
      region: "ap-northeast-2"
    })
  );

  assert.equal(result.resources.find((resource) => resource.resourceId === "ec2-large")?.monthlyEstimate.amount, 70);
  assert.equal(result.resources.find((resource) => resource.resourceId === "rds-large")?.monthlyEstimate.amount, 662.3);
  assert.equal(result.resources.find((resource) => resource.resourceId === "cache-large")?.monthlyEstimate.amount, 145);
});

test("analyzeCost prices an RDS snapshot as snapshot storage instead of a running DB instance", async () => {
  const result = await analyzeCost(
    createCostEstimateRequest({
      architectureJson: createArchitectureJson([
        { id: "snapshot", type: "RDS", terraformResourceType: "aws_db_snapshot" }
      ]),
      expectedUserCount: 1000,
      period: "month",
      region: "ap-northeast-2"
    })
  );

  const snapshot = result.resources.find((resource) => resource.resourceId === "snapshot");

  assert.equal(snapshot?.monthlyEstimate.amount, 1.9);
  assert.equal(snapshot?.supportLevel, "fallback_estimate");
  assert.deepEqual(snapshot?.costDrivers, ["20GB snapshot storage"]);
});

test("analyzeCost covers the requested Terraform resource list with API-backed or explicit no-direct-cost estimates", async () => {
  const pricingQueries: string[] = [];
  const noDirectCostResources = new Set([
    "aws_acm_certificate",
    "aws_autoscaling_group",
    "aws_sns_topic_subscription"
  ]);
  const result = await analyzeCost(
    createCostEstimateRequest({
      architectureJson: createArchitectureJson(
        REQUESTED_TERRAFORM_RESOURCE_TYPES.map((terraformResourceType) => ({
          id: terraformResourceType,
          type: "UNKNOWN",
          terraformResourceType
        }))
      ),
      expectedUserCount: 1000,
      period: "month",
      region: "ap-northeast-2"
    }),
    {
      pricingRateProvider: async (query) => {
        pricingQueries.push(query.usageType);

        return {
          amount: 0.01,
          unit: "hour"
        };
      }
    }
  );

  assert.equal(result.resources.length, REQUESTED_TERRAFORM_RESOURCE_TYPES.length);

  for (const resource of result.resources) {
    assert.notEqual(resource.supportLevel, "not_estimated", resource.resourceId);

    if (noDirectCostResources.has(resource.resourceId)) {
      assert.equal(resource.supportLevel, "no_direct_cost", resource.resourceId);
      assert.equal(resource.monthlyEstimate.amount, 0, resource.resourceId);
    } else {
      assert.equal(resource.supportLevel, "aws_pricing_api", resource.resourceId);
      assert.equal(resource.pricingSource, "aws_pricing_api", resource.resourceId);
      assert.ok(resource.monthlyEstimate.amount > 0, resource.resourceId);
    }
  }

  assert.ok(pricingQueries.includes("vpc_endpoint_hour"));
  assert.ok(pricingQueries.includes("ebs_storage_gb_month"));
  assert.ok(pricingQueries.includes("dynamodb_request"));
  assert.ok(pricingQueries.includes("waf_web_acl_month"));
});

const REQUESTED_TERRAFORM_RESOURCE_TYPES = [
  "aws_nat_gateway",
  "aws_vpc_endpoint",
  "aws_vpc_peering_connection",
  "aws_eip",
  "aws_lb",
  "aws_instance",
  "aws_autoscaling_group",
  "aws_ebs_volume",
  "aws_s3_bucket",
  "aws_s3_object",
  "aws_efs_file_system",
  "aws_db_instance",
  "aws_db_snapshot",
  "aws_rds_cluster",
  "aws_rds_cluster_instance",
  "aws_dynamodb_table",
  "aws_elasticache_replication_group",
  "aws_kms_key",
  "aws_secretsmanager_secret",
  "aws_acm_certificate",
  "aws_lambda_function",
  "aws_api_gateway_rest_api",
  "aws_api_gateway_stage",
  "aws_apigatewayv2_api",
  "aws_sqs_queue",
  "aws_sns_topic",
  "aws_sns_topic_subscription",
  "aws_cloudwatch_event_rule",
  "aws_scheduler_schedule",
  "aws_cloudfront_distribution",
  "aws_route53_zone",
  "aws_cloudwatch_log_group",
  "aws_cloudwatch_metric_alarm",
  "aws_cloudwatch_dashboard",
  "aws_cloudtrail",
  "aws_xray_group",
  "aws_xray_sampling_rule",
  "aws_ecs_service",
  "aws_ecr_repository",
  "aws_eks_cluster",
  "aws_eks_node_group",
  "aws_codebuild_project",
  "aws_codepipeline",
  "aws_config_configuration_recorder",
  "aws_config_config_rule",
  "aws_wafv2_web_acl",
  "aws_shield_protection",
  "aws_guardduty_detector"
] as const;

function createArchitectureJson(
  resources: readonly {
    readonly config?: Record<string, string> | undefined;
    readonly id: string;
    readonly terraformResourceType: string;
    readonly type: ResourceType;
  }[]
): ArchitectureJson {
  return {
    edges: [],
    nodes: resources.map((resource, index) => ({
      id: resource.id,
      type: resource.type,
      label: resource.id,
      positionX: index,
      positionY: 0,
      config: {
        ...(resource.config ?? {}),
        terraformResourceType: resource.terraformResourceType,
        terraformResourceName: resource.id
      }
    }))
  };
}
