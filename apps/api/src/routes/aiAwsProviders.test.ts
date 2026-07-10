import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { buildApp } from "../app.js";

process.env.NODE_ENV = "test";

const providerMetadataSchema = z.object({
  provider: z.enum(["bedrock", "amazon_q", "amazon_transcribe", "openai", "fallback"]),
  service: z.string(),
  routeTarget: z.string(),
  cacheHit: z.boolean(),
  estimatedUsage: z.object({
    inputCharacters: z.number()
  })
});

test("POST /api/ai/terraform-preview-explanation includes Amazon Q/fallback provider metadata without changing board state", async () => {
  const originalBillingMode = process.env.AI_BILLING_MODE;
  const originalAmazonQCredit = process.env.AMAZON_Q_CREDIT_CONFIRMED;
  process.env.AI_BILLING_MODE = "aws_credit_only";
  delete process.env.AMAZON_Q_CREDIT_CONFIRMED;
  const app = buildApp();

  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/ai/terraform-preview-explanation",
      payload: {
        terraformCode: 'resource "aws_instance" "web" {}'
      }
    });

    assert.equal(response.statusCode, 200);
    const body = z
      .object({
        summary: z.string(),
        detectedResources: z.array(z.object({ terraformType: z.string() })),
        llmExplanation: z.object({
          target: z.literal("terraform_preview_explanation"),
          fallbackUsed: z.literal(true),
          fallbackReason: z.literal("credit_not_confirmed"),
          providerMetadata: providerMetadataSchema
        })
      })
      .parse(response.json());

    assert.equal(body.llmExplanation.providerMetadata.provider, "amazon_q");
    assert.equal(body.llmExplanation.providerMetadata.routeTarget, "terraform_preview_explanation");
  } finally {
    restoreEnvValue("AI_BILLING_MODE", originalBillingMode);
    restoreEnvValue("AMAZON_Q_CREDIT_CONFIRMED", originalAmazonQCredit);
    await app.close();
  }
});

test("POST /api/ai/architecture-patch-preview returns a preview that requires user acceptance", async () => {
  const app = buildApp({
    createLlmExplanation: async (input) => ({
      target: input.target,
      summary: "Bedrock이 자연어 수정 요청을 설명했습니다.",
      highlights: ["S3 추가 요청으로 해석했습니다."],
      nextActions: ["미리보기 diff를 확인한 뒤 적용하세요."],
      fallbackUsed: false,
      providerMetadata: {
        provider: "bedrock",
        service: "bedrock_runtime",
        model: "test-model",
        routeTarget: input.target,
        cacheHit: false,
        cacheKey: "test-cache-key",
        estimatedUsage: {
          inputCharacters: 10,
          inputTokensEstimate: 3,
          outputCharacters: 10,
          outputTokensEstimate: 3
        },
        billingMode: "aws_credit_only",
        generatedAt: new Date(0).toISOString()
      }
    })
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/ai/architecture-patch-preview",
      payload: {
        architectureJson: {
          nodes: [],
          edges: []
        },
        instruction: "S3 버킷을 추가해줘"
      }
    });

    assert.equal(response.statusCode, 200);
    const body = z
      .object({
        requiresUserAcceptance: z.literal(true),
        changes: z.array(
          z.object({
            action: z.literal("add_resource"),
            resourceType: z.literal("S3")
          })
        ),
        userAcceptedChange: z.null(),
        proposedArchitectureJson: z.object({
          nodes: z.array(z.object({ type: z.literal("S3") }))
        }),
        llmExplanation: z.object({
          providerMetadata: providerMetadataSchema
        })
      })
      .parse(response.json());

    assert.equal(body.requiresUserAcceptance, true);
    assert.equal(body.userAcceptedChange, null);
    assert.equal(body.proposedArchitectureJson.nodes.length, 1);
  } finally {
    await app.close();
  }
});

test("POST /api/ai/architecture-patch-preview accepts generated load balancer resource types", async () => {
  const app = buildApp({
    createLlmExplanation: async (input) => ({
      target: input.target,
      summary: "Patch preview explanation.",
      highlights: ["The existing load balancer remains part of the board."],
      nextActions: ["Review the preview before applying it."],
      fallbackUsed: false
    })
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/ai/architecture-patch-preview",
      payload: {
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
        },
        instruction: "S3 bucket add"
      }
    });

    assert.equal(response.statusCode, 200);
    assert.match(response.json().status, /^(needs_clarification|preview)$/);
  } finally {
    await app.close();
  }
});

test("POST /api/ai/voice-requirement/confirm creates RequirementPrompt only from confirmed transcript text", async () => {
  const app = buildApp();

  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/ai/voice-requirement/confirm",
      payload: {
        transcriptText: "원본 전사",
        confirmedText: "확정된 요구사항",
        confirmedByUserId: "user-1"
      }
    });

    assert.equal(response.statusCode, 200);
    const body = z
      .object({
        requirementPrompt: z.object({
          text: z.literal("확정된 요구사항"),
          confirmedByUser: z.literal(true),
          source: z.literal("voice_transcript")
        }),
        confirmation: z.object({
          confirmedByUser: z.literal(true),
          status: z.literal("confirmed")
        })
      })
      .parse(response.json());

    assert.equal(body.requirementPrompt.confirmedByUser, true);
  } finally {
    await app.close();
  }
});

function restoreEnvValue(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
