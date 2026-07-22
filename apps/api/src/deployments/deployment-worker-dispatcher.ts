import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  DescribeTasksCommand,
  ECSClient,
  ListTasksCommand,
  RunTaskCommand,
  StopTaskCommand,
  type KeyValuePair
} from "@aws-sdk/client-ecs";
import { getRuntimeEnv, requireEcsWorkerDispatcherConfig } from "../config/env.js";
import type { EcsWorkerDispatcherConfig } from "../config/env.js";
import type { DeploymentJobRecord } from "./deployment-job-service.js";

export type DispatchDeploymentWorkerInput = {
  job: DeploymentJobRecord;
};

export type DispatchDeploymentWorkerResult = {
  taskArn: string | null;
};

export type StopDeploymentWorkerInput = {
  job: DeploymentJobRecord;
  reason: string;
};

export type StopDeploymentWorkerResult = {
  stopped: boolean;
  errorSummary?: string;
};

export type InspectDeploymentWorkerInput = {
  job: DeploymentJobRecord;
};

export type InspectDeploymentWorkerResult = {
  state: "ACTIVE" | "STOPPED" | "MISSING";
  lastStatus: string | null;
};

export type DeploymentWorkerDispatcher = {
  dispatch(input: DispatchDeploymentWorkerInput): Promise<DispatchDeploymentWorkerResult>;
  inspect(input: InspectDeploymentWorkerInput): Promise<InspectDeploymentWorkerResult>;
  stop(input: StopDeploymentWorkerInput): Promise<StopDeploymentWorkerResult>;
};

type LocalWorkerProcess = {
  pid?: number;
  unref(): void;
};

type LocalWorkerSpawnOptions = {
  detached: boolean;
  env: NodeJS.ProcessEnv;
  stdio: "ignore";
};

export function createLocalDeploymentWorkerDispatcher(options: {
  command?: string;
  commandArgs?: string[];
  spawnWorker?: (
    command: string,
    args: string[],
    options: LocalWorkerSpawnOptions
  ) => LocalWorkerProcess;
  isProcessActive?: (pid: number) => boolean;
  stopProcess?: (pid: number) => void;
  wait?: (milliseconds: number) => Promise<void>;
} = {}): DeploymentWorkerDispatcher {
  const command = options.command ?? process.execPath;
  const commandArgs = options.commandArgs ?? createLocalWorkerCommandArgs();
  const spawnWorker =
    options.spawnWorker ??
    ((workerCommand, workerArgs, workerOptions) =>
      spawn(workerCommand, workerArgs, workerOptions));
  const isProcessActive = options.isProcessActive ?? isLocalProcessActive;
  const stopProcess = options.stopProcess ?? ((pid: number) => process.kill(pid, "SIGTERM"));
  const wait =
    options.wait ??
    ((milliseconds: number) => new Promise<void>((resolveWait) => setTimeout(resolveWait, milliseconds)));

  return {
    async dispatch({ job }) {
      const child = spawnWorker(command, commandArgs, {
        detached: true,
        env: {
          ...process.env,
          SKETCHCATCH_DEPLOYMENT_ID: job.deploymentId,
          SKETCHCATCH_DEPLOYMENT_JOB_ID: job.id,
          SKETCHCATCH_DEPLOYMENT_OPERATION: job.operation
        },
        stdio: "ignore"
      });
      if (!child.pid) {
        throw new Error("Local deployment worker did not return a process id");
      }
      child.unref();
      return { taskArn: createLocalProcessReference(child.pid) };
    },
    async inspect({ job }) {
      const pid = parseLocalProcessReference(job.ecsTaskArn);
      if (!pid || !isProcessActive(pid)) {
        return { state: "MISSING", lastStatus: null };
      }
      return { state: "ACTIVE", lastStatus: "RUNNING" };
    },
    async stop({ job }) {
      const pid = parseLocalProcessReference(job.ecsTaskArn);
      if (!pid || !isProcessActive(pid)) return { stopped: false };

      try {
        stopProcess(pid);
        for (let attempt = 0; attempt < 30; attempt += 1) {
          if (!isProcessActive(pid)) return { stopped: true };
          await wait(100);
        }
      } catch {
        if (!isProcessActive(pid)) return { stopped: false };
      }

      return {
        stopped: false,
        errorSummary: "Local deployment worker could not be verified or stopped; retry cancellation."
      };
    }
  };
}

function createLocalWorkerCommandArgs(): string[] {
  const sourceEntry = resolve(process.cwd(), "src/deployment-worker.ts");
  const builtEntry = resolve(process.cwd(), "dist/deployment-worker.cjs");
  const hasTypeScriptLoader = process.execArgv.some((argument) => argument.includes("tsx"));

  if (hasTypeScriptLoader && existsSync(sourceEntry)) {
    return [...process.execArgv, sourceEntry];
  }
  if (existsSync(builtEntry)) {
    return [builtEntry];
  }
  throw new Error("Local deployment worker entrypoint was not found");
}

function createLocalProcessReference(pid: number): string {
  return `local-process:${pid}`;
}

function parseLocalProcessReference(reference: string | null): number | null {
  const match = /^local-process:(\d+)$/u.exec(reference ?? "");
  if (!match?.[1]) return null;
  const pid = Number(match[1]);
  return Number.isSafeInteger(pid) && pid > 0 ? pid : null;
}

function isLocalProcessActive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !(error instanceof Error && "code" in error && error.code === "ESRCH");
  }
}

export function createConfiguredDeploymentWorkerDispatcher(): DeploymentWorkerDispatcher {
  const env = getRuntimeEnv();
  const ecsClient = new ECSClient({ region: env.awsRegion });
  return createEcsDeploymentWorkerDispatcher({
    ecsClient,
    config: requireEcsWorkerDispatcherConfig(env)
  });
}

export function createEcsDeploymentWorkerDispatcher(input: {
  ecsClient: Pick<ECSClient, "send">;
  config: EcsWorkerDispatcherConfig;
  wait?: (milliseconds: number) => Promise<void>;
}): DeploymentWorkerDispatcher {
  const { ecsClient, config } = input;
  const wait = input.wait ?? ((milliseconds: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));

  return {
    async dispatch({ job }) {
      const command = new RunTaskCommand({
        cluster: config.cluster,
        taskDefinition: config.taskDefinition,
        launchType: "FARGATE",
        networkConfiguration: {
          awsvpcConfiguration: {
            assignPublicIp: config.assignPublicIp,
            securityGroups: config.securityGroupIds,
            subnets: config.subnetIds
          }
        },
        overrides: {
          containerOverrides: [
            {
              name: config.containerName,
              command: config.command,
              environment: createWorkerEnvironment(job, config.environment)
            }
          ]
        },
        startedBy: `sketchcatch:${job.id}`,
        tags: [
          {
            key: "SketchCatchDeploymentId",
            value: job.deploymentId
          },
          {
            key: "SketchCatchDeploymentJobId",
            value: job.id
          }
        ]
      });

      const result = await ecsClient.send(command);
      const failure = result.failures?.[0];

      if (failure) {
        const reason = failure.reason ?? failure.detail ?? "ECS RunTask failed";
        throw new Error(reason);
      }

      const taskArn = result.tasks?.[0]?.taskArn;

      if (!taskArn) {
        throw new Error("ECS RunTask did not return a task ARN");
      }

      return {
        taskArn
      };
    },

    async inspect({ job }) {
      const taskArn =
        job.ecsTaskArn ?? (await findRunningTaskByJobId(ecsClient, config.cluster, job.id));
      if (!taskArn) return { state: "MISSING", lastStatus: null };

      const result = await ecsClient.send(
        new DescribeTasksCommand({
          cluster: config.cluster,
          tasks: [taskArn]
        })
      );
      const task = result.tasks?.[0];

      if (!task) {
        return { state: "MISSING", lastStatus: null };
      }

      const lastStatus = task.lastStatus ?? null;

      return {
        state: lastStatus === "STOPPED" ? "STOPPED" : "ACTIVE",
        lastStatus
      };
    },

    async stop({ job, reason }) {
      try {
        const taskArn =
          job.ecsTaskArn ?? (await findRunningTaskByJobId(ecsClient, config.cluster, job.id));
        if (!taskArn) return { stopped: false };
        const activeTask = await ecsClient.send(
          new DescribeTasksCommand({
            cluster: config.cluster,
            tasks: [taskArn]
          })
        );
        const task = activeTask.tasks?.[0];

        if (!task || task.lastStatus === "STOPPED") {
          return { stopped: false };
        }

        await ecsClient.send(
          new StopTaskCommand({
            cluster: config.cluster,
            task: taskArn,
            reason
          })
        );
        for (let attempt = 0; attempt < 30; attempt += 1) {
          const result = await ecsClient.send(
            new DescribeTasksCommand({
              cluster: config.cluster,
              tasks: [taskArn]
            })
          );
          if (result.failures?.length) {
            throw new Error("ECS worker task terminal state could not be verified");
          }
          const stoppedTask = result.tasks?.[0];
          if (!stoppedTask || stoppedTask.lastStatus === "STOPPED") {
            return { stopped: true };
          }
          await wait(1_000);
        }
        throw new Error("ECS worker task did not reach STOPPED after cancellation");
      } catch {
        return {
          stopped: false,
          errorSummary: "ECS worker task could not be verified or stopped; retry cancellation."
        };
      }
    }
  };
}

async function findRunningTaskByJobId(
  ecsClient: Pick<ECSClient, "send">,
  cluster: string,
  jobId: string
): Promise<string | null> {
  const result = await ecsClient.send(
    new ListTasksCommand({
      cluster,
      startedBy: `sketchcatch:${jobId}`,
      desiredStatus: "RUNNING"
    })
  );
  return result.taskArns?.[0] ?? null;
}

function createWorkerEnvironment(
  job: DeploymentJobRecord,
  staticEnvironment: Record<string, string>
): KeyValuePair[] {
  const environment = {
    ...staticEnvironment,
    SKETCHCATCH_DEPLOYMENT_ID: job.deploymentId,
    SKETCHCATCH_DEPLOYMENT_JOB_ID: job.id,
    SKETCHCATCH_DEPLOYMENT_OPERATION: job.operation
  };

  return Object.entries(environment).map(([name, value]) => ({ name, value }));
}
