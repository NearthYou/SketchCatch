import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { DesignSimulationResult, LlmEnhancement, LlmEnhancementFallbackReason } from "@sketchcatch/types";
import { createDesignSimulationFallbackEnhancement } from "./aiLlmEnhancementFallbacks.js";

const DEFAULT_OPENAI_MODEL = "gpt-5.5";
const OPENAI_TIMEOUT_MS = 10_000;
const OPENAI_MAX_RETRIES = 0;
const SUMMARY_MAX_LENGTH = 300;
const ITEM_MAX_LENGTH = 120;
const ITEM_MAX_COUNT = 5;
const BLOCKED_GUARANTEE_PHRASES = ["배포 가능 보장", "비용 없음", "보안 안전"] as const;
const llmEnhancementSchema: z.ZodType<LlmEnhancement> = z.object({
  target: z.literal("design_simulation"),
  summary: z.string(),
  highlights: z.array(z.string()),
  nextActions: z.array(z.string()),
  fallbackUsed: z.literal(false)
});
const llmEnhancementTextFormat = zodTextFormat(llmEnhancementSchema, "llm_enhancement");

export type LlmEnhancementInput = {
  readonly target: "design_simulation";
  readonly result: DesignSimulationResult;
};

export type CreateLlmEnhancement = (input: LlmEnhancementInput) => Promise<LlmEnhancement>;

export type OpenAiParseRequest = {
  readonly model: string;
  readonly instructions: string;
  readonly input: string;
  readonly text: {
    readonly format: unknown;
  };
};

export type OpenAiParseResponse = {
  readonly output_parsed: LlmEnhancement | null;
};

export type OpenAiResponsesClient = {
  readonly responses: {
    readonly parse: (request: OpenAiParseRequest) => Promise<OpenAiParseResponse>;
  };
};

export type CreateOpenAiEnhancementOptions = {
  readonly client: OpenAiResponsesClient;
  readonly apiKey?: string | undefined;
  readonly model?: string | undefined;
};

export type OpenAiClientOptions = {
  readonly apiKey: string;
  readonly timeout: number;
  readonly maxRetries: number;
};

export type CreateConfiguredOpenAiEnhancementOptions = {
  readonly apiKey?: string | undefined;
  readonly model?: string | undefined;
  readonly createClient?: ((options: OpenAiClientOptions) => OpenAiResponsesClient) | undefined;
};

type ValidationResult<T> = {
  readonly value: T;
  readonly fallbackUsed: boolean;
};

// 서버 환경변수를 읽어 실제 OpenAI SDK client를 만들고, API key가 없으면 호출 전 fallback합니다.
export function createConfiguredOpenAiEnhancement(options: CreateConfiguredOpenAiEnhancementOptions = {}): CreateLlmEnhancement {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;

  if (apiKey === undefined || apiKey.trim().length === 0) {
    return createFallbackOnlyLlmEnhancement;
  }

  const createClient = options.createClient ?? createDefaultOpenAiResponsesClient;
  const client = createClient({
    apiKey,
    timeout: OPENAI_TIMEOUT_MS,
    maxRetries: OPENAI_MAX_RETRIES
  });

  return createOpenAiEnhancement({
    client,
    apiKey,
    model: options.model ?? process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL
  });
}

// OpenAI 성공 경로를 route와 분리해 fake client와 실제 SDK client가 같은 계약을 쓰게 합니다.
export function createOpenAiEnhancement(options: CreateOpenAiEnhancementOptions): CreateLlmEnhancement {
  return async (input) => {
    if (options.apiKey === undefined || options.apiKey.trim().length === 0) {
      return createFallbackEnhancement(input, "missing_api_key");
    }

    try {
      const response = await options.client.responses.parse({
        model: options.model ?? DEFAULT_OPENAI_MODEL,
        instructions: createSystemInstructions(),
        input: JSON.stringify(createDesignSimulationSummaryPayload(input.result)),
        text: {
          format: llmEnhancementTextFormat
        }
      });

      return validateLlmEnhancement(input, response.output_parsed);
    } catch (error) {
      return createFallbackEnhancement(input, classifyOpenAiError(error));
    }
  };
}

// OpenAI 연결 전에도 route는 같은 LLM 보강 함수를 호출하고, 내부에서 fallback만 반환합니다.
export async function createFallbackOnlyLlmEnhancement(input: LlmEnhancementInput): Promise<LlmEnhancement> {
  return createFallbackEnhancement(input, "missing_api_key");
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
            format: llmEnhancementTextFormat,
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
function createFallbackEnhancement(input: LlmEnhancementInput, fallbackReason: LlmEnhancementFallbackReason): LlmEnhancement {
  return createDesignSimulationFallbackEnhancement(input.result, fallbackReason);
}

// OpenAI 응답은 field별로 다시 확인해 깨진 부분만 rule 기반 fallback으로 바꿉니다.
function validateLlmEnhancement(input: LlmEnhancementInput, value: LlmEnhancement | null): LlmEnhancement {
  const fallback = createFallbackEnhancement(input, "invalid_response");
  const parsed = llmEnhancementSchema.safeParse(value);

  if (!parsed.success) {
    return fallback;
  }

  const summary = validateSummary(parsed.data.summary, fallback.summary);
  const highlights = validateTextItems(parsed.data.highlights, fallback.highlights);
  const nextActions = validateTextItems(parsed.data.nextActions, fallback.nextActions);
  const fallbackUsed = summary.fallbackUsed || highlights.fallbackUsed || nextActions.fallbackUsed;

  if (!fallbackUsed) {
    return parsed.data;
  }

  return {
    target: parsed.data.target,
    summary: summary.value,
    highlights: highlights.value,
    nextActions: nextActions.value,
    fallbackUsed: true,
    fallbackReason: "invalid_response"
  };
}

// summary는 짧고 보장 문장이 없을 때만 OpenAI 값을 그대로 사용합니다.
function validateSummary(value: string, fallbackValue: string): ValidationResult<string> {
  const normalized = value.trim();

  if (normalized.length === 0 || normalized.length > SUMMARY_MAX_LENGTH || containsBlockedGuarantee(normalized)) {
    return {
      value: fallbackValue,
      fallbackUsed: true
    };
  }

  return {
    value: normalized,
    fallbackUsed: normalized !== value
  };
}

// list 필드는 빈 항목과 긴 항목을 제거하고, 전부 사라질 때만 field fallback을 사용합니다.
function validateTextItems(values: readonly string[], fallbackValues: string[]): ValidationResult<string[]> {
  const normalized = values
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && value.length <= ITEM_MAX_LENGTH && !containsBlockedGuarantee(value))
    .slice(0, ITEM_MAX_COUNT);

  if (normalized.length === 0) {
    return {
      value: fallbackValues,
      fallbackUsed: true
    };
  }

  return {
    value: normalized,
    fallbackUsed: normalized.length !== values.length || normalized.some((value, index) => value !== values[index])
  };
}

// LLM이 비용, 보안, 배포 가능성을 보장하는 문장은 MVP에서 그대로 노출하지 않습니다.
function containsBlockedGuarantee(value: string): boolean {
  return BLOCKED_GUARANTEE_PHRASES.some((phrase) => value.includes(phrase));
}

// provider 원문 에러는 숨기고 API 응답에는 안전한 fallbackReason만 남깁니다.
function classifyOpenAiError(error: unknown): LlmEnhancementFallbackReason {
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

// schema는 Structured Outputs에 맡기고, prompt에는 설명 기준과 금지 기준만 남깁니다.
function createSystemInstructions(): string {
  return [
    "Design Simulation 결과를 쉬운 한국어로 보강하세요.",
    "어려운 클라우드 용어는 필요할 때만 쓰고 짧게 설명하세요.",
    "배포 가능, 비용 없음, 보안 안전을 보장하지 마세요.",
    "summary, highlights, nextActions는 사용자가 다음 행동을 고르기 쉽게 작성하세요."
  ].join("\n");
}

// LLM 보강에 필요한 Resource 흐름과 위험 요약만 남겨 payload를 작게 유지합니다.
function createDesignSimulationSummaryPayload(result: DesignSimulationResult): {
  readonly target: "design_simulation";
  readonly summary: string;
  readonly requestFlow: readonly string[];
  readonly bottlenecks: readonly string[];
  readonly failureScenarios: readonly string[];
  readonly costPressure: readonly string[];
  readonly recommendations: readonly string[];
} {
  return {
    target: "design_simulation",
    summary: result.summary,
    requestFlow: result.requestFlow.map((step) => step.description),
    bottlenecks: result.bottlenecks.map((bottleneck) => bottleneck.title),
    failureScenarios: result.failureScenarios.map((scenario) => scenario.title),
    costPressure: result.costPressure,
    recommendations: result.recommendations
  };
}
