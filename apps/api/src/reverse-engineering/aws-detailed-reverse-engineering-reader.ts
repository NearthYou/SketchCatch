import { KMSClient } from "@aws-sdk/client-kms";
import type { ResourceType, ReverseEngineeringScanError } from "@sketchcatch/types";
import {
  getReverseEngineeringAwsScanSelection,
  resolveReverseEngineeringAwsProviderResourceType
} from "@sketchcatch/types/resource-definitions";
import type { TerraformAwsCredentialEnv } from "../aws-connections/aws-connection-runtime-credentials.js";
import {
  readAwsApiGatewayRestTopology,
  type AwsApiGatewayRestTopologyReadResult
} from "./aws-api-gateway-rest-topology-reader.js";
import {
  readDetailedIamResources,
  type AwsDetailedIamReadResult
} from "./aws-iam-reverse-engineering-reader.js";
import { readKmsResources, type AwsKmsReadResult } from "./aws-kms-reverse-engineering-reader.js";
import {
  readDetailedLambdaResources,
  type AwsDetailedLambdaReadResult
} from "./aws-lambda-reverse-engineering-reader.js";
import type {
  AwsDiscoveredResourceRecord,
  AwsProviderDiscoveryResult,
  AwsProviderScanInput
} from "./aws-provider-adapter.js";

export type AwsDetailedReverseEngineeringReaderDependencies = {
  readIam: (
    region: string,
    credentials: TerraformAwsCredentialEnv
  ) => Promise<AwsDetailedIamReadResult>;
  readLambda: (
    region: string,
    credentials: TerraformAwsCredentialEnv
  ) => Promise<AwsDetailedLambdaReadResult>;
  readKms: (region: string, credentials: TerraformAwsCredentialEnv) => Promise<AwsKmsReadResult>;
  readApiGateway: (
    region: string,
    credentials: TerraformAwsCredentialEnv
  ) => Promise<AwsApiGatewayRestTopologyReadResult>;
};

const IAM_RESOURCE_TYPES = new Set<ResourceType>([
  "IAM_ROLE",
  "IAM_POLICY",
  "IAM_INSTANCE_PROFILE"
]);
const LAMBDA_RESOURCE_TYPES = new Set<ResourceType>(["LAMBDA", "LAMBDA_PERMISSION"]);
const KMS_RESOURCE_TYPES = new Set<ResourceType>(["KMS_KEY", "KMS_ALIAS"]);
const API_GATEWAY_RESOURCE_TYPES = new Set<ResourceType>([
  "API_GATEWAY_REST_API",
  "API_GATEWAY_RESOURCE",
  "API_GATEWAY_METHOD",
  "API_GATEWAY_INTEGRATION",
  "API_GATEWAY_DEPLOYMENT",
  "API_GATEWAY_STAGE"
]);
const PROVIDER_RESOURCE_TYPES_BY_SELECTION = new Map<ResourceType, readonly string[]>([
  ["IAM_ROLE", ["AWS::IAM::Role"]],
  ["IAM_POLICY", ["AWS::IAM::Policy", "AWS::IAM::RolePolicy", "AWS::IAM::RolePolicyAttachment"]],
  ["IAM_INSTANCE_PROFILE", ["AWS::IAM::InstanceProfile"]],
  ["LAMBDA", ["AWS::Lambda::Function"]],
  ["LAMBDA_PERMISSION", ["AWS::Lambda::Permission"]],
  ["KMS_KEY", ["AWS::KMS::Key"]],
  ["KMS_ALIAS", ["AWS::KMS::Alias"]],
  ["API_GATEWAY_REST_API", ["AWS::ApiGateway::RestApi"]],
  ["API_GATEWAY_RESOURCE", ["AWS::ApiGateway::Resource"]],
  ["API_GATEWAY_METHOD", ["AWS::ApiGateway::Method"]],
  ["API_GATEWAY_INTEGRATION", ["AWS::ApiGateway::Integration"]],
  ["API_GATEWAY_DEPLOYMENT", ["AWS::ApiGateway::Deployment"]],
  ["API_GATEWAY_STAGE", ["AWS::ApiGateway::Stage"]]
]);
const SERVICE_ERROR_PRIORITY = new Map<ReverseEngineeringScanError["reason"], number>([
  ["permission_denied", 0],
  ["expired_credential", 1],
  ["not_configured", 2],
  ["invalid_region", 3],
  ["throttled", 4],
  ["provider_error", 5],
  ["unknown", 6]
]);

const DEFAULT_DEPENDENCIES: AwsDetailedReverseEngineeringReaderDependencies = {
  readIam: readDetailedIamResources,
  readLambda: readDetailedLambdaResources,
  readKms: readKmsWithDefaultClient,
  readApiGateway: (region, credentials) => readAwsApiGatewayRestTopology({ region, credentials })
};

/**
 * gg: 정식 상세 reader를 선택 범위대로 한 번씩 실행하고 정확한 AWS 값은 server-only 경계에 합칩니다.
 */
export async function readAwsDetailedReverseEngineeringResources(
  input: AwsProviderScanInput,
  credentials: TerraformAwsCredentialEnv,
  dependencies: AwsDetailedReverseEngineeringReaderDependencies = DEFAULT_DEPENDENCIES
): Promise<AwsProviderDiscoveryResult> {
  const reads: Array<Promise<AwsProviderDiscoveryResult>> = [];

  if (shouldReadDetailedFamily(input, IAM_RESOURCE_TYPES)) {
    reads.push(
      dependencies
        .readIam(input.region, credentials)
        .then(toIamDiscoveryResult)
        .catch(() => createThrownReaderFailure("IAM_ROLE", "iam"))
    );
  }
  if (shouldReadDetailedFamily(input, LAMBDA_RESOURCE_TYPES)) {
    reads.push(
      dependencies
        .readLambda(input.region, credentials)
        .then(toLambdaDiscoveryResult)
        .catch(() => createThrownReaderFailure("LAMBDA", "lambda"))
    );
  }
  if (shouldReadDetailedFamily(input, KMS_RESOURCE_TYPES)) {
    reads.push(
      dependencies
        .readKms(input.region, credentials)
        .then(toKmsDiscoveryResult)
        .catch(() => createThrownReaderFailure("KMS_KEY", "kms"))
    );
  }
  if (shouldReadDetailedFamily(input, API_GATEWAY_RESOURCE_TYPES)) {
    reads.push(
      dependencies
        .readApiGateway(input.region, credentials)
        .then(toApiGatewayDiscoveryResult)
        .catch(() => createThrownReaderFailure("API_GATEWAY_REST_API", "api-gateway"))
    );
  }

  const results = await Promise.all(reads);
  const records = results.flatMap((result) => result.records);
  return {
    records: filterDetailedRecordsForSelection(input, records),
    scanErrors: deduplicateServiceErrors(results.flatMap((result) => result.scanErrors))
  };
}

/** gg: KMS SDK client도 다른 상세 reader와 같은 임시 credential 직접 주입 경계를 사용합니다. */
async function readKmsWithDefaultClient(
  region: string,
  credentials: TerraformAwsCredentialEnv
): Promise<AwsKmsReadResult> {
  const client = new KMSClient({
    region,
    credentials: {
      accessKeyId: credentials.AWS_ACCESS_KEY_ID,
      secretAccessKey: credentials.AWS_SECRET_ACCESS_KEY,
      ...(credentials.AWS_SESSION_TOKEN ? { sessionToken: credentials.AWS_SESSION_TOKEN } : {})
    }
  });

  return readKmsResources({
    region,
    client: {
      send: (command) => client.send(command as Parameters<KMSClient["send"]>[0])
    }
  });
}

/** gg: ALL 또는 family의 한 종류를 선택하면 해당 service topology 전체를 한 번 읽습니다. */
function shouldReadDetailedFamily(
  input: AwsProviderScanInput,
  familyResourceTypes: ReadonlySet<ResourceType>
): boolean {
  return (
    input.resourceTypes.includes("ALL") ||
    input.resourceTypes.some(
      (resourceType) => resourceType !== "ALL" && familyResourceTypes.has(resourceType)
    )
  );
}

/** gg: UI가 하위 항목을 parent scan으로 보낼 때는 family 전체를 시작점으로 잡고, raw 하위 요청은 기존처럼 dependency만 보존합니다. */
function filterDetailedRecordsForSelection(
  input: AwsProviderScanInput,
  records: readonly AwsDiscoveredResourceRecord[]
): AwsDiscoveredResourceRecord[] {
  if (input.resourceTypes.includes("ALL")) return [...records];

  const selectedProviderResourceTypes = new Set(
    input.resourceTypes.flatMap((resourceType) =>
      resourceType === "ALL" ? [] : (PROVIDER_RESOURCE_TYPES_BY_SELECTION.get(resourceType) ?? [])
    )
  );
  const recordsById = new Map(records.map((record) => [record.providerResourceId, record]));
  const includedIds = new Set(
    records
      .filter((record) =>
        isDetailedRecordSelectedForInput(record, input, selectedProviderResourceTypes)
      )
      .map((record) => record.providerResourceId)
  );
  const pendingIds = [...includedIds];

  for (let index = 0; index < pendingIds.length; index += 1) {
    const record = recordsById.get(pendingIds[index] as string);
    if (!record) continue;
    for (const relationship of record.relationships) {
      if (
        recordsById.has(relationship.targetProviderResourceId) &&
        !includedIds.has(relationship.targetProviderResourceId)
      ) {
        includedIds.add(relationship.targetProviderResourceId);
        pendingIds.push(relationship.targetProviderResourceId);
      }
    }
  }

  return records.filter((record) => includedIds.has(record.providerResourceId));
}

/** gg: parent scan 값은 Catalog가 정한 같은 family의 상세 record를 모두 포함시키되, raw child 요청은 정확한 provider type만 선택합니다. */
function isDetailedRecordSelectedForInput(
  record: AwsDiscoveredResourceRecord,
  input: AwsProviderScanInput,
  selectedProviderResourceTypes: ReadonlySet<string>
): boolean {
  if (selectedProviderResourceTypes.has(record.providerResourceType)) {
    return true;
  }

  const resourceType = resolveReverseEngineeringAwsProviderResourceType(
    record.providerResourceType
  );
  const scanSelection = resourceType
    ? getReverseEngineeringAwsScanSelection(resourceType)
    : undefined;

  return (
    scanSelection !== undefined &&
    input.resourceTypes.some(
      (selectedResourceType) =>
        selectedResourceType !== "ALL" && selectedResourceType === scanSelection
    )
  );
}

/** gg: IAM의 opaque join ID에 exact ARN·import ID·정책 문서를 서버 전용으로 연결합니다. */
function toIamDiscoveryResult(result: AwsDetailedIamReadResult): AwsProviderDiscoveryResult {
  return {
    records: attachServerOnlyDetails(result.records, result.serverOnlyDetails, (detail) =>
      readExactProviderResourceId(detail, ["resourceArn", "terraformImportId"])
    ),
    scanErrors: result.failures.map((failure) =>
      createSafeReaderError("IAM_ROLE", "iam", failure.outcome)
    )
  };
}

/** gg: Lambda 환경값과 정책 원문은 opaque 공개 record가 아니라 서버 전용 설정에만 연결합니다. */
function toLambdaDiscoveryResult(result: AwsDetailedLambdaReadResult): AwsProviderDiscoveryResult {
  return {
    records: attachServerOnlyDetails(result.records, result.serverOnlyDetails, (detail) =>
      readExactProviderResourceId(detail, ["functionArn", "terraformImportId"])
    ),
    scanErrors: result.failures.map((failure) =>
      createSafeReaderError("LAMBDA", "lambda", failure.outcome)
    )
  };
}

/** gg: KMS Key ID·Alias 이름·정책은 import용 private scan에만 합칩니다. */
function toKmsDiscoveryResult(result: AwsKmsReadResult): AwsProviderDiscoveryResult {
  return {
    records: attachServerOnlyDetails(result.records, result.serverOnlyDetails, (detail) =>
      readExactProviderResourceId(detail, ["keyId", "aliasName", "terraformImportId"])
    ),
    scanErrors: result.failures.map((failure) =>
      createSafeReaderError("KMS_KEY", "kms", failure.outcome)
    )
  };
}

/** gg: API Gateway parent/related topology를 공개 hash 관계로 만들고 exact composite ID는 숨깁니다. */
function toApiGatewayDiscoveryResult(
  result: AwsApiGatewayRestTopologyReadResult
): AwsProviderDiscoveryResult {
  const familyById = new Map(
    result.families.map((family) => [family.publicRestApiRecordId, family])
  );
  const serverOnlyById = new Map(
    result.serverOnlyRecords.map((record) => [record.publicRecordId, record])
  );
  const recordsById = new Map<string, AwsDiscoveredResourceRecord>(
    result.publicRecords.map((publicRecord) => {
      const family = familyById.get(publicRecord.familyRecordId);
      const serverOnly = serverOnlyById.get(publicRecord.recordId);
      const tagEvidence = createApiGatewayRestApiTagEvidence({
        catalogReadComplete: result.catalogReadComplete,
        familyReadComplete: family?.readComplete === true,
        providerResourceType: publicRecord.providerResourceType,
        serverOnlyConfig: serverOnly?.serverOnlyConfig
      });
      const record: AwsDiscoveredResourceRecord = {
        providerResourceType: publicRecord.providerResourceType,
        providerResourceId: publicRecord.recordId,
        displayName: publicRecord.displayName,
        region: publicRecord.region,
        config: {
          ...publicRecord.config,
          managementReady: family?.managementReady === true,
          reverseEngineeringDetailsComplete: family?.readComplete === true,
          reverseEngineeringDetailsVersion: 1,
          apiGatewayTopologyClassification: family?.classification ?? "incomplete",
          apiGatewayAdvancedFeatures: family?.advancedFeatures ?? [],
          ...tagEvidence.publicConfig
        },
        relationships: [
          ...publicRecord.relatedRecordIds.map((targetProviderResourceId) => ({
            type: "depends_on" as const,
            targetProviderResourceId
          })),
          ...(publicRecord.parentRecordId
            ? [
                {
                  type: "contains" as const,
                  targetProviderResourceId: publicRecord.parentRecordId
                }
              ]
            : [])
        ],
        ...(serverOnly
          ? {
              serverOnly: {
                providerResourceId: serverOnly.terraformImportId,
                terraformImportId: serverOnly.terraformImportId,
                config: {
                  ...serverOnly.serverOnlyConfig,
                  ...tagEvidence.serverOnlyConfig,
                  parentProviderResourceType: serverOnly.parentProviderResourceType,
                  parentTerraformImportId: serverOnly.parentTerraformImportId,
                  relatedTerraformImportIdentities: serverOnly.relatedTerraformImportIdentities
                }
              }
            }
          : {})
      };
      return [publicRecord.recordId, record];
    })
  );

  return {
    records: [...recordsById.values()],
    scanErrors: result.failures.map((failure) =>
      createSafeReaderError("API_GATEWAY_REST_API", "api-gateway", failure.outcome)
    )
  };
}

/** gg: REST API tag는 catalog와 family가 모두 완전할 때만 공개 sanitizer의 완료 evidence로 넘깁니다. */
function createApiGatewayRestApiTagEvidence(input: {
  readonly catalogReadComplete: boolean;
  readonly familyReadComplete: boolean;
  readonly providerResourceType: string;
  readonly serverOnlyConfig: Readonly<Record<string, unknown>> | undefined;
}): {
  readonly publicConfig: Readonly<Record<string, unknown>>;
  readonly serverOnlyConfig: Readonly<Record<string, unknown>>;
} {
  if (input.providerResourceType !== "AWS::ApiGateway::RestApi") {
    return { publicConfig: {}, serverOnlyConfig: {} };
  }

  const tags = readStringMap(input.serverOnlyConfig?.["tags"]);
  const tagsReadComplete = input.catalogReadComplete && input.familyReadComplete && tags !== null;

  return {
    publicConfig: tagsReadComplete ? { tags, tagsReadComplete: true } : { tagsReadComplete: false },
    serverOnlyConfig: { tagsReadComplete }
  };
}

/** gg: AWS tag map이 전부 문자열일 때만 손실 없는 완료 evidence로 인정합니다. */
function readStringMap(value: unknown): Record<string, string> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const entries = Object.entries(value);
  return entries.every(([key, tagValue]) => key.trim().length > 0 && typeof tagValue === "string")
    ? Object.fromEntries(entries)
    : null;
}

/** gg: 상세 결과 join key와 공개 record ID를 맞춘 뒤 원문 detail을 복제해 공유 객체 변이를 막습니다. */
function attachServerOnlyDetails<
  TDetail extends { readonly providerResourceId: string; readonly terraformImportId: string }
>(
  records: readonly AwsDiscoveredResourceRecord[],
  details: readonly TDetail[],
  resolveExactProviderResourceId: (detail: TDetail) => string
): AwsDiscoveredResourceRecord[] {
  const detailsById = new Map(details.map((detail) => [detail.providerResourceId, detail]));
  return records.map((record) => {
    const detail = detailsById.get(record.providerResourceId);
    if (!detail) return record;
    return {
      ...record,
      serverOnly: {
        providerResourceId: resolveExactProviderResourceId(detail),
        terraformImportId: detail.terraformImportId,
        config: { ...detail }
      }
    };
  });
}

/** gg: reader detail 안의 exact 식별자 후보를 우선순위대로 읽고 마지막에는 import ID를 사용합니다. */
function readExactProviderResourceId(
  detail: Readonly<Record<string, unknown>>,
  keys: readonly string[]
): string {
  for (const key of keys) {
    const value = detail[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  throw new Error("Detailed AWS reader omitted its private provider identity.");
}

/** gg: SDK 원문과 resource ID를 버리고 service·reason만 고정된 부분 실패 문장으로 변환합니다. */
function createSafeReaderError(
  resourceType: ResourceType,
  serviceKey: string,
  outcome: string
): ReverseEngineeringScanError {
  const reason = normalizeReaderFailureReason(outcome);
  return {
    id: `scan-error-service-${serviceKey}`,
    serviceKey,
    resourceType,
    stage: "provider_api",
    reason,
    message:
      reason === "permission_denied"
        ? "이 서비스를 읽을 권한이 부족합니다."
        : reason === "expired_credential"
          ? "AWS 연결 확인이 필요합니다."
          : reason === "invalid_region"
            ? "선택한 AWS Region을 확인해 주세요."
            : reason === "throttled"
              ? "AWS 요청이 잠시 제한되었습니다."
              : "이 서비스를 읽지 못했습니다.",
    retryable: reason === "throttled" || reason === "provider_error"
  };
}

/** gg: 각 SDK reader의 safe outcome vocabulary를 공용 scan reason으로 좁힙니다. */
function normalizeReaderFailureReason(outcome: string): ReverseEngineeringScanError["reason"] {
  switch (outcome) {
    case "permission_denied":
    case "not_configured":
    case "invalid_region":
    case "expired_credential":
    case "throttled":
      return outcome;
    default:
      return "provider_error";
  }
}

/** gg: reader 자체가 throw해도 다른 서비스 결과를 살리고 공개 오류에는 원문을 남기지 않습니다. */
function createThrownReaderFailure(
  resourceType: ResourceType,
  serviceKey: string
): AwsProviderDiscoveryResult {
  return {
    records: [],
    scanErrors: [createSafeReaderError(resourceType, serviceKey, "transient")]
  };
}

/** gg: 같은 서비스의 실패는 사용자가 먼저 조치할 수 있는 원인을 우선해 한 번만 보여줍니다. */
function deduplicateServiceErrors(
  scanErrors: readonly ReverseEngineeringScanError[]
): ReverseEngineeringScanError[] {
  const selectedByService = new Map<string, ReverseEngineeringScanError>();
  for (const error of scanErrors) {
    const key = error.serviceKey ?? error.id;
    const selected = selectedByService.get(key);
    if (
      !selected ||
      (SERVICE_ERROR_PRIORITY.get(error.reason) ?? Number.MAX_SAFE_INTEGER) <
        (SERVICE_ERROR_PRIORITY.get(selected.reason) ?? Number.MAX_SAFE_INTEGER)
    ) {
      selectedByService.set(key, error);
    }
  }
  return [...selectedByService.values()];
}
