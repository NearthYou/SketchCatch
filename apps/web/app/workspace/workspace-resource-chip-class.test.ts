import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const currentDir = dirname(fileURLToPath(import.meta.url));
const workspaceClientPath = join(currentDir, "AiWorkspaceClient.tsx");
const draftMetadataPanelPath = join(currentDir, "DraftMetadataPanel.tsx");
const workspaceAiRoutePath = join(currentDir, "ai/page.tsx");
const globalsCssPath = join(currentDir, "../globals.css");

test("workspace resource chips use a class that does not inherit landing chip positioning", () => {
	const workspaceClientSource = readFileSync(workspaceClientPath, "utf8");
	const globalsCssSource = readFileSync(globalsCssPath, "utf8");
	const workspaceChipCss = globalsCssSource.match(/\.workspaceResourceChip\s*{[^}]*}/s)?.[0] ?? "";

	assert.match(workspaceClientSource, /className="workspaceResourceChip"/);
	assert.match(globalsCssSource, /\.workspaceResourceChip\s*{/);
	assert.doesNotMatch(workspaceChipCss, /position\s*:\s*absolute/);
});

test("workspace draft result exposes guardrail metadata sections", () => {
	const workspaceClientSource = readFileSync(workspaceClientPath, "utf8");
	const draftMetadataPanelSource = readFileSync(draftMetadataPanelPath, "utf8");
	const globalsCssSource = readFileSync(globalsCssPath, "utf8");

	assert.match(workspaceClientSource, /DraftMetadataPanel/);
	assert.match(draftMetadataPanelSource, /selectedScenario/);
	assert.match(draftMetadataPanelSource, /scenarioScores/);
	assert.match(draftMetadataPanelSource, /guardrailWarnings/);
	assert.match(globalsCssSource, /\.metadataBlock\s*{/);
	assert.match(globalsCssSource, /\.warningList\s*{/);
});

test("legacy workspace AI route redirects to the board workspace", () => {
	const workspaceAiRouteSource = readFileSync(workspaceAiRoutePath, "utf8");

	assert.match(workspaceAiRouteSource, /redirect\("\/workspace"\)/);
	assert.doesNotMatch(workspaceAiRouteSource, /AiWorkspaceClient/);
});
