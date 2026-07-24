import assert from "node:assert/strict";
import test from "node:test";
import type { DiscoveredResource, ResourceType } from "@sketchcatch/types";
import { getReverseEngineeringTerraformCompleteness } from "./reverse-engineering-terraform-completeness.js";
import {
  createReverseEngineeringTerraformProjection,
  getReverseEngineeringTerraformResourceType
} from "./reverse-engineering-terraform-projection.js";

test("기존 S3를 안정적인 Terraform 주소와 실제 편집값으로 투영한다", () => {
  const projection = createReverseEngineeringTerraformProjection(
    resource("S3", {
      providerResourceType: "AWS::S3::Bucket",
      providerResourceId: "customer-assets",
      config: {
        createdAt: "2026-07-20T00:00:00.000Z",
        tags: [
          { key: "Environment", value: "production" },
          { Key: "Owner", Value: "platform" }
        ],
        tagsReadComplete: true
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
  assert.equal(
    privateProjection.terraformResourceName,
    "resource_aws_ref_0123456789abcdef01234567"
  );
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
        config: {
          cidrBlock: "10.0.0.0/16",
          instanceTenancy: "default",
          state: "available",
          tags: [
            { key: "Project", value: "store" },
            { key: "Optional", value: "" }
          ]
        }
      }),
      resourceType: "aws_vpc",
      values: {
        cidrBlock: "10.0.0.0/16",
        instanceTenancy: "default",
        tags: { Project: "store", Optional: "" }
      }
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
          availableIpAddressCount: 250,
          tags: [{ key: "Environment", value: "production" }]
        }
      }),
      resourceType: "aws_subnet",
      values: {
        vpcId: "vpc-1234",
        cidrBlock: "10.0.1.0/24",
        availabilityZone: "ap-northeast-2a",
        mapPublicIpOnLaunch: true,
        assignIpv6AddressOnCreation: false,
        tags: { Environment: "production" }
      }
    },
    {
      resource: resource("INTERNET_GATEWAY", {
        providerResourceId: "igw-1234",
        config: {
          attachments: [{ vpcId: "vpc-1234", state: "available" }],
          tags: [{ key: "Project", value: "store" }]
        }
      }),
      resourceType: "aws_internet_gateway",
      values: {
        vpcId: "vpc-1234",
        tags: { Project: "store" }
      }
    },
    {
      resource: resource("ROUTE_TABLE", {
        providerResourceId: "rtb-1234",
        config: {
          vpcId: "vpc-1234",
          routes: [{ destinationCidrBlock: "10.0.0.0/16", gatewayId: "local" }],
          tags: [{ key: "Environment", value: "production" }]
        }
      }),
      resourceType: "aws_route_table",
      values: {
        vpcId: "vpc-1234",
        route: [{ cidrBlock: "10.0.0.0/16", gatewayId: "local" }],
        tags: { Environment: "production" }
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
          publicIpAddress: "203.0.113.10",
          tags: [{ key: "Service", value: "api" }]
        }
      }),
      resourceType: "aws_instance",
      values: {
        ami: "ami-1234",
        instanceType: "t3.micro",
        subnetId: "subnet-1234",
        vpcSecurityGroupIds: ["sg-1234"],
        monitoring: false,
        tags: { Service: "api" }
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
          vpcSecurityGroupIds: ["sg-db"],
          tags: [{ key: "Environment", value: "production" }]
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
        vpcSecurityGroupIds: ["sg-db"],
        tags: { Environment: "production" }
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
        tags: [{ key: "Service", value: "api" }],
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
    ],
    tags: { Service: "api" }
  });
});

test("암호화되지 않은 CloudWatch Log Group의 이름과 보존 기간을 Terraform 값으로 보존한다", () => {
  const projection = createReverseEngineeringTerraformProjection(
    resource("CLOUDWATCH_LOG_GROUP", {
      providerResourceType: "AWS::Logs::LogGroup",
      providerResourceId: "arn:aws:logs:ap-northeast-2:123456789012:log-group:/ecs/orders",
      config: {
        logGroupName: "/ecs/orders",
        retentionInDays: 30,
        logGroupClass: "STANDARD",
        storedBytes: 1234,
        tags: [
          { key: "Environment", value: "production" },
          { key: "Empty", value: "" }
        ],
        tagsReadComplete: true
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
      retentionInDays: 30,
      tags: { Environment: "production", Empty: "" }
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
        kmsKeyId: "arn:aws:kms:ap-northeast-2:123456789012:key/11111111-2222-3333-4444-555555555555"
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
      providerResourceId: "arn:aws:cloudwatch:ap-northeast-2:123456789012:alarm:api-request-count",
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
        tags: [
          { key: "Environment", value: "production" },
          { key: "Empty", value: "" }
        ],
        tagsReadComplete: true,
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
      tags: { Environment: "production", Empty: "" },
      threshold: 100,
      treatMissingData: "notBreaching",
      unit: "Count"
    }
  });
});

test("Route Table Association은 같은 scan의 관리 가능한 Subnet과 Route Table만 Terraform 참조한다", () => {
  const subnet = resource("SUBNET", {
    id: "resource-subnet-main",
    providerResourceType: "AWS::EC2::Subnet",
    providerResourceId: "subnet-main",
    config: {
      vpcId: "vpc-main",
      cidrBlock: "10.0.1.0/24",
      availabilityZone: "ap-northeast-2a",
      mapPublicIpOnLaunch: false,
      assignIpv6AddressOnCreation: false
    }
  });
  const routeTable = resource("ROUTE_TABLE", {
    id: "resource-rtb-main",
    providerResourceType: "AWS::EC2::RouteTable",
    providerResourceId: "rtb-main",
    config: {
      vpcId: "vpc-main",
      routes: [{ destinationCidrBlock: "10.0.0.0/16", gatewayId: "local" }]
    }
  });
  const association = resource("ROUTE_TABLE_ASSOCIATION", {
    id: "resource-rtbassoc-main-subnet",
    providerResourceType: "AWS::EC2::RouteTableAssociation",
    providerResourceId: "rtbassoc-main-subnet",
    config: {
      routeTableAssociationId: "rtbassoc-main-subnet",
      subnetId: "subnet-main",
      routeTableId: "rtb-main",
      main: false
    },
    relationships: [
      { type: "connects_to", targetResourceId: subnet.id, label: "attached_to" },
      { type: "depends_on", targetResourceId: routeTable.id, label: "depends_on" }
    ]
  });

  assert.deepEqual(
    createReverseEngineeringTerraformProjection(association, [subnet, routeTable, association]),
    {
      management: "managed",
      terraformBlockType: "resource",
      terraformResourceType: "aws_route_table_association",
      terraformResourceName: "resource_rtbassoc_main_subnet",
      terraformFileName: "reverse-engineering",
      terraformValues: {
        subnetId: "aws_subnet.resource_subnet_main.id",
        routeTableId: "aws_route_table.resource_rtb_main.id"
      }
    }
  );

  for (const sameScanResources of [undefined, [subnet, association], [routeTable, association]]) {
    assert.deepEqual(createReverseEngineeringTerraformProjection(association, sameScanResources), {
      management: "needs_mapping",
      terraformValues: {}
    });
  }
});

test("Route Table의 NAT 경로는 같은 scan의 관리 가능한 NAT Terraform 참조를 사용한다", () => {
  const subnet = resource("SUBNET", {
    id: "resource-subnet-private",
    providerResourceType: "AWS::EC2::Subnet",
    providerResourceId: "subnet-private",
    config: {
      vpcId: "vpc-main",
      cidrBlock: "10.0.1.0/24",
      availabilityZone: "ap-northeast-2a",
      mapPublicIpOnLaunch: false,
      assignIpv6AddressOnCreation: false
    }
  });
  const nat = resource("NAT_GATEWAY", {
    id: "resource-nat-private",
    providerResourceType: "AWS::EC2::NatGateway",
    providerResourceId: "nat-0123456789abcdef0",
    config: {
      allocationIds: [],
      connectivityType: "private",
      natGatewayId: "nat-0123456789abcdef0",
      state: "available",
      subnetId: "subnet-private"
    },
    relationships: [{ type: "contains", targetResourceId: subnet.id, label: "contains" }]
  });
  const routeTable = resource("ROUTE_TABLE", {
    id: "resource-rtb-private",
    providerResourceType: "AWS::EC2::RouteTable",
    providerResourceId: "rtb-private",
    config: {
      vpcId: "vpc-main",
      routes: [
        {
          destinationCidrBlock: "0.0.0.0/0",
          natGatewayId: "nat-0123456789abcdef0"
        }
      ]
    },
    relationships: [{ type: "depends_on", targetResourceId: nat.id, label: "depends_on" }]
  });

  const projection = createReverseEngineeringTerraformProjection(routeTable, [
    subnet,
    nat,
    routeTable
  ]);

  assert.deepEqual(projection.terraformValues["route"], [
    {
      cidrBlock: "0.0.0.0/0",
      natGatewayId: "aws_nat_gateway.resource_nat_private.id"
    }
  ]);
});

test("public NAT과 연결 EIP는 같은 scan의 Subnet 및 primary/all EIP 참조로만 투영한다", () => {
  const subnet = resource("SUBNET", {
    id: "resource-subnet-main",
    providerResourceType: "AWS::EC2::Subnet",
    providerResourceId: "subnet-0123456789abcdef0",
    config: {
      vpcId: "vpc-0123456789abcdef0",
      cidrBlock: "10.0.1.0/24",
      availabilityZone: "ap-northeast-2a",
      mapPublicIpOnLaunch: false,
      assignIpv6AddressOnCreation: false
    }
  });
  const nat = resource("NAT_GATEWAY", {
    id: "resource-nat-main",
    providerResourceType: "AWS::EC2::NatGateway",
    providerResourceId: "nat-0123456789abcdef0",
    config: {
      allocationIds: ["eipalloc-0123456789abcdef0", "eipalloc-fedcba98765432100"],
      connectivityType: "public",
      natGatewayId: "nat-0123456789abcdef0",
      primaryAllocationId: "eipalloc-0123456789abcdef0",
      state: "available",
      subnetId: "subnet-0123456789abcdef0",
      tags: [{ key: "Name", value: "public-egress" }]
    },
    relationships: [
      { type: "contains", targetResourceId: subnet.id, label: "contains" },
      { type: "depends_on", targetResourceId: "resource-eip-primary", label: "depends_on" },
      { type: "depends_on", targetResourceId: "resource-eip-secondary", label: "depends_on" }
    ]
  });
  const primaryEip = resource("ELASTIC_IP", {
    id: "resource-eip-primary",
    providerResourceType: "AWS::EC2::EIP",
    providerResourceId: "eipalloc-0123456789abcdef0",
    config: {
      allocationId: "eipalloc-0123456789abcdef0",
      associationTargetType: "nat_gateway",
      domain: "vpc",
      tags: [{ key: "Name", value: "egress-primary" }]
    },
    relationships: [{ type: "depends_on", targetResourceId: nat.id, label: "depends_on" }]
  });
  const secondaryEip = resource("ELASTIC_IP", {
    id: "resource-eip-secondary",
    providerResourceType: "AWS::EC2::EIP",
    providerResourceId: "eipalloc-fedcba98765432100",
    config: {
      allocationId: "eipalloc-fedcba98765432100",
      associationTargetType: "nat_gateway",
      domain: "vpc"
    },
    relationships: [{ type: "depends_on", targetResourceId: nat.id, label: "depends_on" }]
  });
  const allResources = [subnet, nat, primaryEip, secondaryEip];

  assert.deepEqual(createReverseEngineeringTerraformProjection(nat, allResources), {
    management: "managed",
    terraformBlockType: "resource",
    terraformResourceType: "aws_nat_gateway",
    terraformResourceName: "resource_nat_main",
    terraformFileName: "reverse-engineering",
    terraformValues: {
      subnetId: "aws_subnet.resource_subnet_main.id",
      allocationId: "aws_eip.resource_eip_primary.id",
      secondaryAllocationIds: ["aws_eip.resource_eip_secondary.id"],
      connectivityType: "public",
      tags: { Name: "public-egress" }
    }
  });
  assert.deepEqual(createReverseEngineeringTerraformProjection(primaryEip, allResources), {
    management: "managed",
    terraformBlockType: "resource",
    terraformResourceType: "aws_eip",
    terraformResourceName: "resource_eip_primary",
    terraformFileName: "reverse-engineering",
    terraformValues: { domain: "vpc", tags: { Name: "egress-primary" } }
  });

  for (const sameScanResources of [
    undefined,
    [nat, primaryEip, secondaryEip],
    [subnet, nat, primaryEip],
    [subnet, nat, secondaryEip]
  ]) {
    assert.deepEqual(createReverseEngineeringTerraformProjection(nat, sameScanResources), {
      management: "needs_mapping",
      terraformValues: {}
    });
  }
});

test("private NAT은 같은 scan Subnet만 있으면 EIP 없이 투영한다", () => {
  const subnet = resource("SUBNET", {
    id: "resource-subnet-private",
    providerResourceType: "AWS::EC2::Subnet",
    providerResourceId: "subnet-fedcba98765432100",
    config: {
      vpcId: "vpc-0123456789abcdef0",
      cidrBlock: "10.0.2.0/24",
      availabilityZone: "ap-northeast-2a",
      mapPublicIpOnLaunch: false,
      assignIpv6AddressOnCreation: false
    }
  });
  const nat = resource("NAT_GATEWAY", {
    id: "resource-nat-private",
    providerResourceType: "AWS::EC2::NatGateway",
    providerResourceId: "nat-fedcba98765432100",
    config: {
      allocationIds: [],
      connectivityType: "private",
      natGatewayId: "nat-fedcba98765432100",
      state: "available",
      subnetId: "subnet-fedcba98765432100"
    },
    relationships: [{ type: "contains", targetResourceId: subnet.id, label: "contains" }]
  });

  assert.deepEqual(createReverseEngineeringTerraformProjection(nat, [subnet, nat]), {
    management: "managed",
    terraformBlockType: "resource",
    terraformResourceType: "aws_nat_gateway",
    terraformResourceName: "resource_nat_private",
    terraformFileName: "reverse-engineering",
    terraformValues: {
      subnetId: "aws_subnet.resource_subnet_private.id",
      connectivityType: "private"
    }
  });
});

test("EIP/NAT은 unsupported association, 불완전 same-scan, 비가용 상태에서 identity를 닫는다", () => {
  const unsupportedEip = resource("ELASTIC_IP", {
    providerResourceType: "AWS::EC2::EIP",
    providerResourceId: "eipalloc-0123456789abcdef0",
    config: {
      allocationId: "eipalloc-0123456789abcdef0",
      associationTargetType: "ec2_or_eni",
      domain: "vpc"
    }
  });
  const orphanNatEip = resource("ELASTIC_IP", {
    id: "resource-orphan-nat-eip",
    providerResourceType: "AWS::EC2::EIP",
    providerResourceId: "eipalloc-fedcba98765432100",
    config: {
      allocationId: "eipalloc-fedcba98765432100",
      associationTargetType: "nat_gateway",
      domain: "vpc"
    },
    relationships: []
  });
  const failedNat = resource("NAT_GATEWAY", {
    providerResourceType: "AWS::EC2::NatGateway",
    providerResourceId: "nat-0123456789abcdef0",
    config: {
      allocationIds: ["eipalloc-0123456789abcdef0"],
      connectivityType: "public",
      natGatewayId: "nat-0123456789abcdef0",
      primaryAllocationId: "eipalloc-0123456789abcdef0",
      state: "failed",
      subnetId: "subnet-0123456789abcdef0"
    }
  });

  for (const candidate of [unsupportedEip, orphanNatEip, failedNat]) {
    assert.deepEqual(createReverseEngineeringTerraformProjection(candidate, [candidate]), {
      management: "needs_mapping",
      terraformValues: {}
    });
  }
});

test("EIP/NAT import ID는 공개 config의 eipalloc-*와 nat-*만 허용한다", () => {
  assert.equal(
    getReverseEngineeringTerraformCompleteness(
      resource("ELASTIC_IP", {
        providerResourceId: "aws-ref-public",
        config: {
          allocationId: "eipalloc-0123456789abcdef0",
          associationTargetType: "unassociated",
          domain: "vpc"
        }
      })
    ).importId,
    "eipalloc-0123456789abcdef0"
  );
  assert.equal(
    getReverseEngineeringTerraformCompleteness(
      resource("NAT_GATEWAY", {
        providerResourceId: "aws-ref-public",
        config: {
          allocationIds: [],
          connectivityType: "private",
          natGatewayId: "nat-0123456789abcdef0",
          state: "available",
          subnetId: "subnet-0123456789abcdef0"
        }
      })
    ).importId,
    "nat-0123456789abcdef0"
  );

  for (const candidate of [
    resource("ELASTIC_IP", {
      providerResourceId:
        "arn:aws:ec2:ap-northeast-2:123456789012:eip-allocation/eipalloc-0123456789abcdef0",
      config: { associationTargetType: "unassociated", domain: "vpc" }
    }),
    resource("NAT_GATEWAY", {
      providerResourceId:
        "arn:aws:ec2:ap-northeast-2:123456789012:natgateway/nat-0123456789abcdef0",
      config: {
        allocationIds: [],
        connectivityType: "private",
        state: "available",
        subnetId: "subnet-0123456789abcdef0"
      }
    })
  ]) {
    assert.equal(getReverseEngineeringTerraformCompleteness(candidate).importId, null);
  }
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
    protectedResources.map(
      (candidate) => createReverseEngineeringTerraformProjection(candidate).management
    ),
    ["reference", "aws_managed", "sketchcatch_managed", "needs_mapping"]
  );

  for (const candidate of protectedResources) {
    const projection = createReverseEngineeringTerraformProjection(candidate);
    assert.equal(projection.terraformResourceType, undefined);
    assert.deepEqual(projection.terraformValues, {});
  }
});

test("상세 providerResourceType을 실제 Terraform resource 종류로 엄격하게 분기한다", () => {
  assert.deepEqual(
    [
      ["IAM_ROLE", "AWS::IAM::Role"],
      ["IAM_POLICY", "AWS::IAM::Policy"],
      ["IAM_POLICY", "AWS::IAM::RolePolicy"],
      ["IAM_POLICY", "AWS::IAM::RolePolicyAttachment"],
      ["IAM_INSTANCE_PROFILE", "AWS::IAM::InstanceProfile"],
      ["LAMBDA", "AWS::Lambda::Function"],
      ["LAMBDA_PERMISSION", "AWS::Lambda::Permission"],
      ["KMS_KEY", "AWS::KMS::Key"],
      ["KMS_ALIAS", "AWS::KMS::Alias"],
      ["API_GATEWAY_RESOURCE", "AWS::ApiGateway::Resource"],
      ["API_GATEWAY_METHOD", "AWS::ApiGateway::Method"],
      ["API_GATEWAY_INTEGRATION", "AWS::ApiGateway::Integration"],
      ["API_GATEWAY_DEPLOYMENT", "AWS::ApiGateway::Deployment"],
      ["API_GATEWAY_STAGE", "AWS::ApiGateway::Stage"]
    ].map(([resourceType, providerResourceType]) =>
      getReverseEngineeringTerraformResourceType(resourceType as ResourceType, providerResourceType)
    ),
    [
      "aws_iam_role",
      "aws_iam_policy",
      "aws_iam_role_policy",
      "aws_iam_role_policy_attachment",
      "aws_iam_instance_profile",
      "aws_lambda_function",
      "aws_lambda_permission",
      "aws_kms_key",
      "aws_kms_alias",
      "aws_api_gateway_resource",
      "aws_api_gateway_method",
      "aws_api_gateway_integration",
      "aws_api_gateway_deployment",
      "aws_api_gateway_stage"
    ]
  );
  assert.equal(
    getReverseEngineeringTerraformResourceType("IAM_POLICY", "AWS::IAM::Role"),
    undefined
  );
  assert.equal(getReverseEngineeringTerraformResourceType("IAM_POLICY"), undefined);
});

test("IAM Lambda KMS 상세 원본을 정책 JSON과 same-scan 참조로 투영한다", () => {
  const role = readyDetailedResource("IAM_ROLE", "AWS::IAM::Role", {
    id: "resource-role",
    providerResourceId: "arn:aws:iam::111122223333:role/orders-role",
    config: {
      roleName: "orders-role",
      path: "/service/",
      trustPolicyDocument: { Version: "2012-10-17", Statement: [] },
      terraformImportId: "orders-role"
    }
  });
  const managedPolicy = readyDetailedResource("IAM_POLICY", "AWS::IAM::Policy", {
    id: "resource-managed-policy",
    providerResourceId: "arn:aws:iam::111122223333:policy/orders-read",
    config: {
      policyName: "orders-read",
      path: "/",
      policyDocument: { Version: "2012-10-17", Statement: [] },
      terraformImportId: "arn:aws:iam::111122223333:policy/orders-read"
    }
  });
  const inlinePolicy = readyDetailedResource("IAM_POLICY", "AWS::IAM::RolePolicy", {
    id: "resource-inline-policy",
    providerResourceId: "orders-role:orders-inline",
    config: {
      policyName: "orders-inline",
      roleName: "orders-role",
      policyDocument: { Version: "2012-10-17", Statement: [] },
      terraformImportId: "orders-role:orders-inline"
    },
    relationships: [{ type: "depends_on", targetResourceId: role.id }]
  });
  const attachment = readyDetailedResource("IAM_POLICY", "AWS::IAM::RolePolicyAttachment", {
    id: "resource-attachment",
    providerResourceId: "orders-role/arn:aws:iam::111122223333:policy/orders-read",
    config: {
      roleName: "orders-role",
      policyName: "orders-read",
      policyArn: "arn:aws:iam::111122223333:policy/orders-read",
      terraformImportId: "orders-role/arn:aws:iam::111122223333:policy/orders-read"
    },
    relationships: [
      { type: "depends_on", targetResourceId: role.id },
      { type: "depends_on", targetResourceId: managedPolicy.id }
    ]
  });
  const profile = readyDetailedResource("IAM_INSTANCE_PROFILE", "AWS::IAM::InstanceProfile", {
    id: "resource-profile",
    providerResourceId: "arn:aws:iam::111122223333:instance-profile/orders-profile",
    config: {
      instanceProfileName: "orders-profile",
      path: "/",
      roleNames: ["orders-role"],
      terraformImportId: "orders-profile"
    },
    relationships: [{ type: "depends_on", targetResourceId: role.id }]
  });
  const key = readyDetailedResource("KMS_KEY", "AWS::KMS::Key", {
    id: "resource-key",
    providerResourceId: "11111111-2222-3333-4444-555555555555",
    config: {
      providerResourceId:
        "arn:aws:kms:ap-northeast-2:111122223333:key/11111111-2222-3333-4444-555555555555",
      keyId: "11111111-2222-3333-4444-555555555555",
      keySpec: "SYMMETRIC_DEFAULT",
      keyUsage: "ENCRYPT_DECRYPT",
      enabled: true,
      multiRegion: false,
      origin: "AWS_KMS",
      rotationEnabled: true,
      rotationPeriodInDays: 365,
      policyDocument: { Version: "2012-10-17", Statement: [] },
      terraformImportId: "11111111-2222-3333-4444-555555555555"
    }
  });
  const alias = readyDetailedResource("KMS_ALIAS", "AWS::KMS::Alias", {
    id: "resource-alias",
    providerResourceId: "alias/orders",
    config: {
      aliasName: "alias/orders",
      targetKeyId: "11111111-2222-3333-4444-555555555555",
      terraformImportId: "alias/orders"
    },
    relationships: [{ type: "depends_on", targetResourceId: key.id }]
  });
  const lambda = readyDetailedResource("LAMBDA", "AWS::Lambda::Function", {
    id: "resource-lambda",
    providerResourceId: "arn:aws:lambda:ap-northeast-2:111122223333:function:orders-api",
    config: {
      functionName: "orders-api",
      functionConfiguration: {
        FunctionName: "orders-api",
        PackageType: "Image",
        Role: role.providerResourceId,
        Description: "Orders API",
        Architectures: ["arm64"],
        MemorySize: 512,
        Timeout: 30,
        KMSKeyArn: key.config["providerResourceId"],
        TracingConfig: { Mode: "Active" }
      },
      codeSource: {
        imageUri: "111122223333.dkr.ecr.ap-northeast-2.amazonaws.com/orders:1"
      },
      environmentVariables: { NODE_ENV: "production" },
      terraformImportId: "orders-api"
    },
    relationships: [
      { type: "depends_on", targetResourceId: role.id },
      { type: "depends_on", targetResourceId: key.id }
    ]
  });
  const permission = readyDetailedResource("LAMBDA_PERMISSION", "AWS::Lambda::Permission", {
    id: "resource-permission",
    providerResourceId: "orders-api/AllowInvoke",
    config: {
      functionName: "orders-api",
      statementId: "AllowInvoke",
      statement: {
        Sid: "AllowInvoke",
        Effect: "Allow",
        Action: "lambda:InvokeFunction",
        Principal: { Service: "apigateway.amazonaws.com" },
        Resource: lambda.providerResourceId,
        Condition: {
          ArnLike: { "AWS:SourceArn": "arn:aws:execute-api:ap-northeast-2:*:*/*" },
          StringEquals: { "AWS:SourceAccount": "111122223333" }
        }
      },
      terraformImportId: "orders-api/AllowInvoke"
    },
    relationships: [{ type: "depends_on", targetResourceId: lambda.id }]
  });
  const resources = [
    role,
    managedPolicy,
    inlinePolicy,
    attachment,
    profile,
    key,
    alias,
    lambda,
    permission
  ];

  assert.deepEqual(
    createReverseEngineeringTerraformProjection(inlinePolicy, resources).terraformValues,
    {
      name: "orders-inline",
      role: "aws_iam_role.resource_role.name",
      policy: '{"Version":"2012-10-17","Statement":[]}'
    }
  );
  assert.deepEqual(
    createReverseEngineeringTerraformProjection(attachment, resources).terraformValues,
    {
      role: "aws_iam_role.resource_role.name",
      policyArn: "aws_iam_policy.resource_managed_policy.arn"
    }
  );
  assert.equal(
    createReverseEngineeringTerraformProjection(profile, resources).terraformValues["role"],
    "aws_iam_role.resource_role.name"
  );
  assert.equal(
    createReverseEngineeringTerraformProjection(alias, resources).terraformValues["targetKeyId"],
    "aws_kms_key.resource_key.key_id"
  );
  assert.deepEqual(createReverseEngineeringTerraformProjection(lambda, resources).terraformValues, {
    functionName: "orders-api",
    packageType: "Image",
    imageUri: "111122223333.dkr.ecr.ap-northeast-2.amazonaws.com/orders:1",
    role: "aws_iam_role.resource_role.arn",
    description: "Orders API",
    architectures: ["arm64"],
    memorySize: 512,
    timeout: 30,
    kmsKeyArn: "aws_kms_key.resource_key.arn",
    environment: { variables: { NODE_ENV: "production" } },
    tracingConfig: { mode: "Active" }
  });
  assert.deepEqual(
    createReverseEngineeringTerraformProjection(permission, resources).terraformValues,
    {
      statementId: "AllowInvoke",
      action: "lambda:InvokeFunction",
      functionName: "aws_lambda_function.resource_lambda.function_name",
      principal: "apigateway.amazonaws.com",
      sourceArn: "arn:aws:execute-api:ap-northeast-2:*:*/*",
      sourceAccount: "111122223333"
    }
  );
});

test("API Gateway child를 RestApi와 parent Terraform 참조로 투영한다", () => {
  const restApi = resource("API_GATEWAY_REST_API", {
    id: "resource-api",
    providerResourceType: "AWS::ApiGateway::RestApi",
    providerResourceId: "api123",
    config: {
      name: "orders-api",
      hasResourcePolicy: false,
      tags: {},
      tagsReadComplete: true
    }
  });
  const apiResource = readyDetailedResource("API_GATEWAY_RESOURCE", "AWS::ApiGateway::Resource", {
    id: "resource-api-orders",
    providerResourceId: "api123/resource123",
    config: {
      restApiId: "api123",
      resourceId: "resource123",
      parentResourceId: "root123",
      pathPart: "orders",
      terraformImportId: "api123/resource123"
    },
    relationships: [{ type: "contains", targetResourceId: restApi.id }]
  });
  const method = readyDetailedResource("API_GATEWAY_METHOD", "AWS::ApiGateway::Method", {
    id: "resource-api-method",
    providerResourceId: "api123/resource123/GET",
    config: {
      restApiId: "api123",
      resourceId: "resource123",
      httpMethod: "GET",
      authorizationType: "NONE",
      apiKeyRequired: false,
      methodResponses: {},
      terraformImportId: "api123/resource123/GET"
    },
    relationships: [{ type: "contains", targetResourceId: apiResource.id }]
  });
  const integration = readyDetailedResource(
    "API_GATEWAY_INTEGRATION",
    "AWS::ApiGateway::Integration",
    {
      id: "resource-api-integration",
      providerResourceId: "api123/resource123/GET",
      config: {
        restApiId: "api123",
        resourceId: "resource123",
        httpMethod: "GET",
        integrationType: "MOCK",
        timeoutInMillis: 29_000,
        integrationResponses: {},
        terraformImportId: "api123/resource123/GET"
      },
      relationships: [{ type: "contains", targetResourceId: method.id }]
    }
  );
  const deployment = readyDetailedResource(
    "API_GATEWAY_DEPLOYMENT",
    "AWS::ApiGateway::Deployment",
    {
      id: "resource-api-deployment",
      providerResourceId: "api123/deployment123",
      config: {
        restApiId: "api123",
        deploymentId: "deployment123",
        description: "release",
        terraformImportId: "api123/deployment123"
      },
      relationships: [{ type: "contains", targetResourceId: restApi.id }]
    }
  );
  const stage = readyDetailedResource("API_GATEWAY_STAGE", "AWS::ApiGateway::Stage", {
    id: "resource-api-stage",
    providerResourceId: "api123/prod",
    config: {
      restApiId: "api123",
      deploymentId: "deployment123",
      stageName: "prod",
      tracingEnabled: true,
      terraformImportId: "api123/prod"
    },
    relationships: [
      { type: "contains", targetResourceId: restApi.id },
      { type: "depends_on", targetResourceId: deployment.id }
    ]
  });
  const resources = [restApi, apiResource, method, integration, deployment, stage];

  assert.deepEqual(
    createReverseEngineeringTerraformProjection(apiResource, resources).terraformValues,
    {
      restApiId: "aws_api_gateway_rest_api.resource_api.id",
      parentId: "aws_api_gateway_rest_api.resource_api.root_resource_id",
      pathPart: "orders"
    }
  );
  assert.deepEqual(createReverseEngineeringTerraformProjection(method, resources).terraformValues, {
    restApiId: "aws_api_gateway_rest_api.resource_api.id",
    resourceId: "aws_api_gateway_resource.resource_api_orders.id",
    httpMethod: "GET",
    authorization: "NONE",
    apiKeyRequired: false
  });
  assert.deepEqual(
    createReverseEngineeringTerraformProjection(integration, resources).terraformValues,
    {
      restApiId: "aws_api_gateway_rest_api.resource_api.id",
      resourceId: "aws_api_gateway_resource.resource_api_orders.id",
      httpMethod: "aws_api_gateway_method.resource_api_method.http_method",
      type: "MOCK",
      timeoutMilliseconds: 29_000
    }
  );
  assert.deepEqual(
    createReverseEngineeringTerraformProjection(deployment, resources).terraformValues,
    {
      restApiId: "aws_api_gateway_rest_api.resource_api.id",
      description: "release",
      dependsOn: [
        "aws_api_gateway_method.resource_api_method",
        "aws_api_gateway_integration.resource_api_integration"
      ]
    }
  );
  assert.deepEqual(createReverseEngineeringTerraformProjection(stage, resources).terraformValues, {
    restApiId: "aws_api_gateway_rest_api.resource_api.id",
    deploymentId: "aws_api_gateway_deployment.resource_api_deployment.id",
    stageName: "prod",
    tracingEnabled: true
  });
});

function readyDetailedResource(
  resourceType: ResourceType,
  providerResourceType: string,
  overrides: Partial<DiscoveredResource>
): DiscoveredResource {
  return resource(resourceType, {
    ...overrides,
    providerResourceType,
    config: {
      managementReady: true,
      reverseEngineeringDetailsComplete: true,
      reverseEngineeringDetailsVersion: 1,
      reverseEngineeringIncompleteDetails: [],
      ...(overrides.config ?? {})
    }
  });
}

function applicationLoadBalancerConfig(): Record<string, unknown> {
  return {
    attributes: {},
    attributesProjectionComplete: true,
    attributesReadComplete: true,
    name: "customer-entry",
    reverseEngineeringDetailsVersion: 1,
    scheme: "internet-facing",
    type: "application",
    ipAddressType: "ipv4",
    securityGroupIds: ["sg-1234"],
    subnetIds: ["subnet-a", "subnet-b"],
    tags: [],
    tagsReadComplete: true,
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
