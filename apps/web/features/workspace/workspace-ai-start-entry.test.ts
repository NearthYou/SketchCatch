import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createWorkspaceAiStartHref } from "./workspace-ai-start-entry";

const currentDir = dirname(fileURLToPath(import.meta.url));

test("Repository AI fallback opens the pre-Board AI diagram conversation", () => {
  const href = createWorkspaceAiStartHref({
    projectId: "project 1",
    projectName: "Audience Live"
  });
  const url = new URL(href, "https://sketchcatch.local");

  assert.equal(url.pathname, "/workspace/ai");
  assert.equal(url.searchParams.get("projectId"), "project 1");
  assert.equal(url.searchParams.get("projectName"), "Audience Live");
  assert.equal(url.searchParams.has("aiChat"), false);
});

test("pre-Board AI flow saves into the existing Repository project", () => {
  const aiPageSource = readFileSync(join(currentDir, "../../app/workspace/ai/page.tsx"), "utf8");
  const aiClientSource = readFileSync(
    join(currentDir, "../../app/workspace/ai/workspace-ai-start-client.tsx"),
    "utf8"
  );
  const workflowSource = readFileSync(
    join(currentDir, "../../app/workspace/ai/use-ai-start-workflow.ts"),
    "utf8"
  );

  assert.match(aiPageSource, /existingProject=/);
  assert.match(aiClientSource, /useAiStartWorkflow\(\{ existingProject \}\)/);
  assert.match(workflowSource, /existingProjectId \?\? createdProjectId/);
  assert.match(workflowSource, /await saveProjectDraft\(\{ diagramJson: previewDiagram, projectId \}\)/);
  assert.match(workflowSource, /existingProjectReturnHref \?\? "\/workspace\/new"/);
});
