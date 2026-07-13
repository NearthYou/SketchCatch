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
const projectCardSource = readFileSync(
  join(currentDir, "../../components/dashboard/api-project-card.tsx"),
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
const dashboardStyles = readFileSync(
  join(currentDir, "../../components/dashboard/dashboard-content.css"),
  "utf8"
);

test("Template and Project cards consume captured raster thumbnails through one image component", () => {
  assert.match(gallerySource, /<BoardThumbnailImage[\s\S]*src=\{template\.thumbnailSrc \?\? null\}/);
  assert.match(thumbnailSource, /<BoardThumbnailImage[\s\S]*src=\{thumbnailUrl\}/);
  assert.match(projectCardSource, /<ProjectArchitectureThumbnail/);
  assert.match(legacyProjectCardSource, /<ProjectArchitectureThumbnail/);
  assert.doesNotMatch(gallerySource, /createTemplatePreviewModel|ArchitectureBoardSnapshot|<svg/);
  assert.doesNotMatch(thumbnailSource, /getProjectDraft|buildThumbnailModel|ArchitectureBoardSnapshot|<svg/);
  assert.doesNotMatch(projectCardSource, /projectPreviewNodeVpc|projectPreviewLineOne/);
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

test("compact project cards keep the captured Board above the merged dev card details", () => {
  assert.match(projectCardSource, /projectCard projectCardCompact projectCardLink/);
  assert.match(thumbnailSource, /className="projectPreview projectArchitecturePreview"/);
  assert.match(
    dashboardStyles,
    /\.projectCardCompact \.projectCardContentLink\s*\{[^}]*grid-template-columns:\s*1fr/s
  );
  assert.match(
    dashboardStyles,
    /\.projectPreview\s*\{[^}]*height:\s*150px[^}]*background-image:/s
  );
});

test("draft project cards keep the timestamp compact without rendering a draft badge", () => {
  assert.match(projectCardSource, /uiStatus !== "DRAFT"/);
  assert.match(projectCardSource, /<time className="projectCardTimestamp" dateTime=\{timestampValue\}>/);
  assert.match(
    dashboardStyles,
    /\.projectCardMeta \.dashboardIcon\s*\{[^}]*width:\s*11px[^}]*height:\s*11px/s
  );
  assert.match(
    dashboardStyles,
    /\.projectCardTimestamp\s*\{[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/s
  );
});
