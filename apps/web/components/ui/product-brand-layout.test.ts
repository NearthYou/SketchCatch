import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const productBrandSource = readLocalFile("./ProductBrand.tsx");
const productBrandStyles = readLocalFile("./product-ui.module.css");

test("shared ProductBrand uses the workspace logo spacing and vertical alignment", () => {
  assert.match(productBrandSource, /src="\/sketchcatch-logo\.png"/);
  assert.match(productBrandSource, /<span>SketchCatch<\/span>/);
  assert.match(productBrandStyles, /\.brand\s*\{[\s\S]*?gap:\s*7px;/);
  assert.match(productBrandStyles, /\.brand img\s*\{[\s\S]*?transform:\s*translateY\(-2px\);/);
});

test("shared ProductBrand keeps its href as a native Link navigation", () => {
  assert.match(productBrandSource, /<Link[\s\S]*href=\{href\}/);
  assert.doesNotMatch(productBrandSource, /onClick/);
});

function readLocalFile(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}
