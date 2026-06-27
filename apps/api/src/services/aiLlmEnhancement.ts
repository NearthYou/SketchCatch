import type { DesignSimulationResult, LlmEnhancement } from "@sketchcatch/types";
import { createDesignSimulationFallbackEnhancement } from "./aiLlmEnhancementFallbacks.js";

export type LlmEnhancementInput = {
  readonly target: "design_simulation";
  readonly result: DesignSimulationResult;
};

export type CreateLlmEnhancement = (input: LlmEnhancementInput) => Promise<LlmEnhancement>;

// OpenAI 연결 전에도 route는 같은 LLM 보강 함수를 호출하고, 내부에서 fallback만 반환합니다.
export async function createFallbackOnlyLlmEnhancement(input: LlmEnhancementInput): Promise<LlmEnhancement> {
  return createDesignSimulationFallbackEnhancement(input.result, "missing_api_key");
}
