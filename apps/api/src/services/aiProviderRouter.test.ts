import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatSyncCommand, ChatSyncCommandInput } from "@aws-sdk/client-qbusiness";
import type {
  AiTerraformErrorExplanationResult,
  DesignSimulationResult,
  LlmExplanation
} from "@sketchcatch/types";
import {
  createAiProviderBackedLlmExplanation,
  createAmazonQBusinessTextProvider,
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

function createTerraformErrorResult(
  input: Partial<AiTerraformErrorExplanationResult> = {}
): AiTerraformErrorExplanationResult {
  return {
    stage: "plan",
    category: "permission",
    severity: "high",
    rawMessage: "AccessDenied",
    summary: "Terraform plan failed because AWS permissions are missing.",
    likelyCause: "The execution role does not include the required IAM action.",
    nextActions: ["Review the IAM policy attached to the execution role."],
    wellArchitectedGuidance: [
      {
        pillar: "operational_excellence",
        title: "운영 우수성",
        observation: "Keep the issue visible until validation passes.",
        recommendation: "Fix the Terraform input and rerun validation."
      },
      {
        pillar: "security",
        title: "보안",
        observation: "Do not expose credentials in error messages.",
        recommendation: "Mask secrets before AI explanation."
      },
      {
        pillar: "reliability",
        title: "신뢰성",
        observation: "Failed validation blocks unsafe deployment.",
        recommendation: "Revalidate before deployment."
      },
      {
        pillar: "performance_efficiency",
        title: "성능 효율성",
        observation: "Static validation avoids expensive retries.",
        recommendation: "Resolve syntax and policy issues before plan."
      },
      {
        pillar: "cost_optimization",
        title: "비용 최적화",
        observation: "Early failure reduces wasted execution time.",
        recommendation: "Apply only deterministic fixes automatically."
      },
      {
        pillar: "sustainability",
        title: "지속 가능성",
        observation: "Fewer failed runs reduce waste.",
        recommendation: "Keep validation local where possible."
      }
    ],
    consensusRecommendation: "Fix the Terraform issue, rerun validation, and continue only after it is resolved.",
    ...input
  };
}

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
    prompt: requirementPromptText
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
    result: createTerraformErrorResult({
      summary: "권한 부족으로 plan이 실패했습니다.",
      likelyCause: "Role에 권한이 없습니다.",
      nextActions: ["IAM policy를 확인하세요."],
      relatedResourceId: "ec2-web"
    })
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

test("createAiProviderBackedLlmExplanation preserves Amazon Q code suggestions without Well-Architected guidance", async () => {
  const qCalls: unknown[] = [];
  const bedrockCalls: unknown[] = [];
  const qExplanation: LlmExplanation = {
    target: "terraform_error_explanation",
    summary: "Amazon Q found a Terraform syntax fix.",
    highlights: ["The existing line contains a trailing comma."],
    nextActions: ["Review the replacement and validate Terraform again."],
    fallbackUsed: false,
    codeSuggestion: {
      currentCode: '  bucket = "logs",',
      suggestedCode: '  bucket = "logs"',
      rationale: "Removing the comma resolves the syntax error."
    },
    wellArchitectedConclusion: "This Terraform syntax fix does not need a Well-Architected review."
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

  const result = await createLlmExplanation({
    target: "terraform_error_explanation",
    result: createTerraformErrorResult(),
    terraformCodeContext: 'resource "aws_s3_bucket" "logs" {\n  bucket = "logs",\n}'
  });

  assert.equal(result.providerMetadata?.provider, "amazon_q");
  assert.equal(result.codeSuggestion?.suggestedCode, '  bucket = "logs"');
  assert.equal(result.wellArchitectedConclusion, undefined);
  assert.equal(qCalls.length, 1);
  assert.equal(bedrockCalls.length, 0);
  assert.doesNotMatch(String((qCalls[0] as { prompt?: unknown }).prompt), /six criteria/);
  assert.match(String((qCalls[0] as { prompt?: unknown }).prompt), /Do not provide Well-Architected guidance/);
  assert.match(String((qCalls[0] as { prompt?: unknown }).prompt), /terraformCodeContext/);
  assert.match(String((qCalls[0] as { prompt?: unknown }).prompt), /rawMessage/);
  assert.match(String((qCalls[0] as { prompt?: unknown }).prompt), /AccessDenied/);
  assert.match(String((qCalls[0] as { prompt?: unknown }).prompt), /empty string/);
});

test("createAiProviderBackedLlmExplanation preserves Amazon Q deletion code suggestions", async () => {
  const qCalls: unknown[] = [];
  const qExplanation: LlmExplanation = {
    target: "terraform_error_explanation",
    summary: "Amazon Q found an invalid standalone Terraform line.",
    highlights: ["The token is not a block header, attribute, or expression."],
    nextActions: ["Review the deletion and validate Terraform again."],
    fallbackUsed: false,
    codeSuggestion: {
      currentCode: "xczxczxczxczxczcx\n",
      suggestedCode: "",
      rationale: "Delete the invalid standalone token line."
    }
  };
  const createLlmExplanation = createAiProviderBackedLlmExplanation({
    amazonQProvider: createProvider("amazon_q", qExplanation, qCalls),
    fallbackProvider: createFallbackOnlyLlmExplanation,
    creditPolicy: {
      bedrock: true,
      amazonQ: true,
      transcribe: false,
      billingMode: "aws_credit_only"
    },
    limits: { dailyCallLimit: 10, windowCallLimit: 10, windowMs: 60_000 }
  });

  const result = await createLlmExplanation({
    target: "terraform_error_explanation",
    result: createTerraformErrorResult({
      rawMessage: "Unsupported block type: xczxczxczxczxczcx"
    }),
    terraformCodeContext: 'resource "aws_security_group" "web" {\n}\nxczxczxczxczxczcx\nresource "aws_route_table" "public" {\n}'
  });

  assert.equal(result.providerMetadata?.provider, "amazon_q");
  assert.equal(result.codeSuggestion?.currentCode, "xczxczxczxczxczcx\n");
  assert.equal(result.codeSuggestion?.suggestedCode, "");
  assert.equal(qCalls.length, 1);
});

test("createAiProviderBackedLlmExplanation accepts unstructured Amazon Q Terraform explanations", async () => {
  const qCalls: unknown[] = [];
  const bedrockCalls: unknown[] = [];
  const createLlmExplanation = createAiProviderBackedLlmExplanation({
    amazonQProvider: {
      provider: "amazon_q",
      service: "amazon_q_business",
      model: "amazon-q-model",
      generate: async (request) => {
        qCalls.push(request);
        return {
          text: [
            "닫힌 block 뒤에 남은 Terraform attribute가 있어서 validate가 실패했습니다.",
            "- main.tf 13번째 줄의 중괄호 위치를 확인하세요.",
            "- 수정 후 Terraform 재검증을 실행하세요."
          ].join("\n")
        };
      }
    },
    bedrockProvider: {
      provider: "bedrock",
      service: "bedrock_runtime",
      model: "bedrock-model",
      generate: async (request) => {
        bedrockCalls.push(request);
        return {
          text: JSON.stringify({
            target: "terraform_error_explanation",
            summary: "Bedrock should not overwrite Amazon Q.",
            highlights: ["Bedrock should not run."],
            nextActions: ["Keep Amazon Q result."],
            fallbackUsed: false
          })
        };
      }
    },
    fallbackProvider: createFallbackOnlyLlmExplanation,
    creditPolicy: {
      bedrock: true,
      amazonQ: true,
      transcribe: false,
      billingMode: "aws_credit_only"
    },
    limits: { dailyCallLimit: 10, windowCallLimit: 10, windowMs: 60_000 }
  });

  const result = await createLlmExplanation({
    target: "terraform_error_explanation",
    result: createTerraformErrorResult({
      summary: "권한 부족으로 plan이 실패했습니다.",
      likelyCause: "실행 Role에 필요한 권한이 없습니다.",
      nextActions: ["IAM policy를 확인하세요."]
    })
  });

  assert.equal(result.fallbackUsed, false);
  assert.match(result.summary, /닫힌 block/);
  assert.deepEqual(result.highlights, [
    "main.tf 13번째 줄의 중괄호 위치를 확인하세요.",
    "수정 후 Terraform 재검증을 실행하세요."
  ]);
  assert.equal(result.providerMetadata?.provider, "amazon_q");
  assert.equal(qCalls.length, 1);
  assert.equal(bedrockCalls.length, 0);
});

test("createAiProviderBackedLlmExplanation rejects generic Amazon Q Terraform non-answers", async () => {
  const qCalls: unknown[] = [];
  const createLlmExplanation = createAiProviderBackedLlmExplanation({
    amazonQProvider: {
      provider: "amazon_q",
      service: "amazon_q_business",
      model: "amazon-q-model",
      generate: async (request) => {
        qCalls.push(request);
        return {
          text: "Sorry, I could not find relevant information to complete your request."
        };
      }
    },
    fallbackProvider: createFallbackOnlyLlmExplanation,
    creditPolicy: {
      bedrock: true,
      amazonQ: true,
      transcribe: false,
      billingMode: "aws_credit_only"
    },
    limits: { dailyCallLimit: 10, windowCallLimit: 10, windowMs: 60_000 }
  });

  const result = await createLlmExplanation({
    target: "terraform_error_explanation",
    result: createTerraformErrorResult()
  });

  assert.equal(result.fallbackUsed, true);
  assert.equal(result.fallbackReason, "invalid_response");
  assert.doesNotMatch(result.summary, /could not find relevant information/i);
  assert.equal(result.providerMetadata?.provider, "amazon_q");
  assert.equal(qCalls.length, 1);
});

test("createAiProviderBackedLlmExplanation keeps Amazon Q metadata when Terraform error Q credits are blocked", async () => {
  const qCalls: unknown[] = [];
  const createLlmExplanation = createAiProviderBackedLlmExplanation({
    amazonQProvider: createProvider(
      "amazon_q",
      {
        target: "terraform_error_explanation",
        summary: "should not be used",
        highlights: ["should not be used"],
        nextActions: ["should not be used"],
        fallbackUsed: false
      },
      qCalls
    ),
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
    target: "terraform_error_explanation",
    result: createTerraformErrorResult()
  });

  assert.equal(result.fallbackUsed, true);
  assert.equal(result.fallbackReason, "credit_not_confirmed");
  assert.equal(result.providerMetadata?.provider, "amazon_q");
  assert.equal(qCalls.length, 0);
});

test("createAiProviderBackedLlmExplanation reports missing Amazon Q configuration without using Bedrock for Terraform errors", async () => {
  const bedrockCalls: unknown[] = [];
  const createLlmExplanation = createAiProviderBackedLlmExplanation({
    amazonQProvider: undefined,
    bedrockProvider: {
      provider: "bedrock",
      service: "bedrock_runtime",
      model: "bedrock-model",
      generate: async (request) => {
        bedrockCalls.push(request);
        throw new Error("Bedrock provider failed");
      }
    },
    fallbackProvider: createFallbackOnlyLlmExplanation,
    creditPolicy: {
      bedrock: true,
      amazonQ: true,
      transcribe: false,
      billingMode: "aws_credit_only"
    },
    limits: { dailyCallLimit: 10, windowCallLimit: 10, windowMs: 60_000 }
  });

  const result = await createLlmExplanation({
    target: "terraform_error_explanation",
    result: createTerraformErrorResult({
      summary: "권한 부족으로 plan이 실패했습니다.",
      likelyCause: "실행 Role에 필요한 권한이 없습니다.",
      nextActions: ["IAM policy를 확인하세요."]
    })
  });

  assert.equal(result.fallbackUsed, true);
  assert.equal(result.fallbackReason, "provider_not_configured");
  assert.equal(result.providerMetadata?.provider, "amazon_q");
  assert.equal(bedrockCalls.length, 0);
});

test("createAmazonQBusinessTextProvider omits userId for anonymous identity applications", async () => {
  const sentInputs: ChatSyncCommandInput[] = [];
  const provider = createAmazonQBusinessTextProvider({
    applicationId: "qbusiness-application-id",
    region: "ap-southeast-2",
    client: {
      send: async (command: ChatSyncCommand) => {
        sentInputs.push(command.input);
        return { systemMessage: "anonymous response" };
      }
    }
  });

  const result = await provider.generate({
    target: "terraform_error_explanation",
    instructions: "Return JSON.",
    prompt: "hello",
    payload: {}
  });

  assert.equal(result.text, "anonymous response");
  assert.deepEqual(sentInputs, [
    {
      applicationId: "qbusiness-application-id",
      userMessage: "hello"
    }
  ]);
});

test("createAmazonQBusinessTextProvider sends userId when one is configured", async () => {
  const sentInputs: ChatSyncCommandInput[] = [];
  const provider = createAmazonQBusinessTextProvider({
    applicationId: "qbusiness-application-id",
    region: "ap-southeast-2",
    userId: "songchaegang@gmail.com",
    client: {
      send: async (command: ChatSyncCommand) => {
        sentInputs.push(command.input);
        return { systemMessage: "user response" };
      }
    }
  });

  const result = await provider.generate({
    target: "terraform_error_explanation",
    instructions: "Return JSON.",
    prompt: "hello",
    payload: {}
  });

  assert.equal(result.text, "user response");
  assert.deepEqual(sentInputs, [
    {
      applicationId: "qbusiness-application-id",
      userId: "songchaegang@gmail.com",
      userMessage: "hello"
    }
  ]);
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
