import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useReducer } from "react";
import type {
  ApplicationRelease,
  AiPreDeploymentAnalysisResult,
  AiSafetyExplanation,
  AwsConnection,
  CheckFinding,
  DeployedResource,
  Deployment,
  DeploymentFailureExplanation,
  DeploymentScope,
  DiagramJson,
  DeploymentLog,
  TerraformDiagnostic,
  TerraformSourceLocation,
  TerraformOutput
} from "@sketchcatch/types";
import { Check, Clipboard, ClipboardCheck, Code2, ShieldCheck, Trash2 } from "lucide-react";
import { DashboardIcon } from "../../components/dashboard/dashboard-icons";
import { SelectMenu, type SelectMenuOption } from "../../components/ui/SelectMenu";
import { getApiErrorMessage } from "../../lib/api-client";
import {
  approveDeploymentPlan,
  cancelDeployment as cancelDeploymentRun,
  executeDeployment,
  getAiPreDeploymentDeepScan,
  getDeploymentFailureExplanation,
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
  readonly deployableResourceCount: number;
  readonly deploymentAvailability: DeploymentAvailability;
  readonly diagramJson: DiagramJson;
  readonly hasUnsavedDeploymentBaseline: boolean;
  readonly onConfirmationStateChange?: ((isOpen: boolean) => void) | undefined;
  readonly onOpenFindingTerraformSource: (finding: CheckFinding) => TerraformSourceLocation | null;
  readonly onPrepareDeploymentArtifacts: () => Promise<PreparedWorkspaceDeploymentArtifacts>;
  readonly onPreDeploymentCheckStateChange: Dispatch<SetStateAction<DeploymentPreDeploymentCheckState>>;
  readonly onValidateTerraformDiagnostics: () => Promise<TerraformDiagnostic[]>;
  readonly preDeploymentCheckState: DeploymentPreDeploymentCheckState;
  readonly projectId: string;
};

// Direct Deployment reports only Resources that can enter the Terraform execution graph.
export function DirectDeploymentScreen({
  confirmationDismissRequestId = 0,
  deployableResourceCount,
  deploymentAvailability,
  diagramJson,
  hasUnsavedDeploymentBaseline,
  onConfirmationStateChange,
  onOpenFindingTerraformSource,
  onPrepareDeploymentArtifacts,
  onPreDeploymentCheckStateChange,
  onValidateTerraformDiagnostics,
  preDeploymentCheckState,
  projectId
}: DirectDeploymentScreenProps) {
  const [awsConnections, setAwsConnections] = useState<AwsConnection[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [applicationReleases, setApplicationReleases] = useState<ApplicationRelease[]>([]);
  const [deploymentLogs, setDeploymentLogs] = useState<DeploymentLog[]>([]);
  const [deploymentResources, setDeploymentResources] = useState<DeployedResource[]>([]);
  const [terraformOutputState, dispatchTerraformOutputState] = useReducer(
    reduceDeploymentOutputState,
    initialDeploymentOutputState
  );
  const [selectedAwsConnectionId, setSelectedAwsConnectionId] = useState("");
  const [selectedScope, setSelectedScope] = useState<DeploymentScope | "auto">("auto");
  const [selectedDeploymentId, setSelectedDeploymentId] = useState("");
  const [durationNow, setDurationNow] = useState(() => Date.now());
  const [showApplyConfirmation, setShowApplyConfirmation] = useState(false);
  const [showDestroyConfirmation, setShowDestroyConfirmation] = useState(false);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [failureExplanation, setFailureExplanation] =
    useState<DeploymentFailureExplanation | null>(null);
  const [failureExplanationState, setFailureExplanationState] = useState<RequestState>("idle");
  const [failureExplanationErrorMessage, setFailureExplanationErrorMessage] = useState("");
  const [selectedDirectStepId, setSelectedDirectStepId] =
    useState<DirectDeploymentStepId>("validation");
  const isDeploymentOverlayOpen = true;

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
  const deploymentOptions = useMemo<SelectMenuOption[]>(
    () =>
      deployments.map((deployment) => ({
        detail: formatDate(deployment.createdAt),
        label: deployment.status,
        value: deployment.id
      })),
    [deployments]
  );
  const selectedDeployment = useMemo(
    () => deployments.find((deployment) => deployment.id === selectedDeploymentId) ?? null,
    [deployments, selectedDeploymentId]
  );
  const terraformOutputs = useMemo(
    () => getVisibleDeploymentOutputs(terraformOutputState, selectedDeploymentId),
    [selectedDeploymentId, terraformOutputState]
  );
  const deploymentOutputLinks = useMemo(
    () => getSafeDeploymentLinks(terraformOutputs),
    [terraformOutputs]
  );
  useEffect(() => {
    setDurationNow(Date.now());

    if (selectedDeployment?.status !== "RUNNING") {
      return;
    }

    const intervalId = window.setInterval(() => setDurationNow(Date.now()), 1_000);

    return () => window.clearInterval(intervalId);
  }, [selectedDeployment?.id, selectedDeployment?.status]);
  const canStartDeploymentReview =
    selectedAwsConnectionId.length > 0 &&
    requestState !== "loading";
  const hasCurrentPlan = Boolean(selectedDeployment?.currentPlanArtifactId);
  const deploymentActions = getDeploymentActionState(selectedDeployment, requestState);
  const canRunPlan = deploymentActions.canRunApplyPlan;
  const canApprovePlan = deploymentActions.canApprovePlan;
  const canApply = deploymentActions.canApply;
  const canRunDestroyPlan = deploymentActions.canRunDestroyPlan;
  const canDestroy = deploymentActions.canDestroy;
  const canCancelDeployment = deploymentActions.canCancelDeployment;
  const shouldShowApplyButton = deploymentActions.shouldShowApplyButton;
  const shouldShowDestroyPlanButton = deploymentActions.shouldShowDestroyPlanButton;
  const shouldShowDestroyButton = deploymentActions.shouldShowDestroyButton;
  const deploymentActionHint = selectedDeployment
    ? getDeploymentActionHint(selectedDeployment)
    : "";
  const DeploymentBaselineIcon = hasUnsavedDeploymentBaseline ? Clipboard : ClipboardCheck;
  const shouldAutoRefreshSelectedDeployment = shouldAutoRefreshDeployment(selectedDeployment);
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
    onConfirmationStateChange?.(showApplyConfirmation || showDestroyConfirmation);
  }, [onConfirmationStateChange, showApplyConfirmation, showDestroyConfirmation]);

  useEffect(() => {
    if (confirmationDismissRequestId > 0) {
      setShowApplyConfirmation(false);
      setShowDestroyConfirmation(false);
    }
  }, [confirmationDismissRequestId]);

  const loadDeploymentRuntimeSnapshot = useCallback(async (): Promise<DeploymentRuntimeSnapshot> => {
    const [
      nextDeployments,
      nextReleases,
      nextLogs,
      nextResources,
      nextOutputs
    ] =
      await Promise.all([
      listDeployments(projectId),
      listApplicationReleases(projectId),
      selectedDeploymentId ? listDeploymentLogs(selectedDeploymentId) : Promise.resolve([]),
      selectedDeploymentId ? listDeploymentResources(selectedDeploymentId) : Promise.resolve([]),
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

  const applyDeploymentRuntimeSnapshot = useCallback((snapshot: DeploymentRuntimeSnapshot): void => {
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
      setFailureExplanation(null);
      setFailureExplanationState("idle");
      setFailureExplanationErrorMessage("");
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
          analysis: createPreDeploymentAnalysisFromTerraformDiagnostics(currentTerraformDiagnostics),
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

    setRequestState("loading");
    setErrorMessage("");
    let preparedArtifacts: PreparedWorkspaceDeploymentArtifacts;

    try {
      preparedArtifacts = await onPrepareDeploymentArtifacts();
      setRequestState("idle");
    } catch (error) {
      setRequestState("error");
      setErrorMessage(getApiErrorMessage(error, "프로젝트 저장과 배포 준비에 실패했습니다."));
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
      const prewarmedDeployment = await runDeploymentInit(deployment.id).catch(() => deployment);

      setDeployments((currentDeployments) => [prewarmedDeployment, ...currentDeployments]);
      setSelectedDeploymentId(prewarmedDeployment.id);
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

  async function startTerraformDestroyPlan(): Promise<void> {
    if (!selectedDeployment || !canRunDestroyPlan) {
      return;
    }

    dispatchTerraformOutputState({
      type: "clear",
      deploymentId: selectedDeployment.id
    });
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
      dispatchTerraformOutputState({ type: "loaded", deploymentId: deployment.id, outputs });
    }, "Terraform Destroy Plan을 시작하지 못했습니다.");
  }

  async function startTerraformDestroy(): Promise<void> {
    if (!selectedDeployment || !canDestroy) {
      return;
    }

    dispatchTerraformOutputState({
      type: "clear",
      deploymentId: selectedDeployment.id
    });
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

  async function refreshDeploymentPanel(): Promise<void> {
    dispatchTerraformOutputState({ type: "clear", deploymentId: selectedDeploymentId || null });
    await runRequest(async () => {
      applyDeploymentPanelSnapshot(await loadDeploymentPanelSnapshot());
    }, "배포 상태를 새로고침하지 못했습니다.");
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

    function renderDirectStepContent(stepId: DirectDeploymentStepId) {
      if (stepId === "validation") {
        return (
          <>
            <div className={styles.deploymentStepHeading}>
              <span>1단계</span>
              <h3>검증</h3>
              <p>프로젝트 저장, 안전 검사, Terraform Plan을 같은 단계에서 처리합니다.</p>
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
                ariaLabel="배포 범위 선택"
                disabled={requestState === "loading"}
                emptyLabel="배포 범위 없음"
                onChange={(value) => setSelectedScope(value as DeploymentScope | "auto")}
                options={deploymentScopeOptions}
                size={isDeploymentOverlayOpen ? "large" : "regular"}
                value={selectedScope}
              />
            </div>
            <div className={styles.deploymentStepSummary}>
              <InfoRow
                label="저장"
                value={hasUnsavedDeploymentBaseline ? "변경사항 있음" : "완료"}
              />
              <InfoRow label="범위" value={selectedDeployment?.scope ?? selectedScope} />
              <InfoRow label="Plan" value={hasCurrentPlan ? "완료" : "대기"} />
              {selectedDeployment?.planSummary ? <PlanSummaryRows deployment={selectedDeployment} /> : null}
            </div>
            {preDeploymentAnalysis !== null && !hasStalePreDeploymentAnalysis ? (
              <DeploymentPreDeploymentSummary
                analysis={preDeploymentAnalysis}
                onOpenFindingTerraformSource={onOpenFindingTerraformSource}
              />
            ) : null}
            <div className={styles.deploymentStepActionBar}>
              <p>{selectedStep.disabledReason ?? "검증 단계에서는 실제 리소스를 변경하지 않습니다."}</p>
              {!selectedDeployment || hasUnsavedDeploymentBaseline || directPreflightState === "idle" ? (
                <button
                  className={styles.deploymentPrimaryButton}
                  disabled={!canRunDeploymentReviewStep}
                  onClick={() => void runDeploymentReviewStep()}
                  type="button"
                >
                  <DeploymentBaselineIcon size={16} aria-hidden="true" />
                  {requestState === "loading" || preDeploymentState === "loading"
                    ? "저장·검증 중"
                    : "저장하고 검증"}
                </button>
              ) : !hasCurrentPlan ? (
                <button
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
          </>
        );
      }

      if (stepId === "approval") {
        return (
          <>
            <div className={styles.deploymentStepHeading}>
              <span>2단계</span>
              <h3>승인</h3>
              <p>범위, 변경량, 차단 사유와 비용 경고를 확인한 뒤 Plan을 승인합니다.</p>
            </div>
            <div className={styles.deploymentStepSummary}>
              <InfoRow label="범위" value={selectedDeployment?.scope ?? "확인 필요"} />
              <InfoRow
                label="차단"
                value={selectedDeployment?.isBlocked ? selectedDeployment.blockedReason ?? "차단됨" : "없음"}
              />
              {selectedDeployment?.planSummary ? <PlanSummaryRows deployment={selectedDeployment} /> : null}
            </div>
            <details className={styles.deploymentDisclosure}>
              <summary>실행 대상과 스냅샷</summary>
              <div className={styles.deploymentDisclosureBody}>
                <InfoRow label="AWS account" value={selectedAwsConnection?.accountId ?? "확인 필요"} />
                <InfoRow label="AWS region" value={selectedAwsConnection?.region ?? "확인 필요"} />
                <InfoRow label="Prepared snapshot" value={formatShortHash(selectedDeployment?.preparedSnapshotHash ?? null)} />
              </div>
            </details>
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
          </>
        );
      }

      return (
        <>
          <div className={styles.deploymentStepHeading}>
            <span>3단계</span>
            <h3>배포</h3>
            <p>승인된 스냅샷을 실행하고 상태, 릴리즈 버전, Output URL을 확인합니다.</p>
          </div>
          <div className={styles.deploymentStepSummary}>
            <InfoRow label="상태" value={selectedDeployment?.status ?? "대기"} />
            <InfoRow label="범위" value={selectedDeployment?.scope ?? "대기"} />
            <InfoRow label="현재 작업" value={primaryDeploymentStepStatus} />
            {selectedDeployment?.planSummary ? <PlanSummaryRows deployment={selectedDeployment} /> : null}
            <OptionalInfoRow
              label="릴리즈"
              value={applicationReleases.find((release) => release.deploymentId === selectedDeployment?.id)?.version ?? null}
            />
          </div>
          {deploymentOutputLinks.length > 0 ? (
            <DeploymentOutputLinks links={deploymentOutputLinks} scopeKey={selectedDeploymentId || null} />
          ) : null}
          {showApplyConfirmation && selectedDeployment ? (
            <div className={styles.deploymentApplyConfirm}>
              <h3>배포 실행 확인</h3>
              <InfoRow label="AWS account" value={selectedDeployment.approvedAwsAccountId ?? "없음"} />
              <InfoRow label="AWS region" value={selectedDeployment.approvedAwsRegion ?? "없음"} />
              <p>승인된 Plan과 프로젝트 스냅샷이 일치할 때만 실행됩니다.</p>
              <div className={styles.deploymentApplyActions}>
                <button className={styles.deploymentSecondaryButton} onClick={() => setShowApplyConfirmation(false)} type="button">취소</button>
                <button className={styles.deploymentPrimaryButton} disabled={!canApply} onClick={startTerraformApply} type="button">
                  <DashboardIcon name="rocket" />
                  배포 실행
                </button>
              </div>
            </div>
          ) : null}
          {showDestroyConfirmation && selectedDeployment ? (
            <div className={styles.deploymentDestroyConfirm}>
              <h3>정리 실행 확인</h3>
              <p>승인된 Destroy Plan으로 프로젝트 리소스를 정리합니다.</p>
              <div className={styles.deploymentApplyActions}>
                <button className={styles.deploymentSecondaryButton} onClick={() => setShowDestroyConfirmation(false)} type="button">취소</button>
                <button className={styles.deploymentDangerButton} disabled={!canDestroy} onClick={startTerraformDestroy} type="button">
                  <Trash2 size={16} aria-hidden="true" />
                  정리 실행
                </button>
              </div>
            </div>
          ) : null}
          <div className={styles.deploymentStepActionBar}>
            <p>{selectedStep.disabledReason ?? deploymentActionHint}</p>
            {selectedDeployment?.status === "RUNNING" ? (
              <button className={styles.deploymentSecondaryButton} disabled={!canCancelDeployment} onClick={cancelSelectedDeployment} type="button">실행 취소</button>
            ) : shouldShowDestroyPlanButton ? (
              <button className={styles.deploymentSecondaryButton} disabled={!canRunDestroyPlan} onClick={() => void startTerraformDestroyPlan()} type="button">Destroy Plan 생성</button>
            ) : shouldShowDestroyButton ? (
              <button className={styles.deploymentDangerButton} disabled={!canDestroy} onClick={() => setShowDestroyConfirmation(true)} type="button">정리 실행 검토</button>
            ) : (
              <button className={styles.deploymentPrimaryButton} disabled={!canApply} onClick={() => setShowApplyConfirmation(true)} type="button">
                <DashboardIcon name="rocket" />
                배포 실행 검토
              </button>
            )}
          </div>
        </>
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
                    aria-current={step.id === directDeploymentFlow.activeStepId ? "step" : undefined}
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

        <article className={styles.deploymentStepWorkspace} data-state={selectedStep.state}>
          {renderDirectStepContent(selectedStep.id)}
          {requestError ? <p className={styles.deploymentStageAlert} role="alert">{requestError}</p> : null}
          {selectedStep.id === "deployment" && selectedDeployment?.status === "FAILED" ? (
            <p className={styles.deploymentStageAlert} role="alert">
              {selectedDeployment.errorSummary ?? "배포가 실패했습니다. 배포 기록에서 원인을 확인하세요."}
            </p>
          ) : null}
        </article>

        <aside className={styles.deploymentContextPanel} aria-label="배포 컨텍스트">
          <div>
            <span>현재 배포</span>
            <h3>{selectedDeployment?.status ?? "준비 전"}</h3>
          </div>
          <dl>
            <div><dt>범위</dt><dd>{selectedDeployment?.scope ?? selectedScope}</dd></div>
            <div><dt>변경</dt><dd>{selectedDeployment?.planSummary ? `+${selectedDeployment.planSummary.createCount} ~${selectedDeployment.planSummary.updateCount} -${selectedDeployment.planSummary.deleteCount}` : "Plan 전"}</dd></div>
            <div><dt>차단</dt><dd>{selectedDeployment?.isBlocked ? selectedDeployment.blockedReason ?? "차단됨" : "없음"}</dd></div>
          </dl>
          <details className={styles.deploymentDisclosure}>
            <summary>실행 세부정보</summary>
            <div className={styles.deploymentDisclosureBody}>
              <InfoRow label="AWS account" value={selectedAwsConnection?.accountId ?? "연결 필요"} />
              <InfoRow label="Region" value={selectedAwsConnection?.region ?? "선택 전"} />
              <InfoRow label="Resources" value={String(deployableResourceCount)} />
            </div>
          </details>
        </aside>
      </section>
    );
  };

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
        <>
          <DeploymentOutputLinks
            links={deploymentOutputLinks}
            scopeKey={selectedDeploymentId || null}
          />
          <div className={styles.deploymentResultRows}>
            {terraformOutputs.map((output) => (
              <article className={styles.deploymentResultRow} key={output.id}>
                <strong>{output.name}</strong>
                <span className={styles.deploymentResultMeta}>{output.sensitive ? "sensitive" : "plain"}</span>
                <span className={styles.deploymentResultValue}>{formatOutputValue(output)}</span>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );

  const renderLogsSection = () => (
    <section className={styles.deploymentSection}>
      <h3>Logs</h3>
      <DeploymentLogList logs={deploymentLogs} />
    </section>
  );

  const renderApplicationReleaseHistory = () => (
    <section className={styles.deploymentSection}>
      <div className={styles.deploymentSectionHeader}>
        <h3>Application releases</h3>
        <small>{applicationReleases.length} releases</small>
      </div>
      {applicationReleases.length === 0 ? (
        <p className={styles.deploymentHint}>아직 application release가 없습니다.</p>
      ) : (
        <div className={styles.deploymentResultRows}>
          {applicationReleases.map((release) => {
            const outputUrl = getSafeReleaseOutputUrl(release.outputUrl);
            return (
              <article className={styles.deploymentResultRow} key={release.id}>
                <strong>{release.version}</strong>
                <span className={styles.deploymentResultMeta}>
                  {release.source.toUpperCase()} · {release.status} · {release.runtimeTargetKind}
                </span>
                <span className={styles.deploymentResultValue}>
                  {formatShortReleaseIdentity(release)}
                </span>
                {release.providerRevision ? (
                  <span className={styles.deploymentResultValue}>
                    {release.providerRevision.resourceType}: {release.providerRevision.revisionId}
                  </span>
                ) : null}
                {outputUrl ? (
                  <a href={outputUrl} rel="noreferrer" target="_blank">{outputUrl}</a>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );

  const renderHistoryView = () => (
    <div className={styles.deploymentHistoryGrid}>
      <div className={styles.deploymentHistoryPrimary}>
        {renderApplicationReleaseHistory()}
        {renderRecordsSection()}
      </div>
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

  const deploymentContent = canLoadDeploymentData(deploymentAvailability) ? (
    <div className={styles.deploymentConsoleContent}>
      {renderSetupSection()}
      <details className={styles.deploymentDisclosure}>
        <summary>
          <span>Deployment History</span>
          <small>{applicationReleases.length} releases</small>
        </summary>
        <div className={styles.deploymentDisclosureBody}>{renderHistoryView()}</div>
      </details>
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
