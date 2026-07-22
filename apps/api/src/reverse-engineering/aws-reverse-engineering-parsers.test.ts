import assert from "node:assert/strict";
import test from "node:test";
import {
  parseAddressesFromXml,
  parseNatGatewaysFromXml,
  parseRouteTablesFromXml,
  parseSecurityGroupsFromXml
} from "./aws-reverse-engineering-parsers.js";

test("EIP XML은 allocation ID와 안전한 association 분류만 보존한다", () => {
  const [record] = parseAddressesFromXml(
    `<DescribeAddressesResponse>
      <addressesSet>
        <item>
          <allocationId>eipalloc-0123456789abcdef0</allocationId>
          <associationId>eipassoc-0123456789abcdef0</associationId>
          <domain>vpc</domain>
          <instanceId>i-private-target</instanceId>
          <networkInterfaceId>eni-private-target</networkInterfaceId>
          <privateIpAddress>10.0.1.10</privateIpAddress>
          <publicIp>203.0.113.10</publicIp>
          <tagSet>
            <item><key>Name</key><value>egress-ip</value></item>
            <item><key>team</key><value>platform</value></item>
          </tagSet>
        </item>
      </addressesSet>
    </DescribeAddressesResponse>`,
    "ap-northeast-2"
  );

  assert.deepEqual(record, {
    providerResourceType: "AWS::EC2::EIP",
    providerResourceId: "eipalloc-0123456789abcdef0",
    displayName: "egress-ip",
    region: "ap-northeast-2",
    config: {
      allocationId: "eipalloc-0123456789abcdef0",
      associationTargetType: "ec2_or_eni",
      domain: "vpc",
      publicIp: "203.0.113.10",
      tags: [
        { key: "Name", value: "egress-ip" },
        { key: "team", value: "platform" }
      ]
    },
    relationships: []
  });
  assert.doesNotMatch(
    JSON.stringify(record),
    /i-private-target|eni-private-target|10\.0\.1\.10|eipassoc-/u
  );
});

test("AWS 서비스가 관리하는 EIP는 사용자 소유 미연결 EIP로 승격하지 않는다", () => {
  const [record] = parseAddressesFromXml(
    `<DescribeAddressesResponse>
      <addressesSet>
        <item>
          <allocationId>eipalloc-abcdef01234567890</allocationId>
          <domain>vpc</domain>
          <publicIp>203.0.113.20</publicIp>
          <serviceManaged>alb</serviceManaged>
        </item>
      </addressesSet>
    </DescribeAddressesResponse>`,
    "ap-northeast-2"
  );

  assert.equal(record?.config["associationTargetType"], "service_managed");
  assert.equal(record?.config["serviceManaged"], undefined);
});

test("NAT Gateway XML은 subnet과 primary/all EIP 관계를 보존하고 민감한 주소는 버린다", () => {
  const [record] = parseNatGatewaysFromXml(
    `<DescribeNatGatewaysResponse>
      <natGatewaySet>
        <item>
          <natGatewayId>nat-0123456789abcdef0</natGatewayId>
          <subnetId>subnet-0123456789abcdef0</subnetId>
          <vpcId>vpc-0123456789abcdef0</vpcId>
          <state>available</state>
          <connectivityType>public</connectivityType>
          <natGatewayAddressSet>
            <item>
              <allocationId>eipalloc-primary1234567</allocationId>
              <associationId>eipassoc-private-primary</associationId>
              <networkInterfaceId>eni-private-primary</networkInterfaceId>
              <privateIp>10.0.1.10</privateIp>
              <publicIp>203.0.113.10</publicIp>
              <isPrimary>true</isPrimary>
            </item>
            <item>
              <allocationId>eipalloc-secondary12345</allocationId>
              <networkInterfaceId>eni-private-secondary</networkInterfaceId>
              <privateIp>10.0.1.11</privateIp>
              <publicIp>203.0.113.11</publicIp>
              <isPrimary>false</isPrimary>
            </item>
          </natGatewayAddressSet>
          <tagSet><item><key>Name</key><value>public-egress</value></item></tagSet>
        </item>
      </natGatewaySet>
    </DescribeNatGatewaysResponse>`,
    "ap-northeast-2"
  );

  assert.deepEqual(record, {
    providerResourceType: "AWS::EC2::NatGateway",
    providerResourceId: "nat-0123456789abcdef0",
    displayName: "public-egress",
    region: "ap-northeast-2",
    config: {
      allocationIds: ["eipalloc-primary1234567", "eipalloc-secondary12345"],
      connectivityType: "public",
      natGatewayId: "nat-0123456789abcdef0",
      primaryAllocationId: "eipalloc-primary1234567",
      state: "available",
      subnetId: "subnet-0123456789abcdef0",
      tags: [{ key: "Name", value: "public-egress" }],
      vpcId: "vpc-0123456789abcdef0"
    },
    relationships: [
      { type: "contains", targetProviderResourceId: "subnet-0123456789abcdef0" },
      { type: "depends_on", targetProviderResourceId: "eipalloc-primary1234567" },
      { type: "depends_on", targetProviderResourceId: "eipalloc-secondary12345" }
    ]
  });
  assert.doesNotMatch(
    JSON.stringify(record),
    /eni-private|10\.0\.1\.|203\.0\.113\.|eipassoc-/u
  );
});

test("private NAT Gateway는 EIP 없이도 subnet 관계와 connectivity를 보존한다", () => {
  const [record] = parseNatGatewaysFromXml(
    `<DescribeNatGatewaysResponse><natGatewaySet><item>
      <natGatewayId>nat-abcdef01234567890</natGatewayId>
      <subnetId>subnet-abcdef01234567890</subnetId>
      <state>available</state>
      <connectivityType>private</connectivityType>
      <natGatewayAddressSet>
        <item><networkInterfaceId>eni-private</networkInterfaceId><privateIp>10.0.2.10</privateIp></item>
      </natGatewayAddressSet>
    </item></natGatewaySet></DescribeNatGatewaysResponse>`,
    "ap-northeast-2"
  );

  assert.equal(record?.config["connectivityType"], "private");
  assert.deepEqual(record?.config["allocationIds"], []);
  assert.equal("primaryAllocationId" in (record?.config ?? {}), false);
  assert.deepEqual(record?.relationships, [
    { type: "contains", targetProviderResourceId: "subnet-abcdef01234567890" }
  ]);
});

test("단일 EIP public NAT은 optional isPrimary가 없어도 그 EIP를 primary로 사용한다", () => {
  const [record] = parseNatGatewaysFromXml(
    `<DescribeNatGatewaysResponse><natGatewaySet><item>
      <natGatewayId>nat-abcdef01234567890</natGatewayId>
      <subnetId>subnet-abcdef01234567890</subnetId>
      <state>available</state>
      <connectivityType>public</connectivityType>
      <natGatewayAddressSet>
        <item><allocationId>eipalloc-abcdef01234567890</allocationId></item>
      </natGatewayAddressSet>
    </item></natGatewaySet></DescribeNatGatewaysResponse>`,
    "ap-northeast-2"
  );

  assert.deepEqual(record?.config["allocationIds"], ["eipalloc-abcdef01234567890"]);
  assert.equal(record?.config["primaryAllocationId"], "eipalloc-abcdef01234567890");
});

test("Route Table XML에서 테이블과 subnet/main/gateway association을 각각 보존한다", () => {
  const records = parseRouteTablesFromXml(
    `<DescribeRouteTablesResponse>
      <routeTableSet>
        <item>
          <routeTableId>rtb-main</routeTableId>
          <vpcId>vpc-main</vpcId>
          <routeSet>
            <item>
              <destinationCidrBlock>10.0.0.0/16</destinationCidrBlock>
              <gatewayId>local</gatewayId>
              <state>active</state>
            </item>
            <item>
              <destinationCidrBlock>0.0.0.0/0</destinationCidrBlock>
              <natGatewayId>nat-0123456789abcdef0</natGatewayId>
              <state>active</state>
            </item>
          </routeSet>
          <associationSet>
            <item>
              <routeTableAssociationId>rtbassoc-subnet</routeTableAssociationId>
              <routeTableId>rtb-main</routeTableId>
              <subnetId>subnet-main</subnetId>
              <main>false</main>
            </item>
            <item>
              <routeTableAssociationId>rtbassoc-main</routeTableAssociationId>
              <routeTableId>rtb-main</routeTableId>
              <main>true</main>
            </item>
            <item>
              <routeTableAssociationId>rtbassoc-gateway</routeTableAssociationId>
              <routeTableId>rtb-main</routeTableId>
              <gatewayId>igw-main</gatewayId>
              <main>false</main>
            </item>
          </associationSet>
        </item>
      </routeTableSet>
    </DescribeRouteTablesResponse>`,
    "ap-northeast-2"
  );

  assert.equal(records.length, 4);
  const [routeTable, subnetAssociation, mainAssociation, gatewayAssociation] = records;
  assert.equal(routeTable?.providerResourceType, "AWS::EC2::RouteTable");
  assert.equal(routeTable?.providerResourceId, "rtb-main");
  assert.deepEqual(routeTable?.relationships, [
    { type: "contains", targetProviderResourceId: "vpc-main" },
    { type: "depends_on", targetProviderResourceId: "igw-main" },
    { type: "depends_on", targetProviderResourceId: "nat-0123456789abcdef0" }
  ]);
  assert.deepEqual(routeTable?.config["associations"], [
    {
      routeTableAssociationId: "rtbassoc-subnet",
      subnetId: "subnet-main",
      main: false
    },
    { routeTableAssociationId: "rtbassoc-main", main: true },
    { routeTableAssociationId: "rtbassoc-gateway", main: false }
  ]);

  assert.deepEqual(subnetAssociation, {
    providerResourceType: "AWS::EC2::RouteTableAssociation",
    providerResourceId: "rtbassoc-subnet",
    displayName: "rtbassoc-subnet",
    region: "ap-northeast-2",
    config: {
      routeTableAssociationId: "rtbassoc-subnet",
      subnetId: "subnet-main",
      routeTableId: "rtb-main",
      main: false
    },
    relationships: [
      { type: "attached_to", targetProviderResourceId: "subnet-main" },
      { type: "depends_on", targetProviderResourceId: "rtb-main" }
    ]
  });
  assert.deepEqual(mainAssociation?.config, {
    routeTableAssociationId: "rtbassoc-main",
    routeTableId: "rtb-main",
    main: true
  });
  assert.deepEqual(mainAssociation?.relationships, [
    { type: "depends_on", targetProviderResourceId: "rtb-main" }
  ]);
  assert.deepEqual(gatewayAssociation?.config, {
    routeTableAssociationId: "rtbassoc-gateway",
    routeTableId: "rtb-main",
    main: false
  });
  assert.deepEqual(gatewayAssociation?.relationships, [
    { type: "depends_on", targetProviderResourceId: "rtb-main" }
  ]);
});

test("Security Group XML의 모든 source와 설명을 손실 없이 별도 규칙으로 보존한다", () => {
  const [securityGroup] = parseSecurityGroupsFromXml(
    `<DescribeSecurityGroupsResponse>
      <securityGroupInfo>
        <item>
          <groupId>sg-target</groupId>
          <groupName>target</groupName>
          <groupDescription>target group</groupDescription>
          <ownerId>123456789012</ownerId>
          <vpcId>vpc-main</vpcId>
          <ipPermissions>
            <item>
              <ipProtocol>tcp</ipProtocol>
              <fromPort>443</fromPort>
              <toPort>443</toPort>
              <ipRanges>
                <item><cidrIp>10.0.0.0/8</cidrIp><description>office ipv4</description></item>
                <item><cidrIp>192.0.2.0/24</cidrIp><description>partner ipv4</description></item>
              </ipRanges>
              <ipv6Ranges>
                <item><cidrIpv6>2001:db8::/64</cidrIpv6><description>office ipv6</description></item>
              </ipv6Ranges>
              <prefixListIds>
                <item><prefixListId>pl-0123456789abcdef0</prefixListId><description>aws service</description></item>
              </prefixListIds>
              <groups>
                <item>
                  <groupId>sg-source</groupId>
                  <userId>210987654321</userId>
                  <vpcId>vpc-main</vpcId>
                  <description>source workload</description>
                </item>
              </groups>
            </item>
          </ipPermissions>
          <ipPermissionsEgress>
            <item>
              <ipProtocol>-1</ipProtocol>
              <ipRanges><item><cidrIp>0.0.0.0/0</cidrIp><description>all outbound</description></item></ipRanges>
            </item>
          </ipPermissionsEgress>
        </item>
      </securityGroupInfo>
    </DescribeSecurityGroupsResponse>`,
    "ap-northeast-2"
  );

  assert.ok(securityGroup);
  assert.equal(securityGroup.config["securityGroupRulesComplete"], true);
  assert.deepEqual(securityGroup.config["ingress"], [
    {
      ipProtocol: "tcp",
      fromPort: 443,
      toPort: 443,
      port: 443,
      cidr: "10.0.0.0/8",
      cidrBlocks: ["10.0.0.0/8"],
      description: "office ipv4"
    },
    {
      ipProtocol: "tcp",
      fromPort: 443,
      toPort: 443,
      port: 443,
      cidr: "192.0.2.0/24",
      cidrBlocks: ["192.0.2.0/24"],
      description: "partner ipv4"
    },
    {
      ipProtocol: "tcp",
      fromPort: 443,
      toPort: 443,
      port: 443,
      ipv6CidrBlocks: ["2001:db8::/64"],
      description: "office ipv6"
    },
    {
      ipProtocol: "tcp",
      fromPort: 443,
      toPort: 443,
      port: 443,
      prefixListIds: ["pl-0123456789abcdef0"],
      description: "aws service"
    },
    {
      ipProtocol: "tcp",
      fromPort: 443,
      toPort: 443,
      port: 443,
      securityGroups: ["sg-source"],
      sourceSecurityGroupOwnerId: "210987654321",
      sourceSecurityGroupVpcId: "vpc-main",
      description: "source workload"
    }
  ]);
  assert.deepEqual(securityGroup.config["egress"], [
    {
      ipProtocol: "-1",
      cidr: "0.0.0.0/0",
      cidrBlocks: ["0.0.0.0/0"],
      description: "all outbound"
    }
  ]);
  assert.deepEqual(securityGroup.relationships, [
    { type: "depends_on", targetProviderResourceId: "vpc-main" },
    { type: "depends_on", targetProviderResourceId: "sg-source" }
  ]);
});

test("source 값을 끝까지 확인하지 못한 Security Group 규칙은 불완전하다고 표시한다", () => {
  const [securityGroup] = parseSecurityGroupsFromXml(
    `<DescribeSecurityGroupsResponse>
      <securityGroupInfo>
        <item>
          <groupId>sg-incomplete</groupId>
          <groupName>incomplete</groupName>
          <vpcId>vpc-main</vpcId>
          <ipPermissions>
            <item>
              <ipProtocol>tcp</ipProtocol>
              <fromPort>443</fromPort>
              <toPort>443</toPort>
              <ipv6Ranges><item><description>missing ipv6 cidr</description></item></ipv6Ranges>
            </item>
          </ipPermissions>
          <ipPermissionsEgress />
        </item>
      </securityGroupInfo>
    </DescribeSecurityGroupsResponse>`,
    "ap-northeast-2"
  );

  assert.ok(securityGroup);
  assert.equal(securityGroup.config["securityGroupRulesComplete"], false);
  assert.deepEqual(securityGroup.config["ingress"], []);
});
