import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { getResourceDefinitionByTerraform } from "@sketchcatch/types/resource-definitions";

const awsResourceInventorySource = readFileSync(
  fileURLToPath(new URL("../../../../../docs/jh/000_AWS리소스목록_JH.md", import.meta.url)),
  "utf8"
);

test("priority 1 and 2 AWS inventory resources all have active shared Terraform support", () => {
  const inventoryResources = parsePriorityAwsResources(awsResourceInventorySource);

  assert.equal(inventoryResources.length, 112);

  for (const resource of inventoryResources) {
    const definition = getResourceDefinitionByTerraform(resource.blockType, resource.resourceType);

    assert.ok(definition, `Missing shared Terraform definition for ${resource.displayName}`);
    assert.equal(definition.capabilities.terraformPreview, true, resource.displayName);
    assert.equal(definition.capabilities.terraformSync, true, resource.displayName);
    assert.equal(definition.capabilities.parameterPanel, true, resource.displayName);
  }
});

function parsePriorityAwsResources(source: string) {
  const resources: {
    readonly blockType: "data" | "resource";
    readonly displayName: string;
    readonly resourceType: string;
  }[] = [];
  let inPrioritySection = false;

  for (const line of source.split(/\r?\n/u)) {
    if (/^## [12]순위 리소스 목록/u.test(line)) {
      inPrioritySection = true;
      continue;
    }

    if (inPrioritySection && /^## 현재 SketchCatch 보유 리소스 목록/u.test(line)) {
      break;
    }

    if (!inPrioritySection) {
      continue;
    }

    const match = /^\| `([^`]+)` \|/u.exec(line);

    if (!match) {
      continue;
    }

    const displayName = match[1];

    if (!displayName) {
      continue;
    }

    const isDataSource = displayName.startsWith("data.");

    resources.push({
      blockType: isDataSource ? "data" : "resource",
      displayName,
      resourceType: isDataSource ? displayName.replace(/^data\./u, "") : displayName
    });
  }

  return resources;
}
