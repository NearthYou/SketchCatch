import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  createWorkspaceStartOptions,
  resolveWorkspaceStartAction
} from "./workspace-start-options";

const startClientSource = readFileSync(
  fileURLToPath(new URL("workspace-start-client.tsx", import.meta.url)),
  "utf8"
);
const startPageSource = readFileSync(fileURLToPath(new URL("page.tsx", import.meta.url)), "utf8");

test("createWorkspaceStartOptions exposes three guided starts and keeps blank board small", () => {
  const options = createWorkspaceStartOptions();

  assert.deepEqual(
    options.map((option) => [option.kind, option.priority]),
    [
      ["ai", "primary"],
      ["reverse", "primary"],
      ["template", "primary"],
      ["blank", "secondary"]
    ]
  );
});

test("WorkspaceStartClient uses the rebuilt start shell without a placeholder", () => {
  assert.match(startPageSource, /WorkspaceAuthGate/);
  assert.doesNotMatch(startPageSource, /RoutePlaceholder/);
  assert.doesNotMatch(startPageSource, /designDashboardPage|designDashboardShell/);
  assert.match(startClientSource, /role="radiogroup"/);
  assert.match(startClientSource, /TemplatePicker/);
  assert.match(startClientSource, /blankStartOption/);
});

test("WorkspaceStartClient keeps Template as a real start path", () => {
  assert.match(startClientSource, /saveProjectDraft/);
  assert.match(startClientSource, /selectedTemplate\.diagramJson/);
  assert.doesNotMatch(startClientSource, /createGitHubSourceRepositoryInstallUrl/);
});

test("WorkspaceStartClient hydrates a stored form before persisting changes", () => {
  assert.match(startClientSource, /isStartFormHydrated/);
  assert.match(startClientSource, /if \(!isStartFormHydrated\) \{\s+return;/);
  assert.match(startClientSource, /setIsStartFormHydrated\(true\)/);
});

test("resolveWorkspaceStartAction sends Reverse users without a verified AWS Role to settings", () => {
  const action = resolveWorkspaceStartAction({
    cloudPlatform: "aws",
    hasVerifiedAwsConnection: false,
    projectName: "기존 AWS 가져오기",
    startKind: "reverse"
  });

  assert.deepEqual(action, {
    kind: "redirect",
    href: "/dashboard/settings?tab=aws&next=reverse"
  });
});

test("resolveWorkspaceStartAction starts Reverse without creating a project first", () => {
  const action = resolveWorkspaceStartAction({
    cloudPlatform: "aws",
    hasVerifiedAwsConnection: true,
    projectName: "기존 AWS 가져오기",
    startKind: "reverse"
  });

  assert.deepEqual(action, {
    kind: "openReversePreview",
    href: "/workspace/reverse?cloudPlatform=aws&projectName=%EA%B8%B0%EC%A1%B4+AWS+%EA%B0%80%EC%A0%B8%EC%98%A4%EA%B8%B0"
  });
});

test("resolveWorkspaceStartAction opens AI before project creation", () => {
  const aiAction = resolveWorkspaceStartAction({
    cloudPlatform: "aws",
    hasVerifiedAwsConnection: true,
    projectName: "AI 설계",
    startKind: "ai"
  });

  assert.deepEqual(aiAction, { kind: "openAiDraft", href: "/workspace/ai" });
});

test("resolveWorkspaceStartAction creates projects for blank and Template starts", () => {
  const starts = ["blank", "template"] as const;
  const actions = starts.map((startKind) =>
    resolveWorkspaceStartAction({
      cloudPlatform: "aws",
      hasVerifiedAwsConnection: true,
      projectName: startKind,
      startKind
    })
  );

  assert.deepEqual(
    actions,
    starts.map((openMode) => ({ kind: "createProject", openMode }))
  );
});
