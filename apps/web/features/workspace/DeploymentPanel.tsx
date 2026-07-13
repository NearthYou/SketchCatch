import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Dispatch,
  KeyboardEvent as ReactKeyboardEvent,
  SetStateAction
} from "react";
import type {
  AiPreDeploymentAnalysisResult,
  AiSafetyExplanation,
  AwsConnection,
  CheckFinding,
  DeployedResource,
  Deployment,
  DeploymentFailureExplanation,
  DeploymentLiveProfile,
  DiagramJson,
  DeploymentLog,
  GitCicdHandoff,
  GitCicdHandoffPipelineStatus,
  SourceRepository,
  TerraformDiagnostic,
  TerraformSourceLocation,
  TerraformSyncFileInput,
  TerraformOutput
} from "@sketchcatch/types";
import { Clipboard, ClipboardCheck, Code2, GitBranch, Maximize2, ShieldCheck, Trash2, X } from "lucide-react";
import { DashboardIcon } from "../../components/dashboard/dashboard-icons";
import { SelectMenu, type SelectMenuOption } from "../../components/ui/SelectMenu";
import { getApiErrorMessage } from "../../lib/api-client";
import {
  approveDeploymentPlan,
  applyGitCicdAwsRoleDiff,
  applyGitCicdRepositorySettings,
  applyGitCicdRepositorySettingsWithGitHubOAuth,
  cancelDeployment as cancelDeploymentRun,
  createGitCicdGitHubOAuthStartUrl,
  createDeployment,
  createGitCicdHandoff,
  getGitCicdHandoffPipelineStatus,
  getAiPreDeploymentDeepScan,
  getDeploymentFailureExplanation,
  listAwsConnections,
  listDeploymentResources,
  listDeploymentLogs,
  listDeployments,
  listGitCicdHandoffs,
  listSourceRepositories,
  listTerraformOutputs,
  runDeploymentInit,
  runDeploymentApply,
  runDeploymentDestroy,
  runDeploymentDestroyPlan,
  runDeploymentPlan,
  runAiPreDeploymentCheck,
  runAiSafetyFindingExplanation,
  streamDeploymentLogs
} from "./api";
import {
  getDeploymentActionState,
  getGitCicdHandoffStatusLabel,
  getDeploymentLogMessageTokens,
  getDeploymentLogTone,
  getRecommendedDeploymentLiveProfile,
  hasCompleteDeploymentApprovalSnapshot,
  shouldAutoRefreshDeployment,
  shouldAutoRefreshGitCicdHandoff,
  shouldShowDeploymentInfoValue,
  type DeploymentLogMessageToken
} from "./deployment-actions";
import {
  createWorkspaceAiBoardSnapshot,
  isWorkspaceAiResultStale
} from "./workspace-ai-panel-state";
import {
  addTerraformDiagnosticsToPreDeploymentAnalysis,
  createPreDeploymentAnalysisFromTerraformDiagnostics
} from "./pre-deployment-diagnostics";
import type { AiRequestState } from "./WorkspaceAiPanelPieces";
import type { SavedWorkspaceTerraformArtifact } from "./workspace-deployment-artifacts";
import type { RequestState } from "./workspace-right-panel.types";
import {
  canLoadDeploymentData,
  type DeploymentAvailability
} from "./deployment-availability";
import {
  getDirectDeploymentFlow,
  type DirectDeploymentPreflightState,
  type DirectDeploymentStepId
} from "./deployment-console-state";
import { getDeploymentDurationLabel } from "./deployment-duration";
import styles from "./workspace.module.css";

type DeploymentRuntimeSnapshot = {
  readonly deployments: Deployment[];
  readonly gitCicdHandoffs: GitCicdHandoff[];
  readonly sourceRepositories: SourceRepository[];
  readonly logs: DeploymentLog[];
  readonly resources: DeployedResource[];
  readonly outputs: TerraformOutput[];
};
type DeploymentPanelSnapshot = DeploymentRuntimeSnapshot & {
  readonly awsConnections: AwsConnection[];
};

type DeploymentConsoleTab = "direct" | "git-cicd" | "history";

export type DeploymentPreDeploymentCheckState = {
  readonly analysis: AiPreDeploymentAnalysisResult | null;
  readonly errorMessage: string;
  readonly fingerprint: string | null;
  readonly requestState: AiRequestState;
};
export const initialPreDeploymentCheckState: DeploymentPreDeploymentCheckState = {
  analysis: null,
  errorMessage: "",
  fingerprint: null,
  requestState: "idle"
};

export function DeploymentPanel({
  currentNodeCount,
  deploymentAvailability,
  diagramJson,
  fullScreenOnly = false,
  hasUnsavedDeploymentBaseline,
  initialExpanded = false,
  onExpandedClose,
  onGetTerraformFiles,
  onOpenFindingTerraformSource,
  onPrepareDeploymentArtifacts,
  onPreDeploymentCheckStateChange,
  onValidateTerraformDiagnostics,
  preDeploymentCheckState,
  projectId,
  projectName
}: {
  readonly currentNodeCount: number;
  readonly deploymentAvailability: DeploymentAvailability;
  readonly diagramJson: DiagramJson;
  readonly fullScreenOnly?: boolean | undefined;
  readonly hasUnsavedDeploymentBaseline: boolean;
  readonly initialExpanded?: boolean | undefined;
  readonly onExpandedClose?: (() => void) | undefined;
  readonly onGetTerraformFiles: () => readonly TerraformSyncFileInput[];
  readonly onOpenFindingTerraformSource: (finding: CheckFinding) => TerraformSourceLocation | null;
  readonly onPrepareDeploymentArtifacts: () => Promise<SavedWorkspaceTerraformArtifact>;
  readonly onPreDeploymentCheckStateChange: Dispatch<SetStateAction<DeploymentPreDeploymentCheckState>>;
  readonly onValidateTerraformDiagnostics: () => Promise<TerraformDiagnostic[]>;
  readonly preDeploymentCheckState: DeploymentPreDeploymentCheckState;
  readonly projectId: string;
  readonly projectName: string;
}) {
  const [awsConnections, setAwsConnections] = useState<AwsConnection[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [gitCicdHandoffs, setGitCicdHandoffs] = useState<GitCicdHandoff[]>([]);
  const [sourceRepositories, setSourceRepositories] = useState<SourceRepository[]>([]);
  const [deploymentLogs, setDeploymentLogs] = useState<DeploymentLog[]>([]);
  const [deploymentResources, setDeploymentResources] = useState<DeployedResource[]>([]);
  const [terraformOutputs, setTerraformOutputs] = useState<TerraformOutput[]>([]);
  const [selectedAwsConnectionId, setSelectedAwsConnectionId] = useState("");
  const [selectedLiveProfile, setSelectedLiveProfile] =
    useState<DeploymentLiveProfile>(() => getRecommendedDeploymentLiveProfile(diagramJson));
  const [trafficSimulatorState, setTrafficSimulatorState] =
    useState<RequestState>("idle");
  const [trafficSimulatorSummary, setTrafficSimulatorSummary] = useState("");
  const [selectedDeploymentId, setSelectedDeploymentId] = useState("");
  const [durationNow, setDurationNow] = useState(() => Date.now());
  const [selectedGitCicdHandoffId, setSelectedGitCicdHandoffId] = useState("");
  const [gitCicdPipelineStatusSource, setGitCicdPipelineStatusSource] =
    useState<GitCicdHandoffPipelineStatus["source"] | null>(null);
  const [showApplyConfirmation, setShowApplyConfirmation] = useState(false);
  const [showDestroyConfirmation, setShowDestroyConfirmation] = useState(false);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [failureExplanation, setFailureExplanation] =
    useState<DeploymentFailureExplanation | null>(null);
  const [failureExplanationState, setFailureExplanationState] = useState<RequestState>("idle");
  const [failureExplanationErrorMessage, setFailureExplanationErrorMessage] = useState("");
  const [isDeploymentExpanded, setIsDeploymentExpanded] = useState(initialExpanded);
  const [deploymentConsoleTab, setDeploymentConsoleTab] =
    useState<DeploymentConsoleTab>("direct");
  const [selectedDirectStepId, setSelectedDirectStepId] =
    useState<DirectDeploymentStepId>("save");
  const trafficAbortControllerRef = useRef<AbortController | null>(null);
  const deploymentCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const deploymentDialogRef = useRef<HTMLDivElement | null>(null);
  const deploymentTabRefs = useRef<Partial<Record<DeploymentConsoleTab, HTMLButtonElement>>>({});
  const deploymentConfirmationOpenRef = useRef(false);
  deploymentConfirmationOpenRef.current = showApplyConfirmation || showDestroyConfirmation;
  const isDeploymentOverlayOpen = fullScreenOnly || isDeploymentExpanded;

  const verifiedAwsConnections = useMemo(
    () => awsConnections.filter((connection) => connection.status === "verified"),
    [awsConnections]
  );
  const awsConnectionOptions = useMemo<SelectMenuOption[]>(
    () =>
      verifiedAwsConnections.map((connection) => ({
        detail: connection.region,
        label: connection.accountId ?? "Unknown AWS account",
        value: connection.id
      })),
    [verifiedAwsConnections]
  );
  const liveProfileOptions = useMemo<SelectMenuOption[]>(
    () => [
      {
        detail: "VPC, EC2, S3 bucket 중심의 기본 안전 범위",
        label: "Practice",
        value: "practice"
      },
      {
        detail: "S3 website, EC2 API, ALB, ASG demo",
        label: "Demo web service",
        value: "demo_web_service"
      },
      {
        detail: "Demo web service plus RDS",
        label: "AWS Template deployment",
        value: "demo_web_service_with_rds"
      }
    ],
    []
  );
  const deploymentOptions = useMemo<SelectMenuOption[]>(
    () =>
      deployments.map((deployment) => ({
        detail: formatDate(deployment.createdAt),
        label: deployment.status,
        value: deployment.id
      })),
    [deployments]
  );
  const gitCicdHandoffOptions = useMemo<SelectMenuOption[]>(
    () =>
      gitCicdHandoffs.map((handoff) => ({
        detail: `${handoff.repositoryOwner}/${handoff.repositoryName}`,
        label: getGitCicdHandoffStatusLabel(handoff),
        value: handoff.id
      })),
    [gitCicdHandoffs]
  );
  const selectedDeployment = useMemo(
    () => deployments.find((deployment) => deployment.id === selectedDeploymentId) ?? null,
    [deployments, selectedDeploymentId]
  );
  useEffect(() => {
    setDurationNow(Date.now());

    if (selectedDeployment?.status !== "RUNNING") {
      return;
    }

    const intervalId = window.setInterval(() => setDurationNow(Date.now()), 1_000);

    return () => window.clearInterval(intervalId);
  }, [selectedDeployment?.id, selectedDeployment?.status]);
  const selectedGitCicdHandoff = useMemo(
    () => gitCicdHandoffs.find((handoff) => handoff.id === selectedGitCicdHandoffId) ?? null,
    [gitCicdHandoffs, selectedGitCicdHandoffId]
  );
  const activeGitHubSourceRepository = useMemo(
    () =>
      sourceRepositories.find(
        (repository) => repository.provider === "github" && repository.status === "active"
      ) ?? null,
    [sourceRepositories]
  );
  const projectGithubSettingsHref = `/dashboard/projects/${encodeURIComponent(projectId)}/settings?tab=github`;
  const hasGitCicdHandoffs = gitCicdHandoffs.length > 0;
  const canStartDeploymentReview =
    selectedAwsConnectionId.length > 0 &&
    requestState !== "loading";
  const hasCurrentPlan = Boolean(selectedDeployment?.currentPlanArtifactId);
  const apiBaseUrlOutput = useMemo(
    () => terraformOutputs.find((output) => output.name === "api_base_url") ?? null,
    [terraformOutputs]
  );
  const apiBaseUrl = apiBaseUrlOutput ? formatOutputValue(apiBaseUrlOutput) : "";
  const staticSiteUrlOutput = useMemo(
    () => terraformOutputs.find((output) => output.name === "static_site_url") ?? null,
    [terraformOutputs]
  );
  const staticSiteUrl = staticSiteUrlOutput ? formatOutputValue(staticSiteUrlOutput) : "";
  const deploymentActions = getDeploymentActionState(selectedDeployment, requestState);
  const canRunPlan = deploymentActions.canRunApplyPlan;
  const canApprovePlan = deploymentActions.canApprovePlan;
  const canApply = deploymentActions.canApply;
  const canRunDestroyPlan = deploymentActions.canRunDestroyPlan;
  const canDestroy = deploymentActions.canDestroy;
  const canCancelDeployment = deploymentActions.canCancelDeployment;
  const shouldShowApplyButton = deploymentActions.shouldShowApplyButton;
  const shouldShowApprovePlanButton = deploymentActions.shouldShowApprovePlanButton;
  const shouldShowDestroyPlanButton = deploymentActions.shouldShowDestroyPlanButton;
  const shouldShowDestroyButton = deploymentActions.shouldShowDestroyButton;
  const deploymentActionHint = selectedDeployment
    ? getDeploymentActionHint(selectedDeployment)
    : "";
  const DeploymentBaselineIcon = hasUnsavedDeploymentBaseline ? Clipboard : ClipboardCheck;
  const shouldAutoRefreshSelectedDeployment = shouldAutoRefreshDeployment(selectedDeployment);
  const shouldAutoRefreshSelectedGitCicdHandoff =
    shouldAutoRefreshGitCicdHandoff(selectedGitCicdHandoff);
  const canCreateGitCicdHandoff = Boolean(activeGitHubSourceRepository && selectedDeployment);
  const preDeploymentAnalysis = preDeploymentCheckState.analysis;
  const preDeploymentState = preDeploymentCheckState.requestState;
  const preDeploymentErrorMessage = preDeploymentCheckState.errorMessage;
  const preDeploymentFingerprint = preDeploymentCheckState.fingerprint;
  const boardSnapshot = useMemo(
    () => createWorkspaceAiBoardSnapshot(diagramJson),
    [diagramJson]
  );
  const hasStalePreDeploymentAnalysis =
    preDeploymentAnalysis !== null &&
    isWorkspaceAiResultStale(preDeploymentFingerprint, boardSnapshot.fingerprint);
  const directPreflightState = getDirectPreflightState({
    analysis: preDeploymentAnalysis,
    errorMessage: preDeploymentErrorMessage,
    hasStaleAnalysis: hasStalePreDeploymentAnalysis,
    requestState: preDeploymentState
  });
  const canRunDeploymentReviewStep =
    canStartDeploymentReview &&
    preDeploymentState !== "loading";
  const primaryDeploymentStepStatus = getPrimaryDeploymentStepStatus(selectedDeployment);
  const directDeploymentFlow = getDirectDeploymentFlow({
    actions: deploymentActions,
    deployment: selectedDeployment,
    hasUnsavedBaseline: hasUnsavedDeploymentBaseline,
    preflightState: directPreflightState,
    requestState
  });

  useEffect(() => {
    setSelectedDirectStepId(directDeploymentFlow.activeStepId);
  }, [directDeploymentFlow.activeStepId]);

  useEffect(() => {
    if (shouldShowApplyButton) {
      setShowApplyConfirmation(true);
    }
  }, [shouldShowApplyButton]);

  useEffect(() => {
    if (!isDeploymentOverlayOpen) {
      return;
    }

    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => {
      deploymentCloseButtonRef.current?.focus();
    });

    function handleEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        if (deploymentConfirmationOpenRef.current) {
          setShowApplyConfirmation(false);
          setShowDestroyConfirmation(false);
          return;
        }
        closeExpandedDeployment();
      }
    }

    function trapDialogFocus(event: KeyboardEvent): void {
      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = Array.from(
        deploymentDialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);

      if (!firstElement || !lastElement) {
        return;
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", handleEscape);
    document.addEventListener("keydown", trapDialogFocus);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("keydown", trapDialogFocus);
      document.body.style.overflow = previousBodyOverflow;
      window.requestAnimationFrame(() => {
        const deploymentTrigger = document.querySelector<HTMLElement>(
          "[data-deployment-console-trigger]"
        );
        (deploymentTrigger ?? previousFocus)?.focus();
      });
    };
  }, [isDeploymentOverlayOpen]);

  function handleDeploymentTabKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    currentTab: DeploymentConsoleTab
  ): void {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();
    const tabs: readonly DeploymentConsoleTab[] = ["direct", "git-cicd", "history"];
    const currentIndex = tabs.indexOf(currentTab);
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextTab = tabs[(currentIndex + direction + tabs.length) % tabs.length]!;
    setDeploymentConsoleTab(nextTab);
    window.requestAnimationFrame(() => deploymentTabRefs.current[nextTab]?.focus());
  }
  const loadDeploymentRuntimeSnapshot = useCallback(async (): Promise<DeploymentRuntimeSnapshot> => {
    const [
      nextDeployments,
      nextGitCicdHandoffs,
      nextSourceRepositories,
      nextLogs,
      nextResources,
      nextOutputs
    ] =
      await Promise.all([
      listDeployments(projectId),
      listGitCicdHandoffs(projectId),
      listSourceRepositories(projectId),
      selectedDeploymentId ? listDeploymentLogs(selectedDeploymentId) : Promise.resolve([]),
      selectedDeploymentId ? listDeploymentResources(selectedDeploymentId) : Promise.resolve([]),
      selectedDeploymentId ? listTerraformOutputs(selectedDeploymentId) : Promise.resolve([])
    ]);

    return {
      deployments: nextDeployments,
      gitCicdHandoffs: nextGitCicdHandoffs,
      sourceRepositories: nextSourceRepositories,
      logs: nextLogs,
      resources: nextResources,
      outputs: nextOutputs
    };
  }, [projectId, selectedDeploymentId]);

  const applyDeploymentRuntimeSnapshot = useCallback((snapshot: DeploymentRuntimeSnapshot): void => {
    setDeployments(snapshot.deployments);
    setGitCicdHandoffs(snapshot.gitCicdHandoffs);
    setSourceRepositories(snapshot.sourceRepositories);
    setDeploymentLogs(snapshot.logs);
    setDeploymentResources(snapshot.resources);
    setTerraformOutputs(snapshot.outputs);
    setSelectedGitCicdHandoffId((currentId) =>
      snapshot.gitCicdHandoffs.some((handoff) => handoff.id === currentId)
        ? currentId
        : snapshot.gitCicdHandoffs[0]?.id ?? ""
    );
  }, []);

  const loadDeploymentPanelSnapshot = useCallback(async (): Promise<DeploymentPanelSnapshot> => {
    const [nextConnections, runtimeSnapshot] = await Promise.all([
      listAwsConnections(),
      loadDeploymentRuntimeSnapshot()
    ]);

    return {
      ...runtimeSnapshot,
      awsConnections: nextConnections
    };
  }, [loadDeploymentRuntimeSnapshot]);

  const applyDeploymentPanelSnapshot = useCallback((snapshot: DeploymentPanelSnapshot): void => {
    const latestVerifiedConnection = snapshot.awsConnections.find(
      (connection) => connection.status === "verified"
    );

    setAwsConnections(snapshot.awsConnections);
    applyDeploymentRuntimeSnapshot(snapshot);
    setSelectedAwsConnectionId((currentId) =>
      snapshot.awsConnections.some((connection) => connection.id === currentId)
        ? currentId
        : latestVerifiedConnection?.id ?? ""
    );
  }, [applyDeploymentRuntimeSnapshot]);

  useEffect(() => {
    if (!canLoadDeploymentData(deploymentAvailability)) {
      setErrorMessage("");
      setRequestState("idle");
      return;
    }

    let cancelled = false;

    async function loadDeploymentData(): Promise<void> {
      await runRequest(async () => {
        const snapshot = await loadDeploymentPanelSnapshot();

        if (cancelled) {
          return;
        }

        applyDeploymentPanelSnapshot(snapshot);

        const latestVerifiedConnection = snapshot.awsConnections.find(
          (connection) => connection.status === "verified"
        );
        const latestDeployment = snapshot.deployments[0];
        const latestGitCicdHandoff = snapshot.gitCicdHandoffs[0];

        setSelectedAwsConnectionId((currentId) => currentId || latestVerifiedConnection?.id || "");
        setSelectedDeploymentId((currentId) => currentId || latestDeployment?.id || "");
        setSelectedGitCicdHandoffId((currentId) => currentId || latestGitCicdHandoff?.id || "");
      }, "배포 정보를 불러오지 못했습니다.");
    }

    void loadDeploymentData();

    return () => {
      cancelled = true;
    };
  }, [applyDeploymentPanelSnapshot, deploymentAvailability, loadDeploymentPanelSnapshot]);

  useEffect(() => {
    if (deployments.length === 0) {
      setIsDeploymentExpanded(false);
    }
  }, [deployments.length]);

  useEffect(() => {
    trafficAbortControllerRef.current?.abort();
    trafficAbortControllerRef.current = null;
    setTrafficSimulatorState("idle");
    setTrafficSimulatorSummary("");
    return () => {
      trafficAbortControllerRef.current?.abort();
      trafficAbortControllerRef.current = null;
    };
  }, [selectedDeploymentId]);

  useEffect(
    () => () => {
      trafficAbortControllerRef.current?.abort();
    },
    []
  );

  useEffect(() => {
    if (!selectedDeploymentId) {
      setDeploymentLogs([]);
      setDeploymentResources([]);
      setTerraformOutputs([]);
      setFailureExplanation(null);
      setFailureExplanationState("idle");
      setFailureExplanationErrorMessage("");
      setShowApplyConfirmation(false);
      setShowDestroyConfirmation(false);
      return;
    }

    let cancelled = false;

    async function loadApplyDetails(): Promise<void> {
      await runRequest(async () => {
        const [logs, resources, outputs] = await Promise.all([
          listDeploymentLogs(selectedDeploymentId),
          listDeploymentResources(selectedDeploymentId),
          listTerraformOutputs(selectedDeploymentId)
        ]);

        if (!cancelled) {
          setDeploymentLogs(logs);
          setDeploymentResources(resources);
          setTerraformOutputs(outputs);
          setShowApplyConfirmation(false);
          setShowDestroyConfirmation(false);
        }
      }, "배포 로그를 불러오지 못했습니다.");
    }

    void loadApplyDetails();

    return () => {
      cancelled = true;
    };
  }, [selectedDeploymentId]);

  useEffect(() => {
    if (!selectedDeployment || selectedDeployment.status !== "FAILED") {
      setFailureExplanation(null);
      setFailureExplanationState("idle");
      setFailureExplanationErrorMessage("");
      return;
    }

    let cancelled = false;
    const deploymentIdForExplanation = selectedDeployment.id;

    async function loadFailureExplanation(): Promise<void> {
      setFailureExplanationState("loading");
      setFailureExplanationErrorMessage("");

      try {
        const explanation = await getDeploymentFailureExplanation(deploymentIdForExplanation);

        if (!cancelled) {
          setFailureExplanation(explanation);
          setFailureExplanationState("idle");
        }
      } catch (error) {
        if (!cancelled) {
          setFailureExplanation(null);
          setFailureExplanationState("error");
          setFailureExplanationErrorMessage(
            getApiErrorMessage(error, "Deployment 실패 설명을 불러오지 못했습니다.")
          );
        }
      }
    }

    void loadFailureExplanation();

    return () => {
      cancelled = true;
    };
  }, [
    selectedDeployment?.errorSummary,
    selectedDeployment?.failureStage,
    selectedDeployment?.id,
    selectedDeployment?.status
  ]);

  useEffect(() => {
    if (!selectedDeploymentId || selectedDeployment?.status !== "RUNNING") {
      return;
    }

    const controller = new AbortController();

    void streamDeploymentLogs({
      deploymentId: selectedDeploymentId,
      sinceSequence: 0,
      signal: controller.signal,
      onLog: (log) => {
        setDeploymentLogs((currentLogs) => mergeDeploymentLog(currentLogs, log));
      }
    }).catch((error) => {
      if (!controller.signal.aborted) {
        setErrorMessage(getApiErrorMessage(error, "Deployment 로그 스트림 연결에 실패했습니다."));
      }
    });

    return () => {
      controller.abort();
    };
  }, [selectedDeploymentId, selectedDeployment?.status]);

  useEffect(() => {
    if (!shouldAutoRefreshSelectedDeployment) {
      return;
    }

    let cancelled = false;
    let isRefreshing = false;

    async function refreshSnapshot(): Promise<void> {
      if (isRefreshing) {
        return;
      }

      isRefreshing = true;

      try {
        const snapshot = await loadDeploymentRuntimeSnapshot();

        if (!cancelled) {
          applyDeploymentRuntimeSnapshot(snapshot);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(getApiErrorMessage(error, "Deployment 상태 자동 갱신에 실패했습니다."));
        }
      } finally {
        isRefreshing = false;
      }
    }

    const intervalId = window.setInterval(() => {
      void refreshSnapshot();
    }, 2500);

    void refreshSnapshot();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    applyDeploymentRuntimeSnapshot,
    loadDeploymentRuntimeSnapshot,
    shouldAutoRefreshSelectedDeployment
  ]);

  useEffect(() => {
    if (!selectedGitCicdHandoffId || !shouldAutoRefreshSelectedGitCicdHandoff) {
      return;
    }

    let cancelled = false;
    let isRefreshing = false;

    async function refreshPipelineStatus(): Promise<void> {
      if (isRefreshing) {
        return;
      }

      isRefreshing = true;

      try {
        const pipelineStatus = await getGitCicdHandoffPipelineStatus(selectedGitCicdHandoffId);

        if (!cancelled) {
          setGitCicdPipelineStatusSource(pipelineStatus.source);
          setGitCicdHandoffs((currentHandoffs) =>
            currentHandoffs.map((handoff) =>
              handoff.id === pipelineStatus.id
                ? {
                    ...handoff,
                    status: pipelineStatus.status,
                    pullRequestUrl: pipelineStatus.pullRequestUrl,
                    pullRequestNumber: pipelineStatus.pullRequestNumber,
                    mergeCommitSha: pipelineStatus.mergeCommitSha,
                    pipelineRunUrl: pipelineStatus.pipelineRunUrl,
                    infraPipelineRunUrl: pipelineStatus.infraPipelineRunUrl,
                    infraPipelineStatus: pipelineStatus.infraPipelineStatus,
                    appPipelineRunUrl: pipelineStatus.appPipelineRunUrl,
                    appPipelineStatus: pipelineStatus.appPipelineStatus,
                    destroyPipelineRunUrl: pipelineStatus.destroyPipelineRunUrl,
                    destroyPipelineStatus: pipelineStatus.destroyPipelineStatus,
                    environmentName: pipelineStatus.environmentName,
                    staticSiteUrl: pipelineStatus.staticSiteUrl,
                    apiBaseUrl: pipelineStatus.apiBaseUrl,
                    statusMessage: pipelineStatus.statusMessage,
                    updatedAt: pipelineStatus.updatedAt
                  }
                : handoff
            )
          );
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Git/CI/CD pipeline status refresh failed:", error);
        }
      } finally {
        isRefreshing = false;
      }
    }

    const intervalId = window.setInterval(() => {
      void refreshPipelineStatus();
    }, 5000);

    void refreshPipelineStatus();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    selectedGitCicdHandoffId,
    shouldAutoRefreshSelectedGitCicdHandoff
  ]);

  async function runRequest(request: () => Promise<void>, fallbackMessage: string): Promise<void> {
    setRequestState("loading");
    setErrorMessage("");

    try {
      await request();
      setRequestState("idle");
    } catch (error) {
      setRequestState("error");
      setErrorMessage(getApiErrorMessage(error, fallbackMessage));
    }
  }

  async function runPreDeploymentCheck(): Promise<boolean> {
    if (!boardSnapshot.hasResources) {
      updatePreDeploymentCheckState({
        errorMessage: "Architecture Board에 Resource가 있어야 실행할 수 있습니다.",
        requestState: "error"
      });
      return false;
    }

    updatePreDeploymentCheckState({
      errorMessage: "",
      requestState: "loading"
    });

    try {
      const currentTerraformDiagnostics = await onValidateTerraformDiagnostics();
      const hasTerraformDiagnosticError = currentTerraformDiagnostics.some(
        (diagnostic) => diagnostic.severity === "error"
      );

      if (hasTerraformDiagnosticError) {
        updatePreDeploymentCheckState({
          analysis: createPreDeploymentAnalysisFromTerraformDiagnostics(currentTerraformDiagnostics),
          fingerprint: boardSnapshot.fingerprint,
          requestState: "idle"
        });
        return false;
      }

      const result = addTerraformDiagnosticsToPreDeploymentAnalysis(
        await runAiPreDeploymentCheck({
          architectureJson: boardSnapshot.architectureJson,
          terraformFiles: [...onGetTerraformFiles()]
        }),
        currentTerraformDiagnostics
      );
      updatePreDeploymentCheckState({
        analysis: result,
        fingerprint: boardSnapshot.fingerprint,
        requestState: "idle"
      });
      if (result.deepScan?.status === "running" && result.deepScan.scanId) {
        void pollPreDeploymentDeepScan(
          result.deepScan.scanId,
          currentTerraformDiagnostics,
          boardSnapshot.fingerprint
        );
      }
      return true;
    } catch (error) {
      updatePreDeploymentCheckState({
        errorMessage: getApiErrorMessage(error, "배포 전 검사 중 오류가 발생했습니다."),
        requestState: "error"
      });
      return false;
    }
  }

  async function pollPreDeploymentDeepScan(
    scanId: string,
    terraformDiagnostics: readonly TerraformDiagnostic[],
    fingerprint: string
  ): Promise<void> {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 500));
      try {
        const deepScan = await getAiPreDeploymentDeepScan(scanId);
        if (deepScan.status === "running") continue;

        if (deepScan.status === "complete" && deepScan.analysis) {
          updatePreDeploymentCheckState({
            analysis: addTerraformDiagnosticsToPreDeploymentAnalysis(
              deepScan.analysis,
              terraformDiagnostics
            ),
            fingerprint,
            requestState: "idle"
          });
          return;
        }

        updatePreDeploymentCheckState({
          errorMessage: deepScan.message ?? "Trivy 심층 검사를 완료하지 못했습니다. 다시 검사해 주세요."
        });
        return;
      } catch (error) {
        if (attempt === 59) {
          updatePreDeploymentCheckState({
            errorMessage: getApiErrorMessage(error, "Trivy 심층 검사 결과를 불러오지 못했습니다.")
          });
        }
      }
    }
  }

  function updatePreDeploymentCheckState(
    patch: Partial<DeploymentPreDeploymentCheckState>
  ): void {
    onPreDeploymentCheckStateChange((currentState) => ({
      ...currentState,
      ...patch
    }));
  }

  async function runDeploymentReviewStep(): Promise<void> {
    if (!canRunDeploymentReviewStep) {
      return;
    }

    const checkPassed = await runPreDeploymentCheck();

    if (!checkPassed) {
      return;
    }

    await startDeploymentReview();
  }

  async function startDeploymentReview(): Promise<void> {
    if (!canStartDeploymentReview) {
      return;
    }

    await runRequest(async () => {
      const savedArtifacts = await onPrepareDeploymentArtifacts();
      const snapshot = await loadDeploymentPanelSnapshot();

      applyDeploymentPanelSnapshot(snapshot);
      setSelectedDeploymentId("");

      const deployment = await createDeployment({
        projectId,
        architectureId: savedArtifacts.architecture.id,
        terraformArtifactId: savedArtifacts.terraformArtifact.id,
        awsConnectionId: selectedAwsConnectionId,
        liveProfile: selectedLiveProfile
      });
      const prewarmedDeployment = await runDeploymentInit(deployment.id).catch(() => deployment);

      setDeployments((currentDeployments) => [prewarmedDeployment, ...currentDeployments]);
      setSelectedDeploymentId(prewarmedDeployment.id);
      setDeploymentLogs([]);
      setDeploymentResources([]);
      setTerraformOutputs([]);
      setShowApplyConfirmation(false);
      setShowDestroyConfirmation(false);
    }, "배포 검토를 시작하지 못했습니다.");
  }

  async function saveDeploymentBaseline(): Promise<void> {
    if (requestState === "loading") {
      return;
    }

    await runRequest(async () => {
      await onPrepareDeploymentArtifacts();
      const snapshot = await loadDeploymentPanelSnapshot();

      applyDeploymentPanelSnapshot(snapshot);
      setSelectedDeploymentId("");
    }, "배포 기준을 저장하지 못했습니다.");
  }

  async function startTerraformPlan(): Promise<void> {
    if (!selectedDeployment || !canRunPlan) {
      return;
    }

    await runRequest(async () => {
      const deployment = await runDeploymentPlan(selectedDeployment.id);
      setDeployments((currentDeployments) =>
        currentDeployments.map((currentDeployment) =>
          currentDeployment.id === deployment.id ? deployment : currentDeployment
        )
      );
      setSelectedDeploymentId(deployment.id);
      const [logs, resources, outputs] = await Promise.all([
        listDeploymentLogs(deployment.id),
        listDeploymentResources(deployment.id),
        listTerraformOutputs(deployment.id)
      ]);
      setDeploymentLogs(logs);
      setDeploymentResources(resources);
      setTerraformOutputs(outputs);
      setShowApplyConfirmation(false);
      setShowDestroyConfirmation(false);
    }, "Terraform Plan을 시작하지 못했습니다.");
  }

  async function approveCurrentPlan(): Promise<void> {
    if (!selectedDeployment || !canApprovePlan) {
      return;
    }

    await runRequest(async () => {
      const deployment = await approveDeploymentPlan(selectedDeployment.id);
      setDeployments((currentDeployments) =>
        currentDeployments.map((currentDeployment) =>
          currentDeployment.id === deployment.id ? deployment : currentDeployment
        )
      );
      setSelectedDeploymentId(deployment.id);
      const [logs, resources, outputs] = await Promise.all([
        listDeploymentLogs(deployment.id),
        listDeploymentResources(deployment.id),
        listTerraformOutputs(deployment.id)
      ]);
      setDeploymentLogs(logs);
      setDeploymentResources(resources);
      setTerraformOutputs(outputs);
    }, "Terraform Plan을 승인하지 못했습니다.");
  }

  async function startTerraformApply(): Promise<void> {
    if (!selectedDeployment || !canApply) {
      return;
    }

    await runRequest(async () => {
      const deployment = await runDeploymentApply(selectedDeployment.id);
      setDeployments((currentDeployments) =>
        currentDeployments.map((currentDeployment) =>
          currentDeployment.id === deployment.id ? deployment : currentDeployment
        )
      );
      setSelectedDeploymentId(deployment.id);
      setShowApplyConfirmation(false);
      setShowDestroyConfirmation(false);
      const [logs, resources, outputs] = await Promise.all([
        listDeploymentLogs(deployment.id),
        listDeploymentResources(deployment.id),
        listTerraformOutputs(deployment.id)
      ]);
      setDeploymentLogs(logs);
      setDeploymentResources(resources);
      setTerraformOutputs(outputs);
    }, "Terraform Apply를 시작하지 못했습니다.");
  }

  async function startTerraformDestroyPlan(): Promise<void> {
    if (!selectedDeployment || !canRunDestroyPlan) {
      return;
    }

    await runRequest(async () => {
      const deployment = await runDeploymentDestroyPlan(selectedDeployment.id);
      setDeployments((currentDeployments) =>
        currentDeployments.map((currentDeployment) =>
          currentDeployment.id === deployment.id ? deployment : currentDeployment
        )
      );
      setSelectedDeploymentId(deployment.id);
      setShowApplyConfirmation(false);
      setShowDestroyConfirmation(false);
      const [logs, resources, outputs] = await Promise.all([
        listDeploymentLogs(deployment.id),
        listDeploymentResources(deployment.id),
        listTerraformOutputs(deployment.id)
      ]);
      setDeploymentLogs(logs);
      setDeploymentResources(resources);
      setTerraformOutputs(outputs);
    }, "Terraform Destroy Plan을 시작하지 못했습니다.");
  }

  async function startTerraformDestroy(): Promise<void> {
    if (!selectedDeployment || !canDestroy) {
      return;
    }

    await runRequest(async () => {
      const deployment = await runDeploymentDestroy(selectedDeployment.id);
      setDeployments((currentDeployments) =>
        currentDeployments.map((currentDeployment) =>
          currentDeployment.id === deployment.id ? deployment : currentDeployment
        )
      );
      setSelectedDeploymentId(deployment.id);
      setShowApplyConfirmation(false);
      setShowDestroyConfirmation(false);
      const [logs, resources, outputs] = await Promise.all([
        listDeploymentLogs(deployment.id),
        listDeploymentResources(deployment.id),
        listTerraformOutputs(deployment.id)
      ]);
      setDeploymentLogs(logs);
      setDeploymentResources(resources);
      setTerraformOutputs(outputs);
    }, "Terraform Destroy를 시작하지 못했습니다.");
  }

  async function cancelSelectedDeployment(): Promise<void> {
    if (!selectedDeployment || !canCancelDeployment) {
      return;
    }

    await runRequest(async () => {
      const deployment = await cancelDeploymentRun(selectedDeployment.id);
      setDeployments((currentDeployments) =>
        currentDeployments.map((currentDeployment) =>
          currentDeployment.id === deployment.id ? deployment : currentDeployment
        )
      );
      setSelectedDeploymentId(deployment.id);
      const logs = await listDeploymentLogs(deployment.id);
      setDeploymentLogs(logs);
    }, "Deployment 실행 취소를 요청하지 못했습니다.");
  }

  async function refreshDeploymentPanel(): Promise<void> {
    await runRequest(async () => {
      applyDeploymentPanelSnapshot(await loadDeploymentPanelSnapshot());
    }, "배포 상태를 새로고침하지 못했습니다.");
  }

  async function runTrafficSimulator(): Promise<void> {
    if (!apiBaseUrl || apiBaseUrl === "[sensitive]") {
      return;
    }

    trafficAbortControllerRef.current?.abort();
    const controller = new AbortController();
    trafficAbortControllerRef.current = controller;

    setTrafficSimulatorState("loading");
    setTrafficSimulatorSummary("");

    try {
      const baseUrl = apiBaseUrl.replace(/\/+$/, "");
      const results = await Promise.allSettled(
        Array.from({ length: 20 }, (_, index) =>
          fetch(`${baseUrl}/api/health?source=sketchcatch&request=${index + 1}`, {
            cache: "no-store",
            signal: controller.signal
          }).then((response) => {
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }

            return response.text();
          })
        )
      );

      if (controller.signal.aborted) {
        return;
      }

      const succeeded = results.filter((result) => result.status === "fulfilled").length;
      const failed = results.length - succeeded;

      setTrafficSimulatorSummary(
        `${succeeded}/${results.length} requests succeeded, ${failed} failed`
      );
      setTrafficSimulatorState(failed === 0 ? "idle" : "error");
    } catch {
      if (!controller.signal.aborted) {
        setTrafficSimulatorState("error");
        setTrafficSimulatorSummary("Traffic simulation failed.");
      }
    } finally {
      if (trafficAbortControllerRef.current === controller) {
        trafficAbortControllerRef.current = null;
      }
    }
  }

  async function createGitCicdAutoDeployHandoff(): Promise<void> {
    if (!activeGitHubSourceRepository || !selectedDeployment) {
      return;
    }

    await runRequest(async () => {
      const handoff = await createGitCicdHandoff({
        projectId,
        architectureId: selectedDeployment.architectureId,
        terraformArtifactId: selectedDeployment.terraformArtifactId,
        handoffKind: "terraform_iac",
        deploymentMode: "infra_and_app",
        sourceDeploymentId: selectedDeployment.id,
        sourceRepositoryId: activeGitHubSourceRepository.id,
        environmentName: "sketchcatch-production",
        rdsEnabled: false,
        awsRegion: selectedDeployment.approvedAwsRegion ?? "ap-northeast-2",
        staticSiteUrl: staticSiteUrl && staticSiteUrl !== "[sensitive]" ? staticSiteUrl : null,
        apiBaseUrl: apiBaseUrl && apiBaseUrl !== "[sensitive]" ? apiBaseUrl : null,
        pullRequestTitle: "SketchCatch Git/CI/CD auto deploy",
        commitMessage: "Add SketchCatch Git/CI/CD auto deploy artifacts",
        userAcceptedChangeId: `git-cicd-auto-deploy-${selectedDeployment.id}`
      });
      const snapshot = await loadDeploymentPanelSnapshot();

      applyDeploymentPanelSnapshot({
        ...snapshot,
        gitCicdHandoffs: [
          handoff,
          ...snapshot.gitCicdHandoffs.filter((item) => item.id !== handoff.id)
        ]
      });
      setSelectedGitCicdHandoffId(handoff.id);
    }, "Git/CI/CD 자동 배포 handoff를 만들지 못했습니다.");
  }

  async function applySelectedRepositorySettings(): Promise<void> {
    if (!selectedGitCicdHandoff) {
      return;
    }

    await runRequest(async () => {
      await applyGitCicdRepositorySettings(selectedGitCicdHandoff.id);
      applyDeploymentPanelSnapshot(await loadDeploymentPanelSnapshot());
    }, "GitHub 저장소 준비를 적용하지 못했습니다.");
  }

  async function applySelectedAwsRoleDiff(): Promise<void> {
    if (!selectedGitCicdHandoff) {
      return;
    }

    await runRequest(async () => {
      await applyGitCicdAwsRoleDiff(selectedGitCicdHandoff.id);
      applyDeploymentPanelSnapshot(await loadDeploymentPanelSnapshot());
    }, "AWS 실행 Role 연결을 적용하지 못했습니다.");
  }

  async function startGitHubOAuthForRepositorySettings(): Promise<void> {
    if (!selectedGitCicdHandoff) {
      return;
    }

    await runRequest(async () => {
      const { authorizationUrl } = await createGitCicdGitHubOAuthStartUrl(
        selectedGitCicdHandoff.id
      );

      window.location.assign(authorizationUrl);
    }, "임시 OAuth 승인을 시작하지 못했습니다.");
  }

  async function applyRepositorySettingsWithGitHubOAuth(): Promise<void> {
    if (!selectedGitCicdHandoff) {
      return;
    }

    await runRequest(async () => {
      await applyGitCicdRepositorySettingsWithGitHubOAuth(selectedGitCicdHandoff.id);
      applyDeploymentPanelSnapshot(await loadDeploymentPanelSnapshot());
    }, "OAuth로 GitHub 저장소 준비를 적용하지 못했습니다.");
  }

  const renderSetupSection = () => {
    const selectedStep =
      directDeploymentFlow.steps.find((step) => step.id === selectedDirectStepId) ??
      directDeploymentFlow.steps[0]!;
    const selectedAwsConnection =
      verifiedAwsConnections.find((connection) => connection.id === selectedAwsConnectionId) ??
      null;
    const requestError =
      selectedStep.id === "preflight" && preDeploymentState === "error"
        ? preDeploymentErrorMessage
        : requestState === "error"
          ? errorMessage
          : "";

    function renderDirectStepContent(stepId: DirectDeploymentStepId) {
      if (stepId === "save") {
        return (
          <>
            <div className={styles.deploymentStepHeading}>
              <span>Step 1</span>
              <h3>변경사항 저장</h3>
              <p>현재 Board와 Terraform 파일을 하나의 배포 기준으로 동기화합니다.</p>
            </div>
            <div className={styles.deploymentStepCallout}>
              <strong>{hasUnsavedDeploymentBaseline ? "저장되지 않은 변경사항이 있습니다" : "최신 변경사항이 저장돼 있습니다"}</strong>
              <p>저장된 artifact만 이후 검사와 Plan의 입력으로 사용됩니다.</p>
            </div>
            <div className={styles.deploymentStepActionBar}>
              <p>{hasUnsavedDeploymentBaseline ? "저장 후 배포 전 검사가 열립니다." : "필요하면 현재 상태를 다시 저장할 수 있습니다."}</p>
              <button
                className={styles.deploymentPrimaryButton}
                disabled={requestState === "loading"}
                onClick={saveDeploymentBaseline}
                type="button"
              >
                <DeploymentBaselineIcon size={16} aria-hidden="true" />
                {requestState === "loading" ? "저장 중" : "변경사항 저장"}
              </button>
            </div>
          </>
        );
      }

      if (stepId === "preflight") {
        return (
          <>
            <div className={styles.deploymentStepHeading}>
              <span>Step 2</span>
              <h3>배포 전 검사</h3>
              <p>Terraform 진단과 보안·비용 위험을 확인하고 배포 대상을 생성합니다.</p>
            </div>
            <div className={styles.deploymentStageSettings}>
              <SelectMenu
                ariaLabel="AWS 연결 선택"
                disabled={awsConnectionOptions.length === 0 || requestState === "loading"}
                emptyLabel="AWS 연결 없음"
                onChange={setSelectedAwsConnectionId}
                options={awsConnectionOptions}
                size={isDeploymentOverlayOpen ? "large" : "regular"}
                value={selectedAwsConnectionId}
              />
              <SelectMenu
                ariaLabel="Live deployment profile"
                emptyLabel="Live profile 없음"
                onChange={(value) => setSelectedLiveProfile(value as DeploymentLiveProfile)}
                options={liveProfileOptions}
                size={isDeploymentOverlayOpen ? "large" : "regular"}
                value={selectedLiveProfile}
              />
            </div>
            {preDeploymentAnalysis !== null && !hasStalePreDeploymentAnalysis ? (
              <DeploymentPreDeploymentSummary
                analysis={preDeploymentAnalysis}
                onOpenFindingTerraformSource={onOpenFindingTerraformSource}
              />
            ) : (
              <div className={styles.deploymentStepCallout}>
                <strong>아직 실행된 검사가 없습니다</strong>
                <p>검사 전 상태는 실패가 아닙니다. AWS 연결을 선택한 뒤 검사를 실행하세요.</p>
              </div>
            )}
            <div className={styles.deploymentStepActionBar}>
              <p>{selectedStep.disabledReason ?? "검사를 통과하면 Plan 생성 단계로 이동합니다."}</p>
              <button
                className={styles.deploymentPrimaryButton}
                disabled={!canRunDeploymentReviewStep}
                onClick={() => void runDeploymentReviewStep()}
                type="button"
              >
                <ShieldCheck size={16} aria-hidden="true" />
                {preDeploymentState === "loading" || requestState === "loading"
                  ? "검사 중"
                  : selectedDeployment
                    ? "다시 검사"
                    : "배포 전 검사 실행"}
              </button>
            </div>
          </>
        );
      }

      if (stepId === "plan") {
        return (
          <>
            <div className={styles.deploymentStepHeading}>
              <span>Step 3</span>
              <h3>Plan 생성</h3>
              <p>실제 인프라를 변경하지 않고 create, update, delete 영향을 계산합니다.</p>
            </div>
            <div className={styles.deploymentStepSummary}>
              <InfoRow label="Deployment" value={selectedDeployment?.status ?? "검사 후 생성"} />
              <InfoRow label="Plan" value={hasCurrentPlan ? "생성됨" : "아직 없음"} />
              {selectedDeployment?.planSummary ? <PlanSummaryRows deployment={selectedDeployment} /> : null}
            </div>
            <div className={styles.deploymentStepActionBar}>
              <p>{selectedStep.disabledReason ?? "Plan은 AWS 리소스를 변경하지 않습니다."}</p>
              <button
                className={styles.deploymentPrimaryButton}
                disabled={!canRunPlan}
                onClick={() => void startTerraformPlan()}
                type="button"
              >
                <DashboardIcon name="rocket" />
                {requestState === "loading" ? "Plan 생성 중" : "Plan 생성"}
              </button>
            </div>
          </>
        );
      }

      if (stepId === "approve") {
        return (
          <>
            <div className={styles.deploymentStepHeading}>
              <span>Step 4</span>
              <h3>Plan 승인</h3>
              <p>실행 계정과 region, 변경량, Plan snapshot을 확인하고 명시적으로 승인합니다.</p>
            </div>
            <div className={styles.deploymentStepSummary}>
              <InfoRow label="AWS account" value={selectedDeployment?.approvedAwsAccountId ?? selectedAwsConnection?.accountId ?? "확인 필요"} />
              <InfoRow label="AWS region" value={selectedDeployment?.approvedAwsRegion ?? selectedAwsConnection?.region ?? "확인 필요"} />
              <InfoRow label="tfplan hash" value={formatShortHash(selectedDeployment?.approvedTfplanHash ?? null)} />
              {selectedDeployment?.planSummary ? <PlanSummaryRows deployment={selectedDeployment} /> : null}
            </div>
            <div className={styles.deploymentStepActionBar}>
              <p>{selectedStep.disabledReason ?? "승인 snapshot이 Apply 직전에 다시 검증됩니다."}</p>
              <button
                className={styles.deploymentPrimaryButton}
                disabled={!canApprovePlan}
                onClick={() => void approveCurrentPlan()}
                type="button"
              >
                <ShieldCheck size={16} aria-hidden="true" />
                {requestState === "loading" ? "승인 처리 중" : "Plan 승인"}
              </button>
            </div>
          </>
        );
      }

      return (
        <>
          <div className={styles.deploymentStepHeading}>
            <span>Step 5</span>
            <h3>Apply 실행</h3>
            <p>승인된 Plan과 동일한 snapshot만 실제 AWS 리소스에 적용합니다.</p>
          </div>
          <div className={styles.deploymentStepSummary}>
            <InfoRow label="Deployment 상태" value={selectedDeployment?.status ?? "대기"} />
            <InfoRow label="승인" value={selectedDeployment ? formatApprovalState(selectedDeployment) : "Plan 필요"} />
            <InfoRow label="현재 작업" value={primaryDeploymentStepStatus} />
          </div>
          {showApplyConfirmation && selectedDeployment ? (
            <div className={styles.deploymentApplyConfirm}>
              <h3>Apply 최종 확인</h3>
              <InfoRow label="AWS account" value={selectedDeployment.approvedAwsAccountId ?? "없음"} />
              <InfoRow label="AWS region" value={selectedDeployment.approvedAwsRegion ?? "없음"} />
              <InfoRow label="tfplan hash" value={formatShortHash(selectedDeployment.approvedTfplanHash)} />
              <p>AWS 비용이 발생할 수 있습니다. 승인된 Plan과 대상 계정을 다시 확인하세요.</p>
              <div className={styles.deploymentApplyActions}>
                <button className={styles.deploymentSecondaryButton} onClick={() => setShowApplyConfirmation(false)} type="button">취소</button>
                <button className={styles.deploymentPrimaryButton} disabled={!canApply} onClick={startTerraformApply} type="button">
                  <DashboardIcon name="rocket" />
                  AWS 리소스 생성
                </button>
              </div>
            </div>
          ) : null}
          <div className={styles.deploymentStepActionBar}>
            <p>{selectedStep.disabledReason ?? (deploymentActionHint || "Apply 전 서버가 승인 snapshot을 다시 검증합니다.")}</p>
            {selectedDeployment?.status === "RUNNING" ? (
              <button className={styles.deploymentSecondaryButton} disabled={!canCancelDeployment} onClick={cancelSelectedDeployment} type="button">실행 취소 요청</button>
            ) : (
              <button
                className={styles.deploymentPrimaryButton}
                disabled={!canApply}
                onClick={() => setShowApplyConfirmation(true)}
                type="button"
              >
                <DashboardIcon name="rocket" />
                Apply 실행 검토
              </button>
            )}
          </div>
        </>
      );
    }

    return (
      <section className={styles.deploymentConsoleGrid} aria-label="Direct Deployment">
        <nav className={styles.deploymentStepNavigation} aria-label="Direct Deployment 단계">
          <p>Direct Deployment</p>
          <ol>
            {directDeploymentFlow.steps.map((step, index) => (
              <li key={step.id}>
                <button
                  aria-current={step.id === directDeploymentFlow.activeStepId ? "step" : undefined}
                  className={styles.deploymentStepButton}
                  data-selected={step.id === selectedStep.id}
                  data-state={step.state}
                  disabled={step.state === "idle"}
                  onClick={() => setSelectedDirectStepId(step.id)}
                  type="button"
                >
                  <span className={styles.deploymentStepIndex}>{index + 1}</span>
                  <span>
                    <strong>{step.label}</strong>
                    <small>{step.statusLabel}</small>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <article className={styles.deploymentStepWorkspace} data-state={selectedStep.state}>
          {renderDirectStepContent(selectedStep.id)}
          {requestError ? <p className={styles.deploymentStageAlert} role="alert">{requestError}</p> : null}
          {selectedStep.id === "apply" && selectedDeployment?.status === "FAILED" ? (
            <p className={styles.deploymentStageAlert} role="alert">
              {selectedDeployment.errorSummary ?? "배포가 실패했습니다. 배포 기록에서 원인을 확인하세요."}
            </p>
          ) : null}
        </article>

        <aside className={styles.deploymentContextPanel} aria-label="배포 컨텍스트">
          <div>
            <span>Deployment context</span>
            <h3>실행 대상</h3>
          </div>
          <dl>
            <div><dt>AWS account</dt><dd>{selectedAwsConnection?.accountId ?? "연결 필요"}</dd></div>
            <div><dt>Region</dt><dd>{selectedAwsConnection?.region ?? "선택 전"}</dd></div>
            <div><dt>Connection</dt><dd>{selectedAwsConnection ? "Verified" : "연결 필요"}</dd></div>
            <div><dt>Terraform artifact</dt><dd>{selectedDeployment ? formatShortHash(selectedDeployment.terraformArtifactId) : "저장 후 생성"}</dd></div>
            <div><dt>Architecture</dt><dd>{currentNodeCount} resources</dd></div>
            <div><dt>저장 상태</dt><dd>{hasUnsavedDeploymentBaseline ? "변경사항 있음" : "저장됨"}</dd></div>
          </dl>
          <p>Apply와 Destroy는 승인 snapshot, 대상 계정, artifact가 모두 일치할 때만 실행됩니다.</p>
        </aside>
      </section>
    );
  };

  const renderGitCicdHandoffSection = () => (
    <section className={styles.deploymentSection}>
      <div className={styles.deploymentSectionHeader}>
        <h3>Git/CI/CD handoff</h3>
        <div className={styles.deploymentHeaderActions}>
          <button
            className={`${styles.deploymentSecondaryButton} ${styles.deploymentRefreshButton}`}
            disabled={requestState === "loading"}
            onClick={refreshDeploymentPanel}
            type="button"
          >
            Refresh
          </button>
          <a
            className={styles.deploymentSecondaryButton}
            href={projectGithubSettingsHref}
            title="프로젝트 GitHub 설정 열기"
          >
            <GitBranch size={16} />
            GitHub 설정
          </a>
          <button
            className={styles.deploymentSecondaryButton}
            disabled={!canCreateGitCicdHandoff || requestState === "loading"}
            onClick={createGitCicdAutoDeployHandoff}
            type="button"
          >
            <GitBranch size={16} />
            Git/CI/CD handoff 생성
          </button>
        </div>
      </div>

      <div className={styles.deploymentSummary}>
        <InfoRow
          label="Source repository"
          value={
            activeGitHubSourceRepository
              ? `${activeGitHubSourceRepository.owner}/${activeGitHubSourceRepository.name}`
              : "Not connected"
          }
        />
        {activeGitHubSourceRepository ? (
          <>
            <OptionalInfoRow
              label="Default branch"
              value={activeGitHubSourceRepository.defaultBranch}
            />
            <OptionalInfoRow
              label="Repository URL"
              value={activeGitHubSourceRepository.repositoryUrl}
            />
          </>
        ) : (
          <p className={styles.deploymentHint}>
            프로젝트 GitHub 설정에서 repository를 먼저 연결하세요.
          </p>
        )}
      </div>

      {hasGitCicdHandoffs ? (
        <>
          <div className={styles.deploymentField}>
            Handoff record
            <SelectMenu
              ariaLabel="Git/CI/CD handoff record select"
              disabled={gitCicdHandoffOptions.length === 0}
              emptyLabel="No Git/CI/CD handoff"
              onChange={(handoffId) => {
                setSelectedGitCicdHandoffId(handoffId);
                setGitCicdPipelineStatusSource(null);
              }}
              options={gitCicdHandoffOptions}
              size={isDeploymentOverlayOpen ? "large" : "regular"}
              value={selectedGitCicdHandoffId}
            />
          </div>

          {selectedGitCicdHandoff ? (
            <>
              <div className={styles.deploymentActionGroup}>
                <div className={styles.deploymentActionItem}>
                  <button
                    className={styles.deploymentSecondaryButton}
                    disabled={
                      requestState === "loading" ||
                      !selectedGitCicdHandoff.repositorySettingsPreview
                    }
                    onClick={() => void applySelectedRepositorySettings()}
                    type="button"
                  >
                    <GitBranch size={16} />
                    GitHub 저장소 준비 적용
                  </button>
                  <p>Workflow와 Actions variable을 repository에 설정합니다.</p>
                </div>
                <div className={styles.deploymentActionItem}>
                  <button
                    className={styles.deploymentSecondaryButton}
                    disabled={
                      requestState === "loading" ||
                      !selectedGitCicdHandoff.awsRoleDiff?.approved ||
                      selectedGitCicdHandoff.awsRoleDiff.applied === true
                    }
                    onClick={() => void applySelectedAwsRoleDiff()}
                    type="button"
                  >
                    <ShieldCheck size={16} />
                    AWS 실행 Role 연결 적용
                  </button>
                  <p>GitHub Actions가 승인된 AWS Role을 사용할 수 있게 연결합니다.</p>
                </div>
              </div>
              {selectedGitCicdHandoff.githubOAuthRequired ? (
                <div className={styles.deploymentNotice}>
                  <p>
                    GitHub App 권한이 부족합니다. 먼저 App 권한을 추가하고, 급하면
                    임시 OAuth 승인으로 저장소 준비를 적용할 수 있습니다.
                  </p>
                  <div className={styles.deploymentActionGroup}>
                    <div className={styles.deploymentActionItem}>
                      <a
                        className={styles.deploymentSecondaryButton}
                        href={projectGithubSettingsHref}
                      >
                        <GitBranch size={16} />
                        프로젝트 GitHub 설정 열기
                      </a>
                      <p>GitHub App에 Workflows, Administration, Variables 권한을 추가합니다.</p>
                    </div>
                    <div className={styles.deploymentActionItem}>
                      <button
                        className={styles.deploymentSecondaryButton}
                        disabled={requestState === "loading"}
                        onClick={() => void startGitHubOAuthForRepositorySettings()}
                        type="button"
                      >
                        <GitBranch size={16} />
                        임시 OAuth 승인
                      </button>
                      <p>App 권한 반영 전, 내 GitHub 권한으로 한 번만 승인합니다.</p>
                    </div>
                    <div className={styles.deploymentActionItem}>
                      <button
                        className={styles.deploymentSecondaryButton}
                        disabled={requestState === "loading"}
                        onClick={() => void applyRepositorySettingsWithGitHubOAuth()}
                        type="button"
                      >
                        <ShieldCheck size={16} />
                        OAuth로 저장소 준비 적용
                      </button>
                      <p>OAuth 승인 후 workflow와 repository variables를 적용합니다.</p>
                    </div>
                  </div>
                </div>
              ) : null}
              <div className={styles.deploymentSummary}>
                <InfoRow label="Path" value="Git/CI/CD handoff" />
                <InfoRow
                  label="Status"
                  value={getGitCicdHandoffStatusLabel(selectedGitCicdHandoff)}
                />
                <InfoRow label="Kind" value={selectedGitCicdHandoff.handoffKind} />
                <InfoRow label="Mode" value={selectedGitCicdHandoff.deploymentMode} />
                <InfoRow
                  label="Environment"
                  value={selectedGitCicdHandoff.environmentName}
                />
                <InfoRow
                  label="Approval"
                  value={
                    selectedGitCicdHandoff.requiresEnvironmentApproval
                      ? "GitHub Environment approval required"
                      : "No environment approval"
                  }
                />
                <InfoRow
                  label="GitHub 권한"
                  value={
                    selectedGitCicdHandoff.githubOAuthRequired
                      ? "Workflow/settings permission required"
                      : "Ready"
                  }
                />
                <InfoRow
                  label="Repository"
                  value={`${selectedGitCicdHandoff.repositoryOwner}/${selectedGitCicdHandoff.repositoryName}`}
                />
                <OptionalInfoRow label="Target branch" value={selectedGitCicdHandoff.targetBranch} />
                <OptionalInfoRow label="Source branch" value={selectedGitCicdHandoff.sourceBranch} />
                <OptionalInfoRow label="PR URL" value={selectedGitCicdHandoff.pullRequestUrl} />
                <OptionalInfoRow
                  label="PR number"
                  value={
                    selectedGitCicdHandoff.pullRequestNumber
                      ? `#${selectedGitCicdHandoff.pullRequestNumber}`
                      : null
                  }
                />
                <OptionalInfoRow
                  label="Merge commit"
                  value={selectedGitCicdHandoff.mergeCommitSha}
                />
                <OptionalInfoRow
                  label="Pipeline URL"
                  value={selectedGitCicdHandoff.pipelineRunUrl}
                />
                <OptionalInfoRow
                  label={`Infra workflow (${selectedGitCicdHandoff.infraPipelineStatus})`}
                  value={selectedGitCicdHandoff.infraPipelineRunUrl}
                />
                <OptionalInfoRow
                  label={`App workflow (${selectedGitCicdHandoff.appPipelineStatus})`}
                  value={selectedGitCicdHandoff.appPipelineRunUrl}
                />
                <OptionalInfoRow
                  label={`Destroy workflow (${selectedGitCicdHandoff.destroyPipelineStatus})`}
                  value={selectedGitCicdHandoff.destroyPipelineRunUrl}
                />
                <OptionalInfoRow label="Static site URL" value={selectedGitCicdHandoff.staticSiteUrl} />
                <OptionalInfoRow label="API URL" value={selectedGitCicdHandoff.apiBaseUrl} />
                <OptionalInfoRow
                  label="GitHub 저장소 준비"
                  value={
                    selectedGitCicdHandoff.repositorySettingsPreview
                      ? `${Object.keys(selectedGitCicdHandoff.repositorySettingsPreview.variables).length} variables, ${selectedGitCicdHandoff.repositorySettingsPreview.workflowFiles.length} workflows`
                      : null
                  }
                />
                <OptionalInfoRow
                  label="AWS 실행 Role 연결"
                  value={
                    selectedGitCicdHandoff.awsRoleDiff
                      ? selectedGitCicdHandoff.awsRoleDiff.applied
                        ? "applied and verified"
                        : selectedGitCicdHandoff.awsRoleDiff.approved
                          ? "approved"
                          : "approval required"
                      : null
                  }
                />
                <OptionalInfoRow
                  label="Pipeline message"
                  value={selectedGitCicdHandoff.statusMessage}
                />
                <InfoRow label="Updated" value={formatDate(selectedGitCicdHandoff.updatedAt)} />
                <OptionalInfoRow
                  label="Status source"
                  value={gitCicdPipelineStatusSource ?? "rds"}
                />
              </div>
            </>
          ) : null}
        </>
      ) : (
        <p className={styles.deploymentHint}>
          No Git/CI/CD handoff records yet. Direct Deployment records stay separate below.
        </p>
      )}
    </section>
  );

  const renderRecordsSection = () => (
    <section className={styles.deploymentSection}>
      <div className={styles.deploymentSectionHeader}>
        <h3>Direct Deployment records</h3>
        <button
          className={`${styles.deploymentSecondaryButton} ${styles.deploymentRefreshButton}`}
          disabled={requestState === "loading"}
          onClick={refreshDeploymentPanel}
          type="button"
        >
          새로고침
        </button>
      </div>

      <div className={styles.deploymentField}>
        실행 기록
        <SelectMenu
          ariaLabel="실행 기록 선택"
          disabled={deploymentOptions.length === 0}
          emptyLabel="Deployment 없음"
          onChange={setSelectedDeploymentId}
          options={deploymentOptions}
            size={isDeploymentOverlayOpen ? "large" : "regular"}
          value={selectedDeploymentId}
        />
      </div>

      {selectedDeployment ? (
        <>
          <DeploymentGateCard deployment={selectedDeployment} />
          <div className={styles.deploymentSummary}>
            <InfoRow label="Status" value={selectedDeployment.status} />
            <InfoRow label="소요 시간" value={getDeploymentDurationLabel(selectedDeployment, durationNow)} />
            <OptionalInfoRow label="Active stage" value={selectedDeployment.activeStage} />
            <InfoRow label="Approval" value={formatApprovalState(selectedDeployment)} />
            {selectedDeployment.planSummary ? (
              <PlanSummaryRows deployment={selectedDeployment} />
            ) : null}
            <OptionalInfoRow label="Warning" value={selectedDeployment.resultWarningSummary} />
            <OptionalInfoRow label="Error" value={selectedDeployment.errorSummary} />
          </div>
        </>
      ) : null}

      {selectedDeployment?.status === "FAILED" ? (
        <DeploymentFailureExplanationCard
          errorMessage={failureExplanationErrorMessage}
          explanation={failureExplanation}
          state={failureExplanationState}
        />
      ) : null}

      {selectedDeployment?.status === "RUNNING" ? (
        <button
          className={styles.deploymentSecondaryButton}
          disabled={!canCancelDeployment}
          onClick={cancelSelectedDeployment}
          type="button"
        >
          실행 취소 요청
        </button>
      ) : null}

      {selectedDeployment && shouldShowDestroyPlanButton ? (
        <button
          className={styles.deploymentSecondaryButton}
          disabled={!canRunDestroyPlan}
          onClick={() => void startTerraformDestroyPlan()}
          type="button"
        >
          <Trash2 size={16} aria-hidden="true" />
          {selectedDeployment.currentPlanOperation === "destroy"
            ? "Destroy Plan 재생성"
            : "Destroy Plan 생성"}
        </button>
      ) : null}

      {selectedDeployment && shouldShowApprovePlanButton ? (
        <button
          className={styles.deploymentPrimaryButton}
          disabled={!canApprovePlan}
          onClick={() => void approveCurrentPlan()}
          type="button"
        >
          <ShieldCheck size={16} aria-hidden="true" />
          {requestState === "loading" ? "승인 처리 중" : deploymentActions.approvePlanLabel}
        </button>
      ) : null}

      {selectedDeployment && shouldShowDestroyButton ? (
        <button
          className={styles.deploymentDangerButton}
          disabled={!canDestroy}
          onClick={() => setShowDestroyConfirmation(true)}
          type="button"
        >
          <Trash2 size={16} aria-hidden="true" />
          Destroy 실행 검토
        </button>
      ) : null}

      {selectedDeployment && showApplyConfirmation ? (
        <div className={styles.deploymentApplyConfirm}>
          <h3>Apply 확인</h3>
          <InfoRow
            label="AWS account"
            value={selectedDeployment.approvedAwsAccountId ?? "없음"}
          />
          <InfoRow label="AWS region" value={selectedDeployment.approvedAwsRegion ?? "없음"} />
          <InfoRow
            label="tfplan hash"
            value={formatShortHash(selectedDeployment.approvedTfplanHash)}
          />
          <InfoRow
            label="Artifact hash"
            value={formatShortHash(selectedDeployment.approvedTerraformArtifactHash)}
          />
          {selectedDeployment.planSummary ? (
            <InfoRow
              label="Plan changes"
              value={`+${selectedDeployment.planSummary.createCount} ~${selectedDeployment.planSummary.updateCount} -${selectedDeployment.planSummary.deleteCount} +/-${selectedDeployment.planSummary.replaceCount}`}
            />
          ) : null}
          <p>
            이번 MVP Apply는 VPC, Public Subnet, Internet Gateway, Route Table, Security Group,
            EC2, S3 Bucket 범위만 실행합니다. 실행 후 AWS 비용이 발생할 수 있으니 실습 완료
            후 콘솔에서 리소스를 직접 확인하고 정리하세요.
          </p>
          <div className={styles.deploymentApplyActions}>
            <button
              className={styles.deploymentSecondaryButton}
              disabled={requestState === "loading"}
              onClick={() => setShowApplyConfirmation(false)}
              type="button"
            >
              취소
            </button>
            <button
              className={styles.deploymentPrimaryButton}
              disabled={!canApply}
              onClick={startTerraformApply}
              type="button"
            >
              <DashboardIcon name="rocket" />
              <span className={styles.deploymentButtonText}>AWS 리소스 생성</span>
            </button>
          </div>
        </div>
      ) : null}

      {selectedDeployment && showDestroyConfirmation ? (
        <div className={styles.deploymentDestroyConfirm}>
          <h3>Destroy 확인</h3>
          <InfoRow
            label="AWS account"
            value={selectedDeployment.approvedAwsAccountId ?? "없음"}
          />
          <InfoRow label="AWS region" value={selectedDeployment.approvedAwsRegion ?? "없음"} />
          {selectedDeployment.planSummary ? (
            <InfoRow
              label="Destroy changes"
              value={`+${selectedDeployment.planSummary.createCount} ~${selectedDeployment.planSummary.updateCount} -${selectedDeployment.planSummary.deleteCount} +/-${selectedDeployment.planSummary.replaceCount}`}
            />
          ) : null}
          <p>
            승인된 Destroy Plan을 실제 AWS에 적용합니다. 실행 후 삭제된 리소스는 SketchCatch에서
            `DESTROYED` 상태로 정리됩니다.
          </p>
          <div className={styles.deploymentApplyActions}>
            <button
              className={styles.deploymentSecondaryButton}
              disabled={requestState === "loading"}
              onClick={() => setShowDestroyConfirmation(false)}
              type="button"
            >
              취소
            </button>
            <button
              className={styles.deploymentDangerButton}
              disabled={!canDestroy}
              onClick={startTerraformDestroy}
              type="button"
            >
              <Trash2 size={16} aria-hidden="true" />
              <span className={styles.deploymentButtonText}>AWS 리소스 삭제</span>
            </button>
          </div>
        </div>
      ) : null}

      {deploymentActionHint ? (
        <p className={styles.deploymentHint}>{deploymentActionHint}</p>
      ) : null}
    </section>
  );

  const renderResultsSection = () => (
    <section className={styles.deploymentSection}>
      <h3>Apply results</h3>
      {deploymentResources.length === 0 ? (
        <p className={styles.deploymentHint}>아직 기록된 AWS 리소스가 없습니다.</p>
      ) : (
        <div className={styles.deploymentResultRows}>
          {deploymentResources.map((resource) => (
            <article className={styles.deploymentResultRow} key={resource.id}>
              <strong>{resource.terraformAddress}</strong>
              <span className={styles.deploymentResultMeta}>{resource.terraformType}</span>
              <span className={styles.deploymentResultValue}>{resource.resourceId ?? "resource id 없음"}</span>
            </article>
          ))}
        </div>
      )}
      {terraformOutputs.length === 0 ? (
        <p className={styles.deploymentHint}>Terraform output이 없습니다.</p>
      ) : (
        <div className={styles.deploymentResultRows}>
          {terraformOutputs.map((output) => (
            <article className={styles.deploymentResultRow} key={output.id}>
              <strong>{output.name}</strong>
              <span className={styles.deploymentResultMeta}>{output.sensitive ? "sensitive" : "plain"}</span>
              <span className={styles.deploymentResultValue}>{formatOutputValue(output)}</span>
            </article>
          ))}
        </div>
      )}
      <div className={styles.deploymentSummary}>
        <InfoRow label="Traffic target" value={apiBaseUrl || "api_base_url output 없음"} />
        <button
          className={styles.deploymentSecondaryButton}
          disabled={!apiBaseUrl || trafficSimulatorState === "loading"}
          onClick={runTrafficSimulator}
          type="button"
        >
          <DashboardIcon name="server" />
          트래픽 시뮬레이션
        </button>
        {trafficSimulatorState === "loading" ? (
          <p className={styles.deploymentNotice}>트래픽 요청을 보내는 중입니다.</p>
        ) : null}
        {trafficSimulatorSummary ? (
          <p
            className={
              trafficSimulatorState === "error"
                ? styles.deploymentError
                : styles.deploymentHint
            }
          >
            {trafficSimulatorSummary}
          </p>
        ) : null}
      </div>
    </section>
  );

  const renderLogsSection = () => (
    <section className={styles.deploymentSection}>
      <h3>Logs</h3>
      <DeploymentLogList logs={deploymentLogs} />
    </section>
  );

  const renderHistoryView = () => (
    <div className={styles.deploymentHistoryGrid}>
      <div className={styles.deploymentHistoryPrimary}>{renderRecordsSection()}</div>
      <div className={styles.deploymentHistorySecondary}>
        <details className={styles.deploymentDisclosure} open>
          <summary>
            <span>리소스와 Output</span>
            <small>{deploymentResources.length + terraformOutputs.length} items</small>
          </summary>
          <div className={styles.deploymentDisclosureBody}>{renderResultsSection()}</div>
        </details>
        <details className={styles.deploymentDisclosure}>
          <summary>
            <span>전체 로그</span>
            <small>{deploymentLogs.length} lines</small>
          </summary>
          <div className={styles.deploymentDisclosureBody}>{renderLogsSection()}</div>
        </details>
      </div>
    </div>
  );

  function closeExpandedDeployment(): void {
    setIsDeploymentExpanded(false);
    onExpandedClose?.();
  }

  const deploymentContent = canLoadDeploymentData(deploymentAvailability) ? (
    <div className={styles.deploymentConsoleContent}>
      <div className={styles.deploymentConsoleTabs} role="tablist" aria-label="배포 콘솔 보기">
        {([
          ["direct", "Direct Deployment"],
          ["git-cicd", "Git / CI·CD"],
          ["history", `배포 기록 ${deployments.length}`]
        ] as const).map(([tab, label]) => (
          <button
            aria-controls="deployment-console-view"
            aria-selected={deploymentConsoleTab === tab}
            className={styles.deploymentConsoleTab}
            id={`deployment-console-tab-${tab}`}
            key={tab}
            onClick={() => setDeploymentConsoleTab(tab)}
            onKeyDown={(event) => handleDeploymentTabKeyDown(event, tab)}
            ref={(element) => {
              if (element) {
                deploymentTabRefs.current[tab] = element;
              } else {
                delete deploymentTabRefs.current[tab];
              }
            }}
            role="tab"
            tabIndex={deploymentConsoleTab === tab ? 0 : -1}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      <div
        aria-labelledby={`deployment-console-tab-${deploymentConsoleTab}`}
        className={styles.deploymentConsoleView}
        id="deployment-console-view"
        role="tabpanel"
      >
        {deploymentConsoleTab === "direct" ? renderSetupSection() : null}
        {deploymentConsoleTab === "git-cicd" ? renderGitCicdHandoffSection() : null}
        {deploymentConsoleTab === "history" ? renderHistoryView() : null}
        {deploymentConsoleTab !== "direct" && requestState === "error" ? (
          <p className={styles.deploymentError} role="alert">{errorMessage}</p>
        ) : null}
      </div>
    </div>
  ) : (
    <div className={styles.deploymentConsoleContent}>
      <div className={styles.deploymentConsoleTabs} role="tablist" aria-label="배포 콘솔 보기">
        <button aria-selected="true" className={styles.deploymentConsoleTab} role="tab" type="button">
          Direct Deployment
        </button>
      </div>
      <section className={styles.deploymentProjectGate} role="status">
        <span>Project required</span>
        <h3>프로젝트로 저장 후 배포할 수 있습니다</h3>
        <p>
          Local workspace에서는 AWS 연결과 Deployment 기록을 만들지 않습니다. 프로젝트를 만든 뒤
          저장된 Terraform artifact를 기준으로 배포를 시작하세요.
        </p>
        <a className={styles.deploymentPrimaryButton} href="/workspace/new">
          프로젝트로 저장
        </a>
      </section>
    </div>
  );

  return (
    <div className={fullScreenOnly ? styles.deploymentPanelFullscreenHost : styles.deploymentPanel}>
      {!fullScreenOnly ? (
        <header className={styles.deploymentHeader}>
        <div className={styles.deploymentHeaderTop}>
          <div>
            <p className={styles.projectEyebrow}>Deployment</p>
            <h2>{projectName}</h2>
            <span>{currentNodeCount} board nodes</span>
          </div>
          <button
            aria-label="Deployment 패널 확장"
            className={styles.deploymentExpandButton}
            onClick={() => setIsDeploymentExpanded(true)}
            type="button"
          >
            <Maximize2 size={16} aria-hidden="true" />
          </button>
        </div>
        </header>
      ) : null}

      {!fullScreenOnly ? (
        <div className={styles.deploymentPanelContent}>
          {deploymentContent}
        </div>
      ) : null}

      {isDeploymentOverlayOpen ? (
        <div
          aria-label="Deployment console"
          aria-modal="true"
          className={styles.deploymentExpandedOverlay}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeExpandedDeployment();
            }
          }}
          role="dialog"
        >
          <div className={styles.deploymentExpandedShell} ref={deploymentDialogRef}>
            <button
              aria-label="Deployment 패널 닫기"
              className={styles.deploymentExpandedCloseButton}
              onClick={closeExpandedDeployment}
              ref={deploymentCloseButtonRef}
              type="button"
            >
              <X size={18} aria-hidden="true" />
            </button>
            <div className={styles.deploymentExpandedBody}>
              <div className={styles.deploymentExpandedTitleRow}>
                <div>
                  <p className={styles.projectEyebrow}>Deployment</p>
                  <h2 className={styles.deploymentExpandedTitle}>배포 콘솔</h2>
                  <span>{projectName} · {verifiedAwsConnections.find((connection) => connection.id === selectedAwsConnectionId)?.region ?? "AWS region 선택 전"}</span>
                </div>
              </div>
              {deploymentContent}
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}

function DeploymentPreDeploymentSummary({
  analysis,
  onOpenFindingTerraformSource
}: {
  readonly analysis: AiPreDeploymentAnalysisResult;
  readonly onOpenFindingTerraformSource: (finding: CheckFinding) => TerraformSourceLocation | null;
}) {
  const failCount = countChecklistItems(analysis, "fail");
  const warningCount = countChecklistItems(analysis, "warning");
  const gateLevel = getPreDeploymentGateLevel(analysis);

  return (
    <div className={styles.deploymentPreflightSummary} data-level={gateLevel}>
      <div className={styles.deploymentGateHeader}>
        <span className={styles.deploymentGateBadge}>{gateLevel.toUpperCase()}</span>
        <strong>배포 안전성 검사 결과</strong>
      </div>
      <p>{analysis.summary}</p>
      {analysis.deepScan ? (
        <p className={styles.deploymentHint} data-testid="pre-deployment-deep-scan-status">
          {analysis.deepScan.status === "running"
            ? "핵심 안전검사 완료 · Trivy 심층검사 진행 중"
            : analysis.deepScan.status === "complete"
              ? "핵심 안전검사 및 Trivy 심층검사 완료 · 결과 병합됨"
              : analysis.deepScan.status === "failed"
                ? analysis.deepScan.message ?? "Trivy 심층검사를 완료하지 못했습니다."
                : "핵심 안전검사 완료"}
        </p>
      ) : null}
      <div className={styles.deploymentPreflightStats} aria-label="배포 전 검사 요약">
        <span>
          <strong>{analysis.findings.length}</strong>
          발견 항목
        </span>
        <span>
          <strong>{failCount}</strong>
          실패
        </span>
        <span>
          <strong>{warningCount}</strong>
          주의
        </span>
      </div>
      {analysis.findings.length > 0 ? (
        <ul className={styles.deploymentPreflightFindings}>
          {analysis.findings.map((finding) => (
            <DeploymentPreDeploymentFindingItem
              finding={finding}
              key={finding.id}
              onOpenFindingTerraformSource={onOpenFindingTerraformSource}
            />
          ))}
        </ul>
      ) : (
        <p className={styles.deploymentHint}>표시할 Check Finding이 없습니다.</p>
      )}
    </div>
  );
}

function DeploymentPreDeploymentFindingItem({
  finding,
  onOpenFindingTerraformSource
}: {
  readonly finding: CheckFinding;
  readonly onOpenFindingTerraformSource: (finding: CheckFinding) => TerraformSourceLocation | null;
}) {
  function openTerraformSource(): void {
    onOpenFindingTerraformSource(finding);
  }

  return (
    <li data-severity={finding.severity}>
      <div className={styles.deploymentFindingHeader}>
        <span>{finding.severity.toUpperCase()}</span>
        <strong>{finding.title}</strong>
      </div>
      {finding.resourceId || (finding.trivyRuleIds && finding.trivyRuleIds.length > 0) ? (
        <div className={styles.deploymentFindingMeta}>
          {finding.resourceId ? <em>{finding.resourceId}</em> : null}
          {finding.trivyRuleIds && finding.trivyRuleIds.length > 0 ? (
            <em>Trivy rules · {finding.trivyRuleIds.join(", ")}</em>
          ) : null}
        </div>
      ) : null}
      <div className={styles.deploymentFindingActions}>
        <button
          className={styles.deploymentFindingFixButton}
          onClick={openTerraformSource}
          type="button"
        >
          <Code2 size={14} aria-hidden="true" />
          코드에서 수정
        </button>
        <DeploymentFindingAiExplanation finding={finding} />
      </div>
    </li>
  );
}

function DeploymentFindingAiExplanation({ finding }: { readonly finding: CheckFinding }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [explanation, setExplanation] = useState<AiSafetyExplanation | null>(
    finding.aiSafetyExplanation ?? null
  );
  const [explanationState, setExplanationState] = useState<RequestState>("idle");
  const [explanationError, setExplanationError] = useState("");

  async function toggleExplanation(): Promise<void> {
    if (isExpanded) {
      setIsExpanded(false);
      return;
    }

    setIsExpanded(true);

    if (explanation || explanationState === "loading") {
      return;
    }

    setExplanationState("loading");
    setExplanationError("");

    try {
      setExplanation(await runAiSafetyFindingExplanation(finding));
      setExplanationState("idle");
    } catch (error) {
      setExplanationState("error");
      setExplanationError(getApiErrorMessage(error, "AI 상세 설명을 불러오지 못했습니다."));
    }
  }

  return (
    <>
      <button
        aria-expanded={isExpanded}
        className={styles.deploymentFindingAiButton}
        onClick={() => void toggleExplanation()}
        type="button"
      >
        {isExpanded ? "설명 접기" : "설명 보기"}
      </button>
      {isExpanded ? (
        <div className={styles.deploymentFindingAiExplanation}>
          <p>{finding.description}</p>
          <dl>
            <div>
              <dt>기본 권장 수정</dt>
              <dd>{finding.recommendation}</dd>
            </div>
          </dl>
          {explanationState === "loading" ? <p>AI 상세 설명을 생성하는 중입니다.</p> : null}
          {explanationState === "error" ? <p role="alert">{explanationError}</p> : null}
          {explanation ? (
            <dl>
              <div>
                <dt>왜 위험한가</dt>
                <dd>{explanation.whyDangerous}</dd>
              </div>
              <div>
                <dt>AI 권장 수정</dt>
                <dd>{explanation.recommendedFix}</dd>
              </div>
              {explanation.terraformHint ? (
                <div>
                  <dt>Terraform 힌트</dt>
                  <dd>{explanation.terraformHint}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
          {explanation ? (
            <DeploymentPreDeploymentTextList
              items={explanation.verificationSteps}
              title="확인 방법"
            />
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function DeploymentPreDeploymentTextList({
  items,
  title
}: {
  readonly items: readonly string[];
  readonly title: string;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className={styles.deploymentPreflightAiList}>
      <strong>{title}</strong>
      <ul>
        {items.map((item, index) => (
          <li key={`${title}-${index}-${item}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function DeploymentGateCard({ deployment }: { readonly deployment: Deployment }) {
  const gate = getDeploymentGateMeta(deployment);

  return (
    <div className={styles.deploymentGateCard} data-level={gate.level}>
      <div className={styles.deploymentGateHeader}>
        <span className={styles.deploymentGateBadge}>{gate.level.toUpperCase()}</span>
        <strong>{gate.title}</strong>
      </div>
      <p>{gate.description}</p>
      <dl className={styles.deploymentGateFacts}>
        <div>
          <dt>Blocked by</dt>
          <dd>{deployment.blockedBy ?? "none"}</dd>
        </div>
        <div>
          <dt>Approval</dt>
          <dd>{formatApprovalState(deployment)}</dd>
        </div>
        <div>
          <dt>Warnings</dt>
          <dd>{deployment.planSummary?.warnings.length ?? 0}</dd>
        </div>
      </dl>
    </div>
    )
}

function DeploymentFailureExplanationCard({
  errorMessage,
  explanation,
  state
}: {
  readonly errorMessage: string;
  readonly explanation: DeploymentFailureExplanation | null;
  readonly state: RequestState;
}) {
  if (state === "loading") {
    return <p className={styles.deploymentNotice}>실패 설명을 생성하는 중입니다.</p>;
  }

  if (state === "error") {
    return (
      <p className={styles.deploymentError} role="alert">
        {errorMessage}
      </p>
    );
  }

  if (!explanation) {
    return null;
  }

  return (
    <article className={styles.deploymentFailureExplanation}>
      <div className={styles.deploymentFailureHeader}>
        <span>{explanation.severity.toUpperCase()}</span>
        <strong>실패 요약</strong>
      </div>
      <p>{explanation.summary}</p>
      <div className={styles.deploymentFailureMeta}>
        <InfoRow label="Failure stage" value={explanation.stage ?? "unknown"} />
        <InfoRow label="Cleanup" value={explanation.cleanupRequired ? "필요" : "현재 필수 아님"} />
        {explanation.llmExplanation?.fallbackUsed ? (
          <InfoRow
            label="AI fallback"
            value={explanation.llmExplanation.fallbackReason ?? "rule_based"}
          />
        ) : null}
      </div>
      <div className={styles.deploymentFailureBody}>
        <strong>원인 후보</strong>
        <p>{explanation.likelyCause}</p>
      </div>
      {explanation.firstErrorLog ? (
        <div className={styles.deploymentFailureBody}>
          <strong>첫 오류 로그</strong>
          <code>{explanation.firstErrorLog}</code>
        </div>
      ) : null}
      <div className={styles.deploymentFailureBody}>
        <strong>다음 행동</strong>
        <ul>
          {explanation.nextActions.map((action) => (
            <li key={action}>{action}</li>
          ))}
        </ul>
      </div>
    </article>
  );
}

function countChecklistItems(
  analysis: AiPreDeploymentAnalysisResult,
  status: AiPreDeploymentAnalysisResult["checklist"][number]["status"]
): number {
  return analysis.checklist.filter((item) => item.status === status).length;
}

function InfoRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function OptionalInfoRow({
  label,
  value
}: {
  readonly label: string;
  readonly value: string | null | undefined;
}) {
  if (!shouldShowDeploymentInfoValue(value)) {
    return null;
  }

  return <InfoRow label={label} value={value} />;
}

function PlanSummaryRows({ deployment }: { readonly deployment: Deployment }) {
  const summary = deployment.planSummary;

  if (!summary) {
    return null;
  }

  return (
    <>
      <InfoRow
        label="Plan changes"
        value={`+${summary.createCount} ~${summary.updateCount} -${summary.deleteCount} +/-${summary.replaceCount}`}
      />
      {summary.warnings.length > 0 ? (
        <div className={styles.deploymentWarnings}>
          <span>Warnings</span>
          <ul>
            {summary.warnings.map((warning, index) => (
              <li data-level={getWarningLevel(String(warning.level))} key={`${warning.level}-${index}`}>
                <strong>{warning.level}</strong>
                <p>{warning.message}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

function getDeploymentGateMeta(deployment: Deployment): {
  readonly description: string;
  readonly level: "high" | "medium" | "low";
  readonly title: string;
} {
  if (deployment.isBlocked) {
    return {
      description:
        deployment.blockedReason ??
        "Plan approval, risk analysis, or cost analysis must be resolved before execution.",
      level: "high",
      title: "Deployment intentionally locked"
    };
  }

  if ((deployment.planSummary?.warnings.length ?? 0) > 0) {
    return {
      description: "Plan warnings are present. Review the summary before running Apply or Destroy.",
      level: "medium",
      title: "Review required"
    };
  }

  return {
    description: "No blocking deployment gate is currently reported for this plan.",
    level: "low",
    title: "Gate clear"
  };
}

function getPreDeploymentGateLevel(analysis: AiPreDeploymentAnalysisResult): "high" | "medium" | "low" {
  if (analysis.findings.some((finding) => finding.severity === "high")) {
    return "high";
  }

  if (
    analysis.findings.some((finding) => finding.severity === "medium") ||
    countChecklistItems(analysis, "fail") > 0 ||
    countChecklistItems(analysis, "warning") > 0
  ) {
    return "medium";
  }

  return "low";
}

function getWarningLevel(level: string): "high" | "medium" | "low" {
  if (level === "high" || level === "medium" || level === "low") {
    return level;
  }

  return "medium";
}

function formatApprovalState(deployment: Deployment): string {
  if (deployment.approvedAt) {
    return "승인됨";
  }

  if (!deployment.currentPlanArtifactId) {
    return "Plan 필요";
  }

  if (deployment.isBlocked && deployment.blockedBy === "missing_approval") {
    return "승인 가능";
  }

  if (deployment.isBlocked) {
    return "승인 불가";
  }

  return "승인 필요 없음";
}

function getDirectPreflightState({
  analysis,
  errorMessage,
  hasStaleAnalysis,
  requestState
}: {
  readonly analysis: AiPreDeploymentAnalysisResult | null;
  readonly errorMessage: string;
  readonly hasStaleAnalysis: boolean;
  readonly requestState: AiRequestState;
}): DirectDeploymentPreflightState {
  if (requestState === "loading") {
    return "loading";
  }

  if (requestState === "error" || errorMessage) {
    return "error";
  }

  if (!analysis || hasStaleAnalysis) {
    return "idle";
  }

  const highFindingIds = new Set(
    analysis.findings
      .filter((finding) => finding.severity === "high")
      .map((finding) => finding.id)
  );
  const hasIndependentChecklistFailure = analysis.checklist.some(
    (item) =>
      item.status === "fail" &&
      (item.relatedFindingIds.length === 0 ||
        item.relatedFindingIds.some((findingId) => !highFindingIds.has(findingId)))
  );

  if (hasIndependentChecklistFailure) {
    return "blocked";
  }

  if (
    analysis.findings.length > 0 ||
    countChecklistItems(analysis, "fail") > 0 ||
    countChecklistItems(analysis, "warning") > 0
  ) {
    return "warning";
  }

  return "passed";
}

function getPrimaryDeploymentStepStatus(deployment: Deployment | null): string {
  if (!deployment) {
    return "리뷰 생성 후 실행";
  }

  if (deployment.status === "RUNNING") {
    return "Terraform 실행 중";
  }

  if (deployment.status === "FAILED") {
    return "실패";
  }

  if (deployment.status === "SUCCESS") {
    return "배포 완료";
  }

  if (deployment.status === "DESTROYED") {
    return "정리 완료";
  }

  if (!deployment.currentPlanArtifactId) {
    return "Plan 필요";
  }

  if (!deployment.approvedAt) {
    return "승인 필요";
  }

  return "실행 준비됨";
}

function getDeploymentActionHint(deployment: Deployment): string {
  if (deployment.status === "DESTROYED") {
    return "Cleanup destroy가 완료되었습니다. Deployment 결과와 state pointer가 정리되었습니다.";
  }

  if (deployment.approvedAt && !hasCompleteDeploymentApprovalSnapshot(deployment)) {
    const actionLabel = deployment.currentPlanOperation === "destroy" ? "Destroy" : "Apply";

    return `승인 스냅샷이 불완전합니다. Terraform Plan을 다시 실행하고 승인한 뒤 ${actionLabel}를 진행하세요.`;
  }

  if (deployment.currentPlanOperation === "destroy" && deployment.approvedAt) {
    return "승인된 Destroy Plan이 준비되었습니다. 실제 삭제 전 AWS 계정과 삭제 변경 내용을 다시 확인하세요.";
  }

  if (
    deployment.currentPlanOperation === "destroy" &&
    deployment.isBlocked &&
    deployment.blockedBy === "missing_approval"
  ) {
    return "Destroy Plan 내용을 확인한 뒤 승인할 수 있습니다. 승인 전에는 AWS 리소스를 삭제하지 않습니다.";
  }

  if (deployment.status === "RUNNING") {
    if (deployment.cancelRequestedAt) {
      return "취소 요청을 보냈습니다. Terraform 프로세스가 멈추면 상태가 갱신됩니다.";
    }

    return "Terraform 작업이 진행 중입니다. 상태와 로그가 자동으로 갱신됩니다.";
  }

  if (deployment.approvedAt) {
    if (deployment.status === "SUCCESS") {
      return "Apply가 완료되었습니다. 생성된 리소스와 Terraform output을 아래에서 확인할 수 있습니다.";
    }

    return "승인된 Plan이 준비되었습니다. Apply 실행 전 AWS 계정과 변경 내용을 다시 확인하세요.";
  }

  if (!deployment.currentPlanArtifactId) {
    return "Terraform Plan을 먼저 실행하면 승인 버튼이 표시됩니다.";
  }

  if (deployment.isBlocked && deployment.blockedBy === "missing_approval") {
    return "Plan 내용을 확인한 뒤 승인할 수 있습니다.";
  }

  if (deployment.isBlocked) {
    return "현재 Plan은 승인 전에 차단 사유를 해결해야 합니다.";
  }

  return "";
}

function mergeDeploymentLog(logs: DeploymentLog[], log: DeploymentLog): DeploymentLog[] {
  if (
    logs.some(
      (currentLog) => currentLog.id === log.id || currentLog.sequence === log.sequence
    )
  ) {
    return logs;
  }

  return [...logs, log].sort((left, right) => left.sequence - right.sequence);
}

function DeploymentLogList({ logs }: { readonly logs: DeploymentLog[] }) {
  if (logs.length === 0) {
    return <p className={styles.deploymentHint}>아직 표시할 로그가 없습니다.</p>;
  }

  return (
    <ol aria-label="Deployment logs" className={styles.deploymentLogList}>
      {logs.map((log) => {
        const prefix = `${String(log.sequence).padStart(3, "0")}  ${log.stage
          .toUpperCase()
          .padEnd(8, " ")}  `;

        return (
          <li data-tone={getDeploymentLogTone(log)} key={log.id}>
            <span className={styles.deploymentLogPrefix}>{prefix}</span>
            <p>
              {getDeploymentLogMessageTokens(log.message).map((token, index) => (
                <span
                  className={getDeploymentLogTokenClassName(token)}
                  key={`${log.id}-${index}`}
                >
                  {token.text}
                </span>
              ))}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function getDeploymentLogTokenClassName(token: DeploymentLogMessageToken): string {
  const plainClassName = styles.deploymentLogTokenPlain ?? "";

  switch (token.tone) {
    case "metadata":
      return styles.deploymentLogTokenMetadata ?? plainClassName;
    case "operation":
      return styles.deploymentLogTokenOperation ?? plainClassName;
    case "output":
      return styles.deploymentLogTokenOutput ?? plainClassName;
    case "resource":
      return styles.deploymentLogTokenResource ?? plainClassName;
    case "string":
      return styles.deploymentLogTokenString ?? plainClassName;
    case "plain":
      return plainClassName;
  }
}

function formatShortHash(value: string | null): string {
  if (!value) {
    return "없음";
  }

  if (value.length <= 16) {
    return value;
  }

  return `${value.slice(0, 12)}...${value.slice(-4)}`;
}

function formatOutputValue(output: TerraformOutput): string {
  if (output.sensitive) {
    return "[sensitive]";
  }

  if (output.value === null || output.value === undefined) {
    return "없음";
  }

  if (typeof output.value === "string") {
    return output.value;
  }

  return JSON.stringify(output.value);
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("ko-KR", {
    dateStyle: "short",
    timeStyle: "short"
  });
}
