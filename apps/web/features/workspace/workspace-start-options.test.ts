import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveWorkspaceStartAction } from "../../app/workspace/new/workspace-start-options";

test("repository start creates a project before opening the repository screen", () => {
  assert.deepEqual(
    resolveWorkspaceStartAction({
      cloudPlatform: "aws",
      hasVerifiedAwsConnection: false,
      projectName: "Repository project",
      startKind: "repository"
    }),
    { kind: "createRepositoryProject" }
  );
});

test("workspace start cards execute directly without a separate continue button", () => {
  const source = readFileSync(
    new URL("../../app/workspace/new/workspace-start-client.tsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /onClick=\{\(\) => startWithKind\(option\.kind\)\}/);
  assert.doesNotMatch(source, /className=\{styles\.primaryAction\}/);
  assert.doesNotMatch(source, /RepositoryUrlStartPanel/);
  assert.match(source, /onClick=\{\(\) => void handleContinue\("blank"\)\}/);
});
