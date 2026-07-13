import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { BOARD_THUMBNAIL_CAPTURE_CONTRACT } from "../../components/architecture-board/board-thumbnail-capture-contract";

const currentDir = dirname(fileURLToPath(import.meta.url));
const thumbnailSource = readFileSync(
  join(currentDir, "../../components/dashboard/project-architecture-thumbnail.tsx"),
  "utf8"
);
const gallerySource = readFileSync(
  join(currentDir, "../../components/templates/TemplateGallery.tsx"),
  "utf8"
);
const legacyProjectCardSource = readFileSync(
  join(currentDir, "../../components/dashboard/project-card.tsx"),
  "utf8"
);
const imageSource = readFileSync(
  join(currentDir, "../../components/architecture-board/BoardThumbnailImage.tsx"),
  "utf8"
);
test("Template and Project cards consume captured raster thumbnails through one image component", () => {
  assert.match(gallerySource, /<BoardThumbnailImage[\s\S]*src=\{template\.thumbnailSrc \?\? null\}/);
  assert.match(thumbnailSource, /<BoardThumbnailImage[\s\S]*src=\{thumbnailUrl\}/);
  assert.match(legacyProjectCardSource, /<ProjectArchitectureThumbnail/);
  assert.doesNotMatch(gallerySource, /createTemplatePreviewModel|ArchitectureBoardSnapshot|<svg/);
  assert.doesNotMatch(thumbnailSource, /getProjectDraft|buildThumbnailModel|ArchitectureBoardSnapshot|<svg/);
  assert.doesNotMatch(legacyProjectCardSource, /projectPreviewNodeVpc|projectPreviewLineOne/);
});

test("shared raster image keeps a fixed 16:9 contain frame and explicit loading, empty, and error states", () => {
  assert.match(imageSource, /<img/);
  assert.doesNotMatch(imageSource, /<svg|DiagramJson|nodes\.map|edges\.map/);
  assert.match(imageSource, /loading: "보드 캡처를 불러오는 중입니다\."/);
  assert.match(imageSource, /empty: "저장된 보드 캡처가 없습니다\."/);
  assert.match(imageSource, /error: "보드 캡처를 불러오지 못했습니다\."/);
  assert.equal(BOARD_THUMBNAIL_CAPTURE_CONTRACT.aspectRatio, "16 / 9");
  assert.match(imageSource, /aspectRatio:\s*BOARD_THUMBNAIL_CAPTURE_CONTRACT\.aspectRatio/);
  assert.match(imageSource, /objectFit:\s*"contain"/);
});
