import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { MODULE_THUMBNAIL_ASSETS, getModuleThumbnailAsset } from "./module-thumbnail-manifest";
import {
  createModuleThumbnailDiagram,
  serializeModuleThumbnailDiagram
} from "./module-thumbnail-diagram";
import { curatedModules } from "./module-catalog";

const currentModuleIds = curatedModules.map(({ id }) => id).sort();
const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const generatorSource = readFileSync(
  join(webRoot, "../../scripts/generate-module-thumbnails.ts"),
  "utf8"
);

test("Module thumbnail manifest binds the exact current Modules to verified versioned WebP captures", () => {
  assert.deepEqual(Object.keys(MODULE_THUMBNAIL_ASSETS).sort(), currentModuleIds);

  for (const moduleId of currentModuleIds) {
    const asset = getModuleThumbnailAsset(moduleId);
    const diagram = createModuleThumbnailDiagram(moduleId);

    assert.ok(asset, `${moduleId} manifest entry must exist`);
    const path = join(webRoot, "public", asset.src);
    assert.equal(asset.moduleId, moduleId);
    assert.equal(asset.captureVersion, 1);
    assert.match(asset.src, new RegExp(`^/module-thumbnails/v1/${moduleId}\\.webp$`));
    assert.match(asset.assetHash, /^sha256:[a-f0-9]{64}$/);
    assert.match(asset.diagramHash, /^sha256:[a-f0-9]{64}$/);
    assert.ok(existsSync(path), `${moduleId} capture must exist`);

    const image = readFileSync(path);
    assert.equal(
      asset.assetHash,
      `sha256:${createHash("sha256").update(image).digest("hex")}`,
      `${moduleId} manifest hash must bind the exact committed WebP bytes`
    );
    assert.equal(image.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(image.subarray(8, 12).toString("ascii"), "WEBP");
    assert.ok(diagram, `${moduleId} should materialize`);
    assert.equal(
      asset.diagramHash,
      `sha256:${createHash("sha256").update(serializeModuleThumbnailDiagram(diagram)).digest("hex")}`
    );
  }
});

test("Module thumbnail manifest returns null for an unknown Module", () => {
  assert.equal(getModuleThumbnailAsset("unknown-module"), null);
});

test("Module thumbnail generator exposes import-safe validation and batch seams", () => {
  assert.match(generatorSource, /export function decodeWebpDataUrl/);
  assert.match(generatorSource, /export async function captureModuleThumbnailBatch/);
  assert.match(generatorSource, /if \(isDirectExecution\(\)\)/);
});
