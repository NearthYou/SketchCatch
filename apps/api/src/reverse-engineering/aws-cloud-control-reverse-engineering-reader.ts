import {
  CloudControlClient,
  GetResourceCommand,
  ListResourcesCommand,
  type GetResourceCommandOutput,
  type ListResourcesCommandOutput,
  type ResourceDescription
} from "@aws-sdk/client-cloudcontrol";
import type { ReverseEngineeringScanError } from "@sketchcatch/types";
import type { TerraformAwsCredentialEnv } from "../aws-connections/aws-connection-runtime-credentials.js";
import type {
  AwsDiscoveredResourceRecord,
  AwsProviderDiscoveryResult
} from "./aws-provider-adapter.js";

export type AwsCloudControlReadClient = {
  send(command: object): Promise<unknown>;
};

export type AwsCloudControlReadClientFactory = (
  region: string,
  credentials: TerraformAwsCredentialEnv
) => AwsCloudControlReadClient;

export type AwsCloudControlReverseEngineeringInput = {
  readonly providerResourceTypes: readonly string[];
  readonly region: string;
};

type CloudControlReadEvidence = {
  readonly description: ResourceDescription;
  readonly detailReadComplete: boolean;
  readonly detailFailure?: { readonly error: unknown };
};

const CLOUD_CONTROL_LIST_RESOURCES_ACTION = "cloudformation:ListResources";
const CLOUD_CONTROL_GET_RESOURCE_ACTION = "cloudformation:GetResource";
const CLOUD_CONTROL_LIST_CAPABILITY_ERROR_CODES = new Set([
  "unsupportedactionexception",
  "typenotfoundexception"
]);

/** gg: Cloud Control 지원 종류를 하나씩 격리해 한 종류가 실패해도 다른 AWS 리소스를 보존합니다. */
export async function readAwsCloudControlReverseEngineeringResources(
  input: AwsCloudControlReverseEngineeringInput,
  credentials: TerraformAwsCredentialEnv,
  createClient: AwsCloudControlReadClientFactory = createDefaultCloudControlReadClient
): Promise<AwsProviderDiscoveryResult> {
  const client = createClient(input.region, credentials);
  const records: AwsDiscoveredResourceRecord[] = [];
  const scanErrors: ReverseEngineeringScanError[] = [];

  for (const providerResourceType of [...new Set(input.providerResourceTypes)].sort()) {
    try {
      const descriptions = await listAllCloudControlResources(client, providerResourceType);
      for (const description of descriptions) {
        const evidence = await readCloudControlResourceDetails(
          client,
          providerResourceType,
          description
        );
        if (evidence.detailFailure) {
          scanErrors.push(
            createCloudControlScanError(
              evidence.detailFailure.error,
              providerResourceType,
              CLOUD_CONTROL_GET_RESOURCE_ACTION
            )
          );
        }
        const record = createCloudControlResourceRecord(
          providerResourceType,
          input.region,
          evidence
        );
        if (record) records.push(record);
      }
    } catch (error) {
      // Cloud Control registry에 없거나 LIST handler가 없는 종류는 IAM 권한을 더해도 읽을 수 없습니다.
      // 이 reader는 보조 inventory이므로, 아직 발견하지 못한 리소스를 "권한 부족" 또는 "재시도"로
      // 오인하지 않고 다른 reader 결과만 계속 보존합니다.
      if (isCloudControlListCapabilityUnavailable(error)) {
        continue;
      }
      scanErrors.push(
        createCloudControlScanError(
          error,
          providerResourceType,
          CLOUD_CONTROL_LIST_RESOURCES_ACTION
        )
      );
    }
  }

  return { records, scanErrors };
}

/** gg: opaque pagination token을 그대로 전달하고 반복 token에서는 앞 page 결과만 유지합니다. */
async function listAllCloudControlResources(
  client: AwsCloudControlReadClient,
  providerResourceType: string
): Promise<ResourceDescription[]> {
  const descriptions: ResourceDescription[] = [];
  const seenTokens = new Set<string>();
  let nextToken: string | undefined;

  do {
    const response = (await client.send(
      new ListResourcesCommand({
        TypeName: providerResourceType,
        ...(nextToken ? { NextToken: nextToken } : {})
      })
    )) as ListResourcesCommandOutput;
    descriptions.push(...(response.ResourceDescriptions ?? []));
    const candidate =
      typeof response.NextToken === "string" && response.NextToken.length > 0
        ? response.NextToken
        : undefined;
    if (candidate && seenTokens.has(candidate)) break;
    if (candidate) seenTokens.add(candidate);
    nextToken = candidate;
  } while (nextToken);

  return descriptions;
}

/** gg: 목록의 식별자로 상세 model을 다시 읽되 상세 실패 시 목록에서 확인한 존재는 버리지 않습니다. */
async function readCloudControlResourceDetails(
  client: AwsCloudControlReadClient,
  providerResourceType: string,
  listed: ResourceDescription
): Promise<CloudControlReadEvidence> {
  const identifier = readNonEmptyString(listed.Identifier);
  if (!identifier) {
    return { description: listed, detailReadComplete: false };
  }

  try {
    const response = (await client.send(
      new GetResourceCommand({
        TypeName: providerResourceType,
        Identifier: identifier
      })
    )) as GetResourceCommandOutput;
    const detailed = response.ResourceDescription;
    return detailed
      ? {
          description: {
            Identifier: detailed.Identifier ?? identifier,
            Properties: detailed.Properties ?? listed.Properties
          },
          detailReadComplete: parseCloudControlProperties(
            detailed.Properties ?? listed.Properties
          ) !== null
        }
      : {
          description: listed,
          detailReadComplete: false
        };
  } catch (error) {
    return {
      description: listed,
      detailReadComplete: false,
      detailFailure: { error }
    };
  }
}

/** gg: 공통 model은 인벤토리와 그룹화에만 쓰고 전용 Terraform 변환이 없으면 관리 가능으로 승격하지 않습니다. */
function createCloudControlResourceRecord(
  providerResourceType: string,
  region: string,
  evidence: CloudControlReadEvidence
): AwsDiscoveredResourceRecord | null {
  const identifier = readNonEmptyString(evidence.description.Identifier);
  if (!identifier) return null;
  const properties = parseCloudControlProperties(evidence.description.Properties);
  const readComplete = evidence.detailReadComplete && properties !== null;
  const tags = normalizeCloudControlTags(properties?.["Tags"]);

  return {
    providerResourceType,
    providerResourceId: identifier,
    displayName: createCloudControlDisplayName(properties, identifier),
    region,
    config: {
      cloudControlReadComplete: readComplete,
      managementReady: false,
      reverseEngineeringDetailsComplete: false,
      reverseEngineeringDetailsVersion: 1,
      reverseEngineeringIncompleteDetails: ["terraform_mapping"],
      ...(tags.length > 0 ? { tags } : {})
    },
    relationships: [],
    serverOnly: {
      ...(readComplete ? { terraformImportId: identifier } : {}),
      ...(properties ? { config: { cloudControlProperties: properties } } : {})
    }
  };
}

/** gg: Cloud Control JSON 원문이 객체일 때만 상세 설정 근거로 인정합니다. */
function parseCloudControlProperties(value: string | undefined): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** gg: Project·Service·Environment Tag를 표시 프레임 생성에 재사용할 수 있게 같은 형태로 줄입니다. */
function normalizeCloudControlTags(value: unknown): Array<{ key: string; value: string }> {
  if (Array.isArray(value)) {
    return value.flatMap((tag) => {
      if (!isRecord(tag)) return [];
      const key = tag["Key"] ?? tag["key"];
      const tagValue = tag["Value"] ?? tag["value"];
      return typeof key === "string" && typeof tagValue === "string"
        ? [{ key, value: tagValue }]
        : [];
    });
  }

  return isRecord(value)
    ? Object.entries(value).flatMap(([key, tagValue]) =>
        typeof tagValue === "string" ? [{ key, value: tagValue }] : []
      )
    : [];
}

/** gg: 긴 식별자 대신 AWS model의 사람이 붙인 이름을 우선해 보드 label을 만듭니다. */
function createCloudControlDisplayName(
  properties: Record<string, unknown> | null,
  identifier: string
): string {
  const tags = normalizeCloudControlTags(properties?.["Tags"]);
  const tagName = tags.find((tag) => tag.key.toLowerCase() === "name")?.value;
  if (tagName) return tagName;

  for (const key of [
    "Name",
    "TableName",
    "QueueName",
    "TopicName",
    "FunctionName",
    "RoleName",
    "ClusterName",
    "DBInstanceIdentifier",
    "DBClusterIdentifier",
    "RepositoryName",
    "LogGroupName",
    "DomainName"
  ]) {
    const value = readNonEmptyString(properties?.[key]);
    if (value) return value;
  }

  return identifier.split(/[/:|]/u).filter(Boolean).at(-1) ?? identifier;
}

/** gg: Provider 오류 원문 없이 권한·재시도 여부만 공통 부분 실패로 전달합니다. */
function createCloudControlScanError(
  error: unknown,
  providerResourceType: string,
  failedAwsApiAction:
    | typeof CLOUD_CONTROL_LIST_RESOURCES_ACTION
    | typeof CLOUD_CONTROL_GET_RESOURCE_ACTION
): ReverseEngineeringScanError {
  const classifier = [
    isRecord(error) ? error["name"] : undefined,
    isRecord(error) ? error["code"] : undefined,
    error instanceof Error ? error.message : undefined
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  const reason: ReverseEngineeringScanError["reason"] =
    classifier.includes("accessdenied") || classifier.includes("not authorized")
      ? "permission_denied"
      : classifier.includes("expiredtoken")
        ? "expired_credential"
        : classifier.includes("throttl") || classifier.includes("rate exceeded")
          ? "throttled"
          : "provider_error";

  return {
    id: "scan-error-service-cloud-control",
    serviceKey: "cloud-control",
    affectedProviderResourceTypes: [providerResourceType],
    failedAwsApiActions: [failedAwsApiAction],
    resourceType: "UNKNOWN",
    stage: "provider_api",
    reason,
    message:
      reason === "permission_denied"
        ? "일부 AWS 종류를 읽을 권한이 부족합니다."
        : reason === "expired_credential"
          ? "AWS 연결 확인이 필요합니다."
          : reason === "throttled"
            ? "AWS 요청이 잠시 제한되었습니다."
            : "일부 AWS 종류를 읽지 못했습니다.",
    retryable: reason === "throttled" || reason === "provider_error"
  };
}

/** gg: List handler 자체가 없는 registry type만 정확한 SDK code로 분리하고, 일반 provider 오류는 숨기지 않습니다. */
function isCloudControlListCapabilityUnavailable(error: unknown): boolean {
  const errorRecord = isRecord(error) ? error : undefined;
  const errorCodes = [
    errorRecord?.["name"],
    errorRecord?.["code"],
    errorRecord?.["Code"],
    error instanceof Error ? error.name : undefined
  ];

  return errorCodes.some(
    (code) =>
      typeof code === "string" &&
      CLOUD_CONTROL_LIST_CAPABILITY_ERROR_CODES.has(code.trim().toLowerCase())
  );
}

/** gg: 검증된 Role의 임시 credential만 Cloud Control SDK에 전달합니다. */
function createDefaultCloudControlReadClient(
  region: string,
  credentials: TerraformAwsCredentialEnv
): AwsCloudControlReadClient {
  const client = new CloudControlClient({
    region,
    credentials: {
      accessKeyId: credentials.AWS_ACCESS_KEY_ID,
      secretAccessKey: credentials.AWS_SECRET_ACCESS_KEY,
      ...(credentials.AWS_SESSION_TOKEN
        ? { sessionToken: credentials.AWS_SESSION_TOKEN }
        : {})
    }
  });

  return {
    send: (command) => client.send(command as Parameters<CloudControlClient["send"]>[0])
  };
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
