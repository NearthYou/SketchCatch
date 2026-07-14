import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { TEMPLATE_IDS } from "../../../../packages/types/src";

import { BOARD_THUMBNAIL_CAPTURE_CONTRACT } from "../../components/architecture-board/board-thumbnail-capture-contract";
import { listRepositoryBoardTemplates } from "./template-library";
import {
  getTemplateThumbnailAsset,
  TEMPLATE_THUMBNAIL_ASSETS
} from "./template-thumbnail-manifest";

test("Template thumbnail manifest covers all six deployable templates with versioned WebP captures", () => {
  assert.deepEqual(Object.keys(TEMPLATE_THUMBNAIL_ASSETS), [...TEMPLATE_IDS]);

  for (const templateId of TEMPLATE_IDS) {
    const asset = getTemplateThumbnailAsset(templateId);

    assert.equal(asset.templateId, templateId);
    assert.equal(asset.captureVersion, BOARD_THUMBNAIL_CAPTURE_CONTRACT.version);
    assert.match(asset.diagramHash, /^[a-f\d]{64}$/u);
    assert.match(asset.src, new RegExp(`^/template-thumbnails/v\\d+/${templateId}\\.webp$`, "u"));
  }
});

test("every Template manifest entry points to a 1280x720 real WebP board capture", () => {
  for (const asset of Object.values(TEMPLATE_THUMBNAIL_ASSETS)) {
    const bytes = readFileSync(fileURLToPath(new URL(`../../public${asset.src}`, import.meta.url)));

    assert.ok(bytes.byteLength > 10_000, `${asset.templateId} capture is unexpectedly small`);
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(bytes.subarray(8, 12).toString("ascii"), "WEBP");
    assert.deepEqual(readWebpDimensions(bytes), {
      height: BOARD_THUMBNAIL_CAPTURE_CONTRACT.height,
      width: BOARD_THUMBNAIL_CAPTURE_CONTRACT.width
    });
  }
});

test("every real board capture records the exact materialized Template diagram it represents", () => {
  const templates = listRepositoryBoardTemplates();

  for (const templateId of TEMPLATE_IDS) {
    const template = templates.find((candidate) => candidate.id === templateId);

    assert.ok(template, `missing materialized Template: ${templateId}`);
    const currentDiagramHash = createHash("sha256")
      .update(JSON.stringify(template.diagramJson))
      .digest("hex");

    assert.equal(
      getTemplateThumbnailAsset(templateId).diagramHash,
      currentDiagramHash,
      `${templateId} layout changed; recapture its real Board before updating the manifest hash`
    );
  }
});

function readWebpDimensions(bytes: Buffer): { readonly height: number; readonly width: number } {
  const chunkType = bytes.subarray(12, 16).toString("ascii");

  if (chunkType === "VP8L" && bytes[20] === 0x2f) {
    const sizeBits = bytes.readUInt32LE(21);

    return {
      height: ((sizeBits >>> 14) & 0x3fff) + 1,
      width: (sizeBits & 0x3fff) + 1
    };
  }

  if (chunkType === "VP8X") {
    return {
      height: bytes.readUIntLE(27, 3) + 1,
      width: bytes.readUIntLE(24, 3) + 1
    };
  }

  if (chunkType === "VP8 " && bytes.subarray(23, 26).equals(Buffer.from([0x9d, 0x01, 0x2a]))) {
    return {
      height: bytes.readUInt16LE(28) & 0x3fff,
      width: bytes.readUInt16LE(26) & 0x3fff
    };
  }

  throw new Error(`Unsupported WebP capture encoding: ${chunkType}`);
}
