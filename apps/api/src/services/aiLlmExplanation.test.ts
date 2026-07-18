import assert from "node:assert/strict";
import test from "node:test";
import type { AiProviderAttempt, LlmExplanationTarget } from "@sketchcatch/types";
import {
  createAiProviderBackedLlmExplanation,
  resolveAiProviderRegions,
  type AiCreditPolicy,
  type AiProviderLimits,
  type AiTextProvider,
  type AiTextProviderFor,
  type AmazonQTextProvider
} from "./aiLlmExplanation.js";
import type { LlmExplanationInput } from "./aiLlmExplanationTypes.js";

const AWS_CREDIT_POLICY: AiCreditPolicy = {
  bedrock: true,
  amazonQ: true,
  transcribe: true,
  billingMode: "aws_credit_only"
};

const GENEROUS_LIMITS: AiProviderLimits = {
  dailyCallLimit: 100,
  windowCallLimit: 100,
  windowMs: 60_000
};

const TERRAFORM_ERROR_INPUT: LlmExplanationInput = {
  target: "terraform_error_explanation",
  result: {
    stage: "validate",
    category: "syntax",
    severity: "high",
    rawMessage: "Unexpected token",
    summary: "Terraform 구문 오류가 있습니다.",
    likelyCause: "지원하지 않는 토큰이 포함되었습니다.",
    nextActions: ["오류 줄을 수정하세요."],
    wellArchitectedGuidance: [],
    consensusRecommendation: "구문 오류를 먼저 수정하세요."
  }
};

const TERRAFORM_PREVIEW_INPUT: LlmExplanationInput = {
  target: "terraform_preview_explanation",
  result: {
    summary: "Terraform Preview를 검토했습니다.",
    detectedResources: [],
    findings: [],
    checklist: [],
    wellArchitectedGuidance: [],
    consensusRecommendation: "배포 전 검토를 계속하세요."
  }
};

test("Amazon Q uses its supported default region independently from the primary AWS region", () => {
  assert.deepEqual(resolveAiProviderRegions({ AWS_REGION: "ap-northeast-2" }), {
    bedrockRegion: "ap-northeast-2",
    amazonQRegion: "ap-southeast-2",
    transcribeRegion: "ap-northeast-2"
  });

  assert.equal(
    resolveAiProviderRegions({
      AWS_REGION: "ap-northeast-2",
      AMAZON_Q_REGION: "us-east-1"
    }).amazonQRegion,
    "us-east-1"
  );
});

test("Terraform error explanation skips an unavailable Amazon Q provider and succeeds with Bedrock", async () => {
  const calls: string[] = [];
  const createExplanation = createAiProviderBackedLlmExplanation({
    amazonQProvider: undefined,
    bedrockProvider: createProvider("bedrock", "bedrock_runtime", async () => {
      calls.push("bedrock");
      return { text: createSuccessfulResponse("terraform_error_explanation", "Bedrock 오류 설명") };
    }),
    openAiProvider: createProvider("openai", "openai_responses", async () => {
      calls.push("openai");
      return { text: createSuccessfulResponse("terraform_error_explanation", "OpenAI 오류 설명") };
    }),
    creditPolicy: AWS_CREDIT_POLICY,
    limits: GENEROUS_LIMITS
  });

  const explanation = await createExplanation(TERRAFORM_ERROR_INPUT);

  assert.equal(explanation.summary, "Bedrock 오류 설명");
  assert.deepEqual(calls, ["bedrock"]);
  assert.deepEqual(explanation.providerMetadata?.attempts, [
    {
      provider: "amazon_q",
      service: "amazon_q_business",
      status: "skipped",
      fallbackReason: "provider_not_configured"
    },
    {
      provider: "bedrock",
      service: "bedrock_runtime",
      status: "succeeded"
    }
  ] satisfies AiProviderAttempt[]);
});

test("Terraform preview explanation continues from any Amazon Q fallback to Bedrock without calling OpenAI", async () => {
  const calls: string[] = [];
  const createExplanation = createAiProviderBackedLlmExplanation({
    amazonQProvider: createProvider("amazon_q", "amazon_q_business", async () => {
      calls.push("amazon_q");
      return { text: "not-json" };
    }),
    bedrockProvider: createProvider("bedrock", "bedrock_runtime", async () => {
      calls.push("bedrock");
      return { text: createSuccessfulResponse("terraform_preview_explanation", "Bedrock Preview 설명") };
    }),
    openAiProvider: createProvider("openai", "openai_responses", async () => {
      calls.push("openai");
      return { text: createSuccessfulResponse("terraform_preview_explanation", "OpenAI Preview 설명") };
    }),
    creditPolicy: AWS_CREDIT_POLICY,
    limits: GENEROUS_LIMITS
  });

  const explanation = await createExplanation(TERRAFORM_PREVIEW_INPUT);

  assert.equal(explanation.summary, "Bedrock Preview 설명");
  assert.deepEqual(calls, ["amazon_q", "bedrock"]);
  assert.deepEqual(explanation.providerMetadata?.attempts, [
    {
      provider: "amazon_q",
      service: "amazon_q_business",
      status: "fallback",
      fallbackReason: "invalid_response"
    },
    {
      provider: "bedrock",
      service: "bedrock_runtime",
      status: "succeeded"
    }
  ] satisfies AiProviderAttempt[]);
});

test("Terraform error explanation treats malformed Amazon Q text as fallback and continues to Bedrock", async () => {
  const calls: string[] = [];
  const createExplanation = createAiProviderBackedLlmExplanation({
    amazonQProvider: createProvider("amazon_q", "amazon_q_business", async () => {
      calls.push("amazon_q");
      return { text: "not-json" };
    }),
    bedrockProvider: createProvider("bedrock", "bedrock_runtime", async () => {
      calls.push("bedrock");
      return { text: createSuccessfulResponse("terraform_error_explanation", "Bedrock 오류 설명") };
    }),
    openAiProvider: createProvider("openai", "openai_responses", async () => {
      calls.push("openai");
      return { text: createSuccessfulResponse("terraform_error_explanation", "OpenAI 오류 설명") };
    }),
    creditPolicy: AWS_CREDIT_POLICY,
    limits: GENEROUS_LIMITS
  });

  const explanation = await createExplanation(TERRAFORM_ERROR_INPUT);

  assert.equal(explanation.summary, "Bedrock 오류 설명");
  assert.deepEqual(calls, ["amazon_q", "bedrock"]);
  assert.deepEqual(explanation.providerMetadata?.attempts, [
    {
      provider: "amazon_q",
      service: "amazon_q_business",
      status: "fallback",
      fallbackReason: "invalid_response"
    },
    {
      provider: "bedrock",
      service: "bedrock_runtime",
      status: "succeeded"
    }
  ] satisfies AiProviderAttempt[]);
});

test("Terraform AWS-only chain rejects a provider wired into the wrong slot without calling it", async () => {
  const calls: string[] = [];
  const createExplanation = createAiProviderBackedLlmExplanation({
    amazonQProvider: createProvider("openai", "openai_responses", async () => {
      calls.push("openai");
      return { text: createSuccessfulResponse("terraform_error_explanation", "OpenAI 오류 설명") };
    }) as unknown as AmazonQTextProvider,
    bedrockProvider: createProvider("bedrock", "bedrock_runtime", async () => {
      calls.push("bedrock");
      return { text: createSuccessfulResponse("terraform_error_explanation", "Bedrock 오류 설명") };
    }),
    creditPolicy: AWS_CREDIT_POLICY,
    limits: GENEROUS_LIMITS
  });

  const explanation = await createExplanation(TERRAFORM_ERROR_INPUT);

  assert.equal(explanation.summary, "Bedrock 오류 설명");
  assert.deepEqual(calls, ["bedrock"]);
  assert.deepEqual(explanation.providerMetadata?.attempts, [
    {
      provider: "amazon_q",
      service: "amazon_q_business",
      status: "skipped",
      fallbackReason: "provider_not_configured"
    },
    {
      provider: "bedrock",
      service: "bedrock_runtime",
      status: "succeeded"
    }
  ] satisfies AiProviderAttempt[]);
});

test("Terraform explanation records only sanitized provider failures before deterministic fallback", async () => {
  const calls: string[] = [];
  const createExplanation = createAiProviderBackedLlmExplanation({
    amazonQProvider: createProvider("amazon_q", "amazon_q_business", async () => {
      calls.push("amazon_q");
      throw new Error("q-secret-provider-payload");
    }),
    bedrockProvider: createProvider("bedrock", "bedrock_runtime", async () => {
      calls.push("bedrock");
      const error = new Error("bedrock-secret-provider-payload");
      error.name = "AccessDeniedException";
      throw error;
    }),
    openAiProvider: createProvider("openai", "openai_responses", async () => {
      calls.push("openai");
      return { text: createSuccessfulResponse("terraform_error_explanation", "OpenAI 오류 설명") };
    }),
    creditPolicy: AWS_CREDIT_POLICY,
    limits: GENEROUS_LIMITS
  });

  const explanation = await createExplanation(TERRAFORM_ERROR_INPUT);

  assert.equal(explanation.fallbackUsed, true);
  assert.equal(explanation.providerMetadata?.provider, "fallback");
  assert.deepEqual(calls, ["amazon_q", "bedrock"]);
  assert.deepEqual(explanation.providerMetadata?.attempts, [
    {
      provider: "amazon_q",
      service: "amazon_q_business",
      status: "failed",
      fallbackReason: "provider_error"
    },
    {
      provider: "bedrock",
      service: "bedrock_runtime",
      status: "failed",
      fallbackReason: "auth_error"
    },
    {
      provider: "fallback",
      service: "rule_fallback",
      status: "succeeded"
    }
  ] satisfies AiProviderAttempt[]);
  assert.doesNotMatch(JSON.stringify(explanation), /secret-provider-payload/);
});

test("Terraform explanation skips an unconfirmed Amazon Q credit path and still uses an allowed Bedrock provider", async () => {
  const calls: string[] = [];
  const createExplanation = createAiProviderBackedLlmExplanation({
    amazonQProvider: createProvider("amazon_q", "amazon_q_business", async () => {
      calls.push("amazon_q");
      return { text: createSuccessfulResponse("terraform_error_explanation", "Amazon Q 오류 설명") };
    }),
    bedrockProvider: createProvider("bedrock", "bedrock_runtime", async () => {
      calls.push("bedrock");
      return { text: createSuccessfulResponse("terraform_error_explanation", "Bedrock 오류 설명") };
    }),
    creditPolicy: {
      ...AWS_CREDIT_POLICY,
      amazonQ: false
    },
    limits: GENEROUS_LIMITS
  });

  const explanation = await createExplanation(TERRAFORM_ERROR_INPUT);

  assert.equal(explanation.summary, "Bedrock 오류 설명");
  assert.deepEqual(calls, ["bedrock"]);
  assert.deepEqual(explanation.providerMetadata?.attempts, [
    {
      provider: "amazon_q",
      service: "amazon_q_business",
      status: "skipped",
      fallbackReason: "credit_not_confirmed"
    },
    {
      provider: "bedrock",
      service: "bedrock_runtime",
      status: "succeeded"
    }
  ] satisfies AiProviderAttempt[]);
});

test("Terraform provider-chain cache reuses each provider result without changing attempt order", async () => {
  let amazonQCalls = 0;
  let bedrockCalls = 0;
  const createExplanation = createAiProviderBackedLlmExplanation({
    amazonQProvider: createProvider("amazon_q", "amazon_q_business", async () => {
      amazonQCalls += 1;
      return { text: "not-json" };
    }),
    bedrockProvider: createProvider("bedrock", "bedrock_runtime", async () => {
      bedrockCalls += 1;
      return { text: createSuccessfulResponse("terraform_preview_explanation", "Bedrock Preview 설명") };
    }),
    creditPolicy: AWS_CREDIT_POLICY,
    limits: GENEROUS_LIMITS
  });

  await createExplanation(TERRAFORM_PREVIEW_INPUT);
  const cachedExplanation = await createExplanation(TERRAFORM_PREVIEW_INPUT);

  assert.equal(amazonQCalls, 1);
  assert.equal(bedrockCalls, 1);
  assert.equal(cachedExplanation.providerMetadata?.cacheHit, true);
  assert.deepEqual(
    cachedExplanation.providerMetadata?.attempts?.map((attempt) => attempt.provider),
    ["amazon_q", "bedrock"]
  );
});

test("Terraform provider-chain rate limit skips only the limited provider and continues to Bedrock", async () => {
  const calls: string[] = [];
  const createExplanation = createAiProviderBackedLlmExplanation({
    amazonQProvider: createProvider("amazon_q", "amazon_q_business", async (request) => {
      calls.push("amazon_q");
      return { text: createSuccessfulResponse(request.target as LlmExplanationTarget, "Amazon Q 설명") };
    }),
    bedrockProvider: createProvider("bedrock", "bedrock_runtime", async () => {
      calls.push("bedrock");
      return { text: createSuccessfulResponse("terraform_error_explanation", "Bedrock 오류 설명") };
    }),
    creditPolicy: AWS_CREDIT_POLICY,
    limits: {
      dailyCallLimit: 100,
      windowCallLimit: 1,
      windowMs: 60_000
    }
  });

  await createExplanation(TERRAFORM_ERROR_INPUT);
  const explanation = await createExplanation({
    target: "terraform_error_explanation",
    result: {
      ...TERRAFORM_ERROR_INPUT.result,
      rawMessage: "A different unexpected token"
    }
  });

  assert.equal(explanation.summary, "Bedrock 오류 설명");
  assert.deepEqual(calls, ["amazon_q", "bedrock"]);
  assert.deepEqual(explanation.providerMetadata?.attempts, [
    {
      provider: "amazon_q",
      service: "amazon_q_business",
      status: "skipped",
      fallbackReason: "rate_limited"
    },
    {
      provider: "bedrock",
      service: "bedrock_runtime",
      status: "succeeded"
    }
  ] satisfies AiProviderAttempt[]);
});

function createProvider<
  Provider extends AiTextProvider["provider"],
  Service extends AiTextProvider["service"]
>(
  provider: Provider,
  service: Service,
  generate: AiTextProvider["generate"]
): AiTextProviderFor<Provider, Service> {
  return {
    provider,
    service,
    model: `${provider}-test-model`,
    generate
  };
}

function createSuccessfulResponse(target: LlmExplanationTarget, summary: string): string {
  return JSON.stringify({
    target,
    summary,
    highlights:
      target === "terraform_preview_explanation"
        ? ["운영 우수성", "보안", "신뢰성", "성능 효율성", "비용 최적화", "지속 가능성"]
        : ["오류 원인을 확인했습니다."],
    nextActions: ["제안 내용을 검토하세요."],
    fallbackUsed: false,
    codeSuggestion: null,
    wellArchitectedConclusion:
      target === "terraform_preview_explanation" ? "여섯 가지 관점의 보완 사항을 검토하세요." : null
  });
}
