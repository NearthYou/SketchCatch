import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { LlmEnhancement } from "@sketchcatch/types";

const SUMMARY_MAX_LENGTH = 300;
const ITEM_MAX_LENGTH = 120;
const ITEM_MAX_COUNT = 5;
const BLOCKED_GUARANTEE_PHRASES = ["배포 가능 보장", "비용 없음", "보안 안전"] as const;
const llmEnhancementSchema: z.ZodType<LlmEnhancement> = z.object({
  target: z.enum(["architecture_draft", "design_simulation", "pre_deployment_check", "terraform_error_explanation"]),
  summary: z.string(),
  highlights: z.array(z.string()),
  nextActions: z.array(z.string()),
  fallbackUsed: z.literal(false)
});

export const llmEnhancementTextFormat = zodTextFormat(llmEnhancementSchema, "llm_enhancement");

type ValidationResult<T> = {
  readonly value: T;
  readonly fallbackUsed: boolean;
};

// OpenAI 응답은 field별로 다시 확인해 깨진 부분만 rule 기반 fallback으로 바꿉니다.
export function validateLlmEnhancement(value: LlmEnhancement | null, fallback: LlmEnhancement): LlmEnhancement {
  const parsed = llmEnhancementSchema.safeParse(value);

  if (!parsed.success) {
    return fallback;
  }

  if (parsed.data.target !== fallback.target) {
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
