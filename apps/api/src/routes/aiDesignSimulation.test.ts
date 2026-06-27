import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { buildApp } from "../app.js";

process.env.NODE_ENV = "test";

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
  recommendations: z.array(z.string())
});

const llmEnhancementSchema = z.object({
  target: z.literal("design_simulation"),
  summary: z.string(),
  highlights: z.array(z.string()),
  nextActions: z.array(z.string()),
  fallbackUsed: z.boolean(),
  fallbackReason: z.string().optional()
});

const llmEnhancedDesignSimulationResponseSchema = designSimulationResponseSchema.extend({
  llmEnhancement: llmEnhancementSchema
});

test("POST /api/ai/design-simulation estimates flow, bottlenecks, failures, and cost pressure from ArchitectureJson", async () => {
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

  await app.close();
});

test("POST /api/ai/design-simulation returns fallback llmEnhancement when API key is missing", async () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

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

    assert.equal(body.llmEnhancement.fallbackUsed, true);
    assert.equal(body.llmEnhancement.fallbackReason, "missing_api_key");
    assert.ok(body.llmEnhancement.summary.length > 0);
    assert.ok(body.llmEnhancement.highlights.length > 0);
    assert.ok(body.llmEnhancement.nextActions.length > 0);
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }

    await app.close();
  }
});

test("POST /api/ai/design-simulation returns fake LLM enhancement when provider succeeds", async () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-openai-api-key";

  const app = buildApp({
    createLlmEnhancement: async () => ({
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

    assert.equal(body.llmEnhancement.fallbackUsed, false);
    assert.equal(body.llmEnhancement.summary, "LLM이 요청 흐름과 병목 후보를 쉬운 말로 정리했습니다.");
    assert.deepEqual(body.llmEnhancement.highlights, ["단일 EC2가 요청을 혼자 받을 수 있습니다."]);
    assert.deepEqual(body.llmEnhancement.nextActions, ["트래픽이 늘 경우 Load Balancer를 검토하세요."]);
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
