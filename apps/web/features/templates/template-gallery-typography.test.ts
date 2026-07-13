import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const rootLayoutSource = readLocalFile("../../app/layout.tsx");
const galleryStyles = readLocalFile(
  "../../components/templates/TemplateGallery.module.css"
);
const gallerySource = readLocalFile("../../components/templates/TemplateGallery.tsx");

test("template search and shared dashboard dropdowns use the bundled Pretendard font", () => {
  assert.match(
    rootLayoutSource,
    /import "pretendard\/dist\/web\/static\/pretendard-dynamic-subset\.css";/
  );
  assert.match(galleryStyles, /\.controls\s*\{[^}]*font-family:\s*var\(--font-sans\)/s);
  assert.match(
    galleryStyles,
    /\.searchField input,\s*\.searchField input::placeholder\s*\{[^}]*font-family:\s*"Pretendard"[^}]*!important/s
  );
  assert.equal(gallerySource.match(/<SelectMenu/g)?.length, 2);
  assert.equal(gallerySource.match(/tone="surface"/g)?.length, 2);
  assert.equal(gallerySource.match(/size="large"/g)?.length, 2);
  assert.doesNotMatch(gallerySource, /<select\b/);
});

test("template search control centers its icon and text within the 42px field", () => {
  assert.match(galleryStyles, /\.searchField\s*\{[^}]*display:\s*grid/s);
  assert.match(galleryStyles, /\.searchField\s*\{[^}]*align-items:\s*center/s);
  assert.match(galleryStyles, /\.searchField\s*\{[^}]*min-height:\s*42px/s);
});

function readLocalFile(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}
