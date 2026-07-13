import assert from "node:assert/strict";
import { test } from "node:test";
import { resourceDefinitions } from "@sketchcatch/types/resource-definitions";

test("at least 112 AWS resources have active shared Terraform and parameter-panel support", () => {
  const activeDefinitions = resourceDefinitions.filter(
    (definition) =>
      definition.provider === "aws" && definition.capabilities.parameterPanel
  );

  assert.ok(
    activeDefinitions.length >= 112,
    `Expected at least 112 active AWS definitions, received ${activeDefinitions.length}`
  );

  for (const definition of activeDefinitions) {
    assert.equal(definition.capabilities.terraformPreview, true, definition.id);
    assert.equal(definition.capabilities.terraformSync, true, definition.id);
  }
});
