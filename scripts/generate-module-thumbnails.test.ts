import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { captureModuleThumbnailBatch, decodeWebpDataUrl } from "./generate-module-thumbnails";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sampleModuleId = "container-image-delivery";
const sampleImage = readFileSync(
  join(repositoryRoot, `apps/web/public/module-thumbnails/v1/${sampleModuleId}.webp`)
);

function toDataUrl(image: Buffer): string {
  return `data:image/webp;base64,${image.toString("base64")}`;
}

test("Module thumbnail generator rejects ready WebPs that are not exactly 1280 × 720", () => {
  assert.deepEqual(decodeWebpDataUrl(toDataUrl(sampleImage), sampleModuleId), sampleImage);

  for (const [width, height] of [
    [1279, 720],
    [1280, 719]
  ] as const) {
    const wrongSizeImage = Buffer.from(sampleImage);
    wrongSizeImage.writeUIntLE(width - 1, 24, 3);
    wrongSizeImage.writeUIntLE(height - 1, 27, 3);

    assert.throws(
      () => decodeWebpDataUrl(toDataUrl(wrongSizeImage), sampleModuleId),
      new RegExp(`expected 1280 × 720, received ${width} × ${height}`)
    );
  }
});

test("Module thumbnail generator leaves every final asset untouched when a later capture fails", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "module-thumbnail-batch-"));
  const moduleIds = ["container-image-delivery", "container-runtime"] as const;
  const originalImages = new Map(
    moduleIds.map((moduleId) => [moduleId, Buffer.from(`original:${moduleId}`)] as const)
  );

  try {
    for (const moduleId of moduleIds) {
      await writeFile(join(temporaryDirectory, `${moduleId}.webp`), originalImages.get(moduleId)!);
    }

    await assert.rejects(
      captureModuleThumbnailBatch({
        capture: async (moduleId) => {
          if (moduleId === "container-runtime") throw new Error("capture failed");
          return sampleImage;
        },
        moduleIds,
        outputDirectory: temporaryDirectory
      }),
      /capture failed/
    );

    for (const moduleId of moduleIds) {
      assert.deepEqual(
        await readFile(join(temporaryDirectory, `${moduleId}.webp`)),
        originalImages.get(moduleId),
        `${moduleId} final asset must not be promoted from a partial batch`
      );
    }
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});
