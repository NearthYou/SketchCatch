import { test } from "node:test";
import assert from "node:assert/strict";
import type { ProjectDeletePreview } from "@sketchcatch/types";
import { getProjectActionMenuItems } from "./project-action-menu";

test("getProjectActionMenuItems shows resource and project-only delete choices when resources are active", () => {
  const items = getProjectActionMenuItems(
    createPreview({
      activeResourceCount: 3,
      availableActions: ["destroy_then_delete", "delete_project_only"],
      mode: "active_resources"
    })
  );

  assert.deepEqual(
    items.map((item) => item.label),
    ["리소스 포함 삭제", "프로젝트만 삭제", "수정"]
  );
  assert.deepEqual(
    items.map((item) => item.kind),
    ["destroy_then_delete", "delete_project_only", "edit"]
  );
  assert.equal(items.every((item) => !item.disabled), true);
});

test("getProjectActionMenuItems hides resource delete when no resources are active", () => {
  const items = getProjectActionMenuItems(
    createPreview({
      activeResourceCount: 0,
      availableActions: ["delete_project"],
      mode: "plain"
    })
  );

  assert.deepEqual(
    items.map((item) => item.label),
    ["프로젝트 삭제", "수정"]
  );
  assert.deepEqual(
    items.map((item) => item.kind),
    ["delete_project", "edit"]
  );
});

test("getProjectActionMenuItems keeps cleanup choices for active state without counted resources", () => {
  const items = getProjectActionMenuItems(
    createPreview({
      activeResourceCount: 0,
      availableActions: ["destroy_then_delete", "delete_project_only"],
      mode: "active_resources"
    })
  );

  assert.deepEqual(
    items.map((item) => item.kind),
    ["destroy_then_delete", "delete_project_only", "edit"]
  );
  assert.equal(items.every((item) => !item.disabled), true);
});

function createPreview(
  overrides: Pick<ProjectDeletePreview, "activeResourceCount" | "availableActions" | "mode">
): ProjectDeletePreview {
  return {
    activeDeploymentCount: overrides.activeResourceCount > 0 ? 1 : 0,
    activeDeploymentId: overrides.activeResourceCount > 0 ? "deployment-1" : null,
    activeResourceCount: overrides.activeResourceCount,
    availableActions: overrides.availableActions,
    hasDeploymentHistory: overrides.mode !== "plain",
    hasPlanHistory: false,
    latestDeploymentStatus: overrides.activeResourceCount > 0 ? "SUCCESS" : null,
    message: "preview",
    mode: overrides.mode,
    projectId: "project-1"
  };
}
