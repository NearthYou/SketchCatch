import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = fileURLToPath(new URL("./", import.meta.url));
const workspaceClientPath = `${currentDir}/AiWorkspaceClient.tsx`;
const draftMetadataPanelPath = `${currentDir}/DraftMetadataPanel.tsx`;
const workspaceAiRoutePath = `${currentDir}/ai/page.tsx`;

test("workspace AI business logic remains available for the next UI", () => {
  const workspaceClientSource = readFileSync(workspaceClientPath, "utf8");

  assert.match(workspaceClientSource, /runPromptDraft|\/ai\/architecture-draft/);
  assert.match(workspaceClientSource, /DraftMetadataPanel/);
});

test("workspace draft result exposes guardrail metadata sections", () => {
  const workspaceClientSource = readFileSync(workspaceClientPath, "utf8");
  const draftMetadataPanelSource = readFileSync(draftMetadataPanelPath, "utf8");

  assert.match(workspaceClientSource, /DraftMetadataPanel/);
  assert.match(draftMetadataPanelSource, /selectedDraftPattern/);
  assert.match(draftMetadataPanelSource, /requirementFacts/);
  assert.match(draftMetadataPanelSource, /guardrailWarnings/);
});

test("AI route is now a minimal shell while the old client remains available for reconnection", () => {
  const workspaceAiRouteSource = readFileSync(workspaceAiRoutePath, "utf8");

  assert.match(workspaceAiRouteSource, /RoutePlaceholder/);
  assert.doesNotMatch(workspaceAiRouteSource, /WorkspaceAiStartClient/);
});
