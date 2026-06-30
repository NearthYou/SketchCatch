import { test } from "node:test";
import assert from "node:assert/strict";
import type { Project } from "../../../../packages/types/src";
import { filterProjectsByName } from "./project-search";

const projects: Project[] = [
  createProject("project-1", "SketchCatch API"),
  createProject("project-2", "VPC Network Demo"),
  createProject("project-3", "스케치캐치 형")
];

test("filterProjectsByName returns all projects for an empty search query", () => {
  assert.deepEqual(
    filterProjectsByName(projects, "").map((project) => project.id),
    ["project-1", "project-2", "project-3"]
  );
});

test("filterProjectsByName matches project title substrings case-insensitively", () => {
  assert.deepEqual(
    filterProjectsByName(projects, "api").map((project) => project.id),
    ["project-1"]
  );
});

test("filterProjectsByName supports Korean title substrings", () => {
  assert.deepEqual(
    filterProjectsByName(projects, "캐치").map((project) => project.id),
    ["project-3"]
  );
});

function createProject(id: string, name: string): Project {
  return {
    createdAt: "2026-06-24T01:00:00.000Z",
    description: null,
    id,
    name,
    updatedAt: "2026-06-24T02:00:00.000Z",
    userId: "user-1"
  };
}
