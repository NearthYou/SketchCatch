import type {
  GitCicdMonitoredPath,
  GitCicdPipelineLog,
  GitCicdPipelineRun,
  GitCicdPipelineRunStatus
} from "../../../../packages/types/src";

export const ACTIVE_CICD_POLL_INTERVAL_MS = 5_000;
export const IDLE_CICD_POLL_INTERVAL_MS = 30_000;
const GITHUB_IDENTITY_REQUIRED_ERROR = "GIT_APP_GITHUB_IDENTITY_REQUIRED";

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

export type CicdLogState = {
  readonly runId: string | null;
  readonly logRevision: string | null;
  readonly sequence: number;
  readonly logs: readonly GitCicdPipelineLog[];
};

export type CicdPipelineRunState = {
  readonly currentRun: GitCicdPipelineRun | null;
  readonly historyRuns: GitCicdPipelineRun[];
  readonly selectedRun: GitCicdPipelineRun | null;
};

export type CicdConsoleRequestState = {
  readonly permissionFailure: boolean;
  readonly screenErrorMessage: string;
  readonly logsErrorMessage: string;
};

export type CicdConsoleRequestAction =
  | {
      readonly type: "success";
      readonly scope: "list" | "detail" | "refresh" | "settings" | "logs";
    }
  | {
      readonly type: "failure";
      readonly scope: "screen" | "logs";
      readonly message: string;
      readonly permissionFailure: boolean;
    };

export const initialCicdConsoleRequestState: CicdConsoleRequestState = {
  permissionFailure: false,
  screenErrorMessage: "",
  logsErrorMessage: ""
};

export function isGitHubIdentityRequiredError(error: unknown): boolean {
  return error instanceof Error && error.message === GITHUB_IDENTITY_REQUIRED_ERROR;
}

export function getCicdPollIntervalMs(runs: readonly PipelineRunStatusValue[]): number {
  return runs.some((run) => !isTerminalPipelineStatus(run.status))
    ? ACTIVE_CICD_POLL_INTERVAL_MS
    : IDLE_CICD_POLL_INTERVAL_MS;
}

export function reduceCicdLogState(
  state: CicdLogState,
  run: Pick<GitCicdPipelineRun, "id" | "logRevision"> | null
): CicdLogState {
  const runId = run?.id ?? null;
  const logRevision = run?.logRevision ?? null;
  if (state.runId === runId && state.logRevision === logRevision) return state;
  return { runId, logRevision, sequence: 0, logs: [] };
}

export function isCicdMonitoringDraftComplete(draft: CicdMonitoringDraft): boolean {
  const hasValidPaths =
    normalizeCicdMonitoredPath(draft.appPath) !== null &&
    normalizeCicdMonitoredPath(draft.infraPath) !== null;
  return hasValidPaths && (!draft.enabled || draft.monitorBranch.trim().length > 0);
}

export function normalizeCicdMonitoredPath(
  path: GitCicdMonitoredPath
): GitCicdMonitoredPath | null {
  if (path.mode === "repository_root") {
    return { mode: "repository_root", path: "." };
  }

  const rawPath = path.path.trim();
  const normalizedSeparators = rawPath.replaceAll("\\", "/");
  if (
    normalizedSeparators.length === 0 ||
    normalizedSeparators.startsWith("/") ||
    /^[a-z][a-z\d+.-]*:/i.test(rawPath)
  ) {
    return null;
  }

  const segments = normalizedSeparators
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".");
  if (segments.length === 0 || segments.some((segment) => segment === "..")) {
    return null;
  }

  return { mode: "subdirectory", path: segments.join("/") };
}

export function reduceCicdConsoleRequestState(
  state: CicdConsoleRequestState,
  action: CicdConsoleRequestAction
): CicdConsoleRequestState {
  if (action.type === "success") {
    if (action.scope === "logs") {
      return { ...state, logsErrorMessage: "" };
    }
    return {
      ...state,
      permissionFailure: false,
      screenErrorMessage: ""
    };
  }

  if (action.scope === "logs") {
    return {
      ...state,
      permissionFailure: state.permissionFailure || action.permissionFailure,
      logsErrorMessage: action.message
    };
  }
  return {
    ...state,
    permissionFailure: action.permissionFailure,
    screenErrorMessage: action.message
  };
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

export function getActiveCicdPipelineRun(
  runs: readonly GitCicdPipelineRun[]
): GitCicdPipelineRun | null {
  return runs.find((run) => !isTerminalPipelineStatus(run.status)) ?? null;
}

export function mergeCicdPipelineRun(
  runs: readonly GitCicdPipelineRun[],
  refreshedRun: GitCicdPipelineRun
): GitCicdPipelineRun[] {
  const byId = new Map(runs.map((run) => [run.id, run]));
  byId.set(refreshedRun.id, refreshedRun);
  return [...byId.values()].sort(comparePipelineRunsNewestFirst);
}

export function getSelectedCicdPipelineRunId(
  runs: readonly GitCicdPipelineRun[],
  selectedRunId: string | null,
  preserveExplicitSelection: boolean
): string | null {
  if (preserveExplicitSelection && selectedRunId && runs.some((run) => run.id === selectedRunId)) {
    return selectedRunId;
  }
  return getActiveCicdPipelineRun(runs)?.id ?? runs[0]?.id ?? null;
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

function comparePipelineRunsNewestFirst(
  left: GitCicdPipelineRun,
  right: GitCicdPipelineRun
): number {
  const createdAtDifference = Date.parse(right.createdAt) - Date.parse(left.createdAt);
  if (createdAtDifference !== 0) {
    return createdAtDifference;
  }
  return right.id.localeCompare(left.id);
}
