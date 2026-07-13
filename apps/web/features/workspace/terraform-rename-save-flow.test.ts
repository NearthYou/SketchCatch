import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const terraformCodePanelSource = readFileSync(
  new URL("./TerraformCodePanel.tsx", import.meta.url),
  "utf8"
);

test("Terraform save rewrites rename references before final validation and sync", () => {
  assert.match(
    terraformCodePanelSource,
    /rewriteTerraformReferencesForSyncProposals/
  );
  assert.match(
    terraformCodePanelSource,
    /const rewrittenTerraformFiles = rewriteTerraformReferencesForSyncProposals\(/
  );
  assert.match(
    terraformCodePanelSource,
    /validateTerraformVirtualFiles\(\{[\s\S]*?files: rewrittenTerraformFiles[\s\S]*?\}\)/
  );
  assert.match(
    terraformCodePanelSource,
    /syncTerraformToDiagram\(\{[\s\S]*?terraformFiles: toTerraformValidationFiles\(rewrittenTerraformFiles\)[\s\S]*?\}\)/
  );
  assert.match(terraformCodePanelSource, /setTerraformFiles\(rewrittenTerraformFiles\)/);
});
