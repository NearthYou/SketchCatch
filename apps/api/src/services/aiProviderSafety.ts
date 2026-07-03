import { createHash } from "node:crypto";
import type { AiProvider, LlmExplanationTarget } from "@sketchcatch/types";

export type TerraformErrorSanitizationInput = {
  readonly stage: string;
  readonly rawMessage: string;
  readonly relatedResourceId?: string | undefined;
};

export type SanitizedTerraformErrorForAi = {
  readonly stage: string;
  readonly sanitizedMessage: string;
  readonly relatedResourceId: string | null;
};

export type NormalizedAiCacheKeyInput = {
  readonly provider: AiProvider;
  readonly model?: string | undefined;
  readonly routeTarget: LlmExplanationTarget | string;
  readonly payload: unknown;
};

const SECRET_KEY_PATTERN = /(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|secret[_-]?key|private[_-]?key|authorization|cookie|database[_-]?url)/i;
const AWS_ACCESS_KEY_ID_PATTERN = /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g;
const AWS_ACCOUNT_ID_PATTERN = /\b\d{12}\b/g;
const AWS_ARN_PATTERN = /\barn:aws:[^\s"',)]+/g;
const PRIVATE_KEY_PATTERN = /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g;
const DATABASE_URL_PATTERN = /\b(?:postgres|postgresql|mysql):\/\/[^\s"',)]+/gi;
const SECRET_ASSIGNMENT_PATTERN =
  /\b(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|secret[_-]?key|authorization)\s*[:=]\s*([^\s"',)]+)/gi;

export function sanitizeTerraformErrorForAi(
  input: TerraformErrorSanitizationInput
): SanitizedTerraformErrorForAi {
  return {
    stage: input.stage,
    sanitizedMessage: maskSecretString(input.rawMessage),
    relatedResourceId: input.relatedResourceId ?? null
  };
}

export function maskSecretsForAi(value: unknown): unknown {
  if (typeof value === "string") {
    return maskSecretString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => maskSecretsForAi(item));
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      SECRET_KEY_PATTERN.test(key) ? "[MASKED_SECRET]" : maskSecretsForAi(entry)
    ])
  );
}

export function createNormalizedAiCacheKey(input: NormalizedAiCacheKeyInput): string {
  const normalizedPayload = stableStringify(maskSecretsForAi(input.payload));
  const keyMaterial = stableStringify({
    model: input.model ?? null,
    payload: normalizedPayload,
    provider: input.provider,
    routeTarget: input.routeTarget
  });

  return createHash("sha256").update(keyMaterial).digest("hex");
}

export function estimateAiUsage(input: unknown, outputCharacters?: number | undefined) {
  const inputCharacters = stableStringify(maskSecretsForAi(input)).length;

  return {
    inputCharacters,
    inputTokensEstimate: estimateTokens(inputCharacters),
    ...(outputCharacters === undefined
      ? {}
      : {
          outputCharacters,
          outputTokensEstimate: estimateTokens(outputCharacters)
        })
  };
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortForStableStringify(value));
}

function sortForStableStringify(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortForStableStringify);
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey))
      .map(([key, entry]) => [key, sortForStableStringify(entry)])
  );
}

function maskSecretString(value: string): string {
  return value
    .replace(PRIVATE_KEY_PATTERN, "[MASKED_PRIVATE_KEY]")
    .replace(DATABASE_URL_PATTERN, "[MASKED_DATABASE_URL]")
    .replace(AWS_ARN_PATTERN, "[MASKED_AWS_ARN]")
    .replace(AWS_ACCESS_KEY_ID_PATTERN, "[MASKED_AWS_ACCESS_KEY_ID]")
    .replace(AWS_ACCOUNT_ID_PATTERN, "[MASKED_AWS_ACCOUNT_ID]")
    .replace(SECRET_ASSIGNMENT_PATTERN, "$1=[MASKED_SECRET]");
}

function estimateTokens(characters: number): number {
  return Math.max(1, Math.ceil(characters / 4));
}
