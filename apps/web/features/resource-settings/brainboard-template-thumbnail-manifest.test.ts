import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  BRAINBOARD_TEMPLATE_IDS,
  brainboardFailedCaptureEvidence
} from "../../../../packages/types/src";
import { BOARD_THUMBNAIL_CAPTURE_CONTRACT } from "../../components/architecture-board/board-thumbnail-capture-contract";
import {
  BRAINBOARD_TEMPLATE_THUMBNAIL_ASSETS,
  getBrainboardTemplateThumbnailAsset
} from "./brainboard-template-thumbnail-manifest";
import { isBoardTemplateAvailable, listBoardTemplates } from "./template-library";

test("Brainboard thumbnail manifest covers 23 real board captures and one source preview", () => {
  assert.deepEqual(Object.keys(BRAINBOARD_TEMPLATE_THUMBNAIL_ASSETS), [...BRAINBOARD_TEMPLATE_IDS]);
  assert.equal(
    Object.values(BRAINBOARD_TEMPLATE_THUMBNAIL_ASSETS).filter(
      ({ kind }) => kind === "board-capture"
    ).length,
    23
  );

  const failed = getBrainboardTemplateThumbnailAsset(brainboardFailedCaptureEvidence.id);
  assert.equal(failed.kind, "source-preview");
  assert.equal(failed.sourcePreviewUrl, brainboardFailedCaptureEvidence.origin.previewUrl);
  assert.equal(failed.originalWidth, brainboardFailedCaptureEvidence.origin.previewWidth);
  assert.equal(failed.originalHeight, brainboardFailedCaptureEvidence.origin.previewHeight);
});

test("Brainboard thumbnail assets are local WebP files with evidence-specific dimensions", () => {
  for (const asset of Object.values(BRAINBOARD_TEMPLATE_THUMBNAIL_ASSETS)) {
    const bytes = readFileSync(fileURLToPath(new URL(`../../public${asset.src}`, import.meta.url)));

    assert.ok(bytes.byteLength > 10_000, `${asset.templateId} thumbnail is unexpectedly small`);
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(bytes.subarray(8, 12).toString("ascii"), "WEBP");
    assert.deepEqual(
      readWebpDimensions(bytes),
      asset.kind === "board-capture"
        ? {
            height: BOARD_THUMBNAIL_CAPTURE_CONTRACT.height,
            width: BOARD_THUMBNAIL_CAPTURE_CONTRACT.width
          }
        : { height: asset.originalHeight, width: asset.originalWidth },
      asset.templateId
    );
  }
});

test("every board capture records the exact materialized Brainboard diagram it represents", () => {
  const templates = listBoardTemplates();

  for (const asset of Object.values(BRAINBOARD_TEMPLATE_THUMBNAIL_ASSETS)) {
    if (asset.kind !== "board-capture") continue;

    const template = templates.find(({ id }) => id === asset.templateId);
    assert.ok(template && isBoardTemplateAvailable(template), asset.templateId);
    assert.equal(
      createHash("sha256").update(JSON.stringify(template.diagramJson)).digest("hex"),
      asset.diagramHash,
      `${asset.templateId} changed; recapture its real Board before updating the hash`
    );
  }
});

function readWebpDimensions(bytes: Buffer): { readonly height: number; readonly width: number } {
  const chunkType = bytes.subarray(12, 16).toString("ascii");

  if (chunkType === "VP8L" && bytes[20] === 0x2f) {
    const sizeBits = bytes.readUInt32LE(21);
    return { height: ((sizeBits >>> 14) & 0x3fff) + 1, width: (sizeBits & 0x3fff) + 1 };
  }

  if (chunkType === "VP8X") {
    return { height: bytes.readUIntLE(27, 3) + 1, width: bytes.readUIntLE(24, 3) + 1 };
  }

  if (chunkType === "VP8 " && bytes.subarray(23, 26).equals(Buffer.from([0x9d, 0x01, 0x2a]))) {
    return { height: bytes.readUInt16LE(28) & 0x3fff, width: bytes.readUInt16LE(26) & 0x3fff };
  }

  throw new Error(`Unsupported WebP capture encoding: ${chunkType}`);
}
