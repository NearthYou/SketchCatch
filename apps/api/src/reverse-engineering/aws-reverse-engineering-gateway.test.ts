import assert from "node:assert/strict";
import test from "node:test";
import { GetRestApisCommand } from "@aws-sdk/client-api-gateway";
import { DescribeImagesCommand } from "@aws-sdk/client-ec2";
import { DescribeLoadBalancersCommand } from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  GetDistributionConfigCommand,
  ListDistributionsCommand,
  ListTagsForResourceCommand as ListCloudFrontTagsForResourceCommand
} from "@aws-sdk/client-cloudfront";
import {
  DescribeAlarmsCommand,
  ListTagsForResourceCommand as ListCloudWatchTagsForResourceCommand
} from "@aws-sdk/client-cloudwatch";
import {
  DescribeLogGroupsCommand,
  ListTagsForResourceCommand as ListLogGroupTagsForResourceCommand
} from "@aws-sdk/client-cloudwatch-logs";
import {
  GetBucketEncryptionCommand,
  GetBucketPolicyCommand,
  GetBucketTaggingCommand,
  GetBucketVersioningCommand,
  GetBucketWebsiteCommand,
  GetPublicAccessBlockCommand,
  ListObjectsV2Command,
  ListBucketsCommand
} from "@aws-sdk/client-s3";
import {
  GetDefaultViewCommand,
  GetViewCommand,
  SearchCommand
} from "@aws-sdk/client-resource-explorer-2";
import {
  DescribeClustersCommand,
  DescribeServicesCommand,
  DescribeTaskDefinitionCommand,
  ListClustersCommand,
  ListServicesCommand
} from "@aws-sdk/client-ecs";
import { ListRolesCommand } from "@aws-sdk/client-iam";
import { GetPolicyCommand, ListFunctionsCommand } from "@aws-sdk/client-lambda";
import type { AwsConnection, ReverseEngineeringScanResult } from "@sketchcatch/types";
import { reverseEngineeringAwsResourceCatalog } from "@sketchcatch/types/resource-definitions";
import type { TerraformAwsCredentialEnv } from "../aws-connections/aws-connection-runtime-credentials.js";
import {
  createAwsProviderAdapter,
  type AwsDiscoveredResourceRecord,
  type AwsProviderScanInput
} from "./aws-provider-adapter.js";
import { sendAwsQuery } from "./aws-reverse-engineering-query.js";
import {
  collectAwsPages,
  createAwsReverseEngineeringGateway,
  createAwsReverseEngineeringReaderPlan,
  deduplicateReverseEngineeringScanErrors,
  describeAddresses,
  describeInstances,
  describeInternetGateways,
  describeNatGateways,
  describeRdsInstances,
  describeRouteTables,
  describeSecurityGroups,
  describeSubnets,
  describeVpcs,
  filterGenericSelectedFallback,
  getAwsCloudControlProviderResourceTypes,
  isReverseEngineeringPromotedResourceArn,
  listAmiImagesAsUnknown,
  listApplicationLoadBalancers,
  listBucketsWithDetails,
  listCloudFrontDistributions,
  listCloudWatchLogGroupsAsUnknown,
  listCloudWatchMetricAlarmsAsUnknown,
  listIamRolesAsUnknown,
  listApiGatewayRestApisAsUnknown,
  listLambdaFunctionsAsUnknown,
  listLambdaPermissionsAsUnknown,
  listTaggedUnknownResources,
  readEcsResourcesWithDiagnostics,
  readResourceExplorerResourcesWithDiagnostics,
  resolveCloudFrontOriginRelationships,
  resolveDeploymentSupportRelationships,
  resolveNatGatewayElasticIpRelationships,
  shouldReadResourceGroup,
  shouldReadUnknownResourceGroup,
  uniqueDiscoveredRecordsByProviderId
} from "./aws-reverse-engineering-gateway.js";
import {
  parseAwsQueryPaginationToken,
  parseRouteTablesFromXml,
  parseSubnetsFromXml
} from "./aws-reverse-engineering-parsers.js";

const credentials: TerraformAwsCredentialEnv = {
  AWS_ACCESS_KEY_ID: "fixture-access-key",
  AWS_SECRET_ACCESS_KEY: "fixture-secret-key",
  AWS_REGION: "ap-northeast-2"
};

async function scanGatewayRecords(
  records: AwsDiscoveredResourceRecord[],
  resourceTypes: AwsProviderScanInput["resourceTypes"] = ["ALL"]
): Promise<ReverseEngineeringScanResult> {
  return createAwsProviderAdapter({
    async discoverResources() {
      return records;
    }
  }).scan({ provider: "aws", region: "ap-northeast-2", resourceTypes });
}

function safeRecord(
  providerResourceType: string,
  providerResourceId: string,
  displayName: string
): AwsDiscoveredResourceRecord {
  return {
    providerResourceType,
    providerResourceId,
    displayName,
    region: "ap-northeast-2",
    config: {},
    relationships: []
  };
}

function assertSerializedValuesAbsent(value: unknown, forbiddenValues: readonly string[]): void {
  const serialized = JSON.stringify(value);

  for (const forbiddenValue of forbiddenValues) {
    assert.equal(
      serialized.includes(forbiddenValue),
      false,
      `public Reverse Engineering result must not contain ${forbiddenValue}`
    );
  }
}

function scanInput(resourceTypes: AwsProviderScanInput["resourceTypes"]): AwsProviderScanInput {
  return { provider: "aws", region: "ap-northeast-2", resourceTypes };
}

const awsQueryReaderScenarios = [
  { name: "VPC", kind: "vpc", idPrefix: "vpc", requestToken: "NextToken", read: describeVpcs },
  {
    name: "Subnet",
    kind: "subnet",
    idPrefix: "subnet",
    requestToken: "NextToken",
    read: describeSubnets
  },
  {
    name: "Elastic IP",
    kind: "address",
    idPrefix: "eipalloc",
    requestToken: "NextToken",
    read: describeAddresses
  },
  {
    name: "NAT Gateway",
    kind: "nat_gateway",
    idPrefix: "nat",
    requestToken: "NextToken",
    read: describeNatGateways
  },
  {
    name: "Internet Gateway",
    kind: "internet_gateway",
    idPrefix: "igw",
    requestToken: "NextToken",
    read: describeInternetGateways
  },
  {
    name: "Route Table",
    kind: "route_table",
    idPrefix: "rtb",
    requestToken: "NextToken",
    read: describeRouteTables
  },
  {
    name: "Security Group",
    kind: "security_group",
    idPrefix: "sg",
    requestToken: "NextToken",
    read: describeSecurityGroups
  },
  {
    name: "EC2 Instance",
    kind: "instance",
    idPrefix: "i",
    requestToken: "NextToken",
    read: describeInstances
  },
  {
    name: "RDS DB Instance",
    kind: "rds",
    idPrefix: "database",
    requestToken: "Marker",
    read: describeRdsInstances
  }
] as const;

function createAwsQueryPageXml(
  kind: (typeof awsQueryReaderScenarios)[number]["kind"],
  id: string,
  nextToken: string | undefined
): string {
  const token =
    nextToken === undefined
      ? ""
      : kind === "rds"
        ? `<Marker>${escapeXml(nextToken)}</Marker>`
        : `<nextToken>${escapeXml(nextToken)}</nextToken>`;
  switch (kind) {
    case "vpc":
      return `<DescribeVpcsResponse><vpcSet><item><vpcId>${id}</vpcId></item></vpcSet>${token}</DescribeVpcsResponse>`;
    case "subnet":
      return `<DescribeSubnetsResponse><subnetSet><item><subnetId>${id}</subnetId></item></subnetSet>${token}</DescribeSubnetsResponse>`;
    case "address":
      return `<DescribeAddressesResponse><addressesSet><item><allocationId>${id}</allocationId><domain>vpc</domain><publicIp>203.0.113.10</publicIp></item></addressesSet>${token}</DescribeAddressesResponse>`;
    case "nat_gateway":
      return `<DescribeNatGatewaysResponse><natGatewaySet><item><natGatewayId>${id}</natGatewayId><subnetId>subnet-reader</subnetId><state>available</state><connectivityType>private</connectivityType></item></natGatewaySet>${token}</DescribeNatGatewaysResponse>`;
    case "internet_gateway":
      return `<DescribeInternetGatewaysResponse><internetGatewaySet><item><internetGatewayId>${id}</internetGatewayId></item></internetGatewaySet>${token}</DescribeInternetGatewaysResponse>`;
    case "route_table":
      return `<DescribeRouteTablesResponse><routeTableSet><item><routeTableId>${id}</routeTableId></item></routeTableSet>${token}</DescribeRouteTablesResponse>`;
    case "security_group":
      return `<DescribeSecurityGroupsResponse><securityGroupInfo><item><groupId>${id}</groupId></item></securityGroupInfo>${token}</DescribeSecurityGroupsResponse>`;
    case "instance":
      return `<DescribeInstancesResponse><reservationSet><item><instancesSet><item><instanceId>${id}</instanceId></item></instancesSet></item></reservationSet>${token}</DescribeInstancesResponse>`;
    case "rds":
      return `<DescribeDBInstancesResponse><DescribeDBInstancesResult><DBInstances><DBInstance><DBInstanceIdentifier>${id}</DBInstanceIdentifier></DBInstance></DBInstances>${token}</DescribeDBInstancesResult></DescribeDBInstancesResponse>`;
  }
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

test("later page failure preserves prior items and exposes only a safe outcome", async () => {
  const result = await collectAwsPages(async (token) => {
    if (token === undefined) {
      return { items: [{ id: "first-page" }], nextToken: "page-2" };
    }
    throw new Error(
      "InternalServerException RequestId private-request-id " +
        "arn:aws:iam::123456789012:role/private"
    );
  });

  assert.deepEqual(result.items, [{ id: "first-page" }]);
  assert.equal(result.failure?.outcome, "transient");
  assert.doesNotMatch(
    JSON.stringify(result.failure),
    /RequestId|private-request-id|arn:aws|123456789012|AccessDenied/iu
  );
});

test("Lambda 함수는 환경 비밀값과 실행 Role ARN 없이 안전한 설정만 남긴다", async () => {
  const functionArn = "arn:aws:lambda:ap-northeast-2:123456789012:function:orders-handler";
  const secretToken = "synthetic-api-token-do-not-store";
  const roleArn = "arn:aws:iam::123456789012:role/synthetic-lambda-role";
  const kmsKeyArn = "arn:aws:kms:ap-northeast-2:123456789012:key/synthetic-key";
  const layerArn = "arn:aws:lambda:ap-northeast-2:123456789012:layer:synthetic-layer:1";
  const [record] = await listLambdaFunctionsAsUnknown("ap-northeast-2", credentials, () => ({
    async send(command) {
      assert.ok(command instanceof ListFunctionsCommand);
      return {
        Functions: [
          {
            FunctionName: "orders-handler",
            FunctionArn: functionArn,
            Runtime: "nodejs22.x",
            Handler: "index.handler",
            MemorySize: 512,
            Timeout: 30,
            Role: roleArn,
            KMSKeyArn: kmsKeyArn,
            Layers: [{ Arn: layerArn, CodeSize: 10 }],
            Environment: { Variables: { API_TOKEN: secretToken } },
            VpcConfig: {
              VpcId: "vpc-safe",
              SubnetIds: ["subnet-safe"],
              SecurityGroupIds: ["sg-safe"]
            }
          }
        ]
      };
    }
  }));

  assert.ok(record);
  assert.equal(record.config["functionName"], "orders-handler");
  assert.equal(record.config["runtime"], "nodejs22.x");
  assert.deepEqual(record.config["subnetIds"], ["subnet-safe"]);
  assert.deepEqual(record.relationships, [
    { type: "depends_on", targetProviderResourceId: "vpc-safe" },
    { type: "attached_to", targetProviderResourceId: "subnet-safe" },
    { type: "attached_to", targetProviderResourceId: "sg-safe" }
  ]);
  assertSerializedValuesAbsent(record.config, [
    secretToken,
    roleArn,
    kmsKeyArn,
    layerArn,
    "API_TOKEN",
    "providerParameters"
  ]);

  const result = await scanGatewayRecords([
    record,
    safeRecord("AWS::EC2::VPC", "vpc-safe", "VPC"),
    safeRecord("AWS::EC2::Subnet", "subnet-safe", "Subnet"),
    safeRecord("AWS::EC2::SecurityGroup", "sg-safe", "Security Group")
  ]);
  assertSerializedValuesAbsent(
    { architectureJson: result.architectureJson, discoveredResources: result.discoveredResources },
    [functionArn, secretToken, roleArn, kmsKeyArn, layerArn, "API_TOKEN", "providerParameters"]
  );
});

test("Lambda permission은 AWS Action과 Principal과 Policy JSON 대신 안전한 요약만 남긴다", async () => {
  const functionArn = "arn:aws:lambda:ap-northeast-2:123456789012:function:orders-handler";
  const principalArn = "arn:aws:iam::123456789012:role/synthetic-invoker";
  const awsAction = "lambda:InvokeFunction";
  const policy = JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "SyntheticPermission",
        Effect: "Allow",
        Action: awsAction,
        Principal: { AWS: principalArn },
        Resource: functionArn,
        Condition: { ArnLike: { "AWS:SourceArn": "arn:aws:execute-api:region:account:api" } }
      }
    ]
  });
  const lambdaFunction = { FunctionName: "orders-handler", FunctionArn: functionArn };
  const records = await listLambdaPermissionsAsUnknown("ap-northeast-2", credentials, () => ({
    async send(command) {
      if (command instanceof ListFunctionsCommand) {
        return { Functions: [lambdaFunction] };
      }
      assert.ok(command instanceof GetPolicyCommand);
      return { Policy: policy };
    }
  }));

  assert.equal(records.length, 1);
  assert.equal(records[0]?.config["effect"], "allow");
  assert.equal(records[0]?.config["hasCondition"], true);
  assert.deepEqual(Object.keys(records[0]?.config ?? {}).sort(), [
    "effect",
    "functionName",
    "hasCondition",
    "permissionIndex"
  ]);
  assertSerializedValuesAbsent(records[0]?.config, [
    awsAction,
    principalArn,
    functionArn,
    policy,
    "providerParameters"
  ]);

  const functionRecords = await listLambdaFunctionsAsUnknown("ap-northeast-2", credentials, () => ({
    async send() {
      return { Functions: [lambdaFunction] };
    }
  }));
  const result = await scanGatewayRecords([...functionRecords, ...records]);
  assert.equal(result.discoveredResources[1]?.relationships?.length, 1);
  assert.equal(result.architectureJson.edges.length, 1);
  assertSerializedValuesAbsent(
    { architectureJson: result.architectureJson, discoveredResources: result.discoveredResources },
    [functionArn, awsAction, principalArn, policy]
  );
});

test("IAM Role은 trust policy와 ARN 대신 연결에 필요한 안전한 요약만 남긴다", async () => {
  const roleArn = "arn:aws:iam::123456789012:role/synthetic-role";
  const principalArn = "arn:aws:iam::210987654321:root";
  const boundaryArn = "arn:aws:iam::123456789012:policy/synthetic-boundary";
  const trustPolicy = encodeURIComponent(
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [{ Effect: "Allow", Action: "sts:AssumeRole", Principal: { AWS: principalArn } }]
    })
  );
  const [record] = await listIamRolesAsUnknown("ap-northeast-2", credentials, () => ({
    async send(command) {
      assert.ok(command instanceof ListRolesCommand);
      return {
        Roles: [
          {
            Path: "/service-role/",
            RoleName: "synthetic-role",
            RoleId: "SYNTHETICROLEID",
            Arn: roleArn,
            CreateDate: new Date("2026-01-01T00:00:00.000Z"),
            AssumeRolePolicyDocument: trustPolicy,
            PermissionsBoundary: {
              PermissionsBoundaryType: "Policy",
              PermissionsBoundaryArn: boundaryArn
            },
            Tags: [{ Key: "API_TOKEN", Value: "synthetic-tag-secret" }]
          }
        ]
      };
    }
  }));

  assert.ok(record);
  assert.equal(record.config["roleName"], "synthetic-role");
  assert.equal(record.config["hasTrustPolicy"], true);
  assert.equal(record.config["hasPermissionsBoundary"], true);
  assertSerializedValuesAbsent(record.config, [
    trustPolicy,
    roleArn,
    principalArn,
    boundaryArn,
    "sts:AssumeRole",
    "AssumeRolePolicyDocument",
    "API_TOKEN",
    "synthetic-tag-secret",
    "providerParameters"
  ]);

  const result = await scanGatewayRecords([record]);
  assertSerializedValuesAbsent(result.discoveredResources, [
    trustPolicy,
    roleArn,
    principalArn,
    boundaryArn,
    "sts:AssumeRole",
    "AssumeRolePolicyDocument",
    "API_TOKEN",
    "synthetic-tag-secret",
    "providerParameters"
  ]);
});

test("page failure classification uses SDK error name and code without exposing either error", async () => {
  for (const error of [
    Object.assign(new Error("generic provider failure"), { name: "AccessDeniedException" }),
    Object.assign(new Error("generic provider failure"), { code: "ExpiredToken" })
  ]) {
    const result = await collectAwsPages(async () => {
      throw error;
    });

    assert.equal(
      result.failure?.outcome,
      "code" in error ? "expired_credential" : "permission_denied"
    );
    assert.deepEqual(Object.keys(result.failure ?? {}), ["outcome"]);
  }
});

test("page collector stops a repeated token with accumulated items and one safe transient failure", async () => {
  let calls = 0;
  const result = await collectAwsPages(async () => {
    calls += 1;
    if (calls > 2) throw new Error("collector did not stop the repeated private-token");
    return { items: [{ page: calls }], nextToken: "private-repeated-token" };
  });

  assert.equal(calls, 2);
  assert.deepEqual(result.items, [{ page: 1 }, { page: 2 }]);
  assert.deepEqual(result.failure, { outcome: "transient" });
  assert.doesNotMatch(JSON.stringify(result.failure), /private-repeated-token/iu);
});

test("AWS Query signs only allowlisted pagination parameters and encodes opaque tokens", async () => {
  let body = "";
  let fetchCalls = 0;
  const fetchXml = (async (_url: string | URL | Request, init?: RequestInit) => {
    fetchCalls += 1;
    body = String(init?.body ?? "");
    return new Response("<DescribeVpcsResponse />", { status: 200 });
  }) as typeof fetch;

  await sendAwsQuery(
    {
      service: "ec2",
      region: "ap-northeast-2",
      action: "DescribeVpcs",
      version: "2016-11-15",
      credentials,
      parameters: { NextToken: "opaque +/&= token" }
    } as never,
    fetchXml
  );

  const parameters = new URLSearchParams(body);
  assert.equal(parameters.get("Action"), "DescribeVpcs");
  assert.equal(parameters.get("Version"), "2016-11-15");
  assert.equal(parameters.get("NextToken"), "opaque +/&= token");

  await assert.rejects(
    sendAwsQuery(
      {
        service: "ec2",
        region: "ap-northeast-2",
        action: "DescribeVpcs",
        version: "2016-11-15",
        credentials,
        parameters: { Action: "DeleteEverything" }
      } as never,
      fetchXml
    ),
    /pagination parameter/iu
  );
  assert.equal(fetchCalls, 1);
});

test("AWS Query parses EC2 nextToken and RDS Marker without retaining response XML", () => {
  assert.equal(
    parseAwsQueryPaginationToken(
      "<DescribeVpcsResponse><nextToken>opaque&amp;token</nextToken></DescribeVpcsResponse>",
      "nextToken"
    ),
    "opaque&token"
  );
  assert.equal(
    parseAwsQueryPaginationToken(
      "<DescribeDBInstancesResponse><Marker>rds-marker</Marker></DescribeDBInstancesResponse>",
      "Marker"
    ),
    "rds-marker"
  );
  assert.equal(parseAwsQueryPaginationToken("<DescribeVpcsResponse />", "nextToken"), undefined);
});

test("NAT Gateway 직접 선택은 NAT와 같은 scan의 Subnet/EIP만 dependency로 읽는다", () => {
  const natInput = scanInput(["NAT_GATEWAY"]);

  assert.equal(shouldReadResourceGroup(natInput, "NAT_GATEWAY"), true);
  assert.equal(shouldReadResourceGroup(natInput, "SUBNET"), true);
  assert.equal(shouldReadResourceGroup(natInput, "ELASTIC_IP"), true);
  assert.equal(shouldReadResourceGroup(natInput, "VPC"), false);
  assert.equal(shouldReadResourceGroup(natInput, "ROUTE_TABLE"), false);

  const eipInput = scanInput(["ELASTIC_IP"]);
  assert.equal(shouldReadResourceGroup(eipInput, "ELASTIC_IP"), true);
  assert.equal(shouldReadResourceGroup(eipInput, "NAT_GATEWAY"), false);
  assert.equal(shouldReadResourceGroup(eipInput, "SUBNET"), false);

  const allInput = scanInput(["ALL"]);
  assert.equal(shouldReadResourceGroup(allInput, "ELASTIC_IP"), true);
  assert.equal(shouldReadResourceGroup(allInput, "NAT_GATEWAY"), true);
});

test("Target Group과 Listener 직접 선택은 Terraform 참조에 필요한 VPC를 함께 읽는다", () => {
  const targetGroupInput = scanInput(["LOAD_BALANCER_TARGET_GROUP"]);
  const listenerInput = scanInput(["LOAD_BALANCER_LISTENER"]);
  const loadBalancerInput = scanInput(["LOAD_BALANCER"]);

  assert.equal(shouldReadResourceGroup(targetGroupInput, "VPC"), true);
  assert.equal(shouldReadResourceGroup(listenerInput, "VPC"), true);
  assert.equal(shouldReadResourceGroup(loadBalancerInput, "VPC"), false);
  assert.equal(shouldReadResourceGroup(targetGroupInput, "SUBNET"), false);
  assert.equal(shouldReadResourceGroup(listenerInput, "SECURITY_GROUP"), false);
});

test("Route Table Association 직접 선택과 ALL은 기존 DescribeRouteTables reader를 함께 사용한다", async () => {
  assert.equal(
    shouldReadResourceGroup(scanInput(["ROUTE_TABLE_ASSOCIATION"]), "ROUTE_TABLE"),
    true
  );
  assert.equal(shouldReadResourceGroup(scanInput(["ALL"]), "ROUTE_TABLE"), true);
  assert.equal(shouldReadResourceGroup(scanInput(["SUBNET"]), "ROUTE_TABLE"), false);

  const bodies: string[] = [];
  const records = await describeRouteTables("ap-northeast-2", credentials, (async (
    _url: string | URL | Request,
    init?: RequestInit
  ) => {
    bodies.push(String(init?.body ?? ""));
    return new Response(
      `<DescribeRouteTablesResponse>
          <routeTableSet>
            <item>
              <routeTableId>rtb-main</routeTableId>
              <vpcId>vpc-main</vpcId>
              <associationSet>
                <item>
                  <routeTableAssociationId>rtbassoc-main-subnet</routeTableAssociationId>
                  <routeTableId>rtb-main</routeTableId>
                  <subnetId>subnet-main</subnetId>
                  <main>false</main>
                </item>
              </associationSet>
            </item>
          </routeTableSet>
        </DescribeRouteTablesResponse>`,
      { status: 200 }
    );
  }) as typeof fetch);

  assert.equal(bodies.length, 1);
  assert.equal(new URLSearchParams(bodies[0]).get("Action"), "DescribeRouteTables");
  assert.deepEqual(
    records.map((record) => [record.providerResourceType, record.providerResourceId]),
    [
      ["AWS::EC2::RouteTable", "rtb-main"],
      ["AWS::EC2::RouteTableAssociation", "rtbassoc-main-subnet"]
    ]
  );
});

test("Route Table Association 단독 선택은 Route Table과 Subnet을 dependency로 읽어 ready 결과를 만든다", async () => {
  const input = scanInput(["ROUTE_TABLE_ASSOCIATION"]);
  const readsRouteTables = shouldReadResourceGroup(input, "ROUTE_TABLE");
  const readsSubnets = shouldReadResourceGroup(input, "SUBNET");
  const records = [
    ...(readsSubnets
      ? parseSubnetsFromXml(
          `<DescribeSubnetsResponse>
            <subnetSet>
              <item>
                <subnetId>subnet-main</subnetId>
                <vpcId>vpc-main</vpcId>
                <cidrBlock>10.0.1.0/24</cidrBlock>
                <availabilityZone>ap-northeast-2a</availabilityZone>
                <mapPublicIpOnLaunch>false</mapPublicIpOnLaunch>
                <assignIpv6AddressOnCreation>false</assignIpv6AddressOnCreation>
              </item>
            </subnetSet>
          </DescribeSubnetsResponse>`,
          input.region
        )
      : []),
    ...(readsRouteTables
      ? parseRouteTablesFromXml(
          `<DescribeRouteTablesResponse>
            <routeTableSet>
              <item>
                <routeTableId>rtb-main</routeTableId>
                <vpcId>vpc-main</vpcId>
                <routeSet>
                  <item>
                    <destinationCidrBlock>10.0.0.0/16</destinationCidrBlock>
                    <gatewayId>local</gatewayId>
                    <state>active</state>
                  </item>
                </routeSet>
                <associationSet>
                  <item>
                    <routeTableAssociationId>rtbassoc-main-subnet</routeTableAssociationId>
                    <routeTableId>rtb-main</routeTableId>
                    <subnetId>subnet-main</subnetId>
                    <main>false</main>
                  </item>
                </associationSet>
              </item>
            </routeTableSet>
          </DescribeRouteTablesResponse>`,
          input.region
        )
      : [])
  ];

  const result = await scanGatewayRecords(records, input.resourceTypes);
  const association = result.discoveredResources.find(
    (resource) => resource.resourceType === "ROUTE_TABLE_ASSOCIATION"
  );
  const suggestion = result.importSuggestions.find(
    (candidate) => candidate.resourceId === association?.id
  );

  assert.equal(readsRouteTables, true);
  assert.equal(readsSubnets, true);
  assert.deepEqual(
    result.discoveredResources.map((resource) => resource.resourceType),
    ["SUBNET", "ROUTE_TABLE", "ROUTE_TABLE_ASSOCIATION"]
  );
  assert.equal(association?.analysisExcluded, undefined);
  assert.equal(suggestion?.status, "ready");
  assert.equal(suggestion?.handoffReady, true);
});

test("Route Table만 선택하면 같은 reader가 반환한 Association을 최종 결과에서 제외한다", async () => {
  const input = scanInput(["ROUTE_TABLE"]);
  const records = parseRouteTablesFromXml(
    `<DescribeRouteTablesResponse>
      <routeTableSet>
        <item>
          <routeTableId>rtb-main</routeTableId>
          <vpcId>vpc-main</vpcId>
          <routeSet>
            <item>
              <destinationCidrBlock>10.0.0.0/16</destinationCidrBlock>
              <gatewayId>local</gatewayId>
              <state>active</state>
            </item>
          </routeSet>
          <associationSet>
            <item>
              <routeTableAssociationId>rtbassoc-main-subnet</routeTableAssociationId>
              <routeTableId>rtb-main</routeTableId>
              <subnetId>subnet-main</subnetId>
              <main>false</main>
            </item>
          </associationSet>
        </item>
      </routeTableSet>
    </DescribeRouteTablesResponse>`,
    input.region
  );

  const result = await scanGatewayRecords(records, input.resourceTypes);

  assert.deepEqual(
    result.discoveredResources.map((resource) => resource.resourceType),
    ["ROUTE_TABLE"]
  );
  assert.equal(
    result.importSuggestions.some((suggestion) =>
      suggestion.terraformAddress?.startsWith("aws_route_table_association.")
    ),
    false
  );
});

test("반복 Route Table page의 Association record를 provider ID 기준으로 한 번만 남긴다", () => {
  const duplicateRecords: AwsDiscoveredResourceRecord[] = [
    {
      providerResourceType: "AWS::EC2::RouteTable",
      providerResourceId: "rtb-main",
      displayName: "rtb-main",
      region: "ap-northeast-2",
      config: {},
      relationships: []
    },
    {
      providerResourceType: "AWS::EC2::RouteTableAssociation",
      providerResourceId: "rtbassoc-main-subnet",
      displayName: "rtbassoc-main-subnet",
      region: "ap-northeast-2",
      config: {
        routeTableAssociationId: "rtbassoc-main-subnet",
        subnetId: "subnet-main",
        routeTableId: "rtb-main",
        main: false
      },
      relationships: [
        { type: "attached_to", targetProviderResourceId: "subnet-main" },
        { type: "depends_on", targetProviderResourceId: "rtb-main" }
      ]
    }
  ];

  const records = uniqueDiscoveredRecordsByProviderId([
    ...duplicateRecords,
    ...structuredClone(duplicateRecords)
  ]);

  assert.deepEqual(
    records.map((record) => record.providerResourceId),
    ["rtb-main", "rtbassoc-main-subnet"]
  );
  assert.equal(records[1]?.relationships.length, 2);
});

test("ALL 스캔은 실제 generic EIP/NAT ARN보다 전용 Query 설정을 우선해 한 번만 남긴다", async () => {
  const allocationId = "eipalloc-0123456789abcdef0";
  const natGatewayId = "nat-0123456789abcdef0";
  const [genericEip] = await listTaggedUnknownResources("ap-northeast-2", credentials, () => ({
    async send() {
      return {
        ResourceTagMappingList: [
          {
            ResourceARN: `arn:aws:ec2:ap-northeast-2:123456789012:elastic-ip/${allocationId}`,
            Tags: [{ Key: "owner", Value: "platform" }]
          }
        ]
      };
    }
  }));
  assert.equal(genericEip?.providerResourceType, "AWS::EC2::EIP");
  const records = uniqueDiscoveredRecordsByProviderId([
    genericEip!,
    {
      ...safeRecord("AWS::EC2::EIP", allocationId, "egress-ip"),
      config: {
        allocationId,
        associationTargetType: "unassociated",
        domain: "vpc",
        tags: [{ key: "Name", value: "egress-ip" }]
      }
    },
    {
      ...safeRecord(
        "AWS::EC2::NatGateway",
        `arn:aws:ec2:ap-northeast-2:123456789012:natgateway/${natGatewayId}`,
        "NAT Gateway · generic"
      ),
      config: { tags: [{ key: "owner", value: "network" }] }
    },
    {
      ...safeRecord("AWS::EC2::NatGateway", natGatewayId, "public-egress"),
      config: {
        allocationIds: [allocationId],
        connectivityType: "public",
        natGatewayId,
        primaryAllocationId: allocationId,
        state: "available",
        subnetId: "subnet-0123456789abcdef0",
        tags: [{ key: "Name", value: "public-egress" }]
      }
    }
  ]);

  assert.equal(records.length, 2);
  assert.equal(records[0]?.providerResourceId, allocationId);
  assert.equal(records[0]?.config["allocationId"], allocationId);
  assert.deepEqual(records[0]?.config["tags"], [
    { key: "owner", value: "platform" },
    { key: "Name", value: "egress-ip" }
  ]);
  assert.equal(records[1]?.providerResourceId, natGatewayId);
  assert.equal(records[1]?.config["natGatewayId"], natGatewayId);
});

test("같은 scan NAT가 allocation을 점유할 때만 EIP association을 NAT로 해석한다", () => {
  const allocationId = "eipalloc-0123456789abcdef0";
  const natGatewayId = "nat-0123456789abcdef0";
  const records = resolveNatGatewayElasticIpRelationships([
    {
      ...safeRecord("AWS::EC2::EIP", allocationId, allocationId),
      config: { allocationId, associationTargetType: "ec2_or_eni", domain: "vpc" }
    },
    {
      ...safeRecord("AWS::EC2::EIP", "eipalloc-fedcba98765432100", "unsupported"),
      config: {
        allocationId: "eipalloc-fedcba98765432100",
        associationTargetType: "ec2_or_eni",
        domain: "vpc"
      }
    },
    {
      ...safeRecord("AWS::EC2::NatGateway", natGatewayId, natGatewayId),
      config: {
        allocationIds: [allocationId],
        connectivityType: "public",
        natGatewayId,
        primaryAllocationId: allocationId,
        state: "available",
        subnetId: "subnet-0123456789abcdef0"
      },
      relationships: [
        { type: "contains", targetProviderResourceId: "subnet-0123456789abcdef0" },
        { type: "depends_on", targetProviderResourceId: allocationId }
      ]
    }
  ]);

  assert.equal(records[0]?.config["associationTargetType"], "nat_gateway");
  assert.deepEqual(records[0]?.relationships, [
    { type: "depends_on", targetProviderResourceId: natGatewayId }
  ]);
  assert.equal(records[1]?.config["associationTargetType"], "ec2_or_eni");
  assert.deepEqual(records[1]?.relationships, []);
});

test("AWS 서비스 관리 EIP는 같은 scan NAT가 보여도 NAT 관리 대상으로 승격하지 않는다", () => {
  const allocationId = "eipalloc-0123456789abcdef0";
  const natGatewayId = "nat-0123456789abcdef0";
  const records = resolveNatGatewayElasticIpRelationships([
    {
      ...safeRecord("AWS::EC2::EIP", allocationId, "service-managed"),
      config: {
        allocationId,
        associationTargetType: "service_managed",
        domain: "vpc"
      }
    },
    {
      ...safeRecord("AWS::EC2::NatGateway", natGatewayId, "regional-nat"),
      config: {
        allocationIds: [allocationId],
        connectivityType: "public",
        natGatewayId,
        primaryAllocationId: allocationId,
        state: "available",
        subnetId: "subnet-0123456789abcdef0"
      },
      relationships: [{ type: "depends_on", targetProviderResourceId: allocationId }]
    }
  ]);

  assert.equal(records[0]?.config["associationTargetType"], "service_managed");
  assert.deepEqual(records[0]?.relationships, []);
});

test("all EC2 Query readers and RDS follow their response pagination token", async () => {
  for (const scenario of awsQueryReaderScenarios) {
    const bodies: string[] = [];
    let page = 0;
    const failures: Array<{ outcome: string }> = [];
    const records = await scenario.read(
      "ap-northeast-2",
      credentials,
      (async (_url: string | URL | Request, init?: RequestInit) => {
        bodies.push(String(init?.body ?? ""));
        page += 1;
        return new Response(
          createAwsQueryPageXml(
            scenario.kind,
            `${scenario.idPrefix}-${page}`,
            page === 1 ? "opaque +/&= token" : undefined
          ),
          { status: 200 }
        );
      }) as typeof fetch,
      (failure) => failures.push(failure)
    );

    assert.deepEqual(
      records.map((record) => record.providerResourceId),
      [`${scenario.idPrefix}-1`, `${scenario.idPrefix}-2`],
      scenario.name
    );
    assert.equal(bodies.length, 2, scenario.name);
    assert.equal(
      new URLSearchParams(bodies[1]).get(scenario.requestToken),
      "opaque +/&= token",
      scenario.name
    );
    assert.deepEqual(failures, [], scenario.name);
  }
});

test("all EC2 and RDS Query readers preserve page one with one safe later-page diagnostic", async () => {
  for (const scenario of awsQueryReaderScenarios) {
    let page = 0;
    const failures: Array<{ outcome: string }> = [];
    const records = await scenario.read(
      "ap-northeast-2",
      credentials,
      (async () => {
        page += 1;
        if (page === 1) {
          return new Response(
            createAwsQueryPageXml(scenario.kind, `${scenario.idPrefix}-kept`, "page-2"),
            { status: 200 }
          );
        }
        return new Response(
          "<Error><Code>AccessDeniedException</Code>" +
            "<Message>private-request-id arn:aws:iam::123456789012:role/private</Message></Error>",
          { status: 403 }
        );
      }) as typeof fetch,
      (failure) => failures.push(failure)
    );

    assert.deepEqual(
      records.map((record) => record.providerResourceId),
      [`${scenario.idPrefix}-kept`],
      scenario.name
    );
    assert.deepEqual(failures, [{ outcome: "permission_denied" }], scenario.name);
    assert.doesNotMatch(
      JSON.stringify(failures),
      /private-request-id|arn:aws|123456789012|AccessDenied/iu,
      scenario.name
    );
  }
});

test("S3 ListBuckets pagination preserves detailed page-one buckets on a later failure", async () => {
  const listCommands: ListBucketsCommand[] = [];
  const failures: Array<{ outcome: string }> = [];
  const records = await listBucketsWithDetails(
    "ap-northeast-2",
    credentials,
    () => ({
      async send(command: object): Promise<unknown> {
        if (command instanceof ListBucketsCommand) {
          listCommands.push(command);
          if (command.input.ContinuationToken) {
            throw Object.assign(new Error("generic provider failure"), {
              name: "AccessDeniedException"
            });
          }
          return {
            Buckets: [{ Name: "kept-bucket", CreationDate: new Date("2026-07-20T00:00:00Z") }],
            ContinuationToken: "page-2"
          };
        }
        return {};
      }
    }),
    (failure) => failures.push(failure)
  );

  assert.deepEqual(
    records.map((record) => record.providerResourceId),
    ["kept-bucket"]
  );
  assert.equal(listCommands.length, 2);
  assert.equal(listCommands[0]?.input.MaxBuckets, 1_000);
  assert.equal(listCommands[1]?.input.ContinuationToken, "page-2");
  assert.deepEqual(failures, [{ outcome: "permission_denied" }]);
});

test("S3 상세 권한 실패는 리소스별 불완전 표시를 남기고 import 준비를 막는다", async () => {
  const records = await listBucketsWithDetails("ap-northeast-2", credentials, () => ({
    async send(command: object): Promise<unknown> {
      if (command instanceof ListBucketsCommand) {
        return { Buckets: [{ Name: "partial-bucket" }] };
      }
      if (command instanceof GetBucketVersioningCommand) {
        throw Object.assign(new Error("private provider failure"), {
          name: "AccessDeniedException"
        });
      }
      if (command instanceof GetBucketTaggingCommand) {
        throw Object.assign(new Error("no tags configured"), { name: "NoSuchTagSet" });
      }
      return {};
    }
  }));

  assert.deepEqual(records[0]?.config["reverseEngineeringIncompleteDetails"], ["versioning"]);

  const result = await scanGatewayRecords(records);
  assert.equal(result.importSuggestions[0]?.status, "manual_review");
  assert.equal(result.importSuggestions[0]?.handoffReady, false);
  assert.match(result.importSuggestions[0]?.reason ?? "", /안전하게 수정할 설정/u);
  assert.doesNotMatch(result.importSuggestions[0]?.reason ?? "", /details\.versioning/u);
});

test("S3 reader는 파일 이름을 저장하지 않고 Bucket에 안전한 파일 수 요약만 남긴다", async () => {
  const commands: object[] = [];
  const records = await listBucketsWithDetails("ap-northeast-2", credentials, () => ({
    async send(command: object): Promise<unknown> {
      commands.push(command);
      if (command instanceof ListBucketsCommand) {
        return { Buckets: [{ Name: "audience-live-check-web" }] };
      }
      if (command instanceof GetBucketVersioningCommand) {
        return { Status: "Enabled", MFADelete: "Disabled" };
      }
      if (command instanceof GetPublicAccessBlockCommand) {
        return {
          PublicAccessBlockConfiguration: {
            BlockPublicAcls: true,
            IgnorePublicAcls: true,
            BlockPublicPolicy: true,
            RestrictPublicBuckets: true
          }
        };
      }
      if (command instanceof GetBucketPolicyCommand) {
        return { Policy: '{"Version":"2012-10-17","Statement":[]}' };
      }
      if (command instanceof ListObjectsV2Command) {
        return {
          Contents: [
            {
              Key: "private/users/customer@example.com/token.txt",
              ETag: '"fixture-etag"',
              StorageClass: "STANDARD"
            }
          ],
          KeyCount: 1,
          IsTruncated: true,
          NextContinuationToken: "private-continuation-token"
        };
      }
      return {};
    }
  }));

  assert.deepEqual(
    records.map((record) => record.providerResourceType),
    [
      "AWS::S3::Bucket",
      "AWS::S3::BucketVersioning",
      "AWS::S3::BucketPublicAccessBlock",
      "AWS::S3::BucketPolicy"
    ]
  );
  for (const child of records.slice(1)) {
    assert.deepEqual(child.relationships, [
      { type: "depends_on", targetProviderResourceId: "audience-live-check-web" }
    ]);
  }
  assert.equal(records[1]?.serverOnly?.terraformImportId, "audience-live-check-web");
  assert.equal(records[2]?.serverOnly?.terraformImportId, "audience-live-check-web");
  assert.equal(records[3]?.serverOnly?.terraformImportId, "audience-live-check-web");
  assert.deepEqual(records[3]?.serverOnly?.config?.["policyDocument"], {
    Version: "2012-10-17",
    Statement: []
  });
  assert.equal(records[0]?.config["objectInventoryObservedCount"], 1);
  assert.equal(records[0]?.config["objectInventoryCountIsExact"], false);
  assert.equal(records[0]?.config["objectInventoryTruncated"], true);
  assert.equal(records[0]?.config["objectInventorySummary"], "저장된 파일 1개 이상");
  assert.deepEqual(records[0]?.config["tags"], []);
  assert.equal(records[0]?.config["tagsReadComplete"], true);
  assert.doesNotMatch(
    JSON.stringify(records),
    /customer@example\.com|token\.txt|fixture-etag|private-continuation-token/u
  );

  const objectLists = commands.filter(
    (command): command is ListObjectsV2Command => command instanceof ListObjectsV2Command
  );
  assert.equal(objectLists.length, 1);
  assert.equal(objectLists[0]?.input.MaxKeys, 1);
  assert.equal(objectLists[0]?.input.ContinuationToken, undefined);
  assert.doesNotMatch(
    commands.map((command) => command.constructor.name).join("\n"),
    /(?:HeadObject|GetObject)/u
  );
});

test("S3 암호화와 웹사이트 원문은 서버에만 두고 Bucket 자동 관리는 안전하게 닫는다", async () => {
  const kmsKeyArn =
    "arn:aws:kms:ap-northeast-2:123456789012:key/11111111-2222-3333-4444-555555555555";
  const privateWebsitePath = "private/customer@example.com/error.html";
  const records = await listBucketsWithDetails("ap-northeast-2", credentials, () => ({
    async send(command: object): Promise<unknown> {
      if (command instanceof ListBucketsCommand) {
        return { Buckets: [{ Name: "configured-bucket" }] };
      }
      if (command instanceof GetBucketEncryptionCommand) {
        return {
          ServerSideEncryptionConfiguration: {
            Rules: [
              {
                ApplyServerSideEncryptionByDefault: {
                  SSEAlgorithm: "aws:kms",
                  KMSMasterKeyID: kmsKeyArn
                }
              }
            ]
          }
        };
      }
      if (command instanceof GetBucketWebsiteCommand) {
        return {
          IndexDocument: { Suffix: "index.html" },
          ErrorDocument: { Key: privateWebsitePath }
        };
      }
      if (command instanceof ListObjectsV2Command) {
        return { Contents: [], KeyCount: 0, IsTruncated: false };
      }
      return {};
    }
  }));

  const bucket = records[0];
  assert.equal(bucket?.config["hasEncryptionConfiguration"], true);
  assert.equal(bucket?.config["hasWebsiteConfiguration"], true);
  assert.equal(bucket?.config["encryptionRules"], undefined);
  assert.equal(bucket?.config["websiteIndexDocument"], undefined);
  assert.equal(bucket?.config["websiteErrorDocument"], undefined);
  assert.deepEqual(bucket?.serverOnly?.config?.["encryptionRules"], [
    {
      ApplyServerSideEncryptionByDefault: {
        SSEAlgorithm: "aws:kms",
        KMSMasterKeyID: kmsKeyArn
      }
    }
  ]);
  assert.equal(
    (
      bucket?.serverOnly?.config?.["websiteConfiguration"] as {
        ErrorDocument?: { Key?: string };
      }
    )?.ErrorDocument?.Key,
    privateWebsitePath
  );

  const result = await scanGatewayRecords(records);
  const publicBucket = result.discoveredResources[0];
  assert.equal(publicBucket?.config["hasEncryptionConfiguration"], true);
  assert.equal(publicBucket?.config["hasWebsiteConfiguration"], true);
  assert.equal(publicBucket?.importSuggestionStatus, "manual_review");
  assert.match(result.importSuggestions[0]?.reason ?? "", /안전하게 수정할 설정/u);
  assert.doesNotMatch(JSON.stringify(result), /123456789012|customer@example\.com|KMSMasterKeyID/u);
});

test("S3 파일 수 확인은 한 건만 읽고 continuation token을 따라가지 않는다", async () => {
  const objectListCommands: ListObjectsV2Command[] = [];
  const records = await listBucketsWithDetails("ap-northeast-2", credentials, () => ({
    async send(command: object): Promise<unknown> {
      if (command instanceof ListBucketsCommand) {
        return { Buckets: [{ Name: "paged-bucket" }] };
      }
      if (command instanceof ListObjectsV2Command) {
        objectListCommands.push(command);
        return {
          Contents: [{ Key: "users/alice@example.com/session-token.json" }],
          KeyCount: 1,
          IsTruncated: true,
          NextContinuationToken: "page-2"
        };
      }
      return {};
    }
  }));

  assert.equal(
    records.some((record) => record.providerResourceType === "AWS::S3::Object"),
    false
  );
  assert.equal(records[0]?.config["objectInventoryObservedCount"], 1);
  assert.equal(records[0]?.config["objectInventoryCountIsExact"], false);
  assert.equal(records[0]?.config["objectInventorySummary"], "저장된 파일 1개 이상");
  assert.equal(objectListCommands.length, 1);
  assert.equal(objectListCommands[0]?.input.ContinuationToken, undefined);
  assert.doesNotMatch(JSON.stringify(records), /alice@example\.com|session-token|page-2/u);
});

test("S3 파일 수 확인 실패는 이름 없이 실패 상태만 남기고 Bucket 설정 관리는 유지한다", async () => {
  const failures: Array<{ outcome: string }> = [];
  const records = await listBucketsWithDetails(
    "ap-northeast-2",
    credentials,
    () => ({
      async send(command: object): Promise<unknown> {
        if (command instanceof ListBucketsCommand) {
          return { Buckets: [{ Name: "partially-listed-bucket" }] };
        }
        if (command instanceof ListObjectsV2Command) {
          throw Object.assign(new Error("private/users/customer@example.com/token.txt"), {
            name: "AccessDeniedException"
          });
        }
        return {};
      }
    }),
    (failure) => failures.push(failure)
  );

  const bucket = records.find(
    (record) => record.providerResourceType === "AWS::S3::Bucket"
  );
  assert.equal(
    records.some((record) => record.providerResourceType === "AWS::S3::Object"),
    false
  );
  assert.equal(bucket?.config["objectInventoryObservedCount"], undefined);
  assert.equal(bucket?.config["objectInventoryCountIsExact"], false);
  assert.equal(bucket?.config["objectInventoryTruncated"], true);
  assert.equal(bucket?.config["objectInventorySummary"], "저장된 파일 수를 확인하지 못했습니다.");
  assert.equal(bucket?.config["reverseEngineeringIncompleteDetails"], undefined);
  assert.deepEqual(failures, [{ outcome: "permission_denied" }]);
  assert.doesNotMatch(JSON.stringify(records), /customer@example\.com|token\.txt/u);

  const scanResult = await scanGatewayRecords(records);
  const importedBucket = scanResult.discoveredResources.find(
    (resource) => resource.providerResourceType === "AWS::S3::Bucket"
  );
  assert.equal(
    scanResult.architectureJson.nodes.find((node) => node.id === importedBucket?.id)?.config[
      "reverseEngineeringManagement"
    ],
    "managed"
  );
});

test("S3 policy와 Object 목록 상세 실패는 Bucket을 보존하고 scan 오류로 전달한다", async () => {
  for (const failingCommand of ["GetBucketPolicyCommand", "ListObjectsV2Command"] as const) {
    const failures: Array<{ outcome: string }> = [];
    const records = await listBucketsWithDetails(
      "ap-northeast-2",
      credentials,
      () => ({
        async send(command: object): Promise<unknown> {
          if (command instanceof ListBucketsCommand) {
            return { Buckets: [{ Name: "partial-detail-bucket" }] };
          }
          if (command.constructor.name === failingCommand) {
            throw Object.assign(new Error("private provider failure"), {
              name: "AccessDeniedException"
            });
          }
          return {};
        }
      }),
      (failure) => failures.push(failure)
    );

    assert.equal(records[0]?.providerResourceType, "AWS::S3::Bucket");
    assert.deepEqual(
      records[0]?.config["reverseEngineeringIncompleteDetails"],
      failingCommand === "GetBucketPolicyCommand" ? ["policy"] : undefined
    );
    assert.deepEqual(failures, [{ outcome: "permission_denied" }]);
  }
});

test("S3 reader는 여러 Bucket 상세 조회를 한 Bucket씩 처리한다", async () => {
  const activeRequestCounts = new Map<string, number>();
  let maxConcurrentBuckets = 0;

  await listBucketsWithDetails("ap-northeast-2", credentials, () => ({
    async send(command: object): Promise<unknown> {
      if (command instanceof ListBucketsCommand) {
        return { Buckets: [{ Name: "bucket-a" }, { Name: "bucket-b" }, { Name: "bucket-c" }] };
      }

      const bucket = (command as { input?: { Bucket?: string } }).input?.Bucket;
      if (!bucket) return {};
      activeRequestCounts.set(bucket, (activeRequestCounts.get(bucket) ?? 0) + 1);
      maxConcurrentBuckets = Math.max(maxConcurrentBuckets, activeRequestCounts.size);
      await new Promise((resolve) => setTimeout(resolve, 2));
      const remaining = (activeRequestCounts.get(bucket) ?? 1) - 1;
      if (remaining === 0) activeRequestCounts.delete(bucket);
      else activeRequestCounts.set(bucket, remaining);
      return {};
    }
  }));

  assert.equal(maxConcurrentBuckets, 1);
  assert.equal(activeRequestCounts.size, 0);
});

test("AMI pagination preserves page-one images and reports one safe later failure", async () => {
  const commands: DescribeImagesCommand[] = [];
  const failures: Array<{ outcome: string }> = [];
  const records = await listAmiImagesAsUnknown(
    "ap-northeast-2",
    credentials,
    () => ({
      async send(command: object): Promise<unknown> {
        assert(command instanceof DescribeImagesCommand);
        commands.push(command);
        if (command.input.NextToken) {
          throw Object.assign(new Error("generic provider failure"), {
            code: "RequestTimeout"
          });
        }
        return {
          Images: [{ ImageId: "ami-kept", Name: "kept-image", State: "available" }],
          NextToken: "page-2"
        };
      }
    }),
    (failure) => failures.push(failure)
  );

  assert.deepEqual(
    records.map((record) => record.providerResourceId),
    ["ami-kept"]
  );
  assert.equal(commands.length, 2);
  assert.equal(commands[0]?.input.MaxResults, 1_000);
  assert.equal(commands[1]?.input.NextToken, "page-2");
  assert.deepEqual(failures, [{ outcome: "transient" }]);
  assert.deepEqual(Object.keys(failures[0] ?? {}), ["outcome"]);
});

test("Resource Explorer resolves the default view before searching it", async () => {
  const viewArn = "arn:aws:resource-explorer-2:ap-northeast-2:123456789012:view/default/example";
  const commands: object[] = [];
  const result = await readResourceExplorerResourcesWithDiagnostics(
    "ap-northeast-2",
    credentials,
    () => ({
      async send(command: object): Promise<unknown> {
        commands.push(command);
        if (command instanceof GetDefaultViewCommand) return { ViewArn: viewArn };
        if (command instanceof GetViewCommand) return { View: { ViewArn: viewArn } };
        if (command instanceof SearchCommand) return { Resources: [] };
        throw new Error(`Unexpected Resource Explorer command: ${command.constructor.name}`);
      }
    })
  );

  assert.deepEqual(result, { records: [], scanErrors: [] });
  assert.deepEqual(
    commands.map((command) => command.constructor),
    [GetDefaultViewCommand, GetViewCommand, SearchCommand]
  );
  assert.equal((commands[1] as GetViewCommand).input.ViewArn, viewArn);
  assert.equal((commands[2] as SearchCommand).input.ViewArn, viewArn);
});

test("ALL 스캔은 generic Log Group보다 이름과 설정이 있는 전용 조회 결과를 우선한다", () => {
  const logGroupArn = "arn:aws:logs:ap-northeast-2:123456789012:log-group:/ecs/orders";
  const kmsKeyArn =
    "arn:aws:kms:ap-northeast-2:123456789012:key/11111111-2222-3333-4444-555555555555";
  const genericRecord = safeRecord("AWS::Logs::LogGroup", logGroupArn, "LogGroup · generic");
  const detailedRecord: AwsDiscoveredResourceRecord = {
    ...genericRecord,
    providerResourceId: `${logGroupArn}:*`,
    displayName: "/ecs/orders",
    config: {
      logGroupName: "/ecs/orders",
      retentionInDays: 30,
      kmsKeyId: kmsKeyArn
    }
  };

  const records = uniqueDiscoveredRecordsByProviderId([genericRecord, detailedRecord]);

  assert.equal(records.length, 1);
  assert.deepEqual(records[0], detailedRecord);
});

test("ALL 스캔은 API Gateway ARN inventory와 전용 REST API ID를 하나로 합친다", () => {
  const restApiId = "a1b2c3d4e5";
  const genericRecord = safeRecord(
    "AWS::ApiGateway::RestApi",
    `arn:aws:apigateway:ap-northeast-2::/restapis/${restApiId}`,
    "RestApi · generic"
  );
  const detailedRecord: AwsDiscoveredResourceRecord = {
    ...genericRecord,
    providerResourceId: restApiId,
    displayName: "customer-api",
    config: {
      id: restApiId,
      name: "customer-api",
      endpointConfiguration: { types: ["REGIONAL"] }
    }
  };

  const records = uniqueDiscoveredRecordsByProviderId([genericRecord, detailedRecord]);

  assert.equal(records.length, 1);
  assert.deepEqual(records[0], detailedRecord);
});

test("ALL 스캔은 API Gateway V2 ARN inventory와 opaque direct API를 하나로 합치고 direct topology를 우선한다", () => {
  const apiId = "a1b2c3d4e5";
  const genericRecord = safeRecord(
    "AWS::ApiGatewayV2::Api",
    `arn:aws:apigateway:ap-northeast-2::/apis/${apiId}`,
    "V2 API · generic"
  );
  const detailedRecord: AwsDiscoveredResourceRecord = {
    ...genericRecord,
    providerResourceId: "apigwv2-ref-0123456789abcdef01234567",
    displayName: "orders-http-api",
    config: { protocolType: "HTTP" },
    relationships: [{ type: "contains", targetProviderResourceId: "apigwv2-route-ref" }],
    serverOnly: {
      providerResourceId: apiId,
      terraformImportId: apiId
    }
  };

  const records = uniqueDiscoveredRecordsByProviderId([genericRecord, detailedRecord]);

  assert.equal(records.length, 1);
  assert.deepEqual(records[0], detailedRecord);
});

test("API Gateway reader는 resource policy 원문 대신 존재 marker만 기록한다", async () => {
  const policy = JSON.stringify({
    Statement: [{ Resource: "arn:aws:execute-api:ap-northeast-2:123456789012:*" }]
  });
  const records = await listApiGatewayRestApisAsUnknown("ap-northeast-2", credentials, () => ({
    async send(command: object): Promise<unknown> {
      assert.ok(command instanceof GetRestApisCommand);
      return { items: [{ id: "a1b2c3d4e5", name: "private-api", policy }] };
    }
  }));

  assert.equal(records[0]?.config["hasResourcePolicy"], true);
  assert.equal(records[0]?.config["policy"], undefined);
  assert.doesNotMatch(JSON.stringify(records), /Statement|execute-api/iu);
});

test("API Gateway reader는 policy와 tag가 없다는 완료 근거도 명시적으로 기록한다", async () => {
  const records = await listApiGatewayRestApisAsUnknown("ap-northeast-2", credentials, () => ({
    async send(command: object): Promise<unknown> {
      assert.ok(command instanceof GetRestApisCommand);
      return { items: [{ id: "a1b2c3d4e5", name: "public-api" }] };
    }
  }));

  assert.equal(records[0]?.config["hasResourcePolicy"], false);
  assert.equal(records[0]?.config["tagsReadComplete"], true);
  assert.deepEqual(records[0]?.config["tags"], {});
});

test("CloudWatch 전용 reader는 Alarm 재생성에 필요한 단일 Metric 설정을 페이지별로 보존한다", async () => {
  const commands: DescribeAlarmsCommand[] = [];
  const records = await listCloudWatchMetricAlarmsAsUnknown("ap-northeast-2", credentials, () => ({
    async send(command: object): Promise<unknown> {
      if (command instanceof ListCloudWatchTagsForResourceCommand) {
        return { Tags: [] };
      }
      assert.ok(command instanceof DescribeAlarmsCommand);
      commands.push(command);

      if (command.input.NextToken === "page-2") {
        return {
          MetricAlarms: [
            {
              AlarmArn: "arn:aws:cloudwatch:ap-northeast-2:123456789012:alarm:p99-latency",
              AlarmName: "p99-latency",
              ComparisonOperator: "GreaterThanThreshold",
              EvaluateLowSampleCountPercentile: "ignore",
              EvaluationPeriods: 2,
              ExtendedStatistic: "p99",
              MetricName: "TargetResponseTime",
              Namespace: "AWS/ApplicationELB",
              Period: 60,
              Threshold: 1.5,
              ThresholdMetricId: "e1",
              TreatMissingData: "notBreaching"
            }
          ]
        };
      }

      return {
        MetricAlarms: [
          {
            ActionsEnabled: true,
            AlarmActions: [],
            AlarmArn: "arn:aws:cloudwatch:ap-northeast-2:123456789012:alarm:api-request-count",
            AlarmDescription: "API request threshold",
            AlarmName: "api-request-count",
            ComparisonOperator: "GreaterThanThreshold",
            DatapointsToAlarm: 2,
            Dimensions: [{ Name: "LoadBalancer", Value: "app/customer/1234" }],
            EvaluationPeriods: 3,
            InsufficientDataActions: [],
            MetricName: "RequestCountPerTarget",
            Namespace: "AWS/ApplicationELB",
            OKActions: [],
            Period: 60,
            Statistic: "Sum",
            Threshold: 100,
            TreatMissingData: "notBreaching",
            Unit: "Count"
          }
        ],
        NextToken: "page-2"
      };
    }
  }));

  assert.equal(commands.length, 2);
  assert.equal(commands[0]?.input.NextToken, undefined);
  assert.equal(commands[1]?.input.NextToken, "page-2");
  const { providerParameters, ...firstConfig } = records[0]?.config ?? {};
  assert.ok(providerParameters);
  assert.deepEqual(firstConfig, {
    actionsEnabled: true,
    alarmActions: [],
    alarmArn: "arn:aws:cloudwatch:ap-northeast-2:123456789012:alarm:api-request-count",
    alarmConfigurationUpdatedAt: undefined,
    alarmDescription: "API request threshold",
    alarmName: "api-request-count",
    comparisonOperator: "GreaterThanThreshold",
    datapointsToAlarm: 2,
    dimensions: [{ Name: "LoadBalancer", Value: "app/customer/1234" }],
    evaluateLowSampleCountPercentiles: undefined,
    evaluationPeriods: 3,
    extendedStatistic: undefined,
    insufficientDataActions: [],
    metricName: "RequestCountPerTarget",
    metrics: undefined,
    namespace: "AWS/ApplicationELB",
    okActions: [],
    period: 60,
    stateReason: undefined,
    stateUpdatedAt: undefined,
    stateValue: undefined,
    statistic: "Sum",
    tags: [],
    tagsReadComplete: true,
    threshold: 100,
    thresholdMetricId: undefined,
    treatMissingData: "notBreaching",
    unit: "Count"
  });
  assert.equal(records[1]?.config["evaluateLowSampleCountPercentiles"], "ignore");
  assert.equal(records[1]?.config["extendedStatistic"], "p99");
  assert.equal(records[1]?.config["thresholdMetricId"], "e1");
});

test("CloudWatch Alarm reader는 서비스 tag API의 완전한 결과만 보존한다", async () => {
  const alarmArn = "arn:aws:cloudwatch:ap-northeast-2:123456789012:alarm:api-request-count";
  const commands: object[] = [];
  const records = await listCloudWatchMetricAlarmsAsUnknown("ap-northeast-2", credentials, () => ({
    async send(command: object): Promise<unknown> {
      commands.push(command);
      if (command instanceof DescribeAlarmsCommand) {
        return {
          MetricAlarms: [{ AlarmArn: alarmArn, AlarmName: "api-request-count" }]
        };
      }
      if (command instanceof ListCloudWatchTagsForResourceCommand) {
        assert.equal(command.input.ResourceARN, alarmArn);
        return { Tags: [{ Key: "Environment", Value: "production" }] };
      }
      throw new Error(`Unexpected command: ${command.constructor.name}`);
    }
  }));

  assert.equal(
    commands.some((command) => command instanceof ListCloudWatchTagsForResourceCommand),
    true
  );
  assert.equal(records[0]?.config["tagsReadComplete"], true);
  assert.deepEqual(records[0]?.config["tags"], [{ key: "Environment", value: "production" }]);
});

test("CloudWatch Alarm tag 응답의 항목이 불완전하면 tag evidence를 완전하다고 표시하지 않는다", async () => {
  const records = await listCloudWatchMetricAlarmsAsUnknown("ap-northeast-2", credentials, () => ({
    async send(command: object): Promise<unknown> {
      if (command instanceof DescribeAlarmsCommand) {
        return {
          MetricAlarms: [
            {
              AlarmArn: "arn:aws:cloudwatch:ap-northeast-2:123456789012:alarm:api-request-count",
              AlarmName: "api-request-count"
            }
          ]
        };
      }
      if (command instanceof ListCloudWatchTagsForResourceCommand) {
        return { Tags: [{ Key: "Environment" }] };
      }
      throw new Error(`Unexpected command: ${command.constructor.name}`);
    }
  }));

  assert.equal(records[0]?.config["tagsReadComplete"], false);
  assert.equal(records[0]?.config["tags"], undefined);
});

test("CloudWatch LogGroup reader는 정규화한 ARN으로 tag API를 읽고 빈 결과도 보존한다", async () => {
  const sdkArn = "arn:aws:logs:ap-northeast-2:123456789012:log-group:/ecs/orders:*";
  const resourceArn = sdkArn.slice(0, -2);
  const commands: object[] = [];
  const records = await listCloudWatchLogGroupsAsUnknown("ap-northeast-2", credentials, () => ({
    async send(command: object): Promise<unknown> {
      commands.push(command);
      if (command instanceof DescribeLogGroupsCommand) {
        return {
          logGroups: [{ arn: sdkArn, logGroupName: "/ecs/orders", logGroupClass: "STANDARD" }]
        };
      }
      if (command instanceof ListLogGroupTagsForResourceCommand) {
        assert.equal(command.input.resourceArn, resourceArn);
        return { tags: {} };
      }
      throw new Error(`Unexpected command: ${command.constructor.name}`);
    }
  }));

  assert.equal(
    commands.some((command) => command instanceof ListLogGroupTagsForResourceCommand),
    true
  );
  assert.equal(records[0]?.config["tagsReadComplete"], true);
  assert.deepEqual(records[0]?.config["tags"], []);
});

test("CloudWatch Alarm tag 조회 실패는 리소스를 버리지 않고 불완전 evidence로 남긴다", async () => {
  const alarmArn = "arn:aws:cloudwatch:ap-northeast-2:123456789012:alarm:private-alarm";
  const failures: Array<{ outcome: string }> = [];
  const records = await listCloudWatchMetricAlarmsAsUnknown(
    "ap-northeast-2",
    credentials,
    () => ({
      async send(command: object): Promise<unknown> {
        if (command instanceof DescribeAlarmsCommand) {
          return { MetricAlarms: [{ AlarmArn: alarmArn, AlarmName: "private-alarm" }] };
        }
        if (command instanceof ListCloudWatchTagsForResourceCommand) {
          throw Object.assign(new Error(`AccessDenied ${alarmArn}`), {
            name: "AccessDeniedException"
          });
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`);
      }
    }),
    (failure) => failures.push(failure)
  );

  assert.equal(records.length, 1);
  assert.equal(records[0]?.config["tagsReadComplete"], false);
  assert.equal(records[0]?.config["tags"], undefined);
  assert.deepEqual(failures, [{ outcome: "permission_denied" }]);
  assert.doesNotMatch(JSON.stringify(failures), /arn:aws|private-alarm/iu);
});

test("CloudWatch LogGroup tag 조회에 필요한 ARN이 없으면 불완전 evidence로 남긴다", async () => {
  const commands: object[] = [];
  const records = await listCloudWatchLogGroupsAsUnknown("ap-northeast-2", credentials, () => ({
    async send(command: object): Promise<unknown> {
      commands.push(command);
      if (command instanceof DescribeLogGroupsCommand) {
        return { logGroups: [{ logGroupName: "/ecs/orders", logGroupClass: "STANDARD" }] };
      }
      throw new Error(`Unexpected command: ${command.constructor.name}`);
    }
  }));

  assert.equal(records.length, 1);
  assert.equal(records[0]?.config["tagsReadComplete"], false);
  assert.equal(records[0]?.config["tags"], undefined);
  assert.equal(
    commands.some((command) => command instanceof ListLogGroupTagsForResourceCommand),
    false
  );
});

test("ALL 스캔은 generic Alarm보다 이름과 Metric 설정이 있는 전용 조회 결과를 우선한다", () => {
  const alarmArn = "arn:aws:cloudwatch:ap-northeast-2:123456789012:alarm:api-request-count";
  const genericRecord = safeRecord("AWS::CloudWatch::Alarm", alarmArn, "Alarm · generic");
  const detailedRecord: AwsDiscoveredResourceRecord = {
    ...genericRecord,
    displayName: "api-request-count",
    config: {
      alarmName: "api-request-count",
      comparisonOperator: "GreaterThanThreshold",
      evaluationPeriods: 3,
      metricName: "RequestCountPerTarget",
      namespace: "AWS/ApplicationELB",
      period: 60,
      statistic: "Sum",
      threshold: 100
    }
  };

  const records = uniqueDiscoveredRecordsByProviderId([genericRecord, detailedRecord]);

  assert.equal(records.length, 1);
  assert.deepEqual(records[0], detailedRecord);
});

test("ELBv2와 CloudFront reader 선택은 ALL 및 직접 선택 범위에 맞춰 켠다", () => {
  assert.deepEqual(createAwsReverseEngineeringReaderPlan(scanInput(["ALL"])), {
    loadBalancers: true,
    cloudFrontDistributions: true,
    ecsResources: true,
    eventBridgeResources: true,
    detailedResources: true,
    deploymentSupportResources: true,
    cloudControlResources: true,
    unknownResources: true
  });
  assert.deepEqual(createAwsReverseEngineeringReaderPlan(scanInput(["LOAD_BALANCER"])), {
    loadBalancers: true,
    cloudFrontDistributions: false,
    ecsResources: false,
    eventBridgeResources: false,
    detailedResources: false,
    deploymentSupportResources: false,
    cloudControlResources: false,
    unknownResources: true
  });
  for (const resourceType of ["LOAD_BALANCER_TARGET_GROUP", "LOAD_BALANCER_LISTENER"] as const) {
    assert.deepEqual(createAwsReverseEngineeringReaderPlan(scanInput([resourceType])), {
      loadBalancers: true,
      cloudFrontDistributions: false,
      ecsResources: false,
      eventBridgeResources: false,
      detailedResources: false,
      deploymentSupportResources: false,
      cloudControlResources: resourceType === "LOAD_BALANCER_TARGET_GROUP",
      unknownResources: true
    });
  }
  assert.deepEqual(createAwsReverseEngineeringReaderPlan(scanInput(["CLOUDFRONT"])), {
    loadBalancers: false,
    cloudFrontDistributions: true,
    ecsResources: false,
    eventBridgeResources: false,
    detailedResources: false,
    deploymentSupportResources: true,
    cloudControlResources: false,
    unknownResources: true
  });
  assert.deepEqual(createAwsReverseEngineeringReaderPlan(scanInput(["UNKNOWN"])), {
    loadBalancers: false,
    cloudFrontDistributions: false,
    ecsResources: false,
    eventBridgeResources: false,
    detailedResources: false,
    deploymentSupportResources: false,
    cloudControlResources: false,
    unknownResources: true
  });

  for (const resourceType of ["ECS_CLUSTER", "ECS_SERVICE", "ECS_TASK_DEFINITION"] as const) {
    assert.deepEqual(createAwsReverseEngineeringReaderPlan(scanInput([resourceType])), {
      loadBalancers: false,
      cloudFrontDistributions: false,
      ecsResources: true,
      eventBridgeResources: false,
      detailedResources: false,
      deploymentSupportResources: false,
      cloudControlResources: false,
      unknownResources: false
    });
  }
});

test("Cloud Control은 전용 reader가 없는 선택 종류와 하위 구성만 읽는다", () => {
  assert.deepEqual(
    getAwsCloudControlProviderResourceTypes(scanInput(["DYNAMODB_TABLE"])),
    ["AWS::DynamoDB::GlobalTable", "AWS::DynamoDB::Table"]
  );
  assert.deepEqual(getAwsCloudControlProviderResourceTypes(scanInput(["LAMBDA"])), [
    "AWS::Lambda::Alias",
    "AWS::Lambda::EventSourceMapping"
  ]);
  assert.deepEqual(getAwsCloudControlProviderResourceTypes(scanInput(["VPC"])), []);
  assert.deepEqual(
    getAwsCloudControlProviderResourceTypes(scanInput(["API_GATEWAY_WEBSOCKET_API"])),
    []
  );
});

test("AWS catalog의 모든 scan 선택은 실제 reader 경로를 가진다", () => {
  const directResourceGroupTypes = [
    "VPC",
    "SUBNET",
    "ELASTIC_IP",
    "NAT_GATEWAY",
    "INTERNET_GATEWAY",
    "ROUTE_TABLE",
    "SECURITY_GROUP",
    "EC2",
    "RDS",
    "S3"
  ] as const;
  // 이 세 종류는 UNKNOWN group 안에서 Resource Explorer보다 정확한 전용 inventory reader를 연다.
  const targetedGenericInventoryTypes = new Set([
    "AMI",
    "CLOUDWATCH_LOG_GROUP",
    "CLOUDWATCH_METRIC_ALARM"
  ]);
  const missingReaderRoutes = [
    ...new Set(reverseEngineeringAwsResourceCatalog.map((entry) => entry.scanSelection))
  ].filter((resourceType) => {
    const input = scanInput([resourceType]);
    const plan = createAwsReverseEngineeringReaderPlan(input);
    const hasDedicatedReader =
      directResourceGroupTypes.some((directType) => shouldReadResourceGroup(input, directType)) ||
      plan.loadBalancers ||
      plan.cloudFrontDistributions ||
      plan.ecsResources ||
      plan.eventBridgeResources ||
      plan.detailedResources ||
      plan.deploymentSupportResources ||
      (targetedGenericInventoryTypes.has(resourceType) && plan.unknownResources);
    const hasCloudControlReader = getAwsCloudControlProviderResourceTypes(input).length > 0;

    return !hasDedicatedReader && !hasCloudControlReader;
  });

  assert.deepEqual(missingReaderRoutes, []);
});

test("review-only 별칭도 parent scan의 Cloud Control reader로 전달한다", () => {
  for (const { scanSelection, providerResourceType } of [
    {
      scanSelection: "LOAD_BALANCER_TARGET_GROUP",
      providerResourceType: "AWS::ElasticLoadBalancingV2::TargetGroupAttachment"
    },
    {
      scanSelection: "ECR_REPOSITORY",
      providerResourceType: "AWS::ECR::LifecyclePolicy"
    },
    {
      scanSelection: "ACM_CERTIFICATE",
      providerResourceType: "AWS::CertificateManager::CertificateValidation"
    },
    {
      scanSelection: "RDS_CLUSTER",
      providerResourceType: "AWS::RDS::DBClusterInstance"
    }
  ] as const) {
    assert.ok(
      getAwsCloudControlProviderResourceTypes(scanInput([scanSelection])).includes(
        providerResourceType
      ),
      `${providerResourceType} Cloud Control route`
    );
  }
});

test("전용 상세 reader만 필요한 종류는 generic inventory 중복 조회를 끈다", () => {
  for (const resourceType of [
    "IAM_ROLE",
    "IAM_POLICY",
    "IAM_INSTANCE_PROFILE",
    "LAMBDA_PERMISSION",
    "KMS_KEY",
    "KMS_ALIAS"
  ] as const) {
    const input = scanInput([resourceType]);
    const plan = createAwsReverseEngineeringReaderPlan(input);

    assert.equal(plan.detailedResources, true, `${resourceType} 상세 reader`);
    assert.equal(plan.unknownResources, false, `${resourceType} UNKNOWN 중복 방지`);
    assert.equal(shouldReadUnknownResourceGroup(input), false);
  }

  const lambdaPlan = createAwsReverseEngineeringReaderPlan(scanInput(["LAMBDA"]));
  assert.equal(lambdaPlan.detailedResources, true, "LAMBDA 상세 reader");
  assert.equal(lambdaPlan.cloudControlResources, true, "LAMBDA 하위 구성 inventory");
  assert.equal(lambdaPlan.unknownResources, true, "LAMBDA generic fallback");

  for (const resourceType of [
    "API_GATEWAY_REST_API",
    "API_GATEWAY_AUTHORIZER",
    "API_GATEWAY_RESOURCE",
    "API_GATEWAY_METHOD",
    "API_GATEWAY_INTEGRATION",
    "API_GATEWAY_DEPLOYMENT",
    "API_GATEWAY_STAGE",
    "API_GATEWAY_WEBSOCKET_API",
    "API_GATEWAY_V2_ROUTE",
    "API_GATEWAY_V2_INTEGRATION",
    "API_GATEWAY_V2_STAGE"
  ] as const) {
    const plan = createAwsReverseEngineeringReaderPlan(scanInput([resourceType]));

    assert.equal(plan.detailedResources, true, `${resourceType} 상세 reader`);
    assert.equal(plan.cloudControlResources, false, `${resourceType} Cloud Control 중복 조회 방지`);
    assert.equal(plan.unknownResources, false, `${resourceType} generic inventory 중복 조회 방지`);
  }

  const unknownPlan = createAwsReverseEngineeringReaderPlan(scanInput(["UNKNOWN"]));
  assert.equal(unknownPlan.detailedResources, false);
  assert.equal(unknownPlan.unknownResources, true);
});

test("배포 지원 상세 reader를 선택해도 generic inventory fallback을 함께 유지한다", () => {
  for (const resourceType of [
    "ECR_REPOSITORY",
    "SECRETS_MANAGER_SECRET",
    "APPLICATION_AUTO_SCALING_TARGET",
    "APPLICATION_AUTO_SCALING_POLICY",
    "CLOUDFRONT"
  ] as const) {
    const input = scanInput([resourceType]);
    const plan = createAwsReverseEngineeringReaderPlan(input);

    assert.equal(plan.deploymentSupportResources, true, `${resourceType} 상세 reader`);
    assert.equal(plan.unknownResources, true, `${resourceType} generic fallback`);
    assert.equal(shouldReadUnknownResourceGroup(input), true);
  }
});

test("전용 reader가 없는 AWS 종류도 generic inventory에서 찾는다", () => {
  for (const resourceType of [
    "DYNAMODB_TABLE",
    "EFS_FILE_SYSTEM",
    "ROUTE53_ZONE",
    "SQS_QUEUE",
    "EKS_CLUSTER",
    "CLOUDTRAIL"
  ] as const) {
    const input = scanInput([resourceType]);
    const plan = createAwsReverseEngineeringReaderPlan(input);

    assert.equal(plan.unknownResources, true, `${resourceType} inventory fallback`);
    assert.equal(shouldReadUnknownResourceGroup(input), true);
  }
});

test("배포 지원 상세 reader가 실패하면 generic inventory 결과를 보존한다", async () => {
  const awsConnection: AwsConnection = {
    id: "aws-connection-fallback",
    userId: "user-test",
    accountId: "111122223333",
    roleArn: "arn:aws:iam::111122223333:role/SketchCatchRole",
    externalId: "external-id-test",
    region: "ap-northeast-2",
    status: "verified",
    lastVerifiedAt: "2026-07-23T00:00:00.000Z",
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z"
  };
  const generic = safeRecord(
    "AWS::ECR::Repository",
    "arn:aws:ecr:ap-northeast-2:111122223333:repository/audience-api",
    "audience-api"
  );
  const options = {
    prepareCredentials: async () => credentials,
    readDeploymentSupportResources: async () => ({
      records: [],
      scanErrors: [
        {
          id: "scan-error-service-ecr",
          serviceKey: "ecr",
          resourceType: "ECR_REPOSITORY" as const,
          stage: "provider_api" as const,
          reason: "permission_denied" as const,
          message: "이 서비스를 읽을 권한이 부족합니다.",
          retryable: false
        }
      ]
    }),
    readUnknownResources: async () => ({ records: [generic], scanErrors: [] })
  };

  const discoveryResult = await createAwsReverseEngineeringGateway(
    awsConnection,
    options
  ).discoverResources(scanInput(["ECR_REPOSITORY"]));
  const result = Array.isArray(discoveryResult)
    ? { records: discoveryResult, scanErrors: [] }
    : discoveryResult;

  assert.deepEqual(result.records, [generic]);
  assert.equal(result.scanErrors[0]?.serviceKey, "ecr");
});

test("ELB와 ECR을 함께 선택하면 두 family의 generic fallback을 모두 보존한다", () => {
  const loadBalancer = safeRecord(
    "AWS::ElasticLoadBalancingV2::LoadBalancer",
    "arn:aws:elasticloadbalancing:ap-northeast-2:111122223333:loadbalancer/app/web/one",
    "web"
  );
  const repository = safeRecord(
    "AWS::ECR::Repository",
    "arn:aws:ecr:ap-northeast-2:111122223333:repository/api",
    "api"
  );
  const secret = safeRecord(
    "AWS::SecretsManager::Secret",
    "arn:aws:secretsmanager:ap-northeast-2:111122223333:secret:not-selected",
    "not-selected"
  );

  const result = filterGenericSelectedFallback(
    scanInput(["LOAD_BALANCER", "ECR_REPOSITORY"]),
    { records: [loadBalancer, repository, secret], scanErrors: [] }
  );

  assert.deepEqual(result.records, [loadBalancer, repository]);
});

test("generic inventory는 사용자가 선택한 새 AWS 종류만 남긴다", () => {
  const table = safeRecord(
    "AWS::DynamoDB::Table",
    "arn:aws:dynamodb:ap-northeast-2:111122223333:table/orders",
    "orders"
  );
  const queue = safeRecord(
    "AWS::SQS::Queue",
    "arn:aws:sqs:ap-northeast-2:111122223333:jobs",
    "jobs"
  );

  const result = filterGenericSelectedFallback(scanInput(["DYNAMODB_TABLE"]), {
    records: [table, queue],
    scanErrors: []
  });

  assert.deepEqual(result.records, [table]);
});

test("generic OAC ARN과 상세 OAC ID는 한 Resource로 합치고 상세 설정을 우선한다", () => {
  const id = "E123OAC";
  const generic = safeRecord(
    "AWS::CloudFront::OriginAccessControl",
    `arn:aws:cloudfront::111122223333:origin-access-control/${id}`,
    "Origin Access Control · generic"
  );
  const detailed: AwsDiscoveredResourceRecord = {
    ...safeRecord("AWS::CloudFront::OriginAccessControl", id, "audience-web-oac"),
    config: {
      id,
      name: "audience-web-oac",
      originAccessControlOriginType: "s3",
      signingBehavior: "always",
      signingProtocol: "sigv4"
    },
    serverOnly: { terraformImportId: id }
  };

  const records = uniqueDiscoveredRecordsByProviderId([generic, detailed]);

  assert.equal(records.length, 1);
  assert.equal(records[0]?.providerResourceId, id);
  assert.equal(records[0]?.config["signingProtocol"], "sigv4");
});

test("gateway는 선택한 상세 reader를 주입 credential로 한 번 실행하고 결과를 합친다", async () => {
  const awsConnection: AwsConnection = {
    id: "aws-connection-test",
    userId: "user-test",
    accountId: "111122223333",
    roleArn: "arn:aws:iam::111122223333:role/SketchCatchRole",
    externalId: "external-id-test",
    region: "ap-northeast-2",
    status: "verified",
    lastVerifiedAt: "2026-07-23T00:00:00.000Z",
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z"
  };
  const calls: AwsProviderScanInput[] = [];
  const gateway = createAwsReverseEngineeringGateway(awsConnection, {
    prepareCredentials: async () => credentials,
    readDetailedResources: async (input, receivedCredentials) => {
      calls.push(input);
      assert.deepEqual(receivedCredentials, credentials);
      return {
        records: [safeRecord("AWS::IAM::Role", "aws-ref-role", "app-role")],
        scanErrors: []
      };
    }
  });

  const result = await gateway.discoverResources(scanInput(["IAM_ROLE"]));

  if (Array.isArray(result)) {
    assert.fail("상세 gateway는 scan error를 보존하는 discovery result를 반환해야 합니다.");
  }
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]?.resourceTypes, ["IAM_ROLE"]);
  assert.deepEqual(result.records, [safeRecord("AWS::IAM::Role", "aws-ref-role", "app-role")]);
  assert.deepEqual(result.scanErrors, []);
});

test("EventBridge reader 선택은 ALL과 Rule/Target 동시 선택에서도 한 번만 켜진다", () => {
  assert.equal(
    createAwsReverseEngineeringReaderPlan(scanInput(["ALL"])).eventBridgeResources,
    true
  );
  assert.equal(
    createAwsReverseEngineeringReaderPlan(scanInput(["EVENTBRIDGE_RULE", "EVENTBRIDGE_TARGET"]))
      .eventBridgeResources,
    true
  );
  assert.equal(
    createAwsReverseEngineeringReaderPlan(scanInput(["EVENTBRIDGE_RULE"])).eventBridgeResources,
    true
  );
});

test("같은 AWS 서비스의 반복 실패는 사용자 결과에서 한 번만 남긴다", () => {
  const errors = deduplicateReverseEngineeringScanErrors([
    {
      id: "scan-error-service-ec2",
      resourceType: "VPC",
      stage: "provider_api",
      reason: "provider_error",
      message: "VPC temporary error",
      retryable: true
    },
    {
      id: "scan-error-service-ec2",
      resourceType: "SUBNET",
      stage: "provider_api",
      reason: "permission_denied",
      message: "Subnet denied",
      retryable: false
    },
    {
      id: "scan-error-service-ecs",
      resourceType: "ECS_SERVICE",
      stage: "provider_api",
      reason: "throttled",
      message: "ECS throttled",
      retryable: true
    }
  ]);

  assert.deepEqual(
    errors.map(({ id, reason, resourceType, retryable }) => ({
      id,
      reason,
      resourceType,
      retryable
    })),
    [
      {
        id: "scan-error-service-ec2",
        reason: "permission_denied",
        resourceType: "SUBNET",
        retryable: false
      },
      {
        id: "scan-error-service-ecs",
        reason: "throttled",
        resourceType: "ECS_SERVICE",
        retryable: true
      }
    ]
  );
});

test("ECS reader는 cluster/service pagination과 공유 Task Definition dedupe를 지키며 환경 값을 제외한다", async () => {
  const clusterA = "arn:aws:ecs:ap-northeast-2:123456789012:cluster/orders";
  const clusterB = "arn:aws:ecs:ap-northeast-2:123456789012:cluster/empty";
  const serviceA = "arn:aws:ecs:ap-northeast-2:123456789012:service/orders/api";
  const serviceB = "arn:aws:ecs:ap-northeast-2:123456789012:service/orders/worker";
  const taskDefinition = "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/orders:7";
  const commands: object[] = [];
  const result = await readEcsResourcesWithDiagnostics("ap-northeast-2", credentials, () => ({
    async send(command: object): Promise<unknown> {
      commands.push(command);

      if (command instanceof ListClustersCommand) {
        return command.input.nextToken
          ? { clusterArns: [clusterB] }
          : { clusterArns: [clusterA], nextToken: "clusters-page-2" };
      }

      if (command instanceof DescribeClustersCommand) {
        return {
          clusters: [
            {
              clusterArn: clusterA,
              clusterName: "orders",
              status: "ACTIVE",
              configuration: {
                executeCommandConfiguration: {
                  logging: "DEFAULT"
                }
              },
              capacityProviders: ["FARGATE", "FARGATE_SPOT"]
            },
            {
              clusterArn: clusterB,
              clusterName: "empty",
              status: "ACTIVE"
            }
          ]
        };
      }

      if (command instanceof ListServicesCommand) {
        if (command.input.cluster === clusterB) {
          return { serviceArns: [] };
        }

        return command.input.nextToken
          ? { serviceArns: [serviceB] }
          : { serviceArns: [serviceA], nextToken: "services-page-2" };
      }

      if (command instanceof DescribeServicesCommand) {
        return {
          services: [
            {
              serviceArn: serviceA,
              serviceName: "api",
              clusterArn: clusterA,
              taskDefinition,
              desiredCount: 2,
              launchType: "FARGATE",
              networkConfiguration: {
                awsvpcConfiguration: {
                  subnets: ["subnet-private-a"],
                  securityGroups: ["sg-api"],
                  assignPublicIp: "DISABLED"
                }
              },
              loadBalancers: [
                {
                  targetGroupArn:
                    "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/api/one",
                  containerName: "api",
                  containerPort: 4000
                }
              ]
            },
            {
              serviceArn: serviceB,
              serviceName: "worker",
              clusterArn: clusterA,
              taskDefinition,
              desiredCount: 1,
              capacityProviderStrategy: [{ capacityProvider: "FARGATE_SPOT", weight: 1 }],
              networkConfiguration: {
                awsvpcConfiguration: {
                  subnets: ["subnet-private-a"],
                  securityGroups: ["sg-worker"],
                  assignPublicIp: "DISABLED"
                }
              }
            }
          ]
        };
      }

      if (command instanceof DescribeTaskDefinitionCommand) {
        return {
          taskDefinition: {
            taskDefinitionArn: taskDefinition,
            family: "orders",
            revision: 7,
            networkMode: "awsvpc",
            requiresCompatibilities: ["FARGATE"],
            cpu: "512",
            memory: "1024",
            executionRoleArn: "arn:aws:iam::123456789012:role/ecs-execution",
            taskRoleArn: "arn:aws:iam::123456789012:role/orders-task",
            containerDefinitions: [
              {
                name: "api",
                image: "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/orders:stable",
                essential: true,
                environment: [{ name: "API_TOKEN", value: "must-not-leak" }],
                secrets: [
                  {
                    name: "DATABASE_URL",
                    valueFrom: "arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:db"
                  }
                ],
                portMappings: [{ containerPort: 4000, protocol: "tcp" }],
                rawSdkField: "must-not-copy"
              }
            ],
            $metadata: { requestId: "must-not-copy" }
          },
          $metadata: { requestId: "must-not-copy" }
        };
      }

      throw new Error(`Unexpected ECS command: ${command.constructor.name}`);
    }
  }));

  assert.deepEqual(result.scanErrors, []);
  assert.deepEqual(
    commands
      .filter((command) => command instanceof ListClustersCommand)
      .map((command) => command.input.nextToken),
    [undefined, "clusters-page-2"]
  );
  assert.deepEqual(
    commands
      .filter(
        (command): command is DescribeClustersCommand => command instanceof DescribeClustersCommand
      )
      .map((command) => command.input),
    [{ clusters: [clusterA, clusterB], include: ["CONFIGURATIONS"] }]
  );
  assert.deepEqual(
    commands
      .filter(
        (command): command is ListServicesCommand =>
          command instanceof ListServicesCommand && command.input.cluster === clusterA
      )
      .map((command) => command.input.nextToken),
    [undefined, "services-page-2"]
  );
  assert.equal(
    commands.filter((command) => command instanceof DescribeTaskDefinitionCommand).length,
    1
  );
  assert.deepEqual(
    result.records.map((record) => record.providerResourceType),
    [
      "AWS::ECS::Cluster",
      "AWS::ECS::Cluster",
      "AWS::ECS::Service",
      "AWS::ECS::Service",
      "AWS::ECS::TaskDefinition"
    ]
  );
  assert.deepEqual(
    result.records.map((record) => record.providerResourceId),
    [clusterA, clusterB, serviceA, serviceB, taskDefinition]
  );

  const apiService = result.records.find((record) => record.providerResourceId === serviceA);
  assert.deepEqual(apiService?.relationships, [
    { type: "depends_on", targetProviderResourceId: clusterA },
    { type: "depends_on", targetProviderResourceId: taskDefinition }
  ]);
  const taskDefinitionRecord = result.records.find(
    (record) => record.providerResourceId === taskDefinition
  );
  assert.equal(taskDefinitionRecord?.config["requiresManualEnvironmentInput"], true);
  assert.deepEqual(taskDefinitionRecord?.config["containerDefinitions"], [
    {
      name: "api",
      image: "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/orders:stable",
      essential: true,
      portMappings: [{ containerPort: 4000, protocol: "tcp" }],
      secrets: [
        {
          name: "DATABASE_URL",
          valueFrom: "arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:db"
        }
      ]
    }
  ]);
  assert.doesNotMatch(JSON.stringify(result), /must-not-leak|must-not-copy|\$metadata/);
});

test("ECS cluster later-page failure keeps and describes accumulated cluster ARNs", async () => {
  const clusterArn = "arn:aws:ecs:ap-northeast-2:123456789012:cluster/orders";
  const commands: object[] = [];
  const result = await readEcsResourcesWithDiagnostics("ap-northeast-2", credentials, () => ({
    async send(command: object): Promise<unknown> {
      commands.push(command);
      if (command instanceof ListClustersCommand) {
        if (command.input.nextToken) {
          throw new Error("InternalServerException RequestId private-request-id");
        }
        return { clusterArns: [clusterArn], nextToken: "page-2" };
      }
      if (command instanceof DescribeClustersCommand) {
        return { clusters: [{ clusterArn, clusterName: "orders", status: "ACTIVE" }] };
      }
      if (command instanceof ListServicesCommand) return { serviceArns: [] };
      throw new Error(`Unexpected ECS command: ${command.constructor.name}`);
    }
  }));

  assert.deepEqual(
    result.records.map((record) => record.providerResourceId),
    [clusterArn]
  );
  assert.deepEqual(
    commands
      .filter(
        (command): command is DescribeClustersCommand => command instanceof DescribeClustersCommand
      )
      .map((command) => command.input.clusters),
    [[clusterArn]]
  );
  assert.equal(result.scanErrors.length, 1);
  assert.equal(result.scanErrors[0]?.resourceType, "ECS_CLUSTER");
  assert.doesNotMatch(JSON.stringify(result.scanErrors), /RequestId|private-request-id/iu);
});

test("ECS service later-page failure keeps describing accumulated services and task definitions", async () => {
  const clusterArn = "arn:aws:ecs:ap-northeast-2:123456789012:cluster/orders";
  const serviceArn = "arn:aws:ecs:ap-northeast-2:123456789012:service/orders/api";
  const taskDefinitionArn = "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/orders:1";
  const commands: object[] = [];
  const result = await readEcsResourcesWithDiagnostics("ap-northeast-2", credentials, () => ({
    async send(command: object): Promise<unknown> {
      commands.push(command);
      if (command instanceof ListClustersCommand) return { clusterArns: [clusterArn] };
      if (command instanceof DescribeClustersCommand) {
        return { clusters: [{ clusterArn, clusterName: "orders", status: "ACTIVE" }] };
      }
      if (command instanceof ListServicesCommand) {
        if (command.input.nextToken) {
          throw new Error("InternalServerException RequestId private-service-request");
        }
        return { serviceArns: [serviceArn], nextToken: "page-2" };
      }
      if (command instanceof DescribeServicesCommand) {
        return {
          services: [
            {
              serviceArn,
              serviceName: "api",
              clusterArn,
              taskDefinition: taskDefinitionArn
            }
          ]
        };
      }
      if (command instanceof DescribeTaskDefinitionCommand) {
        return {
          taskDefinition: {
            taskDefinitionArn,
            family: "orders",
            revision: 1,
            containerDefinitions: []
          }
        };
      }
      throw new Error(`Unexpected ECS command: ${command.constructor.name}`);
    }
  }));

  assert.deepEqual(
    result.records.map((record) => record.providerResourceId),
    [clusterArn, serviceArn, taskDefinitionArn]
  );
  assert.deepEqual(
    commands
      .filter(
        (command): command is DescribeServicesCommand => command instanceof DescribeServicesCommand
      )
      .map((command) => command.input.services),
    [[serviceArn]]
  );
  assert.equal(result.scanErrors.length, 1);
  assert.equal(result.scanErrors[0]?.resourceType, "ECS_SERVICE");
  assert.doesNotMatch(JSON.stringify(result.scanErrors), /RequestId|private-service-request/iu);
});

test("한 Cluster의 service 조회 실패는 다른 ECS 결과를 유지하고 하위 group scanError로 남긴다", async () => {
  const healthyCluster = "arn:aws:ecs:ap-northeast-2:123456789012:cluster/healthy";
  const deniedCluster = "arn:aws:ecs:ap-northeast-2:123456789012:cluster/denied";
  const healthyService = "arn:aws:ecs:ap-northeast-2:123456789012:service/healthy/api";
  const result = await readEcsResourcesWithDiagnostics("ap-northeast-2", credentials, () => ({
    async send(command: object): Promise<unknown> {
      if (command instanceof ListClustersCommand) {
        return { clusterArns: [healthyCluster, deniedCluster] };
      }
      if (command instanceof DescribeClustersCommand) {
        return {
          clusters: [
            { clusterArn: healthyCluster, clusterName: "healthy", status: "ACTIVE" },
            { clusterArn: deniedCluster, clusterName: "denied", status: "ACTIVE" }
          ]
        };
      }
      if (command instanceof ListServicesCommand) {
        if (command.input.cluster === deniedCluster) {
          throw new Error(
            "AccessDeniedException: arn:aws:iam::123456789012:role/internal cannot call ecs:ListServices RequestId: private-request-id"
          );
        }
        return { serviceArns: [healthyService] };
      }
      if (command instanceof DescribeServicesCommand) {
        return {
          services: [
            {
              serviceArn: healthyService,
              serviceName: "api",
              clusterArn: healthyCluster,
              desiredCount: 1,
              launchType: "FARGATE"
            }
          ]
        };
      }
      throw new Error(`Unexpected ECS command: ${command.constructor.name}`);
    }
  }));

  assert.deepEqual(
    result.records.map((record) => record.providerResourceId),
    [healthyCluster, deniedCluster, healthyService]
  );
  assert.equal(result.scanErrors.length, 1);
  assert.equal(result.scanErrors[0]?.resourceType, "ECS_SERVICE");
  assert.equal(result.scanErrors[0]?.reason, "permission_denied");
  assert.doesNotMatch(result.scanErrors[0]?.message ?? "", /123456789012/);
  assert.doesNotMatch(
    result.scanErrors[0]?.message ?? "",
    /AccessDenied|arn:aws|ListServices|RequestId|private-request-id/
  );
});

test("ALB reader는 pagination을 끝까지 읽고 실제 VPC, Security Group, Subnet 관계만 정규화한다", async () => {
  const commands: object[] = [];
  const records = await listApplicationLoadBalancers("ap-northeast-2", credentials, () => ({
    async send(command: object): Promise<unknown> {
      commands.push(command);
      return commands.length === 1
        ? {
            LoadBalancers: [
              {
                LoadBalancerArn:
                  "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/orders/one",
                LoadBalancerName: "orders",
                Type: "application",
                Scheme: "internet-facing",
                DNSName: "orders-123.ap-northeast-2.elb.amazonaws.com",
                VpcId: "vpc-orders",
                SecurityGroups: ["sg-web"],
                AvailabilityZones: [{ ZoneName: "ap-northeast-2a", SubnetId: "subnet-public-a" }],
                State: { Code: "active" },
                IpAddressType: "ipv4"
              },
              {
                LoadBalancerArn:
                  "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/net/not-an-alb/two",
                LoadBalancerName: "not-an-alb",
                Type: "network"
              }
            ],
            NextMarker: "next-page"
          }
        : { LoadBalancers: [] };
    }
  }));

  assert.equal(commands.length, 2);
  assert.ok(commands[0] instanceof DescribeLoadBalancersCommand);
  assert.ok(commands[1] instanceof DescribeLoadBalancersCommand);
  assert.equal((commands[0] as DescribeLoadBalancersCommand).input.Marker, undefined);
  assert.equal((commands[1] as DescribeLoadBalancersCommand).input.Marker, "next-page");
  assert.deepEqual(records, [
    {
      providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
      providerResourceId:
        "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/orders/one",
      displayName: "orders",
      region: "ap-northeast-2",
      config: {
        arn: "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/orders/one",
        name: "orders",
        type: "application",
        ipAddressType: "ipv4",
        scheme: "internet-facing",
        dnsName: "orders-123.ap-northeast-2.elb.amazonaws.com",
        vpcId: "vpc-orders",
        securityGroupIds: ["sg-web"],
        subnetIds: ["subnet-public-a"],
        availabilityZones: [{ availabilityZone: "ap-northeast-2a", subnetId: "subnet-public-a" }]
      },
      relationships: [
        { type: "depends_on", targetProviderResourceId: "vpc-orders" },
        { type: "attached_to", targetProviderResourceId: "sg-web" }
      ]
    }
  ]);
});

test("ALB later-page failure returns earlier records with one safe diagnostic outcome", async () => {
  const failures: Array<{ outcome: string }> = [];
  let calls = 0;
  const records = await listApplicationLoadBalancers(
    "ap-northeast-2",
    credentials,
    () => ({
      async send(): Promise<unknown> {
        calls += 1;
        if (calls === 2) {
          throw new Error(
            "InternalServerException RequestId private-request " +
              "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/private"
          );
        }
        return {
          LoadBalancers: [
            {
              LoadBalancerArn:
                "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/orders/one",
              LoadBalancerName: "orders",
              Type: "application"
            }
          ],
          NextMarker: "page-2"
        };
      }
    }),
    (failure) => failures.push(failure)
  );

  assert.equal(records.length, 1);
  assert.deepEqual(failures, [{ outcome: "transient" }]);
  assert.doesNotMatch(JSON.stringify(failures), /RequestId|private-request|arn:aws/iu);
});

test("CloudFront reader는 exact Distribution config와 태그를 모두 보존한다", async () => {
  const commands: object[] = [];
  const records = await listCloudFrontDistributions("ap-northeast-2", credentials, () => ({
    async send(command: object): Promise<unknown> {
      commands.push(command);
      if (command instanceof ListDistributionsCommand) {
        return {
          DistributionList: {
            Items: [
              {
                ARN: "arn:aws:cloudfront::123456789012:distribution/EDISTRIBUTION",
                Id: "EDISTRIBUTION",
                DomainName: "d111111abcdef8.cloudfront.net",
                Status: "Deployed"
              }
            ]
          }
        };
      }
      if (command instanceof GetDistributionConfigCommand) {
        return {
          DistributionConfig: {
            CallerReference: "caller-reference",
            Aliases: { Quantity: 1, Items: ["app.example.com"] },
            DefaultRootObject: "index.html",
            Origins: {
              Quantity: 2,
              Items: [
                {
                  Id: "web-assets",
                  DomainName: "web.s3.ap-northeast-2.amazonaws.com",
                  OriginAccessControlId: "E123OAC"
                },
                {
                  Id: "api-alb",
                  DomainName: "orders-123.ap-northeast-2.elb.amazonaws.com",
                  CustomOriginConfig: {
                    HTTPPort: 80,
                    HTTPSPort: 443,
                    OriginProtocolPolicy: "https-only",
                    OriginSslProtocols: { Quantity: 1, Items: ["TLSv1.2"] }
                  }
                }
              ]
            },
            DefaultCacheBehavior: {
              TargetOriginId: "web-assets",
              ViewerProtocolPolicy: "redirect-to-https",
              AllowedMethods: {
                Quantity: 2,
                Items: ["GET", "HEAD"],
                CachedMethods: { Quantity: 2, Items: ["GET", "HEAD"] }
              },
              CachePolicyId: "managed-static"
            },
            CacheBehaviors: {
              Quantity: 2,
              Items: [
                {
                  PathPattern: "/api/*",
                  TargetOriginId: "api-alb",
                  ViewerProtocolPolicy: "redirect-to-https",
                  AllowedMethods: {
                    Quantity: 7,
                    Items: ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"],
                    CachedMethods: { Quantity: 2, Items: ["GET", "HEAD"] }
                  },
                  CachePolicyId: "managed-disabled",
                  OriginRequestPolicyId: "managed-all-viewer"
                },
                {
                  PathPattern: "/health",
                  TargetOriginId: "api-alb",
                  ViewerProtocolPolicy: "redirect-to-https",
                  AllowedMethods: {
                    Quantity: 2,
                    Items: ["GET", "HEAD"],
                    CachedMethods: { Quantity: 2, Items: ["GET", "HEAD"] }
                  },
                  CachePolicyId: "managed-disabled"
                }
              ]
            },
            CustomErrorResponses: { Quantity: 0 },
            Comment: "orders entry",
            Logging: { Enabled: false, IncludeCookies: false, Bucket: "", Prefix: "" },
            PriceClass: "PriceClass_100",
            Enabled: true,
            ViewerCertificate: { CloudFrontDefaultCertificate: true },
            Restrictions: {
              GeoRestriction: { Quantity: 0, RestrictionType: "none" }
            },
            WebACLId: "",
            HttpVersion: "http2and3",
            IsIPV6Enabled: true,
            Staging: false,
            ConnectionMode: "direct"
          }
        };
      }
      if (command instanceof ListCloudFrontTagsForResourceCommand) {
        return { Tags: { Items: [{ Key: "Environment", Value: "demo" }] } };
      }
      throw new Error("unexpected command");
    }
  }));

  assert.equal(commands.length, 3);
  assert.ok(commands[0] instanceof ListDistributionsCommand);
  assert.ok(commands[1] instanceof GetDistributionConfigCommand);
  assert.deepEqual((commands[1] as GetDistributionConfigCommand).input, {
    Id: "EDISTRIBUTION"
  });
  assert.ok(commands[2] instanceof ListCloudFrontTagsForResourceCommand);
  assert.deepEqual((commands[2] as ListCloudFrontTagsForResourceCommand).input, {
    Resource: "arn:aws:cloudfront::123456789012:distribution/EDISTRIBUTION"
  });
  assert.deepEqual(records[0]?.serverOnly?.config, records[0]?.config);
  assert.deepEqual(
    records.map((record) => ({
      ...record,
      serverOnly: { terraformImportId: record.serverOnly?.terraformImportId }
    })),
    [
    {
      providerResourceType: "AWS::CloudFront::Distribution",
      providerResourceId: "arn:aws:cloudfront::123456789012:distribution/EDISTRIBUTION",
      displayName: "d111111abcdef8.cloudfront.net",
      region: "global",
      config: {
        arn: "arn:aws:cloudfront::123456789012:distribution/EDISTRIBUTION",
        accountId: "123456789012",
        id: "EDISTRIBUTION",
        domainName: "d111111abcdef8.cloudfront.net",
        aliases: ["app.example.com"],
        comment: "orders entry",
        configReadComplete: true,
        customErrorResponse: [],
        defaultRootObject: "index.html",
        enabled: true,
        httpVersion: "http2and3",
        isIpv6Enabled: true,
        loggingConfig: {
          enabled: false,
          includeCookies: false,
          bucket: "",
          prefix: ""
        },
        orderedCacheBehavior: [
          {
            pathPattern: "/api/*",
            targetOriginId: "api-alb",
            viewerProtocolPolicy: "redirect-to-https",
            allowedMethods: ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"],
            cachedMethods: ["GET", "HEAD"],
            cachePolicyId: "managed-disabled",
            originRequestPolicyId: "managed-all-viewer"
          },
          {
            pathPattern: "/health",
            targetOriginId: "api-alb",
            viewerProtocolPolicy: "redirect-to-https",
            allowedMethods: ["GET", "HEAD"],
            cachedMethods: ["GET", "HEAD"],
            cachePolicyId: "managed-disabled"
          }
        ],
        status: "Deployed",
        origin: [
          {
            originId: "web-assets",
            domainName: "web.s3.ap-northeast-2.amazonaws.com",
            originAccessControlId: "E123OAC"
          },
          {
            originId: "api-alb",
            domainName: "orders-123.ap-northeast-2.elb.amazonaws.com",
            customOriginConfig: {
              httpPort: 80,
              httpsPort: 443,
              originProtocolPolicy: "https-only",
              originSslProtocols: ["TLSv1.2"]
            }
          }
        ],
        defaultCacheBehavior: {
          targetOriginId: "web-assets",
          viewerProtocolPolicy: "redirect-to-https",
          allowedMethods: ["GET", "HEAD"],
          cachedMethods: ["GET", "HEAD"],
          cachePolicyId: "managed-static"
        },
        priceClass: "PriceClass_100",
        restrictions: { geoRestriction: { restrictionType: "none" } },
        staging: false,
        tags: [{ key: "Environment", value: "demo" }],
        tagsReadComplete: true,
        terraformImportId: "EDISTRIBUTION",
        viewerCertificate: { cloudfrontDefaultCertificate: true },
        webAclId: ""
      },
      relationships: [],
      serverOnly: { terraformImportId: "EDISTRIBUTION" }
    }
    ]
  );
});

test("CloudFront custom origin header는 원문을 버리고 존재 marker만 남긴다", async () => {
  const records = await listCloudFrontDistributions("ap-northeast-2", credentials, () => ({
    async send(command): Promise<unknown> {
      if (command instanceof ListDistributionsCommand) {
        return {
          DistributionList: {
            Items: [
              {
                ARN: "arn:aws:cloudfront::123456789012:distribution/EPRIVATEHEADER",
                Id: "EPRIVATEHEADER",
                DomainName: "private-header.cloudfront.net"
              }
            ]
          }
        };
      }
      if (command instanceof GetDistributionConfigCommand) {
        return {
          DistributionConfig: {
            CallerReference: "private-header-fixture",
            Origins: {
              Quantity: 1,
              Items: [
                {
                  Id: "private-origin",
                  DomainName: "origin.example.com",
                  CustomHeaders: {
                    Quantity: 1,
                    Items: [
                      {
                        HeaderName: "X-Origin-Secret",
                        HeaderValue: "synthetic-never-public"
                      }
                    ]
                  },
                  S3OriginConfig: { OriginAccessIdentity: "" }
                }
              ]
            },
            DefaultCacheBehavior: {
              TargetOriginId: "private-origin",
              ViewerProtocolPolicy: "redirect-to-https",
              AllowedMethods: {
                Quantity: 2,
                Items: ["GET", "HEAD"],
                CachedMethods: { Quantity: 2, Items: ["GET", "HEAD"] }
              },
              CachePolicyId: "managed-static"
            },
            Comment: "",
            Enabled: true,
            Restrictions: { GeoRestriction: { Quantity: 0, RestrictionType: "none" } },
            ViewerCertificate: { CloudFrontDefaultCertificate: true },
            PriceClass: "PriceClass_All",
            HttpVersion: "http2",
            IsIPV6Enabled: true
          }
        };
      }
      return { Tags: { Items: [] } };
    }
  }));

  assert.doesNotMatch(JSON.stringify(records), /X-Origin-Secret|synthetic-never-public/u);
  assert.deepEqual(records[0]?.config["origin"], [
    {
      originId: "private-origin",
      domainName: "origin.example.com",
      hasCustomHeaders: true,
      customHeaderCount: 1,
      s3OriginConfig: { originAccessIdentity: "" }
    }
  ]);
  assert.deepEqual(records[0]?.config["unsupportedConfiguration"], [
    "Origins[0].CustomHeaders"
  ]);
  assert.deepEqual(records[0]?.serverOnly?.config?.["origin"], records[0]?.config["origin"]);
});

test("CloudFront reader는 VpcOriginConfig를 보존해 새 Terraform 생성 경계를 판단할 수 있게 한다", async () => {
  const records = await listCloudFrontDistributions("ap-northeast-2", credentials, () => ({
    async send(command): Promise<unknown> {
      if (command instanceof ListDistributionsCommand) {
        return {
          DistributionList: {
            Items: [
              {
                ARN: "arn:aws:cloudfront::123456789012:distribution/EVPCORIGIN",
                Id: "EVPCORIGIN",
                DomainName: "d111111abcdef8.cloudfront.net"
              }
            ]
          }
        };
      }
      if (command instanceof GetDistributionConfigCommand) {
        return {
          DistributionConfig: {
            CallerReference: "fixture",
            Origins: {
              Quantity: 1,
              Items: [
                {
                  Id: "private-origin",
                  DomainName: "internal.example.com",
                  VpcOriginConfig: {
                    VpcOriginId: "vo_0123456789abcdef0",
                    OwnerAccountId: "123456789012",
                    OriginReadTimeout: 30,
                    OriginKeepaliveTimeout: 5
                  }
                }
              ]
            },
            DefaultCacheBehavior: {
              TargetOriginId: "private-origin",
              ViewerProtocolPolicy: "https-only",
              AllowedMethods: {
                Quantity: 2,
                Items: ["GET", "HEAD"],
                CachedMethods: { Quantity: 2, Items: ["GET", "HEAD"] }
              },
              CachePolicyId: "managed-static"
            },
            Comment: "",
            Enabled: true,
            Restrictions: { GeoRestriction: { Quantity: 0, RestrictionType: "none" } },
            ViewerCertificate: { CloudFrontDefaultCertificate: true },
            PriceClass: "PriceClass_All",
            HttpVersion: "http2",
            IsIPV6Enabled: true
          }
        };
      }
      return { Tags: { Items: [] } };
    }
  }));

  assert.deepEqual(records[0]?.config["origin"], [
    {
      originId: "private-origin",
      domainName: "internal.example.com",
      vpcOriginConfig: {
        vpcOriginId: "vo_0123456789abcdef0",
        ownerAccountId: "123456789012",
        originReadTimeout: 30,
        originKeepaliveTimeout: 5
      }
    }
  ]);
});

test("CloudFront 상세 설정 또는 태그 조회 실패는 partial record와 안전한 실패만 남긴다", async () => {
  const failures: Array<{ outcome: string }> = [];
  const records = await listCloudFrontDistributions(
    "ap-northeast-2",
    credentials,
    () => ({
      async send(command): Promise<unknown> {
        if (command instanceof ListDistributionsCommand) {
          return {
            DistributionList: {
              Items: [
                {
                  ARN: "arn:aws:cloudfront::123456789012:distribution/ECONFIGFAIL",
                  Id: "ECONFIGFAIL",
                  DomainName: "config-fail.cloudfront.net",
                  Enabled: true
                },
                {
                  ARN: "arn:aws:cloudfront::123456789012:distribution/ETAGFAIL",
                  Id: "ETAGFAIL",
                  DomainName: "tag-fail.cloudfront.net",
                  Enabled: true
                }
              ]
            }
          };
        }
        if (command instanceof GetDistributionConfigCommand) {
          if (command.input.Id === "ECONFIGFAIL") {
            throw Object.assign(new Error("private config detail"), {
              name: "AccessDenied",
              requestId: "private-request"
            });
          }
          return {
            DistributionConfig: {
              CallerReference: "fixture",
              Origins: {
                Quantity: 1,
                Items: [{ Id: "web", DomainName: "web.example.com" }]
              },
              DefaultCacheBehavior: {
                TargetOriginId: "web",
                ViewerProtocolPolicy: "redirect-to-https",
                AllowedMethods: {
                  Quantity: 2,
                  Items: ["GET", "HEAD"],
                  CachedMethods: { Quantity: 2, Items: ["GET", "HEAD"] }
                },
                CachePolicyId: "managed-static"
              },
              Comment: "",
              Enabled: true,
              Restrictions: { GeoRestriction: { Quantity: 0, RestrictionType: "none" } },
              ViewerCertificate: { CloudFrontDefaultCertificate: true },
              PriceClass: "PriceClass_All",
              HttpVersion: "http2",
              IsIPV6Enabled: true
            }
          };
        }
        if (command instanceof ListCloudFrontTagsForResourceCommand) {
          if (command.input.Resource?.includes("ETAGFAIL")) {
            throw Object.assign(new Error("private tag detail"), {
              name: "ThrottlingException",
              requestId: "private-request"
            });
          }
          return { Tags: { Items: [] } };
        }
        throw new Error("unexpected command");
      }
    }),
    (failure) => failures.push(failure)
  );

  assert.equal(records.length, 2);
  assert.equal(records[0]?.config["configReadComplete"], false);
  assert.equal(records[0]?.config["tagsReadComplete"], true);
  assert.equal(records[1]?.config["configReadComplete"], true);
  assert.equal(records[1]?.config["tagsReadComplete"], false);
  assert.deepEqual(failures, [{ outcome: "permission_denied" }, { outcome: "throttled" }]);
  assert.doesNotMatch(JSON.stringify(failures), /private|request|arn:aws/iu);
});

test("CloudFront origin은 동일 response 증거가 있는 ALB와 S3에만 연결한다", () => {
  const cloudFront: AwsDiscoveredResourceRecord = {
    providerResourceType: "AWS::CloudFront::Distribution",
    providerResourceId: "arn:aws:cloudfront::123456789012:distribution/EDISTRIBUTION",
    displayName: "d111111abcdef8.cloudfront.net",
    region: "global",
    config: {
      origin: [
        { originId: "alb", domainName: "orders-123.ap-northeast-2.elb.amazonaws.com" },
        { originId: "assets", domainName: "assets.example.s3.ap-northeast-2.amazonaws.com" },
        { originId: "unrelated", domainName: "unrelated.example.com" }
      ]
    },
    relationships: []
  };
  const alb: AwsDiscoveredResourceRecord = {
    providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
    providerResourceId:
      "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/orders/one",
    displayName: "orders",
    region: "ap-northeast-2",
    config: { dnsName: "orders-123.ap-northeast-2.elb.amazonaws.com" },
    relationships: []
  };
  const bucket: AwsDiscoveredResourceRecord = {
    providerResourceType: "AWS::S3::Bucket",
    providerResourceId: "assets.example",
    displayName: "assets.example",
    region: "ap-northeast-2",
    config: {},
    relationships: []
  };

  const [resolvedCloudFront] = resolveCloudFrontOriginRelationships([cloudFront, alb, bucket]);

  assert.deepEqual(resolvedCloudFront?.relationships, [
    {
      type: "depends_on",
      targetProviderResourceId:
        "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/orders/one"
    },
    { type: "depends_on", targetProviderResourceId: "assets.example" }
  ]);
});

test("CloudFront S3 origin은 AWS endpoint suffix가 아닌 lookalike hostname에 연결하지 않는다", () => {
  const cloudFront: AwsDiscoveredResourceRecord = {
    providerResourceType: "AWS::CloudFront::Distribution",
    providerResourceId: "arn:aws:cloudfront::123456789012:distribution/ELOOKALIKE",
    displayName: "d111111abcdef8.cloudfront.net",
    region: "global",
    config: {
      origin: [{ originId: "assets", domainName: "assets.example.s3.example.com" }]
    },
    relationships: []
  };
  const bucket: AwsDiscoveredResourceRecord = {
    providerResourceType: "AWS::S3::Bucket",
    providerResourceId: "assets.example",
    displayName: "assets.example",
    region: "ap-northeast-2",
    config: {},
    relationships: []
  };

  const [resolvedCloudFront] = resolveCloudFrontOriginRelationships([cloudFront, bucket]);

  assert.deepEqual(resolvedCloudFront?.relationships, []);
});

test("자동 확장 Target과 OAC는 같은 snapshot의 ECS Service와 Distribution에 exact ID로 연결한다", () => {
  const ecsService: AwsDiscoveredResourceRecord = {
    ...safeRecord(
      "AWS::ECS::Service",
      "arn:aws:ecs:ap-northeast-2:123456789012:service/demo/api",
      "api"
    ),
    config: { clusterName: "demo", name: "api" }
  };
  const target: AwsDiscoveredResourceRecord = {
    ...safeRecord(
      "AWS::ApplicationAutoScaling::ScalableTarget",
      "arn:aws:application-autoscaling:ap-northeast-2:123456789012:scalable-target/one",
      "api 자동 확장"
    ),
    config: { resourceId: "service/demo/api" }
  };
  const oac = safeRecord("AWS::CloudFront::OriginAccessControl", "E123OAC", "web-oac");
  oac.config = { id: "E123OAC" };
  const distribution: AwsDiscoveredResourceRecord = {
    ...safeRecord(
      "AWS::CloudFront::Distribution",
      "arn:aws:cloudfront::123456789012:distribution/EDISTRIBUTION",
      "web"
    ),
    config: { origin: [{ originId: "web", originAccessControlId: "E123OAC" }] }
  };

  const resolved = resolveDeploymentSupportRelationships([ecsService, target, oac, distribution]);
  assert.deepEqual(resolved[1]?.relationships, [
    { type: "depends_on", targetProviderResourceId: ecsService.providerResourceId }
  ]);
  assert.deepEqual(resolved[3]?.relationships, [
    { type: "depends_on", targetProviderResourceId: oac.providerResourceId }
  ]);
});

test("fallback이 필요한 ELBv2 ARN은 UNKNOWN inventory에 남긴다", () => {
  assert.equal(
    isReverseEngineeringPromotedResourceArn(
      "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/orders/one"
    ),
    false
  );
  assert.equal(
    isReverseEngineeringPromotedResourceArn(
      "arn:aws:cloudfront::123456789012:distribution/EDISTRIBUTION"
    ),
    true
  );
  assert.equal(
    isReverseEngineeringPromotedResourceArn(
      "arn:aws:cloudfront::123456789012:origin-access-control/E123OAC"
    ),
    true
  );
  assert.equal(
    isReverseEngineeringPromotedResourceArn(
      "arn:aws:ecs:ap-northeast-2:123456789012:cluster/orders"
    ),
    true
  );
  assert.equal(
    isReverseEngineeringPromotedResourceArn(
      "arn:aws:ecs:ap-northeast-2:123456789012:service/orders/api"
    ),
    true
  );
  assert.equal(
    isReverseEngineeringPromotedResourceArn(
      "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/orders:7"
    ),
    true
  );
  assert.equal(
    isReverseEngineeringPromotedResourceArn(
      "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/net/orders/one"
    ),
    false
  );
  assert.equal(
    isReverseEngineeringPromotedResourceArn(
      "arn:aws:lambda:ap-northeast-2:123456789012:function:orders"
    ),
    false
  );
  assert.equal(
    isReverseEngineeringPromotedResourceArn(
      "arn:aws:ecs:ap-northeast-2:123456789012:task/orders/one"
    ),
    false
  );
});
