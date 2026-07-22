import Link from "next/link";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
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
  createGitCicdHandoff,
  getGitCicdPipelineRun,
  listDeployments,
  listGitCicdHandoffs,
  listGitCicdPipelineLogs,
  listGitCicdPipelineRuns,
  refreshProjectGitCicdPipelineRuns,
  retryGitCicdFrontendRelease,
  setupGitCicdHandoff
} from "./api";
import { CicdHandoffPanel } from "./CicdHandoffPanel";
import { CicdLoadingState } from "./CicdLoadingState";
import { CicdPipelineRunsPanel } from "./CicdPipelineRunsPanel";
import { CicdStatusBoard } from "./CicdStatusBoard";
import { CicdAccordionSection } from "./CicdAccordionSection";
import { CicdTaskRow } from "./CicdTaskRow";
import {
  getCicdReadinessPresentation,
  getCicdTargetSettingState,
  type CicdPhaseId,
  type CicdPhasePresentation,
  type CicdSetupDrawerId
} from "./cicd-readiness-presentation";
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
  handleGitCicdHandoffCreationError,
  invalidateGitCicdReload,
  isGitCicdHandoffCreationEnabled,
  isGitCicdHandoffReady,
  isGitCicdHandoffSetupComplete,
  isGitCicdReloadOwner,
  selectGitCicdHandoffForSetup,
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
  onOpenSetup,
  onRefreshBusyChange,
  onRefreshDeliveryProfile,
  projectId,
  readinessRefreshRequestId = 0
}: {
  readonly deliveryProfile: ProjectDeliveryProfile;
  readonly deliveryProfileErrorMessage: string;
  readonly isVisible: boolean;
  readonly isDeliveryProfileRefreshing: boolean;
  readonly onOpenDirectDeployment?:
    | ((scope: "application" | "full_stack" | null) => void)
    | undefined;
  readonly onOpenLiveObservation?: ((selection?: LiveObservationSelection) => void) | undefined;
  readonly onOpenSetup: (drawer: CicdSetupDrawerId) => void;
  readonly onRefreshBusyChange?: ((isBusy: boolean) => void) | undefined;
  readonly onRefreshDeliveryProfile: () => Promise<ProjectDeliveryProfile | null>;
  readonly projectId: string;
  readonly readinessRefreshRequestId?: number | undefined;
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
  const [isReloadReservedOrInFlight, setIsReloadReservedOrInFlightState] = useState(false);
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
  const configurationPreview = deliveryProfile.handoffConfigurationPreview;
  const readiness = deliveryProfile.readiness;
  const isReadinessRefreshing = isDeliveryProfileRefreshing;
  const readinessErrorMessage = deliveryProfileErrorMessage;
  const setReloadReservedOrInFlight = useCallback((isBusy: boolean): void => {
    reloadReservedOrInFlightRef.current = isBusy;
    setIsReloadReservedOrInFlightState(isBusy);
  }, []);
  const isFullRefreshUnavailable =
    !isVisible ||
    isInitialLoading ||
    isRefreshing ||
    isReadinessRefreshing ||
    isReloadReservedOrInFlight;

  useEffect(() => {
    onRefreshBusyChange?.(isFullRefreshUnavailable);
  }, [isFullRefreshUnavailable, onRefreshBusyChange]);
  useEffect(() => () => onRefreshBusyChange?.(true), [onRefreshBusyChange]);

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
  const existingHandoff = useMemo(
    () =>
      selectGitCicdHandoffForSetup(
        handoffs,
        sourceDeployment?.id ?? null,
        readiness?.approvedApplyPlanArtifactId ?? null
      ),
    [handoffs, readiness?.approvedApplyPlanArtifactId, sourceDeployment]
  );
  const currentHandoff = useMemo(() => {
    const sorted = [...handoffs].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt)
    );
    return (
      sorted.find((handoff) => handoff.id === selectedHandoffId) ??
      existingHandoff ??
      sorted[0] ??
      null
    );
  }, [existingHandoff, handoffs, selectedHandoffId]);
  const handoffRuns = useMemo(
    () => (currentHandoff ? runs.filter((run) => run.handoffId === currentHandoff.id) : []),
    [currentHandoff, runs]
  );
  const runState = useMemo(
    () => getCicdPipelineRunState(handoffRuns, selectedRunId),
    [handoffRuns, selectedRunId]
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
  const canCreateHandoff = isGitCicdHandoffCreationEnabled({
    hasApprovedApplyPlanArtifact: Boolean(readiness?.approvedApplyPlanArtifactId),
    hasConfigurationPreview: configurationPreview !== null,
    hasExistingHandoff: existingHandoff !== null,
    hasMonitoringConfig: config !== null,
    hasRepository: repository !== null,
    hasSourceDeployment: sourceDeployment !== null,
    isBusy: isHandoffBusy,
    isConsoleDataFresh,
    isReadinessReady: handoffReady
  });
  const handoffSetupComplete = isGitCicdHandoffSetupComplete(existingHandoff);
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
    setReloadReservedOrInFlight(true);
    setConsoleDataFreshKey(null);
    setLoadRequestId((requestId) => requestId + 1);
    void onRefreshDeliveryProfile();
  }, [
    isReadinessRefreshing,
    isRefreshing,
    isVisible,
    onRefreshDeliveryProfile,
    setReloadReservedOrInFlight
  ]);

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
      loadedHandoffs.some((handoff) => handoff.id === selected) ? selected : null
    );
  }, [projectId]);

  const runHandoffSetup = useCallback(async (): Promise<void> => {
    if (
      !canCreateHandoff ||
      !repository ||
      !config ||
      !configurationPreview ||
      !sourceDeployment ||
      !readiness?.approvedApplyPlanArtifactId
    ) {
      return;
    }

    setIsHandoffBusy(true);
    setHandoffErrorMessage("");
    try {
      const updated = existingHandoff
        ? await setupGitCicdHandoff(existingHandoff.id)
        : await createGitCicdHandoff({
            projectId,
            ...buildGitCicdHandoffRequest({
              approvedApplyPlanArtifactId: readiness.approvedApplyPlanArtifactId,
              configurationPreview,
              deployment: sourceDeployment,
              monitoringConfig: config,
              repository
            })
          });
      setHandoffs((current) => [updated, ...current.filter((item) => item.id !== updated.id)]);
      setSelectedHandoffId(updated.id);
      setIsHandoffReviewOpen(false);
    } catch (error) {
      try {
        await refreshHandoffs();
      } catch {
        // Preserve the setup error even if the persisted partial state cannot be reloaded.
      }
      setHandoffErrorMessage(
        await handleGitCicdHandoffCreationError(error, onRefreshDeliveryProfile)
      );
    } finally {
      setIsHandoffBusy(false);
    }
  }, [
    config,
    canCreateHandoff,
    configurationPreview,
    existingHandoff,
    onRefreshDeliveryProfile,
    projectId,
    readiness?.approvedApplyPlanArtifactId,
    refreshHandoffs,
    repository,
    sourceDeployment
  ]);

  useEffect(() => {
    if (!isVisible) {
      return;
    }

    const reloadStart = beginGitCicdReload(reloadCoordinatorRef.current);
    if (reloadStart.generation === null) return;
    const reloadGeneration = reloadStart.generation;
    reloadCoordinatorRef.current = reloadStart.coordinator;
    setReloadReservedOrInFlight(true);
    let cancelled = false;

    async function loadConsole(): Promise<void> {
      setConsoleDataFreshKey(null);
      if (!hasCompletedInitialLoadRef.current) {
        setIsInitialLoading(true);
      }

      async function loadConsoleData(): Promise<{
        readonly initialRuns: GitCicdPipelineRun[];
        readonly loadedDeployments: Deployment[];
        readonly loadedHandoffs: GitCicdHandoff[];
        readonly refreshErrorMessage: string | null;
      }> {
        const [pipelineResult, loadedDeployments, loadedHandoffs] = await Promise.all([
          readinessRefreshRequestId > 0
            ? refreshProjectGitCicdPipelineRuns(projectId)
            : listGitCicdPipelineRuns(projectId, { limit: 50 }),
          listDeployments(projectId),
          listGitCicdHandoffs(projectId)
        ]);

        return {
          initialRuns: pipelineResult.runs,
          loadedDeployments,
          loadedHandoffs,
          refreshErrorMessage:
            "targets" in pipelineResult
              ? (pipelineResult.targets.find((target) => target.errorMessage)?.errorMessage ?? null)
              : null
        };
      }

      const [consoleResult] = await Promise.allSettled([loadConsoleData()]);
      if (cancelled || !isGitCicdReloadOwner(reloadCoordinatorRef.current, reloadGeneration)) {
        return;
      }

      if (consoleResult.status === "fulfilled") {
        const { initialRuns, loadedDeployments, loadedHandoffs, refreshErrorMessage } =
          consoleResult.value;
        setDeployments(loadedDeployments);
        setHandoffs(loadedHandoffs);
        setSelectedHandoffId((selected) =>
          loadedHandoffs.some((handoff) => handoff.id === selected) ? selected : null
        );
        hasExplicitRunSelectionRef.current = false;
        applyRuns(initialRuns);
        setConsoleDataFreshKey(consoleRequestKey);
        dispatchRequestState({ type: "success", scope: "list" });
        if (refreshErrorMessage) {
          dispatchRequestState({
            type: "failure",
            scope: "screen",
            message: refreshErrorMessage,
            permissionFailure: false
          });
        }
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
      setReloadReservedOrInFlight(false);
      setIsInitialLoading(false);
    }

    void loadConsole();
    return () => {
      cancelled = true;
      reloadCoordinatorRef.current = invalidateGitCicdReload(reloadCoordinatorRef.current);
      setReloadReservedOrInFlight(false);
      setConsoleDataFreshKey(null);
      setIsRefreshing(false);
    };
  }, [applyRuns, consoleRequestKey, isVisible, projectId, setReloadReservedOrInFlight]);

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
    return <CicdLoadingState />;
  }

  const isConsoleDataUnavailable = !isConsoleDataFresh && screenErrorMessage !== "";
  const presentation = getCicdReadinessPresentation({
    currentHandoff: existingHandoff,
    profile: deliveryProfile,
    runs
  });
  const sourcePhase = getPhase(presentation.phases, "source");
  const targetPhase = getPhase(presentation.phases, "target");
  const prPhase = getPhase(presentation.phases, "pr");
  const pipelinePhase = getPhase(presentation.phases, "pipeline");
  const repositoryConnected = repository !== null;
  const monitoringReady =
    repositoryConnected &&
    config !== null &&
    readiness.items.find((item) => item.key === "monitoring_config")?.status === "ready";
  const sourceSetupComplete = sourcePhase.statusLabel === "완료";
  const target = deliveryProfile.deploymentTarget;
  const targetSettingState = getCicdTargetSettingState(deliveryProfile);
  const deploymentSucceeded =
    sourceDeployment?.status === "SUCCESS" || readiness.initialApplicationReleaseId !== null;

  function activateCurrentTask(): void {
    const action = presentation.currentTask.action;
    if (action.kind === "drawer") {
      onOpenSetup(action.drawer);
      return;
    }
    if (action.kind === "direct_deployment") {
      onOpenDirectDeployment?.(action.scope);
      return;
    }
    if (action.kind === "review_pr") {
      setIsHandoffReviewOpen(true);
      window.requestAnimationFrame(() => openAccordionSection("cicd-handoff"));
      return;
    }
    if (action.kind === "retry_setup") {
      void runHandoffSetup();
      return;
    }
    openAccordionSection(action.sectionId);
  }

  const isCurrentTaskUnavailable =
    isHandoffBusy ||
    (presentation.currentTask.action.kind === "review_pr" && !canCreateHandoff) ||
    (presentation.currentTask.action.kind === "retry_setup" && !canCreateHandoff) ||
    (presentation.currentTask.action.kind === "direct_deployment" && !onOpenDirectDeployment);

  return (
    <div className={`${styles.cicdConsole} ${deliveryStyles.console}`}>
      {consoleError}

      {!isConsoleDataUnavailable ? (
        <CicdStatusBoard
          disabled={isCurrentTaskUnavailable}
          onActivateCurrentTask={activateCurrentTask}
          presentation={presentation}
          suppressPrimaryAction={isHandoffReviewOpen}
        />
      ) : null}

      <section className={deliveryStyles.accordionPanel} aria-labelledby="cicd-config-title">
        <header className={deliveryStyles.accordionPanelHeader}>
          <h3 id="cicd-config-title">준비 체크리스트</h3>
        </header>

        {isConsoleDataUnavailable ? (
          <div className={deliveryStyles.consoleUnavailable} role="status">
            <strong>배포 PR과 Pipeline 상태를 확인할 수 없습니다.</strong>
            <span>위 오류를 해결한 뒤 상태를 새로고침해 주세요.</span>
          </div>
        ) : (
          <>
            <CicdAccordionSection
              defaultOpen={presentation.currentPhase === "source"}
              id="cicd-source-repository"
              isCurrent={presentation.currentPhase === "source"}
              metadata={
                <span className={deliveryStyles.accordionSingleMeta}>{sourcePhase.summary}</span>
              }
              openWhen={presentation.currentPhase === "source"}
              phaseNumber="01"
              statusLabel={sourcePhase.statusLabel}
              statusTone={sourcePhase.tone}
              title="저장소 및 변경 감지"
            >
              <ul className={deliveryStyles.taskList} aria-label="저장소 및 변경 감지 작업">
                <CicdTaskRow
                  actionLabel={repositoryConnected ? "변경하기" : "연결하기"}
                  detail={
                    repository?.defaultBranch ? `Branch · ${repository.defaultBranch}` : undefined
                  }
                  label="GitHub 저장소"
                  onActivate={() => onOpenSetup("repository")}
                  statusLabel={repositoryConnected ? "완료" : "미연결"}
                  statusTone={repositoryConnected ? "complete" : "current"}
                  value={repository ? `${repository.owner}/${repository.name}` : "—"}
                />
                <CicdTaskRow
                  actionLabel={repositoryConnected ? "설정하기" : undefined}
                  disabledReason={repositoryConnected ? undefined : "저장소 연결 후 설정"}
                  detail={
                    config
                      ? formatMonitoringPaths(config.appPath.path, config.infraPath.path)
                      : undefined
                  }
                  label="변경 감지"
                  onActivate={repositoryConnected ? () => onOpenSetup("monitoring") : undefined}
                  statusLabel={monitoringReady ? "완료" : repositoryConnected ? "미설정" : "잠김"}
                  statusTone={
                    monitoringReady ? "complete" : repositoryConnected ? "current" : "pending"
                  }
                  value={
                    config
                      ? `${config.monitorBranch} Branch와 앱·인프라 경로`
                      : repositoryConnected
                        ? "Branch와 앱·인프라 경로 설정"
                        : "—"
                  }
                />
              </ul>
            </CicdAccordionSection>

            <CicdAccordionSection
              defaultOpen={presentation.currentPhase === "target"}
              id="deployment-target-title"
              isCurrent={presentation.currentPhase === "target"}
              metadata={
                <span className={deliveryStyles.accordionSingleMeta}>{targetPhase.summary}</span>
              }
              openWhen={presentation.currentPhase === "target"}
              phaseNumber="02"
              statusLabel={targetPhase.statusLabel}
              statusTone={targetPhase.tone}
              title="AWS 배포 대상"
            >
              <ul className={deliveryStyles.taskList} aria-label="AWS 배포 대상 작업">
                <CicdTaskRow
                  actionLabel={sourceSetupComplete ? "설정하기" : undefined}
                  disabledReason={
                    sourceSetupComplete ? undefined : "저장소 및 변경 감지 완료 후 설정"
                  }
                  label="AWS 연결"
                  onActivate={sourceSetupComplete ? () => onOpenSetup("target") : undefined}
                  statusLabel={
                    targetSettingState.awsConnectionReady
                      ? "완료"
                      : sourceSetupComplete
                        ? "미연결"
                        : "시작 전"
                  }
                  statusTone={
                    targetSettingState.awsConnectionReady
                      ? "complete"
                      : presentation.currentPhase === "target"
                        ? "current"
                        : "pending"
                  }
                  value={target?.connectionId ? "연결된 AWS 계정" : "—"}
                />
                <CicdTaskRow
                  actionLabel={sourceSetupComplete ? "설정하기" : undefined}
                  disabledReason={sourceSetupComplete ? undefined : "AWS 연결 후 설정"}
                  label="Region"
                  onActivate={sourceSetupComplete ? () => onOpenSetup("target") : undefined}
                  statusLabel={targetSettingState.regionReady ? "완료" : "미설정"}
                  statusTone={targetSettingState.regionReady ? "complete" : "pending"}
                  value={target?.region ?? "—"}
                />
                <CicdTaskRow
                  actionLabel={sourceSetupComplete ? "설정하기" : undefined}
                  disabledReason={sourceSetupComplete ? undefined : "AWS 연결 후 설정"}
                  label="실행 방식"
                  onActivate={sourceSetupComplete ? () => onOpenSetup("target") : undefined}
                  statusLabel={targetSettingState.runtimeTargetReady ? "완료" : "미설정"}
                  statusTone={targetSettingState.runtimeTargetReady ? "complete" : "pending"}
                  value={target ? formatRuntimeTarget(target.runtimeTargetKind) : "—"}
                />
                <CicdTaskRow
                  actionLabel={sourceSetupComplete ? "설정하기" : undefined}
                  disabledReason={sourceSetupComplete ? undefined : "AWS 연결 후 설정"}
                  label="빌드 설정"
                  onActivate={sourceSetupComplete ? () => onOpenSetup("target") : undefined}
                  statusLabel={targetSettingState.buildConfigReady ? "완료" : "미설정"}
                  statusTone={targetSettingState.buildConfigReady ? "complete" : "pending"}
                  value={target?.confirmedBuildConfig ? "Repository 빌드 기준 확인됨" : "—"}
                />
              </ul>
            </CicdAccordionSection>

            <CicdHandoffPanel
              canCreateHandoff={canCreateHandoff}
              buildVerification={deliveryProfile.buildVerification}
              commandCopyState={commandCopyState}
              configurationPreview={configurationPreview}
              currentHandoff={currentHandoff}
              existingHandoff={existingHandoff}
              handoffErrorMessage={handoffErrorMessage}
              handoffs={handoffs}
              infrastructureDeploymentCommand={infrastructureDeploymentCommand}
              deploymentSucceeded={deploymentSucceeded}
              deploymentTarget={target}
              isHandoffBusy={isHandoffBusy}
              isHandoffReviewOpen={isHandoffReviewOpen}
              isReadinessRefreshing={isReadinessRefreshing}
              monitoringConfig={config}
              onCloseCreateReview={() => setIsHandoffReviewOpen(false)}
              onCopyInfrastructureCommand={() => void copyInfrastructureDeploymentCommand()}
              onCreateHandoff={() => void runHandoffSetup()}
              onOpenDirectDeployment={onOpenDirectDeployment}
              onRefreshReadiness={requestReadinessReload}
              onSelectHandoff={setSelectedHandoffId}
              isCurrent={presentation.currentPhase === "pr"}
              phaseStatusLabel={prPhase.statusLabel}
              phaseStatusTone={prPhase.tone}
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
              isHandoffReady={handoffSetupComplete}
              isLogsLoading={isLogsLoading}
              logs={visibleLogs}
              logsErrorMessage={logsErrorMessage}
              onOpenLiveObservation={openSelectedLiveObservation}
              onRetryFrontend={() => void retryFrontend()}
              onRetryLogs={() => setLogsReloadRequestId((requestId) => requestId + 1)}
              onSelectRun={(runId) => {
                hasExplicitRunSelectionRef.current = true;
                setSelectedRunId(runId);
              }}
              onSelectView={setActiveView}
              outputLinks={outputLinks}
              isCurrent={presentation.currentPhase === "pipeline"}
              phaseStatusLabel={pipelinePhase.statusLabel}
              phaseStatusTone={pipelinePhase.tone}
              runs={handoffRuns}
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

function getPhase(
  phases: readonly CicdPhasePresentation[],
  phaseId: CicdPhaseId
): CicdPhasePresentation {
  const phase = phases.find((item) => item.id === phaseId);
  if (!phase) throw new Error(`Missing CI/CD phase: ${phaseId}`);
  return phase;
}

function formatMonitoringPaths(appPath: string, infraPath: string): string {
  return `앱 ${appPath || "/"} · 인프라 ${infraPath || "/"}`;
}

function formatRuntimeTarget(
  runtimeTarget: NonNullable<ProjectDeliveryProfile["deploymentTarget"]>["runtimeTargetKind"]
): string {
  return {
    ec2_asg: "EC2 Auto Scaling",
    ecs_fargate: "ECS Fargate",
    lambda: "Lambda",
    static_site: "Static Site"
  }[runtimeTarget];
}

function openAccordionSection(sectionId: string): void {
  const section = document.getElementById(sectionId);
  const toggle = section?.querySelector<HTMLButtonElement>("button[aria-expanded]");
  if (!section || !toggle) return;
  if (toggle.getAttribute("aria-expanded") !== "true") toggle.click();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  section.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  window.requestAnimationFrame(() => toggle.focus());
}
