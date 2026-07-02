import assert from "node:assert/strict";
import { test } from "node:test";
import type { DesignSimulationResult, LlmExplanation } from "@sketchcatch/types";
import {
  createAiProviderBackedLlmExplanation,
  createFallbackOnlyLlmExplanation,
  resolveAiProviderRegions,
  type AiTextProvider
} from "./aiLlmExplanation.js";
import { createArchitectureDraft } from "./aiArchitectureDrafts.js";

process.env.NODE_ENV = "test";

const designSimulationResult: DesignSimulationResult = {
  summary: "구조 기반 Design Simulation 요약입니다.",
  assumptions: ["실제 부하 테스트가 아닌 구조 기반 추정입니다."],
  requestFlow: [],
  bottlenecks: [],
  failureScenarios: [],
  costPressure: [],
  recommendations: ["Architecture Board에서 연결을 확인하세요."]
};

test("resolveAiProviderRegions allows Amazon Q Business to use a different region", () => {
  const regions = resolveAiProviderRegions({
    AMAZON_Q_REGION: "ap-southeast-2",
    AWS_REGION: "ap-northeast-2"
  });

  assert.equal(regions.bedrockRegion, "ap-northeast-2");
  assert.equal(regions.amazonQRegion, "ap-southeast-2");
  assert.equal(regions.transcribeRegion, "ap-northeast-2");
});

function createProvider(
  provider: AiTextProvider["provider"],
  text: LlmExplanation,
  calls: unknown[]
): AiTextProvider {
  return {
    provider,
    service: provider === "amazon_q" ? "amazon_q_business" : "bedrock_runtime",
    model: `${provider}-model`,
    generate: async (request) => {
      calls.push(request);
      return {
        text: JSON.stringify(text),
        outputCharacters: JSON.stringify(text).length
      };
    }
  };
}

test("createAiProviderBackedLlmExplanation uses Bedrock with metadata for general explanation targets", async () => {
  const calls: unknown[] = [];
  const bedrockExplanation: LlmExplanation = {
    target: "design_simulation",
    summary: "Bedrock이 구조 기반 결과를 쉬운 말로 설명했습니다.",
    highlights: ["EC2 단일 구성은 병목 가능성이 있습니다."],
    nextActions: ["보드에서 확장 구조를 검토하세요."],
    fallbackUsed: false
  };
  const createLlmExplanation = createAiProviderBackedLlmExplanation({
    bedrockProvider: createProvider("bedrock", bedrockExplanation, calls),
    fallbackProvider: createFallbackOnlyLlmExplanation,
    creditPolicy: {
      bedrock: true,
      amazonQ: false,
      transcribe: false,
      billingMode: "aws_credit_only"
    },
    limits: { dailyCallLimit: 10, windowCallLimit: 10, windowMs: 60_000 }
  });

  const result = await createLlmExplanation({
    target: "design_simulation",
    result: designSimulationResult
  });

  assert.equal(result.fallbackUsed, false);
  assert.equal(result.providerMetadata?.provider, "bedrock");
  assert.equal(result.providerMetadata?.service, "bedrock_runtime");
  assert.equal(result.providerMetadata?.routeTarget, "design_simulation");
  assert.equal(result.providerMetadata?.cacheHit, false);
  assert.equal(calls.length, 1);
});

test("createAiProviderBackedLlmExplanation sends the Requirement Prompt context to Bedrock for draft explanations", async () => {
  const calls: unknown[] = [];
  const bedrockExplanation: LlmExplanation = {
    target: "architecture_draft",
    summary: "Bedrock이 Requirement Prompt와 deterministic draft를 함께 설명했습니다.",
    highlights: ["사용자 요청은 정적 웹 사이트입니다."],
    nextActions: ["Board 적용 전 리소스 구성을 검토하세요."],
    fallbackUsed: false
  };
  const createLlmExplanation = createAiProviderBackedLlmExplanation({
    bedrockProvider: createProvider("bedrock", bedrockExplanation, calls),
    fallbackProvider: createFallbackOnlyLlmExplanation,
    creditPolicy: {
      bedrock: true,
      amazonQ: false,
      transcribe: false,
      billingMode: "aws_credit_only"
    },
    limits: { dailyCallLimit: 10, windowCallLimit: 10, windowMs: 60_000 }
  });
  const requirementPromptText = "S3와 CloudFront로 정적 사이트를 만들어줘";
  const draft = createArchitectureDraft({
    prompt: requirementPromptText,
    scenarioHint: "auto",
    budgetLevel: "normal",
    trafficLevel: "normal",
    securityPriority: "basic"
  });

  await createLlmExplanation({
    target: "architecture_draft",
    result: draft,
    requirementPromptText
  });

  const request = calls[0] as { readonly payload?: { readonly requirementPromptText?: string } };

  assert.equal(request.payload?.requirementPromptText, requirementPromptText);
});

test("createAiProviderBackedLlmExplanation blocks Bedrock calls when credit is not confirmed", async () => {
  const calls: unknown[] = [];
  const createLlmExplanation = createAiProviderBackedLlmExplanation({
    bedrockProvider: createProvider(
      "bedrock",
      {
        target: "design_simulation",
        summary: "should not be used",
        highlights: ["should not be used"],
        nextActions: ["should not be used"],
        fallbackUsed: false
      },
      calls
    ),
    fallbackProvider: createFallbackOnlyLlmExplanation,
    creditPolicy: {
      bedrock: false,
      amazonQ: false,
      transcribe: false,
      billingMode: "aws_credit_only"
    },
    limits: { dailyCallLimit: 10, windowCallLimit: 10, windowMs: 60_000 }
  });

  const result = await createLlmExplanation({
    target: "design_simulation",
    result: designSimulationResult
  });

  assert.equal(calls.length, 0);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.fallbackReason, "credit_not_confirmed");
  assert.equal(result.providerMetadata?.provider, "fallback");
});

test("createAiProviderBackedLlmExplanation uses Amazon Q first for Terraform error explanation and caches repeat calls", async () => {
  const qCalls: unknown[] = [];
  const bedrockCalls: unknown[] = [];
  const qExplanation: LlmExplanation = {
    target: "terraform_error_explanation",
    summary: "Amazon Q가 IAM 권한 문제를 설명했습니다.",
    highlights: ["ec2:RunInstances 권한을 확인하세요."],
    nextActions: ["실행 Role의 IAM policy를 검토하세요."],
    fallbackUsed: false
  };
  const createLlmExplanation = createAiProviderBackedLlmExplanation({
    amazonQProvider: createProvider("amazon_q", qExplanation, qCalls),
    bedrockProvider: createProvider("bedrock", qExplanation, bedrockCalls),
    fallbackProvider: createFallbackOnlyLlmExplanation,
    creditPolicy: {
      bedrock: true,
      amazonQ: true,
      transcribe: false,
      billingMode: "aws_credit_only"
    },
    limits: { dailyCallLimit: 10, windowCallLimit: 10, windowMs: 60_000 }
  });
  const input = {
    target: "terraform_error_explanation" as const,
    result: {
      stage: "plan" as const,
      category: "permission" as const,
      severity: "high" as const,
      rawMessage: "AccessDenied",
      summary: "권한 부족으로 plan이 실패했습니다.",
      likelyCause: "Role에 권한이 없습니다.",
      nextActions: ["IAM policy를 확인하세요."],
      relatedResourceId: "ec2-web"
    }
  };

  const first = await createLlmExplanation(input);
  const second = await createLlmExplanation(input);

  assert.equal(first.providerMetadata?.provider, "amazon_q");
  assert.equal(first.providerMetadata?.cacheHit, false);
  assert.equal(second.providerMetadata?.provider, "amazon_q");
  assert.equal(second.providerMetadata?.cacheHit, true);
  assert.equal(qCalls.length, 1);
  assert.equal(bedrockCalls.length, 0);
});

test("createAiProviderBackedLlmExplanation keeps daily limits across rate windows", async () => {
  const calls: unknown[] = [];
  const bedrockExplanation: LlmExplanation = {
    target: "design_simulation",
    summary: "Bedrock explanation",
    highlights: ["First call is allowed."],
    nextActions: ["Review the generated explanation."],
    fallbackUsed: false
  };
  const createLlmExplanation = createAiProviderBackedLlmExplanation({
    bedrockProvider: createProvider("bedrock", bedrockExplanation, calls),
    fallbackProvider: createFallbackOnlyLlmExplanation,
    creditPolicy: {
      bedrock: true,
      amazonQ: false,
      transcribe: false,
      billingMode: "aws_credit_only"
    },
    limits: { dailyCallLimit: 1, windowCallLimit: 10, windowMs: 0 }
  });

  const first = await createLlmExplanation({
    target: "design_simulation",
    result: designSimulationResult
  });
  const second = await createLlmExplanation({
    target: "design_simulation",
    result: {
      ...designSimulationResult,
      summary: "A different simulation summary avoids the cache."
    }
  });

  assert.equal(first.fallbackUsed, false);
  assert.equal(second.fallbackUsed, true);
  assert.equal(second.fallbackReason, "daily_limit_exceeded");
  assert.equal(calls.length, 1);
});
