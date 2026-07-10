import {
  DescribeTasksCommand,
  ECSClient,
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
};

export type DeploymentWorkerDispatcher = {
  dispatch(input: DispatchDeploymentWorkerInput): Promise<DispatchDeploymentWorkerResult>;
  stop(input: StopDeploymentWorkerInput): Promise<StopDeploymentWorkerResult>;
};

export function createLocalDeploymentWorkerDispatcher(): DeploymentWorkerDispatcher {
  return {
    async dispatch() {
      return { taskArn: null };
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
}): DeploymentWorkerDispatcher {
  const { ecsClient, config } = input;

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

      return {
        taskArn: result.tasks?.[0]?.taskArn ?? null
      };
    },

    async stop({ job, reason }) {
      if (!job.ecsTaskArn) {
        return { stopped: false };
      }

      const activeTask = await ecsClient.send(
        new DescribeTasksCommand({
          cluster: config.cluster,
          tasks: [job.ecsTaskArn]
        })
      );
      const task = activeTask.tasks?.[0];

      if (!task || task.lastStatus === "STOPPED") {
        return { stopped: false };
      }

      await ecsClient.send(
        new StopTaskCommand({
          cluster: config.cluster,
          task: job.ecsTaskArn,
          reason
        })
      );

      return { stopped: true };
    }
  };
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
