import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { terraformParameterCatalog } from "../parameter-input/catalog";
import { resourceCatalog } from "./catalog";

const publicDirectoryPath = fileURLToPath(new URL("../../public", import.meta.url));
const awsResourceInventorySource = readFileSync(
  fileURLToPath(new URL("../../../../docs/jh/000_AWS리소스목록_JH.md", import.meta.url)),
  "utf8"
);

test("resource settings catalog exposes every priority 1 and 2 AWS inventory resource", () => {
  const catalogKeys = new Set(
    resourceCatalog.map(
      (item) => `${item.nodeDefaults.terraformBlockType ?? "resource"}/${item.nodeDefaults.type}`
    )
  );

  for (const resource of parsePriorityAwsResources(awsResourceInventorySource)) {
    assert.ok(
      catalogKeys.has(resource.key),
      `Missing resource catalog item for ${resource.displayName}`
    );
  }
});

test("priority 1 and 2 AWS inventory catalog resources use existing public icon assets", () => {
  for (const resource of parsePriorityAwsResources(awsResourceInventorySource)) {
    const catalogItem = resourceCatalog.find(
      (item) =>
        (item.nodeDefaults.terraformBlockType ?? "resource") === resource.blockType &&
        item.nodeDefaults.type === resource.resourceType
    );

    assert.ok(catalogItem, `Missing resource catalog item for ${resource.displayName}`);
    assert.equal(
      existsSync(`${publicDirectoryPath}${catalogItem.iconUrl}`),
      true,
      `${resource.displayName} icon asset should exist at ${catalogItem.iconUrl}`
    );
  }
});

test("parameter catalog exposes required and core fields for every priority 1 and 2 AWS inventory resource", () => {
  for (const resource of parsePriorityAwsResources(awsResourceInventorySource)) {
    assert.ok(
      terraformParameterCatalog.resources[resource.resourceType],
      `Missing parameter catalog resource ${resource.displayName}`
    );
  }
});

function parsePriorityAwsResources(source: string) {
  const resources: {
    readonly blockType: "data" | "resource";
    readonly displayName: string;
    readonly key: string;
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
    const blockType = isDataSource ? "data" : "resource";
    const resourceType = isDataSource ? displayName.replace(/^data\./u, "") : displayName;

    resources.push({
      blockType,
      displayName,
      key: `${blockType}/${resourceType}`,
      resourceType
    });
  }

  assert.equal(resources.length, 112);

  return resources;
}
