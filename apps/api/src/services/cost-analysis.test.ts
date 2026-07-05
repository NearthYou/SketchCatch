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

test("analyzeCost does not price an RDS snapshot as a running DB instance", async () => {
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

  assert.equal(snapshot?.monthlyEstimate.amount, 0);
  assert.equal(snapshot?.supportLevel, "not_estimated");
});

function createArchitectureJson(
  resources: readonly {
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
        terraformResourceType: resource.terraformResourceType,
        terraformResourceName: resource.id
      }
    }))
  };
}
