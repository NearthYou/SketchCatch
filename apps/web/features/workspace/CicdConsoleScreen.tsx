import Link from "next/link";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type {
  Deployment,
  GitCicdHandoff,
  GitCicdMonitoringConfig,
  GitCicdPipelineLog,
  GitCicdPipelineRun,
  GitCicdReadinessSnapshot,
  SourceRepository
} from "@sketchcatch/types";
import { ApiClientError, getApiErrorMessage } from "../../lib/api-client";
import { copyTextToClipboard } from "../../lib/clipboard";
import {
  applyGitCicdAwsRoleDiff,
  applyGitCicdRepositorySettings,
  createGitCicdHandoff,
  getProjectDeliveryProfile,
  getGitCicdPipelineRun,
  listGitHubAccountInstallations,
  listDeployments,
  listGitCicdHandoffs,
  listGitCicdPipelineLogs,
  listGitCicdPipelineRuns,
  refreshProjectGitCicdPipelineRuns,
  retryGitCicdFrontendRelease
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
import {
  beginGitCicdReload,
  buildGitCicdHandoffRequest,
  completeGitCicdReload,
  createGitCicdReloadCoordinator,
  getGitCicdHandoffReadiness,
  invalidateGitCicdReload,
  isGitCicdHandoffCreationEnabled,
  isGitCicdHandoffReady,
  isGitCicdReloadOwner,
  selectGitCicdSourceDeployment
} from "./cicd-handoff";
import {
  createInfrastructureDeploymentCommand,
  formatPipelineExecutionKind
} from "./cicd-deployment-command";
import { getSafePipelineRunLinks } from "./deployment-output-links";
import {
  deriveGitHubInstallationAccessState,
  type GitHubInstallationAccessState
} from "./github-installation-access-state";
import {
  canOpenGitCicdLiveObservation,
  canRetryGitCicdFrontend,
  getGitCicdLiveObservationSelection
} from "./cicd-frontend-retry";
import type { LiveObservationSelection } from "./live-observation";
import handoffStyles from "./cicd-handoff.module.css";
import styles from "./workspace.module.css";

export type CicdConsoleView = "activity" | "logs";

export function CicdConsoleScreen({
  isVisible,
  onOpenDirectDeployment,
  onOpenLiveObservation,
  projectId,
  readinessRefreshRequestId = 0
}: {
  readonly isVisible: boolean;
  readonly onOpenDirectDeployment?: (
    (scope: "application" | "full_stack" | null) => void
  ) | undefined;
  readonly onOpenLiveObservation?: ((selection?: LiveObservationSelection) => void) | undefined;
  readonly projectId: string;
  readonly readinessRefreshRequestId?: number | undefined;
}) {
  const [activeView, setActiveView] = useState<CicdConsoleView>("activity");
  const [repository, setRepository] = useState<SourceRepository | null>(null);
  const [githubInstallationAccess, setGitHubInstallationAccess] =
    useState<GitHubInstallationAccessState | null>(null);
  const [config, setConfig] = useState<GitCicdMonitoringConfig | null>(null);
  const [readiness, setReadiness] = useState<GitCicdReadinessSnapshot | null>(null);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [handoffs, setHandoffs] = useState<GitCicdHandoff[]>([]);
  const [selectedHandoffId, setSelectedHandoffId] = useState<string | null>(null);
  const [isHandoffReviewOpen, setIsHandoffReviewOpen] = useState(false);
  const [isHandoffBusy, setIsHandoffBusy] = useState(false);
  const [handoffErrorMessage, setHandoffErrorMessage] = useState("");
  const [commandCopyState, setCommandCopyState] = useState<"idle" | "copied" | "failed">(
    "idle"
  );
  const [runs, setRuns] = useState<GitCicdPipelineRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [logs, setLogs] = useState<GitCicdPipelineLog[]>([]);
  const [logsOwner, setLogsOwner] = useState<{
    runId: string | null;
    logRevision: string | null;
  }>({ runId: null, logRevision: null });
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [consoleDataFreshKey, setConsoleDataFreshKey] = useState<string | null>(null);
  const [isReadinessRefreshing, setIsReadinessRefreshing] = useState(false);
  const [readinessErrorMessage, setReadinessErrorMessage] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLogsLoading, setIsLogsLoading] = useState(false);
  const [isFrontendRetrying, setIsFrontendRetrying] = useState(false);
  const [frontendRetryError, setFrontendRetryError] = useState("");
  const [loadRequestId, setLoadRequestId] = useState(0);
  const [logsReloadRequestId, setLogsReloadRequestId] = useState(0);
  const [requestState, dispatchRequestState] = useReducer(
    reduceCicdConsoleRequestState,
    initialCicdConsoleRequestState
  );
  const logsSequenceRef = useRef(0);
  const reloadCoordinatorRef = useRef(createGitCicdReloadCoordinator());
  const reloadReservedOrInFlightRef = useRef(false);
  const hasCompletedInitialLoadRef = useRef(false);
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
  const liveObservationSelection = useMemo(
    () => getGitCicdLiveObservationSelection(selectedRun),
    [selectedRun]
  );
  const openSelectedLiveObservation =
    liveObservationSelection && onOpenLiveObservation
      ? () => onOpenLiveObservation(liveObservationSelection)
      : undefined;
  const sourceDeployment = useMemo(
    () => selectGitCicdSourceDeployment(deployments, readiness?.sourceDeploymentId ?? null),
    [deployments, readiness?.sourceDeploymentId]
  );
  const readinessItems = useMemo(
    () =>
      readiness
        ? getGitCicdHandoffReadiness({
            projectId,
            readiness
          })
        : [],
    [projectId, readiness]
  );
  const handoffReady = isGitCicdHandoffReady({
    readiness,
    isRefreshing: isReadinessRefreshing,
    hasError: readinessErrorMessage !== ""
  });
  const consoleRequestKey = `${projectId}:${loadRequestId}:${readinessRefreshRequestId}`;
  const isConsoleDataFresh = isVisible && consoleDataFreshKey === consoleRequestKey;
  const infrastructureDeploymentCommand = useMemo(
    () => createInfrastructureDeploymentCommand(),
    []
  );
  const currentHandoff = useMemo(() => {
    const sorted = [...handoffs].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt)
    );
    return sorted.find((handoff) => handoff.id === selectedHandoffId) ?? sorted[0] ?? null;
  }, [handoffs, selectedHandoffId]);
  const existingHandoff = useMemo(
    () =>
      sourceDeployment && readiness?.approvedApplyPlanArtifactId
        ? (handoffs.find(
            (handoff) =>
              handoff.sourceDeploymentId === sourceDeployment.id &&
              handoff.userAcceptedChangeId === readiness.approvedApplyPlanArtifactId &&
              handoff.status !== "cancelled"
          ) ?? null)
        : null,
    [handoffs, readiness?.approvedApplyPlanArtifactId, sourceDeployment]
  );
  const canCreateHandoff = isGitCicdHandoffCreationEnabled({
    hasApprovedApplyPlanArtifact: Boolean(readiness?.approvedApplyPlanArtifactId),
    hasExistingHandoff: existingHandoff !== null,
    hasMonitoringConfig: config !== null,
    hasRepository: repository !== null,
    hasSourceDeployment: sourceDeployment !== null,
    isBusy: isHandoffBusy,
    isConsoleDataFresh,
    isReadinessReady: handoffReady
  });
  const projectSettingsHref = `/dashboard/projects/${encodeURIComponent(projectId)}/settings`;
  const repositoryHref = `/dashboard/projects/${encodeURIComponent(projectId)}/repository`;
  const githubAccountSettingsHref = "/dashboard/settings#github-account-settings-title";

  const requestReadinessReload = useCallback((): void => {
    if (
      !isVisible ||
      reloadReservedOrInFlightRef.current ||
      isRefreshing ||
      isReadinessRefreshing
    ) {
      return;
    }
    reloadReservedOrInFlightRef.current = true;
    setConsoleDataFreshKey(null);
    setIsReadinessRefreshing(true);
    setReadinessErrorMessage("");
    setLoadRequestId((requestId) => requestId + 1);
  }, [isReadinessRefreshing, isRefreshing, isVisible]);

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
    if (
      !canCreateHandoff ||
      !repository ||
      !config ||
      !sourceDeployment ||
      !readiness?.approvedApplyPlanArtifactId
    ) {
      return;
    }

    setIsHandoffBusy(true);
    setHandoffErrorMessage("");
    try {
      const created = await createGitCicdHandoff({
        projectId,
        ...buildGitCicdHandoffRequest({
          approvedApplyPlanArtifactId: readiness.approvedApplyPlanArtifactId,
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
  }, [
    config,
    canCreateHandoff,
    projectId,
    readiness?.approvedApplyPlanArtifactId,
    repository,
    sourceDeployment
  ]);

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

  const loadDeliveryState = useCallback(async () => {
    const profile = await getProjectDeliveryProfile(projectId);
    const githubInstallationAccess = profile.sourceRepository
      ? null
      : deriveGitHubInstallationAccessState(await listGitHubAccountInstallations());

    return {
      repository: profile.sourceRepository,
      monitoringConfig: profile.monitoringConfig,
      readiness: profile.readiness,
      githubInstallationAccess
    };
  }, [projectId]);

  useEffect(() => {
    if (!isVisible) {
      return;
    }

    const reloadStart = beginGitCicdReload(reloadCoordinatorRef.current);
    if (reloadStart.generation === null) return;
    const reloadGeneration = reloadStart.generation;
    reloadCoordinatorRef.current = reloadStart.coordinator;
    reloadReservedOrInFlightRef.current = true;
    let cancelled = false;

    async function loadConsole(): Promise<void> {
      setConsoleDataFreshKey(null);
      setReadinessErrorMessage("");
      if (!hasCompletedInitialLoadRef.current) {
        setIsInitialLoading(true);
      } else {
        setIsReadinessRefreshing(true);
      }

      async function loadConsoleData(): Promise<{
        readonly initialRuns: Awaited<ReturnType<typeof listGitCicdPipelineRuns>>;
        readonly loadedDeployments: Deployment[];
        readonly loadedHandoffs: GitCicdHandoff[];
      }> {
        const [initialRuns, loadedDeployments, loadedHandoffs] = await Promise.all([
          listGitCicdPipelineRuns(projectId, { limit: 50 }),
          listDeployments(projectId),
          listGitCicdHandoffs(projectId)
        ]);

        return {
          initialRuns,
          loadedDeployments,
          loadedHandoffs
        };
      }

      const [consoleResult, deliveryResult] = await Promise.allSettled([
        loadConsoleData(),
        loadDeliveryState()
      ]);
      if (
        cancelled ||
        !isGitCicdReloadOwner(reloadCoordinatorRef.current, reloadGeneration)
      ) {
        return;
      }

      if (deliveryResult.status === "fulfilled") {
        setRepository(deliveryResult.value.repository);
        setGitHubInstallationAccess(deliveryResult.value.githubInstallationAccess);
        setConfig(deliveryResult.value.monitoringConfig);
        setReadiness(deliveryResult.value.readiness);
      } else {
        setReadinessErrorMessage(
          getApiErrorMessage(
            deliveryResult.reason,
            "배포 PR 준비 상태를 갱신하지 못했습니다."
          )
        );
      }

      if (consoleResult.status === "fulfilled") {
        const {
          initialRuns,
          loadedDeployments,
          loadedHandoffs
        } = consoleResult.value;
        setDeployments(loadedDeployments);
        setHandoffs(loadedHandoffs);
        setSelectedHandoffId((selected) =>
          loadedHandoffs.some((handoff) => handoff.id === selected)
            ? selected
            : (loadedHandoffs[0]?.id ?? null)
        );
        hasExplicitRunSelectionRef.current = false;
        applyRuns(initialRuns.runs);
        setConsoleDataFreshKey(
          deliveryResult.status === "fulfilled" ? consoleRequestKey : null
        );
        dispatchRequestState({ type: "success", scope: "list" });
      } else {
        setConsoleDataFreshKey(null);
        dispatchRequestState({
          type: "failure",
          scope: "screen",
          message: getApiErrorMessage(consoleResult.reason, "CI/CD 정보를 불러오지 못했습니다."),
          permissionFailure: isGitHubPermissionFailure(consoleResult.reason)
        });
      }

      hasCompletedInitialLoadRef.current = true;
      reloadCoordinatorRef.current = completeGitCicdReload(
        reloadCoordinatorRef.current,
        reloadGeneration
      );
      reloadReservedOrInFlightRef.current = false;
      setIsInitialLoading(false);
      setIsReadinessRefreshing(false);
    }

    void loadConsole();
    return () => {
      cancelled = true;
      reloadCoordinatorRef.current = invalidateGitCicdReload(reloadCoordinatorRef.current);
      reloadReservedOrInFlightRef.current = false;
      setConsoleDataFreshKey(null);
      setIsRefreshing(false);
      setIsReadinessRefreshing(false);
    };
  }, [applyRuns, consoleRequestKey, isVisible, loadDeliveryState, projectId]);

  useEffect(() => {
    if (!isVisible) {
      return;
    }

    const handleReturnToConsole = (): void => requestReadinessReload();
    window.addEventListener("pageshow", handleReturnToConsole);
    window.addEventListener("focus", handleReturnToConsole);
    return () => {
      window.removeEventListener("pageshow", handleReturnToConsole);
      window.removeEventListener("focus", handleReturnToConsole);
    };
  }, [isVisible, requestReadinessReload]);

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
    if (
      !isVisible ||
      document.visibilityState !== "visible" ||
      reloadReservedOrInFlightRef.current ||
      isRefreshing ||
      isReadinessRefreshing
    ) {
      return;
    }
    const reloadStart = beginGitCicdReload(reloadCoordinatorRef.current);
    if (reloadStart.generation === null) return;
    const reloadGeneration = reloadStart.generation;
    reloadCoordinatorRef.current = reloadStart.coordinator;
    reloadReservedOrInFlightRef.current = true;
    setIsRefreshing(true);
    setIsReadinessRefreshing(true);
    setConsoleDataFreshKey(null);
    setReadinessErrorMessage("");
    const [consoleResult, deliveryResult] = await Promise.allSettled([
      Promise.all([
        refreshProjectGitCicdPipelineRuns(projectId),
        listDeployments(projectId),
        listGitCicdHandoffs(projectId)
      ]),
      loadDeliveryState()
    ]);

    if (!isGitCicdReloadOwner(reloadCoordinatorRef.current, reloadGeneration)) return;

    if (deliveryResult.status === "fulfilled") {
      setRepository(deliveryResult.value.repository);
      setGitHubInstallationAccess(deliveryResult.value.githubInstallationAccess);
      setConfig(deliveryResult.value.monitoringConfig);
      setReadiness(deliveryResult.value.readiness);
    } else {
      setReadinessErrorMessage(
        getApiErrorMessage(
          deliveryResult.reason,
          "배포 PR 준비 상태를 갱신하지 못했습니다."
        )
      );
    }

    if (consoleResult.status === "fulfilled") {
      const [result, loadedDeployments, loadedHandoffs] = consoleResult.value;
      applyRuns(result.runs);
      setDeployments(loadedDeployments);
      setHandoffs(loadedHandoffs);
      setSelectedHandoffId((selected) =>
        loadedHandoffs.some((handoff) => handoff.id === selected)
          ? selected
          : (loadedHandoffs[0]?.id ?? null)
      );
      setConsoleDataFreshKey(
        deliveryResult.status === "fulfilled" ? consoleRequestKey : null
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
    } else {
      setConsoleDataFreshKey(null);
      dispatchRequestState({
        type: "failure",
        scope: "screen",
        message: getApiErrorMessage(
          consoleResult.reason,
          "CI/CD 상태를 갱신하지 못했습니다."
        ),
        permissionFailure: isGitHubPermissionFailure(consoleResult.reason)
      });
    }
    reloadCoordinatorRef.current = completeGitCicdReload(
      reloadCoordinatorRef.current,
      reloadGeneration
    );
    reloadReservedOrInFlightRef.current = false;
    setIsRefreshing(false);
    setIsReadinessRefreshing(false);
  }, [
    applyRuns,
    consoleRequestKey,
    isReadinessRefreshing,
    isRefreshing,
    isVisible,
    loadDeliveryState,
    projectId
  ]);

  const copyInfrastructureDeploymentCommand = useCallback(async (): Promise<void> => {
    try {
      await copyTextToClipboard(infrastructureDeploymentCommand);
      setCommandCopyState("copied");
    } catch {
      setCommandCopyState("failed");
    }
  }, [infrastructureDeploymentCommand]);

  const retryFrontend = useCallback(async (): Promise<void> => {
    if (!selectedRun || !canRetryGitCicdFrontend(selectedRun)) return;
    setIsFrontendRetrying(true);
    setFrontendRetryError("");
    try {
      await retryGitCicdFrontendRelease(selectedRun.id);
      applyRuns(await loadRuns());
    } catch (error) {
      setFrontendRetryError(
        getApiErrorMessage(error, "웹 배포 재시도를 시작하지 못했습니다.")
      );
    } finally {
      setIsFrontendRetrying(false);
    }
  }, [applyRuns, loadRuns, selectedRun]);

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
        <button
          disabled={isRefreshing || isReadinessRefreshing}
          onClick={() => void manualRefresh()}
          type="button"
        >
          {isRefreshing || isReadinessRefreshing ? "갱신 중" : "새로고침"}
        </button>
      </div>

      {config?.validationStatus === "required" ? (
        <Link className={styles.cicdRequiredState} href={projectSettingsHref}>
          프로젝트 설정에서 CI/CD branch와 경로를 확인하세요.
        </Link>
      ) : null}
      {permissionFailure ? (
        <section className={styles.deploymentStageAlert} role="alert">
          <strong>GitHub 권한을 확인해 주세요.</strong>
          <p>{screenErrorMessage}</p>
          <Link className={styles.deploymentPrimaryButton} href={githubAccountSettingsHref}>
            GitHub App 설정 열기
          </Link>
          <button
            className={styles.deploymentSecondaryButton}
            onClick={requestReadinessReload}
            type="button"
          >
            다시 시도
          </button>
        </section>
      ) : screenErrorMessage ? (
        <p className={styles.deploymentStageAlert} role="alert">
          {screenErrorMessage}
        </p>
      ) : null}
      {!repository &&
      (githubInstallationAccess?.status === "server_not_configured" ||
        githubInstallationAccess?.status === "connection_setup_not_configured") ? (
        <section className={handoffStyles.notice} role="status">
          <span>
            GitHub App 서버 설정이 필요합니다. 서버 설정이 완료된 뒤 Repository 연결을 다시
            확인해 주세요.
          </span>
        </section>
      ) : !repository && githubInstallationAccess?.status === "connection_required" ? (
        <section className={handoffStyles.notice} role="status">
          <span>
            GitHub App 연결이 필요합니다. 현재 로그인 방식과 관계없이 GitHub App을 연결한 뒤
            이 프로젝트의 저장소를 선택할 수 있습니다.
          </span>
          <Link href={githubAccountSettingsHref}>GitHub App 설정 열기</Link>
        </section>
      ) : !repository ? (
        <section className={handoffStyles.notice} role="status">
          <span>이 프로젝트에서 사용할 Source Repository를 연결해 주세요.</span>
          <Link href={repositoryHref}>Repository 연결</Link>
        </section>
      ) : null}

      <section className={handoffStyles.panel} aria-labelledby="cicd-handoff-title">
        <header className={handoffStyles.header}>
          <div>
            <h3 id="cicd-handoff-title">배포 Pull Request</h3>
          </div>
          <span data-status={currentHandoff?.status ?? "draft"}>
            {getGitCicdHandoffLabel(currentHandoff?.status)}
          </span>
        </header>

        <p className={styles.deploymentHint}>
          이 PR은 이미 배포된 앱의 후속 변경을 자동 배포하도록 Workflow와 Repository 설정을
          설치합니다. PR merge만으로 최초 앱 배포를 시작하지 않습니다.
        </p>

        <div
          className={handoffStyles.readiness}
          id="cicd-pr-readiness"
          aria-label="CI/CD PR 준비 상태"
        >
          <div className={handoffStyles.readinessHeader}>
            <div>
              <strong>배포 PR 준비</strong>
              <p>설정이 필요한 항목의 버튼을 누르고 저장하면 이 화면에서 완료 상태를 다시 확인합니다.</p>
            </div>
            {readiness ? (
              <span data-ready={readiness.ready}>
                {readiness.ready
                  ? "준비 완료"
                  : `${readiness.requiredActionCount}개 설정 필요`}
              </span>
            ) : null}
          </div>
          {isReadinessRefreshing ? (
            <p className={handoffStyles.readinessLoading} role="status">
              완료 상태 확인 중
            </p>
          ) : readinessErrorMessage ? (
            <div className={handoffStyles.readinessError} role="alert">
              <span>{readinessErrorMessage}</span>
              <button
                className={styles.deploymentSecondaryButton}
                onClick={requestReadinessReload}
                type="button"
              >
                상태 새로고침
              </button>
            </div>
          ) : readiness?.ready ? (
            <p className={handoffStyles.readinessComplete} role="status">
              모든 필수 항목 완료
            </p>
          ) : (
            <ul className={handoffStyles.readinessList}>
              {readinessItems.map((item) => (
                <li data-ready={item.ready} key={item.key}>
                  <div className={handoffStyles.readinessItemContent}>
                    <div>
                      <strong>{item.label}</strong>
                      <span>{item.statusLabel}</span>
                    </div>
                    <p>{item.description}</p>
                    {item.details ? (
                      <ul className={handoffStyles.readinessDetails}>
                        {item.details.map((detail) => (
                          <li data-ready={detail.ready} key={detail.key}>
                            <span>{detail.label}</span>
                            <strong>{detail.ready ? "완료" : "설정 필요"}</strong>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  {!item.ready &&
                  (item.action === "approve_apply_plan" ||
                    item.action === "deploy_initial_application") ? (
                    <button
                      className={styles.deploymentSecondaryButton}
                      onClick={() => onOpenDirectDeployment?.(item.directDeploymentScope)}
                      disabled={!onOpenDirectDeployment}
                      type="button"
                    >
                      {item.actionLabel}
                    </button>
                  ) : !item.ready && item.href ? (
                    <Link className={styles.deploymentSecondaryButton} href={item.href}>
                      {item.actionLabel}
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <dl className={handoffStyles.facts}>
          <div>
            <dt>Repository</dt>
            <dd>
              {repository ? `${repository.owner}/${repository.name}` : "연결 필요"}
            </dd>
          </div>
          <div>
            <dt>Target branch</dt>
            <dd>{config?.monitorBranch ?? "미설정"}</dd>
          </div>
          <div>
            <dt>승인된 Plan</dt>
            <dd>{readiness?.approvedApplyPlanArtifactId?.slice(0, 12) ?? "없음"}</dd>
          </div>
        </dl>

        {handoffErrorMessage ? (
          <p className={styles.deploymentStageAlert} role="alert">
            {handoffErrorMessage}
          </p>
        ) : null}

        {existingHandoff ? (
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
            disabled={!canCreateHandoff}
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
                {repository ? `${repository.owner}/${repository.name}` : "Repository 미설정"}의{" "}
                {config?.monitorBranch ?? "branch 미설정"} branch로 PR을 엽니다.
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
                disabled={!canCreateHandoff}
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

      {currentHandoff ? (
        <section className={handoffStyles.commandCard} aria-labelledby="infra-command-title">
          <div>
            <p>INFRASTRUCTURE DEPLOYMENT</p>
            <h3 id="infra-command-title">인프라 배포 명령</h3>
          </div>
          <p>
            설치 PR이 병합된 뒤 아래 명령을 실행하면 Terraform Plan을 확인한 같은 job에서
            Apply까지 진행합니다. 명령 실행 자체가 Apply 승인입니다.
          </p>
          <div className={handoffStyles.commandRow}>
            <code>{infrastructureDeploymentCommand}</code>
            <button
              className={styles.deploymentSecondaryButton}
              onClick={() => void copyInfrastructureDeploymentCommand()}
              type="button"
            >
              {commandCopyState === "copied"
                ? "복사 완료"
                : commandCopyState === "failed"
                  ? "복사 다시 시도"
                  : "명령 복사"}
            </button>
          </div>
          <span aria-live="polite">
            {commandCopyState === "copied"
              ? "명령을 복사했습니다."
              : commandCopyState === "failed"
                ? "자동 복사에 실패했습니다. 명령을 직접 선택해 복사해 주세요."
                : ""}
          </span>
        </section>
      ) : null}

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
                {formatPipelineExecutionKind(run.executionKind)} · {run.commitSha.slice(0, 8)}
                {run.githubWorkflowRunId ? ` · Run ${run.githubWorkflowRunId}` : ""}
                {run.githubWorkflowRunAttempt
                  ? ` · 시도 ${run.githubWorkflowRunAttempt}`
                  : ""} · {run.commitMessage}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <DeploymentOutputLinks
        links={outputLinks}
        onOpenLiveObservation={
          canOpenGitCicdLiveObservation(selectedRun) ? openSelectedLiveObservation : undefined
        }
        scopeKey={selectedRun?.id ?? null}
      />

      {canRetryGitCicdFrontend(selectedRun) ? (
        <section className={styles.deploymentStageAlert} aria-live="polite">
          <strong>API는 정상 배포됐지만 웹 활성화가 완료되지 않았습니다.</strong>
          <p>기존 HTTPS URL과 API는 유지됩니다. 검증된 동일 frontend Artifact로 웹 단계만 다시 실행합니다.</p>
          <button
            className={styles.deploymentPrimaryButton}
            disabled={isFrontendRetrying}
            onClick={() => void retryFrontend()}
            type="button"
          >
            {isFrontendRetrying ? "웹 배포 재시도 중" : "웹 배포만 재시도"}
          </button>
        </section>
      ) : null}
      {frontendRetryError ? (
        <p className={styles.deploymentStageAlert} role="alert">{frontendRetryError}</p>
      ) : null}
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
          onOpenLiveObservation={openSelectedLiveObservation}
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
