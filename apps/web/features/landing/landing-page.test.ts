import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const pageSource = readLocalFile("../../app/page.tsx");

test("root route renders the minimal shell instead of the old landing surface", () => {
  assert.match(pageSource, /RoutePlaceholder/);
  assert.match(pageSource, /href: "\/workspace\/new"/);
  assert.match(pageSource, /href: "\/workspace"/);
  assert.match(pageSource, /href: "\/login"/);
  assert.doesNotMatch(pageSource, /sketchLandingPage|sketchLandingHero|sketchLandingDevice/);
});

function readLocalFile(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}
