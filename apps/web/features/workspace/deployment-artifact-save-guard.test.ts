import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./WorkspaceRightPanel.tsx", import.meta.url), "utf8");

test("saving deployment artifacts clears the Terraform leave guard", () => {
  const start = source.indexOf("const prepareDeploymentArtifacts = useCallback");
  const end = source.indexOf("const validateTerraformForPreDeployment", start);
  const callback = source.slice(start, end);

  assert.match(callback, /setHasUnsavedTerraformChanges\(false\)/);
});
