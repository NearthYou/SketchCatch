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
const CLOUDWATCH_LOG_GROUP_ARN = "arn:aws:logs:ap-northeast-2:123456789012:log-group:/ecs/orders";
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
              attributes: {},
              attributesProjectionComplete: true,
              attributesReadComplete: true,
              arn: ALB_ARN,
              name: "private-shared-entry",
              ipAddressType: "ipv4",
              reverseEngineeringDetailsVersion: 1,
              scheme: "internet-facing",
              subnetIds: ["subnet-private-a"],
              tags: [],
              tagsReadComplete: true,
              type: "application"
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

test("상세 reader의 AWS 원본과 import ID는 서버 결과에만 합친다", async () => {
  const lambdaArn = "arn:aws:lambda:ap-northeast-2:123456789012:function:orders-api";
  const detailedRecord = {
    providerResourceType: "AWS::Lambda::Function",
    providerResourceId: "aws-detail-ref-lambda-orders",
    displayName: "orders-api",
    region: "ap-northeast-2",
    config: {
      functionName: "orders-api",
      packageType: "Image",
      environmentValuesRedacted: true
    },
    relationships: [],
    serverOnly: {
      providerResourceId: lambdaArn,
      terraformImportId: "orders-api",
      config: {
        environmentVariables: { API_TOKEN: "synthetic-never-public" },
        imageUri: "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/orders:stable"
      }
    }
  } as unknown as AwsDiscoveredResourceRecord;

  const publicResult = await scan([detailedRecord]);
  const privateResult = await scanPrivate([detailedRecord]);

  assert.doesNotMatch(JSON.stringify(publicResult), /123456789012|synthetic-never-public/iu);
  assert.equal(privateResult.discoveredResources[0]?.providerResourceId, lambdaArn);
  assert.equal(privateResult.discoveredResources[0]?.config["terraformImportId"], "orders-api");
  assert.deepEqual(privateResult.discoveredResources[0]?.config["environmentVariables"], {
    API_TOKEN: "synthetic-never-public"
  });
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
    assert.equal(suggestion?.status, "manual_review");
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
    ["AWS::IAM::RolePolicy", "IAM_POLICY"],
    ["AWS::IAM::RolePolicyAttachment", "IAM_POLICY"],
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
    result.discoveredResources.every((resource) => resource.analysisExcluded === true),
    true
  );
  assert.deepEqual(
    result.architectureJson.nodes.map((node) => node.type),
    providerTypeMappings.map(([, resourceType]) => resourceType)
  );
  assert.equal(result.analysisExclusions.length, providerTypeMappings.length);
  assert.equal(result.importSuggestions[0]?.status, "unsupported_resource_type");
  assert.equal(
    result.importSuggestions.slice(1).every(
      (suggestion) => suggestion.status === "manual_review" && suggestion.handoffReady === false
    ),
    true
  );
  assert.equal(result.importSuggestions.at(-2)?.status, "manual_review");
  assert.match(result.importSuggestions.at(-2)?.reason ?? "", /태그/iu);
  assert.equal(result.importSuggestions.at(-1)?.status, "manual_review");
  assert.match(result.importSuggestions.at(-1)?.reason ?? "", /policy/iu);
});

test("상세 reader의 IAM KMS API Gateway 하위 Resource를 Catalog 타입으로 표시하고 공개 원문을 숨긴다", async () => {
  const records = [
    {
      providerResourceType: "AWS::IAM::RolePolicy",
      providerResourceId: "orders-role:inline-policy:orders-read",
      displayName: "orders-read",
      region: "global",
      config: {
        policyName: "orders-read",
        roleName: "orders-role",
        ownership: "customer",
        managementReady: true,
        reverseEngineeringDetailsComplete: true,
        reverseEngineeringDetailsVersion: 1,
        policyDocumentRedacted: true,
        policyDocument: { Statement: [{ Effect: "Allow", Action: "s3:GetObject" }] }
      },
      relationships: [],
      serverOnly: {
        providerResourceId: "arn:aws:iam::123456789012:role/orders-role",
        terraformImportId: "orders-role:orders-read",
        config: { policyDocument: "private-inline-policy" }
      }
    },
    {
      providerResourceType: "AWS::KMS::Key",
      providerResourceId: "11111111-2222-3333-4444-555555555555",
      displayName: "orders-key",
      region: "ap-northeast-2",
      config: {
        description: "Orders key",
        enabled: true,
        keyId: "11111111-2222-3333-4444-555555555555",
        keyManager: "CUSTOMER",
        keyState: "Enabled",
        managementReady: true,
        policyReadComplete: true,
        reverseEngineeringDetailsComplete: true,
        reverseEngineeringDetailsVersion: 1,
        tagsReadComplete: true,
        policyDocument: "private-kms-policy"
      },
      relationships: [],
      serverOnly: {
        providerResourceId: "11111111-2222-3333-4444-555555555555",
        terraformImportId: "11111111-2222-3333-4444-555555555555",
        config: { policyDocument: "private-kms-policy" }
      }
    },
    {
      providerResourceType: "AWS::KMS::Alias",
      providerResourceId: "alias/orders",
      displayName: "alias/orders",
      region: "ap-northeast-2",
      config: {
        awsManaged: false,
        managementReady: true,
        reverseEngineeringDetailsComplete: true,
        targetKeyId: "11111111-2222-3333-4444-555555555555"
      },
      relationships: [],
      serverOnly: {
        providerResourceId: "alias/orders",
        terraformImportId: "alias/orders",
        config: { aliasName: "alias/orders", targetKeyId: "private-target-key" }
      }
    },
    ...[
      [
        "AWS::ApiGateway::Resource",
        "api123/resource456",
        { path: "/orders", pathPart: "orders", hasMethods: true, resourceId: "resource456" }
      ],
      [
        "AWS::ApiGateway::Method",
        "api123/resource456/GET",
        {
          httpMethod: "GET",
          authorizationType: "NONE",
          apiKeyRequired: false,
          hasAuthorizer: false,
          hasValidator: false,
          hasRequestParameters: false,
          hasRequestModels: false,
          responseCount: 1,
          requestParameters: { "method.request.header.Secret": true }
        }
      ],
      [
        "AWS::ApiGateway::Integration",
        "api123/resource456/GET",
        {
          integrationType: "AWS_PROXY",
          integrationHttpMethod: "POST",
          connectionType: "INTERNET",
          hasVpcLink: false,
          hasCredentials: true,
          hasRequestParameters: false,
          hasRequestTemplates: false,
          cacheConfigured: false,
          timeoutInMillis: 29_000,
          integrationUri: "private-integration-uri",
          credentialsArn: "arn:aws:iam::123456789012:role/private-integration"
        }
      ],
      [
        "AWS::ApiGateway::Deployment",
        "api123/deployment789",
        { createdAt: "2026-07-23T00:00:00.000Z", hasDescription: true, apiSummary: "private" }
      ],
      [
        "AWS::ApiGateway::Stage",
        "api123/production",
        {
          stageName: "production",
          hasDescription: true,
          tracingEnabled: true,
          hasStageVariables: true,
          hasAccessLogs: true,
          hasCanary: false,
          cacheEnabled: false,
          tagCount: 1,
          variables: { TOKEN: "private-stage-variable" }
        }
      ]
    ].map(([providerResourceType, providerResourceId, config]) => ({
      providerResourceType: providerResourceType as string,
      providerResourceId: providerResourceId as string,
      displayName: providerResourceId as string,
      region: "ap-northeast-2",
      config: {
        ...(config as Record<string, unknown>),
        managementReady: true,
        reverseEngineeringDetailsComplete: true,
        reverseEngineeringDetailsVersion: 1,
        apiGatewayTopologyClassification: "simple",
        apiGatewayAdvancedFeatures: []
      },
      relationships: [],
      serverOnly: {
        providerResourceId: `private-${providerResourceId as string}`,
        terraformImportId: `private-import-${providerResourceId as string}`,
        config: {
          environmentVariables: { TOKEN: "private-api-environment" },
          terraformImportId: `private-import-${providerResourceId as string}`
        }
      }
    }))
  ] satisfies AwsDiscoveredResourceRecord[];

  const result = await scan(records);

  assert.deepEqual(
    result.discoveredResources.map((resource) => resource.resourceType),
    [
      "IAM_POLICY",
      "KMS_KEY",
      "KMS_ALIAS",
      "API_GATEWAY_RESOURCE",
      "API_GATEWAY_METHOD",
      "API_GATEWAY_INTEGRATION",
      "API_GATEWAY_DEPLOYMENT",
      "API_GATEWAY_STAGE"
    ]
  );
  assert.ok(
    result.discoveredResources.every((resource) =>
      resource.providerResourceId.startsWith("aws-ref-")
    )
  );
  assert.ok(
    result.importSuggestions.every(
      (suggestion) =>
        suggestion.status === "manual_review" && suggestion.handoffReady === false
    )
  );
  const serializedResult = JSON.stringify(result);
  assert.doesNotMatch(serializedResult, /private-/iu);
  assert.doesNotMatch(serializedResult, /11111111-2222-3333-4444-555555555555/iu);
  assert.doesNotMatch(
    serializedResult,
    /"(?:policyDocument|environmentVariables|terraformImportId|targetKeyId|requestParameters|integrationUri|credentialsArn|apiSummary|variables)":/iu
  );
});

test("상세 reader의 서버 원본을 확인한 IAM Role만 실제 Terraform import 대상으로 연다", async () => {
  const roleRecord = {
    providerResourceType: "AWS::IAM::Role",
    providerResourceId: "aws-ref-role-orders",
    displayName: "orders-role",
    region: "global",
    config: {
      roleName: "orders-role",
      ownership: "customer",
      managementReady: true,
      reverseEngineeringDetailsComplete: true,
      reverseEngineeringDetailsVersion: 1,
      trustPolicyDocumentRedacted: true
    },
    relationships: [],
    serverOnly: {
      providerResourceId: "arn:aws:iam::123456789012:role/orders-role",
      terraformImportId: "orders-role",
      config: {
        trustPolicyDocument: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "lambda.amazonaws.com" },
              Action: "sts:AssumeRole"
            }
          ]
        }
      }
    }
  } satisfies AwsDiscoveredResourceRecord;

  const publicResult = await scan([roleRecord]);
  assertManualImportWithoutIdentity(publicResult.importSuggestions[0]);
  assert.equal(publicResult.discoveredResources[0]?.analysisExcluded, true);

  const privateResult = await scanPrivate([roleRecord]);
  assertReadyImport(privateResult.importSuggestions[0], "aws_iam_role", "orders-role");
  assert.equal(privateResult.discoveredResources[0]?.analysisExcluded, undefined);
  assert.equal(
    privateResult.architectureJson.nodes[0]?.config["terraformResourceType"],
    "aws_iam_role"
  );
});

test("상세 reader의 관리 완료 근거가 불완전하면 지원 타입도 Terraform handoff를 닫는다", async () => {
  const createRestApiRecord = (
    managementReady: boolean,
    reverseEngineeringDetailsComplete: boolean
  ): AwsDiscoveredResourceRecord =>
    record({
      providerResourceType: "AWS::ApiGateway::RestApi",
      providerResourceId: `api-${managementReady}-${reverseEngineeringDetailsComplete}`,
      displayName: "orders-api",
      config: {
        hasResourcePolicy: false,
        name: "orders-api",
        tags: {},
        tagsReadComplete: true,
        managementReady,
        reverseEngineeringDetailsComplete,
        reverseEngineeringDetailsVersion: 1
      }
    });
  const result = await scan([
    createRestApiRecord(false, true),
    createRestApiRecord(true, false),
    createRestApiRecord(true, true)
  ]);

  assert.deepEqual(
    result.importSuggestions.map((suggestion) => ({
      handoffReady: suggestion.handoffReady,
      status: suggestion.status
    })),
    [
      { handoffReady: false, status: "manual_review" },
      { handoffReady: false, status: "manual_review" },
      { handoffReady: true, status: "ready" }
    ]
  );
  for (const node of result.architectureJson.nodes.slice(0, 2)) {
    assert.equal(node.config["reverseEngineeringManagement"], "needs_mapping");
    assert.equal(node.config["terraformResourceType"], undefined);
  }
  assert.equal(result.architectureJson.nodes[2]?.config["reverseEngineeringManagement"], "managed");
});

test("단일 Metric CloudWatch Alarm을 재배포 가능한 Terraform 관리 대상으로 만든다", async () => {
  const result = await scan([
    record({
      providerResourceType: "AWS::CloudWatch::Alarm",
      providerResourceId: "arn:aws:cloudwatch:ap-northeast-2:123456789012:alarm:api-request-count",
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
        tags: [{ key: "Environment", value: "production" }],
        tagsReadComplete: true,
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
    tags: [{ key: "Environment", value: "production" }],
    tagsReadComplete: true,
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
      providerResourceId: "arn:aws:cloudwatch:ap-northeast-2:123456789012:alarm:notify-ops",
      displayName: "notify-ops",
      config: {
        alarmName: "notify-ops",
        alarmActions: ["arn:aws:sns:ap-northeast-2:123456789012:ops"],
        metrics: [{ Id: "m1", Expression: "SUM(METRICS())" }],
        tags: [],
        tagsReadComplete: true
      }
    })
  ]);

  const [resource] = result.discoveredResources;
  const [suggestion] = result.importSuggestions;
  assert.equal(resource?.analysisExcluded, true);
  assert.deepEqual(resource?.config, {
    alarmName: "notify-ops",
    hasActionTargets: true,
    hasMetricQueries: true,
    tags: [],
    tagsReadComplete: true
  });
  assert.equal(suggestion?.status, "manual_review");
  assert.equal(suggestion?.handoffReady, false);
  assert.equal(suggestion?.importCommand, undefined);
  assert.match(result.analysisExclusions[0]?.message ?? "", /알림 동작 대상|계산식 지표/u);
  assert.equal(
    result.architectureJson.nodes[0]?.config["reverseEngineeringManagement"],
    "needs_mapping"
  );
  assert.doesNotMatch(JSON.stringify(result), /arn:aws/iu);
});

test("ARN dimension 값이 공개 경계에서 제거되는 CloudWatch Alarm은 자동 관리를 막는다", async () => {
  const result = await scan([
    record({
      providerResourceType: "AWS::CloudWatch::Alarm",
      providerResourceId: "arn:aws:cloudwatch:ap-northeast-2:123456789012:alarm:queue-depth",
      displayName: "queue-depth",
      config: {
        alarmName: "queue-depth",
        comparisonOperator: "GreaterThanThreshold",
        dimensions: [
          {
            Name: "QueueArn",
            Value: "arn:aws:sqs:ap-northeast-2:123456789012:private-queue"
          }
        ],
        evaluationPeriods: 1,
        metricName: "ApproximateNumberOfMessagesVisible",
        namespace: "AWS/SQS",
        period: 60,
        statistic: "Average",
        tags: [],
        tagsReadComplete: true,
        threshold: 10
      }
    })
  ]);

  const [resource] = result.discoveredResources;
  const [suggestion] = result.importSuggestions;
  assert.equal(resource?.analysisExcluded, true);
  assert.deepEqual(resource?.config, {
    alarmName: "queue-depth",
    hasUnprojectableDimensions: true,
    tags: [],
    tagsReadComplete: true
  });
  assert.equal(suggestion?.status, "manual_review");
  assert.equal(suggestion?.handoffReady, false);
  assert.equal(suggestion?.importCommand, undefined);
  assert.equal(
    result.architectureJson.nodes[0]?.config["reverseEngineeringManagement"],
    "needs_mapping"
  );
  assert.equal(result.architectureJson.nodes[0]?.config["terraformResourceType"], undefined);
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
        hasResourcePolicy: false,
        name: "customer-api",
        description: "Customer API",
        apiKeySource: "HEADER",
        binaryMediaTypes: ["application/octet-stream"],
        disableExecuteApiEndpoint: true,
        endpointConfiguration: { types: ["REGIONAL"] },
        minimumCompressionSize: 1_024,
        tags: { Environment: "production" },
        tagsReadComplete: true,
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
    hasResourcePolicy: false,
    id: "a1b2c3d4e5",
    minimumCompressionSize: 1_024,
    name: "customer-api",
    tags: { Environment: "production" },
    tagsReadComplete: true
  });
  assertReadyImport(result.importSuggestions[0], "aws_api_gateway_rest_api", "a1b2c3d4e5");
  assert.equal(
    result.architectureJson.nodes[0]?.config["terraformResourceType"],
    "aws_api_gateway_rest_api"
  );
});

test("resource policy가 있는 API Gateway REST API는 존재 marker만 남기고 자동 관리를 막는다", async () => {
  const result = await scan([
    record({
      providerResourceType: "AWS::ApiGateway::RestApi",
      providerResourceId: "a1b2c3d4e5",
      displayName: "private-api",
      config: {
        id: "a1b2c3d4e5",
        name: "private-api",
        policy: JSON.stringify({
          Statement: [{ Resource: "arn:aws:execute-api:ap-northeast-2:123456789012:*" }]
        }),
        tags: {},
        tagsReadComplete: true
      }
    })
  ]);

  const [resource] = result.discoveredResources;
  const [suggestion] = result.importSuggestions;
  assert.equal(resource?.analysisExcluded, true);
  assert.deepEqual(resource?.config, {
    hasResourcePolicy: true,
    id: "a1b2c3d4e5",
    name: "private-api",
    tags: {},
    tagsReadComplete: true
  });
  assert.equal(suggestion?.status, "manual_review");
  assert.equal(suggestion?.handoffReady, false);
  assert.equal(suggestion?.importCommand, undefined);
  assert.equal(
    result.architectureJson.nodes[0]?.config["reverseEngineeringManagement"],
    "needs_mapping"
  );
  assert.equal(result.architectureJson.nodes[0]?.config["terraformResourceType"], undefined);
  assert.doesNotMatch(JSON.stringify(result), /Statement|execute-api|arn:aws/iu);
});

test("공개 경계에서 ARN tag를 제거한 API Gateway와 ELBv2는 자동 관리를 막는다", async () => {
  const result = await scan([
    record({
      providerResourceType: "AWS::ApiGateway::RestApi",
      providerResourceId: "a1b2c3d4e5",
      displayName: "tagged-api",
      config: {
        hasResourcePolicy: false,
        id: "a1b2c3d4e5",
        name: "tagged-api",
        tags: {
          Environment: "production",
          OwnerArn: "arn:aws:iam::123456789012:role/private-owner"
        },
        tagsReadComplete: true
      }
    }),
    record({
      providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
      providerResourceId: ALB_ARN,
      displayName: "tagged-alb",
      config: {
        attributes: {},
        attributesProjectionComplete: true,
        attributesReadComplete: true,
        ipAddressType: "ipv4",
        name: "tagged-alb",
        reverseEngineeringDetailsVersion: 1,
        scheme: "internet-facing",
        subnetIds: ["subnet-a"],
        tags: [
          { key: "Environment", value: "production" },
          { key: "OwnerArn", value: "arn:aws:iam::123456789012:role/private-owner" }
        ],
        tagsReadComplete: true,
        type: "application"
      }
    })
  ]);

  assert.equal(result.discoveredResources[0]?.analysisExcluded, true);
  assert.equal(result.discoveredResources[1]?.analysisExcluded ?? false, false);
  for (const [index, resource] of result.discoveredResources.entries()) {
    assert.equal(resource.config["tagsReadComplete"], false);
    assert.equal(result.importSuggestions[index]?.status, "manual_review");
    assert.equal(result.importSuggestions[index]?.handoffReady, false);
    assert.equal(result.architectureJson.nodes[index]?.config["terraformResourceType"], undefined);
  }
  assert.doesNotMatch(JSON.stringify(result), /private-owner|arn:aws/iu);
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
      tags: [],
      tagsReadComplete: true,
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
    tags: [],
    tagsReadComplete: true,
    hasKmsKey: true
  });
  assert.deepEqual(privateResult.discoveredResources[0]?.config, {
    logGroupName: "/ecs/orders",
    retentionInDays: 30,
    kmsKeyId: CLOUDWATCH_LOG_GROUP_KMS_ARN,
    logGroupClass: "STANDARD",
    tags: [],
    tagsReadComplete: true,
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
      config: {
        logGroupClass: "STANDARD",
        logGroupName: "/ecs/orders",
        retentionInDays: 30,
        tags: [],
        tagsReadComplete: true
      }
    })
  ]);

  assert.equal(result.discoveredResources[0]?.analysisExcluded ?? false, false);
  assertReadyImport(result.importSuggestions[0], "aws_cloudwatch_log_group", "/ecs/orders");
});

test("CloudWatch Alarm과 Log Group의 tag evidence가 없으면 자동 import를 막는다", async () => {
  const result = await scan([
    record({
      providerResourceType: "AWS::CloudWatch::Alarm",
      providerResourceId: "arn:aws:cloudwatch:ap-northeast-2:123456789012:alarm:api-request-count",
      displayName: "api-request-count",
      config: {
        alarmName: "api-request-count",
        comparisonOperator: "GreaterThanThreshold",
        evaluationPeriods: 1,
        metricName: "RequestCount",
        namespace: "AWS/ApiGateway",
        period: 60,
        statistic: "Sum",
        tagsReadComplete: false,
        threshold: 100
      }
    }),
    record({
      providerResourceType: "AWS::Logs::LogGroup",
      providerResourceId: CLOUDWATCH_LOG_GROUP_ARN,
      displayName: "/ecs/orders",
      config: {
        logGroupClass: "STANDARD",
        logGroupName: "/ecs/orders"
      }
    })
  ]);

  for (const [index, resource] of result.discoveredResources.entries()) {
    assert.equal(resource.analysisExcluded, true);
    assert.equal(resource.config["tagsReadComplete"], false);
    assert.equal(result.importSuggestions[index]?.status, "manual_review");
    assert.equal(result.importSuggestions[index]?.handoffReady, false);
    assert.equal(result.importSuggestions[index]?.importCommand, undefined);
    assert.equal(
      result.architectureJson.nodes[index]?.config["reverseEngineeringManagement"],
      "needs_mapping"
    );
    assert.equal(result.architectureJson.nodes[index]?.config["terraformResourceType"], undefined);
  }
});

test("ARN 값이 든 CloudWatch tag는 공개하지 않고 불완전 projection으로 닫는다", async () => {
  const result = await scan([
    record({
      providerResourceType: "AWS::CloudWatch::Alarm",
      providerResourceId: "arn:aws:cloudwatch:ap-northeast-2:123456789012:alarm:queue-depth",
      displayName: "queue-depth",
      config: {
        alarmName: "queue-depth",
        comparisonOperator: "GreaterThanThreshold",
        evaluationPeriods: 1,
        metricName: "ApproximateNumberOfMessagesVisible",
        namespace: "AWS/SQS",
        period: 60,
        statistic: "Average",
        tags: [
          {
            key: "QueueArn",
            value: "arn:aws:sqs:ap-northeast-2:123456789012:private-queue"
          }
        ],
        tagsReadComplete: true,
        threshold: 10
      }
    })
  ]);

  assert.equal(result.discoveredResources[0]?.config["tagsReadComplete"], false);
  assert.equal(result.discoveredResources[0]?.config["tags"], undefined);
  assert.equal(result.importSuggestions[0]?.status, "manual_review");
  assert.equal(result.importSuggestions[0]?.handoffReady, false);
  assert.equal(result.architectureJson.nodes[0]?.config["terraformResourceType"], undefined);
  assert.doesNotMatch(JSON.stringify(result), /arn:aws|private-queue/iu);
});

test("CloudWatch Log Group은 STANDARD class만 자동 관리한다", async () => {
  const result = await scan([
    record({
      providerResourceType: "AWS::Logs::LogGroup",
      providerResourceId: CLOUDWATCH_LOG_GROUP_ARN,
      displayName: "/ecs/standard",
      config: {
        logGroupClass: "STANDARD",
        logGroupName: "/ecs/standard",
        tags: [],
        tagsReadComplete: true
      }
    }),
    record({
      providerResourceType: "AWS::Logs::LogGroup",
      providerResourceId: "arn:aws:logs:ap-northeast-2:123456789012:log-group:/ecs/infrequent",
      displayName: "/ecs/infrequent",
      config: {
        logGroupClass: "INFREQUENT_ACCESS",
        logGroupName: "/ecs/infrequent",
        tags: [],
        tagsReadComplete: true
      }
    })
  ]);

  assert.equal(result.discoveredResources[0]?.analysisExcluded ?? false, false);
  assert.equal(result.importSuggestions[0]?.status, "ready");
  assert.equal(result.discoveredResources[1]?.analysisExcluded, true);
  assert.equal(result.importSuggestions[1]?.status, "manual_review");
  assert.equal(result.importSuggestions[1]?.handoffReady, false);
  assert.equal(result.importSuggestions[1]?.importCommand, undefined);
  assert.equal(
    result.architectureJson.nodes[1]?.config["reverseEngineeringManagement"],
    "needs_mapping"
  );
  assert.equal(result.architectureJson.nodes[1]?.config["terraformResourceType"], undefined);
});

test("이름이 없는 CloudWatch Log Group은 자동 import에서 제외하고 이유를 남긴다", async () => {
  const result = await scan([
    record({
      providerResourceType: "AWS::Logs::LogGroup",
      providerResourceId: CLOUDWATCH_LOG_GROUP_ARN,
      displayName: "이름을 확인할 수 없는 로그",
      config: {
        logGroupClass: "STANDARD",
        retentionInDays: 30,
        tags: [],
        tagsReadComplete: true
      }
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
    attributes: {},
    attributesProjectionComplete: true,
    attributesReadComplete: true,
    arn: ALB_ARN,
    name: "source-exact-alb",
    ipAddressType: "ipv4",
    reverseEngineeringDetailsVersion: 1,
    scheme: "internet-facing",
    subnetIds: ["subnet-a"],
    tags: [],
    tagsReadComplete: true,
    type: "application"
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
    [
      result.discoveredResources[1]?.id,
      result.discoveredResources[2]?.id,
      result.discoveredResources[3]?.id,
      result.discoveredResources[4]?.id
    ]
  );

  for (const resource of result.discoveredResources.slice(3)) {
    assert.equal(resource.analysisExcluded, true);
  }
  for (const suggestion of result.importSuggestions.slice(3)) {
    assert.equal(suggestion.status, "manual_review");
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
        attributes: {},
        attributesProjectionComplete: true,
        attributesReadComplete: true,
        arn: ALB_ARN,
        name: "normalized-alb",
        loadBalancerType: "application",
        ipAddressType: "ipv4",
        reverseEngineeringDetailsVersion: 1,
        scheme: "internet-facing",
        subnetIds: ["subnet-a"],
        tags: [],
        tagsReadComplete: true
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
        attributes: {},
        attributesProjectionComplete: true,
        attributesReadComplete: true,
        arn: ALB_ARN,
        name: "mapped-alb",
        type: "application",
        ipAddressType: "ipv4",
        reverseEngineeringDetailsVersion: 1,
        scheme: "internet-facing",
        subnetMapping: [{ subnetId: "subnet-a", allocationId: "eipalloc-a" }],
        tags: [],
        tagsReadComplete: true
      }
    })
  ]);

  assert.equal(result.discoveredResources[0]?.config["sketchcatchReferenceTerraform"], undefined);
  assert.deepEqual(result.findings, []);
  assert.equal(result.importSuggestions[0]?.handoffReady, false);
  assert.equal(result.importSuggestions[0]?.importCommand, undefined);
});

test("Subnet Route Table Association을 안전한 config와 두 관계가 있는 지원 리소스로 변환한다", async () => {
  const result = await scan([
    record({
      providerResourceType: "AWS::EC2::Subnet",
      providerResourceId: "subnet-main",
      displayName: "subnet-main",
      config: {
        vpcId: "vpc-main",
        cidrBlock: "10.0.1.0/24",
        availabilityZone: "ap-northeast-2a",
        mapPublicIpOnLaunch: false,
        assignIpv6AddressOnCreation: false
      }
    }),
    record({
      providerResourceType: "AWS::EC2::RouteTable",
      providerResourceId: "rtb-main",
      displayName: "rtb-main",
      config: {
        vpcId: "vpc-main",
        routes: [
          {
            destinationCidrBlock: "10.0.0.0/16",
            gatewayId: "local",
            state: "active"
          }
        ]
      }
    }),
    record({
      providerResourceType: "AWS::EC2::RouteTableAssociation",
      providerResourceId: "rtbassoc-main-subnet",
      displayName: "rtbassoc-main-subnet",
      config: {
        routeTableAssociationId: "rtbassoc-main-subnet",
        subnetId: "subnet-main",
        routeTableId: "rtb-main",
        main: false,
        gatewayId: "must-not-be-public",
        associationState: "associated",
        providerParameters: { secret: "must-not-be-public" }
      },
      relationships: [
        { type: "attached_to", targetProviderResourceId: "subnet-main" },
        { type: "depends_on", targetProviderResourceId: "rtb-main" }
      ]
    })
  ]);

  const association = result.discoveredResources.find(
    (resource) => resource.providerResourceId === "rtbassoc-main-subnet"
  );
  assert.ok(association);
  assert.equal(association.resourceType, "ROUTE_TABLE_ASSOCIATION");
  assert.deepEqual(association.config, {
    routeTableAssociationId: "rtbassoc-main-subnet",
    subnetId: "subnet-main",
    routeTableId: "rtb-main",
    main: false
  });
  assert.deepEqual(association.relationships, [
    {
      type: "connects_to",
      targetResourceId: "resource-subnet-main",
      label: "attached_to"
    },
    {
      type: "depends_on",
      targetResourceId: "resource-rtb-main",
      label: "depends_on"
    }
  ]);

  const associationNode = result.architectureJson.nodes.find((node) => node.id === association.id);
  assert.equal(associationNode?.config["reverseEngineeringManagement"], "managed");
  assert.equal(associationNode?.config["terraformResourceType"], "aws_route_table_association");
  assert.deepEqual(
    {
      subnetId: associationNode?.config["subnetId"],
      routeTableId: associationNode?.config["routeTableId"]
    },
    {
      subnetId: "aws_subnet.resource_subnet_main.id",
      routeTableId: "aws_route_table.resource_rtb_main.id"
    }
  );
  assert.deepEqual(
    result.architectureJson.edges
      .filter((edge) => edge.targetId === association.id)
      .map((edge) => edge.sourceId),
    ["resource-subnet-main", "resource-rtb-main"]
  );
});

test("EIP과 public NAT을 안전한 config, same-scan 참조, import identity가 있는 지원 리소스로 변환한다", async () => {
  const allocationId = "eipalloc-0123456789abcdef0";
  const natGatewayId = "nat-0123456789abcdef0";
  const result = await scan([
    record({
      providerResourceType: "AWS::EC2::Subnet",
      providerResourceId: "subnet-0123456789abcdef0",
      displayName: "private-a",
      config: {
        vpcId: "vpc-0123456789abcdef0",
        cidrBlock: "10.0.1.0/24",
        availabilityZone: "ap-northeast-2a",
        mapPublicIpOnLaunch: false,
        assignIpv6AddressOnCreation: false
      }
    }),
    record({
      providerResourceType: "AWS::EC2::EIP",
      providerResourceId: allocationId,
      displayName: "egress-ip",
      config: {
        allocationId,
        associationTargetType: "nat_gateway",
        domain: "vpc",
        publicIp: "203.0.113.10",
        tags: [{ key: "Name", value: "egress-ip" }],
        associationId: "eipassoc-must-not-be-public",
        networkInterfaceId: "eni-must-not-be-public",
        privateIpAddress: "10.0.1.10",
        providerParameters: { secret: "must-not-be-public" }
      },
      relationships: [{ type: "depends_on", targetProviderResourceId: natGatewayId }]
    }),
    record({
      providerResourceType: "AWS::EC2::NatGateway",
      providerResourceId: natGatewayId,
      displayName: "public-egress",
      config: {
        allocationIds: [allocationId],
        connectivityType: "public",
        natGatewayId,
        primaryAllocationId: allocationId,
        state: "available",
        subnetId: "subnet-0123456789abcdef0",
        tags: [{ key: "Name", value: "public-egress" }],
        failureMessage: "arn:aws:iam::123456789012:role/must-not-be-public",
        networkInterfaceId: "eni-must-not-be-public",
        privateIp: "10.0.1.10",
        providerParameters: { secret: "must-not-be-public" }
      },
      relationships: [
        { type: "contains", targetProviderResourceId: "subnet-0123456789abcdef0" },
        { type: "depends_on", targetProviderResourceId: allocationId }
      ]
    })
  ]);

  const eip = result.discoveredResources.find(
    (resource) => resource.providerResourceId === allocationId
  );
  const nat = result.discoveredResources.find(
    (resource) => resource.providerResourceId === natGatewayId
  );
  assert.ok(eip);
  assert.ok(nat);
  assert.equal(eip.resourceType, "ELASTIC_IP");
  assert.equal(nat.resourceType, "NAT_GATEWAY");
  assert.deepEqual(eip.config, {
    allocationId,
    associationTargetType: "nat_gateway",
    domain: "vpc",
    publicIp: "203.0.113.10",
    tags: [{ key: "Name", value: "egress-ip" }]
  });
  assert.deepEqual(nat.config, {
    allocationIds: [allocationId],
    connectivityType: "public",
    natGatewayId,
    primaryAllocationId: allocationId,
    state: "available",
    subnetId: "subnet-0123456789abcdef0",
    tags: [{ key: "Name", value: "public-egress" }]
  });
  assert.doesNotMatch(JSON.stringify([eip, nat]), /must-not-be-public|arn:aws|eni-|10\.0\.1\.10/u);
  assert.equal(eip.analysisExcluded ?? false, false);
  assert.equal(nat.analysisExcluded ?? false, false);

  const eipNode = result.architectureJson.nodes.find((node) => node.id === eip.id);
  const natNode = result.architectureJson.nodes.find((node) => node.id === nat.id);
  assert.equal(eipNode?.config["terraformResourceType"], "aws_eip");
  assert.equal(natNode?.config["terraformResourceType"], "aws_nat_gateway");
  assert.equal(natNode?.config["subnetId"], "aws_subnet.resource_subnet_0123456789abcdef0.id");
  assert.equal(natNode?.config["allocationId"], "aws_eip.resource_eipalloc_0123456789abcdef0.id");

  assertReadyImport(
    result.importSuggestions.find((suggestion) => suggestion.resourceId === eip.id),
    "aws_eip",
    allocationId
  );
  assertReadyImport(
    result.importSuggestions.find((suggestion) => suggestion.resourceId === nat.id),
    "aws_nat_gateway",
    natGatewayId
  );
});

test("unsupported EIP association과 deleted/incomplete NAT은 보드에 유지하고 needs_mapping으로 닫는다", async () => {
  const result = await scan([
    record({
      providerResourceType: "AWS::EC2::EIP",
      providerResourceId: "eipalloc-0123456789abcdef0",
      displayName: "unsupported-eip",
      config: {
        allocationId: "eipalloc-0123456789abcdef0",
        associationTargetType: "ec2_or_eni",
        domain: "vpc"
      }
    }),
    record({
      providerResourceType: "AWS::EC2::NatGateway",
      providerResourceId: "nat-0123456789abcdef0",
      displayName: "deleted-nat",
      config: {
        allocationIds: [],
        connectivityType: "private",
        natGatewayId: "nat-0123456789abcdef0",
        state: "deleted",
        subnetId: "subnet-0123456789abcdef0"
      }
    })
  ]);

  assert.deepEqual(
    result.discoveredResources.map((resource) => ({
      resourceType: resource.resourceType,
      analysisExcluded: resource.analysisExcluded,
      importSuggestionStatus: resource.importSuggestionStatus
    })),
    [
      {
        resourceType: "ELASTIC_IP",
        analysisExcluded: true,
        importSuggestionStatus: "manual_review"
      },
      {
        resourceType: "NAT_GATEWAY",
        analysisExcluded: true,
        importSuggestionStatus: "manual_review"
      }
    ]
  );
  assert.deepEqual(
    result.architectureJson.nodes.map((node) => node.config["reverseEngineeringManagement"]),
    ["needs_mapping", "needs_mapping"]
  );
  assert.equal(
    result.analysisExclusions.every((exclusion) => exclusion.reason === "missing_required_data"),
    true
  );
  for (const suggestion of result.importSuggestions) {
    assertManualImportWithoutIdentity(suggestion);
  }
});

test("AWS 서비스 관리 EIP는 Terraform 관리와 import에서 제외한다", async () => {
  const result = await scan([
    record({
      providerResourceType: "AWS::EC2::EIP",
      providerResourceId: "eipalloc-abcdef01234567890",
      displayName: "service-managed-eip",
      config: {
        allocationId: "eipalloc-abcdef01234567890",
        associationTargetType: "service_managed",
        domain: "vpc"
      }
    })
  ]);

  const [resource] = result.discoveredResources;
  const [node] = result.architectureJson.nodes;
  const [suggestion] = result.importSuggestions;

  assert.equal(resource?.analysisExcluded, true);
  assert.equal(resource?.importSuggestionStatus, "manual_review");
  assert.equal(node?.config["reverseEngineeringManagement"], "needs_mapping");
  assertManualImportWithoutIdentity(suggestion);
});

test("NAT만 선택하면 해당 NAT가 참조하는 Subnet과 EIP만 함께 가져온다", async () => {
  const selectedSubnetId = "subnet-0123456789abcdef0";
  const unrelatedSubnetId = "subnet-fedcba98765432100";
  const selectedAllocationId = "eipalloc-0123456789abcdef0";
  const unrelatedAllocationId = "eipalloc-fedcba98765432100";
  const natGatewayId = "nat-0123456789abcdef0";
  const records = [
    record({
      providerResourceType: "AWS::EC2::Subnet",
      providerResourceId: selectedSubnetId,
      displayName: "selected-subnet",
      config: { vpcId: "vpc-main", cidrBlock: "10.0.1.0/24" }
    }),
    record({
      providerResourceType: "AWS::EC2::Subnet",
      providerResourceId: unrelatedSubnetId,
      displayName: "unrelated-subnet",
      config: { vpcId: "vpc-main", cidrBlock: "10.0.2.0/24" }
    }),
    record({
      providerResourceType: "AWS::EC2::EIP",
      providerResourceId: selectedAllocationId,
      displayName: "selected-eip",
      config: {
        allocationId: selectedAllocationId,
        associationTargetType: "nat_gateway",
        domain: "vpc"
      },
      relationships: [{ type: "depends_on", targetProviderResourceId: natGatewayId }]
    }),
    record({
      providerResourceType: "AWS::EC2::EIP",
      providerResourceId: unrelatedAllocationId,
      displayName: "unrelated-eip",
      config: {
        allocationId: unrelatedAllocationId,
        associationTargetType: "unassociated",
        domain: "vpc"
      }
    }),
    record({
      providerResourceType: "AWS::EC2::NatGateway",
      providerResourceId: natGatewayId,
      displayName: "selected-nat",
      config: {
        allocationIds: [selectedAllocationId],
        connectivityType: "public",
        natGatewayId,
        primaryAllocationId: selectedAllocationId,
        state: "available",
        subnetId: selectedSubnetId
      },
      relationships: [
        { type: "contains", targetProviderResourceId: selectedSubnetId },
        { type: "depends_on", targetProviderResourceId: selectedAllocationId }
      ]
    })
  ];

  const result = await scanWithSelection(records, ["NAT_GATEWAY"]);

  assert.deepEqual(
    result.discoveredResources.map((resource) => resource.providerResourceId).sort(),
    [natGatewayId, selectedAllocationId, selectedSubnetId].sort()
  );
  assert.equal(
    result.discoveredResources.some(
      (resource) =>
        resource.providerResourceId === unrelatedSubnetId ||
        resource.providerResourceId === unrelatedAllocationId
    ),
    false
  );
});

test("Target Group만 선택하면 연결된 VPC만 의존 리소스로 함께 가져온다", async () => {
  const selectedVpcId = "vpc-orders";
  const unrelatedVpcId = "vpc-unrelated";
  const targetGroupArn =
    "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/orders/1111111111111111";
  const result = await scanWithSelection(
    [
      record({
        providerResourceType: "AWS::EC2::VPC",
        providerResourceId: selectedVpcId,
        displayName: "orders-vpc",
        config: { cidrBlock: "10.0.0.0/16", enableDnsSupport: true }
      }),
      record({
        providerResourceType: "AWS::EC2::VPC",
        providerResourceId: unrelatedVpcId,
        displayName: "unrelated-vpc",
        config: { cidrBlock: "10.1.0.0/16", enableDnsSupport: true }
      }),
      record({
        providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
        providerResourceId: ALB_ARN,
        displayName: "orders-alb",
        config: {
          name: "orders-alb",
          type: "application",
          ipAddressType: "ipv4",
          scheme: "internet-facing",
          subnetIds: ["subnet-orders"],
          vpcId: selectedVpcId
        },
        relationships: [{ type: "depends_on", targetProviderResourceId: selectedVpcId }]
      }),
      record({
        providerResourceType: "AWS::ElasticLoadBalancingV2::TargetGroup",
        providerResourceId: targetGroupArn,
        displayName: "orders-api",
        config: {
          name: "orders-api",
          port: 8080,
          protocol: "HTTP",
          targetType: "ip",
          vpcId: selectedVpcId
        },
        relationships: [
          { type: "depends_on", targetProviderResourceId: selectedVpcId },
          { type: "attached_to", targetProviderResourceId: ALB_ARN }
        ]
      })
    ],
    ["LOAD_BALANCER_TARGET_GROUP"]
  );

  assert.equal(
    result.discoveredResources.some((resource) => resource.providerResourceId === selectedVpcId),
    true
  );
  assert.equal(
    result.discoveredResources.some((resource) => resource.providerResourceId === unrelatedVpcId),
    false
  );
});

test("Listener만 선택하면 연결된 ALB Target Group VPC만 함께 가져온다", async () => {
  const selectedVpcId = "vpc-orders";
  const unrelatedVpcId = "vpc-unrelated";
  const targetGroupArn =
    "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/orders/1111111111111111";
  const unrelatedTargetGroupArn =
    "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/unrelated/2222222222222222";
  const listenerArn =
    "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:listener/app/shared/1111111111111111/listener";
  const result = await scanWithSelection(
    [
      record({
        providerResourceType: "AWS::EC2::VPC",
        providerResourceId: selectedVpcId,
        displayName: "orders-vpc",
        config: { cidrBlock: "10.0.0.0/16" }
      }),
      record({
        providerResourceType: "AWS::EC2::VPC",
        providerResourceId: unrelatedVpcId,
        displayName: "unrelated-vpc",
        config: { cidrBlock: "10.1.0.0/16" }
      }),
      record({
        providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
        providerResourceId: ALB_ARN,
        displayName: "orders-alb",
        config: { name: "orders-alb", type: "application", vpcId: selectedVpcId }
      }),
      record({
        providerResourceType: "AWS::ElasticLoadBalancingV2::TargetGroup",
        providerResourceId: targetGroupArn,
        displayName: "orders-api",
        config: { name: "orders-api", vpcId: selectedVpcId },
        relationships: [
          { type: "depends_on", targetProviderResourceId: selectedVpcId },
          { type: "attached_to", targetProviderResourceId: ALB_ARN }
        ]
      }),
      record({
        providerResourceType: "AWS::ElasticLoadBalancingV2::TargetGroup",
        providerResourceId: unrelatedTargetGroupArn,
        displayName: "unrelated-api",
        config: { name: "unrelated-api", vpcId: unrelatedVpcId }
      }),
      record({
        providerResourceType: "AWS::ElasticLoadBalancingV2::Listener",
        providerResourceId: listenerArn,
        displayName: "HTTP:80",
        config: { port: 80, protocol: "HTTP", simpleForwardAction: true },
        relationships: [
          { type: "depends_on", targetProviderResourceId: ALB_ARN },
          { type: "attached_to", targetProviderResourceId: targetGroupArn }
        ]
      })
    ],
    ["LOAD_BALANCER_LISTENER"]
  );

  assert.deepEqual(
    result.discoveredResources.map((resource) => resource.displayName).sort(),
    ["orders-vpc", "orders-alb", "orders-api", "HTTP:80"].sort()
  );
});

async function scan(records: AwsDiscoveredResourceRecord[]): Promise<ReverseEngineeringScanResult> {
  return scanWithSelection(records, ["ALL"]);
}

async function scanWithSelection(
  records: AwsDiscoveredResourceRecord[],
  resourceTypes: ReverseEngineeringScanResult["scan"]["resourceTypes"]
): Promise<ReverseEngineeringScanResult> {
  return createAwsProviderAdapter({
    async discoverResources() {
      return records;
    }
  }).scan({ provider: "aws", region: "ap-northeast-2", resourceTypes });
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
