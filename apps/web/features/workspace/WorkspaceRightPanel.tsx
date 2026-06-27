"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, UIEvent } from "react";
import type {
  AwsConnection,
  Deployment,
  DeploymentLog,
  DiagramNode,
  ProjectDetailsResponse,
  TerraformArtifact,
  TerraformDiagnostic
} from "@sketchcatch/types";
import {
  AlertCircle,
  ArrowLeft,
  ClipboardCheck,
  Code2,
  FileCode2,
  GitBranch,
  ListTree,
  Play,
  Rocket,
  Trash2,
  X
} from "lucide-react";
import { DashboardIcon } from "../../components/dashboard/dashboard-icons";
import { getApiErrorMessage } from "../../lib/api-client";
import { ParameterInputPanel } from "../parameter-input";
import type { DiagramEditorPanelContext } from "../diagram-editor";
import {
  createDeployment,
  generateTerraformCode,
  getProjectDetails,
  listAwsConnections,
  listDeploymentLogs,
  listDeployments,
  runDeploymentInit,
  syncTerraformToDiagram,
  validateTerraformCode
} from "./api";
import styles from "./workspace.module.css";

type WorkspaceRightPanelView = "resource" | "terraform" | "deployment";
type RequestState = "idle" | "loading" | "error";

export type WorkspaceRightPanelProps = {
  readonly context: DiagramEditorPanelContext;
  readonly projectId: string;
  readonly projectName: string;
};

export function WorkspaceRightPanel({ context, projectId, projectName }: WorkspaceRightPanelProps) {
  const [activeView, setActiveView] = useState<WorkspaceRightPanelView>("resource");
  const [pendingView, setPendingView] = useState<WorkspaceRightPanelView | null>(null);
  const [hasUnsavedTerraformChanges, setHasUnsavedTerraformChanges] = useState(false);
  const [showTerraformLeaveDialog, setShowTerraformLeaveDialog] = useState(false);
  const [terraformSaveRequestId, setTerraformSaveRequestId] = useState(0);

  function requestView(nextView: WorkspaceRightPanelView): void {
    if (nextView === activeView) {
      return;
    }

    if (activeView === "terraform" && hasUnsavedTerraformChanges) {
      setPendingView(nextView);
      setShowTerraformLeaveDialog(true);
      return;
    }

    setActiveView(nextView);
  }

  function continueTerraformEditing(): void {
    setPendingView(null);
    setShowTerraformLeaveDialog(false);
  }

  function discardTerraformChanges(): void {
    setHasUnsavedTerraformChanges(false);
    setShowTerraformLeaveDialog(false);
    setActiveView(pendingView ?? "resource");
    setPendingView(null);
  }

  function saveTerraformBeforeLeaving(): void {
    setTerraformSaveRequestId((requestId) => requestId + 1);
  }

  function handleTerraformExternalSaveComplete(saved: boolean): void {
    if (!saved || !showTerraformLeaveDialog) {
      return;
    }

    setHasUnsavedTerraformChanges(false);
    setShowTerraformLeaveDialog(false);
    setActiveView(pendingView ?? "resource");
    setPendingView(null);
  }

  useEffect(() => {
    if (context.inspectedNodeId) {
      setActiveView("terraform");
    }
  }, [context.inspectedNodeId]);

  return (
    <aside className={styles.rightPanelShell}>
      <div className={styles.rightPanelToolbar}>
        <div className={styles.panelModeToggle} role="group" aria-label="패널 모드">
          <button
            aria-pressed={activeView === "resource"}
            className={activeView === "resource" ? styles.panelModeButtonActive : styles.panelModeButton}
            onClick={() => requestView("resource")}
            title="리소스 모드"
            type="button"
          >
            <ListTree size={18} aria-hidden="true" />
          </button>
          <button
            aria-pressed={activeView === "terraform"}
            className={activeView === "terraform" ? styles.panelModeButtonActive : styles.panelModeButton}
            onClick={() => requestView("terraform")}
            title="Terraform 모드"
            type="button"
          >
            <Code2 size={18} aria-hidden="true" />
          </button>
        </div>
        <button
          aria-pressed={activeView === "deployment"}
          className={activeView === "deployment" ? styles.panelIconButtonActive : styles.panelIconButton}
          onClick={() => requestView("deployment")}
          title="배포"
          type="button"
        >
          <Rocket size={18} aria-hidden="true" />
        </button>
      </div>

      {activeView === "resource" ? (
        <ParameterInputPanel {...context} />
      ) : activeView === "terraform" ? (
        <TerraformCodePanel
          context={context}
          externalSaveRequestId={terraformSaveRequestId}
          onDirtyChange={setHasUnsavedTerraformChanges}
          onExternalSaveComplete={handleTerraformExternalSaveComplete}
        />
      ) : (
        <DeploymentPanel
          currentNodeCount={context.nodes.length}
          projectId={projectId}
          projectName={projectName}
        />
      )}

      {showTerraformLeaveDialog ? (
        <TerraformLeaveDialog
          onContinue={continueTerraformEditing}
          onDiscard={discardTerraformChanges}
          onSave={saveTerraformBeforeLeaving}
        />
      ) : null}
    </aside>
  );
}

function TerraformCodePanel({
  context,
  externalSaveRequestId,
  onDirtyChange,
  onExternalSaveComplete
}: {
  readonly context: DiagramEditorPanelContext;
  readonly externalSaveRequestId: number;
  readonly onDirtyChange: (isDirty: boolean) => void;
  readonly onExternalSaveComplete: (saved: boolean) => void;
}) {
  const [terraformCode, setTerraformCode] = useState("");
  const [diagnostics, setDiagnostics] = useState<TerraformDiagnostic[]>([]);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("main.tf");
  const [hasLocalEdits, setHasLocalEdits] = useState(false);
  const [saveBanner, setSaveBanner] = useState<TerraformSaveBanner | null>(null);
  const codeRequestIdRef = useRef(0);
  const latestDiagramFingerprintRef = useRef("");
  const latestExternalSaveRequestIdRef = useRef(externalSaveRequestId);
  const lineNumberRef = useRef<HTMLOListElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const hasTerraformCode = terraformCode.trim().length > 0;
  const hasErrorDiagnostics = diagnostics.some((diagnostic) => diagnostic.severity === "error");
  const firstErrorDiagnostic = diagnostics.find((diagnostic) => diagnostic.severity === "error") ?? null;
  const currentDiagramFingerprint = useMemo(() => toDiagramFingerprint(context.diagram), [context.diagram]);
  const terraformBlocks = useMemo(() => parseTerraformBlocks(terraformCode), [terraformCode]);
  const selectedNode = useMemo(
    () => context.nodes.find((node) => node.id === context.selectedNodeId) ?? null,
    [context.nodes, context.selectedNodeId]
  );
  const inspectedNode = useMemo(
    () => context.nodes.find((node) => node.id === context.inspectedNodeId) ?? null,
    [context.inspectedNodeId, context.nodes]
  );
  const selectedBlock = useMemo(
    () => findTerraformBlockForNode(terraformBlocks, selectedNode),
    [selectedNode, terraformBlocks]
  );
  const inspectedBlock = useMemo(
    () => findTerraformBlockForNode(terraformBlocks, inspectedNode),
    [inspectedNode, terraformBlocks]
  );
  const isResourceCodeMode = Boolean(inspectedNode);
  const displayedTerraformCode = inspectedBlock?.code ?? terraformCode;
  const lineNumbers = useMemo(
    () => Array.from({ length: Math.max(1, displayedTerraformCode.split(/\r\n|\r|\n/).length) }, (_, index) => index + 1),
    [displayedTerraformCode]
  );

  const runRequest = useCallback(async (request: () => Promise<void>, fallbackMessage: string) => {
    setRequestState("loading");
    setErrorMessage("");

    try {
      await request();
      setRequestState("idle");
    } catch (error) {
      setRequestState("error");
      setErrorMessage(getApiErrorMessage(error, fallbackMessage));
    }
  }, []);

  const refreshTerraformCode = useCallback(
    async (diagramFingerprint: string) => {
      const requestId = codeRequestIdRef.current + 1;
      codeRequestIdRef.current = requestId;

      await runRequest(async () => {
        const generatedCode = await generateTerraformCode(context.diagram);

        if (requestId !== codeRequestIdRef.current) {
          return;
        }

        setTerraformCode(generatedCode);
        setDiagnostics([]);
        setHasLocalEdits(false);
        setSaveBanner(null);
        setStatusMessage("그래프 기준으로 동기화됨");
        latestDiagramFingerprintRef.current = diagramFingerprint;
        onDirtyChange(false);
      }, "Terraform 코드를 생성하지 못했습니다.");
    },
    [context.diagram, onDirtyChange, runRequest]
  );

  const saveCodeToDiagram = useCallback(async (): Promise<boolean> => {
    if (!hasTerraformCode || requestState === "loading") {
      return false;
    }

    let saved = false;

    await runRequest(async () => {
      const validationResult = await validateTerraformCode(terraformCode);
      setDiagnostics(validationResult.diagnostics);

      const validationError = validationResult.diagnostics.find(
        (diagnostic) => diagnostic.severity === "error"
      );

      if (validationError) {
        setSaveBanner({
          kind: "error",
          line: validationError.line,
          message: validationError.message
        });
        setStatusMessage("저장 실패");
        return;
      }

      const syncResult = await syncTerraformToDiagram({
        diagramJson: context.diagram,
        terraformCode
      });
      setDiagnostics(syncResult.diagnostics);

      const syncError = syncResult.diagnostics.find((diagnostic) => diagnostic.severity === "error");

      if (syncError) {
        setSaveBanner({
          kind: "error",
          line: syncError.line,
          message: syncError.message
        });
        setStatusMessage("저장 실패");
        return;
      }

      context.applyDiagramJson(syncResult.diagramJson);
      latestDiagramFingerprintRef.current = toDiagramFingerprint(syncResult.diagramJson);
      setHasLocalEdits(false);
      setSaveBanner(null);
      setStatusMessage("저장됨");
      onDirtyChange(false);
      saved = true;
    }, "Terraform 코드를 저장하지 못했습니다.");

    return saved;
  }, [
    context,
    hasTerraformCode,
    onDirtyChange,
    requestState,
    runRequest,
    terraformCode
  ]);

  useEffect(() => {
    if (latestExternalSaveRequestIdRef.current === externalSaveRequestId) {
      return;
    }

    latestExternalSaveRequestIdRef.current = externalSaveRequestId;
    void saveCodeToDiagram().then(onExternalSaveComplete);
  }, [externalSaveRequestId, onExternalSaveComplete, saveCodeToDiagram]);

  useEffect(() => {
    if (context.nodes.length === 0 || hasLocalEdits) {
      return;
    }

    if (latestDiagramFingerprintRef.current === currentDiagramFingerprint && terraformCode.length > 0) {
      return;
    }

    const timerId = setTimeout(() => {
      void refreshTerraformCode(currentDiagramFingerprint);
    }, 250);

    return () => clearTimeout(timerId);
  }, [
    context.nodes.length,
    currentDiagramFingerprint,
    hasLocalEdits,
    refreshTerraformCode,
    terraformCode.length
  ]);

  useEffect(() => {
    onDirtyChange(hasLocalEdits);
  }, [hasLocalEdits, onDirtyChange]);

  useEffect(() => {
    if (isResourceCodeMode || !selectedBlock || !textareaRef.current) {
      return;
    }

    const textarea = textareaRef.current;
    const lineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight) || 20;
    textarea.scrollTop = Math.max(0, (selectedBlock.startLine - 2) * lineHeight);
    textarea.setSelectionRange(selectedBlock.startOffset, selectedBlock.endOffset);
    textarea.focus({ preventScroll: true });

    if (lineNumberRef.current) {
      lineNumberRef.current.scrollTop = textarea.scrollTop;
    }
  }, [isResourceCodeMode, selectedBlock]);

  function handleCodeScroll(event: UIEvent<HTMLTextAreaElement>): void {
    if (lineNumberRef.current) {
      lineNumberRef.current.scrollTop = event.currentTarget.scrollTop;
    }
  }

  function handleCodeChange(nextCode: string): void {
    if (inspectedBlock) {
      setTerraformCode(
        `${terraformCode.slice(0, inspectedBlock.startOffset)}${nextCode}${terraformCode.slice(
          inspectedBlock.endOffset
        )}`
      );
    } else {
      setTerraformCode(nextCode);
    }

    setHasLocalEdits(true);
    setSaveBanner({ kind: "dirty" });
    setStatusMessage("수정 중");
  }

  function handleCodeKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void saveCodeToDiagram();
    }
  }

  function handleSeeMore(): void {
    document.getElementById("terraform-issues")?.scrollIntoView({ block: "nearest" });
  }

  async function validateDisplayedCode(): Promise<void> {
    if (!displayedTerraformCode.trim() || requestState === "loading") {
      return;
    }

    await runRequest(async () => {
      const validationResult = await validateTerraformCode(displayedTerraformCode);
      setDiagnostics(validationResult.diagnostics);
      setStatusMessage(validationResult.diagnostics.length === 0 ? "검증 완료" : "진단 확인 필요");
    }, "Terraform 코드를 검증하지 못했습니다.");
  }

  return (
    <div className={styles.terraformPanel}>
      {isResourceCodeMode ? (
        <header className={styles.resourceCodeHeader}>
          <div className={styles.resourceCodeTitle}>
            <button
              aria-label="전체 Terraform 코드로 돌아가기"
              className={styles.resourceCodeBackButton}
              onClick={context.closeInspectedNode}
              type="button"
            >
              <ArrowLeft size={18} aria-hidden="true" />
            </button>
            <span>{inspectedNode?.label ?? inspectedNode?.parameters?.resourceName ?? "Resource"}</span>
          </div>
          <button
            aria-label="리소스 코드 닫기"
            className={styles.resourceCodeCloseButton}
            onClick={context.closeInspectedNode}
            type="button"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>
      ) : (
        <header className={styles.terraformTopBar}>
          <div className={styles.terraformFileChip}>
            <FileCode2 size={16} aria-hidden="true" />
            <span>main.tf</span>
          </div>
          <span className={styles.terraformShortcut}>Ctrl+S</span>
        </header>
      )}

      {isResourceCodeMode ? (
        <div className={styles.resourceActionBar}>
          <button className={styles.resourceActionPrimary} disabled type="button" title="리소스 단위 plan API 연결 예정">
            <Play size={16} aria-hidden="true" />
            Plan
          </button>
          <button
            className={styles.resourceActionSecondary}
            disabled={requestState === "loading" || !displayedTerraformCode.trim()}
            onClick={validateDisplayedCode}
            type="button"
          >
            <ClipboardCheck size={16} aria-hidden="true" />
            Validate
          </button>
          <button className={styles.resourceActionSecondary} disabled type="button" title="리소스 단위 apply API 연결 예정">
            <Rocket size={16} aria-hidden="true" />
            Apply
          </button>
          <button className={styles.resourceActionDanger} disabled type="button" title="리소스 단위 destroy API 연결 예정">
            <Trash2 size={16} aria-hidden="true" />
            Destroy
          </button>
        </div>
      ) : null}

      <div className={styles.terraformStatusBar}>
        <span className={hasLocalEdits ? styles.terraformStatusEdited : styles.terraformStatusSynced}>
          {statusMessage}
        </span>
        <span>{isResourceCodeMode ? "resource code" : `${context.nodes.length} nodes`}</span>
      </div>

      {saveBanner ? (
        <div className={saveBanner.kind === "error" ? styles.terraformSaveBannerError : styles.terraformSaveBanner}>
          <span>
            {saveBanner.kind === "error"
              ? `Unable to save. There is an issue${saveBanner.line ? ` on line ${saveBanner.line}` : ""}.`
              : "You have unsaved changes. Press CTRL+S to save"}
          </span>
          <button onClick={handleSeeMore} type="button">
            See more
          </button>
        </div>
      ) : null}

      <div className={styles.terraformEditorFrame}>
        <ol ref={lineNumberRef} className={styles.terraformLineNumbers} aria-hidden="true">
          {lineNumbers.map((lineNumber) => (
            <li key={lineNumber}>{lineNumber}</li>
          ))}
        </ol>
        <textarea
          ref={textareaRef}
          aria-label="Terraform 코드"
          className={styles.terraformTextarea}
          onChange={(event) => handleCodeChange(event.target.value)}
          onKeyDown={handleCodeKeyDown}
          onScroll={handleCodeScroll}
          placeholder={`resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}`}
          spellCheck={false}
          value={displayedTerraformCode}
        />
      </div>

      <section className={styles.terraformDiagnostics} aria-live="polite" id="terraform-issues">
        <div className={styles.terraformDiagnosticsHeader}>
          {firstErrorDiagnostic ? (
            <AlertCircle size={15} aria-hidden="true" />
          ) : (
            <GitBranch size={15} aria-hidden="true" />
          )}
          <h3>Issues</h3>
          <span className={hasErrorDiagnostics ? styles.terraformIssueCountError : styles.terraformIssueCount}>
            {diagnostics.length}
          </span>
        </div>

        {requestState === "loading" ? <p className={styles.terraformNotice}>저장 중입니다.</p> : null}
        {requestState === "error" ? (
          <p className={styles.terraformError} role="alert">
            {errorMessage}
          </p>
        ) : null}
        {diagnostics.length === 0 && requestState !== "loading" && requestState !== "error" ? (
          <p className={styles.terraformEmpty}>표시할 진단이 없습니다.</p>
        ) : null}
        {diagnostics.length > 0 ? (
          <ol className={styles.terraformDiagnosticList}>
            {diagnostics.map((diagnostic, index) => (
              <li key={`${diagnostic.code ?? diagnostic.message}-${index}`} data-severity={diagnostic.severity}>
                <strong>{formatTerraformDiagnosticTitle(diagnostic)}</strong>
                <span>{diagnostic.message}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </section>
    </div>
  );
}

type TerraformSaveBanner =
  | {
      readonly kind: "dirty";
    }
  | {
      readonly kind: "error";
      readonly line?: number | undefined;
      readonly message: string;
    };

function TerraformLeaveDialog({
  onContinue,
  onDiscard,
  onSave
}: {
  readonly onContinue: () => void;
  readonly onDiscard: () => void;
  readonly onSave: () => void;
}) {
  return (
    <div className={styles.terraformDialogBackdrop} role="presentation">
      <section
        aria-labelledby="terraform-leave-title"
        aria-modal="true"
        className={styles.terraformDialog}
        role="dialog"
      >
        <h2 id="terraform-leave-title">Save changes before leaving?</h2>
        <p>You have unsaved Terraform changes that will be lost if you leave without saving.</p>
        <p>Do you want to save your changes?</p>
        <div className={styles.terraformDialogActions}>
          <button className={styles.terraformDialogDangerButton} onClick={onDiscard} type="button">
            Discard Changes
          </button>
          <button className={styles.terraformDialogSecondaryButton} onClick={onContinue} type="button">
            Continue editing
          </button>
          <button className={styles.terraformDialogPrimaryButton} onClick={onSave} type="button">
            Save Changes
          </button>
        </div>
      </section>
    </div>
  );
}

function DeploymentPanel({
  currentNodeCount,
  projectId,
  projectName
}: {
  readonly currentNodeCount: number;
  readonly projectId: string;
  readonly projectName: string;
}) {
  const [projectDetails, setProjectDetails] = useState<ProjectDetailsResponse | null>(null);
  const [awsConnections, setAwsConnections] = useState<AwsConnection[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [deploymentLogs, setDeploymentLogs] = useState<DeploymentLog[]>([]);
  const [selectedArchitectureId, setSelectedArchitectureId] = useState("");
  const [selectedTerraformArtifactId, setSelectedTerraformArtifactId] = useState("");
  const [selectedAwsConnectionId, setSelectedAwsConnectionId] = useState("");
  const [selectedDeploymentId, setSelectedDeploymentId] = useState("");
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const verifiedAwsConnections = useMemo(
    () => awsConnections.filter((connection) => connection.status === "verified"),
    [awsConnections]
  );
  const terraformArtifacts = useMemo(
    () =>
      (projectDetails?.assets ?? []).filter(
        (asset): asset is TerraformArtifact =>
          asset.assetType === "terraform_file" && typeof asset.architectureId === "string"
      ),
    [projectDetails]
  );
  const architectureTerraformArtifacts = useMemo(
    () =>
      selectedArchitectureId
        ? terraformArtifacts.filter((artifact) => artifact.architectureId === selectedArchitectureId)
        : terraformArtifacts,
    [selectedArchitectureId, terraformArtifacts]
  );
  const selectedDeployment = useMemo(
    () => deployments.find((deployment) => deployment.id === selectedDeploymentId) ?? null,
    [deployments, selectedDeploymentId]
  );
  const canCreateDeployment =
    selectedArchitectureId.length > 0 &&
    selectedTerraformArtifactId.length > 0 &&
    selectedAwsConnectionId.length > 0 &&
    requestState !== "loading";
  const canRunInit =
    Boolean(selectedDeployment) &&
    selectedDeployment?.status !== "RUNNING" &&
    requestState !== "loading";

  useEffect(() => {
    let cancelled = false;

    async function loadDeploymentData(): Promise<void> {
      await runRequest(async () => {
        const [nextProjectDetails, nextConnections, nextDeployments] = await Promise.all([
          getProjectDetails(projectId),
          listAwsConnections(),
          listDeployments(projectId)
        ]);

        if (cancelled) {
          return;
        }

        setProjectDetails(nextProjectDetails);
        setAwsConnections(nextConnections);
        setDeployments(nextDeployments);

        const latestArchitecture = nextProjectDetails.architectures[0];
        const latestTerraformArtifact = nextProjectDetails.assets.find(
          (asset): asset is TerraformArtifact =>
            asset.assetType === "terraform_file" &&
            asset.architectureId === latestArchitecture?.id
        );
        const latestVerifiedConnection = nextConnections.find(
          (connection) => connection.status === "verified"
        );
        const latestDeployment = nextDeployments[0];

        setSelectedArchitectureId((currentId) => currentId || latestArchitecture?.id || "");
        setSelectedTerraformArtifactId((currentId) => currentId || latestTerraformArtifact?.id || "");
        setSelectedAwsConnectionId((currentId) => currentId || latestVerifiedConnection?.id || "");
        setSelectedDeploymentId((currentId) => currentId || latestDeployment?.id || "");
      }, "배포 정보를 불러오지 못했습니다.");
    }

    void loadDeploymentData();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!selectedDeploymentId) {
      setDeploymentLogs([]);
      return;
    }

    let cancelled = false;

    async function loadLogs(): Promise<void> {
      await runRequest(async () => {
        const logs = await listDeploymentLogs(selectedDeploymentId);

        if (!cancelled) {
          setDeploymentLogs(logs);
        }
      }, "배포 로그를 불러오지 못했습니다.");
    }

    void loadLogs();

    return () => {
      cancelled = true;
    };
  }, [selectedDeploymentId]);

  useEffect(() => {
    if (
      selectedTerraformArtifactId &&
      architectureTerraformArtifacts.some((artifact) => artifact.id === selectedTerraformArtifactId)
    ) {
      return;
    }

    setSelectedTerraformArtifactId(architectureTerraformArtifacts[0]?.id ?? "");
  }, [architectureTerraformArtifacts, selectedTerraformArtifactId]);

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

  async function createProjectDeployment(): Promise<void> {
    if (!canCreateDeployment) {
      return;
    }

    await runRequest(async () => {
      const deployment = await createDeployment({
        projectId,
        architectureId: selectedArchitectureId,
        terraformArtifactId: selectedTerraformArtifactId,
        awsConnectionId: selectedAwsConnectionId
      });

      setDeployments((currentDeployments) => [deployment, ...currentDeployments]);
      setSelectedDeploymentId(deployment.id);
      setDeploymentLogs([]);
    }, "Deployment를 생성하지 못했습니다.");
  }

  async function startTerraformInit(): Promise<void> {
    if (!selectedDeployment || !canRunInit) {
      return;
    }

    await runRequest(async () => {
      const deployment = await runDeploymentInit(selectedDeployment.id);
      setDeployments((currentDeployments) =>
        currentDeployments.map((currentDeployment) =>
          currentDeployment.id === deployment.id ? deployment : currentDeployment
        )
      );
      setSelectedDeploymentId(deployment.id);
      setDeploymentLogs(await listDeploymentLogs(deployment.id));
    }, "Terraform init을 시작하지 못했습니다.");
  }

  async function refreshDeploymentPanel(): Promise<void> {
    await runRequest(async () => {
      const [nextDeployments, nextLogs] = await Promise.all([
        listDeployments(projectId),
        selectedDeploymentId ? listDeploymentLogs(selectedDeploymentId) : Promise.resolve([])
      ]);

      setDeployments(nextDeployments);
      setDeploymentLogs(nextLogs);
    }, "배포 상태를 새로고침하지 못했습니다.");
  }

  return (
    <div className={styles.deploymentPanel}>
      <header className={styles.deploymentHeader}>
        <p className={styles.projectEyebrow}>Deployment</p>
        <h2>{projectName}</h2>
        <span>{currentNodeCount} board nodes</span>
      </header>

      <section className={styles.deploymentSection}>
        <label className={styles.deploymentField}>
          Architecture snapshot
          <select
            onChange={(event) => setSelectedArchitectureId(event.target.value)}
            value={selectedArchitectureId}
          >
            {(projectDetails?.architectures ?? []).length === 0 ? (
              <option value="">저장된 snapshot 없음</option>
            ) : (
              projectDetails?.architectures.map((architecture) => (
                <option key={architecture.id} value={architecture.id}>
                  v{architecture.version} | {architecture.source} | {formatDate(architecture.createdAt)}
                </option>
              ))
            )}
          </select>
        </label>

        <label className={styles.deploymentField}>
          Terraform artifact
          <select
            disabled={architectureTerraformArtifacts.length === 0}
            onChange={(event) => setSelectedTerraformArtifactId(event.target.value)}
            value={selectedTerraformArtifactId}
          >
            {architectureTerraformArtifacts.length === 0 ? (
              <option value="">Terraform artifact 없음</option>
            ) : (
              architectureTerraformArtifacts.map((artifact) => (
                <option key={artifact.id} value={artifact.id}>
                  {artifact.fileName} | {formatDate(artifact.createdAt)}
                </option>
              ))
            )}
          </select>
        </label>

        <label className={styles.deploymentField}>
          AWS connection
          <select
            disabled={verifiedAwsConnections.length === 0}
            onChange={(event) => setSelectedAwsConnectionId(event.target.value)}
            value={selectedAwsConnectionId}
          >
            {verifiedAwsConnections.length === 0 ? (
              <option value="">검증된 AWS 연결 없음</option>
            ) : (
              verifiedAwsConnections.map((connection) => (
                <option key={connection.id} value={connection.id}>
                  {connection.accountId} | {connection.region}
                </option>
              ))
            )}
          </select>
        </label>

        <button
          className={styles.deploymentPrimaryButton}
          disabled={!canCreateDeployment}
          onClick={createProjectDeployment}
          type="button"
        >
          <DashboardIcon name="rocket" />
          Deployment 생성
        </button>

        {!selectedArchitectureId ? <p className={styles.deploymentHint}>먼저 architecture snapshot이 필요합니다.</p> : null}
        {!selectedTerraformArtifactId ? <p className={styles.deploymentHint}>Terraform artifact가 있어야 init을 실행할 수 있습니다.</p> : null}
        {!selectedAwsConnectionId ? (
          <p className={styles.deploymentHint}>환경설정에서 AWS 계정을 연결하고 검증해주세요.</p>
        ) : null}
      </section>

      <section className={styles.deploymentSection}>
        <div className={styles.deploymentSectionHeader}>
          <h3>Deployment records</h3>
          <button
            className={styles.deploymentSecondaryButton}
            disabled={requestState === "loading"}
            onClick={refreshDeploymentPanel}
            type="button"
          >
            새로고침
          </button>
        </div>

        <label className={styles.deploymentField}>
          실행 기록
          <select
            disabled={deployments.length === 0}
            onChange={(event) => setSelectedDeploymentId(event.target.value)}
            value={selectedDeploymentId}
          >
            {deployments.length === 0 ? (
              <option value="">Deployment 없음</option>
            ) : (
              deployments.map((deployment) => (
                <option key={deployment.id} value={deployment.id}>
                  {deployment.status} | {formatDate(deployment.createdAt)}
                </option>
              ))
            )}
          </select>
        </label>

        {selectedDeployment ? (
          <div className={styles.deploymentSummary}>
            <InfoRow label="Status" value={selectedDeployment.status} />
            <InfoRow label="Blocked" value={selectedDeployment.isBlocked ? "yes" : "no"} />
            <InfoRow label="Error" value={selectedDeployment.errorSummary ?? "없음"} />
          </div>
        ) : null}

        <button
          className={styles.deploymentPrimaryButton}
          disabled={!canRunInit}
          onClick={startTerraformInit}
          type="button"
        >
          <DashboardIcon name="server" />
          Terraform init 실행
        </button>
      </section>

      <section className={styles.deploymentSection}>
        <h3>Logs</h3>
        {deploymentLogs.length === 0 ? (
          <p className={styles.deploymentHint}>아직 표시할 로그가 없습니다.</p>
        ) : (
          <ol className={styles.deploymentLogList}>
            {deploymentLogs.map((log) => (
              <li key={log.id}>
                <span>{log.level}</span>
                <p>{log.message}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      {requestState === "loading" ? <p className={styles.deploymentNotice}>요청을 처리하는 중입니다.</p> : null}
      {requestState === "error" ? (
        <p className={styles.deploymentError} role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

function toDiagramFingerprint(value: unknown): string {
  return JSON.stringify(value);
}

type TerraformBlockLocation = {
  readonly address: string;
  readonly blockType: "resource" | "data";
  readonly code: string;
  readonly endLine: number;
  readonly endOffset: number;
  readonly name: string;
  readonly startLine: number;
  readonly startOffset: number;
  readonly terraformType: string;
};

function findTerraformBlockForNode(
  blocks: readonly TerraformBlockLocation[],
  node: DiagramNode | null
): TerraformBlockLocation | null {
  const address = toNodeTerraformAddress(node);

  if (!address) {
    return null;
  }

  return blocks.find((block) => block.address === address) ?? null;
}

function toNodeTerraformAddress(node: DiagramNode | null): string | null {
  const parameters = node?.parameters;
  const resourceType = parameters?.resourceType?.trim();
  const resourceName = parameters?.resourceName?.trim();

  if (!resourceType || !resourceName) {
    return null;
  }

  return `${resourceType}.${resourceName}`;
}

function parseTerraformBlocks(terraformCode: string): TerraformBlockLocation[] {
  const blocks: TerraformBlockLocation[] = [];
  const lines = terraformCode.split(/\r\n|\r|\n/);
  const lineOffsets: number[] = [];
  let offset = 0;

  for (let index = 0; index < lines.length; index += 1) {
    lineOffsets.push(offset);
    offset += (lines[index] ?? "").length + 1;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const headerMatch = line.match(/^\s*(resource|data)\s+"([^"]+)"\s+"([^"]+)"\s*\{/);

    if (!headerMatch) {
      continue;
    }

    const startLine = index + 1;
    const startOffset = lineOffsets[index] ?? 0;
    let depth = countBraceDelta(line);
    let endIndex = index;
    let endOffset = startOffset + line.length;

    for (let scanIndex = index + 1; scanIndex < lines.length && depth > 0; scanIndex += 1) {
      const scanLine = lines[scanIndex] ?? "";
      depth += countBraceDelta(scanLine);
      endIndex = scanIndex;
      endOffset = (lineOffsets[scanIndex] ?? 0) + scanLine.length;
    }

    const blockType = headerMatch[1] as "resource" | "data";
    const terraformType = headerMatch[2] ?? "";
    const name = headerMatch[3] ?? "";

    blocks.push({
      address: `${terraformType}.${name}`,
      blockType,
      code: terraformCode.slice(startOffset, endOffset),
      endLine: endIndex + 1,
      endOffset,
      name,
      startLine,
      startOffset,
      terraformType
    });

    index = endIndex;
  }

  return blocks;
}

function countBraceDelta(line: string): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (const character of line) {
    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      continue;
    }

    if (character === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
    }
  }

  return depth;
}

function formatTerraformDiagnosticTitle(diagnostic: TerraformDiagnostic): string {
  const location = diagnostic.line ? `line ${diagnostic.line}` : "Terraform";
  const resource = diagnostic.resourceAddress ? ` | ${diagnostic.resourceAddress}` : "";
  return `${diagnostic.severity.toUpperCase()} | ${location}${resource}`;
}

function InfoRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
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
