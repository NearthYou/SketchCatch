import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(join(currentDir, "page.tsx"), "utf8");

test("development diagram fixture page renders the real workspace without bypassing production auth", () => {
  assert.match(pageSource, /process\.env\.NODE_ENV === "production"/);
  assert.match(pageSource, /notFound\(\)/);
  assert.match(pageSource, /getWorkspaceDiagramFixture\(fixtureName\)/);
  assert.match(pageSource, /<WorkspaceDraftManager/);
  assert.doesNotMatch(pageSource, /WorkspaceAuthGate/);
});
