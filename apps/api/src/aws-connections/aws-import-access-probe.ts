import { randomUUID } from "node:crypto";
import {
  ApplicationAutoScalingClient,
  DescribeScalableTargetsCommand,
  DescribeScalingPoliciesCommand,
  ListTagsForResourceCommand as ListApplicationAutoScalingTagsForResourceCommand
} from "@aws-sdk/client-application-auto-scaling";
import {
  APIGatewayClient,
  GetAuthorizersCommand,
  GetDeploymentsCommand,
  GetIntegrationCommand,
  GetMethodCommand,
  GetModelsCommand,
  GetRequestValidatorsCommand,
  GetResourcesCommand as GetApiGatewayResourcesCommand,
  GetRestApisCommand,
  GetStagesCommand
} from "@aws-sdk/client-api-gateway";
import {
  CloudFrontClient,
  GetOriginAccessControlCommand,
  ListDistributionsCommand,
  ListOriginAccessControlsCommand,
  ListTagsForResourceCommand as ListCloudFrontTagsForResourceCommand
} from "@aws-sdk/client-cloudfront";
import {
  DescribeAlarmsCommand,
  CloudWatchClient,
  ListTagsForResourceCommand as ListCloudWatchTagsForResourceCommand
} from "@aws-sdk/client-cloudwatch";
import {
  DescribeLogGroupsCommand,
  CloudWatchLogsClient,
  ListTagsForResourceCommand as ListLogGroupTagsForResourceCommand
} from "@aws-sdk/client-cloudwatch-logs";
import {
  DescribeAddressesCommand,
  DescribeImagesCommand,
  DescribeInstancesCommand,
  DescribeInternetGatewaysCommand,
  DescribeNatGatewaysCommand,
  DescribeRouteTablesCommand,
  DescribeSecurityGroupsCommand,
  DescribeSubnetsCommand,
  DescribeVpcsCommand,
  EC2Client
} from "@aws-sdk/client-ec2";
import {
  DescribeListenerAttributesCommand,
  DescribeListenerCertificatesCommand,
  DescribeListenersCommand,
  DescribeLoadBalancerAttributesCommand,
  DescribeLoadBalancersCommand,
  DescribeTagsCommand as DescribeElbv2TagsCommand,
  DescribeTargetGroupAttributesCommand,
  DescribeTargetGroupsCommand,
  ElasticLoadBalancingV2Client
} from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  DescribeRepositoriesCommand,
  ECRClient,
  ListTagsForResourceCommand as ListEcrTagsForResourceCommand
} from "@aws-sdk/client-ecr";
import {
  EventBridgeClient,
  ListEventBusesCommand,
  ListRulesCommand,
  ListTagsForResourceCommand as ListEventBridgeTagsForResourceCommand,
  ListTargetsByRuleCommand
} from "@aws-sdk/client-eventbridge";
import {
  DescribeClustersCommand,
  DescribeServicesCommand,
  DescribeTaskDefinitionCommand,
  ECSClient,
  ListClustersCommand,
  ListServicesCommand
} from "@aws-sdk/client-ecs";
import {
  GetInstanceProfileCommand,
  GetPolicyCommand as GetIamPolicyCommand,
  GetPolicyVersionCommand,
  GetRoleCommand,
  GetRolePolicyCommand,
  IAMClient,
  ListAttachedRolePoliciesCommand,
  ListInstanceProfileTagsCommand,
  ListInstanceProfilesCommand,
  ListPolicyTagsCommand,
  ListPoliciesCommand,
  ListRolePoliciesCommand,
  ListRoleTagsCommand,
  ListRolesCommand
} from "@aws-sdk/client-iam";
import {
  DescribeKeyCommand,
  GetKeyPolicyCommand,
  GetKeyRotationStatusCommand,
  KMSClient,
  ListAliasesCommand as ListKmsAliasesCommand,
  ListKeysCommand,
  ListResourceTagsCommand
} from "@aws-sdk/client-kms";
import {
  GetFunctionCommand,
  GetPolicyCommand,
  LambdaClient,
  ListAliasesCommand as ListLambdaAliasesCommand,
  ListFunctionsCommand,
  ListTagsCommand as ListLambdaTagsCommand,
  ListVersionsByFunctionCommand
} from "@aws-sdk/client-lambda";
import {
  GetDefaultViewCommand,
  GetViewCommand,
  ResourceExplorer2Client,
  SearchCommand
} from "@aws-sdk/client-resource-explorer-2";
import {
  GetResourcesCommand,
  ResourceGroupsTaggingAPIClient
} from "@aws-sdk/client-resource-groups-tagging-api";
import {
  DescribeSecretCommand,
  ListSecretsCommand,
  SecretsManagerClient
} from "@aws-sdk/client-secrets-manager";
import {
  GetBucketEncryptionCommand,
  GetBucketLocationCommand,
  GetBucketPolicyStatusCommand,
  GetBucketTaggingCommand,
  GetBucketVersioningCommand,
  GetBucketWebsiteCommand,
  GetPublicAccessBlockCommand,
  ListBucketsCommand,
  S3Client
} from "@aws-sdk/client-s3";
import type { TerraformAwsCredentialEnv } from "./aws-connection-runtime-credentials.js";
import {
  createAwsSdkStsGateway,
  type AwsTemporaryCredentials
} from "./aws-connection-test-service.js";
import {
  AWS_IMPORT_READERS,
  type AwsImportServiceKey
} from "./aws-import-access-catalog.js";

export type AwsImportProbeOutcome =
  | "success"
  | "not_configured"
  | "permission_denied"
  | "transient";

export type AwsImportProbeConnection = {
  roleArn: string | null;
  externalId: string;
  region: string;
  status: "pending" | "verified" | "failed";
};

export type AwsImportProbeServiceResult = {
  serviceKey: AwsImportServiceKey;
  displayName: string;
  tier: "core" | "expanded";
  outcome: AwsImportProbeOutcome;
};

export type AwsImportProbeResult = {
  status: "ready" | "limited" | "update_required" | "retry_required" | "connection_required";
  coreReady: boolean;
  serviceResults: ReadonlyArray<AwsImportProbeServiceResult>;
  limitedServiceLabels: string[];
  safeErrorCode: string | null;
};

export type AwsImportProbeExecutorContext = {
  region: string;
  credentials: AwsTemporaryCredentials;
  abortSignal: AbortSignal;
};

export type AwsImportProbeExecutor = (
  context: AwsImportProbeExecutorContext,
  serviceKey: AwsImportServiceKey
) => Promise<AwsImportProbeOutcome>;

export type AwsResourceExplorerProbeClient = {
  send(command: object): Promise<unknown>;
};

export type AwsImportProbeReadClient = {
  send(command: object): Promise<unknown>;
};

export type ProbeAwsImportAccessDependencies = {
  assumeRole?: (input: {
    roleArn: string;
    externalId: string;
    region: string;
    roleSessionName: string;
  }) => Promise<AwsTemporaryCredentials>;
  executors?: ReadonlyMap<AwsImportServiceKey, AwsImportProbeExecutor>;
  readTimeoutMs?: number;
};

const defaultReadTimeoutMs = 90_000;

/** gg: registry는 catalog의 literal serviceKey마다 bounded production executor 하나만 둡니다. */
export const AWS_IMPORT_PROBE_EXECUTORS: ReadonlyMap<
  AwsImportServiceKey,
  AwsImportProbeExecutor
> = new Map([
  ["ec2", probeEc2],
  ["s3", probeS3Executor],
  ["rds", probeRds],
  ["elbv2", probeElbv2],
  ["ecs", probeEcs],
  ["cloudfront", probeCloudFront],
  ["ecr", probeEcrExecutor],
  ["secretsmanager", probeSecretsManagerExecutor],
  ["application-autoscaling", probeApplicationAutoScalingExecutor],
  ["resource-explorer", probeResourceExplorerExecutor],
  ["tagging", probeTagging],
  ["iam", probeIam],
  ["kms", probeKms],
  ["logs", probeLogs],
  ["cloudwatch", probeCloudWatch],
  ["apigateway", probeApiGateway],
  ["lambda", probeLambdaExecutor],
  ["eventbridge", probeEventBridgeExecutor],
  ["ami", probeAmi]
]);

/** gg: 한 번의 target Role session만 만든 뒤 모든 bounded reader에 같은 credentials를 전달합니다. */
export async function probeAwsImportAccess(
  input: { connection: AwsImportProbeConnection },
  dependencies: ProbeAwsImportAccessDependencies = {}
): Promise<AwsImportProbeResult> {
  const connection = input.connection;
  if (!connection.roleArn || connection.status !== "verified") {
    return bootstrapResult("connection_required", "target_role_unavailable");
  }
  const assumeRole = dependencies.assumeRole ?? createAwsSdkStsGateway().assumeRole;
  let credentials: AwsTemporaryCredentials;
  try {
    credentials = await assumeRole({
      roleArn: connection.roleArn,
      externalId: connection.externalId,
      region: connection.region,
      roleSessionName: `sketchcatch-import-${randomUUID()}`
    });
  } catch (error) {
    return isBootstrapCredentialError(error)
      ? bootstrapResult("retry_required", "bootstrap_credentials_unavailable")
      : isConnectionConfigurationError(error)
        ? bootstrapResult("connection_required", "target_role_unavailable")
        : bootstrapResult("retry_required", "assume_role_retry");
  }

  const executors = dependencies.executors ?? AWS_IMPORT_PROBE_EXECUTORS;
  const serviceResults: AwsImportProbeServiceResult[] = [];
  const abortController = new AbortController();
  const timeout = setTimeout(
    () => abortController.abort(),
    dependencies.readTimeoutMs ?? defaultReadTimeoutMs
  );
  try {
    for (const reader of AWS_IMPORT_READERS) {
      const executor = executors.get(reader.serviceKey);
      let outcome: AwsImportProbeOutcome = "transient";
      if (executor && !abortController.signal.aborted) {
        try {
          outcome = await executor(
            { region: connection.region, credentials, abortSignal: abortController.signal },
            reader.serviceKey
          );
        } catch (error) {
          outcome = classifyReadError(error);
        }
      }
      serviceResults.push({
        serviceKey: reader.serviceKey,
        displayName: reader.displayName,
        tier: reader.tier,
        outcome
      });
    }
  } finally {
    clearTimeout(timeout);
  }

  return deriveProbeResult(serviceResults);
}

/** gg: Resource Explorer는 default View identity를 확인한 뒤 한 건 Search만 수행합니다. */
export async function probeResourceExplorer(
  client: AwsResourceExplorerProbeClient
): Promise<AwsImportProbeOutcome> {
  let defaultView: { ViewArn?: string };
  try {
    defaultView = await client.send(new GetDefaultViewCommand({})) as { ViewArn?: string };
  } catch (error) {
    return classifyReadError(error);
  }
  if (!defaultView.ViewArn) return "not_configured";
  let view: { View?: { ViewArn?: string } };
  try {
    view = await client.send(new GetViewCommand({ ViewArn: defaultView.ViewArn })) as {
      View?: { ViewArn?: string };
    };
  } catch (error) {
    return classifyReadError(error);
  }
  if (!view.View?.ViewArn) return "not_configured";
  try {
    await client.send(new SearchCommand({
      ViewArn: view.View.ViewArn,
      QueryString: "*",
      MaxResults: 1
    }));
    return "success";
  } catch (error) {
    return isAccessDeniedError(error) ? "permission_denied" : "transient";
  }
}

/** gg: bootstrap 실패 결과에는 provider 원문이나 connection identity를 넣지 않습니다. */
function bootstrapResult(
  status: "retry_required" | "connection_required",
  safeErrorCode: string
): AwsImportProbeResult {
  return {
    status,
    coreReady: false,
    serviceResults: [],
    limitedServiceLabels: [],
    safeErrorCode
  };
}

/** gg: status precedence는 core transient, core denial, expanded non-success 순으로 고정합니다. */
function deriveProbeResult(
  serviceResults: ReadonlyArray<AwsImportProbeServiceResult>
): AwsImportProbeResult {
  const coreResults = serviceResults.filter((result) => result.tier === "core");
  const expandedFailures = serviceResults.filter(
    (result) => result.tier === "expanded" && result.outcome !== "success"
  );
  const status = coreResults.some((result) => result.outcome === "transient")
    ? "retry_required"
    : coreResults.some((result) => result.outcome !== "success")
      ? "update_required"
      : expandedFailures.length > 0
        ? "limited"
        : "ready";
  return {
    status,
    coreReady: coreResults.length > 0 && coreResults.every((result) => result.outcome === "success"),
    serviceResults,
    limitedServiceLabels: expandedFailures.map((result) => result.displayName),
    safeErrorCode: status === "retry_required"
      ? "core_read_retry"
      : status === "update_required"
        ? "core_read_permission_required"
        : status === "limited"
          ? "expanded_reads_limited"
          : null
  };
}

/** gg: raw SDK 오류는 네 가지 allowlisted outcome 중 하나로만 축약합니다. */
function classifyReadError(error: unknown): AwsImportProbeOutcome {
  if (isAccessDeniedError(error)) return "permission_denied";
  if (isMissingConfigurationError(error)) return "not_configured";
  return "transient";
}

/** gg: local SSO/default provider failures를 target Role denial과 분리합니다. */
function isBootstrapCredentialError(error: unknown): boolean {
  const name = errorName(error);
  const message = errorMessage(error).toLowerCase();
  return name === "CredentialsProviderError" || name === "TokenProviderError" ||
    name === "ExpiredToken" || name === "ExpiredTokenException" ||
    name === "InvalidClientTokenId" || name === "UnrecognizedClientException" ||
    message.includes("could not load credentials") || message.includes("sso session");
}

/** gg: explicit target Role identity/trust failures만 Settings 복구로 안내합니다. */
function isConnectionConfigurationError(error: unknown): boolean {
  const name = errorName(error);
  return isAccessDeniedError(error) || name === "ValidationError" ||
    name === "NoSuchEntity" || name === "NoSuchEntityException";
}

/** gg: target API permission 오류만 permission_denied outcome으로 분류합니다. */
function isAccessDeniedError(error: unknown): boolean {
  const name = errorName(error);
  const message = errorMessage(error).toLowerCase();
  return name === "AccessDenied" || name === "AccessDeniedException" ||
    name === "UnauthorizedOperation" || message.includes("not authorized to perform");
}

/** gg: optional AWS setup 부재는 permission denial과 다른 safe outcome으로 유지합니다. */
function isMissingConfigurationError(error: unknown): boolean {
  const name = errorName(error);
  return name === "ResourceNotFoundException" || name === "NoSuchConfiguration" ||
    name === "NoSuchWebsiteConfiguration" || name === "NoSuchTagSet" ||
    name === "NoSuchPublicAccessBlockConfiguration" || name === "NoSuchBucketPolicy" ||
    name === "ServerSideEncryptionConfigurationNotFoundError";
}

/** gg: SDK error name만 내부 분류에 읽고 결과에는 보존하지 않습니다. */
function errorName(error: unknown): string {
  return typeof error === "object" && error !== null && "name" in error &&
    typeof error.name === "string" ? error.name : "";
}

/** gg: SDK error message는 bootstrap 분류에만 사용하고 결과에는 보존하지 않습니다. */
function errorMessage(error: unknown): string {
  return typeof error === "object" && error !== null && "message" in error &&
    typeof error.message === "string" ? error.message : "";
}

/** gg: EC2 core action은 pagination token을 따르지 않는 단일 요청씩만 보냅니다. */
async function probeEc2(context: AwsImportProbeExecutorContext): Promise<AwsImportProbeOutcome> {
  const client = bindAbortSignal(
    new EC2Client({ region: context.region, credentials: context.credentials }),
    context.abortSignal
  );
  await client.send(new DescribeVpcsCommand({ MaxResults: 5 }));
  await client.send(new DescribeSubnetsCommand({ MaxResults: 5 }));
  await client.send(new DescribeInternetGatewaysCommand({ MaxResults: 5 }));
  await client.send(new DescribeRouteTablesCommand({ MaxResults: 5 }));
  await client.send(new DescribeSecurityGroupsCommand({ MaxResults: 5 }));
  await client.send(new DescribeInstancesCommand({ MaxResults: 5 }));
  await probeEc2Topology({
    send: (command) => (client as unknown as AwsImportProbeReadClient).send(command)
  });
  return "success";
}

/** gg: 데모 topology에 필요한 EIP와 NAT Gateway metadata도 첫 page만 읽습니다. */
export async function probeEc2Topology(
  client: AwsImportProbeReadClient
): Promise<AwsImportProbeOutcome> {
  try {
    await client.send(new DescribeAddressesCommand({ DryRun: true }));
  } catch (error) {
    if (errorName(error) !== "DryRunOperation") throw error;
  }
  await client.send(new DescribeNatGatewaysCommand({ MaxResults: 5 }));
  return "success";
}

/** gg: S3 production executor는 shared session client를 bounded primitive에 전달합니다. */
async function probeS3Executor(
  context: AwsImportProbeExecutorContext
): Promise<AwsImportProbeOutcome> {
  const client = bindAbortSignal(
    new S3Client({ region: context.region, credentials: context.credentials }),
    context.abortSignal
  );
  return probeS3({
    send: (command) => (client as unknown as AwsImportProbeReadClient).send(command)
  });
}

/** gg: S3는 bucket 목록 한 page와 첫 bucket의 optional 설정만 확인합니다. */
export async function probeS3(
  client: AwsImportProbeReadClient
): Promise<AwsImportProbeOutcome> {
  const listed = await client.send(new ListBucketsCommand({ MaxBuckets: 1 })) as {
    Buckets?: Array<{ Name?: string }>;
  };
  const bucket = listed.Buckets?.[0]?.Name;
  if (!bucket) return "success";
  for (const command of [
    new GetBucketLocationCommand({ Bucket: bucket }),
    new GetBucketVersioningCommand({ Bucket: bucket }),
    new GetPublicAccessBlockCommand({ Bucket: bucket }),
    new GetBucketEncryptionCommand({ Bucket: bucket }),
    new GetBucketWebsiteCommand({ Bucket: bucket }),
    new GetBucketTaggingCommand({ Bucket: bucket }),
    new GetBucketPolicyStatusCommand({ Bucket: bucket })
  ]) {
    try {
      await client.send(command);
    } catch (error) {
      if (!isMissingConfigurationError(error)) throw error;
    }
  }
  return "success";
}

/** gg: RDS query는 기본 첫 response만 요청하고 marker를 따르지 않습니다. */
async function probeRds(context: AwsImportProbeExecutorContext): Promise<AwsImportProbeOutcome> {
  await sendQuery(context, "rds", "2014-10-31", "DescribeDBInstances");
  return "success";
}

/** gg: ELBv2는 marker를 따르지 않는 첫 page만 읽습니다. */
async function probeElbv2(context: AwsImportProbeExecutorContext): Promise<AwsImportProbeOutcome> {
  const client = bindAbortSignal(
    new ElasticLoadBalancingV2Client({ region: context.region, credentials: context.credentials }),
    context.abortSignal
  );
  return probeElbv2Topology({
    send: (command) => (client as unknown as AwsImportProbeReadClient).send(command)
  });
}

/** gg: 첫 Load Balancer에 연결된 Target Group과 Listener metadata만 확인합니다. */
export async function probeElbv2Topology(
  client: AwsImportProbeReadClient
): Promise<AwsImportProbeOutcome> {
  const listed = await client.send(new DescribeLoadBalancersCommand({ PageSize: 1 })) as {
    LoadBalancers?: Array<{ LoadBalancerArn?: string }>;
  };
  const loadBalancerArn = listed.LoadBalancers?.[0]?.LoadBalancerArn;
  if (!loadBalancerArn) return "success";
  await client.send(new DescribeLoadBalancerAttributesCommand({ LoadBalancerArn: loadBalancerArn }));
  await client.send(new DescribeElbv2TagsCommand({ ResourceArns: [loadBalancerArn] }));
  const targetGroups = await client.send(new DescribeTargetGroupsCommand({
    LoadBalancerArn: loadBalancerArn,
    PageSize: 1
  })) as { TargetGroups?: Array<{ TargetGroupArn?: string }> };
  const targetGroupArn = targetGroups.TargetGroups?.[0]?.TargetGroupArn;
  if (targetGroupArn) {
    await client.send(new DescribeTargetGroupAttributesCommand({ TargetGroupArn: targetGroupArn }));
    await client.send(new DescribeElbv2TagsCommand({ ResourceArns: [targetGroupArn] }));
  }
  const listeners = await client.send(new DescribeListenersCommand({
    LoadBalancerArn: loadBalancerArn,
    PageSize: 1
  })) as { Listeners?: Array<{ ListenerArn?: string; Protocol?: string }> };
  const listener = listeners.Listeners?.[0];
  if (listener?.ListenerArn) {
    await client.send(new DescribeListenerAttributesCommand({ ListenerArn: listener.ListenerArn }));
    if (listener.Protocol === "HTTPS" || listener.Protocol === "TLS") {
      await client.send(new DescribeListenerCertificatesCommand({
        ListenerArn: listener.ListenerArn,
        PageSize: 1
      }));
    }
  }
  return "success";
}

/** gg: ECS는 첫 cluster와 첫 service만 seed로 사용하고 다음 token을 따르지 않습니다. */
async function probeEcs(context: AwsImportProbeExecutorContext): Promise<AwsImportProbeOutcome> {
  const client = bindAbortSignal(
    new ECSClient({ region: context.region, credentials: context.credentials }),
    context.abortSignal
  );
  const clusters = await client.send(new ListClustersCommand({ maxResults: 1 }));
  const cluster = clusters.clusterArns?.[0];
  if (!cluster) return "success";
  await client.send(new DescribeClustersCommand({ clusters: [cluster] }));
  const services = await client.send(new ListServicesCommand({ cluster, maxResults: 1 }));
  const service = services.serviceArns?.[0];
  if (!service) return "success";
  const described = await client.send(new DescribeServicesCommand({ cluster, services: [service] }));
  const taskDefinition = described.services?.[0]?.taskDefinition;
  if (taskDefinition) {
    await client.send(new DescribeTaskDefinitionCommand({ taskDefinition }));
  }
  return "success";
}

/** gg: CloudFront global list는 continuation marker를 따르지 않습니다. */
async function probeCloudFront(context: AwsImportProbeExecutorContext): Promise<AwsImportProbeOutcome> {
  const client = bindAbortSignal(
    new CloudFrontClient({ region: context.region, credentials: context.credentials }),
    context.abortSignal
  );
  return probeCloudFrontTopology({
    send: (command) => (client as unknown as AwsImportProbeReadClient).send(command)
  });
}

/** gg: Distribution과 첫 Origin Access Control metadata만 읽습니다. */
export async function probeCloudFrontTopology(
  client: AwsImportProbeReadClient
): Promise<AwsImportProbeOutcome> {
  const distributions = await client.send(new ListDistributionsCommand({ MaxItems: 1 })) as {
    DistributionList?: { Items?: Array<{ ARN?: string }> };
  };
  const distributionArn = distributions.DistributionList?.Items?.[0]?.ARN;
  if (distributionArn) {
    await client.send(new ListCloudFrontTagsForResourceCommand({ Resource: distributionArn }));
  }
  const listed = await client.send(new ListOriginAccessControlsCommand({ MaxItems: 1 })) as {
    OriginAccessControlList?: { Items?: Array<{ Id?: string }> };
  };
  const originAccessControlId = listed.OriginAccessControlList?.Items?.[0]?.Id;
  if (originAccessControlId) {
    await client.send(new GetOriginAccessControlCommand({ Id: originAccessControlId }));
  }
  return "success";
}

/** gg: ECR production executor는 shared session client를 bounded primitive에 전달합니다. */
async function probeEcrExecutor(
  context: AwsImportProbeExecutorContext
): Promise<AwsImportProbeOutcome> {
  const client = bindAbortSignal(
    new ECRClient({ region: context.region, credentials: context.credentials }),
    context.abortSignal
  );
  return probeEcr({
    send: (command) => (client as unknown as AwsImportProbeReadClient).send(command)
  });
}

/** gg: 첫 ECR Repository의 identity와 tag metadata만 읽습니다. */
export async function probeEcr(
  client: AwsImportProbeReadClient
): Promise<AwsImportProbeOutcome> {
  const listed = await client.send(new DescribeRepositoriesCommand({ maxResults: 1 })) as {
    repositories?: Array<{ repositoryArn?: string }>;
  };
  const repositoryArn = listed.repositories?.[0]?.repositoryArn;
  if (repositoryArn) {
    await client.send(new ListEcrTagsForResourceCommand({ resourceArn: repositoryArn }));
  }
  return "success";
}

/** gg: Secrets Manager production executor는 secret value API를 포함하지 않습니다. */
async function probeSecretsManagerExecutor(
  context: AwsImportProbeExecutorContext
): Promise<AwsImportProbeOutcome> {
  const client = bindAbortSignal(
    new SecretsManagerClient({ region: context.region, credentials: context.credentials }),
    context.abortSignal
  );
  return probeSecretsManager({
    send: (command) => (client as unknown as AwsImportProbeReadClient).send(command)
  });
}

/** gg: 첫 Secret의 이름과 설정 metadata만 읽고 실제 비밀값은 읽지 않습니다. */
export async function probeSecretsManager(
  client: AwsImportProbeReadClient
): Promise<AwsImportProbeOutcome> {
  const listed = await client.send(new ListSecretsCommand({ MaxResults: 1 })) as {
    SecretList?: Array<{ ARN?: string; Name?: string }>;
  };
  const secretId = listed.SecretList?.[0]?.ARN ?? listed.SecretList?.[0]?.Name;
  if (secretId) await client.send(new DescribeSecretCommand({ SecretId: secretId }));
  return "success";
}

/** gg: Application Auto Scaling production executor도 ECS 범위의 첫 target만 확인합니다. */
async function probeApplicationAutoScalingExecutor(
  context: AwsImportProbeExecutorContext
): Promise<AwsImportProbeOutcome> {
  const client = bindAbortSignal(
    new ApplicationAutoScalingClient({
      region: context.region,
      credentials: context.credentials
    }),
    context.abortSignal
  );
  return probeApplicationAutoScaling({
    send: (command) => (client as unknown as AwsImportProbeReadClient).send(command)
  });
}

/** gg: 첫 ECS scaling target과 연결된 policy metadata만 읽습니다. */
export async function probeApplicationAutoScaling(
  client: AwsImportProbeReadClient
): Promise<AwsImportProbeOutcome> {
  const listed = await client.send(new DescribeScalableTargetsCommand({
    ServiceNamespace: "ecs",
    MaxResults: 1
  })) as {
    ScalableTargets?: Array<{
      ResourceId?: string;
      ScalableDimension?: "ecs:service:DesiredCount";
      ServiceNamespace?: "ecs";
      ScalableTargetARN?: string;
    }>;
  };
  const target = listed.ScalableTargets?.[0];
  if (target?.ResourceId && target.ScalableDimension && target.ServiceNamespace) {
    await client.send(new DescribeScalingPoliciesCommand({
      ResourceId: target.ResourceId,
      ScalableDimension: target.ScalableDimension,
      ServiceNamespace: target.ServiceNamespace,
      MaxResults: 1
    }));
  }
  if (target?.ScalableTargetARN) {
    await client.send(new ListApplicationAutoScalingTagsForResourceCommand({
      ResourceARN: target.ScalableTargetARN
    }));
  }
  return "success";
}

/** gg: production Resource Explorer client도 exact three-call primitive만 사용합니다. */
async function probeResourceExplorerExecutor(
  context: AwsImportProbeExecutorContext
): Promise<AwsImportProbeOutcome> {
  const client = bindAbortSignal(
    new ResourceExplorer2Client({ region: context.region, credentials: context.credentials }),
    context.abortSignal
  );
  return probeResourceExplorer({ send: (command) => client.send(command as never) });
}

/** gg: Tagging API는 한 resource만 요청하고 pagination token을 따르지 않습니다. */
async function probeTagging(context: AwsImportProbeExecutorContext): Promise<AwsImportProbeOutcome> {
  const client = bindAbortSignal(
    new ResourceGroupsTaggingAPIClient({ region: context.region, credentials: context.credentials }),
    context.abortSignal
  );
  await client.send(new GetResourcesCommand({ ResourcesPerPage: 1 }));
  return "success";
}

/** gg: IAM 상세 probe는 첫 Role, Policy, Profile만 읽어 권한 범위를 제한합니다. */
async function probeIam(context: AwsImportProbeExecutorContext): Promise<AwsImportProbeOutcome> {
  const client = bindAbortSignal(
    new IAMClient({ region: context.region, credentials: context.credentials }),
    context.abortSignal
  );
  return probeIamRoleAttachments({
    send: (command) => (client as unknown as AwsImportProbeReadClient).send(command)
  });
}

/** gg: Terraform 복원에 필요한 IAM 상세와 태그를 첫 Resource에 한해 fail-closed 확인합니다. */
export async function probeIamRoleAttachments(
  client: AwsImportProbeReadClient
): Promise<AwsImportProbeOutcome> {
  const roles = await client.send(new ListRolesCommand({ MaxItems: 1 })) as {
    Roles?: Array<{ RoleName?: string }>;
  };
  const roleName = roles.Roles?.[0]?.RoleName;
  let attachedPolicyArn: string | undefined;
  if (roleName) {
    await client.send(new GetRoleCommand({ RoleName: roleName }));
    await client.send(new ListRoleTagsCommand({ RoleName: roleName, MaxItems: 1 }));
    const attachedPolicies = await client.send(new ListAttachedRolePoliciesCommand({
      RoleName: roleName,
      MaxItems: 1
    })) as { AttachedPolicies?: Array<{ PolicyArn?: string }> };
    attachedPolicyArn = attachedPolicies.AttachedPolicies?.[0]?.PolicyArn;
    const inlinePolicies = await client.send(new ListRolePoliciesCommand({
      RoleName: roleName,
      MaxItems: 1
    })) as { PolicyNames?: string[] };
    const inlinePolicyName = inlinePolicies.PolicyNames?.[0];
    if (inlinePolicyName) {
      await client.send(new GetRolePolicyCommand({
        RoleName: roleName,
        PolicyName: inlinePolicyName
      }));
    }
  }

  const listedPolicies = await client.send(new ListPoliciesCommand({
    MaxItems: 1,
    Scope: "Local"
  })) as { Policies?: Array<{ Arn?: string; DefaultVersionId?: string }> };
  const localPolicy = listedPolicies.Policies?.[0];
  const policyArn = localPolicy?.Arn ?? attachedPolicyArn;
  if (policyArn) {
    const policy = await client.send(new GetIamPolicyCommand({ PolicyArn: policyArn })) as {
      Policy?: { DefaultVersionId?: string };
    };
    const defaultVersionId = policy.Policy?.DefaultVersionId ?? localPolicy?.DefaultVersionId;
    if (defaultVersionId) {
      await client.send(new GetPolicyVersionCommand({
        PolicyArn: policyArn,
        VersionId: defaultVersionId
      }));
    }
    if (localPolicy?.Arn === policyArn) {
      await client.send(new ListPolicyTagsCommand({ PolicyArn: policyArn }));
    }
  }

  const instanceProfiles = await client.send(new ListInstanceProfilesCommand({ MaxItems: 1 })) as {
    InstanceProfiles?: Array<{ InstanceProfileName?: string }>;
  };
  const instanceProfileName = instanceProfiles.InstanceProfiles?.[0]?.InstanceProfileName;
  if (instanceProfileName) {
    await client.send(new GetInstanceProfileCommand({
      InstanceProfileName: instanceProfileName
    }));
    await client.send(new ListInstanceProfileTagsCommand({
      InstanceProfileName: instanceProfileName,
      MaxItems: 1
    }));
  }
  return "success";
}

/** gg: KMS production executor는 첫 Key 상세 probe에 같은 session을 전달합니다. */
async function probeKms(context: AwsImportProbeExecutorContext): Promise<AwsImportProbeOutcome> {
  const client = bindAbortSignal(
    new KMSClient({ region: context.region, credentials: context.credentials }),
    context.abortSignal
  );
  return probeKmsMetadata({
    send: (command) => (client as unknown as AwsImportProbeReadClient).send(command)
  });
}

/** gg: 첫 KMS Key의 복원 정보와 태그를 모두 읽되 key material은 요청하지 않습니다. */
export async function probeKmsMetadata(
  client: AwsImportProbeReadClient
): Promise<AwsImportProbeOutcome> {
  const listed = await client.send(new ListKeysCommand({ Limit: 1 })) as {
    Keys?: Array<{ KeyId?: string }>;
  };
  const keyId = listed.Keys?.[0]?.KeyId;
  if (!keyId) return "success";
  await client.send(new DescribeKeyCommand({ KeyId: keyId }));
  await client.send(new GetKeyPolicyCommand({ KeyId: keyId, PolicyName: "default" }));
  await client.send(new GetKeyRotationStatusCommand({ KeyId: keyId }));
  await client.send(new ListResourceTagsCommand({ KeyId: keyId, Limit: 1 }));
  await client.send(new ListKmsAliasesCommand({ KeyId: keyId, Limit: 1 }));
  return "success";
}

/** gg: CloudWatch Logs는 nextToken을 따르지 않는 한 건 page만 읽습니다. */
async function probeLogs(context: AwsImportProbeExecutorContext): Promise<AwsImportProbeOutcome> {
  const client = bindAbortSignal(
    new CloudWatchLogsClient({ region: context.region, credentials: context.credentials }),
    context.abortSignal
  );
  return probeLogsMetadata({
    send: (command) => (client as unknown as AwsImportProbeReadClient).send(command)
  });
}

/** gg: 첫 Log Group ARN의 tag metadata만 읽고 다음 page는 따르지 않습니다. */
export async function probeLogsMetadata(
  client: AwsImportProbeReadClient
): Promise<AwsImportProbeOutcome> {
  const listed = await client.send(new DescribeLogGroupsCommand({ limit: 1 })) as {
    logGroups?: Array<{ arn?: string; logGroupArn?: string }>;
  };
  const logGroup = listed.logGroups?.[0];
  const resourceArn = logGroup?.logGroupArn ?? logGroup?.arn?.replace(/:\*$/u, "");
  if (resourceArn) {
    await client.send(new ListLogGroupTagsForResourceCommand({ resourceArn }));
  }
  return "success";
}

/** gg: CloudWatch alarms는 한 건 page만 읽고 nextToken을 따르지 않습니다. */
async function probeCloudWatch(context: AwsImportProbeExecutorContext): Promise<AwsImportProbeOutcome> {
  const client = bindAbortSignal(
    new CloudWatchClient({ region: context.region, credentials: context.credentials }),
    context.abortSignal
  );
  return probeCloudWatchMetadata({
    send: (command) => (client as unknown as AwsImportProbeReadClient).send(command)
  });
}

/** gg: 첫 Alarm ARN의 tag metadata만 읽고 다음 page는 따르지 않습니다. */
export async function probeCloudWatchMetadata(
  client: AwsImportProbeReadClient
): Promise<AwsImportProbeOutcome> {
  const listed = await client.send(new DescribeAlarmsCommand({ MaxRecords: 1 })) as {
    CompositeAlarms?: Array<{ AlarmArn?: string }>;
    MetricAlarms?: Array<{ AlarmArn?: string }>;
  };
  const resourceArn = listed.CompositeAlarms?.[0]?.AlarmArn ??
    listed.MetricAlarms?.[0]?.AlarmArn;
  if (resourceArn) {
    await client.send(new ListCloudWatchTagsForResourceCommand({ ResourceARN: resourceArn }));
  }
  return "success";
}

/** gg: API Gateway production executor는 첫 REST API topology probe만 실행합니다. */
async function probeApiGateway(context: AwsImportProbeExecutorContext): Promise<AwsImportProbeOutcome> {
  const client = bindAbortSignal(
    new APIGatewayClient({ region: context.region, credentials: context.credentials }),
    context.abortSignal
  );
  return probeApiGatewayTopology({
    send: (command) => (client as unknown as AwsImportProbeReadClient).send(command)
  });
}

/** gg: 첫 REST API의 Resource/Method/Integration/Stage 관계를 bounded read로 확인합니다. */
export async function probeApiGatewayTopology(
  client: AwsImportProbeReadClient
): Promise<AwsImportProbeOutcome> {
  const listed = await client.send(new GetRestApisCommand({ limit: 1 })) as {
    items?: Array<{ id?: string }>;
  };
  const restApiId = listed.items?.[0]?.id;
  if (!restApiId) return "success";

  const resources = await client.send(new GetApiGatewayResourcesCommand({
    restApiId,
    limit: 1,
    embed: ["methods"]
  })) as {
    items?: Array<{ id?: string; resourceMethods?: Record<string, unknown> }>;
  };
  const resource = resources.items?.[0];
  const resourceId = resource?.id;
  const httpMethod = Object.keys(resource?.resourceMethods ?? {})[0];
  if (resourceId && httpMethod) {
    await client.send(new GetMethodCommand({
      restApiId,
      resourceId,
      httpMethod
    }));
    try {
      await client.send(new GetIntegrationCommand({
        restApiId,
        resourceId,
        httpMethod
      }));
    } catch (error) {
      if (errorName(error) !== "NotFoundException") throw error;
    }
  }
  await client.send(new GetDeploymentsCommand({ restApiId, limit: 1 }));
  await client.send(new GetStagesCommand({ restApiId }));
  await client.send(new GetAuthorizersCommand({ restApiId, limit: 1 }));
  await client.send(new GetModelsCommand({ restApiId, limit: 1 }));
  await client.send(new GetRequestValidatorsCommand({ restApiId, limit: 1 }));
  return "success";
}

/** gg: Lambda production executor는 shared session client를 bounded primitive에 전달합니다. */
async function probeLambdaExecutor(
  context: AwsImportProbeExecutorContext
): Promise<AwsImportProbeOutcome> {
  const client = bindAbortSignal(
    new LambdaClient({ region: context.region, credentials: context.credentials }),
    context.abortSignal
  );
  return probeLambda({
    send: (command) => (client as unknown as AwsImportProbeReadClient).send(command)
  });
}

/** gg: Lambda는 첫 Function의 복원 정보만 읽고 policy 부재만 정상 상태로 봅니다. */
export async function probeLambda(
  client: AwsImportProbeReadClient
): Promise<AwsImportProbeOutcome> {
  const listed = await client.send(new ListFunctionsCommand({ MaxItems: 1 })) as {
    Functions?: Array<{ FunctionName?: string; FunctionArn?: string }>;
  };
  const listedFunction = listed.Functions?.[0];
  const functionName = listedFunction?.FunctionName;
  if (!functionName) return "success";
  const functionDetail = await client.send(new GetFunctionCommand({ FunctionName: functionName })) as {
    Configuration?: { FunctionArn?: string };
  };
  try {
    await client.send(new GetPolicyCommand({ FunctionName: functionName }));
  } catch (error) {
    if (errorName(error) !== "ResourceNotFoundException") throw error;
  }
  const functionArn = listedFunction.FunctionArn ?? functionDetail.Configuration?.FunctionArn;
  if (functionArn) {
    await client.send(new ListLambdaTagsCommand({ Resource: functionArn }));
  }
  await client.send(new ListLambdaAliasesCommand({ FunctionName: functionName, MaxItems: 1 }));
  await client.send(new ListVersionsByFunctionCommand({ FunctionName: functionName, MaxItems: 1 }));
  return "success";
}

/** gg: EventBridge는 Rule 한 건과 그 Rule의 Target 한 page만 읽어 최소 권한을 검증합니다. */
async function probeEventBridgeExecutor(
  context: AwsImportProbeExecutorContext
): Promise<AwsImportProbeOutcome> {
  const client = bindAbortSignal(
    new EventBridgeClient({ region: context.region, credentials: context.credentials }),
    context.abortSignal
  );
  return probeEventBridge({
    send: (command) => (client as unknown as AwsImportProbeReadClient).send(command)
  });
}

export async function probeEventBridge(
  client: AwsImportProbeReadClient
): Promise<AwsImportProbeOutcome> {
  const listedBuses = await client.send(new ListEventBusesCommand({ Limit: 1 })) as {
    EventBuses?: Array<{ Name?: string }>;
  };
  const eventBusName = listedBuses.EventBuses?.[0]?.Name;
  const listed = await client.send(new ListRulesCommand({
    ...(eventBusName ? { EventBusName: eventBusName } : {}),
    Limit: 1
  })) as {
    Rules?: Array<{ Name?: string; EventBusName?: string; Arn?: string }>;
  };
  const rule = listed.Rules?.[0];
  if (!rule?.Name) return "success";
  await client.send(new ListTargetsByRuleCommand({
    Rule: rule.Name,
    EventBusName: rule.EventBusName,
    Limit: 1
  }));
  if (rule.Arn) {
    await client.send(new ListEventBridgeTagsForResourceCommand({ ResourceARN: rule.Arn }));
  }
  return "success";
}

/** gg: AMI는 self-owned image 첫 page만 확인합니다. */
async function probeAmi(context: AwsImportProbeExecutorContext): Promise<AwsImportProbeOutcome> {
  const client = bindAbortSignal(
    new EC2Client({ region: context.region, credentials: context.credentials }),
    context.abortSignal
  );
  await client.send(new DescribeImagesCommand({ Owners: ["self"], MaxResults: 5 }));
  return "success";
}

/** gg: RDS Query API는 shared temporary session으로 서명하고 response body를 보존하지 않습니다. */
async function sendQuery(
  context: AwsImportProbeExecutorContext,
  service: "ec2" | "rds",
  version: string,
  action: string
): Promise<void> {
  const { sendAwsQuery } = await import("../reverse-engineering/aws-reverse-engineering-query.js");
  await sendAwsQuery({
    region: context.region,
    service,
    version,
    action,
    credentials: toTerraformCredentials(context)
  }, (resource, init) => fetch(resource, { ...init, signal: context.abortSignal }));
}

/** gg: every production SDK send shares the probe deadline AbortSignal. */
function bindAbortSignal<TClient>(client: TClient, abortSignal: AbortSignal): TClient {
  return {
    send(command: object) {
      return (client as unknown as {
        send(command: object, options: { abortSignal: AbortSignal }): Promise<unknown>;
      }).send(command, { abortSignal });
    }
  } as TClient;
}

/** gg: query signer에는 같은 AssumeRole session을 환경형 credential로만 투영합니다. */
function toTerraformCredentials(context: AwsImportProbeExecutorContext): TerraformAwsCredentialEnv {
  return {
    AWS_ACCESS_KEY_ID: context.credentials.accessKeyId,
    AWS_SECRET_ACCESS_KEY: context.credentials.secretAccessKey,
    AWS_SESSION_TOKEN: context.credentials.sessionToken,
    AWS_REGION: context.region
  };
}
