import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createTerraformParameterCatalogKey,
  getResourceDefinitionById
} from "@sketchcatch/types/resource-definitions";
import { resourceCatalog } from "../resource-settings/catalog";
import { terraformParameterCatalog } from "./catalog";

test("every enabled provider-backed palette resource has an editable Terraform parameter contract", () => {
  const gaps = resourceCatalog.flatMap((item) => {
    if (!item.enabled) return [];

    const definition = getResourceDefinitionById(item.id);

    if (!definition) return [];
    if (item.nodeDefaults.type === "aws_region" || item.nodeDefaults.type === "aws_availability_zone") {
      return [];
    }

    const definitions = terraformParameterCatalog.resources[
      createTerraformParameterCatalogKey(
        definition.terraform.blockType,
        definition.terraform.resourceType
      )
    ];
    const hasEditableContract =
      definitions !== undefined &&
      (definition.terraform.blockType === "data" || definitions.length > 0);

    return definition.capabilities.parameterPanel && hasEditableContract
      ? []
      : [definition.id];
  });

  assert.deepEqual(gaps, []);
});
