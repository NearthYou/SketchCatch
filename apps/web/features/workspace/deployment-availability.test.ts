import assert from "node:assert/strict";
import { test } from "node:test";
import { canLoadDeploymentData } from "./deployment-availability";

test("project workspaces may load Deployment data", () => {
  assert.equal(canLoadDeploymentData("enabled"), true);
});

test("Local workspace never loads Deployment data", () => {
  assert.equal(canLoadDeploymentData("project_required"), false);
});
