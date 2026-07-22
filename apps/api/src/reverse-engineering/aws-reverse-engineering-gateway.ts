import {
  GetResourcesCommand,
  ResourceGroupsTaggingAPIClient,
  type GetResourcesCommandOutput,
  type ResourceTagMapping
} from "@aws-sdk/client-resource-groups-tagging-api";
import {
  GetDefaultViewCommand,
  GetViewCommand,
  ResourceExplorer2Client,
  SearchCommand,
  type GetDefaultViewCommandOutput,
  type GetViewCommandOutput,
  type Resource,
  type SearchCommandOutput
} from "@aws-sdk/client-resource-explorer-2";
import {
  CloudFrontClient,
  ListDistributionsCommand,
  type DefaultCacheBehavior,
  type DistributionSummary,
  type ForwardedValues,
  type ListDistributionsCommandOutput
} from "@aws-sdk/client-cloudfront";
import {
  CloudWatchClient,
  DescribeAlarmsCommand,
  type DescribeAlarmsCommandOutput,
  type MetricAlarm
} from "@aws-sdk/client-cloudwatch";
import {
  DescribeImagesCommand,
  EC2Client,
  type DescribeImagesCommandOutput,
  type Image
} from "@aws-sdk/client-ec2";
import {
  DescribeLoadBalancersCommand,
  ElasticLoadBalancingV2Client,
  type DescribeLoadBalancersCommandOutput,
  type LoadBalancer
} from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  ClusterField,
  DescribeClustersCommand,
  DescribeServicesCommand,
  DescribeTaskDefinitionCommand,
  ECSClient,
  ListClustersCommand,
  ListServicesCommand,
  type Cluster,
  type ClusterConfiguration,
  type ContainerDefinition,
  type DescribeClustersCommandOutput,
  type DescribeServicesCommandOutput,
  type DescribeTaskDefinitionCommandOutput,
  type Failure,
  type ListClustersCommandOutput,
  type ListServicesCommandOutput,
  type Service,
  type TaskDefinition
} from "@aws-sdk/client-ecs";
import {
  IAMClient,
  ListInstanceProfilesCommand,
  ListPoliciesCommand,
  ListRolesCommand,
  type InstanceProfile,
  type ListInstanceProfilesCommandOutput,
  type ListPoliciesCommandOutput,
  type ListRolesCommandOutput,
  type Policy,
  type Role
} from "@aws-sdk/client-iam";
import {
  DescribeKeyCommand,
  KMSClient,
  ListKeysCommand,
  type DescribeKeyCommandOutput,
  type KeyMetadata,
  type ListKeysCommandOutput
} from "@aws-sdk/client-kms";
import {
  GetPolicyCommand,
  LambdaClient,
  ListFunctionsCommand,
  type FunctionConfiguration,
  type GetPolicyCommandOutput,
  type ListFunctionsCommandOutput
} from "@aws-sdk/client-lambda";
import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
  type DescribeLogGroupsCommandOutput,
  type LogGroup
} from "@aws-sdk/client-cloudwatch-logs";
import {
  APIGatewayClient,
  GetRestApisCommand,
  type GetRestApisCommandOutput,
  type RestApi
} from "@aws-sdk/client-api-gateway";
import {
  GetBucketEncryptionCommand,
  GetBucketLocationCommand,
  GetBucketPolicyStatusCommand,
  GetBucketTaggingCommand,
  GetBucketVersioningCommand,
  GetBucketWebsiteCommand,
  GetPublicAccessBlockCommand,
  ListBucketsCommand,
  S3Client,
  type GetBucketEncryptionCommandOutput,
  type GetBucketLocationCommandOutput,
  type GetBucketPolicyStatusCommandOutput,
  type GetBucketTaggingCommandOutput,
  type GetBucketVersioningCommandOutput,
  type GetBucketWebsiteCommandOutput,
  type GetPublicAccessBlockCommandOutput,
  type ListBucketsCommandOutput
} from "@aws-sdk/client-s3";
import type { AwsConnection, ResourceType, ReverseEngineeringScanError } from "@sketchcatch/types";
import { createAwsSdkStsGateway } from "../aws-connections/aws-connection-test-service.js";
import {
  prepareTerraformAwsCredentialEnv,
  type TerraformAwsCredentialEnv
} from "../aws-connections/aws-connection-runtime-credentials.js";
import type {
  AwsDiscoveredResourceRecord,
  AwsProviderDiscoveryResult,
  AwsProviderScanGateway,
  AwsProviderScanInput
} from "./aws-provider-adapter.js";
import { selectHigherPriorityReverseEngineeringScanError } from "./reverse-engineering-scan-error-priority.js";
import {
  parseAwsQueryPaginationToken,
  parseInstancesFromXml,
  parseInternetGatewaysFromXml,
  parseRdsInstancesFromXml,
  parseRouteTablesFromXml,
  parseSecurityGroupsFromXml,
  parseSubnetsFromXml,
  parseVpcsFromXml
} from "./aws-reverse-engineering-parsers.js";
import { sendAwsQuery } from "./aws-reverse-engineering-query.js";

export type AwsReverseEngineeringGatewayOptions = {
  fetchXml?: typeof fetch;
};

export type AwsReverseEngineeringReaderPlan = {
  readonly loadBalancers: boolean;
  readonly cloudFrontDistributions: boolean;
  readonly ecsResources: boolean;
  readonly unknownResources: boolean;
};

export type AwsPageFailure = {
  outcome:
    | "permission_denied"
    | "not_configured"
    | "expired_credential"
    | "invalid_region"
    | "throttled"
    | "transient";
};

export type AwsPageResult<T> = {
  items: T[];
  failure?: AwsPageFailure;
};

/** gg: 뒤 page 실패·반복 token에서도 이미 읽은 item과 원문 없는 실패 분류를 보존합니다. */
export async function collectAwsPages<T>(
  readPage: (
    nextToken: string | undefined
  ) => Promise<{ items: readonly T[]; nextToken?: string | null | undefined }>
): Promise<AwsPageResult<T>> {
  const items: T[] = [];
  const seenTokens = new Set<string>();
  let nextToken: string | undefined;

  do {
    try {
      const page = await readPage(nextToken);
      items.push(...page.items);
      const candidateToken = typeof page.nextToken === "string" && page.nextToken.length > 0
        ? page.nextToken
        : undefined;
      if (candidateToken && seenTokens.has(candidateToken)) {
        return { items, failure: { outcome: "transient" } };
      }
      if (candidateToken) seenTokens.add(candidateToken);
      nextToken = candidateToken;
    } catch (error) {
      return {
        items,
        failure: { outcome: classifyAwsPageFailureOutcome(error) }
      };
    }
  } while (nextToken);

  return { items };
}

/** gg: provider 원문은 버리고 기존 scan reason만 page-level 안전 분류로 좁힙니다. */
function classifyAwsPageFailureOutcome(error: unknown): AwsPageFailure["outcome"] {
  const details = error && typeof error === "object"
    ? error as { name?: unknown; code?: unknown; Code?: unknown; message?: unknown }
    : {};
  const classifierText = [details.name, details.code, details.Code, details.message]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  const reason = classifyScanErrorReason(classifierText);
  return reason === "provider_error" || reason === "unknown" ? "transient" : reason;
}

export type AwsS3ReadClient = {
  send(command: object): Promise<unknown>;
};

export type AwsS3ReadClientFactory = (
  region: string,
  credentials: TerraformAwsCredentialEnv
) => AwsS3ReadClient;

export type AwsTaggingReadClient = {
  send(command: object): Promise<unknown>;
};

export type AwsTaggingReadClientFactory = (
  region: string,
  credentials: TerraformAwsCredentialEnv
) => AwsTaggingReadClient;
export type AwsResourceExplorerReadClient = {
  send(command: object): Promise<unknown>;
};
export type AwsResourceExplorerReadClientFactory = (
  region: string,
  credentials: TerraformAwsCredentialEnv
) => AwsResourceExplorerReadClient;
export type AwsElbReadClient = {
  send(command: object): Promise<unknown>;
};
export type AwsElbReadClientFactory = (
  region: string,
  credentials: TerraformAwsCredentialEnv
) => AwsElbReadClient;
export type AwsEcsReadClient = {
  send(command: object): Promise<unknown>;
};
export type AwsEcsReadClientFactory = (
  region: string,
  credentials: TerraformAwsCredentialEnv
) => AwsEcsReadClient;
export type AwsLambdaReadClient = {
  send(command: object): Promise<unknown>;
};
export type AwsLambdaReadClientFactory = (
  region: string,
  credentials: TerraformAwsCredentialEnv
) => AwsLambdaReadClient;
export type AwsCloudFrontReadClient = {
  send(command: object): Promise<unknown>;
};
export type AwsCloudFrontReadClientFactory = (
  region: string,
  credentials: TerraformAwsCredentialEnv
) => AwsCloudFrontReadClient;
export type AwsIamReadClient = {
  send(command: object): Promise<unknown>;
};
export type AwsIamReadClientFactory = (
  region: string,
  credentials: TerraformAwsCredentialEnv
) => AwsIamReadClient;
export type AwsKmsReadClient = {
  send(command: object): Promise<unknown>;
};
export type AwsKmsReadClientFactory = (
  region: string,
  credentials: TerraformAwsCredentialEnv
) => AwsKmsReadClient;
export type AwsCloudWatchLogsReadClient = {
  send(command: object): Promise<unknown>;
};
export type AwsCloudWatchLogsReadClientFactory = (
  region: string,
  credentials: TerraformAwsCredentialEnv
) => AwsCloudWatchLogsReadClient;
export type AwsApiGatewayReadClient = {
  send(command: object): Promise<unknown>;
};
export type AwsApiGatewayReadClientFactory = (
  region: string,
  credentials: TerraformAwsCredentialEnv
) => AwsApiGatewayReadClient;
export type AwsEc2ReadClient = {
  send(command: object): Promise<unknown>;
};
export type AwsEc2ReadClientFactory = (
  region: string,
  credentials: TerraformAwsCredentialEnv
) => AwsEc2ReadClient;
export type AwsCloudWatchReadClient = {
  send(command: object): Promise<unknown>;
};
export type AwsCloudWatchReadClientFactory = (
  region: string,
  credentials: TerraformAwsCredentialEnv
) => AwsCloudWatchReadClient;

type LambdaPolicyStatement = {
  readonly Sid?: string;
  readonly Action?: unknown;
  readonly Condition?: unknown;
  readonly Effect?: unknown;
  readonly Principal?: unknown;
  readonly Resource?: unknown;
};

type LambdaPolicyDocument = {
  readonly Statement?: LambdaPolicyStatement | LambdaPolicyStatement[];
};

// 검증된 AWS 연결로 실제 read-only 조회를 수행하는 gateway를 만듭니다.
export function createAwsReverseEngineeringGateway(
  awsConnection: AwsConnection,
  options: AwsReverseEngineeringGatewayOptions = {}
): AwsProviderScanGateway {
  return {
    async discoverResources(input) {
      const preparedCredentials = await prepareTerraformAwsCredentialEnv(
        awsConnection,
        createAwsSdkStsGateway()
      );
      const credentials = preparedCredentials.env;
      const fetchXml = options.fetchXml ?? fetch;
      const readerPlan = createAwsReverseEngineeringReaderPlan(input);
      const resourceGroups = await Promise.all([
        readResourceGroup(input, "VPC", (reportPageFailure) =>
          describeVpcs(input.region, credentials, fetchXml, reportPageFailure)
        ),
        readResourceGroup(input, "SUBNET", (reportPageFailure) =>
          describeSubnets(input.region, credentials, fetchXml, reportPageFailure)
        ),
        readResourceGroup(input, "INTERNET_GATEWAY", (reportPageFailure) =>
          describeInternetGateways(input.region, credentials, fetchXml, reportPageFailure)
        ),
        readResourceGroup(input, "ROUTE_TABLE", (reportPageFailure) =>
          describeRouteTables(input.region, credentials, fetchXml, reportPageFailure)
        ),
        readResourceGroup(input, "SECURITY_GROUP", (reportPageFailure) =>
          describeSecurityGroups(input.region, credentials, fetchXml, reportPageFailure)
        ),
        readResourceGroup(input, "EC2", (reportPageFailure) =>
          describeInstances(input.region, credentials, fetchXml, reportPageFailure)
        ),
        readResourceGroup(input, "RDS", (reportPageFailure) =>
          describeRdsInstances(input.region, credentials, fetchXml, reportPageFailure)
        ),
        readResourceGroup(input, "S3", (reportPageFailure) =>
          listBucketsWithDetails(input.region, credentials, undefined, reportPageFailure)
        ),
        ...(readerPlan.loadBalancers
          ? [
              readResourceGroup(input, "LOAD_BALANCER", (reportPageFailure) =>
                listApplicationLoadBalancers(
                  input.region,
                  credentials,
                  undefined,
                  reportPageFailure
                )
              )
            ]
          : []),
        ...(readerPlan.cloudFrontDistributions
          ? [
              readResourceGroup(input, "CLOUDFRONT", (reportPageFailure) =>
                listCloudFrontDistributions(
                  input.region,
                  credentials,
                  undefined,
                  reportPageFailure
                )
              )
            ]
          : []),
        ...(readerPlan.ecsResources
          ? [readEcsResourcesWithDiagnostics(input.region, credentials)]
          : []),
        ...(readerPlan.unknownResources ? [readUnknownResourceGroup(input, credentials)] : [])
      ]);

      const records = resolveEcsRelationships(
        resolveCloudFrontOriginRelationships(
          uniqueDiscoveredRecordsByProviderId(resourceGroups.flatMap((group) => group.records))
        )
      );

      return {
        records,
        scanErrors: deduplicateReverseEngineeringScanErrors(
          resourceGroups.flatMap((group) => group.scanErrors)
        )
      };
    }
  };
}

// 리소스 한 종류가 실패해도 다른 종류의 스캔 결과는 계속 살립니다.
async function readResourceGroup(
  input: AwsProviderScanInput,
  resourceType: ResourceType,
  read: (
    reportPageFailure: (failure: AwsPageFailure) => void
  ) => Promise<AwsDiscoveredResourceRecord[]>
): Promise<AwsProviderDiscoveryResult> {
  if (!shouldReadResourceGroup(input, resourceType)) {
    return { records: [], scanErrors: [] };
  }

  try {
    const pageFailures: AwsPageFailure[] = [];
    const records = await read((failure) => pageFailures.push(failure));
    return {
      records,
      scanErrors: pageFailures.slice(0, 1).map((failure) =>
        toScanErrorFromPageFailure(resourceType, failure)
      )
    };
  } catch (error) {
    return {
      records: [],
      scanErrors: [toScanError(resourceType, error)]
    };
  }
}

async function readUnknownResourceGroup(
  input: AwsProviderScanInput,
  credentials: TerraformAwsCredentialEnv
): Promise<AwsProviderDiscoveryResult> {
  if (!shouldReadUnknownResourceGroup(input)) {
    return { records: [], scanErrors: [] };
  }

  return listUnknownResources(input, credentials);
}

// 정식 reader와 UNKNOWN inventory의 경계를 한 곳에서 계산해 같은 서비스를 두 번 읽지 않습니다.
export function createAwsReverseEngineeringReaderPlan(
  input: AwsProviderScanInput
): AwsReverseEngineeringReaderPlan {
  return {
    loadBalancers: shouldReadResourceGroup(input, "LOAD_BALANCER"),
    cloudFrontDistributions: shouldReadResourceGroup(input, "CLOUDFRONT"),
    ecsResources: shouldReadEcsResourceGroup(input),
    unknownResources: shouldReadUnknownResourceGroup(input)
  };
}

function shouldReadEcsResourceGroup(input: AwsProviderScanInput): boolean {
  return (
    input.resourceTypes.includes("ALL") ||
    input.resourceTypes.includes("ECS_CLUSTER") ||
    input.resourceTypes.includes("ECS_SERVICE") ||
    input.resourceTypes.includes("ECS_TASK_DEFINITION")
  );
}

type AwsQueryResourceReaderInput = {
  service: "ec2" | "rds";
  action: string;
  version: string;
  requestToken: "NextToken" | "Marker";
  responseToken: "nextToken" | "Marker";
  parse: (xml: string, region: string) => AwsDiscoveredResourceRecord[];
};

/** gg: EC2/RDS Query reader도 공통 collector로 앞 page와 safe failure를 함께 보존합니다. */
async function readAwsQueryResourcePages(
  input: AwsQueryResourceReaderInput,
  region: string,
  credentials: TerraformAwsCredentialEnv,
  fetchXml: typeof fetch,
  reportPageFailure: (failure: AwsPageFailure) => void
): Promise<AwsDiscoveredResourceRecord[]> {
  const result = await collectAwsPages(async (nextToken) => {
    const parameters = nextToken === undefined
      ? undefined
      : input.requestToken === "NextToken"
        ? { NextToken: nextToken }
        : { Marker: nextToken };
    const xml = await sendAwsQuery({
      service: input.service,
      region,
      action: input.action,
      version: input.version,
      credentials,
      ...(parameters ? { parameters } : {})
    }, fetchXml);
    return {
      items: input.parse(xml, region),
      nextToken: parseAwsQueryPaginationToken(xml, input.responseToken)
    };
  });
  if (result.failure) reportPageFailure(result.failure);
  return result.items;
}

/** gg: VPC Query pagination은 EC2 nextToken을 그대로 다음 signed request에만 전달합니다. */
export async function describeVpcs(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  fetchXml: typeof fetch,
  reportPageFailure: (failure: AwsPageFailure) => void = () => undefined
): Promise<AwsDiscoveredResourceRecord[]> {
  return readAwsQueryResourcePages({
    service: "ec2",
    action: "DescribeVpcs",
    version: "2016-11-15",
    requestToken: "NextToken",
    responseToken: "nextToken",
    parse: parseVpcsFromXml
  }, region, credentials, fetchXml, reportPageFailure);
}

/** gg: Subnet Query pagination도 첫 page records를 later failure와 분리합니다. */
export async function describeSubnets(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  fetchXml: typeof fetch,
  reportPageFailure: (failure: AwsPageFailure) => void = () => undefined
): Promise<AwsDiscoveredResourceRecord[]> {
  return readAwsQueryResourcePages({
    service: "ec2",
    action: "DescribeSubnets",
    version: "2016-11-15",
    requestToken: "NextToken",
    responseToken: "nextToken",
    parse: parseSubnetsFromXml
  }, region, credentials, fetchXml, reportPageFailure);
}

/** gg: Security Group Query pagination도 동일한 bounded token 계약을 사용합니다. */
export async function describeSecurityGroups(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  fetchXml: typeof fetch,
  reportPageFailure: (failure: AwsPageFailure) => void = () => undefined
): Promise<AwsDiscoveredResourceRecord[]> {
  return readAwsQueryResourcePages({
    service: "ec2",
    action: "DescribeSecurityGroups",
    version: "2016-11-15",
    requestToken: "NextToken",
    responseToken: "nextToken",
    parse: parseSecurityGroupsFromXml
  }, region, credentials, fetchXml, reportPageFailure);
}

/** gg: Instance Query pagination은 누적 instance records를 later failure에도 유지합니다. */
export async function describeInstances(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  fetchXml: typeof fetch,
  reportPageFailure: (failure: AwsPageFailure) => void = () => undefined
): Promise<AwsDiscoveredResourceRecord[]> {
  return readAwsQueryResourcePages({
    service: "ec2",
    action: "DescribeInstances",
    version: "2016-11-15",
    requestToken: "NextToken",
    responseToken: "nextToken",
    parse: parseInstancesFromXml
  }, region, credentials, fetchXml, reportPageFailure);
}

/** gg: Internet Gateway Query pagination도 EC2 nextToken만 allowlist로 서명합니다. */
export async function describeInternetGateways(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  fetchXml: typeof fetch,
  reportPageFailure: (failure: AwsPageFailure) => void = () => undefined
): Promise<AwsDiscoveredResourceRecord[]> {
  return readAwsQueryResourcePages({
    service: "ec2",
    action: "DescribeInternetGateways",
    version: "2016-11-15",
    requestToken: "NextToken",
    responseToken: "nextToken",
    parse: parseInternetGatewaysFromXml
  }, region, credentials, fetchXml, reportPageFailure);
}

/** gg: Route Table Query pagination도 page별 XML을 즉시 records로 축소합니다. */
export async function describeRouteTables(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  fetchXml: typeof fetch,
  reportPageFailure: (failure: AwsPageFailure) => void = () => undefined
): Promise<AwsDiscoveredResourceRecord[]> {
  return readAwsQueryResourcePages({
    service: "ec2",
    action: "DescribeRouteTables",
    version: "2016-11-15",
    requestToken: "NextToken",
    responseToken: "nextToken",
    parse: parseRouteTablesFromXml
  }, region, credentials, fetchXml, reportPageFailure);
}

/** gg: RDS Query pagination은 대소문자가 다른 Marker 계약을 명시적으로 유지합니다. */
export async function describeRdsInstances(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  fetchXml: typeof fetch,
  reportPageFailure: (failure: AwsPageFailure) => void = () => undefined
): Promise<AwsDiscoveredResourceRecord[]> {
  return readAwsQueryResourcePages({
    service: "rds",
    action: "DescribeDBInstances",
    version: "2014-10-31",
    requestToken: "Marker",
    responseToken: "Marker",
    parse: parseRdsInstancesFromXml
  }, region, credentials, fetchXml, reportPageFailure);
}

/** gg: S3 bucket page마다 read-only 세부 정보를 축소하고 later failure에는 앞 page를 보존합니다. */
export async function listBucketsWithDetails(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  createClient: AwsS3ReadClientFactory = createDefaultS3ReadClient,
  reportPageFailure: (failure: AwsPageFailure) => void = () => undefined
): Promise<AwsDiscoveredResourceRecord[]> {
  const client = createClient(region, credentials);
  const result = await collectAwsPages(async (continuationToken) => {
    const response = await sendS3Command<ListBucketsCommandOutput>(
      client,
      new ListBucketsCommand({
        MaxBuckets: 1_000,
        ...(continuationToken ? { ContinuationToken: continuationToken } : {})
      })
    );
    const bucketRecords = await Promise.all(
      (response.Buckets ?? []).map((bucket) =>
        createS3BucketRecord(bucket.Name, bucket.CreationDate, region, client)
      )
    );
    return {
      items: bucketRecords.filter(
        (record): record is AwsDiscoveredResourceRecord => record !== null
      ),
      nextToken: response.ContinuationToken
    };
  });

  if (result.failure) reportPageFailure(result.failure);
  return result.items;
}

function createDefaultS3ReadClient(
  region: string,
  credentials: TerraformAwsCredentialEnv
): AwsS3ReadClient {
  const client = new S3Client({ region, credentials: toAwsSdkCredentials(credentials) });

  return {
    send: (command) => client.send(command as Parameters<S3Client["send"]>[0])
  };
}

async function createS3BucketRecord(
  bucketName: string | undefined,
  createdAt: Date | undefined,
  fallbackRegion: string,
  client: AwsS3ReadClient
): Promise<AwsDiscoveredResourceRecord | null> {
  if (!bucketName) {
    return null;
  }

  const [location, versioning, publicAccessBlock, encryption, website, tagging, policyStatus] =
    await Promise.all([
      readOptionalS3Detail(() =>
        sendS3Command<GetBucketLocationCommandOutput>(client, new GetBucketLocationCommand({ Bucket: bucketName }))
      ),
      readOptionalS3Detail(() =>
        sendS3Command<GetBucketVersioningCommandOutput>(client, new GetBucketVersioningCommand({ Bucket: bucketName }))
      ),
      readOptionalS3Detail(() =>
        sendS3Command<GetPublicAccessBlockCommandOutput>(
          client,
          new GetPublicAccessBlockCommand({ Bucket: bucketName })
        )
      ),
      readOptionalS3Detail(() =>
        sendS3Command<GetBucketEncryptionCommandOutput>(client, new GetBucketEncryptionCommand({ Bucket: bucketName }))
      ),
      readOptionalS3Detail(() =>
        sendS3Command<GetBucketWebsiteCommandOutput>(client, new GetBucketWebsiteCommand({ Bucket: bucketName }))
      ),
      readOptionalS3Detail(() =>
        sendS3Command<GetBucketTaggingCommandOutput>(client, new GetBucketTaggingCommand({ Bucket: bucketName }))
      ),
      readOptionalS3Detail(() =>
        sendS3Command<GetBucketPolicyStatusCommandOutput>(
          client,
          new GetBucketPolicyStatusCommand({ Bucket: bucketName })
        )
      )
    ]);
  const bucketRegion = normalizeS3BucketRegion(location?.LocationConstraint, fallbackRegion);

  return {
    providerResourceType: "AWS::S3::Bucket",
    providerResourceId: bucketName,
    displayName: bucketName,
    region: bucketRegion,
    config: {
      createdAt: createdAt?.toISOString(),
      bucketRegion,
      versioningStatus: versioning?.Status,
      mfaDelete: versioning?.MFADelete,
      publicAccessBlock: publicAccessBlock?.PublicAccessBlockConfiguration,
      encryptionRules: encryption?.ServerSideEncryptionConfiguration?.Rules,
      websiteIndexDocument: website?.IndexDocument?.Suffix,
      websiteErrorDocument: website?.ErrorDocument?.Key,
      tags: tagging?.TagSet?.map((tag) => ({ key: tag.Key, value: tag.Value })),
      policyStatusIsPublic: policyStatus?.PolicyStatus?.IsPublic,
      providerParameters: toProviderParameterSnapshot({
        bucket: {
          name: bucketName,
          createdAt: createdAt?.toISOString()
        },
        location,
        versioning,
        publicAccessBlock,
        encryption,
        website,
        tagging,
        policyStatus
      })
    },
    relationships: []
  };
}

async function sendS3Command<TOutput>(client: AwsS3ReadClient, command: object): Promise<TOutput> {
  return (await client.send(command)) as TOutput;
}

async function readOptionalS3Detail<TOutput>(read: () => Promise<TOutput>): Promise<TOutput | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

function normalizeS3BucketRegion(
  locationConstraint: GetBucketLocationCommandOutput["LocationConstraint"],
  fallbackRegion: string
): string {
  return locationConstraint && locationConstraint.length > 0 ? locationConstraint : fallbackRegion;
}

// `ALL` 선택에서 지원 목록 밖 tagged 리소스를 UNKNOWN 후보로 남겨 사용자가 놓치지 않게 합니다.
export async function listTaggedUnknownResources(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  createClient: AwsTaggingReadClientFactory = createDefaultTaggingReadClient,
  reportPageFailure: (failure: AwsPageFailure) => void = () => undefined
): Promise<AwsDiscoveredResourceRecord[]> {
  const client = createClient(region, credentials);
  const result = await collectAwsPages(async (paginationToken) => {
    const response = await sendTaggingCommand<GetResourcesCommandOutput>(
      client,
      new GetResourcesCommand({ PaginationToken: paginationToken })
    );
    return {
      items: (response.ResourceTagMappingList ?? []).flatMap((resource) =>
        toUnknownTaggedResourceRecord(resource, region)
      ),
      nextToken: response.PaginationToken
    };
  });

  if (result.failure) reportPageFailure(result.failure);
  return result.items;
}

// Resource Explorer가 켜진 계정에서는 태그 없는 리소스까지 더 넓게 UNKNOWN 후보로 찾습니다.
export async function listResourceExplorerResourcesAsUnknown(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  createClient: AwsResourceExplorerReadClientFactory = createDefaultResourceExplorerReadClient
): Promise<AwsDiscoveredResourceRecord[]> {
  try {
    return (await listResourceExplorerResourceRecords(region, credentials, createClient)).items;
  } catch {
    return [];
  }
}

class AwsResourceExplorerNotConfiguredError extends Error {
  constructor() {
    super("Resource Explorer default view is not configured");
    this.name = "AwsResourceExplorerNotConfiguredError";
  }
}

// Resource Explorer default view를 exact 확인한 뒤 Search page를 읽습니다.
async function listResourceExplorerResourceRecords(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  createClient: AwsResourceExplorerReadClientFactory = createDefaultResourceExplorerReadClient
): Promise<AwsPageResult<AwsDiscoveredResourceRecord>> {
  const client = createClient(region, credentials);
  const defaultView = await sendResourceExplorerCommand<GetDefaultViewCommandOutput>(
    client,
    new GetDefaultViewCommand({})
  );
  const viewArn = getNonEmptyStringValue(defaultView.ViewArn);
  if (!viewArn) throw new AwsResourceExplorerNotConfiguredError();
  const view = await sendResourceExplorerCommand<GetViewCommandOutput>(
    client,
    new GetViewCommand({ ViewArn: viewArn })
  );
  if (getNonEmptyStringValue(view.View?.ViewArn) !== viewArn) {
    throw new AwsResourceExplorerNotConfiguredError();
  }

  return collectAwsPages(async (nextToken) => {
    const response = await sendResourceExplorerCommand<SearchCommandOutput>(
      client,
      new SearchCommand({
        ViewArn: viewArn,
        QueryString: `region:${region}`,
        MaxResults: 100,
        ...(nextToken ? { NextToken: nextToken } : {})
      })
    );
    return {
      items: (response.Resources ?? []).flatMap((resource) =>
        toUnknownResourceExplorerRecord(resource, region)
      ),
      nextToken: response.NextToken
    };
  });
}

// Resource Explorer가 꺼졌거나 권한이 없으면, 조용히 숨기지 않고 scan error로 남깁니다.
export async function readResourceExplorerResourcesWithDiagnostics(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  createClient: AwsResourceExplorerReadClientFactory = createDefaultResourceExplorerReadClient
): Promise<AwsProviderDiscoveryResult> {
  try {
    const result = await listResourceExplorerResourceRecords(region, credentials, createClient);
    return {
      records: result.items,
      scanErrors: result.failure
        ? [toScanErrorFromPageFailure("UNKNOWN", result.failure, "resource-explorer-2")]
        : []
    };
  } catch (error) {
    return {
      records: [],
      scanErrors: [toResourceExplorerScanError(error)]
    };
  }
}

// UNKNOWN 보조 조회 하나가 실패해도 다른 UNKNOWN 조회 결과는 계속 살립니다.
async function readUnknownResourceRecords(
  resourceType: ResourceType,
  serviceKey: string,
  read: (
    reportPageFailure: (failure: AwsPageFailure) => void
  ) => Promise<AwsDiscoveredResourceRecord[]>
): Promise<AwsProviderDiscoveryResult> {
  try {
    const pageFailures: AwsPageFailure[] = [];
    const records = await read((failure) => pageFailures.push(failure));
    return {
      records,
      scanErrors: pageFailures.slice(0, 1).map((failure) =>
        toScanErrorFromPageFailure(resourceType, failure, serviceKey)
      )
    };
  } catch (error) {
    return {
      records: [],
      scanErrors: [toScanError(resourceType, error, serviceKey)]
    };
  }
}

// 지금 정식 지원하지 않는 AWS 리소스도 숨기지 않기 위해 여러 read-only 조회 결과를 UNKNOWN으로 모읍니다.
async function listUnknownResources(
  input: AwsProviderScanInput,
  credentials: TerraformAwsCredentialEnv
): Promise<AwsProviderDiscoveryResult> {
  const reads: Array<Promise<AwsProviderDiscoveryResult>> = [];

  if (input.resourceTypes.includes("ALL") || input.resourceTypes.includes("UNKNOWN")) {
    reads.push(
      readResourceExplorerResourcesWithDiagnostics(input.region, credentials),
      readUnknownResourceRecords("UNKNOWN", "resource-groups-tagging", (reportPageFailure) =>
        listTaggedUnknownResources(input.region, credentials, undefined, reportPageFailure)
      ),
      readUnknownResourceRecords("UNKNOWN", "iam", (reportPageFailure) =>
        listIamRolesAsUnknown(input.region, credentials, undefined, reportPageFailure)
      ),
      readUnknownResourceRecords("UNKNOWN", "kms", (reportPageFailure) =>
        listKmsKeysAsUnknown(input.region, credentials, undefined, reportPageFailure)
      ),
      readUnknownResourceRecords("UNKNOWN", "cloudwatch-logs", (reportPageFailure) =>
        listCloudWatchLogGroupsAsUnknown(
          input.region,
          credentials,
          undefined,
          reportPageFailure
        )
      ),
      readUnknownResourceRecords("UNKNOWN", "api-gateway", (reportPageFailure) =>
        listApiGatewayRestApisAsUnknown(
          input.region,
          credentials,
          undefined,
          reportPageFailure
        )
      ),
      readUnknownResourceRecords("UNKNOWN", "ec2", (reportPageFailure) =>
        listAmiImagesAsUnknown(input.region, credentials, undefined, reportPageFailure)
      ),
      readUnknownResourceRecords("UNKNOWN", "iam", (reportPageFailure) =>
        listIamPoliciesAsUnknown(input.region, credentials, undefined, reportPageFailure)
      ),
      readUnknownResourceRecords("UNKNOWN", "iam", (reportPageFailure) =>
        listIamInstanceProfilesAsUnknown(
          input.region,
          credentials,
          undefined,
          reportPageFailure
        )
      ),
      readUnknownResourceRecords("UNKNOWN", "cloudwatch", (reportPageFailure) =>
        listCloudWatchMetricAlarmsAsUnknown(
          input.region,
          credentials,
          undefined,
          reportPageFailure
        )
      ),
      readUnknownResourceRecords("UNKNOWN", "lambda", (reportPageFailure) =>
        listLambdaPermissionsAsUnknown(input.region, credentials, undefined, reportPageFailure)
      )
    );
  }

  if (input.resourceTypes.includes("AMI")) {
    reads.push(
      readUnknownResourceRecords("AMI", "ec2", (reportPageFailure) =>
        listAmiImagesAsUnknown(input.region, credentials, undefined, reportPageFailure)
      )
    );
  }

  if (input.resourceTypes.includes("IAM_ROLE")) {
    reads.push(
      readUnknownResourceRecords("IAM_ROLE", "iam", (reportPageFailure) =>
        listIamRolesAsUnknown(input.region, credentials, undefined, reportPageFailure)
      )
    );
  }

  if (input.resourceTypes.includes("IAM_POLICY")) {
    reads.push(
      readUnknownResourceRecords("IAM_POLICY", "iam", (reportPageFailure) =>
        listIamPoliciesAsUnknown(input.region, credentials, undefined, reportPageFailure)
      )
    );
  }

  if (input.resourceTypes.includes("IAM_INSTANCE_PROFILE")) {
    reads.push(
      readUnknownResourceRecords("IAM_INSTANCE_PROFILE", "iam", (reportPageFailure) =>
        listIamInstanceProfilesAsUnknown(
          input.region,
          credentials,
          undefined,
          reportPageFailure
        )
      )
    );
  }

  if (input.resourceTypes.includes("KMS_KEY")) {
    reads.push(
      readUnknownResourceRecords("KMS_KEY", "kms", (reportPageFailure) =>
        listKmsKeysAsUnknown(input.region, credentials, undefined, reportPageFailure)
      )
    );
  }

  if (input.resourceTypes.includes("CLOUDWATCH_LOG_GROUP")) {
    reads.push(
      readUnknownResourceRecords(
        "CLOUDWATCH_LOG_GROUP",
        "cloudwatch-logs",
        (reportPageFailure) => listCloudWatchLogGroupsAsUnknown(
          input.region,
          credentials,
          undefined,
          reportPageFailure
        )
      )
    );
  }

  if (input.resourceTypes.includes("CLOUDWATCH_METRIC_ALARM")) {
    reads.push(
      readUnknownResourceRecords(
        "CLOUDWATCH_METRIC_ALARM",
        "cloudwatch",
        (reportPageFailure) => listCloudWatchMetricAlarmsAsUnknown(
          input.region,
          credentials,
          undefined,
          reportPageFailure
        )
      )
    );
  }

  if (input.resourceTypes.includes("API_GATEWAY_REST_API")) {
    reads.push(
      readUnknownResourceRecords(
        "API_GATEWAY_REST_API",
        "api-gateway",
        (reportPageFailure) => listApiGatewayRestApisAsUnknown(
          input.region,
          credentials,
          undefined,
          reportPageFailure
        )
      )
    );
  }

  if (
    input.resourceTypes.includes("ALL") ||
    input.resourceTypes.includes("UNKNOWN") ||
    input.resourceTypes.includes("LAMBDA")
  ) {
    reads.push(
      readUnknownResourceRecords("LAMBDA", "lambda", (reportPageFailure) =>
        listLambdaFunctionsAsUnknown(input.region, credentials, undefined, reportPageFailure)
      )
    );
  }

  if (input.resourceTypes.includes("LAMBDA_PERMISSION")) {
    reads.push(
      readUnknownResourceRecords("LAMBDA_PERMISSION", "lambda", (reportPageFailure) =>
        listLambdaPermissionsAsUnknown(input.region, credentials, undefined, reportPageFailure)
      )
    );
  }

  const discoveryResults = await Promise.all(reads);

  return {
    records: uniqueDiscoveredRecordsByProviderId(
      discoveryResults
        .flatMap((result) => result.records)
        .filter((record) => !isReverseEngineeringPromotedResourceArn(record.providerResourceId))
    ),
    scanErrors: deduplicateReverseEngineeringScanErrors(
      discoveryResults.flatMap((result) => result.scanErrors)
    )
  };
}

const ECS_DESCRIBE_CLUSTERS_BATCH_SIZE = 100;
const ECS_DESCRIBE_SERVICES_BATCH_SIZE = 10;

// ECS는 Cluster를 기준으로 Service와 Task Definition 증거를 한 번의 family scan으로 모읍니다.
export async function readEcsResourcesWithDiagnostics(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  createClient: AwsEcsReadClientFactory = createDefaultEcsReadClient
): Promise<AwsProviderDiscoveryResult> {
  const client = createClient(region, credentials);
  const scanErrors: ReverseEngineeringScanError[] = [];
  const clusterPages = await listAllEcsClusterArns(client);
  if (clusterPages.failure) {
    scanErrors.push(toScanErrorFromPageFailure("ECS_CLUSTER", clusterPages.failure));
  }

  const clusters = await describeEcsClusters(client, clusterPages.items, scanErrors);
  const clusterRecords = clusters.flatMap((cluster) => toEcsClusterRecord(cluster, region));
  const serviceRecords: AwsDiscoveredResourceRecord[] = [];
  const taskDefinitionArns = new Set<string>();

  for (const cluster of clusters) {
    const clusterArn = cluster.clusterArn;
    if (!clusterArn) {
      continue;
    }

    const servicePages = await listAllEcsServiceArns(client, clusterArn);
    if (servicePages.failure) {
      scanErrors.push(toScanErrorFromPageFailure("ECS_SERVICE", servicePages.failure));
    }
    const services = await describeEcsServices(
      client,
      cluster,
      servicePages.items,
      scanErrors
    );

    for (const service of services) {
      const record = toEcsServiceRecord(service, cluster, region);
      if (!record) {
        continue;
      }

      serviceRecords.push(record);
      const taskDefinitionArn = getNonEmptyStringValue(record.config["taskDefinitionArn"]);
      if (taskDefinitionArn) {
        taskDefinitionArns.add(taskDefinitionArn);
      }
    }
  }

  const taskDefinitionRecords: AwsDiscoveredResourceRecord[] = [];
  for (const taskDefinitionArn of taskDefinitionArns) {
    try {
      const response = await sendEcsCommand<DescribeTaskDefinitionCommandOutput>(
        client,
        new DescribeTaskDefinitionCommand({ taskDefinition: taskDefinitionArn })
      );
      const record = response.taskDefinition
        ? toEcsTaskDefinitionRecord(response.taskDefinition, region)
        : null;

      if (record) {
        taskDefinitionRecords.push(record);
      } else {
        scanErrors.push(
          toScanError(
            "ECS_TASK_DEFINITION",
            new Error(`DescribeTaskDefinition returned no task definition for ${taskDefinitionArn}`)
          )
        );
      }
    } catch (error) {
      scanErrors.push(toScanError("ECS_TASK_DEFINITION", error));
    }
  }

  return {
    records: resolveEcsRelationships([
      ...clusterRecords,
      ...serviceRecords,
      ...taskDefinitionRecords
    ]),
    scanErrors
  };
}

async function listAllEcsClusterArns(client: AwsEcsReadClient): Promise<AwsPageResult<string>> {
  const result = await collectAwsPages(async (nextToken) => {
    const response = await sendEcsCommand<ListClustersCommandOutput>(
      client,
      new ListClustersCommand({ nextToken })
    );
    return {
      items: (response.clusterArns ?? []).filter(isNonEmptyString),
      nextToken: getNonEmptyStringValue(response.nextToken)
    };
  });

  return { ...result, items: [...new Set(result.items)] };
}

async function describeEcsClusters(
  client: AwsEcsReadClient,
  clusterArns: readonly string[],
  scanErrors: ReverseEngineeringScanError[]
): Promise<Cluster[]> {
  const clusters: Cluster[] = [];

  for (const clusterArnBatch of chunkValues(clusterArns, ECS_DESCRIBE_CLUSTERS_BATCH_SIZE)) {
    try {
      const response = await sendEcsCommand<DescribeClustersCommandOutput>(
        client,
        new DescribeClustersCommand({
          clusters: clusterArnBatch,
          include: [ClusterField.CONFIGURATIONS]
        })
      );
      clusters.push(...(response.clusters ?? []));
      scanErrors.push(
        ...(response.failures ?? []).map((failure) =>
          toScanError("ECS_CLUSTER", toEcsFailureError(failure))
        )
      );
    } catch (error) {
      scanErrors.push(toScanError("ECS_CLUSTER", error));
    }
  }

  return clusters;
}

async function listAllEcsServiceArns(
  client: AwsEcsReadClient,
  clusterArn: string
): Promise<AwsPageResult<string>> {
  const result = await collectAwsPages(async (nextToken) => {
    const response = await sendEcsCommand<ListServicesCommandOutput>(
      client,
      new ListServicesCommand({ cluster: clusterArn, nextToken })
    );
    return {
      items: (response.serviceArns ?? []).filter(isNonEmptyString),
      nextToken: getNonEmptyStringValue(response.nextToken)
    };
  });

  return { ...result, items: [...new Set(result.items)] };
}

async function describeEcsServices(
  client: AwsEcsReadClient,
  cluster: Cluster,
  serviceArns: readonly string[],
  scanErrors: ReverseEngineeringScanError[]
): Promise<Service[]> {
  const services: Service[] = [];

  for (const serviceArnBatch of chunkValues(serviceArns, ECS_DESCRIBE_SERVICES_BATCH_SIZE)) {
    try {
      const response = await sendEcsCommand<DescribeServicesCommandOutput>(
        client,
        new DescribeServicesCommand({
          cluster: cluster.clusterArn,
          services: serviceArnBatch
        })
      );
      services.push(...(response.services ?? []));
      scanErrors.push(
        ...(response.failures ?? []).map((failure) =>
          toScanError("ECS_SERVICE", toEcsFailureError(failure))
        )
      );
    } catch (error) {
      scanErrors.push(toScanError("ECS_SERVICE", error));
    }
  }

  return services;
}

function toEcsClusterRecord(
  cluster: Cluster,
  fallbackRegion: string
): AwsDiscoveredResourceRecord[] {
  const arn = cluster.clusterArn;
  if (!arn) {
    return [];
  }

  return [
    {
      providerResourceType: "AWS::ECS::Cluster",
      providerResourceId: arn,
      displayName: cluster.clusterName ?? arn,
      region: parseAwsArn(arn).region || fallbackRegion,
      config: compactRecord({
        arn,
        name: cluster.clusterName,
        status: cluster.status,
        configuration: normalizeEcsClusterConfiguration(cluster.configuration),
        capacityProviders: normalizeStringArray(cluster.capacityProviders)
      }),
      relationships: []
    }
  ];
}

function normalizeEcsClusterConfiguration(
  configuration: ClusterConfiguration | undefined
): Record<string, unknown> | undefined {
  if (!configuration) {
    return undefined;
  }

  const executeCommand = configuration.executeCommandConfiguration;
  const logConfiguration = executeCommand?.logConfiguration;
  const managedStorage = configuration.managedStorageConfiguration;
  const normalized = compactRecord({
    executeCommandConfiguration: executeCommand
      ? compactRecord({
          kmsKeyId: executeCommand.kmsKeyId,
          logging: executeCommand.logging,
          logConfiguration: logConfiguration
            ? compactRecord({
                cloudWatchEncryptionEnabled: logConfiguration.cloudWatchEncryptionEnabled,
                cloudWatchLogGroupName: logConfiguration.cloudWatchLogGroupName,
                s3BucketName: logConfiguration.s3BucketName,
                s3EncryptionEnabled: logConfiguration.s3EncryptionEnabled,
                s3KeyPrefix: logConfiguration.s3KeyPrefix
              })
            : undefined
        })
      : undefined,
    managedStorageConfiguration: managedStorage
      ? compactRecord({
          kmsKeyId: managedStorage.kmsKeyId,
          fargateEphemeralStorageKmsKeyId: managedStorage.fargateEphemeralStorageKmsKeyId
        })
      : undefined
  });

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function toEcsServiceRecord(
  service: Service,
  cluster: Cluster,
  fallbackRegion: string
): AwsDiscoveredResourceRecord | null {
  const arn = service.serviceArn;
  if (!arn) {
    return null;
  }

  const clusterArn = service.clusterArn ?? cluster.clusterArn;
  const taskDefinitionArn = getNonEmptyStringValue(service.taskDefinition) ?? undefined;

  return {
    providerResourceType: "AWS::ECS::Service",
    providerResourceId: arn,
    displayName: service.serviceName ?? arn,
    region: parseAwsArn(arn).region || fallbackRegion,
    config: compactRecord({
      arn,
      name: service.serviceName,
      clusterArn,
      clusterName: cluster.clusterName,
      taskDefinitionArn,
      desiredCount: service.desiredCount,
      launchType: service.launchType,
      capacityProviderStrategy: normalizeEcsCapacityProviderStrategy(
        service.capacityProviderStrategy
      ),
      networkConfiguration: normalizeEcsNetworkConfiguration(service),
      loadBalancers: normalizeEcsLoadBalancers(service)
    }),
    relationships: []
  };
}

function normalizeEcsCapacityProviderStrategy(
  strategy: Service["capacityProviderStrategy"]
): Record<string, unknown>[] | undefined {
  const normalized = (strategy ?? [])
    .map((item) =>
      compactRecord({
        capacityProvider: item.capacityProvider,
        base: item.base,
        weight: item.weight
      })
    )
    .filter((item) => getNonEmptyStringValue(item["capacityProvider"]) !== null);

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeEcsNetworkConfiguration(service: Service): Record<string, unknown> | undefined {
  const awsvpc = service.networkConfiguration?.awsvpcConfiguration;
  if (!awsvpc) {
    return undefined;
  }

  return {
    awsvpcConfiguration: compactRecord({
      subnets: normalizeStringArray(awsvpc.subnets),
      securityGroups: normalizeStringArray(awsvpc.securityGroups),
      assignPublicIp: awsvpc.assignPublicIp
    })
  };
}

function normalizeEcsLoadBalancers(service: Service): Record<string, unknown>[] | undefined {
  const loadBalancers = (service.loadBalancers ?? [])
    .map((loadBalancer) =>
      compactRecord({
        targetGroupArn: loadBalancer.targetGroupArn,
        loadBalancerName: loadBalancer.loadBalancerName,
        containerName: loadBalancer.containerName,
        containerPort: loadBalancer.containerPort
      })
    )
    .filter((loadBalancer) => Object.keys(loadBalancer).length > 0);

  return loadBalancers.length > 0 ? loadBalancers : undefined;
}

function toEcsTaskDefinitionRecord(
  taskDefinition: TaskDefinition,
  fallbackRegion: string
): AwsDiscoveredResourceRecord | null {
  const arn = taskDefinition.taskDefinitionArn;
  if (!arn) {
    return null;
  }

  const normalizedContainers = normalizeEcsContainerDefinitions(
    taskDefinition.containerDefinitions
  );

  return {
    providerResourceType: "AWS::ECS::TaskDefinition",
    providerResourceId: arn,
    displayName:
      taskDefinition.family && taskDefinition.revision !== undefined
        ? `${taskDefinition.family}:${taskDefinition.revision}`
        : taskDefinition.family ?? arn,
    region: parseAwsArn(arn).region || fallbackRegion,
    config: compactRecord({
      arn,
      family: taskDefinition.family,
      revision: taskDefinition.revision,
      networkMode: taskDefinition.networkMode,
      requiresCompatibilities: normalizeStringArray(taskDefinition.requiresCompatibilities),
      cpu: taskDefinition.cpu,
      memory: taskDefinition.memory,
      containerDefinitions: normalizedContainers.definitions,
      executionRoleArn: taskDefinition.executionRoleArn,
      taskRoleArn: taskDefinition.taskRoleArn,
      requiresManualEnvironmentInput:
        normalizedContainers.requiresManualEnvironmentInput || undefined
    }),
    relationships: []
  };
}

function normalizeEcsContainerDefinitions(
  containerDefinitions: ContainerDefinition[] | undefined
): {
  definitions: Record<string, unknown>[];
  requiresManualEnvironmentInput: boolean;
} {
  let requiresManualEnvironmentInput = false;
  const definitions = (containerDefinitions ?? []).map((container) => {
    if ((container.environment?.length ?? 0) > 0) {
      requiresManualEnvironmentInput = true;
    }

    const secrets = (container.secrets ?? []).flatMap((secret) => {
      if (!isNonEmptyString(secret.name) || !isNonEmptyString(secret.valueFrom)) {
        requiresManualEnvironmentInput = true;
        return [];
      }

      return [{ name: secret.name, valueFrom: secret.valueFrom }];
    });
    const portMappings = (container.portMappings ?? [])
      .map((portMapping) =>
        compactRecord({
          name: portMapping.name,
          containerPort: portMapping.containerPort,
          hostPort: portMapping.hostPort,
          protocol: portMapping.protocol,
          appProtocol: portMapping.appProtocol
        })
      )
      .filter((portMapping) => Object.keys(portMapping).length > 0);

    return compactRecord({
      name: container.name,
      image: container.image,
      cpu: container.cpu,
      memory: container.memory,
      memoryReservation: container.memoryReservation,
      essential: container.essential,
      portMappings: portMappings.length > 0 ? portMappings : undefined,
      secrets: secrets.length > 0 ? secrets : undefined,
      readonlyRootFilesystem: container.readonlyRootFilesystem,
      user: container.user,
      workingDirectory: container.workingDirectory
    });
  });

  return { definitions, requiresManualEnvironmentInput };
}

function chunkValues<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function toEcsFailureError(failure: Failure): Error {
  const message = [failure.reason, failure.detail, failure.arn].filter(isNonEmptyString).join(": ");

  return new Error(message || "Amazon ECS가 Resource 조회 실패를 반환했습니다.");
}

function normalizeStringArray(values: readonly string[] | undefined): string[] | undefined {
  const normalized = (values ?? []).filter(isNonEmptyString);

  return normalized.length > 0 ? normalized : undefined;
}

function getNonEmptyStringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isNonEmptyString(value: unknown): value is string {
  return getNonEmptyStringValue(value) !== null;
}

// ALB는 태그가 없어도 자주 쓰이므로 ELBv2 API를 정식 reader로 사용합니다.
export async function listApplicationLoadBalancers(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  createClient: AwsElbReadClientFactory = createDefaultElbReadClient,
  reportPageFailure: (failure: AwsPageFailure) => void = () => undefined
): Promise<AwsDiscoveredResourceRecord[]> {
  const client = createClient(region, credentials);
  const result = await collectAwsPages(async (marker) => {
    const response = await sendElbCommand<DescribeLoadBalancersCommandOutput>(
      client,
      new DescribeLoadBalancersCommand({ Marker: marker })
    );
    return {
      items: (response.LoadBalancers ?? []).flatMap((loadBalancer) =>
        toApplicationLoadBalancerRecord(loadBalancer, region)
      ),
      nextToken: response.NextMarker
    };
  });

  if (result.failure) reportPageFailure(result.failure);
  return result.items;
}

// Lambda도 태그 없이 쓰이는 경우가 많아서 ListFunctions 결과를 UNKNOWN 후보로 남깁니다.
export async function listLambdaFunctionsAsUnknown(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  createClient: AwsLambdaReadClientFactory = createDefaultLambdaReadClient,
  reportPageFailure: (failure: AwsPageFailure) => void = () => undefined
): Promise<AwsDiscoveredResourceRecord[]> {
  const client = createClient(region, credentials);
  const result = await collectAwsPages(async (marker) => {
    const response = await sendLambdaCommand<ListFunctionsCommandOutput>(
      client,
      new ListFunctionsCommand({ Marker: marker })
    );
    return {
      items: (response.Functions ?? []).flatMap((lambdaFunction) =>
        toUnknownLambdaFunctionRecord(lambdaFunction, region)
      ),
      nextToken: response.NextMarker
    };
  });

  if (result.failure) reportPageFailure(result.failure);
  return result.items;
}

export async function listLambdaPermissionsAsUnknown(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  createClient: AwsLambdaReadClientFactory = createDefaultLambdaReadClient,
  reportPageFailure: (failure: AwsPageFailure) => void = () => undefined
): Promise<AwsDiscoveredResourceRecord[]> {
  const client = createClient(region, credentials);
  const result = await collectAwsPages(async (marker) => {
    const response = await sendLambdaCommand<ListFunctionsCommandOutput>(
      client,
      new ListFunctionsCommand({ Marker: marker })
    );
    const permissionGroups = await Promise.all(
      (response.Functions ?? []).map((lambdaFunction) =>
        createLambdaPermissionRecords(lambdaFunction, region, client)
      )
    );
    return {
      items: permissionGroups.flat(),
      nextToken: response.NextMarker
    };
  });

  if (result.failure) reportPageFailure(result.failure);
  return result.items;
}

// CloudFront는 global 서비스지만 연결 계정의 credentials로 읽고 결과 region은 global로 고정합니다.
export async function listCloudFrontDistributions(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  createClient: AwsCloudFrontReadClientFactory = createDefaultCloudFrontReadClient,
  reportPageFailure: (failure: AwsPageFailure) => void = () => undefined
): Promise<AwsDiscoveredResourceRecord[]> {
  const client = createClient(region, credentials);
  const result = await collectAwsPages(async (marker) => {
    const response = await sendCloudFrontCommand<ListDistributionsCommandOutput>(
      client,
      new ListDistributionsCommand({ Marker: marker })
    );
    return {
      items: (response.DistributionList?.Items ?? []).flatMap(toCloudFrontDistributionRecord),
      nextToken: response.DistributionList?.NextMarker
    };
  });

  if (result.failure) reportPageFailure(result.failure);
  return result.items;
}

/** gg: AMI NextToken pagination도 앞 page UNKNOWN records와 safe failure를 함께 유지합니다. */
export async function listAmiImagesAsUnknown(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  createClient: AwsEc2ReadClientFactory = createDefaultEc2ReadClient,
  reportPageFailure: (failure: AwsPageFailure) => void = () => undefined
): Promise<AwsDiscoveredResourceRecord[]> {
  const client = createClient(region, credentials);
  const result = await collectAwsPages(async (nextToken) => {
    const response = await sendEc2Command<DescribeImagesCommandOutput>(
      client,
      new DescribeImagesCommand({ Owners: ["self"], MaxResults: 1_000, NextToken: nextToken })
    );
    return {
      items: (response.Images ?? []).flatMap((image) =>
        toUnknownAmiImageRecord(image, region)
      ),
      nextToken: response.NextToken
    };
  });

  if (result.failure) reportPageFailure(result.failure);
  return result.items;
}

export async function listIamRolesAsUnknown(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  createClient: AwsIamReadClientFactory = createDefaultIamReadClient,
  reportPageFailure: (failure: AwsPageFailure) => void = () => undefined
): Promise<AwsDiscoveredResourceRecord[]> {
  const client = createClient(region, credentials);
  const result = await collectAwsPages(async (marker) => {
    const response = await sendIamCommand<ListRolesCommandOutput>(
      client,
      new ListRolesCommand({ Marker: marker })
    );
    return {
      items: (response.Roles ?? []).flatMap((role) => toUnknownIamRoleRecord(role, region)),
      nextToken: response.Marker
    };
  });

  if (result.failure) reportPageFailure(result.failure);
  return result.items;
}

export async function listIamPoliciesAsUnknown(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  createClient: AwsIamReadClientFactory = createDefaultIamReadClient,
  reportPageFailure: (failure: AwsPageFailure) => void = () => undefined
): Promise<AwsDiscoveredResourceRecord[]> {
  const client = createClient(region, credentials);
  const result = await collectAwsPages(async (marker) => {
    const response = await sendIamCommand<ListPoliciesCommandOutput>(
      client,
      new ListPoliciesCommand({ Marker: marker, Scope: "Local" })
    );
    return {
      items: (response.Policies ?? []).flatMap((policy) =>
        toUnknownIamPolicyRecord(policy, region)
      ),
      nextToken: response.Marker
    };
  });

  if (result.failure) reportPageFailure(result.failure);
  return result.items;
}

export async function listIamInstanceProfilesAsUnknown(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  createClient: AwsIamReadClientFactory = createDefaultIamReadClient,
  reportPageFailure: (failure: AwsPageFailure) => void = () => undefined
): Promise<AwsDiscoveredResourceRecord[]> {
  const client = createClient(region, credentials);
  const result = await collectAwsPages(async (marker) => {
    const response = await sendIamCommand<ListInstanceProfilesCommandOutput>(
      client,
      new ListInstanceProfilesCommand({ Marker: marker })
    );
    return {
      items: (response.InstanceProfiles ?? []).flatMap((profile) =>
        toUnknownIamInstanceProfileRecord(profile, region)
      ),
      nextToken: response.Marker
    };
  });

  if (result.failure) reportPageFailure(result.failure);
  return result.items;
}

export async function listKmsKeysAsUnknown(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  createClient: AwsKmsReadClientFactory = createDefaultKmsReadClient,
  reportPageFailure: (failure: AwsPageFailure) => void = () => undefined
): Promise<AwsDiscoveredResourceRecord[]> {
  const client = createClient(region, credentials);
  const result = await collectAwsPages(async (marker) => {
    const response = await sendKmsCommand<ListKeysCommandOutput>(
      client,
      new ListKeysCommand({ Marker: marker })
    );
    const keyRecords = await Promise.all(
      (response.Keys ?? []).map((key) => createKmsKeyRecord(key.KeyId, key.KeyArn, region, client))
    );
    return {
      items: keyRecords.filter(
        (record): record is AwsDiscoveredResourceRecord => record !== null
      ),
      nextToken: response.NextMarker
    };
  });

  if (result.failure) reportPageFailure(result.failure);
  return result.items;
}

export async function listCloudWatchLogGroupsAsUnknown(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  createClient: AwsCloudWatchLogsReadClientFactory = createDefaultCloudWatchLogsReadClient,
  reportPageFailure: (failure: AwsPageFailure) => void = () => undefined
): Promise<AwsDiscoveredResourceRecord[]> {
  const client = createClient(region, credentials);
  const result = await collectAwsPages(async (nextToken) => {
    const response = await sendCloudWatchLogsCommand<DescribeLogGroupsCommandOutput>(
      client,
      new DescribeLogGroupsCommand({ nextToken })
    );
    return {
      items: (response.logGroups ?? []).flatMap((logGroup) =>
        toUnknownLogGroupRecord(logGroup, region)
      ),
      nextToken: response.nextToken
    };
  });

  if (result.failure) reportPageFailure(result.failure);
  return result.items;
}

export async function listCloudWatchMetricAlarmsAsUnknown(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  createClient: AwsCloudWatchReadClientFactory = createDefaultCloudWatchReadClient,
  reportPageFailure: (failure: AwsPageFailure) => void = () => undefined
): Promise<AwsDiscoveredResourceRecord[]> {
  const client = createClient(region, credentials);
  const result = await collectAwsPages(async (nextToken) => {
    const response = await sendCloudWatchCommand<DescribeAlarmsCommandOutput>(
      client,
      new DescribeAlarmsCommand({ NextToken: nextToken })
    );
    return {
      items: (response.MetricAlarms ?? []).flatMap((alarm) =>
        toUnknownMetricAlarmRecord(alarm, region)
      ),
      nextToken: response.NextToken
    };
  });

  if (result.failure) reportPageFailure(result.failure);
  return result.items;
}

export async function listApiGatewayRestApisAsUnknown(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  createClient: AwsApiGatewayReadClientFactory = createDefaultApiGatewayReadClient,
  reportPageFailure: (failure: AwsPageFailure) => void = () => undefined
): Promise<AwsDiscoveredResourceRecord[]> {
  const client = createClient(region, credentials);
  const result = await collectAwsPages(async (position) => {
    const response = await sendApiGatewayCommand<GetRestApisCommandOutput>(
      client,
      new GetRestApisCommand({ position })
    );
    return {
      items: (response.items ?? []).flatMap((restApi) =>
        toUnknownRestApiRecord(restApi, region)
      ),
      nextToken: response.position
    };
  });

  if (result.failure) reportPageFailure(result.failure);
  return result.items;
}

function createDefaultTaggingReadClient(
  region: string,
  credentials: TerraformAwsCredentialEnv
): AwsTaggingReadClient {
  const client = new ResourceGroupsTaggingAPIClient({
    region,
    credentials: toAwsSdkCredentials(credentials)
  });

  return {
    send: (command) => client.send(command as Parameters<ResourceGroupsTaggingAPIClient["send"]>[0])
  };
}

function createDefaultResourceExplorerReadClient(
  region: string,
  credentials: TerraformAwsCredentialEnv
): AwsResourceExplorerReadClient {
  const client = new ResourceExplorer2Client({ region, credentials: toAwsSdkCredentials(credentials) });

  return {
    send: (command) => client.send(command as Parameters<ResourceExplorer2Client["send"]>[0])
  };
}

function createDefaultElbReadClient(
  region: string,
  credentials: TerraformAwsCredentialEnv
): AwsElbReadClient {
  const client = new ElasticLoadBalancingV2Client({
    region,
    credentials: toAwsSdkCredentials(credentials)
  });

  return {
    send: (command) => client.send(command as Parameters<ElasticLoadBalancingV2Client["send"]>[0])
  };
}

function createDefaultEcsReadClient(
  region: string,
  credentials: TerraformAwsCredentialEnv
): AwsEcsReadClient {
  const client = new ECSClient({
    region,
    credentials: toAwsSdkCredentials(credentials)
  });

  return {
    send: (command) => client.send(command as Parameters<ECSClient["send"]>[0])
  };
}

function createDefaultLambdaReadClient(
  region: string,
  credentials: TerraformAwsCredentialEnv
): AwsLambdaReadClient {
  const client = new LambdaClient({
    region,
    credentials: toAwsSdkCredentials(credentials)
  });

  return {
    send: (command) => client.send(command as Parameters<LambdaClient["send"]>[0])
  };
}

function createDefaultCloudFrontReadClient(
  region: string,
  credentials: TerraformAwsCredentialEnv
): AwsCloudFrontReadClient {
  const client = new CloudFrontClient({
    region,
    credentials: toAwsSdkCredentials(credentials)
  });

  return {
    send: (command) => client.send(command as Parameters<CloudFrontClient["send"]>[0])
  };
}

function createDefaultIamReadClient(
  region: string,
  credentials: TerraformAwsCredentialEnv
): AwsIamReadClient {
  const client = new IAMClient({
    region,
    credentials: toAwsSdkCredentials(credentials)
  });

  return {
    send: (command) => client.send(command as Parameters<IAMClient["send"]>[0])
  };
}

function createDefaultKmsReadClient(
  region: string,
  credentials: TerraformAwsCredentialEnv
): AwsKmsReadClient {
  const client = new KMSClient({
    region,
    credentials: toAwsSdkCredentials(credentials)
  });

  return {
    send: (command) => client.send(command as Parameters<KMSClient["send"]>[0])
  };
}

function createDefaultCloudWatchLogsReadClient(
  region: string,
  credentials: TerraformAwsCredentialEnv
): AwsCloudWatchLogsReadClient {
  const client = new CloudWatchLogsClient({
    region,
    credentials: toAwsSdkCredentials(credentials)
  });

  return {
    send: (command) => client.send(command as Parameters<CloudWatchLogsClient["send"]>[0])
  };
}

function createDefaultApiGatewayReadClient(
  region: string,
  credentials: TerraformAwsCredentialEnv
): AwsApiGatewayReadClient {
  const client = new APIGatewayClient({
    region,
    credentials: toAwsSdkCredentials(credentials)
  });

  return {
    send: (command) => client.send(command as Parameters<APIGatewayClient["send"]>[0])
  };
}

function createDefaultEc2ReadClient(
  region: string,
  credentials: TerraformAwsCredentialEnv
): AwsEc2ReadClient {
  const client = new EC2Client({
    region,
    credentials: toAwsSdkCredentials(credentials)
  });

  return {
    send: (command) => client.send(command as Parameters<EC2Client["send"]>[0])
  };
}

function createDefaultCloudWatchReadClient(
  region: string,
  credentials: TerraformAwsCredentialEnv
): AwsCloudWatchReadClient {
  const client = new CloudWatchClient({
    region,
    credentials: toAwsSdkCredentials(credentials)
  });

  return {
    send: (command) => client.send(command as Parameters<CloudWatchClient["send"]>[0])
  };
}

async function sendTaggingCommand<TOutput>(
  client: AwsTaggingReadClient,
  command: object
): Promise<TOutput> {
  return (await client.send(command)) as TOutput;
}

async function sendResourceExplorerCommand<TOutput>(
  client: AwsResourceExplorerReadClient,
  command: object
): Promise<TOutput> {
  return (await client.send(command)) as TOutput;
}

async function sendElbCommand<TOutput>(client: AwsElbReadClient, command: object): Promise<TOutput> {
  return (await client.send(command)) as TOutput;
}

async function sendEcsCommand<TOutput>(client: AwsEcsReadClient, command: object): Promise<TOutput> {
  return (await client.send(command)) as TOutput;
}

async function sendLambdaCommand<TOutput>(
  client: AwsLambdaReadClient,
  command: object
): Promise<TOutput> {
  return (await client.send(command)) as TOutput;
}

async function sendCloudFrontCommand<TOutput>(
  client: AwsCloudFrontReadClient,
  command: object
): Promise<TOutput> {
  return (await client.send(command)) as TOutput;
}

async function sendIamCommand<TOutput>(client: AwsIamReadClient, command: object): Promise<TOutput> {
  return (await client.send(command)) as TOutput;
}

async function sendKmsCommand<TOutput>(client: AwsKmsReadClient, command: object): Promise<TOutput> {
  return (await client.send(command)) as TOutput;
}

async function sendCloudWatchLogsCommand<TOutput>(
  client: AwsCloudWatchLogsReadClient,
  command: object
): Promise<TOutput> {
  return (await client.send(command)) as TOutput;
}

async function sendApiGatewayCommand<TOutput>(
  client: AwsApiGatewayReadClient,
  command: object
): Promise<TOutput> {
  return (await client.send(command)) as TOutput;
}

async function sendEc2Command<TOutput>(client: AwsEc2ReadClient, command: object): Promise<TOutput> {
  return (await client.send(command)) as TOutput;
}

async function sendCloudWatchCommand<TOutput>(
  client: AwsCloudWatchReadClient,
  command: object
): Promise<TOutput> {
  return (await client.send(command)) as TOutput;
}

function toApplicationLoadBalancerRecord(
  loadBalancer: LoadBalancer,
  fallbackRegion: string
): AwsDiscoveredResourceRecord[] {
  const arn = loadBalancer.LoadBalancerArn;

  if (!arn || loadBalancer.Type !== "application") {
    return [];
  }

  const vpcId = loadBalancer.VpcId;
  const securityGroupIds = loadBalancer.SecurityGroups ?? [];
  const availabilityZones = (loadBalancer.AvailabilityZones ?? []).flatMap((availabilityZone) => {
    const availabilityZoneName = availabilityZone.ZoneName;
    const subnetId = availabilityZone.SubnetId;

    return availabilityZoneName || subnetId
      ? [{ ...(availabilityZoneName ? { availabilityZone: availabilityZoneName } : {}), ...(subnetId ? { subnetId } : {}) }]
      : [];
  });
  const subnetIds = availabilityZones.flatMap((availabilityZone) =>
    typeof availabilityZone.subnetId === "string" ? [availabilityZone.subnetId] : []
  );
  const relationships = [
    ...(vpcId ? [{ type: "depends_on" as const, targetProviderResourceId: vpcId }] : []),
    ...securityGroupIds.map((securityGroupId) => ({
      type: "attached_to" as const,
      targetProviderResourceId: securityGroupId
    }))
  ];

  return [
    {
      providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
      providerResourceId: arn,
      displayName: loadBalancer.LoadBalancerName ?? arn,
      region: fallbackRegion,
      config: {
        arn,
        availabilityZones,
        dnsName: loadBalancer.DNSName,
        ipAddressType: loadBalancer.IpAddressType,
        name: loadBalancer.LoadBalancerName,
        scheme: loadBalancer.Scheme,
        securityGroupIds,
        subnetIds,
        type: loadBalancer.Type,
        vpcId
      },
      relationships
    }
  ];
}

function toUnknownLambdaFunctionRecord(
  lambdaFunction: FunctionConfiguration,
  fallbackRegion: string
): AwsDiscoveredResourceRecord[] {
  const arn = lambdaFunction.FunctionArn;

  if (!arn) {
    return [];
  }

  const vpcId = lambdaFunction.VpcConfig?.VpcId;
  const subnetIds = lambdaFunction.VpcConfig?.SubnetIds ?? [];
  const securityGroupIds = lambdaFunction.VpcConfig?.SecurityGroupIds ?? [];
  const relationships = [
    ...(vpcId ? [{ type: "depends_on" as const, targetProviderResourceId: vpcId }] : []),
    ...subnetIds.map((subnetId) => ({ type: "attached_to" as const, targetProviderResourceId: subnetId })),
    ...securityGroupIds.map((securityGroupId) => ({
      type: "attached_to" as const,
      targetProviderResourceId: securityGroupId
    }))
  ];

  return [
    {
      providerResourceType: "AWS::Lambda::Function",
      providerResourceId: arn,
      displayName: lambdaFunction.FunctionName ?? "Lambda 함수",
      region: parseAwsArn(arn).region || fallbackRegion,
      config: compactRecord({
        architectures: lambdaFunction.Architectures,
        codeSize: lambdaFunction.CodeSize,
        ephemeralStorageSize: lambdaFunction.EphemeralStorage?.Size,
        functionName: lambdaFunction.FunctionName,
        handler: lambdaFunction.Handler,
        lastModified: lambdaFunction.LastModified,
        lastUpdateStatus: lambdaFunction.LastUpdateStatus,
        memorySize: lambdaFunction.MemorySize,
        packageType: lambdaFunction.PackageType,
        runtime: lambdaFunction.Runtime,
        securityGroupIds,
        state: lambdaFunction.State,
        subnetIds,
        timeout: lambdaFunction.Timeout,
        tracingMode: lambdaFunction.TracingConfig?.Mode,
        version: lambdaFunction.Version,
        vpcId
      }),
      relationships
    }
  ];
}

async function createLambdaPermissionRecords(
  lambdaFunction: FunctionConfiguration,
  fallbackRegion: string,
  client: AwsLambdaReadClient
): Promise<AwsDiscoveredResourceRecord[]> {
  if (!lambdaFunction.FunctionName || !lambdaFunction.FunctionArn) {
    return [];
  }

  const policy = await readOptionalS3Detail(() =>
    sendLambdaCommand<GetPolicyCommandOutput>(
      client,
      new GetPolicyCommand({ FunctionName: lambdaFunction.FunctionName })
    )
  );
  const statements = parseLambdaPolicyStatements(policy?.Policy);

  return statements.map((statement, index) =>
    toUnknownLambdaPermissionRecord(lambdaFunction, statement, index, fallbackRegion)
  );
}

function parseLambdaPolicyStatements(policyText: string | undefined): LambdaPolicyStatement[] {
  if (!policyText) {
    return [];
  }

  try {
    const policy = JSON.parse(policyText) as LambdaPolicyDocument;
    const statements = policy.Statement;

    if (!statements) {
      return [];
    }

    return Array.isArray(statements) ? statements : [statements];
  } catch {
    return [];
  }
}

function toUnknownLambdaPermissionRecord(
  lambdaFunction: FunctionConfiguration,
  statement: LambdaPolicyStatement,
  index: number,
  fallbackRegion: string
): AwsDiscoveredResourceRecord {
  const functionArn = lambdaFunction.FunctionArn ?? lambdaFunction.FunctionName ?? "lambda-function";
  const permissionIndex = index + 1;
  const providerResourceId = `${functionArn}:permission:${permissionIndex}`;

  return {
    providerResourceType: "AWS::Lambda::Permission",
    providerResourceId,
    displayName: `${lambdaFunction.FunctionName ?? "Lambda 함수"} permission ${permissionIndex}`,
    region: parseAwsArn(functionArn).region || fallbackRegion,
    config: {
      effect: normalizePolicyEffect(statement.Effect),
      functionName: lambdaFunction.FunctionName,
      hasCondition: isRecordValue(statement.Condition),
      permissionIndex
    },
    relationships: [{ type: "depends_on", targetProviderResourceId: functionArn }]
  };
}

function toCloudFrontDistributionRecord(
  distribution: DistributionSummary
): AwsDiscoveredResourceRecord[] {
  const arn = distribution.ARN;

  if (!arn) {
    return [];
  }

  const arnParts = parseAwsArn(arn);

  return [
    {
      providerResourceType: "AWS::CloudFront::Distribution",
      providerResourceId: arn,
      displayName: distribution.DomainName ?? distribution.Id ?? arn,
      region: "global",
      config: compactRecord({
        accountId: arnParts.accountId || undefined,
        arn,
        comment: distribution.Comment,
        defaultCacheBehavior: normalizeCloudFrontDefaultCacheBehavior(
          distribution.DefaultCacheBehavior
        ),
        domainName: distribution.DomainName,
        enabled: distribution.Enabled,
        id: distribution.Id,
        origin: normalizeCloudFrontOrigins(distribution),
        restrictions: normalizeCloudFrontRestrictions(distribution),
        status: distribution.Status,
        viewerCertificate: normalizeCloudFrontViewerCertificate(distribution)
      }),
      relationships: []
    }
  ];
}

function normalizeCloudFrontOrigins(distribution: DistributionSummary): Record<string, unknown>[] {
  return (distribution.Origins?.Items ?? []).map((origin) =>
    compactRecord({
      connectionAttempts: origin.ConnectionAttempts,
      connectionTimeout: origin.ConnectionTimeout,
      customOriginConfig: origin.CustomOriginConfig
        ? compactRecord({
            httpPort: origin.CustomOriginConfig.HTTPPort,
            httpsPort: origin.CustomOriginConfig.HTTPSPort,
            originKeepaliveTimeout: origin.CustomOriginConfig.OriginKeepaliveTimeout,
            originProtocolPolicy: origin.CustomOriginConfig.OriginProtocolPolicy,
            originReadTimeout: origin.CustomOriginConfig.OriginReadTimeout,
            originSslProtocols: origin.CustomOriginConfig.OriginSslProtocols?.Items
          })
        : undefined,
      domainName: origin.DomainName,
      originAccessControlId: origin.OriginAccessControlId,
      originId: origin.Id,
      originPath: origin.OriginPath,
      s3OriginConfig: origin.S3OriginConfig
        ? compactRecord({ originAccessIdentity: origin.S3OriginConfig.OriginAccessIdentity })
        : undefined,
      vpcOriginConfig: origin.VpcOriginConfig
        ? compactRecord({
            originKeepaliveTimeout: origin.VpcOriginConfig.OriginKeepaliveTimeout,
            originReadTimeout: origin.VpcOriginConfig.OriginReadTimeout,
            ownerAccountId: origin.VpcOriginConfig.OwnerAccountId,
            vpcOriginId: origin.VpcOriginConfig.VpcOriginId
          })
        : undefined
    })
  );
}

function normalizeCloudFrontDefaultCacheBehavior(
  behavior: DefaultCacheBehavior | undefined
): Record<string, unknown> | undefined {
  if (!behavior) {
    return undefined;
  }

  return compactRecord({
    allowedMethods: behavior.AllowedMethods?.Items,
    cachePolicyId: behavior.CachePolicyId,
    cachedMethods: behavior.AllowedMethods?.CachedMethods?.Items,
    compress: behavior.Compress,
    defaultTtl: behavior.DefaultTTL,
    fieldLevelEncryptionId: behavior.FieldLevelEncryptionId,
    forwardedValues: normalizeCloudFrontForwardedValues(behavior.ForwardedValues),
    maxTtl: behavior.MaxTTL,
    minTtl: behavior.MinTTL,
    originRequestPolicyId: behavior.OriginRequestPolicyId,
    realtimeLogConfigArn: behavior.RealtimeLogConfigArn,
    responseHeadersPolicyId: behavior.ResponseHeadersPolicyId,
    smoothStreaming: behavior.SmoothStreaming,
    targetOriginId: behavior.TargetOriginId,
    trustedKeyGroups: behavior.TrustedKeyGroups?.Items,
    trustedSigners: behavior.TrustedSigners?.Items,
    viewerProtocolPolicy: behavior.ViewerProtocolPolicy
  });
}

function normalizeCloudFrontForwardedValues(
  forwardedValues: ForwardedValues | undefined
): Record<string, unknown> | undefined {
  if (!forwardedValues) {
    return undefined;
  }

  return compactRecord({
    cookies: forwardedValues.Cookies
      ? compactRecord({
          forward: forwardedValues.Cookies.Forward,
          whitelistedNames: forwardedValues.Cookies.WhitelistedNames?.Items
        })
      : undefined,
    headers: forwardedValues.Headers?.Items,
    queryString: forwardedValues.QueryString,
    queryStringCacheKeys: forwardedValues.QueryStringCacheKeys?.Items
  });
}

function normalizeCloudFrontRestrictions(
  distribution: DistributionSummary
): Record<string, unknown> | undefined {
  const geoRestriction = distribution.Restrictions?.GeoRestriction;

  return geoRestriction
    ? {
        geoRestriction: compactRecord({
          locations: geoRestriction.Items,
          restrictionType: geoRestriction.RestrictionType
        })
      }
    : undefined;
}

function normalizeCloudFrontViewerCertificate(
  distribution: DistributionSummary
): Record<string, unknown> | undefined {
  const certificate = distribution.ViewerCertificate;

  return certificate
    ? compactRecord({
        acmCertificateArn: certificate.ACMCertificateArn,
        cloudfrontDefaultCertificate: certificate.CloudFrontDefaultCertificate,
        iamCertificateId: certificate.IAMCertificateId,
        minimumProtocolVersion: certificate.MinimumProtocolVersion,
        sslSupportMethod: certificate.SSLSupportMethod
      })
    : undefined;
}

function toUnknownAmiImageRecord(image: Image, fallbackRegion: string): AwsDiscoveredResourceRecord[] {
  if (!image.ImageId) {
    return [];
  }

  return [
    {
      providerResourceType: "AWS::EC2::Image",
      providerResourceId: image.ImageId,
      displayName: image.Name ?? image.ImageId,
      region: fallbackRegion,
      config: {
        architecture: image.Architecture,
        blockDeviceMappings: image.BlockDeviceMappings,
        bootMode: image.BootMode,
        createdAt: image.CreationDate,
        description: image.Description,
        imageId: image.ImageId,
        imageLocation: image.ImageLocation,
        imageOwnerAlias: image.ImageOwnerAlias,
        imageType: image.ImageType,
        name: image.Name,
        ownerId: image.OwnerId,
        platform: image.Platform,
        platformDetails: image.PlatformDetails,
        public: image.Public,
        providerParameters: toProviderParameterSnapshot(image),
        rootDeviceName: image.RootDeviceName,
        rootDeviceType: image.RootDeviceType,
        state: image.State,
        tags: image.Tags,
        virtualizationType: image.VirtualizationType
      },
      relationships: []
    }
  ];
}

function toUnknownIamRoleRecord(role: Role, fallbackRegion: string): AwsDiscoveredResourceRecord[] {
  const arn = role.Arn;

  if (!arn) {
    return [];
  }

  return [
    {
      providerResourceType: "AWS::IAM::Role",
      providerResourceId: arn,
      displayName: role.RoleName ?? "IAM Role",
      region: "global",
      config: compactRecord({
        createdAt: role.CreateDate?.toISOString(),
        description: role.Description,
        hasPermissionsBoundary: role.PermissionsBoundary !== undefined,
        hasTrustPolicy: isNonEmptyString(role.AssumeRolePolicyDocument),
        lastUsedAt: role.RoleLastUsed?.LastUsedDate?.toISOString(),
        lastUsedRegion: role.RoleLastUsed?.Region,
        maxSessionDuration: role.MaxSessionDuration,
        path: role.Path,
        roleName: role.RoleName,
        scanRegion: fallbackRegion
      }),
      relationships: []
    }
  ];
}

function toUnknownIamPolicyRecord(
  policy: Policy,
  fallbackRegion: string
): AwsDiscoveredResourceRecord[] {
  const arn = policy.Arn;

  if (!arn) {
    return [];
  }

  return [
    {
      providerResourceType: "AWS::IAM::Policy",
      providerResourceId: arn,
      displayName: policy.PolicyName ?? "IAM Policy",
      region: "global",
      config: compactRecord({
        attachmentCount: policy.AttachmentCount,
        createdAt: policy.CreateDate?.toISOString(),
        description: policy.Description,
        isAttachable: policy.IsAttachable,
        path: policy.Path,
        permissionsBoundaryUsageCount: policy.PermissionsBoundaryUsageCount,
        policyName: policy.PolicyName,
        scanRegion: fallbackRegion,
        updatedAt: policy.UpdateDate?.toISOString()
      }),
      relationships: []
    }
  ];
}

function toUnknownIamInstanceProfileRecord(
  profile: InstanceProfile,
  fallbackRegion: string
): AwsDiscoveredResourceRecord[] {
  const arn = profile.Arn;

  if (!arn) {
    return [];
  }

  return [
    {
      providerResourceType: "AWS::IAM::InstanceProfile",
      providerResourceId: arn,
      displayName: profile.InstanceProfileName ?? "IAM Instance Profile",
      region: "global",
      config: compactRecord({
        createdAt: profile.CreateDate?.toISOString(),
        instanceProfileName: profile.InstanceProfileName,
        path: profile.Path,
        roleNames: (profile.Roles ?? []).flatMap((role) =>
          role.RoleName ? [role.RoleName] : []
        ),
        scanRegion: fallbackRegion,
      }),
      relationships: (profile.Roles ?? []).flatMap((role) =>
        role.Arn ? [{ type: "depends_on" as const, targetProviderResourceId: role.Arn }] : []
      )
    }
  ];
}

async function createKmsKeyRecord(
  keyId: string | undefined,
  keyArn: string | undefined,
  fallbackRegion: string,
  client: AwsKmsReadClient
): Promise<AwsDiscoveredResourceRecord | null> {
  if (!keyId && !keyArn) {
    return null;
  }

  const keyMetadata = await readOptionalS3Detail(() =>
    sendKmsCommand<DescribeKeyCommandOutput>(client, new DescribeKeyCommand({ KeyId: keyId ?? keyArn }))
  );

  return toUnknownKmsKeyRecord(keyMetadata?.KeyMetadata, keyId, keyArn, fallbackRegion);
}

function toUnknownKmsKeyRecord(
  keyMetadata: KeyMetadata | undefined,
  fallbackKeyId: string | undefined,
  fallbackKeyArn: string | undefined,
  fallbackRegion: string
): AwsDiscoveredResourceRecord | null {
  const providerResourceId = keyMetadata?.Arn ?? fallbackKeyArn ?? fallbackKeyId;

  if (!providerResourceId) {
    return null;
  }

  return {
    providerResourceType: "AWS::KMS::Key",
    providerResourceId,
    displayName: keyMetadata?.Description ?? keyMetadata?.KeyId ?? fallbackKeyId ?? providerResourceId,
    region: fallbackRegion,
    config: {
      arn: keyMetadata?.Arn ?? fallbackKeyArn,
      cloudHsmClusterId: keyMetadata?.CloudHsmClusterId,
      createdAt: keyMetadata?.CreationDate?.toISOString(),
      customerMasterKeySpec: keyMetadata?.CustomerMasterKeySpec,
      deletionDate: keyMetadata?.DeletionDate?.toISOString(),
      description: keyMetadata?.Description,
      enabled: keyMetadata?.Enabled,
      expirationModel: keyMetadata?.ExpirationModel,
      keyId: keyMetadata?.KeyId ?? fallbackKeyId,
      keyManager: keyMetadata?.KeyManager,
      keySpec: keyMetadata?.KeySpec,
      keyState: keyMetadata?.KeyState,
      keyUsage: keyMetadata?.KeyUsage,
      multiRegion: keyMetadata?.MultiRegion,
      origin: keyMetadata?.Origin,
      providerParameters: toProviderParameterSnapshot(
        keyMetadata ?? { KeyId: fallbackKeyId, KeyArn: fallbackKeyArn }
      ),
      scanRegion: fallbackRegion
    },
    relationships: []
  };
}

function toUnknownLogGroupRecord(
  logGroup: LogGroup,
  fallbackRegion: string
): AwsDiscoveredResourceRecord[] {
  const providerResourceId = logGroup.arn ?? logGroup.logGroupName;

  if (!providerResourceId) {
    return [];
  }

  return [
    {
      providerResourceType: "AWS::Logs::LogGroup",
      providerResourceId,
      displayName: logGroup.logGroupName ?? providerResourceId,
      region: fallbackRegion,
      config: {
        arn: logGroup.arn,
        createdAt: logGroup.creationTime,
        kmsKeyId: logGroup.kmsKeyId,
        logGroupClass: logGroup.logGroupClass,
        logGroupName: logGroup.logGroupName,
        metricFilterCount: logGroup.metricFilterCount,
        providerParameters: toProviderParameterSnapshot(logGroup),
        retentionInDays: logGroup.retentionInDays,
        storedBytes: logGroup.storedBytes
      },
      relationships: []
    }
  ];
}

function toUnknownMetricAlarmRecord(
  alarm: MetricAlarm,
  fallbackRegion: string
): AwsDiscoveredResourceRecord[] {
  const providerResourceId = alarm.AlarmArn ?? alarm.AlarmName;

  if (!providerResourceId) {
    return [];
  }

  return [
    {
      providerResourceType: "AWS::CloudWatch::Alarm",
      providerResourceId,
      displayName: alarm.AlarmName ?? providerResourceId,
      region: fallbackRegion,
      config: {
        actionsEnabled: alarm.ActionsEnabled,
        alarmActions: alarm.AlarmActions,
        alarmArn: alarm.AlarmArn,
        alarmConfigurationUpdatedAt: alarm.AlarmConfigurationUpdatedTimestamp?.toISOString(),
        alarmDescription: alarm.AlarmDescription,
        alarmName: alarm.AlarmName,
        comparisonOperator: alarm.ComparisonOperator,
        datapointsToAlarm: alarm.DatapointsToAlarm,
        dimensions: alarm.Dimensions,
        evaluationPeriods: alarm.EvaluationPeriods,
        insufficientDataActions: alarm.InsufficientDataActions,
        metricName: alarm.MetricName,
        metrics: alarm.Metrics,
        namespace: alarm.Namespace,
        okActions: alarm.OKActions,
        period: alarm.Period,
        providerParameters: toProviderParameterSnapshot(alarm),
        stateReason: alarm.StateReason,
        stateUpdatedAt: alarm.StateUpdatedTimestamp?.toISOString(),
        stateValue: alarm.StateValue,
        statistic: alarm.Statistic,
        threshold: alarm.Threshold,
        treatMissingData: alarm.TreatMissingData,
        unit: alarm.Unit
      },
      relationships: []
    }
  ];
}

function toUnknownRestApiRecord(restApi: RestApi, fallbackRegion: string): AwsDiscoveredResourceRecord[] {
  if (!restApi.id) {
    return [];
  }

  return [
    {
      providerResourceType: "AWS::ApiGateway::RestApi",
      providerResourceId: restApi.id,
      displayName: restApi.name ?? restApi.id,
      region: fallbackRegion,
      config: {
        apiKeySource: restApi.apiKeySource,
        binaryMediaTypes: restApi.binaryMediaTypes,
        createdAt: restApi.createdDate?.toISOString(),
        description: restApi.description,
        disableExecuteApiEndpoint: restApi.disableExecuteApiEndpoint,
        endpointConfiguration: restApi.endpointConfiguration,
        id: restApi.id,
        minimumCompressionSize: restApi.minimumCompressionSize,
        name: restApi.name,
        providerParameters: toProviderParameterSnapshot(restApi),
        rootResourceId: restApi.rootResourceId,
        tags: restApi.tags,
        version: restApi.version,
        warnings: restApi.warnings
      },
      relationships: []
    }
  ];
}

function toUnknownTaggedResourceRecord(
  resource: ResourceTagMapping,
  fallbackRegion: string
): AwsDiscoveredResourceRecord[] {
  const arn = resource.ResourceARN;

  if (!arn || isKnownTaggedResourceArn(arn)) {
    return [];
  }

  const arnParts = parseAwsArn(arn);
  const tags = (resource.Tags ?? []).map((tag) => ({ key: tag.Key, value: tag.Value }));
  const nameTag = tags.find((tag) => tag.key === "Name")?.value;

  return [
    {
      providerResourceType: arnParts.providerResourceType,
      providerResourceId: arn,
      displayName: nameTag ?? arnParts.resourceName ?? arn,
      region: arnParts.region || fallbackRegion,
      config: {
        arn,
        accountId: arnParts.accountId,
        resourceKind: arnParts.resourceKind,
        providerParameters: toProviderParameterSnapshot(resource),
        service: arnParts.service,
        tags
      },
      relationships: []
    }
  ];
}

function toUnknownResourceExplorerRecord(
  resource: Resource,
  fallbackRegion: string
): AwsDiscoveredResourceRecord[] {
  const arn = resource.Arn;

  if (!arn || isKnownTaggedResourceArn(arn)) {
    return [];
  }

  const arnParts = parseAwsArn(arn);

  return [
    {
      providerResourceType: resource.ResourceType ?? arnParts.providerResourceType,
      providerResourceId: arn,
      displayName: arnParts.resourceName || arn,
      region: resource.Region || arnParts.region || fallbackRegion,
      config: {
        arn,
        accountId: resource.OwningAccountId ?? arnParts.accountId,
        lastReportedAt: resource.LastReportedAt?.toISOString(),
        providerParameters: toProviderParameterSnapshot(resource),
        resourceKind: arnParts.resourceKind,
        service: resource.Service ?? arnParts.service
      },
      relationships: []
    }
  ];
}

function parseAwsArn(arn: string): {
  accountId: string;
  providerResourceType: string;
  region: string;
  resourceKind: string;
  resourceName: string;
  service: string;
} {
  const [, , service = "unknown", region = "", accountId = "", ...resourceParts] = arn.split(":");
  const resource = resourceParts.join(":");
  const [resourceKind = "resource", ...nameParts] = resource.split(/[/:]/);
  const resourceName = nameParts.join("/");

  return {
    accountId,
    providerResourceType: toProviderResourceType(service, resourceKind),
    region,
    resourceKind,
    resourceName,
    service
  };
}

function toProviderResourceType(service: string, resourceKind: string): string {
  return `AWS::${toPascalCase(service)}::${toPascalCase(resourceKind)}`;
}

function toPascalCase(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join("");
}

function isKnownTaggedResourceArn(arn: string): boolean {
  return (
    /:ec2:[^:]*:[^:]*:(vpc|subnet|internet-gateway|route-table|security-group|instance)\//.test(arn) ||
    /:rds:[^:]*:[^:]*:db:/.test(arn) ||
    /^arn:aws:s3:::[^/]+$/.test(arn)
  );
}

// 정식 reader가 담당하는 ARN은 Resource Explorer/Tagging의 UNKNOWN 결과에서 다시 만들지 않습니다.
export function isReverseEngineeringPromotedResourceArn(arn: string): boolean {
  if (!arn.startsWith("arn:")) {
    return false;
  }

  const parsedArn = parseAwsArn(arn);

  return (
    (parsedArn.service === "elasticloadbalancing" &&
      parsedArn.resourceKind === "loadbalancer" &&
      parsedArn.resourceName.startsWith("app/")) ||
    (parsedArn.service === "cloudfront" && parsedArn.resourceKind === "distribution") ||
    (parsedArn.service === "ecs" &&
      ["cluster", "service", "task-definition"].includes(parsedArn.resourceKind))
  );
}

// ECS 관계는 API 응답의 명시적인 ID가 같은 scan record로 확인될 때만 Board로 전달합니다.
export function resolveEcsRelationships(
  records: AwsDiscoveredResourceRecord[]
): AwsDiscoveredResourceRecord[] {
  const providerResourceIds = new Set(records.map((record) => record.providerResourceId));

  return records.map((record) => {
    if (record.providerResourceType !== "AWS::ECS::Service") {
      return record;
    }

    const candidateRelationships: AwsDiscoveredResourceRecord["relationships"] = [
      ...record.relationships,
      ...createEcsRelationship(record.config["clusterArn"], "depends_on"),
      ...createEcsRelationship(record.config["taskDefinitionArn"], "depends_on")
    ];
    const networkConfiguration = isRecordValue(record.config["networkConfiguration"])
      ? record.config["networkConfiguration"]
      : null;
    const awsvpcConfiguration = networkConfiguration && isRecordValue(
      networkConfiguration["awsvpcConfiguration"]
    )
      ? networkConfiguration["awsvpcConfiguration"]
      : null;

    if (awsvpcConfiguration) {
      candidateRelationships.push(
        ...createEcsRelationships(awsvpcConfiguration["subnets"], "attached_to"),
        ...createEcsRelationships(awsvpcConfiguration["securityGroups"], "attached_to")
      );
    }

    const loadBalancers = Array.isArray(record.config["loadBalancers"])
      ? record.config["loadBalancers"].filter(isRecordValue)
      : [];
    candidateRelationships.push(
      ...loadBalancers.flatMap((loadBalancer) =>
        createEcsRelationship(loadBalancer["targetGroupArn"], "attached_to")
      )
    );

    return {
      ...record,
      relationships: uniqueDiscoveredRelationships(
        candidateRelationships.filter((relationship) =>
          providerResourceIds.has(relationship.targetProviderResourceId)
        )
      )
    };
  });
}

function createEcsRelationship(
  providerResourceId: unknown,
  type: AwsDiscoveredResourceRecord["relationships"][number]["type"]
): AwsDiscoveredResourceRecord["relationships"] {
  const normalizedId = getNonEmptyStringValue(providerResourceId);

  return normalizedId ? [{ type, targetProviderResourceId: normalizedId }] : [];
}

function createEcsRelationships(
  providerResourceIds: unknown,
  type: AwsDiscoveredResourceRecord["relationships"][number]["type"]
): AwsDiscoveredResourceRecord["relationships"] {
  return Array.isArray(providerResourceIds)
    ? providerResourceIds.flatMap((providerResourceId) =>
        createEcsRelationship(providerResourceId, type)
      )
    : [];
}

// CloudFront origin의 명시적인 domain/ARN이 같은 scan record와 일치할 때만 관계를 추가합니다.
export function resolveCloudFrontOriginRelationships(
  records: AwsDiscoveredResourceRecord[]
): AwsDiscoveredResourceRecord[] {
  const originCandidates = records.filter(
    (record) =>
      record.providerResourceType === "AWS::ElasticLoadBalancingV2::LoadBalancer" ||
      record.providerResourceType === "AWS::S3::Bucket"
  );

  return records.map((record) => {
    if (record.providerResourceType !== "AWS::CloudFront::Distribution") {
      return record;
    }

    const origins = Array.isArray(record.config["origin"])
      ? record.config["origin"].filter(isRecordValue)
      : [];
    const resolvedRelationships = origins.flatMap((origin) => {
      const candidate = originCandidates.find((resource) => originExplicitlyReferencesResource(origin, resource));

      return candidate
        ? [{ type: "depends_on" as const, targetProviderResourceId: candidate.providerResourceId }]
        : [];
    });

    return {
      ...record,
      relationships: uniqueDiscoveredRelationships([
        ...record.relationships,
        ...resolvedRelationships
      ])
    };
  });
}

function originExplicitlyReferencesResource(
  origin: Record<string, unknown>,
  resource: AwsDiscoveredResourceRecord
): boolean {
  const explicitOriginIds = [origin["arn"], origin["originArn"], origin["providerResourceId"]]
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  if (explicitOriginIds.includes(resource.providerResourceId)) {
    return true;
  }

  const domainName = origin["domainName"];
  if (typeof domainName !== "string" || domainName.length === 0) {
    return false;
  }

  if (resource.providerResourceType === "AWS::ElasticLoadBalancingV2::LoadBalancer") {
    return resource.config["dnsName"] === domainName;
  }

  return (
    resource.providerResourceType === "AWS::S3::Bucket" &&
    isS3OriginDomainForBucket(domainName, resource.providerResourceId)
  );
}

function isS3OriginDomainForBucket(domainName: string, bucketName: string): boolean {
  const normalizedDomainName = domainName.toLowerCase().replace(/\.$/, "");
  const normalizedBucketName = bucketName.toLowerCase();
  const endpointSuffix = normalizedDomainName.endsWith(".amazonaws.com.cn")
    ? ".amazonaws.com.cn"
    : normalizedDomainName.endsWith(".amazonaws.com")
      ? ".amazonaws.com"
      : null;

  if (!endpointSuffix || !normalizedDomainName.startsWith(`${normalizedBucketName}.`)) {
    return false;
  }

  const endpoint = normalizedDomainName.slice(
    normalizedBucketName.length + 1,
    -endpointSuffix.length
  );

  return isAwsS3Endpoint(endpoint);
}

function isAwsS3Endpoint(endpoint: string): boolean {
  if (
    endpoint === "s3" ||
    endpoint === "s3-accelerate" ||
    endpoint === "s3-accelerate.dualstack"
  ) {
    return true;
  }

  if (endpoint.startsWith("s3.dualstack.")) {
    return isAwsRegion(endpoint.slice("s3.dualstack.".length));
  }

  if (endpoint.startsWith("s3-website.")) {
    return isAwsRegion(endpoint.slice("s3-website.".length));
  }

  if (endpoint.startsWith("s3-website-")) {
    return isAwsRegion(endpoint.slice("s3-website-".length));
  }

  if (endpoint.startsWith("s3.")) {
    return isAwsRegion(endpoint.slice("s3.".length));
  }

  return endpoint.startsWith("s3-") && isAwsRegion(endpoint.slice("s3-".length));
}

function isAwsRegion(value: string): boolean {
  return /^[a-z]{2}(?:-gov)?-[a-z0-9-]+-\d+$/.test(value);
}

function uniqueDiscoveredRelationships(
  relationships: AwsDiscoveredResourceRecord["relationships"]
): AwsDiscoveredResourceRecord["relationships"] {
  return [
    ...new Map(
      relationships.map((relationship) => [
        `${relationship.type}:${relationship.targetProviderResourceId}`,
        relationship
      ])
    ).values()
  ];
}

// gg: 같은 Log Group이 여러 reader에서 잡히면 이름과 설정이 있는 전용 조회 결과를 보존합니다.
export function uniqueDiscoveredRecordsByProviderId(
  records: AwsDiscoveredResourceRecord[]
): AwsDiscoveredResourceRecord[] {
  const uniqueRecords: AwsDiscoveredResourceRecord[] = [];
  const recordIndexByProviderResourceId = new Map<string, number>();

  for (const record of records) {
    const identityKey = createDiscoveredRecordIdentityKey(record);
    const existingIndex = recordIndexByProviderResourceId.get(identityKey);
    if (existingIndex === undefined) {
      recordIndexByProviderResourceId.set(identityKey, uniqueRecords.length);
      uniqueRecords.push(record);
      continue;
    }

    const existingRecord = uniqueRecords[existingIndex];
    if (existingRecord && shouldPreferDetailedLogGroupRecord(existingRecord, record)) {
      uniqueRecords[existingIndex] = record;
    }
  }

  return uniqueRecords;
}

/** CloudWatch Logs SDK ARN의 끝 `:*`와 Resource Explorer ARN을 같은 Log Group으로 맞춥니다. */
function createDiscoveredRecordIdentityKey(record: AwsDiscoveredResourceRecord): string {
  if (record.providerResourceType !== "AWS::Logs::LogGroup") {
    return record.providerResourceId;
  }

  return record.providerResourceId.endsWith(":*")
    ? record.providerResourceId.slice(0, -2)
    : record.providerResourceId;
}

// gg: 다른 Resource의 기존 first-win 규칙은 유지하고 Log Group의 전용 상세 정보만 교체합니다.
function shouldPreferDetailedLogGroupRecord(
  existingRecord: AwsDiscoveredResourceRecord,
  candidateRecord: AwsDiscoveredResourceRecord
): boolean {
  return (
    existingRecord.providerResourceType === "AWS::Logs::LogGroup" &&
    candidateRecord.providerResourceType === "AWS::Logs::LogGroup" &&
    getNonEmptyStringValue(existingRecord.config["logGroupName"]) === null &&
    getNonEmptyStringValue(candidateRecord.config["logGroupName"]) !== null
  );
}

function compactRecord(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined)
  );
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// gg: Policy 원문은 버리고 permission의 허용·거부 여부만 안전한 소문자 요약으로 남깁니다.
function normalizePolicyEffect(value: unknown): "allow" | "deny" | "unknown" {
  if (value === "Allow") return "allow";
  if (value === "Deny") return "deny";
  return "unknown";
}

function toAwsSdkCredentials(credentials: TerraformAwsCredentialEnv) {
  return credentials.AWS_SESSION_TOKEN
    ? {
        accessKeyId: credentials.AWS_ACCESS_KEY_ID,
        secretAccessKey: credentials.AWS_SECRET_ACCESS_KEY,
        sessionToken: credentials.AWS_SESSION_TOKEN
      }
    : {
        accessKeyId: credentials.AWS_ACCESS_KEY_ID,
        secretAccessKey: credentials.AWS_SECRET_ACCESS_KEY
      };
}

// AWS SDK 응답을 그대로 내보내지 않고, 화면에서 볼 수 있는 JSON 값만 남깁니다.
function toProviderParameterSnapshot(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const normalizedItem = toProviderParameterSnapshot(item);

      return normalizedItem === undefined ? [] : [normalizedItem];
    });
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, entryValue]) => key !== "$metadata" && entryValue !== undefined)
        .map(([key, entryValue]) => [key, toProviderParameterSnapshot(entryValue)])
        .filter(([, entryValue]) => entryValue !== undefined)
    );
  }

  return undefined;
}

// `ALL`은 화면 선택값일 뿐 실제 AWS 리소스가 아니어서, 각 지원 리소스 조회로 풀어서 처리합니다.
export function shouldReadResourceGroup(input: AwsProviderScanInput, resourceType: ResourceType): boolean {
  return (
    input.resourceTypes.includes("ALL") ||
    input.resourceTypes.includes(resourceType) ||
    (resourceType === "ROUTE_TABLE" && input.resourceTypes.includes("ROUTE_TABLE_ASSOCIATION"))
  );
}

export function shouldReadUnknownResourceGroup(input: AwsProviderScanInput): boolean {
  return (
    input.resourceTypes.includes("ALL") ||
    input.resourceTypes.includes("UNKNOWN") ||
    input.resourceTypes.includes("AMI") ||
    input.resourceTypes.includes("LAMBDA") ||
    input.resourceTypes.includes("LAMBDA_PERMISSION") ||
    input.resourceTypes.includes("IAM_ROLE") ||
    input.resourceTypes.includes("IAM_POLICY") ||
    input.resourceTypes.includes("IAM_INSTANCE_PROFILE") ||
    input.resourceTypes.includes("KMS_KEY") ||
    input.resourceTypes.includes("CLOUDWATCH_LOG_GROUP") ||
    input.resourceTypes.includes("CLOUDWATCH_METRIC_ALARM") ||
    input.resourceTypes.includes("API_GATEWAY_REST_API")
  );
}

// 화면과 로그에 AWS 계정 ID가 그대로 나가지 않도록 12자리 계정 번호를 가립니다.
export function maskReverseEngineeringSensitiveText(text: string): string {
  return text.replace(/\b(\d{4})\d{8}\b/g, "$1********");
}

// 동일 AWS 서비스에서 여러 reader가 함께 실패해도 사용자에게는 한 번만 알립니다.
export function deduplicateReverseEngineeringScanErrors(
  scanErrors: readonly ReverseEngineeringScanError[]
): ReverseEngineeringScanError[] {
  const uniqueErrors = new Map<string, ReverseEngineeringScanError>();

  for (const scanError of scanErrors) {
    const key = scanError.serviceKey ?? scanError.id;
    uniqueErrors.set(
      key,
      selectHigherPriorityReverseEngineeringScanError(uniqueErrors.get(key), scanError)
    );
  }

  return [...uniqueErrors.values()];
}

function getReverseEngineeringAwsServiceKey(resourceType: ResourceType): string {
  switch (resourceType) {
    case "VPC":
    case "SUBNET":
    case "INTERNET_GATEWAY":
    case "ROUTE_TABLE":
    case "ROUTE_TABLE_ASSOCIATION":
    case "SECURITY_GROUP":
    case "EC2":
    case "AMI":
      return "ec2";
    case "LOAD_BALANCER":
      return "elastic-load-balancing";
    case "RDS":
      return "rds";
    case "S3":
      return "s3";
    case "CLOUDFRONT":
      return "cloudfront";
    case "ECS_CLUSTER":
    case "ECS_SERVICE":
    case "ECS_TASK_DEFINITION":
      return "ecs";
    case "IAM_ROLE":
    case "IAM_POLICY":
    case "IAM_INSTANCE_PROFILE":
      return "iam";
    case "KMS_KEY":
      return "kms";
    case "CLOUDWATCH_LOG_GROUP":
      return "cloudwatch-logs";
    case "CLOUDWATCH_METRIC_ALARM":
      return "cloudwatch";
    case "API_GATEWAY_REST_API":
      return "api-gateway";
    case "LAMBDA":
    case "LAMBDA_PERMISSION":
      return "lambda";
    default:
      return resourceType.toLowerCase().replaceAll("_", "-");
  }
}

function normalizeReverseEngineeringAwsServiceKey(serviceKey: string): string {
  return serviceKey.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function formatSafeScanErrorMessage(reason: ReverseEngineeringScanError["reason"]): string {
  switch (reason) {
    case "permission_denied":
      return "이 서비스를 읽을 권한이 부족합니다.";
    case "expired_credential":
      return "AWS 연결 확인이 필요합니다.";
    case "invalid_region":
      return "선택한 AWS Region을 확인해 주세요.";
    case "throttled":
      return "AWS 요청이 잠시 제한되었습니다.";
    default:
      return "이 서비스를 읽지 못했습니다.";
  }
}

// 원문 AWS 오류는 reason 판별에만 사용하고 공개 scan 결과에는 남기지 않습니다.
function toScanError(
  resourceType: ResourceType,
  error: unknown,
  serviceKey = getReverseEngineeringAwsServiceKey(resourceType)
): ReverseEngineeringScanError {
  const providerMessage = maskReverseEngineeringSensitiveText(
    error instanceof Error ? error.message : "AWS 리소스를 읽지 못했습니다."
  );
  const reason = classifyScanErrorReason(providerMessage);

  return {
    id: `scan-error-service-${normalizeReverseEngineeringAwsServiceKey(serviceKey)}`,
    serviceKey: normalizeReverseEngineeringAwsServiceKey(serviceKey),
    resourceType,
    stage: "provider_api",
    reason,
    message: formatSafeScanErrorMessage(reason),
    retryable: reason === "throttled" || reason === "provider_error"
  };
}

/** gg: page collector의 safe outcome만 scan diagnostic으로 옮기고 원문을 복원하지 않습니다. */
function toScanErrorFromPageFailure(
  resourceType: ResourceType,
  failure: AwsPageFailure,
  serviceKey = getReverseEngineeringAwsServiceKey(resourceType)
): ReverseEngineeringScanError {
  const reason = failure.outcome === "transient" ? "provider_error" : failure.outcome;
  return {
    id: `scan-error-service-${normalizeReverseEngineeringAwsServiceKey(serviceKey)}`,
    serviceKey: normalizeReverseEngineeringAwsServiceKey(serviceKey),
    resourceType,
    stage: "provider_api",
    reason,
    message: formatSafeScanErrorMessage(reason),
    retryable: reason === "throttled" || reason === "provider_error"
  };
}

// Resource Explorer 상태 문제는 전체 가져오기 범위가 줄어든다는 설명을 덧붙입니다.
function toResourceExplorerScanError(error: unknown): ReverseEngineeringScanError {
  const baseError = toScanError("UNKNOWN", error, "resource-explorer-2");

  return {
    ...baseError,
    id: "scan-error-resource-explorer",
    message: "Resource Explorer를 읽지 못했습니다.",
    retryable: baseError.reason === "throttled"
  };
}

// AWS의 긴 오류 문장에서 사용자가 이해할 수 있는 실패 종류만 뽑습니다.
function classifyScanErrorReason(message: string): ReverseEngineeringScanError["reason"] {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("accessdenied") || normalizedMessage.includes("not authorized")) {
    return "permission_denied";
  }

  if (normalizedMessage.includes("expiredtoken")) {
    return "expired_credential";
  }

  if (normalizedMessage.includes("throttl") || normalizedMessage.includes("rate exceeded")) {
    return "throttled";
  }

  if (normalizedMessage.includes("invalid") && normalizedMessage.includes("region")) {
    return "invalid_region";
  }

  return "provider_error";
}
