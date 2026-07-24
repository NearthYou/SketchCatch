import {
  ApplicationAutoScalingClient,
  DescribeScalableTargetsCommand,
  DescribeScalingPoliciesCommand,
  ListTagsForResourceCommand as ListApplicationAutoScalingTagsForResourceCommand,
  type ScalableTarget,
  type ScalingPolicy
} from "@aws-sdk/client-application-auto-scaling";
import {
  CloudFrontClient,
  GetOriginAccessControlCommand,
  ListOriginAccessControlsCommand,
  type OriginAccessControl,
  type OriginAccessControlSummary
} from "@aws-sdk/client-cloudfront";
import {
  DescribeRepositoriesCommand,
  ECRClient,
  ListTagsForResourceCommand as ListEcrTagsForResourceCommand,
  type Repository
} from "@aws-sdk/client-ecr";
import {
  DescribeSecretCommand,
  ListSecretsCommand,
  SecretsManagerClient,
  type DescribeSecretCommandOutput,
  type SecretListEntry
} from "@aws-sdk/client-secrets-manager";
import type { ResourceType, ReverseEngineeringScanError } from "@sketchcatch/types";
import type { TerraformAwsCredentialEnv } from "../aws-connections/aws-connection-runtime-credentials.js";
import type {
  AwsDiscoveredResourceRecord,
  AwsProviderDiscoveryResult,
  AwsProviderScanInput
} from "./aws-provider-adapter.js";

export type AwsDeploymentSupportReadClient = {
  send(command: object): Promise<unknown>;
};

export type AwsDeploymentSupportReaderDependencies = {
  readonly createApplicationAutoScalingClient?: (
    region: string,
    credentials: TerraformAwsCredentialEnv
  ) => AwsDeploymentSupportReadClient;
  readonly createEcrClient?: (
    region: string,
    credentials: TerraformAwsCredentialEnv
  ) => AwsDeploymentSupportReadClient;
  readonly createSecretsManagerClient?: (
    region: string,
    credentials: TerraformAwsCredentialEnv
  ) => AwsDeploymentSupportReadClient;
  readonly createCloudFrontClient?: (
    region: string,
    credentials: TerraformAwsCredentialEnv
  ) => AwsDeploymentSupportReadClient;
};

type AwsDeploymentSupportFamilyRead = {
  readonly resourceType: ResourceType;
  readonly serviceKey: string;
  readonly read: () => Promise<AwsProviderDiscoveryResult>;
};

type AwsDeploymentSupportPageResult<T> = {
  readonly items: T[];
  readonly failure?: unknown;
};

type AwsDeploymentSupportRecordRead = {
  readonly record: AwsDiscoveredResourceRecord | null;
  readonly failure?: unknown;
};

const DEPLOYMENT_SUPPORT_DETAIL_CONCURRENCY = 5;

/** gg: 배포 결과를 다시 편집할 때 필요한 metadata reader만 선택해 실행하고 Secret 값은 읽지 않습니다. */
export async function readAwsDeploymentSupportReverseEngineeringResources(
  input: AwsProviderScanInput,
  credentials: TerraformAwsCredentialEnv,
  dependencies: AwsDeploymentSupportReaderDependencies = {}
): Promise<AwsProviderDiscoveryResult> {
  const reads: AwsDeploymentSupportFamilyRead[] = [];

  if (shouldReadApplicationAutoScaling(input)) {
    const client = (
      dependencies.createApplicationAutoScalingClient ?? createDefaultApplicationAutoScalingClient
    )(input.region, credentials);
    reads.push({
      resourceType: "APPLICATION_AUTO_SCALING_TARGET",
      serviceKey: "application-autoscaling",
      read: () => listApplicationAutoScalingResources(input.region, client)
    });
  }

  if (shouldRead(input, "ECR_REPOSITORY")) {
    const client = (dependencies.createEcrClient ?? createDefaultEcrClient)(
      input.region,
      credentials
    );
    reads.push({
      resourceType: "ECR_REPOSITORY",
      serviceKey: "ecr",
      read: () => listEcrRepositories(input.region, client)
    });
  }

  if (shouldRead(input, "SECRETS_MANAGER_SECRET")) {
    const client = (dependencies.createSecretsManagerClient ?? createDefaultSecretsManagerClient)(
      input.region,
      credentials
    );
    reads.push({
      resourceType: "SECRETS_MANAGER_SECRET",
      serviceKey: "secretsmanager",
      read: () => listSecretsManagerSecrets(input.region, client)
    });
  }

  if (shouldRead(input, "CLOUDFRONT")) {
    const client = (dependencies.createCloudFrontClient ?? createDefaultCloudFrontClient)(
      input.region,
      credentials
    );
    reads.push({
      resourceType: "CLOUDFRONT",
      serviceKey: "cloudfront",
      read: () => listCloudFrontOriginAccessControls(input.region, client)
    });
  }

  const results = await Promise.all(reads.map(readDeploymentSupportFamily));
  return {
    records: results.flatMap((result) => result.records),
    scanErrors: results.flatMap((result) => result.scanErrors)
  };
}

/** gg: Application Auto Scaling Target과 연결된 Policy를 같은 snapshot에서 읽습니다. */
async function listApplicationAutoScalingResources(
  region: string,
  client: AwsDeploymentSupportReadClient
): Promise<AwsProviderDiscoveryResult> {
  const targetPages = await collectPages<ScalableTarget>(async (nextToken) => {
    const output = (await client.send(
      new DescribeScalableTargetsCommand({
        ServiceNamespace: "ecs",
        MaxResults: 50,
        ...(nextToken ? { NextToken: nextToken } : {})
      })
    )) as { ScalableTargets?: ScalableTarget[]; NextToken?: string };
    return { items: output.ScalableTargets ?? [], nextToken: output.NextToken };
  });

  const records: AwsDiscoveredResourceRecord[] = [];
  const scanErrors = targetPages.failure
    ? [
        createSafeScanError(
          "APPLICATION_AUTO_SCALING_TARGET",
          "application-autoscaling",
          targetPages.failure
        )
      ]
    : [];
  for (const target of targetPages.items) {
    const targetRead = await toApplicationAutoScalingTargetRecord(target, region, client);
    if (targetRead.failure) {
      scanErrors.push(
        createSafeScanError(
          "APPLICATION_AUTO_SCALING_TARGET",
          "application-autoscaling",
          targetRead.failure
        )
      );
    }
    const targetRecord = targetRead.record;
    if (!targetRecord) continue;
    records.push(targetRecord);

    const policyPages = await collectPages<ScalingPolicy>(async (nextToken) => {
      const output = (await client.send(
        new DescribeScalingPoliciesCommand({
          ServiceNamespace: target.ServiceNamespace,
          ResourceId: target.ResourceId,
          ScalableDimension: target.ScalableDimension,
          MaxResults: 50,
          ...(nextToken ? { NextToken: nextToken } : {})
        })
      )) as { ScalingPolicies?: ScalingPolicy[]; NextToken?: string };
      return { items: output.ScalingPolicies ?? [], nextToken: output.NextToken };
    });
    if (policyPages.failure) {
      scanErrors.push(
        createSafeScanError(
          "APPLICATION_AUTO_SCALING_POLICY",
          "application-autoscaling",
          policyPages.failure
        )
      );
    }
    for (const policy of policyPages.items) {
      const policyRecord = await toApplicationAutoScalingPolicyRecord(
        policy,
        targetRecord.providerResourceId,
        region
      );
      if (policyRecord) records.push(policyRecord);
    }
  }

  return { records, scanErrors };
}

/** gg: ECS 서비스 자동 확장 Target의 exact identity와 제한값만 정규화합니다. */
async function toApplicationAutoScalingTargetRecord(
  target: ScalableTarget,
  region: string,
  client: AwsDeploymentSupportReadClient
): Promise<AwsDeploymentSupportRecordRead> {
  const serviceNamespace = target.ServiceNamespace;
  const resourceId = target.ResourceId;
  const scalableDimension = target.ScalableDimension;
  if (
    serviceNamespace !== "ecs" ||
    !resourceId?.startsWith("service/") ||
    scalableDimension !== "ecs:service:DesiredCount"
  ) {
    return { record: null };
  }

  const importId = `${serviceNamespace}/${resourceId}/${scalableDimension}`;
  const providerResourceId = target.ScalableTargetARN ?? importId;
  const roleArn =
    typeof target.RoleARN === "string" && target.RoleARN.trim().length > 0
      ? target.RoleARN
      : undefined;
  const tags = target.ScalableTargetARN
    ? await readApplicationAutoScalingTags(client, target.ScalableTargetARN)
    : { complete: false, value: [] };

  return {
    record: {
      providerResourceType: "AWS::ApplicationAutoScaling::ScalableTarget",
      providerResourceId,
      displayName: `${readEcsServiceName(resourceId)} 자동 확장`,
      region,
      config: {
        serviceNamespace,
        resourceId,
        scalableDimension,
        minCapacity: target.MinCapacity,
        maxCapacity: target.MaxCapacity,
        hasRoleArn: roleArn !== undefined,
        suspendedState: normalizeSuspendedState(target.SuspendedState),
        tags: tags.value,
        tagsReadComplete: tags.complete
      },
      relationships: [],
      serverOnly: {
        terraformImportId: importId,
        config: {
          ...(roleArn ? { roleArn } : {}),
          tags: tags.value,
          tagsReadComplete: tags.complete
        }
      }
    },
    ...(tags.failure ? { failure: tags.failure } : {})
  };
}

/** gg: Target Tracking Policy만 자동 관리에 필요한 형태로 보존하고 Target 관계를 명시합니다. */
async function toApplicationAutoScalingPolicyRecord(
  policy: ScalingPolicy,
  targetProviderResourceId: string,
  region: string
): Promise<AwsDiscoveredResourceRecord | null> {
  const policyName = policy.PolicyName;
  const serviceNamespace = policy.ServiceNamespace;
  const resourceId = policy.ResourceId;
  const scalableDimension = policy.ScalableDimension;
  if (!policyName || !serviceNamespace || !resourceId || !scalableDimension) return null;

  const importId = `${serviceNamespace}/${resourceId}/${scalableDimension}/${policyName}`;
  const providerResourceId = policy.PolicyARN ?? importId;

  return {
    providerResourceType: "AWS::ApplicationAutoScaling::ScalingPolicy",
    providerResourceId,
    displayName: humanizeScalingPolicyName(policyName),
    region,
    config: {
      policyName,
      policyType: policy.PolicyType,
      serviceNamespace,
      resourceId,
      scalableDimension,
      targetTrackingScalingPolicyConfiguration: normalizeTargetTrackingPolicy(
        policy.TargetTrackingScalingPolicyConfiguration
      )
    },
    relationships: [{ type: "depends_on", targetProviderResourceId }],
    serverOnly: { terraformImportId: importId }
  };
}

/** gg: ECR Repository의 생성 인수와 전체 tag만 읽어 이미지 내용은 조회하지 않습니다. */
async function listEcrRepositories(
  region: string,
  client: AwsDeploymentSupportReadClient
): Promise<AwsProviderDiscoveryResult> {
  const pages = await collectPages<Repository>(async (nextToken) => {
    const output = (await client.send(
      new DescribeRepositoriesCommand({ maxResults: 100, ...(nextToken ? { nextToken } : {}) })
    )) as { repositories?: Repository[]; nextToken?: string };
    return { items: output.repositories ?? [], nextToken: output.nextToken };
  });

  const recordReads = await mapWithFixedConcurrency(
    pages.items.filter(
      (repository) => Boolean(repository.repositoryArn) && Boolean(repository.repositoryName)
    ),
    (repository) => toEcrRepositoryRecord(repository, region, client)
  );
  return {
    records: recordReads.map((read) => read.record).filter((record) => record !== null),
    scanErrors: [
      ...(pages.failure ? [createSafeScanError("ECR_REPOSITORY", "ecr", pages.failure)] : []),
      ...recordReads.flatMap((read) =>
        read.failure ? [createSafeScanError("ECR_REPOSITORY", "ecr", read.failure)] : []
      )
    ]
  };
}

/** gg: Repository URL은 표시용으로만 두고 import는 AWS Repository 이름으로 고정합니다. */
async function toEcrRepositoryRecord(
  repository: Repository,
  region: string,
  client: AwsDeploymentSupportReadClient
): Promise<AwsDeploymentSupportRecordRead> {
  const repositoryArn = repository.repositoryArn!;
  const repositoryName = repository.repositoryName!;
  const tags = await readOptionalTags(async () => {
    const output = (await client.send(
      new ListEcrTagsForResourceCommand({ resourceArn: repositoryArn })
    )) as { tags?: Array<{ Key?: string; Value?: string }> };
    return normalizeListTags(output.tags);
  });

  const privateConfig = {
    repositoryName,
    imageTagMutability: repository.imageTagMutability,
    scanOnPush: repository.imageScanningConfiguration?.scanOnPush,
    encryptionType: repository.encryptionConfiguration?.encryptionType,
    hasKmsKey: Boolean(repository.encryptionConfiguration?.kmsKey),
    tags: tags.value,
    tagsReadComplete: tags.complete,
    ...(repository.encryptionConfiguration?.kmsKey
      ? { kmsKey: repository.encryptionConfiguration.kmsKey }
      : {})
  };

  return {
    record: {
      providerResourceType: "AWS::ECR::Repository",
      providerResourceId: repositoryArn,
      displayName: repositoryName,
      region,
      config: {
        repositoryName,
        imageTagMutability: repository.imageTagMutability,
        scanOnPush: repository.imageScanningConfiguration?.scanOnPush,
        encryptionType: repository.encryptionConfiguration?.encryptionType,
        hasKmsKey: Boolean(repository.encryptionConfiguration?.kmsKey),
        tags: tags.value,
        tagsReadComplete: tags.complete
      },
      relationships: [],
      serverOnly: {
        terraformImportId: repositoryName,
        config: {
          ...privateConfig,
          repositoryUri: repository.repositoryUri
        }
      }
    },
    ...(tags.failure ? { failure: tags.failure } : {})
  };
}

/** gg: Secrets Manager는 이름과 설정 metadata만 읽고 GetSecretValue 계열 API를 호출하지 않습니다. */
async function listSecretsManagerSecrets(
  region: string,
  client: AwsDeploymentSupportReadClient
): Promise<AwsProviderDiscoveryResult> {
  const pages = await collectPages<SecretListEntry>(async (nextToken) => {
    const output = (await client.send(
      new ListSecretsCommand({ MaxResults: 100, ...(nextToken ? { NextToken: nextToken } : {}) })
    )) as { SecretList?: SecretListEntry[]; NextToken?: string };
    return { items: output.SecretList ?? [], nextToken: output.NextToken };
  });

  const recordReads = await mapWithFixedConcurrency(pages.items, async (summary) => {
      const secretId = summary.ARN ?? summary.Name;
      if (!secretId) return { record: null } satisfies AwsDeploymentSupportRecordRead;
      try {
        const detail = (await client.send(
          new DescribeSecretCommand({ SecretId: secretId })
        )) as DescribeSecretCommandOutput;
        return { record: toSecretsManagerRecord(detail, summary, region) };
      } catch (error) {
        return {
          record: toSecretsManagerRecord(summary, summary, region, false),
          failure: error
        };
      }
    });

  return {
    records: recordReads
      .map((read) => read.record)
      .filter((record): record is AwsDiscoveredResourceRecord => record !== null),
    scanErrors: [
      ...(pages.failure
        ? [createSafeScanError("SECRETS_MANAGER_SECRET", "secretsmanager", pages.failure)]
        : []),
      ...recordReads.flatMap((read) =>
        read.failure
          ? [createSafeScanError("SECRETS_MANAGER_SECRET", "secretsmanager", read.failure)]
          : []
      )
    ]
  };
}

/** gg: Secret 값 대신 회전·복제·삭제 여부만 보존해 관리 가능 여부를 fail-close 합니다. */
function toSecretsManagerRecord(
  detail: DescribeSecretCommandOutput | SecretListEntry,
  summary: SecretListEntry,
  region: string,
  metadataReadComplete = true
): AwsDiscoveredResourceRecord | null {
  const arn = detail.ARN ?? summary.ARN;
  const name = detail.Name ?? summary.Name;
  if (!arn || !name) return null;
  const tags = detail.Tags ?? summary.Tags ?? [];
  const kmsKeyId = "KmsKeyId" in detail ? detail.KmsKeyId : undefined;
  const description = "Description" in detail ? detail.Description : undefined;
  const primaryRegion = detail.PrimaryRegion ?? summary.PrimaryRegion;
  const replicationStatus =
    "ReplicationStatus" in detail && Array.isArray(detail.ReplicationStatus)
      ? detail.ReplicationStatus
      : undefined;
  const replicationReadComplete = metadataReadComplete && Array.isArray(replicationStatus);
  const isReplica = Boolean(primaryRegion && primaryRegion !== region);
  const normalizedTags = normalizeListTags(tags);

  return {
    providerResourceType: "AWS::SecretsManager::Secret",
    providerResourceId: arn,
    displayName: name,
    region,
    config: {
      name,
      description,
      hasKmsKey: Boolean(kmsKeyId),
      rotationEnabled: detail.RotationEnabled ?? false,
      ...(replicationReadComplete
        ? { replicaRegionCount: replicationStatus.length }
        : {}),
      replicationReadComplete,
      isReplica,
      serviceOwned: Boolean(detail.OwningService),
      deleted: Boolean(detail.DeletedDate),
      valueRead: false,
      metadataReadComplete,
      tags: normalizedTags,
      tagsReadComplete: metadataReadComplete
    },
    relationships: [],
    serverOnly: {
      terraformImportId: arn,
      config: {
        description,
        metadataReadComplete,
        replicationReadComplete,
        isReplica,
        ...(primaryRegion ? { primaryRegion } : {}),
        ...(replicationReadComplete
          ? { replicaRegionCount: replicationStatus.length }
          : {}),
        tags: normalizedTags,
        tagsReadComplete: metadataReadComplete,
        ...(kmsKeyId ? { kmsKeyId } : {})
      }
    }
  };
}

/** gg: CloudFront Origin Access Control을 Distribution과 별도 Terraform Resource로 읽습니다. */
async function listCloudFrontOriginAccessControls(
  region: string,
  client: AwsDeploymentSupportReadClient
): Promise<AwsProviderDiscoveryResult> {
  const pages = await collectPages<OriginAccessControlSummary>(async (marker) => {
    const output = (await client.send(
      new ListOriginAccessControlsCommand({ MaxItems: 100, ...(marker ? { Marker: marker } : {}) })
    )) as {
      OriginAccessControlList?: {
        Items?: OriginAccessControlSummary[];
        NextMarker?: string;
        IsTruncated?: boolean;
      };
    };
    const list = output.OriginAccessControlList;
    return {
      items: list?.Items ?? [],
      nextToken: list?.IsTruncated ? list.NextMarker : undefined
    };
  });

  const records: AwsDiscoveredResourceRecord[] = [];
  const scanErrors = pages.failure
    ? [createSafeScanError("CLOUDFRONT", "cloudfront", pages.failure)]
    : [];
  for (const summary of pages.items) {
    if (!summary.Id) continue;
    try {
      const output = (await client.send(new GetOriginAccessControlCommand({ Id: summary.Id }))) as {
        OriginAccessControl?: OriginAccessControl;
      };
      const record = toCloudFrontOriginAccessControlRecord(
        output.OriginAccessControl ?? summary,
        region
      );
      if (record) records.push(record);
    } catch (error) {
      const record = toCloudFrontOriginAccessControlRecord(summary, region);
      if (record) records.push(record);
      scanErrors.push(createSafeScanError("CLOUDFRONT", "cloudfront", error));
    }
  }
  return { records, scanErrors };
}

/** gg: OAC는 ID와 서명 설정만으로 완전한 Terraform block을 만들 수 있게 정규화합니다. */
function toCloudFrontOriginAccessControlRecord(
  originAccessControl: OriginAccessControl | OriginAccessControlSummary,
  region: string
): AwsDiscoveredResourceRecord | null {
  const id = originAccessControl.Id;
  const config =
    "Name" in originAccessControl
      ? {
          Name: originAccessControl.Name,
          Description: originAccessControl.Description,
          OriginAccessControlOriginType: originAccessControl.OriginAccessControlOriginType,
          SigningBehavior: originAccessControl.SigningBehavior,
          SigningProtocol: originAccessControl.SigningProtocol
        }
      : originAccessControl.OriginAccessControlConfig;
  if (!id || !config?.Name) return null;

  return {
    providerResourceType: "AWS::CloudFront::OriginAccessControl",
    providerResourceId: id,
    displayName: config.Name,
    region: "global",
    config: {
      id,
      name: config.Name,
      description: config.Description,
      originAccessControlOriginType: config.OriginAccessControlOriginType,
      signingBehavior: config.SigningBehavior,
      signingProtocol: config.SigningProtocol,
      scanRegion: region
    },
    relationships: [],
    serverOnly: { terraformImportId: id }
  };
}

/** gg: 대형 계정 상세 조회는 입력 순서를 보존하면서 작은 고정 동시성으로 제한합니다. */
async function mapWithFixedConcurrency<T, R>(
  items: readonly T[],
  read: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const workers = Array.from(
    { length: Math.min(DEPLOYMENT_SUPPORT_DETAIL_CONCURRENCY, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await read(items[index]!);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

/** gg: service 한 종류가 실패해도 다른 배포 지원 리소스 결과는 유지합니다. */
async function readDeploymentSupportFamily(
  family: AwsDeploymentSupportFamilyRead
): Promise<AwsProviderDiscoveryResult> {
  try {
    return await family.read();
  } catch (error) {
    return {
      records: [],
      scanErrors: [createSafeScanError(family.resourceType, family.serviceKey, error)]
    };
  }
}

/** gg: AWS 원문은 버리고 화면에 허용된 실패 종류만 남깁니다. */
function createSafeScanError(
  resourceType: ResourceType,
  serviceKey: string,
  error: unknown
): ReverseEngineeringScanError {
  const text = error instanceof Error ? `${error.name} ${error.message}`.toLowerCase() : "";
  const reason: ReverseEngineeringScanError["reason"] =
    text.includes("accessdenied") || text.includes("not authorized")
      ? "permission_denied"
      : text.includes("expiredtoken")
        ? "expired_credential"
        : text.includes("throttl") || text.includes("rate exceeded")
          ? "throttled"
          : "provider_error";
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
          : reason === "throttled"
            ? "AWS 요청이 잠시 제한되었습니다."
            : "이 서비스를 읽지 못했습니다.",
    retryable: reason === "throttled" || reason === "provider_error"
  };
}

/** gg: AWS pagination token을 반복 없이 끝까지 따라갑니다. */
async function collectPages<T>(
  readPage: (
    nextToken: string | undefined
  ) => Promise<{ items: readonly T[]; nextToken?: string | undefined }>
): Promise<AwsDeploymentSupportPageResult<T>> {
  const items: T[] = [];
  const seenTokens = new Set<string>();
  let nextToken: string | undefined;
  do {
    let page: { items: readonly T[]; nextToken?: string | undefined };
    try {
      page = await readPage(nextToken);
    } catch (error) {
      return { items, failure: error };
    }
    items.push(...page.items);
    nextToken = page.nextToken;
    if (nextToken && seenTokens.has(nextToken)) {
      return { items, failure: new Error("pagination token repeated") };
    }
    if (nextToken) seenTokens.add(nextToken);
  } while (nextToken);
  return { items };
}

/** gg: tag 조회 실패는 Resource 자체를 버리지 않고 관리 준비 상태만 닫습니다. */
async function readOptionalTags(
  read: () => Promise<Array<{ key: string; value: string }>>
): Promise<{
  complete: boolean;
  value: Array<{ key: string; value: string }>;
  failure?: unknown;
}> {
  try {
    return { complete: true, value: await read() };
  } catch (error) {
    return { complete: false, value: [], failure: error };
  }
}

/** gg: Application Auto Scaling tag map을 공통 tag 배열로 바꿉니다. */
async function readApplicationAutoScalingTags(
  client: AwsDeploymentSupportReadClient,
  resourceArn: string
): Promise<{
  complete: boolean;
  value: Array<{ key: string; value: string }>;
  failure?: unknown;
}> {
  return readOptionalTags(async () => {
    const output = (await client.send(
      new ListApplicationAutoScalingTagsForResourceCommand({ ResourceARN: resourceArn })
    )) as { Tags?: Record<string, string> };
    return Object.entries(output.Tags ?? {}).map(([key, value]) => ({ key, value }));
  });
}

/** gg: SDK tag의 비어 있는 key/value는 Terraform tag로 승격하지 않습니다. */
function normalizeListTags(
  tags: readonly { Key?: string | undefined; Value?: string | undefined }[] | undefined
): Array<{ key: string; value: string }> {
  return (tags ?? []).flatMap((tag) =>
    tag.Key && tag.Value !== undefined ? [{ key: tag.Key, value: tag.Value }] : []
  );
}

/** gg: SDK 대문자 SuspendedState를 Terraform 입력 이름으로 바꿉니다. */
function normalizeSuspendedState(value: ScalableTarget["SuspendedState"]): Record<string, boolean> {
  return {
    dynamicScalingInSuspended: value?.DynamicScalingInSuspended ?? false,
    dynamicScalingOutSuspended: value?.DynamicScalingOutSuspended ?? false,
    scheduledScalingSuspended: value?.ScheduledScalingSuspended ?? false
  };
}

/** gg: Target Tracking 설정만 allowlist해 Step/Predictive 설정을 섞지 않습니다. */
function normalizeTargetTrackingPolicy(
  value: ScalingPolicy["TargetTrackingScalingPolicyConfiguration"]
): Record<string, unknown> | undefined {
  if (!value) return undefined;
  const predefined = value.PredefinedMetricSpecification;
  return {
    targetValue: value.TargetValue,
    disableScaleIn: value.DisableScaleIn,
    scaleInCooldown: value.ScaleInCooldown,
    scaleOutCooldown: value.ScaleOutCooldown,
    predefinedMetricSpecification: predefined
      ? {
          predefinedMetricType: predefined.PredefinedMetricType,
          resourceLabel: predefined.ResourceLabel
        }
      : undefined
  };
}

/** gg: ECS resource ID에서 사용자가 알아볼 service 이름만 표시합니다. */
function readEcsServiceName(resourceId: string): string {
  return resourceId.split("/").filter(Boolean).at(-1) ?? "ECS 서비스";
}

/** gg: 영문 slug를 짧은 한국어 표시 이름으로 바꿉니다. */
function humanizeScalingPolicyName(policyName: string): string {
  const normalized = policyName.replace(/[-_]+/gu, " ").trim();
  return /request scaling$/iu.test(normalized)
    ? `${normalized.replace(/request scaling$/iu, "").trim()} 요청 자동 확장`
    : normalized;
}

/** gg: ALL 또는 직접 선택된 Resource family만 AWS에 요청합니다. */
function shouldRead(input: AwsProviderScanInput, resourceType: ResourceType): boolean {
  return input.resourceTypes.includes("ALL") || input.resourceTypes.includes(resourceType);
}

/** gg: Target과 Policy 중 하나를 선택해도 exact 관계를 위해 같은 family reader를 실행합니다. */
function shouldReadApplicationAutoScaling(input: AwsProviderScanInput): boolean {
  return (
    shouldRead(input, "APPLICATION_AUTO_SCALING_TARGET") ||
    shouldRead(input, "APPLICATION_AUTO_SCALING_POLICY")
  );
}

/** gg: 임시 credential을 AWS SDK가 요구하는 이름으로만 변환합니다. */
function toAwsSdkCredentials(credentials: TerraformAwsCredentialEnv) {
  return {
    accessKeyId: credentials.AWS_ACCESS_KEY_ID,
    secretAccessKey: credentials.AWS_SECRET_ACCESS_KEY,
    ...(credentials.AWS_SESSION_TOKEN ? { sessionToken: credentials.AWS_SESSION_TOKEN } : {})
  };
}

/** gg: Application Auto Scaling metadata 전용 기본 client를 생성합니다. */
function createDefaultApplicationAutoScalingClient(
  region: string,
  credentials: TerraformAwsCredentialEnv
): AwsDeploymentSupportReadClient {
  const client = new ApplicationAutoScalingClient({
    region,
    credentials: toAwsSdkCredentials(credentials)
  });
  return { send: (command) => client.send(command as never) };
}

/** gg: ECR Repository metadata 전용 기본 client를 생성합니다. */
function createDefaultEcrClient(
  region: string,
  credentials: TerraformAwsCredentialEnv
): AwsDeploymentSupportReadClient {
  const client = new ECRClient({ region, credentials: toAwsSdkCredentials(credentials) });
  return { send: (command) => client.send(command as never) };
}

/** gg: Secret 값 API가 없는 Secrets Manager metadata 전용 기본 client를 생성합니다. */
function createDefaultSecretsManagerClient(
  region: string,
  credentials: TerraformAwsCredentialEnv
): AwsDeploymentSupportReadClient {
  const client = new SecretsManagerClient({
    region,
    credentials: toAwsSdkCredentials(credentials)
  });
  return { send: (command) => client.send(command as never) };
}

/** gg: global CloudFront OAC metadata 전용 기본 client를 생성합니다. */
function createDefaultCloudFrontClient(
  region: string,
  credentials: TerraformAwsCredentialEnv
): AwsDeploymentSupportReadClient {
  const client = new CloudFrontClient({ region, credentials: toAwsSdkCredentials(credentials) });
  return { send: (command) => client.send(command as never) };
}
