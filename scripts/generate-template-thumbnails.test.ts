import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  TEMPLATE_THUMBNAIL_CAPTURE_TARGETS,
  captureTemplateThumbnailBatch,
  decodeTemplateWebpDataUrl
} from "./generate-template-thumbnails";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageSource = readFileSync(join(repositoryRoot, "package.json"), "utf8");
const sampleImage = readFileSync(
  join(repositoryRoot, "apps/web/public/module-thumbnails/v1/container-runtime.webp")
);

function toDataUrl(image: Buffer): string {
  return `data:image/webp;base64,${image.toString("base64")}`;
}

test("Template thumbnail generator targets the 6 direct and 23 available Brainboard assets", () => {
  const targets = TEMPLATE_THUMBNAIL_CAPTURE_TARGETS;
  assert.equal(targets.length, 29);
  assert.equal(new Set(targets.map(({ templateId }) => templateId)).size, 29);
  assert.equal(
    targets.filter(({ relativeOutputPath }) => /^v1\/[^/]+\.webp$/.test(relativeOutputPath)).length,
    6
  );
  assert.equal(
    targets.filter(({ relativeOutputPath }) =>
      /^brainboard\/v1\/[^/]+\.webp$/.test(relativeOutputPath)
    ).length,
    23
  );
  assert.equal(
    targets.some(({ templateId }) => templateId === "brainboard-aws-instance-db-multiple-networks"),
    false
  );

  for (const { relativeOutputPath } of targets) {
    assert.equal(
      existsSync(join(repositoryRoot, "apps/web/public/template-thumbnails", relativeOutputPath)),
      true,
      relativeOutputPath
    );
  }

  assert.match(packageSource, /"template-thumbnails:generate"/);
});

test("Template thumbnail generator validates the 1280 by 720 WebP contract", () => {
  assert.deepEqual(
    decodeTemplateWebpDataUrl(toDataUrl(sampleImage), "static-web-hosting"),
    sampleImage
  );

  const wrongSizeImage = Buffer.from(sampleImage);
  wrongSizeImage.writeUIntLE(1278, 24, 3);
  assert.throws(
    () => decodeTemplateWebpDataUrl(toDataUrl(wrongSizeImage), "static-web-hosting"),
    /expected 1280 × 720, received 1279 × 720/
  );
});

test("Template thumbnail generator leaves direct and Brainboard assets untouched after a later failure", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "template-thumbnail-batch-"));
  const targets = [
    { relativeOutputPath: "v1/static-web-hosting.webp", templateId: "static-web-hosting" },
    {
      relativeOutputPath: "brainboard/v1/brainboard-aws-bastion.webp",
      templateId: "brainboard-aws-bastion"
    }
  ] as const;

  try {
    for (const target of targets) {
      const outputPath = join(temporaryDirectory, target.relativeOutputPath);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, Buffer.from(`original:${target.templateId}`));
    }

    await assert.rejects(
      captureTemplateThumbnailBatch({
        capture: async (target) => {
          if (target.templateId === "brainboard-aws-bastion") throw new Error("capture failed");
          return sampleImage;
        },
        outputDirectory: temporaryDirectory,
        targets
      }),
      /capture failed/
    );

    for (const target of targets) {
      assert.deepEqual(
        await readFile(join(temporaryDirectory, target.relativeOutputPath)),
        Buffer.from(`original:${target.templateId}`),
        `${target.templateId} final asset must not be promoted from a partial batch`
      );
    }
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});
