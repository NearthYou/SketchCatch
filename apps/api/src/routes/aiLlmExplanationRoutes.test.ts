import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { buildApp } from "../app.js";

process.env.NODE_ENV = "test";

const llmExplanationSchema = z.object({
  target: z.enum(["pre_deployment_check", "terraform_error_explanation", "architecture_draft"]),
  summary: z.string(),
  highlights: z.array(z.string()),
  nextActions: z.array(z.string()),
  fallbackUsed: z.boolean(),
  fallbackReason: z.string().optional()
});

test("POST /api/ai/pre-deployment-check returns fallback llmExplanation when Bedrock credit is not confirmed", async () => {
  const restoreAiEnv = forceAwsAiCreditBlocked();
  const app = buildApp();

  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/ai/pre-deployment-check",
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

    const body = z
      .object({
        summary: z.string(),
        findings: z.array(z.object({ id: z.string() })),
        llmExplanation: llmExplanationSchema
      })
      .parse(response.json());

    assert.ok(body.findings.length > 0);
    assert.equal(body.llmExplanation.target, "pre_deployment_check");
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

test("POST /api/ai/terraform-error-explanation returns fallback llmExplanation when AWS AI credits are not confirmed", async () => {
  const restoreAiEnv = forceAwsAiCreditBlocked();
  const app = buildApp();

  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/ai/terraform-error-explanation",
      payload: {
        stage: "plan",
        rawMessage: "AccessDenied: not authorized to perform ec2:RunInstances",
        relatedResourceId: "ec2-backend"
      }
    });

    assert.equal(response.statusCode, 200);

    const body = z
      .object({
        stage: z.literal("plan"),
        category: z.literal("permission"),
        summary: z.string(),
        llmExplanation: llmExplanationSchema
      })
      .parse(response.json());

    assert.equal(body.llmExplanation.target, "terraform_error_explanation");
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

test("POST /api/ai/architecture-draft returns fallback llmExplanation when Bedrock credit is not confirmed", async () => {
  const restoreAiEnv = forceAwsAiCreditBlocked();
  const app = buildApp();

  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/ai/architecture-draft",
      payload: {
        prompt: "Node API 서버와 Postgres 데이터베이스가 필요합니다.",
        scenarioHint: "auto",
        budgetLevel: "normal",
        trafficLevel: "small",
        securityPriority: "high"
      }
    });

    assert.equal(response.statusCode, 200);

    const body = z
      .object({
        title: z.string(),
        metadata: z.object({
          assumptions: z.array(z.string()),
          explanations: z.array(z.string())
        }),
        llmExplanation: llmExplanationSchema
      })
      .parse(response.json());

    assert.equal(body.llmExplanation.target, "architecture_draft");
    assert.equal(body.llmExplanation.fallbackUsed, true);
    assert.equal(body.llmExplanation.fallbackReason, "credit_not_confirmed");
    assert.ok(body.llmExplanation.summary.includes(body.title));
    assert.ok(body.llmExplanation.highlights.length > 0);
    assert.ok(body.llmExplanation.nextActions.length > 0);
  } finally {
    restoreAiEnv();
    await app.close();
  }
});

function forceAwsAiCreditBlocked(): () => void {
  const originalEnv = {
    AI_BILLING_MODE: process.env.AI_BILLING_MODE,
    AMAZON_Q_CREDIT_CONFIRMED: process.env.AMAZON_Q_CREDIT_CONFIRMED,
    AMAZON_Q_ENABLED: process.env.AMAZON_Q_ENABLED,
    BEDROCK_CREDIT_CONFIRMED: process.env.BEDROCK_CREDIT_CONFIRMED,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY
  };

  process.env.AI_BILLING_MODE = "aws_credit_only";
  process.env.AMAZON_Q_CREDIT_CONFIRMED = "false";
  process.env.AMAZON_Q_ENABLED = "false";
  process.env.BEDROCK_CREDIT_CONFIRMED = "false";
  delete process.env.OPENAI_API_KEY;

  return () => {
    restoreEnvValue("AI_BILLING_MODE", originalEnv.AI_BILLING_MODE);
    restoreEnvValue("AMAZON_Q_CREDIT_CONFIRMED", originalEnv.AMAZON_Q_CREDIT_CONFIRMED);
    restoreEnvValue("AMAZON_Q_ENABLED", originalEnv.AMAZON_Q_ENABLED);
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
