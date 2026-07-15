import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const pagePath = join(currentDir, "page.tsx");
const pageSource = existsSync(pagePath) ? readFileSync(pagePath, "utf8") : "";

test("compiler evidence page renders the selected source or compiled Board only outside production", () => {
  assert.match(pageSource, /process\.env\.NODE_ENV === "production"/);
  assert.match(pageSource, /notFound\(\)/);
  assert.match(pageSource, /collectArchitectureBoardCompilerEvidenceInput\(\)/);
  assert.match(pageSource, /availableTemplates\.find\(/);
  assert.match(pageSource, /candidate\.id === templateId/);
  assert.match(pageSource, /stage === "after"/);
  assert.match(pageSource, /reviewArchitectureBoardTemplate\(template\.sourceDiagram\)\.diagram/);
  assert.match(pageSource, /<WorkspaceDraftManager/);
  assert.doesNotMatch(pageSource, /WorkspaceAuthGate/);
});
