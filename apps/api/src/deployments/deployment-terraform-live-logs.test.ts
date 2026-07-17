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

test("live Terraform logs emit a heartbeat while Terraform is silent", async () => {
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
  let nowMs = 0;
  const scheduledHeartbeats: Array<() => void> = [];
  const writer = createDeploymentTerraformLiveLogWriter(
    {
      accessContext,
      deploymentId: "deployment-id",
      repository,
      sequence: 1,
      stage: "apply"
    },
    {
      clearInterval: () => undefined,
      heartbeatIntervalMs: 10_000,
      now: () => nowMs,
      setInterval: (callback) => {
        scheduledHeartbeats.push(callback);
        return {} as NodeJS.Timeout;
      }
    }
  );
  const scheduledHeartbeat = scheduledHeartbeats[0];
  assert.ok(scheduledHeartbeat);

  nowMs = 10_000;
  scheduledHeartbeat();
  nowMs = 20_000;
  scheduledHeartbeat();
  await writer.complete({
    label: "terraform apply",
    result: {
      command: ["terraform", "apply"],
      exitCode: 0,
      stderr: "",
      stdout: "",
      timedOut: false
    }
  });

  assert.deepEqual(appendedMessages, [
    "[progress] Terraform apply is still running (10s elapsed)",
    "[progress] Terraform apply is still running (20s elapsed)"
  ]);
});
