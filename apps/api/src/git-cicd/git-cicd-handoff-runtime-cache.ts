import type {
  GitCicdHandoffPipelineStatus,
  GitCicdHandoffStatus
} from "@sketchcatch/types";
import type { RuntimeCache, RuntimeCacheJsonValue } from "../runtime-cache/index.js";
import type { GitCicdHandoffRecord } from "./git-cicd-handoff-service.js";

export const gitCicdPipelineStatusCacheNamespace = "git_ci.pipeline_status";
export const gitCicdPipelineStatusCacheTtlMs = 10 * 60 * 1000;

type GitCicdPipelineStatusCacheSnapshot = Omit<
  GitCicdHandoffPipelineStatus,
  "source"
> & {
  readonly kind: "git_cicd_pipeline_status";
  readonly cachedAt: string;
};

export async function readGitCicdPipelineStatusSnapshot(input: {
  readonly handoffId: string;
  readonly runtimeCache: RuntimeCache;
}): Promise<GitCicdHandoffPipelineStatus | null> {
  try {
    const value = await input.runtimeCache.get<GitCicdPipelineStatusCacheSnapshot>({
      namespace: gitCicdPipelineStatusCacheNamespace,
      key: createGitCicdPipelineStatusCacheKey(input.handoffId)
    });

    if (!isGitCicdPipelineStatusCacheSnapshot(value)) {
      return null;
    }

    return {
      ...value,
      source: "runtime_cache"
    };
  } catch {
    return null;
  }
}

export async function writeGitCicdPipelineStatusSnapshot(input: {
  readonly handoff: GitCicdHandoffRecord;
  readonly runtimeCache: RuntimeCache;
  readonly now?: () => Date;
}): Promise<void> {
  const now = input.now ?? (() => new Date());
  const snapshot = createGitCicdPipelineStatusCacheSnapshot(input.handoff, now);

  await input.runtimeCache
    .set(
      {
        namespace: gitCicdPipelineStatusCacheNamespace,
        key: createGitCicdPipelineStatusCacheKey(input.handoff.id)
      },
      snapshot,
      {
        ttlMs: gitCicdPipelineStatusCacheTtlMs
      }
    )
    .catch(() => undefined);
}

export function toGitCicdPipelineStatusFromRecord(
  handoff: GitCicdHandoffRecord
): GitCicdHandoffPipelineStatus {
  return {
    id: handoff.id,
    projectId: handoff.projectId,
    status: handoff.status,
    pullRequestUrl: handoff.pullRequestUrl,
    pullRequestNumber: handoff.pullRequestNumber,
    mergeCommitSha: handoff.mergeCommitSha,
    pipelineRunUrl: handoff.pipelineRunUrl,
    infraPipelineRunUrl: handoff.infraPipelineRunUrl,
    infraPipelineStatus: handoff.infraPipelineStatus,
    appPipelineRunUrl: handoff.appPipelineRunUrl,
    appPipelineStatus: handoff.appPipelineStatus,
    destroyPipelineRunUrl: handoff.destroyPipelineRunUrl,
    destroyPipelineStatus: handoff.destroyPipelineStatus,
    environmentName: handoff.environmentName,
    staticSiteUrl: handoff.staticSiteUrl,
    apiBaseUrl: handoff.apiBaseUrl,
    statusMessage: handoff.statusMessage,
    updatedAt: toIsoString(handoff.updatedAt),
    source: "rds"
  };
}

export function createGitCicdPipelineStatusCacheKey(handoffId: string): string {
  return `git-cicd-handoff:${handoffId}`;
}

function createGitCicdPipelineStatusCacheSnapshot(
  handoff: GitCicdHandoffRecord,
  now: () => Date
): GitCicdPipelineStatusCacheSnapshot {
  return {
    kind: "git_cicd_pipeline_status",
    id: handoff.id,
    projectId: handoff.projectId,
    status: handoff.status,
    pullRequestUrl: handoff.pullRequestUrl,
    pullRequestNumber: handoff.pullRequestNumber,
    mergeCommitSha: handoff.mergeCommitSha,
    pipelineRunUrl: handoff.pipelineRunUrl,
    infraPipelineRunUrl: handoff.infraPipelineRunUrl,
    infraPipelineStatus: handoff.infraPipelineStatus,
    appPipelineRunUrl: handoff.appPipelineRunUrl,
    appPipelineStatus: handoff.appPipelineStatus,
    destroyPipelineRunUrl: handoff.destroyPipelineRunUrl,
    destroyPipelineStatus: handoff.destroyPipelineStatus,
    environmentName: handoff.environmentName,
    staticSiteUrl: handoff.staticSiteUrl,
    apiBaseUrl: handoff.apiBaseUrl,
    statusMessage: handoff.statusMessage,
    updatedAt: toIsoString(handoff.updatedAt),
    cachedAt: now().toISOString()
  };
}

function isGitCicdPipelineStatusCacheSnapshot(
  value: GitCicdPipelineStatusCacheSnapshot | null
): value is GitCicdPipelineStatusCacheSnapshot {
  return Boolean(
    value &&
      value.kind === "git_cicd_pipeline_status" &&
      typeof value.id === "string" &&
      typeof value.projectId === "string" &&
      isGitCicdHandoffStatus(value.status) &&
      isNullableString(value.pullRequestUrl) &&
      isNullableNumber(value.pullRequestNumber) &&
      isNullableString(value.mergeCommitSha) &&
      isNullableString(value.pipelineRunUrl) &&
      isNullableString(value.infraPipelineRunUrl) &&
      isGitCicdPipelineDetailStatus(value.infraPipelineStatus) &&
      isNullableString(value.appPipelineRunUrl) &&
      isGitCicdPipelineDetailStatus(value.appPipelineStatus) &&
      isNullableString(value.destroyPipelineRunUrl) &&
      isGitCicdPipelineDetailStatus(value.destroyPipelineStatus) &&
      typeof value.environmentName === "string" &&
      isNullableString(value.staticSiteUrl) &&
      isNullableString(value.apiBaseUrl) &&
      isNullableString(value.statusMessage) &&
      typeof value.updatedAt === "string" &&
      typeof value.cachedAt === "string"
  );
}

function isGitCicdHandoffStatus(value: RuntimeCacheJsonValue | undefined): value is GitCicdHandoffStatus {
  return (
    value === "draft" ||
    value === "pr_created" ||
    value === "pipeline_running" ||
    value === "pipeline_success" ||
    value === "pipeline_failed" ||
    value === "cancelled"
  );
}

function isNullableString(value: RuntimeCacheJsonValue | undefined): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableNumber(value: RuntimeCacheJsonValue | undefined): value is number | null {
  return value === null || typeof value === "number";
}

function isGitCicdPipelineDetailStatus(
  value: RuntimeCacheJsonValue | undefined
): boolean {
  return (
    value === "not_started" ||
    value === "waiting_for_merge" ||
    value === "waiting_for_approval" ||
    value === "running" ||
    value === "success" ||
    value === "failed" ||
    value === "cancelled"
  );
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
