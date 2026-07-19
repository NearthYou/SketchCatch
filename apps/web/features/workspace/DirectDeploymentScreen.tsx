import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useReducer, useRef } from "react";
import type {
  ApplicationRelease,
  AiPreDeploymentAnalysisResult,
  AiSafetyExplanation,
  AwsConnection,
  CheckFinding,
  DeployedResource,
  Deployment,
  DeploymentScope,
  DiagramJson,
  DeploymentLog,
  ProjectBuildEnvironment,
  TerraformDiagnostic,
  TerraformSourceLocation,
  TerraformOutput
} from "@sketchcatch/types";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  CircleDot,
  Clipboard,
  ClipboardCheck,
  Clock3,
  Code2,
  RotateCw,
  ShieldCheck,
  Trash2
} from "lucide-react";
import { DashboardIcon } from "../../components/dashboard/dashboard-icons";
import { SelectMenu, type SelectMenuOption } from "../../components/ui/SelectMenu";
import { getApiErrorMessage } from "../../lib/api-client";
import {
  approveDeploymentPlan,
  revokeDeploymentApproval,
  cancelDeployment as cancelDeploymentRun,
  executeDeployment,
  getAiPreDeploymentDeepScan,
  getProjectDeploymentTarget,
  getProjectBuildEnvironment,
  listApplicationReleases,
  listAwsConnections,
  listDeploymentResources,
  listDeploymentLogs,
  listDeployments,
  listTerraformOutputs,
  prepareDeployment,
  prepareInfrastructureRollback,
  retryDeploymentFrontend,
  runDeploymentDestroy,
  runDeploymentDestroyPlan,
  runDeploymentPlan,
  runAiPreDeploymentCheck,
  runAiSafetyFindingExplanation,
  streamDeploymentLogs
} from "./api";
import {
  getDeploymentActionState,
  getInfrastructureRollbackTarget,
  getDeploymentLogMessageTokens,
  getDeploymentLogTone,
  selectDeploymentCleanupTargets,
  shouldAutoRefreshDeployment,
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
import type { PreparedWorkspaceDeploymentArtifacts } from "./workspace-deployment-artifacts";
import {
  getDeploymentPreparationErrorMessage,
  getDeploymentTargetPrerequisite,
  type DeploymentTargetPrerequisite
} from "./deployment-preparation-error";
import type { RequestState } from "./workspace-right-panel.types";
import { canLoadDeploymentData, type DeploymentAvailability } from "./deployment-availability";
import {
  createResetPreDeploymentCheckState,
  getDirectDeploymentPreflightState,
  getDirectDeploymentFlow,
  hasDeploymentDraftChanges,
  resolveSelectedDirectDeploymentStepId,
  shouldShowDeploymentValidationActions,
  requiresProjectBuildEnvironment,
  type DirectDeploymentStepId
} from "./deployment-console-state";
import {
  filterDeploymentHistoryEntries,
  getDeploymentHistoryEntries,
  getDeploymentFailureDeveloperCheck,
  getDeploymentHistoryMetrics,
  getDeploymentStatusPresentation,
  resolveDeploymentHistorySelection,
  type DeploymentHistoryFilter,
  type DeploymentStatusTone
} from "./deployment-presentation";
import { formatDeploymentDuration, getDeploymentDurationLabel } from "./deployment-duration";
import {
  beginDeploymentHistoryDetailsLoad,
  completeDeploymentHistoryDetailsLoad,
  failDeploymentHistoryDetailsLoad,
  initialDeploymentHistoryDetailsState,
  selectDeploymentLogView
} from "./deployment-history-details";
import { DeploymentOutputLinks } from "./DeploymentOutputLinks";
import { DeploymentProgressBar } from "./DeploymentProgressBar";
import type { DeploymentProgressOperation } from "./deployment-progress";
import {
  getSafeDeploymentLinks,
  getVisibleDeploymentOutputs,
  initialDeploymentOutputState,
  reduceDeploymentOutputState
} from "./deployment-output-links";
import styles from "./workspace.module.css";

type DeploymentRuntimeSnapshot = {
  readonly buildEnvironment: ProjectBuildEnvironment | null;
  readonly deployments: Deployment[];
  readonly releases: ApplicationRelease[];
  readonly logs: DeploymentLog[];
  readonly resources: DeployedResource[];
  readonly outputs: TerraformOutput[];
  readonly outputsDeploymentId: string | null;
};
type DeploymentPanelSnapshot = DeploymentRuntimeSnapshot & {
  readonly awsConnections: AwsConnection[];
  readonly buildEnvironment: ProjectBuildEnvironment | null;
};

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

export type DirectDeploymentScreenProps = {
  readonly confirmationDismissRequestId?: number | undefined;
  readonly deploymentAvailability: DeploymentAvailability;
  readonly deploymentTargetSavedRevision?: number | undefined;
  readonly diagramJson: DiagramJson;
  readonly hasUnsavedDeploymentBaseline: boolean;
  readonly onConfirmationStateChange?: ((isOpen: boolean) => void) | undefined;
  readonly onApplyPlanApproved?: ((deployment: Deployment) => void) | undefined;
  readonly onDeploymentSucceeded?: ((deployment: Deployment) => void) | undefined;
  readonly onOpenFindingTerraformSource: (finding: CheckFinding) => TerraformSourceLocation | null;
  readonly onOpenDeliverySetup?: (() => void) | undefined;
  readonly onOpenLiveObservation?: (() => void) | undefined;
  readonly onPrepareDeploymentArtifacts: () => Promise<PreparedWorkspaceDeploymentArtifacts>;
  readonly onPreDeploymentCheckStateChange: Dispatch<
    SetStateAction<DeploymentPreDeploymentCheckState>
  >;
  readonly onValidateTerraformDiagnostics: () => Promise<TerraformDiagnostic[]>;
  readonly preDeploymentCheckState: DeploymentPreDeploymentCheckState;
  readonly projectId: string;
  readonly requestedScope?: "application" | "full_stack" | null | undefined;
  readonly projectDraftRevision?: number | null | undefined;
};

// Direct Deployment reports only Resources that can enter the Terraform execution graph.
export function DirectDeploymentScreen({
  confirmationDismissRequestId = 0,
  deploymentAvailability,
  deploymentTargetSavedRevision = 0,
  diagramJson,
  hasUnsavedDeploymentBaseline,
  onApplyPlanApproved,
  onDeploymentSucceeded,
  onConfirmationStateChange,
  onOpenDeliverySetup,
  onOpenFindingTerraformSource,
  onOpenLiveObservation,
  onPrepareDeploymentArtifacts,
  onPreDeploymentCheckStateChange,
  onValidateTerraformDiagnostics,
  preDeploymentCheckState,
  projectId,
  requestedScope = null,
  projectDraftRevision = null
}: DirectDeploymentScreenProps) {
  const [awsConnections, setAwsConnections] = useState<AwsConnection[]>([]);
  const [buildEnvironment, setBuildEnvironment] = useState<ProjectBuildEnvironment | null>(null);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [applicationReleases, setApplicationReleases] = useState<ApplicationRelease[]>([]);
  const [deploymentLogs, setDeploymentLogs] = useState<DeploymentLog[]>([]);
  const [_deploymentResources, setDeploymentResources] = useState<DeployedResource[]>([]);
  const [terraformOutputState, dispatchTerraformOutputState] = useReducer(
    reduceDeploymentOutputState,
    initialDeploymentOutputState
  );
  const [selectedAwsConnectionId, setSelectedAwsConnectionId] = useState("");
  const [selectedScope, setSelectedScope] = useState<DeploymentScope | "auto">("auto");
  const [selectedDeploymentId, setSelectedDeploymentId] = useState("");
  const [selectedHistoryDeploymentId, setSelectedHistoryDeploymentId] = useState("");
  const [deploymentHistoryFilter, setDeploymentHistoryFilter] =
    useState<DeploymentHistoryFilter>("all");
  const [deploymentHistoryDetails, setDeploymentHistoryDetails] = useState(
    initialDeploymentHistoryDetailsState
  );
  const previousLatestHistoryDeploymentIdRef = useRef("");
  const handledConfirmationDismissRequestIdRef = useRef(confirmationDismissRequestId);
  const [showApplyConfirmation, setShowApplyConfirmation] = useState(false);
  const [showInfrastructureRollbackConfirmation, setShowInfrastructureRollbackConfirmation] =
    useState(false);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [failedActionStepId, setFailedActionStepId] =
    useState<DirectDeploymentStepId | null>(null);
  const [snapshotErrorMessage, setSnapshotErrorMessage] = useState("");
  const [detailErrorMessage, setDetailErrorMessage] = useState("");
  const [isInitialSnapshotLoading, setIsInitialSnapshotLoading] = useState(false);
  const actionInFlightRef = useRef(false);
  const pendingAutoAdvanceDeploymentIdRef = useRef("");
  const latestDetailsDeploymentIdRef = useRef("");
  const [deploymentTargetPrerequisite, setDeploymentTargetPrerequisite] =
    useState<DeploymentTargetPrerequisite | null>(null);
  const [activeProgress, setActiveProgress] = useState<{
    readonly operation: DeploymentProgressOperation;
    readonly requestedAtMs: number;
  } | null>(null);
  const [selectedDirectStepId, setSelectedDirectStepId] =
    useState<DirectDeploymentStepId>("validation");
  const completionCandidateDeploymentIdsRef = useRef(new Set<string>());
  const isDeploymentOverlayOpen = true;

  useEffect(() => {
    if (requestedScope) setSelectedScope(requestedScope);
  }, [requestedScope]);

  useEffect(() => {
    setDeploymentTargetPrerequisite(null);
  }, [deploymentTargetSavedRevision, projectId, selectedAwsConnectionId, selectedScope]);

  const verifiedAwsConnections = useMemo(
    () => awsConnections.filter((connection) => connection.status === "verified"),
    [awsConnections]
  );
  const deploymentScopeOptions = useMemo<SelectMenuOption[]>(
    () => [
      {
        detail: "저장된 Terraform과 확인된 프로젝트 실행 타깃을 기준으로 결정",
        label: "자동 감지",
        value: "auto"
      },
      {
        detail: "Terraform 인프라만 배포",
        label: "인프라",
        value: "infrastructure"
      },
      {
        detail: "확인된 프로젝트 애플리케이션 타깃만 배포",
        label: "애플리케이션",
        value: "application"
      },
      {
        detail: "인프라와 애플리케이션을 한 프로젝트 릴리즈로 배포",
        label: "전체 스택",
        value: "full_stack"
      }
    ],
    []
  );
  const sortedApplicationReleases = useMemo(
    () =>
      [...applicationReleases].sort(
        (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)
      ),
    [applicationReleases]
  );
  const deploymentHistoryEntries = useMemo(
    () => getDeploymentHistoryEntries(deployments),
    [deployments]
  );
  const deploymentHistoryMetrics = useMemo(
    () => getDeploymentHistoryMetrics(deploymentHistoryEntries),
    [deploymentHistoryEntries]
  );
  const filteredDeploymentHistoryEntries = useMemo(
    () => filterDeploymentHistoryEntries(deploymentHistoryEntries, deploymentHistoryFilter),
    [deploymentHistoryEntries, deploymentHistoryFilter]
  );
  const selectedDeployment = useMemo(
    () => deployments.find((deployment) => deployment.id === selectedDeploymentId) ?? null,
    [deployments, selectedDeploymentId]
  );
  const cleanupDeployments = useMemo(
    () => selectDeploymentCleanupTargets(deployments),
    [deployments]
  );

  const selectedApplicationRelease = useMemo(
    () =>
      sortedApplicationReleases.find(
        (release) => release.deploymentId === selectedDeployment?.id
      ) ?? null,
    [selectedDeployment?.id, sortedApplicationReleases]
  );
  const infrastructureRollbackTarget = useMemo(
    () => getInfrastructureRollbackTarget(selectedDeployment, deployments),
    [deployments, selectedDeployment]
  );
  const terraformOutputs = useMemo(
    () => getVisibleDeploymentOutputs(terraformOutputState, selectedDeploymentId),
    [selectedDeploymentId, terraformOutputState]
  );
  const deploymentOutputLinks = useMemo(
    () => getSafeDeploymentLinks(terraformOutputs),
    [terraformOutputs]
  );
  const hasLoadedSelectedHistoryDetails =
    deploymentHistoryDetails.deploymentId === selectedHistoryDeploymentId &&
    deploymentHistoryDetails.requestState === "success";
  const loadedHistoryDeploymentLogs = hasLoadedSelectedHistoryDetails
    ? deploymentHistoryDetails.logs
    : [];
  const historyDeploymentResources = hasLoadedSelectedHistoryDetails
    ? deploymentHistoryDetails.resources
    : [];
  const historyTerraformOutputs = hasLoadedSelectedHistoryDetails
    ? deploymentHistoryDetails.outputs
    : [];
  const historyDetailsIsLoading =
    selectedHistoryDeploymentId.length > 0 &&
    (deploymentHistoryDetails.deploymentId !== selectedHistoryDeploymentId ||
      deploymentHistoryDetails.requestState === "loading");
  const historyDetailsErrorMessage =
    deploymentHistoryDetails.deploymentId === selectedHistoryDeploymentId &&
    deploymentHistoryDetails.requestState === "error"
      ? deploymentHistoryDetails.errorMessage
      : "";
  const deploymentLogView = selectDeploymentLogView({
    currentDeploymentId: selectedDeploymentId,
    currentLogs: deploymentLogs,
    historyDeploymentId: selectedHistoryDeploymentId,
    historyErrorMessage: historyDetailsErrorMessage,
    historyIsLoading: historyDetailsIsLoading,
    historyLogs: loadedHistoryDeploymentLogs
  });
  const historyDeploymentLogs = deploymentLogView.logs;
  const historyDeploymentOutputLinks = useMemo(
    () => getSafeDeploymentLinks(historyTerraformOutputs),
    [historyTerraformOutputs]
  );
  const canStartDeploymentReview =
    selectedAwsConnectionId.length > 0 &&
    requestState !== "loading" &&
    !isInitialSnapshotLoading;
  const hasCurrentPlan = Boolean(selectedDeployment?.currentPlanArtifactId);
  const canReconcileAcceptedPlan = Boolean(
    requestState === "error" &&
      failedActionStepId === "validation" &&
      selectedDeployment &&
      pendingAutoAdvanceDeploymentIdRef.current === selectedDeployment.id &&
      (selectedDeployment.status === "RUNNING" || selectedDeployment.currentPlanArtifactId)
  );
  const reconciledRequestState: RequestState = canReconcileAcceptedPlan
    ? selectedDeployment?.status === "RUNNING"
      ? "loading"
      : "idle"
    : requestState;
  const deploymentActions = getDeploymentActionState(
    selectedDeployment,
    reconciledRequestState
  );

  const cleanupActionTargets = cleanupDeployments.map((deployment) => ({
    actions: getDeploymentActionState(deployment, requestState),
    deployment
  }));
  const canRunPlan = deploymentActions.canRunApplyPlan;
  const canApprovePlan = deploymentActions.canApprovePlan;
  const canApply = deploymentActions.canApply;

  const canCancelDeployment = deploymentActions.canCancelDeployment;
  const shouldShowApplyButton = deploymentActions.shouldShowApplyButton;

  const hasCurrentDeploymentChanges = hasDeploymentDraftChanges({
    currentDraftRevision: projectDraftRevision,
    hasUnsavedWorkspaceChanges: hasUnsavedDeploymentBaseline,
    preparedDraftRevision: selectedDeployment?.preparedDraftRevision ?? null
  });
  const DeploymentBaselineIcon = hasCurrentDeploymentChanges ? Clipboard : ClipboardCheck;
  const shouldAutoRefreshSelectedDeployment = shouldAutoRefreshDeployment(selectedDeployment);
  const preDeploymentAnalysis = preDeploymentCheckState.analysis;
  const preDeploymentState = preDeploymentCheckState.requestState;
  const preDeploymentErrorMessage = preDeploymentCheckState.errorMessage;
  const preDeploymentFingerprint = preDeploymentCheckState.fingerprint;
  const boardSnapshot = useMemo(() => createWorkspaceAiBoardSnapshot(diagramJson), [diagramJson]);
  const hasStalePreDeploymentAnalysis =
    preDeploymentAnalysis !== null &&
    isWorkspaceAiResultStale(preDeploymentFingerprint, boardSnapshot.fingerprint);
  const directPreflightState = getDirectDeploymentPreflightState({
    analysis: preDeploymentAnalysis,
    errorMessage: preDeploymentErrorMessage,
    hasStaleAnalysis: hasStalePreDeploymentAnalysis,
    requestState: preDeploymentState
  });
  const canRunDeploymentReviewStep = canStartDeploymentReview && preDeploymentState !== "loading";
  const primaryDeploymentStepStatus = getPrimaryDeploymentStepStatus(selectedDeployment);
  const directDeploymentFlow = getDirectDeploymentFlow({
    actions: deploymentActions,
    deployment: selectedDeployment,
    failedStepId: failedActionStepId,
    hasUnsavedBaseline: hasCurrentDeploymentChanges,
    preflightState: directPreflightState,
    reconciledRequestState,
    requestState
  });
  const deploymentProgressIsStarting = Boolean(
    activeProgress &&
    (reconciledRequestState === "loading" ||
      preDeploymentState === "loading" ||
      (selectedDeployment?.status === "PENDING" && !selectedDeployment.currentPlanArtifactId))
  );
  const deploymentFailureDeveloperCheck = getDeploymentFailureDeveloperCheck(
    selectedDeployment?.failureStage ?? null,
    process.env.NODE_ENV,
    selectedDeployment?.errorSummary
  );
  const needsBuildEnvironment = requiresProjectBuildEnvironment(selectedDeployment);

  useEffect(() => {
    if (
      reconciledRequestState === "idle" &&
      selectedDeployment &&
      pendingAutoAdvanceDeploymentIdRef.current === selectedDeployment.id &&
      directDeploymentFlow.activeStepId === "approval"
    ) {
      pendingAutoAdvanceDeploymentIdRef.current = "";
      setRequestState("idle");
      setFailedActionStepId(null);
      setErrorMessage("");
      setSelectedDirectStepId("approval");
    }
  }, [directDeploymentFlow.activeStepId, reconciledRequestState, selectedDeployment]);

  useEffect(() => {
    if (
      selectedDeployment?.status === "SUCCESS" &&
      completionCandidateDeploymentIdsRef.current.delete(selectedDeployment.id)
    ) {
      onDeploymentSucceeded?.(selectedDeployment);
    }
  }, [onDeploymentSucceeded, selectedDeployment]);

  useEffect(() => {
    const selection = resolveDeploymentHistorySelection({
      currentSelectionId: selectedHistoryDeploymentId,
      deployments,
      previousLatestDeploymentId: previousLatestHistoryDeploymentIdRef.current
    });

    previousLatestHistoryDeploymentIdRef.current = selection.latestDeploymentId;

    if (selection.selectedDeploymentId !== selectedHistoryDeploymentId) {
      setSelectedHistoryDeploymentId(selection.selectedDeploymentId);
    }
  }, [deployments, selectedHistoryDeploymentId]);

  useEffect(() => {
    if (shouldShowApplyButton) {
      setShowApplyConfirmation(true);
    }
  }, [shouldShowApplyButton]);

  useEffect(() => {
    onConfirmationStateChange?.(showApplyConfirmation || showInfrastructureRollbackConfirmation);
  }, [onConfirmationStateChange, showApplyConfirmation, showInfrastructureRollbackConfirmation]);

  useEffect(() => {
    if (confirmationDismissRequestId === handledConfirmationDismissRequestIdRef.current) {
      return;
    }

    handledConfirmationDismissRequestIdRef.current = confirmationDismissRequestId;
    setShowApplyConfirmation(false);
    setShowInfrastructureRollbackConfirmation(false);
  }, [confirmationDismissRequestId]);

  const loadDeploymentRuntimeSnapshot =
    useCallback(async (): Promise<DeploymentRuntimeSnapshot> => {
      const [
        nextBuildEnvironment,
        nextDeployments,
        nextReleases,
        nextLogs,
        nextResources,
        nextOutputs
      ] = await Promise.all([
          getProjectBuildEnvironment(projectId),
          listDeployments(projectId),
          listApplicationReleases(projectId),
          selectedDeploymentId ? listDeploymentLogs(selectedDeploymentId) : Promise.resolve([]),
          selectedDeploymentId
            ? listDeploymentResources(selectedDeploymentId)
            : Promise.resolve([]),
          selectedDeploymentId ? listTerraformOutputs(selectedDeploymentId) : Promise.resolve([])
        ]);

      return {
        buildEnvironment: nextBuildEnvironment,
        deployments: nextDeployments,
        releases: nextReleases,
        logs: nextLogs,
        resources: nextResources,
        outputs: nextOutputs,
        outputsDeploymentId: selectedDeploymentId || null
      };
    }, [projectId, selectedDeploymentId]);

  const applyDeploymentRuntimeSnapshot = useCallback(
    (snapshot: DeploymentRuntimeSnapshot): void => {
      setBuildEnvironment(snapshot.buildEnvironment);
      setDeployments(snapshot.deployments);
      setApplicationReleases(snapshot.releases);
      setDeploymentLogs(snapshot.logs);
      setDeploymentResources(snapshot.resources);
      dispatchTerraformOutputState(
        snapshot.outputsDeploymentId
          ? {
              type: "loaded",
              deploymentId: snapshot.outputsDeploymentId,
              outputs: snapshot.outputs
            }
          : { type: "clear", deploymentId: null }
      );
    },
    []
  );

  const loadDeploymentPanelSnapshot = useCallback(async (): Promise<DeploymentPanelSnapshot> => {
    const [nextConnections, nextBuildEnvironment, nextDeployments, nextReleases] =
      await Promise.all([
        listAwsConnections(),
        getProjectBuildEnvironment(projectId),
        listDeployments(projectId),
        listApplicationReleases(projectId)
      ]);

    return {
      awsConnections: nextConnections,
      buildEnvironment: nextBuildEnvironment,
      deployments: nextDeployments,
      releases: nextReleases,
      logs: [],
      resources: [],
      outputs: [],
      outputsDeploymentId: null
    };
  }, [projectId]);

  const applyDeploymentPanelSnapshot = useCallback(
    (snapshot: DeploymentPanelSnapshot): void => {
      const latestVerifiedConnection = snapshot.awsConnections.find(
        (connection) => connection.status === "verified"
      );

      setAwsConnections(snapshot.awsConnections);
      setBuildEnvironment(snapshot.buildEnvironment);
      applyDeploymentRuntimeSnapshot(snapshot);
      setSelectedAwsConnectionId((currentId) =>
        snapshot.awsConnections.some((connection) => connection.id === currentId)
          ? currentId
          : (latestVerifiedConnection?.id ?? "")
      );
    },
    [applyDeploymentRuntimeSnapshot]
  );

  useEffect(() => {
    if (!canLoadDeploymentData(deploymentAvailability)) {
      setSnapshotErrorMessage("");
      setIsInitialSnapshotLoading(false);
      return;
    }

    let cancelled = false;

    async function loadDeploymentData(): Promise<void> {
      setIsInitialSnapshotLoading(true);
      setSnapshotErrorMessage("");
      try {
        const snapshot = await loadDeploymentPanelSnapshot();
        if (cancelled) return;

        applyDeploymentPanelSnapshot(snapshot);
        const latestVerifiedConnection = snapshot.awsConnections.find(
          (connection) => connection.status === "verified"
        );
        const latestDeployment = snapshot.deployments[0];

        setSelectedAwsConnectionId(
          (currentId) => currentId || latestVerifiedConnection?.id || ""
        );
        setSelectedDeploymentId((currentId) => currentId || latestDeployment?.id || "");
        setSelectedDirectStepId(latestDeployment?.consolePhase ?? "validation");
      } catch (error) {
        if (!cancelled) {
          setSnapshotErrorMessage(getApiErrorMessage(error, "배포 정보를 불러오지 못했습니다."));
        }
      } finally {
        if (!cancelled) setIsInitialSnapshotLoading(false);
      }
    }

    void loadDeploymentData();

    return () => {
      cancelled = true;
    };
  }, [applyDeploymentPanelSnapshot, deploymentAvailability, loadDeploymentPanelSnapshot]);

  useEffect(() => {
    if (!selectedDeploymentId) {
      setDeploymentLogs([]);
      setDeploymentResources([]);
      dispatchTerraformOutputState({ type: "clear", deploymentId: null });
      setShowApplyConfirmation(false);
      return;
    }

    let cancelled = false;
    dispatchTerraformOutputState({ type: "clear", deploymentId: selectedDeploymentId });

    async function loadApplyDetails(): Promise<void> {
      setDetailErrorMessage("");
      try {
        const [logs, resources, outputs] = await Promise.all([
          listDeploymentLogs(selectedDeploymentId),
          listDeploymentResources(selectedDeploymentId),
          listTerraformOutputs(selectedDeploymentId)
        ]);

        if (cancelled) return;
        setDeploymentLogs(logs);
        setDeploymentResources(resources);
        dispatchTerraformOutputState({
          type: "loaded",
          deploymentId: selectedDeploymentId,
          outputs
        });
        setShowApplyConfirmation(false);
      } catch (error) {
        if (!cancelled) {
          setDetailErrorMessage(
            getApiErrorMessage(error, "배포 세부정보를 불러오지 못했습니다.")
          );
        }
      }
    }

    void loadApplyDetails();

    return () => {
      cancelled = true;
    };
  }, [selectedDeploymentId]);

  useEffect(() => {
    if (!selectedHistoryDeploymentId) {
      setDeploymentHistoryDetails(initialDeploymentHistoryDetailsState);
      return;
    }

    const deploymentId = selectedHistoryDeploymentId;
    let cancelled = false;
    setDeploymentHistoryDetails(beginDeploymentHistoryDetailsLoad(deploymentId));

    void Promise.all([
      listDeploymentLogs(deploymentId),
      listDeploymentResources(deploymentId),
      listTerraformOutputs(deploymentId)
    ])
      .then(([logs, resources, outputs]) => {
        if (!cancelled) {
          setDeploymentHistoryDetails((current) =>
            completeDeploymentHistoryDetailsLoad(current, {
              deploymentId,
              logs,
              outputs,
              resources
            })
          );
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setDeploymentHistoryDetails((current) =>
            failDeploymentHistoryDetailsLoad(current, {
              deploymentId,
              errorMessage: getApiErrorMessage(error, "배포 버전 상세를 불러오지 못했습니다.")
            })
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedHistoryDeploymentId]);

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
        setDetailErrorMessage(
          getApiErrorMessage(error, "Deployment 로그 스트림 연결에 실패했습니다.")
        );
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
          setSnapshotErrorMessage("");
        }
      } catch (error) {
        if (!cancelled) {
          setSnapshotErrorMessage(
            getApiErrorMessage(error, "Deployment 상태 자동 갱신에 실패했습니다.")
          );
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

  async function runAction<T>(
    stepId: DirectDeploymentStepId,
    request: () => Promise<T>,
    fallbackMessage: string
  ): Promise<T | null> {
    if (actionInFlightRef.current) return null;
    actionInFlightRef.current = true;
    setRequestState("loading");
    setErrorMessage("");
    setFailedActionStepId(null);

    try {
      const result = await request();
      setRequestState("idle");
      return result;
    } catch (error) {
      setRequestState("error");
      setFailedActionStepId(stepId);
      setSelectedDirectStepId(stepId);
      setErrorMessage(getDeploymentPreparationErrorMessage(error, fallbackMessage));
      return null;
    } finally {
      actionInFlightRef.current = false;
      setActiveProgress(null);
    }
  }

  function refreshDeploymentDetails(deploymentId: string): void {
    latestDetailsDeploymentIdRef.current = deploymentId;
    setDetailErrorMessage("");
    void Promise.all([
      listDeploymentLogs(deploymentId),
      listDeploymentResources(deploymentId),
      listTerraformOutputs(deploymentId)
    ])
      .then(([logs, resources, outputs]) => {
        if (latestDetailsDeploymentIdRef.current !== deploymentId) return;
        setDeploymentLogs(logs);
        setDeploymentResources(resources);
        dispatchTerraformOutputState({ type: "loaded", deploymentId, outputs });
      })
      .catch((error) => {
        if (latestDetailsDeploymentIdRef.current === deploymentId) {
          setDetailErrorMessage(
            getApiErrorMessage(
              error,
              "작업은 접수됐지만 최신 로그와 Output을 불러오지 못했습니다."
            )
          );
        }
      });
  }

  function refreshBuildEnvironmentAfterPlan(deployment: Deployment): void {
    if (!requiresProjectBuildEnvironment(deployment)) return;
    void getProjectBuildEnvironment(projectId)
      .then(setBuildEnvironment)
      .catch((error) => {
        setDetailErrorMessage(
          getApiErrorMessage(
            error,
            "Plan은 접수됐지만 빌드 환경 상태를 다시 불러오지 못했습니다."
          )
        );
      });
  }

  async function runPreDeploymentCheck(
    preparedArtifacts: PreparedWorkspaceDeploymentArtifacts
  ): Promise<boolean> {
    const preparedBoardSnapshot = createWorkspaceAiBoardSnapshot(preparedArtifacts.diagramJson);

    if (!preparedBoardSnapshot.hasResources) {
      onPreDeploymentCheckStateChange(
        createResetPreDeploymentCheckState(
          "error",
          "Architecture Board에 Resource가 있어야 실행할 수 있습니다."
        )
      );
      return false;
    }

    onPreDeploymentCheckStateChange(createResetPreDeploymentCheckState("loading"));

    try {
      const currentTerraformDiagnostics = await onValidateTerraformDiagnostics();
      const hasTerraformDiagnosticError = currentTerraformDiagnostics.some(
        (diagnostic) => diagnostic.severity === "error"
      );

      if (hasTerraformDiagnosticError) {
        updatePreDeploymentCheckState({
          analysis: createPreDeploymentAnalysisFromTerraformDiagnostics(
            currentTerraformDiagnostics
          ),
          fingerprint: preparedBoardSnapshot.fingerprint,
          requestState: "idle"
        });
        return false;
      }

      const result = addTerraformDiagnosticsToPreDeploymentAnalysis(
        await runAiPreDeploymentCheck({
          architectureJson: preparedBoardSnapshot.architectureJson,
          terraformFiles: [...preparedArtifacts.terraformFiles]
        }),
        currentTerraformDiagnostics
      );
      updatePreDeploymentCheckState({
        analysis: result,
        fingerprint: preparedBoardSnapshot.fingerprint,
        requestState: "idle"
      });
      if (result.deepScan?.status === "running" && result.deepScan.scanId) {
        void pollPreDeploymentDeepScan(
          result.deepScan.scanId,
          currentTerraformDiagnostics,
          preparedBoardSnapshot.fingerprint
        );
      }
      return true;
    } catch (error) {
      onPreDeploymentCheckStateChange(
        createResetPreDeploymentCheckState(
          "error",
          getApiErrorMessage(error, "배포 전 검증 중 오류가 발생했습니다.")
        )
      );
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
          errorMessage:
            deepScan.message ?? "Trivy 심층 검사를 완료하지 못했습니다. 다시 검사해 주세요."
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

  function updatePreDeploymentCheckState(patch: Partial<DeploymentPreDeploymentCheckState>): void {
    onPreDeploymentCheckStateChange((currentState) => ({
      ...currentState,
      ...patch
    }));
  }

  async function runDeploymentReviewStep(): Promise<void> {
    if (!canRunDeploymentReviewStep || actionInFlightRef.current) {
      return;
    }

    setActiveProgress({ operation: "plan", requestedAtMs: Date.now() });
    setDeploymentTargetPrerequisite(null);
    await runAction("validation", async () => {
      const target = await getProjectDeploymentTarget(projectId);
      const prerequisite = getDeploymentTargetPrerequisite({
        awsConnectionId: selectedAwsConnectionId,
        diagramJson,
        scope: selectedScope,
        target
      });
      if (prerequisite) {
        setDeploymentTargetPrerequisite(prerequisite);
        return;
      }

      const preparedArtifacts = await onPrepareDeploymentArtifacts();
      const checkPassed = await runPreDeploymentCheck(preparedArtifacts);
      if (!checkPassed) return;

      await startDeploymentReview(preparedArtifacts);
    }, "프로젝트 저장·검증과 Terraform Plan을 시작하지 못했습니다.");
  }

  async function startDeploymentReview(
    savedArtifacts: PreparedWorkspaceDeploymentArtifacts
  ): Promise<Deployment> {
    dispatchTerraformOutputState({ type: "clear", deploymentId: null });
    const preparedDeployment = await prepareDeployment({
      projectId,
      architectureId: savedArtifacts.architecture.id,
      terraformArtifactId: savedArtifacts.terraformArtifact.id,
      awsConnectionId: selectedAwsConnectionId,
      draftRevision: savedArtifacts.preparedDraftRevision,
      scope: selectedScope
    });
    setDeployments((currentDeployments) => [
      preparedDeployment,
      ...currentDeployments.filter((deployment) => deployment.id !== preparedDeployment.id)
    ]);
    setSelectedDeploymentId(preparedDeployment.id);
    pendingAutoAdvanceDeploymentIdRef.current = preparedDeployment.id;

    const plannedDeployment =
      preparedDeployment.currentPlanArtifactId &&
      preparedDeployment.currentPlanOperation === "apply"
      ? preparedDeployment
      : await runDeploymentPlan(preparedDeployment.id);
    setDeployments((currentDeployments) => [
      plannedDeployment,
      ...currentDeployments.filter((deployment) => deployment.id !== plannedDeployment.id)
    ]);
    setSelectedDeploymentId(plannedDeployment.id);
    if (plannedDeployment.consolePhase === "approval") {
      pendingAutoAdvanceDeploymentIdRef.current = "";
      setSelectedDirectStepId("approval");
    }
    refreshBuildEnvironmentAfterPlan(plannedDeployment);
    refreshDeploymentDetails(plannedDeployment.id);
    setShowApplyConfirmation(false);
    return plannedDeployment;
  }

  async function startTerraformPlan(): Promise<void> {
    if (!selectedDeployment || !canRunPlan || actionInFlightRef.current) {
      return;
    }

    setActiveProgress({ operation: "plan", requestedAtMs: Date.now() });

    dispatchTerraformOutputState({
      type: "clear",
      deploymentId: selectedDeployment.id
    });
    pendingAutoAdvanceDeploymentIdRef.current = selectedDeployment.id;
    const deployment = await runAction(
      "validation",
      () => runDeploymentPlan(selectedDeployment.id),
      "Terraform Plan을 시작하지 못했습니다."
    );
    if (deployment) {
      setDeployments((currentDeployments) =>
        currentDeployments.map((currentDeployment) =>
          currentDeployment.id === deployment.id ? deployment : currentDeployment
        )
      );
      setSelectedDeploymentId(deployment.id);
      refreshBuildEnvironmentAfterPlan(deployment);
      refreshDeploymentDetails(deployment.id);
      setShowApplyConfirmation(false);
    }
  }

  async function approveCurrentPlan(): Promise<void> {
    if (!selectedDeployment || !canApprovePlan) {
      return;
    }

    setActiveProgress(null);
    dispatchTerraformOutputState({
      type: "clear",
      deploymentId: selectedDeployment.id
    });
    const deployment = await runAction(
      "approval",
      () => approveDeploymentPlan(selectedDeployment.id),
      "Terraform Plan을 승인하지 못했습니다."
    );
    if (deployment) {
      setDeployments((currentDeployments) =>
        currentDeployments.map((currentDeployment) =>
          currentDeployment.id === deployment.id ? deployment : currentDeployment
        )
      );
      setSelectedDeploymentId(deployment.id);
      setSelectedDirectStepId("deployment");
      if (deployment.currentPlanOperation === "apply") {
        onApplyPlanApproved?.(deployment);
      }
      refreshBuildEnvironmentAfterPlan(deployment);
      refreshDeploymentDetails(deployment.id);
    }
  }

  async function revokeCurrentPlanApproval(): Promise<void> {
    if (!selectedDeployment || !selectedDeployment.approvedAt || requestState === "loading") {
      return;
    }

    setActiveProgress(null);
    dispatchTerraformOutputState({
      type: "clear",
      deploymentId: selectedDeployment.id
    });
    const deployment = await runAction(
      "approval",
      () => revokeDeploymentApproval(selectedDeployment.id),
      "Plan 승인을 취소하지 못했습니다."
    );
    if (deployment) {
      setDeployments((currentDeployments) =>
        currentDeployments.map((currentDeployment) =>
          currentDeployment.id === deployment.id ? deployment : currentDeployment
        )
      );
      setSelectedDeploymentId(deployment.id);
      setSelectedDirectStepId("approval");
      setShowApplyConfirmation(false);
      refreshDeploymentDetails(deployment.id);
    }
  }

  async function startTerraformApply(): Promise<void> {
    if (!selectedDeployment || !canApply) {
      return;
    }

    setActiveProgress({ operation: "apply", requestedAtMs: Date.now() });
    dispatchTerraformOutputState({
      type: "clear",
      deploymentId: selectedDeployment.id
    });
    completionCandidateDeploymentIdsRef.current.add(selectedDeployment.id);
    const deployment = await runAction(
      "deployment",
      () => executeDeployment(selectedDeployment.id),
      "Terraform Apply를 시작하지 못했습니다."
    );
    if (deployment) {
      setDeployments((currentDeployments) =>
        currentDeployments.map((currentDeployment) =>
          currentDeployment.id === deployment.id ? deployment : currentDeployment
        )
      );
      setSelectedDeploymentId(deployment.id);
      setShowApplyConfirmation(false);
      refreshDeploymentDetails(deployment.id);
      if (
        deployment.status === "SUCCESS" &&
        completionCandidateDeploymentIdsRef.current.delete(deployment.id)
      ) {
        onDeploymentSucceeded?.(deployment);
      }
    }
  }

  async function startTerraformDestroyPlan(targetDeployment: Deployment): Promise<void> {
    const targetActions = getDeploymentActionState(targetDeployment, requestState);

    if (!targetActions.canRunDestroyPlan) {
      return;
    }

    setActiveProgress({ operation: "destroy-plan", requestedAtMs: Date.now() });
    dispatchTerraformOutputState({
      type: "clear",
      deploymentId: targetDeployment.id
    });
    pendingAutoAdvanceDeploymentIdRef.current = targetDeployment.id;
    const deployment = await runAction(
      "validation",
      () => runDeploymentDestroyPlan(targetDeployment.id),
      "Terraform Destroy Plan을 시작하지 못했습니다."
    );
    if (deployment) {
      setDeployments((currentDeployments) =>
        currentDeployments.map((currentDeployment) =>
          currentDeployment.id === deployment.id ? deployment : currentDeployment
        )
      );
      setSelectedDeploymentId(deployment.id);
      setShowApplyConfirmation(false);
      refreshDeploymentDetails(deployment.id);
    }
  }

  async function startTerraformDestroy(targetDeployment: Deployment): Promise<void> {
    if (!getDeploymentActionState(targetDeployment, requestState).canDestroy) {
      return;
    }

    setSelectedDeploymentId(targetDeployment.id);
    setActiveProgress({ operation: "destroy", requestedAtMs: Date.now() });
    dispatchTerraformOutputState({
      type: "clear",
      deploymentId: targetDeployment.id
    });
    const deployment = await runAction(
      "deployment",
      () => runDeploymentDestroy(targetDeployment.id),
      "Terraform Destroy를 시작하지 못했습니다."
    );
    if (deployment) {
      setDeployments((currentDeployments) =>
        currentDeployments.map((currentDeployment) =>
          currentDeployment.id === deployment.id ? deployment : currentDeployment
        )
      );
      setSelectedDeploymentId(deployment.id);
      setShowApplyConfirmation(false);
      refreshDeploymentDetails(deployment.id);
    }
  }

  async function startInfrastructureRollbackPlan(): Promise<void> {
    if (!selectedDeployment || !infrastructureRollbackTarget || requestState === "loading") {
      return;
    }

    dispatchTerraformOutputState({ type: "clear", deploymentId: null });
    const planned = await runAction("validation", async () => {
      const prepared = await prepareInfrastructureRollback(selectedDeployment.id);
      setDeployments((currentDeployments) => [
        prepared,
        ...currentDeployments.filter((deployment) => deployment.id !== prepared.id)
      ]);
      setSelectedDeploymentId(prepared.id);
      setDeploymentLogs([]);
      setDeploymentResources([]);
      setShowInfrastructureRollbackConfirmation(false);
      setShowApplyConfirmation(false);
      pendingAutoAdvanceDeploymentIdRef.current = prepared.id;

      return runDeploymentPlan(prepared.id);
    }, "이전 인프라 버전의 Terraform Plan을 생성하지 못했습니다.");
    if (planned) {
      setDeployments((currentDeployments) =>
        currentDeployments.map((deployment) =>
          deployment.id === planned.id ? planned : deployment
        )
      );
      refreshDeploymentDetails(planned.id);
    }
  }

  async function cancelSelectedDeployment(): Promise<void> {
    if (!selectedDeployment || !canCancelDeployment) {
      return;
    }

    dispatchTerraformOutputState({
      type: "clear",
      deploymentId: selectedDeployment.id
    });
    const deployment = await runAction(
      directDeploymentFlow.activeStepId,
      () => cancelDeploymentRun(selectedDeployment.id),
      "Deployment 실행 취소를 요청하지 못했습니다."
    );
    if (deployment) {
      setDeployments((currentDeployments) =>
        currentDeployments.map((currentDeployment) =>
          currentDeployment.id === deployment.id ? deployment : currentDeployment
        )
      );
      setSelectedDeploymentId(deployment.id);
      refreshDeploymentDetails(deployment.id);
    }
  }

  async function retrySelectedDeploymentFrontend(): Promise<void> {
    if (
      !selectedDeployment ||
      selectedDeployment.status !== "PARTIALLY_FAILED" ||
      selectedApplicationRelease?.status !== "partially_failed"
    ) {
      return;
    }
    const retried = await runAction(
      "deployment",
      async () => {
        await retryDeploymentFrontend(selectedDeployment.id);
        return true;
      },
      "웹 배포를 다시 시도하지 못했습니다."
    );
    if (retried) {
      void loadDeploymentRuntimeSnapshot()
        .then((snapshot) => {
          applyDeploymentRuntimeSnapshot(snapshot);
          setSnapshotErrorMessage("");
        })
        .catch((error) => {
          setSnapshotErrorMessage(
            getApiErrorMessage(error, "재시도는 접수됐지만 최신 상태를 불러오지 못했습니다.")
          );
        });
    }
  }

  function selectDeploymentHistoryFilter(filter: DeploymentHistoryFilter): void {
    setDeploymentHistoryFilter(filter);
    const nextEntries = filterDeploymentHistoryEntries(deploymentHistoryEntries, filter);

    if (!nextEntries.some(({ deployment }) => deployment.id === selectedHistoryDeploymentId)) {
      setSelectedHistoryDeploymentId(nextEntries[0]?.deployment.id ?? "");
    }
  }

  const renderSetupSection = () => {
    const resolvedSelectedDirectStepId = resolveSelectedDirectDeploymentStepId(
      directDeploymentFlow,
      selectedDirectStepId
    );
    const selectedStep =
      directDeploymentFlow.steps.find((step) => step.id === resolvedSelectedDirectStepId) ??
      directDeploymentFlow.steps[0]!;
    const activeStepIndex = directDeploymentFlow.steps.findIndex(
      (step) => step.id === directDeploymentFlow.activeStepId
    );
    const selectedAwsConnection =
      verifiedAwsConnections.find((connection) => connection.id === selectedAwsConnectionId) ??
      null;
    const requestError =
      selectedStep.id === "validation" && preDeploymentState === "error"
        ? preDeploymentErrorMessage
        : reconciledRequestState === "error"
          ? errorMessage
          : detailErrorMessage || snapshotErrorMessage;
    const validationIsBusy =
      isInitialSnapshotLoading ||
      reconciledRequestState === "loading" ||
      preDeploymentState === "loading";
    const requiresApprovedPlanRevalidation = Boolean(
      hasCurrentDeploymentChanges && selectedDeployment?.approvedAt
    );
    const settingsStatus = hasCurrentDeploymentChanges
      ? { label: "변경사항 있음", tone: "warning" as const }
      : { label: "변경사항 없음", tone: "success" as const };

    function renderDirectStepContent(stepId: DirectDeploymentStepId) {
      if (stepId === "validation") {
        return (
          <>
            <section className={styles.deploymentSettingsSection}>
              <h3>배포 설정</h3>
              <div className={styles.deploymentSettingsLayout}>
                <div className={styles.deploymentSettingsControl}>
                  <label htmlFor="deployment-scope-select">실행 타깃 결정 방식</label>
                  <SelectMenu
                    ariaLabel="실행 타깃 결정 방식"
                    disabled={requestState === "loading"}
                    emptyLabel="실행 타깃 없음"
                    id="deployment-scope-select"
                    onChange={(value) => setSelectedScope(value as DeploymentScope | "auto")}
                    options={deploymentScopeOptions}
                    size={isDeploymentOverlayOpen ? "large" : "regular"}
                    tone="workspace"
                    value={selectedScope}
                  />
                  <p>
                    저장된 Terraform과 확인된 프로젝트 실행 타깃을 기준으로 실행 대상을 결정합니다.
                  </p>
                </div>
              </div>
            </section>
            <section className={styles.deploymentValidationSection}>
              <h3>검증 요약</h3>
              <div className={styles.deploymentValidationCards}>
                <DeploymentValidationSummaryCard
                  description="저장된 배포 기준선과 현재 Board의 차이를 확인합니다."
                  label="설정 상태"
                  tone={settingsStatus.tone}
                  value={settingsStatus.label}
                />
                <DeploymentValidationSummaryCard
                  description="Source Repository와 빌드 실행 권한 상태를 확인합니다."
                  label="빌드 환경"
                  tone={
                    needsBuildEnvironment
                      ? getBuildEnvironmentStatusTone(buildEnvironment)
                      : "neutral"
                  }
                  value={
                    needsBuildEnvironment
                      ? formatBuildEnvironmentStatus(buildEnvironment)
                      : "해당 없음"
                  }
                />
              </div>
              {needsBuildEnvironment &&
              buildEnvironment?.repositoryVerificationStatus === "failed" ? (
                <div className={styles.deploymentValidationError} role="alert">
                  <strong>Repository 빌드 권한 확인 필요</strong>
                  <p>
                    {buildEnvironment.sourceRepositoryUrl} · 요청 commit{" "}
                    {buildEnvironment.repositoryVerificationRequestedCommitSha ?? "확인 불가"} ·
                    실제 checkout{" "}
                    {buildEnvironment.repositoryVerificationResolvedCommitSha ?? "실패"}
                  </p>
                  <p>
                    AWS {selectedAwsConnection?.accountId ?? "계정 확인 불가"} ·{" "}
                    {selectedAwsConnection?.region ?? "region 확인 불가"}
                  </p>
                  <p>
                    {buildEnvironment.repositoryVerificationStatusReason ??
                      "CodeBuild가 프로젝트 Repository의 확정 commit을 checkout하지 못했습니다."}
                  </p>
                  <div className={styles.deploymentValidationActions}>
                    <Link href="/dashboard/settings#github-account-connection">
                      GitHub Repository 권한 확인
                    </Link>
                    <Link href="/dashboard/settings#aws-codebuild-github-authorization">
                      AWS GitHub 권한 다시 연결
                    </Link>
                    <button
                      disabled={!canRunPlan || requestState === "loading"}
                      onClick={() => void startTerraformPlan()}
                      type="button"
                    >
                      Repository 빌드 권한 다시 확인
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
            {preDeploymentAnalysis !== null && !hasStalePreDeploymentAnalysis ? (
              <DeploymentPreDeploymentSummary
                analysis={preDeploymentAnalysis}
                onOpenFindingTerraformSource={onOpenFindingTerraformSource}
              />
            ) : null}
          </>
        );
      }

      if (stepId === "approval") {
        return (
          <>
            <div className={styles.deploymentStepSummary}>
              <InfoRow label="범위" value={selectedDeployment?.scope ?? "확인 필요"} />
              <InfoRow
                label="차단"
                value={
                  selectedDeployment?.isBlocked
                    ? (selectedDeployment.blockedReason ?? "차단됨")
                    : "없음"
                }
              />
              {selectedDeployment?.planSummary ? (
                <PlanSummaryRows deployment={selectedDeployment} />
              ) : null}
            </div>
            <details className={styles.deploymentDisclosure}>
              <summary>실행 대상과 스냅샷</summary>
              <div className={styles.deploymentDisclosureBody}>
                <InfoRow
                  label="AWS account"
                  value={selectedAwsConnection?.accountId ?? "확인 필요"}
                />
                <InfoRow label="AWS region" value={selectedAwsConnection?.region ?? "확인 필요"} />
                <InfoRow
                  label="Prepared snapshot"
                  value={formatShortHash(selectedDeployment?.preparedSnapshotHash ?? null)}
                />
              </div>
            </details>
          </>
        );
      }

      return (
        <>
          <div className={styles.deploymentResultOverview}>
            <div
              className={styles.deploymentStepSummary}
              data-has-output-links={deploymentOutputLinks.length > 0}
            >
              <InfoRow label="상태" value={selectedDeployment?.status ?? "대기"} />
              <InfoRow label="범위" value={selectedDeployment?.scope ?? "대기"} />
              <InfoRow label="현재 작업" value={primaryDeploymentStepStatus} />
              {selectedDeployment?.planSummary ? (
                <PlanSummaryRows deployment={selectedDeployment} />
              ) : null}
              <OptionalInfoRow
                label="릴리즈"
                value={
                  applicationReleases.find(
                    (release) => release.deploymentId === selectedDeployment?.id
                  )?.version ?? null
                }
              />
            </div>
            {deploymentOutputLinks.length > 0 ? (
              <DeploymentOutputLinks
                links={deploymentOutputLinks}
                scopeKey={selectedDeploymentId || null}
                onOpenLiveObservation={onOpenLiveObservation}
              />
            ) : null}
          </div>
          {selectedDeployment?.status === "PARTIALLY_FAILED" &&
          selectedApplicationRelease?.status === "partially_failed" ? (
            <div className={styles.deploymentPartialFailureCallout} role="alert">
              <AlertCircle size={18} aria-hidden="true" />
              <div>
                <strong>앱 API는 새 버전이지만 웹 화면 반영이 완료되지 않았습니다.</strong>
                <p>
                  현재 주소와 QR, Live Observation은 계속 사용할 수 있지만 웹 화면은 이전 버전일 수
                  있습니다. 같은 검증 Artifact로 웹 배포 단계만 다시 실행합니다.
                </p>
                {selectedApplicationRelease.failureStage ? (
                  <small>
                    실패 단계:{" "}
                    {formatApplicationReleaseFailureStage(selectedApplicationRelease.failureStage)}
                  </small>
                ) : null}
              </div>
            </div>
          ) : null}
          {showApplyConfirmation && selectedDeployment ? (
            <div className={styles.deploymentApplyConfirm}>
              <h3>배포 실행 확인</h3>
              <InfoRow
                label="AWS account"
                value={selectedDeployment.approvedAwsAccountId ?? "없음"}
              />
              <InfoRow label="AWS region" value={selectedDeployment.approvedAwsRegion ?? "없음"} />
              <p>승인된 Plan과 프로젝트 스냅샷이 일치할 때만 실행됩니다.</p>
            </div>
          ) : null}
          {showInfrastructureRollbackConfirmation &&
          selectedDeployment &&
          infrastructureRollbackTarget ? (
            <div className={styles.deploymentApplyConfirm} role="dialog">
              <h3>이전 인프라 버전으로 Plan 생성</h3>
              <p>
                {formatDate(infrastructureRollbackTarget.createdAt)}에 성공한 Terraform 구성을 현재
                state에 대입해 새로운 Plan을 만듭니다.
              </p>
              <p>
                예전 Plan을 재사용하거나 자동 Apply하지 않습니다. 새 Plan의 생성·변경·삭제 내용을
                확인하고 다시 승인해야 합니다.
              </p>
              <div className={styles.deploymentApplyActions}>
                <button
                  className={styles.deploymentSecondaryButton}
                  onClick={() => setShowInfrastructureRollbackConfirmation(false)}
                  type="button"
                >
                  취소
                </button>
                <button
                  className={styles.deploymentPrimaryButton}
                  disabled={requestState === "loading"}
                  onClick={() => void startInfrastructureRollbackPlan()}
                  type="button"
                >
                  <RotateCw size={16} aria-hidden="true" />새 Rollback Plan 생성
                </button>
              </div>
            </div>
          ) : null}
        </>
      );
    }

    function renderDirectStepActions(stepId: DirectDeploymentStepId) {
      if (stepId === "validation") {
        return (
          <div className={styles.deploymentStepActionBar}>
            {selectedDeployment?.status === "RUNNING" ? (
              <button
                className={styles.deploymentSecondaryButton}
                data-active="true"
                data-tone={
                  activeProgress?.operation === "destroy" ||
                  selectedDeployment.currentPlanOperation === "destroy"
                    ? "danger"
                    : "default"
                }
                disabled={!canCancelDeployment}
                onClick={cancelSelectedDeployment}
                type="button"
              >
                실행 취소
              </button>
            ) : selectedDeployment?.status === "PARTIALLY_FAILED" &&
              selectedApplicationRelease?.status === "partially_failed" ? (
              <button
                aria-busy={requestState === "loading"}
                className={styles.deploymentPrimaryButton}
                disabled={requestState === "loading"}
                onClick={() => void retrySelectedDeploymentFrontend()}
                type="button"
              >
                <RotateCw size={16} aria-hidden="true" />
                {requestState === "loading"
                  ? "웹 배포 다시 시도 중"
                  : "같은 빌드 결과로 웹 배포 재시도"}
              </button>
            ) : infrastructureRollbackTarget ? (
              <button
                className={styles.deploymentPrimaryButton}
                disabled={requestState === "loading"}
                onClick={() => setShowInfrastructureRollbackConfirmation(true)}
                type="button"
              >
                <RotateCw size={16} aria-hidden="true" />
                이전 인프라 버전으로 Plan 생성
              </button>
            ) : shouldShowDeploymentValidationActions({
                deploymentStatus: selectedDeployment?.status ?? null,
                hasUnsavedBaseline: hasCurrentDeploymentChanges,
                preflightState: directPreflightState
              }) ? (
              <div className={styles.deploymentValidationActions}>
                {cleanupActionTargets.map(({ actions, deployment }) =>
                  actions.shouldShowDestroyPlanButton ? (
                    <button
                      aria-busy={
                        activeProgress?.operation === "destroy-plan" && requestState === "loading"
                      }
                      className={styles.deploymentSecondaryButton}
                      data-active={
                        activeProgress?.operation === "destroy-plan" && requestState === "loading"
                      }
                      disabled={!actions.canRunDestroyPlan}
                      key={deployment.id}
                      onClick={() => void startTerraformDestroyPlan(deployment)}
                      type="button"
                    >
                      <Trash2 size={16} aria-hidden="true" />
                      {getCleanupPlanActionLabel(deployment, cleanupDeployments.length)}
                    </button>
                  ) : null
                )}
                <button
                  aria-busy={validationIsBusy}
                  className={styles.deploymentPrimaryButton}
                  data-active={validationIsBusy}
                  disabled={!canRunDeploymentReviewStep}
                  onClick={() => void runDeploymentReviewStep()}
                  type="button"
                >
                  <DeploymentBaselineIcon size={16} aria-hidden="true" />
                  {validationIsBusy
                    ? "저장 및 검증 실행 중"
                    : requiresApprovedPlanRevalidation
                      ? "새 변경사항 검증"
                      : "저장 후 검증 실행"}
                </button>
              </div>
            ) : !hasCurrentPlan ? (
              <button
                aria-busy={requestState === "loading"}
                className={styles.deploymentPrimaryButton}
                data-active={activeProgress?.operation === "plan" && requestState === "loading"}
                disabled={!canRunPlan}
                onClick={() => void startTerraformPlan()}
                type="button"
              >
                <DashboardIcon name="rocket" />
                {requestState === "loading" ? "Plan 생성 중" : "Plan 생성"}
              </button>
            ) : null}
          </div>
        );
      }

      if (stepId === "approval") {
        return (
          <div className={styles.deploymentStepActionBar}>
            <button
              aria-busy={requestState === "loading"}
              className={styles.deploymentPrimaryButton}
              data-active={requestState === "loading"}
              disabled={!canApprovePlan}
              onClick={() => void approveCurrentPlan()}
              type="button"
            >
              <ShieldCheck size={16} aria-hidden="true" />
              {requestState === "loading" ? "승인 처리 중" : deploymentActions.approvePlanLabel}
            </button>
          </div>
        );
      }

      return (
        <div className={styles.deploymentStepActionBar}>
          {selectedDeployment?.status === "RUNNING" ? (
            <button
              className={styles.deploymentSecondaryButton}
              data-active="true"
              data-tone={
                activeProgress?.operation === "destroy" ||
                selectedDeployment.currentPlanOperation === "destroy"
                  ? "danger"
                  : "default"
              }
              disabled={!canCancelDeployment}
              onClick={cancelSelectedDeployment}
              type="button"
            >
              실행 취소
            </button>
          ) : (
            <div className={styles.deploymentValidationActions}>
              {cleanupActionTargets.flatMap(({ actions, deployment }) => {
                const buttons: ReactNode[] = [];

                if (actions.shouldShowDestroyPlanButton) {
                  buttons.push(
                    <button
                      aria-busy={
                        activeProgress?.operation === "destroy-plan" && requestState === "loading"
                      }
                      className={styles.deploymentSecondaryButton}
                      data-active={
                        activeProgress?.operation === "destroy-plan" && requestState === "loading"
                      }
                      disabled={!actions.canRunDestroyPlan}
                      key={`${deployment.id}:plan`}
                      onClick={() => void startTerraformDestroyPlan(deployment)}
                      type="button"
                    >
                      {getCleanupPlanActionLabel(deployment, cleanupDeployments.length)}
                    </button>
                  );
                }

                if (actions.shouldShowDestroyButton) {
                  buttons.push(
                    <button
                      aria-busy={
                        activeProgress?.operation === "destroy" && requestState === "loading"
                      }
                      className={styles.deploymentDangerButton}
                      data-active={
                        activeProgress?.operation === "destroy" && requestState === "loading"
                      }
                      data-tone="danger"
                      disabled={!actions.canDestroy}
                      key={`${deployment.id}:destroy`}
                      onClick={() => void startTerraformDestroy(deployment)}
                      type="button"
                    >
                      {getCleanupExecutionActionLabel(deployment, cleanupDeployments.length)}
                    </button>
                  );
                }

                return buttons;
              })}
              {showApplyConfirmation && selectedDeployment ? (
                <>
                  <button
                    aria-busy={activeProgress?.operation === "apply" && requestState === "loading"}
                    className={styles.deploymentPrimaryButton}
                    data-active={
                      activeProgress?.operation === "apply" && requestState === "loading"
                    }
                    disabled={!canApply}
                    onClick={startTerraformApply}
                    type="button"
                  >
                    <DashboardIcon name="rocket" />
                    배포 실행
                  </button>
                  <button
                    aria-busy={requestState === "loading" && activeProgress === null}
                    className={styles.deploymentSecondaryButton}
                    data-active={requestState === "loading" && activeProgress === null}
                    disabled={requestState === "loading"}
                    onClick={() => void revokeCurrentPlanApproval()}
                    type="button"
                  >
                    Plan 승인 취소
                  </button>
                </>
              ) : null}
            </div>
          )}
        </div>
      );
    }

    return (
      <section className={styles.deploymentConsoleGrid} aria-label="Direct Deployment">
        <nav className={styles.deploymentStepNavigation} aria-label="Direct Deployment 단계">
          <ol>
            {directDeploymentFlow.steps.map((step, index) => {
              const isCompleted = step.state === "done";
              const connectorState =
                directDeploymentFlow.steps[index - 1]?.state === "done"
                  ? "done"
                  : index <= activeStepIndex
                    ? "active"
                    : "idle";

              return (
                <li data-connector-state={connectorState} key={step.id}>
                  <button
                    aria-current={
                      step.id === directDeploymentFlow.activeStepId ? "step" : undefined
                    }
                    className={styles.deploymentStepButton}
                    data-selected={step.id === selectedStep.id}
                    data-state={step.state}
                    disabled={step.state === "idle"}
                    onClick={() => setSelectedDirectStepId(step.id)}
                    type="button"
                  >
                    <span className={styles.deploymentStepIndex}>
                      {isCompleted ? <Check size={16} aria-hidden="true" /> : index + 1}
                    </span>
                    <span>
                      <strong>{step.label}</strong>
                      <small>{step.statusLabel}</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        {renderDirectStepActions(selectedStep.id)}

        <article className={styles.deploymentStepWorkspace} data-state={selectedStep.state}>
          <DeploymentProgressBar
            deployment={selectedDeployment}
            isStarting={deploymentProgressIsStarting}
            logs={deploymentLogs}
            operationHint={activeProgress?.operation ?? null}
            requestedAtMs={activeProgress?.requestedAtMs ?? null}
          />
          {renderDirectStepContent(selectedStep.id)}
          {deploymentTargetPrerequisite ? (
            <div className={styles.deploymentValidationError} role="alert">
              <strong>{deploymentTargetPrerequisite.title}</strong>
              <p>{deploymentTargetPrerequisite.message}</p>
              {onOpenDeliverySetup ? (
                <div className={styles.deploymentValidationActions}>
                  <button onClick={onOpenDeliverySetup} type="button">
                    CI/CD 설정으로 이동
                  </button>
                </div>
              ) : null}
            </div>
          ) : requestError ? (
            <p className={styles.deploymentStageAlert} role="alert">
              {requestError}
            </p>
          ) : null}
          {selectedStep.id === "deployment" && selectedDeployment?.status === "FAILED" ? (
            <p className={styles.deploymentStageAlert} role="alert">
              {selectedDeployment.errorSummary ??
                "배포가 실패했습니다. 배포 기록에서 원인을 확인하세요."}
              {deploymentFailureDeveloperCheck
                ? ` 개발자 확인: ${deploymentFailureDeveloperCheck}`
                : ""}
            </p>
          ) : null}
        </article>
      </section>
    );
  };

  const renderResultsSection = () => {
    if (historyDetailsIsLoading) {
      return (
        <section
          aria-busy="true"
          aria-label="리소스와 Output 세부 내용"
          className={styles.deploymentSection}
        >
          <p className={styles.deploymentHint} role="status">
            선택한 배포 버전의 리소스와 Output을 불러오는 중입니다.
          </p>
        </section>
      );
    }

    if (historyDetailsErrorMessage) {
      return (
        <section aria-label="리소스와 Output 세부 내용" className={styles.deploymentSection}>
          <p className={styles.deploymentRecentResultError} role="alert">
            {historyDetailsErrorMessage}
          </p>
        </section>
      );
    }

    return (
      <section aria-label="리소스와 Output 세부 내용" className={styles.deploymentSection}>
        {historyDeploymentResources.length === 0 ? (
          <p className={styles.deploymentHint}>아직 기록된 AWS 리소스가 없습니다.</p>
        ) : (
          <div className={styles.deploymentResultRows}>
            {historyDeploymentResources.map((resource) => (
              <article className={styles.deploymentResultRow} key={resource.id}>
                <strong>{resource.terraformAddress}</strong>
                <span className={styles.deploymentResultMeta}>{resource.terraformType}</span>
                <span className={styles.deploymentResultValue}>
                  {resource.resourceId ?? "resource id 없음"}
                </span>
              </article>
            ))}
          </div>
        )}
        {historyTerraformOutputs.length === 0 ? (
          <p className={styles.deploymentHint}>Terraform output이 없습니다.</p>
        ) : (
          <>
            <DeploymentOutputLinks
              links={historyDeploymentOutputLinks}
              scopeKey={selectedHistoryDeploymentId || null}
              onOpenLiveObservation={onOpenLiveObservation}
            />
            <div className={styles.deploymentResultRows}>
              {historyTerraformOutputs.map((output) => (
                <article className={styles.deploymentResultRow} key={output.id}>
                  <strong>{output.name}</strong>
                  <span className={styles.deploymentResultMeta}>
                    {output.sensitive ? "sensitive" : "plain"}
                  </span>
                  <span className={styles.deploymentResultValue}>{formatOutputValue(output)}</span>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    );
  };

  const renderLogsSection = () => {
    if (deploymentLogView.isLoading) {
      return (
        <section
          aria-busy="true"
          aria-label="전체 로그 세부 내용"
          className={styles.deploymentSection}
        >
          <p className={styles.deploymentHint} role="status">
            선택한 배포 버전의 로그를 불러오는 중입니다.
          </p>
        </section>
      );
    }

    if (deploymentLogView.errorMessage) {
      return (
        <section aria-label="전체 로그 세부 내용" className={styles.deploymentSection}>
          <p className={styles.deploymentRecentResultError} role="alert">
            {deploymentLogView.errorMessage}
          </p>
        </section>
      );
    }

    return (
      <section aria-label="전체 로그 세부 내용" className={styles.deploymentSection}>
        <DeploymentLogList logs={deploymentLogView.logs} />
      </section>
    );
  };

  const renderDeploymentHistory = () => {
    const selectedEntry =
      filteredDeploymentHistoryEntries.find(
        ({ deployment }) => deployment.id === selectedHistoryDeploymentId
      ) ?? filteredDeploymentHistoryEntries[0];
    const deployment = selectedEntry?.deployment;
    const release = deployment
      ? sortedApplicationReleases.find((candidate) => candidate.deploymentId === deployment.id)
      : undefined;
    const status = deployment ? getDeploymentStatusPresentation(deployment.status) : null;
    const outputUrl = getSafeReleaseOutputUrl(release?.outputUrl ?? null);

    return (
      <section className={styles.deploymentHistorySection} id="deployment-history">
        <header className={styles.deploymentHistoryHeader}>
          <div>
            <h3>배포 이력</h3>
            <p>성공한 배포의 변경 내용과 실행 결과를 확인합니다.</p>
          </div>
        </header>
        <dl className={styles.deploymentHistoryMetrics}>
          <DeploymentHistoryMetric
            icon={<Code2 size={20} />}
            label="전체 배포"
            value={`${deploymentHistoryMetrics.totalCount}개`}
          />
          <DeploymentHistoryMetric
            icon={<CheckCircle2 size={20} />}
            label="완료"
            value={`${deploymentHistoryMetrics.completedCount}개`}
          />
          <DeploymentHistoryMetric
            icon={<ClipboardCheck size={20} />}
            label="전체 변경 수"
            value={`${deploymentHistoryMetrics.totalChangeCount}개`}
          />
          <DeploymentHistoryMetric
            icon={<Clock3 size={20} />}
            label="평균 실행 시간"
            value={
              deploymentHistoryMetrics.averageDurationMs === null
                ? "집계 전"
                : formatDeploymentDuration(deploymentHistoryMetrics.averageDurationMs)
            }
          />
        </dl>
        <div className={styles.deploymentHistoryFilters} aria-label="배포 이력 필터">
          {(
            [
              ["all", "전체"],
              ["complete", "완료"],
              ["unchanged", "변경 없음"]
            ] as const
          ).map(([value, label]) => (
            <button
              aria-pressed={deploymentHistoryFilter === value}
              key={value}
              onClick={() => selectDeploymentHistoryFilter(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        {deploymentHistoryEntries.length === 0 ? (
          <div className={styles.deploymentHistoryEmpty}>
            <strong>아직 성공한 배포 버전이 없습니다.</strong>
            <p>첫 번째 배포가 성공하면 이곳에 표시됩니다.</p>
          </div>
        ) : (
          <div className={styles.deploymentHistoryBody}>
            <div className={styles.deploymentHistoryTableRegion}>
              <table className={styles.deploymentHistoryTable}>
                <caption className={styles.deploymentHistoryTableCaption}>
                  성공하거나 정리 완료된 배포 목록
                </caption>
                <thead>
                  <tr>
                    <th scope="col">상태</th>
                    <th scope="col">실행 시각</th>
                    <th scope="col">실제 변경</th>
                    <th scope="col">실행 범위</th>
                    <th scope="col">
                      <span className={styles.deploymentHistoryTableActionLabel}>상세</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDeploymentHistoryEntries.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <div className={styles.deploymentHistoryFilteredEmpty}>
                          <strong>선택한 조건에 맞는 배포가 없습니다.</strong>
                          <span>다른 필터를 선택해 배포 이력을 확인하세요.</span>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                  {filteredDeploymentHistoryEntries.map(({ deployment, versionLabel }) => {
                    const rowStatus = getDeploymentStatusPresentation(deployment.status);
                    const isSelected = deployment.id === selectedEntry?.deployment.id;

                    return (
                      <tr data-selected={isSelected} key={deployment.id}>
                        <td>
                          <span
                            className={styles.deploymentHistoryStatus}
                            data-tone={deployment.status === "DESTROYED" ? "neutral" : "success"}
                          >
                            <CheckCircle2 aria-hidden="true" size={16} />
                            {rowStatus.label}
                          </span>
                        </td>
                        <td>
                          <time dateTime={deployment.createdAt}>
                            {formatDate(deployment.createdAt)}
                          </time>
                        </td>
                        <td>{formatDeploymentChangeSummary(deployment.planSummary)}</td>
                        <td>{formatDeploymentScope(deployment.scope)}</td>
                        <td>
                          <button
                            aria-label={`${formatDate(deployment.createdAt)} 배포 상세 보기`}
                            aria-pressed={isSelected}
                            onClick={() => setSelectedHistoryDeploymentId(deployment.id)}
                            title={versionLabel}
                            type="button"
                          >
                            상세보기
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {deployment && selectedEntry && status ? (
              <article className={styles.deploymentHistoryDetailPanel} key={deployment.id}>
                <div className={styles.deploymentHistoryDetailHero}>
                  <header className={styles.deploymentHistoryDetailHeader}>
                    <span
                      className={styles.deploymentHistoryStatus}
                      data-tone={deployment.status === "DESTROYED" ? "neutral" : "success"}
                    >
                      <CheckCircle2 aria-hidden="true" size={16} />
                      {status.label}
                    </span>
                    <time dateTime={deployment.createdAt}>{formatDate(deployment.createdAt)}</time>
                  </header>
                  <div className={styles.deploymentHistoryDetailIntro}>
                    <span>선택한 배포</span>
                    <h4>
                      {deployment.status === "DESTROYED" ? "정리 완료된 버전" : "배포 완료된 버전"}
                    </h4>
                    <p className={styles.deploymentHistoryResultSentence}>
                      {formatDeploymentHistoryResult(deployment)}
                    </p>
                  </div>
                </div>
                <div className={styles.deploymentHistoryDetailContent}>
                  <dl className={styles.deploymentHistoryDetailFacts}>
                    <div>
                      <dt>실행 범위</dt>
                      <dd>{formatDeploymentScope(deployment.scope)}</dd>
                    </div>
                    <div>
                      <dt>변경 내용</dt>
                      <dd>{formatDeploymentChangeSummary(deployment.planSummary)}</dd>
                    </div>
                    {release ? (
                      <div>
                        <dt>앱 릴리즈</dt>
                        <dd>
                          {release.version} · {formatApplicationReleaseStatus(release.status)}
                        </dd>
                      </div>
                    ) : null}
                    <div>
                      <dt>버전 ID</dt>
                      <dd>
                        <code title={selectedEntry.versionLabel}>{selectedEntry.versionLabel}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>실행 시간</dt>
                      <dd>{getDeploymentDurationLabel(deployment)}</dd>
                    </div>
                    {deployment.approvedByUserId ? (
                      <div>
                        <dt>요청자</dt>
                        <dd>{deployment.approvedByUserId}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {outputUrl ? (
                    <a
                      className={styles.deploymentHistoryOutputLink}
                      href={outputUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      배포된 서비스 열기
                    </a>
                  ) : null}
                  <details className={styles.deploymentHistoryTechnical}>
                    <summary>기술 정보</summary>
                    <dl>
                      <div>
                        <dt>Deployment ID</dt>
                        <dd>
                          <code title={deployment.id}>{deployment.id}</code>
                        </dd>
                      </div>
                      <div>
                        <dt>Terraform artifact</dt>
                        <dd>
                          <code title={deployment.terraformArtifactId}>
                            {deployment.terraformArtifactId}
                          </code>
                        </dd>
                      </div>
                      {release ? (
                        <>
                          <div>
                            <dt>Commit</dt>
                            <dd>
                              <code title={release.commitSha}>
                                {formatShortHash(release.commitSha)}
                              </code>
                            </dd>
                          </div>
                          <div>
                            <dt>Digest</dt>
                            <dd>
                              <code title={release.artifactDigest}>
                                sha256:{formatShortHash(release.artifactDigest)}
                              </code>
                            </dd>
                          </div>
                          {release.artifactId ? (
                            <div>
                              <dt>Build artifact</dt>
                              <dd>
                                <code title={release.artifactId}>{release.artifactId}</code>
                              </dd>
                            </div>
                          ) : null}
                          <div>
                            <dt>배포 방식</dt>
                            <dd>{formatDeploymentSource(release.source)}</dd>
                          </div>
                        </>
                      ) : null}
                      {release?.providerRevision ? (
                        <div>
                          <dt>{release.providerRevision.resourceType}</dt>
                          <dd>
                            <code title={release.providerRevision.revisionId}>
                              {release.providerRevision.revisionId}
                            </code>
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  </details>
                </div>
              </article>
            ) : null}
          </div>
        )}
      </section>
    );
  };

  const renderHistoryView = () => (
    <div className={styles.deploymentHistoryGrid}>
      {renderDeploymentHistory()}
      <div className={styles.deploymentHistorySecondary}>
        <details className={styles.deploymentDisclosure}>
          <summary>
            <span>리소스와 Output</span>
            <small>
              {historyDetailsIsLoading
                ? "불러오는 중"
                : historyDetailsErrorMessage
                  ? "불러오기 실패"
                  : `${historyDeploymentResources.length + historyTerraformOutputs.length}건`}
            </small>
          </summary>
          <div className={styles.deploymentDisclosureBody}>{renderResultsSection()}</div>
        </details>
        <details className={styles.deploymentDisclosure}>
          <summary>
            <span>전체 로그</span>
            <small>
              {deploymentLogView.isLoading
                ? "불러오는 중"
                : deploymentLogView.errorMessage
                  ? "불러오기 실패"
                  : `${historyDeploymentLogs.length}줄`}
            </small>
          </summary>
          <div className={styles.deploymentDisclosureBody}>{renderLogsSection()}</div>
        </details>
      </div>
    </div>
  );

  const deploymentContent = canLoadDeploymentData(deploymentAvailability) ? (
    <div className={styles.deploymentConsoleContent}>
      {renderSetupSection()}
      {renderHistoryView()}
    </div>
  ) : (
    <div className={styles.deploymentConsoleContent}>
      <section className={styles.deploymentProjectGate} role="status">
        <span>Project required</span>
        <h3>프로젝트로 저장 후 배포할 수 있습니다</h3>
        <p>
          Local workspace에서는 AWS 연결과 Deployment 기록을 만들지 않습니다. 프로젝트를 만든 뒤
          저장된 Terraform artifact를 기준으로 배포를 시작하세요.
        </p>
        <Link className={styles.deploymentPrimaryButton} href="/workspace/new">
          프로젝트로 저장
        </Link>
      </section>
    </div>
  );

  return deploymentContent;
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
    <details className={styles.deploymentPreflightSummary} data-level={gateLevel}>
      <summary className={styles.deploymentGateHeader}>
        <span className={styles.deploymentGateBadge}>{gateLevel.toUpperCase()}</span>
        <strong>배포 안전성 검사 결과</strong>
        <span className={styles.deploymentPreflightChevron} aria-hidden="true" />
      </summary>
      <div className={styles.deploymentPreflightBody}>
        <p>{analysis.summary}</p>
        {analysis.deepScan ? (
          <p className={styles.deploymentHint} data-testid="pre-deployment-deep-scan-status">
            {analysis.deepScan.status === "running"
              ? "핵심 안전검사 완료 · Trivy 심층검사 진행 중"
              : analysis.deepScan.status === "complete"
                ? "핵심 안전검사 및 Trivy 심층검사 완료 · 결과 병합됨"
                : analysis.deepScan.status === "failed"
                  ? (analysis.deepScan.message ?? "Trivy 심층검사를 완료하지 못했습니다.")
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
    </details>
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

function countChecklistItems(
  analysis: AiPreDeploymentAnalysisResult,
  status: AiPreDeploymentAnalysisResult["checklist"][number]["status"]
): number {
  return analysis.checklist.filter((item) => item.status === status).length;
}

function DeploymentHistoryMetric({
  icon,
  label,
  value
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div>
      <dt>
        <span aria-hidden="true">{icon}</span>
        <span>{label}</span>
      </dt>
      <dd>{value}</dd>
    </div>
  );
}

function DeploymentValidationSummaryCard({
  description,
  label,
  tone,
  value
}: {
  readonly description: string;
  readonly label: string;
  readonly tone: DeploymentStatusTone | "primary" | "warning";
  readonly value: string;
}) {
  return (
    <article data-tone={tone}>
      <span>{label}</span>
      <DeploymentStatusBadge label={value} tone={tone} />
      <p>{description}</p>
    </article>
  );
}

function DeploymentStatusBadge({
  label,
  tone
}: {
  readonly label: string;
  readonly tone: DeploymentStatusTone | "primary" | "warning";
}) {
  const StatusIcon =
    tone === "error"
      ? AlertCircle
      : tone === "success"
        ? CheckCircle2
        : tone === "running"
          ? Clock3
          : tone === "warning"
            ? AlertCircle
            : CircleDot;

  return (
    <span className={styles.deploymentStatusBadge} data-tone={tone}>
      <StatusIcon size={14} aria-hidden="true" />
      {label}
    </span>
  );
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
        label="변경 사항"
        value={`+${summary.createCount} ~${summary.updateCount} -${summary.deleteCount} +/-${summary.replaceCount}`}
      />
      {summary.warnings.length > 0 ? (
        <div className={styles.deploymentWarnings}>
          <span>경고</span>
          <ul>
            {summary.warnings.map((warning, index) => (
              <li
                data-level={getWarningLevel(String(warning.level))}
                key={`${warning.level}-${index}`}
              >
                <strong>{formatRiskLevel(getWarningLevel(String(warning.level)))}</strong>
                <p>{warning.message}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

function getPreDeploymentGateLevel(
  analysis: AiPreDeploymentAnalysisResult
): "high" | "medium" | "low" {
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

function formatRiskLevel(level: "high" | "medium" | "low"): string {
  if (level === "high") return "높음";
  if (level === "medium") return "주의";
  return "낮음";
}

function formatBuildEnvironmentStatus(buildEnvironment: ProjectBuildEnvironment | null): string {
  if (!buildEnvironment) return "준비 필요";
  if (
    buildEnvironment.status === "ready" &&
    buildEnvironment.repositoryVerificationStatus === "verified"
  ) {
    return "Repository 검증 완료";
  }
  if (buildEnvironment.status === "ready") return "Repository 검증 필요";
  if (buildEnvironment.status === "preparing") return "준비 중";
  if (buildEnvironment.status === "verification_failed") return "확인 실패";
  return "AWS 재연결 필요";
}

function getBuildEnvironmentStatusTone(
  buildEnvironment: ProjectBuildEnvironment | null
): DeploymentStatusTone | "warning" {
  if (
    buildEnvironment?.status === "ready" &&
    buildEnvironment.repositoryVerificationStatus === "verified"
  ) {
    return "success";
  }
  if (buildEnvironment?.status === "ready") return "warning";
  if (buildEnvironment?.status === "preparing") return "running";
  if (buildEnvironment?.status === "verification_failed") return "error";
  return "warning";
}

function formatDeploymentSource(source: ApplicationRelease["source"]): string {
  return source === "gitops" ? "CI/CD" : "Direct";
}

function formatApplicationReleaseStatus(status: ApplicationRelease["status"]): string {
  const labels: Record<ApplicationRelease["status"], string> = {
    building: "빌드 중",
    cancelled: "취소됨",
    deploying: "배포 중",
    failed: "실패",
    partially_cancelled: "부분 취소",
    partially_failed: "부분 실패",
    pending: "대기 중",
    retrying: "웹 배포 재시도 중",
    rolled_back: "롤백됨",
    succeeded: "성공"
  };

  return labels[status];
}

function formatApplicationReleaseFailureStage(
  stage: NonNullable<ApplicationRelease["failureStage"]>
): string {
  const labels: Record<NonNullable<ApplicationRelease["failureStage"]>, string> = {
    candidate_upload: "검증 Artifact 저장",
    cloudfront_invalidation: "CloudFront 캐시 갱신",
    ecr_publish: "ECR 이미지 반영",
    ecs_activation: "ECS 새 버전 활성화",
    ecs_health: "ECS Health Check",
    frontend_activation: "웹 index 활성화",
    frontend_upload: "웹 asset 업로드",
    preflight_api_build: "API 사전 빌드",
    preflight_api_health: "API 사전 Health Check",
    preflight_checkout: "Repository checkout",
    preflight_frontend_build: "웹 사전 빌드",
    public_health: "공개 URL 최종 확인",
    rollback: "ECS 자동 복구",
    runtime_verification: "배포 Resource 재검증"
  };
  return labels[stage];
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

function getCleanupPlanActionLabel(deployment: Deployment, targetCount: number): string {
  if (targetCount <= 1) {
    return "Destroy Plan 생성";
  }

  return deployment.scope === "application"
    ? "애플리케이션 Destroy Plan 생성"
    : "인프라 Destroy Plan 생성";
}

function getCleanupExecutionActionLabel(deployment: Deployment, targetCount: number): string {
  if (targetCount <= 1) {
    return "Destroy 실행";
  }

  return deployment.scope === "application" ? "애플리케이션 Destroy 실행" : "인프라 Destroy 실행";
}

function mergeDeploymentLog(logs: DeploymentLog[], log: DeploymentLog): DeploymentLog[] {
  if (logs.some((currentLog) => currentLog.id === log.id || currentLog.sequence === log.sequence)) {
    return logs;
  }

  return [...logs, log].sort((left, right) => left.sequence - right.sequence);
}

function DeploymentLogList({ logs }: { readonly logs: DeploymentLog[] }) {
  if (logs.length === 0) {
    return <p className={styles.deploymentHint}>아직 표시할 로그가 없습니다.</p>;
  }

  return (
    <ol aria-label="Deployment logs" className={styles.deploymentLogList} tabIndex={0}>
      {logs.map((log) => {
        const prefix = `${String(log.sequence).padStart(3, "0")}  ${log.stage
          .toUpperCase()
          .padEnd(8, " ")}  `;

        return (
          <li data-tone={getDeploymentLogTone(log)} key={log.id}>
            <span className={styles.deploymentLogPrefix}>{prefix}</span>
            <p>
              {getDeploymentLogMessageTokens(log.message).map((token, index) => (
                <span className={getDeploymentLogTokenClassName(token)} key={`${log.id}-${index}`}>
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

function getSafeReleaseOutputUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
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

function formatDeploymentChangeSummary(summary: Deployment["planSummary"]): string {
  if (!summary) {
    return "변경 정보 없음";
  }

  const changes = [
    ["추가", summary.createCount],
    ["수정", summary.updateCount],
    ["교체", summary.replaceCount],
    ["삭제", summary.deleteCount]
  ]
    .filter(([, count]) => Number(count) > 0)
    .map(([label, count]) => `${label} ${count}개`);

  return changes.length > 0 ? changes.join(" · ") : "변경 없음";
}

function formatDeploymentHistoryResult(deployment: Deployment): string {
  const scope = formatDeploymentScope(deployment.scope);

  if (deployment.status === "DESTROYED") {
    const deleteCount = deployment.planSummary?.deleteCount ?? 0;
    return deleteCount > 0
      ? `${scope}에서 리소스 ${deleteCount}개를 정상적으로 정리했습니다.`
      : `${scope} 리소스 정리를 완료했습니다.`;
  }

  const changes = formatDeploymentChangeSummary(deployment.planSummary);
  return changes === "변경 없음" || changes === "변경 정보 없음"
    ? `${scope} 배포를 완료했습니다.`
    : `${scope} 배포를 완료했습니다. ${changes}.`;
}

function formatDeploymentScope(scope: DeploymentScope): string {
  if (scope === "infrastructure") {
    return "인프라";
  }

  if (scope === "application") {
    return "애플리케이션";
  }

  return "전체 스택";
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
