import assert from "node:assert/strict";
import { test } from "node:test";

import { createWorkspaceAiStartHref } from "./workspace-ai-start-entry";

test("Repository analysis without a saved project links directly to the AI design chat", () => {
  assert.equal(
    createWorkspaceAiStartHref({
      projectId: "",
      projectName: "Audience Live Check"
    }),
    "/workspace/ai?entry=repository_analysis&projectName=Audience+Live+Check"
  );
});

test("Repository analysis from a saved project preserves that project context", () => {
  assert.equal(
    createWorkspaceAiStartHref({
      projectId: "project/audience-live-check",
      projectName: "Audience Live Check"
    }),
    "/workspace/ai?entry=repository_analysis&projectName=Audience+Live+Check&projectId=project%2Faudience-live-check"
  );
});
