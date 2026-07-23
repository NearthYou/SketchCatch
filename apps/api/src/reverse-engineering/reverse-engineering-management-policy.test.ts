import assert from "node:assert/strict";
import test from "node:test";
import type { DiscoveredResource, ResourceType } from "@sketchcatch/types";
import { classifyReverseEngineeringManagement } from "./reverse-engineering-management-policy.js";

test("자동 지원 워크로드와 AMI를 Terraform 관리 경계에 맞게 분류한다", () => {
  assert.equal(classifyReverseEngineeringManagement(resource("S3")), "managed");
  assert.equal(
    classifyReverseEngineeringManagement(
      resource("ECS_SERVICE", {
        name: "customer-api",
        clusterArn: "arn:aws:ecs:ap-northeast-2:123456789012:cluster/customer",
        taskDefinitionArn: "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/customer-api:1",
        desiredCount: 1,
        launchType: "FARGATE",
        networkConfiguration: {
          awsvpcConfiguration: {
            subnets: ["subnet-a"],
            securityGroups: ["sg-api"]
          }
        }
      })
    ),
    "managed"
  );
  assert.equal(
    classifyReverseEngineeringManagement(
      resource("CLOUDWATCH_LOG_GROUP", {
        logGroupClass: "STANDARD",
        logGroupName: "/ecs/customer-api",
        tags: [],
        tagsReadComplete: true
      })
    ),
    "managed"
  );
  assert.equal(
    classifyReverseEngineeringManagement(
      resource("API_GATEWAY_REST_API", {
        hasResourcePolicy: false,
        name: "customer-api",
        tags: {},
        tagsReadComplete: true
      })
    ),
    "managed"
  );
  assert.equal(
    classifyReverseEngineeringManagement(
      resource("CLOUDWATCH_METRIC_ALARM", {
        alarmName: "api-request-count",
        comparisonOperator: "GreaterThanThreshold",
        evaluationPeriods: 1,
        threshold: 100,
        metricName: "RequestCount",
        namespace: "AWS/ApiGateway",
        period: 60,
        statistic: "Sum",
        tags: [],
        tagsReadComplete: true
      })
    ),
    "managed"
  );
  assert.equal(classifyReverseEngineeringManagement(resource("AMI")), "reference");
});

test("API Gateway는 policy 부재와 전체 tag를 명시적으로 확인한 경우에만 관리한다", () => {
  for (const config of [
    { name: "legacy-api", tags: {}, tagsReadComplete: true },
    { hasResourcePolicy: true, name: "private-api", tags: {}, tagsReadComplete: true },
    { hasResourcePolicy: false, name: "missing-tags" },
    {
      hasResourcePolicy: false,
      name: "malformed-tags",
      tags: { Owner: 123 },
      tagsReadComplete: true
    }
  ]) {
    assert.equal(
      classifyReverseEngineeringManagement(resource("API_GATEWAY_REST_API", config)),
      "needs_mapping"
    );
  }

  assert.equal(
    classifyReverseEngineeringManagement(
      resource("API_GATEWAY_REST_API", {
        hasResourcePolicy: false,
        name: "public-api",
        tags: {},
        tagsReadComplete: true
      })
    ),
    "managed"
  );
});

test("EIP는 VPC allocation과 unassociated/NAT association만 자동 관리한다", () => {
  const baseConfig = {
    allocationId: "eipalloc-0123456789abcdef0",
    domain: "vpc"
  };

  for (const associationTargetType of ["unassociated", "nat_gateway"]) {
    assert.equal(
      classifyReverseEngineeringManagement(
        resource("ELASTIC_IP", { ...baseConfig, associationTargetType })
      ),
      "managed"
    );
  }

  for (const config of [
    { ...baseConfig, associationTargetType: "ec2_or_eni" },
    { ...baseConfig, associationTargetType: "unknown" },
    { ...baseConfig, domain: "standard", associationTargetType: "unassociated" },
    { domain: "vpc", associationTargetType: "unassociated" }
  ]) {
    assert.equal(
      classifyReverseEngineeringManagement(resource("ELASTIC_IP", config)),
      "needs_mapping"
    );
  }
});

test("available NAT은 connectivity별 완전한 allocation 경계만 자동 관리한다", () => {
  const publicNat = {
    allocationIds: ["eipalloc-0123456789abcdef0", "eipalloc-fedcba98765432100"],
    connectivityType: "public",
    natGatewayId: "nat-0123456789abcdef0",
    primaryAllocationId: "eipalloc-0123456789abcdef0",
    state: "available",
    subnetId: "subnet-0123456789abcdef0"
  };
  const privateNat = {
    allocationIds: [],
    connectivityType: "private",
    natGatewayId: "nat-fedcba98765432100",
    state: "available",
    subnetId: "subnet-fedcba98765432100"
  };

  assert.equal(classifyReverseEngineeringManagement(resource("NAT_GATEWAY", publicNat)), "managed");
  assert.equal(
    classifyReverseEngineeringManagement(resource("NAT_GATEWAY", privateNat)),
    "managed"
  );

  for (const config of [
    { ...publicNat, state: "failed" },
    { ...publicNat, state: "deleted" },
    { ...publicNat, state: "pending" },
    { ...publicNat, primaryAllocationId: undefined },
    { ...publicNat, allocationIds: [publicNat.allocationIds[1]] },
    { ...publicNat, addressStatusesReady: false },
    { ...privateNat, allocationIds: ["eipalloc-0123456789abcdef0"] },
    { ...privateNat, connectivityType: "unsupported" }
  ]) {
    assert.equal(
      classifyReverseEngineeringManagement(resource("NAT_GATEWAY", config)),
      "needs_mapping"
    );
  }
});

test("규칙 원본의 완전성을 확인한 Security Group만 자동 관리한다", () => {
  assert.equal(
    classifyReverseEngineeringManagement(
      resource("SECURITY_GROUP", {
        securityGroupRulesComplete: true,
        ingress: [
          {
            ipProtocol: "-1",
            cidrBlocks: ["0.0.0.0/0"]
          }
        ],
        egress: []
      })
    ),
    "managed"
  );
  assert.equal(
    classifyReverseEngineeringManagement(
      resource("SECURITY_GROUP", {
        securityGroupRulesComplete: false,
        ingress: [],
        egress: []
      })
    ),
    "needs_mapping"
  );
  assert.equal(
    classifyReverseEngineeringManagement(
      resource("SECURITY_GROUP", {
        ingress: [{ ipProtocol: "tcp", fromPort: 443, toPort: 443 }],
        egress: []
      })
    ),
    "needs_mapping"
  );
});

test("Action 대상이나 Metric Query 연결이 남은 CloudWatch Alarm은 매핑 전까지 관리하지 않는다", () => {
  assert.equal(
    classifyReverseEngineeringManagement(
      resource("CLOUDWATCH_METRIC_ALARM", {
        hasActionTargets: true,
        tags: [],
        tagsReadComplete: true
      })
    ),
    "needs_mapping"
  );
  assert.equal(
    classifyReverseEngineeringManagement(
      resource("CLOUDWATCH_METRIC_ALARM", {
        hasMetricQueries: true,
        tags: [],
        tagsReadComplete: true
      })
    ),
    "needs_mapping"
  );
  assert.equal(
    classifyReverseEngineeringManagement(
      resource("CLOUDWATCH_METRIC_ALARM", {
        tags: [],
        tagsReadComplete: true,
        thresholdMetricId: "e1"
      })
    ),
    "needs_mapping"
  );
});

test("AWS가 소유한 IAM service-linked Role과 KMS Key는 관리하지 않는다", () => {
  assert.equal(
    classifyReverseEngineeringManagement(
      resource("IAM_ROLE", { roleName: "AWSServiceRoleForECS" })
    ),
    "aws_managed"
  );
  assert.equal(
    classifyReverseEngineeringManagement(
      resource("IAM_ROLE", { roleName: "AWSReservedSSO_Admin" })
    ),
    "aws_managed"
  );
  assert.equal(
    classifyReverseEngineeringManagement(resource("KMS_KEY", { keyManager: "AWS" })),
    "aws_managed"
  );
});

test("KMS 연결 Log Group은 보드에만 남기고 암호화되지 않은 Log Group만 관리한다", () => {
  assert.equal(
    classifyReverseEngineeringManagement(
      resource("CLOUDWATCH_LOG_GROUP", {
        hasKmsKey: true,
        logGroupClass: "STANDARD",
        tags: [],
        tagsReadComplete: true
      })
    ),
    "needs_mapping"
  );
  assert.equal(
    classifyReverseEngineeringManagement(
      resource("CLOUDWATCH_LOG_GROUP", {
        logGroupClass: "STANDARD",
        kmsKeyId:
          "arn:aws:kms:ap-northeast-2:123456789012:key/11111111-2222-3333-4444-555555555555",
        tags: [],
        tagsReadComplete: true
      })
    ),
    "needs_mapping"
  );
  assert.equal(
    classifyReverseEngineeringManagement(
      resource("CLOUDWATCH_LOG_GROUP", {
        logGroupClass: "STANDARD",
        logGroupName: "/ecs/customer-api",
        tags: [],
        tagsReadComplete: true
      })
    ),
    "managed"
  );
});

test("SketchCatch 연결 제어 Role과 Policy는 Terraform 관리에서 제외한다", () => {
  assert.equal(
    classifyReverseEngineeringManagement(
      resource("IAM_ROLE", { roleName: "SketchCatchImportCfn-cf4c4732fd3b8f8a" })
    ),
    "sketchcatch_managed"
  );
  assert.equal(
    classifyReverseEngineeringManagement(
      resource("IAM_POLICY", { policyName: "SketchCatchImportRead-cf4c4732fd3b8f8a" })
    ),
    "sketchcatch_managed"
  );
  assert.equal(
    classifyReverseEngineeringManagement(
      resource("IAM_ROLE", { roleName: "SketchCatchTerraformExecutionRole-467ff1a5" })
    ),
    "sketchcatch_managed"
  );
});

test("이름 접두사가 비슷할 뿐인 고객 IAM 리소스는 SketchCatch 소유로 오판하지 않는다", () => {
  for (const { resourceType, config } of [
    {
      resourceType: "IAM_ROLE" as const,
      config: { roleName: "SketchCatchTerraformCustomerArchive" }
    },
    {
      resourceType: "IAM_ROLE" as const,
      config: { roleName: "SketchCatchCodeBuilder" }
    },
    {
      resourceType: "IAM_POLICY" as const,
      config: { policyName: "SketchCatchImportCustomerData" }
    }
  ]) {
    assert.equal(
      classifyReverseEngineeringManagement(resource(resourceType, config)),
      "needs_mapping"
    );
  }
});

test("실제 import access Stack 이름은 대소문자와 무관하게 SketchCatch 관리로 분류한다", () => {
  for (const stackName of [
    "sketchcatch-import-cf4c4732fd3b8f8a-policy",
    "SKETCHCATCH-IMPORT-CF4C4732FD3B8F8A-MANAGER"
  ]) {
    assert.equal(
      classifyReverseEngineeringManagement(
        resource("UNKNOWN", { stackName }, "AWS::CloudFormation::Stack")
      ),
      "sketchcatch_managed"
    );
  }
});

test("AWS reader 형태의 CloudFormation ownership tag가 있으면 관리하지 않는다", () => {
  assert.equal(
    classifyReverseEngineeringManagement(
      resource("S3", {
        tags: [
          {
            key: "aws:cloudformation:stack-id",
            value: "arn:aws:cloudformation:ap-northeast-2:123456789012:stack/customer/stack-id"
          },
          { key: "aws:cloudformation:stack-name", value: "customer" }
        ]
      })
    ),
    "reference"
  );
  assert.equal(
    classifyReverseEngineeringManagement(
      resource("S3", {
        tags: [{ Key: "aws:cloudformation:logical-id", Value: "CustomerBucket" }]
      })
    ),
    "reference"
  );
});

test("SketchCatch ownership tag와 marker는 Resource 종류와 무관하게 보호한다", () => {
  assert.equal(
    classifyReverseEngineeringManagement(
      resource("ECS_TASK_DEFINITION", {
        tags: [
          { key: "ManagedBy", value: "SketchCatch" },
          { key: "SketchCatchProject", value: "project-123" }
        ]
      })
    ),
    "sketchcatch_managed"
  );
  assert.equal(
    classifyReverseEngineeringManagement(resource("UNKNOWN", { managedBy: "SketchCatch" })),
    "sketchcatch_managed"
  );
  assert.equal(
    classifyReverseEngineeringManagement(
      resource("S3", { tags: [{ Key: "ManagedBy", Value: "SketchCatch" }] })
    ),
    "sketchcatch_managed"
  );
});

test("SketchCatch ownership 값은 정확히 일치할 때만 신뢰한다", () => {
  for (const value of ["sketchcatch", "SketchCatch ", "Terraform"]) {
    assert.equal(
      classifyReverseEngineeringManagement(resource("S3", { tags: [{ key: "ManagedBy", value }] })),
      "managed"
    );
  }
  assert.equal(
    classifyReverseEngineeringManagement(
      resource("S3", { tags: [{ key: "SketchCatchProject", value: "project-123" }] })
    ),
    "managed"
  );
});

test("지원되지 않은 고객 리소스는 명시적 매핑 전까지 관리하지 않는다", () => {
  assert.equal(classifyReverseEngineeringManagement(resource("UNKNOWN")), "needs_mapping");
  assert.equal(
    classifyReverseEngineeringManagement(resource("LAMBDA", { functionName: "customer-handler" })),
    "needs_mapping"
  );
});

test("상세 Reader 타입은 exact provider와 완료 marker가 모두 있을 때만 관리한다", () => {
  const managedPolicy = resource(
    "IAM_POLICY",
    detailedConfig({
      policyName: "orders-read",
      policyDocument: { Version: "2012-10-17", Statement: [] },
      terraformImportId: "arn:aws:iam::111122223333:policy/orders-read"
    }),
    "AWS::IAM::Policy"
  );

  assert.equal(classifyReverseEngineeringManagement(managedPolicy), "managed");
  assert.equal(
    classifyReverseEngineeringManagement({
      ...managedPolicy,
      providerResourceType: "AWS::IAM::RolePolicy"
    }),
    "needs_mapping"
  );

  for (const config of [
    { ...managedPolicy.config, managementReady: false },
    { ...managedPolicy.config, reverseEngineeringDetailsComplete: false },
    { ...managedPolicy.config, reverseEngineeringDetailsVersion: undefined },
    { ...managedPolicy.config, terraformImportId: undefined }
  ]) {
    assert.equal(
      classifyReverseEngineeringManagement({ ...managedPolicy, config }),
      "needs_mapping"
    );
  }
});

test("상세 Reader가 지원하는 IAM Lambda KMS API Gateway 타입을 자동 관리 범위에 포함한다", () => {
  const candidates = [
    resource(
      "IAM_ROLE",
      detailedConfig({
        roleName: "orders-role",
        trustPolicyDocument: { Version: "2012-10-17", Statement: [] },
        terraformImportId: "orders-role"
      }),
      "AWS::IAM::Role"
    ),
    resource(
      "IAM_INSTANCE_PROFILE",
      detailedConfig({
        instanceProfileName: "orders-profile",
        roleNames: ["orders-role"],
        terraformImportId: "orders-profile"
      }),
      "AWS::IAM::InstanceProfile"
    ),
    resource(
      "LAMBDA_PERMISSION",
      detailedConfig({
        functionName: "orders-api",
        statementId: "AllowInvoke",
        statement: {
          Sid: "AllowInvoke",
          Effect: "Allow",
          Action: "lambda:InvokeFunction",
          Principal: "apigateway.amazonaws.com",
          Resource: "arn:aws:lambda:ap-northeast-2:111122223333:function:orders-api"
        },
        terraformImportId: "orders-api/AllowInvoke"
      }),
      "AWS::Lambda::Permission"
    ),
    resource(
      "KMS_ALIAS",
      detailedConfig({
        aliasName: "alias/orders",
        targetKeyId: "11111111-2222-3333-4444-555555555555",
        terraformImportId: "alias/orders"
      }),
      "AWS::KMS::Alias"
    ),
    resource(
      "API_GATEWAY_STAGE",
      detailedConfig({
        restApiId: "api123",
        deploymentId: "deployment123",
        stageName: "prod",
        terraformImportId: "api123/prod"
      }),
      "AWS::ApiGateway::Stage"
    )
  ];

  assert.deepEqual(candidates.map(classifyReverseEngineeringManagement), [
    "managed",
    "managed",
    "managed",
    "managed",
    "managed"
  ]);
});

function detailedConfig(config: Record<string, unknown>): Record<string, unknown> {
  return {
    managementReady: true,
    reverseEngineeringDetailsComplete: true,
    reverseEngineeringDetailsVersion: 1,
    reverseEngineeringIncompleteDetails: [],
    ...config
  };
}

function resource(
  resourceType: ResourceType,
  config: Record<string, unknown> = {},
  providerResourceType = PROVIDER_RESOURCE_TYPES[resourceType] ?? `AWS::Test::${resourceType}`
): DiscoveredResource {
  return {
    id: `resource-${resourceType}`,
    provider: "aws",
    providerResourceType,
    providerResourceId: `aws-ref-${resourceType.toLowerCase()}`,
    region: "ap-northeast-2",
    displayName: `customer-${resourceType.toLowerCase()}`,
    resourceType,
    config
  };
}

const PROVIDER_RESOURCE_TYPES: Partial<Record<ResourceType, string>> = {
  IAM_ROLE: "AWS::IAM::Role",
  IAM_POLICY: "AWS::IAM::Policy",
  KMS_KEY: "AWS::KMS::Key"
};
