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
    "details.versioning"
  ];

  for (const [index, suggestion] of result.importSuggestions.entries()) {
    const providerResourceType =
      incompleteRecords[index]?.providerResourceType ?? `resource-${index}`;

    assert.equal(suggestion.status, "manual_review", providerResourceType);
    assert.equal(suggestion.handoffReady, false, providerResourceType);
    assert.match(
      suggestion.reason ?? "",
      new RegExp(expectedMissingFields[index] ?? "missing"),
      providerResourceType
    );
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
    record("AWS::S3::Bucket", "assets-main", {})
  ];
}

// gg: private scan과 같은 원본 ID를 쓰는 단순 gateway fixture를 만듭니다.
function record(
  providerResourceType: string,
  providerResourceId: string,
  config: Record<string, unknown>
): AwsDiscoveredResourceRecord {
  return {
    providerResourceType,
    providerResourceId,
    displayName: providerResourceId,
    region,
    config,
    relationships: []
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
