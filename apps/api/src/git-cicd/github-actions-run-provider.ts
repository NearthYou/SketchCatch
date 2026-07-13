import type {
  EcsGitOpsReleaseEvidence,
  GitOpsReleaseEvidence,
  GitCicdPipelineRunStatus,
  GitCicdPipelineStageKind,
  GitCicdPipelineStageStatus,
  LambdaGitOpsReleaseEvidence
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
  releaseEvidence?: GitOpsReleaseEvidence | null;
};

export type GitCicdRunProvider = {
  listSnapshots(
    input: GitHubRepositoryRefInput & { commitSha?: string }
  ): Promise<GitCicdRunProviderSnapshot[]>;
  listCommitFiles(input: GitHubRepositoryRefInput & { commitSha: string }): Promise<string[]>;
};

const monitoredWorkflowSlots = ["SketchCatch Infra", "SketchCatch App"] as const;
const monitoredWorkflowNames = new Set<string>(monitoredWorkflowSlots);
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
        const releaseEvidenceCandidates: GitOpsReleaseEvidence[] = [];
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
            const rawText = await client.readWorkflowJobLog({ ...input, jobId: job.id });
            releaseEvidenceCandidates.push(...parseReleaseEvidence(rawText));
            const text = maskDeploymentMessage(rawText);
            let activeStageKind = jobStageKind;
            for (const line of text.split(/\r?\n/).filter(Boolean)) {
              const lineStageKind = mapLogLineStageKind(run.workflowName, job.name, line);
              if (lineStageKind) activeStageKind = lineStageKind;
              const evidenceLabel = line.includes("SKETCHCATCH_ECS_RELEASE_EVIDENCE_B64=")
                ? "ECS release evidence captured."
                : line.includes("SKETCHCATCH_LAMBDA_RELEASE_EVIDENCE_B64=")
                  ? "Lambda release evidence captured."
                  : null;
              logs.push({
                stageKind: evidenceLabel ? "verify" : activeStageKind,
                level: job.conclusion === "failure" ? "error" : "info",
                message: evidenceLabel ?? line
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
          logs,
          releaseEvidence: selectReleaseEvidence(releaseEvidenceCandidates, commitSha)
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
  const selectedByWorkflow = new Map(runs.map((run) => [run.workflowName, run]));
  const presenceMask = monitoredWorkflowSlots
    .map((workflowName) => (selectedByWorkflow.has(workflowName) ? "1" : "0"))
    .join("");
  const slots = monitoredWorkflowSlots.map((workflowName) => {
    const run = selectedByWorkflow.get(workflowName);
    return run
      ? `${String(run.id).padStart(20, "0")}:${String(run.runAttempt).padStart(10, "0")}`
      : "00000000000000000000:0000000000";
  });
  return [presenceMask, ...slots].join("|");
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
  if (stepName === "Run CodeBuild" || stepName === "Upload release artifact") return "app_build";
  if (stepName === "Build confirmed SAM application") return "app_build";
  if (stepName === "Publish immutable ECR digest") return "artifact_publish";
  if (stepName === "Publish immutable Lambda version") return "artifact_publish";
  if (stepName === "Deploy ECS Fargate revision" || stepName === "Refresh Auto Scaling Group") return "app_deploy";
  if (stepName === "Deploy Lambda alias AllAtOnce") return "app_deploy";
  if (stepName === "Verify ECS release" || stepName === "Verify URLs") return "verify";
  if (stepName === "Verify Lambda release") return "verify";
  return null;
}

function mapLogLineStageKind(
  workflowName: string,
  jobName: string,
  line: string
): GitCicdPipelineStageKind | null {
  for (const stepName of [
    "Run CodeBuild",
    "Publish immutable ECR digest",
    "Deploy ECS Fargate revision",
    "Verify ECS release",
    "Build confirmed SAM application",
    "Publish immutable Lambda version",
    "Deploy Lambda alias AllAtOnce",
    "Verify Lambda release",
    "Upload release artifact",
    "Refresh Auto Scaling Group",
    "Verify URLs"
  ]) {
    if (line.includes(stepName)) return mapStepStageKind(workflowName, jobName, stepName);
  }
  return null;
}

function parseReleaseEvidence(text: string): GitOpsReleaseEvidence[] {
  const results: GitOpsReleaseEvidence[] = [];
  for (const marker of [
    /SKETCHCATCH_ECS_RELEASE_EVIDENCE_B64=([A-Za-z0-9+/]{1,12000}={0,2})(?:\s|$)/g,
    /SKETCHCATCH_LAMBDA_RELEASE_EVIDENCE_B64=([A-Za-z0-9+/]{1,12000}={0,2})(?:\s|$)/g
  ]) {
    let match: RegExpExecArray | null;
    while ((match = marker.exec(text)) !== null) {
      if (!match[1]) continue;
      try {
        const decoded = Buffer.from(match[1], "base64");
        if (decoded.byteLength > 8_192) continue;
        const value: unknown = JSON.parse(decoded.toString("utf8"));
        const evidence = validateEcsReleaseEvidence(value) ?? validateLambdaReleaseEvidence(value);
        if (evidence) results.push(evidence);
      } catch {
        continue;
      }
    }
  }
  return results;
}

function selectReleaseEvidence(
  candidates: readonly GitOpsReleaseEvidence[],
  commitSha: string
): GitOpsReleaseEvidence | null {
  const matching = candidates.filter(
    (candidate) => candidate.commitSha.toLowerCase() === commitSha.toLowerCase()
  );
  const distinct = new Map(matching.map((candidate) => [JSON.stringify(candidate), candidate]));
  return distinct.size === 1 ? [...distinct.values()][0]! : null;
}

function validateLambdaReleaseEvidence(value: unknown): LambdaGitOpsReleaseEvidence | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const allowedKeys = new Set([
    "schemaVersion", "runtimeTargetKind", "outcome", "commitSha", "artifactDigest",
    "artifactUri", "functionName", "aliasName", "publishedVersion", "previousVersion",
    "activeVersion", "deploymentId", "deploymentConfigName", "outputUrl"
  ]);
  if (Object.keys(item).some((key) => !allowedKeys.has(key))) return null;
  const stringKeys = [
    "commitSha", "artifactDigest", "artifactUri", "functionName", "aliasName",
    "publishedVersion", "previousVersion", "activeVersion", "deploymentId",
    "deploymentConfigName", "outputUrl"
  ] as const;
  if (stringKeys.some((key) => typeof item[key] !== "string")) return null;
  const outcome = String(item.outcome);
  const publishedVersion = String(item.publishedVersion);
  const previousVersion = String(item.previousVersion);
  const activeVersion = String(item.activeVersion);
  const artifactDigest = String(item.artifactDigest);
  const artifactUri = String(item.artifactUri);
  if (
    item.schemaVersion !== 1 ||
    item.runtimeTargetKind !== "lambda" ||
    !["succeeded", "rolled_back", "failed"].includes(outcome) ||
    !/^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(String(item.commitSha)) ||
    !/^sha256:[a-f\d]{64}$/.test(artifactDigest) ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(String(item.functionName)) ||
    !/^(?!\$LATEST$)(?!\d+$)[A-Za-z0-9_-]{1,128}$/.test(String(item.aliasName)) ||
    !/^[1-9]\d*$/.test(publishedVersion) ||
    !/^[1-9]\d*$/.test(previousVersion) ||
    !/^[1-9]\d*$/.test(activeVersion) ||
    !/^d-[A-Za-z0-9]+$/.test(String(item.deploymentId)) ||
    item.deploymentConfigName !== "CodeDeployDefault.LambdaAllAtOnce" ||
    (outcome === "succeeded" && activeVersion !== publishedVersion) ||
    (outcome === "rolled_back" && activeVersion !== previousVersion) ||
    (outcome === "failed" && activeVersion !== previousVersion) ||
    !isSafeS3ArtifactUri(artifactUri, artifactDigest) ||
    !isSafeHttpsUrl(String(item.outputUrl))
  ) return null;
  return item as LambdaGitOpsReleaseEvidence;
}

function isSafeS3ArtifactUri(value: string, digest: string): boolean {
  if (value.length > 2_048 || /[\s\0]/.test(value)) return false;
  if (!/^s3:\/\/[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]\/.+/.test(value)) return false;
  return value.endsWith(`/${digest.slice("sha256:".length)}.zip`);
}

function validateEcsReleaseEvidence(value: unknown): EcsGitOpsReleaseEvidence | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const allowedKeys = new Set([
    "schemaVersion", "runtimeTargetKind", "outcome", "commitSha", "imageDigest", "imageUri",
    "clusterName", "serviceName", "containerName", "taskDefinitionArn",
    "previousTaskDefinitionArn", "restoredTaskDefinitionArn", "outputUrl"
  ]);
  if (Object.keys(item).some((key) => !allowedKeys.has(key))) return null;
  const stringKeys = [
    "commitSha", "imageDigest", "imageUri", "clusterName", "serviceName", "containerName",
    "taskDefinitionArn", "previousTaskDefinitionArn", "outputUrl"
  ] as const;
  if (stringKeys.some((key) => typeof item[key] !== "string")) return null;
  if (
    item.schemaVersion !== 1 ||
    item.runtimeTargetKind !== "ecs_fargate" ||
    !["succeeded", "rolled_back", "failed"].includes(String(item.outcome)) ||
    !/^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(String(item.commitSha)) ||
    !/^sha256:[a-f\d]{64}$/.test(String(item.imageDigest)) ||
    !isEcsResourceName(String(item.clusterName)) ||
    !isEcsResourceName(String(item.serviceName)) ||
    !isEcsResourceName(String(item.containerName)) ||
    !isTaskDefinitionArn(String(item.taskDefinitionArn)) ||
    !isTaskDefinitionArn(String(item.previousTaskDefinitionArn)) ||
    (item.restoredTaskDefinitionArn !== undefined &&
      (typeof item.restoredTaskDefinitionArn !== "string" ||
        !isTaskDefinitionArn(item.restoredTaskDefinitionArn)))
  ) return null;

  const imageUri = String(item.imageUri);
  if (
    imageUri.length > 2_048 ||
    /[\s\0]/.test(imageUri) ||
    !imageUri.endsWith(`@${String(item.imageDigest)}`)
  ) return null;
  if (!isSafeHttpsUrl(String(item.outputUrl))) return null;
  return item as EcsGitOpsReleaseEvidence;
}

function isEcsResourceName(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,254}$/.test(value);
}

function isTaskDefinitionArn(value: string): boolean {
  return /^arn:aws(?:-[a-z]+)?:ecs:[a-z0-9-]+:\d{12}:task-definition\/[A-Za-z0-9_-]+:\d+$/.test(value);
}

function isSafeHttpsUrl(value: string): boolean {
  if (value.length > 2_048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
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
