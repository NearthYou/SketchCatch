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

test("template cards keep actions aligned and give descriptions the full card width", () => {
  assert.match(
    galleryStyles,
    /\.card,\s*\n\.cardSelected,\s*\n\.cardUnavailable\s*\{[^}]*display:\s*grid;[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\);/s
  );
  assert.match(
    galleryStyles,
    /\.cardBody\s*\{[^}]*grid-template-rows:\s*auto auto minmax\(0,\s*1fr\);/s
  );
  assert.match(
    galleryStyles,
    /\.cardHeading\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s
  );
  assert.match(
    galleryStyles,
    /\.cardHeading p\s*\{[^}]*word-break:\s*keep-all;[^}]*overflow-wrap:\s*break-word;/s
  );
  assert.match(
    galleryStyles,
    /\.cardHeading dl\s*\{[^}]*border:\s*1px solid #(?:dcdee0|e5e7eb);[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/s
  );
});
