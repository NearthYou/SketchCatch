import assert from "node:assert/strict";
import test from "node:test";
import {
  DescribeImagesCommand
} from "@aws-sdk/client-ec2";
import {
  DescribeLoadBalancersCommand
} from "@aws-sdk/client-elastic-load-balancing-v2";
import { ListDistributionsCommand } from "@aws-sdk/client-cloudfront";
import { ListBucketsCommand } from "@aws-sdk/client-s3";
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
import type { ReverseEngineeringScanResult } from "@sketchcatch/types";
import type { TerraformAwsCredentialEnv } from "../aws-connections/aws-connection-runtime-credentials.js";
import {
  createAwsProviderAdapter,
  type AwsDiscoveredResourceRecord,
  type AwsProviderScanInput
} from "./aws-provider-adapter.js";
import { sendAwsQuery } from "./aws-reverse-engineering-query.js";
import {
  collectAwsPages,
  createAwsReverseEngineeringReaderPlan,
  deduplicateReverseEngineeringScanErrors,
  describeInstances,
  describeInternetGateways,
  describeRdsInstances,
  describeRouteTables,
  describeSecurityGroups,
  describeSubnets,
  describeVpcs,
  isReverseEngineeringPromotedResourceArn,
  listAmiImagesAsUnknown,
  listApplicationLoadBalancers,
  listBucketsWithDetails,
  listCloudFrontDistributions,
  listIamRolesAsUnknown,
  listLambdaFunctionsAsUnknown,
  listLambdaPermissionsAsUnknown,
  readEcsResourcesWithDiagnostics,
  readResourceExplorerResourcesWithDiagnostics,
  resolveCloudFrontOriginRelationships,
  uniqueDiscoveredRecordsByProviderId
} from "./aws-reverse-engineering-gateway.js";
import { parseAwsQueryPaginationToken } from "./aws-reverse-engineering-parsers.js";

const credentials: TerraformAwsCredentialEnv = {
  AWS_ACCESS_KEY_ID: "fixture-access-key",
  AWS_SECRET_ACCESS_KEY: "fixture-secret-key",
  AWS_REGION: "ap-northeast-2"
};

async function scanGatewayRecords(
  records: AwsDiscoveredResourceRecord[]
): Promise<ReverseEngineeringScanResult> {
  return createAwsProviderAdapter({
    async discoverResources() {
      return records;
    }
  }).scan({ provider: "aws", region: "ap-northeast-2", resourceTypes: ["ALL"] });
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
  kind: typeof awsQueryReaderScenarios[number]["kind"],
  id: string,
  nextToken: string | undefined
): string {
  const token = nextToken === undefined
    ? ""
    : kind === "rds"
      ? `<Marker>${escapeXml(nextToken)}</Marker>`
      : `<nextToken>${escapeXml(nextToken)}</nextToken>`;
  switch (kind) {
    case "vpc":
      return `<DescribeVpcsResponse><vpcSet><item><vpcId>${id}</vpcId></item></vpcSet>${token}</DescribeVpcsResponse>`;
    case "subnet":
      return `<DescribeSubnetsResponse><subnetSet><item><subnetId>${id}</subnetId></item></subnetSet>${token}</DescribeSubnetsResponse>`;
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
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
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
  const [record] = await listLambdaFunctionsAsUnknown(
    "ap-northeast-2",
    credentials,
    () => ({
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
    })
  );

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
  const records = await listLambdaPermissionsAsUnknown(
    "ap-northeast-2",
    credentials,
    () => ({
      async send(command) {
        if (command instanceof ListFunctionsCommand) {
          return { Functions: [lambdaFunction] };
        }
        assert.ok(command instanceof GetPolicyCommand);
        return { Policy: policy };
      }
    })
  );

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

  const functionRecords = await listLambdaFunctionsAsUnknown(
    "ap-northeast-2",
    credentials,
    () => ({ async send() { return { Functions: [lambdaFunction] }; } })
  );
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
  const trustPolicy = encodeURIComponent(JSON.stringify({
    Version: "2012-10-17",
    Statement: [{ Effect: "Allow", Action: "sts:AssumeRole", Principal: { AWS: principalArn } }]
  }));
  const [record] = await listIamRolesAsUnknown(
    "ap-northeast-2",
    credentials,
    () => ({
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
    })
  );

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

  await sendAwsQuery({
    service: "ec2",
    region: "ap-northeast-2",
    action: "DescribeVpcs",
    version: "2016-11-15",
    credentials,
    parameters: { NextToken: "opaque +/&= token" }
  } as never, fetchXml);

  const parameters = new URLSearchParams(body);
  assert.equal(parameters.get("Action"), "DescribeVpcs");
  assert.equal(parameters.get("Version"), "2016-11-15");
  assert.equal(parameters.get("NextToken"), "opaque +/&= token");

  await assert.rejects(
    sendAwsQuery({
      service: "ec2",
      region: "ap-northeast-2",
      action: "DescribeVpcs",
      version: "2016-11-15",
      credentials,
      parameters: { Action: "DeleteEverything" }
    } as never, fetchXml),
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
  assert.equal(
    parseAwsQueryPaginationToken("<DescribeVpcsResponse />", "nextToken"),
    undefined
  );
});

test("all six EC2 Query readers and RDS follow their response pagination token", async () => {
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
          createAwsQueryPageXml(scenario.kind, `${scenario.idPrefix}-${page}`, page === 1
            ? "opaque +/&= token"
            : undefined),
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

  assert.deepEqual(records.map((record) => record.providerResourceId), ["kept-bucket"]);
  assert.equal(listCommands.length, 2);
  assert.equal(listCommands[0]?.input.MaxBuckets, 1_000);
  assert.equal(listCommands[1]?.input.ContinuationToken, "page-2");
  assert.deepEqual(failures, [{ outcome: "permission_denied" }]);
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

  assert.deepEqual(records.map((record) => record.providerResourceId), ["ami-kept"]);
  assert.equal(commands.length, 2);
  assert.equal(commands[0]?.input.MaxResults, 1_000);
  assert.equal(commands[1]?.input.NextToken, "page-2");
  assert.deepEqual(failures, [{ outcome: "transient" }]);
  assert.deepEqual(Object.keys(failures[0] ?? {}), ["outcome"]);
});

test("Resource Explorer resolves the default view before searching it", async () => {
  const viewArn =
    "arn:aws:resource-explorer-2:ap-northeast-2:123456789012:view/default/example";
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
  const logGroupArn =
    "arn:aws:logs:ap-northeast-2:123456789012:log-group:/ecs/orders";
  const kmsKeyArn =
    "arn:aws:kms:ap-northeast-2:123456789012:key/11111111-2222-3333-4444-555555555555";
  const genericRecord = safeRecord(
    "AWS::Logs::LogGroup",
    logGroupArn,
    "LogGroup · generic"
  );
  const detailedRecord: AwsDiscoveredResourceRecord = {
    ...genericRecord,
    displayName: "/ecs/orders",
    config: {
      logGroupName: "/ecs/orders",
      retentionInDays: 30,
      kmsKeyId: kmsKeyArn
    }
  };

  const records = uniqueDiscoveredRecordsByProviderId([
    genericRecord,
    detailedRecord
  ]);

  assert.equal(records.length, 1);
  assert.deepEqual(records[0], detailedRecord);
});

test("ALB와 CloudFront reader 선택은 ALL 및 직접 선택에만 한 번씩 포함한다", () => {
  assert.deepEqual(createAwsReverseEngineeringReaderPlan(scanInput(["ALL"])), {
    loadBalancers: true,
    cloudFrontDistributions: true,
    ecsResources: true,
    unknownResources: true
  });
  assert.deepEqual(createAwsReverseEngineeringReaderPlan(scanInput(["LOAD_BALANCER"])), {
    loadBalancers: true,
    cloudFrontDistributions: false,
    ecsResources: false,
    unknownResources: false
  });
  assert.deepEqual(createAwsReverseEngineeringReaderPlan(scanInput(["CLOUDFRONT"])), {
    loadBalancers: false,
    cloudFrontDistributions: true,
    ecsResources: false,
    unknownResources: false
  });
  assert.deepEqual(createAwsReverseEngineeringReaderPlan(scanInput(["UNKNOWN"])), {
    loadBalancers: false,
    cloudFrontDistributions: false,
    ecsResources: false,
    unknownResources: true
  });

  for (const resourceType of [
    "ECS_CLUSTER",
    "ECS_SERVICE",
    "ECS_TASK_DEFINITION"
  ] as const) {
    assert.deepEqual(createAwsReverseEngineeringReaderPlan(scanInput([resourceType])), {
      loadBalancers: false,
      cloudFrontDistributions: false,
      ecsResources: true,
      unknownResources: false
    });
  }
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
  const result = await readEcsResourcesWithDiagnostics(
    "ap-northeast-2",
    credentials,
    () => ({
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
    })
  );

  assert.deepEqual(result.scanErrors, []);
  assert.deepEqual(
    commands.filter((command) => command instanceof ListClustersCommand).map((command) => command.input.nextToken),
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
  assert.equal(commands.filter((command) => command instanceof DescribeTaskDefinitionCommand).length, 1);
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
  const result = await readEcsResourcesWithDiagnostics(
    "ap-northeast-2",
    credentials,
    () => ({
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
    })
  );

  assert.deepEqual(result.records.map((record) => record.providerResourceId), [clusterArn]);
  assert.deepEqual(
    commands
      .filter(
        (command): command is DescribeClustersCommand =>
          command instanceof DescribeClustersCommand
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
  const taskDefinitionArn =
    "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/orders:1";
  const commands: object[] = [];
  const result = await readEcsResourcesWithDiagnostics(
    "ap-northeast-2",
    credentials,
    () => ({
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
            services: [{
              serviceArn,
              serviceName: "api",
              clusterArn,
              taskDefinition: taskDefinitionArn
            }]
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
    })
  );

  assert.deepEqual(
    result.records.map((record) => record.providerResourceId),
    [clusterArn, serviceArn, taskDefinitionArn]
  );
  assert.deepEqual(
    commands
      .filter(
        (command): command is DescribeServicesCommand =>
          command instanceof DescribeServicesCommand
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
  const result = await readEcsResourcesWithDiagnostics(
    "ap-northeast-2",
    credentials,
    () => ({
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
    })
  );

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
  const records = await listApplicationLoadBalancers(
    "ap-northeast-2",
    credentials,
    () => ({
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
                  AvailabilityZones: [
                    { ZoneName: "ap-northeast-2a", SubnetId: "subnet-public-a" }
                  ],
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
    })
  );

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
          LoadBalancers: [{
            LoadBalancerArn:
              "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/orders/one",
            LoadBalancerName: "orders",
            Type: "application"
          }],
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

test("CloudFront reader는 distribution ID와 생성에 필요한 응답 구조만 보존한다", async () => {
  const commands: object[] = [];
  const records = await listCloudFrontDistributions(
    "ap-northeast-2",
    credentials,
    () => ({
      async send(command: object): Promise<unknown> {
        commands.push(command);
        return {
          DistributionList: {
            Items: [
              {
                ARN: "arn:aws:cloudfront::123456789012:distribution/EDISTRIBUTION",
                Id: "EDISTRIBUTION",
                DomainName: "d111111abcdef8.cloudfront.net",
                Comment: "orders entry",
                Enabled: true,
                Status: "Deployed",
                Origins: {
                  Items: [
                    {
                      Id: "orders-alb",
                      DomainName: "orders-123.ap-northeast-2.elb.amazonaws.com",
                      CustomOriginConfig: {
                        HTTPPort: 80,
                        HTTPSPort: 443,
                        OriginProtocolPolicy: "https-only",
                        OriginSslProtocols: { Items: ["TLSv1.2"] }
                      }
                    }
                  ]
                },
                DefaultCacheBehavior: {
                  TargetOriginId: "orders-alb",
                  ViewerProtocolPolicy: "redirect-to-https",
                  AllowedMethods: {
                    Items: ["GET", "HEAD"],
                    CachedMethods: { Items: ["GET", "HEAD"] }
                  },
                  ForwardedValues: {
                    QueryString: false,
                    Cookies: { Forward: "none" }
                  }
                },
                Restrictions: { GeoRestriction: { RestrictionType: "none" } },
                ViewerCertificate: { CloudFrontDefaultCertificate: true }
              }
            ]
          }
        };
      }
    })
  );

  assert.equal(commands.length, 1);
  assert.ok(commands[0] instanceof ListDistributionsCommand);
  assert.deepEqual(records, [
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
        comment: "orders entry",
        enabled: true,
        status: "Deployed",
        origin: [
          {
            originId: "orders-alb",
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
          targetOriginId: "orders-alb",
          viewerProtocolPolicy: "redirect-to-https",
          allowedMethods: ["GET", "HEAD"],
          cachedMethods: ["GET", "HEAD"],
          forwardedValues: { queryString: false, cookies: { forward: "none" } }
        },
        restrictions: { geoRestriction: { restrictionType: "none" } },
        viewerCertificate: { cloudfrontDefaultCertificate: true }
      },
      relationships: []
    }
  ]);
});

test("CloudFront reader는 VpcOriginConfig를 보존해 새 Terraform 생성 경계를 판단할 수 있게 한다", async () => {
  const records = await listCloudFrontDistributions(
    "ap-northeast-2",
    credentials,
    () => ({
      async send(): Promise<unknown> {
        return {
          DistributionList: {
            Items: [
              {
                ARN: "arn:aws:cloudfront::123456789012:distribution/EVPCORIGIN",
                Id: "EVPCORIGIN",
                DomainName: "d111111abcdef8.cloudfront.net",
                Origins: {
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
                }
              }
            ]
          }
        };
      }
    })
  );

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
    providerResourceId: "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/orders/one",
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

test("정식 reader가 맡는 ARN만 UNKNOWN inventory에서 제외한다", () => {
  assert.equal(
    isReverseEngineeringPromotedResourceArn(
      "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/orders/one"
    ),
    true
  );
  assert.equal(
    isReverseEngineeringPromotedResourceArn(
      "arn:aws:cloudfront::123456789012:distribution/EDISTRIBUTION"
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
