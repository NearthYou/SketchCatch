import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const workspaceProjectClientSource = readFileSync(
  fileURLToPath(new URL("workspace-project-client.tsx", import.meta.url)),
  "utf8"
);

test("WorkspaceProjectClient hydrates a restored draft before setting its initial diagram", () => {
  assert.match(
    workspaceProjectClientSource,
    /import \{ hydrateCatalogResourceNodes \} from "\.\.\/\.\.\/features\/resource-settings\/template-resource-materializer";/
  );

  const hydrationMatch = workspaceProjectClientSource.match(
    /const selectedDiagram = hydrateCatalogResourceNodes\(\s*restoreSavedDiagram\(loaded\.diagramJson, fallbackDiagram\)\s*\);/
  );

  assert.ok(hydrationMatch, "The restored diagram must be hydrated before it becomes selectedDiagram.");
  assert.ok(
    (hydrationMatch.index ?? -1) < workspaceProjectClientSource.indexOf("setInitialDiagram(selectedDiagram)"),
    "The hydrated diagram must be set as the initial diagram."
  );
});
