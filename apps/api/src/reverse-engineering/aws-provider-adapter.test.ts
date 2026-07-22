import assert from "node:assert/strict";
import test from "node:test";
import type { ReverseEngineeringScanResult } from "@sketchcatch/types";
import {
  createAwsProviderAdapter,
  type AwsDiscoveredResourceRecord
} from "./aws-provider-adapter.js";

const ALB_ARN =
  "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/shared/1111111111111111";
const CLOUDFRONT_ARN_A = "arn:aws:cloudfront::123456789012:distribution/EDISTRIBUTIONA";
const CLOUDFRONT_ARN_B = "arn:aws:cloudfront::123456789012:distribution/EDISTRIBUTIONB";
const ECS_CLUSTER_ARN = "arn:aws:ecs:ap-northeast-2:123456789012:cluster/orders";
const ECS_SERVICE_ARN = "arn:aws:ecs:ap-northeast-2:123456789012:service/orders/api";
const ECS_TASK_DEFINITION_ARN = "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/orders:7";
const CLOUDWATCH_LOG_GROUP_ARN =
  "arn:aws:logs:ap-northeast-2:123456789012:log-group:/ecs/orders";
const CLOUDWATCH_LOG_GROUP_KMS_ARN =
  "arn:aws:kms:ap-northeast-2:123456789012:key/11111111-2222-3333-4444-555555555555";

test("공개 Reverse Engineering 결과에는 ARN과 환경 비밀값을 남기지 않는다", async () => {
  const result = await scan([
    record({
      providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
      providerResourceId: ALB_ARN,
      displayName: "shared-entry",
      config: {
        arn: ALB_ARN,
        name: "shared-entry",
        type: "application",
        ipAddressType: "ipv4",
        scheme: "internet-facing",
        subnetIds: ["subnet-a"]
      }
    }),
    cloudFrontRecord(CLOUDFRONT_ARN_A, "EDISTRIBUTIONA"),
    record({
      providerResourceType: "AWS::ECS::Cluster",
      providerResourceId: ECS_CLUSTER_ARN,
      displayName: "orders",
      config: { arn: ECS_CLUSTER_ARN, name: "orders" }
    }),
    record({
      providerResourceType: "AWS::ECS::Service",
      providerResourceId: ECS_SERVICE_ARN,
      displayName: "api",
      config: {
        arn: ECS_SERVICE_ARN,
        name: "api",
        clusterArn: ECS_CLUSTER_ARN,
        clusterName: "orders",
        taskDefinitionArn: ECS_TASK_DEFINITION_ARN,
        desiredCount: 1,
        launchType: "FARGATE",
        networkConfiguration: {
          awsvpcConfiguration: { subnets: ["subnet-a"], securityGroups: ["sg-api"] }
        }
      },
      relationships: [
        { type: "depends_on", targetProviderResourceId: ECS_CLUSTER_ARN },
        { type: "depends_on", targetProviderResourceId: ECS_TASK_DEFINITION_ARN }
      ]
    }),
    record({
      providerResourceType: "AWS::ECS::TaskDefinition",
      providerResourceId: ECS_TASK_DEFINITION_ARN,
      displayName: "orders:7",
      config: {
        arn: ECS_TASK_DEFINITION_ARN,
        family: "orders",
        networkMode: "awsvpc",
        requiresCompatibilities: ["FARGATE"],
        cpu: "512",
        memory: "1024",
        containerDefinitions: [
          {
            name: "api",
            image: "example.invalid/orders:stable",
            environment: [{ name: "API_TOKEN", value: "synthetic-api-token-never-public" }],
            secrets: [
              {
                name: "DATABASE_URL",
                valueFrom: "arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:db"
              }
            ]
          }
        ]
      }
    }),
    record({
      providerResourceType: "AWS::S3::Bucket",
      providerResourceId: "arn:aws:s3:::private-bucket",
      displayName: "private-bucket",
      config: { bucketName: "private-bucket" }
    })
  ]);

  assert.doesNotMatch(JSON.stringify(result), /arn:aws/i);
  assert.doesNotMatch(JSON.stringify(result), /synthetic-api-token-never-public/iu);
  assert.ok(
    result.discoveredResources.every((resource) =>
      resource.providerResourceId.startsWith("aws-ref-")
    )
  );

  const service = result.discoveredResources[3];
  assert.ok(service);
  assert.deepEqual(
    (service.relationships ?? []).map((relationship) => relationship.targetResourceId),
    [result.discoveredResources[2]?.id, result.discoveredResources[4]?.id]
  );

  for (const index of [0, 2, 4, 5]) {
    assert.equal(result.importSuggestions[index]?.handoffReady, false);
    assert.equal(result.importSuggestions[index]?.importCommand, undefined);
  }
});

test("서버 전용 Reverse Engineering 결과는 나중 Terraform import에 필요한 AWS 원본을 보존한다", async () => {
  const result = await createAwsProviderAdapter(
    {
      async discoverResources() {
        return [
          record({
            providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
            providerResourceId: ALB_ARN,
            displayName: "private-shared-entry",
            config: {
              arn: ALB_ARN,
              name: "private-shared-entry",
              type: "application",
              ipAddressType: "ipv4",
              scheme: "internet-facing",
              subnetIds: ["subnet-private-a"]
            }
          })
        ];
      }
    },
    { resultVisibility: "private" }
  ).scan({ provider: "aws", region: "ap-northeast-2", resourceTypes: ["ALL"] });

  assert.equal(result.discoveredResources[0]?.providerResourceId, ALB_ARN);
  assert.equal(result.discoveredResources[0]?.config["arn"], undefined);
  assert.equal(result.architectureJson.nodes[0]?.config["providerResourceId"], ALB_ARN);
  assert.equal(result.importSuggestions[0]?.handoffReady, true);
  assert.equal(result.importSuggestions[0]?.importCommand?.split(" ").at(-1), ALB_ARN);
});

test("규칙 source를 완전히 읽지 못한 Security Group은 자동 import에서 제외한다", async () => {
  const result = await scan([
    record({
      providerResourceType: "AWS::EC2::SecurityGroup",
      providerResourceId: "sg-incomplete",
      displayName: "incomplete",
      config: {
        groupName: "incomplete",
        description: "missing source",
        vpcId: "vpc-main",
        securityGroupRulesComplete: false,
        ingress: [],
        egress: []
      }
    })
  ]);

  const [resource] = result.discoveredResources;
  const [suggestion] = result.importSuggestions;
  assert.equal(resource?.analysisExcluded, true);
  assert.equal(resource?.importSuggestionStatus, "manual_review");
  assert.equal(suggestion?.status, "manual_review");
  assert.equal(suggestion?.handoffReady, false);
  assert.match(suggestion?.reason ?? "", /규칙.*확인/);
});

test("ALB와 CloudFront를 supported ResourceType으로 변환하고 공개 가능한 import만 만든다", async () => {
  const result = await scan([
    record({
      providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
      providerResourceId: ALB_ARN,
      displayName: "shared-entry",
      config: {
        arn: ALB_ARN,
        name: "shared-entry",
        type: "application",
        ipAddressType: "ipv4",
        scheme: "internet-facing",
        securityGroupIds: ["sg-shared"],
        subnetIds: ["subnet-a", "subnet-b"]
      }
    }),
    cloudFrontRecord(CLOUDFRONT_ARN_A, "EDISTRIBUTIONA"),
    cloudFrontRecord(CLOUDFRONT_ARN_B, "EDISTRIBUTIONB"),
    record({
      providerResourceType: "AWS::Lambda::Function",
      providerResourceId: "arn:aws:lambda:ap-northeast-2:123456789012:function:shared-entry",
      displayName: "shared-entry"
    }),
    record({
      providerResourceType: "AWS::IAM::Role",
      providerResourceId: "arn:aws:iam::123456789012:role/shared-entry",
      displayName: "shared-entry"
    })
  ]);

  const [alb, cloudFrontA, cloudFrontB, lambda, iamRole] = result.discoveredResources;
  assert.equal(alb?.resourceType, "LOAD_BALANCER");
  assert.equal(cloudFrontA?.resourceType, "CLOUDFRONT");
  assert.equal(cloudFrontB?.resourceType, "CLOUDFRONT");
  assert.equal(alb?.analysisExcluded ?? false, false);
  assert.equal(cloudFrontA?.analysisExcluded ?? false, false);
  assert.equal(cloudFrontB?.analysisExcluded ?? false, false);
  assert.deepEqual(
    result.architectureJson.nodes.map((node) => node.type),
    ["LOAD_BALANCER", "CLOUDFRONT", "CLOUDFRONT", "LAMBDA", "IAM_ROLE"]
  );

  const [albImport, cloudFrontImportA, cloudFrontImportB, lambdaImport, iamRoleImport] =
    result.importSuggestions;
  assert.equal(
    result.architectureJson.nodes[0]?.config["reverseEngineeringManagement"],
    "needs_mapping"
  );
  assertManualImportWithoutIdentity(albImport);
  assertReadyImport(cloudFrontImportA, "aws_cloudfront_distribution", "EDISTRIBUTIONA");
  assertReadyImport(cloudFrontImportB, "aws_cloudfront_distribution", "EDISTRIBUTIONB");
  assert.notEqual(cloudFrontImportA?.terraformAddress, cloudFrontImportB?.terraformAddress);

  for (const [resource, expectedType, suggestion] of [
    [lambda, "LAMBDA", lambdaImport],
    [iamRole, "IAM_ROLE", iamRoleImport]
  ] as const) {
    assert.equal(resource?.resourceType, expectedType);
    assert.equal(resource?.analysisExcluded, true);
    assert.equal(suggestion?.status, "unsupported_resource_type");
    assert.equal(suggestion?.handoffReady, false);
    assert.equal(suggestion?.importCommand, undefined);
  }
});

test("AWS 전용 reader가 찾은 Resource를 실제 Catalog 타입으로 보드에 표시한다", async () => {
  const providerTypeMappings = [
    ["AWS::EC2::Image", "AMI"],
    ["AWS::Lambda::Function", "LAMBDA"],
    ["AWS::Lambda::Permission", "LAMBDA_PERMISSION"],
    ["AWS::IAM::Role", "IAM_ROLE"],
    ["AWS::IAM::Policy", "IAM_POLICY"],
    ["AWS::IAM::InstanceProfile", "IAM_INSTANCE_PROFILE"],
    ["AWS::KMS::Key", "KMS_KEY"],
    ["AWS::CloudWatch::Alarm", "CLOUDWATCH_METRIC_ALARM"],
    ["AWS::ApiGateway::RestApi", "API_GATEWAY_REST_API"]
  ] as const;
  const result = await scan(
    providerTypeMappings.map(([providerResourceType], index) =>
      record({
        providerResourceType,
        providerResourceId: `provider-resource-${index}`,
        displayName: `Resource ${index}`
      })
    )
  );

  assert.deepEqual(
    result.discoveredResources.map((resource) => resource.resourceType),
    providerTypeMappings.map(([, resourceType]) => resourceType)
  );
  assert.equal(
    result.discoveredResources.slice(0, -2).every((resource) => resource.analysisExcluded === true),
    true
  );
  assert.equal(result.discoveredResources.at(-2)?.analysisExcluded ?? false, false);
  assert.equal(result.discoveredResources.at(-1)?.analysisExcluded ?? false, false);
  assert.deepEqual(
    result.architectureJson.nodes.map((node) => node.type),
    providerTypeMappings.map(([, resourceType]) => resourceType)
  );
  assert.equal(result.analysisExclusions.length, providerTypeMappings.length - 2);
  assert.equal(
    result.importSuggestions.slice(0, -2).every(
      (suggestion) =>
        suggestion.status === "unsupported_resource_type" && suggestion.handoffReady === false
    ),
    true
  );
  assert.equal(result.importSuggestions.at(-2)?.status, "manual_review");
  assert.match(result.importSuggestions.at(-2)?.reason ?? "", /alarmName/iu);
  assert.equal(result.importSuggestions.at(-1)?.status, "manual_review");
  assert.match(result.importSuggestions.at(-1)?.reason ?? "", /name/iu);
});

test("단일 Metric CloudWatch Alarm을 재배포 가능한 Terraform 관리 대상으로 만든다", async () => {
  const result = await scan([
    record({
      providerResourceType: "AWS::CloudWatch::Alarm",
      providerResourceId:
        "arn:aws:cloudwatch:ap-northeast-2:123456789012:alarm:api-request-count",
      displayName: "api-request-count",
      config: {
        actionsEnabled: true,
        alarmDescription: "API request threshold",
        alarmName: "api-request-count",
        comparisonOperator: "GreaterThanThreshold",
        datapointsToAlarm: 2,
        dimensions: [
          { Name: "LoadBalancer", Value: "app/customer/1234" },
          { Name: "TargetGroup", Value: "targetgroup/customer/5678" }
        ],
        evaluationPeriods: 3,
        metricName: "RequestCountPerTarget",
        namespace: "AWS/ApplicationELB",
        period: 60,
        statistic: "Sum",
        threshold: 100,
        treatMissingData: "notBreaching",
        unit: "Count",
        stateReason: "must-not-be-managed",
        stateValue: "OK"
      }
    })
  ]);

  const [resource] = result.discoveredResources;
  assert.equal(resource?.analysisExcluded ?? false, false);
  assert.deepEqual(resource?.config, {
    actionsEnabled: true,
    alarmDescription: "API request threshold",
    alarmName: "api-request-count",
    comparisonOperator: "GreaterThanThreshold",
    datapointsToAlarm: 2,
    dimensions: [
      { Name: "LoadBalancer", Value: "app/customer/1234" },
      { Name: "TargetGroup", Value: "targetgroup/customer/5678" }
    ],
    evaluationPeriods: 3,
    metricName: "RequestCountPerTarget",
    namespace: "AWS/ApplicationELB",
    period: 60,
    statistic: "Sum",
    threshold: 100,
    treatMissingData: "notBreaching",
    unit: "Count"
  });
  assertReadyImport(
    result.importSuggestions[0],
    "aws_cloudwatch_metric_alarm",
    "api-request-count"
  );
  assert.equal(
    result.architectureJson.nodes[0]?.config["terraformResourceType"],
    "aws_cloudwatch_metric_alarm"
  );
});

test("Action 대상이나 Metric Query가 있는 CloudWatch Alarm은 보드에 표시하되 자동 변경을 막는다", async () => {
  const result = await scan([
    record({
      providerResourceType: "AWS::CloudWatch::Alarm",
      providerResourceId:
        "arn:aws:cloudwatch:ap-northeast-2:123456789012:alarm:notify-ops",
      displayName: "notify-ops",
      config: {
        alarmName: "notify-ops",
        alarmActions: ["arn:aws:sns:ap-northeast-2:123456789012:ops"],
        metrics: [{ Id: "m1", Expression: "SUM(METRICS())" }]
      }
    })
  ]);

  const [resource] = result.discoveredResources;
  const [suggestion] = result.importSuggestions;
  assert.equal(resource?.analysisExcluded, true);
  assert.deepEqual(resource?.config, {
    alarmName: "notify-ops",
    hasActionTargets: true,
    hasMetricQueries: true
  });
  assert.equal(suggestion?.status, "manual_review");
  assert.equal(suggestion?.handoffReady, false);
  assert.equal(suggestion?.importCommand, undefined);
  assert.match(
    result.analysisExclusions[0]?.message ?? "",
    /알림 동작 대상|계산식 지표/u
  );
  assert.equal(
    result.architectureJson.nodes[0]?.config["reverseEngineeringManagement"],
    "needs_mapping"
  );
  assert.doesNotMatch(JSON.stringify(result), /arn:aws/iu);
});

test("API Gateway REST API를 이름과 설정을 보존한 Terraform 관리 대상으로 만든다", async () => {
  const result = await scan([
    record({
      providerResourceType: "AWS::ApiGateway::RestApi",
      providerResourceId: "a1b2c3d4e5",
      displayName: "customer-api",
      config: {
        id: "a1b2c3d4e5",
        name: "customer-api",
        description: "Customer API",
        apiKeySource: "HEADER",
        binaryMediaTypes: ["application/octet-stream"],
        disableExecuteApiEndpoint: true,
        endpointConfiguration: { types: ["REGIONAL"] },
        minimumCompressionSize: 1_024,
        tags: { Environment: "production" },
        rootResourceId: "root-must-not-be-managed",
        createdAt: "2026-07-23T00:00:00.000Z"
      }
    })
  ]);

  const [resource] = result.discoveredResources;
  assert.equal(resource?.analysisExcluded ?? false, false);
  assert.deepEqual(resource?.config, {
    apiKeySource: "HEADER",
    binaryMediaTypes: ["application/octet-stream"],
    description: "Customer API",
    disableExecuteApiEndpoint: true,
    endpointConfiguration: { types: ["REGIONAL"] },
    id: "a1b2c3d4e5",
    minimumCompressionSize: 1_024,
    name: "customer-api",
    tags: { Environment: "production" }
  });
  assertReadyImport(
    result.importSuggestions[0],
    "aws_api_gateway_rest_api",
    "a1b2c3d4e5"
  );
  assert.equal(
    result.architectureJson.nodes[0]?.config["terraformResourceType"],
    "aws_api_gateway_rest_api"
  );
});

test("KMS 연결 CloudWatch Log Group은 공개·서버 config 경계를 지키고 자동 관리를 막는다", async () => {
  const logGroup = record({
    providerResourceType: "AWS::Logs::LogGroup",
    providerResourceId: CLOUDWATCH_LOG_GROUP_ARN,
    displayName: "/ecs/orders",
    config: {
      arn: CLOUDWATCH_LOG_GROUP_ARN,
      logGroupName: "/ecs/orders",
      retentionInDays: 30,
      kmsKeyId: CLOUDWATCH_LOG_GROUP_KMS_ARN,
      logGroupClass: "STANDARD",
      storedBytes: 1234,
      providerParameters: { secret: "never-public" }
    }
  });
  const publicResult = await scan([logGroup]);
  const privateResult = await createAwsProviderAdapter(
    {
      async discoverResources() {
        return [logGroup];
      }
    },
    { resultVisibility: "private" }
  ).scan({ provider: "aws", region: "ap-northeast-2", resourceTypes: ["ALL"] });

  assert.equal(publicResult.discoveredResources[0]?.analysisExcluded, true);
  assert.deepEqual(publicResult.discoveredResources[0]?.config, {
    logGroupName: "/ecs/orders",
    retentionInDays: 30,
    logGroupClass: "STANDARD",
    hasKmsKey: true
  });
  assert.deepEqual(privateResult.discoveredResources[0]?.config, {
    logGroupName: "/ecs/orders",
    retentionInDays: 30,
    kmsKeyId: CLOUDWATCH_LOG_GROUP_KMS_ARN,
    logGroupClass: "STANDARD",
    hasKmsKey: true
  });
  assert.equal(publicResult.importSuggestions[0]?.status, "manual_review");
  assert.equal(publicResult.importSuggestions[0]?.handoffReady, false);
  assert.equal(publicResult.importSuggestions[0]?.importCommand, undefined);
  assert.match(publicResult.importSuggestions[0]?.reason ?? "", /KMS/iu);
  assert.equal(
    publicResult.architectureJson.nodes[0]?.config["reverseEngineeringManagement"],
    "needs_mapping"
  );
  assert.equal(publicResult.architectureJson.nodes[0]?.config["terraformResourceType"], undefined);
});

test("KMS를 쓰지 않는 CloudWatch Log Group은 이름으로 자동 import할 수 있다", async () => {
  const result = await scan([
    record({
      providerResourceType: "AWS::Logs::LogGroup",
      providerResourceId: CLOUDWATCH_LOG_GROUP_ARN,
      displayName: "/ecs/orders",
      config: { logGroupName: "/ecs/orders", retentionInDays: 30 }
    })
  ]);

  assert.equal(result.discoveredResources[0]?.analysisExcluded ?? false, false);
  assertReadyImport(
    result.importSuggestions[0],
    "aws_cloudwatch_log_group",
    "/ecs/orders"
  );
});

test("이름이 없는 CloudWatch Log Group은 자동 import에서 제외하고 이유를 남긴다", async () => {
  const result = await scan([
    record({
      providerResourceType: "AWS::Logs::LogGroup",
      providerResourceId: CLOUDWATCH_LOG_GROUP_ARN,
      displayName: "이름을 확인할 수 없는 로그",
      config: { retentionInDays: 30 }
    })
  ]);

  assert.equal(result.discoveredResources[0]?.analysisExcluded ?? false, false);
  assert.equal(result.importSuggestions[0]?.status, "manual_review");
  assert.equal(result.importSuggestions[0]?.handoffReady, false);
  assert.equal(result.importSuggestions[0]?.importCommand, undefined);
  assert.match(result.importSuggestions[0]?.reason ?? "", /log group name/iu);
  assert.match(result.findings[0]?.description ?? "", /logGroupName/iu);
});

test("AWS 원본 config는 보존하고 Board projection과 handoff는 같은 Terraform identity를 쓴다", async () => {
  const sourceConfig = {
    arn: ALB_ARN,
    name: "source-exact-alb",
    type: "application",
    ipAddressType: "ipv4",
    scheme: "internet-facing",
    subnetIds: ["subnet-a"]
  };
  const result = await scanPrivate([
    record({
      providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
      providerResourceId: ALB_ARN,
      displayName: "source-exact-alb",
      config: sourceConfig
    })
  ]);

  const { arn: _sourceArn, ...publicSourceConfig } = sourceConfig;
  assert.deepEqual(result.discoveredResources[0]?.config, publicSourceConfig);
  const boardConfig = result.architectureJson.nodes[0]?.config;
  assert.deepEqual(boardConfig?.["reverseEngineeringObservedConfig"], publicSourceConfig);
  assert.equal(boardConfig?.["terraformBlockType"], "resource");
  assert.equal(boardConfig?.["terraformResourceType"], "aws_lb");
  assert.equal(
    result.importSuggestions[0]?.terraformAddress,
    `aws_lb.${String(boardConfig?.["terraformResourceName"])}`
  );
  assert.equal(
    result.reverseEngineeringDraft.protectedValueKeys.includes("terraformResourceName"),
    false
  );
  assert.equal(
    result.reverseEngineeringDraft.protectedValueKeys.includes("terraformResourceType"),
    false
  );
  assert.match(result.importSuggestions[0]?.terraformAddress ?? "", /^aws_lb\./);
});

test("IpAddressType 증거가 없는 ALB는 supported 상태를 유지하지만 handoff-ready가 아니다", async () => {
  const result = await scan([
    record({
      providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
      providerResourceId: ALB_ARN,
      displayName: "missing-ip-address-type",
      config: {
        arn: ALB_ARN,
        name: "missing-ip-address-type",
        type: "application",
        scheme: "internet-facing",
        securityGroupIds: ["sg-shared"],
        subnetIds: ["subnet-a", "subnet-b"]
      }
    })
  ]);

  const [resource] = result.discoveredResources;
  const [suggestion] = result.importSuggestions;
  const [finding] = result.findings;

  assert.equal(resource?.resourceType, "LOAD_BALANCER");
  assert.equal(resource?.analysisExcluded ?? false, false);
  assert.equal(resource?.config["sketchcatchReferenceTerraform"], undefined);
  assert.equal(resource?.config["terraformValidationMissingFields"], undefined);
  assert.equal(suggestion?.status, "manual_review");
  assert.equal(suggestion?.handoffReady, false);
  assert.match(suggestion?.reason ?? "", /ipAddressType/);
  assert.match(finding?.description ?? "", /ipAddressType/);
});

test("ECS Cluster Service Task Definition을 known type과 공개 가능한 handoff로 변환한다", async () => {
  const result = await scan([
    record({
      providerResourceType: "AWS::ECS::Cluster",
      providerResourceId: ECS_CLUSTER_ARN,
      displayName: "orders",
      config: { arn: ECS_CLUSTER_ARN, name: "orders", status: "ACTIVE" }
    }),
    record({
      providerResourceType: "AWS::ECS::Service",
      providerResourceId: ECS_SERVICE_ARN,
      displayName: "api",
      config: {
        arn: ECS_SERVICE_ARN,
        name: "api",
        clusterArn: ECS_CLUSTER_ARN,
        clusterName: "orders",
        taskDefinitionArn: ECS_TASK_DEFINITION_ARN,
        desiredCount: 2,
        launchType: "FARGATE",
        networkConfiguration: {
          awsvpcConfiguration: {
            subnets: ["subnet-private-a"],
            securityGroups: ["sg-api"],
            assignPublicIp: "DISABLED"
          }
        }
      },
      relationships: [
        { type: "depends_on", targetProviderResourceId: ECS_CLUSTER_ARN },
        { type: "depends_on", targetProviderResourceId: ECS_TASK_DEFINITION_ARN }
      ]
    }),
    record({
      providerResourceType: "AWS::ECS::TaskDefinition",
      providerResourceId: ECS_TASK_DEFINITION_ARN,
      displayName: "orders:7",
      config: {
        arn: ECS_TASK_DEFINITION_ARN,
        family: "orders",
        revision: 7,
        networkMode: "awsvpc",
        requiresCompatibilities: ["FARGATE"],
        cpu: "512",
        memory: "1024",
        containerDefinitions: [
          {
            name: "api",
            image: "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/orders:stable",
            essential: true,
            secrets: [
              {
                name: "DATABASE_URL",
                valueFrom: "arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:db"
              }
            ]
          }
        ]
      }
    }),
    record({
      providerResourceType: "AWS::Lambda::Function",
      providerResourceId: "arn:aws:lambda:ap-northeast-2:123456789012:function:orders",
      displayName: "orders-lambda"
    }),
    record({
      providerResourceType: "AWS::IAM::Role",
      providerResourceId: "arn:aws:iam::123456789012:role/orders",
      displayName: "orders-role"
    })
  ]);

  assert.deepEqual(
    result.discoveredResources.map((resource) => resource.resourceType),
    ["ECS_CLUSTER", "ECS_SERVICE", "ECS_TASK_DEFINITION", "LAMBDA", "IAM_ROLE"]
  );
  assert.deepEqual(
    result.discoveredResources
      .slice(0, 3)
      .map((resource) => resource.config["terraformResourceType"]),
    [undefined, undefined, undefined]
  );
  assert.deepEqual(
    result.architectureJson.nodes.map((node) => node.type),
    ["ECS_CLUSTER", "ECS_SERVICE", "ECS_TASK_DEFINITION", "LAMBDA", "IAM_ROLE"]
  );
  assert.equal(
    result.architectureJson.nodes[0]?.config["reverseEngineeringManagement"],
    "needs_mapping"
  );
  assertManualImportWithoutIdentity(result.importSuggestions[0]);
  assert.equal(result.importSuggestions[1]?.status, "manual_review");
  assert.equal(result.importSuggestions[1]?.handoffReady, false);
  assert.equal(result.importSuggestions[1]?.terraformAddress, undefined);
  assert.equal(result.importSuggestions[1]?.importCommand, undefined);
  assert.equal(result.importSuggestions[1]?.terraformBlockDraft, undefined);
  assert.equal(result.importSuggestions[2]?.status, "manual_review");
  assert.equal(result.importSuggestions[2]?.handoffReady, false);
  assert.equal(result.importSuggestions[2]?.terraformAddress, undefined);
  assert.equal(result.importSuggestions[2]?.importCommand, undefined);
  assert.equal(result.importSuggestions[2]?.terraformBlockDraft, undefined);
  assert.deepEqual(
    result.findings.map((finding) => finding.resourceId),
    [result.discoveredResources[1]?.id, result.discoveredResources[2]?.id]
  );

  for (const resource of result.discoveredResources.slice(3)) {
    assert.equal(resource.analysisExcluded, true);
  }
  for (const suggestion of result.importSuggestions.slice(3)) {
    assert.equal(suggestion.status, "unsupported_resource_type");
    assert.equal(suggestion.handoffReady, false);
  }
});

test("불완전한 ECS Service loadBalancer evidence는 supported 상태지만 handoff를 fail-close 한다", async () => {
  const result = await scan([
    record({
      providerResourceType: "AWS::ECS::Service",
      providerResourceId: ECS_SERVICE_ARN,
      displayName: "legacy-api",
      config: {
        arn: ECS_SERVICE_ARN,
        name: "legacy-api",
        clusterArn: ECS_CLUSTER_ARN,
        clusterName: "orders",
        taskDefinitionArn: ECS_TASK_DEFINITION_ARN,
        desiredCount: 1,
        launchType: "EC2",
        networkConfiguration: {
          awsvpcConfiguration: {
            subnets: ["subnet-private-a"],
            securityGroups: ["sg-api"],
            assignPublicIp: "DISABLED"
          }
        },
        loadBalancers: [{ loadBalancerName: "orders-classic-elb" }]
      }
    })
  ]);

  const [resource] = result.discoveredResources;
  const [suggestion] = result.importSuggestions;
  const [finding] = result.findings;

  assert.equal(resource?.resourceType, "ECS_SERVICE");
  assert.equal(resource?.analysisExcluded ?? false, false);
  assert.equal(resource?.config["sketchcatchReferenceTerraform"], undefined);
  assert.equal(resource?.config["terraformValidationMissingFields"], undefined);
  assert.equal(suggestion?.status, "manual_review");
  assert.equal(suggestion?.handoffReady, false);
  assert.match(
    suggestion?.reason ?? "",
    /loadBalancers\.containerName.*loadBalancers\.containerPort/
  );
  assert.match(
    finding?.description ?? "",
    /loadBalancers\.containerName.*loadBalancers\.containerPort/
  );
});

test("ECS import name 또는 Terraform 생성 입력이 부족하면 import와 생성 readiness를 각각 fail-close 한다", async () => {
  const invalidServiceId = "service-without-provider-identity";
  const result = await scan([
    record({
      providerResourceType: "AWS::ECS::Service",
      providerResourceId: invalidServiceId,
      displayName: "unknown-service",
      config: {
        clusterArn: ECS_CLUSTER_ARN,
        taskDefinitionArn: ECS_TASK_DEFINITION_ARN,
        desiredCount: 1,
        launchType: "FARGATE",
        networkConfiguration: {
          awsvpcConfiguration: { subnets: ["subnet-a"], securityGroups: ["sg-a"] }
        }
      }
    }),
    record({
      providerResourceType: "AWS::ECS::TaskDefinition",
      providerResourceId: ECS_TASK_DEFINITION_ARN,
      displayName: "orders:7",
      config: {
        family: "orders",
        networkMode: "awsvpc",
        requiresCompatibilities: ["FARGATE"],
        cpu: "512",
        memory: "1024",
        containerDefinitions: [{ name: "api", image: "example.invalid/orders:stable" }],
        requiresManualEnvironmentInput: true
      }
    })
  ]);

  const [service, taskDefinition] = result.discoveredResources;
  const [serviceImport, taskDefinitionImport] = result.importSuggestions;
  assert.equal(service?.resourceType, "ECS_SERVICE");
  assert.equal(serviceImport?.status, "manual_review");
  assert.equal(serviceImport?.handoffReady, false);
  assert.equal(serviceImport?.importCommand, undefined);
  assert.match(serviceImport?.reason ?? "", /cluster.*service.*name/i);
  assert.equal(service?.config["sketchcatchReferenceTerraform"], undefined);
  assert.equal(service?.config["terraformValidationMissingFields"], undefined);

  assert.equal(taskDefinitionImport?.status, "manual_review");
  assert.equal(taskDefinitionImport?.handoffReady, false);
  assert.match(taskDefinitionImport?.reason ?? "", /containerDefinitions\.environment/);
  assert.equal(taskDefinition?.config["sketchcatchReferenceTerraform"], undefined);
  assert.equal(taskDefinition?.config["terraformValidationMissingFields"], undefined);
  assert.deepEqual(
    result.findings.map((finding) => finding.resourceId),
    [service?.id, taskDefinition?.id]
  );
  assert.match(result.findings[1]?.description ?? "", /containerDefinitions\.environment/);
});

test("정규화된 application 증거가 없는 ELBv2 record는 NLB를 포함해 review-only로 남긴다", async () => {
  const nlbArn =
    "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/net/shared/1111111111111111";
  const contradictoryNlbArn =
    "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/net/conflicting/2222222222222222";
  const result = await scan([
    record({
      providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
      providerResourceId: nlbArn,
      displayName: "resource-explorer-nlb",
      config: { arn: nlbArn, type: "network" }
    }),
    record({
      providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
      providerResourceId: ALB_ARN,
      displayName: "unnormalized-load-balancer",
      config: { arn: ALB_ARN }
    }),
    record({
      providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
      providerResourceId: contradictoryNlbArn,
      displayName: "contradictory-nlb",
      config: { arn: contradictoryNlbArn, type: "application" }
    })
  ]);

  assert.deepEqual(
    result.discoveredResources.map((resource) => ({
      resourceType: resource.resourceType,
      analysisExcluded: resource.analysisExcluded,
      terraformResourceType: resource.config["terraformResourceType"]
    })),
    [
      { resourceType: "UNKNOWN", analysisExcluded: true, terraformResourceType: undefined },
      { resourceType: "UNKNOWN", analysisExcluded: true, terraformResourceType: undefined },
      { resourceType: "UNKNOWN", analysisExcluded: true, terraformResourceType: undefined }
    ]
  );
  assert.deepEqual(
    result.architectureJson.nodes.map((node) => ({
      analysisExcluded: node.config["analysisExcluded"],
      type: node.type
    })),
    [
      { analysisExcluded: true, type: "UNKNOWN" },
      { analysisExcluded: true, type: "UNKNOWN" },
      { analysisExcluded: true, type: "UNKNOWN" }
    ]
  );
  assert.ok(
    result.importSuggestions.every(
      (suggestion) =>
        suggestion.status === "unsupported_resource_type" &&
        suggestion.handoffReady === false &&
        suggestion.importCommand === undefined
    )
  );
});

test("loadBalancerType application 정규화 값도 ALB 지원과 생성 가능성 판단에 쓴다", async () => {
  const result = await scan([
    record({
      providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
      providerResourceId: ALB_ARN,
      displayName: "normalized-alb",
      config: {
        arn: ALB_ARN,
        name: "normalized-alb",
        loadBalancerType: "application",
        ipAddressType: "ipv4",
        scheme: "internet-facing",
        subnetIds: ["subnet-a"]
      }
    })
  ]);

  assert.equal(result.discoveredResources[0]?.resourceType, "LOAD_BALANCER");
  assert.equal(result.discoveredResources[0]?.config["sketchcatchReferenceTerraform"], undefined);
  assert.deepEqual(result.findings, []);
  assert.equal(result.importSuggestions[0]?.handoffReady, false);
  assert.equal(result.importSuggestions[0]?.importCommand, undefined);
});

test("ALB ARN 또는 CloudFront distribution ID가 없으면 Terraform identity 없이 수동 검토한다", async () => {
  const result = await scan([
    record({
      providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
      providerResourceId: "shared-entry-without-alb-arn",
      displayName: "shared-entry",
      config: {
        name: "shared-entry",
        type: "application",
        scheme: "internet-facing",
        ipAddressType: "ipv4",
        subnetIds: ["subnet-a"]
      }
    }),
    record({
      providerResourceType: "AWS::CloudFront::Distribution",
      providerResourceId: CLOUDFRONT_ARN_A,
      displayName: "shared-entry",
      config: createCloudFrontConfig(undefined)
    })
  ]);

  for (const suggestion of result.importSuggestions) {
    assert.equal(suggestion.status, "manual_review");
    assert.equal(suggestion.handoffReady, false);
    assert.equal(suggestion.terraformAddress, undefined);
    assert.equal(suggestion.importCommand, undefined);
    assert.equal(suggestion.terraformBlockDraft, undefined);
    assert.match(suggestion.reason ?? "", /import/i);
  }
  for (const node of result.architectureJson.nodes) {
    assert.equal(node.config["reverseEngineeringManagement"], "needs_mapping");
    assert.equal(node.config["terraformResourceType"], undefined);
    assert.equal(node.config["terraformResourceName"], undefined);
  }
});

test("생성 필수값이 부족한 supported Resource는 Board에 남되 handoff와 Terraform 생성은 fail-closed 한다", async () => {
  const result = await scan([
    record({
      providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
      providerResourceId: ALB_ARN,
      displayName: "incomplete-alb",
      config: { arn: ALB_ARN, name: "incomplete-alb", type: "application" }
    }),
    record({
      providerResourceType: "AWS::CloudFront::Distribution",
      providerResourceId: CLOUDFRONT_ARN_A,
      displayName: "incomplete-cloudfront",
      config: { arn: CLOUDFRONT_ARN_A, id: "EDISTRIBUTIONA", enabled: true }
    })
  ]);

  assert.deepEqual(
    result.discoveredResources.map((resource) => ({
      resourceType: resource.resourceType,
      analysisExcluded: resource.analysisExcluded ?? false,
      referenceOnly: resource.config["sketchcatchReferenceTerraform"]
    })),
    [
      { resourceType: "LOAD_BALANCER", analysisExcluded: false, referenceOnly: undefined },
      { resourceType: "CLOUDFRONT", analysisExcluded: false, referenceOnly: undefined }
    ]
  );
  assert.equal(result.architectureJson.nodes.length, 2);
  assert.ok(
    result.importSuggestions.every(
      (suggestion) =>
        suggestion.status === "manual_review" &&
        suggestion.handoffReady === false &&
        suggestion.reason?.includes("Terraform") === true
    )
  );
  assert.deepEqual(
    result.findings.map((finding) => finding.resourceId),
    result.discoveredResources.map((resource) => resource.id)
  );
  assert.ok(result.findings.every((finding) => finding.category === "configuration"));
  assert.match(result.findings[0]?.description ?? "", /scheme.*subnetIds/);
  assert.match(result.findings[1]?.description ?? "", /origin.*defaultCacheBehavior/);
});

test("CloudFront VPC origin은 리소스만 보존하고 Terraform identity를 fail-close 한다", async () => {
  const result = await scan([
    record({
      providerResourceType: "AWS::CloudFront::Distribution",
      providerResourceId: CLOUDFRONT_ARN_A,
      displayName: "private-origin-edge",
      region: "global",
      config: {
        ...createCloudFrontConfig("EDISTRIBUTIONA"),
        origin: [
          {
            originId: "private-origin",
            domainName: "internal.example.com",
            vpcOriginConfig: {
              vpcOriginId: "vo_0123456789abcdef0",
              ownerAccountId: "123456789012"
            }
          }
        ]
      }
    })
  ]);

  const [resource] = result.discoveredResources;
  const [suggestion] = result.importSuggestions;
  const [finding] = result.findings;

  assert.equal(resource?.resourceType, "CLOUDFRONT");
  assert.equal(resource?.analysisExcluded ?? false, false);
  assert.equal(resource?.config["sketchcatchReferenceTerraform"], undefined);
  assert.equal(resource?.config["terraformValidationMissingFields"], undefined);
  assert.equal(suggestion?.status, "manual_review");
  assert.equal(suggestion?.handoffReady, false);
  assert.equal(suggestion?.terraformAddress, undefined);
  assert.equal(suggestion?.importCommand, undefined);
  assert.equal(suggestion?.terraformBlockDraft, undefined);
  assert.match(suggestion?.reason ?? "", /origin\.vpcOriginConfig/);
  assert.match(finding?.description ?? "", /origin\.vpcOriginConfig/);
});

test("ALB subnet_mapping은 subnets 대신 새 Terraform 생성 위치 정보로 인정한다", async () => {
  const result = await scan([
    record({
      providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
      providerResourceId: ALB_ARN,
      displayName: "mapped-alb",
      config: {
        arn: ALB_ARN,
        name: "mapped-alb",
        type: "application",
        ipAddressType: "ipv4",
        scheme: "internet-facing",
        subnetMapping: [{ subnetId: "subnet-a", allocationId: "eipalloc-a" }]
      }
    })
  ]);

  assert.equal(result.discoveredResources[0]?.config["sketchcatchReferenceTerraform"], undefined);
  assert.deepEqual(result.findings, []);
  assert.equal(result.importSuggestions[0]?.handoffReady, false);
  assert.equal(result.importSuggestions[0]?.importCommand, undefined);
});

async function scan(records: AwsDiscoveredResourceRecord[]): Promise<ReverseEngineeringScanResult> {
  return createAwsProviderAdapter({
    async discoverResources() {
      return records;
    }
  }).scan({ provider: "aws", region: "ap-northeast-2", resourceTypes: ["ALL"] });
}

async function scanPrivate(
  records: AwsDiscoveredResourceRecord[]
): Promise<ReverseEngineeringScanResult> {
  return createAwsProviderAdapter(
    {
      async discoverResources() {
        return records;
      }
    },
    { resultVisibility: "private" }
  ).scan({ provider: "aws", region: "ap-northeast-2", resourceTypes: ["ALL"] });
}

function cloudFrontRecord(
  providerResourceId: string,
  distributionId: string
): AwsDiscoveredResourceRecord {
  return record({
    providerResourceType: "AWS::CloudFront::Distribution",
    providerResourceId,
    displayName: "shared-entry",
    region: "global",
    config: createCloudFrontConfig(distributionId)
  });
}

function createCloudFrontConfig(distributionId: string | undefined): Record<string, unknown> {
  return {
    arn: CLOUDFRONT_ARN_A,
    ...(distributionId ? { id: distributionId } : {}),
    enabled: true,
    comment: "shared edge",
    origin: [
      {
        originId: "assets",
        domainName: "assets.example.s3.ap-northeast-2.amazonaws.com",
        s3OriginConfig: { originAccessIdentity: "" }
      }
    ],
    defaultCacheBehavior: {
      targetOriginId: "assets",
      viewerProtocolPolicy: "redirect-to-https",
      allowedMethods: ["GET", "HEAD"],
      cachedMethods: ["GET", "HEAD"],
      forwardedValues: { queryString: false, cookies: { forward: "none" } }
    },
    restrictions: { geoRestriction: { restrictionType: "none" } },
    viewerCertificate: { cloudfrontDefaultCertificate: true }
  };
}

function assertReadyImport(
  suggestion: ReverseEngineeringScanResult["importSuggestions"][number] | undefined,
  terraformType: string,
  importId: string
): void {
  assert.equal(suggestion?.status, "ready");
  assert.equal(suggestion?.handoffReady, true);
  assert.match(suggestion?.terraformAddress ?? "", new RegExp(`^${terraformType}\\.`));
  assert.match(
    suggestion?.terraformBlockDraft ?? "",
    new RegExp(`^resource "${terraformType}" "[a-z0-9_]+" \\{\\}$`)
  );
  assert.equal(suggestion?.importCommand?.split(" ").at(-1), importId);
}

function assertManualImportWithoutIdentity(
  suggestion: ReverseEngineeringScanResult["importSuggestions"][number] | undefined
): void {
  assert.equal(suggestion?.status, "manual_review");
  assert.equal(suggestion?.handoffReady, false);
  assert.equal(suggestion?.terraformAddress, undefined);
  assert.equal(suggestion?.importCommand, undefined);
  assert.equal(suggestion?.terraformBlockDraft, undefined);
}

function record(input: {
  providerResourceType: string;
  providerResourceId: string;
  displayName: string;
  region?: string;
  config?: Record<string, unknown>;
  relationships?: AwsDiscoveredResourceRecord["relationships"];
}): AwsDiscoveredResourceRecord {
  return {
    providerResourceType: input.providerResourceType,
    providerResourceId: input.providerResourceId,
    displayName: input.displayName,
    region: input.region ?? "ap-northeast-2",
    config: input.config ?? {},
    relationships: input.relationships ?? []
  };
}
