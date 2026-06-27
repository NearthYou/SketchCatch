import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { DesignSimulationResult, LlmEnhancement } from "@sketchcatch/types";
import { createDesignSimulationFallbackEnhancement } from "./aiLlmEnhancementFallbacks.js";

const DEFAULT_OPENAI_MODEL = "gpt-5.5";
const OPENAI_TIMEOUT_MS = 10_000;
const OPENAI_MAX_RETRIES = 0;
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

    const response = await options.client.responses.parse({
      model: options.model ?? DEFAULT_OPENAI_MODEL,
      instructions: createSystemInstructions(),
      input: JSON.stringify(createDesignSimulationSummaryPayload(input.result)),
      text: {
        format: llmEnhancementTextFormat
      }
    });

    return response.output_parsed ?? createFallbackEnhancement(input, "invalid_response");
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
function createFallbackEnhancement(input: LlmEnhancementInput, fallbackReason: "missing_api_key" | "invalid_response"): LlmEnhancement {
  return createDesignSimulationFallbackEnhancement(input.result, fallbackReason);
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
