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

  const conflictResolutionSource = workspaceProjectClientSource.slice(
    workspaceProjectClientSource.indexOf('function resolveConflict(source: "local" | "server"): void {'),
    workspaceProjectClientSource.indexOf("  if (loadState === \"loading\")")
  );
  const conflictHydrationMatch = conflictResolutionSource.match(
    /const selectedDiagram = hydrateCatalogResourceNodes\(diagram\);/
  );

  assert.ok(
    conflictHydrationMatch,
    "The conflict-selected diagram must be hydrated before it reaches workspace state."
  );
  assert.ok(
    (conflictHydrationMatch.index ?? -1) < conflictResolutionSource.indexOf("latestDiagramRef.current = selectedDiagram"),
    "The hydrated conflict diagram must be assigned to the latest-diagram ref."
  );
  assert.ok(
    (conflictHydrationMatch.index ?? -1) < conflictResolutionSource.indexOf("setInitialDiagram(selectedDiagram)"),
    "The hydrated conflict diagram must be set as the initial diagram."
  );
});
