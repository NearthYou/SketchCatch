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

export function createLocalDeploymentWorkerDispatcher(): DeploymentWorkerDispatcher {
  return {
    async dispatch() {
      return { taskArn: null };
    },
    async inspect() {
      return { state: "MISSING", lastStatus: null };
    },
    async stop() {
      return { stopped: false };
    }
  };
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
