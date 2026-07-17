import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const skeletonSource = readSource("./WorkspaceLoadingSkeleton.tsx");
const projectManagerSource = readSource("./ProjectWorkspaceDraftManager.tsx");
const localManagerSource = readSource("./WorkspaceDraftManager.tsx");
const routeLoadingSource = readSource("../../app/workspace/loading.tsx");
const stylesSource = readSource("./workspace.module.css");

test("Workspace loading keeps the project bar, panels, and Architecture Board regions mounted", () => {
  assert.match(skeletonSource, /aria-busy="true"/);
  assert.match(skeletonSource, /data-region="project-bar"/);
  assert.match(skeletonSource, /data-region="left-panel"/);
  assert.match(skeletonSource, /data-region="architecture-board"/);
  assert.match(skeletonSource, /data-region="right-panel"/);
  assert.match(stylesSource, /\.workspaceLoadingShell\s*\{[\s\S]*?grid-template-columns:/);
});

test("Project Workspace uses the structural skeleton for every initial loading boundary", () => {
  assert.equal(projectManagerSource.match(/<WorkspaceLoadingSkeleton/g)?.length, 2);
  assert.match(projectManagerSource, /projectName=\{displayProjectName\}/);
});

test("Local Workspace uses the same structural skeleton while restoring its Draft", () => {
  assert.match(
    localManagerSource,
    /if \(loadState === "loading"\) \{[\s\S]*?<WorkspaceLoadingSkeleton/
  );
  assert.match(localManagerSource, /projectName=\{projectName\}/);
});

test("Workspace route transitions keep the structural skeleton mounted", () => {
  assert.match(routeLoadingSource, /WorkspaceLoadingSkeleton/);
  assert.match(routeLoadingSource, /Architecture Board를 불러오는 중입니다\./);
});
