import assert from "node:assert/strict";
import { test } from "node:test";

import { terraformParameterCatalog } from "./catalog";

test("Launch Template parameters expose the supported runtime and nested settings", () => {
  const definitions = terraformParameterCatalog.resources.aws_launch_template ?? [];
  const definitionByName = new Map(definitions.map((definition) => [definition.name, definition]));

  assert.ok(definitionByName.has("updateDefaultVersion"));
  assert.deepEqual(
    definitionByName.get("metadataOptions")?.children?.map((child) => child.name),
    ["httpEndpoint", "httpTokens"]
  );
  assert.deepEqual(
    definitionByName.get("networkInterfaces")?.children?.map((child) => child.name),
    ["associatePublicIpAddress", "securityGroups"]
  );
  assert.deepEqual(
    definitionByName.get("tagSpecifications")?.children?.map((child) => child.name),
    ["resourceType", "tags"]
  );
});
