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
const startStylesSource = readFileSync(
  fileURLToPath(new URL("workspace-start.module.css", import.meta.url)),
  "utf8"
);

test("createWorkspaceStartOptions exposes four guided starts and keeps blank board small", () => {
  const options = createWorkspaceStartOptions();

  assert.deepEqual(
    options.map((option) => [option.kind, option.priority]),
    [
      ["ai", "primary"],
      ["reverse", "primary"],
      ["template", "primary"],
      ["repository", "primary"],
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

test("WorkspaceStartClient keeps Template and GitHub URL as real start paths", () => {
  assert.match(startClientSource, /saveProjectDraft/);
  assert.match(startClientSource, /selectedTemplate\.diagramJson/);
  assert.match(startClientSource, /RepositoryUrlStartPanel/);
  assert.match(startClientSource, /https:\/\/github\.com\/owner\/repository/);
  assert.match(startClientSource, /workspace\/repository/);
  assert.doesNotMatch(startClientSource, /analyzePublicSourceRepository/);
});

test("WorkspaceStartClient shows Repository URL analysis before the primary action", () => {
  assert.ok(
    startClientSource.indexOf("<RepositoryUrlStartPanel") <
      startClientSource.indexOf(`<div className={styles.actions}>`)
  );
});

test("WorkspaceStartClient hydrates a stored form before persisting changes", () => {
  assert.match(startClientSource, /isStartFormHydrated/);
  assert.match(startClientSource, /if \(!isStartFormHydrated\) \{\s+return;/);
  assert.match(startClientSource, /setIsStartFormHydrated\(true\)/);
});

test("WorkspaceStartClient shows an inline project-name error after an empty submission", () => {
  assert.match(startClientSource, /const \[projectNameError, setProjectNameError\]/);
  assert.match(startClientSource, /setProjectNameError\("프로젝트 이름을 입력해주세요\."\)/);
  assert.match(startClientSource, /aria-invalid=\{Boolean\(projectNameError\)\}/);
  assert.match(startClientSource, /aria-describedby=\{projectNameError \? "workspace-title-error" : undefined\}/);
  assert.match(startClientSource, /id="workspace-title-error"/);
  assert.doesNotMatch(startClientSource, /const canContinue =\s+title\.trim\(\)\.length > 0/);
  assert.match(startStylesSource, /\.nameFieldError input/);
  assert.match(startStylesSource, /\.fieldError/);
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

test("resolveWorkspaceStartAction opens Repository starts as an inline URL form", () => {
  const action = resolveWorkspaceStartAction({
    cloudPlatform: "aws",
    hasVerifiedAwsConnection: true,
    projectName: "repository",
    startKind: "repository"
  });

  assert.deepEqual(action, { kind: "showRepositoryUrlForm" });
});
