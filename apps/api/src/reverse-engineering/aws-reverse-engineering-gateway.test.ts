import assert from "node:assert/strict";
import { test } from "node:test";
import { extractSetItems } from "./aws-reverse-engineering-gateway.js";

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
