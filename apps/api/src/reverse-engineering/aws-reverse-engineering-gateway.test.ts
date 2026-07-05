import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractSetItems,
  parseInternetGatewaysFromXml,
  parseRouteTablesFromXml,
  parseSecurityGroupsFromXml
} from "./aws-reverse-engineering-parsers.js";

test("extractSetItems returns only direct AWS set items when child item tags are nested", () => {
  const xml = `
    <DescribeSecurityGroupsResponse>
      <securityGroupInfo>
        <item>
          <groupId>sg-1111</groupId>
          <ipPermissions>
            <item>
              <ipProtocol>tcp</ipProtocol>
              <ipRanges>
                <item>
                  <cidrIp>0.0.0.0/0</cidrIp>
                </item>
              </ipRanges>
            </item>
          </ipPermissions>
        </item>
        <item>
          <groupId>sg-2222</groupId>
        </item>
      </securityGroupInfo>
    </DescribeSecurityGroupsResponse>
  `;

  const items = extractSetItems(xml, "securityGroupInfo");

  assert.equal(items.length, 2);
  assert.match(items[0] ?? "", /<groupId>sg-1111<\/groupId>/);
  assert.match(items[0] ?? "", /<\/ipPermissions>/);
  assert.match(items[1] ?? "", /<groupId>sg-2222<\/groupId>/);
});

test("parseInternetGatewaysFromXml maps gateway attachments to discovered resources", () => {
  const xml = `
    <DescribeInternetGatewaysResponse>
      <internetGatewaySet>
        <item>
          <internetGatewayId>igw-1234</internetGatewayId>
          <attachmentSet>
            <item>
              <vpcId>vpc-1234</vpcId>
            </item>
          </attachmentSet>
          <tagSet>
            <item>
              <key>Name</key>
              <value>Main Internet Gateway</value>
            </item>
          </tagSet>
        </item>
      </internetGatewaySet>
    </DescribeInternetGatewaysResponse>
  `;

  const [gateway] = parseInternetGatewaysFromXml(xml, "ap-northeast-2");

  assert.equal(gateway?.providerResourceType, "AWS::EC2::InternetGateway");
  assert.equal(gateway?.providerResourceId, "igw-1234");
  assert.equal(gateway?.displayName, "Main Internet Gateway");
  assert.deepEqual(gateway?.relationships, [
    { type: "attached_to", targetProviderResourceId: "vpc-1234" }
  ]);
});

test("parseRouteTablesFromXml maps VPC and gateway routes to discovered resources", () => {
  const xml = `
    <DescribeRouteTablesResponse>
      <routeTableSet>
        <item>
          <routeTableId>rtb-1234</routeTableId>
          <vpcId>vpc-1234</vpcId>
          <routeSet>
            <item>
              <gatewayId>igw-1234</gatewayId>
            </item>
          </routeSet>
          <tagSet>
            <item>
              <key>Name</key>
              <value>Public Route Table</value>
            </item>
          </tagSet>
        </item>
      </routeTableSet>
    </DescribeRouteTablesResponse>
  `;

  const [routeTable] = parseRouteTablesFromXml(xml, "ap-northeast-2");

  assert.equal(routeTable?.providerResourceType, "AWS::EC2::RouteTable");
  assert.equal(routeTable?.providerResourceId, "rtb-1234");
  assert.equal(routeTable?.displayName, "Public Route Table");
  assert.deepEqual(routeTable?.relationships, [
    { type: "contains", targetProviderResourceId: "vpc-1234" },
    { type: "depends_on", targetProviderResourceId: "igw-1234" }
  ]);
});

test("parseSecurityGroupsFromXml keeps open ingress rules for risk findings", () => {
  const xml = `
    <DescribeSecurityGroupsResponse>
      <securityGroupInfo>
        <item>
          <groupId>sg-open</groupId>
          <groupName>open-ssh</groupName>
          <vpcId>vpc-1234</vpcId>
          <ipPermissions>
            <item>
              <fromPort>22</fromPort>
              <ipRanges>
                <item>
                  <cidrIp>0.0.0.0/0</cidrIp>
                </item>
              </ipRanges>
            </item>
          </ipPermissions>
        </item>
      </securityGroupInfo>
    </DescribeSecurityGroupsResponse>
  `;

  const [securityGroup] = parseSecurityGroupsFromXml(xml, "ap-northeast-2");

  assert.deepEqual(securityGroup?.config["ingress"], [{ port: 22, cidr: "0.0.0.0/0" }]);
});
