import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, UIEvent } from "react";
import type {
  AiTerraformErrorExplanationResult,
  AiTerraformPreviewExplanationResult,
  DiagramJson,
  TerraformDiagramChangeProposal,
  TerraformDiagnostic
} from "@sketchcatch/types";
import {
  AlertCircle,
  ArrowLeft,
  ChevronDown,
  ClipboardCheck,
  FileCode2,
  GitBranch,
  Settings,
  Sparkles,
  X
} from "lucide-react";
import { getApiErrorMessage } from "../../lib/api-client";
import type { DiagramEditorPanelContext } from "../diagram-editor";
import {
  generateTerraformCode,
  runAiTerraformErrorExplanation,
  runAiTerraformPreviewExplanation,
  syncTerraformToDiagram,
  validateTerraformCode
} from "./api";
import {
  combineTerraformFiles,
  compareTerraformFileNames,
  createTerraformFilesFromGeneratedCode,
  findTerraformBlockForNode,
  formatTerraformDiagnosticTitle,
  getTerraformFileCode,
  getTerraformFileOptions,
  parseTerraformFiles,
  toTerraformRefreshFingerprint,
  type TerraformSaveBanner,
  type TerraformVirtualFile
} from "./terraform-panel-utils";
import {
  applyTerraformSyncProposals,
  getTerraformSyncProposalId
} from "./terraform-sync-proposals";
import type { RequestState } from "./workspace-right-panel.types";
import styles from "./workspace.module.css";

const TERRAFORM_EDITOR_LINE_HEIGHT = 19.2;
const TERRAFORM_EDITOR_VERTICAL_PADDING = 12;

type TerraformPreviewExplanationScope = {
  readonly code: string;
  readonly key: string;
  readonly label: string;
};

type TerraformErrorExplanationEntry = {
  readonly explanation: AiTerraformErrorExplanationResult | null;
  readonly message: string;
  readonly state: RequestState;
};

type PendingTerraformSync = {
  readonly approvedProposalIds: ReadonlySet<string>;
  readonly diagramJson: DiagramJson;
  readonly proposals: readonly TerraformDiagramChangeProposal[];
};

function createTerraformDiagnosticKey(diagnostic: TerraformDiagnostic | null): string {
  if (!diagnostic) {
    return "";
  }

  return JSON.stringify({
    code: diagnostic.code ?? "",
    line: diagnostic.line ?? 0,
    message: diagnostic.message,
    nodeId: diagnostic.nodeId ?? "",
    resourceAddress: diagnostic.resourceAddress ?? "",
    severity: diagnostic.severity
  });
}

function formatTerraformErrorRawMessage(diagnostic: TerraformDiagnostic): string {
  return `${formatTerraformDiagnosticTitle(diagnostic)}\n${diagnostic.message}`;
}

function formatTerraformSyncProposalTitle(proposal: TerraformDiagramChangeProposal): string {
  if (proposal.kind === "create_candidate") {
    return `생성: ${formatTerraformSyncIdentity(proposal.identity)}`;
  }

  if (proposal.kind === "delete_candidate") {
    return `삭제: ${formatTerraformSyncIdentity(proposal.identity)}`;
  }

  return `이름 변경: ${formatTerraformSyncIdentity(proposal.from)} -> ${proposal.to.resourceName}`;
}

function formatTerraformSyncProposalDetail(proposal: TerraformDiagramChangeProposal): string {
  if (proposal.kind === "create_candidate") {
    return `${proposal.sourceFileName ?? "main.tf"}${proposal.line ? `:${proposal.line}` : ""}`;
  }

  if (proposal.kind === "delete_candidate") {
    return proposal.resourceAddress;
  }

  return `${proposal.resourceAddress} -> ${formatTerraformSyncIdentity(proposal.to)}`;
}

function formatTerraformSyncIdentity({
  resourceName,
  resourceType,
  terraformBlockType
}: {
  readonly resourceName: string;
  readonly resourceType: string;
  readonly terraformBlockType: "resource" | "data";
}): string {
  return terraformBlockType === "data"
    ? `data.${resourceType}.${resourceName}`
    : `${resourceType}.${resourceName}`;
}

function createTerraformPreviewExplanationScope({
  activeFileName,
  displayedTerraformCode,
  highlightedBlock,
  inspectedBlock
}: {
  readonly activeFileName: string;
  readonly displayedTerraformCode: string;
  readonly highlightedBlock: { readonly address: string; readonly code: string } | null;
  readonly inspectedBlock: { readonly address: string; readonly code: string } | null;
}): TerraformPreviewExplanationScope {
  if (inspectedBlock) {
    return createTerraformPreviewExplanationScopeValue(
      inspectedBlock.code,
      `리소스 코드 · ${inspectedBlock.address}`
    );
  }

  if (highlightedBlock) {
    return createTerraformPreviewExplanationScopeValue(
      highlightedBlock.code,
      `강조 코드 · ${highlightedBlock.address}`
    );
  }

  return createTerraformPreviewExplanationScopeValue(displayedTerraformCode, `현재 파일 · ${activeFileName}`);
}

function createTerraformPreviewExplanationScopeValue(
  code: string,
  label: string
): TerraformPreviewExplanationScope {
  const trimmedCode = code.trim();

  return {
    code: trimmedCode,
    key: JSON.stringify({ code: trimmedCode, label }),
    label
  };
}

export type PreparedTerraformArtifactSource = {
  readonly diagramJson: DiagramJson;
  readonly terraformCode: string;
};

export type TerraformCodePanelHandle = {
  readonly prepareTerraformArtifact: () => Promise<PreparedTerraformArtifactSource>;
  readonly validateCurrentTerraform: () => Promise<TerraformDiagnostic[]>;
};

export const TerraformCodePanel = forwardRef<TerraformCodePanelHandle, {
  readonly context: DiagramEditorPanelContext;
  readonly externalDiscardRequestId: number;
  readonly externalSaveRequestId: number;
  readonly isVisible: boolean;
  readonly onDiagnosticsChange: (diagnostics: TerraformDiagnostic[]) => void;
  readonly onDirtyChange: (isDirty: boolean) => void;
  readonly onExternalSaveComplete: (saved: boolean) => void;
  readonly onOpenIssues: () => void;
  readonly onOpenResourceSettings: () => void;
}>(function TerraformCodePanel({
  context,
  externalDiscardRequestId,
  externalSaveRequestId,
  isVisible,
  onDiagnosticsChange,
  onDirtyChange,
  onExternalSaveComplete,
  onOpenIssues,
  onOpenResourceSettings
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
  const [pendingTerraformSync, setPendingTerraformSync] = useState<PendingTerraformSync | null>(null);
  const [terraformPreviewExplanation, setTerraformPreviewExplanation] =
    useState<AiTerraformPreviewExplanationResult | null>(null);
  const [terraformPreviewExplanationState, setTerraformPreviewExplanationState] =
    useState<RequestState>("idle");
  const [terraformPreviewExplanationMessage, setTerraformPreviewExplanationMessage] = useState("");
  const [explainedTerraformPreviewKey, setExplainedTerraformPreviewKey] = useState("");
  const [terraformErrorExplanationsByKey, setTerraformErrorExplanationsByKey] =
    useState<Record<string, TerraformErrorExplanationEntry>>({});
  const [codeScrollTop, setCodeScrollTop] = useState(0);
  const codeRequestIdRef = useRef(0);
  const isPreparingTerraformArtifactRef = useRef(false);
  const latestDiagramFingerprintRef = useRef("");
  const latestExternalDiscardRequestIdRef = useRef(externalDiscardRequestId);
  const latestExternalSaveRequestIdRef = useRef(externalSaveRequestId);
  const lineNumberRef = useRef<HTMLOListElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const terraformPreviewExplanationRequestIdRef = useRef(0);

  const combinedTerraformCode = useMemo(() => combineTerraformFiles(terraformFiles), [terraformFiles]);
  const activeFileCode = useMemo(
    () => getTerraformFileCode(terraformFiles, activeFileName),
    [activeFileName, terraformFiles]
  );
  const hasTerraformCode = combinedTerraformCode.trim().length > 0;
  const errorDiagnostics = useMemo(
    () => diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    [diagnostics]
  );
  const errorDiagnosticKeys = useMemo(
    () => new Set(errorDiagnostics.map((diagnostic) => createTerraformDiagnosticKey(diagnostic))),
    [errorDiagnostics]
  );
  const hasErrorDiagnostics = errorDiagnostics.length > 0;
  const currentDiagramFingerprint = useMemo(
    () => toTerraformRefreshFingerprint(context.diagram),
    [context.diagram]
  );
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
  const terraformPreviewExplanationScope = useMemo(
    () =>
      createTerraformPreviewExplanationScope({
        activeFileName,
        displayedTerraformCode,
        highlightedBlock,
        inspectedBlock
      }),
    [activeFileName, displayedTerraformCode, highlightedBlock, inspectedBlock]
  );
  const activeTerraformPreviewExplanation =
    terraformPreviewExplanation !== null &&
    explainedTerraformPreviewKey === terraformPreviewExplanationScope.key
      ? terraformPreviewExplanation
      : null;
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

  async function explainTerraformPreviewScope(): Promise<void> {
    if (!terraformPreviewExplanationScope.code || terraformPreviewExplanationState === "loading") {
      return;
    }

    const requestId = terraformPreviewExplanationRequestIdRef.current + 1;

    terraformPreviewExplanationRequestIdRef.current = requestId;
    setTerraformPreviewExplanationState("loading");
    setTerraformPreviewExplanationMessage("");
    setTerraformPreviewExplanation(null);
    setExplainedTerraformPreviewKey("");

    try {
      const explanation = await runAiTerraformPreviewExplanation(terraformPreviewExplanationScope.code);

      if (terraformPreviewExplanationRequestIdRef.current !== requestId) {
        return;
      }

      setTerraformPreviewExplanation(explanation);
      setExplainedTerraformPreviewKey(terraformPreviewExplanationScope.key);
      setTerraformPreviewExplanationState("idle");
    } catch (error) {
      if (terraformPreviewExplanationRequestIdRef.current !== requestId) {
        return;
      }

      setTerraformPreviewExplanationState("error");
      setTerraformPreviewExplanationMessage(getApiErrorMessage(error, "Terraform Preview 설명 중 오류가 발생했습니다."));
    }
  }

  function closeTerraformPreviewExplanation(): void {
    terraformPreviewExplanationRequestIdRef.current += 1;
    setTerraformPreviewExplanationState("idle");
    setTerraformPreviewExplanationMessage("");
    setTerraformPreviewExplanation(null);
    setExplainedTerraformPreviewKey("");
  }

  async function explainTerraformError(diagnostic: TerraformDiagnostic): Promise<void> {
    const diagnosticKey = createTerraformDiagnosticKey(diagnostic);
    const explanationEntry = terraformErrorExplanationsByKey[diagnosticKey];

    if (explanationEntry?.state === "loading") {
      return;
    }

    const relatedResourceId = diagnostic.resourceAddress ?? diagnostic.nodeId;

    setTerraformErrorExplanationsByKey((currentExplanations) => ({
      ...currentExplanations,
      [diagnosticKey]: {
        explanation: null,
        message: "",
        state: "loading"
      }
    }));

    try {
      const explanation = await runAiTerraformErrorExplanation({
        rawMessage: formatTerraformErrorRawMessage(diagnostic),
        ...(relatedResourceId ? { relatedResourceId } : {}),
        stage: "validate"
      });

      setTerraformErrorExplanationsByKey((currentExplanations) => ({
        ...currentExplanations,
        [diagnosticKey]: {
          explanation,
          message: "",
          state: "idle"
        }
      }));
    } catch (error) {
      setTerraformErrorExplanationsByKey((currentExplanations) => ({
        ...currentExplanations,
        [diagnosticKey]: {
          explanation: null,
          message: getApiErrorMessage(error, "Terraform 오류 설명 중 오류가 발생했습니다."),
          state: "error"
        }
      }));
    }
  }

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
        setPendingTerraformSync(null);
        setHasLocalEdits(false);
        setSaveBanner(null);
        setTerraformPreviewExplanation(null);
        setTerraformPreviewExplanationMessage("");
        setTerraformPreviewExplanationState("idle");
        setExplainedTerraformPreviewKey("");
        setTerraformErrorExplanationsByKey({});
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
      setStatusMessage("저장 실패");
      return null;
    }

    const syncResult = await syncTerraformToDiagram({
      diagramJson: context.diagram,
      terraformCode: combinedTerraformCode,
      terraformFiles: terraformFiles.map((file) => ({
        fileName: file.fileName,
        terraformCode: file.code
      }))
    });
    setDiagnostics(syncResult.diagnostics);
    onDiagnosticsChange(syncResult.diagnostics);

    const syncError = syncResult.diagnostics.find((diagnostic) => diagnostic.severity === "error");

    if (syncError) {
      setSaveBanner(null);
      setPendingTerraformSync(null);
      setStatusMessage("저장 실패");
      return null;
    }

    if (syncResult.proposals && syncResult.proposals.length > 0) {
      setPendingTerraformSync({
        approvedProposalIds: new Set(
          syncResult.proposals.map((proposal, index) => getTerraformSyncProposalId(proposal, index))
        ),
        diagramJson: syncResult.diagramJson,
        proposals: syncResult.proposals
      });
      setSaveBanner({ kind: "dirty" });
      setStatusMessage("변경 제안 확인 필요");
      onDirtyChange(true);
      return null;
    }

    setPendingTerraformSync(null);
    context.applyDiagramJson(syncResult.diagramJson);
    latestDiagramFingerprintRef.current = toTerraformRefreshFingerprint(syncResult.diagramJson);
    setHasLocalEdits(false);
    setSaveBanner(null);
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
    terraformFiles
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

  const validateCurrentTerraform = useCallback(async (): Promise<TerraformDiagnostic[]> => {
    if (!hasTerraformCode) {
      setDiagnostics([]);
      onDiagnosticsChange([]);
      return [];
    }

    if (requestState === "loading" || isPreparingTerraformArtifactRef.current) {
      throw new Error("Terraform 요청을 처리하는 중입니다.");
    }

    setRequestState("loading");
    setErrorMessage("");

    try {
      const validationResult = await validateTerraformCode(combinedTerraformCode);
      setDiagnostics(validationResult.diagnostics);
      onDiagnosticsChange(validationResult.diagnostics);
      setStatusMessage(validationResult.diagnostics.length === 0 ? "검증 완료" : "진단 확인 필요");
      setRequestState("idle");
      return validationResult.diagnostics;
    } catch (error) {
      setRequestState("error");
      setErrorMessage(getApiErrorMessage(error, "Terraform 코드를 검증하지 못했습니다."));
      throw error;
    }
  }, [combinedTerraformCode, hasTerraformCode, onDiagnosticsChange, requestState]);

  useImperativeHandle(ref, () => ({
    prepareTerraformArtifact: async () => {
      if (!hasTerraformCode) {
        throw new Error("저장할 Terraform 코드가 없습니다.");
      }

      if (requestState === "loading" || isPreparingTerraformArtifactRef.current) {
        throw new Error("Terraform 요청을 처리하는 중입니다.");
      }

      isPreparingTerraformArtifactRef.current = true;
      setRequestState("loading");
      setErrorMessage("");

      try {
        const preparedSource = await syncTerraformCodeToDiagram();

        if (!preparedSource) {
          throw new Error("Terraform 코드 검증 또는 그래프 반영에 실패했습니다.");
        }

        setRequestState("idle");
        return preparedSource;
      } catch (error) {
        setRequestState("error");
        setErrorMessage(getApiErrorMessage(error, "Terraform 패널을 준비하지 못했습니다."));
        throw error;
      } finally {
        isPreparingTerraformArtifactRef.current = false;
      }
    },
    validateCurrentTerraform
  }), [hasTerraformCode, requestState, syncTerraformCodeToDiagram, validateCurrentTerraform]);

  useEffect(() => {
    if (latestExternalSaveRequestIdRef.current === externalSaveRequestId) {
      return;
    }

    latestExternalSaveRequestIdRef.current = externalSaveRequestId;
    void saveCodeToDiagram().then(onExternalSaveComplete);
  }, [externalSaveRequestId, onExternalSaveComplete, saveCodeToDiagram]);

  useEffect(() => {
    if (latestExternalDiscardRequestIdRef.current === externalDiscardRequestId) {
      return;
    }

    latestExternalDiscardRequestIdRef.current = externalDiscardRequestId;
    void refreshTerraformCode(currentDiagramFingerprint);
  }, [currentDiagramFingerprint, externalDiscardRequestId, refreshTerraformCode]);

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
    if (!terraformPreviewExplanationScope.code) {
      setTerraformPreviewExplanation(null);
      setTerraformPreviewExplanationMessage("");
      setTerraformPreviewExplanationState("idle");
      setExplainedTerraformPreviewKey("");
      return;
    }

    if (
      explainedTerraformPreviewKey &&
      explainedTerraformPreviewKey !== terraformPreviewExplanationScope.key
    ) {
      setTerraformPreviewExplanation(null);
      setTerraformPreviewExplanationMessage("");
      setTerraformPreviewExplanationState("idle");
      setExplainedTerraformPreviewKey("");
    }
  }, [
    explainedTerraformPreviewKey,
    terraformPreviewExplanationScope.code,
    terraformPreviewExplanationScope.key
  ]);

  useEffect(() => {
    setTerraformErrorExplanationsByKey((currentExplanations) => {
      const currentKeys = Object.keys(currentExplanations);
      const nextExplanations = currentKeys.reduce<Record<string, TerraformErrorExplanationEntry>>(
        (entries, diagnosticKey) => {
          const explanationEntry = currentExplanations[diagnosticKey];

          if (explanationEntry && errorDiagnosticKeys.has(diagnosticKey)) {
            entries[diagnosticKey] = explanationEntry;
          }

          return entries;
        },
        {}
      );

      return currentKeys.length === Object.keys(nextExplanations).length
        ? currentExplanations
        : nextExplanations;
    });
  }, [errorDiagnosticKeys]);

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
    setTerraformPreviewExplanation(null);
    setTerraformPreviewExplanationMessage("");
    setTerraformPreviewExplanationState("idle");
    setExplainedTerraformPreviewKey("");
    setTerraformErrorExplanationsByKey({});
    setPendingTerraformSync(null);
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

  function togglePendingProposal(proposalId: string, checked: boolean): void {
    setPendingTerraformSync((currentSync) => {
      if (!currentSync) {
        return currentSync;
      }

      const nextProposalIds = new Set(currentSync.approvedProposalIds);

      if (checked) {
        nextProposalIds.add(proposalId);
      } else {
        nextProposalIds.delete(proposalId);
      }

      return {
        ...currentSync,
        approvedProposalIds: nextProposalIds
      };
    });
  }

  function applyPendingTerraformSync(): void {
    if (!pendingTerraformSync) {
      return;
    }

    const nextDiagramJson = applyTerraformSyncProposals(
      pendingTerraformSync.diagramJson,
      pendingTerraformSync.proposals,
      pendingTerraformSync.approvedProposalIds
    );

    context.applyDiagramJson(nextDiagramJson);
    latestDiagramFingerprintRef.current = toTerraformRefreshFingerprint(nextDiagramJson);
    setPendingTerraformSync(null);
    setHasLocalEdits(false);
    setSaveBanner(null);
    setStatusMessage("제안 반영됨");
    onDirtyChange(false);
  }

  function clearPendingTerraformSync(): void {
    setPendingTerraformSync(null);
    setStatusMessage(hasLocalEdits ? "수정 중" : "제안 무시됨");
  }

  async function validateDisplayedCode(): Promise<void> {
    if (!displayedTerraformCode.trim() || requestState === "loading") {
      return;
    }

    await runRequest(async () => {
      const validationResult = await validateTerraformCode(displayedTerraformCode);
      setDiagnostics(validationResult.diagnostics);
      onDiagnosticsChange(validationResult.diagnostics);
      setStatusMessage(validationResult.diagnostics.length === 0 ? "검증 완료" : "진단 확인 필요");
    }, "Terraform 코드를 검증하지 못했습니다.");
  }

  function renderTerraformPreviewExplanationButton() {
    return (
      <button
        className={styles.terraformPreviewButton}
        disabled={
          !terraformPreviewExplanationScope.code ||
          requestState === "loading" ||
          terraformPreviewExplanationState === "loading"
        }
        onClick={() => void explainTerraformPreviewScope()}
        title={terraformPreviewExplanationScope.label}
        type="button"
      >
        <Sparkles size={14} aria-hidden="true" />
        <span>{terraformPreviewExplanationState === "loading" ? "설명 중" : "Preview 설명"}</span>
      </button>
    );
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
          <div className={styles.terraformTopActions}>
            {renderTerraformPreviewExplanationButton()}
            <span className={styles.terraformShortcut}>Ctrl+S</span>
          </div>
        </header>
      )}

      {isResourceCodeMode ? (
        <div className={styles.resourceActionBar}>
          {renderTerraformPreviewExplanationButton()}
          <button
            className={styles.resourceActionSecondary}
            disabled={requestState === "loading" || !displayedTerraformCode.trim()}
            onClick={validateDisplayedCode}
            type="button"
          >
            <ClipboardCheck size={16} aria-hidden="true" />
            Validate
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

      {pendingTerraformSync ? (
        <section className={styles.terraformSyncProposalPanel} aria-live="polite">
          <div className={styles.terraformSyncProposalHeader}>
            <div>
              <strong>Terraform 변경 제안</strong>
              <span>{pendingTerraformSync.proposals.length}개 제안</span>
            </div>
            <div className={styles.terraformSyncProposalActions}>
              <button onClick={applyPendingTerraformSync} type="button">
                <ClipboardCheck size={14} aria-hidden="true" />
                선택 반영
              </button>
              <button onClick={clearPendingTerraformSync} type="button">
                무시
              </button>
            </div>
          </div>
          <ol className={styles.terraformSyncProposalList}>
            {pendingTerraformSync.proposals.map((proposal, index) => {
              const proposalId = getTerraformSyncProposalId(proposal, index);

              return (
                <li key={proposalId}>
                  <label>
                    <input
                      checked={pendingTerraformSync.approvedProposalIds.has(proposalId)}
                      onChange={(event) => togglePendingProposal(proposalId, event.currentTarget.checked)}
                      type="checkbox"
                    />
                    <span>
                      <strong>{formatTerraformSyncProposalTitle(proposal)}</strong>
                      <small>{formatTerraformSyncProposalDetail(proposal)}</small>
                    </span>
                  </label>
                </li>
              );
            })}
          </ol>
        </section>
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

      {terraformPreviewExplanationState !== "idle" || activeTerraformPreviewExplanation ? (
        <section className={styles.terraformPreviewExplanationPanel} aria-live="polite">
          <div className={styles.terraformPreviewExplanationHeader}>
            <div>
              <strong>Terraform Preview 설명</strong>
              <span>{terraformPreviewExplanationScope.label}</span>
            </div>
            <div className={styles.terraformPreviewExplanationActions}>
              <button
                disabled={
                  !terraformPreviewExplanationScope.code ||
                  requestState === "loading" ||
                  terraformPreviewExplanationState === "loading"
                }
                onClick={() => void explainTerraformPreviewScope()}
                type="button"
              >
                <Sparkles size={14} aria-hidden="true" />
                {terraformPreviewExplanationState === "loading" ? "설명 중" : "다시 설명"}
              </button>
              <button
                aria-label="Terraform Preview 설명 닫기"
                className={styles.terraformPreviewExplanationCloseButton}
                onClick={closeTerraformPreviewExplanation}
                title="닫기"
                type="button"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
          {terraformPreviewExplanationState === "loading" ? (
            <p className={styles.terraformPreviewExplanationNotice}>코드를 해석하는 중입니다.</p>
          ) : null}
          {terraformPreviewExplanationState === "error" ? (
            <p className={styles.terraformPreviewExplanationError} role="alert">
              {terraformPreviewExplanationMessage}
            </p>
          ) : null}
          {activeTerraformPreviewExplanation ? (
            <div className={styles.terraformPreviewExplanationResult}>
              <p>{activeTerraformPreviewExplanation.summary}</p>
              {activeTerraformPreviewExplanation.detectedResources.length > 0 ? (
                <ul>
                  {activeTerraformPreviewExplanation.detectedResources.slice(0, 3).map((resource) => (
                    <li key={`${resource.terraformType}-${resource.label}`}>
                      <strong>{resource.label}</strong>
                      <span>{resource.explanation}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {activeTerraformPreviewExplanation.findings.length > 0 ? (
                <div className={styles.terraformPreviewExplanationStats}>
                  <span>{activeTerraformPreviewExplanation.findings.length} Findings</span>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {errorDiagnostics.length > 0 ? (
        <section className={styles.terraformErrorExplanationPanel} aria-live="polite">
          <div className={styles.terraformErrorExplanationHeader}>
            <div>
              <strong>Terraform 오류</strong>
              <span>{errorDiagnostics.length}개 오류</span>
            </div>
          </div>
          <ol className={styles.terraformErrorExplanationList}>
            {errorDiagnostics.map((diagnostic, index) => {
              const diagnosticKey = createTerraformDiagnosticKey(diagnostic);
              const explanationEntry = terraformErrorExplanationsByKey[diagnosticKey];
              const diagnosticExplanation = explanationEntry?.explanation ?? null;
              const isExplanationLoading = explanationEntry?.state === "loading";
              const isExplanationError = explanationEntry?.state === "error";
              const explanationMessage = explanationEntry?.message ?? "";

              return (
                <li key={`${diagnosticKey}-${index}`}>
                  <div className={styles.terraformErrorExplanationItemText}>
                    <strong>{formatTerraformDiagnosticTitle(diagnostic)}</strong>
                    <span>{diagnostic.message}</span>
                  </div>
                  <button
                    disabled={isExplanationLoading || requestState === "loading"}
                    onClick={() => void explainTerraformError(diagnostic)}
                    type="button"
                  >
                    <Sparkles size={14} aria-hidden="true" />
                    {isExplanationLoading ? "설명 중" : "AI 설명"}
                  </button>
                  {isExplanationLoading ? (
                    <p className={styles.terraformErrorExplanationNotice}>오류를 해석하는 중입니다.</p>
                  ) : null}
                  {isExplanationError ? (
                    <p className={styles.terraformErrorExplanationError} role="alert">
                      {explanationMessage}
                    </p>
                  ) : null}
                  {diagnosticExplanation ? (
                    <div className={styles.terraformErrorExplanationResult}>
                      <p>{diagnosticExplanation.summary}</p>
                      <dl>
                        <div>
                          <dt>원인</dt>
                          <dd>{diagnosticExplanation.likelyCause}</dd>
                        </div>
                        {diagnosticExplanation.nextActions.slice(0, 2).map((action, actionIndex) => (
                          <div key={`${action}-${actionIndex}`}>
                            <dt>{actionIndex === 0 ? "다음 행동" : "추가 행동"}</dt>
                            <dd>{action}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      <section className={styles.terraformDiagnosticsHidden} aria-live="polite" id="terraform-issues">
        <div className={styles.terraformDiagnosticsHeader}>
          {hasErrorDiagnostics ? (
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
