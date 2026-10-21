import assert from "node:assert/strict";
import { test } from "node:test";

import {
  resolveWorkspaceAiExistingProject,
  resolveWorkspaceAiInitialProjectName
} from "./workspace-ai-route-entry";

test("Repository analysis without a saved project initializes the AI design chat", () => {
  assert.equal(
    resolveWorkspaceAiInitialProjectName({
      entry: "repository_analysis",
      projectName: "Audience Live Check"
    }),
    "Audience Live Check"
  );
  assert.equal(
    resolveWorkspaceAiInitialProjectName({
      projectName: "Audience Live Check"
    }),
    undefined
  );
});

test("repository entry preserves the project and repository return contract", () => {
  assert.deepEqual(
    resolveWorkspaceAiExistingProject({
      projectId: "project/a",
      projectName: "Orbit QA"
    }),
    {
      projectId: "project/a",
      projectName: "Orbit QA",
      returnHref: "/workspace/repository?projectId=project%2Fa&projectName=Orbit+QA"
    }
  );
});

test("projectId without its repository name is not treated as an existing-project entry", () => {
  assert.equal(resolveWorkspaceAiExistingProject({ projectId: "project-a" }), undefined);
});

test("entry accepts the first value from repeated query parameters", () => {
  assert.deepEqual(
    resolveWorkspaceAiExistingProject({
      projectId: ["project-a", "ignored"],
      projectName: ["Primary", "ignored"]
    }),
    {
      projectId: "project-a",
      projectName: "Primary",
      returnHref: "/workspace/repository?projectId=project-a&projectName=Primary"
    }
  );
});
