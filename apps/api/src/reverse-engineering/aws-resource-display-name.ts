export type AwsResourceDisplayNameInput = {
  readonly displayName: string;
  readonly providerResourceId: string;
  readonly providerResourceType: string;
};

const MAX_DISPLAY_NAME_LENGTH = 42;
const DISPLAY_NAME_PREFIX_LENGTH = 34;
const DISPLAY_NAME_SUFFIX_LENGTH = 7;

export function createAwsResourceDisplayName(input: AwsResourceDisplayNameInput): string {
  return shortenDisplayName(createBaseDisplayName(input));
}

export function createAwsResourceDisplayNameMap(
  records: readonly AwsResourceDisplayNameInput[]
): ReadonlyMap<string, string> {
  const baseNames = records.map((record) => ({
    record,
    baseName: createBaseDisplayName(record)
  }));
  const duplicateCounts = new Map<string, number>();

  for (const { baseName } of baseNames) {
    duplicateCounts.set(baseName, (duplicateCounts.get(baseName) ?? 0) + 1);
  }

  return new Map(
    baseNames.map(({ record, baseName }) => {
      const displayName =
        duplicateCounts.get(baseName) === 1
          ? baseName
          : `${baseName} · ${shortIdentifier(record.providerResourceId)}`;

      return [record.providerResourceId, shortenDisplayName(displayName)];
    })
  );
}

function createBaseDisplayName(input: AwsResourceDisplayNameInput): string {
  const displayName = input.displayName.trim();

  if (isHumanDisplayName(displayName, input.providerResourceId)) {
    return displayName;
  }

  const arnResourceName = extractArnResourceName(input.providerResourceId);

  return arnResourceName && !isAwsProviderId(arnResourceName)
    ? arnResourceName
    : createFallbackDisplayName(input);
}

function isHumanDisplayName(displayName: string, providerResourceId: string): boolean {
  return (
    displayName.length > 0 &&
    displayName !== providerResourceId &&
    !isArn(displayName) &&
    !displayName.startsWith("resource-") &&
    !isAwsProviderId(displayName)
  );
}

function isAwsProviderId(value: string): boolean {
  return /^(?:vpc|subnet|i|igw|rtb|sg|eni|nat|eipalloc|eipassoc|vol|ami|snap|acl|vpce)-[0-9a-f]{8,}$/i.test(
    value
  );
}

function extractArnResourceName(providerResourceId: string): string | undefined {
  if (!isArn(providerResourceId)) {
    return undefined;
  }

  const resourceSegment = providerResourceId.split(":").slice(5).join(":");

  if (!resourceSegment || /[:/]$/.test(resourceSegment)) {
    return undefined;
  }

  const loadBalancerMatch = resourceSegment.match(/^loadbalancer\/(?:app|net|gwy)\/([^/]+)\//);

  if (loadBalancerMatch?.[1]) {
    return loadBalancerMatch[1];
  }

  const targetGroupMatch = resourceSegment.match(/^targetgroup\/([^/]+)\//);

  if (targetGroupMatch?.[1]) {
    return targetGroupMatch[1];
  }

  return resourceSegment.split(/[:/]/).filter(Boolean).at(-1);
}

function createFallbackDisplayName(input: AwsResourceDisplayNameInput): string {
  return `${formatProviderResourceType(input.providerResourceType)} · ${shortIdentifier(
    input.providerResourceId
  )}`;
}

function formatProviderResourceType(providerResourceType: string): string {
  return providerResourceType.replaceAll("::", " ").trim() || "AWS Resource";
}

function shortIdentifier(providerResourceId: string): string {
  return providerResourceId.slice(-DISPLAY_NAME_SUFFIX_LENGTH) || "unknown";
}

function shortenDisplayName(displayName: string): string {
  return displayName.length <= MAX_DISPLAY_NAME_LENGTH
    ? displayName
    : `${displayName.slice(0, DISPLAY_NAME_PREFIX_LENGTH)}…${displayName.slice(-DISPLAY_NAME_SUFFIX_LENGTH)}`;
}

function isArn(value: string): boolean {
  return value.startsWith("arn:");
}
