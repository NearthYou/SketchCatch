import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { createProjectBoardThumbnailLifecycle } from "./project-board-thumbnail-lifecycle";

const projectManagerSource = readFileSync(
  fileURLToPath(new URL("./ProjectWorkspaceDraftManager.tsx", import.meta.url)),
  "utf8"
);

test("a successful thumbnail upload publishes the project cache invalidation signal", async () => {
  const uploadedProjects: string[] = [];
  const lifecycle = createProjectBoardThumbnailLifecycle({
    captureAndUpload: async () => ({ assetId: "asset-1", status: "uploaded" }),
    onCaptureUploaded: (projectId) => uploadedProjects.push(projectId),
    projectId: "project-1"
  });

  lifecycle.setBoardElement({} as HTMLElement);
  await lifecycle.requestSavedRevision(3);

  assert.deepEqual(uploadedProjects, ["project-1"]);
  lifecycle.dispose();
});

test("Project Workspace invalidates only the uploaded project's thumbnail query", () => {
  assert.match(
    projectManagerSource,
    /onCaptureUploaded:[\s\S]*?invalidateQueries\(\{[\s\S]*?exact: true,[\s\S]*?queryKeys\.projectThumbnail\(userId, uploadedProjectId\)/
  );
});

test("a skipped thumbnail capture does not publish cache invalidation", async () => {
  const uploadedProjects: string[] = [];
  const lifecycle = createProjectBoardThumbnailLifecycle({
    captureAndUpload: async () => ({ status: "skipped" }),
    onCaptureUploaded: (projectId) => uploadedProjects.push(projectId),
    projectId: "project-1"
  });

  lifecycle.setBoardElement({} as HTMLElement);
  await assert.rejects(lifecycle.requestSavedRevision(3));

  assert.deepEqual(uploadedProjects, []);
  lifecycle.dispose();
});
