import {
  GetResourcesCommand,
  ResourceGroupsTaggingAPIClient,
  type GetResourcesCommandOutput,
  type ResourceTagMapping
} from "@aws-sdk/client-resource-groups-tagging-api";
import {
  CloudFrontClient,
  ListDistributionsCommand,
  type DistributionSummary,
  type ListDistributionsCommandOutput
} from "@aws-sdk/client-cloudfront";
import {
  DescribeLoadBalancersCommand,
  ElasticLoadBalancingV2Client,
  type DescribeLoadBalancersCommandOutput,
  type LoadBalancer
} from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  IAMClient,
  ListRolesCommand,
  type ListRolesCommandOutput,
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
  LambdaClient,
  ListFunctionsCommand,
  type FunctionConfiguration,
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
import {
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
export type AwsElbReadClient = {
  send(command: object): Promise<unknown>;
};
export type AwsElbReadClientFactory = (
  region: string,
  credentials: TerraformAwsCredentialEnv
) => AwsElbReadClient;
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
      const resourceGroups = await Promise.all([
        readResourceGroup(input, "VPC", () => describeVpcs(input.region, credentials, fetchXml)),
        readResourceGroup(input, "SUBNET", () => describeSubnets(input.region, credentials, fetchXml)),
        readResourceGroup(input, "INTERNET_GATEWAY", () =>
          describeInternetGateways(input.region, credentials, fetchXml)
        ),
        readResourceGroup(input, "ROUTE_TABLE", () =>
          describeRouteTables(input.region, credentials, fetchXml)
        ),
        readResourceGroup(input, "SECURITY_GROUP", () =>
          describeSecurityGroups(input.region, credentials, fetchXml)
        ),
        readResourceGroup(input, "EC2", () => describeInstances(input.region, credentials, fetchXml)),
        readResourceGroup(input, "RDS", () => describeRdsInstances(input.region, credentials, fetchXml)),
        readResourceGroup(input, "S3", () => listBucketsWithDetails(input.region, credentials)),
        readUnknownResourceGroup(input, credentials)
      ]);

      return {
        records: resourceGroups.flatMap((group) => group.records),
        scanErrors: resourceGroups.flatMap((group) => group.scanErrors)
      };
    }
  };
}

// 리소스 한 종류가 실패해도 다른 종류의 스캔 결과는 계속 살립니다.
async function readResourceGroup(
  input: AwsProviderScanInput,
  resourceType: ResourceType,
  read: () => Promise<AwsDiscoveredResourceRecord[]>
): Promise<AwsProviderDiscoveryResult> {
  if (!shouldReadResourceGroup(input, resourceType)) {
    return { records: [], scanErrors: [] };
  }

  try {
    return { records: await read(), scanErrors: [] };
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

  try {
    return { records: await listUnknownResources(input, credentials), scanErrors: [] };
  } catch (error) {
    return {
      records: [],
      scanErrors: [toScanError("UNKNOWN", error)]
    };
  }
}

async function describeVpcs(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  fetchXml: typeof fetch
): Promise<AwsDiscoveredResourceRecord[]> {
  const xml = await sendAwsQuery({
    service: "ec2",
    region,
    action: "DescribeVpcs",
    version: "2016-11-15",
    credentials
  }, fetchXml);

  return parseVpcsFromXml(xml, region);
}

async function describeSubnets(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  fetchXml: typeof fetch
): Promise<AwsDiscoveredResourceRecord[]> {
  const xml = await sendAwsQuery({
    service: "ec2",
    region,
    action: "DescribeSubnets",
    version: "2016-11-15",
    credentials
  }, fetchXml);

  return parseSubnetsFromXml(xml, region);
}

async function describeSecurityGroups(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  fetchXml: typeof fetch
): Promise<AwsDiscoveredResourceRecord[]> {
  const xml = await sendAwsQuery({
    service: "ec2",
    region,
    action: "DescribeSecurityGroups",
    version: "2016-11-15",
    credentials
  }, fetchXml);

  return parseSecurityGroupsFromXml(xml, region);
}

async function describeInstances(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  fetchXml: typeof fetch
): Promise<AwsDiscoveredResourceRecord[]> {
  const xml = await sendAwsQuery({
    service: "ec2",
    region,
    action: "DescribeInstances",
    version: "2016-11-15",
    credentials
  }, fetchXml);

  return parseInstancesFromXml(xml, region);
}

// EC2 Query API에서 Internet Gateway 목록을 읽습니다.
async function describeInternetGateways(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  fetchXml: typeof fetch
): Promise<AwsDiscoveredResourceRecord[]> {
  const xml = await sendAwsQuery({
    service: "ec2",
    region,
    action: "DescribeInternetGateways",
    version: "2016-11-15",
    credentials
  }, fetchXml);

  return parseInternetGatewaysFromXml(xml, region);
}

// EC2 Query API에서 Route Table 목록을 읽습니다.
async function describeRouteTables(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  fetchXml: typeof fetch
): Promise<AwsDiscoveredResourceRecord[]> {
  const xml = await sendAwsQuery({
    service: "ec2",
    region,
    action: "DescribeRouteTables",
    version: "2016-11-15",
    credentials
  }, fetchXml);

  return parseRouteTablesFromXml(xml, region);
}

async function describeRdsInstances(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  fetchXml: typeof fetch
): Promise<AwsDiscoveredResourceRecord[]> {
  const xml = await sendAwsQuery({
    service: "rds",
    region,
    action: "DescribeDBInstances",
    version: "2014-10-31",
    credentials
  }, fetchXml);

  return parseRdsInstancesFromXml(xml, region);
}

// S3는 bucket 목록만으로 설정을 알 수 없어서 read-only 세부 조회를 추가로 실행합니다.
export async function listBucketsWithDetails(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  createClient: AwsS3ReadClientFactory = createDefaultS3ReadClient
): Promise<AwsDiscoveredResourceRecord[]> {
  const client = createClient(region, credentials);
  const response = await sendS3Command<ListBucketsCommandOutput>(client, new ListBucketsCommand({}));
  const bucketRecords = await Promise.all(
    (response.Buckets ?? []).map((bucket) => createS3BucketRecord(bucket.Name, bucket.CreationDate, region, client))
  );

  return bucketRecords.filter((record): record is AwsDiscoveredResourceRecord => record !== null);
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
      rawProviderData: {
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
      }
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
  createClient: AwsTaggingReadClientFactory = createDefaultTaggingReadClient
): Promise<AwsDiscoveredResourceRecord[]> {
  const client = createClient(region, credentials);
  const records: AwsDiscoveredResourceRecord[] = [];
  let paginationToken: string | undefined;

  do {
    const response = await sendTaggingCommand<GetResourcesCommandOutput>(
      client,
      new GetResourcesCommand({ PaginationToken: paginationToken })
    );

    records.push(...(response.ResourceTagMappingList ?? []).flatMap((resource) =>
      toUnknownTaggedResourceRecord(resource, region)
    ));
    paginationToken = response.PaginationToken && response.PaginationToken.length > 0
      ? response.PaginationToken
      : undefined;
  } while (paginationToken);

  return records;
}

// 지금 정식 지원하지 않는 AWS 리소스도 숨기지 않기 위해 여러 read-only 조회 결과를 UNKNOWN으로 모읍니다.
async function listUnknownResources(
  input: AwsProviderScanInput,
  credentials: TerraformAwsCredentialEnv
): Promise<AwsDiscoveredResourceRecord[]> {
  const reads: Array<Promise<AwsDiscoveredResourceRecord[]>> = [];

  if (input.resourceTypes.includes("ALL") || input.resourceTypes.includes("UNKNOWN")) {
    reads.push(
      listTaggedUnknownResources(input.region, credentials),
      listApplicationLoadBalancersAsUnknown(input.region, credentials),
      listCloudFrontDistributionsAsUnknown(input.region, credentials),
      listIamRolesAsUnknown(input.region, credentials),
      listKmsKeysAsUnknown(input.region, credentials),
      listCloudWatchLogGroupsAsUnknown(input.region, credentials),
      listApiGatewayRestApisAsUnknown(input.region, credentials)
    );
  }

  if (input.resourceTypes.includes("CLOUDFRONT")) {
    reads.push(listCloudFrontDistributionsAsUnknown(input.region, credentials));
  }

  if (input.resourceTypes.includes("IAM_ROLE")) {
    reads.push(listIamRolesAsUnknown(input.region, credentials));
  }

  if (input.resourceTypes.includes("KMS_KEY")) {
    reads.push(listKmsKeysAsUnknown(input.region, credentials));
  }

  if (input.resourceTypes.includes("CLOUDWATCH_LOG_GROUP")) {
    reads.push(listCloudWatchLogGroupsAsUnknown(input.region, credentials));
  }

  if (input.resourceTypes.includes("API_GATEWAY_REST_API")) {
    reads.push(listApiGatewayRestApisAsUnknown(input.region, credentials));
  }

  if (
    input.resourceTypes.includes("ALL") ||
    input.resourceTypes.includes("UNKNOWN") ||
    input.resourceTypes.includes("LAMBDA")
  ) {
    reads.push(listLambdaFunctionsAsUnknown(input.region, credentials));
  }

  const unknownGroups = await Promise.all(reads);

  return uniqueDiscoveredRecordsByProviderId(unknownGroups.flat());
}

// ALB는 태그가 없어도 자주 쓰이기 때문에 ELBv2 API로 직접 읽어 UNKNOWN 후보로 남깁니다.
export async function listApplicationLoadBalancersAsUnknown(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  createClient: AwsElbReadClientFactory = createDefaultElbReadClient
): Promise<AwsDiscoveredResourceRecord[]> {
  const client = createClient(region, credentials);
  const records: AwsDiscoveredResourceRecord[] = [];
  let marker: string | undefined;

  do {
    const response = await sendElbCommand<DescribeLoadBalancersCommandOutput>(
      client,
      new DescribeLoadBalancersCommand({ Marker: marker })
    );

    records.push(...(response.LoadBalancers ?? []).flatMap((loadBalancer) =>
      toUnknownLoadBalancerRecord(loadBalancer, region)
    ));
    marker = response.NextMarker && response.NextMarker.length > 0 ? response.NextMarker : undefined;
  } while (marker);

  return records;
}

// Lambda도 태그 없이 쓰이는 경우가 많아서 ListFunctions 결과를 UNKNOWN 후보로 남깁니다.
export async function listLambdaFunctionsAsUnknown(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  createClient: AwsLambdaReadClientFactory = createDefaultLambdaReadClient
): Promise<AwsDiscoveredResourceRecord[]> {
  const client = createClient(region, credentials);
  const records: AwsDiscoveredResourceRecord[] = [];
  let marker: string | undefined;

  do {
    const response = await sendLambdaCommand<ListFunctionsCommandOutput>(
      client,
      new ListFunctionsCommand({ Marker: marker })
    );

    records.push(...(response.Functions ?? []).flatMap((lambdaFunction) =>
      toUnknownLambdaFunctionRecord(lambdaFunction, region)
    ));
    marker = response.NextMarker && response.NextMarker.length > 0 ? response.NextMarker : undefined;
  } while (marker);

  return records;
}

export async function listCloudFrontDistributionsAsUnknown(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  createClient: AwsCloudFrontReadClientFactory = createDefaultCloudFrontReadClient
): Promise<AwsDiscoveredResourceRecord[]> {
  const client = createClient(region, credentials);
  const records: AwsDiscoveredResourceRecord[] = [];
  let marker: string | undefined;

  do {
    const response = await sendCloudFrontCommand<ListDistributionsCommandOutput>(
      client,
      new ListDistributionsCommand({ Marker: marker })
    );

    records.push(...(response.DistributionList?.Items ?? []).flatMap(toUnknownCloudFrontDistributionRecord));
    marker = response.DistributionList?.NextMarker;
  } while (marker);

  return records;
}

export async function listIamRolesAsUnknown(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  createClient: AwsIamReadClientFactory = createDefaultIamReadClient
): Promise<AwsDiscoveredResourceRecord[]> {
  const client = createClient(region, credentials);
  const records: AwsDiscoveredResourceRecord[] = [];
  let marker: string | undefined;

  do {
    const response = await sendIamCommand<ListRolesCommandOutput>(
      client,
      new ListRolesCommand({ Marker: marker })
    );

    records.push(...(response.Roles ?? []).flatMap((role) => toUnknownIamRoleRecord(role, region)));
    marker = response.Marker;
  } while (marker);

  return records;
}

export async function listKmsKeysAsUnknown(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  createClient: AwsKmsReadClientFactory = createDefaultKmsReadClient
): Promise<AwsDiscoveredResourceRecord[]> {
  const client = createClient(region, credentials);
  const records: AwsDiscoveredResourceRecord[] = [];
  let marker: string | undefined;

  do {
    const response = await sendKmsCommand<ListKeysCommandOutput>(
      client,
      new ListKeysCommand({ Marker: marker })
    );
    const keyRecords = await Promise.all(
      (response.Keys ?? []).map((key) => createKmsKeyRecord(key.KeyId, key.KeyArn, region, client))
    );

    records.push(...keyRecords.filter((record): record is AwsDiscoveredResourceRecord => record !== null));
    marker = response.NextMarker;
  } while (marker);

  return records;
}

export async function listCloudWatchLogGroupsAsUnknown(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  createClient: AwsCloudWatchLogsReadClientFactory = createDefaultCloudWatchLogsReadClient
): Promise<AwsDiscoveredResourceRecord[]> {
  const client = createClient(region, credentials);
  const records: AwsDiscoveredResourceRecord[] = [];
  let nextToken: string | undefined;

  do {
    const response = await sendCloudWatchLogsCommand<DescribeLogGroupsCommandOutput>(
      client,
      new DescribeLogGroupsCommand({ nextToken })
    );

    records.push(...(response.logGroups ?? []).flatMap((logGroup) => toUnknownLogGroupRecord(logGroup, region)));
    nextToken = response.nextToken;
  } while (nextToken);

  return records;
}

export async function listApiGatewayRestApisAsUnknown(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  createClient: AwsApiGatewayReadClientFactory = createDefaultApiGatewayReadClient
): Promise<AwsDiscoveredResourceRecord[]> {
  const client = createClient(region, credentials);
  const records: AwsDiscoveredResourceRecord[] = [];
  let position: string | undefined;

  do {
    const response = await sendApiGatewayCommand<GetRestApisCommandOutput>(
      client,
      new GetRestApisCommand({ position })
    );

    records.push(...(response.items ?? []).flatMap((restApi) => toUnknownRestApiRecord(restApi, region)));
    position = response.position;
  } while (position);

  return records;
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

async function sendTaggingCommand<TOutput>(
  client: AwsTaggingReadClient,
  command: object
): Promise<TOutput> {
  return (await client.send(command)) as TOutput;
}

async function sendElbCommand<TOutput>(client: AwsElbReadClient, command: object): Promise<TOutput> {
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

function toUnknownLoadBalancerRecord(
  loadBalancer: LoadBalancer,
  fallbackRegion: string
): AwsDiscoveredResourceRecord[] {
  const arn = loadBalancer.LoadBalancerArn;

  if (!arn) {
    return [];
  }

  const vpcId = loadBalancer.VpcId;
  const securityGroupIds = loadBalancer.SecurityGroups ?? [];
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
        availabilityZones: loadBalancer.AvailabilityZones,
        canonicalHostedZoneId: loadBalancer.CanonicalHostedZoneId,
        createdTime: loadBalancer.CreatedTime?.toISOString(),
        customerOwnedIpv4Pool: loadBalancer.CustomerOwnedIpv4Pool,
        dnsName: loadBalancer.DNSName,
        ipAddressType: loadBalancer.IpAddressType,
        name: loadBalancer.LoadBalancerName,
        rawProviderData: loadBalancer,
        scheme: loadBalancer.Scheme,
        securityGroupIds,
        state: loadBalancer.State,
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
      displayName: lambdaFunction.FunctionName ?? arn,
      region: parseAwsArn(arn).region || fallbackRegion,
      config: {
        architectures: lambdaFunction.Architectures,
        codeSha256: lambdaFunction.CodeSha256,
        codeSize: lambdaFunction.CodeSize,
        description: lambdaFunction.Description,
        ephemeralStorage: lambdaFunction.EphemeralStorage,
        functionArn: arn,
        functionName: lambdaFunction.FunctionName,
        handler: lambdaFunction.Handler,
        kmsKeyArn: lambdaFunction.KMSKeyArn,
        lastModified: lambdaFunction.LastModified,
        lastUpdateStatus: lambdaFunction.LastUpdateStatus,
        layers: lambdaFunction.Layers,
        memorySize: lambdaFunction.MemorySize,
        packageType: lambdaFunction.PackageType,
        rawProviderData: lambdaFunction,
        role: lambdaFunction.Role,
        runtime: lambdaFunction.Runtime,
        signingJobArn: lambdaFunction.SigningJobArn,
        signingProfileVersionArn: lambdaFunction.SigningProfileVersionArn,
        state: lambdaFunction.State,
        stateReason: lambdaFunction.StateReason,
        subnetIds,
        timeout: lambdaFunction.Timeout,
        tracingConfig: lambdaFunction.TracingConfig,
        version: lambdaFunction.Version,
        vpcConfig: lambdaFunction.VpcConfig,
        vpcId
      },
      relationships
    }
  ];
}

function toUnknownCloudFrontDistributionRecord(
  distribution: DistributionSummary
): AwsDiscoveredResourceRecord[] {
  const arn = distribution.ARN;

  if (!arn) {
    return [];
  }

  return [
    {
      providerResourceType: "AWS::CloudFront::Distribution",
      providerResourceId: arn,
      displayName: distribution.DomainName ?? distribution.Id ?? arn,
      region: "global",
      config: {
        arn,
        comment: distribution.Comment,
        domainName: distribution.DomainName,
        enabled: distribution.Enabled,
        id: distribution.Id,
        rawProviderData: distribution,
        status: distribution.Status
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
      displayName: role.RoleName ?? arn,
      region: "global",
      config: {
        arn,
        assumeRolePolicyDocument: role.AssumeRolePolicyDocument,
        createdAt: role.CreateDate?.toISOString(),
        description: role.Description,
        maxSessionDuration: role.MaxSessionDuration,
        path: role.Path,
        permissionsBoundary: role.PermissionsBoundary,
        rawProviderData: role,
        roleId: role.RoleId,
        roleLastUsed: role.RoleLastUsed,
        roleName: role.RoleName,
        scanRegion: fallbackRegion,
        tags: role.Tags
      },
      relationships: []
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
      rawProviderData: keyMetadata ?? { KeyId: fallbackKeyId, KeyArn: fallbackKeyArn },
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
        rawProviderData: logGroup,
        retentionInDays: logGroup.retentionInDays,
        storedBytes: logGroup.storedBytes
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
        name: restApi.name,
        rawProviderData: restApi,
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
        rawProviderData: resource,
        service: arnParts.service,
        tags
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

function uniqueDiscoveredRecordsByProviderId(
  records: AwsDiscoveredResourceRecord[]
): AwsDiscoveredResourceRecord[] {
  const seenProviderResourceIds = new Set<string>();

  return records.filter((record) => {
    if (seenProviderResourceIds.has(record.providerResourceId)) {
      return false;
    }

    seenProviderResourceIds.add(record.providerResourceId);
    return true;
  });
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

// `ALL`은 화면 선택값일 뿐 실제 AWS 리소스가 아니어서, 각 지원 리소스 조회로 풀어서 처리합니다.
export function shouldReadResourceGroup(input: AwsProviderScanInput, resourceType: ResourceType): boolean {
  return input.resourceTypes.includes("ALL") || input.resourceTypes.includes(resourceType);
}

export function shouldReadUnknownResourceGroup(input: AwsProviderScanInput): boolean {
  return (
    input.resourceTypes.includes("ALL") ||
    input.resourceTypes.includes("UNKNOWN") ||
    input.resourceTypes.includes("LAMBDA") ||
    input.resourceTypes.includes("CLOUDFRONT") ||
    input.resourceTypes.includes("IAM_ROLE") ||
    input.resourceTypes.includes("KMS_KEY") ||
    input.resourceTypes.includes("CLOUDWATCH_LOG_GROUP") ||
    input.resourceTypes.includes("API_GATEWAY_REST_API")
  );
}

// 화면과 로그에 AWS 계정 ID가 그대로 나가지 않도록 12자리 계정 번호를 가립니다.
export function maskReverseEngineeringSensitiveText(text: string): string {
  return text.replace(/\b(\d{4})\d{8}\b/g, "$1********");
}

// AWS 오류 메시지를 화면에 보여줄 수 있는 scanErrors reason으로 줄입니다.
function toScanError(resourceType: ResourceType, error: unknown): ReverseEngineeringScanError {
  const message = maskReverseEngineeringSensitiveText(
    error instanceof Error ? error.message : "AWS 리소스를 읽지 못했습니다."
  );
  const reason = classifyScanErrorReason(message);

  return {
    id: `scan-error-${resourceType.toLowerCase()}`,
    resourceType,
    stage: "provider_api",
    reason,
    message,
    retryable: reason === "throttled" || reason === "provider_error"
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
