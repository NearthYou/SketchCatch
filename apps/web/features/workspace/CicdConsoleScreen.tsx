import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type {
  GitCicdMonitoringConfig,
  GitCicdPipelineLog,
  GitCicdPipelineRun,
  SourceRepository
} from "@sketchcatch/types";
import { ApiClientError, getApiErrorMessage } from "../../lib/api-client";
import {
  getGitCicdMonitoringConfig,
  getGitCicdPipelineRun,
  listGitHubAccountInstallations,
  listGitCicdPipelineLogs,
  listGitCicdPipelineRuns,
  listSourceRepositories,
  refreshProjectGitCicdPipelineRuns
} from "./api";
import { CicdActivityView } from "./CicdActivityView";
import { CicdLogsView } from "./CicdLogsView";
import { DeploymentOutputLinks } from "./DeploymentOutputLinks";
import {
  getCicdPipelineRunState,
  getCicdPollIntervalMs,
  getSelectedCicdPipelineRunId,
  initialCicdConsoleRequestState,
  mergeCicdPipelineRun,
  reduceCicdLogState,
  reduceCicdConsoleRequestState
} from "./cicd-console-state";
import { getSafePipelineRunLinks } from "./deployment-output-links";
import styles from "./workspace.module.css";

export type CicdConsoleView = "activity" | "logs";

export function CicdConsoleScreen({
  isVisible,
  onOpenLiveObservation,
  projectId
}: {
  readonly isVisible: boolean;
  readonly onOpenLiveObservation?: (() => void) | undefined;
  readonly projectId: string;
}) {
  const [activeView, setActiveView] = useState<CicdConsoleView>("activity");
  const [repository, setRepository] = useState<SourceRepository | null>(null);
  const [hasGitHubAccountConnection, setHasGitHubAccountConnection] = useState<boolean | null>(
    null
  );
  const [config, setConfig] = useState<GitCicdMonitoringConfig | null>(null);
  const [runs, setRuns] = useState<GitCicdPipelineRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [logs, setLogs] = useState<GitCicdPipelineLog[]>([]);
  const [logsOwner, setLogsOwner] = useState<{
    runId: string | null;
    logRevision: string | null;
  }>({ runId: null, logRevision: null });
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLogsLoading, setIsLogsLoading] = useState(false);
  const [loadRequestId, setLoadRequestId] = useState(0);
  const [logsReloadRequestId, setLogsReloadRequestId] = useState(0);
  const [requestState, dispatchRequestState] = useReducer(
    reduceCicdConsoleRequestState,
    initialCicdConsoleRequestState
  );
  const logsSequenceRef = useRef(0);
  const loadedProjectIdRef = useRef<string | null>(null);
  const hasExplicitRunSelectionRef = useRef(false);
  const logOwnerRef = useRef<{ runId: string | null; logRevision: string | null }>({
    runId: null,
    logRevision: null
  });

  const { logsErrorMessage, permissionFailure, screenErrorMessage } = requestState;

  const runState = useMemo(
    () => getCicdPipelineRunState(runs, selectedRunId),
    [runs, selectedRunId]
  );
  const selectedRun = runState.selectedRun;
  const selectedRunIdForLogs = selectedRun?.id ?? null;
  const selectedLogRevision = selectedRun?.logRevision ?? null;
  const visibleLogs =
    logsOwner.runId === selectedRunIdForLogs &&
    logsOwner.logRevision === selectedLogRevision
      ? logs
      : [];
  const outputLinks = useMemo(() => getSafePipelineRunLinks(selectedRun), [selectedRun]);
  const projectSettingsHref = `/dashboard/projects/${encodeURIComponent(projectId)}/settings`;
  const repositoryHref = `/dashboard/projects/${encodeURIComponent(projectId)}/repository`;
  const githubAccountSettingsHref = "/dashboard/settings#github-account-settings-title";

  const loadRuns = useCallback(async (): Promise<GitCicdPipelineRun[]> => {
    const response = await listGitCicdPipelineRuns(projectId, { limit: 50 });
    return response.runs;
  }, [projectId]);

  const applyRuns = useCallback((nextRuns: readonly GitCicdPipelineRun[]): void => {
    setRuns([...nextRuns]);
    setSelectedRunId((currentId) =>
      getSelectedCicdPipelineRunId(
        nextRuns,
        currentId,
        hasExplicitRunSelectionRef.current
      )
    );
  }, []);

  useEffect(() => {
    if (!isVisible || loadedProjectIdRef.current === projectId) {
      return;
    }

    let cancelled = false;

    async function loadConsole(): Promise<void> {
      setIsInitialLoading(true);

      try {
        const [repositories, initialRuns] = await Promise.all([
          listSourceRepositories(projectId),
          listGitCicdPipelineRuns(projectId, { limit: 50 })
        ]);
        const activeRepository = repositories.find(
          (item) => item.provider === "github" && item.status === "active"
        ) ?? null;
        let githubAccountConnected = true;
        if (!activeRepository) {
          githubAccountConnected = (await listGitHubAccountInstallations()).length > 0;
        }
        const monitoringConfig = activeRepository
          ? await getGitCicdMonitoringConfig(projectId, activeRepository.id)
          : null;

        if (cancelled) {
          return;
        }

        setRepository(activeRepository);
        setHasGitHubAccountConnection(githubAccountConnected);
        setConfig(monitoringConfig);
        hasExplicitRunSelectionRef.current = false;
        applyRuns(initialRuns.runs);
        dispatchRequestState({ type: "success", scope: "list" });
        loadedProjectIdRef.current = projectId;
      } catch (error) {
        if (!cancelled) {
          dispatchRequestState({
            type: "failure",
            scope: "screen",
            message: getApiErrorMessage(error, "CI/CD 정보를 불러오지 못했습니다."),
            permissionFailure: isGitHubPermissionFailure(error)
          });
        }
      } finally {
        if (!cancelled) {
          setIsInitialLoading(false);
        }
      }
    }

    void loadConsole();
    return () => {
      cancelled = true;
    };
  }, [applyRuns, isVisible, loadRequestId, projectId]);

  const refreshList = useCallback(async (): Promise<void> => {
    if (!isVisible || document.visibilityState !== "visible") {
      return;
    }

    setIsRefreshing(true);
    try {
      const nextRuns = await loadRuns();
      applyRuns(nextRuns);
      dispatchRequestState({ type: "success", scope: "refresh" });
    } catch (error) {
      dispatchRequestState({
        type: "failure",
        scope: "screen",
        message: getApiErrorMessage(error, "CI/CD 상태를 갱신하지 못했습니다."),
        permissionFailure: isGitHubPermissionFailure(error)
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [applyRuns, isVisible, loadRuns]);

  const manualRefresh = useCallback(async (): Promise<void> => {
    if (!isVisible || document.visibilityState !== "visible") return;
    setIsRefreshing(true);
    try {
      const result = await refreshProjectGitCicdPipelineRuns(projectId);
      applyRuns(result.runs);
      dispatchRequestState({ type: "success", scope: "refresh" });
      const errorMessage = result.targets.find((target) => target.errorMessage)?.errorMessage;
      if (errorMessage) {
        dispatchRequestState({
          type: "failure",
          scope: "screen",
          message: errorMessage,
          permissionFailure: false
        });
      }
    } catch (error) {
      dispatchRequestState({
        type: "failure",
        scope: "screen",
        message: getApiErrorMessage(error, "CI/CD 상태를 갱신하지 못했습니다."),
        permissionFailure: isGitHubPermissionFailure(error)
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [applyRuns, isVisible, projectId]);

  useEffect(() => {
    if (!isVisible) {
      return;
    }
    const intervalId = window.setInterval(
      () => void refreshList(),
      getCicdPollIntervalMs(runs)
    );
    return () => window.clearInterval(intervalId);
  }, [isVisible, refreshList, runs]);

  useEffect(() => {
    if (!selectedRunId) {
      return;
    }

    let cancelled = false;
    void getGitCicdPipelineRun(selectedRunId)
      .then((detail) => {
        if (!cancelled) {
          setRuns((currentRuns) => mergeCicdPipelineRun(currentRuns, detail));
          dispatchRequestState({ type: "success", scope: "detail" });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          dispatchRequestState({
            type: "failure",
            scope: "screen",
            message: getApiErrorMessage(error, "Pipeline Run 정보를 불러오지 못했습니다."),
            permissionFailure: isGitHubPermissionFailure(error)
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRunId]);

  useEffect(() => {
    const next = reduceCicdLogState(
      {
        ...logOwnerRef.current,
        sequence: logsSequenceRef.current,
        logs: []
      },
      selectedRunIdForLogs
        ? { id: selectedRunIdForLogs, logRevision: selectedLogRevision ?? "" }
        : null
    );
    if (next.runId === logOwnerRef.current.runId && next.logRevision === logOwnerRef.current.logRevision) {
      return;
    }
    const nextOwner = { runId: next.runId, logRevision: next.logRevision };
    logOwnerRef.current = nextOwner;
    logsSequenceRef.current = 0;
    setLogsOwner(nextOwner);
    setLogs([]);
  }, [selectedLogRevision, selectedRunIdForLogs]);

  useEffect(() => {
    if (!isVisible || activeView !== "logs" || !selectedRunId) {
      return;
    }

    let cancelled = false;
    async function loadLogs(): Promise<void> {
      if (document.visibilityState !== "visible") {
        return;
      }
      setIsLogsLoading(true);
      try {
        const response = await listGitCicdPipelineLogs(selectedRunId!, logsSequenceRef.current);
        if (!cancelled) {
          logsSequenceRef.current = response.nextSequence;
          setLogs((currentLogs) => mergeLogs(currentLogs, response.logs));
          dispatchRequestState({ type: "success", scope: "logs" });
        }
      } catch (error) {
        if (!cancelled) {
          dispatchRequestState({
            type: "failure",
            scope: "logs",
            message: getApiErrorMessage(error, "CI/CD 로그를 불러오지 못했습니다."),
            permissionFailure: isGitHubPermissionFailure(error)
          });
        }
      } finally {
        if (!cancelled) {
          setIsLogsLoading(false);
        }
      }
    }

    void loadLogs();
    const intervalId = window.setInterval(() => void loadLogs(), getCicdPollIntervalMs(runs));
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeView, isVisible, logsReloadRequestId, runs, selectedLogRevision, selectedRunId]);

  if (isInitialLoading) {
    return <div className={styles.cicdState} role="status">CI/CD 정보를 불러오는 중입니다.</div>;
  }

  if (permissionFailure) {
    return (
      <div className={styles.cicdState} role="alert">
        <h3>GitHub 권한을 확인해 주세요.</h3>
        <p>{screenErrorMessage}</p>
        <a className={styles.deploymentPrimaryButton} href={githubAccountSettingsHref}>GitHub App 설정 열기</a>
        <button className={styles.deploymentSecondaryButton} onClick={() => {
          loadedProjectIdRef.current = null;
          setIsInitialLoading(true);
          setLoadRequestId((requestId) => requestId + 1);
        }} type="button">다시 시도</button>
      </div>
    );
  }

  if (screenErrorMessage && !repository) {
    return (
      <div className={styles.cicdState} role="alert">
        <h3>CI/CD 정보를 불러오지 못했습니다.</h3>
        <p>{screenErrorMessage}</p>
        <button className={styles.deploymentPrimaryButton} onClick={() => {
          loadedProjectIdRef.current = null;
          setIsInitialLoading(true);
          setLoadRequestId((requestId) => requestId + 1);
        }} type="button">다시 시도</button>
      </div>
    );
  }

  if (!repository && hasGitHubAccountConnection === false) {
    return (
      <div className={styles.cicdState} role="status">
        <h3>GitHub App 연결이 필요합니다.</h3>
        <p>현재 로그인 방식과 관계없이 GitHub App을 연결한 뒤 이 프로젝트의 저장소를 선택할 수 있습니다.</p>
        <a
          className={styles.deploymentPrimaryButton}
          href={githubAccountSettingsHref}
        >
          GitHub App 설정 열기
        </a>
      </div>
    );
  }

  if (!repository) {
    return (
      <div className={styles.cicdState} role="status">
        <h3>GitHub 저장소 연결이 필요합니다.</h3>
        <a className={styles.deploymentPrimaryButton} href={repositoryHref}>프로젝트 소스 저장소 열기</a>
      </div>
    );
  }

  return (
    <div className={styles.cicdConsole}>
      <div className={styles.cicdViewNavigation} aria-label="CI/CD console view">
        {(["activity", "logs"] as const).map((view) => (
          <button
            aria-pressed={activeView === view}
            key={view}
            onClick={() => setActiveView(view)}
            type="button"
          >
            {({ activity: "Activity", logs: "Logs" } as const)[view]}
          </button>
        ))}
        <button disabled={isRefreshing} onClick={() => void manualRefresh()} type="button">
          {isRefreshing ? "갱신 중" : "새로고침"}
        </button>
      </div>

      {config?.validationStatus === "required" ? (
        <a className={styles.cicdRequiredState} href={projectSettingsHref}>
          프로젝트 설정에서 CI/CD branch와 경로를 확인하세요.
        </a>
      ) : null}
      {screenErrorMessage ? <p className={styles.deploymentStageAlert} role="alert">{screenErrorMessage}</p> : null}

      {runs.length > 0 ? (
        <label className={styles.cicdRunSelect}>
          Pipeline Run
          <select value={selectedRun?.id ?? ""} onChange={(event) => {
            hasExplicitRunSelectionRef.current = true;
            setSelectedRunId(event.target.value);
          }}>
            {runs.map((run) => (
              <option key={run.id} value={run.id}>{run.commitSha.slice(0, 8)} · {run.commitMessage}</option>
            ))}
          </select>
        </label>
      ) : null}

      <DeploymentOutputLinks links={outputLinks} scopeKey={selectedRun?.id ?? null} />

      {config?.validationStatus === "valid" && runs.length === 0 ? (
        <p className={styles.cicdState} role="status">아직 감지된 Pipeline Run이 없습니다.</p>
      ) : activeView === "activity" ? (
        <CicdActivityView run={selectedRun} />
      ) : activeView === "logs" ? (
        <CicdLogsView
          errorMessage={logsErrorMessage}
          isLoading={isLogsLoading}
          logs={visibleLogs}
          onOpenLiveObservation={onOpenLiveObservation}
          onRetry={() => setLogsReloadRequestId((requestId) => requestId + 1)}
          run={selectedRun}
        />
      ) : null}
    </div>
  );
}

function mergeLogs(current: readonly GitCicdPipelineLog[], next: readonly GitCicdPipelineLog[]): GitCicdPipelineLog[] {
  const byId = new Map(current.map((log) => [log.id, log]));
  next.forEach((log) => byId.set(log.id, log));
  return [...byId.values()].sort((left, right) => left.sequence - right.sequence);
}

function isGitHubPermissionFailure(error: unknown): boolean {
  if (error instanceof ApiClientError && error.status === 403) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /permission|forbidden|access|GIT_APP_/i.test(message);
}
