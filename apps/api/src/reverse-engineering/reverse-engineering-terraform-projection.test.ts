import assert from "node:assert/strict";
import test from "node:test";
import type { DiscoveredResource, ResourceType } from "@sketchcatch/types";
import { createReverseEngineeringTerraformProjection } from "./reverse-engineering-terraform-projection.js";

test("기존 S3를 안정적인 Terraform 주소와 실제 편집값으로 투영한다", () => {
  const projection = createReverseEngineeringTerraformProjection(
    resource("S3", {
      providerResourceId: "customer-assets",
      config: {
        createdAt: "2026-07-20T00:00:00.000Z",
        tags: [
          { key: "Environment", value: "production" },
          { Key: "Owner", Value: "platform" }
        ]
      }
    })
  );

  assert.deepEqual(projection, {
    management: "managed",
    terraformBlockType: "resource",
    terraformResourceType: "aws_s3_bucket",
    terraformResourceName: "resource_customer_assets",
    terraformFileName: "reverse-engineering",
    terraformValues: {
      bucket: "customer-assets",
      tags: { Environment: "production", Owner: "platform" }
    }
  });
});

test("공개 식별자만 남은 ALB는 identity를 닫고 비공개 원본은 source node id 주소를 쓴다", () => {
  const publicProjection = createReverseEngineeringTerraformProjection(
    resource("LOAD_BALANCER", {
      id: "resource-aws-ref-0123456789abcdef01234567",
      providerResourceId: "aws-ref-0123456789abcdef01234567",
      providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
      config: applicationLoadBalancerConfig()
    })
  );
  const privateProjection = createReverseEngineeringTerraformProjection(
    resource("LOAD_BALANCER", {
      id: "resource-aws-ref-0123456789abcdef01234567",
      providerResourceId:
        "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/customer/1234",
      providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
      config: applicationLoadBalancerConfig()
    })
  );

  assert.deepEqual(publicProjection, {
    management: "needs_mapping",
    terraformValues: {}
  });
  assert.equal(privateProjection.terraformResourceName, "resource_aws_ref_0123456789abcdef01234567");
  assert.deepEqual(privateProjection.terraformValues, {
    name: "customer-entry",
    internal: false,
    loadBalancerType: "application",
    ipAddressType: "ipv4",
    securityGroups: ["sg-1234"],
    subnets: ["subnet-a", "subnet-b"]
  });
});

test("네트워크와 실행 리소스의 관찰값을 Terraform 인수 이름으로 정규화한다", () => {
  const cases: Array<{
    resource: DiscoveredResource;
    resourceType: string;
    values: Record<string, unknown>;
  }> = [
    {
      resource: resource("VPC", {
        providerResourceId: "vpc-1234",
        config: { cidrBlock: "10.0.0.0/16", instanceTenancy: "default", state: "available" }
      }),
      resourceType: "aws_vpc",
      values: { cidrBlock: "10.0.0.0/16", instanceTenancy: "default" }
    },
    {
      resource: resource("SUBNET", {
        providerResourceId: "subnet-1234",
        config: {
          vpcId: "vpc-1234",
          cidrBlock: "10.0.1.0/24",
          availabilityZone: "ap-northeast-2a",
          mapPublicIpOnLaunch: true,
          assignIpv6AddressOnCreation: false,
          availableIpAddressCount: 250
        }
      }),
      resourceType: "aws_subnet",
      values: {
        vpcId: "vpc-1234",
        cidrBlock: "10.0.1.0/24",
        availabilityZone: "ap-northeast-2a",
        mapPublicIpOnLaunch: true,
        assignIpv6AddressOnCreation: false
      }
    },
    {
      resource: resource("EC2", {
        providerResourceId: "i-1234",
        config: {
          imageId: "ami-1234",
          instanceType: "t3.micro",
          subnetId: "subnet-1234",
          securityGroupIds: ["sg-1234"],
          monitoringState: "disabled",
          state: "running",
          publicIpAddress: "203.0.113.10"
        }
      }),
      resourceType: "aws_instance",
      values: {
        ami: "ami-1234",
        instanceType: "t3.micro",
        subnetId: "subnet-1234",
        vpcSecurityGroupIds: ["sg-1234"],
        monitoring: false
      }
    },
    {
      resource: resource("RDS", {
        providerResourceId: "customer-db",
        config: {
          allocatedStorage: 20,
          availabilityZone: "ap-northeast-2a",
          backupRetentionPeriod: 7,
          dbInstanceClass: "db.t3.micro",
          dbName: "app",
          dbSubnetGroupName: "database-subnets",
          deletionProtection: true,
          engine: "postgres",
          engineVersion: "16.3",
          endpointAddress: "private.example",
          multiAz: false,
          publiclyAccessible: false,
          storageEncrypted: true,
          storageType: "gp3",
          vpcSecurityGroupIds: ["sg-db"]
        }
      }),
      resourceType: "aws_db_instance",
      values: {
        identifier: "customer-db",
        allocatedStorage: 20,
        availabilityZone: "ap-northeast-2a",
        backupRetentionPeriod: 7,
        instanceClass: "db.t3.micro",
        dbName: "app",
        dbSubnetGroupName: "database-subnets",
        deletionProtection: true,
        engine: "postgres",
        engineVersion: "16.3",
        multiAz: false,
        publiclyAccessible: false,
        storageEncrypted: true,
        storageType: "gp3",
        vpcSecurityGroupIds: ["sg-db"]
      }
    }
  ];

  for (const item of cases) {
    const projection = createReverseEngineeringTerraformProjection(item.resource);
    assert.equal(projection.management, "managed");
    assert.equal(projection.terraformResourceType, item.resourceType);
    assert.deepEqual(projection.terraformValues, item.values);
  }
});

test("Security Group 규칙의 모든 source와 optional port를 Terraform 값으로 보존한다", () => {
  const projection = createReverseEngineeringTerraformProjection(
    resource("SECURITY_GROUP", {
      providerResourceType: "AWS::EC2::SecurityGroup",
      providerResourceId: "sg-target",
      config: {
        groupName: "target",
        description: "target group",
        vpcId: "vpc-main",
        securityGroupRulesComplete: true,
        ingress: [
          {
            ipProtocol: "tcp",
            fromPort: 443,
            toPort: 443,
            cidrBlocks: ["10.0.0.0/8"],
            description: "office ipv4"
          },
          {
            ipProtocol: "tcp",
            fromPort: 443,
            toPort: 443,
            ipv6CidrBlocks: ["2001:db8::/64"],
            description: "office ipv6"
          },
          {
            ipProtocol: "tcp",
            fromPort: 443,
            toPort: 443,
            prefixListIds: ["pl-0123456789abcdef0"],
            description: "aws service"
          },
          {
            ipProtocol: "tcp",
            fromPort: 443,
            toPort: 443,
            securityGroups: ["sg-source"],
            description: "source workload"
          }
        ],
        egress: [
          {
            ipProtocol: "-1",
            cidrBlocks: ["0.0.0.0/0"]
          }
        ]
      }
    })
  );

  assert.deepEqual(projection.terraformValues, {
    name: "target",
    description: "target group",
    vpcId: "vpc-main",
    ingress: [
      {
        protocol: "tcp",
        fromPort: 443,
        toPort: 443,
        cidrBlocks: ["10.0.0.0/8"],
        description: "office ipv4"
      },
      {
        protocol: "tcp",
        fromPort: 443,
        toPort: 443,
        ipv6CidrBlocks: ["2001:db8::/64"],
        description: "office ipv6"
      },
      {
        protocol: "tcp",
        fromPort: 443,
        toPort: 443,
        prefixListIds: ["pl-0123456789abcdef0"],
        description: "aws service"
      },
      {
        protocol: "tcp",
        fromPort: 443,
        toPort: 443,
        securityGroups: ["sg-source"],
        description: "source workload"
      }
    ],
    egress: [
      {
        protocol: "-1",
        cidrBlocks: ["0.0.0.0/0"]
      }
    ]
  });
});

test("암호화되지 않은 CloudWatch Log Group의 이름과 보존 기간을 Terraform 값으로 보존한다", () => {
  const projection = createReverseEngineeringTerraformProjection(
    resource("CLOUDWATCH_LOG_GROUP", {
      providerResourceType: "AWS::Logs::LogGroup",
      providerResourceId:
        "arn:aws:logs:ap-northeast-2:123456789012:log-group:/ecs/orders",
      config: {
        logGroupName: "/ecs/orders",
        retentionInDays: 30,
        logGroupClass: "STANDARD",
        storedBytes: 1234
      }
    })
  );

  assert.deepEqual(projection, {
    management: "managed",
    terraformBlockType: "resource",
    terraformResourceType: "aws_cloudwatch_log_group",
    terraformResourceName: "resource_customer_assets",
    terraformFileName: "reverse-engineering",
    terraformValues: {
      name: "/ecs/orders",
      retentionInDays: 30
    }
  });
});

test("KMS 연결 CloudWatch Log Group은 위험한 Terraform identity와 값을 만들지 않는다", () => {
  const projection = createReverseEngineeringTerraformProjection(
    resource("CLOUDWATCH_LOG_GROUP", {
      providerResourceType: "AWS::Logs::LogGroup",
      config: {
        logGroupName: "/ecs/orders",
        hasKmsKey: true,
        kmsKeyId:
          "arn:aws:kms:ap-northeast-2:123456789012:key/11111111-2222-3333-4444-555555555555"
      }
    })
  );

  assert.deepEqual(projection, {
    management: "needs_mapping",
    terraformValues: {}
  });
});

test("API Gateway REST API 관찰값을 재배포 가능한 Terraform 값으로 제한한다", () => {
  const projection = createReverseEngineeringTerraformProjection(
    resource("API_GATEWAY_REST_API", {
      providerResourceId: "a1b2c3d4e5",
      providerResourceType: "AWS::ApiGateway::RestApi",
      config: {
        name: "customer-api",
        description: "Customer API",
        apiKeySource: "HEADER",
        binaryMediaTypes: ["application/octet-stream"],
        disableExecuteApiEndpoint: true,
        endpointConfiguration: { types: ["REGIONAL"] },
        minimumCompressionSize: 1_024,
        tags: { Environment: "production" },
        id: "a1b2c3d4e5",
        rootResourceId: "root-must-not-be-managed"
      }
    })
  );

  assert.deepEqual(projection, {
    management: "managed",
    terraformBlockType: "resource",
    terraformResourceType: "aws_api_gateway_rest_api",
    terraformResourceName: "resource_customer_assets",
    terraformFileName: "reverse-engineering",
    terraformValues: {
      name: "customer-api",
      description: "Customer API",
      apiKeySource: "HEADER",
      binaryMediaTypes: ["application/octet-stream"],
      disableExecuteApiEndpoint: true,
      endpointConfiguration: { types: ["REGIONAL"] },
      minimumCompressionSize: 1_024,
      tags: { Environment: "production" }
    }
  });
});

test("단일 Metric CloudWatch Alarm을 Terraform 인수로 정규화한다", () => {
  const projection = createReverseEngineeringTerraformProjection(
    resource("CLOUDWATCH_METRIC_ALARM", {
      providerResourceId:
        "arn:aws:cloudwatch:ap-northeast-2:123456789012:alarm:api-request-count",
      providerResourceType: "AWS::CloudWatch::Alarm",
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
        stateValue: "OK"
      }
    })
  );

  assert.deepEqual(projection, {
    management: "managed",
    terraformBlockType: "resource",
    terraformResourceType: "aws_cloudwatch_metric_alarm",
    terraformResourceName: "resource_customer_assets",
    terraformFileName: "reverse-engineering",
    terraformValues: {
      actionsEnabled: true,
      alarmDescription: "API request threshold",
      alarmName: "api-request-count",
      comparisonOperator: "GreaterThanThreshold",
      datapointsToAlarm: 2,
      dimensions: {
        LoadBalancer: "app/customer/1234",
        TargetGroup: "targetgroup/customer/5678"
      },
      evaluationPeriods: 3,
      metricName: "RequestCountPerTarget",
      namespace: "AWS/ApplicationELB",
      period: 60,
      statistic: "Sum",
      threshold: 100,
      treatMissingData: "notBreaching",
      unit: "Count"
    }
  });
});

test("AWS와 CloudFormation과 SketchCatch 소유 리소스는 보드에는 남겨도 Terraform identity를 만들지 않는다", () => {
  const protectedResources = [
    resource("S3", {
      config: {
        tags: [{ key: "aws:cloudformation:stack-id", value: "stack/customer" }]
      }
    }),
    resource("IAM_ROLE", {
      providerResourceType: "AWS::IAM::Role",
      config: { roleName: "AWSServiceRoleForECS" }
    }),
    resource("IAM_ROLE", {
      providerResourceType: "AWS::IAM::Role",
      config: { roleName: "SketchCatchTerraformExecutionRole-467ff1a5" }
    }),
    resource("LAMBDA", {
      providerResourceType: "AWS::Lambda::Function",
      config: { functionName: "customer-handler" }
    })
  ];

  assert.deepEqual(
    protectedResources.map((candidate) =>
      createReverseEngineeringTerraformProjection(candidate).management
    ),
    ["reference", "aws_managed", "sketchcatch_managed", "needs_mapping"]
  );

  for (const candidate of protectedResources) {
    const projection = createReverseEngineeringTerraformProjection(candidate);
    assert.equal(projection.terraformResourceType, undefined);
    assert.deepEqual(projection.terraformValues, {});
  }
});

function applicationLoadBalancerConfig(): Record<string, unknown> {
  return {
    name: "customer-entry",
    scheme: "internet-facing",
    type: "application",
    ipAddressType: "ipv4",
    securityGroupIds: ["sg-1234"],
    subnetIds: ["subnet-a", "subnet-b"],
    dnsName: "customer.example"
  };
}

function resource(
  resourceType: ResourceType,
  overrides: Partial<DiscoveredResource> = {}
): DiscoveredResource {
  return {
    id: "resource-customer-assets",
    provider: "aws",
    providerResourceType: `AWS::Test::${resourceType}`,
    providerResourceId: "customer-assets",
    region: "ap-northeast-2",
    displayName: `customer-${resourceType.toLowerCase()}`,
    resourceType,
    config: {},
    ...overrides
  };
}
