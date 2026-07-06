import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { LlmExplanation } from "@sketchcatch/types";

const SUMMARY_MAX_LENGTH = 300;
const ITEM_MAX_LENGTH = 120;
const ITEM_MAX_COUNT = 5;
const CODE_SNIPPET_MAX_LENGTH = 8_000;
const CONCLUSION_MAX_LENGTH = 600;
const BLOCKED_GUARANTEE_PHRASES = ["배포 가능 보장", "비용 없음", "보안 안전"] as const;
const llmCodeSuggestionSchema = z.object({
  currentCode: z.string(),
  suggestedCode: z.string(),
  rationale: z.string()
});
type LlmExplanationCandidate = Omit<LlmExplanation, "codeSuggestion" | "wellArchitectedConclusion"> & {
  readonly codeSuggestion: LlmExplanation["codeSuggestion"] | null;
  readonly wellArchitectedConclusion: string | null;
};
const llmExplanationSchema: z.ZodType<LlmExplanationCandidate> = z.object({
  target: z.enum([
    "architecture_draft",
    "design_simulation",
    "pre_deployment_check",
    "terraform_error_explanation",
    "terraform_preview_explanation",
    "architecture_patch_preview"
  ]),
  summary: z.string(),
  highlights: z.array(z.string()),
  nextActions: z.array(z.string()),
  fallbackUsed: z.literal(false),
  codeSuggestion: llmCodeSuggestionSchema.nullable(),
  wellArchitectedConclusion: z.string().nullable()
});

export const llmExplanationTextFormat = zodTextFormat(llmExplanationSchema, "llm_explanation");

type ValidationResult<T> = {
  readonly value: T;
  readonly fallbackUsed: boolean;
};

type JsonRecord = Record<string, unknown>;

// OpenAI 응답은 field별로 다시 확인해 깨진 부분만 rule 기반 fallback으로 바꿉니다.
export function validateLlmExplanation(value: LlmExplanation | null, fallback: LlmExplanation): LlmExplanation {
  const parsed = llmExplanationSchema.safeParse(normalizeLlmExplanationCandidate(value));

  if (!parsed.success) {
    return fallback;
  }

  if (parsed.data.target !== fallback.target) {
    return fallback;
  }

  const summary = validateSummary(parsed.data.summary, fallback.summary);
  const highlights = validateTextItems(parsed.data.highlights, fallback.highlights);
  const nextActions = validateTextItems(parsed.data.nextActions, fallback.nextActions);
  const codeSuggestion = validateCodeSuggestion(parsed.data.codeSuggestion ?? undefined);
  const wellArchitectedConclusion = validateOptionalLongText(parsed.data.wellArchitectedConclusion ?? undefined);
  const fallbackUsed = summary.fallbackUsed || highlights.fallbackUsed || nextActions.fallbackUsed;

  if (!fallbackUsed) {
    return {
      target: parsed.data.target,
      summary: summary.value,
      highlights: highlights.value,
      nextActions: nextActions.value,
      fallbackUsed: false,
      ...(codeSuggestion === undefined ? {} : { codeSuggestion }),
      ...(wellArchitectedConclusion === undefined ? {} : { wellArchitectedConclusion })
    };
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

export function parseLlmExplanationText(value: string, fallback: LlmExplanation): LlmExplanation {
  const parsed = parseJsonObject(value);

  if (parsed === null) {
    return fallback;
  }

  return validateLlmExplanation(parsed as LlmExplanation, fallback);
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
    fallbackUsed: false
  };
}

// list 필드는 빈 항목과 긴 항목을 제거하고, 전부 사라질 때만 field fallback을 사용합니다.
function validateTextItems(values: readonly string[], fallbackValues: string[]): ValidationResult<string[]> {
  let blockedItemFound = false;
  const normalized: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
      continue;
    }

    if (containsBlockedGuarantee(trimmed)) {
      blockedItemFound = true;
      continue;
    }

    normalized.push(trimTextItem(trimmed));

    if (normalized.length >= ITEM_MAX_COUNT) {
      break;
    }
  }

  if (normalized.length === 0) {
    return {
      value: fallbackValues,
      fallbackUsed: true
    };
  }

  return {
    value: normalized,
    fallbackUsed: blockedItemFound
  };
}

function validateCodeSuggestion(value: LlmExplanation["codeSuggestion"]): LlmExplanation["codeSuggestion"] {
  if (value === undefined) {
    return undefined;
  }

  const currentCode = value.currentCode;
  const suggestedCode = value.suggestedCode;
  const rationale = trimTextItem(value.rationale.trim());

  if (
    currentCode.trim().length === 0 ||
    suggestedCode.trim().length === 0 ||
    currentCode === suggestedCode ||
    currentCode.length > CODE_SNIPPET_MAX_LENGTH ||
    suggestedCode.length > CODE_SNIPPET_MAX_LENGTH ||
    rationale.length === 0 ||
    containsBlockedGuarantee(rationale)
  ) {
    return undefined;
  }

  return {
    currentCode,
    suggestedCode,
    rationale
  };
}

function validateOptionalLongText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();

  if (
    normalized.length === 0 ||
    normalized.length > CONCLUSION_MAX_LENGTH ||
    containsBlockedGuarantee(normalized)
  ) {
    return undefined;
  }

  return normalized;
}

function trimTextItem(value: string): string {
  if (value.length <= ITEM_MAX_LENGTH) {
    return value;
  }

  return value.slice(0, ITEM_MAX_LENGTH).trim();
}

// LLM이 비용, 보안, 배포 가능성을 보장하는 문장은 MVP에서 그대로 노출하지 않습니다.
function containsBlockedGuarantee(value: string): boolean {
  const normalizedValue = value.toLowerCase();
  const englishBlockedPhrases = ["deployment is guaranteed", "no cost", "security is guaranteed"];

  return (
    BLOCKED_GUARANTEE_PHRASES.some((phrase) => value.includes(phrase)) ||
    englishBlockedPhrases.some((phrase) => normalizedValue.includes(phrase))
  );
}

function parseJsonObject(value: string): unknown | null {
  const trimmed = value.trim();

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const firstBraceIndex = trimmed.indexOf("{");
    const lastBraceIndex = trimmed.lastIndexOf("}");

    if (firstBraceIndex < 0 || lastBraceIndex <= firstBraceIndex) {
      return null;
    }

    try {
      return JSON.parse(trimmed.slice(firstBraceIndex, lastBraceIndex + 1)) as unknown;
    } catch {
      return null;
    }
  }
}

function normalizeLlmExplanationCandidate(value: unknown): unknown {
  if (!isJsonRecord(value)) {
    return value;
  }

  const target = typeof value.target === "string" ? value.target : undefined;
  const summary = typeof value.summary === "string" ? value.summary : undefined;
  const highlights = normalizeTextListCandidate(value.highlights);
  const nextActions = normalizeTextListCandidate(
    value.nextActions ?? value.next_actions ?? value.nextSteps ?? value.next_steps
  );
  const codeSuggestion = normalizeCodeSuggestionCandidate(
    value.codeSuggestion ?? value.code_suggestion ?? value.fixSuggestion ?? value.fix_suggestion
  );
  const wellArchitectedConclusion =
    typeof (value.wellArchitectedConclusion ?? value.well_architected_conclusion) === "string"
      ? (value.wellArchitectedConclusion ?? value.well_architected_conclusion)
      : undefined;

  if (target === undefined || summary === undefined || highlights.length === 0 || nextActions.length === 0) {
    return value;
  }

  return {
    target,
    summary,
    highlights,
    nextActions,
    fallbackUsed: false,
    codeSuggestion: codeSuggestion ?? null,
    wellArchitectedConclusion: wellArchitectedConclusion ?? null
  };
}

function normalizeCodeSuggestionCandidate(value: unknown): LlmExplanation["codeSuggestion"] {
  if (!isJsonRecord(value)) {
    return undefined;
  }

  const currentCode = value.currentCode ?? value.current_code ?? value.originalCode ?? value.original_code;
  const suggestedCode =
    value.suggestedCode ?? value.suggested_code ?? value.nextCode ?? value.next_code ?? value.replacementCode;
  const rationale = value.rationale ?? value.reason ?? value.explanation;

  if (typeof currentCode !== "string" || typeof suggestedCode !== "string" || typeof rationale !== "string") {
    return undefined;
  }

  return {
    currentCode,
    suggestedCode,
    rationale
  };
}

function normalizeTextListCandidate(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  if (typeof value === "string") {
    return [value];
  }

  return [];
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
