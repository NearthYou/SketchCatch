import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type {
  Deployment,
  GitCicdHandoff,
  GitCicdMonitoringConfig,
  GitCicdPipelineLog,
  GitCicdPipelineRun,
  ProjectDeploymentTarget,
  SourceRepository
} from "@sketchcatch/types";
import { ApiClientError, getApiErrorMessage } from "../../lib/api-client";
import {
  applyGitCicdAwsRoleDiff,
  applyGitCicdRepositorySettings,
  applyGitCicdRepositorySettingsWithGitHubOAuth,
  createGitCicdGitHubOAuthStartUrl,
  createGitCicdHandoff,
  getGitCicdMonitoringConfig,
  getGitCicdPipelineRun,
  getProjectDeploymentTarget,
  listGitHubAccountInstallations,
  listDeployments,
  listGitCicdHandoffs,
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
  isGitHubIdentityRequiredError,
  mergeCicdPipelineRun,
  reduceCicdLogState,
  reduceCicdConsoleRequestState
} from "./cicd-console-state";
import {
  buildGitCicdHandoffRequest,
  getGitCicdDeploymentTargetBlocker,
  selectGitCicdSourceDeployment
} from "./cicd-handoff";
import { getSafePipelineRunLinks } from "./deployment-output-links";
import handoffStyles from "./cicd-handoff.module.css";
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
  const [deploymentTarget, setDeploymentTarget] = useState<ProjectDeploymentTarget | null>(null);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [handoffs, setHandoffs] = useState<GitCicdHandoff[]>([]);
  const [selectedHandoffId, setSelectedHandoffId] = useState<string | null>(null);
  const [isHandoffReviewOpen, setIsHandoffReviewOpen] = useState(false);
  const [isHandoffBusy, setIsHandoffBusy] = useState(false);
  const [handoffErrorMessage, setHandoffErrorMessage] = useState("");
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
    logsOwner.runId === selectedRunIdForLogs && logsOwner.logRevision === selectedLogRevision
      ? logs
      : [];
  const outputLinks = useMemo(() => getSafePipelineRunLinks(selectedRun), [selectedRun]);
  const sourceDeployment = useMemo(() => selectGitCicdSourceDeployment(deployments), [deployments]);
  const deploymentTargetBlocker = useMemo(
    () => getGitCicdDeploymentTargetBlocker(deploymentTarget),
    [deploymentTarget]
  );
  const currentHandoff = useMemo(() => {
    const sorted = [...handoffs].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt)
    );
    return sorted.find((handoff) => handoff.id === selectedHandoffId) ?? sorted[0] ?? null;
  }, [handoffs, selectedHandoffId]);
  const existingHandoff = useMemo(
    () =>
      sourceDeployment
        ? (handoffs.find(
            (handoff) =>
              handoff.sourceDeploymentId === sourceDeployment.id && handoff.status !== "cancelled"
          ) ?? null)
        : null,
    [handoffs, sourceDeployment]
  );
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
      getSelectedCicdPipelineRunId(nextRuns, currentId, hasExplicitRunSelectionRef.current)
    );
  }, []);

  const refreshHandoffs = useCallback(async (): Promise<void> => {
    const loadedHandoffs = await listGitCicdHandoffs(projectId);
    setHandoffs(loadedHandoffs);
    setSelectedHandoffId((selected) =>
      loadedHandoffs.some((handoff) => handoff.id === selected)
        ? selected
        : (loadedHandoffs[0]?.id ?? null)
    );
  }, [projectId]);

  const createHandoff = useCallback(async (): Promise<void> => {
    if (!repository || !config || !sourceDeployment || deploymentTargetBlocker) {
      return;
    }

    setIsHandoffBusy(true);
    setHandoffErrorMessage("");
    try {
      const created = await createGitCicdHandoff({
        projectId,
        ...buildGitCicdHandoffRequest({
          deployment: sourceDeployment,
          monitoringConfig: config,
          repository
        })
      });
      setHandoffs((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setSelectedHandoffId(created.id);
      setIsHandoffReviewOpen(false);
    } catch (error) {
      setHandoffErrorMessage(
        getApiErrorMessage(error, "CI/CD 배포 Pull Request를 생성하지 못했습니다.")
      );
    } finally {
      setIsHandoffBusy(false);
    }
  }, [config, deploymentTargetBlocker, projectId, repository, sourceDeployment]);

  const runHandoffAction = useCallback(
    async (action: () => Promise<unknown>): Promise<void> => {
      setIsHandoffBusy(true);
      setHandoffErrorMessage("");
      try {
        await action();
        await refreshHandoffs();
      } catch (error) {
        setHandoffErrorMessage(
          getApiErrorMessage(error, "Git/CI/CD 연결 작업을 완료하지 못했습니다.")
        );
      } finally {
        setIsHandoffBusy(false);
      }
    },
    [refreshHandoffs]
  );

  const startGitHubOAuth = useCallback(async (): Promise<void> => {
    if (!currentHandoff) {
      return;
    }

    setIsHandoffBusy(true);
    setHandoffErrorMessage("");
    try {
      const result = await createGitCicdGitHubOAuthStartUrl(currentHandoff.id);
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      setHandoffErrorMessage(
        getApiErrorMessage(error, "GitHub OAuth 승인 화면을 열지 못했습니다.")
      );
      setIsHandoffBusy(false);
    }
  }, [currentHandoff]);

  useEffect(() => {
    if (!isVisible) {
      return;
    }

    let cancelled = false;

    async function loadConsole(): Promise<void> {
      setIsInitialLoading(true);

      try {
        const [
          repositories,
          initialRuns,
          loadedDeployments,
          loadedHandoffs,
          loadedDeploymentTarget
        ] = await Promise.all([
          listSourceRepositories(projectId),
          listGitCicdPipelineRuns(projectId, { limit: 50 }),
          listDeployments(projectId),
          listGitCicdHandoffs(projectId),
          getProjectDeploymentTarget(projectId)
        ]);
        const activeRepository =
          repositories.find((item) => item.provider === "github" && item.status === "active") ??
          null;
        let githubAccountConnected = true;
        if (!activeRepository) {
          try {
            githubAccountConnected = (await listGitHubAccountInstallations()).length > 0;
          } catch (error) {
            if (!isGitHubIdentityRequiredError(error)) {
              throw error;
            }
            githubAccountConnected = false;
          }
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
        setDeploymentTarget(loadedDeploymentTarget);
        setDeployments(loadedDeployments);
        setHandoffs(loadedHandoffs);
        setSelectedHandoffId((selected) =>
          loadedHandoffs.some((handoff) => handoff.id === selected)
            ? selected
            : (loadedHandoffs[0]?.id ?? null)
        );
        hasExplicitRunSelectionRef.current = false;
        applyRuns(initialRuns.runs);
        dispatchRequestState({ type: "success", scope: "list" });
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
      const [result, loadedDeployments, loadedHandoffs, loadedDeploymentTarget] = await Promise.all([
        refreshProjectGitCicdPipelineRuns(projectId),
        listDeployments(projectId),
        listGitCicdHandoffs(projectId),
        getProjectDeploymentTarget(projectId)
      ]);
      applyRuns(result.runs);
      setDeployments(loadedDeployments);
      setDeploymentTarget(loadedDeploymentTarget);
      setHandoffs(loadedHandoffs);
      setSelectedHandoffId((selected) =>
        loadedHandoffs.some((handoff) => handoff.id === selected)
          ? selected
          : (loadedHandoffs[0]?.id ?? null)
      );
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
    const intervalId = window.setInterval(() => void refreshList(), getCicdPollIntervalMs(runs));
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
    if (
      next.runId === logOwnerRef.current.runId &&
      next.logRevision === logOwnerRef.current.logRevision
    ) {
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
    return (
      <div className={styles.cicdState} role="status">
        CI/CD 정보를 불러오는 중입니다.
      </div>
    );
  }

  if (permissionFailure) {
    return (
      <div className={styles.cicdState} role="alert">
        <h3>GitHub 권한을 확인해 주세요.</h3>
        <p>{screenErrorMessage}</p>
        <a className={styles.deploymentPrimaryButton} href={githubAccountSettingsHref}>
          GitHub 계정 설정 열기
        </a>
        <button
          className={styles.deploymentSecondaryButton}
          onClick={() => {
            setIsInitialLoading(true);
            setLoadRequestId((requestId) => requestId + 1);
          }}
          type="button"
        >
          다시 시도
        </button>
      </div>
    );
  }

  if (screenErrorMessage && !repository) {
    return (
      <div className={styles.cicdState} role="alert">
        <h3>CI/CD 정보를 불러오지 못했습니다.</h3>
        <p>{screenErrorMessage}</p>
        <button
          className={styles.deploymentPrimaryButton}
          onClick={() => {
            setIsInitialLoading(true);
            setLoadRequestId((requestId) => requestId + 1);
          }}
          type="button"
        >
          다시 시도
        </button>
      </div>
    );
  }

  if (!repository && hasGitHubAccountConnection === false) {
    return (
      <div className={styles.cicdState} role="status">
        <h3>GitHub 계정 연결이 필요합니다.</h3>
        <p>GitHub App을 먼저 연결한 뒤 이 프로젝트의 저장소를 선택할 수 있습니다.</p>
        <a className={styles.deploymentPrimaryButton} href={githubAccountSettingsHref}>
          GitHub 계정 설정 열기
        </a>
      </div>
    );
  }

  if (!repository) {
    return (
      <div className={styles.cicdState} role="status">
        <h3>GitHub 저장소 연결이 필요합니다.</h3>
        <a className={styles.deploymentPrimaryButton} href={repositoryHref}>
          프로젝트 소스 저장소 열기
        </a>
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
      {screenErrorMessage ? (
        <p className={styles.deploymentStageAlert} role="alert">
          {screenErrorMessage}
        </p>
      ) : null}

      <section className={handoffStyles.panel} aria-labelledby="cicd-handoff-title">
        <header className={handoffStyles.header}>
          <div>
            <p>Git / CI / CD</p>
            <h3 id="cicd-handoff-title">배포 Pull Request</h3>
          </div>
          <span data-status={currentHandoff?.status ?? "draft"}>
            {getGitCicdHandoffLabel(currentHandoff?.status)}
          </span>
        </header>

        <p className={styles.deploymentHint}>
          승인된 Terraform apply plan을 기준으로 GitHub에 배포 브랜치와 PR을 만듭니다. PR을
          merge하기 전에는 CI/CD 배포가 시작되지 않습니다.
        </p>

        <dl className={handoffStyles.facts}>
          <div>
            <dt>Repository</dt>
            <dd>
              {repository.owner}/{repository.name}
            </dd>
          </div>
          <div>
            <dt>Target branch</dt>
            <dd>{config?.monitorBranch ?? "확인 필요"}</dd>
          </div>
          <div>
            <dt>승인된 Plan</dt>
            <dd>{sourceDeployment?.approvedPlanArtifactId?.slice(0, 12) ?? "없음"}</dd>
          </div>
        </dl>

        {handoffErrorMessage ? (
          <p className={styles.deploymentStageAlert} role="alert">
            {handoffErrorMessage}
          </p>
        ) : null}

        {!sourceDeployment ? (
          <p className={handoffStyles.notice}>
            먼저 배포 화면에서 Terraform apply plan을 생성하고 승인해야 합니다.
          </p>
        ) : config?.validationStatus !== "valid" ? (
          <p className={handoffStyles.notice}>
            프로젝트 설정에서 CI/CD branch와 경로 검증을 완료해야 합니다.
          </p>
        ) : deploymentTargetBlocker ? (
          <p className={handoffStyles.notice}>
            {deploymentTargetBlocker === "output_url_required"
              ? "프로젝트 설정에서 ECS Output URL을 외부 HTTPS URL로 저장해야 합니다."
              : "프로젝트 설정에서 검증된 AWS 연결과 Repository 빌드 근거를 배포 대상으로 저장해야 합니다."}
            <a href={projectSettingsHref}>프로젝트 배포 대상 설정 열기</a>
          </p>
        ) : existingHandoff ? (
          <p className={handoffStyles.notice}>
            이 승인 Plan으로 만든 PR이 이미 있습니다.
            {existingHandoff.pullRequestUrl ? (
              <a href={existingHandoff.pullRequestUrl} rel="noreferrer" target="_blank">
                GitHub에서 PR 열기
              </a>
            ) : null}
          </p>
        ) : null}

        {!isHandoffReviewOpen ? (
          <button
            className={styles.deploymentPrimaryButton}
            disabled={
              isHandoffBusy ||
              !sourceDeployment ||
              config?.validationStatus !== "valid" ||
              deploymentTargetBlocker !== null ||
              existingHandoff !== null
            }
            onClick={() => setIsHandoffReviewOpen(true)}
            type="button"
          >
            CI/CD PR 생성 검토
          </button>
        ) : (
          <div className={handoffStyles.review} role="group" aria-label="CI/CD PR 생성 확인">
            <strong>GitHub 변경을 확인해주세요.</strong>
            <ul>
              <li>배포 workflow와 Terraform 파일을 새 branch에 commit합니다.</li>
              <li>
                {repository.owner}/{repository.name}의 {config?.monitorBranch} branch로 PR을 엽니다.
              </li>
              <li>Repository 설정과 AWS Role 변경은 PR 생성 후 각각 다시 승인합니다.</li>
            </ul>
            <div>
              <button
                className={styles.deploymentSecondaryButton}
                disabled={isHandoffBusy}
                onClick={() => setIsHandoffReviewOpen(false)}
                type="button"
              >
                취소
              </button>
              <button
                className={styles.deploymentPrimaryButton}
                disabled={isHandoffBusy}
                onClick={() => void createHandoff()}
                type="button"
              >
                {isHandoffBusy ? "PR 생성 중" : "CI/CD PR 생성"}
              </button>
            </div>
          </div>
        )}

        {handoffs.length > 1 ? (
          <label className={styles.cicdRunSelect}>
            이전 handoff
            <select
              onChange={(event) => setSelectedHandoffId(event.target.value)}
              value={currentHandoff?.id ?? ""}
            >
              {handoffs.map((handoff) => (
                <option key={handoff.id} value={handoff.id}>
                  {handoff.repositoryOwner}/{handoff.repositoryName} ·{" "}
                  {getGitCicdHandoffLabel(handoff.status)}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {currentHandoff ? (
          <div className={handoffStyles.result}>
            <div>
              <strong>
                {currentHandoff.repositoryOwner}/{currentHandoff.repositoryName}
              </strong>
              <span>{currentHandoff.targetBranch}</span>
            </div>
            {currentHandoff.statusMessage ? <p>{currentHandoff.statusMessage}</p> : null}
            <div className={handoffStyles.actions}>
              {currentHandoff.pullRequestUrl ? (
                <a
                  className={styles.deploymentPrimaryButton}
                  href={currentHandoff.pullRequestUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  GitHub Pull Request 열기
                </a>
              ) : null}
              {currentHandoff.repositorySettingsPreview ? (
                <button
                  className={styles.deploymentSecondaryButton}
                  disabled={isHandoffBusy}
                  onClick={() =>
                    void runHandoffAction(() => applyGitCicdRepositorySettings(currentHandoff.id))
                  }
                  type="button"
                >
                  Repository 설정 적용
                </button>
              ) : null}
              {currentHandoff.githubOAuthRequired ? (
                <>
                  <button
                    className={styles.deploymentSecondaryButton}
                    disabled={isHandoffBusy}
                    onClick={() => void startGitHubOAuth()}
                    type="button"
                  >
                    GitHub OAuth 승인
                  </button>
                  <button
                    className={styles.deploymentSecondaryButton}
                    disabled={isHandoffBusy}
                    onClick={() =>
                      void runHandoffAction(() =>
                        applyGitCicdRepositorySettingsWithGitHubOAuth(currentHandoff.id)
                      )
                    }
                    type="button"
                  >
                    승인 후 Repository 설정 재적용
                  </button>
                </>
              ) : null}
              {currentHandoff.awsRoleDiff && !currentHandoff.awsRoleDiff.applied ? (
                <button
                  className={styles.deploymentSecondaryButton}
                  disabled={isHandoffBusy}
                  onClick={() =>
                    void runHandoffAction(() => applyGitCicdAwsRoleDiff(currentHandoff.id))
                  }
                  type="button"
                >
                  AWS Role 변경 적용
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      {runs.length > 0 ? (
        <label className={styles.cicdRunSelect}>
          Pipeline Run
          <select
            value={selectedRun?.id ?? ""}
            onChange={(event) => {
              hasExplicitRunSelectionRef.current = true;
              setSelectedRunId(event.target.value);
            }}
          >
            {runs.map((run) => (
              <option key={run.id} value={run.id}>
                {run.commitSha.slice(0, 8)} · {run.commitMessage}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <DeploymentOutputLinks links={outputLinks} scopeKey={selectedRun?.id ?? null} />

      {config?.validationStatus === "valid" && runs.length === 0 ? (
        <p className={styles.cicdState} role="status">
          아직 감지된 Pipeline Run이 없습니다.
        </p>
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

function mergeLogs(
  current: readonly GitCicdPipelineLog[],
  next: readonly GitCicdPipelineLog[]
): GitCicdPipelineLog[] {
  const byId = new Map(current.map((log) => [log.id, log]));
  next.forEach((log) => byId.set(log.id, log));
  return [...byId.values()].sort((left, right) => left.sequence - right.sequence);
}

function isGitHubPermissionFailure(error: unknown): boolean {
  if (isGitHubIdentityRequiredError(error)) {
    return false;
  }
  if (error instanceof ApiClientError && error.status === 403) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /permission|forbidden|access|GIT_APP_/i.test(message);
}

function getGitCicdHandoffLabel(status: GitCicdHandoff["status"] | undefined): string {
  switch (status) {
    case "pr_created":
      return "PR 생성됨";
    case "pipeline_running":
      return "Pipeline 실행 중";
    case "pipeline_success":
      return "배포 성공";
    case "pipeline_failed":
      return "Pipeline 실패";
    case "cancelled":
      return "취소됨";
    default:
      return "준비 전";
  }
}
