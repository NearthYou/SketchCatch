import assert from "node:assert/strict";
import test from "node:test";
import {
  DescribeTasksCommand,
  ListTasksCommand,
  StopTaskCommand
} from "@aws-sdk/client-ecs";
import type { DeploymentJobRecord } from "./deployment-job-service.js";
import {
  createEcsDeploymentWorkerDispatcher,
  createLocalDeploymentWorkerDispatcher
} from "./deployment-worker-dispatcher.js";

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

test("local worker dispatch survives the API process lifecycle through a detached PID", async () => {
  const spawned: Array<{
    command: string;
    args: string[];
    options: {
      detached: boolean;
      env: NodeJS.ProcessEnv;
      stdio: string;
    };
  }> = [];
  let unrefCalls = 0;
  const dispatcher = createLocalDeploymentWorkerDispatcher({
    command: "/usr/local/bin/node",
    commandArgs: ["--import", "tsx", "src/deployment-worker.ts"],
    spawnWorker(command, args, options) {
      spawned.push({ command, args, options });
      return {
        pid: 4321,
        unref() {
          unrefCalls += 1;
        }
      };
    }
  });

  const result = await dispatcher.dispatch({ job });

  assert.deepEqual(result, { taskArn: "local-process:4321" });
  assert.equal(unrefCalls, 1);
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0]?.options.detached, true);
  assert.equal(spawned[0]?.options.stdio, "ignore");
  assert.equal(spawned[0]?.options.env.SKETCHCATCH_DEPLOYMENT_JOB_ID, job.id);
  assert.equal(spawned[0]?.options.env.SKETCHCATCH_DEPLOYMENT_ID, job.deploymentId);
  assert.equal(spawned[0]?.options.env.SKETCHCATCH_DEPLOYMENT_OPERATION, job.operation);
});

test("local worker inspection and cancellation use the durable PID reference", async () => {
  const inspectedPids: number[] = [];
  const stoppedPids: number[] = [];
  let active = true;
  const dispatcher = createLocalDeploymentWorkerDispatcher({
    isProcessActive(pid) {
      inspectedPids.push(pid);
      return active;
    },
    stopProcess(pid) {
      stoppedPids.push(pid);
      active = false;
    },
    wait: async () => undefined
  });
  const localJob = { ...job, ecsTaskArn: "local-process:4321" };

  assert.deepEqual(await dispatcher.inspect({ job: localJob }), {
    state: "ACTIVE",
    lastStatus: "RUNNING"
  });
  assert.deepEqual(await dispatcher.stop({ job: localJob, reason: "cancel" }), {
    stopped: true
  });
  assert.deepEqual(inspectedPids, [4321, 4321, 4321]);
  assert.deepEqual(stoppedPids, [4321]);
});
