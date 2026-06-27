import OpenAI from "openai";
import type { LlmEnhancement, LlmEnhancementFallbackReason } from "@sketchcatch/types";
import {
  createArchitectureDraftFallbackEnhancement,
  createDesignSimulationFallbackEnhancement,
  createPreDeploymentCheckFallbackEnhancement,
  createTerraformErrorExplanationFallbackEnhancement
} from "./aiLlmEnhancementFallbacks.js";
import { createSummaryPayload, createSystemInstructions } from "./aiLlmEnhancementPayloads.js";
import type { CreateLlmEnhancement, LlmEnhancementInput } from "./aiLlmEnhancementTypes.js";
import { llmEnhancementTextFormat, validateLlmEnhancement } from "./aiLlmEnhancementValidation.js";

export type { CreateLlmEnhancement, LlmEnhancementInput } from "./aiLlmEnhancementTypes.js";

const DEFAULT_OPENAI_MODEL = "gpt-5.5";
const OPENAI_TIMEOUT_MS = 10_000;
const OPENAI_MAX_RETRIES = 0;

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
        input: JSON.stringify(createSummaryPayload(input)),
        text: {
          format: llmEnhancementTextFormat
        }
      });

      return validateLlmEnhancement(response.output_parsed, createFallbackEnhancement(input, "invalid_response"));
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
  switch (input.target) {
    case "architecture_draft":
      return createArchitectureDraftFallbackEnhancement(input.result, fallbackReason);
    case "design_simulation":
      return createDesignSimulationFallbackEnhancement(input.result, fallbackReason);
    case "pre_deployment_check":
      return createPreDeploymentCheckFallbackEnhancement(input.result, fallbackReason);
    case "terraform_error_explanation":
      return createTerraformErrorExplanationFallbackEnhancement(input.result, fallbackReason);
  }
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
