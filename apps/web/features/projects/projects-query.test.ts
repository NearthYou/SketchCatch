import assert from "node:assert/strict";
import test from "node:test";
import type { Project } from "@sketchcatch/types";
import { removeProjectFromQueryData } from "./projects-query";

const firstProject = makeProject("project-1");
const secondProject = makeProject("project-2");

test("removing a project updates the cached list and deployment lookup together", () => {
  const result = removeProjectFromQueryData(
    {
      deploymentStatusByProjectId: {
        [firstProject.id]: true,
        [secondProject.id]: false
      },
      projects: [firstProject, secondProject]
    },
    firstProject.id
  );

  assert.deepEqual(result.projects, [secondProject]);
  assert.deepEqual(result.deploymentStatusByProjectId, {
    [secondProject.id]: false
  });
});

function makeProject(id: string): Project {
  return {
    id,
    userId: "user-1",
    name: id,
    description: null,
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z"
  };
}
