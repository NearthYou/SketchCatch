import { createHash } from "node:crypto";
import {
  DescribeKeyCommand,
  GetKeyPolicyCommand,
  GetKeyRotationStatusCommand,
  ListAliasesCommand,
  ListKeysCommand,
  ListResourceTagsCommand,
  type AliasListEntry,
  type KeyListEntry,
  type KeyMetadata
} from "@aws-sdk/client-kms";
import type { AwsDiscoveredResourceRecord } from "./aws-provider-adapter.js";

export type AwsKmsDetailedReadClient = {
  send(command: object): Promise<unknown>;
};

export type AwsKmsReadFailure = {
  readonly operation: string;
  readonly outcome:
    | "permission_denied"
    | "expired_credential"
    | "invalid_region"
    | "throttled"
    | "transient";
  readonly resourceId?: string;
};

export type AwsKmsServerOnlyDetail =
  | {
      readonly providerResourceId: string;
      readonly resourceKind: "key";
      readonly terraformImportId: string;
      readonly keyId?: string;
      readonly policyDocument?: string;
      readonly tags?: readonly KmsTag[];
    }
  | {
      readonly providerResourceId: string;
      readonly resourceKind: "alias";
      readonly terraformImportId: string;
      readonly aliasName: string;
      readonly targetKeyId: string;
    };

export type AwsKmsReadResult = {
  readonly records: AwsDiscoveredResourceRecord[];
  readonly serverOnlyDetails: AwsKmsServerOnlyDetail[];
  readonly failures: AwsKmsReadFailure[];
};

type ReadKmsResourcesInput = {
  readonly region: string;
  readonly client: AwsKmsDetailedReadClient;
};

type KmsAliasesResult = {
  readonly aliases: AliasListEntry[];
  readonly complete: boolean;
};

type KmsKeysResult = {
  readonly keys: KeyListEntry[];
  readonly complete: boolean;
};

type KmsDetailResult = {
  readonly record: AwsDiscoveredResourceRecord | null;
  readonly serverOnlyDetail?: AwsKmsServerOnlyDetail;
  readonly keyId?: string;
  readonly providerResourceId?: string;
  readonly managementReady?: boolean;
};

type CreatedKmsAliasRecord = {
  readonly record: AwsDiscoveredResourceRecord;
  readonly serverOnlyDetail: AwsKmsServerOnlyDetail;
};

type KmsTag = {
  readonly key: string;
  readonly value: string;
};

type KmsRotationStatus = {
  readonly enabled: boolean;
  readonly periodInDays?: number;
};

/**
 * gg: KMS의 공개 보드 정보와 정책·import 식별자를 분리하고, 누락된 상세는 완료로 보이지 않게 합니다.
 */
export async function readKmsResources(input: ReadKmsResourcesInput): Promise<AwsKmsReadResult> {
  const failures: AwsKmsReadFailure[] = [];
  const aliasesResult = await readAllAliases(input.client, failures);
  const keysResult = await readAllKeys(input.client, failures);
  const details: KmsDetailResult[] = [];

  for (const key of keysResult.keys) {
    details.push(
      await readKeyDetails({
        key,
        region: input.region,
        client: input.client,
        aliasesComplete: aliasesResult.complete,
        keysComplete: keysResult.complete,
        aliasNames: aliasesResult.aliases.flatMap((alias) =>
          alias.TargetKeyId === key.KeyId && alias.AliasName ? [alias.AliasName] : []
        ),
        failures
      })
    );
  }

  const providerIdByKeyId = new Map(
    details.flatMap((detail) =>
      detail.keyId && detail.providerResourceId
        ? [[detail.keyId, detail.providerResourceId] as const]
        : []
    )
  );
  const managementReadyByKeyId = new Map(
    details.flatMap((detail) =>
      detail.keyId && detail.managementReady !== undefined
        ? [[detail.keyId, detail.managementReady] as const]
        : []
    )
  );
  const aliasDetails = aliasesResult.aliases.flatMap((alias) =>
    createAliasRecord(alias, input.region, {
      inventoryComplete: aliasesResult.complete && keysResult.complete,
      managementReadyByKeyId,
      providerIdByKeyId
    })
  );

  return {
    records: [
      ...details.flatMap((detail) => (detail.record ? [detail.record] : [])),
      ...aliasDetails.map((detail) => detail.record)
    ],
    serverOnlyDetails: [
      ...details.flatMap((detail) => (detail.serverOnlyDetail ? [detail.serverOnlyDetail] : [])),
      ...aliasDetails.map((detail) => detail.serverOnlyDetail)
    ],
    failures
  };
}

/** gg: Alias pagination 실패는 Key 관리 완전성을 낮추되 읽은 항목은 확인용으로 유지합니다. */
async function readAllAliases(
  client: AwsKmsDetailedReadClient,
  failures: AwsKmsReadFailure[]
): Promise<KmsAliasesResult> {
  const aliases: AliasListEntry[] = [];
  const seenMarkers = new Set<string>();
  let marker: string | undefined;

  for (;;) {
    try {
      const response = (await client.send(new ListAliasesCommand({ Marker: marker }))) as {
        Aliases?: AliasListEntry[];
        NextMarker?: string;
        Truncated?: boolean;
      };
      const pageAliases = response.Aliases ?? [];
      if (
        pageAliases.some(
          (alias) =>
            !isNonEmptyString(alias.AliasName) ||
            (!isNonEmptyString(alias.TargetKeyId) && !alias.AliasName.startsWith("alias/aws/"))
        )
      ) {
        failures.push({ operation: "ListAliasesResponse", outcome: "transient" });
        return { aliases, complete: false };
      }
      aliases.push(...pageAliases);
      if (response.Truncated === false && response.NextMarker === undefined) {
        return { aliases, complete: true };
      }
      if (response.Truncated !== true || !isNonEmptyString(response.NextMarker)) {
        failures.push({ operation: "ListAliasesPagination", outcome: "transient" });
        return { aliases, complete: false };
      }
      if (seenMarkers.has(response.NextMarker)) {
        failures.push({ operation: "ListAliasesPagination", outcome: "transient" });
        return { aliases, complete: false };
      }
      seenMarkers.add(response.NextMarker);
      marker = response.NextMarker;
    } catch (error) {
      failures.push({ operation: "ListAliases", outcome: classifyKmsReadFailure(error) });
      return { aliases, complete: false };
    }
  }
}

/** gg: Key 목록은 반복 token이나 부분 실패를 완전한 목록으로 오인하지 않게 반환합니다. */
async function readAllKeys(
  client: AwsKmsDetailedReadClient,
  failures: AwsKmsReadFailure[]
): Promise<KmsKeysResult> {
  const keys: KeyListEntry[] = [];
  const seenMarkers = new Set<string>();
  let marker: string | undefined;

  for (;;) {
    try {
      const response = (await client.send(new ListKeysCommand({ Marker: marker }))) as {
        Keys?: KeyListEntry[];
        NextMarker?: string;
        Truncated?: boolean;
      };
      const pageKeys = response.Keys ?? [];
      if (pageKeys.some((key) => !isNonEmptyString(key.KeyId))) {
        failures.push({ operation: "ListKeysResponse", outcome: "transient" });
        return { keys, complete: false };
      }
      keys.push(...pageKeys);
      if (response.Truncated === false && response.NextMarker === undefined) {
        return { keys, complete: true };
      }
      if (response.Truncated !== true || !isNonEmptyString(response.NextMarker)) {
        failures.push({ operation: "ListKeysPagination", outcome: "transient" });
        return { keys, complete: false };
      }
      if (seenMarkers.has(response.NextMarker)) {
        failures.push({ operation: "ListKeysPagination", outcome: "transient" });
        return { keys, complete: false };
      }
      seenMarkers.add(response.NextMarker);
      marker = response.NextMarker;
    } catch (error) {
      failures.push({ operation: "ListKeys", outcome: classifyKmsReadFailure(error) });
      return { keys, complete: false };
    }
  }
}

/** gg: 개별 Key의 정책 원문과 import ID는 서버 결과에만 두고, 공개 record에는 안전한 상태만 남깁니다. */
async function readKeyDetails(input: {
  readonly key: KeyListEntry;
  readonly region: string;
  readonly client: AwsKmsDetailedReadClient;
  readonly aliasesComplete: boolean;
  readonly keysComplete: boolean;
  readonly aliasNames: string[];
  readonly failures: AwsKmsReadFailure[];
}): Promise<KmsDetailResult> {
  const keyId = input.key.KeyId;
  const fallbackProviderId = input.key.KeyArn ?? keyId;
  if (!keyId && !fallbackProviderId) return { record: null };

  const metadata = await readKmsDetail<KeyMetadata>(
    input.client,
    new DescribeKeyCommand({ KeyId: keyId ?? fallbackProviderId }),
    "DescribeKey",
    fallbackProviderId,
    input.failures,
    (response) => (response as { KeyMetadata?: KeyMetadata }).KeyMetadata
  );
  const resolvedKeyId = metadata?.KeyId ?? keyId;
  const providerResourceId = metadata?.Arn ?? input.key.KeyArn ?? resolvedKeyId;
  if (!providerResourceId) return { record: null };

  const policyDocument = await readKmsDetail<string>(
    input.client,
    new GetKeyPolicyCommand({ KeyId: resolvedKeyId ?? providerResourceId, PolicyName: "default" }),
    "GetKeyPolicy",
    providerResourceId,
    input.failures,
    selectKmsPolicyDocument
  );
  const rotationStatus = await readKmsDetail<KmsRotationStatus>(
    input.client,
    new GetKeyRotationStatusCommand({ KeyId: resolvedKeyId ?? providerResourceId }),
    "GetKeyRotationStatus",
    providerResourceId,
    input.failures,
    selectKmsRotationStatus
  );
  const tags = await readAllKeyTags(
    input.client,
    resolvedKeyId ?? providerResourceId,
    providerResourceId,
    input.failures
  );
  const detailsComplete =
    metadata !== undefined &&
    policyDocument !== undefined &&
    rotationStatus !== undefined &&
    tags.complete &&
    input.aliasesComplete &&
    input.keysComplete;
  const managementReady =
    detailsComplete &&
    metadata?.Enabled === true &&
    metadata.KeyManager === "CUSTOMER" &&
    metadata.KeyState === "Enabled" &&
    metadata.MultiRegion === false &&
    metadata.Origin === "AWS_KMS";

  return {
    ...(resolvedKeyId ? { keyId: resolvedKeyId } : {}),
    providerResourceId,
    managementReady,
    serverOnlyDetail: {
      providerResourceId,
      resourceKind: "key",
      terraformImportId: resolvedKeyId ?? providerResourceId,
      ...(resolvedKeyId ? { keyId: resolvedKeyId } : {}),
      ...(policyDocument !== undefined ? { policyDocument } : {}),
      ...(tags.complete ? { tags: tags.values } : {})
    },
    record: {
      providerResourceType: "AWS::KMS::Key",
      providerResourceId,
      displayName: createKmsKeyDisplayName({
        aliasNames: input.aliasNames,
        description: metadata?.Description,
        keyId: resolvedKeyId,
        providerResourceId
      }),
      region: input.region,
      config: {
        description: metadata?.Description,
        enabled: metadata?.Enabled,
        keyManager: metadata?.KeyManager,
        keySpec: metadata?.KeySpec,
        keyState: metadata?.KeyState,
        keyUsage: metadata?.KeyUsage,
        managementReady,
        multiRegion: metadata?.MultiRegion,
        origin: metadata?.Origin,
        policyDigest: policyDocument
          ? createHash("sha256").update(policyDocument).digest("hex")
          : undefined,
        policyReadComplete: policyDocument !== undefined,
        reverseEngineeringDetailsComplete: detailsComplete,
        reverseEngineeringDetailsVersion: 1,
        rotationEnabled: rotationStatus?.enabled,
        rotationPeriodInDays: rotationStatus?.periodInDays,
        rotationReadComplete: rotationStatus !== undefined,
        tagCount: tags.complete ? tags.values.length : undefined,
        tagsReadComplete: tags.complete
      },
      relationships: []
    }
  };
}

/** gg: 태그 pagination 실패 시 부분 태그를 완전한 설정으로 오인하지 않게 표시합니다. */
async function readAllKeyTags(
  client: AwsKmsDetailedReadClient,
  keyId: string,
  providerResourceId: string,
  failures: AwsKmsReadFailure[]
): Promise<{ readonly values: KmsTag[]; readonly complete: boolean }> {
  const values: KmsTag[] = [];
  const seenTagKeys = new Set<string>();
  const seenMarkers = new Set<string>();
  let marker: string | undefined;

  for (;;) {
    try {
      const response = (await client.send(
        new ListResourceTagsCommand({ KeyId: keyId, Marker: marker })
      )) as {
        Tags?: Array<{ TagKey?: string; TagValue?: string }>;
        NextMarker?: string;
        Truncated?: boolean;
      };
      const pageTags = response.Tags ?? [];
      for (const tag of pageTags) {
        if (
          !isNonEmptyString(tag.TagKey) ||
          typeof tag.TagValue !== "string" ||
          seenTagKeys.has(tag.TagKey)
        ) {
          failures.push({
            operation: "ListResourceTagsResponse",
            outcome: "transient",
            resourceId: createKmsFailureResourceRef(providerResourceId)
          });
          return { values, complete: false };
        }
        seenTagKeys.add(tag.TagKey);
        values.push({ key: tag.TagKey, value: tag.TagValue });
      }
      if (response.Truncated === false && response.NextMarker === undefined) {
        return {
          values: values.sort((left, right) => left.key.localeCompare(right.key)),
          complete: true
        };
      }
      if (response.Truncated !== true || !isNonEmptyString(response.NextMarker)) {
        failures.push({
          operation: "ListResourceTagsPagination",
          outcome: "transient",
          resourceId: createKmsFailureResourceRef(providerResourceId)
        });
        return { values, complete: false };
      }
      if (seenMarkers.has(response.NextMarker)) {
        failures.push({
          operation: "ListResourceTagsPagination",
          outcome: "transient",
          resourceId: createKmsFailureResourceRef(providerResourceId)
        });
        return { values, complete: false };
      }
      seenMarkers.add(response.NextMarker);
      marker = response.NextMarker;
    } catch (error) {
      failures.push({
        operation: "ListResourceTags",
        outcome: classifyKmsReadFailure(error),
        resourceId: createKmsFailureResourceRef(providerResourceId)
      });
      return { values, complete: false };
    }
  }
}

/** SDK 오류 원문은 계정 정보가 섞일 수 있어 외부 failure에는 operation과 안전한 resource ID만 남긴다. */
async function readKmsDetail<T>(
  client: AwsKmsDetailedReadClient,
  command: object,
  operation: string,
  resourceId: string | undefined,
  failures: AwsKmsReadFailure[],
  select: (response: unknown) => T | undefined
): Promise<T | undefined> {
  try {
    const selected = select(await client.send(command));
    if (selected !== undefined) return selected;
    failures.push({
      operation: `${operation}Response`,
      outcome: "transient",
      ...(resourceId ? { resourceId: createKmsFailureResourceRef(resourceId) } : {})
    });
    return undefined;
  } catch (error) {
    failures.push({
      operation,
      outcome: classifyKmsReadFailure(error),
      ...(resourceId ? { resourceId: createKmsFailureResourceRef(resourceId) } : {})
    });
    return undefined;
  }
}

function selectKmsPolicyDocument(response: unknown): string | undefined {
  const policy = (response as { Policy?: unknown }).Policy;
  if (typeof policy !== "string" || policy.trim().length === 0) return undefined;
  try {
    const parsed = JSON.parse(policy) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? policy : undefined;
  } catch {
    return undefined;
  }
}

function selectKmsRotationStatus(response: unknown): KmsRotationStatus | undefined {
  const value = response as {
    KeyRotationEnabled?: unknown;
    RotationPeriodInDays?: unknown;
  };
  if (typeof value.KeyRotationEnabled !== "boolean") return undefined;
  const period = value.RotationPeriodInDays;
  if (period !== undefined && !isKmsRotationPeriod(period)) return undefined;
  if (value.KeyRotationEnabled && period === undefined) return undefined;
  return {
    enabled: value.KeyRotationEnabled,
    ...(typeof period === "number" ? { periodInDays: period } : {})
  };
}

function isKmsRotationPeriod(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 90 && value <= 2560;
}

function createKmsKeyDisplayName(input: {
  readonly aliasNames: readonly string[];
  readonly description: string | undefined;
  readonly keyId: string | undefined;
  readonly providerResourceId: string;
}): string {
  const displayCandidate = [...input.aliasNames, input.description].find(
    (candidate): candidate is string =>
      isNonEmptyString(candidate) && (!input.keyId || !candidate.includes(input.keyId))
  );
  if (displayCandidate) return displayCandidate;
  const suffix = createHash("sha256").update(input.providerResourceId).digest("hex").slice(0, 7);
  return `KMS Key · ${suffix}`;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** gg: 실패 응답에서는 AWS 계정·Key ID를 숨기면서 같은 리소스를 추적할 안정 참조값만 만듭니다. */
function createKmsFailureResourceRef(resourceId: string): string {
  return `kms-ref-${createHash("sha256").update(resourceId).digest("hex").slice(0, 16)}`;
}

/** AWS 오류 원문을 보존하지 않고 재시도와 권한 안내에 필요한 안전한 종류만 분류한다. */
function classifyKmsReadFailure(error: unknown): AwsKmsReadFailure["outcome"] {
  const message = error instanceof Error ? `${error.name} ${error.message}`.toLowerCase() : "";
  if (message.includes("accessdenied") || message.includes("not authorized")) {
    return "permission_denied";
  }
  if (message.includes("expiredtoken")) return "expired_credential";
  if (message.includes("throttl") || message.includes("rate exceeded")) return "throttled";
  if (message.includes("invalid") && message.includes("region")) return "invalid_region";
  return "transient";
}

/** gg: Alias의 표시용 상태와 정확한 import 식별자를 분리하면서 Key 관계는 보존합니다. */
function createAliasRecord(
  alias: AliasListEntry,
  region: string,
  input: {
    readonly inventoryComplete: boolean;
    readonly managementReadyByKeyId: ReadonlyMap<string, boolean>;
    readonly providerIdByKeyId: ReadonlyMap<string, string>;
  }
): CreatedKmsAliasRecord[] {
  if (!alias.AliasName || !alias.TargetKeyId) return [];
  const targetProviderResourceId =
    input.providerIdByKeyId.get(alias.TargetKeyId) ?? alias.TargetKeyId;
  const awsManaged = alias.AliasName.startsWith("alias/aws/");
  const detailsComplete = input.inventoryComplete && input.providerIdByKeyId.has(alias.TargetKeyId);
  const managementReady =
    detailsComplete && !awsManaged && input.managementReadyByKeyId.get(alias.TargetKeyId) === true;

  return [
    {
      record: {
        providerResourceType: "AWS::KMS::Alias",
        providerResourceId: alias.AliasArn ?? alias.AliasName,
        displayName: alias.AliasName,
        region,
        config: {
          awsManaged,
          managementReady,
          reverseEngineeringDetailsComplete: detailsComplete
        },
        relationships: [{ type: "depends_on", targetProviderResourceId }]
      },
      serverOnlyDetail: {
        providerResourceId: alias.AliasArn ?? alias.AliasName,
        resourceKind: "alias",
        terraformImportId: alias.AliasName,
        aliasName: alias.AliasName,
        targetKeyId: alias.TargetKeyId
      }
    }
  ];
}
