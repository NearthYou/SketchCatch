import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, UIEvent } from "react";
import type { DiagramJson, TerraformDiagnostic } from "@sketchcatch/types";
import {
  AlertCircle,
  ArrowLeft,
  ChevronDown,
  ClipboardCheck,
  FileCode2,
  GitBranch,
  Play,
  Rocket,
  Settings,
  Trash2,
  UploadCloud,
  X
} from "lucide-react";
import { getApiErrorMessage } from "../../lib/api-client";
import type { DiagramEditorPanelContext } from "../diagram-editor";
import { generateTerraformCode, syncTerraformToDiagram, validateTerraformCode } from "./api";
import {
  combineTerraformFiles,
  compareTerraformFileNames,
  createTerraformFilesFromGeneratedCode,
  findTerraformBlockForNode,
  formatTerraformDiagnosticTitle,
  getTerraformFileCode,
  getTerraformFileOptions,
  parseTerraformFiles,
  toDiagramFingerprint,
  type TerraformSaveBanner,
  type TerraformVirtualFile
} from "./terraform-panel-utils";
import type { RequestState } from "./workspace-right-panel.types";
import styles from "./workspace.module.css";

const TERRAFORM_EDITOR_LINE_HEIGHT = 19.2;
const TERRAFORM_EDITOR_VERTICAL_PADDING = 12;

export type PreparedTerraformArtifactSource = {
  readonly diagramJson: DiagramJson;
  readonly terraformCode: string;
};

export type TerraformCodePanelHandle = {
  readonly prepareTerraformArtifact: () => Promise<PreparedTerraformArtifactSource>;
};

export const TerraformCodePanel = forwardRef<TerraformCodePanelHandle, {
  readonly context: DiagramEditorPanelContext;
  readonly externalSaveRequestId: number;
  readonly isVisible: boolean;
  readonly onDiagnosticsChange: (diagnostics: TerraformDiagnostic[]) => void;
  readonly onDirtyChange: (isDirty: boolean) => void;
  readonly onExternalSaveComplete: (saved: boolean) => void;
  readonly onOpenIssues: () => void;
  readonly onOpenResourceSettings: () => void;
  readonly onSaveTerraformArtifact?: (source: PreparedTerraformArtifactSource) => Promise<unknown>;
}>(function TerraformCodePanel({
  context,
  externalSaveRequestId,
  isVisible,
  onDiagnosticsChange,
  onDirtyChange,
  onExternalSaveComplete,
  onOpenIssues,
  onOpenResourceSettings,
  onSaveTerraformArtifact
}, ref) {
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
  const [codeScrollTop, setCodeScrollTop] = useState(0);
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
  const isResourceCodeMode = Boolean(inspectedNode && inspectedBlock);
  const displayedTerraformCode = inspectedBlock?.code ?? activeFileCode;
  const highlightedBlock =
    !isResourceCodeMode && selectedBlock?.fileName === activeFileName ? selectedBlock : null;
  const lineNumbers = useMemo(
    () => Array.from({ length: Math.max(1, displayedTerraformCode.split(/\r\n|\r|\n/).length) }, (_, index) => index + 1),
    [displayedTerraformCode]
  );
  const highlightedBlockStyle = highlightedBlock
    ? {
        height: `${Math.max(1, highlightedBlock.endLine - highlightedBlock.startLine + 1) * TERRAFORM_EDITOR_LINE_HEIGHT}px`,
        top: `${TERRAFORM_EDITOR_VERTICAL_PADDING + (highlightedBlock.startLine - 1) * TERRAFORM_EDITOR_LINE_HEIGHT - codeScrollTop}px`
      }
    : null;

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

  const syncTerraformCodeToDiagram = useCallback(async (): Promise<PreparedTerraformArtifactSource | null> => {
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
      return null;
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
      return null;
    }

    context.applyDiagramJson(syncResult.diagramJson);
    latestDiagramFingerprintRef.current = toDiagramFingerprint(syncResult.diagramJson);
    setHasLocalEdits(false);
    setSaveBanner(null);
    setDiagnosticToast(null);
    setStatusMessage("저장됨");
    onDirtyChange(false);

    return {
      diagramJson: syncResult.diagramJson,
      terraformCode: combinedTerraformCode
    };
  }, [
    combinedTerraformCode,
    context,
    onDiagnosticsChange,
    onDirtyChange,
    showDiagnosticToast
  ]);

  const saveCodeToDiagram = useCallback(async (): Promise<boolean> => {
    if (!hasTerraformCode || requestState === "loading") {
      return false;
    }

    let saved = false;

    await runRequest(async () => {
      saved = Boolean(await syncTerraformCodeToDiagram());
    }, "Terraform 코드를 저장하지 못했습니다.");

    return saved;
  }, [hasTerraformCode, requestState, runRequest, syncTerraformCodeToDiagram]);

  useImperativeHandle(ref, () => ({
    prepareTerraformArtifact: async () => {
      if (!hasTerraformCode) {
        throw new Error("저장할 Terraform 코드가 없습니다.");
      }

      if (requestState === "loading") {
        throw new Error("Terraform 요청을 처리하는 중입니다.");
      }

      const preparedSource = await syncTerraformCodeToDiagram();

      if (!preparedSource) {
        throw new Error("Terraform 코드 검증 또는 그래프 반영에 실패했습니다.");
      }

      return preparedSource;
    }
  }), [hasTerraformCode, requestState, syncTerraformCodeToDiagram]);

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
    if (!isVisible || isResourceCodeMode || !selectedBlock || !textareaRef.current) {
      return;
    }

    if (selectedBlock.fileName !== activeFileName) {
      setActiveFileName(selectedBlock.fileName);
      return;
    }

    const textarea = textareaRef.current;
    const lineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight) || 20;
    textarea.scrollTop = Math.max(0, (selectedBlock.startLine - 2) * lineHeight);
    setCodeScrollTop(textarea.scrollTop);

    if (lineNumberRef.current) {
      lineNumberRef.current.scrollTop = textarea.scrollTop;
    }

  }, [activeFileName, isResourceCodeMode, isVisible, selectedBlock]);

  useEffect(() => {
    if (!inspectedBlock) {
      return;
    }

    setActiveFileName(inspectedBlock.fileName);
  }, [inspectedBlock]);

  function handleCodeScroll(event: UIEvent<HTMLTextAreaElement>): void {
    setCodeScrollTop(event.currentTarget.scrollTop);

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

  async function saveTerraformArtifact(): Promise<void> {
    if (!onSaveTerraformArtifact || !hasTerraformCode || requestState === "loading") {
      return;
    }

    await runRequest(async () => {
      const preparedSource = await syncTerraformCodeToDiagram();

      if (!preparedSource) {
        throw new Error("Terraform 코드 검증 또는 그래프 반영에 실패했습니다.");
      }

      await onSaveTerraformArtifact(preparedSource);
      setStatusMessage("Artifact 저장됨");
    }, "Terraform artifact를 저장하지 못했습니다.");
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
          <button
            className={styles.terraformArtifactButton}
            disabled={!onSaveTerraformArtifact || requestState === "loading" || !hasTerraformCode}
            onClick={saveTerraformArtifact}
            title="현재 Terraform artifact 저장"
            type="button"
          >
            <UploadCloud size={15} aria-hidden="true" />
            Artifact 저장
          </button>
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
        {highlightedBlock && highlightedBlockStyle ? (
          <div
            aria-label={`${highlightedBlock.address} code block`}
            className={styles.terraformBlockHighlightBox}
            style={highlightedBlockStyle}
          >
            <button
              aria-label="Open resource settings"
              className={styles.terraformBlockSettingsButton}
              onClick={onOpenResourceSettings}
              title="Resource settings"
              type="button"
            >
              <Settings size={15} aria-hidden="true" />
            </button>
          </div>
        ) : null}
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
});
