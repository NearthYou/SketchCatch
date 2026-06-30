import assert from "node:assert/strict";
import { test } from "node:test";
import { resourceCatalog } from "./catalog";

test("resourceCatalog gives VPC, Subnet, and Security Group area-sized defaults", () => {
  assert.deepEqual(getResourceSize("aws_vpc"), { width: 516, height: 360 });
  assert.deepEqual(getResourceSize("aws_subnet"), { width: 324, height: 216 });
  assert.deepEqual(getResourceSize("aws_security_group"), { width: 324, height: 216 });
});

test("resourceCatalog keeps regular network resources at icon node size", () => {
  assert.deepEqual(getResourceSize("aws_internet_gateway"), { width: 112, height: 108 });
  assert.deepEqual(getResourceSize("aws_route_table_association"), { width: 112, height: 108 });
});

function getResourceSize(resourceType: string) {
  const resource = resourceCatalog.find((item) => item.nodeDefaults.type === resourceType);

  assert.ok(resource, `Missing catalog resource: ${resourceType}`);

  return resource.nodeDefaults.size;
}
