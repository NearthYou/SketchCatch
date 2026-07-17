import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

function readSource(fileName: string): string {
  return readFileSync(fileURLToPath(new URL(fileName, import.meta.url)), "utf8");
}

for (const managerFile of ["ProjectWorkspaceDraftManager.tsx", "WorkspaceDraftManager.tsx"]) {
  test(`${managerFile} ignores unchanged Terraform file callbacks`, () => {
    const source = readSource(managerFile);

    assert.match(
      source,
      /const handleTerraformFilesChange[\s\S]*?areTerraformSyncFilesEqual\(\s*latestTerraformFilesRef\.current,\s*files\s*\)[\s\S]*?return;/
    );
  });
}
