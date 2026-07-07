import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const workspaceStartClientSource = readAppWorkspaceFile("new/workspace-start-client.tsx");
const workspaceAiRouteSource = readAppWorkspaceFile("ai/page.tsx");
const workspaceAiStartClientSource = readAppWorkspaceFile("ai/workspace-ai-start-client.tsx");
const globalStylesSource = readAppFile("globals.css");

test("new project start removes cloud platform selection and exposes start modes", () => {
  assert.match(workspaceStartClientSource, /type WorkspaceStartKind/);
  assert.match(workspaceStartClientSource, /createWorkspaceStartOptions/);
  assert.match(workspaceStartClientSource, /startModeLabels/);
  assert.match(workspaceStartClientSource, /ai: "AI"/);
  assert.match(workspaceStartClientSource, /reverse: "\\uB9AC\\uBC84\\uC2A4"/);
  assert.match(workspaceStartClientSource, /blank: "\\uBE48\\uBCF4\\uB4DC"/);
  assert.match(workspaceStartClientSource, /const canChooseStartMode = title\.trim\(\)\.length > 0/);
  assert.match(workspaceStartClientSource, /writeAiStartDraft/);
  assert.match(workspaceStartClientSource, /try \{\s+window\.sessionStorage\.setItem/s);
  assert.match(workspaceStartClientSource, /Failed to write AI start draft to sessionStorage/);
  assert.match(workspaceStartClientSource, /router\.push\("\/workspace\/ai"\)/);
  assert.match(workspaceStartClientSource, /listAwsConnections/);
  assert.match(workspaceStartClientSource, /resolveWorkspaceStartAction/);
  assert.match(workspaceStartClientSource, /startKind: "reverse"/);
  assert.match(workspaceStartClientSource, /createProject/);
  assert.doesNotMatch(workspaceStartClientSource, />\\u[0-9A-Fa-f]{4}/);
  assert.doesNotMatch(workspaceStartClientSource, /="\\u[0-9A-Fa-f]{4}/);
  assert.doesNotMatch(workspaceStartClientSource, /cloudPlatformOptions/);
  assert.doesNotMatch(workspaceStartClientSource, /workspaceStartProviderGrid/);
});

test("AI start route opens the full screen AI draft page", () => {
  assert.match(workspaceAiRouteSource, /WorkspaceAiStartClient/);
  assert.doesNotMatch(workspaceAiRouteSource, /redirect\("\/workspace"\)/);
  assert.match(globalStylesSource, /\.workspaceAiStartShell/);
  assert.match(globalStylesSource, /\.workspaceAiStartPanel/);
});

test("AI start page previews real diagram data and persists approval into the board", () => {
  assert.match(workspaceAiStartClientSource, /convertArchitectureJsonToDiagramJson/);
  assert.match(workspaceAiStartClientSource, /MiniDiagramPreview/);
  assert.match(workspaceAiStartClientSource, /transcriptRef/);
  assert.match(workspaceAiStartClientSource, /scrollTranscriptToBottom/);
  assert.match(workspaceAiStartClientSource, /handleComposerKeyDown/);
  assert.match(workspaceAiStartClientSource, /event\.key !== "Enter"/);
  assert.match(workspaceAiStartClientSource, /diagram\.nodes\.map/);
  assert.match(workspaceAiStartClientSource, /diagram\.edges\.map/);
  assert.match(workspaceAiStartClientSource, /<image/);
  assert.doesNotMatch(workspaceAiStartClientSource, /<text[\s>]/);
  assert.match(workspaceAiStartClientSource, /saveProjectDraft/);
  assert.match(workspaceAiStartClientSource, /createdProjectId/);
  assert.match(workspaceAiStartClientSource, /setCreatedProjectId\(project\.id\)/);
  assert.match(workspaceAiStartClientSource, /let activeProjectId = createdProjectId/);
  assert.match(workspaceAiStartClientSource, /createWorkspaceAiChatStorageKey/);
  assert.match(workspaceAiStartClientSource, /storeApprovedChatHistory/);
  assert.match(workspaceAiStartClientSource, /try \{\s+window\.localStorage\.setItem/s);
  assert.match(workspaceAiStartClientSource, /Failed to store approved chat history to localStorage/);
  assert.match(workspaceAiStartClientSource, /COPY\.approve/);
  assert.match(workspaceAiStartClientSource, /COPY\.cancel/);
  assert.match(workspaceAiStartClientSource, /COPY\.regenerate/);
  assert.match(globalStylesSource, /\.workspaceStartForm \.textInput:focus/);
});

function readAppWorkspaceFile(fileName: string): string {
  return readFileSync(fileURLToPath(new URL(`../../app/workspace/${fileName}`, import.meta.url)), "utf8");
}

function readAppFile(fileName: string): string {
  return readFileSync(fileURLToPath(new URL(`../../app/${fileName}`, import.meta.url)), "utf8");
}
