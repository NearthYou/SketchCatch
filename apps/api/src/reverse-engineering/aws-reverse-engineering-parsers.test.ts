import assert from "node:assert/strict";
import test from "node:test";
import {
  parseRouteTablesFromXml,
  parseSecurityGroupsFromXml
} from "./aws-reverse-engineering-parsers.js";

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
