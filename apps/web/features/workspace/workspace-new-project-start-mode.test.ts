import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const workspaceStartClientSource = readAppWorkspaceFile("new/workspace-start-client.tsx");
const workspaceAiRouteSource = readAppWorkspaceFile("ai/page.tsx");
const workspaceAiStartClientSource = readAppWorkspaceFile("ai/workspace-ai-start-client.tsx");
const browserVoiceInputSource = readFeatureWorkspaceFile("use-browser-voice-input.ts");

test("new project start keeps the three start modes and core API calls", () => {
  assert.match(workspaceStartClientSource, /createWorkspaceStartOptions/);
  assert.match(workspaceStartClientSource, /startModeLabels/);
  assert.match(workspaceStartClientSource, /ai: "AI"/);
  assert.match(workspaceStartClientSource, /reverse: "\\uB9AC\\uBC84\\uC2A4"/);
  assert.match(workspaceStartClientSource, /blank: "\\uBE48\\uBCF4\\uB4DC"/);
  assert.match(workspaceStartClientSource, /router\.push\("\/workspace\/ai"\)/);
  assert.match(workspaceStartClientSource, /listAwsConnections/);
  assert.match(workspaceStartClientSource, /resolveWorkspaceStartAction/);
  assert.match(workspaceStartClientSource, /createProject/);
  assert.doesNotMatch(workspaceStartClientSource, /workspaceStartProviderGrid/);
});

test("AI route is a minimal shell while its implementation stays available for reconnection", () => {
  assert.match(workspaceAiRouteSource, /RoutePlaceholder/);
  assert.doesNotMatch(workspaceAiRouteSource, /WorkspaceAiStartClient/);
});

test("AI implementation keeps ArchitectureJson conversion, approval persistence, and voice input", () => {
  assert.match(workspaceAiStartClientSource, /convertArchitectureJsonToDiagramJson/);
  assert.match(workspaceAiStartClientSource, /saveProjectDraft/);
  assert.match(workspaceAiStartClientSource, /createdProjectId/);
  assert.match(workspaceAiStartClientSource, /COPY\.approve/);
  assert.match(workspaceAiStartClientSource, /COPY\.cancel/);
  assert.match(workspaceAiStartClientSource, /useBrowserVoiceInput/);
  assert.match(browserVoiceInputSource, /SpeechRecognition/);
  assert.match(browserVoiceInputSource, /ko-KR/);
});

test("AI implementation keeps prompt guardrails and patch preview flow", () => {
  const submitPromptBody = workspaceAiStartClientSource.slice(
    workspaceAiStartClientSource.indexOf("async function submitPrompt"),
    workspaceAiStartClientSource.indexOf("async function handleDraftClarificationMessage")
  );
  const classificationIndex = submitPromptBody.indexOf("classifyWorkspaceAiChatPrompt(trimmedPrompt)");
  const draftIndex = submitPromptBody.indexOf("await createDraftFromRequest");

  assert.match(workspaceAiStartClientSource, /classifyWorkspaceAiChatPrompt/);
  assert.match(workspaceAiStartClientSource, /createAiArchitecturePatchPreview/);
  assert.ok(classificationIndex >= 0);
  assert.ok(classificationIndex < draftIndex);
});

function readAppWorkspaceFile(fileName: string): string {
  return readFileSync(fileURLToPath(new URL(`../../app/workspace/${fileName}`, import.meta.url)), "utf8");
}

function readFeatureWorkspaceFile(fileName: string): string {
  return readFileSync(fileURLToPath(new URL(fileName, import.meta.url)), "utf8");
}
