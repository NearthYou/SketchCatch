export type ArchitectureResourceQuantities = {
  readonly ec2Instances: number;
  readonly s3Buckets: number;
};

export const DEFAULT_ARCHITECTURE_RESOURCE_QUANTITIES: ArchitectureResourceQuantities = {
  ec2Instances: 1,
  s3Buckets: 1
};

const MAX_REPLICATED_RESOURCE_COUNT = 10;

const KOREAN_COUNT_WORDS = new Map<string, number>([
  ["한", 1],
  ["하나", 1],
  ["두", 2],
  ["둘", 2],
  ["세", 3],
  ["셋", 3],
  ["네", 4],
  ["넷", 4],
  ["다섯", 5],
  ["여섯", 6],
  ["일곱", 7],
  ["여덟", 8],
  ["아홉", 9],
  ["열", 10]
]);

export function resolveArchitectureResourceQuantities(prompt: string): ArchitectureResourceQuantities {
  const normalizedPrompt = prompt.normalize("NFKC").toLowerCase();

  return {
    ec2Instances: findRequestedResourceCount(normalizedPrompt, ["ec2", "인스턴스", "서버"]),
    s3Buckets: findRequestedResourceCount(normalizedPrompt, ["s3", "bucket", "버킷", "스토리지"])
  };
}

function findRequestedResourceCount(normalizedPrompt: string, keywords: readonly string[]): number {
  const keywordPattern = keywords.map(escapeRegExp).join("|");
  const countPattern = `\\d{1,2}|${Array.from(KOREAN_COUNT_WORDS.keys()).join("|")}`;
  const unitPattern = "(?:개|대|instances?|servers?|buckets?)";
  const optionalParticlePattern = "(?:은|는|이|가|을|를|로|으로|:)?";
  const countNearKeywordPatterns = [
    new RegExp(
      `(?:${keywordPattern})\\s*${optionalParticlePattern}\\s*(?:한\\s+)?(${countPattern})\\s*${unitPattern}?`,
      "u"
    ),
    new RegExp(
      `(${countPattern})\\s*${unitPattern}?\\s*(?:있는|짜리|의)?\\s*(?:${keywordPattern})`,
      "u"
    )
  ];

  for (const pattern of countNearKeywordPatterns) {
    const match = normalizedPrompt.match(pattern);
    const count = parseCountToken(match?.[1]);

    if (count !== null) {
      return clampResourceCount(count);
    }
  }

  return 1;
}

function parseCountToken(token: string | undefined): number | null {
  if (!token) {
    return null;
  }

  const numericCount = Number.parseInt(token, 10);

  if (Number.isFinite(numericCount)) {
    return numericCount;
  }

  return KOREAN_COUNT_WORDS.get(token) ?? null;
}

function clampResourceCount(count: number): number {
  return Math.min(Math.max(count, 1), MAX_REPLICATED_RESOURCE_COUNT);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
