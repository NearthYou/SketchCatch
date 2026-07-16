import assert from "node:assert/strict";
import { test } from "node:test";
import type { DeploymentRepository, ProjectAccessContext } from "./deployment-service.js";
import { createDeploymentTerraformLiveLogWriter } from "./deployment-terraform-live-logs.js";

test("live Terraform logs flush before a command completes when fewer than five lines arrive", async () => {
  const appendedMessages: string[] = [];
  const repository = {
    createDeploymentLogs: async (logs: Array<{ message: string }>) => {
      appendedMessages.push(...logs.map((log) => log.message));
      return [];
    },
    findAccessibleProject: async () => ({ id: "project-id", userId: "user-id" }),
    findDeploymentById: async () => ({
      id: "deployment-id",
      projectId: "project-id"
    })
  } as unknown as DeploymentRepository;
  const accessContext: ProjectAccessContext = {
    kind: "user",
    userId: "user-id"
  };
  const writer = createDeploymentTerraformLiveLogWriter({
    accessContext,
    deploymentId: "deployment-id",
    repository,
    sequence: 1,
    stage: "apply"
  });

  await writer.onOutputLine({ line: "first line", stream: "stdout" });

  await new Promise((resolve) => setTimeout(resolve, 650));

  assert.deepEqual(appendedMessages, ["first line"]);
});
