import type {
  GitCicdPipelineRunStatus,
  GitCicdPipelineStageKind,
  GitCicdPipelineStageStatus
} from "@sketchcatch/types";
import { maskDeploymentMessage } from "../deployments/log-masking.js";
import type {
  GitHubActionsReadClient,
  GitHubRepositoryRefInput,
  GitHubWorkflowRunSummary
} from "../source-repositories/github-app-client.js";

export type GitCicdRunProviderJob = {
  stageKind: GitCicdPipelineStageKind | null;
  status: GitCicdPipelineStageStatus;
  runUrl: string;
  startedAt: Date | null;
  finishedAt: Date | null;
};

export type GitCicdRunProviderLog = {
  stageKind: GitCicdPipelineStageKind | null;
  level: "info" | "warning" | "error";
  message: string;
};

export type GitCicdRunProviderSnapshot = {
  commitSha: string;
  commitMessage: string;
  branch: string;
  workflowName: string;
  runUrl: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  status: GitCicdPipelineRunStatus;
  jobs: GitCicdRunProviderJob[];
  logs: GitCicdRunProviderLog[];
};

export type GitCicdRunProvider = {
  listSnapshots(input: GitHubRepositoryRefInput): Promise<GitCicdRunProviderSnapshot[]>;
  listCommitFiles(input: GitHubRepositoryRefInput & { commitSha: string }): Promise<string[]>;
};

const monitoredWorkflowNames = new Set(["SketchCatch Infra", "SketchCatch App"]);

export function createGitHubActionsRunProvider(
  client: GitHubActionsReadClient
): GitCicdRunProvider {
  return {
    listCommitFiles: (input) => client.listCommitFiles(input),
    async listSnapshots(input) {
      const runs = (await client.listBranchWorkflowRuns(input)).filter((run) =>
        monitoredWorkflowNames.has(run.workflowName)
      );
      const groups = new Map<string, GitHubWorkflowRunSummary[]>();
      for (const run of runs)
        groups.set(run.commitSha, [...(groups.get(run.commitSha) ?? []), run]);

      const snapshots: GitCicdRunProviderSnapshot[] = [];
      for (const [commitSha, commitRuns] of groups) {
        const jobs: GitCicdRunProviderJob[] = [];
        const logs: GitCicdRunProviderLog[] = [];
        for (const run of commitRuns) {
          for (const job of await client.listWorkflowJobs({ ...input, runId: run.id })) {
            const stageKind = mapJobStageKind(run.workflowName, job.name);
            jobs.push({
              stageKind,
              status: mapStageStatus(job.status, job.conclusion),
              runUrl: job.runUrl,
              startedAt: toDate(job.startedAt),
              finishedAt: toDate(job.finishedAt)
            });
            if (job.status !== "completed") continue;
            const text = maskDeploymentMessage(
              await client.readWorkflowJobLog({ ...input, jobId: job.id })
            );
            for (const line of text.split(/\r?\n/).filter(Boolean)) {
              logs.push({
                stageKind,
                level: job.conclusion === "failure" ? "error" : "info",
                message: line
              });
            }
          }
        }
        const first = commitRuns[0]!;
        snapshots.push({
          commitSha,
          commitMessage: first.commitMessage,
          branch: first.branch,
          workflowName: commitRuns.map((run) => run.workflowName).join(" + "),
          runUrl: commitRuns.at(-1)?.runUrl ?? first.runUrl,
          startedAt: minDate(commitRuns.map((run) => toDate(run.startedAt))),
          finishedAt: commitRuns.every((run) => run.status === "completed")
            ? maxDate(commitRuns.map((run) => toDate(run.finishedAt)))
            : null,
          status: aggregateStatus(commitRuns),
          jobs,
          logs
        });
      }
      return snapshots;
    }
  };
}

function mapJobStageKind(workflowName: string, jobName: string): GitCicdPipelineStageKind | null {
  const name = jobName.toLowerCase();
  if (name.includes("verify")) return "verify";
  if (workflowName === "SketchCatch Infra") {
    if (name.includes("plan")) return "infra_plan";
    if (name.includes("apply")) return "infra_apply";
  }
  if (workflowName === "SketchCatch App") {
    if (name.includes("build")) return "app_build";
    if (name.includes("deploy")) return "app_deploy";
  }
  return null;
}

function mapStageStatus(status: string, conclusion: string | null): GitCicdPipelineStageStatus {
  if (status === "queued" || status === "waiting") return "queued";
  if (status !== "completed") return "running";
  if (conclusion === "success") return "succeeded";
  if (conclusion === "cancelled") return "cancelled";
  return "failed";
}

function aggregateStatus(runs: readonly GitHubWorkflowRunSummary[]): GitCicdPipelineRunStatus {
  if (runs.some((run) => run.status !== "completed")) return "running";
  if (
    runs.some(
      (run) =>
        run.conclusion === "failure" ||
        run.conclusion === "timed_out" ||
        run.conclusion === "action_required"
    )
  )
    return "failed";
  if (runs.some((run) => run.conclusion === "cancelled")) return "cancelled";
  return "succeeded";
}

function toDate(value: string | null): Date | null {
  return value ? new Date(value) : null;
}

function minDate(values: readonly (Date | null)[]): Date | null {
  const dates = values.filter((value): value is Date => value !== null);
  return dates.length ? new Date(Math.min(...dates.map((date) => date.getTime()))) : null;
}

function maxDate(values: readonly (Date | null)[]): Date | null {
  const dates = values.filter((value): value is Date => value !== null);
  return dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : null;
}
