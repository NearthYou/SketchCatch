import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createWorkspaceStartOptions,
  resolveWorkspaceStartAction
} from "./workspace-start-options";

test("createWorkspaceStartOptions makes AI and Reverse main choices and keeps blank board small", () => {
  const options = createWorkspaceStartOptions();

  assert.deepEqual(
    options.map((option) => [option.kind, option.priority]),
    [
      ["ai", "primary"],
      ["reverse", "primary"],
      ["blank", "secondary"]
    ]
  );
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
    href: "/settings?tab=aws&next=reverse"
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
    href: "/workspace?cloudPlatform=aws&projectName=%EA%B8%B0%EC%A1%B4+AWS+%EA%B0%80%EC%A0%B8%EC%98%A4%EA%B8%B0&startMode=reverse"
  });
});

test("resolveWorkspaceStartAction creates a project for AI and blank starts", () => {
  const aiAction = resolveWorkspaceStartAction({
    cloudPlatform: "aws",
    hasVerifiedAwsConnection: true,
    projectName: "AI 설계",
    startKind: "ai"
  });
  const blankAction = resolveWorkspaceStartAction({
    cloudPlatform: "aws",
    hasVerifiedAwsConnection: true,
    projectName: "빈 보드",
    startKind: "blank"
  });

  assert.deepEqual(aiAction, { kind: "createProject", openMode: "ai" });
  assert.deepEqual(blankAction, { kind: "createProject", openMode: "blank" });
});
