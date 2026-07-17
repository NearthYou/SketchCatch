import assert from "node:assert/strict";
import { test } from "node:test";
import { getResourceDefinitionById } from "@sketchcatch/types/resource-definitions";
import { resourceCatalog } from "../resource-settings/catalog";
import { terraformParameterCatalog } from "./catalog";

test("every enabled managed palette resource has an editable Terraform parameter contract", () => {
  const gaps = resourceCatalog.flatMap((item) => {
    if (!item.enabled) return [];

    const definition = getResourceDefinitionById(item.id);

    if (!definition || definition.terraform.blockType !== "resource") return [];
    if (item.nodeDefaults.type === "aws_region" || item.nodeDefaults.type === "aws_availability_zone") {
      return [];
    }

    const definitions = terraformParameterCatalog.resources[definition.terraform.resourceType];

    return definition.capabilities.parameterPanel && definitions && definitions.length > 0
      ? []
      : [definition.id];
  });

  assert.deepEqual(gaps, []);
});
