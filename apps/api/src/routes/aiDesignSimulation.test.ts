import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { buildApp } from "../app.js";

process.env.NODE_ENV = "test";

const moneyEstimateSchema = z.object({
  amount: z.number(),
  currency: z.literal("USD")
});

const costEstimateSchema = z.object({
  totalEstimate: moneyEstimateSchema,
  totalMonthlyEstimate: moneyEstimateSchema,
  period: z.enum(["day", "week", "month"]),
  expectedUserCount: z.number(),
  region: z.string(),
  pricingSource: z.enum(["aws_pricing_api", "fallback"]),
  fallbackUsed: z.boolean(),
  assumptions: z.array(z.string()),
  resources: z.array(
    z.object({
      resourceId: z.string(),
      resourceType: z.string(),
      name: z.string(),
      monthlyEstimate: moneyEstimateSchema,
      periodEstimate: moneyEstimateSchema,
      costDrivers: z.array(z.string()),
      explanation: z.string(),
      pricingSource: z.enum(["aws_pricing_api", "fallback"]).optional(),
      usageAssumptions: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
      recommendation: z.string().optional()
    })
  ),
  reviewMessages: z.array(z.string()),
  pricingAssumption: z.string()
});

const designSimulationResponseSchema = z.object({
  summary: z.string(),
  assumptions: z.array(z.string()),
  requestFlow: z.array(
    z.object({
      fromResourceId: z.string(),
      toResourceId: z.string(),
      description: z.string()
    })
  ),
  bottlenecks: z.array(
    z.object({
      id: z.string(),
      resourceId: z.string(),
      severity: z.string(),
      title: z.string(),
      description: z.string()
    })
  ),
  failureScenarios: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      affectedResourceIds: z.array(z.string()),
      description: z.string(),
      mitigation: z.string()
    })
  ),
  costPressure: z.array(z.string()),
  costEstimate: costEstimateSchema,
  recommendations: z.array(z.string())
});

const llmExplanationSchema = z.object({
  target: z.literal("design_simulation"),
  summary: z.string(),
  highlights: z.array(z.string()),
  nextActions: z.array(z.string()),
  fallbackUsed: z.boolean(),
  fallbackReason: z.string().optional()
});

const llmEnhancedDesignSimulationResponseSchema = designSimulationResponseSchema.extend({
  llmExplanation: llmExplanationSchema
});

test("POST /api/ai/design-simulation estimates flow, bottlenecks, failures, and cost pressure from ArchitectureJson", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/ai/design-simulation",
    payload: {
      trafficLevel: "normal",
      budgetLevel: "low",
      period: "month",
      expectedUserCount: 1000,
      region: "ap-northeast-2",
      architectureJson: {
        nodes: [
          {
            id: "subnet-app",
            type: "SUBNET",
            label: "App Subnet",
            positionX: 80,
            positionY: 120,
            config: {
              cidrBlock: "10.0.1.0/24",
              vpcId: "vpc-main"
            }
          },
          {
            id: "ec2-backend",
            type: "EC2",
            label: "Backend API",
            positionX: 240,
            positionY: 120,
            config: {
              instanceType: "t3.micro",
              subnetId: "subnet-app",
              securityGroupIds: ["sg-app"]
            }
          },
          {
            id: "rds-primary",
            type: "RDS",
            label: "Primary Database",
            positionX: 420,
            positionY: 120,
            config: {
              engine: "postgres",
              instanceClass: "db.t4g.micro"
            }
          }
        ],
        edges: [
          {
            id: "subnet-to-api",
            sourceId: "subnet-app",
            targetId: "ec2-backend"
          },
          {
            id: "api-to-db",
            sourceId: "ec2-backend",
            targetId: "rds-primary"
          }
        ]
      }
    }
  });

  assert.equal(response.statusCode, 200);

  const body = designSimulationResponseSchema.parse(response.json());

  assert.ok(body.assumptions.some((item) => item.includes("실제 부하 테스트가 아닌")));
  assert.ok(body.requestFlow.some((step) => step.fromResourceId === "ec2-backend" && step.toResourceId === "rds-primary"));
  assert.ok(body.bottlenecks.some((item) => item.resourceId === "ec2-backend"));
  assert.ok(body.failureScenarios.some((item) => item.affectedResourceIds.includes("rds-primary")));
  assert.ok(body.costPressure.some((item) => item.includes("RDS")));
  assert.ok(body.recommendations.some((item) => item.includes("EC2")));
  assert.equal(body.costEstimate.totalEstimate.amount, 47.3);
  assert.equal(body.costEstimate.totalMonthlyEstimate.amount, 47.3);
  assert.equal(body.costEstimate.period, "month");
  assert.equal(body.costEstimate.expectedUserCount, 1000);
  assert.equal(body.costEstimate.region, "ap-northeast-2");
  assert.equal(body.costEstimate.pricingSource, "fallback");
  assert.equal(body.costEstimate.fallbackUsed, true);
  assert.ok(
    body.costEstimate.resources.some(
      (item) =>
        item.resourceId === "ec2-backend" &&
        item.monthlyEstimate.amount === 8.5 &&
        item.periodEstimate.amount === 8.5
    )
  );
  assert.ok(
    body.costEstimate.resources.some(
      (item) =>
        item.resourceId === "rds-primary" &&
        item.monthlyEstimate.amount === 38.8 &&
        item.periodEstimate.amount === 38.8
    )
  );
  assert.ok(
    body.costEstimate.reviewMessages.some(
      (item) => item === "현재 상황에서의 총 예상 비용은 $47.30 / month입니다."
    )
  );
  assert.ok(body.costPressure.some((item) => item === "EC2는 인스턴스 크기와 실행 시간이 비용에 직접 영향을 줍니다."));

  await app.close();
});

test("POST /api/ai/design-simulation accepts generated load balancer resource types", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/ai/design-simulation",
    payload: {
      trafficLevel: "normal",
      budgetLevel: "low",
      architectureJson: {
        nodes: [
          {
            id: "vpc-main",
            type: "VPC",
            label: "Main VPC",
            positionX: 80,
            positionY: 120,
            config: {}
          },
          {
            id: "subnet-public-a",
            type: "SUBNET",
            label: "Public Subnet A",
            positionX: 240,
            positionY: 120,
            config: {}
          },
          {
            id: "app-security-group",
            type: "SECURITY_GROUP",
            label: "App Security Group",
            positionX: 400,
            positionY: 120,
            config: {}
          },
          {
            id: "app-load-balancer",
            type: "LOAD_BALANCER",
            label: "Application Load Balancer",
            positionX: 560,
            positionY: 120,
            config: {
              loadBalancerType: "application"
            }
          }
        ],
        edges: []
      }
    }
  });

  assert.equal(response.statusCode, 200);

  const body = designSimulationResponseSchema.parse(response.json());

  assert.ok(body.costEstimate.resources.some((item) => item.resourceType === "LOAD_BALANCER"));

  await app.close();
});

test("POST /api/ai/design-simulation returns fallback llmExplanation when Bedrock credit is not confirmed", async () => {
  const restoreAiEnv = forceAwsAiCreditBlocked();

  const app = buildApp();

  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/ai/design-simulation",
      payload: {
        trafficLevel: "normal",
        budgetLevel: "low",
        architectureJson: {
          nodes: [
            {
              id: "ec2-backend",
              type: "EC2",
              label: "Backend API",
              positionX: 240,
              positionY: 120,
              config: {
                instanceType: "t3.micro"
              }
            }
          ],
          edges: []
        }
      }
    });

    assert.equal(response.statusCode, 200);

    const body = llmEnhancedDesignSimulationResponseSchema.parse(response.json());

    assert.equal(body.llmExplanation.fallbackUsed, true);
    assert.equal(body.llmExplanation.fallbackReason, "credit_not_confirmed");
    assert.ok(body.llmExplanation.summary.length > 0);
    assert.ok(body.llmExplanation.highlights.length > 0);
    assert.ok(body.llmExplanation.nextActions.length > 0);
  } finally {
    restoreAiEnv();
    await app.close();
  }
});

test("POST /api/ai/design-simulation returns fake LLM explanation when provider succeeds", async () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-openai-api-key";

  const app = buildApp({
    createLlmExplanation: async () => ({
      target: "design_simulation",
      summary: "LLM이 요청 흐름과 병목 후보를 쉬운 말로 정리했습니다.",
      highlights: ["단일 EC2가 요청을 혼자 받을 수 있습니다."],
      nextActions: ["트래픽이 늘 경우 Load Balancer를 검토하세요."],
      fallbackUsed: false
    })
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/ai/design-simulation",
      payload: {
        trafficLevel: "normal",
        budgetLevel: "low",
        architectureJson: {
          nodes: [
            {
              id: "ec2-backend",
              type: "EC2",
              label: "Backend API",
              positionX: 240,
              positionY: 120,
              config: {
                instanceType: "t3.micro"
              }
            }
          ],
          edges: []
        }
      }
    });

    assert.equal(response.statusCode, 200);

    const body = llmEnhancedDesignSimulationResponseSchema.parse(response.json());

    assert.equal(body.llmExplanation.fallbackUsed, false);
    assert.equal(body.llmExplanation.summary, "LLM이 요청 흐름과 병목 후보를 쉬운 말로 정리했습니다.");
    assert.deepEqual(body.llmExplanation.highlights, ["단일 EC2가 요청을 혼자 받을 수 있습니다."]);
    assert.deepEqual(body.llmExplanation.nextActions, ["트래픽이 늘 경우 Load Balancer를 검토하세요."]);
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }

    await app.close();
  }
});

test("POST /api/ai/design-simulation explains public exposure as a failure scenario", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/ai/design-simulation",
    payload: {
      architectureJson: {
        nodes: [
          {
            id: "sg-public-ssh",
            type: "SECURITY_GROUP",
            label: "Public SSH",
            positionX: 120,
            positionY: 180,
            config: {
              ingress: [
                {
                  protocol: "tcp",
                  port: 22,
                  cidr: "0.0.0.0/0"
                }
              ]
            }
          }
        ],
        edges: []
      }
    }
  });

  assert.equal(response.statusCode, 200);

  const body = designSimulationResponseSchema.parse(response.json());

  assert.ok(body.failureScenarios.some((item) => item.affectedResourceIds.includes("sg-public-ssh")));

  await app.close();
});

function forceAwsAiCreditBlocked(): () => void {
  const originalEnv = {
    AI_BILLING_MODE: process.env.AI_BILLING_MODE,
    BEDROCK_CREDIT_CONFIRMED: process.env.BEDROCK_CREDIT_CONFIRMED,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY
  };

  process.env.AI_BILLING_MODE = "aws_credit_only";
  process.env.BEDROCK_CREDIT_CONFIRMED = "false";
  delete process.env.OPENAI_API_KEY;

  return () => {
    restoreEnvValue("AI_BILLING_MODE", originalEnv.AI_BILLING_MODE);
    restoreEnvValue("BEDROCK_CREDIT_CONFIRMED", originalEnv.BEDROCK_CREDIT_CONFIRMED);
    restoreEnvValue("OPENAI_API_KEY", originalEnv.OPENAI_API_KEY);
  };
}

function restoreEnvValue(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
