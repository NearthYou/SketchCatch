import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const templatesClientSource = readLocalFile("templates-client.tsx");

test("templates page reads the same board template library used by the workspace modal", () => {
  assert.match(templatesClientSource, /listBoardTemplates/);
  assert.doesNotMatch(templatesClientSource, /marketplaceTemplates/);
});

function readLocalFile(fileName: string): string {
  return readFileSync(fileURLToPath(new URL(fileName, import.meta.url)), "utf8");
}
