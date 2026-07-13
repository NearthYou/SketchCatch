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
  upstreamOrderingToken: string;
  logRevision: string;
  jobs: GitCicdRunProviderJob[];
  logs: GitCicdRunProviderLog[];
};

export type GitCicdRunProvider = {
  listSnapshots(
    input: GitHubRepositoryRefInput & { commitSha?: string }
  ): Promise<GitCicdRunProviderSnapshot[]>;
  listCommitFiles(input: GitHubRepositoryRefInput & { commitSha: string }): Promise<string[]>;
};

const monitoredWorkflowNames = new Set(["SketchCatch Infra", "SketchCatch App"]);
export const maxHydratedPipelineCommitGroups = 10;

export function createGitHubActionsRunProvider(
  client: GitHubActionsReadClient
): GitCicdRunProvider {
  return {
    listCommitFiles: (input) => client.listCommitFiles(input),
    async listSnapshots(input) {
      const runs = selectLatestWorkflowAttempts(
        (await client.listBranchWorkflowRuns(input)).filter((run) =>
          monitoredWorkflowNames.has(run.workflowName) &&
          (!input.commitSha || run.commitSha === input.commitSha)
        )
      ).sort(compareWorkflowRunsNewestFirst);
      const groups = new Map<string, GitHubWorkflowRunSummary[]>();
      for (const run of runs)
        groups.set(run.commitSha, [...(groups.get(run.commitSha) ?? []), run]);

      const snapshots: GitCicdRunProviderSnapshot[] = [];
      for (const [commitSha, commitRuns] of [...groups].slice(0, maxHydratedPipelineCommitGroups)) {
        const jobs: GitCicdRunProviderJob[] = [];
        const logs: GitCicdRunProviderLog[] = [];
        for (const run of [...commitRuns].sort(compareWorkflowHydrationOrder)) {
          for (const job of await client.listWorkflowJobs({ ...input, runId: run.id })) {
            const jobStageKind = mapJobStageKind(run.workflowName, job.name);
            const mappedSteps = (job.steps ?? []).flatMap((step) => {
              const stageKind = mapStepStageKind(run.workflowName, job.name, step.name);
              return stageKind
                ? [
                    {
                      stageKind,
                      status: mapStageStatus(step.status, step.conclusion),
                      runUrl: job.runUrl,
                      startedAt: toDate(step.startedAt),
                      finishedAt: toDate(step.finishedAt)
                    }
                  ]
                : [];
            });
            if (mappedSteps.length) jobs.push(...mappedSteps);
            else {
              jobs.push({
                stageKind: jobStageKind,
                status: mapStageStatus(job.status, job.conclusion),
                runUrl: job.runUrl,
                startedAt: toDate(job.startedAt),
                finishedAt: toDate(job.finishedAt)
              });
            }
            if (job.status !== "completed") continue;
            const text = maskDeploymentMessage(
              await client.readWorkflowJobLog({ ...input, jobId: job.id })
            );
            for (const line of text.split(/\r?\n/).filter(Boolean)) {
              logs.push({
                stageKind: mappedSteps.length === 1 ? mappedSteps[0]!.stageKind : jobStageKind,
                level: job.conclusion === "failure" ? "error" : "info",
                message: line
              });
            }
          }
        }
        const first = commitRuns[0]!;
        const logRevision = createSelectedWorkflowRevision(commitRuns);
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
          upstreamOrderingToken: `${getMaxWorkflowUpdatedAt(commitRuns).toISOString()}|${createSelectedWorkflowOrderingRevision(commitRuns)}`,
          logRevision,
          jobs,
          logs
        });
      }
      return snapshots;
    }
  };
}

function compareWorkflowRunsNewestFirst(
  left: GitHubWorkflowRunSummary,
  right: GitHubWorkflowRunSummary
): number {
  const updatedDifference = readWorkflowTime(right.updatedAt) - readWorkflowTime(left.updatedAt);
  if (updatedDifference !== 0) return updatedDifference;
  const createdDifference = readWorkflowTime(right.createdAt) - readWorkflowTime(left.createdAt);
  if (createdDifference !== 0) return createdDifference;
  const shaDifference = left.commitSha.localeCompare(right.commitSha);
  if (shaDifference !== 0) return shaDifference;
  const workflowDifference = left.workflowName.localeCompare(right.workflowName);
  return workflowDifference !== 0 ? workflowDifference : right.id - left.id;
}

function compareWorkflowHydrationOrder(
  left: GitHubWorkflowRunSummary,
  right: GitHubWorkflowRunSummary
): number {
  const workflowOrder = ["SketchCatch Infra", "SketchCatch App"];
  return (
    workflowOrder.indexOf(left.workflowName) - workflowOrder.indexOf(right.workflowName) ||
    left.id - right.id
  );
}

function createSelectedWorkflowRevision(runs: readonly GitHubWorkflowRunSummary[]): string {
  return [...runs]
    .sort(
      (left, right) =>
        left.workflowName.localeCompare(right.workflowName) ||
        left.id - right.id ||
        left.runAttempt - right.runAttempt
    )
    .map((run) => `${run.workflowName}:${run.id}:${run.runAttempt}`)
    .join("|");
}

function createSelectedWorkflowOrderingRevision(
  runs: readonly GitHubWorkflowRunSummary[]
): string {
  return [...runs]
    .sort(
      (left, right) =>
        left.workflowName.localeCompare(right.workflowName) ||
        left.id - right.id ||
        left.runAttempt - right.runAttempt
    )
    .map(
      (run) =>
        `${run.workflowName}:${String(run.id).padStart(20, "0")}:${String(run.runAttempt).padStart(10, "0")}`
    )
    .join("|");
}

function getMaxWorkflowUpdatedAt(runs: readonly GitHubWorkflowRunSummary[]): Date {
  const timestamp = Math.max(
    ...runs.map((run) => readWorkflowTime(run.updatedAt) || readWorkflowTime(run.createdAt))
  );
  return new Date(timestamp);
}

function readWorkflowTime(value: string | null): number {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function selectLatestWorkflowAttempts(
  runs: readonly GitHubWorkflowRunSummary[]
): GitHubWorkflowRunSummary[] {
  const selected = new Map<string, GitHubWorkflowRunSummary>();
  for (const run of runs) {
    const key = `${run.commitSha}\0${run.workflowName}`;
    const current = selected.get(key);
    if (!current || compareAttempts(run, current) > 0) selected.set(key, run);
  }
  return [...selected.values()];
}

function compareAttempts(left: GitHubWorkflowRunSummary, right: GitHubWorkflowRunSummary): number {
  if (left.id === right.id && left.runAttempt !== right.runAttempt) {
    return left.runAttempt - right.runAttempt;
  }
  const leftUpdated = left.updatedAt ? Date.parse(left.updatedAt) : 0;
  const rightUpdated = right.updatedAt ? Date.parse(right.updatedAt) : 0;
  if (leftUpdated !== rightUpdated) return leftUpdated - rightUpdated;
  const leftCreated = left.createdAt ? Date.parse(left.createdAt) : 0;
  const rightCreated = right.createdAt ? Date.parse(right.createdAt) : 0;
  if (leftCreated !== rightCreated) return leftCreated - rightCreated;
  return left.id - right.id;
}

function mapStepStageKind(
  workflowName: string,
  jobName: string,
  stepName: string
): GitCicdPipelineStageKind | null {
  if (workflowName !== "SketchCatch App" || jobName !== "release") return null;
  if (stepName === "Upload release artifact") return "app_build";
  if (stepName === "Refresh Auto Scaling Group") return "app_deploy";
  if (stepName === "Verify URLs") return "verify";
  return null;
}

function mapJobStageKind(workflowName: string, jobName: string): GitCicdPipelineStageKind | null {
  const name = jobName.toLowerCase();
  if (name.includes("verify")) return "verify";
  if (workflowName === "SketchCatch Infra") {
    if (name === "plan") return "infra_plan";
    if (name === "apply") return "infra_apply";
  }
  if (workflowName === "SketchCatch App") {
    if (name.includes("build")) return "app_build";
    if (name.includes("deploy")) return "app_deploy";
  }
  return null;
}

function mapStageStatus(status: string, conclusion: string | null): GitCicdPipelineStageStatus {
  if (["queued", "waiting", "pending", "requested"].includes(status)) return "queued";
  if (status === "in_progress") return "running";
  if (status !== "completed") return "not_started";
  if (conclusion === "success") return "succeeded";
  if (conclusion === "skipped") return "skipped";
  if (conclusion === "cancelled") return "cancelled";
  return "failed";
}

function aggregateStatus(runs: readonly GitHubWorkflowRunSummary[]): GitCicdPipelineRunStatus {
  if (runs.some((run) => run.status === "in_progress")) return "running";
  if (runs.some((run) => ["queued", "waiting", "pending", "requested"].includes(run.status)))
    return "queued";
  if (runs.some((run) => run.status !== "completed")) return "detected";
  if (
    runs.some(
      (run) =>
        run.status === "completed" &&
        run.conclusion !== "success" &&
        run.conclusion !== "skipped" &&
        run.conclusion !== "cancelled"
    )
  )
    return "failed";
  if (runs.some((run) => run.status === "completed" && run.conclusion === "cancelled"))
    return "cancelled";
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
