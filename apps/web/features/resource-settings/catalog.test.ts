import assert from "node:assert/strict";
import { test } from "node:test";
import { resourceCatalog } from "./catalog";

test("resourceCatalog sizes area defaults below the Region hierarchy root", () => {
  assert.deepEqual(getResourceSize("design_region"), { width: 260, height: 180 });
  assert.deepEqual(getResourceSize("aws_vpc"), { width: 240, height: 160 });
  assert.deepEqual(getResourceSize("design_az"), { width: 220, height: 150 });
  assert.deepEqual(getResourceSize("design_group"), { width: 200, height: 130 });
  assert.deepEqual(getResourceSize("aws_subnet"), { width: 180, height: 120 });
  assert.deepEqual(getResourceSize("aws_security_group"), { width: 180, height: 120 });
});

test("resourceCatalog keeps regular network resources at icon node size", () => {
  assert.deepEqual(getResourceSize("aws_internet_gateway"), { width: 124, height: 96 });
  assert.deepEqual(getResourceSize("aws_route_table_association"), { width: 124, height: 96 });
});

function getResourceSize(resourceType: string) {
  const resource = resourceCatalog.find((item) => item.nodeDefaults.type === resourceType);

  assert.ok(resource, `Missing catalog resource: ${resourceType}`);

  return resource.nodeDefaults.size;
}
