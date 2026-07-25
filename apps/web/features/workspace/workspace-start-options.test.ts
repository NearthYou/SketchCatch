import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveWorkspaceStartAction } from "../../app/workspace/new/workspace-start-options";

test("repository start opens the repository screen before creating a project", () => {
  assert.deepEqual(
    resolveWorkspaceStartAction({
      cloudPlatform: "aws",
      hasVerifiedAwsConnection: false,
      projectName: "Repository project",
      startKind: "repository"
    }),
    {
      href: "/workspace/repository?projectName=Repository+project",
      kind: "redirect"
    }
  );
});

test("workspace start cards execute directly without a separate continue button", () => {
  const source = readFileSync(
    new URL("../../app/workspace/new/workspace-start-client.tsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /onClick=\{\(\) => startWithKind\(option\.kind\)\}/);
  assert.match(source, /function startWithKind[\s\S]*?if \(!validateProjectName\(\)\)[\s\S]*?handleContinue\(kind\)/);
  assert.doesNotMatch(source, /className=\{styles\.primaryAction\}/);
  assert.doesNotMatch(source, /RepositoryUrlStartPanel/);
  assert.match(source, /onClick=\{\(\) => void handleContinue\("blank"\)\}/);
});
