import type { AwsConnection, ReverseEngineeringScanResult } from "@sketchcatch/types";

export const TASK9_SUPPORTED_RESOURCE_IDS = [
  "vpc-task9",
  "subnet-task9",
  "security-group-task9",
  "load-balancer-task9",
  "cloudfront-task9",
  "ecs-cluster-task9",
  "ecs-service-task9",
  "ecs-task-definition-task9"
] as const;

export const TASK9_REVIEW_ONLY_RESOURCE_IDS = ["lambda-task9", "iam-role-task9"] as const;

const region = "ap-northeast-2";
const accountId = "123456789012";
const vpcId = "vpc-0123456789abcdef0";
const subnetId = "subnet-0123456789abcdef0";
const securityGroupId = "sg-0123456789abcdef0";
const loadBalancerArn =
  "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/orders/1111111111111111";
const cloudFrontArn = "arn:aws:cloudfront::123456789012:distribution/EDISTRIBUTIONTASK9";
const ecsClusterArn = "arn:aws:ecs:ap-northeast-2:123456789012:cluster/orders";
const ecsServiceArn = "arn:aws:ecs:ap-northeast-2:123456789012:service/orders/api";
const ecsTaskDefinitionArn = "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/orders:7";

const architectureJson: ReverseEngineeringScanResult["architectureJson"] = {
  nodes: [
    {
      id: "vpc-task9",
      type: "VPC",
      label: "Orders VPC",
      positionX: 0,
      positionY: 240,
      config: {
        providerResourceId: vpcId,
        providerResourceType: "AWS::EC2::VPC",
        region,
        accountId,
        analysisExcluded: false
      }
    },
    {
      id: "subnet-task9",
      type: "SUBNET",
      label: "Orders private subnet",
      positionX: 240,
      positionY: 420,
      config: {
        providerResourceId: subnetId,
        providerResourceType: "AWS::EC2::Subnet",
        region,
        accountId,
        vpcId,
        analysisExcluded: false
      }
    },
    {
      id: "security-group-task9",
      type: "SECURITY_GROUP",
      label: "Orders service security group",
      positionX: 240,
      positionY: 600,
      config: {
        providerResourceId: securityGroupId,
        providerResourceType: "AWS::EC2::SecurityGroup",
        region,
        accountId,
        vpcId,
        analysisExcluded: false
      }
    },
    {
      id: "load-balancer-task9",
      type: "LOAD_BALANCER",
      label: "Orders application load balancer",
      positionX: 520,
      positionY: 240,
      config: {
        providerResourceId: loadBalancerArn,
        providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
        region,
        accountId,
        vpcId,
        securityGroupIds: [securityGroupId],
        subnetIds: [subnetId],
        analysisExcluded: false
      }
    },
    {
      id: "cloudfront-task9",
      type: "CLOUDFRONT",
      label: "Orders global edge",
      positionX: 520,
      positionY: 0,
      config: {
        providerResourceId: cloudFrontArn,
        providerResourceType: "AWS::CloudFront::Distribution",
        region: "global",
        accountId,
        distributionId: "EDISTRIBUTIONTASK9",
        analysisExcluded: false
      }
    },
    {
      id: "ecs-task-definition-task9",
      type: "ECS_TASK_DEFINITION",
      label: "orders:7",
      positionX: 520,
      positionY: 480,
      config: {
        providerResourceId: ecsTaskDefinitionArn,
        providerResourceType: "AWS::ECS::TaskDefinition",
        region,
        accountId,
        family: "orders",
        revision: 7,
        sketchcatchReferenceTerraform: true,
        terraformValidationMissingFields: ["containerDefinitions.environment"],
        requiresManualEnvironmentInput: true,
        analysisExcluded: false
      }
    },
    {
      id: "ecs-cluster-task9",
      type: "ECS_CLUSTER",
      label: "orders",
      positionX: 760,
      positionY: 480,
      config: {
        providerResourceId: ecsClusterArn,
        providerResourceType: "AWS::ECS::Cluster",
        region,
        accountId,
        name: "orders",
        analysisExcluded: false
      }
    },
    {
      id: "ecs-service-task9",
      type: "ECS_SERVICE",
      label: "api",
      positionX: 1000,
      positionY: 480,
      config: {
        providerResourceId: ecsServiceArn,
        providerResourceType: "AWS::ECS::Service",
        region,
        accountId,
        clusterArn: ecsClusterArn,
        taskDefinitionArn: ecsTaskDefinitionArn,
        analysisExcluded: false
      }
    },
    {
      id: "lambda-task9",
      type: "LAMBDA",
      label: "orders-handler",
      positionX: 280,
      positionY: 80,
      config: {
        providerResourceId: "arn:aws:lambda:ap-northeast-2:123456789012:function:orders-handler",
        providerResourceType: "AWS::Lambda::Function",
        region,
        accountId,
        analysisExcluded: true
      }
    },
    {
      id: "iam-role-task9",
      type: "IAM_ROLE",
      label: "orders-read-only",
      positionX: 540,
      positionY: 80,
      config: {
        providerResourceId: "arn:aws:iam::123456789012:role/orders-read-only",
        providerResourceType: "AWS::IAM::Role",
        region,
        accountId,
        analysisExcluded: true
      }
    }
  ],
  edges: [
    { id: "edge-vpc-subnet-task9", sourceId: "vpc-task9", targetId: "subnet-task9" },
    {
      id: "edge-vpc-security-group-task9",
      sourceId: "vpc-task9",
      targetId: "security-group-task9"
    },
    {
      id: "edge-vpc-load-balancer-task9",
      sourceId: "vpc-task9",
      targetId: "load-balancer-task9"
    },
    {
      id: "edge-security-group-load-balancer-task9",
      sourceId: "security-group-task9",
      targetId: "load-balancer-task9"
    },
    {
      id: "edge-load-balancer-cloudfront-task9",
      sourceId: "load-balancer-task9",
      targetId: "cloudfront-task9"
    },
    {
      id: "edge-ecs-task-definition-service-task9",
      sourceId: "ecs-task-definition-task9",
      targetId: "ecs-service-task9"
    },
    {
      id: "edge-ecs-cluster-service-task9",
      sourceId: "ecs-cluster-task9",
      targetId: "ecs-service-task9"
    },
    {
      id: "edge-security-group-ecs-service-task9",
      sourceId: "security-group-task9",
      targetId: "ecs-service-task9"
    },
    {
      id: "edge-vpc-lambda-task9-uses",
      sourceId: "vpc-task9",
      targetId: "lambda-task9",
      label: "uses"
    }
  ]
};

const fixture: {
  readonly awsConnection: AwsConnection;
  readonly result: ReverseEngineeringScanResult;
} = {
  awsConnection: {
    id: "connection-task9-verified",
    userId: "user-task9",
    accountId,
    roleArn: "arn:aws:iam::123456789012:role/SketchCatchReverseEngineeringReadRole",
    externalId: "task9-external-id",
    region,
    status: "verified",
    lastVerifiedAt: "2026-07-17T00:00:00.000Z",
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z"
  },
  result: {
    scan: {
      id: "scan-task9",
      projectId: "project-task9",
      awsConnectionId: "connection-task9-verified",
      provider: "aws",
      region,
      resourceTypes: ["ALL"],
      status: "completed",
      createdAt: "2026-07-17T00:00:00.000Z",
      updatedAt: "2026-07-17T00:01:00.000Z",
      startedAt: "2026-07-17T00:00:00.000Z",
      completedAt: "2026-07-17T00:01:00.000Z",
      cancelRequestedAt: null,
      deletedAt: null,
      errorSummary: null
    },
    architectureJson,
    reverseEngineeringDraft: {
      id: "draft-task9",
      scanId: "scan-task9",
      architectureJson: structuredClone(architectureJson),
      protectedValueKeys: [
        "providerResourceId",
        "providerResourceType",
        "region",
        "accountId",
        "terraformResourceName",
        "terraformResourceType"
      ],
      editableValueKeys: ["displayName", "description"],
      createdAt: "2026-07-17T00:01:00.000Z"
    },
    discoveredResources: [
      {
        id: "vpc-task9",
        provider: "aws",
        providerResourceType: "AWS::EC2::VPC",
        providerResourceId: vpcId,
        region,
        displayName: "Orders VPC",
        resourceType: "VPC",
        config: { vpcId }
      },
      {
        id: "subnet-task9",
        provider: "aws",
        providerResourceType: "AWS::EC2::Subnet",
        providerResourceId: subnetId,
        region,
        displayName: "Orders private subnet",
        resourceType: "SUBNET",
        config: { vpcId },
        relationships: [{ type: "contains", targetResourceId: "vpc-task9" }]
      },
      {
        id: "security-group-task9",
        provider: "aws",
        providerResourceType: "AWS::EC2::SecurityGroup",
        providerResourceId: securityGroupId,
        region,
        displayName: "Orders service security group",
        resourceType: "SECURITY_GROUP",
        config: { vpcId },
        relationships: [{ type: "depends_on", targetResourceId: "vpc-task9" }]
      },
      {
        id: "load-balancer-task9",
        provider: "aws",
        providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
        providerResourceId: loadBalancerArn,
        region,
        displayName: "Orders application load balancer",
        resourceType: "LOAD_BALANCER",
        config: { arn: loadBalancerArn, name: "orders", type: "application" },
        relationships: [
          { type: "depends_on", targetResourceId: "vpc-task9" },
          { type: "connects_to", targetResourceId: "security-group-task9" }
        ]
      },
      {
        id: "cloudfront-task9",
        provider: "aws",
        providerResourceType: "AWS::CloudFront::Distribution",
        providerResourceId: cloudFrontArn,
        region: "global",
        displayName: "Orders global edge",
        resourceType: "CLOUDFRONT",
        config: { arn: cloudFrontArn, id: "EDISTRIBUTIONTASK9", enabled: true },
        relationships: [{ type: "depends_on", targetResourceId: "load-balancer-task9" }]
      },
      {
        id: "ecs-cluster-task9",
        provider: "aws",
        providerResourceType: "AWS::ECS::Cluster",
        providerResourceId: ecsClusterArn,
        region,
        displayName: "orders",
        resourceType: "ECS_CLUSTER",
        config: { arn: ecsClusterArn, name: "orders", status: "ACTIVE" }
      },
      {
        id: "ecs-service-task9",
        provider: "aws",
        providerResourceType: "AWS::ECS::Service",
        providerResourceId: ecsServiceArn,
        region,
        displayName: "api",
        resourceType: "ECS_SERVICE",
        config: { arn: ecsServiceArn, name: "api", clusterArn: ecsClusterArn },
        relationships: [
          { type: "depends_on", targetResourceId: "ecs-cluster-task9" },
          { type: "depends_on", targetResourceId: "ecs-task-definition-task9" },
          { type: "connects_to", targetResourceId: "security-group-task9" }
        ]
      },
      {
        id: "ecs-task-definition-task9",
        provider: "aws",
        providerResourceType: "AWS::ECS::TaskDefinition",
        providerResourceId: ecsTaskDefinitionArn,
        region,
        displayName: "orders:7",
        resourceType: "ECS_TASK_DEFINITION",
        config: {
          arn: ecsTaskDefinitionArn,
          family: "orders",
          revision: 7,
          sketchcatchReferenceTerraform: true,
          terraformValidationMissingFields: ["containerDefinitions.environment"],
          requiresManualEnvironmentInput: true
        }
      },
      {
        id: "lambda-task9",
        provider: "aws",
        providerResourceType: "AWS::Lambda::Function",
        providerResourceId: "arn:aws:lambda:ap-northeast-2:123456789012:function:orders-handler",
        region,
        displayName: "orders-handler",
        resourceType: "LAMBDA",
        config: {},
        analysisExcluded: true,
        importSuggestionStatus: "unsupported_resource_type",
        relationships: [{ type: "connects_to", targetResourceId: "vpc-task9", label: "uses" }]
      },
      {
        id: "iam-role-task9",
        provider: "aws",
        providerResourceType: "AWS::IAM::Role",
        providerResourceId: "arn:aws:iam::123456789012:role/orders-read-only",
        region,
        displayName: "orders-read-only",
        resourceType: "IAM_ROLE",
        config: {},
        analysisExcluded: true,
        importSuggestionStatus: "unsupported_resource_type",
        relationships: []
      }
    ],
    findings: [
      {
        id: "finding-ecs-task-definition-manual-environment-task9",
        category: "configuration",
        severity: "medium",
        resourceId: "ecs-task-definition-task9",
        title: "수동 환경 변수 입력이 필요합니다.",
        description:
          "containerDefinitions.environment 값이 안전한 Terraform 생성 입력으로 확인되지 않았습니다.",
        recommendation: "환경 변수를 검토한 뒤 수동으로 입력하세요."
      }
    ],
    analysisExclusions: [
      {
        id: "analysis-exclusion-lambda-task9",
        resourceId: "lambda-task9",
        reason: "unsupported_resource_type",
        message: "Lambda 함수는 현재 자동 분석 범위에 포함되지 않습니다."
      },
      {
        id: "analysis-exclusion-iam-role-task9",
        resourceId: "iam-role-task9",
        reason: "unsupported_resource_type",
        message: "IAM 역할은 현재 자동 분석 범위에 포함되지 않습니다."
      }
    ],
    importSuggestions: [
      {
        id: "import-vpc-task9",
        resourceId: "vpc-task9",
        status: "ready",
        handoffReady: true,
        terraformAddress: "aws_vpc.orders",
        importCommand: `terraform import aws_vpc.orders ${vpcId}`,
        terraformBlockDraft: 'resource "aws_vpc" "orders" {}'
      },
      {
        id: "import-subnet-task9",
        resourceId: "subnet-task9",
        status: "ready",
        handoffReady: true,
        terraformAddress: "aws_subnet.orders_private",
        importCommand: `terraform import aws_subnet.orders_private ${subnetId}`,
        terraformBlockDraft: 'resource "aws_subnet" "orders_private" {}'
      },
      {
        id: "import-security-group-task9",
        resourceId: "security-group-task9",
        status: "ready",
        handoffReady: true,
        terraformAddress: "aws_security_group.orders_service",
        importCommand: `terraform import aws_security_group.orders_service ${securityGroupId}`,
        terraformBlockDraft: 'resource "aws_security_group" "orders_service" {}'
      },
      {
        id: "import-load-balancer-task9",
        resourceId: "load-balancer-task9",
        status: "ready",
        handoffReady: true,
        terraformAddress: "aws_lb.orders",
        importCommand: `terraform import aws_lb.orders ${loadBalancerArn}`,
        terraformBlockDraft: 'resource "aws_lb" "orders" {}'
      },
      {
        id: "import-cloudfront-task9",
        resourceId: "cloudfront-task9",
        status: "ready",
        handoffReady: true,
        terraformAddress: "aws_cloudfront_distribution.orders",
        importCommand: "terraform import aws_cloudfront_distribution.orders EDISTRIBUTIONTASK9",
        terraformBlockDraft: 'resource "aws_cloudfront_distribution" "orders" {}'
      },
      {
        id: "import-ecs-cluster-task9",
        resourceId: "ecs-cluster-task9",
        status: "ready",
        handoffReady: true,
        terraformAddress: "aws_ecs_cluster.orders",
        importCommand: `terraform import aws_ecs_cluster.orders ${ecsClusterArn}`,
        terraformBlockDraft: 'resource "aws_ecs_cluster" "orders" {}'
      },
      {
        id: "import-ecs-service-task9",
        resourceId: "ecs-service-task9",
        status: "ready",
        handoffReady: true,
        terraformAddress: "aws_ecs_service.orders_api",
        importCommand: "terraform import aws_ecs_service.orders_api orders/api",
        terraformBlockDraft: 'resource "aws_ecs_service" "orders_api" {}'
      },
      {
        id: "import-ecs-task-definition-task9",
        resourceId: "ecs-task-definition-task9",
        status: "manual_review",
        handoffReady: false,
        terraformAddress: "aws_ecs_task_definition.orders",
        importCommand: `terraform import aws_ecs_task_definition.orders ${ecsTaskDefinitionArn}`,
        reason:
          "Terraform 생성과 배포에 필요한 containerDefinitions.environment 값을 확인해야 합니다."
      },
      {
        id: "import-lambda-task9",
        resourceId: "lambda-task9",
        status: "unsupported_resource_type",
        handoffReady: false,
        reason: "Lambda 함수는 Terraform import 또는 배포에 사용할 수 없습니다."
      },
      {
        id: "import-iam-role-task9",
        resourceId: "iam-role-task9",
        status: "unsupported_resource_type",
        handoffReady: false,
        reason: "IAM 역할은 Terraform import 또는 배포에 사용할 수 없습니다."
      }
    ],
    scanErrors: [
      {
        id: "scan-error-ecs-service-task9",
        resourceType: "ECS_SERVICE",
        stage: "provider_api",
        reason: "permission_denied",
        message: "ECS 서비스 세부 정보를 읽을 권한이 없습니다.",
        retryable: false
      }
    ]
  }
};

export function createReverseEngineeringFinalRegressionFixture(): {
  awsConnection: AwsConnection;
  result: ReverseEngineeringScanResult;
} {
  return structuredClone(fixture);
}
