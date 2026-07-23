import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const gallerySource = readFileSync(
  fileURLToPath(new URL("./TemplateGallery.tsx", import.meta.url)),
  "utf8"
);
const galleryStyles = readFileSync(
  fileURLToPath(new URL("./TemplateGallery.module.css", import.meta.url)),
  "utf8"
);

test("template gallery omits the tag filter and keeps search compact", () => {
  assert.doesNotMatch(gallerySource, />Tag</);
  assert.doesNotMatch(gallerySource, /Template Tag 선택/);
  assert.doesNotMatch(gallerySource, /setTag/);
  assert.doesNotMatch(gallerySource, />정렬</);
  assert.doesNotMatch(gallerySource, /SelectMenu/);
  assert.match(
    gallerySource,
    /filterBoardTemplates\(templates, \{ query, sort: "recommended", tag: "all" \}\)/
  );
  assert.match(galleryStyles, /justify-content:\s*flex-end/);
  assert.match(galleryStyles, /width:\s*min\(100%,\s*520px\)/);
});
