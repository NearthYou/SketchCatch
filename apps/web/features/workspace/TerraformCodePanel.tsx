import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { KeyboardEvent as ReactKeyboardEvent, UIEvent } from "react";
import type {
  ArchitectureDiagnostic,
  DiagramJson,
  TerraformDiagnostic,
  TerraformSourceLocation,
  TerraformSyncFileInput
} from "@sketchcatch/types";
import { getApiErrorMessage } from "../../lib/api-client";
import type { DiagramEditorPanelContext } from "../diagram-editor";
import { TerraformCodeEditorSurface } from "./TerraformCodeEditorSurface";
import { TerraformCodeStatus } from "./TerraformCodeStatus";
import { TerraformCodeToolbar } from "./TerraformCodeToolbar";
import { generateTerraformCode, syncTerraformToDiagram, validateTerraformCode } from "./api";
import {
  combineTerraformFiles,
  compareTerraformFileNames,
  createTerraformDiagramRequestGuard,
  createTerraformFilesForRefresh,
  createTerraformFilesFromGeneratedCode,
  createInitialTerraformFiles,
  findTerraformBlockForNode,
  getDiagramTerraformAddresses,
  getEffectivePreservedTerraformAddresses,
  getTerraformAddressesRemovedFromDiagram,
  getTerraformFileCode,
  getTerraformFileOptions,
  getTerraformSourceClassificationAfterRefresh,
  hasAuthoritativeTerraformSource,
  hasTerraformResourceBlocks,
  markTerraformSourceAuthoritative,
  parseTerraformFiles,
  removeTerraformBlocksAndDependentOutputsByAddress,
  toTerraformRefreshFingerprint,
  type TerraformSaveBanner,
  type TerraformVirtualFile
} from "./terraform-panel-utils";
import { createTerraformDiagnosticLineNumbers } from "./terraform-diagnostic-line-highlights";
import { applyTerraformEditorIndentation } from "./terraform-editor-indentation";
import { createTerraformHighlightedLines } from "./terraform-code-highlighting";
import {
  applyAllTerraformSyncProposals,
  rewriteTerraformReferencesForSyncProposals
} from "./terraform-sync-proposals";
import {
  applyTerraformSafeFixesAtomically,
  type TerraformSafeFixBatchResult,
  type TerraformSafeFixResult
} from "./terraform-safe-fixes";
import {
  combineTerraformDiagnostics,
  createTerraformDiagnosticKey
} from "./terraform-issues-state";
import {
  createWorkspaceTerraformFingerprint,
  type TerraformSafeFixApplyItem,
  type WorkspaceTerraformAiCodeContext
} from "./workspace-terraform-ai";
import type { RequestState } from "./workspace-right-panel.types";
import styles from "./workspace.module.css";

const TERRAFORM_EDITOR_LINE_HEIGHT = 19.2;
const TERRAFORM_EDITOR_VERTICAL_PADDING = 12;

type TerraformPreviewExplanationScope = {
  readonly key: string;
  readonly label: string;
  readonly terraformCode: string;
};

function createTerraformPreviewExplanationScope({
  activeFileName,
  displayedTerraformCode,
  highlightedBlock,
  inspectedBlock,
  selectedBlock
}: {
  readonly activeFileName: string;
  readonly displayedTerraformCode: string;
  readonly highlightedBlock: { readonly address: string; readonly code: string } | null;
  readonly inspectedBlock: { readonly address: string; readonly code: string } | null;
  readonly selectedBlock: { readonly address: string; readonly code: string } | null;
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

  if (selectedBlock) {
    return createTerraformPreviewExplanationScopeValue(
      selectedBlock.code,
      `선택 코드 · ${selectedBlock.address}`
    );
  }

  return createTerraformPreviewExplanationScopeValue(
    displayedTerraformCode,
    `현재 파일 · ${activeFileName}`
  );
}

function createTerraformPreviewExplanationScopeValue(
  code: string,
  label: string
): TerraformPreviewExplanationScope {
  const trimmedCode = code.trim();

  return {
    key: JSON.stringify({ code: trimmedCode, label }),
    label,
    terraformCode: trimmedCode
  };
}

function getTerraformLineStartOffset(code: string, line: number): number {
  if (line <= 1) {
    return 0;
  }

  let currentLine = 1;

  for (let index = 0; index < code.length; index += 1) {
    const character = code[index];

    if (character === "\n") {
      currentLine += 1;

      if (currentLine === line) {
        return index + 1;
      }
    }
  }

  return code.length;
}

function clampTerraformEditorScrollTop(
  targetScrollTop: number,
  textarea: HTMLTextAreaElement
): number {
  return Math.min(
    Math.max(0, textarea.scrollHeight - textarea.clientHeight),
    Math.max(0, targetScrollTop)
  );
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

export type PreparedTerraformArtifactSource = {
  readonly diagramJson: DiagramJson;
  readonly terraformCode: string;
  readonly terraformFiles: readonly TerraformSyncFileInput[];
};

export type TerraformCodePanelHandle = {
  readonly applyTerraformSafeFix: (
    diagnostic: TerraformDiagnostic,
    codePreview?: TerraformSafeFixApplyItem["codePreview"]
  ) => Promise<TerraformSafeFixResult>;
  readonly applyTerraformSafeFixes: (
    fixes: readonly TerraformSafeFixApplyItem[]
  ) => Promise<TerraformSafeFixBatchResult>;
  readonly getCurrentTerraformCode: () => string;
  readonly getTerraformFiles: () => readonly TerraformVirtualFile[];
  readonly openTerraformSourceLocation: (sourceLocation: TerraformSourceLocation) => void;
  readonly prepareTerraformArtifact: () => Promise<PreparedTerraformArtifactSource>;
  readonly validateCurrentTerraform: () => Promise<TerraformDiagnostic[]>;
};

export type TerraformFilesReplacementRequest = {
  readonly diagramFingerprint: string;
  readonly files: readonly TerraformSyncFileInput[];
  readonly id: number;
  readonly notifyFilesChange?: boolean | undefined;
};

// Terraform 생성, 검증, 저장 상태를 관리하고 화면 전용 컴포넌트에 결과만 전달합니다.
export const TerraformCodePanel = forwardRef<
  TerraformCodePanelHandle,
  {
    readonly context: DiagramEditorPanelContext;
    readonly initialTerraformFiles?: readonly TerraformSyncFileInput[] | undefined;
    readonly externalTerraformFilesReplacement?:
      | TerraformFilesReplacementRequest
      | null
      | undefined;
    readonly externalDiscardRequestId: number;
    readonly externalSaveRequestId: number;
    readonly isMutationLocked: boolean;
    readonly isVisible: boolean;
    readonly onArchitectureDiagnosticsChange: (diagnostics: ArchitectureDiagnostic[]) => void;
    readonly onDiagnosticsChange: (diagnostics: TerraformDiagnostic[]) => void;
    readonly onDirtyChange: (isDirty: boolean) => void;
    readonly onExternalSaveComplete: (saved: boolean, requestId: number) => void;
    readonly onTerraformAiCodeContextChange: (
      context: WorkspaceTerraformAiCodeContext
    ) => void;
    readonly onTerraformAiInteraction: () => void;
    readonly onTerraformFilesChange?:
      | ((files: readonly TerraformSyncFileInput[]) => void)
      | undefined;
    readonly onTerraformFilesReplacementApplied?: ((id: number) => void) | undefined;
  }
>(function TerraformCodePanel(
  {
    context,
    initialTerraformFiles,
    externalTerraformFilesReplacement,
    externalDiscardRequestId,
    externalSaveRequestId,
    isMutationLocked,
    isVisible,
    onArchitectureDiagnosticsChange,
    onDiagnosticsChange,
    onDirtyChange,
    onExternalSaveComplete,
    onTerraformAiCodeContextChange,
    onTerraformAiInteraction,
    onTerraformFilesChange,
    onTerraformFilesReplacementApplied
  },
  ref
) {
  const initialTerraformSourceFiles = createInitialTerraformFiles(
    context.diagram,
    initialTerraformFiles
  );
  const hasInitialTerraformResourceBlocks = hasTerraformResourceBlocks(
    initialTerraformSourceFiles
  );
  const initialTerraformFingerprint =
    initialTerraformFiles?.length && hasAuthoritativeTerraformSource(context.diagram)
      ? toTerraformRefreshFingerprint(context.diagram)
      : "";
  const [terraformFiles, setTerraformFiles] = useState<TerraformVirtualFile[]>(() =>
    initialTerraformSourceFiles
  );
  const mutationLockedRef = useRef(isMutationLocked);
  mutationLockedRef.current = isMutationLocked;
  const terraformBaselineFilesRef = useRef<TerraformVirtualFile[]>(
    terraformFiles.map((file) => ({ ...file }))
  );
  const [activeFileName, setActiveFileName] = useState(() =>
    terraformFiles.some(({ fileName }) => fileName === "main.tf")
      ? "main.tf"
      : (terraformFiles[0]?.fileName ?? "main.tf")
  );
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const [fileSearchQuery, setFileSearchQuery] = useState("");
  const [diagnostics, setDiagnostics] = useState<TerraformDiagnostic[]>([]);
  const [pendingSourceLocation, setPendingSourceLocation] =
    useState<TerraformSourceLocation | null>(null);
  const [activeSourceHighlightLine, setActiveSourceHighlightLine] = useState<number | null>(null);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [statusMessage, setStatusMessage] = useState("main.tf");
  const [isTerraformPreviewStale, setIsTerraformPreviewStale] = useState(
    initialTerraformFingerprint.length === 0
  );
  const [hasLocalEdits, setHasLocalEdits] = useState(false);
  const [saveBanner, setSaveBanner] = useState<TerraformSaveBanner | null>(null);
  const [codeScrollTop, setCodeScrollTop] = useState(0);
  const [codeScrollLeft, setCodeScrollLeft] = useState(0);
  const handleTerraformFocusAiInteraction = useCallback((): void => {
    if (pendingSourceLocation !== null) {
      return;
    }

    onTerraformAiInteraction();
  }, [onTerraformAiInteraction, pendingSourceLocation]);
  const codeRequestIdRef = useRef(0);
  const codeVersionRef = useRef(0);
  const isPreparingTerraformArtifactRef = useRef(false);
  const latestDiagramFingerprintRef = useRef(initialTerraformFingerprint);
  const diagramRequestGuardRef = useRef(
    createTerraformDiagramRequestGuard(toTerraformRefreshFingerprint(context.diagram))
  );
  const latestSuccessfulTerraformPreviewFingerprintRef = useRef(initialTerraformFingerprint);
  const latestDiagramResourceAddressesRef = useRef<Set<string> | null>(
    initialTerraformFingerprint ? getDiagramTerraformAddresses(context.diagram) : null
  );
  const latestExternalDiscardRequestIdRef = useRef(externalDiscardRequestId);
  const latestExternalSaveRequestIdRef = useRef(externalSaveRequestId);
  const latestExternalTerraformFilesReplacementIdRef = useRef<number | null>(null);
  const latestTerraformRefreshRequestIdRef = useRef(context.terraformRefreshRequestId);
  const classifiedPreservedResourceAddressesRef = useRef(new Set<string>());
  const initialTerraformSourceClassifiedRef = useRef(!hasInitialTerraformResourceBlocks);
  const syntaxHighlightRef = useRef<HTMLPreElement | null>(null);
  const lineNumberRef = useRef<HTMLOListElement | null>(null);
  const lastScrolledNodeIdRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(
    () => () => {
      codeRequestIdRef.current += 1;
      codeVersionRef.current += 1;
    },
    []
  );

  const combinedTerraformCode = useMemo(
    () => combineTerraformFiles(terraformFiles),
    [terraformFiles]
  );
  const activeFileCode = useMemo(
    () => getTerraformFileCode(terraformFiles, activeFileName),
    [activeFileName, terraformFiles]
  );
  const hasTerraformCode = combinedTerraformCode.trim().length > 0;
  const currentDiagramFingerprint = useMemo(
    () => toTerraformRefreshFingerprint(context.diagram),
    [context.diagram]
  );
  useLayoutEffect(() => {
    diagramRequestGuardRef.current.update(currentDiagramFingerprint);
  }, [context.diagram, currentDiagramFingerprint]);
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
  const isTerraformPreviewSynced =
    !isTerraformPreviewStale &&
    latestSuccessfulTerraformPreviewFingerprintRef.current === currentDiagramFingerprint &&
    !hasLocalEdits;
  const previewSnapshotSummary = isResourceCodeMode
    ? `${inspectedBlock?.fileName ?? activeFileName} resource code`
    : isTerraformPreviewSynced
      ? `${terraformFileOptions.length} files | ${context.nodes.length} nodes`
      : isTerraformPreviewStale
        ? `다이어그램 변경 미반영 | ${context.nodes.length} nodes`
        : `수정 중 | ${context.nodes.length} nodes`;
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
        inspectedBlock,
        selectedBlock
      }),
    [activeFileName, displayedTerraformCode, highlightedBlock, inspectedBlock, selectedBlock]
  );
  const terraformAiFiles = useMemo(
    () => toTerraformValidationFiles(terraformFiles),
    [terraformFiles]
  );
  const terraformAiCodeContext = useMemo<WorkspaceTerraformAiCodeContext>(
    () => ({
      combinedTerraformCode,
      files: terraformAiFiles,
      fingerprint: createWorkspaceTerraformFingerprint(terraformAiFiles),
      reviewScope: {
        key: terraformPreviewExplanationScope.key,
        label: terraformPreviewExplanationScope.label,
        terraformCode: terraformPreviewExplanationScope.terraformCode
      }
    }),
    [combinedTerraformCode, terraformAiFiles, terraformPreviewExplanationScope]
  );
  useEffect(() => {
    onTerraformAiCodeContextChange(terraformAiCodeContext);
  }, [onTerraformAiCodeContextChange, terraformAiCodeContext]);
  const lineNumbers = useMemo(
    () =>
      Array.from(
        { length: Math.max(1, displayedTerraformCode.split(/\r\n|\r|\n/).length) },
        (_, index) => index + 1
      ),
    [displayedTerraformCode]
  );
  const highlightedBlockStyle = highlightedBlock
    ? {
        height: `${Math.max(1, highlightedBlock.endLine - highlightedBlock.startLine + 1) * TERRAFORM_EDITOR_LINE_HEIGHT}px`,
        top: `${TERRAFORM_EDITOR_VERTICAL_PADDING + (highlightedBlock.startLine - 1) * TERRAFORM_EDITOR_LINE_HEIGHT - codeScrollTop}px`
      }
    : null;
  const sourceLineHighlightStyle =
    activeSourceHighlightLine !== null
      ? {
          height: `${TERRAFORM_EDITOR_LINE_HEIGHT}px`,
          top: `${TERRAFORM_EDITOR_VERTICAL_PADDING + (activeSourceHighlightLine - 1) * TERRAFORM_EDITOR_LINE_HEIGHT - codeScrollTop}px`
        }
      : null;

  const openTerraformSourceLocation = useCallback(
    (sourceLocation: TerraformSourceLocation): void => {
      context.closeInspectedNode();
      setActiveFileName(sourceLocation.fileName);
      setPendingSourceLocation(sourceLocation);
      setStatusMessage(`${sourceLocation.fileName}:${sourceLocation.line}`);
    },
    [context]
  );
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
      transform: `translate3d(${-codeScrollLeft}px, ${-codeScrollTop}px, 0)`
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

  /** Board 적용 lock 전후의 비동기 생성 결과가 Terraform source를 덮지 않게 합니다. */
  const refreshTerraformCode = useCallback(
    async (diagramFingerprint: string, preserveExistingSource = true) => {
      if (mutationLockedRef.current) return;

      const requestId = codeRequestIdRef.current + 1;
      const requestCodeVersion = codeVersionRef.current;
      const requestDiagram = diagramRequestGuardRef.current.capture();
      const requestDiagramRevision = context.getDiagramRevision();

      if (requestDiagram.fingerprint !== diagramFingerprint) {
        return;
      }

      codeRequestIdRef.current = requestId;

      setRequestState("loading");

      try {
        const sourceWasClassified = initialTerraformSourceClassifiedRef.current;
        let nextClassifiedPreservedResourceAddresses =
          classifiedPreservedResourceAddressesRef.current;
        let shouldCommitInitialSourceClassification = false;

        if (!initialTerraformSourceClassifiedRef.current) {
          const classification = await syncTerraformToDiagram({
            diagramJson: context.diagram,
            terraformCode: combinedTerraformCode,
            terraformFiles: toTerraformValidationFiles(terraformFiles)
          });

          if (
            mutationLockedRef.current ||
            requestId !== codeRequestIdRef.current ||
            requestCodeVersion !== codeVersionRef.current ||
            requestDiagramRevision !== context.getDiagramRevision() ||
            !diagramRequestGuardRef.current.isCurrent(requestDiagram)
          ) {
            if (requestId === codeRequestIdRef.current) {
              setRequestState("idle");
            }
            return;
          }

          nextClassifiedPreservedResourceAddresses = new Set(
            classification.preservedResourceAddresses ?? []
          );
          shouldCommitInitialSourceClassification = true;
        }

        const generated = await generateTerraformCode(context.diagram);

        if (
          mutationLockedRef.current ||
          requestId !== codeRequestIdRef.current ||
          requestCodeVersion !== codeVersionRef.current ||
          requestDiagramRevision !== context.getDiagramRevision() ||
          !diagramRequestGuardRef.current.isCurrent(requestDiagram)
        ) {
          if (requestId === codeRequestIdRef.current) {
            setRequestState("idle");
          }
          return;
        }

        onArchitectureDiagnosticsChange(generated.architectureDiagnostics);
        const generatedFiles = createTerraformFilesFromGeneratedCode(
          context.diagram,
          generated.terraformCode
        );
        const effectivePreservedAddresses = getEffectivePreservedTerraformAddresses(
          context.diagram,
          nextClassifiedPreservedResourceAddresses
        );
        const nextFiles = createTerraformFilesForRefresh({
          baselineFiles: terraformBaselineFilesRef.current,
          currentFiles: terraformFiles,
          generatedFiles,
          preserveExistingSource,
          preservedResourceAddresses: effectivePreservedAddresses
        });
        if (
          mutationLockedRef.current ||
          requestId !== codeRequestIdRef.current ||
          requestCodeVersion !== codeVersionRef.current ||
          requestDiagramRevision !== context.getDiagramRevision() ||
          !diagramRequestGuardRef.current.isCurrent(requestDiagram)
        ) {
          return;
        }

        initialTerraformSourceClassifiedRef.current =
          getTerraformSourceClassificationAfterRefresh({
            currentFiles: terraformFiles,
            didClassifyCurrentSource: shouldCommitInitialSourceClassification,
            nextFiles,
            preserveExistingSource,
            sourceWasClassified
          });
        if (shouldCommitInitialSourceClassification) {
          classifiedPreservedResourceAddressesRef.current =
            nextClassifiedPreservedResourceAddresses;
        }
        codeVersionRef.current += 1;
        terraformBaselineFilesRef.current = nextFiles.map((file) => ({ ...file }));
        setTerraformFiles(nextFiles);
        context.commitTerraformSourceAuthority();
        onTerraformFilesChange?.(toTerraformValidationFiles(nextFiles));
        setActiveFileName((currentFileName) =>
          nextFiles.some((file) => file.fileName === currentFileName) ? currentFileName : "main.tf"
        );
        setDiagnostics([]);
        onDiagnosticsChange([]);
        setHasLocalEdits(false);
        setSaveBanner(null);
        setStatusMessage("그래프 기준으로 동기화됨");
        setIsTerraformPreviewStale(false);
        latestSuccessfulTerraformPreviewFingerprintRef.current = diagramFingerprint;
        latestDiagramFingerprintRef.current = diagramFingerprint;
        setRequestState("idle");
        onDirtyChange(false);
      } catch {
        if (
          mutationLockedRef.current ||
          requestId !== codeRequestIdRef.current ||
          requestCodeVersion !== codeVersionRef.current ||
          requestDiagramRevision !== context.getDiagramRevision() ||
          !diagramRequestGuardRef.current.isCurrent(requestDiagram)
        ) {
          if (requestId === codeRequestIdRef.current) {
            setRequestState("idle");
          }
          return;
        }

        setIsTerraformPreviewStale(true);
        setStatusMessage("Terraform Preview 생성 실패: 이전 Preview 표시 중");
        latestDiagramFingerprintRef.current = "";
        setRequestState("error");
      }
    },
    [
      combinedTerraformCode,
      context.commitTerraformSourceAuthority,
      context.diagram,
      context.getDiagramRevision,
      onArchitectureDiagnosticsChange,
      onDiagnosticsChange,
      onDirtyChange,
      onTerraformFilesChange,
      terraformFiles
    ]
  );

  const runTerraformModuleValidation = useCallback(async (): Promise<TerraformDiagnostic[]> => {
    if (!combinedTerraformCode.trim()) {
      setDiagnostics([]);
      onDiagnosticsChange([]);
      return [];
    }

    const requestCodeVersion = codeVersionRef.current;
    setStatusMessage("Terraform 오류 확인 중");

    const validationDiagnostics = await validateTerraformVirtualFiles({
      combinedTerraformCode,
      files: terraformFiles
    });

    if (mutationLockedRef.current || requestCodeVersion !== codeVersionRef.current) {
      return [createStaleTerraformValidationDiagnostic()];
    }

    setDiagnostics(validationDiagnostics);
    onDiagnosticsChange(validationDiagnostics);

    if (hasBlockingTerraformDiagnostic(validationDiagnostics)) {
      setStatusMessage("진단 확인 필요");
      return validationDiagnostics;
    }

    setStatusMessage(validationDiagnostics.length === 0 ? "검증 완료" : "진단 확인 필요");
    return validationDiagnostics;
  }, [combinedTerraformCode, onDiagnosticsChange, terraformFiles]);

  /** lock이 열린 동안에만 Terraform과 Diagram을 함께 동기화합니다. */
  const syncTerraformCodeToDiagram =
    useCallback(async (): Promise<PreparedTerraformArtifactSource | null> => {
      if (mutationLockedRef.current) return null;

      const requestCodeVersion = codeVersionRef.current;
      const requestDiagram = diagramRequestGuardRef.current.capture();
      const requestDiagramRevision = context.getDiagramRevision();
      const validationDiagnostics = combinedTerraformCode.trim()
        ? await runTerraformModuleValidation()
        : [];

      if (
        mutationLockedRef.current ||
        requestCodeVersion !== codeVersionRef.current ||
        requestDiagramRevision !== context.getDiagramRevision() ||
        !diagramRequestGuardRef.current.isCurrent(requestDiagram)
      ) {
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

      let syncResult = await syncTerraformToDiagram({
        diagramJson: context.diagram,
        terraformCode: combinedTerraformCode,
        terraformFiles: toTerraformValidationFiles(terraformFiles)
      });

      if (
        mutationLockedRef.current ||
        requestCodeVersion !== codeVersionRef.current ||
        requestDiagramRevision !== context.getDiagramRevision() ||
        !diagramRequestGuardRef.current.isCurrent(requestDiagram)
      ) {
        return null;
      }

      let nextClassifiedPreservedResourceAddresses = new Set(
        syncResult.preservedResourceAddresses ?? []
      );

      const rewrittenTerraformFiles = rewriteTerraformReferencesForSyncProposals(
        terraformFiles,
        syncResult.proposals ?? []
      );
      const didRewriteTerraformReferences = rewrittenTerraformFiles.some(
        (file, index) => file !== terraformFiles[index]
      );
      let savedTerraformCode = combinedTerraformCode;
      let savedValidationDiagnostics = validationDiagnostics;

      if (didRewriteTerraformReferences) {
        savedTerraformCode = combineTerraformFiles(rewrittenTerraformFiles);
        savedValidationDiagnostics = await validateTerraformVirtualFiles({
          combinedTerraformCode: savedTerraformCode,
          files: rewrittenTerraformFiles
        });

        if (
          mutationLockedRef.current ||
          requestCodeVersion !== codeVersionRef.current ||
          requestDiagramRevision !== context.getDiagramRevision() ||
          !diagramRequestGuardRef.current.isCurrent(requestDiagram)
        ) {
          return null;
        }

        const rewrittenValidationError = savedValidationDiagnostics.find(
          (diagnostic) => diagnostic.severity === "error"
        );

        if (rewrittenValidationError) {
          setDiagnostics(savedValidationDiagnostics);
          onDiagnosticsChange(savedValidationDiagnostics);
          setSaveBanner(null);
          setStatusMessage("저장 실패");
          return null;
        }

        syncResult = await syncTerraformToDiagram({
          diagramJson: context.diagram,
          terraformCode: savedTerraformCode,
          terraformFiles: toTerraformValidationFiles(rewrittenTerraformFiles)
        });

        if (
          mutationLockedRef.current ||
          requestCodeVersion !== codeVersionRef.current ||
          requestDiagramRevision !== context.getDiagramRevision() ||
          !diagramRequestGuardRef.current.isCurrent(requestDiagram)
        ) {
          return null;
        }

        nextClassifiedPreservedResourceAddresses = new Set(
          syncResult.preservedResourceAddresses ?? []
        );
      }

      const nextDiagnostics = combineTerraformDiagnostics(
        savedValidationDiagnostics,
        syncResult.diagnostics
      );

      setDiagnostics(nextDiagnostics);
      onDiagnosticsChange(nextDiagnostics);

      const syncError = nextDiagnostics.find((diagnostic) => diagnostic.severity === "error");

      if (syncError) {
        setSaveBanner(null);
        setStatusMessage("저장 실패");
        return null;
      }

      const nextDiagramJson =
        syncResult.proposals && syncResult.proposals.length > 0
          ? applyAllTerraformSyncProposals(syncResult.diagramJson, syncResult.proposals)
          : syncResult.diagramJson;

      const savedTerraformFiles = didRewriteTerraformReferences
        ? rewrittenTerraformFiles
        : terraformFiles;
      const authoritativeDiagramJson = markTerraformSourceAuthoritative(nextDiagramJson);

      if (
        mutationLockedRef.current ||
        requestCodeVersion !== codeVersionRef.current ||
        requestDiagramRevision !== context.getDiagramRevision() ||
        !diagramRequestGuardRef.current.isCurrent(requestDiagram)
      ) {
        return null;
      }

      if (didRewriteTerraformReferences) {
        codeVersionRef.current += 1;
        setTerraformFiles(rewrittenTerraformFiles);
      }

      classifiedPreservedResourceAddressesRef.current = nextClassifiedPreservedResourceAddresses;
      initialTerraformSourceClassifiedRef.current = true;
      context.applyDiagramJson(authoritativeDiagramJson);
      onTerraformFilesChange?.(toTerraformValidationFiles(savedTerraformFiles));
      terraformBaselineFilesRef.current = savedTerraformFiles.map((file) => ({ ...file }));
      latestSuccessfulTerraformPreviewFingerprintRef.current =
        toTerraformRefreshFingerprint(authoritativeDiagramJson);
      latestDiagramFingerprintRef.current = toTerraformRefreshFingerprint(authoritativeDiagramJson);
      setHasLocalEdits(false);
      setSaveBanner(null);
      setIsTerraformPreviewStale(false);
      setStatusMessage("저장됨");
      onDirtyChange(false);

      return {
        diagramJson: authoritativeDiagramJson,
        terraformCode: savedTerraformCode,
        terraformFiles: toTerraformValidationFiles(savedTerraformFiles)
      };
    }, [
      combinedTerraformCode,
      context,
      onDiagnosticsChange,
      onDirtyChange,
      onTerraformFilesChange,
      runTerraformModuleValidation,
      terraformFiles
    ]);

  /** Board 적용 중에는 별도의 Terraform 저장을 시작하지 않습니다. */
  const saveCodeToDiagram = useCallback(async (): Promise<boolean> => {
    if (requestState === "loading" || mutationLockedRef.current) {
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
  }, [hasTerraformCode, onDiagnosticsChange, requestState, runTerraformModuleValidation]);

  /** AI 안전 수정도 같은 mutation lock과 비동기 stale 검사를 통과해야 반영합니다. */
  const applyTerraformSafeFixesToCode = useCallback(
    async (
      fixes: readonly TerraformSafeFixApplyItem[]
    ): Promise<TerraformSafeFixBatchResult> => {
      if (
        requestState === "loading" ||
        isPreparingTerraformArtifactRef.current ||
        mutationLockedRef.current
      ) {
        return {
          applied: false,
          files: terraformFiles,
          message: "Terraform 요청을 처리하는 중입니다."
        };
      }

      const preflightResult = applyTerraformSafeFixesAtomically({
        files: terraformFiles,
        fixes
      });

      if (!preflightResult.applied) {
        return preflightResult;
      }

      const nextFiles = preflightResult.files.map((file) => ({ ...file }));
      const nextCombinedTerraformCode = combineTerraformFiles(nextFiles);
      const originalDiagnosticKeys = new Set(
        fixes.map(({ diagnostic }) => createTerraformDiagnosticKey(diagnostic))
      );

      codeVersionRef.current += 1;
      const requestCodeVersion = codeVersionRef.current;
      const requestDiagram = diagramRequestGuardRef.current.capture();
      const requestDiagramRevision = context.getDiagramRevision();
      setRequestState("loading");
      setTerraformFiles(nextFiles);
      setHasLocalEdits(true);
      setSaveBanner({ kind: "dirty" });
      setStatusMessage("AI 수정안 적용 중");

      try {
        const validationDiagnostics = await validateTerraformVirtualFiles({
          combinedTerraformCode: nextCombinedTerraformCode,
          files: nextFiles
        });

        if (
          mutationLockedRef.current ||
          requestCodeVersion !== codeVersionRef.current ||
          requestDiagramRevision !== context.getDiagramRevision() ||
          !diagramRequestGuardRef.current.isCurrent(requestDiagram)
        ) {
          setRequestState("idle");
          return {
            applied: true,
            files: nextFiles,
            message: "수정안은 적용됐지만 이후 Terraform 코드가 변경되어 후속 검증 결과를 반영하지 않았습니다."
          };
        }

        setDiagnostics(validationDiagnostics);
        onDiagnosticsChange(validationDiagnostics);

        const stillHasOriginalDiagnostic = validationDiagnostics.some((nextDiagnostic) =>
          originalDiagnosticKeys.has(createTerraformDiagnosticKey(nextDiagnostic))
        );

        if (hasBlockingTerraformDiagnostic(validationDiagnostics) && stillHasOriginalDiagnostic) {
          setRequestState("idle");
          setStatusMessage("재검증 필요");
          return {
            applied: true,
            files: nextFiles,
            message: "수정안은 적용됐지만 같은 Terraform 진단이 남아 있습니다."
          };
        }

        if (hasBlockingTerraformDiagnostic(validationDiagnostics)) {
          setRequestState("idle");
          setStatusMessage("재검증 필요");
          return {
            applied: true,
            files: nextFiles,
            message:
              "AI 수정안을 적용했습니다. 남아 있는 Terraform 이슈를 Issues 탭에서 확인하세요."
          };
        }

        const syncResult = await syncTerraformToDiagram({
          diagramJson: context.diagram,
          terraformCode: nextCombinedTerraformCode,
          terraformFiles: toTerraformValidationFiles(nextFiles)
        });

        if (
          mutationLockedRef.current ||
          requestCodeVersion !== codeVersionRef.current ||
          requestDiagramRevision !== context.getDiagramRevision() ||
          !diagramRequestGuardRef.current.isCurrent(requestDiagram)
        ) {
          setRequestState("idle");
          return {
            applied: true,
            files: nextFiles,
            message: "수정안은 적용됐지만 이후 Terraform 코드가 변경되어 동기화 결과를 반영하지 않았습니다."
          };
        }

        const nextDiagnostics = combineTerraformDiagnostics(
          validationDiagnostics,
          syncResult.diagnostics
        );

        setDiagnostics(nextDiagnostics);
        onDiagnosticsChange(nextDiagnostics);

        const syncError = nextDiagnostics.find(
          (nextDiagnostic) => nextDiagnostic.severity === "error"
        );

        if (syncError) {
          setRequestState("idle");
          setStatusMessage("재검증 필요");
          return {
            applied: true,
            files: nextFiles,
            message: "수정안은 적용됐지만 다이어그램 동기화 진단이 남아 있습니다."
          };
        }

        const nextDiagramJson =
          syncResult.proposals && syncResult.proposals.length > 0
            ? applyAllTerraformSyncProposals(syncResult.diagramJson, syncResult.proposals)
            : syncResult.diagramJson;
        const authoritativeDiagramJson = markTerraformSourceAuthoritative(nextDiagramJson);

        if (
          mutationLockedRef.current ||
          requestCodeVersion !== codeVersionRef.current ||
          requestDiagramRevision !== context.getDiagramRevision() ||
          !diagramRequestGuardRef.current.isCurrent(requestDiagram)
        ) {
          setRequestState("idle");
          return {
            applied: true,
            files: nextFiles,
            message: "수정안은 적용됐지만 다이어그램이 변경되어 동기화 결과를 반영하지 않았습니다."
          };
        }

        classifiedPreservedResourceAddressesRef.current = new Set(
          syncResult.preservedResourceAddresses ?? []
        );
        initialTerraformSourceClassifiedRef.current = true;
        context.applyDiagramJson(authoritativeDiagramJson);
        onTerraformFilesChange?.(toTerraformValidationFiles(nextFiles));
        terraformBaselineFilesRef.current = nextFiles.map((file) => ({ ...file }));
        latestSuccessfulTerraformPreviewFingerprintRef.current =
          toTerraformRefreshFingerprint(authoritativeDiagramJson);
        latestDiagramFingerprintRef.current =
          toTerraformRefreshFingerprint(authoritativeDiagramJson);
        setHasLocalEdits(false);
        setSaveBanner(null);
        setIsTerraformPreviewStale(false);
        setRequestState("idle");
        setStatusMessage("AI 수정안 저장됨");
        onDirtyChange(false);

        return {
          applied: true,
          files: nextFiles,
          message: "AI 수정안을 적용하고 재검증/저장/다이어그램 동기화를 완료했습니다."
        };
      } catch (error) {
        if (
          mutationLockedRef.current ||
          requestCodeVersion !== codeVersionRef.current ||
          requestDiagramRevision !== context.getDiagramRevision() ||
          !diagramRequestGuardRef.current.isCurrent(requestDiagram)
        ) {
          setRequestState("idle");
          return {
            applied: true,
            files: nextFiles,
            message: "수정안은 적용됐지만 이후 코드 변경 때문에 후속 처리 결과를 반영하지 않았습니다."
          };
        }
        setRequestState("error");
        setStatusMessage("수정 후 재검증 필요");
        return {
          applied: true,
          files: nextFiles,
          message: getApiErrorMessage(
            error,
            "수정안은 적용됐지만 재검증 또는 다이어그램 동기화를 완료하지 못했습니다."
          )
        };
      }
    },
    [
      context,
      onDiagnosticsChange,
      onDirtyChange,
      onTerraformFilesChange,
      requestState,
      terraformFiles
    ]
  );

  const applyTerraformSafeFixToCode = useCallback(
    async (
      diagnostic: TerraformDiagnostic,
      codePreview?: TerraformSafeFixApplyItem["codePreview"]
    ): Promise<TerraformSafeFixResult> => {
      const result = await applyTerraformSafeFixesToCode([{ codePreview, diagnostic }]);

      return {
        applied: result.applied,
        code: combineTerraformFiles(result.files),
        message: result.message
      };
    },
    [applyTerraformSafeFixesToCode]
  );

  useImperativeHandle(
    ref,
    () => ({
      applyTerraformSafeFix: applyTerraformSafeFixToCode,
      applyTerraformSafeFixes: applyTerraformSafeFixesToCode,
      getCurrentTerraformCode: () => combinedTerraformCode,
      getTerraformFiles: () => terraformFiles,
      openTerraformSourceLocation,
      prepareTerraformArtifact: async () => {
        if (mutationLockedRef.current) {
          throw new Error("Board 정리안 적용이 끝난 뒤 다시 시도해 주세요.");
        }

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
    }),
    [
      applyTerraformSafeFixToCode,
      applyTerraformSafeFixesToCode,
      combinedTerraformCode,
      hasTerraformCode,
      openTerraformSourceLocation,
      requestState,
      syncTerraformCodeToDiagram,
      terraformFiles,
      validateCurrentTerraform
    ]
  );

  useLayoutEffect(() => {
    const replacement = externalTerraformFilesReplacement;

    if (
      isMutationLocked ||
      !replacement ||
      latestExternalTerraformFilesReplacementIdRef.current === replacement.id ||
      currentDiagramFingerprint !== replacement.diagramFingerprint
    ) {
      return;
    }

    latestExternalTerraformFilesReplacementIdRef.current = replacement.id;
    codeRequestIdRef.current += 1;
    codeVersionRef.current += 1;
    const nextFiles =
      replacement.files.length > 0
        ? replacement.files.map((file) => ({
            fileName: file.fileName,
            code: file.terraformCode
          }))
        : createTerraformFilesFromGeneratedCode(context.diagram, "");
    const hasSourceSeed = replacement.files.length > 0;
    const hasSourceResourceBlocks = hasTerraformResourceBlocks(nextFiles);

    terraformBaselineFilesRef.current = nextFiles.map((file) => ({ ...file }));
    classifiedPreservedResourceAddressesRef.current = new Set();
    initialTerraformSourceClassifiedRef.current = !hasSourceResourceBlocks;
    latestDiagramResourceAddressesRef.current = getDiagramTerraformAddresses(context.diagram);
    latestDiagramFingerprintRef.current = hasSourceSeed ? replacement.diagramFingerprint : "";
    latestSuccessfulTerraformPreviewFingerprintRef.current = hasSourceSeed
      ? replacement.diagramFingerprint
      : "";
    setTerraformFiles(nextFiles);
    setActiveFileName(
      nextFiles.some(({ fileName }) => fileName === "main.tf")
        ? "main.tf"
        : (nextFiles[0]?.fileName ?? "main.tf")
    );
    setDiagnostics([]);
    onDiagnosticsChange([]);
    setHasLocalEdits(false);
    setSaveBanner(null);
    setIsTerraformPreviewStale(!hasSourceSeed);
    setStatusMessage(hasSourceSeed ? "원본 Terraform seed 적용됨" : "Terraform Preview 생성 대기");
    setRequestState("idle");
    if (replacement.notifyFilesChange !== false) {
      onTerraformFilesChange?.(toTerraformValidationFiles(nextFiles));
    }
    onDirtyChange(false);
    onTerraformFilesReplacementApplied?.(replacement.id);
  }, [
    context.diagram,
    currentDiagramFingerprint,
    externalTerraformFilesReplacement,
    isMutationLocked,
    onDiagnosticsChange,
    onDirtyChange,
    onTerraformFilesChange,
    onTerraformFilesReplacementApplied
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
    classifiedPreservedResourceAddressesRef.current = new Set();
    initialTerraformSourceClassifiedRef.current = true;
    void refreshTerraformCode(currentDiagramFingerprint, false);
  }, [currentDiagramFingerprint, externalDiscardRequestId, refreshTerraformCode]);

  useEffect(() => {
    if (latestTerraformRefreshRequestIdRef.current === context.terraformRefreshRequestId) {
      return;
    }

    latestTerraformRefreshRequestIdRef.current = context.terraformRefreshRequestId;
    void refreshTerraformCode(currentDiagramFingerprint);
  }, [context.terraformRefreshRequestId, currentDiagramFingerprint, refreshTerraformCode]);

  useEffect(() => {
    if (isMutationLocked) return;

    const previousAddresses = latestDiagramResourceAddressesRef.current;
    latestDiagramResourceAddressesRef.current = currentDiagramResourceAddresses;

    if (!previousAddresses) {
      return;
    }

    const deletedAddresses = getTerraformAddressesRemovedFromDiagram(
      previousAddresses,
      currentDiagramResourceAddresses,
      getEffectivePreservedTerraformAddresses(
        context.diagram,
        classifiedPreservedResourceAddressesRef.current
      )
    );

    if (deletedAddresses.length === 0) {
      return;
    }

    const nextFiles = removeTerraformBlocksAndDependentOutputsByAddress(
      terraformFiles,
      deletedAddresses
    );
    const didRemoveBlock = nextFiles.some((file, index) => file !== terraformFiles[index]);

    if (!didRemoveBlock) {
      return;
    }

    codeVersionRef.current += 1;
    const hasRemainingTerraformCode = nextFiles.some((file) => file.code.trim().length > 0);
    setTerraformFiles(nextFiles);
    setDiagnostics([]);
    onDiagnosticsChange([]);
    const nextHasLocalEdits = hasLocalEdits && hasRemainingTerraformCode;
    setHasLocalEdits(nextHasLocalEdits);
    setSaveBanner(nextHasLocalEdits ? { kind: "dirty" } : null);
    setStatusMessage("다이어그램 삭제 반영됨");
    if (!hasRemainingTerraformCode) {
      latestSuccessfulTerraformPreviewFingerprintRef.current = currentDiagramFingerprint;
      latestDiagramFingerprintRef.current = currentDiagramFingerprint;
      setIsTerraformPreviewStale(false);
      onDirtyChange(false);
    } else {
      setIsTerraformPreviewStale(false);
    }
  }, [
    currentDiagramFingerprint,
    currentDiagramResourceAddresses,
    hasLocalEdits,
    isMutationLocked,
    onDiagnosticsChange,
    onDirtyChange,
    terraformFiles
  ]);

  useEffect(() => {
    if (hasLocalEdits) {
      if (latestSuccessfulTerraformPreviewFingerprintRef.current !== currentDiagramFingerprint) {
        setIsTerraformPreviewStale(true);
        setStatusMessage("다이어그램 변경 미반영");
      }
      return;
    }

    if (latestSuccessfulTerraformPreviewFingerprintRef.current === currentDiagramFingerprint) {
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

  const scrollTerraformEditorToLine = useCallback(
    (line: number, options: { readonly shouldFocus?: boolean } = {}): boolean => {
      const textarea = textareaRef.current;

      if (!textarea) {
        return false;
      }

      const code = textarea.value;
      const lineCount = code.split(/\r\n|\r|\n/).length;
      const targetLine = Math.max(1, Math.min(line, lineCount));
      const lineHeight =
        Number.parseFloat(window.getComputedStyle(textarea).lineHeight) ||
        TERRAFORM_EDITOR_LINE_HEIGHT;
      const targetScrollTop = Math.max(0, (targetLine - 2) * lineHeight);
      const cursorOffset = getTerraformLineStartOffset(code, targetLine);

      if (options.shouldFocus) {
        textarea.focus({ preventScroll: true });
        textarea.setSelectionRange(cursorOffset, cursorOffset);
      }

      textarea.scrollTop = targetScrollTop;
      textarea.scrollLeft = 0;
      setCodeScrollTop(textarea.scrollTop);
      setCodeScrollLeft(textarea.scrollLeft);

      if (lineNumberRef.current) {
        lineNumberRef.current.scrollTop = textarea.scrollTop;
      }

      return true;
    },
    []
  );

  useEffect(() => {
    if (!isVisible || isResourceCodeMode || !selectedBlock || !textareaRef.current) {
      lastScrolledNodeIdRef.current = null;
      return;
    }

    if (selectedBlock.fileName !== activeFileName) {
      setActiveFileName(selectedBlock.fileName);
      return;
    }

    const selectedNodeId = selectedNode?.id ?? null;
    if (lastScrolledNodeIdRef.current === selectedNodeId) {
      return;
    }

    const textarea = textareaRef.current;
    const lineHeight =
      Number.parseFloat(window.getComputedStyle(textarea).lineHeight) ||
      TERRAFORM_EDITOR_LINE_HEIGHT;
    const blockTop = TERRAFORM_EDITOR_VERTICAL_PADDING + (selectedBlock.startLine - 1) * lineHeight;
    const blockHeight =
      Math.max(1, selectedBlock.endLine - selectedBlock.startLine + 1) * lineHeight;
    const targetScrollTop = blockTop + blockHeight / 2 - textarea.clientHeight / 2;
    textarea.scrollTop = clampTerraformEditorScrollTop(targetScrollTop, textarea);
    setCodeScrollTop(textarea.scrollTop);
    setCodeScrollLeft(textarea.scrollLeft);

    if (lineNumberRef.current) {
      lineNumberRef.current.scrollTop = textarea.scrollTop;
    }

    lastScrolledNodeIdRef.current = selectedNodeId;
  }, [activeFileName, isResourceCodeMode, isVisible, selectedBlock, selectedNode?.id]);

  useEffect(() => {
    if (!pendingSourceLocation || !isVisible || isResourceCodeMode) {
      return;
    }

    if (pendingSourceLocation.fileName !== activeFileName) {
      setActiveFileName(pendingSourceLocation.fileName);
      return;
    }

    const targetLine = Math.max(1, Math.min(pendingSourceLocation.line, lineNumbers.length));
    const didScroll = scrollTerraformEditorToLine(targetLine, { shouldFocus: true });

    if (!didScroll) {
      return;
    }

    setActiveSourceHighlightLine(targetLine);
    setPendingSourceLocation(null);
  }, [
    activeFileName,
    isResourceCodeMode,
    isVisible,
    lineNumbers.length,
    pendingSourceLocation,
    scrollTerraformEditorToLine
  ]);

  useEffect(() => {
    if (activeSourceHighlightLine === null) {
      return;
    }

    const timerId = window.setTimeout(() => {
      setActiveSourceHighlightLine(null);
    }, 8000);

    return () => window.clearTimeout(timerId);
  }, [activeSourceHighlightLine]);

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

  /** read-only lock 중 발생한 늦은 입력 event를 상태 변경 전에 버립니다. */
  function handleCodeChange(nextCode: string): void {
    if (mutationLockedRef.current) return;

    codeVersionRef.current += 1;
    const nextFiles = terraformFiles.map((file) => {
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
    });
    setTerraformFiles(nextFiles);
    onTerraformFilesChange?.(toTerraformValidationFiles(nextFiles));

    setHasLocalEdits(true);
    setIsTerraformPreviewStale(
      latestSuccessfulTerraformPreviewFingerprintRef.current !== currentDiagramFingerprint
    );
    setSaveBanner({ kind: "dirty" });
    setStatusMessage("수정 중");
  }

  /** lock 중 Tab·저장 shortcut까지 포함한 편집 key를 처리하지 않습니다. */
  function handleCodeKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>): void {
    if (mutationLockedRef.current) {
      event.preventDefault();
      return;
    }

    if (event.key === "Tab" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const textarea = event.currentTarget;
      const indentation = applyTerraformEditorIndentation({
        code: textarea.value,
        outdent: event.shiftKey,
        selectionEnd: textarea.selectionEnd,
        selectionStart: textarea.selectionStart
      });

      handleCodeChange(indentation.code);
      window.requestAnimationFrame(() => {
        textareaRef.current?.setSelectionRange(
          indentation.selectionStart,
          indentation.selectionEnd
        );
      });
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void saveCodeToDiagram().then(async (saved) => {
        if (saved) {
          await context.saveDiagramNow?.();
        }
      }).catch(() => {
        setRequestState("error");
        setStatusMessage("프로젝트 저장 실패");
      });
    }
  }

  /** 잠긴 동안 새 virtual file이 선택 동작으로 생기지 않게 합니다. */
  function selectTerraformFile(fileName: string): void {
    if (mutationLockedRef.current) return;

    setTerraformFiles((currentFiles) =>
      currentFiles.some((file) => file.fileName === fileName)
        ? currentFiles
        : [...currentFiles, { code: "", fileName }].sort((left, right) =>
            compareTerraformFileNames(left.fileName, right.fileName)
          )
    );
    setActiveFileName(fileName);
    setActiveSourceHighlightLine(null);
    setIsFileMenuOpen(false);
    setFileSearchQuery("");
    context.closeInspectedNode();
  }

  return (
    <div
      className={styles.terraformPanel}
      aria-busy={isMutationLocked}
      onFocusCapture={handleTerraformFocusAiInteraction}
      onPointerDown={onTerraformAiInteraction}
    >
      <TerraformCodeToolbar
        actions={{
          closeResourceCode: context.closeInspectedNode,
          searchFiles: setFileSearchQuery,
          selectFile: selectTerraformFile,
          toggleFileMenu: () => setIsFileMenuOpen((isOpen) => !isOpen)
        }}
        state={{
          activeFileName,
          fileOptions: filteredTerraformFileOptions,
          fileSearchQuery,
          inspectedResourceLabel:
            inspectedNode?.label ?? inspectedNode?.parameters?.resourceName ?? "Resource",
          isFileMenuOpen,
          isResourceCodeMode
        }}
      />

      <TerraformCodeStatus
        state={{
          isSynced: isTerraformPreviewSynced,
          previewSummary: previewSnapshotSummary,
          saveBanner,
          statusMessage
        }}
      />

      <TerraformCodeEditorSurface
        actions={{
          changeCode: handleCodeChange,
          handleKeyDown: handleCodeKeyDown,
          handleScroll: handleCodeScroll
        }}
        refs={{
          lineNumbers: lineNumberRef,
          syntaxHighlight: syntaxHighlightRef,
          textarea: textareaRef
        }}
        state={{
          code: displayedTerraformCode,
          diagnosticLineNumbers: diagnosticLineNumberSet,
          highlightedBlockAddress: highlightedBlock?.address ?? null,
          highlightedBlockStyle,
          highlightedLines: highlightedTerraformLines,
          isMutationLocked,
          lineNumbers,
          sourceLineHighlightStyle,
          syntaxHighlightStyle: terraformSyntaxHighlightStyle
        }}
      />
    </div>
  );
});
