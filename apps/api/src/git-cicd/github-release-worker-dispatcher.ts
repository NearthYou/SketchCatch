import {
  DescribeTasksCommand,
  ECSClient,
  ListTasksCommand,
  RunTaskCommand,
  StopTaskCommand
} from "@aws-sdk/client-ecs";
import {
  getRuntimeEnv,
  requireEcsWorkerDispatcherConfig,
  type EcsWorkerDispatcherConfig
} from "../config/env.js";

export type GitHubReleaseWorkerDispatcher = {
  dispatch(input: {
    runId: string;
    projectId: string;
    mode?: "execute" | "recover" | "retry_frontend";
  }): Promise<{ taskArn: string }>;
  inspect(input: { taskArn: string }): Promise<"ACTIVE" | "STOPPED" | "MISSING" | "UNKNOWN">;
  inspectRun?(input: { runId: string }): Promise<{
    state: "ACTIVE" | "MISSING" | "UNKNOWN";
    taskArn: string | null;
  }>;
  stopAndConfirm(input: { taskArn: string; reason: string }): Promise<void>;
};

export function createConfiguredGitHubReleaseWorkerDispatcher(): GitHubReleaseWorkerDispatcher {
  const env = getRuntimeEnv();
  return createEcsGitHubReleaseWorkerDispatcher({
    ecsClient: new ECSClient({ region: env.awsRegion }),
    config: requireEcsWorkerDispatcherConfig(env)
  });
}

export function createEcsGitHubReleaseWorkerDispatcher(input: {
  ecsClient: Pick<ECSClient, "send">;
  config: EcsWorkerDispatcherConfig;
  wait?: (milliseconds: number) => Promise<void>;
}): GitHubReleaseWorkerDispatcher {
  const wait = input.wait ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  return {
    async dispatch({ runId, projectId, mode = "execute" }) {
      const result = await input.ecsClient.send(
        new RunTaskCommand({
          cluster: input.config.cluster,
          taskDefinition: input.config.taskDefinition,
          launchType: "FARGATE",
          networkConfiguration: {
            awsvpcConfiguration: {
              assignPublicIp: input.config.assignPublicIp,
              securityGroups: input.config.securityGroupIds,
              subnets: input.config.subnetIds
            }
          },
          overrides: {
            containerOverrides: [
              {
                name: input.config.containerName,
                command: ["node", "dist/github-release-worker.cjs"],
                environment: [
                  ...Object.entries(input.config.environment).map(([name, value]) => ({ name, value })),
                  { name: "SKETCHCATCH_GITHUB_RELEASE_RUN_ID", value: runId },
                  { name: "SKETCHCATCH_GITHUB_RELEASE_WORKER_MODE", value: mode }
                ]
              }
            ]
          },
          startedBy: `sketchcatch:github:${runId}`,
          tags: [
            { key: "SketchCatchProjectId", value: projectId },
            { key: "SketchCatchGitHubReleaseRunId", value: runId }
          ]
        })
      );
      const failure = result.failures?.[0];
      if (failure) throw new Error(failure.reason ?? failure.detail ?? "ECS RunTask failed");
      const taskArn = result.tasks?.[0]?.taskArn;
      if (!taskArn) throw new Error("ECS RunTask did not return a GitHub release worker ARN");
      return { taskArn };
    },

    async inspect({ taskArn }) {
      try {
        const result = await input.ecsClient.send(
          new DescribeTasksCommand({ cluster: input.config.cluster, tasks: [taskArn] })
        );
        if (result.failures?.length) return "UNKNOWN";
        const task = result.tasks?.[0];
        if (!task) return "MISSING";
        return task.lastStatus === "STOPPED" ? "STOPPED" : "ACTIVE";
      } catch {
        return "UNKNOWN";
      }
    },

    async inspectRun({ runId }) {
      try {
        const result = await input.ecsClient.send(
          new ListTasksCommand({
            cluster: input.config.cluster,
            startedBy: `sketchcatch:github:${runId}`,
            desiredStatus: "RUNNING"
          })
        );
        const taskArn = result.taskArns?.[0] ?? null;
        return taskArn
          ? { state: "ACTIVE" as const, taskArn }
          : { state: "MISSING" as const, taskArn: null };
      } catch {
        return { state: "UNKNOWN" as const, taskArn: null };
      }
    },

    async stopAndConfirm({ taskArn, reason }) {
      await input.ecsClient.send(
        new StopTaskCommand({ cluster: input.config.cluster, task: taskArn, reason })
      );
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const result = await input.ecsClient.send(
          new DescribeTasksCommand({ cluster: input.config.cluster, tasks: [taskArn] })
        );
        const task = result.tasks?.[0];
        if (!task || task.lastStatus === "STOPPED") return;
        await wait(1_000);
      }
      throw new Error("GitHub release worker did not reach STOPPED after cancellation");
    }
  };
}
