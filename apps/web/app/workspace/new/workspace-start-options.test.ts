import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveWorkspaceStartAction } from "./workspace-start-options";

test("Repository 시작은 프로젝트를 만들지 않고 분석 화면으로 이동한다", () => {
  const action = resolveWorkspaceStartAction({
    cloudPlatform: "aws",
    hasVerifiedAwsConnection: false,
    projectName: "Repository Draft",
    startKind: "repository"
  });

  assert.deepEqual(action, {
    kind: "redirect",
    href: "/workspace/repository?projectName=Repository+Draft"
  });
});
