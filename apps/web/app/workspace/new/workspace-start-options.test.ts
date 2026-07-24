import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveWorkspaceStartAction } from "./workspace-start-options";

test("검증된 AWS 연결은 Project를 만들지 않고 Reverse 미리보기로 이동한다", () => {
  const action = resolveWorkspaceStartAction({
    cloudPlatform: "aws",
    hasVerifiedAwsConnection: true,
    projectName: "기존 인프라",
    startKind: "reverse"
  });

  assert.equal(action.kind, "openReversePreview");
  assert.equal(
    action.kind === "openReversePreview" ? action.href : null,
    "/workspace/reverse?cloudPlatform=aws&projectName=%EA%B8%B0%EC%A1%B4+%EC%9D%B8%ED%94%84%EB%9D%BC"
  );
});

test("AWS 연결이 없으면 Reverse 화면 대신 기존 설정 승인 흐름으로 이동한다", () => {
  const action = resolveWorkspaceStartAction({
    cloudPlatform: "aws",
    hasVerifiedAwsConnection: false,
    projectName: "기존 인프라",
    startKind: "reverse"
  });

  assert.deepEqual(action, {
    href: "/dashboard/settings?tab=aws&next=reverse",
    kind: "redirect"
  });
});

test("Repository 시작은 프로젝트를 만들지 않고 분석 화면으로 이동한다", () => {
  const action = resolveWorkspaceStartAction({
    cloudPlatform: "aws",
    hasVerifiedAwsConnection: false,
    projectName: "Repository Draft",
    startKind: "repository"
  });

  assert.deepEqual(action, {
    href: "/workspace/repository?projectName=Repository+Draft",
    kind: "redirect"
  });
});
