import type {
  GitCicdMonitoredPath,
  GitCicdPipelineRun,
  GitCicdPipelineRunStatus
} from "../../../../packages/types/src";

export const ACTIVE_CICD_POLL_INTERVAL_MS = 5_000;
export const IDLE_CICD_POLL_INTERVAL_MS = 30_000;

const CICD_STALE_AFTER_MS = 60_000;
const TERMINAL_PIPELINE_RUN_STATUSES: ReadonlySet<GitCicdPipelineRunStatus> = new Set([
  "succeeded",
  "failed",
  "cancelled"
]);

type PipelineRunStatusValue = Pick<GitCicdPipelineRun, "status">;

export type CicdMonitoringDraft = {
  readonly enabled: boolean;
  readonly monitorBranch: string;
  readonly appPath: GitCicdMonitoredPath;
  readonly infraPath: GitCicdMonitoredPath;
};

export type CicdPipelineRunState = {
  readonly currentRun: GitCicdPipelineRun | null;
  readonly historyRuns: GitCicdPipelineRun[];
  readonly selectedRun: GitCicdPipelineRun | null;
};

export function getCicdPollIntervalMs(runs: readonly PipelineRunStatusValue[]): number {
  return runs.some((run) => !isTerminalPipelineStatus(run.status))
    ? ACTIVE_CICD_POLL_INTERVAL_MS
    : IDLE_CICD_POLL_INTERVAL_MS;
}

export function isCicdMonitoringDraftComplete(draft: CicdMonitoringDraft): boolean {
  if (!draft.enabled) {
    return true;
  }

  return (
    draft.monitorBranch.trim().length > 0 &&
    isExplicitMonitoredPath(draft.appPath) &&
    isExplicitMonitoredPath(draft.infraPath)
  );
}

export function isTerminalPipelineTransition(
  previousStatus: GitCicdPipelineRunStatus,
  nextStatus: GitCicdPipelineRunStatus
): boolean {
  return (
    !isTerminalPipelineStatus(previousStatus) && isTerminalPipelineStatus(nextStatus)
  );
}

export function isNotifiablePipelineTransition(
  previousStatus: GitCicdPipelineRunStatus,
  nextStatus: GitCicdPipelineRunStatus
): boolean {
  return (
    !isTerminalPipelineStatus(previousStatus) &&
    (nextStatus === "succeeded" || nextStatus === "failed")
  );
}

export function getNotifiablePipelineRunTransitions(
  previousRuns: readonly GitCicdPipelineRun[],
  nextRuns: readonly GitCicdPipelineRun[]
): GitCicdPipelineRun[] {
  const previousStatusByRunId = new Map(
    previousRuns.map((run) => [run.id, run.status] as const)
  );

  return nextRuns.filter((run) => {
    const previousStatus = previousStatusByRunId.get(run.id);
    return (
      previousStatus !== undefined &&
      isNotifiablePipelineTransition(previousStatus, run.status)
    );
  });
}

export function createPipelineNotificationKey(
  pipelineRunId: string,
  status: GitCicdPipelineRunStatus
): string {
  return `${pipelineRunId}:${status}`;
}

export function getCicdPipelineRunState(
  runs: readonly GitCicdPipelineRun[],
  selectedRunId: string | null = null
): CicdPipelineRunState {
  const currentRun = runs.find((run) => !isTerminalPipelineStatus(run.status)) ?? runs[0] ?? null;
  if (currentRun === null) {
    return {
      currentRun: null,
      historyRuns: [],
      selectedRun: null
    };
  }

  return {
    currentRun,
    historyRuns: runs.filter((run) => run.id !== currentRun.id),
    selectedRun: runs.find((run) => run.id === selectedRunId) ?? currentRun
  };
}

export function isCicdPipelineRunStale(
  run: Pick<GitCicdPipelineRun, "lastRefreshedAt" | "status">,
  nowMs = Date.now()
): boolean {
  if (isTerminalPipelineStatus(run.status)) {
    return false;
  }

  const lastRefreshedAtMs = Date.parse(run.lastRefreshedAt);
  return nowMs - lastRefreshedAtMs > CICD_STALE_AFTER_MS;
}

function isTerminalPipelineStatus(status: GitCicdPipelineRunStatus): boolean {
  return TERMINAL_PIPELINE_RUN_STATUSES.has(status);
}

function isExplicitMonitoredPath(path: GitCicdMonitoredPath): boolean {
  if (path.mode === "repository_root") {
    return path.path === ".";
  }

  const normalizedPath = path.path.trim();
  return normalizedPath.length > 0 && normalizedPath !== ".";
}
