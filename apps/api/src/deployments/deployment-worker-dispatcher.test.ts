import { test } from "node:test";
import assert from "node:assert/strict";
import { DescribeTasksCommand, RunTaskCommand, StopTaskCommand } from "@aws-sdk/client-ecs";
import type { EcsWorkerDispatcherConfig } from "../config/env.js";
import type { DeploymentJobRecord } from "./deployment-job-service.js";
import { createEcsDeploymentWorkerDispatcher } from "./deployment-worker-dispatcher.js";

const deploymentId = "44444444-4444-4444-8444-444444444444";
const jobId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userId = "55555555-5555-4555-8555-555555555555";
const taskArn =
  "arn:aws:ecs:ap-northeast-2:555980271919:task/sketchcatch-production-worker/task-id";
const fixedNow = new Date("2026-01-01T00:00:00.000Z");

const config: EcsWorkerDispatcherConfig = {
  assignPublicIp: "DISABLED",
  cluster: "sketchcatch-production-cluster",
  command: ["node", "dist/worker.cjs"],
  containerName: "worker",
  environment: {
    NODE_ENV: "production"
  },
  securityGroupIds: ["sg-123"],
  subnetIds: ["subnet-123"],
  taskDefinition: "sketchcatch-production-worker:1"
};

test("createEcsDeploymentWorkerDispatcher runs a tagged Fargate task with worker overrides", async () => {
  const sentCommands: unknown[] = [];
  const dispatcher = createEcsDeploymentWorkerDispatcher({
    config,
    ecsClient: {
      async send(command) {
        sentCommands.push(command);
        return {
          tasks: [{ taskArn }]
        };
      }
    }
  });

  const result = await dispatcher.dispatch({ job: createJobRecord() });

  assert.equal(result.taskArn, taskArn);
  assert.equal(sentCommands.length, 1);
  const command = sentCommands[0];
  assert.equal(command instanceof RunTaskCommand, true);
  const input = (command as RunTaskCommand).input;
  assert.equal(input.launchType, "FARGATE");
  assert.equal(input.cluster, config.cluster);
  assert.equal(input.taskDefinition, config.taskDefinition);
  assert.equal(input.networkConfiguration?.awsvpcConfiguration?.assignPublicIp, "DISABLED");
  assert.deepEqual(input.networkConfiguration?.awsvpcConfiguration?.subnets, ["subnet-123"]);
  assert.deepEqual(input.overrides?.containerOverrides?.[0]?.command, config.command);
  assert.deepEqual(input.overrides?.containerOverrides?.[0]?.environment, [
    { name: "NODE_ENV", value: "production" },
    { name: "SKETCHCATCH_DEPLOYMENT_ID", value: deploymentId },
    { name: "SKETCHCATCH_DEPLOYMENT_JOB_ID", value: jobId },
    { name: "SKETCHCATCH_DEPLOYMENT_OPERATION", value: "apply" }
  ]);
});

test("createEcsDeploymentWorkerDispatcher stops an active task after describing it", async () => {
  const sentCommands: unknown[] = [];
  const dispatcher = createEcsDeploymentWorkerDispatcher({
    config,
    ecsClient: {
      async send(command) {
        sentCommands.push(command);

        if (command instanceof DescribeTasksCommand) {
          return {
            tasks: [{ taskArn, lastStatus: "RUNNING" }]
          };
        }

        return {};
      }
    }
  });

  const result = await dispatcher.stop({
    job: createJobRecord({ ecsTaskArn: taskArn }),
    reason: "test cancellation"
  });

  assert.equal(result.stopped, true);
  assert.equal(sentCommands[0] instanceof DescribeTasksCommand, true);
  assert.equal(sentCommands[1] instanceof StopTaskCommand, true);
  assert.equal((sentCommands[1] as StopTaskCommand).input.task, taskArn);
});

test("createEcsDeploymentWorkerDispatcher reports no stop when task is missing", async () => {
  const sentCommands: unknown[] = [];
  const dispatcher = createEcsDeploymentWorkerDispatcher({
    config,
    ecsClient: {
      async send(command) {
        sentCommands.push(command);
        return {
          tasks: []
        };
      }
    }
  });

  const result = await dispatcher.stop({
    job: createJobRecord({ ecsTaskArn: taskArn }),
    reason: "test cancellation"
  });

  assert.equal(result.stopped, false);
  assert.equal(sentCommands.length, 1);
  assert.equal(sentCommands[0] instanceof DescribeTasksCommand, true);
});

function createJobRecord(overrides: Partial<DeploymentJobRecord> = {}): DeploymentJobRecord {
  return {
    id: jobId,
    deploymentId,
    operation: "apply",
    status: "RUNNING",
    requestedByUserId: userId,
    accessContext: {
      kind: "user",
      userId
    },
    startedFromStatus: "PENDING",
    startedFromFailureStage: null,
    ecsTaskArn: null,
    errorSummary: null,
    startedAt: fixedNow,
    completedAt: null,
    failedAt: null,
    cancelledAt: null,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    ...overrides
  };
}
