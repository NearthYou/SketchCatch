import "../config/load-env.js";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { ChatSyncCommand, QBusinessClient } from "@aws-sdk/client-qbusiness";
import OpenAI from "openai";
import type {
  AiBillingMode,
  AiProvider,
  AiProviderMetadata,
  AiProviderService,
  LlmExplanation,
  LlmExplanationFallbackReason,
  LlmExplanationTarget
} from "@sketchcatch/types";
import {
  createArchitectureDraftFallbackExplanation,
  createArchitecturePatchPreviewFallbackExplanation,
  createDesignSimulationFallbackExplanation,
  createPreDeploymentCheckFallbackExplanation,
  createTerraformErrorExplanationFallbackExplanation,
  createTerraformPreviewFallbackExplanation
} from "./aiLlmExplanationFallbacks.js";
import { createSummaryPayload, createSystemInstructions } from "./aiLlmExplanationPayloads.js";
import type { CreateLlmExplanation, LlmExplanationInput } from "./aiLlmExplanationTypes.js";
import {
  llmExplanationTextFormat,
  parseLlmExplanationText,
  validateLlmExplanation
} from "./aiLlmExplanationValidation.js";
import {
  createNormalizedAiCacheKey,
  estimateAiUsage,
  maskSecretsForAi
} from "./aiProviderSafety.js";

export type { CreateLlmExplanation, LlmExplanationInput } from "./aiLlmExplanationTypes.js";

const DEFAULT_OPENAI_MODEL = "gpt-5.5";
const DEFAULT_BEDROCK_MODEL_ID = "anthropic.claude-3-5-haiku-20241022-v1:0";
const OPENAI_TIMEOUT_MS = 10_000;
const OPENAI_MAX_RETRIES = 0;
const DEFAULT_AI_DAILY_CALL_LIMIT = 50;
const DEFAULT_AI_WINDOW_CALL_LIMIT = 10;
const DEFAULT_AI_WINDOW_MS = 60_000;

export type OpenAiParseRequest = {
  readonly model: string;
  readonly instructions: string;
  readonly input: string;
  readonly text: {
    readonly format: unknown;
  };
};

export type OpenAiParseResponse = {
  readonly output_parsed: LlmExplanation | null;
};

export type OpenAiResponsesClient = {
  readonly responses: {
    readonly parse: (request: OpenAiParseRequest) => Promise<OpenAiParseResponse>;
  };
};

export type CreateOpenAiExplanationOptions = {
  readonly client: OpenAiResponsesClient;
  readonly apiKey?: string | undefined;
  readonly model?: string | undefined;
};

export type OpenAiClientOptions = {
  readonly apiKey: string;
  readonly timeout: number;
  readonly maxRetries: number;
};

export type CreateConfiguredOpenAiExplanationOptions = {
  readonly apiKey?: string | undefined;
  readonly model?: string | undefined;
  readonly createClient?: ((options: OpenAiClientOptions) => OpenAiResponsesClient) | undefined;
};

// 서버 환경변수를 읽어 실제 OpenAI SDK client를 만들고, API key가 없으면 호출 전 fallback합니다.
export function createConfiguredOpenAiExplanation(options: CreateConfiguredOpenAiExplanationOptions = {}): CreateLlmExplanation {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;

  if (apiKey === undefined || apiKey.trim().length === 0) {
    return createFallbackOnlyLlmExplanation;
  }

  const createClient = options.createClient ?? createDefaultOpenAiResponsesClient;
  const client = createClient({
    apiKey,
    timeout: OPENAI_TIMEOUT_MS,
    maxRetries: OPENAI_MAX_RETRIES
  });

  return createOpenAiExplanation({
    client,
    apiKey,
    model: options.model ?? process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL
  });
}

// OpenAI 성공 경로를 route와 분리해 fake client와 실제 SDK client가 같은 계약을 쓰게 합니다.
export function createOpenAiExplanation(options: CreateOpenAiExplanationOptions): CreateLlmExplanation {
  return async (input) => {
    if (options.apiKey === undefined || options.apiKey.trim().length === 0) {
      return createFallbackExplanation(input, "missing_api_key");
    }

    try {
      const response = await options.client.responses.parse({
        model: options.model ?? DEFAULT_OPENAI_MODEL,
        instructions: createSystemInstructions(),
        input: JSON.stringify(createSummaryPayload(input)),
        text: {
          format: llmExplanationTextFormat
        }
      });

      return validateLlmExplanation(response.output_parsed, createFallbackExplanation(input, "invalid_response"));
    } catch (error) {
      return createFallbackExplanation(input, classifyOpenAiError(error));
    }
  };
}

// OpenAI 연결 전에도 route는 같은 LLM 설명 함수를 호출하고, 내부에서 fallback만 반환합니다.
export async function createFallbackOnlyLlmExplanation(input: LlmExplanationInput): Promise<LlmExplanation> {
  return createFallbackExplanation(input, "missing_api_key");
}

// 공식 SDK 인스턴스를 좁은 내부 interface로 감싸 테스트 fake와 같은 모양을 맞춥니다.
function createDefaultOpenAiResponsesClient(options: OpenAiClientOptions): OpenAiResponsesClient {
  const client = new OpenAI({
    apiKey: options.apiKey,
    timeout: options.timeout,
    maxRetries: options.maxRetries
  });

  return {
    responses: {
      parse: async (request) => {
        const response = await client.responses.parse({
          model: request.model,
          instructions: request.instructions,
          input: request.input,
          text: {
            format: llmExplanationTextFormat,
            verbosity: "low"
          },
          store: false
        });

        return { output_parsed: response.output_parsed };
      }
    }
  };
}

// target별 fallback builder를 한곳에서 고르게 해서 provider 실패 경로를 단순하게 유지합니다.
function createFallbackExplanation(input: LlmExplanationInput, fallbackReason: LlmExplanationFallbackReason): LlmExplanation {
  switch (input.target) {
    case "architecture_draft":
      return createArchitectureDraftFallbackExplanation(input.result, fallbackReason);
    case "design_simulation":
      return createDesignSimulationFallbackExplanation(input.result, fallbackReason);
    case "pre_deployment_check":
      return createPreDeploymentCheckFallbackExplanation(input.result, fallbackReason);
    case "terraform_error_explanation":
      return createTerraformErrorExplanationFallbackExplanation(input.result, fallbackReason);
    case "terraform_preview_explanation":
      return createTerraformPreviewFallbackExplanation(input.result, fallbackReason);
    case "architecture_patch_preview":
      return createArchitecturePatchPreviewFallbackExplanation(input.result, fallbackReason);
  }
}

// provider 원문 에러는 숨기고 API 응답에는 안전한 fallbackReason만 남깁니다.
function classifyOpenAiError(error: unknown): LlmExplanationFallbackReason {
  if (error instanceof Error && error.name === "APIConnectionTimeoutError") {
    return "timeout";
  }

  if (error instanceof Error && error.name === "RateLimitError") {
    return "rate_limited";
  }

  if (error instanceof Error && error.name === "BadRequestError") {
    return "invalid_request";
  }

  if (error instanceof Error && error.name === "AuthenticationError") {
    return "auth_error";
  }

  return "provider_error";
}

export type AiTextProviderRequest = {
  readonly target: LlmExplanationTarget;
  readonly instructions: string;
  readonly prompt: string;
  readonly payload: unknown;
};

export type AiTextProviderResponse = {
  readonly text: string;
  readonly outputCharacters?: number | undefined;
};

export type AiTextProvider = {
  readonly provider: Exclude<AiProvider, "amazon_transcribe" | "fallback">;
  readonly service: Extract<AiProviderService, "bedrock_runtime" | "amazon_q_business" | "openai_responses">;
  readonly model?: string | undefined;
  readonly generate: (request: AiTextProviderRequest) => Promise<AiTextProviderResponse>;
};

export type AiCreditPolicy = {
  readonly bedrock: boolean;
  readonly amazonQ: boolean;
  readonly transcribe: boolean;
  readonly billingMode: AiBillingMode;
};

export type AiProviderLimits = {
  readonly dailyCallLimit: number;
  readonly windowCallLimit: number;
  readonly windowMs: number;
};

export type AiProviderRegions = {
  readonly bedrockRegion: string;
  readonly amazonQRegion: string;
  readonly transcribeRegion: string;
};

export type CreateAiProviderBackedLlmExplanationOptions = {
  readonly bedrockProvider?: AiTextProvider | undefined;
  readonly amazonQProvider?: AiTextProvider | undefined;
  readonly openAiProvider?: AiTextProvider | undefined;
  readonly fallbackProvider?: CreateLlmExplanation | undefined;
  readonly creditPolicy?: AiCreditPolicy | undefined;
  readonly limits?: AiProviderLimits | undefined;
};

export type CreateConfiguredAiExplanationOptions = {
  readonly bedrockProvider?: AiTextProvider | undefined;
  readonly amazonQProvider?: AiTextProvider | undefined;
  readonly openAiProvider?: AiTextProvider | undefined;
  readonly creditPolicy?: AiCreditPolicy | undefined;
  readonly limits?: AiProviderLimits | undefined;
};

type ProviderCacheEntry = {
  readonly explanation: LlmExplanation;
};

type ProviderCallWindow = {
  readonly dayKey: string;
  dailyCount: number;
  readonly windowStartedAt: number;
  windowCount: number;
};

export function createConfiguredAiExplanation(
  options: CreateConfiguredAiExplanationOptions = {}
): CreateLlmExplanation {
  const regions = resolveAiProviderRegions(process.env);
  const bedrockProvider =
    options.bedrockProvider ??
    createBedrockTextProvider({
      region: regions.bedrockRegion,
      modelId: process.env.BEDROCK_MODEL_ID ?? DEFAULT_BEDROCK_MODEL_ID
    });
  const amazonQProvider =
    options.amazonQProvider ??
    createAmazonQBusinessTextProviderFromEnv({
      region: regions.amazonQRegion
    });

  return createAiProviderBackedLlmExplanation({
    bedrockProvider,
    amazonQProvider,
    openAiProvider: options.openAiProvider,
    creditPolicy: options.creditPolicy ?? readAiCreditPolicyFromEnv(),
    limits: options.limits ?? readAiProviderLimitsFromEnv()
  });
}

export function resolveAiProviderRegions(env: NodeJS.ProcessEnv): AiProviderRegions {
  const defaultRegion = readRegionEnv(env.AWS_REGION) ?? "ap-northeast-2";

  return {
    bedrockRegion: defaultRegion,
    amazonQRegion: readRegionEnv(env.AMAZON_Q_REGION) ?? defaultRegion,
    transcribeRegion: defaultRegion
  };
}

export function createAiProviderBackedLlmExplanation(
  options: CreateAiProviderBackedLlmExplanationOptions
): CreateLlmExplanation {
  const cache = new Map<string, ProviderCacheEntry>();
  const callWindows = new Map<AiProvider, ProviderCallWindow>();
  const creditPolicy = options.creditPolicy ?? readAiCreditPolicyFromEnv();
  const limits = options.limits ?? readAiProviderLimitsFromEnv();

  return async (input) => {
    let primaryProviderFallback: LlmExplanation | null = null;

    if (input.target === "terraform_error_explanation") {
      if (options.amazonQProvider === undefined) {
        return createFallbackExplanationWithProviderMetadata(
          input,
          resolveAmazonQUnavailableFallbackReason(creditPolicy),
          creditPolicy.billingMode,
          {
            provider: "amazon_q",
            service: "amazon_q_business"
          }
        );
      }

      const qResult = await tryProvider({
        provider: options.amazonQProvider,
        input,
        cache,
        callWindows,
        creditPolicy,
        limits
      });

      if (qResult !== null) {
        return qResult;
      }
    }

    const bedrockResult = await tryProvider({
      provider: options.bedrockProvider,
      input,
      cache,
      callWindows,
      creditPolicy,
      limits
    });

    if (bedrockResult !== null) {
      if (bedrockResult.fallbackUsed && primaryProviderFallback !== null) {
        return primaryProviderFallback;
      }

      return bedrockResult;
    }

    const openAiResult = await tryProvider({
      provider: options.openAiProvider,
      input,
      cache,
      callWindows,
      creditPolicy,
      limits
    });

    if (openAiResult !== null) {
      if (openAiResult.fallbackUsed && primaryProviderFallback !== null) {
        return primaryProviderFallback;
      }

      return openAiResult;
    }

    return createFallbackExplanationWithMetadata(
      input,
      resolveFallbackReasonForMissingProvider(input.target, creditPolicy),
      creditPolicy.billingMode
    );
  };
}

function createBedrockTextProvider(input: { readonly region: string; readonly modelId: string }): AiTextProvider {
  const client = new BedrockRuntimeClient({ region: input.region });

  return {
    provider: "bedrock",
    service: "bedrock_runtime",
    model: input.modelId,
    generate: async (request) => {
      const command = new ConverseCommand({
        modelId: input.modelId,
        system: [{ text: request.instructions }],
        messages: [
          {
            role: "user",
            content: [{ text: request.prompt }]
          }
        ],
        inferenceConfig: {
          maxTokens: 700,
          temperature: 0.2
        }
      });
      const response = await client.send(command);
      const text = extractBedrockText(response.output?.message?.content);

      return {
        text,
        outputCharacters: text.length
      };
    }
  };
}

function createAmazonQBusinessTextProviderFromEnv(input: { readonly region: string }): AiTextProvider | undefined {
  if (process.env.AMAZON_Q_ENABLED !== "true") {
    return undefined;
  }

  const applicationId = process.env.AMAZON_Q_APPLICATION_ID?.trim();
  const userId = process.env.AMAZON_Q_USER_ID?.trim();

  if (!applicationId) {
    return undefined;
  }

  return createAmazonQBusinessTextProvider({
    applicationId,
    userId: userId === "" ? undefined : userId,
    region: input.region
  });
}

type AmazonQBusinessChatClient = {
  readonly send: (command: ChatSyncCommand) => Promise<{ readonly systemMessage?: string | undefined }>;
};

export function createAmazonQBusinessTextProvider(input: {
  readonly applicationId: string;
  readonly userId?: string | undefined;
  readonly region: string;
  readonly client?: AmazonQBusinessChatClient | undefined;
}): AiTextProvider {
  const client = input.client ?? createDefaultAmazonQBusinessChatClient(input.region);

  return {
    provider: "amazon_q",
    service: "amazon_q_business",
    model: input.applicationId,
    generate: async (request) => {
      const command = new ChatSyncCommand({
        applicationId: input.applicationId,
        ...(input.userId ? { userId: input.userId } : {}),
        userMessage: request.prompt
      });
      const response = await client.send(command);
      const text = response.systemMessage ?? "";

      return {
        text,
        outputCharacters: text.length
      };
    }
  };
}

function createDefaultAmazonQBusinessChatClient(region: string): AmazonQBusinessChatClient {
  const client = new QBusinessClient({ region });

  return {
    send: (command) => client.send(command)
  };
}

async function tryProvider(input: {
  readonly provider?: AiTextProvider | undefined;
  readonly input: LlmExplanationInput;
  readonly cache: Map<string, ProviderCacheEntry>;
  readonly callWindows: Map<AiProvider, ProviderCallWindow>;
  readonly creditPolicy: AiCreditPolicy;
  readonly limits: AiProviderLimits;
}): Promise<LlmExplanation | null> {
  if (input.provider === undefined) {
    return null;
  }

  const creditFallbackReason = getCreditFallbackReason(input.provider.provider, input.creditPolicy);

  if (creditFallbackReason !== null) {
    if (
      input.input.target === "terraform_error_explanation" &&
      input.provider.provider === "amazon_q"
    ) {
      return createFallbackExplanationWithProviderMetadata(
        input.input,
        creditFallbackReason,
        input.creditPolicy.billingMode,
        {
          provider: input.provider.provider,
          service: input.provider.service,
          model: input.provider.model
        }
      );
    }

    return createFallbackExplanationWithMetadata(
      input.input,
      creditFallbackReason,
      input.creditPolicy.billingMode
    );
  }

  const payload = maskSecretsForAi(createSummaryPayload(input.input));
  const cacheKey = createNormalizedAiCacheKey({
    provider: input.provider.provider,
    model: input.provider.model,
    routeTarget: input.input.target,
    payload
  });
  const cached = input.cache.get(cacheKey);

  if (cached !== undefined) {
    return withProviderMetadata(cached.explanation, {
      provider: input.provider.provider,
      service: input.provider.service,
      model: input.provider.model,
      routeTarget: input.input.target,
      cacheHit: true,
      cacheKey,
      billingMode: input.creditPolicy.billingMode,
      payload
    });
  }

  const rateLimitReason = reserveProviderCall(input.provider.provider, input.callWindows, input.limits);

  if (rateLimitReason !== null) {
    return createFallbackExplanationWithMetadata(input.input, rateLimitReason, input.creditPolicy.billingMode);
  }

  try {
    const prompt = createProviderPrompt(input.input.target, payload);
    const response = await input.provider.generate({
      target: input.input.target,
      instructions: createSystemInstructions(),
      prompt,
      payload
    });
    const fallback = createFallbackExplanation(input.input, "invalid_response");
    const explanation = parseProviderExplanationText({
      fallback,
      input: input.input,
      provider: input.provider.provider,
      text: response.text
    });
    const explanationWithMetadata = withProviderMetadata(explanation, {
      provider: input.provider.provider,
      service: input.provider.service,
      model: input.provider.model,
      routeTarget: input.input.target,
      cacheHit: false,
      cacheKey,
      billingMode: input.creditPolicy.billingMode,
      payload,
      outputCharacters: response.outputCharacters ?? response.text.length
    });

    input.cache.set(cacheKey, {
      explanation: explanationWithMetadata
    });

    return explanationWithMetadata;
  } catch (error) {
    return createFallbackExplanationWithMetadata(
      input.input,
      classifyProviderError(error),
      input.creditPolicy.billingMode
    );
  }
}

function createProviderPrompt(target: LlmExplanationTarget, payload: unknown): string {
  return [
    "Return JSON only. Do not wrap the response in markdown.",
    "The JSON shape must be:",
    '{"target":"TARGET","summary":"short summary","highlights":["item"],"nextActions":["item"],"fallbackUsed":false}',
    `TARGET must be "${target}".`,
    target === "architecture_patch_preview"
      ? "This is a preview only. Do not claim the Architecture Board changed."
      : "Use the deterministic result as the source of truth. Do not invent resources or guarantees.",
    "Provider input:",
    JSON.stringify(payload)
  ].join("\n");
}

function parseProviderExplanationText(input: {
  readonly fallback: LlmExplanation;
  readonly input: LlmExplanationInput;
  readonly provider: AiProvider;
  readonly text: string;
}): LlmExplanation {
  const parsed = parseLlmExplanationText(input.text, input.fallback);

  if (!parsed.fallbackUsed || parsed.fallbackReason !== "invalid_response") {
    return parsed;
  }

  if (input.provider === "amazon_q" && input.input.target === "terraform_error_explanation") {
    return createAmazonQTerraformPlainTextExplanation(input.text, input.fallback);
  }

  return parsed;
}

function createAmazonQTerraformPlainTextExplanation(
  text: string,
  fallback: LlmExplanation
): LlmExplanation {
  const items = normalizeProviderTextItems(text);
  const summary = items[0] ?? "";

  if (summary.length === 0) {
    return fallback;
  }

  return {
    target: "terraform_error_explanation",
    summary: trimProviderText(summary, 300),
    highlights: items.slice(1, 4).map((item) => trimProviderText(item, 120)),
    nextActions: fallback.nextActions.slice(0, 5),
    fallbackUsed: false
  };
}

function normalizeProviderTextItems(text: string): string[] {
  return text
    .split(/\r?\n+/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim())
    .filter((line) => line.length > 0 && !/^```/.test(line));
}

function trimProviderText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return value.slice(0, maxLength).trim();
}

function createFallbackExplanationWithMetadata(
  input: LlmExplanationInput,
  fallbackReason: LlmExplanationFallbackReason,
  billingMode: AiBillingMode
): LlmExplanation {
  return createFallbackExplanationWithProviderMetadata(input, fallbackReason, billingMode, {
    provider: "fallback",
    service: "rule_fallback"
  });
}

function createFallbackExplanationWithProviderMetadata(
  input: LlmExplanationInput,
  fallbackReason: LlmExplanationFallbackReason,
  billingMode: AiBillingMode,
  provider: {
    readonly provider: AiProvider;
    readonly service: AiProviderService;
    readonly model?: string | undefined;
  }
): LlmExplanation {
  const payload = maskSecretsForAi(createSummaryPayload(input));

  return withProviderMetadata(createFallbackExplanation(input, fallbackReason), {
    provider: provider.provider,
    service: provider.service,
    model: provider.model,
    routeTarget: input.target,
    cacheHit: false,
    cacheKey: createNormalizedAiCacheKey({
      provider: provider.provider,
      model: provider.model,
      routeTarget: input.target,
      payload
    }),
    billingMode,
    payload
  });
}

function withProviderMetadata(
  explanation: LlmExplanation,
  input: {
    readonly provider: AiProvider;
    readonly service: AiProviderService;
    readonly model?: string | undefined;
    readonly routeTarget: string;
    readonly cacheHit: boolean;
    readonly cacheKey: string;
    readonly billingMode: AiBillingMode;
    readonly payload: unknown;
    readonly outputCharacters?: number | undefined;
  }
): LlmExplanation {
  return {
    ...explanation,
    providerMetadata: createProviderMetadata(input)
  };
}

function createProviderMetadata(input: {
  readonly provider: AiProvider;
  readonly service: AiProviderService;
  readonly model?: string | undefined;
  readonly routeTarget: string;
  readonly cacheHit: boolean;
  readonly cacheKey: string;
  readonly billingMode: AiBillingMode;
  readonly payload: unknown;
  readonly outputCharacters?: number | undefined;
}): AiProviderMetadata {
  return {
    provider: input.provider,
    service: input.service,
    model: input.model,
    routeTarget: input.routeTarget,
    cacheHit: input.cacheHit,
    cacheKey: input.cacheKey,
    estimatedUsage: estimateAiUsage(input.payload, input.outputCharacters),
    billingMode: input.billingMode,
    generatedAt: new Date().toISOString()
  };
}

function getCreditFallbackReason(provider: AiProvider, creditPolicy: AiCreditPolicy): LlmExplanationFallbackReason | null {
  if (provider === "openai") {
    return null;
  }

  if (creditPolicy.billingMode !== "aws_credit_only") {
    return "credit_not_confirmed";
  }

  if (provider === "bedrock" && !creditPolicy.bedrock) {
    return "credit_not_confirmed";
  }

  if (provider === "amazon_q" && !creditPolicy.amazonQ) {
    return "credit_not_confirmed";
  }

  return null;
}

function resolveAmazonQUnavailableFallbackReason(
  creditPolicy: AiCreditPolicy
): LlmExplanationFallbackReason {
  if (creditPolicy.billingMode !== "aws_credit_only" || !creditPolicy.amazonQ) {
    return "credit_not_confirmed";
  }

  return "provider_not_configured";
}

function reserveProviderCall(
  provider: AiProvider,
  callWindows: Map<AiProvider, ProviderCallWindow>,
  limits: AiProviderLimits
): LlmExplanationFallbackReason | null {
  const now = Date.now();
  const dayKey = new Date(now).toISOString().slice(0, 10);
  const existing = callWindows.get(provider);

  if (existing === undefined || existing.dayKey !== dayKey) {
    callWindows.set(provider, {
      dayKey,
      dailyCount: 1,
      windowStartedAt: now,
      windowCount: 1
    });
    return null;
  }

  if (existing.dailyCount >= limits.dailyCallLimit) {
    return "daily_limit_exceeded";
  }

  if (now - existing.windowStartedAt >= limits.windowMs) {
    callWindows.set(provider, {
      dayKey,
      dailyCount: existing.dailyCount + 1,
      windowStartedAt: now,
      windowCount: 1
    });
    return null;
  }

  if (existing.windowCount >= limits.windowCallLimit) {
    return "rate_limited";
  }

  existing.dailyCount += 1;
  existing.windowCount += 1;
  return null;
}

function resolveFallbackReasonForMissingProvider(
  target: LlmExplanationTarget,
  creditPolicy: AiCreditPolicy
): LlmExplanationFallbackReason {
  if (
    (target === "terraform_error_explanation" && !creditPolicy.amazonQ && !creditPolicy.bedrock) ||
    (target !== "terraform_error_explanation" && !creditPolicy.bedrock)
  ) {
    return "credit_not_confirmed";
  }

  return "provider_not_configured";
}

function classifyProviderError(error: unknown): LlmExplanationFallbackReason {
  if (error instanceof Error && /timeout/i.test(error.name)) {
    return "timeout";
  }

  if (error instanceof Error && /throttl|rate/i.test(error.name)) {
    return "rate_limited";
  }

  if (error instanceof Error && /auth|credential|accessdenied/i.test(error.name)) {
    return "auth_error";
  }

  if (error instanceof Error && /validation|badrequest|invalid/i.test(error.name)) {
    return "invalid_request";
  }

  return "provider_error";
}

function readAiCreditPolicyFromEnv(): AiCreditPolicy {
  return {
    bedrock: process.env.BEDROCK_CREDIT_CONFIRMED === "true",
    amazonQ: process.env.AMAZON_Q_CREDIT_CONFIRMED === "true",
    transcribe: process.env.TRANSCRIBE_CREDIT_CONFIRMED === "true",
    billingMode: readBillingMode()
  };
}

function readBillingMode(): AiBillingMode {
  switch (process.env.AI_BILLING_MODE) {
    case "aws_credit_only":
      return "aws_credit_only";
    case "standard":
      return "standard";
    case "disabled":
      return "disabled";
    default:
      return "disabled";
  }
}

function readAiProviderLimitsFromEnv(): AiProviderLimits {
  return {
    dailyCallLimit: readPositiveIntEnv("AI_DAILY_CALL_LIMIT", DEFAULT_AI_DAILY_CALL_LIMIT),
    windowCallLimit: readPositiveIntEnv("AI_RATE_LIMIT_PER_MINUTE", DEFAULT_AI_WINDOW_CALL_LIMIT),
    windowMs: DEFAULT_AI_WINDOW_MS
  };
}

function readPositiveIntEnv(key: string, fallback: number): number {
  const value = Number.parseInt(process.env[key] ?? "", 10);

  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readRegionEnv(value: string | undefined): string | undefined {
  const trimmedValue = value?.trim();

  return trimmedValue === undefined || trimmedValue.length === 0 ? undefined : trimmedValue;
}

function extractBedrockText(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((item) => {
      if (typeof item !== "object" || item === null || !("text" in item)) {
        return "";
      }

      const text = (item as { readonly text?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .filter((text) => text.length > 0)
    .join("\n");
}
