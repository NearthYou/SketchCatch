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

type ParameterAliasMatch = {
  readonly end: number;
  readonly length: number;
  readonly start: number;
};

const NON_NEGATIVE_NUMBER_KEYS = new Set([
  "allocatedstorage",
  "cpu",
  "desiredcapacity",
  "desiredcount",
  "maxcapacity",
  "maxsize",
  "memory",
  "memorysize",
  "mincapacity",
  "minsize",
  "port",
  "retentionindays",
  "scaleincooldown",
  "scaleoutcooldown",
  "targetvalue",
  "timeout"
]);


const INTEGER_NUMBER_KEYS = new Set([
  "allocatedstorage",
  "cpu",
  "desiredcapacity",
  "desiredcount",
  "maxcapacity",
  "maxsize",
  "memory",
  "memorysize",
  "mincapacity",
  "minsize",
  "port",
  "retentionindays",
  "scaleincooldown",
  "scaleoutcooldown",
  "timeout"
]);

const STRING_ENUM_VALUES: Readonly<Record<string, ReadonlySet<string>>> = {
  protocol: new Set([
    "-1",
    "all",
    "geneve",
    "http",
    "https",
    "icmp",
    "icmpv6",
    "tcp",
    "tcp_udp",
    "tls",
    "udp"
  ])
};
const MIN_MAX_PARAMETER_PAIRS = [
  ["minCapacity", "maxCapacity"],
  ["minSize", "maxSize"]
] as const;


const BOUNDED_CAPACITY_PARAMETER_GROUPS = [
  ["minSize", "desiredCapacity", "maxSize"]
] as const;
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
  const normalizedInstruction = normalizeParameterSearchText(instruction);
  const matches = collectExistingScalarParameters(targetNode.config)
    .flatMap((candidate) => {
      const aliases = createParameterAliases(
        candidate.path.at(-1) ?? "",
        targetNode.type,
        candidate.path
      );
      const aliasMatch = aliases
        .map((alias) => findParameterAliasMatch(normalizedInstruction, alias))
        .filter((match): match is ParameterAliasMatch => match !== undefined)
        .sort((left, right) => right.length - left.length)[0];

      return aliasMatch ? [{ ...candidate, aliasMatch }] : [];
    })
    .filter(
      (candidate, _index, allCandidates) =>
        !allCandidates.some(
          (other) =>
            other !== candidate &&
            other.aliasMatch.length > candidate.aliasMatch.length &&
            other.aliasMatch.start <= candidate.aliasMatch.start &&
            other.aliasMatch.end >= candidate.aliasMatch.end
        )
    )
    .sort((left, right) => left.aliasMatch.start - right.aliasMatch.start);
  const hasAmbiguousParameterAlias = matches.some((candidate) =>
    matches.some(
      (other) =>
        other !== candidate &&
        other.aliasMatch.start === candidate.aliasMatch.start &&
        other.aliasMatch.end === candidate.aliasMatch.end &&
        other.path.join(".") !== candidate.path.join(".")
    )
  );

  if (hasAmbiguousParameterAlias) {
    return [];
  }

  if (matches.length > 1 && normalizedInstruction.includes("\uAC01\uAC01")) {
    return [];
  }

  const operations = matches.flatMap((match, index) => {
    const nextMatch = matches[index + 1];
    const value = findExplicitScalarParameterValue(
      instruction,
      match.aliasMatch.end,
      nextMatch?.aliasMatch.start ?? instruction.length,
      match.value
    );

    if (value === undefined) {
      return [];
    }

    return [{
      op: "set_value" as const,
      path: `config.${match.path.join(".")}`,
      value
    }];
  });

  return areExistingScalarParameterOperationsSafe(targetNode, operations)
    ? operations
    : [];
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

    if (Array.isArray(childValue) && childValue.length !== 1) {
      return [];
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
  const words = toParameterWords(key);
  const pathWords = path.map(toParameterWords).join(" ");
  const semanticAliases = PARAMETER_INTENT_ALIASES[resourceType]?.[path.join(".")] ?? [];

  return Array.from(
    new Set([
      key.toLowerCase(),
      words,
      words.replaceAll(" ", "_"),
      words.replaceAll(" ", "-"),
      path.join(".").toLowerCase(),
      pathWords,
      pathWords.replaceAll(" ", "_"),
      pathWords.replaceAll(" ", "-"),
      ...semanticAliases.map(normalizeSearchText)
    ])
  );
}

function toParameterWords(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .toLowerCase();
}
function findExplicitScalarParameterValue(
  instruction: string,
  valueStart: number,
  clauseEnd: number,
  currentValue: ScalarParameterValue
): ScalarParameterValue | undefined {
  const suffix = instruction.slice(valueStart, clauseEnd);

  if (typeof currentValue === "number") {
    const koreanRangeValue = suffix.match(
      /-?\d+(?:\.\d+)?\s*\uC5D0\uC11C\s*(-?\d+(?:\.\d+)?)\s*(?:\uC73C\uB85C|\uB85C)/u
    )?.[1];
    const englishRangeValue = suffix.match(
      /\bfrom\s+-?\d+(?:\.\d+)?\s+to\s+(-?\d+(?:\.\d+)?)/iu
    )?.[1];
    const directValue = suffix.match(/-?\d+(?:\.\d+)?/u)?.[0];
    const value = koreanRangeValue ?? englishRangeValue ?? directValue;

    return value === undefined ? undefined : Number(value);
  }

  if (typeof currentValue === "boolean") {
    return findBooleanValue(normalizeSearchText(suffix));
  }

  return findExplicitStringParameterValue(suffix);
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

function findExplicitStringParameterValue(suffix: string): string | undefined {
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

export function areExistingScalarParameterOperationsSafe(
  targetNode: ResourceNode,
  operations: readonly ArchitecturePatchPlanOperation[]
): boolean {
  const prospectiveValues = new Map(getExistingScalarPatchValues(targetNode));

  for (const operation of operations) {
    if (operation.op === "increase_one_step" || operation.op === "decrease_one_step") {
      continue;
    }

    if (!prospectiveValues.has(operation.path)) {
      continue;
    }

    const nextValue =
      operation.op === "enable"
        ? true
        : operation.op === "disable"
          ? false
          : operation.value;

    if (nextValue === null) {
      if (operation.op === "set_value" && operation.path.endsWith(".resourceLabel")) {
        prospectiveValues.delete(operation.path);
        continue;
      }

      return false;
    }

    if (!isSafeScalarParameterValue(operation.path, nextValue)) {
      return false;
    }

    prospectiveValues.set(operation.path, nextValue);
  }

  const minMaxPairsAreValid = MIN_MAX_PARAMETER_PAIRS.every(([minKey, maxKey]) => {
    const minValue = findProspectiveParameterValue(prospectiveValues, minKey);
    const maxValue = findProspectiveParameterValue(prospectiveValues, maxKey);

    return (
      typeof minValue !== "number" ||
      typeof maxValue !== "number" ||
      minValue <= maxValue
    );
  });

  if (!minMaxPairsAreValid) {
    return false;
  }

  return BOUNDED_CAPACITY_PARAMETER_GROUPS.every(([minKey, desiredKey, maxKey]) => {
    const minValue = findProspectiveParameterValue(prospectiveValues, minKey);
    const desiredValue = findProspectiveParameterValue(prospectiveValues, desiredKey);
    const maxValue = findProspectiveParameterValue(prospectiveValues, maxKey);

    return (
      typeof minValue !== "number" ||
      typeof desiredValue !== "number" ||
      typeof maxValue !== "number" ||
      (minValue <= desiredValue && desiredValue <= maxValue)
    );
  });
}

function findParameterAliasMatch(
  normalizedInstruction: string,
  alias: string
): ParameterAliasMatch | undefined {
  const normalizedAlias = normalizeParameterSearchText(alias).trim();

  if (!normalizedAlias) {
    return undefined;
  }

  const escapedAlias = normalizedAlias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `(^|[^a-z0-9_])(${escapedAlias})(?=$|[^a-z0-9_])`,
    "iu"
  ).exec(normalizedInstruction);

  if (!match || match.index === undefined || match[2] === undefined) {
    return undefined;
  }

  const start = match.index + (match[1]?.length ?? 0);

  return {
    start,
    end: start + match[2].length,
    length: match[2].length
  };
}

function findProspectiveParameterValue(
  values: ReadonlyMap<string, ScalarParameterValue>,
  key: string
): ScalarParameterValue | undefined {
  return Array.from(values.entries()).find(
    ([path]) => path === `config.${key}` || path.endsWith(`.${key}`)
  )?.[1];
}

function isSafeScalarParameterValue(
  path: string,
  value: ScalarParameterValue
): boolean {
  const key = path.split(".").at(-1)?.toLowerCase() ?? "";

  if (typeof value === "string") {
    const allowedValues = STRING_ENUM_VALUES[key];

    return (
      value.trim().length > 0 &&
      (allowedValues === undefined || allowedValues.has(value.toLowerCase()))
    );
  }

  if (typeof value === "boolean") {
    return true;
  }

  if (!Number.isFinite(value) || (INTEGER_NUMBER_KEYS.has(key) && !Number.isInteger(value))) {
    return false;
  }

  if (NON_NEGATIVE_NUMBER_KEYS.has(key) && value < 0) {
    return false;
  }

  if (key === "port" && value > 65_535) {
    return false;
  }

  return key !== "targetvalue" || value > 0;
}

function normalizeParameterSearchText(value: string): string {
  return value.toLowerCase();
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
