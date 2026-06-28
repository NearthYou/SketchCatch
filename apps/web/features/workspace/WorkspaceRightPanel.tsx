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
  Box,
  ChevronDown,
  ClipboardCheck,
  Code2,
  FileCode2,
  GitBranch,
  ListTree,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Rocket,
  Trash2,
  X
} from "lucide-react";
import { DashboardIcon } from "../../components/dashboard/dashboard-icons";
import { getApiErrorMessage } from "../../lib/api-client";
import type { DiagramEditorPanelContext } from "../diagram-editor";
import { ParameterInputPanel } from "../parameter-input";
import {
  approveDeploymentPlan,
  createDeployment,
  generateTerraformCode,
  getProjectDetails,
  listAwsConnections,
  listDeploymentLogs,
  listDeployments,
  runDeploymentPlan,
  syncTerraformToDiagram,
  validateTerraformCode
} from "./api";
import styles from "./workspace.module.css";

type WorkspaceRightPanelView = "resource" | "terraform" | "issues" | "deployment";
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
  const [terraformDiagnostics, setTerraformDiagnostics] = useState<TerraformDiagnostic[]>([]);
  const hasTerraformIssueErrors = terraformDiagnostics.some((diagnostic) => diagnostic.severity === "error");

  const requestView = useCallback((nextView: WorkspaceRightPanelView): void => {
    if (nextView === activeView) {
      return;
    }

    if (
      (activeView === "terraform" || activeView === "issues") &&
      nextView !== "terraform" &&
      nextView !== "issues" &&
      hasUnsavedTerraformChanges
    ) {
      setPendingView(nextView);
      setShowTerraformLeaveDialog(true);
      return;
    }

    setActiveView(nextView);
  }, [activeView, hasUnsavedTerraformChanges]);

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
      requestView("terraform");
    }
  }, [context.inspectedNodeId, requestView]);

  useEffect(() => {
    if (context.resourcePanelFocusRequestId > 0) {
      requestView("resource");
    }
  }, [context.resourcePanelFocusRequestId, requestView]);

  function openCollapsedView(nextView: WorkspaceRightPanelView): void {
    context.setRightPanelOpen(true);
    requestView(nextView);
  }

  if (!context.isRightPanelOpen) {
    return (
      <aside className={styles.collapsedRightPanel} aria-label="오른쪽 패널 바로가기">
        <button
          className={styles.collapsedPanelButton}
          onClick={() => context.setRightPanelOpen(true)}
          title="오른쪽 패널 열기"
          type="button"
        >
          <PanelRightOpen size={18} aria-hidden="true" />
        </button>
        <button
          className={styles.collapsedPanelButton}
          onClick={() => openCollapsedView("resource")}
          title="Resources"
          type="button"
        >
          <ListTree size={18} aria-hidden="true" />
        </button>
        <button
          className={styles.collapsedPanelButton}
          onClick={() => openCollapsedView("terraform")}
          title="Terraform"
          type="button"
        >
          <Code2 size={18} aria-hidden="true" />
        </button>
        <button
          className={styles.collapsedPanelButton}
          onClick={() => openCollapsedView("issues")}
          title="Issues"
          type="button"
        >
          <AlertCircle size={18} aria-hidden="true" />
          <span className={hasTerraformIssueErrors ? styles.panelIssueBadgeError : styles.panelIssueBadge}>
            {terraformDiagnostics.length}
          </span>
        </button>
        <button
          className={styles.collapsedPanelButton}
          onClick={() => openCollapsedView("deployment")}
          title="Deploy"
          type="button"
        >
          <Rocket size={18} aria-hidden="true" />
        </button>
      </aside>
    );
  }

  return (
    <aside className={styles.rightPanelShell}>
      <div className={styles.rightPanelToolbar}>
        <button
          className={styles.panelCollapseButton}
          onClick={() => context.setRightPanelOpen(false)}
          title="오른쪽 패널 닫기"
          type="button"
        >
          <PanelRightClose size={18} aria-hidden="true" />
        </button>
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
          <button
            aria-pressed={activeView === "issues"}
            className={activeView === "issues" ? styles.panelModeButtonActive : styles.panelModeButton}
            onClick={() => requestView("issues")}
            title="Issues"
            type="button"
          >
            <AlertCircle size={18} aria-hidden="true" />
            <span
              className={hasTerraformIssueErrors ? styles.panelIssueBadgeError : styles.panelIssueBadge}
              aria-label={`${terraformDiagnostics.length} issues`}
            >
              {terraformDiagnostics.length}
            </span>
          </button>
        </div>
        <button
          aria-pressed={activeView === "deployment"}
          className={`${activeView === "deployment" ? styles.panelIconButtonActive : styles.panelIconButton} ${styles.panelDeployButton}`}
          onClick={() => requestView("deployment")}
          title="배포"
          type="button"
        >
          <Rocket size={18} aria-hidden="true" />
        </button>
      </div>

      {activeView === "resource" ? (
        <ResourceWorkspacePanel context={context} />
      ) : activeView === "terraform" || activeView === "issues" ? (
        <>
          <div className={styles.rightPanelView} hidden={activeView !== "terraform"}>
            <TerraformCodePanel
              context={context}
              externalSaveRequestId={terraformSaveRequestId}
              onDiagnosticsChange={setTerraformDiagnostics}
              onDirtyChange={setHasUnsavedTerraformChanges}
              onExternalSaveComplete={handleTerraformExternalSaveComplete}
              onOpenIssues={() => requestView("issues")}
            />
          </div>
          <div className={styles.rightPanelView} hidden={activeView !== "issues"}>
            <TerraformIssuesPanel diagnostics={terraformDiagnostics} />
          </div>
        </>
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

function ResourceWorkspacePanel({ context }: { readonly context: DiagramEditorPanelContext }) {
  return (
    <div className={styles.resourceWorkspacePanel}>
      <div className={styles.resourceSectionToolbar}>
        <div className={styles.resourceSectionTabs} aria-label="Resource sections">
          <span className={styles.resourceSectionButtonActive} title="Resources">
            <Box size={18} aria-hidden="true" />
          </span>
        </div>
      </div>

      <ParameterInputPanel {...context} />
    </div>
  );
}

function TerraformCodePanel({
  context,
  externalSaveRequestId,
  onDiagnosticsChange,
  onDirtyChange,
  onExternalSaveComplete,
  onOpenIssues
}: {
  readonly context: DiagramEditorPanelContext;
  readonly externalSaveRequestId: number;
  readonly onDiagnosticsChange: (diagnostics: TerraformDiagnostic[]) => void;
  readonly onDirtyChange: (isDirty: boolean) => void;
  readonly onExternalSaveComplete: (saved: boolean) => void;
  readonly onOpenIssues: () => void;
}) {
  const [terraformFiles, setTerraformFiles] = useState<TerraformVirtualFile[]>(() =>
    createTerraformFilesFromGeneratedCode(context.diagram, "")
  );
  const [activeFileName, setActiveFileName] = useState("main.tf");
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const [fileSearchQuery, setFileSearchQuery] = useState("");
  const [diagnostics, setDiagnostics] = useState<TerraformDiagnostic[]>([]);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("main.tf");
  const [hasLocalEdits, setHasLocalEdits] = useState(false);
  const [saveBanner, setSaveBanner] = useState<TerraformSaveBanner | null>(null);
  const [diagnosticToast, setDiagnosticToast] = useState<TerraformDiagnostic | null>(null);
  const codeRequestIdRef = useRef(0);
  const diagnosticToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDiagramFingerprintRef = useRef("");
  const latestExternalSaveRequestIdRef = useRef(externalSaveRequestId);
  const lineNumberRef = useRef<HTMLOListElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const combinedTerraformCode = useMemo(() => combineTerraformFiles(terraformFiles), [terraformFiles]);
  const activeFileCode = useMemo(
    () => getTerraformFileCode(terraformFiles, activeFileName),
    [activeFileName, terraformFiles]
  );
  const hasTerraformCode = combinedTerraformCode.trim().length > 0;
  const hasErrorDiagnostics = diagnostics.some((diagnostic) => diagnostic.severity === "error");
  const firstErrorDiagnostic = diagnostics.find((diagnostic) => diagnostic.severity === "error") ?? null;
  const currentDiagramFingerprint = useMemo(() => toDiagramFingerprint(context.diagram), [context.diagram]);
  const terraformBlocks = useMemo(() => parseTerraformFiles(terraformFiles), [terraformFiles]);
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
  const terraformFileOptions = useMemo(
    () => getTerraformFileOptions(context.diagram, terraformFiles),
    [context.diagram, terraformFiles]
  );
  const filteredTerraformFileOptions = useMemo(() => {
    const query = fileSearchQuery.trim().toLowerCase();

    if (!query) {
      return terraformFileOptions;
    }

    return terraformFileOptions.filter((fileName) => fileName.toLowerCase().includes(query));
  }, [fileSearchQuery, terraformFileOptions]);
  const isResourceCodeMode = Boolean(inspectedNode);
  const displayedTerraformCode = inspectedBlock?.code ?? activeFileCode;
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

  const showDiagnosticToast = useCallback((diagnostic: TerraformDiagnostic) => {
    if (diagnosticToastTimerRef.current) {
      clearTimeout(diagnosticToastTimerRef.current);
    }

    setDiagnosticToast(diagnostic);
    diagnosticToastTimerRef.current = setTimeout(() => {
      setDiagnosticToast(null);
      diagnosticToastTimerRef.current = null;
    }, 3800);
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

        const nextFiles = createTerraformFilesFromGeneratedCode(context.diagram, generatedCode);
        setTerraformFiles(nextFiles);
        setActiveFileName((currentFileName) =>
          nextFiles.some((file) => file.fileName === currentFileName) ? currentFileName : "main.tf"
        );
        setDiagnostics([]);
        onDiagnosticsChange([]);
        setHasLocalEdits(false);
        setSaveBanner(null);
        setDiagnosticToast(null);
        setStatusMessage("그래프 기준으로 동기화됨");
        latestDiagramFingerprintRef.current = diagramFingerprint;
        onDirtyChange(false);
      }, "Terraform 코드를 생성하지 못했습니다.");
    },
    [context.diagram, onDiagnosticsChange, onDirtyChange, runRequest]
  );

  const saveCodeToDiagram = useCallback(async (): Promise<boolean> => {
    if (!hasTerraformCode || requestState === "loading") {
      return false;
    }

    let saved = false;

    await runRequest(async () => {
      const validationResult = await validateTerraformCode(combinedTerraformCode);
      setDiagnostics(validationResult.diagnostics);
      onDiagnosticsChange(validationResult.diagnostics);

      const validationError = validationResult.diagnostics.find(
        (diagnostic) => diagnostic.severity === "error"
      );

      if (validationError) {
        setSaveBanner(null);
        showDiagnosticToast(validationError);
        setStatusMessage("저장 실패");
        return;
      }

      const syncResult = await syncTerraformToDiagram({
        diagramJson: context.diagram,
        terraformCode: combinedTerraformCode
      });
      setDiagnostics(syncResult.diagnostics);
      onDiagnosticsChange(syncResult.diagnostics);

      const syncError = syncResult.diagnostics.find((diagnostic) => diagnostic.severity === "error");

      if (syncError) {
        setSaveBanner(null);
        showDiagnosticToast(syncError);
        setStatusMessage("저장 실패");
        return;
      }

      context.applyDiagramJson(syncResult.diagramJson);
      latestDiagramFingerprintRef.current = toDiagramFingerprint(syncResult.diagramJson);
      setHasLocalEdits(false);
      setSaveBanner(null);
      setDiagnosticToast(null);
      setStatusMessage("저장됨");
      onDirtyChange(false);
      saved = true;
    }, "Terraform 코드를 저장하지 못했습니다.");

    return saved;
  }, [
    combinedTerraformCode,
    context,
    hasTerraformCode,
    onDiagnosticsChange,
    onDirtyChange,
    requestState,
    runRequest,
    showDiagnosticToast
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

    if (latestDiagramFingerprintRef.current === currentDiagramFingerprint) {
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
    refreshTerraformCode
  ]);

  useEffect(() => {
    onDirtyChange(hasLocalEdits);
  }, [hasLocalEdits, onDirtyChange]);

  useEffect(() => {
    return () => {
      if (diagnosticToastTimerRef.current) {
        clearTimeout(diagnosticToastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isResourceCodeMode || !selectedBlock || !textareaRef.current) {
      return;
    }

    if (selectedBlock.fileName !== activeFileName) {
      setActiveFileName(selectedBlock.fileName);
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
  }, [activeFileName, isResourceCodeMode, selectedBlock]);

  useEffect(() => {
    if (!inspectedBlock) {
      return;
    }

    setActiveFileName(inspectedBlock.fileName);
  }, [inspectedBlock]);

  function handleCodeScroll(event: UIEvent<HTMLTextAreaElement>): void {
    if (lineNumberRef.current) {
      lineNumberRef.current.scrollTop = event.currentTarget.scrollTop;
    }
  }

  function handleCodeChange(nextCode: string): void {
    setTerraformFiles((currentFiles) =>
      currentFiles.map((file) => {
        if (inspectedBlock && file.fileName === inspectedBlock.fileName) {
          return {
            fileName: file.fileName,
            code: `${file.code.slice(0, inspectedBlock.startOffset)}${nextCode}${file.code.slice(
              inspectedBlock.endOffset
            )}`
          };
        }

        if (!inspectedBlock && file.fileName === activeFileName) {
          return {
            fileName: file.fileName,
            code: nextCode
          };
        }

        return file;
      })
    );

    setHasLocalEdits(true);
    setSaveBanner({ kind: "dirty" });
    setDiagnosticToast(null);
    setStatusMessage("수정 중");
  }

  function handleCodeKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void saveCodeToDiagram();
    }
  }

  function handleSeeMore(): void {
    onOpenIssues();
  }

  async function validateDisplayedCode(): Promise<void> {
    if (!displayedTerraformCode.trim() || requestState === "loading") {
      return;
    }

    await runRequest(async () => {
      const validationResult = await validateTerraformCode(displayedTerraformCode);
      setDiagnostics(validationResult.diagnostics);
      onDiagnosticsChange(validationResult.diagnostics);
      const firstDiagnostic = validationResult.diagnostics[0] ?? null;

      if (firstDiagnostic) {
        showDiagnosticToast(firstDiagnostic);
      } else {
        setDiagnosticToast(null);
      }
      setStatusMessage(validationResult.diagnostics.length === 0 ? "검증 완료" : "진단 확인 필요");
    }, "Terraform 코드를 검증하지 못했습니다.");
  }

  function selectTerraformFile(fileName: string): void {
    setTerraformFiles((currentFiles) =>
      currentFiles.some((file) => file.fileName === fileName)
        ? currentFiles
        : [...currentFiles, { code: "", fileName }].sort((left, right) =>
            compareTerraformFileNames(left.fileName, right.fileName)
          )
    );
    setActiveFileName(fileName);
    setIsFileMenuOpen(false);
    setFileSearchQuery("");
    context.closeInspectedNode();
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
          <div className={styles.terraformFilePicker}>
            <button
              aria-expanded={isFileMenuOpen}
              aria-haspopup="listbox"
              className={styles.terraformFileButton}
              onClick={() => setIsFileMenuOpen((isOpen) => !isOpen)}
              type="button"
            >
              <FileCode2 size={16} aria-hidden="true" />
              <span>{activeFileName}</span>
              <ChevronDown size={15} aria-hidden="true" />
            </button>
            {isFileMenuOpen ? (
              <div className={styles.terraformFileMenu}>
                <input
                  aria-label="Terraform 파일 검색"
                  className={styles.terraformFileSearch}
                  onChange={(event) => setFileSearchQuery(event.target.value)}
                  placeholder="Search file"
                  value={fileSearchQuery}
                />
                <div className={styles.terraformFileList} role="listbox">
                  {filteredTerraformFileOptions.map((fileName) => (
                    <button
                      aria-selected={fileName === activeFileName}
                      className={
                        fileName === activeFileName
                          ? styles.terraformFileOptionActive
                          : styles.terraformFileOption
                      }
                      key={fileName}
                      onClick={() => selectTerraformFile(fileName)}
                      role="option"
                      type="button"
                    >
                      {fileName}
                    </button>
                  ))}
                  {filteredTerraformFileOptions.length === 0 ? (
                    <span className={styles.terraformFileEmpty}>No files</span>
                  ) : null}
                </div>
              </div>
            ) : null}
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
        <span>
          {isResourceCodeMode
            ? `${inspectedBlock?.fileName ?? activeFileName} resource code`
            : `${terraformFileOptions.length} files | ${context.nodes.length} nodes`}
        </span>
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
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
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
          wrap="off"
        />
      </div>

      {diagnosticToast ? (
        <div className={styles.terraformDiagnosticToast} role="status" aria-live="polite">
          <strong>{formatTerraformDiagnosticTitle(diagnosticToast)}</strong>
          <span>{diagnosticToast.message}</span>
        </div>
      ) : null}

      <section className={styles.terraformDiagnosticsHidden} aria-live="polite" id="terraform-issues">
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

function TerraformIssuesPanel({ diagnostics }: { readonly diagnostics: TerraformDiagnostic[] }) {
  const hasErrorDiagnostics = diagnostics.some((diagnostic) => diagnostic.severity === "error");
  const firstErrorDiagnostic = diagnostics.find((diagnostic) => diagnostic.severity === "error") ?? null;

  return (
    <div className={styles.issuesPanel}>
      <section className={styles.terraformDiagnostics} aria-live="polite">
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

        {diagnostics.length === 0 ? (
          <p className={styles.terraformEmpty}>표시할 진단이 없습니다.</p>
        ) : (
          <ol className={styles.terraformDiagnosticList}>
            {diagnostics.map((diagnostic, index) => (
              <li key={`${diagnostic.code ?? diagnostic.message}-${index}`} data-severity={diagnostic.severity}>
                <strong>{formatTerraformDiagnosticTitle(diagnostic)}</strong>
                <span>{diagnostic.message}</span>
              </li>
            ))}
          </ol>
        )}
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

type TerraformVirtualFile = {
  readonly code: string;
  readonly fileName: string;
};

const TERRAFORM_STANDARD_FILE_NAMES = ["main.tf"] as const;

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
  const hasCurrentPlan = Boolean(selectedDeployment?.currentPlanArtifactId);
  const isPlanApproved = Boolean(
    selectedDeployment?.approvedAt && selectedDeployment.approvedPlanArtifactId
  );
  const canRunPlan =
    Boolean(selectedDeployment) &&
    selectedDeployment?.status !== "RUNNING" &&
    !isPlanApproved &&
    requestState !== "loading";
  const canApprovePlan =
    hasCurrentPlan &&
    !isPlanApproved &&
    selectedDeployment?.status !== "RUNNING" &&
    selectedDeployment?.isBlocked === true &&
    selectedDeployment?.blockedBy === "missing_approval" &&
    requestState !== "loading";
  const shouldShowPlanButton = Boolean(selectedDeployment) && !isPlanApproved;
  const shouldShowApprovePlanButton =
    Boolean(selectedDeployment) && hasCurrentPlan && !isPlanApproved;
  const shouldShowApplyButton = Boolean(selectedDeployment) && isPlanApproved;
  const deploymentActionHint = selectedDeployment
    ? getDeploymentActionHint(selectedDeployment)
    : "";

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
      setDeploymentLogs(await listDeploymentLogs(deployment.id));
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
      setDeploymentLogs(await listDeploymentLogs(deployment.id));
    }, "Terraform Plan을 승인하지 못했습니다.");
  }

  async function refreshDeploymentPanel(): Promise<void> {
    await runRequest(async () => {
      const [nextProjectDetails, nextConnections, nextDeployments, nextLogs] = await Promise.all([
        getProjectDetails(projectId),
        listAwsConnections(),
        listDeployments(projectId),
        selectedDeploymentId ? listDeploymentLogs(selectedDeploymentId) : Promise.resolve([])
      ]);
      const latestArchitecture = nextProjectDetails.architectures[0];
      const latestVerifiedConnection = nextConnections.find(
        (connection) => connection.status === "verified"
      );

      setProjectDetails(nextProjectDetails);
      setAwsConnections(nextConnections);
      setDeployments(nextDeployments);
      setDeploymentLogs(nextLogs);
      setSelectedArchitectureId((currentId) =>
        nextProjectDetails.architectures.some((architecture) => architecture.id === currentId)
          ? currentId
          : latestArchitecture?.id ?? ""
      );
      setSelectedAwsConnectionId((currentId) =>
        nextConnections.some((connection) => connection.id === currentId)
          ? currentId
          : latestVerifiedConnection?.id ?? ""
      );
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
        {!selectedTerraformArtifactId ? <p className={styles.deploymentHint}>Terraform artifact가 있어야 Plan을 실행할 수 있습니다.</p> : null}
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
            <InfoRow
              label="Current plan"
              value={selectedDeployment.currentPlanArtifactId ?? "없음"}
            />
            <InfoRow label="Blocked" value={selectedDeployment.isBlocked ? "yes" : "no"} />
            <InfoRow label="Blocked by" value={selectedDeployment.blockedBy ?? "없음"} />
            <InfoRow label="Reason" value={selectedDeployment.blockedReason ?? "없음"} />
            <InfoRow label="Approval" value={formatApprovalState(selectedDeployment)} />
            {selectedDeployment.planSummary ? (
              <PlanSummaryRows deployment={selectedDeployment} />
            ) : null}
            {selectedDeployment.approvedAt ? (
              <>
                <InfoRow label="Approved at" value={formatDate(selectedDeployment.approvedAt)} />
                <InfoRow
                  label="Approved plan"
                  value={selectedDeployment.approvedPlanArtifactId ?? "없음"}
                />
                <InfoRow
                  label="tfplan hash"
                  value={formatShortHash(selectedDeployment.approvedTfplanHash)}
                />
                <InfoRow
                  label="Artifact hash"
                  value={formatShortHash(selectedDeployment.approvedTerraformArtifactHash)}
                />
                <InfoRow
                  label="AWS account"
                  value={selectedDeployment.approvedAwsAccountId ?? "없음"}
                />
                <InfoRow
                  label="AWS region"
                  value={selectedDeployment.approvedAwsRegion ?? "없음"}
                />
              </>
            ) : null}
            <InfoRow label="Error" value={selectedDeployment.errorSummary ?? "없음"} />
          </div>
        ) : null}

        {shouldShowPlanButton ? (
          <button
            className={styles.deploymentPrimaryButton}
            disabled={!canRunPlan}
            onClick={startTerraformPlan}
            type="button"
          >
            <DashboardIcon name="server" />
            {hasCurrentPlan ? "Terraform Plan 다시 실행" : "Terraform Plan 실행"}
          </button>
        ) : null}

        {shouldShowApprovePlanButton ? (
          <button
            className={styles.deploymentSecondaryButton}
            disabled={!canApprovePlan}
            onClick={approveCurrentPlan}
            type="button"
          >
            Plan 승인
          </button>
        ) : null}

        {shouldShowApplyButton ? (
          <button className={styles.deploymentPrimaryButton} disabled type="button">
            <DashboardIcon name="rocket" />
            Apply 실행
          </button>
        ) : null}

        {deploymentActionHint ? (
          <p className={styles.deploymentHint}>{deploymentActionHint}</p>
        ) : null}
      </section>

      <section className={styles.deploymentSection}>
        <h3>Logs</h3>
        {deploymentLogs.length === 0 ? (
          <p className={styles.deploymentHint}>아직 표시할 로그가 없습니다.</p>
        ) : (
          <pre aria-label="Deployment logs" className={styles.deploymentLogConsole}>
            {deploymentLogs.map(formatDeploymentLogLine).join("\n")}
          </pre>
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

function createTerraformFilesFromGeneratedCode(
  diagramJson: DiagramEditorPanelContext["diagram"],
  generatedCode: string
): TerraformVirtualFile[] {
  const fileNames = getTerraformFileOptions(diagramJson, []);
  const codeByFileName = new Map(fileNames.map((fileName) => [fileName, ""]));
  const nodeFileByAddress = new Map(
    diagramJson.nodes
      .map((node) => [toNodeTerraformAddress(node), normalizeTerraformFileName(node.parameters?.fileName)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[0]))
  );
  const generatedBlocks = parseTerraformBlocks("main.tf", generatedCode);

  for (const block of generatedBlocks) {
    const fileName = nodeFileByAddress.get(block.address) ?? "main.tf";
    const currentCode = codeByFileName.get(fileName) ?? "";
    codeByFileName.set(fileName, appendTerraformBlock(currentCode, block.code));
  }

  if (generatedBlocks.length === 0 && generatedCode.trim()) {
    codeByFileName.set("main.tf", generatedCode.trim());
  }

  return Array.from(codeByFileName.entries()).map(([fileName, code]) => ({
    code,
    fileName
  }));
}

function getTerraformFileOptions(
  diagramJson: DiagramEditorPanelContext["diagram"],
  files: readonly TerraformVirtualFile[]
): string[] {
  const fileNames = new Set<string>(TERRAFORM_STANDARD_FILE_NAMES);

  for (const node of diagramJson.nodes) {
    fileNames.add(normalizeTerraformFileName(node.parameters?.fileName));
  }

  for (const file of files) {
    fileNames.add(normalizeTerraformFileName(file.fileName));
  }

  return Array.from(fileNames).sort(compareTerraformFileNames);
}

function compareTerraformFileNames(left: string, right: string): number {
  const leftStandardIndex = TERRAFORM_STANDARD_FILE_NAMES.indexOf(left as (typeof TERRAFORM_STANDARD_FILE_NAMES)[number]);
  const rightStandardIndex = TERRAFORM_STANDARD_FILE_NAMES.indexOf(right as (typeof TERRAFORM_STANDARD_FILE_NAMES)[number]);

  if (leftStandardIndex !== -1 || rightStandardIndex !== -1) {
    if (leftStandardIndex === -1) {
      return 1;
    }

    if (rightStandardIndex === -1) {
      return -1;
    }

    return leftStandardIndex - rightStandardIndex;
  }

  return left.localeCompare(right);
}

function normalizeTerraformFileName(fileName: string | undefined): string {
  const trimmedFileName = fileName?.trim();

  if (!trimmedFileName) {
    return "main.tf";
  }

  if (trimmedFileName.endsWith(".tf") || trimmedFileName.endsWith(".tfvars")) {
    return trimmedFileName;
  }

  return `${trimmedFileName}.tf`;
}

function appendTerraformBlock(currentCode: string, blockCode: string): string {
  const trimmedBlock = blockCode.trim();

  if (!currentCode.trim()) {
    return trimmedBlock;
  }

  return `${currentCode.trimEnd()}\n\n${trimmedBlock}`;
}

function getTerraformFileCode(files: readonly TerraformVirtualFile[], fileName: string): string {
  return files.find((file) => file.fileName === fileName)?.code ?? "";
}

function combineTerraformFiles(files: readonly TerraformVirtualFile[]): string {
  return files
    .map((file) => file.code.trim())
    .filter(Boolean)
    .join("\n\n");
}

function parseTerraformFiles(files: readonly TerraformVirtualFile[]): TerraformBlockLocation[] {
  return files.flatMap((file) => parseTerraformBlocks(file.fileName, file.code));
}

type TerraformBlockLocation = {
  readonly address: string;
  readonly blockType: "resource" | "data";
  readonly code: string;
  readonly endLine: number;
  readonly endOffset: number;
  readonly fileName: string;
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

function parseTerraformBlocks(fileName: string, terraformCode: string): TerraformBlockLocation[] {
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
      fileName,
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
              <li key={`${warning.level}-${index}`}>
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
  if (deployment.status === "RUNNING") {
    return "Terraform 작업이 진행 중입니다. 새로고침으로 상태를 확인해주세요.";
  }

  if (deployment.approvedAt) {
    return "승인된 Plan이 준비되었습니다. 실제 Apply 실행 단계는 아직 연결 전입니다.";
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

function formatDeploymentLogLine(log: DeploymentLog): string {
  const sequence = String(log.sequence).padStart(3, "0");
  const stage = log.stage.toUpperCase().padEnd(8, " ");
  const level = log.level.padEnd(5, " ");

  return `${sequence}  ${stage}  ${level}  ${log.message}`;
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
