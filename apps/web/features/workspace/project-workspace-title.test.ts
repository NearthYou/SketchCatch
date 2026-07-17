import assert from "node:assert/strict";
import test from "node:test";
import {
  loadProjectWorkspaceTitle,
  resolveProjectWorkspaceTitle
} from "./project-workspace-title";

test("project workspace title prefers the saved project name", () => {
  assert.equal(resolveProjectWorkspaceTitle("  예약 서비스 API  "), "예약 서비스 API");
});

test("project workspace title uses a screen-specific fallback instead of an internal placeholder", () => {
  assert.equal(resolveProjectWorkspaceTitle(undefined), "프로젝트 보드");
  assert.equal(resolveProjectWorkspaceTitle("   "), "프로젝트 보드");
  assert.notEqual(resolveProjectWorkspaceTitle(undefined), "Project workspace");
});

test("saved project metadata replaces an unreliable workspace URL title", async () => {
  assert.equal(
    await loadProjectWorkspaceTitle({
      fallbackProjectName: "Wrong query title",
      loadProject: async () => ({ name: "Saved project title" })
    }),
    "Saved project title"
  );
  assert.equal(
    await loadProjectWorkspaceTitle({
      fallbackProjectName: "URL title",
      loadProject: async () => {
        throw new Error("metadata unavailable");
      }
    }),
    "URL title"
  );
});
