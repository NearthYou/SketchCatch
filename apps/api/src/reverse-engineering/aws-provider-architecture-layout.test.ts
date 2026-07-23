import assert from "node:assert/strict";
import test from "node:test";
import type { DiscoveredResource } from "@sketchcatch/types";
import { createReverseEngineeringArchitectureJson } from "./aws-provider-architecture-layout.js";

function createReviewOnlyFixture(): DiscoveredResource[] {
  return [
    {
      id: "vpc-1",
      provider: "aws",
      providerResourceType: "AWS::EC2::VPC",
      providerResourceId: "vpc-0123456789abcdef0",
      region: "ap-northeast-2",
      displayName: "Production VPC",
      resourceType: "VPC",
      config: {}
    },
    {
      id: "lambda-1",
      provider: "aws",
      providerResourceType: "AWS::Lambda::Function",
      providerResourceId: "arn:aws:lambda:ap-northeast-2:123456789012:function:orders-handler",
      region: "ap-northeast-2",
      displayName: "orders-handler",
      resourceType: "UNKNOWN",
      config: {},
      relationships: [{ type: "connects_to", targetResourceId: "vpc-1", label: "uses" }]
    },
    {
      id: "iam-role-1",
      provider: "aws",
      providerResourceType: "AWS::IAM::Role",
      providerResourceId: "arn:aws:iam::123456789012:role/read-only",
      region: "ap-northeast-2",
      displayName: "read-only",
      resourceType: "UNKNOWN",
      config: {},
      relationships: []
    }
  ];
}

test("발견한 검토 전용 Resource는 관계 유무와 관계없이 모두 보드에 남긴다", () => {
  const architectureJson = createReverseEngineeringArchitectureJson(createReviewOnlyFixture());

  assert.deepEqual(
    architectureJson.nodes.map((node) => node.id),
    ["vpc-1", "lambda-1", "iam-role-1"]
  );
  assert.deepEqual(architectureJson.edges, [
    { id: "edge-lambda-1-vpc-1-uses", sourceId: "vpc-1", targetId: "lambda-1", label: "uses" }
  ]);
});

test("관리 가능한 기존 AWS 리소스는 Terraform 편집값을 받고 보호 리소스는 읽기 전용으로 남는다", () => {
  const architectureJson = createReverseEngineeringArchitectureJson([
    {
      id: "resource-customer-assets",
      provider: "aws",
      providerResourceType: "AWS::S3::Bucket",
      providerResourceId: "customer-assets",
      region: "ap-northeast-2",
      displayName: "customer-assets",
      resourceType: "S3",
      config: {
        createdAt: "2026-07-20T00:00:00.000Z",
        tags: [{ key: "Environment", value: "production" }],
        tagsReadComplete: true
      }
    },
    {
      id: "resource-stack-bucket",
      provider: "aws",
      providerResourceType: "AWS::S3::Bucket",
      providerResourceId: "stack-bucket",
      region: "ap-northeast-2",
      displayName: "stack-bucket",
      resourceType: "S3",
      config: {
        tags: [{ key: "aws:cloudformation:stack-id", value: "stack/customer" }]
      }
    }
  ]);
  const nodes = new Map(architectureJson.nodes.map((node) => [node.id, node]));

  assert.deepEqual(nodes.get("resource-customer-assets")?.config, {
    bucket: "customer-assets",
    tags: { Environment: "production" },
    terraformBlockType: "resource",
    terraformResourceType: "aws_s3_bucket",
    terraformResourceName: "resource_customer_assets",
    terraformFileName: "reverse-engineering",
    reverseEngineeringManagement: "managed",
    reverseEngineeringObservedConfig: {
      createdAt: "2026-07-20T00:00:00.000Z",
      tags: [{ key: "Environment", value: "production" }],
      tagsReadComplete: true
    },
    providerResourceType: "AWS::S3::Bucket",
    providerResourceId: "customer-assets",
    analysisExcluded: false
  });
  assert.deepEqual(nodes.get("resource-stack-bucket")?.config, {
    reverseEngineeringManagement: "reference",
    reverseEngineeringObservedConfig: {
      tags: [{ key: "aws:cloudformation:stack-id", value: "stack/customer" }]
    },
    providerResourceType: "AWS::S3::Bucket",
    providerResourceId: "stack-bucket",
    sketchcatchReferenceTerraform: true,
    analysisExcluded: true
  });
});

test("많은 독립 Resource는 한 줄로 늘이지 않고 보드에서 읽을 수 있는 격자로 배치한다", () => {
  const resources: DiscoveredResource[] = Array.from({ length: 43 }, (_, index) => ({
    id: `review-resource-${index}`,
    provider: "aws",
    providerResourceType: "AWS::Example::Resource",
    providerResourceId: `example-${index}`,
    region: "ap-northeast-2",
    displayName: `Example ${index}`,
    resourceType: "UNKNOWN",
    config: {},
    analysisExcluded: true
  }));
  const architectureJson = createReverseEngineeringArchitectureJson(resources);
  const first = architectureJson.nodes[0];
  const lastInFirstRow = architectureJson.nodes[6];
  const firstInSecondRow = architectureJson.nodes[7];

  assert.equal(architectureJson.nodes.length, 43);
  assert.equal(first?.positionY, lastInFirstRow?.positionY);
  assert.equal(first?.positionX, firstInSecondRow?.positionX);
  assert.ok((firstInSecondRow?.positionY ?? 0) > (first?.positionY ?? Infinity));
});

test("ALB는 VPC 상위 서비스로, CloudFront는 global edge 영역의 supported 카드로 배치한다", () => {
  const architectureJson = createReverseEngineeringArchitectureJson([
    {
      id: "vpc-1",
      provider: "aws",
      providerResourceType: "AWS::EC2::VPC",
      providerResourceId: "vpc-1",
      region: "ap-northeast-2",
      displayName: "Main VPC",
      resourceType: "VPC",
      config: {}
    },
    {
      id: "subnet-a",
      provider: "aws",
      providerResourceType: "AWS::EC2::Subnet",
      providerResourceId: "subnet-a",
      region: "ap-northeast-2",
      displayName: "Public A",
      resourceType: "SUBNET",
      config: { vpcId: "vpc-1" },
      relationships: [{ type: "contains", targetResourceId: "vpc-1" }]
    },
    {
      id: "sg-alb",
      provider: "aws",
      providerResourceType: "AWS::EC2::SecurityGroup",
      providerResourceId: "sg-alb",
      region: "ap-northeast-2",
      displayName: "ALB SG",
      resourceType: "SECURITY_GROUP",
      config: { vpcId: "vpc-1" },
      relationships: [{ type: "depends_on", targetResourceId: "vpc-1" }]
    },
    {
      id: "alb-1",
      provider: "aws",
      providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
      providerResourceId:
        "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/orders/one",
      region: "ap-northeast-2",
      displayName: "orders",
      resourceType: "LOAD_BALANCER",
      config: {
        reverseEngineeringDetailsVersion: 1,
        attributesReadComplete: true,
        attributesProjectionComplete: true,
        attributes: {},
        tagsReadComplete: true,
        tags: [],
        name: "orders",
        loadBalancerType: "application",
        scheme: "internet-facing",
        ipAddressType: "ipv4",
        vpcId: "vpc-1",
        securityGroupIds: ["sg-alb"],
        subnetIds: ["subnet-a"]
      },
      relationships: [
        { type: "depends_on", targetResourceId: "vpc-1" },
        { type: "connects_to", targetResourceId: "sg-alb" }
      ]
    },
    {
      id: "cloudfront-1",
      provider: "aws",
      providerResourceType: "AWS::CloudFront::Distribution",
      providerResourceId: "arn:aws:cloudfront::123456789012:distribution/EDISTRIBUTION",
      region: "global",
      displayName: "d111111abcdef8.cloudfront.net",
      resourceType: "CLOUDFRONT",
      config: {
        id: "EDISTRIBUTION",
        configReadComplete: true,
        tagsReadComplete: true,
        tags: [],
        enabled: true,
        aliases: [],
        httpVersion: "http2",
        isIpv6Enabled: true,
        priceClass: "PriceClass_100",
        origin: [{ originId: "orders", domainName: "orders.example.com" }],
        defaultCacheBehavior: {
          targetOriginId: "orders",
          viewerProtocolPolicy: "redirect-to-https",
          allowedMethods: ["GET", "HEAD"],
          cachedMethods: ["GET", "HEAD"],
          cachePolicyId: "cache-policy"
        },
        orderedCacheBehavior: [],
        restrictions: { geoRestriction: { restrictionType: "none" } },
        viewerCertificate: { cloudfrontDefaultCertificate: true },
        customErrorResponse: [],
        loggingConfig: {
          enabled: false,
          includeCookies: false,
          bucket: "",
          prefix: ""
        }
      },
      relationships: [{ type: "depends_on", targetResourceId: "alb-1" }]
    }
  ]);
  const nodeById = new Map(architectureJson.nodes.map((node) => [node.id, node]));

  assert.equal(nodeById.get("alb-1")?.config["analysisExcluded"], false);
  assert.equal(nodeById.get("cloudfront-1")?.config["analysisExcluded"], false);
  assert.equal(nodeById.get("alb-1")?.positionY, 240);
  assert.ok((nodeById.get("cloudfront-1")?.positionY ?? Infinity) < (nodeById.get("vpc-1")?.positionY ?? 0));
  assert.deepEqual(
    architectureJson.edges.map((edge) => [edge.sourceId, edge.targetId]),
    [
      ["vpc-1", "subnet-a"],
      ["vpc-1", "sg-alb"],
      ["vpc-1", "alb-1"],
      ["sg-alb", "alb-1"],
      ["alb-1", "cloudfront-1"]
    ]
  );
});

test("ECS Cluster를 Task Definition과 Service 사이 중심에 두고 evidence-only edge만 만든다", () => {
  const architectureJson = createReverseEngineeringArchitectureJson([
    {
      id: "ecs-cluster-orders",
      provider: "aws",
      providerResourceType: "AWS::ECS::Cluster",
      providerResourceId: "arn:aws:ecs:ap-northeast-2:123456789012:cluster/orders",
      region: "ap-northeast-2",
      displayName: "orders",
      resourceType: "ECS_CLUSTER",
      config: { name: "orders" },
      relationships: []
    },
    {
      id: "ecs-service-api",
      provider: "aws",
      providerResourceType: "AWS::ECS::Service",
      providerResourceId: "arn:aws:ecs:ap-northeast-2:123456789012:service/orders/api",
      region: "ap-northeast-2",
      displayName: "api",
      resourceType: "ECS_SERVICE",
      config: {
        clusterArn: "arn:aws:ecs:ap-northeast-2:123456789012:cluster/orders",
        taskDefinitionArn:
          "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/orders:7",
        networkConfiguration: {
          awsvpcConfiguration: {
            subnets: ["subnet-not-in-scan"],
            securityGroups: ["sg-not-in-scan"]
          }
        },
        loadBalancers: [
          {
            targetGroupArn:
              "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/not-in-scan/one"
          }
        ]
      },
      relationships: [
        { type: "depends_on", targetResourceId: "ecs-cluster-orders", label: "depends_on" },
        { type: "depends_on", targetResourceId: "ecs-task-orders", label: "depends_on" }
      ]
    },
    {
      id: "ecs-task-orders",
      provider: "aws",
      providerResourceType: "AWS::ECS::TaskDefinition",
      providerResourceId:
        "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/orders:7",
      region: "ap-northeast-2",
      displayName: "orders:7",
      resourceType: "ECS_TASK_DEFINITION",
      config: { family: "orders" },
      relationships: []
    }
  ]);
  const nodes = new Map(architectureJson.nodes.map((node) => [node.id, node]));
  const taskX = nodes.get("ecs-task-orders")?.positionX ?? Infinity;
  const clusterX = nodes.get("ecs-cluster-orders")?.positionX ?? -Infinity;
  const serviceX = nodes.get("ecs-service-api")?.positionX ?? -Infinity;

  assert.ok(taskX < clusterX);
  assert.ok(clusterX < serviceX);
  assert.equal(nodes.get("ecs-cluster-orders")?.config["analysisExcluded"], false);
  assert.deepEqual(
    architectureJson.edges.map((edge) => [edge.sourceId, edge.targetId]),
    [
      ["ecs-cluster-orders", "ecs-service-api"],
      ["ecs-task-orders", "ecs-service-api"]
    ]
  );
  assert.equal(architectureJson.edges.length, 2);
});

test("같은 scan의 evidence-only ECS Service Target Group 관계는 검토 전용 endpoint도 보드에 남긴다", () => {
  const architectureJson = createReverseEngineeringArchitectureJson([
    {
      id: "ecs-service-api",
      provider: "aws",
      providerResourceType: "AWS::ECS::Service",
      providerResourceId: "arn:aws:ecs:ap-northeast-2:123456789012:service/orders/api",
      region: "ap-northeast-2",
      displayName: "api",
      resourceType: "ECS_SERVICE",
      config: { name: "api" },
      relationships: [
        {
          type: "connects_to",
          targetResourceId: "target-group-api",
          label: "target group"
        }
      ]
    },
    {
      id: "target-group-api",
      provider: "aws",
      providerResourceType: "AWS::ElasticLoadBalancingV2::TargetGroup",
      providerResourceId:
        "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/api/one",
      region: "ap-northeast-2",
      displayName: "api",
      resourceType: "UNKNOWN",
      config: {},
      relationships: [],
      analysisExcluded: true,
      importSuggestionStatus: "unsupported_resource_type"
    },
    {
      id: "unrelated-review-only-resource",
      provider: "aws",
      providerResourceType: "AWS::IAM::Role",
      providerResourceId: "arn:aws:iam::123456789012:role/unrelated",
      region: "ap-northeast-2",
      displayName: "unrelated",
      resourceType: "UNKNOWN",
      config: {},
      relationships: [],
      analysisExcluded: true,
      importSuggestionStatus: "unsupported_resource_type"
    }
  ]);
  const nodes = new Map(architectureJson.nodes.map((node) => [node.id, node]));

  assert.deepEqual(
    [...nodes.keys()],
    ["ecs-service-api", "target-group-api", "unrelated-review-only-resource"]
  );
  assert.equal(nodes.get("target-group-api")?.type, "UNKNOWN");
  assert.equal(nodes.get("target-group-api")?.config["analysisExcluded"], true);
  assert.deepEqual(architectureJson.edges, [
    {
      id: "edge-ecs-service-api-target-group-api-target group",
      sourceId: "target-group-api",
      targetId: "ecs-service-api",
      label: "target group"
    }
  ]);
});
