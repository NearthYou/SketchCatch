import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, UIEvent } from "react";
import type {
  AiTerraformPreviewExplanationResult,
  DiagramJson,
  TerraformDiagnostic,
  TerraformSyncFileInput
} from "@sketchcatch/types";
import {
  ArrowLeft,
  ChevronDown,
  FileCode2,
  Settings,
  Sparkles,
  X
} from "lucide-react";
import { getApiErrorMessage } from "../../lib/api-client";
import type { DiagramEditorPanelContext } from "../diagram-editor";
import {
  generateTerraformCode,
  runAiTerraformPreviewExplanation,
  syncTerraformToDiagram,
  validateTerraformCode
} from "./api";
import {
  combineTerraformFiles,
  compareTerraformFileNames,
  createTerraformFilesFromGeneratedCode,
  findTerraformBlockForNode,
  getDiagramTerraformAddresses,
  getTerraformFileCode,
  getTerraformFileOptions,
  parseTerraformFiles,
  removeTerraformBlocksByAddress,
  toTerraformRefreshFingerprint,
  type TerraformSaveBanner,
  type TerraformVirtualFile
} from "./terraform-panel-utils";
import { createTerraformDiagnosticLineNumbers } from "./terraform-diagnostic-line-highlights";
import {
  createTerraformHighlightedLines,
  type TerraformHighlightedToken,
  type TerraformTokenKind
} from "./terraform-code-highlighting";
import { applyAllTerraformSyncProposals } from "./terraform-sync-proposals";
import { applyTerraformSafeFix, type TerraformSafeFixResult } from "./terraform-safe-fixes";
import { createTerraformDiagnosticKey } from "./terraform-issues-state";
import type { RequestState } from "./workspace-right-panel.types";
import styles from "./workspace.module.css";

const TERRAFORM_EDITOR_LINE_HEIGHT = 19.2;
const TERRAFORM_EDITOR_VERTICAL_PADDING = 12;

const TERRAFORM_TOKEN_CLASS_NAMES: Record<TerraformTokenKind, string | undefined> = {
  brace: styles.terraformTokenBrace,
  comment: styles.terraformTokenComment,
  identifier: styles.terraformTokenIdentifier,
  keyword: styles.terraformTokenKeyword,
  number: styles.terraformTokenNumber,
  operator: styles.terraformTokenOperator,
  plain: styles.terraformTokenPlain,
  reference: styles.terraformTokenReference,
  string: styles.terraformTokenString
};

type TerraformPreviewExplanationScope = {
  readonly code: string;
  readonly key: string;
  readonly label: string;
};

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

async function validateTerraformVirtualFiles({
  combinedTerraformCode,
  files
}: {
  readonly combinedTerraformCode: string;
  readonly files: readonly TerraformVirtualFile[];
}): Promise<TerraformDiagnostic[]> {
  const terraformFiles = toTerraformValidationFiles(files);
  const validationResult = await validateTerraformCode({
    terraformCode: terraformFiles.length > 0 ? "" : combinedTerraformCode,
    terraformFiles
  });
  const shouldAddFallbackSource = terraformFiles.length <= 1;

  return validationResult.diagnostics.map((diagnostic) =>
    diagnostic.sourceFileName || !shouldAddFallbackSource
      ? diagnostic
      : addTerraformDiagnosticSource(diagnostic, files[0]?.fileName ?? "main.tf")
  );
}

function toTerraformValidationFiles(
  files: readonly TerraformVirtualFile[]
): TerraformSyncFileInput[] {
  return files.map((file) => ({
    fileName: file.fileName,
    terraformCode: file.code
  }));
}

function hasBlockingTerraformDiagnostic(diagnostics: readonly TerraformDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

function createStaleTerraformValidationDiagnostic(): TerraformDiagnostic {
  return {
    severity: "error",
    code: "terraform.validation.stale",
    message: "Terraform 코드가 변경되어 다시 검증이 필요합니다."
  };
}

function addTerraformDiagnosticSource(
  diagnostic: TerraformDiagnostic,
  sourceFileName: string,
  sourceLineOffset = 0
): TerraformDiagnostic {
  return {
    ...diagnostic,
    sourceFileName: diagnostic.sourceFileName ?? sourceFileName,
    ...(diagnostic.line !== undefined ? { line: diagnostic.line + sourceLineOffset } : {})
  };
}

function renderTerraformToken(token: TerraformHighlightedToken, index: number) {
  return (
    <span className={TERRAFORM_TOKEN_CLASS_NAMES[token.kind]} key={`${index}-${token.kind}-${token.text}`}>
      {token.text}
    </span>
  );
}

export type PreparedTerraformArtifactSource = {
  readonly diagramJson: DiagramJson;
  readonly terraformCode: string;
};

export type TerraformCodePanelHandle = {
  readonly applyTerraformSafeFix: (diagnostic: TerraformDiagnostic) => Promise<TerraformSafeFixResult>;
  readonly getCurrentTerraformCode: () => string;
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
  readonly onExternalSaveComplete: (saved: boolean, requestId: number) => void;
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
  const [statusMessage, setStatusMessage] = useState("main.tf");
  const [hasLocalEdits, setHasLocalEdits] = useState(false);
  const [saveBanner, setSaveBanner] = useState<TerraformSaveBanner | null>(null);
  const [terraformPreviewExplanation, setTerraformPreviewExplanation] =
    useState<AiTerraformPreviewExplanationResult | null>(null);
  const [terraformPreviewExplanationState, setTerraformPreviewExplanationState] =
    useState<RequestState>("idle");
  const [terraformPreviewExplanationMessage, setTerraformPreviewExplanationMessage] = useState("");
  const [explainedTerraformPreviewKey, setExplainedTerraformPreviewKey] = useState("");
  const [codeScrollTop, setCodeScrollTop] = useState(0);
  const [codeScrollLeft, setCodeScrollLeft] = useState(0);
  const codeRequestIdRef = useRef(0);
  const codeVersionRef = useRef(0);
  const isPreparingTerraformArtifactRef = useRef(false);
  const latestDiagramFingerprintRef = useRef("");
  const latestDiagramResourceAddressesRef = useRef<Set<string> | null>(null);
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
  const currentDiagramFingerprint = useMemo(
    () => toTerraformRefreshFingerprint(context.diagram),
    [context.diagram]
  );
  const currentDiagramResourceAddresses = useMemo(
    () => getDiagramTerraformAddresses(context.diagram),
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
  const displayedSourceFileName = inspectedBlock?.fileName ?? activeFileName;
  const displayedSourceLineOffset = inspectedBlock ? inspectedBlock.startLine - 1 : 0;
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
  const diagnosticLineNumbers = useMemo(
    () =>
      createTerraformDiagnosticLineNumbers(diagnostics, {
        codeLineCount: lineNumbers.length,
        sourceFileName: displayedSourceFileName,
        sourceLineOffset: displayedSourceLineOffset
      }),
    [diagnostics, displayedSourceFileName, displayedSourceLineOffset, lineNumbers.length]
  );
  const diagnosticLineNumberSet = useMemo(
    () => new Set(diagnosticLineNumbers),
    [diagnosticLineNumbers]
  );
  const highlightedTerraformLines = useMemo(
    () => createTerraformHighlightedLines(displayedTerraformCode, diagnosticLineNumberSet),
    [diagnosticLineNumberSet, displayedTerraformCode]
  );
  const terraformSyntaxHighlightStyle = useMemo(
    () => ({
      transform: `translate(${-codeScrollLeft}px, ${-codeScrollTop}px)`
    }),
    [codeScrollLeft, codeScrollTop]
  );

  const runRequest = useCallback(async (request: () => Promise<void>) => {
    setRequestState("loading");

    try {
      await request();
      setRequestState("idle");
    } catch {
      setRequestState("error");
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
        codeVersionRef.current += 1;
        setTerraformFiles(nextFiles);
        setActiveFileName((currentFileName) =>
          nextFiles.some((file) => file.fileName === currentFileName) ? currentFileName : "main.tf"
        );
        setDiagnostics([]);
        onDiagnosticsChange([]);
        setHasLocalEdits(false);
        setSaveBanner(null);
        setTerraformPreviewExplanation(null);
        setTerraformPreviewExplanationMessage("");
        setTerraformPreviewExplanationState("idle");
        setExplainedTerraformPreviewKey("");
        setStatusMessage("그래프 기준으로 동기화됨");
        latestDiagramFingerprintRef.current = diagramFingerprint;
        onDirtyChange(false);
      });
    },
    [context.diagram, onDiagnosticsChange, onDirtyChange, runRequest]
  );

  const runTerraformModuleValidation = useCallback(async (): Promise<TerraformDiagnostic[]> => {
    if (!combinedTerraformCode.trim()) {
      setDiagnostics([]);
      onDiagnosticsChange([]);
      return [];
    }

    const requestCodeVersion = codeVersionRef.current;
    setStatusMessage("기본 문법 확인 중");

    const validationDiagnostics = await validateTerraformVirtualFiles({
      combinedTerraformCode,
      files: terraformFiles
    });

    if (requestCodeVersion !== codeVersionRef.current) {
      const staleDiagnostics = [createStaleTerraformValidationDiagnostic()];

      setDiagnostics(staleDiagnostics);
      onDiagnosticsChange(staleDiagnostics);
      setStatusMessage("검증 재시도 필요");
      return staleDiagnostics;
    }

    setDiagnostics(validationDiagnostics);
    onDiagnosticsChange(validationDiagnostics);

    if (hasBlockingTerraformDiagnostic(validationDiagnostics)) {
      setStatusMessage("진단 확인 필요");
      return validationDiagnostics;
    }

    setStatusMessage(validationDiagnostics.length === 0 ? "검증 완료" : "진단 확인 필요");
    return validationDiagnostics;
  }, [
    combinedTerraformCode,
    onDiagnosticsChange,
    terraformFiles
  ]);

  const syncTerraformCodeToDiagram = useCallback(async (): Promise<PreparedTerraformArtifactSource | null> => {
    const requestCodeVersion = codeVersionRef.current;
    const validationDiagnostics = combinedTerraformCode.trim()
      ? await runTerraformModuleValidation()
      : [];

    if (requestCodeVersion !== codeVersionRef.current) {
      return null;
    }

    if (!combinedTerraformCode.trim()) {
      setDiagnostics([]);
      onDiagnosticsChange([]);
    }

    const validationError = validationDiagnostics.find(
      (diagnostic) => diagnostic.severity === "error"
    );

    if (validationError) {
      setSaveBanner(null);
      setStatusMessage("저장 실패");
      return null;
    }

    setStatusMessage("Terraform 변경사항 저장 중");

    const syncResult = await syncTerraformToDiagram({
      diagramJson: context.diagram,
      terraformCode: combinedTerraformCode,
      terraformFiles: toTerraformValidationFiles(terraformFiles)
    });

    if (requestCodeVersion !== codeVersionRef.current) {
      return null;
    }

    setDiagnostics(syncResult.diagnostics);
    onDiagnosticsChange(syncResult.diagnostics);

    const syncError = syncResult.diagnostics.find((diagnostic) => diagnostic.severity === "error");

    if (syncError) {
      setSaveBanner(null);
      setStatusMessage("저장 실패");
      return null;
    }

    const nextDiagramJson =
      syncResult.proposals && syncResult.proposals.length > 0
        ? applyAllTerraformSyncProposals(syncResult.diagramJson, syncResult.proposals)
        : syncResult.diagramJson;

    context.applyDiagramJson(nextDiagramJson);
    latestDiagramFingerprintRef.current = toTerraformRefreshFingerprint(nextDiagramJson);
    setHasLocalEdits(false);
    setSaveBanner(null);
    setStatusMessage("저장됨");
    onDirtyChange(false);

    return {
      diagramJson: nextDiagramJson,
      terraformCode: combinedTerraformCode
    };
  }, [
    combinedTerraformCode,
    context,
    onDiagnosticsChange,
    onDirtyChange,
    runTerraformModuleValidation,
    terraformFiles
  ]);

  const saveCodeToDiagram = useCallback(async (): Promise<boolean> => {
    if (requestState === "loading") {
      return false;
    }

    let saved = false;

    await runRequest(async () => {
      saved = Boolean(await syncTerraformCodeToDiagram());
    });

    return saved;
  }, [requestState, runRequest, syncTerraformCodeToDiagram]);

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

    try {
      const validationDiagnostics = await runTerraformModuleValidation();
      setRequestState("idle");
      return validationDiagnostics;
    } catch (error) {
      setRequestState("error");
      throw error;
    }
  }, [
    hasTerraformCode,
    onDiagnosticsChange,
    requestState,
    runTerraformModuleValidation
  ]);

  const applyTerraformSafeFixToCode = useCallback(async (diagnostic: TerraformDiagnostic): Promise<TerraformSafeFixResult> => {
    if (requestState === "loading" || isPreparingTerraformArtifactRef.current) {
      return {
        applied: false,
        code: combinedTerraformCode,
        message: "Terraform 요청을 처리하는 중입니다."
      };
    }

    const targetFileName = diagnostic.sourceFileName ?? activeFileName;
    const targetFile = terraformFiles.find((file) => file.fileName === targetFileName);

    if (!targetFile) {
      return {
        applied: false,
        code: combinedTerraformCode,
        message: "진단이 가리키는 Terraform 파일을 찾지 못했습니다."
      };
    }

    const fixResult = applyTerraformSafeFix({
      code: targetFile.code,
      diagnostic
    });

    if (!fixResult.applied) {
      return fixResult;
    }

    const nextFiles = terraformFiles.map((file) =>
      file.fileName === targetFile.fileName ? { ...file, code: fixResult.code } : file
    );
    const nextCombinedTerraformCode = combineTerraformFiles(nextFiles);
    const originalDiagnosticKey = createTerraformDiagnosticKey(diagnostic);

    codeVersionRef.current += 1;
    setRequestState("loading");
    setTerraformFiles(nextFiles);
    setActiveFileName(targetFile.fileName);
    setHasLocalEdits(true);
    setSaveBanner({ kind: "dirty" });
    setStatusMessage("AI 수정안 적용 중");

    try {
      const validationDiagnostics = await validateTerraformVirtualFiles({
        combinedTerraformCode: nextCombinedTerraformCode,
        files: nextFiles
      });

      setDiagnostics(validationDiagnostics);
      onDiagnosticsChange(validationDiagnostics);

      const stillHasOriginalDiagnostic = validationDiagnostics.some(
        (nextDiagnostic) => createTerraformDiagnosticKey(nextDiagnostic) === originalDiagnosticKey
      );

      if (hasBlockingTerraformDiagnostic(validationDiagnostics) && stillHasOriginalDiagnostic) {
        setRequestState("idle");
        setStatusMessage("재검증 필요");
        return {
          applied: false,
          code: nextCombinedTerraformCode,
          message: "수정안은 적용됐지만 같은 Terraform 진단이 남아 있습니다."
        };
      }

      const syncResult = await syncTerraformToDiagram({
        diagramJson: context.diagram,
        terraformCode: nextCombinedTerraformCode,
        terraformFiles: toTerraformValidationFiles(nextFiles)
      });

      setDiagnostics(syncResult.diagnostics);
      onDiagnosticsChange(syncResult.diagnostics);

      const syncError = syncResult.diagnostics.find((nextDiagnostic) => nextDiagnostic.severity === "error");

      if (syncError) {
        setRequestState("idle");
        setStatusMessage("재검증 필요");
        return {
          applied: false,
          code: nextCombinedTerraformCode,
          message: "수정안은 적용됐지만 다이어그램 동기화 진단이 남아 있습니다."
        };
      }

      const nextDiagramJson =
        syncResult.proposals && syncResult.proposals.length > 0
          ? applyAllTerraformSyncProposals(syncResult.diagramJson, syncResult.proposals)
          : syncResult.diagramJson;

      context.applyDiagramJson(nextDiagramJson);
      latestDiagramFingerprintRef.current = toTerraformRefreshFingerprint(nextDiagramJson);
      setHasLocalEdits(false);
      setSaveBanner(null);
      setRequestState("idle");
      setStatusMessage("AI 수정안 저장됨");
      onDirtyChange(false);

      return {
        applied: true,
        code: nextCombinedTerraformCode,
        message: "AI 수정안을 적용하고 재검증/저장/다이어그램 동기화를 완료했습니다."
      };
    } catch (error) {
      setRequestState("error");
      setStatusMessage("AI 수정안 적용 실패");
      return {
        applied: false,
        code: nextCombinedTerraformCode,
        message: getApiErrorMessage(error, "AI 수정안 적용 중 오류가 발생했습니다.")
      };
    }
  }, [
    activeFileName,
    combinedTerraformCode,
    context,
    onDiagnosticsChange,
    onDirtyChange,
    requestState,
    terraformFiles
  ]);

  useImperativeHandle(ref, () => ({
    applyTerraformSafeFix: applyTerraformSafeFixToCode,
    getCurrentTerraformCode: () => combinedTerraformCode,
    prepareTerraformArtifact: async () => {
      if (!hasTerraformCode) {
        throw new Error("저장할 Terraform 코드가 없습니다.");
      }

      if (requestState === "loading" || isPreparingTerraformArtifactRef.current) {
        throw new Error("Terraform 요청을 처리하는 중입니다.");
      }

      isPreparingTerraformArtifactRef.current = true;
      setRequestState("loading");

      try {
        const preparedSource = await syncTerraformCodeToDiagram();

        if (!preparedSource) {
          throw new Error("Terraform 코드 검증 또는 그래프 반영에 실패했습니다.");
        }

        setRequestState("idle");
        return preparedSource;
      } catch (error) {
        setRequestState("error");
        throw error;
      } finally {
        isPreparingTerraformArtifactRef.current = false;
      }
    },
    validateCurrentTerraform
  }), [
    applyTerraformSafeFixToCode,
    combinedTerraformCode,
    hasTerraformCode,
    requestState,
    syncTerraformCodeToDiagram,
    validateCurrentTerraform
  ]);

  useEffect(() => {
    if (latestExternalSaveRequestIdRef.current === externalSaveRequestId) {
      return;
    }

    latestExternalSaveRequestIdRef.current = externalSaveRequestId;
    void saveCodeToDiagram().then((saved) => onExternalSaveComplete(saved, externalSaveRequestId));
  }, [externalSaveRequestId, onExternalSaveComplete, saveCodeToDiagram]);

  useEffect(() => {
    if (latestExternalDiscardRequestIdRef.current === externalDiscardRequestId) {
      return;
    }

    latestExternalDiscardRequestIdRef.current = externalDiscardRequestId;
    void refreshTerraformCode(currentDiagramFingerprint);
  }, [currentDiagramFingerprint, externalDiscardRequestId, refreshTerraformCode]);

  useEffect(() => {
    const previousAddresses = latestDiagramResourceAddressesRef.current;
    latestDiagramResourceAddressesRef.current = currentDiagramResourceAddresses;

    if (!previousAddresses || !hasLocalEdits) {
      return;
    }

    const deletedAddresses = Array.from(previousAddresses).filter(
      (address) => !currentDiagramResourceAddresses.has(address)
    );

    if (deletedAddresses.length === 0) {
      return;
    }

    const nextFiles = removeTerraformBlocksByAddress(terraformFiles, deletedAddresses);
    const didRemoveBlock = nextFiles.some((file, index) => file !== terraformFiles[index]);

    if (!didRemoveBlock) {
      return;
    }

    codeVersionRef.current += 1;
    const hasRemainingTerraformCode = nextFiles.some((file) => file.code.trim().length > 0);
    setTerraformFiles(nextFiles);
    setDiagnostics([]);
    onDiagnosticsChange([]);
    setHasLocalEdits(hasRemainingTerraformCode);
    setSaveBanner(hasRemainingTerraformCode ? { kind: "dirty" } : null);
    setTerraformPreviewExplanation(null);
    setTerraformPreviewExplanationMessage("");
    setTerraformPreviewExplanationState("idle");
    setExplainedTerraformPreviewKey("");
    setStatusMessage("다이어그램 삭제 반영됨");
    if (!hasRemainingTerraformCode) {
      latestDiagramFingerprintRef.current = currentDiagramFingerprint;
      onDirtyChange(false);
    }
  }, [
    currentDiagramFingerprint,
    currentDiagramResourceAddresses,
    hasLocalEdits,
    onDiagnosticsChange,
    onDirtyChange,
    terraformFiles
  ]);

  useEffect(() => {
    if (hasLocalEdits) {
      return;
    }

    if (latestDiagramFingerprintRef.current === currentDiagramFingerprint) {
      return;
    }

    const timerId = setTimeout(() => {
      void refreshTerraformCode(currentDiagramFingerprint);
    }, 250);

    return () => clearTimeout(timerId);
  }, [currentDiagramFingerprint, hasLocalEdits, refreshTerraformCode]);

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
    setCodeScrollLeft(textarea.scrollLeft);

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
    setCodeScrollLeft(event.currentTarget.scrollLeft);

    if (lineNumberRef.current) {
      lineNumberRef.current.scrollTop = event.currentTarget.scrollTop;
    }
  }

  function handleCodeChange(nextCode: string): void {
    codeVersionRef.current += 1;
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
              ? "Terraform 오류가 있습니다. Issues 탭에서 확인하세요."
              : "저장하지 않은 Terraform 변경이 있습니다. Ctrl+S로 저장하세요."}
          </span>
          <button data-terraform-issues-navigation onClick={handleSeeMore} type="button">
            Issues 탭으로 이동
          </button>
        </div>
      ) : null}

      {errorDiagnostics.length > 0 ? (
        <div className={styles.terraformIssueBanner} role="status">
          <span>Terraform 오류가 있습니다. 자세한 내용은 Issues 탭에서 확인하세요.</span>
          <button data-terraform-issues-navigation onClick={handleSeeMore} type="button">
            Issues 탭으로 이동
          </button>
        </div>
      ) : null}

      <div className={styles.terraformEditorFrame}>
        <ol ref={lineNumberRef} className={styles.terraformLineNumbers} aria-hidden="true">
          {lineNumbers.map((lineNumber) => (
            <li
              className={diagnosticLineNumberSet.has(lineNumber) ? styles.terraformLineNumberError : undefined}
              key={lineNumber}
            >
              {lineNumber}
            </li>
          ))}
        </ol>
        <div className={styles.terraformSyntaxHighlightLayer} aria-hidden="true">
          <pre className={styles.terraformSyntaxHighlightCode} style={terraformSyntaxHighlightStyle}>
            {highlightedTerraformLines.map((line) => (
              <span
                className={
                  line.hasDiagnostic
                    ? `${styles.terraformHighlightedLine} ${styles.terraformHighlightedLineError}`
                    : styles.terraformHighlightedLine
                }
                key={line.line}
              >
                {line.tokens.map(renderTerraformToken)}
              </span>
            ))}
          </pre>
        </div>
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

    </div>
  );
});
