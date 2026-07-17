import assert from "node:assert/strict";
import test from "node:test";
import {
  DescribeTasksCommand,
  ListTasksCommand,
  StopTaskCommand
} from "@aws-sdk/client-ecs";
import type { DeploymentJobRecord } from "./deployment-job-service.js";
import { createEcsDeploymentWorkerDispatcher } from "./deployment-worker-dispatcher.js";

const job: DeploymentJobRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  deploymentId: "22222222-2222-4222-8222-222222222222",
  operation: "apply",
  status: "RUNNING",
  requestedByUserId: "33333333-3333-4333-8333-333333333333",
  accessContext: { kind: "user", userId: "33333333-3333-4333-8333-333333333333" },
  startedFromStatus: "PENDING",
  startedFromFailureStage: null,
  ecsTaskArn: "arn:aws:ecs:ap-northeast-2:123456789012:task/cluster/task-1",
  errorSummary: null,
  startedAt: new Date("2026-07-16T00:00:00.000Z"),
  completedAt: null,
  failedAt: null,
  cancelledAt: null,
  createdAt: new Date("2026-07-16T00:00:00.000Z"),
  updatedAt: new Date("2026-07-16T00:00:00.000Z")
};

test("ECS worker cancellation returns only after the task is confirmed STOPPED", async () => {
  const commands: unknown[] = [];
  let descriptions = 0;
  const dispatcher = createEcsDeploymentWorkerDispatcher({
    config: {
      assignPublicIp: "DISABLED",
      cluster: "worker-cluster",
      command: ["node", "dist/deployment-worker.cjs"],
      containerName: "worker",
      environment: {},
      securityGroupIds: ["sg-1"],
      subnetIds: ["subnet-1"],
      taskDefinition: "worker:1"
    },
    ecsClient: {
      async send(command) {
        commands.push(command);
        if (command instanceof StopTaskCommand) return {};
        if (command instanceof DescribeTasksCommand) {
          descriptions += 1;
          return {
            tasks: [{ lastStatus: descriptions < 3 ? "RUNNING" : "STOPPED" }]
          };
        }
        throw new Error("Unexpected ECS command");
      }
    },
    wait: async () => undefined
  });

  const result = await dispatcher.stop({ job, reason: "cancel" });

  assert.deepEqual(result, { stopped: true });
  assert.equal(commands.filter((command) => command instanceof StopTaskCommand).length, 1);
  assert.equal(descriptions, 3);
});

test("ECS worker cancellation fails closed when STOPPED cannot be confirmed", async () => {
  const dispatcher = createEcsDeploymentWorkerDispatcher({
    config: {
      assignPublicIp: "DISABLED",
      cluster: "worker-cluster",
      command: ["node", "dist/deployment-worker.cjs"],
      containerName: "worker",
      environment: {},
      securityGroupIds: ["sg-1"],
      subnetIds: ["subnet-1"],
      taskDefinition: "worker:1"
    },
    ecsClient: {
      async send(command) {
        if (command instanceof StopTaskCommand) return {};
        if (command instanceof DescribeTasksCommand) {
          return { tasks: [{ lastStatus: "RUNNING" }] };
        }
        throw new Error("Unexpected ECS command");
      }
    },
    wait: async () => undefined
  });

  const result = await dispatcher.stop({ job, reason: "cancel" });

  assert.equal(result.stopped, false);
  assert.match(result.errorSummary ?? "", /could not be verified or stopped/u);
});

test("ECS worker inspection discovers a running task by startedBy when ARN persistence was interrupted", async () => {
  const dispatcher = createEcsDeploymentWorkerDispatcher({
    config: {
      assignPublicIp: "DISABLED",
      cluster: "worker-cluster",
      command: ["node", "dist/deployment-worker.cjs"],
      containerName: "worker",
      environment: {},
      securityGroupIds: ["sg-1"],
      subnetIds: ["subnet-1"],
      taskDefinition: "worker:1"
    },
    ecsClient: {
      async send(command) {
        if (command instanceof ListTasksCommand) {
          assert.equal(command.input.startedBy, `sketchcatch:${job.id}`);
          return { taskArns: ["arn:aws:ecs:region:account:task/worker-cluster/discovered"] };
        }
        if (command instanceof DescribeTasksCommand) {
          return { tasks: [{ lastStatus: "RUNNING" }] };
        }
        throw new Error("Unexpected ECS command");
      }
    }
  });

  const result = await dispatcher.inspect({ job: { ...job, ecsTaskArn: null } });

  assert.deepEqual(result, { state: "ACTIVE", lastStatus: "RUNNING" });
});
