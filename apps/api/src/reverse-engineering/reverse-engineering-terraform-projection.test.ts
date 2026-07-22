import assert from "node:assert/strict";
import test from "node:test";
import type { DiscoveredResource, ResourceType } from "@sketchcatch/types";
import { getReverseEngineeringTerraformCompleteness } from "./reverse-engineering-terraform-completeness.js";
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
    assert.deepEqual(
      createReverseEngineeringTerraformProjection(association, sameScanResources),
      { management: "needs_mapping", terraformValues: {} }
    );
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
    relationships: [
      { type: "contains", targetResourceId: subnet.id, label: "contains" }
    ]
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
    relationships: [
      { type: "depends_on", targetResourceId: nat.id, label: "depends_on" }
    ]
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
    relationships: [
      { type: "depends_on", targetResourceId: nat.id, label: "depends_on" }
    ]
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
    relationships: [
      { type: "depends_on", targetResourceId: nat.id, label: "depends_on" }
    ]
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
    relationships: [
      { type: "contains", targetResourceId: subnet.id, label: "contains" }
    ]
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
