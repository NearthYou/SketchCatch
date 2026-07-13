import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const rootLayoutSource = readLocalFile("../../app/layout.tsx");
const galleryStyles = readLocalFile(
  "../../components/templates/TemplateGallery.module.css"
);

test("template search and dropdown controls use the bundled Pretendard font", () => {
  assert.match(
    rootLayoutSource,
    /import "pretendard\/dist\/web\/static\/pretendard-dynamic-subset\.css";/
  );
  assert.match(galleryStyles, /\.controls\s*\{[^}]*font-family:\s*var\(--font-sans\)/s);
  assert.match(
    galleryStyles,
    /\.searchField input,\s*\.selectField select,\s*\.selectField option\s*\{[^}]*font-family:\s*var\(--font-sans\)/s
  );
});

function readLocalFile(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}
