import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(join(currentDir, "page.tsx"), "utf8");

test("Settings page isolates the search-param client screen behind a Suspense boundary", () => {
  assert.match(pageSource, /import\s*\{\s*Suspense\s*\}\s*from\s*"react"/);
  assert.match(
    pageSource,
    /<Suspense[\s\S]*?<SettingsDashboardClient\s*\/>[\s\S]*?<\/Suspense>/
  );
});
