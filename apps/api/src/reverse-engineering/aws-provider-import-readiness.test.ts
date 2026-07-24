import assert from "node:assert/strict";
import test from "node:test";
import type { ReverseEngineeringScanResult } from "@sketchcatch/types";
import {
  createAwsProviderAdapter,
  type AwsDiscoveredResourceRecord
} from "./aws-provider-adapter.js";
import {
  parseInstancesFromXml,
  parseInternetGatewaysFromXml,
  parseRdsInstancesFromXml,
  parseRouteTablesFromXml,
  parseSubnetsFromXml,
  parseVpcsFromXml
} from "./aws-reverse-engineering-parsers.js";

const region = "ap-northeast-2";

test("완전한 AWS 관찰값이 있는 기존 핵심 리소스만 Terraform import 준비 상태가 된다", async () => {
  const result = await scan(completeCoreRecords());

  assert.deepEqual(
    result.importSuggestions.map((suggestion) => ({
      handoffReady: suggestion.handoffReady,
      status: suggestion.status
    })),
    completeCoreRecords().map(() => ({ handoffReady: true, status: "ready" }))
  );

  for (const node of result.architectureJson.nodes) {
    assert.equal(node.config["reverseEngineeringManagement"], "managed", node.type);
    assert.equal(node.config["terraformBlockType"], "resource", node.type);
    assert.equal(typeof node.config["terraformResourceType"], "string", node.type);
    assert.equal(typeof node.config["terraformResourceName"], "string", node.type);
  }
});

test("핵심 리소스의 최소 관찰값이 빠지면 Terraform import를 수동 검토로 닫는다", async () => {
  const incompleteRecords = [
    record("AWS::EC2::VPC", "vpc-incomplete", {
      instanceTenancy: "default"
    }),
    record("AWS::EC2::Subnet", "subnet-incomplete", {
      vpcId: "vpc-main",
      cidrBlock: "10.0.1.0/24",
      mapPublicIpOnLaunch: false,
      assignIpv6AddressOnCreation: false
    }),
    record("AWS::EC2::InternetGateway", "igw-incomplete", {}),
    record("AWS::EC2::RouteTable", "rtb-incomplete", {
      vpcId: "vpc-main"
    }),
    record("AWS::EC2::Instance", "i-incomplete", {
      imageId: "ami-main",
      instanceType: "t3.micro",
      securityGroupIds: ["sg-main"]
    }),
    record("AWS::RDS::DBInstance", "database-incomplete", {
      allocatedStorage: 20,
      dbInstanceClass: "db.t3.micro",
      dbSubnetGroupName: "database-subnets",
      engine: "postgres",
      multiAz: false,
      publiclyAccessible: false,
      storageEncrypted: true,
      storageType: "gp3",
      deletionProtection: true,
      backupRetentionPeriod: 7,
      vpcSecurityGroupIds: ["sg-database"]
    }),
    record("AWS::S3::Bucket", "assets-incomplete", {
      reverseEngineeringIncompleteDetails: ["versioning"]
    })
  ];
  const result = await scan(incompleteRecords);
  const expectedMissingFields = [
    "cidrBlock",
    "availabilityZone",
    "attachments",
    "routes",
    "subnetId",
    "engineVersion",
    null
  ];

  for (const [index, suggestion] of result.importSuggestions.entries()) {
    const providerResourceType =
      incompleteRecords[index]?.providerResourceType ?? `resource-${index}`;
    const resource = result.discoveredResources[index];
    const node = resource
      ? result.architectureJson.nodes.find((candidate) => candidate.id === resource.id)
      : undefined;

    assert.ok(resource, providerResourceType);
    assert.ok(node, providerResourceType);
    assert.equal(
      node.config["reverseEngineeringManagement"],
      "needs_mapping",
      providerResourceType
    );
    assert.equal(node.config["terraformBlockType"], undefined, providerResourceType);
    assert.equal(node.config["terraformResourceType"], undefined, providerResourceType);
    assert.equal(node.config["terraformResourceName"], undefined, providerResourceType);
    assert.equal(suggestion.status, "manual_review", providerResourceType);
    assert.equal(suggestion.handoffReady, false, providerResourceType);
    assert.equal(suggestion.terraformAddress, undefined, providerResourceType);
    assert.equal(suggestion.importCommand, undefined, providerResourceType);
    assert.equal(suggestion.terraformBlockDraft, undefined, providerResourceType);

    const expectedMissingField = expectedMissingFields[index];
    if (expectedMissingField) {
      assert.match(suggestion.reason ?? "", new RegExp(expectedMissingField), providerResourceType);
      continue;
    }

    const exclusion = result.analysisExclusions.find(
      (candidate) => candidate.resourceId === resource.id
    );
    assert.equal(
      suggestion.reason,
      "AWS에서 찾았지만 안전하게 수정할 설정을 더 확인해야 합니다.",
      providerResourceType
    );
    assert.equal(exclusion?.reason, "missing_required_data", providerResourceType);
    assert.equal(exclusion?.resourceId, resource.id, providerResourceType);
    assert.match(exclusion?.message ?? "", /안전하게 수정할 설정/u, providerResourceType);
  }
});

test("서비스 계열의 필수 Terraform 관찰값이 빠져도 리소스만 남기고 관리 identity를 닫는다", async () => {
  const incompleteRecords = [
    record("AWS::ApiGateway::RestApi", "api-incomplete", {
      description: "missing name"
    }),
    record(
      "AWS::ElasticLoadBalancingV2::LoadBalancer",
      "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/customer/1234",
      {
        name: "customer-entry",
        loadBalancerType: "application",
        scheme: "internet-facing",
        ipAddressType: "ipv4"
      }
    ),
    record(
      "AWS::ECS::Service",
      "arn:aws:ecs:ap-northeast-2:123456789012:service/customer/customer-api",
      {
        name: "customer-api",
        clusterName: "customer",
        desiredCount: 1,
        launchType: "FARGATE"
      }
    ),
    record(
      "AWS::Logs::LogGroup",
      "arn:aws:logs:ap-northeast-2:123456789012:log-group:/ecs/customer-api",
      { retentionInDays: 30 }
    )
  ];
  const result = await scan(incompleteRecords);

  assert.equal(result.discoveredResources.length, incompleteRecords.length);
  for (const [index, resource] of result.discoveredResources.entries()) {
    const providerResourceType =
      incompleteRecords[index]?.providerResourceType ?? resource.resourceType;
    const node = result.architectureJson.nodes.find((candidate) => candidate.id === resource.id);
    const suggestion = result.importSuggestions.find(
      (candidate) => candidate.resourceId === resource.id
    );

    assert.ok(node, providerResourceType);
    assert.ok(suggestion, providerResourceType);
    assert.equal(
      node.config["reverseEngineeringManagement"],
      "needs_mapping",
      providerResourceType
    );
    assert.equal(node.config["terraformBlockType"], undefined, providerResourceType);
    assert.equal(node.config["terraformResourceType"], undefined, providerResourceType);
    assert.equal(node.config["terraformResourceName"], undefined, providerResourceType);
    assert.equal(suggestion.status, "manual_review", providerResourceType);
    assert.equal(suggestion.handoffReady, false, providerResourceType);
    assert.equal(suggestion.terraformAddress, undefined, providerResourceType);
    assert.equal(suggestion.importCommand, undefined, providerResourceType);
    assert.equal(suggestion.terraformBlockDraft, undefined, providerResourceType);
  }
});

test("실제 Query parser의 완전한 fixture는 핵심 리소스 import 준비 상태를 유지한다", async () => {
  const records = [
    ...parseVpcsFromXml(
      "<DescribeVpcsResponse><vpcSet><item><vpcId>vpc-main</vpcId><cidrBlock>10.0.0.0/16</cidrBlock><instanceTenancy>default</instanceTenancy></item></vpcSet></DescribeVpcsResponse>",
      region
    ),
    ...parseSubnetsFromXml(
      "<DescribeSubnetsResponse><subnetSet><item><subnetId>subnet-main</subnetId><vpcId>vpc-main</vpcId><cidrBlock>10.0.1.0/24</cidrBlock><availabilityZone>ap-northeast-2a</availabilityZone><mapPublicIpOnLaunch>false</mapPublicIpOnLaunch><assignIpv6AddressOnCreation>false</assignIpv6AddressOnCreation></item></subnetSet></DescribeSubnetsResponse>",
      region
    ),
    ...parseInternetGatewaysFromXml(
      "<DescribeInternetGatewaysResponse><internetGatewaySet><item><internetGatewayId>igw-main</internetGatewayId><attachmentSet><item><vpcId>vpc-main</vpcId><state>available</state></item></attachmentSet></item></internetGatewaySet></DescribeInternetGatewaysResponse>",
      region
    ),
    ...parseRouteTablesFromXml(
      "<DescribeRouteTablesResponse><routeTableSet><item><routeTableId>rtb-main</routeTableId><vpcId>vpc-main</vpcId><routeSet><item><destinationCidrBlock>10.0.0.0/16</destinationCidrBlock><gatewayId>local</gatewayId><state>active</state></item></routeSet></item></routeTableSet></DescribeRouteTablesResponse>",
      region
    ),
    ...parseInstancesFromXml(
      "<DescribeInstancesResponse><reservationSet><item><instancesSet><item><instanceId>i-main</instanceId><imageId>ami-main</imageId><instanceType>t3.micro</instanceType><subnetId>subnet-main</subnetId><groupSet><item><groupId>sg-main</groupId></item></groupSet><monitoring><state>disabled</state></monitoring></item></instancesSet></item></reservationSet></DescribeInstancesResponse>",
      region
    ),
    ...parseRdsInstancesFromXml(
      "<DescribeDBInstancesResponse><DescribeDBInstancesResult><DBInstances><DBInstance><DBInstanceIdentifier>database-main</DBInstanceIdentifier><AllocatedStorage>20</AllocatedStorage><AvailabilityZone>ap-northeast-2a</AvailabilityZone><BackupRetentionPeriod>7</BackupRetentionPeriod><DBInstanceClass>db.t3.micro</DBInstanceClass><DBSubnetGroup><DBSubnetGroupName>database-subnets</DBSubnetGroupName></DBSubnetGroup><DeletionProtection>true</DeletionProtection><Engine>postgres</Engine><EngineVersion>16.3</EngineVersion><MultiAZ>false</MultiAZ><PubliclyAccessible>false</PubliclyAccessible><StorageEncrypted>true</StorageEncrypted><StorageType>gp3</StorageType><VpcSecurityGroups><VpcSecurityGroupMembership><VpcSecurityGroupId>sg-database</VpcSecurityGroupId></VpcSecurityGroupMembership></VpcSecurityGroups></DBInstance></DBInstances></DescribeDBInstancesResult></DescribeDBInstancesResponse>",
      region
    )
  ];
  const result = await scan(records);

  assert.equal(result.importSuggestions.length, records.length);
  assert.ok(result.importSuggestions.every((suggestion) => suggestion.status === "ready"));
  assert.ok(result.importSuggestions.every((suggestion) => suggestion.handoffReady));
});

test("Subnet Route Table Association import ID는 association ID 대신 subnet/table 조합을 사용한다", async () => {
  const result = await scan(completeRouteTableAssociationRecords());
  const association = result.discoveredResources.find(
    (resource) => resource.resourceType === "ROUTE_TABLE_ASSOCIATION"
  );
  assert.ok(association);
  const suggestion = result.importSuggestions.find(
    (candidate) => candidate.resourceId === association.id
  );

  assert.equal(suggestion?.status, "ready");
  assert.equal(suggestion?.handoffReady, true);
  assert.match(suggestion?.terraformAddress ?? "", /^aws_route_table_association\./u);
  assert.equal(
    suggestion?.importCommand,
    `terraform import ${suggestion.terraformAddress} subnet-main/rtb-main`
  );
  assert.doesNotMatch(suggestion?.importCommand ?? "", /rtbassoc-main-subnet$/u);
});

test("main/gateway 및 같은 scan 대상이 빠진 Association은 보존하되 Terraform identity와 import를 닫는다", async () => {
  const scenarios: Array<{
    name: string;
    records: AwsDiscoveredResourceRecord[];
    config: Record<string, unknown>;
  }> = [
    {
      name: "main association",
      records: completeRouteTableAssociationRecords().slice(0, 2),
      config: {
        routeTableAssociationId: "rtbassoc-main",
        routeTableId: "rtb-main",
        main: true
      }
    },
    {
      name: "gateway association",
      records: completeRouteTableAssociationRecords().slice(0, 2),
      config: {
        routeTableAssociationId: "rtbassoc-gateway",
        routeTableId: "rtb-main",
        main: false
      }
    },
    {
      name: "missing same-scan subnet",
      records: completeRouteTableAssociationRecords().slice(1, 2),
      config: {
        routeTableAssociationId: "rtbassoc-missing-subnet",
        subnetId: "subnet-main",
        routeTableId: "rtb-main",
        main: false
      }
    },
    {
      name: "missing same-scan route table",
      records: completeRouteTableAssociationRecords().slice(0, 1),
      config: {
        routeTableAssociationId: "rtbassoc-missing-table",
        subnetId: "subnet-main",
        routeTableId: "rtb-main",
        main: false
      }
    },
    {
      name: "missing route table ID",
      records: completeRouteTableAssociationRecords().slice(0, 1),
      config: {
        routeTableAssociationId: "rtbassoc-no-table-id",
        subnetId: "subnet-main",
        main: false
      }
    }
  ];

  for (const scenario of scenarios) {
    const associationId = String(scenario.config["routeTableAssociationId"]);
    const result = await scan([
      ...scenario.records,
      record("AWS::EC2::RouteTableAssociation", associationId, scenario.config, [
        ...(typeof scenario.config["subnetId"] === "string"
          ? [
              {
                type: "attached_to" as const,
                targetProviderResourceId: scenario.config["subnetId"]
              }
            ]
          : []),
        ...(typeof scenario.config["routeTableId"] === "string"
          ? [
              {
                type: "depends_on" as const,
                targetProviderResourceId: scenario.config["routeTableId"]
              }
            ]
          : [])
      ])
    ]);
    const association = result.discoveredResources.find(
      (resource) => resource.providerResourceId === associationId
    );
    assert.ok(association, scenario.name);
    assert.equal(association.resourceType, "ROUTE_TABLE_ASSOCIATION", scenario.name);
    const node = result.architectureJson.nodes.find((candidate) => candidate.id === association.id);
    const suggestion = result.importSuggestions.find(
      (candidate) => candidate.resourceId === association.id
    );
    const exclusion = result.analysisExclusions.find(
      (candidate) => candidate.resourceId === association.id
    );

    assert.equal(association.analysisExcluded, true, scenario.name);
    assert.equal(association.importSuggestionStatus, "manual_review", scenario.name);
    assert.equal(node?.config["reverseEngineeringManagement"], "needs_mapping", scenario.name);
    assert.equal(node?.config["terraformBlockType"], undefined, scenario.name);
    assert.equal(node?.config["terraformResourceType"], undefined, scenario.name);
    assert.equal(node?.config["terraformResourceName"], undefined, scenario.name);
    assert.equal(suggestion?.status, "manual_review", scenario.name);
    assert.equal(suggestion?.handoffReady, false, scenario.name);
    assert.equal(suggestion?.terraformAddress, undefined, scenario.name);
    assert.equal(suggestion?.importCommand, undefined, scenario.name);
    assert.equal(suggestion?.terraformBlockDraft, undefined, scenario.name);
    assert.equal(exclusion?.reason, "missing_required_data", scenario.name);
    assert.match(exclusion?.message ?? "", /Subnet과 Route Table/u, scenario.name);
  }
});

// gg: 각 핵심 타입이 안전한 import에 필요한 최소 관찰값을 갖춘 fixture를 한곳에서 관리합니다.
function completeCoreRecords(): AwsDiscoveredResourceRecord[] {
  return [
    record("AWS::EC2::VPC", "vpc-main", {
      cidrBlock: "10.0.0.0/16",
      instanceTenancy: "default"
    }),
    record("AWS::EC2::Subnet", "subnet-main", {
      vpcId: "vpc-main",
      cidrBlock: "10.0.1.0/24",
      availabilityZone: "ap-northeast-2a",
      mapPublicIpOnLaunch: false,
      assignIpv6AddressOnCreation: false
    }),
    record("AWS::EC2::InternetGateway", "igw-main", {
      attachments: [{ vpcId: "vpc-main", state: "available" }]
    }),
    record("AWS::EC2::RouteTable", "rtb-main", {
      vpcId: "vpc-main",
      routes: [
        {
          destinationCidrBlock: "10.0.0.0/16",
          gatewayId: "local",
          state: "active"
        }
      ]
    }),
    record("AWS::EC2::Instance", "i-main", {
      imageId: "ami-main",
      instanceType: "t3.micro",
      subnetId: "subnet-main",
      securityGroupIds: ["sg-main"],
      monitoringState: "disabled"
    }),
    record("AWS::RDS::DBInstance", "database-main", {
      allocatedStorage: 20,
      availabilityZone: "ap-northeast-2a",
      backupRetentionPeriod: 7,
      dbInstanceClass: "db.t3.micro",
      dbSubnetGroupName: "database-subnets",
      deletionProtection: true,
      engine: "postgres",
      engineVersion: "16.3",
      multiAz: false,
      publiclyAccessible: false,
      storageEncrypted: true,
      storageType: "gp3",
      vpcSecurityGroupIds: ["sg-database"]
    }),
    record("AWS::S3::Bucket", "assets-main", {
      tags: [],
      tagsReadComplete: true
    }),
    record("AWS::ApiGateway::RestApi", "api-main", {
      hasResourcePolicy: false,
      name: "customer-api",
      tags: {},
      tagsReadComplete: true
    }),
    record(
      "AWS::ElasticLoadBalancingV2::LoadBalancer",
      "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/customer/1234",
      {
        attributes: {},
        attributesProjectionComplete: true,
        attributesReadComplete: true,
        name: "customer-entry",
        loadBalancerType: "application",
        reverseEngineeringDetailsVersion: 1,
        scheme: "internet-facing",
        ipAddressType: "ipv4",
        subnetIds: ["subnet-a", "subnet-b"],
        tags: [],
        tagsReadComplete: true
      }
    ),
    record(
      "AWS::Logs::LogGroup",
      "arn:aws:logs:ap-northeast-2:123456789012:log-group:/ecs/customer-api",
      {
        logGroupClass: "STANDARD",
        logGroupName: "/ecs/customer-api",
        retentionInDays: 30,
        tags: [],
        tagsReadComplete: true
      }
    )
  ];
}

function completeRouteTableAssociationRecords(): AwsDiscoveredResourceRecord[] {
  return [
    record("AWS::EC2::Subnet", "subnet-main", {
      vpcId: "vpc-main",
      cidrBlock: "10.0.1.0/24",
      availabilityZone: "ap-northeast-2a",
      mapPublicIpOnLaunch: false,
      assignIpv6AddressOnCreation: false
    }),
    record("AWS::EC2::RouteTable", "rtb-main", {
      vpcId: "vpc-main",
      routes: [{ destinationCidrBlock: "10.0.0.0/16", gatewayId: "local" }]
    }),
    record(
      "AWS::EC2::RouteTableAssociation",
      "rtbassoc-main-subnet",
      {
        routeTableAssociationId: "rtbassoc-main-subnet",
        subnetId: "subnet-main",
        routeTableId: "rtb-main",
        main: false
      },
      [
        { type: "attached_to", targetProviderResourceId: "subnet-main" },
        { type: "depends_on", targetProviderResourceId: "rtb-main" }
      ]
    )
  ];
}

// gg: private scan과 같은 원본 ID를 쓰는 단순 gateway fixture를 만듭니다.
function record(
  providerResourceType: string,
  providerResourceId: string,
  config: Record<string, unknown>,
  relationships: AwsDiscoveredResourceRecord["relationships"] = []
): AwsDiscoveredResourceRecord {
  return {
    providerResourceType,
    providerResourceId,
    displayName: providerResourceId,
    region,
    config,
    relationships
  };
}

// gg: 실제 import handoff 경계와 같은 private adapter scan을 실행합니다.
async function scan(records: AwsDiscoveredResourceRecord[]): Promise<ReverseEngineeringScanResult> {
  return createAwsProviderAdapter(
    {
      async discoverResources() {
        return records;
      }
    },
    { resultVisibility: "private" }
  ).scan({ provider: "aws", region, resourceTypes: ["ALL"] });
}
