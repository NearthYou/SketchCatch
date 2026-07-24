import type {
  ArchitecturePatchPlanOperation,
  ResourceNode,
  ResourceType
} from "@sketchcatch/types";

type ScalarParameterValue = string | number | boolean;

type ScalarParameter = {
  readonly path: readonly string[];
  readonly value: ScalarParameterValue;
};

const PROTECTED_CONFIG_KEYS = new Set([
  "terraformResourceType",
  "terraformResourceName",
  "terraformBlockType",
  "templateId",
  "templateResourceId",
  "parentAreaNodeId"
]);

const PARAMETER_INTENT_ALIASES: Readonly<
  Partial<Record<ResourceType, Readonly<Record<string, readonly string[]>>>>
> = {
  APPLICATION_AUTO_SCALING_TARGET: {
    maxCapacity: [
      "maximum capacity",
      "max capacity",
      "\uCD5C\uB300 \uD0DC\uC2A4\uD06C \uC218",
      "\uCD5C\uB300 \uC6A9\uB7C9"
    ],
    minCapacity: [
      "minimum capacity",
      "min capacity",
      "\uCD5C\uC18C \uD0DC\uC2A4\uD06C \uC218",
      "\uCD5C\uC18C \uC6A9\uB7C9"
    ]
  },
  CLOUDWATCH_METRIC_ALARM: {
    threshold: ["alarm threshold", "threshold", "\uC784\uACC4\uAC12", "\uACBD\uBCF4 \uAE30\uC900\uAC12"]
  },
  ECS_SERVICE: {
    desiredCount: [
      "desired count",
      "desired task count",
      "\uD76C\uB9DD \uD0DC\uC2A4\uD06C \uC218",
      "\uC6D0\uD558\uB294 \uD0DC\uC2A4\uD06C \uC218"
    ]
  },
  ECS_TASK_DEFINITION: {
    cpu: ["task cpu", "cpu units", "\uD0DC\uC2A4\uD06C cpu", "cpu \uB2E8\uC704"],
    memory: ["task memory", "\uD0DC\uC2A4\uD06C \uBA54\uBAA8\uB9AC", "\uBA54\uBAA8\uB9AC"]
  },
  LAMBDA: {
    memorySize: ["memory size", "lambda memory", "\uBA54\uBAA8\uB9AC \uD06C\uAE30"],
    timeout: ["timeout", "\uD0C0\uC784\uC544\uC6C3", "\uC2E4\uD589 \uC81C\uD55C \uC2DC\uAC04"]
  }
};

export function createExistingScalarParameterOperations(
  instruction: string,
  targetNode: ResourceNode
): ArchitecturePatchPlanOperation[] {
  const normalizedInstruction = normalizeSearchText(instruction);
  const candidates = collectExistingScalarParameters(targetNode.config);
  const matches = candidates
    .map((candidate) => ({
      ...candidate,
      aliases: createParameterAliases(
        candidate.path.at(-1) ?? "",
        targetNode.type,
        candidate.path
      )
    }))
    .filter((candidate) =>
      candidate.aliases.some((alias) => includesPhrase(normalizedInstruction, alias))
    )
    .sort((left, right) => right.path.join(".").length - left.path.join(".").length);
  return matches.flatMap((match) => {
    const value = findExplicitScalarParameterValue(
      normalizedInstruction,
      match.aliases,
      match.value
    );

    if (value === undefined) {
      return [];
    }

    const operation: ArchitecturePatchPlanOperation = {
      op: "set_value",
      path: `config.${match.path.join(".")}`,
      value
    };

    return [operation];
  });
}

export function getExistingScalarPatchValues(
  targetNode: ResourceNode
): ReadonlyMap<string, ScalarParameterValue> {
  return new Map(
    collectExistingScalarParameters(targetNode.config).map(({ path, value }) => [
      `config.${path.join(".")}`,
      value
    ])
  );
}

export function getResourceIdentityConfigAliases(node: ResourceNode): string[] {
  return Object.entries(node.config).flatMap(([key, value]) => {
    if (typeof value !== "string" || !isResourceIdentityConfigKey(key)) {
      return [];
    }

    return [value];
  });
}

function collectExistingScalarParameters(
  value: Readonly<Record<string, unknown>>,
  parentPath: readonly string[] = []
): ScalarParameter[] {
  return Object.entries(value).flatMap(([key, childValue]) => {
    if (isProtectedPatchConfigKey(key)) {
      return [];
    }

    const path = [...parentPath, key];

    if (
      typeof childValue === "string" ||
      typeof childValue === "number" ||
      typeof childValue === "boolean"
    ) {
      return [{ path, value: childValue }];
    }

    const nestedValue = Array.isArray(childValue) ? childValue[0] : childValue;

    return isRecord(nestedValue)
      ? collectExistingScalarParameters(nestedValue, path)
      : [];
  });
}

function createParameterAliases(
  key: string,
  resourceType: ResourceType,
  path: readonly string[]
): string[] {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .toLowerCase();
  const semanticAliases = PARAMETER_INTENT_ALIASES[resourceType]?.[path.join(".")] ?? [];

  return Array.from(
    new Set([
      key.toLowerCase(),
      words,
      words.replaceAll(" ", "_"),
      ...semanticAliases.map(normalizeSearchText)
    ])
  );
}

function findExplicitScalarParameterValue(
  normalizedInstruction: string,
  aliases: readonly string[],
  currentValue: ScalarParameterValue
): ScalarParameterValue | undefined {
  const alias = aliases
    .filter((candidate) => candidate.length > 0)
    .sort((left, right) => right.length - left.length)
    .find((candidate) => normalizedInstruction.includes(normalizeSearchText(candidate)));

  if (!alias) {
    return undefined;
  }

  const aliasIndex = normalizedInstruction.indexOf(normalizeSearchText(alias));
  const suffix = normalizedInstruction.slice(aliasIndex + normalizeSearchText(alias).length);

  if (typeof currentValue === "number") {
    const match = suffix.match(/-?\d+(?:\.\d+)?/u);
    return match ? Number(match[0]) : undefined;
  }

  if (typeof currentValue === "boolean") {
    return findBooleanValue(normalizedInstruction);
  }

  return findExplicitStringParameterValue(suffix, currentValue);
}

function findBooleanValue(instruction: string): boolean | undefined {
  if (includesAnyPhrase(instruction, ["disable", "off", "false", "without", "\uBE44\uD65C\uC131", "\uAEBC"])) {
    return false;
  }

  if (includesAnyPhrase(instruction, ["enable", "on", "true", "use", "allow", "\uD65C\uC131", "\uCF1C", "\uC0AC\uC6A9", "\uD5C8\uC6A9"])) {
    return true;
  }

  return undefined;
}

function findExplicitStringParameterValue(
  suffix: string,
  currentValue: string
): string | undefined {
  const quotedValue = suffix.match(/["']([^"']+)["']/u)?.[1]?.trim();
  const koreanValue = suffix.match(
    /^\s*(?:\uC744|\uB97C|\uC740|\uB294|\uC774|\uAC00)?\s*([a-z0-9][a-z0-9._:/-]*)\s*(?:\uC73C\uB85C|\uB85C)/iu
  )?.[1];
  const englishValue = suffix.match(
    /^\s*(?:to|as|=)\s*([a-z0-9][a-z0-9._:/-]*)/iu
  )?.[1];
  const value = quotedValue ?? koreanValue ?? englishValue;

  if (!value) {
    return undefined;
  }

  return preserveScalarStringCase(value, currentValue);
}

function preserveScalarStringCase(value: string, currentValue: string): string {
  const containsLetter = /[a-z]/iu.test(currentValue);

  if (containsLetter && currentValue === currentValue.toUpperCase()) {
    return value.toUpperCase();
  }

  if (containsLetter && currentValue === currentValue.toLowerCase()) {
    return value.toLowerCase();
  }

  return value;
}

function isProtectedPatchConfigKey(key: string): boolean {
  return PROTECTED_CONFIG_KEYS.has(key) || key.startsWith("diagram");
}

function isResourceIdentityConfigKey(key: string): boolean {
  const normalizedKey = key.toLowerCase();

  return (
    normalizedKey === "name" ||
    normalizedKey === "resourceid" ||
    normalizedKey === "terraformresourcename" ||
    normalizedKey.endsWith("name")
  );
}

function includesAnyPhrase(value: string, candidates: readonly string[]): boolean {
  return candidates.some((candidate) => includesPhrase(value, candidate));
}

function includesPhrase(value: string, phrase: string): boolean {
  const normalizedPhrase = normalizeSearchText(phrase);

  return (
    value.includes(normalizedPhrase) ||
    compactSearchText(value).includes(compactSearchText(normalizedPhrase))
  );
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function compactSearchText(value: string): string {
  return normalizeSearchText(value).replace(/\s+/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
