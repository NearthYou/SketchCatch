import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent
} from "react";
import type {
  AiPreDeploymentAnalysisResult,
  AwsConnection,
  CheckFinding,
  DeployedResource,
  Deployment,
  DeploymentFailureExplanation,
  DiagramJson,
  DeploymentLog,
  TerraformDiagnostic,
  TerraformOutput
} from "@sketchcatch/types";
import { Clipboard, ClipboardCheck, Maximize2, ShieldCheck, Trash2, X } from "lucide-react";
import { DashboardIcon } from "../../components/dashboard/dashboard-icons";
import { SelectMenu, type SelectMenuOption } from "../../components/ui/SelectMenu";
import { getApiErrorMessage } from "../../lib/api-client";
import {
  approveDeploymentPlan,
  cancelDeployment as cancelDeploymentRun,
  createDeployment,
  getDeploymentFailureExplanation,
  listAwsConnections,
  listDeploymentResources,
  listDeploymentLogs,
  listDeployments,
  listTerraformOutputs,
  runDeploymentInit,
  runDeploymentApply,
  runDeploymentDestroy,
  runDeploymentDestroyPlan,
  runDeploymentPlan,
  runAiPreDeploymentCheck,
  streamDeploymentLogs
} from "./api";
import {
  getDefaultDeploymentPanelMode,
  getDeploymentActionState,
  getDeploymentLogMessageTokens,
  getDeploymentLogTone,
  hasCompleteDeploymentApprovalSnapshot,
  shouldAutoRefreshDeployment,
  shouldShowDeploymentInfoValue,
  type DeploymentLogMessageToken,
  type DeploymentPanelMode
} from "./deployment-actions";
import {
  createWorkspaceAiBoardSnapshot,
  isWorkspaceAiResultStale
} from "./workspace-ai-panel-state";
import { addTerraformDiagnosticsToPreDeploymentAnalysis } from "./pre-deployment-diagnostics";
import type { AiRequestState } from "./WorkspaceAiPanelPieces";
import type { SavedWorkspaceTerraformArtifact } from "./workspace-deployment-artifacts";
import type { RequestState } from "./workspace-right-panel.types";
import styles from "./workspace.module.css";

type DeploymentRuntimeSnapshot = {
  readonly deployments: Deployment[];
  readonly logs: DeploymentLog[];
  readonly resources: DeployedResource[];
  readonly outputs: TerraformOutput[];
};
type DeploymentPanelSnapshot = DeploymentRuntimeSnapshot & {
  readonly awsConnections: AwsConnection[];
};
const DEPLOYMENT_EXPANDED_DEFAULT_DETAILS_PERCENT = 50;
const DEPLOYMENT_EXPANDED_MIN_DETAILS_PERCENT = 28;
const DEPLOYMENT_EXPANDED_MAX_DETAILS_PERCENT = 72;

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function DeploymentPanel({
  currentNodeCount,
  diagramJson,
  hasUnsavedDeploymentBaseline,
  onPrepareDeploymentArtifacts,
  onValidateTerraformDiagnostics,
  projectId,
  projectName
}: {
  readonly currentNodeCount: number;
  readonly diagramJson: DiagramJson;
  readonly hasUnsavedDeploymentBaseline: boolean;
  readonly onPrepareDeploymentArtifacts: () => Promise<SavedWorkspaceTerraformArtifact>;
  readonly onValidateTerraformDiagnostics: () => Promise<TerraformDiagnostic[]>;
  readonly projectId: string;
  readonly projectName: string;
}) {
  const [awsConnections, setAwsConnections] = useState<AwsConnection[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [deploymentLogs, setDeploymentLogs] = useState<DeploymentLog[]>([]);
  const [deploymentResources, setDeploymentResources] = useState<DeployedResource[]>([]);
  const [terraformOutputs, setTerraformOutputs] = useState<TerraformOutput[]>([]);
  const [selectedAwsConnectionId, setSelectedAwsConnectionId] = useState("");
  const [selectedDeploymentId, setSelectedDeploymentId] = useState("");
  const [showApplyConfirmation, setShowApplyConfirmation] = useState(false);
  const [showDestroyConfirmation, setShowDestroyConfirmation] = useState(false);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [deploymentPanelMode, setDeploymentPanelMode] = useState<DeploymentPanelMode>("setup");
  const [isDeploymentExpanded, setIsDeploymentExpanded] = useState(false);
  const [deploymentDetailsWidthPercent, setDeploymentDetailsWidthPercent] = useState(
    DEPLOYMENT_EXPANDED_DEFAULT_DETAILS_PERCENT
  );
  const [preDeploymentAnalysis, setPreDeploymentAnalysis] =
    useState<AiPreDeploymentAnalysisResult | null>(null);
  const [preDeploymentState, setPreDeploymentState] = useState<AiRequestState>("idle");
  const [preDeploymentErrorMessage, setPreDeploymentErrorMessage] = useState("");
  const [preDeploymentFingerprint, setPreDeploymentFingerprint] = useState<string | null>(null);
  const [failureExplanation, setFailureExplanation] =
    useState<DeploymentFailureExplanation | null>(null);
  const [failureExplanationState, setFailureExplanationState] = useState<RequestState>("idle");
  const [failureExplanationErrorMessage, setFailureExplanationErrorMessage] = useState("");
  const deploymentExpandedGridRef = useRef<HTMLDivElement | null>(null);
  const deploymentResizeCleanupRef = useRef<(() => void) | null>(null);

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
  const hasDeploymentRecords = deployments.length > 0;
  const compactDeploymentPanelMode = hasDeploymentRecords ? deploymentPanelMode : "setup";
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
  const shouldShowPlanButton = deploymentActions.shouldShowApplyPlanButton;
  const shouldShowApprovePlanButton = deploymentActions.shouldShowApprovePlanButton;
  const shouldShowApplyButton = deploymentActions.shouldShowApplyButton;
  const shouldShowDestroyPlanButton = deploymentActions.shouldShowDestroyPlanButton;
  const shouldShowDestroyButton = deploymentActions.shouldShowDestroyButton;
  const deploymentActionHint = selectedDeployment
    ? getDeploymentActionHint(selectedDeployment)
    : "";
  const DeploymentBaselineIcon = hasUnsavedDeploymentBaseline ? Clipboard : ClipboardCheck;
  const shouldAutoRefreshSelectedDeployment = shouldAutoRefreshDeployment(selectedDeployment);
  const boardSnapshot = useMemo(
    () => createWorkspaceAiBoardSnapshot(diagramJson),
    [diagramJson]
  );
  const hasStalePreDeploymentAnalysis =
    preDeploymentAnalysis !== null &&
    isWorkspaceAiResultStale(preDeploymentFingerprint, boardSnapshot.fingerprint);
  const deploymentExpandedGridStyle = useMemo(
    () =>
      ({
        "--deployment-details-width": `${deploymentDetailsWidthPercent}%`
      }) as CSSProperties,
    [deploymentDetailsWidthPercent]
  );

  const updateDeploymentDetailsWidthFromClientX = useCallback((clientX: number): void => {
    const grid = deploymentExpandedGridRef.current;

    if (!grid) {
      return;
    }

    const rect = grid.getBoundingClientRect();

    if (rect.width <= 0) {
      return;
    }

    const nextPercent = ((clientX - rect.left) / rect.width) * 100;

    setDeploymentDetailsWidthPercent(
      clampNumber(
        nextPercent,
        DEPLOYMENT_EXPANDED_MIN_DETAILS_PERCENT,
        DEPLOYMENT_EXPANDED_MAX_DETAILS_PERCENT
      )
    );
  }, []);

  const loadDeploymentRuntimeSnapshot = useCallback(async (): Promise<DeploymentRuntimeSnapshot> => {
    const [nextDeployments, nextLogs, nextResources, nextOutputs] = await Promise.all([
      listDeployments(projectId),
      selectedDeploymentId ? listDeploymentLogs(selectedDeploymentId) : Promise.resolve([]),
      selectedDeploymentId ? listDeploymentResources(selectedDeploymentId) : Promise.resolve([]),
      selectedDeploymentId ? listTerraformOutputs(selectedDeploymentId) : Promise.resolve([])
    ]);

    return {
      deployments: nextDeployments,
      logs: nextLogs,
      resources: nextResources,
      outputs: nextOutputs
    };
  }, [projectId, selectedDeploymentId]);

  const applyDeploymentRuntimeSnapshot = useCallback((snapshot: DeploymentRuntimeSnapshot): void => {
    setDeployments(snapshot.deployments);
    setDeploymentLogs(snapshot.logs);
    setDeploymentResources(snapshot.resources);
    setTerraformOutputs(snapshot.outputs);
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
    let cancelled = false;

    async function loadDeploymentData(): Promise<void> {
      await runRequest(async () => {
        const [nextConnections, nextDeployments] = await Promise.all([
          listAwsConnections(),
          listDeployments(projectId)
        ]);

        if (cancelled) {
          return;
        }

        setAwsConnections(nextConnections);
        setDeployments(nextDeployments);

        const latestVerifiedConnection = nextConnections.find(
          (connection) => connection.status === "verified"
        );
        const latestDeployment = nextDeployments[0];

        setSelectedAwsConnectionId((currentId) => currentId || latestVerifiedConnection?.id || "");
        setSelectedDeploymentId((currentId) => currentId || latestDeployment?.id || "");
        setDeploymentPanelMode(getDefaultDeploymentPanelMode(nextDeployments));
      }, "배포 정보를 불러오지 못했습니다.");
    }

    void loadDeploymentData();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (deployments.length > 0) {
      return;
    }

    setDeploymentPanelMode("setup");
    setIsDeploymentExpanded(false);
  }, [deployments.length]);

  useEffect(
    () => () => {
      deploymentResizeCleanupRef.current?.();
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

  async function runPreDeploymentCheck(): Promise<void> {
    if (!boardSnapshot.hasResources) {
      setPreDeploymentState("error");
      setPreDeploymentErrorMessage("Architecture Board에 Resource가 있어야 실행할 수 있습니다.");
      return;
    }

    setPreDeploymentState("loading");
    setPreDeploymentErrorMessage("");

    try {
      const currentTerraformDiagnostics = await onValidateTerraformDiagnostics();
      const result = addTerraformDiagnosticsToPreDeploymentAnalysis(
        await runAiPreDeploymentCheck(boardSnapshot.architectureJson),
        currentTerraformDiagnostics
      );
      setPreDeploymentAnalysis(result);
      setPreDeploymentFingerprint(boardSnapshot.fingerprint);
      setPreDeploymentState("idle");
    } catch (error) {
      setPreDeploymentState("error");
      setPreDeploymentErrorMessage(getApiErrorMessage(error, "배포 전 검사 중 오류가 발생했습니다."));
    }
  }

  async function startDeploymentReview(): Promise<void> {
    if (!canStartDeploymentReview) {
      return;
    }

    await runRequest(async () => {
      const savedArtifacts = await onPrepareDeploymentArtifacts();
      const snapshot = await loadDeploymentPanelSnapshot();

      applyDeploymentPanelSnapshot(snapshot);

      const deployment = await createDeployment({
        projectId,
        architectureId: savedArtifacts.architecture.id,
        terraformArtifactId: savedArtifacts.terraformArtifact.id,
        awsConnectionId: selectedAwsConnectionId
      });
      const prewarmedDeployment = await runDeploymentInit(deployment.id).catch(() => deployment);

      setDeployments((currentDeployments) => [prewarmedDeployment, ...currentDeployments]);
      setSelectedDeploymentId(prewarmedDeployment.id);
      setDeploymentPanelMode("records");
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

  function startDeploymentPanelResize(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    updateDeploymentDetailsWidthFromClientX(event.clientX);
    deploymentResizeCleanupRef.current?.();

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (pointerEvent: PointerEvent): void => {
      pointerEvent.preventDefault();
      updateDeploymentDetailsWidthFromClientX(pointerEvent.clientX);
    };
    const stopResize = (): void => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      deploymentResizeCleanupRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize, { once: true });
    window.addEventListener("pointercancel", stopResize, { once: true });
    deploymentResizeCleanupRef.current = stopResize;
  }

  function handleDeploymentPanelResizeKeyDown(
    event: ReactKeyboardEvent<HTMLDivElement>
  ): void {
    const step = event.shiftKey ? 10 : 4;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setDeploymentDetailsWidthPercent((currentPercent) =>
        clampNumber(
          currentPercent - step,
          DEPLOYMENT_EXPANDED_MIN_DETAILS_PERCENT,
          DEPLOYMENT_EXPANDED_MAX_DETAILS_PERCENT
        )
      );
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      setDeploymentDetailsWidthPercent((currentPercent) =>
        clampNumber(
          currentPercent + step,
          DEPLOYMENT_EXPANDED_MIN_DETAILS_PERCENT,
          DEPLOYMENT_EXPANDED_MAX_DETAILS_PERCENT
        )
      );
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setDeploymentDetailsWidthPercent(DEPLOYMENT_EXPANDED_MIN_DETAILS_PERCENT);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setDeploymentDetailsWidthPercent(DEPLOYMENT_EXPANDED_MAX_DETAILS_PERCENT);
    }
  }

  const renderPreDeploymentCheckSection = () => (
    <section className={styles.deploymentSection}>
      <div className={styles.deploymentSectionHeader}>
        <h3>배포 전 검사</h3>
        <button
          className={styles.deploymentSecondaryButton}
          disabled={preDeploymentState === "loading"}
          onClick={() => void runPreDeploymentCheck()}
          type="button"
        >
          <ShieldCheck size={16} aria-hidden="true" />
          {preDeploymentState === "loading" ? "검사 중" : "검사 실행"}
        </button>
      </div>

      {preDeploymentState === "loading" ? (
        <p className={styles.deploymentNotice}>검사 중입니다.</p>
      ) : null}
      {preDeploymentState === "error" ? (
        <p className={styles.deploymentError} role="alert">
          {preDeploymentErrorMessage}
        </p>
      ) : null}
      {hasStalePreDeploymentAnalysis ? (
        <p className={styles.deploymentStaleNotice}>보드 변경됨 · 다시 실행 필요</p>
      ) : null}
      {preDeploymentAnalysis !== null ? (
        <DeploymentPreDeploymentSummary analysis={preDeploymentAnalysis} />
      ) : (
        <p className={styles.deploymentHint}>현재 보드 기준으로 비용, 보안, 설정 위험을 확인합니다.</p>
      )}
    </section>
  );

  const renderSetupSection = () => (
    <section className={styles.deploymentSection}>
      <button
        className={styles.deploymentSecondaryButton}
        disabled={requestState === "loading"}
        onClick={saveDeploymentBaseline}
        type="button"
      >
        <DeploymentBaselineIcon size={16} aria-hidden="true" />
        배포 기준 저장
      </button>

      <div className={styles.deploymentField}>
        AWS 연결
        <SelectMenu
          ariaLabel="AWS 연결 선택"
          disabled={awsConnectionOptions.length === 0}
          emptyLabel="검증된 AWS 연결 없음"
          onChange={setSelectedAwsConnectionId}
          options={awsConnectionOptions}
          size={isDeploymentExpanded ? "large" : "regular"}
          value={selectedAwsConnectionId}
        />
      </div>

      <button
        className={styles.deploymentPrimaryButton}
        disabled={!canStartDeploymentReview}
        onClick={startDeploymentReview}
        type="button"
      >
        <DashboardIcon name="rocket" />
        배포 검토 시작
      </button>
    </section>
  );

  const renderRecordsSection = () => (
    <section className={styles.deploymentSection}>
      <div className={styles.deploymentSectionHeader}>
        <h3>Deployment records</h3>
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
          size={isDeploymentExpanded ? "large" : "regular"}
          value={selectedDeploymentId}
        />
      </div>

      {selectedDeployment ? (
        <>
          <DeploymentGateCard deployment={selectedDeployment} />
          <div className={styles.deploymentSummary}>
            <InfoRow label="Status" value={selectedDeployment.status} />
            <OptionalInfoRow label="Active stage" value={selectedDeployment.activeStage} />
            <OptionalInfoRow
              label="Started at"
              value={formatOptionalDate(selectedDeployment.startedAt)}
            />
            <OptionalInfoRow
              label="Completed at"
              value={formatOptionalDate(selectedDeployment.completedAt)}
            />
            <OptionalInfoRow label="Failed at" value={formatOptionalDate(selectedDeployment.failedAt)} />
            <OptionalInfoRow
              label="Cancel requested"
              value={formatOptionalDate(selectedDeployment.cancelRequestedAt)}
            />
            <OptionalInfoRow
              label="Cancelled at"
              value={formatOptionalDate(selectedDeployment.cancelledAt)}
            />
            <OptionalInfoRow label="Current plan" value={selectedDeployment.currentPlanArtifactId} />
            <InfoRow label="Blocked" value={selectedDeployment.isBlocked ? "yes" : "no"} />
            <OptionalInfoRow label="Blocked by" value={selectedDeployment.blockedBy} />
            <OptionalInfoRow label="Reason" value={selectedDeployment.blockedReason} />
            <InfoRow label="Approval" value={formatApprovalState(selectedDeployment)} />
            {selectedDeployment.planSummary ? (
              <PlanSummaryRows deployment={selectedDeployment} />
            ) : null}
            {selectedDeployment.approvedAt ? (
              <>
                <InfoRow label="Approved at" value={formatDate(selectedDeployment.approvedAt)} />
                <OptionalInfoRow
                  label="Approved plan"
                  value={selectedDeployment.approvedPlanArtifactId}
                />
                <OptionalInfoRow
                  label="tfplan hash"
                  value={formatShortHash(selectedDeployment.approvedTfplanHash)}
                />
                <OptionalInfoRow
                  label="Artifact hash"
                  value={formatShortHash(selectedDeployment.approvedTerraformArtifactHash)}
                />
                <OptionalInfoRow
                  label="AWS account"
                  value={selectedDeployment.approvedAwsAccountId}
                />
                <OptionalInfoRow
                  label="AWS region"
                  value={selectedDeployment.approvedAwsRegion}
                />
              </>
            ) : null}
            <OptionalInfoRow label="State object" value={selectedDeployment.stateObjectKey} />
            <OptionalInfoRow
              label="Result warning"
              value={selectedDeployment.resultWarningSummary}
            />
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

      {shouldShowApprovePlanButton ? (
        <button
          className={styles.deploymentPrimaryButton}
          disabled={!canApprovePlan}
          onClick={approveCurrentPlan}
          type="button"
        >
          <ClipboardCheck size={16} aria-hidden="true" />
          {deploymentActions.approvePlanLabel}
        </button>
      ) : null}

      {shouldShowPlanButton ? (
        <button
          className={styles.deploymentSecondaryButton}
          disabled={!canRunPlan}
          onClick={startTerraformPlan}
          type="button"
        >
          <DashboardIcon name="server" />
          {hasCurrentPlan ? "Terraform Plan 다시 실행" : "Terraform Plan 실행"}
        </button>
      ) : null}

      {shouldShowApplyButton ? (
        <button
          className={styles.deploymentPrimaryButton}
          disabled={!canApply}
          onClick={() => setShowApplyConfirmation(true)}
          type="button"
        >
          <DashboardIcon name="rocket" />
          Terraform Apply 실행
        </button>
      ) : null}

      {shouldShowDestroyPlanButton ? (
        <button
          className={styles.deploymentSecondaryButton}
          disabled={!canRunDestroyPlan}
          onClick={startTerraformDestroyPlan}
          type="button"
        >
          <Trash2 size={16} aria-hidden="true" />
          {selectedDeployment?.currentPlanOperation === "destroy"
            ? "Destroy Plan 다시 실행"
            : "Cleanup Destroy Plan 실행"}
        </button>
      ) : null}

      {shouldShowDestroyButton ? (
        <button
          className={styles.deploymentDangerButton}
          disabled={!canDestroy}
          onClick={() => setShowDestroyConfirmation(true)}
          type="button"
        >
          <Trash2 size={16} aria-hidden="true" />
          Terraform Destroy 실행
        </button>
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
    </section>
  );

  const renderLogsSection = () => (
    <section className={styles.deploymentSection}>
      <h3>Logs</h3>
      <DeploymentLogList logs={deploymentLogs} />
    </section>
  );

  const renderStatusMessages = () => (
    <>
      {requestState === "loading" ? <p className={styles.deploymentNotice}>요청을 처리하는 중입니다.</p> : null}
      {requestState === "error" ? (
        <p className={styles.deploymentError} role="alert">
          {errorMessage}
        </p>
      ) : null}
    </>
  );

  return (
    <div className={styles.deploymentPanel}>
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

      <div className={styles.deploymentPanelContent}>
        {compactDeploymentPanelMode === "setup" ? (
          <>
            {renderPreDeploymentCheckSection()}
            {renderSetupSection()}
          </>
        ) : null}

        {compactDeploymentPanelMode === "records" ? (
          <>
            {renderRecordsSection()}
            {renderResultsSection()}
          </>
        ) : null}

        {renderStatusMessages()}
      </div>

      {hasDeploymentRecords ? (
        <div className={styles.deploymentModeSwitch} role="group" aria-label="Deployment 화면 전환">
          <button
            className={`${styles.deploymentModeButton} ${
              compactDeploymentPanelMode === "setup" ? styles.deploymentModeButtonActive : ""
            }`}
            onClick={() => setDeploymentPanelMode("setup")}
            type="button"
          >
            배포 검토
          </button>
          <button
            className={`${styles.deploymentModeButton} ${
              compactDeploymentPanelMode === "records" ? styles.deploymentModeButtonActive : ""
            }`}
            onClick={() => setDeploymentPanelMode("records")}
            type="button"
          >
            Records
          </button>
        </div>
      ) : null}

      {isDeploymentExpanded ? (
        <div
          aria-label="Deployment console"
          aria-modal="true"
          className={styles.deploymentExpandedOverlay}
          role="dialog"
        >
          <div className={styles.deploymentExpandedShell}>
            <header className={styles.deploymentExpandedHeader}>
              <div>
                <p className={styles.projectEyebrow}>Deployment</p>
                <h2>{projectName}</h2>
                <span>{currentNodeCount} board nodes</span>
              </div>
              <button
                aria-label="Deployment 패널 닫기"
                className={styles.deploymentExpandButton}
                onClick={() => setIsDeploymentExpanded(false)}
                type="button"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </header>
            <div
              className={styles.deploymentExpandedGrid}
              ref={deploymentExpandedGridRef}
              style={deploymentExpandedGridStyle}
            >
              <div className={styles.deploymentExpandedDetails}>
                {renderPreDeploymentCheckSection()}
                {renderSetupSection()}
                {renderRecordsSection()}
                {renderResultsSection()}
                {renderStatusMessages()}
              </div>
              <div
                aria-label="Deployment 좌우 패널 크기 조절"
                aria-orientation="vertical"
                aria-valuemax={DEPLOYMENT_EXPANDED_MAX_DETAILS_PERCENT}
                aria-valuemin={DEPLOYMENT_EXPANDED_MIN_DETAILS_PERCENT}
                aria-valuenow={Math.round(deploymentDetailsWidthPercent)}
                className={styles.deploymentExpandedResizeHandle}
                onKeyDown={handleDeploymentPanelResizeKeyDown}
                onPointerDown={startDeploymentPanelResize}
                role="separator"
                tabIndex={0}
              />
              <aside className={styles.deploymentExpandedLogs}>
                {renderLogsSection()}
              </aside>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DeploymentPreDeploymentSummary({
  analysis
}: {
  readonly analysis: AiPreDeploymentAnalysisResult;
}) {
  const failCount = countChecklistItems(analysis, "fail");
  const warningCount = countChecklistItems(analysis, "warning");
  const gateLevel = getPreDeploymentGateLevel(analysis);
  const visibleFindings = analysis.findings.slice(0, 3);
  const hiddenFindingCount = Math.max(0, analysis.findings.length - visibleFindings.length);

  return (
    <div className={styles.deploymentPreflightSummary} data-level={gateLevel}>
      <div className={styles.deploymentGateHeader}>
        <span className={styles.deploymentGateBadge}>{gateLevel.toUpperCase()}</span>
        <strong>Pre-Deployment Gate</strong>
      </div>
      <p>{analysis.summary}</p>
      <div className={styles.deploymentPreflightStats} aria-label="배포 전 검사 요약">
        <span>
          <strong>{analysis.findings.length}</strong>
          Findings
        </span>
        <span>
          <strong>{failCount}</strong>
          Fail
        </span>
        <span>
          <strong>{warningCount}</strong>
          Warning
        </span>
      </div>
      {visibleFindings.length > 0 ? (
        <ul className={styles.deploymentPreflightFindings}>
          {visibleFindings.map((finding) => (
            <DeploymentPreDeploymentFindingItem finding={finding} key={finding.id} />
          ))}
        </ul>
      ) : (
        <p className={styles.deploymentHint}>표시할 Check Finding이 없습니다.</p>
      )}
      {hiddenFindingCount > 0 ? (
        <p className={styles.deploymentPreflightMore}>외 {hiddenFindingCount}개 항목</p>
      ) : null}
    </div>
  );
}

function DeploymentPreDeploymentFindingItem({ finding }: { readonly finding: CheckFinding }) {
  return (
    <li data-severity={finding.severity}>
      <span>{finding.severity.toUpperCase()}</span>
      <strong>{finding.title}</strong>
      {finding.resourceId ? <em>{finding.resourceId}</em> : null}
    </li>
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

function formatOptionalDate(value: string | null): string {
  return value ? formatDate(value) : "없음";
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
