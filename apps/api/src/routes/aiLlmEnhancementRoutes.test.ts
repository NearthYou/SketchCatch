import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { buildApp } from "../app.js";

process.env.NODE_ENV = "test";

const llmEnhancementSchema = z.object({
  target: z.enum(["pre_deployment_check", "terraform_error_explanation", "architecture_draft"]),
  summary: z.string(),
  highlights: z.array(z.string()),
  nextActions: z.array(z.string()),
  fallbackUsed: z.boolean(),
  fallbackReason: z.string().optional()
});

test("POST /api/ai/pre-deployment-check returns fallback llmEnhancement when API key is missing", async () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
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
        llmEnhancement: llmEnhancementSchema
      })
      .parse(response.json());

    assert.ok(body.findings.length > 0);
    assert.equal(body.llmEnhancement.target, "pre_deployment_check");
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

test("POST /api/ai/terraform-error-explanation returns fallback llmEnhancement when API key is missing", async () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
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
        llmEnhancement: llmEnhancementSchema
      })
      .parse(response.json());

    assert.equal(body.llmEnhancement.target, "terraform_error_explanation");
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
