import type { DesignSimulationResult, LlmEnhancement } from "@sketchcatch/types";
import { createDesignSimulationFallbackEnhancement } from "./aiLlmEnhancementFallbacks.js";

const DEFAULT_OPENAI_MODEL = "gpt-5.5";

export type LlmEnhancementInput = {
  readonly target: "design_simulation";
  readonly result: DesignSimulationResult;
};

export type CreateLlmEnhancement = (input: LlmEnhancementInput) => Promise<LlmEnhancement>;

export type OpenAiParseRequest = {
  readonly model: string;
  readonly input: readonly OpenAiPromptMessage[];
  readonly text: {
    readonly format: unknown;
  };
};

export type OpenAiPromptMessage = {
  readonly role: "system" | "user";
  readonly content: string;
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

// OpenAI 성공 경로를 route와 분리해 fake client와 실제 SDK client가 같은 계약을 쓰게 합니다.
export function createOpenAiEnhancement(options: CreateOpenAiEnhancementOptions): CreateLlmEnhancement {
  return async (input) => {
    if (options.apiKey === undefined || options.apiKey.trim().length === 0) {
      return createFallbackEnhancement(input, "missing_api_key");
    }

    const response = await options.client.responses.parse({
      model: options.model ?? DEFAULT_OPENAI_MODEL,
      input: createPromptMessages(input),
      text: {
        format: "llm_enhancement"
      }
    });

    return response.output_parsed ?? createFallbackEnhancement(input, "invalid_response");
  };
}

// OpenAI 연결 전에도 route는 같은 LLM 보강 함수를 호출하고, 내부에서 fallback만 반환합니다.
export async function createFallbackOnlyLlmEnhancement(input: LlmEnhancementInput): Promise<LlmEnhancement> {
  return createFallbackEnhancement(input, "missing_api_key");
}

// target별 fallback builder를 한곳에서 고르게 해서 provider 실패 경로를 단순하게 유지합니다.
function createFallbackEnhancement(input: LlmEnhancementInput, fallbackReason: "missing_api_key" | "invalid_response"): LlmEnhancement {
  return createDesignSimulationFallbackEnhancement(input.result, fallbackReason);
}

// OpenAI에는 원본 요청 전체가 아니라 Design Simulation 결과 요약만 보냅니다.
function createPromptMessages(input: LlmEnhancementInput): readonly OpenAiPromptMessage[] {
  return [
    {
      role: "system",
      content: "Design Simulation 결과를 쉬운 한국어 summary, highlights, nextActions로 보강하세요."
    },
    {
      role: "user",
      content: JSON.stringify(createDesignSimulationSummaryPayload(input.result))
    }
  ];
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
