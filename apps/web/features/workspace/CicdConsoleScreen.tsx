import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode
} from "react";
import type {
  Deployment,
  GitCicdHandoff,
  GitCicdPipelineLog,
  GitCicdPipelineRun,
  ProjectDeliveryProfile
} from "@sketchcatch/types";
import { ApiClientError, getApiErrorMessage } from "../../lib/api-client";
import { copyTextToClipboard } from "../../lib/clipboard";
import {
  applyGitCicdAwsRoleDiff,
  applyGitCicdRepositorySettings,
  createGitCicdHandoff,
  getGitCicdPipelineRun,
  listDeployments,
  listGitCicdHandoffs,
  listGitCicdPipelineLogs,
  listGitCicdPipelineRuns,
  refreshProjectGitCicdPipelineRuns,
  retryGitCicdFrontendRelease
} from "./api";
import { CicdHandoffPanel } from "./CicdHandoffPanel";
import { CicdPipelineRunsPanel } from "./CicdPipelineRunsPanel";
import { CicdStatusBoard } from "./CicdStatusBoard";
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
import { createInfrastructureDeploymentCommand } from "./cicd-deployment-command";
import { getSafePipelineRunLinks } from "./deployment-output-links";
import {
  canOpenGitCicdLiveObservation,
  canRetryGitCicdFrontend,
  getGitCicdLiveObservationSelection
} from "./cicd-frontend-retry";
import type { LiveObservationSelection } from "./live-observation";
import deliveryStyles from "./delivery-center.module.css";
import styles from "./workspace.module.css";

export type CicdConsoleView = "activity" | "logs";

export function CicdConsoleScreen({
  deliveryProfile,
  deliveryProfileErrorMessage,
  isVisible,
  isDeliveryProfileRefreshing,
  onOpenDirectDeployment,
  onOpenLiveObservation,
  onRefreshDeliveryProfile,
  projectId,
  readinessRefreshRequestId = 0,
  setupContent
}: {
  readonly deliveryProfile: ProjectDeliveryProfile;
  readonly deliveryProfileErrorMessage: string;
  readonly isVisible: boolean;
  readonly isDeliveryProfileRefreshing: boolean;
  readonly onOpenDirectDeployment?:
    | ((scope: "application" | "full_stack" | null) => void)
    | undefined;
  readonly onOpenLiveObservation?: ((selection?: LiveObservationSelection) => void) | undefined;
  readonly onRefreshDeliveryProfile: () => Promise<ProjectDeliveryProfile | null>;
  readonly projectId: string;
  readonly readinessRefreshRequestId?: number | undefined;
  readonly setupContent: ReactNode;
}) {
  const [activeView, setActiveView] = useState<CicdConsoleView>("activity");
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [handoffs, setHandoffs] = useState<GitCicdHandoff[]>([]);
  const [selectedHandoffId, setSelectedHandoffId] = useState<string | null>(null);
  const [isHandoffReviewOpen, setIsHandoffReviewOpen] = useState(false);
  const [isHandoffBusy, setIsHandoffBusy] = useState(false);
  const [handoffErrorMessage, setHandoffErrorMessage] = useState("");
  const [commandCopyState, setCommandCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [runs, setRuns] = useState<GitCicdPipelineRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [logs, setLogs] = useState<GitCicdPipelineLog[]>([]);
  const [logsOwner, setLogsOwner] = useState<{
    runId: string | null;
    logRevision: string | null;
  }>({ runId: null, logRevision: null });
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [consoleDataFreshKey, setConsoleDataFreshKey] = useState<string | null>(null);
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
  const repository = deliveryProfile.sourceRepository;
  const config = deliveryProfile.monitoringConfig;
  const readiness = deliveryProfile.readiness;
  const isReadinessRefreshing = isDeliveryProfileRefreshing;
  const readinessErrorMessage = deliveryProfileErrorMessage;

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
  const consoleRequestKey = `${projectId}:${loadRequestId}:${readinessRefreshRequestId}:${readiness.checkedAt}`;
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
  const githubAccountSettingsHref = "/dashboard/settings#github-account-settings-title";
  const readinessByKey = new Map(readiness.items.map((item) => [item.key, item.status]));
  const setupCompletedCount = [
    readinessByKey.get("source_repository") === "ready",
    readinessByKey.get("monitoring_config") === "ready",
    deliveryProfile.deploymentTarget !== null,
    readinessByKey.get("deployment_target") === "ready"
  ].filter(Boolean).length;

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
    setLoadRequestId((requestId) => requestId + 1);
    void onRefreshDeliveryProfile();
  }, [isReadinessRefreshing, isRefreshing, isVisible, onRefreshDeliveryProfile]);

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
      if (!hasCompletedInitialLoadRef.current) {
        setIsInitialLoading(true);
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

      const [consoleResult] = await Promise.allSettled([loadConsoleData()]);
      if (cancelled || !isGitCicdReloadOwner(reloadCoordinatorRef.current, reloadGeneration)) {
        return;
      }

      if (consoleResult.status === "fulfilled") {
        const { initialRuns, loadedDeployments, loadedHandoffs } = consoleResult.value;
        setDeployments(loadedDeployments);
        setHandoffs(loadedHandoffs);
        setSelectedHandoffId((selected) =>
          loadedHandoffs.some((handoff) => handoff.id === selected)
            ? selected
            : (loadedHandoffs[0]?.id ?? null)
        );
        hasExplicitRunSelectionRef.current = false;
        applyRuns(initialRuns.runs);
        setConsoleDataFreshKey(consoleRequestKey);
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
    }

    void loadConsole();
    return () => {
      cancelled = true;
      reloadCoordinatorRef.current = invalidateGitCicdReload(reloadCoordinatorRef.current);
      reloadReservedOrInFlightRef.current = false;
      setConsoleDataFreshKey(null);
      setIsRefreshing(false);
    };
  }, [applyRuns, consoleRequestKey, isVisible, projectId]);

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
    setConsoleDataFreshKey(null);
    const [consoleResult, deliveryResult] = await Promise.allSettled([
      Promise.all([
        refreshProjectGitCicdPipelineRuns(projectId),
        listDeployments(projectId),
        listGitCicdHandoffs(projectId)
      ]),
      onRefreshDeliveryProfile()
    ]);

    if (!isGitCicdReloadOwner(reloadCoordinatorRef.current, reloadGeneration)) return;

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
        deliveryResult.status === "fulfilled" && deliveryResult.value !== null
          ? consoleRequestKey
          : null
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
        message: getApiErrorMessage(consoleResult.reason, "CI/CD 상태를 갱신하지 못했습니다."),
        permissionFailure: isGitHubPermissionFailure(consoleResult.reason)
      });
    }
    reloadCoordinatorRef.current = completeGitCicdReload(
      reloadCoordinatorRef.current,
      reloadGeneration
    );
    reloadReservedOrInFlightRef.current = false;
    setIsRefreshing(false);
  }, [
    applyRuns,
    consoleRequestKey,
    isReadinessRefreshing,
    isRefreshing,
    isVisible,
    onRefreshDeliveryProfile,
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
      setFrontendRetryError(getApiErrorMessage(error, "웹 배포 재시도를 시작하지 못했습니다."));
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

  const consoleError = permissionFailure ? (
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
  ) : null;

  if (isInitialLoading) {
    return (
      <div className={styles.cicdState} role="status">
        최신 PR과 Pipeline 상태를 확인하는 중입니다.
      </div>
    );
  }

  const isConsoleDataUnavailable = !isConsoleDataFresh && screenErrorMessage !== "";

  return (
    <div className={`${styles.cicdConsole} ${deliveryStyles.console}`}>
      {consoleError}

      {!isConsoleDataUnavailable ? (
        <CicdStatusBoard
          canCreateHandoff={canCreateHandoff}
          currentHandoff={currentHandoff}
          deliveryProfile={deliveryProfile}
          existingHandoff={existingHandoff}
          isBusy={isHandoffBusy}
          onOpenCreateReview={() => setIsHandoffReviewOpen(true)}
          onOpenDirectDeployment={onOpenDirectDeployment}
          readinessItems={readinessItems}
          runs={runs}
        />
      ) : null}

      <section className={deliveryStyles.accordionPanel} aria-labelledby="cicd-config-title">
        <header className={deliveryStyles.accordionPanelHeader}>
          <h3 id="cicd-config-title">구성 및 실행</h3>
          <span>
            {setupCompletedCount}개 설정 완료 · {readiness.requiredActionCount}개 조치 필요
          </span>
        </header>

        {setupContent}

        {isConsoleDataUnavailable ? (
          <div className={deliveryStyles.consoleUnavailable} role="status">
            <strong>배포 PR과 Pipeline 상태를 확인할 수 없습니다.</strong>
            <span>위 오류를 해결한 뒤 상태를 새로고침해 주세요.</span>
          </div>
        ) : (
          <>
            <CicdHandoffPanel
              canCreateHandoff={canCreateHandoff}
              commandCopyState={commandCopyState}
              currentHandoff={currentHandoff}
              existingHandoff={existingHandoff}
              handoffErrorMessage={handoffErrorMessage}
              handoffs={handoffs}
              infrastructureDeploymentCommand={infrastructureDeploymentCommand}
              isHandoffBusy={isHandoffBusy}
              isHandoffReviewOpen={isHandoffReviewOpen}
              isReadinessRefreshing={isReadinessRefreshing}
              monitoringConfig={config}
              onApplyAwsRoleDiff={(handoffId) =>
                void runHandoffAction(() => applyGitCicdAwsRoleDiff(handoffId))
              }
              onApplyRepositorySettings={(handoffId) =>
                void runHandoffAction(() => applyGitCicdRepositorySettings(handoffId))
              }
              onCloseCreateReview={() => setIsHandoffReviewOpen(false)}
              onCopyInfrastructureCommand={() => void copyInfrastructureDeploymentCommand()}
              onCreateHandoff={() => void createHandoff()}
              onOpenDirectDeployment={onOpenDirectDeployment}
              onRefreshReadiness={requestReadinessReload}
              onSelectHandoff={setSelectedHandoffId}
              readiness={readiness}
              readinessErrorMessage={readinessErrorMessage}
              readinessItems={readinessItems}
              repository={repository}
            />

            <CicdPipelineRunsPanel
              activeView={activeView}
              canOpenLiveObservation={canOpenGitCicdLiveObservation(selectedRun)}
              canRetryFrontend={canRetryGitCicdFrontend(selectedRun)}
              frontendRetryError={frontendRetryError}
              isFrontendRetrying={isFrontendRetrying}
              isHandoffReady={handoffReady}
              isLogsLoading={isLogsLoading}
              isReadinessRefreshing={isReadinessRefreshing}
              isRefreshing={isRefreshing}
              logs={visibleLogs}
              logsErrorMessage={logsErrorMessage}
              onManualRefresh={() => void manualRefresh()}
              onOpenLiveObservation={openSelectedLiveObservation}
              onRetryFrontend={() => void retryFrontend()}
              onRetryLogs={() => setLogsReloadRequestId((requestId) => requestId + 1)}
              onSelectRun={(runId) => {
                hasExplicitRunSelectionRef.current = true;
                setSelectedRunId(runId);
              }}
              onSelectView={setActiveView}
              outputLinks={outputLinks}
              runs={runs}
              selectedRun={selectedRun}
            />
          </>
        )}
      </section>
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
