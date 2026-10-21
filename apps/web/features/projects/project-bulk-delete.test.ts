import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { Project, ProjectDeletePreview } from "@sketchcatch/types";
import {
  buildBulkProjectDeletePlan,
  getBulkProjectDeleteProgress,
  type BulkProjectDeleteCandidate
} from "./project-bulk-delete";

const projectsClientSource = readFileSync(
  fileURLToPath(new URL("../../app/projects/projects-client.tsx", import.meta.url)),
  "utf8"
);

test("bulk deletion includes projects whose AWS infrastructure can be destroyed safely", () => {
  const plan = buildBulkProjectDeletePlan([
    readyCandidate("plain-project", ["delete_project"]),
    readyCandidate("deployed-project", ["delete_project_only", "destroy_then_delete"]),
    readyCandidate("running-project", []),
    failedCandidate("unavailable-project")
  ]);

  assert.deepEqual(
    plan.deletable.map((candidate) => [candidate.project.id, candidate.action]),
    [
      ["plain-project", "delete_project"],
      ["deployed-project", "destroy_then_delete"]
    ]
  );
  assert.deepEqual(
    plan.protected.map((candidate) => candidate.project.id),
    ["running-project"]
  );
  assert.deepEqual(plan.unavailable.map((candidate) => candidate.project.id), ["unavailable-project"]);
});

test("bulk deletion progress stays within the number of projects to delete", () => {
  assert.deepEqual(getBulkProjectDeleteProgress({ completedCount: 0, totalCount: 3 }), {
    currentCount: 0,
    percent: 0,
    totalCount: 3
  });
  assert.deepEqual(getBulkProjectDeleteProgress({ completedCount: 2, totalCount: 3 }), {
    currentCount: 2,
    percent: 67,
    totalCount: 3
  });
  assert.deepEqual(getBulkProjectDeleteProgress({ completedCount: 8, totalCount: 3 }), {
    currentCount: 3,
    percent: 100,
    totalCount: 3
  });
});

test("bulk deletion asks for confirmation and uses the existing project cleanup actions", () => {
  const workflowSource = getSourceBetween(
    projectsClientSource,
    "async function confirmBulkProjectDelete(): Promise<void> {",
    "function closeBulkProjectDeleteDialog(): void {"
  );
  const deletionSource = getSourceBetween(
    projectsClientSource,
    "async function deleteBulkProject(input: {",
    "async function confirmBulkProjectDelete(): Promise<void> {"
  );

  assert.match(projectsClientSource, /<span>전체 삭제<\/span>/u);
  assert.match(projectsClientSource, /<h3[^>]*>전체 프로젝트 삭제<\/h3>/u);
  assert.match(workflowSource, /await deleteBulkProject\(\{/u);
  assert.match(
    deletionSource,
    /await deleteProject\(candidate\.project\.id, "delete_project_with_managed_cleanup"\);/u
  );
  assert.match(deletionSource, /await runDeploymentDestroyPlan\(deploymentId\);/u);
  assert.match(deletionSource, /await runDeploymentDestroy\(destroyPlan\.id\);/u);
  assert.doesNotMatch(deletionSource, /delete_project_only/u);
});

function readyCandidate(
  id: string,
  availableActions: readonly ProjectDeletePreview["availableActions"][number][]
): BulkProjectDeleteCandidate {
  return {
    preview: {
      activeDeploymentCount: 0,
      activeDeploymentId: null,
      activeResourceCount: 0,
      availableActions: [...availableActions],
      hasDeploymentHistory: false,
      hasPlanHistory: false,
      latestDeploymentStatus: null,
      message: "",
      mode: "plain",
      projectId: id
    },
    project: createProject(id),
    status: "ready"
  };
}

function failedCandidate(id: string): BulkProjectDeleteCandidate {
  return {
    project: createProject(id),
    status: "unavailable"
  };
}

function createProject(id: string): Project {
  return {
    createdAt: "2026-07-24T00:00:00.000Z",
    description: null,
    id,
    name: id,
    updatedAt: "2026-07-24T00:00:00.000Z",
    userId: "user-1"
  };
}

function getSourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);

  assert.notEqual(startIndex, -1, `Missing source marker: ${start}`);
  assert.notEqual(endIndex, -1, `Missing source marker: ${end}`);

  return source.slice(startIndex, endIndex);
}
