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
  ShieldCheck,
  Trash2
} from "lucide-react";
import { DashboardIcon } from "../../components/dashboard/dashboard-icons";
import { SelectMenu, type SelectMenuOption } from "../../components/ui/SelectMenu";
import { getApiErrorMessage } from "../../lib/api-client";
import {
  approveDeploymentPlan,
  cancelDeployment as cancelDeploymentRun,
  executeDeployment,
  getAiPreDeploymentDeepScan,
  listApplicationReleases,
  listAwsConnections,
  listDeploymentResources,
  listDeploymentLogs,
  listDeployments,
  listTerraformOutputs,
  prepareDeployment,
  runDeploymentInit,
  runDeploymentDestroy,
  runDeploymentDestroyPlan,
  runDeploymentPlan,
  runAiPreDeploymentCheck,
  runAiSafetyFindingExplanation,
  streamDeploymentLogs
} from "./api";
import {
  getDeploymentActionState,
  getDeploymentLogMessageTokens,
  getDeploymentLogTone,
  hasCompleteDeploymentApprovalSnapshot,
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
import { getDeploymentPreparationErrorMessage } from "./deployment-preparation-error";
import type { RequestState } from "./workspace-right-panel.types";
import { canLoadDeploymentData, type DeploymentAvailability } from "./deployment-availability";
import {
  getDirectDeploymentPreflightState,
  getDirectDeploymentFlow,
  hasDeploymentDraftChanges,
  shouldShowDeploymentValidationActions,
  shouldStartQueuedApplyPlan,
  type DirectDeploymentStepId
} from "./deployment-console-state";
import {
  getDeploymentHistoryEntries,
  getLatestCompletedDeploymentStep,
  getDeploymentStatusPresentation,
  getRecentDeploymentResultTitle,
  resolveDeploymentHistorySelection,
  type DeploymentStatusTone
} from "./deployment-presentation";
import {
  beginDeploymentHistoryDetailsLoad,
  completeDeploymentHistoryDetailsLoad,
  failDeploymentHistoryDetailsLoad,
  initialDeploymentHistoryDetailsState
} from "./deployment-history-details";
import { DeploymentOutputLinks } from "./DeploymentOutputLinks";
import {
  getSafeDeploymentLinks,
  getVisibleDeploymentOutputs,
  initialDeploymentOutputState,
  reduceDeploymentOutputState
} from "./deployment-output-links";
import styles from "./workspace.module.css";

type DeploymentRuntimeSnapshot = {
  readonly deployments: Deployment[];
  readonly releases: ApplicationRelease[];
  readonly logs: DeploymentLog[];
  readonly resources: DeployedResource[];
  readonly outputs: TerraformOutput[];
  readonly outputsDeploymentId: string | null;
};
type DeploymentPanelSnapshot = DeploymentRuntimeSnapshot & {
  readonly awsConnections: AwsConnection[];
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
  readonly diagramJson: DiagramJson;
  readonly hasUnsavedDeploymentBaseline: boolean;
  readonly onConfirmationStateChange?: ((isOpen: boolean) => void) | undefined;
  readonly onOpenFindingTerraformSource: (finding: CheckFinding) => TerraformSourceLocation | null;
  readonly onPrepareDeploymentArtifacts: () => Promise<PreparedWorkspaceDeploymentArtifacts>;
  readonly onPreDeploymentCheckStateChange: Dispatch<
    SetStateAction<DeploymentPreDeploymentCheckState>
  >;
  readonly onValidateTerraformDiagnostics: () => Promise<TerraformDiagnostic[]>;
  readonly preDeploymentCheckState: DeploymentPreDeploymentCheckState;
  readonly projectId: string;
  readonly projectDraftRevision?: number | null | undefined;
};

// Direct Deployment reports only Resources that can enter the Terraform execution graph.
export function DirectDeploymentScreen({
  confirmationDismissRequestId = 0,
  deploymentAvailability,
  diagramJson,
  hasUnsavedDeploymentBaseline,
  onConfirmationStateChange,
  onOpenFindingTerraformSource,
  onPrepareDeploymentArtifacts,
  onPreDeploymentCheckStateChange,
  onValidateTerraformDiagnostics,
  preDeploymentCheckState,
  projectId,
  projectDraftRevision = null
}: DirectDeploymentScreenProps) {
  const [awsConnections, setAwsConnections] = useState<AwsConnection[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [applicationReleases, setApplicationReleases] = useState<ApplicationRelease[]>([]);
  const [_deploymentLogs, setDeploymentLogs] = useState<DeploymentLog[]>([]);
  const [_deploymentResources, setDeploymentResources] = useState<DeployedResource[]>([]);
  const [terraformOutputState, dispatchTerraformOutputState] = useReducer(
    reduceDeploymentOutputState,
    initialDeploymentOutputState
  );
  const [selectedAwsConnectionId, setSelectedAwsConnectionId] = useState("");
  const [selectedScope, setSelectedScope] = useState<DeploymentScope | "auto">("auto");
  const [selectedDeploymentId, setSelectedDeploymentId] = useState("");
  const [selectedHistoryDeploymentId, setSelectedHistoryDeploymentId] = useState("");
  const [deploymentHistoryDetails, setDeploymentHistoryDetails] = useState(
    initialDeploymentHistoryDetailsState
  );
  const previousLatestHistoryDeploymentIdRef = useRef("");
  const [queuedApplyPlanDeploymentId, setQueuedApplyPlanDeploymentId] = useState("");
  const [showApplyConfirmation, setShowApplyConfirmation] = useState(false);
  const [showDestroyConfirmation, setShowDestroyConfirmation] = useState(false);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedDirectStepId, setSelectedDirectStepId] =
    useState<DirectDeploymentStepId>("validation");
  const isDeploymentOverlayOpen = true;

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
  const deploymentHistoryOptions = useMemo<SelectMenuOption[]>(
    () =>
      deploymentHistoryEntries.map(({ deployment }) => ({
        detail: `${getDeploymentStatusPresentation(deployment.status).label} · ${formatDeploymentScope(deployment.scope)}`,
        label: formatDeploymentVersionDate(deployment.createdAt),
        value: deployment.id
      })),
    [deploymentHistoryEntries]
  );
  const selectedDeployment = useMemo(
    () => deployments.find((deployment) => deployment.id === selectedDeploymentId) ?? null,
    [deployments, selectedDeploymentId]
  );
  const selectedHistoryDeployment = useMemo(
    () =>
      deployments.find((deployment) => deployment.id === selectedHistoryDeploymentId) ?? null,
    [deployments, selectedHistoryDeploymentId]
  );
  const cleanupDeployments = useMemo(
    () => selectDeploymentCleanupTargets(deployments),
    [deployments]
  );
  const cleanupDeployment =
    cleanupDeployments.find((deployment) => deployment.id === selectedDeploymentId) ??
    cleanupDeployments[0] ??
    null;
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
  const historyDeploymentLogs = hasLoadedSelectedHistoryDetails
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
  const historyDeploymentOutputLinks = useMemo(
    () => getSafeDeploymentLinks(historyTerraformOutputs),
    [historyTerraformOutputs]
  );
  const canStartDeploymentReview = selectedAwsConnectionId.length > 0 && requestState !== "loading";
  const hasCurrentPlan = Boolean(selectedDeployment?.currentPlanArtifactId);
  const deploymentActions = getDeploymentActionState(selectedDeployment, requestState);
  const cleanupDeploymentActions = getDeploymentActionState(cleanupDeployment, requestState);
  const cleanupActionTargets = cleanupDeployments.map((deployment) => ({
    actions: getDeploymentActionState(deployment, requestState),
    deployment
  }));
  const canRunPlan = deploymentActions.canRunApplyPlan;
  const canApprovePlan = deploymentActions.canApprovePlan;
  const canApply = deploymentActions.canApply;
  const canDestroy = cleanupDeploymentActions.canDestroy;
  const canCancelDeployment = deploymentActions.canCancelDeployment;
  const shouldShowApplyButton = deploymentActions.shouldShowApplyButton;
  const deploymentActionHint = selectedDeployment
    ? getDeploymentActionHint(selectedDeployment)
    : "";
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
    hasUnsavedBaseline: hasCurrentDeploymentChanges,
    preflightState: directPreflightState,
    requestState
  });
  const recentResultTitle = getRecentDeploymentResultTitle(selectedDeployment);
  const recentResultStatus = selectedDeployment
    ? getDeploymentStatusPresentation(selectedDeployment.status)
    : null;
  const recentResultStage = selectedDeployment
    ? (selectedDeployment.failureStage ?? selectedDeployment.activeStage)
    : null;
  const recentResultCompletedStep = selectedDeployment
    ? getLatestCompletedDeploymentStep(selectedDeployment)
    : null;

  useEffect(() => {
    setSelectedDirectStepId(directDeploymentFlow.activeStepId);
  }, [directDeploymentFlow.activeStepId]);

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
    if (!queuedApplyPlanDeploymentId || !selectedDeployment) {
      return;
    }

    if (
      selectedDeployment.id === queuedApplyPlanDeploymentId &&
      (selectedDeployment.currentPlanArtifactId ||
        selectedDeployment.status === "FAILED" ||
        selectedDeployment.status === "CANCELLED")
    ) {
      setQueuedApplyPlanDeploymentId("");
      return;
    }

    if (
      !canRunPlan ||
      !shouldStartQueuedApplyPlan({
        deployment: selectedDeployment,
        queuedDeploymentId: queuedApplyPlanDeploymentId,
        requestState
      })
    ) {
      return;
    }

    setQueuedApplyPlanDeploymentId("");
    void startTerraformPlan();
  }, [
    canRunPlan,
    queuedApplyPlanDeploymentId,
    requestState,
    selectedDeployment?.currentPlanArtifactId,
    selectedDeployment?.id,
    selectedDeployment?.status
  ]);

  useEffect(() => {
    if (shouldShowApplyButton) {
      setShowApplyConfirmation(true);
    }
  }, [shouldShowApplyButton]);

  useEffect(() => {
    onConfirmationStateChange?.(showApplyConfirmation || showDestroyConfirmation);
  }, [onConfirmationStateChange, showApplyConfirmation, showDestroyConfirmation]);

  useEffect(() => {
    if (confirmationDismissRequestId > 0) {
      setShowApplyConfirmation(false);
      setShowDestroyConfirmation(false);
    }
  }, [confirmationDismissRequestId]);

  const loadDeploymentRuntimeSnapshot =
    useCallback(async (): Promise<DeploymentRuntimeSnapshot> => {
      const [nextDeployments, nextReleases, nextLogs, nextResources, nextOutputs] =
        await Promise.all([
          listDeployments(projectId),
          listApplicationReleases(projectId),
          selectedDeploymentId ? listDeploymentLogs(selectedDeploymentId) : Promise.resolve([]),
          selectedDeploymentId
            ? listDeploymentResources(selectedDeploymentId)
            : Promise.resolve([]),
          selectedDeploymentId ? listTerraformOutputs(selectedDeploymentId) : Promise.resolve([])
        ]);

      return {
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
    const [nextConnections, runtimeSnapshot] = await Promise.all([
      listAwsConnections(),
      loadDeploymentRuntimeSnapshot()
    ]);

    return {
      ...runtimeSnapshot,
      awsConnections: nextConnections
    };
  }, [loadDeploymentRuntimeSnapshot]);

  const applyDeploymentPanelSnapshot = useCallback(
    (snapshot: DeploymentPanelSnapshot): void => {
      const latestVerifiedConnection = snapshot.awsConnections.find(
        (connection) => connection.status === "verified"
      );

      setAwsConnections(snapshot.awsConnections);
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

        setSelectedAwsConnectionId((currentId) => currentId || latestVerifiedConnection?.id || "");
        setSelectedDeploymentId((currentId) => currentId || latestDeployment?.id || "");
      }, "배포 정보를 불러오지 못했습니다.");
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
      setShowDestroyConfirmation(false);
      return;
    }

    let cancelled = false;
    dispatchTerraformOutputState({ type: "clear", deploymentId: selectedDeploymentId });

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
          dispatchTerraformOutputState({
            type: "loaded",
            deploymentId: selectedDeploymentId,
            outputs
          });
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
              errorMessage: getApiErrorMessage(
                error,
                "배포 버전 상세를 불러오지 못했습니다."
              )
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

  async function runPreDeploymentCheck(
    preparedArtifacts: PreparedWorkspaceDeploymentArtifacts
  ): Promise<boolean> {
    const preparedBoardSnapshot = createWorkspaceAiBoardSnapshot(preparedArtifacts.diagramJson);

    if (!preparedBoardSnapshot.hasResources) {
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
    if (!canRunDeploymentReviewStep) {
      return;
    }

    setRequestState("loading");
    setErrorMessage("");
    let preparedArtifacts: PreparedWorkspaceDeploymentArtifacts;

    try {
      preparedArtifacts = await onPrepareDeploymentArtifacts();
      setRequestState("idle");
    } catch (error) {
      setRequestState("error");
      const fallbackMessage = getApiErrorMessage(
        error,
        "프로젝트 저장과 배포 준비에 실패했습니다."
      );
      setErrorMessage(getDeploymentPreparationErrorMessage(error, fallbackMessage));
      return;
    }

    const checkPassed = await runPreDeploymentCheck(preparedArtifacts);

    if (!checkPassed) {
      return;
    }

    await startDeploymentReview(preparedArtifacts);
  }

  async function startDeploymentReview(
    savedArtifacts: PreparedWorkspaceDeploymentArtifacts
  ): Promise<void> {
    if (!canStartDeploymentReview) {
      return;
    }

    dispatchTerraformOutputState({ type: "clear", deploymentId: null });
    await runRequest(async () => {
      const snapshot = await loadDeploymentPanelSnapshot();

      applyDeploymentPanelSnapshot(snapshot);
      setSelectedDeploymentId("");

      const deployment = await prepareDeployment({
        projectId,
        architectureId: savedArtifacts.architecture.id,
        terraformArtifactId: savedArtifacts.terraformArtifact.id,
        awsConnectionId: selectedAwsConnectionId,
        draftRevision: savedArtifacts.preparedDraftRevision,
        scope: selectedScope
      });
      let shouldQueueApplyPlan = false;
      const prewarmedDeployment = await runDeploymentInit(deployment.id)
        .then((runningDeployment) => {
          shouldQueueApplyPlan = true;
          return runningDeployment;
        })
        .catch(() => deployment);

      setDeployments((currentDeployments) => [prewarmedDeployment, ...currentDeployments]);
      setSelectedDeploymentId(prewarmedDeployment.id);
      setQueuedApplyPlanDeploymentId(shouldQueueApplyPlan ? prewarmedDeployment.id : "");
      setDeploymentLogs([]);
      setDeploymentResources([]);
      dispatchTerraformOutputState({
        type: "clear",
        deploymentId: prewarmedDeployment.id
      });
      setShowApplyConfirmation(false);
      setShowDestroyConfirmation(false);
    }, "배포 검토를 시작하지 못했습니다.");
  }

  async function startTerraformPlan(): Promise<void> {
    if (!selectedDeployment || !canRunPlan) {
      return;
    }

    setQueuedApplyPlanDeploymentId("");

    dispatchTerraformOutputState({
      type: "clear",
      deploymentId: selectedDeployment.id
    });
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
      dispatchTerraformOutputState({ type: "loaded", deploymentId: deployment.id, outputs });
      setShowApplyConfirmation(false);
      setShowDestroyConfirmation(false);
    }, "Terraform Plan을 시작하지 못했습니다.");
  }

  async function approveCurrentPlan(): Promise<void> {
    if (!selectedDeployment || !canApprovePlan) {
      return;
    }

    dispatchTerraformOutputState({
      type: "clear",
      deploymentId: selectedDeployment.id
    });
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
      dispatchTerraformOutputState({ type: "loaded", deploymentId: deployment.id, outputs });
    }, "Terraform Plan을 승인하지 못했습니다.");
  }

  async function startTerraformApply(): Promise<void> {
    if (!selectedDeployment || !canApply) {
      return;
    }

    dispatchTerraformOutputState({
      type: "clear",
      deploymentId: selectedDeployment.id
    });
    await runRequest(async () => {
      const deployment = await executeDeployment(selectedDeployment.id);
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
      dispatchTerraformOutputState({ type: "loaded", deploymentId: deployment.id, outputs });
    }, "Terraform Apply를 시작하지 못했습니다.");
  }

  async function startTerraformDestroyPlan(targetDeployment: Deployment): Promise<void> {
    const targetActions = getDeploymentActionState(targetDeployment, requestState);

    if (!targetActions.canRunDestroyPlan) {
      return;
    }

    dispatchTerraformOutputState({
      type: "clear",
      deploymentId: targetDeployment.id
    });
    await runRequest(async () => {
      const deployment = await runDeploymentDestroyPlan(targetDeployment.id);
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
      dispatchTerraformOutputState({ type: "loaded", deploymentId: deployment.id, outputs });
    }, "Terraform Destroy Plan을 시작하지 못했습니다.");
  }

  async function startTerraformDestroy(): Promise<void> {
    if (!cleanupDeployment || !canDestroy) {
      return;
    }

    dispatchTerraformOutputState({
      type: "clear",
      deploymentId: cleanupDeployment.id
    });
    await runRequest(async () => {
      const deployment = await runDeploymentDestroy(cleanupDeployment.id);
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
      dispatchTerraformOutputState({ type: "loaded", deploymentId: deployment.id, outputs });
    }, "Terraform Destroy를 시작하지 못했습니다.");
  }

  async function cancelSelectedDeployment(): Promise<void> {
    if (!selectedDeployment || !canCancelDeployment) {
      return;
    }

    dispatchTerraformOutputState({
      type: "clear",
      deploymentId: selectedDeployment.id
    });
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

  const renderSetupSection = () => {
    const selectedStep =
      directDeploymentFlow.steps.find((step) => step.id === selectedDirectStepId) ??
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
        : requestState === "error"
          ? errorMessage
          : "";
    const validationIsBusy = requestState === "loading" || preDeploymentState === "loading";
    const selectedStepHeading =
      selectedStep.id === "validation"
        ? {
            description:
              "배포 전에 설정을 저장하고 Terraform Plan과 안전 검사를 실행합니다.",
            label: "1단계",
            title: "배포 검증"
          }
        : selectedStep.id === "approval"
          ? {
              description: "범위, 변경량, 차단 사유와 비용 경고를 확인한 뒤 Plan을 승인합니다.",
              label: "2단계",
              title: "승인"
            }
          : {
              description:
                "승인된 스냅샷을 실행하고 상태, 릴리즈 버전, Output URL을 확인합니다.",
              label: "3단계",
              title: "배포"
            };

    function renderDirectStepContent(stepId: DirectDeploymentStepId) {
      if (stepId === "validation") {
        const settingsStatus = hasCurrentDeploymentChanges
          ? { label: "변경사항 있음", tone: "warning" as const }
          : { label: "변경사항 없음", tone: "success" as const };
        const planStatus = validationIsBusy
          ? { label: "실행 중", tone: "running" as const }
          : hasCurrentPlan
            ? { label: "성공", tone: "success" as const }
            : { label: "실행 전", tone: "neutral" as const };

        return (
          <>
            <section className={styles.deploymentSettingsCard}>
              <h3>배포 설정</h3>
              <div className={styles.deploymentStageSettings}>
                <div className={styles.deploymentLabeledField}>
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
            <section className={styles.deploymentValidationSummary}>
              <h3>검증 요약</h3>
              <div className={styles.deploymentValidationSummaryGrid}>
                <DeploymentSummaryItem label="설정 상태">
                  <DeploymentStatusBadge label={settingsStatus.label} tone={settingsStatus.tone} />
                </DeploymentSummaryItem>
                <DeploymentSummaryItem label="변경 범위">
                  <code className={styles.deploymentScopeCode}>
                    {selectedDeployment?.scope ?? selectedScope}
                  </code>
                </DeploymentSummaryItem>
                <DeploymentSummaryItem label="Terraform Plan">
                  <DeploymentStatusBadge label={planStatus.label} tone={planStatus.tone} />
                </DeploymentSummaryItem>
              </div>
              {selectedDeployment?.planSummary ? (
                <PlanSummaryRows deployment={selectedDeployment} />
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
          <div className={styles.deploymentStepSummary}>
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
            />
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
          {showDestroyConfirmation && cleanupDeployment ? (
            <div className={styles.deploymentDestroyConfirm}>
              <h3>정리 실행 확인</h3>
              <p>승인된 Destroy Plan으로 프로젝트 리소스를 정리합니다.</p>
              <div className={styles.deploymentApplyActions}>
                <button
                  className={styles.deploymentSecondaryButton}
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
                  정리 실행
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
                disabled={!canCancelDeployment}
                onClick={cancelSelectedDeployment}
                type="button"
              >
                실행 취소
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
                      className={styles.deploymentSecondaryButton}
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
                  disabled={!canRunDeploymentReviewStep}
                  onClick={() => void runDeploymentReviewStep()}
                  type="button"
                >
                  <DeploymentBaselineIcon size={16} aria-hidden="true" />
                  {validationIsBusy ? "저장 및 검증 실행 중" : "저장 후 검증 실행"}
                </button>
              </div>
            ) : !hasCurrentPlan ? (
              <button
                aria-busy={requestState === "loading"}
                className={styles.deploymentPrimaryButton}
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
            <p>{selectedStep.disabledReason ?? "승인된 스냅샷만 실행할 수 있습니다."}</p>
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
        );
      }

      return (
        <div className={styles.deploymentStepActionBar}>
          <p>{selectedStep.disabledReason ?? deploymentActionHint}</p>
          {selectedDeployment?.status === "RUNNING" ? (
            <button
              className={styles.deploymentSecondaryButton}
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
                      className={styles.deploymentSecondaryButton}
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
                      className={styles.deploymentDangerButton}
                      disabled={!actions.canDestroy}
                      key={`${deployment.id}:destroy`}
                      onClick={() => {
                        setSelectedDeploymentId(deployment.id);
                        setShowDestroyConfirmation(true);
                      }}
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
                    className={styles.deploymentSecondaryButton}
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
                    배포 실행
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

        <div className={styles.deploymentStepHeading}>
          <span>{selectedStepHeading.label}</span>
          <h3>{selectedStepHeading.title}</h3>
          <p>{selectedStepHeading.description}</p>
        </div>

        {renderDirectStepActions(selectedStep.id)}

        <article className={styles.deploymentStepWorkspace} data-state={selectedStep.state}>
          {renderDirectStepContent(selectedStep.id)}
          {requestError ? (
            <p className={styles.deploymentStageAlert} role="alert">
              {requestError}
            </p>
          ) : null}
          {selectedStep.id === "deployment" && selectedDeployment?.status === "FAILED" ? (
            <p className={styles.deploymentStageAlert} role="alert">
              {selectedDeployment.errorSummary ??
                "배포가 실패했습니다. 배포 기록에서 원인을 확인하세요."}
            </p>
          ) : null}
        </article>

        <aside className={styles.deploymentRecentResultCard} role="status" aria-live="polite">
          <h3>{recentResultTitle}</h3>
          {selectedDeployment && recentResultStatus ? (
            <>
              <DeploymentStatusBadge
                label={recentResultStatus.label}
                tone={recentResultStatus.tone}
              />
              <dl className={styles.deploymentRecentResultFacts}>
                <div>
                  <dt>실행 범위</dt>
                  <dd>
                    <code>{selectedDeployment.scope}</code>
                  </dd>
                </div>
                <div>
                  <dt>마지막 완료 단계</dt>
                  <dd>{recentResultCompletedStep}</dd>
                </div>
                {selectedDeployment.status === "FAILED" && recentResultStage ? (
                  <div>
                    <dt>실패 단계</dt>
                    <dd>{formatDeploymentStage(recentResultStage)}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>차단 상태</dt>
                  <dd>
                    {selectedDeployment.isBlocked
                      ? (selectedDeployment.blockedReason ?? "차단됨")
                      : "차단 없음"}
                  </dd>
                </div>
                <div>
                  <dt>실행 시각</dt>
                  <dd>{formatDate(selectedDeployment.createdAt)}</dd>
                </div>
              </dl>
              {selectedDeployment.errorSummary ? (
                <p className={styles.deploymentRecentResultError}>
                  <AlertCircle size={16} aria-hidden="true" />
                  <span>{selectedDeployment.errorSummary}</span>
                </p>
              ) : null}
            </>
          ) : (
            <p className={styles.deploymentRecentResultEmpty}>
              아직 실행 결과가 없습니다. 검증을 실행하면 현재 상태가 여기에 표시됩니다.
            </p>
          )}
        </aside>
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
        <section
          aria-label="리소스와 Output 세부 내용"
          className={styles.deploymentSection}
        >
          <p className={styles.deploymentRecentResultError} role="alert">
            {historyDetailsErrorMessage}
          </p>
        </section>
      );
    }

    return (
      <section
        aria-label="리소스와 Output 세부 내용"
        className={styles.deploymentSection}
      >
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
    if (historyDetailsIsLoading) {
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

    if (historyDetailsErrorMessage) {
      return (
        <section aria-label="전체 로그 세부 내용" className={styles.deploymentSection}>
          <p className={styles.deploymentRecentResultError} role="alert">
            {historyDetailsErrorMessage}
          </p>
        </section>
      );
    }

    return (
      <section aria-label="전체 로그 세부 내용" className={styles.deploymentSection}>
        <DeploymentLogList logs={historyDeploymentLogs} />
      </section>
    );
  };

  const renderDeploymentHistory = () => {
    const selectedEntry = deploymentHistoryEntries.find(
      ({ deployment }) => deployment.id === selectedHistoryDeploymentId
    );
    const deployment = selectedEntry?.deployment ?? selectedHistoryDeployment;
    const release = deployment
      ? sortedApplicationReleases.find((candidate) => candidate.deploymentId === deployment.id)
      : undefined;
    const status = deployment
      ? getDeploymentStatusPresentation(deployment.status)
      : null;
    const outputUrl = getSafeReleaseOutputUrl(release?.outputUrl ?? null);

    return (
      <section className={styles.deploymentHistorySection} id="deployment-history">
        <header className={styles.deploymentHistoryHeader}>
          <div>
            <h3>배포 이력</h3>
          </div>
          <span className={styles.deploymentHistoryCount}>
            <CheckCircle2 aria-hidden="true" size={16} />
            <strong>{deploymentHistoryEntries.length}</strong>
            성공 버전
          </span>
        </header>
        {deploymentHistoryEntries.length === 0 ? (
          <div className={styles.deploymentHistoryEmpty}>
            <strong>아직 성공한 배포 버전이 없습니다.</strong>
            <p>첫 번째 배포가 성공하면 이곳에 표시됩니다.</p>
          </div>
        ) : (
          <div className={styles.deploymentHistoryBody}>
            <div className={styles.deploymentHistoryPicker}>
              <div className={styles.deploymentHistoryPickerLabel}>
                <label htmlFor="deployment-history-version-select">버전 선택</label>
                <span>성공한 배포만 표시</span>
              </div>
              <SelectMenu
                ariaLabel="배포 이력 버전 선택"
                emptyLabel="배포 버전 없음"
                id="deployment-history-version-select"
                onChange={setSelectedHistoryDeploymentId}
                options={deploymentHistoryOptions}
                size="large"
                tone="workspace"
                value={selectedHistoryDeploymentId}
              />
            </div>
            {deployment && selectedEntry && status ? (
              <article className={styles.deploymentHistorySnapshot} key={deployment.id}>
                <header className={styles.deploymentHistorySnapshotHeader}>
                  <div className={styles.deploymentHistorySnapshotIdentity}>
                    <span
                      className={styles.deploymentHistoryStatus}
                      data-tone={deployment.status === "DESTROYED" ? "neutral" : "success"}
                    >
                      <CheckCircle2 aria-hidden="true" size={15} />
                      {status.label}
                    </span>
                    <div>
                      <span>선택한 배포</span>
                      <strong>
                        {deployment.status === "DESTROYED" ? "정리 완료된 버전" : "배포 완료"}
                      </strong>
                    </div>
                  </div>
                  <time dateTime={deployment.createdAt}>{formatDate(deployment.createdAt)}</time>
                </header>

                <div className={styles.deploymentHistoryMetrics} aria-label="Terraform 변경 요약">
                  <div data-change="create">
                    <span>추가</span>
                    <strong>{deployment.planSummary?.createCount ?? 0}</strong>
                    <small>resources</small>
                  </div>
                  <div data-change="update">
                    <span>수정</span>
                    <strong>{deployment.planSummary?.updateCount ?? 0}</strong>
                    <small>resources</small>
                  </div>
                  <div data-change="delete">
                    <span>삭제</span>
                    <strong>{deployment.planSummary?.deleteCount ?? 0}</strong>
                    <small>resources</small>
                  </div>
                </div>

                <dl className={styles.deploymentHistoryMetadata}>
                  <div>
                    <dt>실행 범위</dt>
                    <dd>{formatDeploymentScope(deployment.scope)}</dd>
                  </div>
                  <div>
                    <dt>버전 ID</dt>
                    <dd>
                      <code title={selectedEntry.versionLabel}>{selectedEntry.versionLabel}</code>
                    </dd>
                  </div>
                </dl>
                {release ? (
                  <div className={styles.deploymentHistoryRelease}>
                    <span>Application release</span>
                    <strong>{release.version}</strong>
                    <small>
                      {formatDeploymentSource(release.source)} ·{" "}
                      {formatApplicationReleaseStatus(release.status)} ·{" "}
                      {formatShortReleaseIdentity(release)}
                    </small>
                  </div>
                ) : null}
                {release?.providerRevision ? (
                  <span className={styles.deploymentHistoryRevision}>
                    {release.providerRevision.resourceType}: {release.providerRevision.revisionId}
                  </span>
                ) : null}
                {outputUrl ? (
                  <a
                    className={styles.deploymentHistoryOutputLink}
                    href={outputUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {outputUrl}
                  </a>
                ) : null}
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
              {historyDetailsIsLoading
                ? "불러오는 중"
                : historyDetailsErrorMessage
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
        <a className={styles.deploymentPrimaryButton} href="/workspace/new">
          프로젝트로 저장
        </a>
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

function DeploymentSummaryItem({
  children,
  label
}: {
  readonly children: ReactNode;
  readonly label: string;
}) {
  return (
    <div className={styles.deploymentValidationSummaryItem}>
      <span>{label}</span>
      {children}
    </div>
  );
}

function DeploymentStatusBadge({
  label,
  tone
}: {
  readonly label: string;
  readonly tone: DeploymentStatusTone | "warning";
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

function formatDeploymentStage(
  stage: Deployment["activeStage"] | Deployment["failureStage"]
): string | null {
  if (!stage) {
    return null;
  }

  const labels: Record<NonNullable<Deployment["failureStage"]>, string> = {
    apply: "Terraform Apply",
    approval: "승인",
    aws_connection: "AWS 연결",
    destroy: "Terraform Destroy",
    init: "초기화",
    mock_run: "실행 점검",
    plan: "Terraform Plan",
    validate: "검증"
  };

  return labels[stage];
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
    pending: "대기 중",
    rolled_back: "롤백됨",
    succeeded: "성공"
  };

  return labels[status];
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
    return "정리 실행 검토";
  }

  return deployment.scope === "application"
    ? "애플리케이션 정리 실행 검토"
    : "인프라 정리 실행 검토";
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

function formatShortReleaseIdentity(release: ApplicationRelease): string {
  return `commit ${release.commitSha.slice(0, 12)} · sha256:${release.artifactDigest.slice(0, 12)}`;
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

function formatDeploymentScope(scope: DeploymentScope): string {
  if (scope === "infrastructure") {
    return "인프라";
  }

  if (scope === "application") {
    return "애플리케이션";
  }

  return "전체 스택";
}

function formatDeploymentVersionDate(value: string): string {
  const formatted = formatDate(value);
  return formatted === value ? value : `${formatted} 배포`;
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
