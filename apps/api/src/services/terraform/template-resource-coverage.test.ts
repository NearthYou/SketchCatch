import assert from "node:assert/strict";
import { test } from "node:test";
import { templateDefinitions } from "@sketchcatch/types";
import { getResourceDefinitionByTerraform } from "@sketchcatch/types/resource-definitions";

test("every Template resource is renderable and syncable through the shared catalog", () => {
  const identities = new Set<string>();
  const missing: string[] = [];

  for (const template of templateDefinitions) {
    for (const resource of template.resources) {
      const identity = `${resource.terraformBlockType}/${resource.terraformResourceType}`;
      identities.add(identity);

      const definition = getResourceDefinitionByTerraform(
        resource.terraformBlockType,
        resource.terraformResourceType
      );

      if (!definition) {
        missing.push(`${template.id}:${identity}`);
        continue;
      }
      assert.equal(definition?.provider, resource.provider, `${template.id} provider drift for ${identity}`);
      assert.equal(definition?.capabilities.terraformPreview, true, `${template.id} preview disabled for ${identity}`);
      assert.equal(definition?.capabilities.terraformSync, true, `${template.id} sync disabled for ${identity}`);
    }
  }

  assert.deepEqual(missing, []);
  assert.ok(identities.size >= 20);
});
