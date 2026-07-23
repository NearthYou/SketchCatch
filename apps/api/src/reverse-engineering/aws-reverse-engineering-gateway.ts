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
  ListTagsForResourceCommand as ListCloudWatchTagsForResourceCommand,
  type ListTagsForResourceCommandOutput as ListCloudWatchTagsForResourceCommandOutput,
  type MetricAlarm
} from "@aws-sdk/client-cloudwatch";
import {
  DescribeImagesCommand,
  EC2Client,
  type DescribeImagesCommandOutput,
  type Image
} from "@aws-sdk/client-ec2";
import {
  DescribeListenerAttributesCommand,
  DescribeListenersCommand,
  DescribeLoadBalancerAttributesCommand,
  DescribeLoadBalancersCommand,
  DescribeTagsCommand,
  DescribeTargetGroupAttributesCommand,
  DescribeTargetGroupsCommand,
  ElasticLoadBalancingV2Client,
  type Action,
  type DescribeListenerAttributesCommandOutput,
  type DescribeListenersCommandOutput,
  type DescribeLoadBalancerAttributesCommandOutput,
  type DescribeLoadBalancersCommandOutput,
  type DescribeTagsCommandOutput,
  type DescribeTargetGroupAttributesCommandOutput,
  type DescribeTargetGroupsCommandOutput,
  type Listener,
  type LoadBalancer,
  type TagDescription,
  type TargetGroup
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
  ListTagsForResourceCommand as ListLogGroupTagsForResourceCommand,
  type ListTagsForResourceCommandOutput as ListLogGroupTagsForResourceCommandOutput,
  type LogGroup
} from "@aws-sdk/client-cloudwatch-logs";
import {
  APIGatewayClient,
  GetRestApisCommand,
  type GetRestApisCommandOutput,
  type RestApi
} from "@aws-sdk/client-api-gateway";
import {
  EventBridgeClient,
  ListEventBusesCommand,
  ListRulesCommand,
  ListTagsForResourceCommand,
  ListTargetsByRuleCommand,
  type ListEventBusesCommandOutput,
  type ListRulesCommandOutput,
  type ListTagsForResourceCommandOutput,
  type ListTargetsByRuleCommandOutput,
  type Rule,
  type Target
} from "@aws-sdk/client-eventbridge";
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
import { readAwsDetailedReverseEngineeringResources } from "./aws-detailed-reverse-engineering-reader.js";
import { selectHigherPriorityReverseEngineeringScanError } from "./reverse-engineering-scan-error-priority.js";
import {
  parseAddressesFromXml,
  parseAwsQueryPaginationToken,
  parseInstancesFromXml,
  parseInternetGatewaysFromXml,
  parseNatGatewaysFromXml,
  parseRdsInstancesFromXml,
  parseRouteTablesFromXml,
  parseSecurityGroupsFromXml,
  parseSubnetsFromXml,
  parseVpcsFromXml
} from "./aws-reverse-engineering-parsers.js";
import { sendAwsQuery } from "./aws-reverse-engineering-query.js";

type ElasticLoadBalancingAttribute = {
  readonly Key?: string | undefined;
  readonly Value?: string | undefined;
};

export type AwsReverseEngineeringGatewayOptions = {
  fetchXml?: typeof fetch;
  prepareCredentials?: (awsConnection: AwsConnection) => Promise<TerraformAwsCredentialEnv>;
  readDetailedResources?: typeof readAwsDetailedReverseEngineeringResources;
};

export type AwsReverseEngineeringReaderPlan = {
  readonly loadBalancers: boolean;
  readonly cloudFrontDistributions: boolean;
  readonly ecsResources: boolean;
  readonly eventBridgeResources: boolean;
  readonly detailedResources: boolean;
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
      const candidateToken =
        typeof page.nextToken === "string" && page.nextToken.length > 0
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
  const details =
    error && typeof error === "object"
      ? (error as { name?: unknown; code?: unknown; Code?: unknown; message?: unknown })
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
export type AwsEventBridgeReadClient = {
  send(command: object): Promise<unknown>;
};
export type AwsEventBridgeReadClientFactory = (
  region: string,
  credentials: TerraformAwsCredentialEnv
) => AwsEventBridgeReadClient;

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

/** gg: 검증된 연결의 credential과 상세 reader를 주입 가능하게 묶어 실제 조회와 테스트 경계를 분리합니다. */
export function createAwsReverseEngineeringGateway(
  awsConnection: AwsConnection,
  options: AwsReverseEngineeringGatewayOptions = {}
): AwsProviderScanGateway {
  return {
    async discoverResources(input) {
      const credentials = options.prepareCredentials
        ? await options.prepareCredentials(awsConnection)
        : (await prepareTerraformAwsCredentialEnv(awsConnection, createAwsSdkStsGateway())).env;
      const fetchXml = options.fetchXml ?? fetch;
      const readerPlan = createAwsReverseEngineeringReaderPlan(input);
      const resourceGroups = await Promise.all([
        readResourceGroup(input, "VPC", (reportPageFailure) =>
          describeVpcs(input.region, credentials, fetchXml, reportPageFailure)
        ),
        readResourceGroup(input, "SUBNET", (reportPageFailure) =>
          describeSubnets(input.region, credentials, fetchXml, reportPageFailure)
        ),
        readResourceGroup(input, "ELASTIC_IP", (reportPageFailure) =>
          describeAddresses(input.region, credentials, fetchXml, reportPageFailure)
        ),
        readResourceGroup(input, "NAT_GATEWAY", (reportPageFailure) =>
          describeNatGateways(input.region, credentials, fetchXml, reportPageFailure)
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
          ? [readElasticLoadBalancingResourcesWithDiagnostics(input, input.region, credentials)]
          : []),
        ...(readerPlan.cloudFrontDistributions
          ? [
              readResourceGroup(input, "CLOUDFRONT", (reportPageFailure) =>
                listCloudFrontDistributions(input.region, credentials, undefined, reportPageFailure)
              )
            ]
          : []),
        ...(readerPlan.ecsResources
          ? [readEcsResourcesWithDiagnostics(input.region, credentials)]
          : []),
        ...(readerPlan.eventBridgeResources
          ? [readEventBridgeResourcesWithDiagnostics(input.region, credentials)]
          : []),
        ...(readerPlan.detailedResources
          ? [
              (options.readDetailedResources ?? readAwsDetailedReverseEngineeringResources)(
                input,
                credentials
              )
            ]
          : []),
        ...(readerPlan.unknownResources ? [readUnknownResourceGroup(input, credentials)] : [])
      ]);

      const records = resolveEcsRelationships(
        resolveCloudFrontOriginRelationships(
          resolveEventBridgeTargetRelationships(
            resolveNatGatewayElasticIpRelationships(
              uniqueDiscoveredRecordsByProviderId(resourceGroups.flatMap((group) => group.records))
            )
          )
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
      scanErrors: pageFailures
        .slice(0, 1)
        .map((failure) => toScanErrorFromPageFailure(resourceType, failure))
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

/** gg: 정식 reader와 UNKNOWN inventory의 경계를 한 곳에서 계산해 같은 서비스를 두 번 읽지 않습니다. */
export function createAwsReverseEngineeringReaderPlan(
  input: AwsProviderScanInput
): AwsReverseEngineeringReaderPlan {
  return {
    loadBalancers: shouldReadElasticLoadBalancingResourceGroup(input),
    cloudFrontDistributions: shouldReadResourceGroup(input, "CLOUDFRONT"),
    ecsResources: shouldReadEcsResourceGroup(input),
    eventBridgeResources: shouldReadEventBridgeResourceGroup(input),
    detailedResources: shouldReadDetailedResourceGroup(input),
    unknownResources: shouldReadUnknownResourceGroup(input)
  };
}

/** gg: IAM, Lambda, KMS, API Gateway는 family 상세 reader 한 번으로 topology와 import 정보를 함께 읽습니다. */
function shouldReadDetailedResourceGroup(input: AwsProviderScanInput): boolean {
  return (
    input.resourceTypes.includes("ALL") ||
    input.resourceTypes.some(
      (resourceType) =>
        resourceType !== "ALL" && DETAILED_REVERSE_ENGINEERING_TYPES.has(resourceType)
    )
  );
}

const DETAILED_REVERSE_ENGINEERING_TYPES = new Set<ResourceType>([
  "IAM_ROLE",
  "IAM_POLICY",
  "IAM_INSTANCE_PROFILE",
  "LAMBDA",
  "LAMBDA_PERMISSION",
  "KMS_KEY",
  "KMS_ALIAS",
  "API_GATEWAY_REST_API",
  "API_GATEWAY_RESOURCE",
  "API_GATEWAY_METHOD",
  "API_GATEWAY_INTEGRATION",
  "API_GATEWAY_DEPLOYMENT",
  "API_GATEWAY_STAGE"
]);

/** gg: ALB family 선택 하나라도 있으면 같은 reader에서 안전한 의존 리소스를 함께 읽습니다. */
function shouldReadElasticLoadBalancingResourceGroup(input: AwsProviderScanInput): boolean {
  return (
    input.resourceTypes.includes("ALL") ||
    input.resourceTypes.includes("LOAD_BALANCER") ||
    input.resourceTypes.includes("LOAD_BALANCER_TARGET_GROUP") ||
    input.resourceTypes.includes("LOAD_BALANCER_LISTENER")
  );
}

function shouldReadEcsResourceGroup(input: AwsProviderScanInput): boolean {
  return (
    input.resourceTypes.includes("ALL") ||
    input.resourceTypes.includes("ECS_CLUSTER") ||
    input.resourceTypes.includes("ECS_SERVICE") ||
    input.resourceTypes.includes("ECS_TASK_DEFINITION")
  );
}

// gg: Rule과 Target은 한 reader에서 함께 읽어 중복 ListRules 호출을 막습니다.
function shouldReadEventBridgeResourceGroup(input: AwsProviderScanInput): boolean {
  return (
    input.resourceTypes.includes("ALL") ||
    input.resourceTypes.includes("EVENTBRIDGE_RULE") ||
    input.resourceTypes.includes("EVENTBRIDGE_TARGET")
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
    const parameters =
      nextToken === undefined
        ? undefined
        : input.requestToken === "NextToken"
          ? { NextToken: nextToken }
          : { Marker: nextToken };
    const xml = await sendAwsQuery(
      {
        service: input.service,
        region,
        action: input.action,
        version: input.version,
        credentials,
        ...(parameters ? { parameters } : {})
      },
      fetchXml
    );
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
  return readAwsQueryResourcePages(
    {
      service: "ec2",
      action: "DescribeVpcs",
      version: "2016-11-15",
      requestToken: "NextToken",
      responseToken: "nextToken",
      parse: parseVpcsFromXml
    },
    region,
    credentials,
    fetchXml,
    reportPageFailure
  );
}

/** gg: Subnet Query pagination도 첫 page records를 later failure와 분리합니다. */
export async function describeSubnets(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  fetchXml: typeof fetch,
  reportPageFailure: (failure: AwsPageFailure) => void = () => undefined
): Promise<AwsDiscoveredResourceRecord[]> {
  return readAwsQueryResourcePages(
    {
      service: "ec2",
      action: "DescribeSubnets",
      version: "2016-11-15",
      requestToken: "NextToken",
      responseToken: "nextToken",
      parse: parseSubnetsFromXml
    },
    region,
    credentials,
    fetchXml,
    reportPageFailure
  );
}

/** gg: EIP Query pagination도 page-one allocation을 later failure와 분리합니다. */
export async function describeAddresses(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  fetchXml: typeof fetch,
  reportPageFailure: (failure: AwsPageFailure) => void = () => undefined
): Promise<AwsDiscoveredResourceRecord[]> {
  return readAwsQueryResourcePages(
    {
      service: "ec2",
      action: "DescribeAddresses",
      version: "2016-11-15",
      requestToken: "NextToken",
      responseToken: "nextToken",
      parse: parseAddressesFromXml
    },
    region,
    credentials,
    fetchXml,
    reportPageFailure
  );
}

/** gg: NAT Gateway Query pagination은 subnet/EIP 참조를 page별 bounded record로 줄입니다. */
export async function describeNatGateways(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  fetchXml: typeof fetch,
  reportPageFailure: (failure: AwsPageFailure) => void = () => undefined
): Promise<AwsDiscoveredResourceRecord[]> {
  return readAwsQueryResourcePages(
    {
      service: "ec2",
      action: "DescribeNatGateways",
      version: "2016-11-15",
      requestToken: "NextToken",
      responseToken: "nextToken",
      parse: parseNatGatewaysFromXml
    },
    region,
    credentials,
    fetchXml,
    reportPageFailure
  );
}

/** gg: Security Group Query pagination도 동일한 bounded token 계약을 사용합니다. */
export async function describeSecurityGroups(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  fetchXml: typeof fetch,
  reportPageFailure: (failure: AwsPageFailure) => void = () => undefined
): Promise<AwsDiscoveredResourceRecord[]> {
  return readAwsQueryResourcePages(
    {
      service: "ec2",
      action: "DescribeSecurityGroups",
      version: "2016-11-15",
      requestToken: "NextToken",
      responseToken: "nextToken",
      parse: parseSecurityGroupsFromXml
    },
    region,
    credentials,
    fetchXml,
    reportPageFailure
  );
}

/** gg: Instance Query pagination은 누적 instance records를 later failure에도 유지합니다. */
export async function describeInstances(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  fetchXml: typeof fetch,
  reportPageFailure: (failure: AwsPageFailure) => void = () => undefined
): Promise<AwsDiscoveredResourceRecord[]> {
  return readAwsQueryResourcePages(
    {
      service: "ec2",
      action: "DescribeInstances",
      version: "2016-11-15",
      requestToken: "NextToken",
      responseToken: "nextToken",
      parse: parseInstancesFromXml
    },
    region,
    credentials,
    fetchXml,
    reportPageFailure
  );
}

/** gg: Internet Gateway Query pagination도 EC2 nextToken만 allowlist로 서명합니다. */
export async function describeInternetGateways(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  fetchXml: typeof fetch,
  reportPageFailure: (failure: AwsPageFailure) => void = () => undefined
): Promise<AwsDiscoveredResourceRecord[]> {
  return readAwsQueryResourcePages(
    {
      service: "ec2",
      action: "DescribeInternetGateways",
      version: "2016-11-15",
      requestToken: "NextToken",
      responseToken: "nextToken",
      parse: parseInternetGatewaysFromXml
    },
    region,
    credentials,
    fetchXml,
    reportPageFailure
  );
}

/** gg: Route Table Query pagination도 page별 XML을 즉시 records로 축소합니다. */
export async function describeRouteTables(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  fetchXml: typeof fetch,
  reportPageFailure: (failure: AwsPageFailure) => void = () => undefined
): Promise<AwsDiscoveredResourceRecord[]> {
  return readAwsQueryResourcePages(
    {
      service: "ec2",
      action: "DescribeRouteTables",
      version: "2016-11-15",
      requestToken: "NextToken",
      responseToken: "nextToken",
      parse: parseRouteTablesFromXml
    },
    region,
    credentials,
    fetchXml,
    reportPageFailure
  );
}

/** gg: RDS Query pagination은 대소문자가 다른 Marker 계약을 명시적으로 유지합니다. */
export async function describeRdsInstances(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  fetchXml: typeof fetch,
  reportPageFailure: (failure: AwsPageFailure) => void = () => undefined
): Promise<AwsDiscoveredResourceRecord[]> {
  return readAwsQueryResourcePages(
    {
      service: "rds",
      action: "DescribeDBInstances",
      version: "2014-10-31",
      requestToken: "Marker",
      responseToken: "Marker",
      parse: parseRdsInstancesFromXml
    },
    region,
    credentials,
    fetchXml,
    reportPageFailure
  );
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

  const [
    locationRead,
    versioningRead,
    publicAccessBlockRead,
    encryptionRead,
    websiteRead,
    taggingRead,
    policyStatusRead
  ] = await Promise.all([
    readS3BucketDetail(() =>
      sendS3Command<GetBucketLocationCommandOutput>(
        client,
        new GetBucketLocationCommand({ Bucket: bucketName })
      )
    ),
    readS3BucketDetail(() =>
      sendS3Command<GetBucketVersioningCommandOutput>(
        client,
        new GetBucketVersioningCommand({ Bucket: bucketName })
      )
    ),
    readS3BucketDetail(() =>
      sendS3Command<GetPublicAccessBlockCommandOutput>(
        client,
        new GetPublicAccessBlockCommand({ Bucket: bucketName })
      )
    ),
    readS3BucketDetail(() =>
      sendS3Command<GetBucketEncryptionCommandOutput>(
        client,
        new GetBucketEncryptionCommand({ Bucket: bucketName })
      )
    ),
    readS3BucketDetail(() =>
      sendS3Command<GetBucketWebsiteCommandOutput>(
        client,
        new GetBucketWebsiteCommand({ Bucket: bucketName })
      )
    ),
    readS3BucketDetail(() =>
      sendS3Command<GetBucketTaggingCommandOutput>(
        client,
        new GetBucketTaggingCommand({ Bucket: bucketName })
      )
    ),
    readS3BucketDetail(() =>
      sendS3Command<GetBucketPolicyStatusCommandOutput>(
        client,
        new GetBucketPolicyStatusCommand({ Bucket: bucketName })
      )
    )
  ]);
  const location = locationRead.value;
  const versioning = versioningRead.value;
  const publicAccessBlock = publicAccessBlockRead.value;
  const encryption = encryptionRead.value;
  const website = websiteRead.value;
  const tagging = taggingRead.value;
  const policyStatus = policyStatusRead.value;
  const detailReads: ReadonlyArray<readonly [string, S3BucketDetailRead<unknown>]> = [
    ["location", locationRead],
    ["versioning", versioningRead],
    ["publicAccessBlock", publicAccessBlockRead],
    ["encryption", encryptionRead],
    ["website", websiteRead],
    ["tags", taggingRead],
    ["policyStatus", policyStatusRead]
  ];
  const incompleteDetails = detailReads.flatMap(([detailName, read]) =>
    read.complete ? [] : [detailName]
  );
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
      reverseEngineeringIncompleteDetails:
        incompleteDetails.length > 0 ? incompleteDetails : undefined,
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

type S3BucketDetailRead<TOutput> = {
  readonly complete: boolean;
  readonly value: TOutput | null;
};

// gg: optional 설정 부재와 읽기 실패를 나눠 S3를 완전하게 읽지 못한 경우만 표시합니다.
async function readS3BucketDetail<TOutput>(
  read: () => Promise<TOutput>
): Promise<S3BucketDetailRead<TOutput>> {
  try {
    return { complete: true, value: await read() };
  } catch (error) {
    return {
      complete: isMissingS3BucketConfiguration(error),
      value: null
    };
  }
}

// gg: S3에 optional 설정이 없는 정상 상태는 상세 조회 실패로 계산하지 않습니다.
function isMissingS3BucketConfiguration(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("name" in error)) {
    return false;
  }

  const name = typeof error.name === "string" ? error.name : "";
  return [
    "NoSuchConfiguration",
    "NoSuchWebsiteConfiguration",
    "NoSuchTagSet",
    "NoSuchPublicAccessBlockConfiguration",
    "NoSuchBucketPolicy",
    "ServerSideEncryptionConfigurationNotFoundError"
  ].includes(name);
}

async function sendS3Command<TOutput>(client: AwsS3ReadClient, command: object): Promise<TOutput> {
  return (await client.send(command)) as TOutput;
}

async function readOptionalS3Detail<TOutput>(
  read: () => Promise<TOutput>
): Promise<TOutput | null> {
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

/** gg: Event Bus, Rule, Target page를 끝까지 읽고 실패한 page 전까지의 결과를 보존합니다. */
export async function readEventBridgeResourcesWithDiagnostics(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  createClient: AwsEventBridgeReadClientFactory = createDefaultEventBridgeReadClient
): Promise<AwsProviderDiscoveryResult> {
  const client = createClient(region, credentials);
  const busPages = await collectAwsPages(async (nextToken) => {
    const response = await sendEventBridgeCommand<ListEventBusesCommandOutput>(
      client,
      new ListEventBusesCommand({
        Limit: 100,
        ...(nextToken ? { NextToken: nextToken } : {})
      })
    );
    return { items: response.EventBuses ?? [], nextToken: response.NextToken };
  });
  const scanErrors: ReverseEngineeringScanError[] = busPages.failure
    ? [toScanErrorFromPageFailure("EVENTBRIDGE_RULE", busPages.failure, "eventbridge")]
    : [];
  const eventBusNames = [
    ...new Set([
      "default",
      ...busPages.items.flatMap((eventBus) => {
        const name = getNonEmptyStringValue(eventBus.Name);
        return name ? [name] : [];
      })
    ])
  ];
  const ruleEntries: Array<{ rule: Rule; eventBusName: string }> = [];
  for (const eventBusName of eventBusNames) {
    const rulePages = await collectAwsPages(async (nextToken) => {
      const response = await sendEventBridgeCommand<ListRulesCommandOutput>(
        client,
        new ListRulesCommand({
          EventBusName: eventBusName,
          Limit: 100,
          ...(nextToken ? { NextToken: nextToken } : {})
        })
      );
      return { items: response.Rules ?? [], nextToken: response.NextToken };
    });
    if (rulePages.failure) {
      scanErrors.push(
        toScanErrorFromPageFailure("EVENTBRIDGE_RULE", rulePages.failure, "eventbridge")
      );
    }
    ruleEntries.push(...rulePages.items.map((rule) => ({ rule, eventBusName })));
  }

  const records: AwsDiscoveredResourceRecord[] = [];
  for (const { rule, eventBusName: scannedEventBusName } of ruleEntries) {
    const ruleName = getNonEmptyStringValue(rule.Name);
    const ruleArn = getNonEmptyStringValue(rule.Arn);
    let tags: Array<{ key: string; value: string }> = [];
    let tagsReadComplete = false;
    if (ruleArn) {
      try {
        const tagResponse = await sendEventBridgeCommand<ListTagsForResourceCommandOutput>(
          client,
          new ListTagsForResourceCommand({ ResourceARN: ruleArn })
        );
        tags = (tagResponse.Tags ?? []).flatMap((tag) =>
          typeof tag.Key === "string" && tag.Key.length > 0 && typeof tag.Value === "string"
            ? [{ key: tag.Key, value: tag.Value }]
            : []
        );
        tagsReadComplete = true;
      } catch (error) {
        scanErrors.push(toScanError("EVENTBRIDGE_RULE", error, "eventbridge"));
      }
    }

    const eventBusName = getNonEmptyStringValue(rule.EventBusName) ?? scannedEventBusName;
    const ruleRecord = toEventBridgeRuleRecord(rule, region, eventBusName, tags, tagsReadComplete);
    if (!ruleRecord) {
      continue;
    }
    records.push(ruleRecord);
    if (!ruleName) {
      continue;
    }

    const targetPages = await collectAwsPages(async (nextToken) => {
      const response = await sendEventBridgeCommand<ListTargetsByRuleCommandOutput>(
        client,
        new ListTargetsByRuleCommand({
          Rule: ruleName,
          EventBusName: eventBusName,
          Limit: 100,
          ...(nextToken ? { NextToken: nextToken } : {})
        })
      );
      return { items: response.Targets ?? [], nextToken: response.NextToken };
    });
    if (targetPages.failure) {
      scanErrors.push(
        toScanErrorFromPageFailure("EVENTBRIDGE_TARGET", targetPages.failure, "eventbridge")
      );
    }
    records.push(
      ...targetPages.items.flatMap((target) =>
        toEventBridgeTargetRecord(target, ruleRecord, ruleName, eventBusName, region)
      )
    );
  }

  return {
    records,
    scanErrors: deduplicateReverseEngineeringScanErrors(scanErrors)
  };
}

function createDefaultEventBridgeReadClient(
  region: string,
  credentials: TerraformAwsCredentialEnv
): AwsEventBridgeReadClient {
  const client = new EventBridgeClient({
    region,
    credentials: toAwsSdkCredentials(credentials)
  });
  return {
    send: (command) => client.send(command as Parameters<EventBridgeClient["send"]>[0])
  };
}

function toEventBridgeRuleRecord(
  rule: Rule,
  fallbackRegion: string,
  eventBusName: string,
  tags: Array<{ key: string; value: string }> = [],
  tagsReadComplete = false
): AwsDiscoveredResourceRecord | null {
  const name = getNonEmptyStringValue(rule.Name);
  const providerResourceId =
    getNonEmptyStringValue(rule.Arn) ?? (name ? `eventbridge-rule:${eventBusName}/${name}` : null);
  if (!providerResourceId) {
    return null;
  }

  return {
    providerResourceType: "AWS::Events::Rule",
    providerResourceId,
    displayName: name ?? providerResourceId,
    region: fallbackRegion,
    config: compactRecord({
      name,
      description: rule.Description,
      eventBusName,
      eventPattern: rule.EventPattern,
      scheduleExpression: rule.ScheduleExpression,
      state: rule.State,
      tagsReadComplete,
      hasRoleArn: getNonEmptyStringValue(rule.RoleArn) ? true : undefined,
      managedBy: rule.ManagedBy,
      tags: tags.length > 0 ? tags : undefined
    }),
    relationships: []
  };
}

function toEventBridgeTargetRecord(
  target: Target,
  ruleRecord: AwsDiscoveredResourceRecord,
  ruleName: string,
  eventBusName: string,
  fallbackRegion: string
): AwsDiscoveredResourceRecord[] {
  const targetId = getNonEmptyStringValue(target.Id);
  if (!targetId) {
    return [];
  }

  const targetArn = getNonEmptyStringValue(target.Arn);
  return [
    {
      providerResourceType: "AWS::Events::Target",
      providerResourceId: createEventBridgeTargetProviderResourceId(
        eventBusName,
        ruleName,
        targetId
      ),
      displayName: targetId,
      region: fallbackRegion,
      config: compactRecord({
        targetId,
        ruleName,
        eventBusName,
        ruleProviderResourceId: ruleRecord.providerResourceId,
        targetArn,
        hasRoleArn: getNonEmptyStringValue(target.RoleArn) ? true : undefined,
        hasInput: getNonEmptyStringValue(target.Input) ? true : undefined,
        hasInputPath: getNonEmptyStringValue(target.InputPath) ? true : undefined,
        hasInputTransformer: target.InputTransformer ? true : undefined,
        hasDeadLetterConfig: target.DeadLetterConfig ? true : undefined,
        hasRetryPolicy: target.RetryPolicy ? true : undefined,
        hasAdvancedParameters: hasEventBridgeTargetAdvancedParameters(target) ? true : undefined
      }),
      relationships: [
        { type: "depends_on", targetProviderResourceId: ruleRecord.providerResourceId },
        ...(targetArn
          ? [{ type: "attached_to" as const, targetProviderResourceId: targetArn }]
          : [])
      ]
    }
  ];
}

// gg: 단순 Target 외의 서비스별 전달 설정은 값 자체를 저장하지 않고 존재 여부만 남깁니다.
function hasEventBridgeTargetAdvancedParameters(target: Target): boolean {
  return [
    target.KinesisParameters,
    target.RunCommandParameters,
    target.EcsParameters,
    target.BatchParameters,
    target.SqsParameters,
    target.HttpParameters,
    target.RedshiftDataParameters,
    target.SageMakerPipelineParameters,
    target.AppSyncParameters
  ].some((value) => value !== undefined);
}

function createEventBridgeTargetProviderResourceId(
  eventBusName: string,
  ruleName: string,
  targetId: string
): string {
  return `eventbridge-target:${eventBusName}/${ruleName}/${targetId}`;
}

async function sendEventBridgeCommand<TOutput>(
  client: AwsEventBridgeReadClient,
  command: object
): Promise<TOutput> {
  return (await client.send(command)) as TOutput;
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
      scanErrors: pageFailures
        .slice(0, 1)
        .map((failure) => toScanErrorFromPageFailure(resourceType, failure, serviceKey))
    };
  } catch (error) {
    return {
      records: [],
      scanErrors: [toScanError(resourceType, error, serviceKey)]
    };
  }
}

/** gg: UNKNOWN inventory는 generic discovery만 담당하고 정식 상세 family를 다시 조회하지 않습니다. */
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
      readUnknownResourceRecords("UNKNOWN", "cloudwatch-logs", (reportPageFailure) =>
        listCloudWatchLogGroupsAsUnknown(input.region, credentials, undefined, reportPageFailure)
      ),
      readUnknownResourceRecords("UNKNOWN", "ec2", (reportPageFailure) =>
        listAmiImagesAsUnknown(input.region, credentials, undefined, reportPageFailure)
      ),
      readUnknownResourceRecords("UNKNOWN", "cloudwatch", (reportPageFailure) =>
        listCloudWatchMetricAlarmsAsUnknown(input.region, credentials, undefined, reportPageFailure)
      )
    );
  } else if (shouldReadElasticLoadBalancingResourceGroup(input)) {
    reads.push(
      readResourceExplorerResourcesWithDiagnostics(input.region, credentials).then((result) =>
        filterGenericElasticLoadBalancingFallback(input, result)
      ),
      readUnknownResourceRecords("UNKNOWN", "resource-groups-tagging", (reportPageFailure) =>
        listTaggedUnknownResources(input.region, credentials, undefined, reportPageFailure)
      ).then((result) => filterGenericElasticLoadBalancingFallback(input, result))
    );
  }

  if (input.resourceTypes.includes("AMI")) {
    reads.push(
      readUnknownResourceRecords("AMI", "ec2", (reportPageFailure) =>
        listAmiImagesAsUnknown(input.region, credentials, undefined, reportPageFailure)
      )
    );
  }

  if (input.resourceTypes.includes("CLOUDWATCH_LOG_GROUP")) {
    reads.push(
      readUnknownResourceRecords("CLOUDWATCH_LOG_GROUP", "cloudwatch-logs", (reportPageFailure) =>
        listCloudWatchLogGroupsAsUnknown(input.region, credentials, undefined, reportPageFailure)
      )
    );
  }

  if (input.resourceTypes.includes("CLOUDWATCH_METRIC_ALARM")) {
    reads.push(
      readUnknownResourceRecords("CLOUDWATCH_METRIC_ALARM", "cloudwatch", (reportPageFailure) =>
        listCloudWatchMetricAlarmsAsUnknown(input.region, credentials, undefined, reportPageFailure)
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

/** gg: 개별 ELBv2 선택에서는 generic inventory 중 선택 Resource와 안전 의존 후보만 남깁니다. */
function filterGenericElasticLoadBalancingFallback(
  input: AwsProviderScanInput,
  result: AwsProviderDiscoveryResult
): AwsProviderDiscoveryResult {
  const providerResourceTypes = new Set([
    "AWS::ElasticLoadBalancingV2::LoadBalancer",
    ...(shouldReadElasticLoadBalancingTargetGroups(input)
      ? ["AWS::ElasticLoadBalancingV2::TargetGroup"]
      : []),
    ...(shouldReadElasticLoadBalancingListeners(input)
      ? ["AWS::ElasticLoadBalancingV2::Listener"]
      : [])
  ]);

  return {
    ...result,
    records: result.records.filter((record) =>
      providerResourceTypes.has(record.providerResourceType)
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
    const services = await describeEcsServices(client, cluster, servicePages.items, scanErrors);

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

/** Task Definition을 재현 가능한 후보로 만들되 환경값과 Secret은 자동 적용하지 않는다. */
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
        : (taskDefinition.family ?? arn),
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

const ELBV2_TAG_BATCH_SIZE = 20;

/** gg: ALB family를 한 client로 읽고 page·상세 조회 실패를 Resource별 incomplete 근거로 남깁니다. */
export async function readElasticLoadBalancingResourcesWithDiagnostics(
  input: AwsProviderScanInput,
  region: string,
  credentials: TerraformAwsCredentialEnv,
  createClient: AwsElbReadClientFactory = createDefaultElbReadClient
): Promise<AwsProviderDiscoveryResult> {
  const client = createClient(region, credentials);
  const scanErrors: ReverseEngineeringScanError[] = [];
  const loadBalancerPages = await listApplicationLoadBalancerPages(client);
  if (loadBalancerPages.failure) {
    scanErrors.push(toScanErrorFromPageFailure("LOAD_BALANCER", loadBalancerPages.failure));
  }
  const loadBalancers = loadBalancerPages.items.filter(
    (loadBalancer) => loadBalancer.Type === "application" && Boolean(loadBalancer.LoadBalancerArn)
  );
  const records: AwsDiscoveredResourceRecord[] = loadBalancers.flatMap((loadBalancer) =>
    toApplicationLoadBalancerRecord(loadBalancer, region)
  );

  if (shouldReadElasticLoadBalancingTargetGroups(input)) {
    const targetGroupPages = await listTargetGroupPages(client);
    if (targetGroupPages.failure) {
      scanErrors.push(
        toScanErrorFromPageFailure("LOAD_BALANCER_TARGET_GROUP", targetGroupPages.failure)
      );
    }
    records.push(
      ...targetGroupPages.items.flatMap((targetGroup) =>
        toLoadBalancerTargetGroupRecord(targetGroup, region)
      )
    );
  }

  if (shouldReadElasticLoadBalancingListeners(input)) {
    for (const loadBalancer of loadBalancers) {
      const loadBalancerArn = getNonEmptyStringValue(loadBalancer.LoadBalancerArn);
      if (!loadBalancerArn) continue;
      const listenerPages = await listListenerPages(client, loadBalancerArn);
      if (listenerPages.failure) {
        scanErrors.push(
          toScanErrorFromPageFailure("LOAD_BALANCER_LISTENER", listenerPages.failure)
        );
      }
      records.push(
        ...listenerPages.items.flatMap((listener) => toLoadBalancerListenerRecord(listener, region))
      );
    }
  }

  await readElasticLoadBalancingAttributes(records, client, scanErrors);
  await readElasticLoadBalancingTags(records, client, scanErrors);

  return { records, scanErrors };
}

/** gg: Target Group은 직접 선택, Listener 의존, 전체 선택에서만 상세 조회합니다. */
function shouldReadElasticLoadBalancingTargetGroups(input: AwsProviderScanInput): boolean {
  return (
    input.resourceTypes.includes("ALL") ||
    input.resourceTypes.includes("LOAD_BALANCER_TARGET_GROUP") ||
    input.resourceTypes.includes("LOAD_BALANCER_LISTENER")
  );
}

/** gg: Listener는 직접 또는 전체 선택에서만 읽고 그 의존 ALB/TG는 같은 scan에 유지합니다. */
function shouldReadElasticLoadBalancingListeners(input: AwsProviderScanInput): boolean {
  return (
    input.resourceTypes.includes("ALL") || input.resourceTypes.includes("LOAD_BALANCER_LISTENER")
  );
}

/** gg: ALB pagination primitive를 기존 단독 reader와 family reader가 공유합니다. */
async function listApplicationLoadBalancerPages(
  client: AwsElbReadClient
): Promise<AwsPageResult<LoadBalancer>> {
  return collectAwsPages(async (marker) => {
    const response = await sendElbCommand<DescribeLoadBalancersCommandOutput>(
      client,
      new DescribeLoadBalancersCommand({ Marker: marker })
    );
    return {
      items: response.LoadBalancers ?? [],
      nextToken: response.NextMarker
    };
  });
}

/** gg: Target Group page token을 원문 없이 동일한 page collector로 처리합니다. */
async function listTargetGroupPages(client: AwsElbReadClient): Promise<AwsPageResult<TargetGroup>> {
  return collectAwsPages(async (marker) => {
    const response = await sendElbCommand<DescribeTargetGroupsCommandOutput>(
      client,
      new DescribeTargetGroupsCommand({ Marker: marker })
    );
    return {
      items: response.TargetGroups ?? [],
      nextToken: response.NextMarker
    };
  });
}

/** gg: 한 ALB의 Listener page를 끝까지 읽고 앞 page를 later failure에도 보존합니다. */
async function listListenerPages(
  client: AwsElbReadClient,
  loadBalancerArn: string
): Promise<AwsPageResult<Listener>> {
  return collectAwsPages(async (marker) => {
    const response = await sendElbCommand<DescribeListenersCommandOutput>(
      client,
      new DescribeListenersCommand({ LoadBalancerArn: loadBalancerArn, Marker: marker })
    );
    return {
      items: response.Listeners ?? [],
      nextToken: response.NextMarker
    };
  });
}

/** gg: Resource별 attribute API를 순차 bounded read하고 실패 Resource만 안전하게 닫습니다. */
async function readElasticLoadBalancingAttributes(
  records: AwsDiscoveredResourceRecord[],
  client: AwsElbReadClient,
  scanErrors: ReverseEngineeringScanError[]
): Promise<void> {
  for (const record of records) {
    try {
      const attributes = await readElasticLoadBalancingResourceAttributes(record, client);
      record.config = {
        ...record.config,
        reverseEngineeringDetailsVersion: 1,
        attributesReadComplete: true,
        attributes: normalizeElasticLoadBalancingAttributes(attributes),
        ...createElasticLoadBalancingTerraformAttributeConfig(record, attributes)
      };
    } catch (error) {
      record.config = markElasticLoadBalancingIncomplete(record.config, "attributes");
      scanErrors.push(toScanError(resolveElasticLoadBalancingResourceType(record), error));
    }
  }
}

/** gg: Resource 종류에 맞는 attribute command만 만들어 raw SDK 응답은 즉시 버립니다. */
async function readElasticLoadBalancingResourceAttributes(
  record: AwsDiscoveredResourceRecord,
  client: AwsElbReadClient
): Promise<readonly ElasticLoadBalancingAttribute[]> {
  if (record.providerResourceType === "AWS::ElasticLoadBalancingV2::LoadBalancer") {
    const response = await sendElbCommand<DescribeLoadBalancerAttributesCommandOutput>(
      client,
      new DescribeLoadBalancerAttributesCommand({
        LoadBalancerArn: record.providerResourceId
      })
    );
    return response.Attributes ?? [];
  }
  if (record.providerResourceType === "AWS::ElasticLoadBalancingV2::TargetGroup") {
    const response = await sendElbCommand<DescribeTargetGroupAttributesCommandOutput>(
      client,
      new DescribeTargetGroupAttributesCommand({
        TargetGroupArn: record.providerResourceId
      })
    );
    return response.Attributes ?? [];
  }

  const response = await sendElbCommand<DescribeListenerAttributesCommandOutput>(
    client,
    new DescribeListenerAttributesCommand({ ListenerArn: record.providerResourceId })
  );
  return response.Attributes ?? [];
}

/** gg: Resource별 기본 attribute 근거를 확인한 뒤 현재 Terraform projection 값만 변환합니다. */
function createElasticLoadBalancingTerraformAttributeConfig(
  record: AwsDiscoveredResourceRecord,
  attributes: readonly ElasticLoadBalancingAttribute[]
): Record<string, unknown> {
  const attributesProjectionComplete =
    hasRequiredElasticLoadBalancingAttributeEvidence(record, attributes) &&
    attributes.every((attribute) =>
      isSafelyProjectedElasticLoadBalancingAttribute(record, attribute)
    );
  if (record.providerResourceType !== "AWS::ElasticLoadBalancingV2::TargetGroup") {
    return { attributesProjectionComplete };
  }

  const deregistrationDelay = Number(
    attributes.find((attribute) => attribute.Key === "deregistration_delay.timeout_seconds")?.Value
  );
  return {
    attributesProjectionComplete,
    ...(Number.isInteger(deregistrationDelay) &&
    deregistrationDelay >= 0 &&
    deregistrationDelay <= 3_600
      ? { deregistrationDelay }
      : {})
  };
}

/** gg: 빈 성공 응답을 완전한 projection으로 오인하지 않도록 Resource별 기준 key를 요구합니다. */
function hasRequiredElasticLoadBalancingAttributeEvidence(
  record: AwsDiscoveredResourceRecord,
  attributes: readonly ElasticLoadBalancingAttribute[]
): boolean {
  const requiredKey =
    record.providerResourceType === "AWS::ElasticLoadBalancingV2::LoadBalancer"
      ? "deletion_protection.enabled"
      : record.providerResourceType === "AWS::ElasticLoadBalancingV2::TargetGroup"
        ? "deregistration_delay.timeout_seconds"
        : "routing.http.response.server.enabled";

  return attributes.some((attribute) => attribute.Key === requiredKey);
}

const SAFE_ALB_OMITTED_ATTRIBUTE_DEFAULTS = new Map<string, string>([
  ["access_logs.s3.bucket", ""],
  ["access_logs.s3.enabled", "false"],
  ["access_logs.s3.prefix", ""],
  ["client_keep_alive.seconds", "3600"],
  ["connection_logs.s3.bucket", ""],
  ["connection_logs.s3.enabled", "false"],
  ["connection_logs.s3.prefix", ""],
  ["deletion_protection.enabled", "false"],
  ["idle_timeout.timeout_seconds", "60"],
  ["load_balancing.cross_zone.enabled", "true"],
  ["routing.http.desync_mitigation_mode", "defensive"],
  ["routing.http.drop_invalid_header_fields.enabled", "false"],
  ["routing.http.preserve_host_header.enabled", "false"],
  ["routing.http.x_amzn_tls_version_and_cipher_suite.enabled", "false"],
  ["routing.http.xff_client_port.enabled", "false"],
  ["routing.http.xff_header_processing.mode", "append"],
  ["routing.http2.enabled", "true"],
  ["waf.fail_open.enabled", "false"],
  ["zonal_shift.config.enabled", "false"]
]);

const SAFE_TARGET_GROUP_OMITTED_ATTRIBUTE_DEFAULTS = new Map<string, string>([
  ["load_balancing.algorithm.anomaly_mitigation", "off"],
  ["load_balancing.algorithm.type", "round_robin"],
  ["load_balancing.cross_zone.enabled", "use_load_balancer_configuration"],
  ["slow_start.duration_seconds", "0"],
  ["stickiness.enabled", "false"],
  ["target_group_health.dns_failover.minimum_healthy_targets.count", "1"],
  ["target_group_health.dns_failover.minimum_healthy_targets.percentage", "off"],
  ["target_group_health.unhealthy_state_routing.minimum_healthy_targets.count", "1"],
  ["target_group_health.unhealthy_state_routing.minimum_healthy_targets.percentage", "off"]
]);

const SAFE_LISTENER_OMITTED_ATTRIBUTE_DEFAULTS = new Map<string, string>([
  ["routing.http.response.server.enabled", "true"]
]);

/** projection 값 또는 생략 시 동일한 AWS 기본값만 안전한 attribute로 인정한다. */
function isSafelyProjectedElasticLoadBalancingAttribute(
  record: AwsDiscoveredResourceRecord,
  attribute: ElasticLoadBalancingAttribute
): boolean {
  const key = getNonEmptyStringValue(attribute.Key);
  const value = attribute.Value;
  if (!key || typeof value !== "string") return false;

  if (record.providerResourceType === "AWS::ElasticLoadBalancingV2::LoadBalancer") {
    return SAFE_ALB_OMITTED_ATTRIBUTE_DEFAULTS.get(key) === value;
  }

  if (record.providerResourceType === "AWS::ElasticLoadBalancingV2::TargetGroup") {
    if (key === "deregistration_delay.timeout_seconds") {
      const seconds = Number(value);
      return Number.isInteger(seconds) && seconds >= 0 && seconds <= 3_600;
    }

    if (
      (key === "stickiness.type" && value === "lb_cookie") ||
      (key === "stickiness.lb_cookie.duration_seconds" && value === "86400")
    ) {
      return (
        ["instance", "ip"].includes(String(record.config["targetType"])) &&
        ["HTTP", "HTTPS"].includes(String(record.config["protocol"]))
      );
    }

    return SAFE_TARGET_GROUP_OMITTED_ATTRIBUTE_DEFAULTS.get(key) === value;
  }

  return SAFE_LISTENER_OMITTED_ATTRIBUTE_DEFAULTS.get(key) === value;
}

/** gg: AWS attribute 배열은 빈 key를 버린 단순 key/value 객체로만 보존합니다. */
function normalizeElasticLoadBalancingAttributes(
  attributes: readonly ElasticLoadBalancingAttribute[]
): Record<string, string> {
  return Object.fromEntries(
    attributes.flatMap((attribute) => {
      const key = getNonEmptyStringValue(attribute.Key);
      return key && typeof attribute.Value === "string" ? [[key, attribute.Value]] : [];
    })
  );
}

/** gg: ELB DescribeTags 최대 20 ARN 제한을 지키고 ARN별 정확한 응답만 complete로 표시합니다. */
async function readElasticLoadBalancingTags(
  records: AwsDiscoveredResourceRecord[],
  client: AwsElbReadClient,
  scanErrors: ReverseEngineeringScanError[]
): Promise<void> {
  for (const recordBatch of chunkValues(records, ELBV2_TAG_BATCH_SIZE)) {
    const resourceArns = recordBatch.map((record) => record.providerResourceId);
    try {
      const response = await sendElbCommand<DescribeTagsCommandOutput>(
        client,
        new DescribeTagsCommand({ ResourceArns: resourceArns })
      );
      const tagsByArn = new Map<string, Array<{ key: string; value: string }> | null>();
      for (const description of response.TagDescriptions ?? []) {
        const arn = getNonEmptyStringValue(description.ResourceArn);
        if (!arn) continue;

        const tags = normalizeElasticLoadBalancingTags(description);
        tagsByArn.set(arn, tagsByArn.has(arn) ? null : tags);
      }
      for (const record of recordBatch) {
        const tags = tagsByArn.get(record.providerResourceId);
        if (!tags) {
          record.config = markElasticLoadBalancingIncomplete(record.config, "tags");
          continue;
        }
        record.config = {
          ...record.config,
          reverseEngineeringDetailsVersion: 1,
          tagsReadComplete: true,
          tags
        };
      }
    } catch (error) {
      for (const record of recordBatch) {
        record.config = markElasticLoadBalancingIncomplete(record.config, "tags");
      }
      for (const resourceType of new Set(
        recordBatch.map(resolveElasticLoadBalancingResourceType)
      )) {
        scanErrors.push(toScanError(resourceType, error));
      }
    }
  }
}

/** gg: ELB tag 응답 전체가 유효할 때만 AWS가 허용하는 빈 value까지 그대로 보존합니다. */
function normalizeElasticLoadBalancingTags(
  description: TagDescription
): Array<{ key: string; value: string }> | null {
  if (!Array.isArray(description.Tags)) return null;

  const tags: Array<{ key: string; value: string }> = [];
  for (const tag of description.Tags) {
    const key = getNonEmptyStringValue(tag.Key);
    if (!key || typeof tag.Value !== "string") return null;
    tags.push({ key, value: tag.Value });
  }
  return tags;
}

/** gg: 상세 조회 실패 종류를 중복 없이 누적해 관리 판정을 fail-close합니다. */
function markElasticLoadBalancingIncomplete(
  config: Record<string, unknown>,
  detail: "attributes" | "tags"
): Record<string, unknown> {
  const currentDetails = Array.isArray(config["reverseEngineeringIncompleteDetails"])
    ? config["reverseEngineeringIncompleteDetails"].filter(isNonEmptyString)
    : [];
  return {
    ...config,
    reverseEngineeringDetailsVersion: 1,
    [`${detail}ReadComplete`]: false,
    reverseEngineeringIncompleteDetails: [...new Set([...currentDetails, detail])]
  };
}

/** gg: ELB provider type을 화면과 scan error가 쓰는 정식 ResourceType으로 좁힙니다. */
function resolveElasticLoadBalancingResourceType(
  record: AwsDiscoveredResourceRecord
): ResourceType {
  if (record.providerResourceType === "AWS::ElasticLoadBalancingV2::TargetGroup") {
    return "LOAD_BALANCER_TARGET_GROUP";
  }
  if (record.providerResourceType === "AWS::ElasticLoadBalancingV2::Listener") {
    return "LOAD_BALANCER_LISTENER";
  }
  return "LOAD_BALANCER";
}

// ALB는 태그가 없어도 자주 쓰이므로 ELBv2 API를 정식 reader로 사용합니다.
export async function listApplicationLoadBalancers(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  createClient: AwsElbReadClientFactory = createDefaultElbReadClient,
  reportPageFailure: (failure: AwsPageFailure) => void = () => undefined
): Promise<AwsDiscoveredResourceRecord[]> {
  const client = createClient(region, credentials);
  const result = await listApplicationLoadBalancerPages(client);

  if (result.failure) reportPageFailure(result.failure);
  return result.items.flatMap((loadBalancer) =>
    toApplicationLoadBalancerRecord(loadBalancer, region)
  );
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
      items: (response.Images ?? []).flatMap((image) => toUnknownAmiImageRecord(image, region)),
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
      items: keyRecords.filter((record): record is AwsDiscoveredResourceRecord => record !== null),
      nextToken: response.NextMarker
    };
  });

  if (result.failure) reportPageFailure(result.failure);
  return result.items;
}

/** Log Group과 태그를 함께 읽고 태그 실패는 불완전 근거로 남겨 자동 관리를 막는다. */
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
    const records = await Promise.all(
      (response.logGroups ?? []).map(async (logGroup) => {
        const tagEvidence = await readCloudWatchLogGroupTags(logGroup, client, reportPageFailure);
        return toUnknownLogGroupRecord(logGroup, region, tagEvidence);
      })
    );
    return {
      items: records.flat(),
      nextToken: response.nextToken
    };
  });

  if (result.failure) reportPageFailure(result.failure);
  return result.items;
}

/** Alarm과 태그를 함께 읽고 일부 조회 실패를 전체 성공으로 오인하지 않도록 기록한다. */
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
    const records = await Promise.all(
      (response.MetricAlarms ?? []).map(async (alarm) => {
        const tagEvidence = await readCloudWatchMetricAlarmTags(alarm, client, reportPageFailure);
        return toUnknownMetricAlarmRecord(alarm, region, tagEvidence);
      })
    );
    return {
      items: records.flat(),
      nextToken: response.NextToken
    };
  });

  if (result.failure) reportPageFailure(result.failure);
  return result.items;
}

type AwsTagReadEvidence = {
  readonly tags?: Array<{ key: string; value: string }>;
  readonly tagsReadComplete: boolean;
};

/** Log Group ARN과 전체 태그를 확인한 경우만 완료로 표시하고 실패하면 닫힌 상태로 반환한다. */
async function readCloudWatchLogGroupTags(
  logGroup: LogGroup,
  client: AwsCloudWatchLogsReadClient,
  reportFailure: (failure: AwsPageFailure) => void
): Promise<AwsTagReadEvidence> {
  const resourceArn =
    getNonEmptyStringValue(logGroup.logGroupArn) ??
    getNonEmptyStringValue(logGroup.arn)?.replace(/:\*$/u, "");
  if (!resourceArn) {
    return { tagsReadComplete: false };
  }

  try {
    const response = await sendCloudWatchLogsCommand<ListLogGroupTagsForResourceCommandOutput>(
      client,
      new ListLogGroupTagsForResourceCommand({ resourceArn })
    );
    const tagEntries = Object.entries(response.tags ?? {});
    if (tagEntries.some(([key, value]) => key.trim().length === 0 || typeof value !== "string")) {
      return { tagsReadComplete: false };
    }
    return {
      tags: tagEntries.map(([key, value]) => ({ key, value })),
      tagsReadComplete: true
    };
  } catch (error) {
    reportFailure({ outcome: classifyAwsPageFailureOutcome(error) });
    return { tagsReadComplete: false };
  }
}

/** Alarm 태그가 모두 문자열로 확인된 경우만 완료로 표시하고 실패하면 자동 관리를 막는다. */
async function readCloudWatchMetricAlarmTags(
  alarm: MetricAlarm,
  client: AwsCloudWatchReadClient,
  reportFailure: (failure: AwsPageFailure) => void
): Promise<AwsTagReadEvidence> {
  const resourceArn = getNonEmptyStringValue(alarm.AlarmArn);
  if (!resourceArn) {
    return { tagsReadComplete: false };
  }

  try {
    const response = await sendCloudWatchCommand<ListCloudWatchTagsForResourceCommandOutput>(
      client,
      new ListCloudWatchTagsForResourceCommand({ ResourceARN: resourceArn })
    );
    const tags: Array<{ key: string; value: string }> = [];
    for (const tag of response.Tags ?? []) {
      const key = getNonEmptyStringValue(tag.Key);
      if (!key || typeof tag.Value !== "string") {
        return { tagsReadComplete: false };
      }
      tags.push({ key, value: tag.Value });
    }
    return {
      tags,
      tagsReadComplete: true
    };
  } catch (error) {
    reportFailure({ outcome: classifyAwsPageFailureOutcome(error) });
    return { tagsReadComplete: false };
  }
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
      items: (response.items ?? []).flatMap((restApi) => toUnknownRestApiRecord(restApi, region)),
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
  const client = new ResourceExplorer2Client({
    region,
    credentials: toAwsSdkCredentials(credentials)
  });

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

async function sendElbCommand<TOutput>(
  client: AwsElbReadClient,
  command: object
): Promise<TOutput> {
  return (await client.send(command)) as TOutput;
}

async function sendEcsCommand<TOutput>(
  client: AwsEcsReadClient,
  command: object
): Promise<TOutput> {
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

async function sendIamCommand<TOutput>(
  client: AwsIamReadClient,
  command: object
): Promise<TOutput> {
  return (await client.send(command)) as TOutput;
}

async function sendKmsCommand<TOutput>(
  client: AwsKmsReadClient,
  command: object
): Promise<TOutput> {
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

async function sendEc2Command<TOutput>(
  client: AwsEc2ReadClient,
  command: object
): Promise<TOutput> {
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
      ? [
          {
            ...(availabilityZoneName ? { availabilityZone: availabilityZoneName } : {}),
            ...(subnetId ? { subnetId } : {})
          }
        ]
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

/** gg: HTTP/HTTPS Target Group 응답을 health check와 ALB/VPC 관계가 있는 전용 record로 줄입니다. */
function toLoadBalancerTargetGroupRecord(
  targetGroup: TargetGroup,
  fallbackRegion: string
): AwsDiscoveredResourceRecord[] {
  const arn = getNonEmptyStringValue(targetGroup.TargetGroupArn);
  if (!arn) return [];
  const vpcId = getNonEmptyStringValue(targetGroup.VpcId);
  const loadBalancerArns = (targetGroup.LoadBalancerArns ?? []).filter(isNonEmptyString);
  const healthCheck = compactRecord({
    enabled: targetGroup.HealthCheckEnabled,
    protocol: targetGroup.HealthCheckProtocol,
    port: targetGroup.HealthCheckPort,
    path: targetGroup.HealthCheckPath,
    matcher: targetGroup.Matcher?.HttpCode,
    interval: targetGroup.HealthCheckIntervalSeconds,
    timeout: targetGroup.HealthCheckTimeoutSeconds,
    healthyThreshold: targetGroup.HealthyThresholdCount,
    unhealthyThreshold: targetGroup.UnhealthyThresholdCount
  });

  return [
    {
      providerResourceType: "AWS::ElasticLoadBalancingV2::TargetGroup",
      providerResourceId: arn,
      displayName: targetGroup.TargetGroupName ?? arn,
      region: fallbackRegion,
      config: compactRecord({
        arn,
        name: targetGroup.TargetGroupName,
        targetGroupName: targetGroup.TargetGroupName,
        protocol: targetGroup.Protocol,
        port: targetGroup.Port,
        vpcId,
        healthCheck,
        targetType: targetGroup.TargetType,
        loadBalancerArns,
        ipAddressType: targetGroup.IpAddressType,
        protocolVersion: targetGroup.ProtocolVersion
      }),
      relationships: [
        ...(vpcId ? [{ type: "depends_on" as const, targetProviderResourceId: vpcId }] : []),
        ...loadBalancerArns.map((loadBalancerArn) => ({
          type: "attached_to" as const,
          targetProviderResourceId: loadBalancerArn
        }))
      ]
    }
  ];
}

/** gg: Listener는 원본 action ARN을 관계로만 옮기고 단순 forward 여부만 config에 남깁니다. */
function toLoadBalancerListenerRecord(
  listener: Listener,
  fallbackRegion: string
): AwsDiscoveredResourceRecord[] {
  const arn = getNonEmptyStringValue(listener.ListenerArn);
  const loadBalancerArn = getNonEmptyStringValue(listener.LoadBalancerArn);
  if (!arn || !loadBalancerArn) return [];
  const forwardTargetGroupArn = getSimpleForwardTargetGroupArn(listener.DefaultActions);

  return [
    {
      providerResourceType: "AWS::ElasticLoadBalancingV2::Listener",
      providerResourceId: arn,
      displayName: `${listener.Protocol ?? "Listener"}:${listener.Port ?? "unknown"}`,
      region: fallbackRegion,
      config: compactRecord({
        arn,
        loadBalancerArn,
        port: listener.Port,
        protocol: listener.Protocol,
        defaultAction: forwardTargetGroupArn ? { type: "forward" } : undefined,
        simpleForwardAction: Boolean(forwardTargetGroupArn),
        hasAdvancedDefaultAction: forwardTargetGroupArn ? undefined : true
      }),
      relationships: [
        { type: "depends_on", targetProviderResourceId: loadBalancerArn },
        ...(forwardTargetGroupArn
          ? [{ type: "attached_to" as const, targetProviderResourceId: forwardTargetGroupArn }]
          : [])
      ]
    }
  ];
}

/** gg: 정확히 하나의 단일 forward 대상만 관리 가능한 Target Group 관계로 인정합니다. */
function getSimpleForwardTargetGroupArn(
  defaultActions: readonly Action[] | undefined
): string | null {
  if (!defaultActions || defaultActions.length !== 1) return null;
  const [action] = defaultActions;
  if (!action || action.Type !== "forward") return null;
  const directArn = getNonEmptyStringValue(action.TargetGroupArn);
  const forwardTargets = (action.ForwardConfig?.TargetGroups ?? []).flatMap((target) => {
    const targetArn = getNonEmptyStringValue(target.TargetGroupArn);
    return targetArn ? [{ arn: targetArn, weight: target.Weight }] : [];
  });
  const uniqueTargetArns = new Set([
    ...(directArn ? [directArn] : []),
    ...forwardTargets.map((target) => target.arn)
  ]);
  const hasWeightedOrStickyAction =
    forwardTargets.some((target) => target.weight !== undefined && target.weight !== 1) ||
    action.ForwardConfig?.TargetGroupStickinessConfig?.Enabled === true;

  return uniqueTargetArns.size === 1 && !hasWeightedOrStickyAction
    ? ([...uniqueTargetArns][0] ?? null)
    : null;
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
    ...subnetIds.map((subnetId) => ({
      type: "attached_to" as const,
      targetProviderResourceId: subnetId
    })),
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
  const functionArn =
    lambdaFunction.FunctionArn ?? lambdaFunction.FunctionName ?? "lambda-function";
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

function toUnknownAmiImageRecord(
  image: Image,
  fallbackRegion: string
): AwsDiscoveredResourceRecord[] {
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

/** 식별 가능한 Instance Profile만 후보로 만들고 연결된 Role 관계를 별도 근거로 보존한다. */
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
        roleNames: (profile.Roles ?? []).flatMap((role) => (role.RoleName ? [role.RoleName] : [])),
        scanRegion: fallbackRegion
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
    sendKmsCommand<DescribeKeyCommandOutput>(
      client,
      new DescribeKeyCommand({ KeyId: keyId ?? keyArn })
    )
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
    displayName:
      keyMetadata?.Description ?? keyMetadata?.KeyId ?? fallbackKeyId ?? providerResourceId,
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

/** Log Group 설정과 태그 완전성 근거를 함께 저장해 불완전 조회의 승격을 막는다. */
function toUnknownLogGroupRecord(
  logGroup: LogGroup,
  fallbackRegion: string,
  tagEvidence: AwsTagReadEvidence = { tagsReadComplete: false }
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
        storedBytes: logGroup.storedBytes,
        tags: tagEvidence.tags,
        tagsReadComplete: tagEvidence.tagsReadComplete
      },
      relationships: []
    }
  ];
}

/** Alarm 설정과 별도 태그 조회 결과를 묶어 이후 관리 가능 여부를 안전하게 판단하게 한다. */
function toUnknownMetricAlarmRecord(
  alarm: MetricAlarm,
  fallbackRegion: string,
  tagEvidence: AwsTagReadEvidence = { tagsReadComplete: false }
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
        evaluateLowSampleCountPercentiles: alarm.EvaluateLowSampleCountPercentile,
        evaluationPeriods: alarm.EvaluationPeriods,
        extendedStatistic: alarm.ExtendedStatistic,
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
        tags: tagEvidence.tags,
        tagsReadComplete: tagEvidence.tagsReadComplete,
        threshold: alarm.Threshold,
        thresholdMetricId: alarm.ThresholdMetricId,
        treatMissingData: alarm.TreatMissingData,
        unit: alarm.Unit
      },
      relationships: []
    }
  ];
}

/** REST API policy 원문은 버리고 존재 여부와 전체 태그 근거만 남겨 공개 경계를 지킨다. */
function toUnknownRestApiRecord(
  restApi: RestApi,
  fallbackRegion: string
): AwsDiscoveredResourceRecord[] {
  if (!restApi.id) {
    return [];
  }
  const { policy, ...restApiWithoutPolicy } = restApi;

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
        hasResourcePolicy: isNonEmptyString(policy),
        id: restApi.id,
        minimumCompressionSize: restApi.minimumCompressionSize,
        name: restApi.name,
        providerParameters: toProviderParameterSnapshot(restApiWithoutPolicy),
        rootResourceId: restApi.rootResourceId,
        tags: restApi.tags ?? {},
        tagsReadComplete: true,
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
  const [resourceKind = "resource", ...nameParts] = resource.split(/[/:]/).filter(Boolean);
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

const AWS_PROVIDER_RESOURCE_TYPE_BY_ARN_KIND = new Map<string, string>([
  ["apigateway:restapis", "AWS::ApiGateway::RestApi"],
  ["application-autoscaling:scalable-target", "AWS::ApplicationAutoScaling::ScalableTarget"],
  ["application-autoscaling:scaling-policy", "AWS::ApplicationAutoScaling::ScalingPolicy"],
  ["cloudfront:distribution", "AWS::CloudFront::Distribution"],
  ["cloudfront:origin-access-control", "AWS::CloudFront::OriginAccessControl"],
  ["cloudwatch:alarm", "AWS::CloudWatch::Alarm"],
  ["ec2:eip-allocation", "AWS::EC2::EIP"],
  ["ec2:elastic-ip", "AWS::EC2::EIP"],
  ["ec2:image", "AWS::EC2::Image"],
  ["ec2:instance", "AWS::EC2::Instance"],
  ["ec2:internet-gateway", "AWS::EC2::InternetGateway"],
  ["ec2:natgateway", "AWS::EC2::NatGateway"],
  ["ec2:route-table", "AWS::EC2::RouteTable"],
  ["ec2:security-group", "AWS::EC2::SecurityGroup"],
  ["ec2:subnet", "AWS::EC2::Subnet"],
  ["ec2:vpc", "AWS::EC2::VPC"],
  ["ecr:repository", "AWS::ECR::Repository"],
  ["elasticloadbalancing:listener", "AWS::ElasticLoadBalancingV2::Listener"],
  ["elasticloadbalancing:loadbalancer", "AWS::ElasticLoadBalancingV2::LoadBalancer"],
  ["elasticloadbalancing:targetgroup", "AWS::ElasticLoadBalancingV2::TargetGroup"],
  ["events:event-bus", "AWS::Events::EventBus"],
  ["events:rule", "AWS::Events::Rule"],
  ["iam:instance-profile", "AWS::IAM::InstanceProfile"],
  ["iam:policy", "AWS::IAM::Policy"],
  ["iam:role", "AWS::IAM::Role"],
  ["kms:key", "AWS::KMS::Key"],
  ["lambda:function", "AWS::Lambda::Function"],
  ["logs:log-group", "AWS::Logs::LogGroup"],
  ["rds:db", "AWS::RDS::DBInstance"],
  ["secretsmanager:secret", "AWS::SecretsManager::Secret"]
]);

function toProviderResourceType(service: string, resourceKind: string): string {
  return (
    AWS_PROVIDER_RESOURCE_TYPE_BY_ARN_KIND.get(
      `${service.toLowerCase()}:${resourceKind.toLowerCase()}`
    ) ?? `AWS::${toPascalCase(service)}::${toPascalCase(resourceKind)}`
  );
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
    /:ec2:[^:]*:[^:]*:(vpc|subnet|internet-gateway|route-table|security-group|instance)\//.test(
      arn
    ) ||
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
    (parsedArn.service === "cloudfront" && parsedArn.resourceKind === "distribution") ||
    (parsedArn.service === "events" && parsedArn.resourceKind === "rule") ||
    (parsedArn.service === "ecs" &&
      ["cluster", "service", "task-definition"].includes(parsedArn.resourceKind))
  );
}

type EventBridgeTargetReferenceMetadata = {
  readonly terraformResourceType: string;
  readonly terraformAttribute: "arn";
};

/** gg: Target ARN이 이번 scan의 관리 가능한 리소스와 정확히 일치할 때만 Board 관계와 참조를 승인합니다. */
export function resolveEventBridgeTargetRelationships(
  records: AwsDiscoveredResourceRecord[]
): AwsDiscoveredResourceRecord[] {
  const recordsByProviderId = new Map(records.map((record) => [record.providerResourceId, record]));
  const recordsByRelationshipIdentity = new Map(
    records.map((record) => [
      createEventBridgeRelationshipIdentity(record.providerResourceId),
      record
    ])
  );

  return records.map((record) => {
    if (record.providerResourceType !== "AWS::Events::Target") {
      return record;
    }

    const ruleProviderResourceId = getNonEmptyStringValue(record.config["ruleProviderResourceId"]);
    const targetProviderResourceId = getNonEmptyStringValue(
      record.config["targetArn"] ?? record.config["targetProviderResourceId"]
    );
    const targetRecord = targetProviderResourceId
      ? (recordsByProviderId.get(targetProviderResourceId) ??
        recordsByRelationshipIdentity.get(
          createEventBridgeRelationshipIdentity(targetProviderResourceId)
        ))
      : undefined;
    const ruleRecord = ruleProviderResourceId
      ? recordsByProviderId.get(ruleProviderResourceId)
      : undefined;
    const resolvedTargetProviderResourceId =
      targetRecord?.providerResourceId ?? targetProviderResourceId;
    const targetReference = targetRecord
      ? getEventBridgeTargetReferenceMetadata(targetRecord)
      : null;
    const candidateRelationships: AwsDiscoveredResourceRecord["relationships"] = [
      ...record.relationships,
      ...(ruleProviderResourceId
        ? [{ type: "depends_on" as const, targetProviderResourceId: ruleProviderResourceId }]
        : []),
      ...(resolvedTargetProviderResourceId
        ? [
            {
              type: "attached_to" as const,
              targetProviderResourceId: resolvedTargetProviderResourceId
            }
          ]
        : [])
    ];

    return {
      ...record,
      config: compactRecord({
        targetId: record.config["targetId"],
        ruleName: record.config["ruleName"],
        eventBusName: record.config["eventBusName"],
        ruleProviderResourceId,
        targetProviderResourceId: resolvedTargetProviderResourceId,
        ruleReferenceReady: isEventBridgeRuleReferenceReady(ruleRecord),
        hasRoleArn: hasEventBridgeTargetRisk(record.config, "hasRoleArn", "roleArn"),
        hasInput: hasEventBridgeTargetRisk(record.config, "hasInput", "input"),
        hasInputPath: hasEventBridgeTargetRisk(record.config, "hasInputPath", "inputPath"),
        hasInputTransformer: hasEventBridgeTargetRisk(
          record.config,
          "hasInputTransformer",
          "inputTransformer"
        ),
        hasDeadLetterConfig: hasEventBridgeTargetRisk(
          record.config,
          "hasDeadLetterConfig",
          "deadLetterConfig"
        ),
        hasRetryPolicy: hasEventBridgeTargetRisk(record.config, "hasRetryPolicy", "retryPolicy"),
        hasAdvancedParameters:
          record.config["hasAdvancedParameters"] === true ||
          EVENTBRIDGE_TARGET_ADVANCED_CONFIG_KEYS.some((key) => record.config[key] !== undefined)
            ? true
            : undefined,
        targetReferenceReady: targetReference !== null,
        targetTerraformResourceType: targetReference?.terraformResourceType,
        targetTerraformAttribute: targetReference?.terraformAttribute
      }),
      relationships: uniqueDiscoveredRelationships(
        candidateRelationships.filter((relationship) =>
          recordsByProviderId.has(relationship.targetProviderResourceId)
        )
      )
    };
  });
}

// gg: CloudWatch Logs ARN의 선택적 `:*` suffix만 제거해 EventBridge Target ARN과 맞춥니다.
function createEventBridgeRelationshipIdentity(providerResourceId: string): string {
  return providerResourceId.includes(":log-group:") && providerResourceId.endsWith(":*")
    ? providerResourceId.slice(0, -2)
    : providerResourceId;
}

function isEventBridgeRuleReferenceReady(record: AwsDiscoveredResourceRecord | undefined): boolean {
  return Boolean(
    record?.providerResourceType === "AWS::Events::Rule" &&
    record.config["tagsReadComplete"] === true &&
    record.config["hasRoleArn"] !== true &&
    !getNonEmptyStringValue(record.config["managedBy"])
  );
}

const EVENTBRIDGE_TARGET_ADVANCED_CONFIG_KEYS = [
  "kinesisParameters",
  "runCommandParameters",
  "ecsParameters",
  "batchParameters",
  "sqsParameters",
  "httpParameters",
  "redshiftDataParameters",
  "sageMakerPipelineParameters",
  "appSyncParameters"
] as const;

function hasEventBridgeTargetRisk(
  config: Record<string, unknown>,
  markerKey: string,
  sourceKey: string
): true | undefined {
  return config[markerKey] === true || config[sourceKey] !== undefined ? true : undefined;
}

// gg: 현재 Terraform projection이 실제로 선언할 수 있는 대상만 Target ARN 참조로 승격합니다.
function getEventBridgeTargetReferenceMetadata(
  record: AwsDiscoveredResourceRecord
): EventBridgeTargetReferenceMetadata | null {
  if (
    record.providerResourceType === "AWS::Logs::LogGroup" &&
    getNonEmptyStringValue(record.config["logGroupName"]) &&
    record.config["logGroupClass"] === "STANDARD" &&
    record.config["tagsReadComplete"] === true &&
    Array.isArray(record.config["tags"]) &&
    record.config["hasKmsKey"] !== true &&
    !getNonEmptyStringValue(record.config["kmsKeyId"])
  ) {
    return { terraformResourceType: "aws_cloudwatch_log_group", terraformAttribute: "arn" };
  }

  return null;
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
    const awsvpcConfiguration =
      networkConfiguration && isRecordValue(networkConfiguration["awsvpcConfiguration"])
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
      const candidate = originCandidates.find((resource) =>
        originExplicitlyReferencesResource(origin, resource)
      );

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
  const explicitOriginIds = [
    origin["arn"],
    origin["originArn"],
    origin["providerResourceId"]
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

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
  if (endpoint === "s3" || endpoint === "s3-accelerate" || endpoint === "s3-accelerate.dualstack") {
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

// 같은 scan의 NAT allocation 참조로만 EIP의 ENI association을 지원되는 NAT 연결로 좁힙니다.
export function resolveNatGatewayElasticIpRelationships(
  records: AwsDiscoveredResourceRecord[]
): AwsDiscoveredResourceRecord[] {
  const natGatewayIdsByAllocationId = new Map<string, string[]>();

  for (const record of records) {
    if (record.providerResourceType !== "AWS::EC2::NatGateway") {
      continue;
    }

    const natGatewayId =
      getNonEmptyStringValue(record.config["natGatewayId"]) ??
      (/^nat-[a-z0-9]+$/iu.test(record.providerResourceId) ? record.providerResourceId : null);

    if (!natGatewayId || !Array.isArray(record.config["allocationIds"])) {
      continue;
    }

    for (const allocationId of record.config["allocationIds"]) {
      if (typeof allocationId !== "string" || allocationId.trim().length === 0) {
        continue;
      }

      natGatewayIdsByAllocationId.set(allocationId, [
        ...(natGatewayIdsByAllocationId.get(allocationId) ?? []),
        natGatewayId
      ]);
    }
  }

  return records.map((record) => {
    if (record.providerResourceType !== "AWS::EC2::EIP") {
      return record;
    }

    if (record.config["associationTargetType"] === "service_managed") {
      return record;
    }

    const allocationId = getNonEmptyStringValue(record.config["allocationId"]);
    const natGatewayIds = allocationId
      ? [...new Set(natGatewayIdsByAllocationId.get(allocationId) ?? [])]
      : [];

    if (natGatewayIds.length !== 1 || !natGatewayIds[0]) {
      return record;
    }

    return {
      ...record,
      config: { ...record.config, associationTargetType: "nat_gateway" },
      relationships: uniqueDiscoveredRelationships([
        ...record.relationships,
        { type: "depends_on", targetProviderResourceId: natGatewayIds[0] }
      ])
    };
  });
}

// gg: 같은 Resource가 여러 reader에서 잡혀도 전용 조회 결과의 설정과 관계를 보존합니다.
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
    if (existingRecord) {
      uniqueRecords[existingIndex] = mergeDuplicateDiscoveredRecords(existingRecord, record);
    }
  }

  return uniqueRecords;
}

function mergeDuplicateDiscoveredRecords(
  existingRecord: AwsDiscoveredResourceRecord,
  candidateRecord: AwsDiscoveredResourceRecord
): AwsDiscoveredResourceRecord {
  const preferCandidate = shouldPreferDedicatedRecord(existingRecord, candidateRecord);
  const preferredRecord = preferCandidate ? candidateRecord : existingRecord;
  const secondaryRecord = preferCandidate ? existingRecord : candidateRecord;

  return {
    ...secondaryRecord,
    ...preferredRecord,
    config: mergeDiscoveredRecordConfig(secondaryRecord.config, preferredRecord.config),
    relationships: uniqueDiscoveredRelationships([
      ...secondaryRecord.relationships,
      ...preferredRecord.relationships
    ])
  };
}

/** gg: 상세 reader의 완전한 tag map은 generic inventory의 배열형 tag로 덮어쓰지 않습니다. */
function mergeDiscoveredRecordConfig(
  secondaryConfig: Record<string, unknown>,
  preferredConfig: Record<string, unknown>
): Record<string, unknown> {
  if (isRecordValue(preferredConfig["tags"])) {
    return preferredConfig;
  }

  const mergedTags = mergeDiscoveredRecordTags(secondaryConfig["tags"], preferredConfig["tags"]);

  return mergedTags.length > 0 ? { ...preferredConfig, tags: mergedTags } : preferredConfig;
}

function mergeDiscoveredRecordTags(
  secondaryTags: unknown,
  preferredTags: unknown
): Array<{ key: string; value: string }> {
  return [
    ...new Map(
      [
        ...normalizeDiscoveredRecordTags(secondaryTags),
        ...normalizeDiscoveredRecordTags(preferredTags)
      ].map((tag) => [tag.key, tag])
    ).values()
  ];
}

function normalizeDiscoveredRecordTags(value: unknown): Array<{ key: string; value: string }> {
  if (Array.isArray(value)) {
    return value.flatMap((candidate) => {
      if (!isRecordValue(candidate)) {
        return [];
      }

      const key = candidate["key"] ?? candidate["Key"];
      const tagValue = candidate["value"] ?? candidate["Value"];

      return typeof key === "string" && typeof tagValue === "string"
        ? [{ key, value: tagValue }]
        : [];
    });
  }

  return isRecordValue(value)
    ? Object.entries(value).flatMap(([key, tagValue]) =>
        typeof tagValue === "string" ? [{ key, value: tagValue }] : []
      )
    : [];
}

/** gg: opaque 상세 ID는 서버 전용 exact identity로 환원해 같은 generic ARN과만 합칩니다. */
function createDiscoveredRecordIdentityKey(record: AwsDiscoveredResourceRecord): string {
  if (
    [
      "AWS::IAM::Role",
      "AWS::IAM::Policy",
      "AWS::IAM::InstanceProfile",
      "AWS::IAM::RolePolicy",
      "AWS::Lambda::Function",
      "AWS::Lambda::Permission"
    ].includes(record.providerResourceType)
  ) {
    const exactProviderResourceId =
      getNonEmptyStringValue(record.serverOnly?.providerResourceId) ?? record.providerResourceId;

    return `${record.providerResourceType}:${exactProviderResourceId}`;
  }

  if (
    record.providerResourceType === "AWS::KMS::Key" ||
    record.providerResourceType === "AWS::KMS::Alias"
  ) {
    const kmsIdentity = createKmsDiscoveredRecordIdentity(record);
    if (kmsIdentity) {
      return `${record.providerResourceType}:${kmsIdentity}`;
    }
  }

  if (record.providerResourceType === "AWS::Logs::LogGroup") {
    return record.providerResourceId.endsWith(":*")
      ? record.providerResourceId.slice(0, -2)
      : record.providerResourceId;
  }

  if (record.providerResourceType === "AWS::EC2::Image") {
    const configImageId = getNonEmptyStringValue(record.config["imageId"]);
    const arnImageId = /^arn:[^:]+:ec2:[^:]+:[^:]+:image\/(ami-[a-f0-9]+)$/iu.exec(
      record.providerResourceId
    )?.[1];
    const directImageId = /^ami-[a-f0-9]+$/iu.test(record.providerResourceId)
      ? record.providerResourceId
      : null;
    const imageId = configImageId ?? arnImageId ?? directImageId;

    return imageId ? `AWS::EC2::Image:${imageId.toLowerCase()}` : record.providerResourceId;
  }

  if (record.providerResourceType === "AWS::EC2::EIP") {
    const allocationId = extractEc2InventoryId(record, "allocationId", "eipalloc-", [
      "eip-allocation",
      "elastic-ip"
    ]);

    return allocationId ? `AWS::EC2::EIP:${allocationId}` : record.providerResourceId;
  }

  if (record.providerResourceType === "AWS::EC2::NatGateway") {
    const natGatewayId = extractEc2InventoryId(record, "natGatewayId", "nat-", [
      "natgateway",
      "nat-gateway"
    ]);

    return natGatewayId ? `AWS::EC2::NatGateway:${natGatewayId}` : record.providerResourceId;
  }

  if (record.providerResourceType === "AWS::ApiGateway::RestApi") {
    const configId = getNonEmptyStringValue(record.config["id"]);
    const exactId =
      getNonEmptyStringValue(record.serverOnly?.providerResourceId) ??
      getNonEmptyStringValue(record.serverOnly?.terraformImportId);
    const arnId = /^arn:[^:]+:apigateway:[^:]+::\/restapis\/([^/]+)$/u.exec(
      record.providerResourceId
    )?.[1];
    const restApiId = exactId ?? configId ?? arnId ?? record.providerResourceId;

    return `AWS::ApiGateway::RestApi:${restApiId}`;
  }

  return record.providerResourceId;
}

/** gg: KMS ARN과 상세 reader의 Key ID·Alias 이름을 같은 exact import identity로 정규화합니다. */
function createKmsDiscoveredRecordIdentity(record: AwsDiscoveredResourceRecord): string | null {
  const configKey = record.providerResourceType === "AWS::KMS::Key" ? "keyId" : "aliasName";
  const expectedKind = record.providerResourceType === "AWS::KMS::Key" ? "key" : "alias";
  const candidates = [
    getNonEmptyStringValue(record.serverOnly?.providerResourceId),
    getNonEmptyStringValue(record.serverOnly?.terraformImportId),
    getNonEmptyStringValue(record.config[configKey]),
    record.providerResourceId
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const arnIdentity = new RegExp(`^arn:[^:]+:kms:[^:]+:[^:]+:${expectedKind}\\/(.+)$`, "u").exec(
      candidate
    )?.[1];
    if (arnIdentity) {
      return expectedKind === "alias" ? `alias/${arnIdentity}` : arnIdentity;
    }
    if (!candidate.startsWith("arn:")) {
      return candidate;
    }
  }

  return null;
}

function extractEc2InventoryId(
  record: AwsDiscoveredResourceRecord,
  configKey: string,
  idPrefix: string,
  arnResourceKinds: readonly string[]
): string | null {
  const configId = getNonEmptyStringValue(record.config[configKey]);
  const directId = new RegExp(`^${idPrefix}[a-z0-9]+$`, "iu").test(record.providerResourceId)
    ? record.providerResourceId
    : null;
  const arnResource = /^arn:[^:]+:ec2:[^:]+:[^:]+:(.+)$/iu.exec(record.providerResourceId)?.[1];
  const arnId = arnResourceKinds.flatMap((resourceKind) => {
    const match = new RegExp(`^${resourceKind}/(${idPrefix}[a-z0-9]+)$`, "iu").exec(
      arnResource ?? ""
    );
    return match?.[1] ? [match[1]] : [];
  })[0];
  const id = configId ?? directId ?? arnId;

  return id?.toLowerCase() ?? null;
}

const DEDICATED_RECORD_DETAIL_KEY_BY_PROVIDER_RESOURCE_TYPE = new Map<string, string>([
  ["AWS::EC2::EIP", "allocationId"],
  ["AWS::EC2::NatGateway", "natGatewayId"],
  ["AWS::EC2::Image", "imageId"],
  ["AWS::Logs::LogGroup", "logGroupName"],
  ["AWS::ApiGateway::RestApi", "name"],
  ["AWS::CloudWatch::Alarm", "alarmName"],
  ["AWS::Events::Rule", "name"],
  ["AWS::Lambda::Function", "functionName"],
  ["AWS::IAM::Role", "roleName"],
  ["AWS::IAM::Policy", "policyName"],
  ["AWS::IAM::InstanceProfile", "instanceProfileName"],
  ["AWS::IAM::RolePolicy", "policyName"],
  ["AWS::KMS::Key", "keyId"],
  ["AWS::KMS::Alias", "aliasName"]
]);

const ELASTIC_LOAD_BALANCING_PROVIDER_RESOURCE_TYPES = new Set([
  "AWS::ElasticLoadBalancingV2::LoadBalancer",
  "AWS::ElasticLoadBalancingV2::TargetGroup",
  "AWS::ElasticLoadBalancingV2::Listener"
]);

// gg: generic inventory보다 같은 Resource의 전용 reader가 가진 관리 가능 설정을 우선합니다.
function shouldPreferDedicatedRecord(
  existingRecord: AwsDiscoveredResourceRecord,
  candidateRecord: AwsDiscoveredResourceRecord
): boolean {
  if (existingRecord.providerResourceType !== candidateRecord.providerResourceType) {
    return false;
  }

  if (ELASTIC_LOAD_BALANCING_PROVIDER_RESOURCE_TYPES.has(existingRecord.providerResourceType)) {
    return (
      getElasticLoadBalancingRecordPreference(candidateRecord) >
      getElasticLoadBalancingRecordPreference(existingRecord)
    );
  }

  const detailKey = DEDICATED_RECORD_DETAIL_KEY_BY_PROVIDER_RESOURCE_TYPE.get(
    existingRecord.providerResourceType
  );

  return Boolean(
    detailKey &&
    getNonEmptyStringValue(existingRecord.config[detailKey]) === null &&
    getNonEmptyStringValue(candidateRecord.config[detailKey]) !== null
  );
}

/** gg: complete dedicated > generic fallback > incomplete dedicated 순서로 한 Resource만 남깁니다. */
function getElasticLoadBalancingRecordPreference(record: AwsDiscoveredResourceRecord): number {
  if (record.config["reverseEngineeringDetailsVersion"] !== 1) {
    return 1;
  }

  return record.config["attributesReadComplete"] === true &&
    record.config["tagsReadComplete"] === true &&
    !Array.isArray(record.config["reverseEngineeringIncompleteDetails"])
    ? 2
    : 0;
}

function compactRecord(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
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
export function shouldReadResourceGroup(
  input: AwsProviderScanInput,
  resourceType: ResourceType
): boolean {
  return (
    input.resourceTypes.includes("ALL") ||
    input.resourceTypes.includes(resourceType) ||
    (resourceType === "VPC" &&
      (input.resourceTypes.includes("LOAD_BALANCER_TARGET_GROUP") ||
        input.resourceTypes.includes("LOAD_BALANCER_LISTENER"))) ||
    ((resourceType === "SUBNET" || resourceType === "ELASTIC_IP") &&
      input.resourceTypes.includes("NAT_GATEWAY")) ||
    ((resourceType === "ROUTE_TABLE" || resourceType === "SUBNET") &&
      input.resourceTypes.includes("ROUTE_TABLE_ASSOCIATION"))
  );
}

/** gg: UNKNOWN과 generic fallback 대상만 inventory reader로 보내 상세 family 중복 호출을 막습니다. */
export function shouldReadUnknownResourceGroup(input: AwsProviderScanInput): boolean {
  return (
    input.resourceTypes.includes("ALL") ||
    input.resourceTypes.includes("UNKNOWN") ||
    input.resourceTypes.includes("AMI") ||
    input.resourceTypes.includes("CLOUDWATCH_LOG_GROUP") ||
    input.resourceTypes.includes("CLOUDWATCH_METRIC_ALARM") ||
    input.resourceTypes.includes("LOAD_BALANCER") ||
    input.resourceTypes.includes("LOAD_BALANCER_TARGET_GROUP") ||
    input.resourceTypes.includes("LOAD_BALANCER_LISTENER")
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
    case "ELASTIC_IP":
    case "NAT_GATEWAY":
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
    case "EVENTBRIDGE_RULE":
    case "EVENTBRIDGE_TARGET":
      return "eventbridge";
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
  return serviceKey
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
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
