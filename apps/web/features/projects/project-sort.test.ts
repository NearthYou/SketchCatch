import assert from "node:assert/strict";
import test from "node:test";
import type { Project } from "@sketchcatch/types";
import { sortProjectsByMode } from "./project-sort";

const projects: readonly Project[] = [
  createProject({
    createdAt: "2026-07-01T00:00:00.000Z",
    id: "older-created-recent-work",
    updatedAt: "2026-07-10T00:00:00.000Z"
  }),
  createProject({
    createdAt: "2026-07-09T00:00:00.000Z",
    id: "recent-created-older-work",
    updatedAt: "2026-07-09T00:00:00.000Z"
  })
];

test("sortProjectsByMode sorts by the latest work time", () => {
  const result = sortProjectsByMode(projects, "recent_work");

  assert.deepEqual(result.map((project) => project.id), [
    "older-created-recent-work",
    "recent-created-older-work"
  ]);
});

test("sortProjectsByMode sorts by the latest creation time", () => {
  const result = sortProjectsByMode(projects, "recent_created");

  assert.deepEqual(result.map((project) => project.id), [
    "recent-created-older-work",
    "older-created-recent-work"
  ]);
  assert.deepEqual(projects.map((project) => project.id), [
    "older-created-recent-work",
    "recent-created-older-work"
  ]);
});

function createProject(
  overrides: Pick<Project, "createdAt" | "id" | "updatedAt">
): Project {
  return {
    description: null,
    name: overrides.id,
    userId: "user-1",
    ...overrides
  };
}
