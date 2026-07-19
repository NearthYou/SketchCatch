"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TEMPLATE_IDS } from "@sketchcatch/types";
import type {
  AiArchitectureDraftResult,
  AiTerraformErrorExplanationResult,
  AiTerraformPreviewExplanationResult,
  ArchitectureDraftClarification,
  ArchitecturePatchClarification,
  ArchitecturePatchClarificationCandidate,
  ArchitecturePatchPreview,
  ArchitectureGuardrailWarning,
  ArchitectureJson,
  CreateArchitectureDraftRequest,
  DiagramJson,
  TerraformDiagnostic
} from "@sketchcatch/types";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { listBoardTemplates } from "../resource-settings/template-library";
import { Mic, Send } from "lucide-react";
import { getApiErrorMessage } from "../../lib/api-client";
import { compileArchitectureDraftProposal } from "../architecture-board-compiler";
import type { DiagramEditorPanelContext } from "../diagram-editor";
import {
  createAiArchitectureDraftStream,
  createAiArchitecturePatchPreview,
  createAiArchitectureDraft,
  runAiTerraformPreviewExplanation,
  runAiTerraformErrorExplanation
} from "./api";
import { convertDiagramJsonToArchitectureJson } from "./workspace-ai-diagram-adapter";
import {
  createWorkspaceAiBoardSnapshot,
  isWorkspaceAiResultStale
} from "./workspace-ai-panel-state";
import {
  createWorkspaceAiChatComposerStates,
  getAdjacentWorkspaceAiChatScope,
  getWorkspaceAiChatScopeDefinition,
  readStoredActiveChatScope,
  shouldShowWorkspaceAiChatMessage,
  storeActiveChatScope,
  workspaceAiChatScopes,
  type WorkspaceAiChatComposerState,
  type WorkspaceAiChatScope
} from "./workspace-ai-chat-conversation";
import {
  isWorkspaceAiTranscriptNearBottom,
  removeWorkspaceAiSelectionEntries
} from "./workspace-ai-workbench-state";
import {
  WorkspaceAiWorkbenchExplanation,
  WorkspaceAiWorkbenchDraftProgress,
  WorkspaceAiWorkbenchRequestMessage,
  WorkspaceAiWorkbenchReviewProgress,
  WorkspaceAiWorkbenchTerraformIssueResult,
  WorkspaceAiWorkbenchTerraformPreviewResult,
  type AiRequestState
} from "./WorkspaceAiWorkbenchResults";
import {
  planArchitectureDraftPreview,
  resolveArchitectureDraftFollowUpAnswer,
  type ArchitectureDraftFollowUpSession
} from "./workspace-ai-draft-follow-up";
import {
  createArchitectureDraftClarificationMessage,
  resolveAcceptedArchitectureDraftClarificationSelection,
  withArchitectureDraftClarificationAnswer
} from "./workspace-ai-draft-clarification";
import {
  createLatestUserRequirementPrompt,
  createLatestUserRequirementPromptExcluding
} from "./workspace-ai-chat-history";
import {
  classifyWorkspaceAiChatPrompt,
  resolvePendingPreviewChatAction,
  resolveWorkspaceAiChatAction,
  shouldStartFreshDraftDuringPatchClarification,
  type WorkspaceAiChatPromptClassification
} from "./workspace-ai-chat-routing";
import {
  findPatchClarificationCandidate as findSharedPatchClarificationCandidate,
  findPatchClarificationSuggestion as findSharedPatchClarificationSuggestion,
  getPatchClarificationSuggestions as getSharedPatchClarificationSuggestions,
  isAddResourceConnectionClarification as isSharedAddResourceConnectionClarification,
  isNoResourceAdditionSuggestion as isSharedNoResourceAdditionSuggestion,
  isServicePurposePatchClarification as isSharedServicePurposePatchClarification,
  isSkipConnectionSuggestion as isSharedSkipConnectionSuggestion,
  NO_RESOURCE_ADDITION_MESSAGE,
  NO_RESOURCE_ADDITION_SUGGESTION
} from "./workspace-ai-patch-clarification";
import {
  createWorkspaceAiPatchPreviewModel,
  type WorkspaceAiPatchParameterChange,
  type WorkspaceAiPatchPreviewModel
} from "./workspace-ai-patch-preview";
import { formatTerraformDiagnosticTitle } from "./terraform-panel-utils";
import {
  createTerraformIssueFixPlan,
  readStoredTerraformIssueAnalyses,
  resolveTerraformIssueCode,
  storeTerraformIssueAnalyses,
  type StoredTerraformIssueAnalysis,
  type TerraformPreviewAiScope,
  type TerraformIssueCodePreview,
  type TerraformSafeFixApplyRequest,
  type TerraformSafeFixApplyResult,
  type WorkspaceAiContextInteraction,
  type WorkspaceTerraformAiContext
} from "./workspace-terraform-ai";
import { formatTerraformReviewContext } from "./workspace-ai-result-presentation";
import { getWorkspaceAiChatDockStatus } from "./workspace-ai-chat-status";
import {
  isWorkspaceAiChatAbortError,
  WorkspaceAiChatRequestRegistry
} from "./workspace-ai-chat-request";
import {
  getWorkspaceAiChatSuggestionPresentation,
  WorkspaceAiChatSuggestionSubmissionRegistry
} from "./workspace-ai-chat-suggestion-submission";
import { createWorkspaceAiChatStorageKey } from "./workspace-ai-chat-storage";
import { WorkspaceAiChatLauncher } from "./WorkspaceAiChatLauncher";
import { WorkspaceAiWorkbench } from "./WorkspaceAiWorkbench";
import styles from "./workspace-ai-workbench.module.css";

export type WorkspaceAiChatDockProps = {
  readonly context: DiagramEditorPanelContext;
  readonly isBlockedByWorkspaceOverlay: boolean;
  readonly isOpen: boolean;
  readonly onApplyTerraformIssueFix: (request: TerraformSafeFixApplyRequest) => void;
  readonly onOpenChange: (isOpen: boolean) => void;
  readonly onSelectTerraformIssue: (diagnosticKey: string | null) => void;
  readonly projectId: string;
  readonly repositoryAnalysisSourceRepositoryId?: string | undefined;
  readonly repositoryTemplateId?: string | undefined;
  readonly selectedTerraformIssueKey: string | null;
  readonly terraformAiContext: WorkspaceTerraformAiContext;
  readonly terraformAiInteraction: WorkspaceAiContextInteraction | null;
  readonly terraformSafeFixApplyResult: TerraformSafeFixApplyResult | null;
};

type WorkspaceAiChatMessageRole = "assistant" | "user";
type WorkspaceAiChatMessageKind =
  | "draft"
  | "error"
  | "patch"
  | "question"
  | "preview"
  | "status"
  | "terraform_issue";
type WorkspaceAiChatSelectionMode = "single" | "multiple";
type WorkspaceAiChatMessage = {
  readonly id: string;
  readonly content: string;
  readonly createdAt: string;
  readonly kind: WorkspaceAiChatMessageKind;
  readonly role: WorkspaceAiChatMessageRole;
  readonly scope?: WorkspaceAiChatScope;
  readonly selectionMode?: WorkspaceAiChatSelectionMode;
  readonly selectedSuggestions?: readonly string[];
  readonly suggestions?: readonly string[];
};

type WorkspaceAiChatSuggestionSelection = {
  readonly messageId: string;
  readonly suggestions: readonly string[];
};

type PendingArchitectureDraftClarification = {
  readonly request: CreateArchitectureDraftRequest;
  readonly clarification: ArchitectureDraftClarification;
  readonly questionMessageId: string;
};
type SubmittedArchitectureDraftClarificationAnswer = {
  readonly answer: string;
  readonly clarification: ArchitectureDraftClarification;
  readonly questionMessageId: string;
};

type TerraformIssueAnalysisState = {
  readonly explanation: AiTerraformErrorExplanationResult | null;
  readonly message: string;
  readonly state: AiRequestState;
  readonly terraformFingerprint: string;
};

type TerraformPreviewExplanationState = {
  readonly explanation: AiTerraformPreviewExplanationResult | null;
  readonly message: string;
  readonly reviewScope: TerraformPreviewAiScope;
  readonly state: AiRequestState;
  readonly terraformFingerprint: string;
};

type TerraformIssueBatchProgress = {
  readonly completed: number;
  readonly total: number;
};

type PendingTerraformFixApply = {
  readonly diagnosticKeys: readonly string[];
  readonly requestId: number;
};

type LastPatchPreviewRequest = {
  readonly connectionTargetResourceId?: string | undefined;
  readonly instruction: string;
  readonly selectedTargetResourceId?: string | undefined;
  readonly skipConnection?: boolean | undefined;
};

type VoiceInputBase = {
  readonly scope: WorkspaceAiChatScope;
  readonly value: string;
};

type WorkspaceAiProposalSource = {
  readonly fingerprint: string;
  readonly revision: number;
};

type PendingArchitectureDraftFollowUp = {
  readonly proposalSource: WorkspaceAiProposalSource;
  readonly session: ArchitectureDraftFollowUpSession;
};

type SelectedTerraformFixPlan = {
  readonly canApply: boolean;
  readonly codePreview: TerraformIssueCodePreview | null;
  readonly reason: string;
};

const MAX_CHAT_MESSAGES = 80;
const REQUEST_CANCELLED_MESSAGE = "요청을 중지했습니다.";
const VOICE_NO_SPEECH_TIMEOUT_MS = 8000;
const WORKBENCH_SCOPE_DEFINITIONS = workspaceAiChatScopes.map((scope) => ({
  inputAvailable: getWorkspaceAiChatScopeDefinition(scope).inputAvailable,
  label: getWorkspaceAiChatScopeDefinition(scope).label,
  scope
}));

type BrowserSpeechRecognitionAlternative = {
  readonly transcript: string;
};

type BrowserSpeechRecognitionResult = {
  readonly [index: number]: BrowserSpeechRecognitionAlternative | undefined;
};

type BrowserSpeechRecognitionEvent = {
  readonly results: {
    readonly length: number;
    readonly [index: number]: BrowserSpeechRecognitionResult | undefined;
  };
};

type BrowserSpeechRecognitionErrorEvent = {
  readonly error: string;
};

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onspeechstart: (() => void) | null;
  abort: () => void;
  start: () => void;
  stop: () => void;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type SpeechRecognitionWindow = Window & {
  readonly SpeechRecognition?: BrowserSpeechRecognitionConstructor;
  readonly webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
};

// Repository Analysis에서 넘긴 Template을 표시하고 이후 AI Draft 요청에 유지합니다.
export function WorkspaceAiChatDock({
  context,
  isBlockedByWorkspaceOverlay,
  isOpen,
  onApplyTerraformIssueFix,
  onOpenChange,
  onSelectTerraformIssue,
  projectId,
  repositoryAnalysisSourceRepositoryId,
  repositoryTemplateId,
  selectedTerraformIssueKey,
  terraformAiContext,
  terraformAiInteraction,
  terraformSafeFixApplyResult
}: WorkspaceAiChatDockProps) {
  const [activeChatTab, setActiveChatTab] = useState<WorkspaceAiChatScope>(() =>
    readStoredActiveChatScope(projectId)
  );
  const [composerStates, setComposerStates] = useState<
    Record<WorkspaceAiChatScope, WorkspaceAiChatComposerState>
  >(() => createWorkspaceAiChatComposerStates());
  const [voiceListeningScope, setVoiceListeningScope] = useState<WorkspaceAiChatScope | null>(null);
  const [isVoiceInputSupported, setVoiceInputSupported] = useState(true);
  const [isMobileChatSurface, setMobileChatSurface] = useState(false);
  const [messages, setMessages] = useState<WorkspaceAiChatMessage[]>(() =>
    readStoredChatMessages(projectId)
  );
  const [selectedSuggestionLabelsByMessageId, setSelectedSuggestionLabelsByMessageId] = useState<
    Record<string, readonly string[]>
  >({});
  const [draft, setDraft] = useState<AiArchitectureDraftResult | null>(null);
  const [patchPreviewModel, setPatchPreviewModel] = useState<WorkspaceAiPatchPreviewModel | null>(
    null
  );
  const [patchClarification, setPatchClarification] =
    useState<ArchitecturePatchClarification | null>(null);
  const [draftClarification, setDraftClarification] =
    useState<PendingArchitectureDraftClarification | null>(null);
  const [draftFollowUpSession, setDraftFollowUpSession] =
    useState<PendingArchitectureDraftFollowUp | null>(null);
  const [lastDraftRequest, setLastDraftRequest] = useState<CreateArchitectureDraftRequest | null>(
    null
  );
  const [lastPatchPreviewRequest, setLastPatchPreviewRequest] =
    useState<LastPatchPreviewRequest | null>(null);
  const [draftSourceFingerprint, setDraftSourceFingerprint] = useState<string | null>(null);
  const [patchPreviewSourceFingerprint, setPatchPreviewSourceFingerprint] = useState<string | null>(
    null
  );
  const [draftSourceRevision, setDraftSourceRevision] = useState<number | null>(null);
  const [patchPreviewSourceRevision, setPatchPreviewSourceRevision] = useState<number | null>(null);
  const [terraformPreviewExplanation, setTerraformPreviewExplanation] =
    useState<TerraformPreviewExplanationState | null>(null);
  const [terraformPreviewReviewElapsedMs, setTerraformPreviewReviewElapsedMs] = useState(0);
  const [terraformIssueAnalyses, setTerraformIssueAnalyses] = useState<
    Record<string, TerraformIssueAnalysisState>
  >(() => readBrowserTerraformIssueAnalyses(projectId));
  const [terraformIssueBatchProgress, setTerraformIssueBatchProgress] =
    useState<TerraformIssueBatchProgress | null>(null);
  const [terraformFixUnavailableReasons, setTerraformFixUnavailableReasons] = useState<
    Record<string, string>
  >({});
  const [applyingTerraformFixRequestId, setApplyingTerraformFixRequestId] = useState<number | null>(
    null
  );
  const [completedTerraformFixIssueKeys, setCompletedTerraformFixIssueKeys] = useState<
    readonly string[]
  >([]);
  const [draftState, setDraftState] = useState<AiRequestState>("idle");
  const [draftErrorMessage, setDraftErrorMessage] = useState("");
  const repositoryTemplate = useMemo(
    () =>
      repositoryTemplateId
        ? (listBoardTemplates().find((template) => template.id === repositoryTemplateId) ?? null)
        : null,
    [repositoryTemplateId]
  );
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const launcherButtonRef = useRef<HTMLButtonElement | null>(null);
  const chatDialogRef = useRef<HTMLElement | null>(null);
  const tabButtonRefs = useRef<Record<WorkspaceAiChatScope, HTMLButtonElement | null>>({
    draft: null,
    errors: null,
    preview: null
  });
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const transcriptScrollFrameRef = useRef<number | null>(null);
  const transcriptShouldFollowRef = useRef(true);
  const transcriptScrollContextRef = useRef({ isOpen: false, scope: activeChatTab });
  const wasChatOpenRef = useRef(false);
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const voiceInputBaseRef = useRef<VoiceInputBase>({ scope: "draft", value: "" });
  const voiceNoSpeechTimerRef = useRef<number | null>(null);
  const loadedProjectIdRef = useRef(projectId);
  const terraformAiContextRef = useRef(terraformAiContext);
  const latestTerraformAiInteractionIdRef = useRef<number | null>(null);
  const latestTerraformFingerprintRef = useRef(terraformAiContext.fingerprint);
  const latestTerraformPreviewRequestIdRef = useRef(0);
  const nextTerraformActionRequestIdRef = useRef(0);
  const pendingTerraformFixApplyRef = useRef<PendingTerraformFixApply | null>(null);
  const latestTerraformSafeFixResultRequestIdRef = useRef<number | null>(null);
  const requestRegistryRef = useRef(new WorkspaceAiChatRequestRegistry());
  const suggestionSubmissionRegistryRef = useRef(new WorkspaceAiChatSuggestionSubmissionRegistry());
  terraformAiContextRef.current = terraformAiContext;
  const boardSnapshot = useMemo(
    () => createWorkspaceAiBoardSnapshot(context.diagram),
    [context.diagram]
  );
  const currentBoardRevision = context.getDiagramRevision();
  const draftSafetyWarnings = useMemo(
    () => createDraftSafetyWarnings(draft, boardSnapshot.hasResources),
    [boardSnapshot.hasResources, draft]
  );
  const activeComposer = composerStates[activeChatTab];
  const activeScopeDefinition = getWorkspaceAiChatScopeDefinition(activeChatTab);
  const isVoiceListening = voiceListeningScope === activeChatTab;
  const draftIsStale =
    draft !== null &&
    (isWorkspaceAiResultStale(draftSourceFingerprint, boardSnapshot.fingerprint) ||
      (draftSourceRevision !== null && draftSourceRevision !== currentBoardRevision));
  const patchPreviewIsStale =
    patchPreviewModel !== null &&
    (isWorkspaceAiResultStale(patchPreviewSourceFingerprint, boardSnapshot.fingerprint) ||
      (patchPreviewSourceRevision !== null && patchPreviewSourceRevision !== currentBoardRevision));
  const currentTerraformErrorIssues = useMemo(
    () => terraformAiContext.issues.filter((issue) => issue.diagnostic.severity === "error"),
    [terraformAiContext.issues]
  );
  const selectedTerraformIssue = useMemo(
    () =>
      terraformAiContext.issues.find(
        (issue) => issue.diagnosticKey === selectedTerraformIssueKey
      ) ??
      currentTerraformErrorIssues[0] ??
      terraformAiContext.issues[0] ??
      null,
    [currentTerraformErrorIssues, selectedTerraformIssueKey, terraformAiContext.issues]
  );
  const selectedTerraformIssueAnalysis = selectedTerraformIssue
    ? (terraformIssueAnalyses[selectedTerraformIssue.diagnosticKey] ?? null)
    : null;
  const selectedTerraformIssueCode = selectedTerraformIssue
    ? resolveTerraformIssueCode({
        combinedTerraformCode: terraformAiContext.combinedTerraformCode,
        diagnostic: selectedTerraformIssue.diagnostic,
        files: terraformAiContext.files
      })
    : "";
  const selectedTerraformIssueAnalysisIsStale =
    selectedTerraformIssueAnalysis !== null &&
    selectedTerraformIssueAnalysis.terraformFingerprint !== terraformAiContext.fingerprint;
  const selectedTerraformFixPlan = useMemo<SelectedTerraformFixPlan>(() => {
    if (selectedTerraformIssue === null) {
      return {
        canApply: false,
        codePreview: null,
        reason: "수정할 Terraform 오류가 없습니다."
      };
    }

    if (selectedTerraformIssueAnalysis?.state === "loading") {
      return {
        canApply: false,
        codePreview: null,
        reason: "오류 분석이 끝난 뒤 수정안을 적용할 수 있습니다."
      };
    }

    if (selectedTerraformIssueAnalysis?.state === "error") {
      return {
        canApply: false,
        codePreview: null,
        reason: "오류 분석에 실패했습니다. 다시 분석한 뒤 수정안을 적용하세요."
      };
    }

    if (!selectedTerraformIssueAnalysis?.explanation) {
      return {
        canApply: false,
        codePreview: null,
        reason: "이 오류를 먼저 분석해야 수정안을 적용할 수 있습니다."
      };
    }

    if (selectedTerraformIssueAnalysisIsStale || selectedTerraformIssue.isStale) {
      return {
        canApply: false,
        codePreview: null,
        reason: "Terraform 코드가 변경되었습니다. 재검증한 뒤 이 오류를 다시 분석하세요."
      };
    }

    const sourceResolutionProblem = getTerraformIssueSourceResolutionProblem(
      selectedTerraformIssue.diagnostic,
      terraformAiContext
    );

    if (sourceResolutionProblem) {
      return {
        canApply: false,
        codePreview: null,
        reason: sourceResolutionProblem
      };
    }

    const fixPlan = createTerraformIssueFixPlan({
      diagnostic: selectedTerraformIssue.diagnostic,
      explanation: selectedTerraformIssueAnalysis.explanation,
      terraformCode: selectedTerraformIssueCode
    });

    if (!fixPlan.canApply || !fixPlan.codePreview) {
      return {
        canApply: false,
        codePreview: null,
        reason: "자동 적용 가능한 안전한 수정안이 없습니다. 안내에 따라 직접 수정하세요."
      };
    }

    return {
      canApply: true,
      codePreview: fixPlan.codePreview,
      reason: ""
    };
  }, [
    selectedTerraformIssue,
    selectedTerraformIssueAnalysis,
    selectedTerraformIssueAnalysisIsStale,
    selectedTerraformIssueCode,
    terraformAiContext
  ]);
  const terraformPreviewExplanationIsStale =
    terraformPreviewExplanation !== null &&
    (terraformPreviewExplanation.terraformFingerprint !== terraformAiContext.fingerprint ||
      terraformPreviewExplanation.reviewScope.key !== terraformAiContext.reviewScope.key ||
      terraformPreviewExplanation.reviewScope.terraformCode !==
        terraformAiContext.reviewScope.terraformCode);
  const isTerraformIssueAnalysisRunning =
    terraformIssueBatchProgress !== null ||
    Object.values(terraformIssueAnalyses).some((analysis) => analysis.state === "loading");
  const terraformApplyAllPlan = useMemo(() => {
    if (currentTerraformErrorIssues.length === 0) {
      return {
        canApply: false,
        diagnosticKeys: [] as string[],
        fixes: [] as TerraformSafeFixApplyRequest["fixes"],
        reason: "적용할 Terraform 오류가 없습니다."
      };
    }

    const fixes: TerraformSafeFixApplyRequest["fixes"][number][] = [];
    const diagnosticKeys: string[] = [];

    for (const issue of currentTerraformErrorIssues) {
      const analysis = terraformIssueAnalyses[issue.diagnosticKey];

      if (analysis?.state !== "idle" || !analysis.explanation) {
        return {
          canApply: false,
          diagnosticKeys: [],
          fixes: [],
          reason:
            analysis?.state === "error"
              ? "실패한 오류 분석이 있습니다. 모든 오류를 다시 분석하세요."
              : "모든 오류를 먼저 분석해야 합니다."
        };
      }

      if (analysis.terraformFingerprint !== terraformAiContext.fingerprint || issue.isStale) {
        return {
          canApply: false,
          diagnosticKeys: [],
          fixes: [],
          reason: "Terraform 코드가 변경되었습니다. 재검증한 뒤 모든 오류를 다시 분석하세요."
        };
      }

      const sourceResolutionProblem = getTerraformIssueSourceResolutionProblem(
        issue.diagnostic,
        terraformAiContext
      );

      if (sourceResolutionProblem) {
        return {
          canApply: false,
          diagnosticKeys: [],
          fixes: [],
          reason: sourceResolutionProblem
        };
      }

      const terraformCode = resolveTerraformIssueCode({
        combinedTerraformCode: terraformAiContext.combinedTerraformCode,
        diagnostic: issue.diagnostic,
        files: terraformAiContext.files
      });
      const fixPlan = createTerraformIssueFixPlan({
        diagnostic: issue.diagnostic,
        explanation: analysis.explanation,
        terraformCode
      });

      if (fixPlan.canApply && fixPlan.codePreview) {
        diagnosticKeys.push(issue.diagnosticKey);
        fixes.push({ codePreview: fixPlan.codePreview, diagnostic: issue.diagnostic });
      }
    }

    return fixes.length > 0
      ? { canApply: true, diagnosticKeys, fixes, reason: "" }
      : {
          canApply: false,
          diagnosticKeys: [],
          fixes: [],
          reason: "분석된 오류 중 자동 적용 가능한 안전한 수정안이 없습니다."
        };
  }, [currentTerraformErrorIssues, terraformAiContext, terraformIssueAnalyses]);

  const visibleMessages = useMemo(
    () => messages.filter((message) => getChatMessageScope(message) === activeChatTab),
    [activeChatTab, messages]
  );
  const displayedMessages = visibleMessages.filter(shouldShowWorkspaceAiChatMessage);
  const lastVisibleMessageId = displayedMessages.at(-1)?.id ?? null;
  const hasActiveChatHistory =
    displayedMessages.length > 0 ||
    (activeChatTab === "draft" && draft !== null) ||
    (activeChatTab === "errors" && Object.keys(terraformIssueAnalyses).length > 0) ||
    (activeChatTab === "preview" && terraformPreviewExplanation !== null);
  const activeRequestState: AiRequestState =
    activeChatTab === "draft"
      ? draftState
      : activeChatTab === "errors"
        ? isTerraformIssueAnalysisRunning
          ? "loading"
          : selectedTerraformIssueAnalysis?.state === "error" ||
              Object.values(terraformIssueAnalyses).some((analysis) => analysis.state === "error")
            ? "error"
            : "idle"
        : (terraformPreviewExplanation?.state ?? "idle");
  const activeHasPendingApproval =
    (activeChatTab === "draft" && (draft !== null || patchPreviewModel !== null)) ||
    (activeChatTab === "errors" &&
      ((selectedTerraformFixPlan.canApply &&
        selectedTerraformIssue !== null &&
        !completedTerraformFixIssueKeys.includes(selectedTerraformIssue.diagnosticKey)) ||
        terraformApplyAllPlan.canApply));
  const activeProposalIsStale =
    (activeChatTab === "draft" && (draftIsStale || patchPreviewIsStale)) ||
    (activeChatTab === "errors" &&
      (selectedTerraformIssue?.isStale === true || selectedTerraformIssueAnalysisIsStale)) ||
    (activeChatTab === "preview" && terraformPreviewExplanationIsStale);
  const chatDockStatus =
    activeChatTab === "draft" && activeRequestState === "loading"
      ? {
          description: "아래에서 현재 다이어그램 생성 단계를 확인할 수 있습니다.",
          label: "다이어그램 생성 중"
        }
      : getWorkspaceAiChatDockStatus({
          hasPendingApproval: activeHasPendingApproval,
          isStale: activeProposalIsStale,
          requestState: activeRequestState
        });
  const isChatBusy = activeRequestState === "loading";
  const isSelectedTerraformFixCompleted =
    selectedTerraformIssue !== null &&
    completedTerraformFixIssueKeys.includes(selectedTerraformIssue.diagnosticKey);
  const isSelectedTerraformFixApplying =
    selectedTerraformIssue !== null &&
    applyingTerraformFixRequestId !== null &&
    pendingTerraformFixApplyRef.current?.diagnosticKeys.includes(
      selectedTerraformIssue.diagnosticKey
    ) === true;
  const showSelectedTerraformApproval =
    selectedTerraformFixPlan.canApply ||
    isSelectedTerraformFixApplying ||
    isSelectedTerraformFixCompleted;
  const showTerraformApplyAllApproval =
    terraformApplyAllPlan.canApply ||
    (applyingTerraformFixRequestId !== null &&
      (pendingTerraformFixApplyRef.current?.diagnosticKeys.length ?? 0) > 1);

  const closeChatDock = useCallback(() => {
    onOpenChange(false);
    window.requestAnimationFrame(() => {
      launcherButtonRef.current?.focus();
    });
  }, [onOpenChange]);

  useEffect(() => {
    if (loadedProjectIdRef.current !== projectId) {
      return;
    }

    storeChatMessages(projectId, messages);
  }, [messages, projectId]);

  useEffect(() => {
    if (loadedProjectIdRef.current !== projectId || typeof window === "undefined") {
      return;
    }

    const storedAnalyses: StoredTerraformIssueAnalysis[] = Object.entries(
      terraformIssueAnalyses
    ).flatMap(([diagnosticKey, analysis]) =>
      analysis.explanation
        ? [
            {
              diagnosticKey,
              explanation: analysis.explanation,
              terraformFingerprint: analysis.terraformFingerprint
            }
          ]
        : []
    );
    storeTerraformIssueAnalyses(window.localStorage, projectId, storedAnalyses);
  }, [projectId, terraformIssueAnalyses]);

  useEffect(() => {
    if (loadedProjectIdRef.current !== projectId) {
      return;
    }

    storeActiveChatScope(projectId, activeChatTab);
  }, [activeChatTab, projectId]);

  useEffect(() => {
    requestRegistryRef.current.cancelAll();
    suggestionSubmissionRegistryRef.current.clear();
    setMessages(readStoredChatMessages(projectId));
    setActiveChatTab(readStoredActiveChatScope(projectId));
    setComposerStates(createWorkspaceAiChatComposerStates());
    setVoiceListeningScope(null);
    setSelectedSuggestionLabelsByMessageId({});
    setTerraformIssueAnalyses(readBrowserTerraformIssueAnalyses(projectId));
    setTerraformIssueBatchProgress(null);
    setTerraformFixUnavailableReasons({});
    setTerraformPreviewExplanation(null);
    setTerraformPreviewReviewElapsedMs(0);
    setApplyingTerraformFixRequestId(null);
    setCompletedTerraformFixIssueKeys([]);
    pendingTerraformFixApplyRef.current = null;
    latestTerraformAiInteractionIdRef.current = terraformAiInteraction?.id ?? null;
    latestTerraformPreviewRequestIdRef.current += 1;
    setDraft(null);
    setPatchPreviewModel(null);
    setPatchClarification(null);
    setDraftClarification(null);
    setDraftFollowUpSession(null);
    setDraftSourceFingerprint(null);
    setPatchPreviewSourceFingerprint(null);
    setDraftSourceRevision(null);
    setPatchPreviewSourceRevision(null);
    loadedProjectIdRef.current = projectId;
  }, [projectId]);

  useEffect(() => {
    if (terraformPreviewExplanation?.state !== "loading") {
      return;
    }

    const startedAt = Date.now();
    setTerraformPreviewReviewElapsedMs(0);
    const timerId = window.setInterval(() => {
      setTerraformPreviewReviewElapsedMs(Date.now() - startedAt);
    }, 500);

    return () => window.clearInterval(timerId);
  }, [terraformPreviewExplanation?.state, terraformPreviewExplanation?.terraformFingerprint]);

  useEffect(() => {
    if (
      terraformAiInteraction === null ||
      latestTerraformAiInteractionIdRef.current === terraformAiInteraction.id
    ) {
      return;
    }

    latestTerraformAiInteractionIdRef.current = terraformAiInteraction.id;
    setActiveChatTab(terraformAiInteraction.scope);

    if (terraformAiInteraction.diagnosticKey) {
      onSelectTerraformIssue(terraformAiInteraction.diagnosticKey);
    }
  }, [onSelectTerraformIssue, terraformAiInteraction]);

  useEffect(() => {
    if (latestTerraformFingerprintRef.current === terraformAiContext.fingerprint) {
      return;
    }

    latestTerraformFingerprintRef.current = terraformAiContext.fingerprint;
    setCompletedTerraformFixIssueKeys([]);
    setTerraformFixUnavailableReasons({});

    if (!requestRegistryRef.current.cancel("errors")) {
      return;
    }

    setTerraformIssueBatchProgress(null);
    setTerraformIssueAnalyses((currentAnalyses) =>
      Object.fromEntries(
        Object.entries(currentAnalyses).map(([diagnosticKey, analysis]) => [
          diagnosticKey,
          analysis.state === "loading"
            ? {
                ...analysis,
                message: "Terraform 코드가 변경되어 분석을 중지했습니다. 다시 분석하세요.",
                state: "idle" as const
              }
            : analysis
        ])
      )
    );
  }, [terraformAiContext.fingerprint]);

  useEffect(() => {
    if (!isOpen) {
      wasChatOpenRef.current = false;
      return undefined;
    }

    const shouldMoveInitialFocus = !wasChatOpenRef.current;
    wasChatOpenRef.current = true;
    const focusFrame = shouldMoveInitialFocus
      ? window.requestAnimationFrame(() => {
          if (activeScopeDefinition.inputAvailable) {
            composerTextareaRef.current?.focus();
            return;
          }

          tabButtonRefs.current[activeChatTab]?.focus();
        })
      : null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Tab" && isMobileChatSurface && chatDialogRef.current) {
        trapFocusWithin(chatDialogRef.current, event);
        return;
      }

      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      closeChatDock();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      if (focusFrame !== null) {
        window.cancelAnimationFrame(focusFrame);
      }
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    activeChatTab,
    activeScopeDefinition.inputAvailable,
    closeChatDock,
    isMobileChatSurface,
    isOpen
  ]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 768px)");
    const update = () => setMobileChatSurface(query.matches);

    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const previousScrollContext = transcriptScrollContextRef.current;
    const shouldForceTranscriptScroll =
      isOpen && (!previousScrollContext.isOpen || previousScrollContext.scope !== activeChatTab);

    transcriptScrollContextRef.current = { isOpen, scope: activeChatTab };

    if (!isOpen) {
      transcriptShouldFollowRef.current = true;
      return undefined;
    }

    if (!shouldForceTranscriptScroll && !transcriptShouldFollowRef.current) {
      return undefined;
    }

    transcriptShouldFollowRef.current = true;
    scrollChatTranscriptToBottom();
    transcriptScrollFrameRef.current = window.requestAnimationFrame(() => {
      if (transcriptShouldFollowRef.current) {
        scrollChatTranscriptToBottom();
      }
      transcriptScrollFrameRef.current = null;
    });

    return () => {
      if (transcriptScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(transcriptScrollFrameRef.current);
        transcriptScrollFrameRef.current = null;
      }
    };
  }, [
    activeChatTab,
    draft,
    draftState,
    isOpen,
    lastVisibleMessageId,
    patchPreviewModel,
    terraformIssueAnalyses,
    terraformIssueBatchProgress,
    terraformPreviewExplanation,
    visibleMessages.length
  ]);

  function scrollChatTranscriptToBottom(): void {
    const transcript = transcriptRef.current;

    if (transcript === null) {
      return;
    }

    transcript.scrollTo({
      behavior: "auto",
      top: transcript.scrollHeight
    });
  }

  function handleTranscriptScroll(): void {
    const transcript = transcriptRef.current;

    if (transcript === null) {
      return;
    }

    transcriptShouldFollowRef.current = isWorkspaceAiTranscriptNearBottom({
      clientHeight: transcript.clientHeight,
      scrollHeight: transcript.scrollHeight,
      scrollTop: transcript.scrollTop
    });
  }

  useEffect(() => {
    if (!terraformSafeFixApplyResult) {
      return;
    }

    if (
      latestTerraformSafeFixResultRequestIdRef.current === terraformSafeFixApplyResult.requestId
    ) {
      return;
    }

    latestTerraformSafeFixResultRequestIdRef.current = terraformSafeFixApplyResult.requestId;
    const pendingApply = pendingTerraformFixApplyRef.current;
    setApplyingTerraformFixRequestId(null);
    pendingTerraformFixApplyRef.current = null;

    if (
      terraformSafeFixApplyResult.applied &&
      pendingApply?.requestId === terraformSafeFixApplyResult.requestId
    ) {
      setCompletedTerraformFixIssueKeys((currentIssueKeys) => [
        ...new Set([...currentIssueKeys, ...pendingApply.diagnosticKeys])
      ]);
    }

    appendAssistantMessage(
      terraformSafeFixApplyResult.applied ? "terraform_issue" : "error",
      terraformSafeFixApplyResult.message,
      [],
      "single",
      "errors"
    );
  }, [terraformSafeFixApplyResult]);

  useEffect(() => {
    setVoiceInputSupported(getBrowserSpeechRecognitionConstructor() !== undefined);

    return () => {
      clearVoiceNoSpeechTimer();
      releaseSpeechRecognition("abort");
      requestRegistryRef.current.cancelAll();
    };
  }, []);

  function appendAssistantMessage(
    kind: WorkspaceAiChatMessageKind,
    content: string,
    suggestions: readonly string[] = [],
    selectionMode: WorkspaceAiChatSelectionMode = "single",
    scope: WorkspaceAiChatScope = activeChatTab
  ): WorkspaceAiChatMessage {
    const message = createChatMessage(
      "assistant",
      kind,
      content,
      suggestions,
      selectionMode,
      scope
    );
    setMessages((currentMessages) => trimChatMessages([...currentMessages, message]));
    return message;
  }

  function setComposerValue(value: string, scope: WorkspaceAiChatScope = activeChatTab): void {
    setComposerStates((currentStates) => ({
      ...currentStates,
      [scope]: {
        ...currentStates[scope],
        value
      }
    }));
  }

  function setVoiceStatusMessage(
    voiceStatusMessage: string | ((currentMessage: string) => string),
    scope: WorkspaceAiChatScope = activeChatTab
  ): void {
    setComposerStates((currentStates) => ({
      ...currentStates,
      [scope]: {
        ...currentStates[scope],
        voiceStatusMessage:
          typeof voiceStatusMessage === "function"
            ? voiceStatusMessage(currentStates[scope].voiceStatusMessage)
            : voiceStatusMessage
      }
    }));
  }

  function setVoiceListening(
    isListening: boolean,
    scope: WorkspaceAiChatScope = activeChatTab
  ): void {
    setVoiceListeningScope((currentScope) =>
      isListening ? scope : currentScope === scope ? null : currentScope
    );
  }

  function createProposalSource(): WorkspaceAiProposalSource {
    return {
      fingerprint: boardSnapshot.fingerprint,
      revision: context.getDiagramRevision()
    };
  }

  function selectChatTab(scope: WorkspaceAiChatScope): void {
    if (scope === activeChatTab) {
      return;
    }

    stopVoiceRecognition();
    setActiveChatTab(scope);
  }

  function handleChatTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>): void {
    let nextScope: WorkspaceAiChatScope | null = null;

    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextScope = getAdjacentWorkspaceAiChatScope(activeChatTab, -1);
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextScope = getAdjacentWorkspaceAiChatScope(activeChatTab, 1);
    } else if (event.key === "Home") {
      nextScope = workspaceAiChatScopes[0] ?? "draft";
    } else if (event.key === "End") {
      nextScope = workspaceAiChatScopes.at(-1) ?? "preview";
    }

    if (nextScope === null) {
      return;
    }

    event.preventDefault();
    selectChatTab(nextScope);
    window.requestAnimationFrame(() => {
      tabButtonRefs.current[nextScope]?.focus();
    });
  }

  function createTerraformActionRequestId(): number {
    nextTerraformActionRequestIdRef.current += 1;
    return Date.now() * 1000 + nextTerraformActionRequestIdRef.current;
  }

  async function runTerraformAgentReview(): Promise<void> {
    const currentContext = terraformAiContextRef.current;
    const reviewScope = { ...currentContext.reviewScope };

    if (reviewScope.terraformCode.trim().length === 0) {
      setTerraformPreviewExplanation({
        explanation: null,
        message: "검토할 Terraform 코드가 없습니다.",
        reviewScope,
        state: "error",
        terraformFingerprint: currentContext.fingerprint
      });
      return;
    }

    latestTerraformPreviewRequestIdRef.current += 1;
    const requestId = latestTerraformPreviewRequestIdRef.current;
    const controller = requestRegistryRef.current.begin("preview");
    setTerraformPreviewExplanation({
      explanation: null,
      message: "",
      reviewScope,
      state: "loading",
      terraformFingerprint: currentContext.fingerprint
    });

    try {
      const explanation = await runAiTerraformPreviewExplanation(reviewScope.terraformCode, {
        signal: controller.signal
      });

      if (latestTerraformPreviewRequestIdRef.current !== requestId || controller.signal.aborted) {
        return;
      }

      setTerraformPreviewExplanation({
        explanation,
        message: "",
        reviewScope,
        state: "idle",
        terraformFingerprint: currentContext.fingerprint
      });
    } catch (error) {
      if (
        isWorkspaceAiChatAbortError(error) ||
        latestTerraformPreviewRequestIdRef.current !== requestId
      ) {
        return;
      }

      setTerraformPreviewExplanation({
        explanation: null,
        message: getApiErrorMessage(error, "에이전트 리뷰 중 오류가 발생했습니다."),
        reviewScope,
        state: "error",
        terraformFingerprint: currentContext.fingerprint
      });
    } finally {
      requestRegistryRef.current.complete("preview", controller);
    }
  }

  async function analyzeSelectedTerraformIssue(): Promise<void> {
    if (selectedTerraformIssue === null) {
      return;
    }

    const contextSnapshot = terraformAiContextRef.current;
    const controller = requestRegistryRef.current.begin("errors");
    setTerraformIssueBatchProgress(null);

    try {
      await analyzeTerraformIssue(selectedTerraformIssue, contextSnapshot, controller);
    } finally {
      requestRegistryRef.current.complete("errors", controller);
    }
  }

  async function analyzeAllTerraformIssues(): Promise<void> {
    const issues = terraformAiContextRef.current.issues.filter(
      (issue) => issue.diagnostic.severity === "error"
    );

    if (issues.length === 0) {
      return;
    }

    const contextSnapshot = terraformAiContextRef.current;
    const controller = requestRegistryRef.current.begin("errors");
    setTerraformIssueBatchProgress({ completed: 0, total: issues.length });

    try {
      for (let index = 0; index < issues.length; index += 1) {
        if (controller.signal.aborted) {
          break;
        }

        const issue = issues[index];

        if (!issue) {
          continue;
        }

        const outcome = await analyzeTerraformIssue(issue, contextSnapshot, controller);

        if (outcome === "aborted" || outcome === "stale") {
          break;
        }

        setTerraformIssueBatchProgress({ completed: index + 1, total: issues.length });
      }
    } finally {
      setTerraformIssueBatchProgress(null);
      requestRegistryRef.current.complete("errors", controller);
    }
  }

  async function analyzeTerraformIssue(
    issue: WorkspaceTerraformAiContext["issues"][number],
    contextSnapshot: WorkspaceTerraformAiContext,
    controller: AbortController
  ): Promise<"aborted" | "completed" | "failed" | "stale"> {
    const previousAnalysis = terraformIssueAnalyses[issue.diagnosticKey];
    setTerraformIssueAnalyses((currentAnalyses) => ({
      ...currentAnalyses,
      [issue.diagnosticKey]: {
        explanation: currentAnalyses[issue.diagnosticKey]?.explanation ?? null,
        message: "",
        state: "loading",
        terraformFingerprint:
          currentAnalyses[issue.diagnosticKey]?.terraformFingerprint ?? contextSnapshot.fingerprint
      }
    }));
    setTerraformFixUnavailableReasons((currentReasons) => {
      if (!(issue.diagnosticKey in currentReasons)) {
        return currentReasons;
      }

      const nextReasons = { ...currentReasons };
      delete nextReasons[issue.diagnosticKey];
      return nextReasons;
    });

    const terraformCode = resolveTerraformIssueCode({
      combinedTerraformCode: contextSnapshot.combinedTerraformCode,
      diagnostic: issue.diagnostic,
      files: contextSnapshot.files
    });

    try {
      const explanation = await runAiTerraformErrorExplanation(
        {
          diagnostic: issue.diagnostic,
          rawMessage: formatTerraformIssueRawMessage(issue.diagnostic),
          relatedResourceId: issue.diagnostic.resourceAddress,
          stage: "validate",
          terraformCodeContext: terraformCode
        },
        { signal: controller.signal }
      );

      if (controller.signal.aborted) {
        return "aborted";
      }

      if (terraformAiContextRef.current.fingerprint !== contextSnapshot.fingerprint) {
        setTerraformIssueAnalyses((currentAnalyses) => ({
          ...currentAnalyses,
          [issue.diagnosticKey]: {
            explanation:
              currentAnalyses[issue.diagnosticKey]?.explanation ??
              previousAnalysis?.explanation ??
              null,
            message: "Terraform 코드가 변경되어 분석 결과를 저장하지 않았습니다. 다시 분석하세요.",
            state: "idle",
            terraformFingerprint:
              currentAnalyses[issue.diagnosticKey]?.terraformFingerprint ??
              previousAnalysis?.terraformFingerprint ??
              contextSnapshot.fingerprint
          }
        }));
        return "stale";
      }

      setTerraformIssueAnalyses((currentAnalyses) => ({
        ...currentAnalyses,
        [issue.diagnosticKey]: {
          explanation,
          message: "",
          state: "idle",
          terraformFingerprint: contextSnapshot.fingerprint
        }
      }));
      return "completed";
    } catch (error) {
      if (isWorkspaceAiChatAbortError(error) || controller.signal.aborted) {
        setTerraformIssueAnalyses((currentAnalyses) => ({
          ...currentAnalyses,
          [issue.diagnosticKey]: {
            explanation: currentAnalyses[issue.diagnosticKey]?.explanation ?? null,
            message: REQUEST_CANCELLED_MESSAGE,
            state: "idle",
            terraformFingerprint:
              currentAnalyses[issue.diagnosticKey]?.terraformFingerprint ??
              contextSnapshot.fingerprint
          }
        }));
        return "aborted";
      }

      const message = getApiErrorMessage(
        error,
        "Terraform 이슈 AI 해결 가이드를 불러오지 못했습니다."
      );
      setTerraformIssueAnalyses((currentAnalyses) => ({
        ...currentAnalyses,
        [issue.diagnosticKey]: {
          explanation: currentAnalyses[issue.diagnosticKey]?.explanation ?? null,
          message,
          state: "error",
          terraformFingerprint:
            currentAnalyses[issue.diagnosticKey]?.terraformFingerprint ??
            contextSnapshot.fingerprint
        }
      }));
      return "failed";
    }
  }

  function applySelectedTerraformIssueFix(): void {
    if (selectedTerraformIssue === null) {
      return;
    }

    const diagnosticKey = selectedTerraformIssue.diagnosticKey;

    if (!selectedTerraformFixPlan.canApply || !selectedTerraformFixPlan.codePreview) {
      setTerraformFixUnavailableReasons((currentReasons) => ({
        ...currentReasons,
        [diagnosticKey]: selectedTerraformFixPlan.reason
      }));
      return;
    }

    const requestId = createTerraformActionRequestId();
    setTerraformFixUnavailableReasons((currentReasons) => ({
      ...currentReasons,
      [diagnosticKey]: ""
    }));
    setApplyingTerraformFixRequestId(requestId);
    pendingTerraformFixApplyRef.current = { diagnosticKeys: [diagnosticKey], requestId };
    onApplyTerraformIssueFix({
      expectedTerraformFingerprint: terraformAiContext.fingerprint,
      fixes: [
        {
          codePreview: selectedTerraformFixPlan.codePreview,
          diagnostic: selectedTerraformIssue.diagnostic
        }
      ],
      id: requestId,
      mode: "single"
    });
  }

  function applyAllTerraformIssueFixes(): void {
    if (!terraformApplyAllPlan.canApply) {
      return;
    }

    const requestId = createTerraformActionRequestId();
    setApplyingTerraformFixRequestId(requestId);
    pendingTerraformFixApplyRef.current = {
      diagnosticKeys: terraformApplyAllPlan.diagnosticKeys,
      requestId
    };
    onApplyTerraformIssueFix({
      expectedTerraformFingerprint: terraformAiContext.fingerprint,
      fixes: terraformApplyAllPlan.fixes,
      id: requestId,
      mode: "all"
    });
  }

  async function submitChatPrompt(event?: FormEvent<HTMLFormElement>): Promise<void> {
    event?.preventDefault();

    await submitUserMessage(activeComposer.value);
  }

  function clearActiveChatHistory(): void {
    requestRegistryRef.current.cancel(activeChatTab);
    suggestionSubmissionRegistryRef.current.clear();
    const activeMessageIds = new Set(
      messages
        .filter((message) => getChatMessageScope(message) === activeChatTab)
        .map((message) => message.id)
    );
    setSelectedSuggestionLabelsByMessageId((currentSelections) =>
      removeWorkspaceAiSelectionEntries(currentSelections, activeMessageIds)
    );
    stopVoiceRecognition();
    setVoiceStatusMessage("");

    if (activeChatTab === "preview") {
      setMessages((currentMessages) =>
        currentMessages.filter((message) => getChatMessageScope(message) !== "preview")
      );
      setTerraformPreviewExplanation(null);
      return;
    }

    if (activeChatTab === "errors") {
      setMessages((currentMessages) =>
        currentMessages.filter((message) => getChatMessageScope(message) !== "errors")
      );
      setTerraformIssueAnalyses({});
      setTerraformIssueBatchProgress(null);
      setTerraformFixUnavailableReasons({});
      setApplyingTerraformFixRequestId(null);
      setCompletedTerraformFixIssueKeys([]);
      pendingTerraformFixApplyRef.current = null;
      return;
    }

    setMessages((currentMessages) => [
      ...currentMessages.filter((message) => getChatMessageScope(message) !== "draft"),
      ...createInitialChatMessages()
    ]);
    setComposerValue("");
    setDraft(null);
    setPatchPreviewModel(null);
    setDraftClarification(null);
    setDraftFollowUpSession(null);
    setLastDraftRequest(null);
    setLastPatchPreviewRequest(null);
    setDraftSourceFingerprint(null);
    setPatchPreviewSourceFingerprint(null);
    setDraftSourceRevision(null);
    setPatchPreviewSourceRevision(null);
    setDraftErrorMessage("");
    setDraftState("idle");
    context.setPreviewDiagram(null);
  }

  async function submitUserMessage(
    value: string,
    suggestionSelection?: WorkspaceAiChatSuggestionSelection
  ): Promise<void> {
    const trimmedPrompt = value.trim();

    if (!activeScopeDefinition.inputAvailable || trimmedPrompt.length === 0 || isChatBusy) {
      return;
    }

    if (
      suggestionSelection !== undefined &&
      !suggestionSubmissionRegistryRef.current.claim(suggestionSelection.messageId)
    ) {
      return;
    }

    if (suggestionSelection !== undefined) {
      transcriptShouldFollowRef.current = true;
    }

    const userMessage = createChatMessage(
      "user",
      "status",
      trimmedPrompt,
      [],
      "single",
      activeChatTab
    );
    const messagesWithSelection = suggestionSelection
      ? markChatMessageSuggestionsSelected(messages, suggestionSelection)
      : messages;
    const nextMessages = trimChatMessages([...messagesWithSelection, userMessage]);

    setComposerValue("");
    setSelectedSuggestionLabelsByMessageId({});
    setMessages(nextMessages);
    await handleUserMessage(trimmedPrompt, nextMessages);
  }

  async function handleUserMessage(
    trimmedPrompt: string,
    nextMessages: readonly WorkspaceAiChatMessage[]
  ): Promise<void> {
    if (patchClarification !== null) {
      if (shouldStartFreshDraftDuringPatchClarification(trimmedPrompt)) {
        setPatchClarification(null);
        await createDraftFromConversation(nextMessages);
        return;
      }

      await handlePatchClarificationMessage(trimmedPrompt, nextMessages);
      return;
    }

    if (draftFollowUpSession !== null) {
      await handleDraftFollowUpMessage(trimmedPrompt);
      return;
    }

    if (draftClarification !== null) {
      await handleDraftClarificationMessage(trimmedPrompt);
      return;
    }

    const promptClassification = classifyWorkspaceAiChatPrompt(trimmedPrompt);

    if (promptClassification !== "architecture") {
      appendAssistantMessage("question", createWorkspaceAiPromptGateMessage(promptClassification));
      return;
    }

    const pendingPreviewAction =
      draft !== null || patchPreviewModel !== null
        ? resolvePendingPreviewChatAction({
            needsDraftClarification: false,
            prompt: trimmedPrompt
          })
        : null;

    if (draft !== null && context.previewDiagram !== null && pendingPreviewAction === "patch") {
      await createPatchPreviewFromPrompt(trimmedPrompt, {
        baseArchitectureJson: convertDiagramJsonToArchitectureJson(context.previewDiagram),
        baseDiagram: context.previewDiagram
      });
      return;
    }

    if (patchPreviewModel !== null && pendingPreviewAction === "patch") {
      await createPatchPreviewFromPrompt(trimmedPrompt, {
        baseArchitectureJson: patchPreviewModel.preview.proposedArchitectureJson,
        baseDiagram: patchPreviewModel.proposedDiagram
      });
      return;
    }

    if (pendingPreviewAction === "draft") {
      await createDraftFromConversation(nextMessages);
      return;
    }

    const chatAction = resolveWorkspaceAiChatAction({
      boardHasResources: boardSnapshot.hasResources,
      needsDraftClarification: false,
      prompt: trimmedPrompt
    });

    if (chatAction === "patch") {
      await createPatchPreviewFromPrompt(trimmedPrompt);
      return;
    }

    if (boardSnapshot.hasResources) {
      await createDraftFromRequest({
        prompt: trimmedPrompt
      });
      return;
    }

    await createDraftFromConversation(nextMessages);
  }

  async function handlePatchClarificationMessage(
    trimmedPrompt: string,
    nextMessages: readonly WorkspaceAiChatMessage[]
  ): Promise<void> {
    if (patchClarification === null) {
      return;
    }

    const selectedCandidate = findPatchClarificationCandidate(patchClarification, trimmedPrompt);

    if (!selectedCandidate) {
      const selectedSuggestion = findPatchClarificationSuggestion(
        patchClarification,
        trimmedPrompt
      );

      if (selectedSuggestion) {
        const originalInstruction = patchClarification.intent.instruction;

        setPatchClarification(null);

        if (isNoResourceAdditionSuggestion(selectedSuggestion)) {
          const fallbackPrompt = createRequirementPromptWithoutNoResourceAddition(nextMessages);

          appendAssistantMessage("status", NO_RESOURCE_ADDITION_MESSAGE);
          await createDraftFromRequest({
            prompt: fallbackPrompt || originalInstruction
          });
          return;
        }

        if (isServicePurposePatchClarification(patchClarification)) {
          await createDraftFromRequest({
            prompt: selectedSuggestion
          });
          return;
        }

        await createPatchPreviewFromPrompt(
          isSkipConnectionSuggestion(selectedSuggestion)
            ? originalInstruction
            : `${originalInstruction}\n${selectedSuggestion}`,
          isSkipConnectionSuggestion(selectedSuggestion) ? { skipConnection: true } : undefined
        );
        return;
      }

      appendAssistantMessage(
        "question",
        patchClarification.question,
        getPatchClarificationSuggestions(patchClarification)
      );
      return;
    }

    const originalInstruction = isAddResourceConnectionClarification(patchClarification)
      ? patchClarification.intent.instruction
      : `${patchClarification.intent.instruction}\n${trimmedPrompt}`;

    setPatchClarification(null);
    await createPatchPreviewFromPrompt(
      originalInstruction,
      isAddResourceConnectionClarification(patchClarification)
        ? { connectionTargetResourceId: selectedCandidate.resourceId }
        : { selectedTargetResourceId: selectedCandidate.resourceId }
    );
  }

  async function handleDraftClarificationMessage(trimmedPrompt: string): Promise<void> {
    if (draftClarification === null) {
      return;
    }

    const nextRequest = withArchitectureDraftClarificationAnswer(
      draftClarification.request,
      draftClarification.clarification,
      trimmedPrompt
    );

    setDraftClarification(null);
    await createDraftFromRequest(nextRequest, {
      answer: trimmedPrompt,
      clarification: draftClarification.clarification,
      questionMessageId: draftClarification.questionMessageId
    });
  }

  async function createPatchPreviewFromPrompt(
    instruction: string,
    options: {
      readonly baseArchitectureJson?: ArchitectureJson | undefined;
      readonly baseDiagram?: DiagramJson | undefined;
      readonly selectedTargetResourceId?: string | undefined;
      readonly connectionTargetResourceId?: string | undefined;
      readonly skipConnection?: boolean | undefined;
    } = {}
  ): Promise<void> {
    const proposalSource = createProposalSource();
    const controller = requestRegistryRef.current.begin("draft");

    setDraftState("loading");
    setDraftErrorMessage("");
    setDraft(null);
    setPatchPreviewModel(null);
    setDraftSourceFingerprint(null);
    setPatchPreviewSourceFingerprint(null);
    setDraftSourceRevision(null);
    setPatchPreviewSourceRevision(null);
    setPatchClarification(null);
    setDraftClarification(null);
    setDraftFollowUpSession(null);
    setLastPatchPreviewRequest({
      connectionTargetResourceId: options.connectionTargetResourceId,
      instruction,
      selectedTargetResourceId: options.selectedTargetResourceId,
      skipConnection: options.skipConnection
    });
    context.setPreviewDiagram(null);

    try {
      const baseArchitectureJson = options.baseArchitectureJson ?? boardSnapshot.architectureJson;
      const response = await createAiArchitecturePatchPreview(
        {
          architectureJson: baseArchitectureJson,
          instruction,
          ...(options.selectedTargetResourceId !== undefined
            ? { selectedTargetResourceId: options.selectedTargetResourceId }
            : {}),
          ...(options.connectionTargetResourceId !== undefined
            ? { connectionTargetResourceId: options.connectionTargetResourceId }
            : {}),
          ...(options.skipConnection === true ? { skipConnection: true } : {})
        },
        { signal: controller.signal }
      );

      if (!requestRegistryRef.current.isActive("draft", controller)) {
        return;
      }

      if (response.status === "needs_clarification") {
        setPatchClarification(response);
        setDraftState("idle");
        appendAssistantMessage(
          "question",
          response.question,
          getPatchClarificationSuggestions(response)
        );
        return;
      }

      showPatchPreview(response, options.baseDiagram, proposalSource);
    } catch (error) {
      if (
        controller.signal.aborted ||
        !requestRegistryRef.current.isActive("draft", controller) ||
        isWorkspaceAiChatAbortError(error)
      ) {
        return;
      }

      const message = getApiErrorMessage(error, "수정 미리보기 생성 중 오류가 발생했습니다.");

      setDraftState("error");
      setDraftErrorMessage(message);
      appendAssistantMessage("error", message);
    } finally {
      requestRegistryRef.current.complete("draft", controller);
    }
  }

  function showPatchPreview(
    preview: ArchitecturePatchPreview,
    baseDiagram = context.diagram,
    proposalSource: WorkspaceAiProposalSource = createProposalSource()
  ): void {
    const model = createWorkspaceAiPatchPreviewModel(baseDiagram, preview);

    setPatchPreviewModel(model);
    setPatchPreviewSourceFingerprint(proposalSource.fingerprint);
    setPatchPreviewSourceRevision(proposalSource.revision);
    context.setPreviewDiagram(
      model.isParameterOnly ? null : model.visualPreviewDiagram,
      model.isParameterOnly ? undefined : model.annotations
    );
    setDraftState("idle");
    appendAssistantMessage("patch", createPatchPreviewSummary(preview));
  }

  async function handleDraftFollowUpMessage(trimmedPrompt: string): Promise<void> {
    if (draftFollowUpSession === null) {
      return;
    }

    const resolution = resolveArchitectureDraftFollowUpAnswer(
      draftFollowUpSession.session,
      trimmedPrompt
    );

    if (resolution.action === "show_pending_draft") {
      const pendingDraft = draftFollowUpSession.session.pendingDraft;

      setDraftFollowUpSession(null);
      showDraftPreview(pendingDraft, draftFollowUpSession.proposalSource);
      return;
    }

    if (resolution.action === "regenerate") {
      setDraftFollowUpSession(null);
      await createDraftFromRequest(resolution.request);
      return;
    }

    appendAssistantMessage("question", resolution.question, resolution.suggestions);
  }

  async function createDraftFromConversation(
    conversation: readonly WorkspaceAiChatMessage[]
  ): Promise<void> {
    const requirementPrompt = createRequirementPromptFromMessages(conversation);

    if (requirementPrompt.length === 0) {
      appendAssistantMessage(
        "question",
        "질문: 어떤 서비스를 만들고 싶은지 먼저 알려주세요. 예를 들면 웹사이트, 파일 업로드, 로그인 같은 말로 시작하면 됩니다."
      );
      return;
    }

    await createDraftFromRequest({
      prompt: requirementPrompt
    });
  }

  async function createDraftFromRequest(
    draftRequest: CreateArchitectureDraftRequest,
    submittedAnswer?: SubmittedArchitectureDraftClarificationAnswer
  ): Promise<void> {
    const prompt = draftRequest.prompt.trim();

    if (prompt.length === 0) {
      appendAssistantMessage(
        "question",
        "질문: 어떤 서비스를 만들고 싶은지 먼저 알려주세요. 예를 들면 정적 웹사이트, 파일 업로드, 로그인 같은 말로 시작하면 됩니다."
      );
      return;
    }

    const normalizedDraftRequest: CreateArchitectureDraftRequest = {
      ...draftRequest,
      prompt,
      ...(repositoryTemplate && isBuiltInTemplateId(repositoryTemplate.id)
        ? {
            templateId: repositoryTemplate.id,
            ...(repositoryAnalysisSourceRepositoryId
              ? {
                  repositoryAnalysis: {
                    projectId,
                    sourceRepositoryId: repositoryAnalysisSourceRepositoryId
                  }
                }
              : {})
          }
        : draftRequest.templateId
          ? { templateId: draftRequest.templateId }
          : {})
    };
    const proposalSource = createProposalSource();
    const controller = requestRegistryRef.current.begin("draft");

    setDraftState("loading");
    setDraftErrorMessage("");
    setDraft(null);
    setPatchPreviewModel(null);
    setDraftSourceFingerprint(null);
    setPatchPreviewSourceFingerprint(null);
    setDraftSourceRevision(null);
    setPatchPreviewSourceRevision(null);
    setPatchClarification(null);
    setDraftFollowUpSession(null);
    setLastDraftRequest(normalizedDraftRequest);
    context.setPreviewDiagram(null);

    try {
      const result =
        normalizedDraftRequest.repositoryAnalysis || normalizedDraftRequest.repositoryEvidence
          ? await createAiArchitectureDraft(normalizedDraftRequest, { signal: controller.signal })
          : await createAiArchitectureDraftStream(normalizedDraftRequest, {
              signal: controller.signal
            });

      if (!requestRegistryRef.current.isActive("draft", controller)) {
        return;
      }

      if (submittedAnswer !== undefined) {
        const selection = resolveAcceptedArchitectureDraftClarificationSelection(
          submittedAnswer.clarification,
          submittedAnswer.answer,
          result
        );
        if (selection !== null) {
          setMessages((currentMessages) =>
            markChatMessageSuggestionsSelected(currentMessages, {
              messageId: submittedAnswer.questionMessageId,
              suggestions: [selection.label]
            })
          );
        }
      }

      if (isArchitectureDraftClarification(result)) {
        const questionMessage = appendAssistantMessage(
          "question",
          createArchitectureDraftClarificationMessage(result),
          result.suggestions
        );
        setDraftClarification({
          request: normalizedDraftRequest,
          clarification: result,
          questionMessageId: questionMessage.id
        });
        setDraftState("idle");
        return;
      }

      const previewDecision = planArchitectureDraftPreview(normalizedDraftRequest, result);
      if (previewDecision.action === "ask_follow_up") {
        setDraftFollowUpSession({
          proposalSource,
          session: previewDecision.session
        });
        setDraftState("idle");
        appendAssistantMessage(
          "question",
          previewDecision.session.question,
          previewDecision.session.suggestions
        );
        return;
      }

      showDraftPreview(previewDecision.result, proposalSource);
    } catch (error) {
      if (
        controller.signal.aborted ||
        !requestRegistryRef.current.isActive("draft", controller) ||
        isWorkspaceAiChatAbortError(error)
      ) {
        return;
      }

      console.error("Workspace AI draft request failed", error);
      setDraftState("idle");
      setDraftErrorMessage("");
      appendAssistantMessage("error", "AI 초안을 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      requestRegistryRef.current.complete("draft", controller);
    }
  }

  function showDraftPreview(
    result: AiArchitectureDraftResult,
    proposalSource: WorkspaceAiProposalSource = createProposalSource()
  ): void {
    const previewDiagram = compileArchitectureDraftProposal(result, context.diagram).diagram;

    setDraft(result);
    setDraftClarification(null);
    setDraftSourceFingerprint(proposalSource.fingerprint);
    setDraftSourceRevision(proposalSource.revision);
    context.setPreviewDiagram(previewDiagram);
    setDraftState("idle");
    appendAssistantMessage(
      "draft",
      `${result.title} 초안을 보드에 반투명 미리보기로 띄웠습니다. 생성할까요?`
    );
  }

  function applyDraftToBoard(): void {
    if (draft === null || draftIsStale) {
      if (draftIsStale) {
        appendAssistantMessage(
          "status",
          "보드 기준이 바뀌어 이 제안은 적용하지 않았습니다. 최신 기준으로 다시 생성하세요."
        );
      }
      return;
    }

    context.applyDiagramJson(compileArchitectureDraftProposal(draft, context.diagram).diagram);
    context.requestTerraformRefresh();
    requestImmediateDiagramSave();
    setDraft(null);
    setPatchPreviewModel(null);
    setPatchClarification(null);
    setDraftClarification(null);
    setDraftFollowUpSession(null);
    setDraftSourceFingerprint(null);
    setDraftSourceRevision(null);
    appendAssistantMessage("status", "생성했습니다. 현재 보드가 AI 초안으로 전체 교체되었습니다.");
  }

  function applyPatchPreviewToBoard(): void {
    if (patchPreviewModel === null || patchPreviewIsStale) {
      if (patchPreviewIsStale) {
        appendAssistantMessage(
          "status",
          "보드 기준이 바뀌어 이 수정안은 적용하지 않았습니다. 최신 기준으로 다시 생성하세요."
        );
      }
      return;
    }

    context.applyDiagramJson(patchPreviewModel.proposedDiagram);
    context.requestTerraformRefresh();
    requestImmediateDiagramSave();
    setPatchPreviewModel(null);
    setPatchClarification(null);
    setPatchPreviewSourceFingerprint(null);
    setPatchPreviewSourceRevision(null);
    appendAssistantMessage("status", "수정 사항을 보드에 적용했습니다.");
  }

  function requestImmediateDiagramSave(): void {
    const savePromise = context.saveDiagramNow?.();

    if (savePromise) {
      void savePromise.catch(() => undefined);
    }
  }

  function cancelActiveRequest(): void {
    if (!requestRegistryRef.current.cancel(activeChatTab)) {
      return;
    }

    if (activeChatTab === "draft") {
      setDraftState("idle");
      setDraftErrorMessage("");
    } else if (activeChatTab === "errors") {
      setTerraformIssueBatchProgress(null);
      setTerraformIssueAnalyses((currentAnalyses) =>
        Object.fromEntries(
          Object.entries(currentAnalyses).map(([diagnosticKey, analysis]) => [
            diagnosticKey,
            analysis.state === "loading"
              ? { ...analysis, message: REQUEST_CANCELLED_MESSAGE, state: "idle" as const }
              : analysis
          ])
        )
      );
    } else {
      latestTerraformPreviewRequestIdRef.current += 1;
      setTerraformPreviewExplanation((currentExplanation) =>
        currentExplanation?.state === "loading"
          ? {
              ...currentExplanation,
              message: REQUEST_CANCELLED_MESSAGE,
              state: "idle"
            }
          : currentExplanation
      );
    }

    appendAssistantMessage("status", REQUEST_CANCELLED_MESSAGE, [], "single", activeChatTab);
  }

  function cancelDraftPreview(): void {
    context.setPreviewDiagram(null);
    setDraft(null);
    setPatchPreviewModel(null);
    setPatchClarification(null);
    setDraftFollowUpSession(null);
    setDraftSourceFingerprint(null);
    setPatchPreviewSourceFingerprint(null);
    setDraftSourceRevision(null);
    setPatchPreviewSourceRevision(null);
    setDraftErrorMessage("");
    setDraftState("idle");
    appendAssistantMessage("status", "초안 미리보기를 취소했습니다.");
  }

  function cancelPatchPreview(): void {
    context.setPreviewDiagram(null);
    setPatchPreviewModel(null);
    setPatchClarification(null);
    setPatchPreviewSourceFingerprint(null);
    setPatchPreviewSourceRevision(null);
    setDraftErrorMessage("");
    setDraftState("idle");
    appendAssistantMessage("status", "수정 미리보기를 취소했습니다.");
  }

  async function regenerateDraft(): Promise<void> {
    if (lastDraftRequest !== null) {
      await createDraftFromRequest(lastDraftRequest);
      return;
    }

    await createDraftFromConversation(
      messages.filter((message) => getChatMessageScope(message) === "draft")
    );
  }

  async function regeneratePatchPreview(): Promise<void> {
    if (lastPatchPreviewRequest === null) {
      appendAssistantMessage(
        "question",
        "다시 생성할 수정 요청이 없습니다. 원하는 변경을 다시 입력해주세요."
      );
      return;
    }

    await createPatchPreviewFromPrompt(lastPatchPreviewRequest.instruction, {
      ...(lastPatchPreviewRequest.connectionTargetResourceId !== undefined
        ? { connectionTargetResourceId: lastPatchPreviewRequest.connectionTargetResourceId }
        : {}),
      ...(lastPatchPreviewRequest.selectedTargetResourceId !== undefined
        ? { selectedTargetResourceId: lastPatchPreviewRequest.selectedTargetResourceId }
        : {}),
      ...(lastPatchPreviewRequest.skipConnection === true ? { skipConnection: true } : {})
    });
  }

  function toggleSuggestionSelection(messageId: string, suggestion: string): void {
    setSelectedSuggestionLabelsByMessageId((currentSelections) => {
      const selectedSuggestions = currentSelections[messageId] ?? [];
      const nextSuggestions = selectedSuggestions.includes(suggestion)
        ? selectedSuggestions.filter((selectedSuggestion) => selectedSuggestion !== suggestion)
        : [...selectedSuggestions, suggestion];

      return {
        ...currentSelections,
        [messageId]: nextSuggestions
      };
    });
  }

  async function submitSelectedSuggestions(message: WorkspaceAiChatMessage): Promise<void> {
    const selectedSuggestions = selectedSuggestionLabelsByMessageId[message.id] ?? [];

    if (selectedSuggestions.length === 0) {
      return;
    }

    await submitUserMessage(selectedSuggestions.join(", "), {
      messageId: message.id,
      suggestions: selectedSuggestions
    });
  }

  function handleComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>): void {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    void submitChatPrompt();
  }

  function toggleVoiceRecognition(): void {
    if (isVoiceListening) {
      stopVoiceRecognition();
      return;
    }

    startVoiceRecognition();
  }

  function startVoiceRecognition(): void {
    if (!activeScopeDefinition.inputAvailable) {
      return;
    }

    const voiceScope = activeChatTab;
    const SpeechRecognitionConstructor = getBrowserSpeechRecognitionConstructor();

    if (SpeechRecognitionConstructor === undefined) {
      setVoiceInputSupported(false);
      setVoiceStatusMessage("이 브라우저는 음성 인식을 지원하지 않습니다.", voiceScope);
      return;
    }

    if (!window.isSecureContext) {
      setVoiceStatusMessage(
        "음성 인식은 HTTPS 또는 localhost 주소에서만 사용할 수 있습니다.",
        voiceScope
      );
      return;
    }

    clearVoiceNoSpeechTimer();
    releaseSpeechRecognition("abort");

    const recognition = new SpeechRecognitionConstructor();
    voiceInputBaseRef.current = { scope: voiceScope, value: activeComposer.value };
    recognition.lang = "ko-KR";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      clearVoiceNoSpeechTimer();
      const transcript = getSpeechRecognitionTranscript(event);

      if (transcript.length > 0) {
        const voiceInputBase = voiceInputBaseRef.current;
        setComposerValue(
          mergeVoiceTranscript(voiceInputBase.value, transcript),
          voiceInputBase.scope
        );
      }
    };
    recognition.onspeechstart = () => {
      clearVoiceNoSpeechTimer();
    };
    recognition.onerror = (event) => {
      clearVoiceNoSpeechTimer();
      setVoiceListening(false, voiceScope);
      speechRecognitionRef.current = null;
      setVoiceStatusMessage(getVoiceRecognitionErrorMessage(event.error), voiceScope);
    };
    recognition.onend = () => {
      clearVoiceNoSpeechTimer();
      setVoiceListening(false, voiceScope);
      speechRecognitionRef.current = null;
      setVoiceStatusMessage(
        (currentMessage) => (currentMessage === "음성 인식 중입니다." ? "" : currentMessage),
        voiceScope
      );
    };

    try {
      speechRecognitionRef.current = recognition;
      setVoiceListening(true, voiceScope);
      setVoiceStatusMessage("음성 인식 중입니다.", voiceScope);
      recognition.start();
      voiceNoSpeechTimerRef.current = window.setTimeout(() => {
        releaseSpeechRecognition("abort");
        setVoiceListening(false, voiceScope);
        setVoiceStatusMessage("8초 동안 음성이 들리지 않아 음성 인식을 중지했습니다.", voiceScope);
      }, VOICE_NO_SPEECH_TIMEOUT_MS);
    } catch {
      speechRecognitionRef.current = null;
      setVoiceListening(false, voiceScope);
      setVoiceStatusMessage("음성 인식을 시작하지 못했습니다.", voiceScope);
    }
  }

  function stopVoiceRecognition(): void {
    const voiceScope = voiceListeningScope ?? activeChatTab;

    clearVoiceNoSpeechTimer();
    releaseSpeechRecognition("stop");
    setVoiceListening(false, voiceScope);
    setVoiceStatusMessage("", voiceScope);
  }

  function releaseSpeechRecognition(action: "abort" | "stop"): void {
    const recognition = speechRecognitionRef.current;

    if (recognition === null) {
      return;
    }

    clearSpeechRecognitionHandlers(recognition);
    recognition[action]();
    speechRecognitionRef.current = null;
  }

  function clearVoiceNoSpeechTimer(): void {
    if (voiceNoSpeechTimerRef.current === null) {
      return;
    }

    window.clearTimeout(voiceNoSpeechTimerRef.current);
    voiceNoSpeechTimerRef.current = null;
  }

  if (isBlockedByWorkspaceOverlay) {
    return null;
  }

  if (!isOpen) {
    return (
      <WorkspaceAiChatLauncher
        isRightPanelOpen={context.isRightPanelOpen}
        onOpen={() => onOpenChange(true)}
        ref={launcherButtonRef}
      />
    );
  }

  return (
    <WorkspaceAiWorkbench
      activeScope={activeChatTab}
      footer={
        activeScopeDefinition.inputAvailable ? (
          <form className={styles.composer} onSubmit={(event) => void submitChatPrompt(event)}>
            <label className={styles.composerInput}>
              <span>설계 요구사항</span>
              <textarea
                aria-label="AI 채팅 입력"
                onChange={(event) => setComposerValue(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder="새 설계 또는 변경할 내용을 입력하세요"
                ref={composerTextareaRef}
                rows={1}
                value={activeComposer.value}
              />
            </label>
            <div className={styles.composerControls}>
              <button
                aria-label={isVoiceListening ? "음성 인식 중지" : "음성 인식 시작"}
                aria-pressed={isVoiceListening}
                className={styles.voiceButton}
                data-listening={isVoiceListening}
                disabled={!isVoiceInputSupported || isChatBusy}
                onClick={toggleVoiceRecognition}
                title={isVoiceListening ? "음성 인식 중지" : "음성 인식 시작"}
                type="button"
              >
                <Mic size={17} aria-hidden="true" />
              </button>
              <button
                className={styles.sendButton}
                disabled={activeComposer.value.trim().length === 0 || isChatBusy}
                type="submit"
              >
                <Send size={16} aria-hidden="true" />
                보내기
              </button>
            </div>
            {activeComposer.voiceStatusMessage.length > 0 ? (
              <p className={styles.voiceStatus} role="status">
                {activeComposer.voiceStatusMessage}
              </p>
            ) : null}
          </form>
        ) : null
      }
      hasHistory={hasActiveChatHistory}
      isBusy={isChatBusy}
      isMobileSurface={isMobileChatSurface}
      isRightPanelOpen={context.isRightPanelOpen}
      onCancelRequest={cancelActiveRequest}
      onClear={clearActiveChatHistory}
      onClose={closeChatDock}
      onScopeButtonRef={(scope, element) => {
        tabButtonRefs.current[scope] = element;
      }}
      onScopeChange={selectChatTab}
      onScopeKeyDown={handleChatTabKeyDown}
      onTranscriptScroll={handleTranscriptScroll}
      scopeDefinitions={WORKBENCH_SCOPE_DEFINITIONS}
      status={chatDockStatus}
      surfaceRef={chatDialogRef}
      transcriptRef={transcriptRef}
    >
      {repositoryTemplate ? (
        <aside className={styles.templateContext} role="status">
          <span>Repository Analysis Template</span>
          <strong>{repositoryTemplate.title}</strong>
          <code>{repositoryTemplate.id}</code>
          <p>AI는 이 Template을 바꾸지 않고 부족한 요구사항만 보완합니다.</p>
        </aside>
      ) : null}
      {!hasActiveChatHistory ? (
        <div className={`${styles.message} ${styles.assistantMessage}`} data-kind="question">
          <span className={styles.messageLabel}>안내</span>
          <p>{activeScopeDefinition.emptyDescription}</p>
        </div>
      ) : null}
      {displayedMessages.map((message) => {
        const isMultiSelect = message.selectionMode === "multiple";
        const submittedSuggestions = message.selectedSuggestions ?? [];
        const hasSubmittedSuggestion = submittedSuggestions.length > 0;
        const selectedSuggestions = hasSubmittedSuggestion
          ? submittedSuggestions
          : (selectedSuggestionLabelsByMessageId[message.id] ?? []);

        return (
          <div
            className={`${styles.message} ${
              message.role === "user" ? styles.userMessage : styles.assistantMessage
            }`}
            data-kind={message.kind}
            key={message.id}
          >
            <span className={styles.messageLabel}>
              {message.role === "user" ? "나" : message.kind === "question" ? "질문" : "AI"}
            </span>
            <p>
              {message.kind === "question"
                ? message.content.replace(/^질문:\s*/u, "")
                : message.content}
            </p>
            {message.role === "assistant" &&
            message.suggestions &&
            message.suggestions.length > 0 ? (
              <div className={styles.choiceGroup} aria-label="추천 답안">
                {message.suggestions.map((suggestion) => {
                  const isSelected = selectedSuggestions.includes(suggestion);
                  const suggestionPresentation = getWorkspaceAiChatSuggestionPresentation({
                    hasSubmittedSuggestion,
                    isChatBusy,
                    isSelected
                  });
                  const suggestionButtonClassName = isSelected
                    ? `${styles.choiceButton} ${styles.choiceButtonSelected}`
                    : styles.choiceButton;

                  return (
                    <button
                      aria-pressed={isSelected}
                      className={suggestionButtonClassName}
                      disabled={suggestionPresentation.disabled}
                      key={suggestion}
                      onClick={
                        isMultiSelect
                          ? () => toggleSuggestionSelection(message.id, suggestion)
                          : () =>
                              void submitUserMessage(suggestion, {
                                messageId: message.id,
                                suggestions: [suggestion]
                              })
                      }
                      type="button"
                    >
                      <span>{suggestion}</span>
                      {suggestionPresentation.selectionState !== null ? (
                        <span className={styles.choiceSelectionState}>
                          {suggestionPresentation.selectionState}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
                {isMultiSelect ? (
                  <button
                    className={styles.choiceSubmit}
                    disabled={
                      isChatBusy || hasSubmittedSuggestion || selectedSuggestions.length === 0
                    }
                    onClick={() => void submitSelectedSuggestions(message)}
                    type="button"
                  >
                    선택 완료
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}

      {activeChatTab === "draft" ? (
        draftState === "loading" ? (
          <WorkspaceAiWorkbenchDraftProgress />
        ) : (
          <WorkspaceAiWorkbenchRequestMessage state={draftState} message={draftErrorMessage} />
        )
      ) : null}

      {activeChatTab === "preview" ? (
        <section className={styles.artifact} aria-labelledby="workspace-ai-review-title">
          <header className={styles.artifactHeader}>
            <div>
              <span>Terraform</span>
              <h3 id="workspace-ai-review-title">에이전트 리뷰</h3>
            </div>
            <p className={styles.artifactContext} aria-label="현재 검토 범위">
              {formatTerraformReviewContext(terraformAiContext.reviewScope.label)}
            </p>
          </header>
          <div className={styles.taskActions}>
            <button
              className={styles.primaryAction}
              disabled={
                terraformPreviewExplanation?.state === "loading" ||
                terraformAiContext.reviewScope.terraformCode.trim().length === 0
              }
              onClick={() => void runTerraformAgentReview()}
              type="button"
            >
              에이전트 리뷰
            </button>
          </div>
          {terraformPreviewExplanationIsStale ? (
            <p className={styles.staleNotice} role="status">
              검토 대상 또는 Terraform 코드가 변경되었습니다. 최신 대상을 다시 검토하세요.
            </p>
          ) : null}
          {terraformPreviewExplanation?.state === "loading" ? (
            <WorkspaceAiWorkbenchReviewProgress elapsedMs={terraformPreviewReviewElapsedMs} />
          ) : null}
          {terraformPreviewExplanation?.state === "error" ||
          (terraformPreviewExplanation?.message &&
            terraformPreviewExplanation.state !== "loading") ? (
            <WorkspaceAiWorkbenchRequestMessage
              state={terraformPreviewExplanation.state}
              message={terraformPreviewExplanation.message}
            />
          ) : null}
          {terraformPreviewExplanation?.explanation ? (
            <div className={styles.artifactBody}>
              <p className={styles.artifactContext} aria-label="검토 결과 범위">
                {formatTerraformReviewContext(terraformPreviewExplanation.reviewScope.label)}
              </p>
              <WorkspaceAiWorkbenchTerraformPreviewResult
                preview={terraformPreviewExplanation.explanation}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      {activeChatTab === "errors" ? (
        <>
          <section className={styles.artifact} aria-labelledby="workspace-ai-error-actions-title">
            <header className={styles.artifactHeader}>
              <div>
                <span>Terraform</span>
                <h3 id="workspace-ai-error-actions-title">오류 분석</h3>
              </div>
            </header>
            <label className={styles.issueSelect}>
              <span>분석할 오류</span>
              <select
                disabled={terraformAiContext.issues.length === 0}
                onChange={(event) => onSelectTerraformIssue(event.target.value || null)}
                value={selectedTerraformIssue?.diagnosticKey ?? ""}
              >
                {terraformAiContext.issues.length === 0 ? (
                  <option value="">오류 없음</option>
                ) : null}
                {terraformAiContext.issues.map((issue) => (
                  <option key={issue.diagnosticKey} value={issue.diagnosticKey}>
                    {formatTerraformDiagnosticTitle(issue.diagnostic)}
                  </option>
                ))}
              </select>
            </label>
            <div className={styles.taskActions}>
              <button
                className={styles.primaryAction}
                disabled={selectedTerraformIssue === null || isTerraformIssueAnalysisRunning}
                onClick={() => void analyzeSelectedTerraformIssue()}
                type="button"
              >
                선택 오류 분석
              </button>
              <button
                className={styles.secondaryAction}
                disabled={
                  currentTerraformErrorIssues.length === 0 || isTerraformIssueAnalysisRunning
                }
                onClick={() => void analyzeAllTerraformIssues()}
                type="button"
              >
                모두 분석
              </button>
            </div>
            {terraformIssueBatchProgress ? (
              <p aria-live="polite" className={styles.progress} role="status">
                {terraformIssueBatchProgress.total}개 중 {terraformIssueBatchProgress.completed}개
                분석 완료
              </p>
            ) : null}
            {showTerraformApplyAllApproval ? (
              <div className={styles.approvalTray}>
                <div>
                  <strong>안전 수정 일괄 적용</strong>
                  <p>분석이 끝난 오류 중 자동 적용 가능한 변경만 Terraform 코드에 반영합니다.</p>
                </div>
                <div className={styles.approvalActions}>
                  <button
                    className={styles.secondaryAction}
                    disabled={
                      !terraformApplyAllPlan.canApply ||
                      isTerraformIssueAnalysisRunning ||
                      applyingTerraformFixRequestId !== null
                    }
                    onClick={applyAllTerraformIssueFixes}
                    type="button"
                  >
                    적용 가능한 항목 모두 수정
                  </button>
                </div>
              </div>
            ) : (
              <p className={styles.hint}>{terraformApplyAllPlan.reason}</p>
            )}
          </section>

          {selectedTerraformIssue ? (
            <section
              className={styles.artifact}
              aria-labelledby="workspace-ai-selected-error-title"
            >
              <header className={styles.artifactHeader}>
                <div>
                  <span>분석 대상</span>
                  <h3 id="workspace-ai-selected-error-title">
                    {formatTerraformDiagnosticTitle(selectedTerraformIssue.diagnostic)}
                  </h3>
                </div>
              </header>
              {selectedTerraformIssue.isStale || selectedTerraformIssueAnalysisIsStale ? (
                <p className={styles.staleNotice} role="status">
                  Terraform 코드가 변경되어 재검증 또는 재분석이 필요합니다.
                </p>
              ) : null}
              {selectedTerraformIssueAnalysis?.message &&
              selectedTerraformIssueAnalysis.state !== "loading" ? (
                <WorkspaceAiWorkbenchRequestMessage
                  state={selectedTerraformIssueAnalysis.state}
                  message={selectedTerraformIssueAnalysis.message}
                />
              ) : null}
              {selectedTerraformIssueAnalysis?.explanation ? (
                <div className={styles.artifactBody}>
                  <WorkspaceAiWorkbenchTerraformIssueResult
                    diagnostic={selectedTerraformIssue.diagnostic}
                    explanation={selectedTerraformIssueAnalysis.explanation}
                    terraformCode={selectedTerraformIssueCode}
                  />
                </div>
              ) : null}
              {terraformFixUnavailableReasons[selectedTerraformIssue.diagnosticKey] ||
              !selectedTerraformFixPlan.canApply ? (
                <p className={styles.fixUnavailable} role="status">
                  {terraformFixUnavailableReasons[selectedTerraformIssue.diagnosticKey] ||
                    selectedTerraformFixPlan.reason}
                </p>
              ) : null}
              {showSelectedTerraformApproval ? (
                <div className={styles.approvalTray}>
                  <div>
                    <strong>Terraform 변경 승인</strong>
                    <p>분석 결과의 수정안을 확인한 뒤 선택한 오류에만 적용합니다.</p>
                  </div>
                  <div className={styles.approvalActions}>
                    <button
                      className={styles.primaryAction}
                      disabled={
                        !selectedTerraformFixPlan.canApply ||
                        applyingTerraformFixRequestId !== null ||
                        isSelectedTerraformFixCompleted
                      }
                      onClick={applySelectedTerraformIssueFix}
                      type="button"
                    >
                      {isSelectedTerraformFixCompleted
                        ? "수정 완료"
                        : applyingTerraformFixRequestId !== null
                          ? "적용 중"
                          : "수정안 적용"}
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}

      {activeChatTab === "draft" && draft !== null ? (
        <section className={styles.artifact} aria-labelledby="workspace-ai-draft-result-title">
          <header className={styles.artifactHeader}>
            <div>
              <span>설계 제안</span>
              <h3 id="workspace-ai-draft-result-title">{draft.title}</h3>
            </div>
            <p>{draft.architectureJson.nodes.length}개 리소스</p>
          </header>

          {draftSafetyWarnings.length > 0 ? (
            <div className={styles.notice} role="status">
              {draftSafetyWarnings.map((warning) => (
                <p key={`${warning.code}-${warning.message}`}>{warning.message}</p>
              ))}
            </div>
          ) : null}
          {draftIsStale ? (
            <div className={styles.staleNotice} role="status">
              <p>보드가 변경되어 이 제안은 적용할 수 없습니다. 최신 기준으로 다시 생성하세요.</p>
            </div>
          ) : null}
          <div className={styles.approvalTray}>
            <div>
              <strong>Board 변경 승인</strong>
              <p>미리보기를 확인한 뒤 현재 Board를 이 설계 제안으로 교체합니다.</p>
            </div>
            <div className={styles.approvalActions}>
              <button
                className={styles.primaryAction}
                disabled={draftIsStale}
                onClick={applyDraftToBoard}
                type="button"
              >
                Board에 적용
              </button>
              <button className={styles.secondaryAction} onClick={cancelDraftPreview} type="button">
                취소
              </button>
              <button
                className={styles.secondaryAction}
                disabled={isChatBusy}
                onClick={() => void regenerateDraft()}
                type="button"
              >
                {draftIsStale ? "최신 기준으로 다시 생성" : "다시 생성"}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {activeChatTab === "draft" && patchPreviewModel !== null ? (
        <section className={styles.artifact} aria-labelledby="workspace-ai-patch-result-title">
          <header className={styles.artifactHeader}>
            <div>
              <span>생성된 변경</span>
              <h3 id="workspace-ai-patch-result-title">수정 미리보기</h3>
            </div>
            <p>
              {patchPreviewModel.isParameterOnly
                ? patchPreviewModel.parameterChanges.length
                : patchPreviewModel.preview.changes.length}
              {patchPreviewModel.isParameterOnly ? "개 파라미터" : "개 변경"}
            </p>
          </header>
          <div className={styles.artifactBody}>
            <WorkspaceAiWorkbenchExplanation
              explanation={patchPreviewModel.preview.llmExplanation}
            />
            {patchPreviewModel.isParameterOnly ? (
              <WorkspaceAiPatchParameterPreview changes={patchPreviewModel.parameterChanges} />
            ) : (
              <ul className={styles.changeList} aria-label="생성된 변경 사항">
                {patchPreviewModel.preview.changes.map((change) => (
                  <li
                    key={`${change.action}-${change.resourceId ?? change.resourceType ?? change.summary}`}
                  >
                    {change.summary}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {patchPreviewIsStale ? (
            <div className={styles.staleNotice} role="status">
              <p>보드가 변경되어 이 수정안은 적용할 수 없습니다. 최신 기준으로 다시 생성하세요.</p>
            </div>
          ) : null}
          <div className={styles.approvalTray}>
            <div>
              <strong>Board 변경 승인</strong>
              <p>미리보기의 변경 사항만 현재 Board에 반영합니다.</p>
            </div>
            <div className={styles.approvalActions}>
              <button
                className={styles.primaryAction}
                disabled={patchPreviewIsStale}
                onClick={applyPatchPreviewToBoard}
                type="button"
              >
                Board에 적용
              </button>
              <button className={styles.secondaryAction} onClick={cancelPatchPreview} type="button">
                취소
              </button>
              {patchPreviewIsStale ? (
                <button
                  className={styles.secondaryAction}
                  disabled={isChatBusy}
                  onClick={() => void regeneratePatchPreview()}
                  type="button"
                >
                  최신 기준으로 다시 생성
                </button>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}
    </WorkspaceAiWorkbench>
  );
}

function WorkspaceAiPatchParameterPreview({
  changes
}: {
  readonly changes: readonly WorkspaceAiPatchParameterChange[];
}) {
  const changesByResource = new Map<string, WorkspaceAiPatchParameterChange[]>();

  for (const change of changes) {
    const existingChanges = changesByResource.get(change.resourceId) ?? [];
    existingChanges.push(change);
    changesByResource.set(change.resourceId, existingChanges);
  }

  return (
    <section className={styles.parameterPreview} aria-label="적용 예정 파라미터">
      <p>적용하면 아래 파라미터 값이 보드에 저장됩니다.</p>
      {[...changesByResource.values()].map((resourceChanges) => {
        const [firstChange] = resourceChanges;

        if (!firstChange) {
          return null;
        }

        return (
          <div className={styles.parameterPreviewResource} key={firstChange.resourceId}>
            <div>
              <strong>{firstChange.resourceLabel}</strong>
              <span>{firstChange.resourceType}</span>
            </div>
            <dl>
              {resourceChanges.map((change) => (
                <div key={change.parameter}>
                  <dt>{change.parameter}</dt>
                  <dd>
                    <span>현재</span>
                    <code>{change.before}</code>
                  </dd>
                  <dd>
                    <span>변경</span>
                    <code>{change.after}</code>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        );
      })}
    </section>
  );
}

function readBrowserTerraformIssueAnalyses(
  projectId: string
): Record<string, TerraformIssueAnalysisState> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    return Object.fromEntries(
      readStoredTerraformIssueAnalyses(window.localStorage, projectId).map((analysis) => [
        analysis.diagnosticKey,
        {
          explanation: analysis.explanation,
          message: "",
          state: "idle" as const,
          terraformFingerprint: analysis.terraformFingerprint
        }
      ])
    );
  } catch {
    return {};
  }
}

function getTerraformIssueSourceResolutionProblem(
  diagnostic: TerraformDiagnostic,
  terraformContext: WorkspaceTerraformAiContext
): string {
  if (
    diagnostic.sourceFileName &&
    !terraformContext.files.some((file) => file.fileName === diagnostic.sourceFileName)
  ) {
    return `오류 원본 파일(${diagnostic.sourceFileName})을 현재 Terraform 파일에서 찾을 수 없습니다. 재검증한 뒤 다시 분석하세요.`;
  }

  if (!diagnostic.sourceFileName && terraformContext.files.length > 1) {
    return "오류가 발생한 Terraform 파일을 특정할 수 없습니다. 재검증한 뒤 다시 분석하세요.";
  }

  return "";
}

function trapFocusWithin(container: HTMLElement, event: KeyboardEvent): void {
  const focusableElements = [
    ...container.querySelectorAll<HTMLElement>(
      "button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], summary, [tabindex]:not([tabindex='-1'])"
    )
  ].filter(
    (element) =>
      element.tabIndex >= 0 &&
      element.getAttribute("aria-hidden") !== "true" &&
      !element.hidden &&
      element.closest("[inert]") === null &&
      element.getClientRects().length > 0
  );
  const first = focusableElements[0];
  const last = focusableElements.at(-1);

  if (!first || !last) {
    event.preventDefault();
    container.focus();
    return;
  }

  if (!container.contains(document.activeElement)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
    return;
  }

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function createInitialChatMessages(): WorkspaceAiChatMessage[] {
  return [
    createChatMessage(
      "assistant",
      "question",
      "만들고 싶은 서비스를 자연어로 말해주세요. 정보가 부족하면 제가 먼저 되물어볼게요."
    )
  ];
}

function findPatchClarificationCandidate(
  clarification: ArchitecturePatchClarification,
  answer: string
): ArchitecturePatchClarificationCandidate | undefined {
  return findSharedPatchClarificationCandidate(clarification, answer);
}

function findPatchClarificationSuggestion(
  clarification: ArchitecturePatchClarification,
  answer: string
): string | undefined {
  return findSharedPatchClarificationSuggestion(clarification, answer);
}

function isAddResourceConnectionClarification(
  clarification: ArchitecturePatchClarification
): boolean {
  return isSharedAddResourceConnectionClarification(clarification);
}

function isServicePurposePatchClarification(
  clarification: ArchitecturePatchClarification
): boolean {
  return isSharedServicePurposePatchClarification(clarification);
}

function isSkipConnectionSuggestion(suggestion: string): boolean {
  return isSharedSkipConnectionSuggestion(suggestion);
}

function isNoResourceAdditionSuggestion(suggestion: string): boolean {
  return isSharedNoResourceAdditionSuggestion(suggestion);
}

function getPatchClarificationSuggestions(
  clarification: ArchitecturePatchClarification
): readonly string[] {
  return getSharedPatchClarificationSuggestions(clarification);
}

function isArchitectureDraftClarification(
  response: AiArchitectureDraftResult | ArchitectureDraftClarification
): response is ArchitectureDraftClarification {
  return "status" in response && response.status === "needs_clarification";
}

function createPatchPreviewSummary(preview: ArchitecturePatchPreview): string {
  if (preview.changes.length === 0) {
    return NO_RESOURCE_ADDITION_MESSAGE;
  }

  const changeSummary =
    preview.changes.length === 1
      ? preview.changes[0]?.summary
      : `${preview.changes.length}개 변경 사항을 미리보기로 만들었습니다.`;

  return changeSummary ?? "수정 미리보기를 만들었습니다. 적용할까요?";
}

function createRequirementPromptFromMessages(messages: readonly WorkspaceAiChatMessage[]): string {
  return createLatestUserRequirementPrompt(messages);
}

function createRequirementPromptWithoutNoResourceAddition(
  messages: readonly WorkspaceAiChatMessage[]
): string {
  return createLatestUserRequirementPromptExcluding(messages, NO_RESOURCE_ADDITION_SUGGESTION);
}

function createWorkspaceAiPromptGateMessage(
  classification: Exclude<WorkspaceAiChatPromptClassification, "architecture">
): string {
  if (classification === "ambiguous") {
    return "질문: 어떤 다이어그램을 생성하거나 어떻게 수정할지 조금 더 구체적으로 알려주세요. 예: '로그인 서비스 다이어그램 만들어줘', '여기에 S3 버킷 추가해줘'.";
  }

  return "질문: 이 채팅은 Practice Architecture 다이어그램 생성과 수정 요청만 처리합니다. 만들 서비스나 바꿀 리소스를 포함해서 다시 입력해주세요.";
}

function getBrowserSpeechRecognitionConstructor(): BrowserSpeechRecognitionConstructor | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  const speechWindow = window as SpeechRecognitionWindow;

  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

function clearSpeechRecognitionHandlers(recognition: BrowserSpeechRecognition): void {
  recognition.onend = null;
  recognition.onerror = null;
  recognition.onresult = null;
  recognition.onspeechstart = null;
}

function getSpeechRecognitionTranscript(event: BrowserSpeechRecognitionEvent): string {
  const transcriptParts: string[] = [];

  for (let resultIndex = 0; resultIndex < event.results.length; resultIndex += 1) {
    const result = event.results[resultIndex];
    const transcript = result?.[0]?.transcript.trim();

    if (transcript) {
      transcriptParts.push(transcript);
    }
  }

  return transcriptParts.join(" ").trim();
}

function mergeVoiceTranscript(baseValue: string, transcript: string): string {
  const trimmedBaseValue = baseValue.trim();

  if (trimmedBaseValue.length === 0) {
    return transcript;
  }

  return `${trimmedBaseValue} ${transcript}`;
}

function getVoiceRecognitionErrorMessage(error: string): string {
  if (error === "not-allowed" || error === "service-not-allowed") {
    return "마이크 권한을 허용해야 음성 인식을 사용할 수 있습니다.";
  }

  if (error === "network") {
    return "브라우저 음성 인식 서비스에 연결하지 못했습니다. Chrome에서 localhost/HTTPS로 열고 인터넷 연결을 확인해주세요.";
  }

  if (error === "audio-capture") {
    return "마이크 장치를 찾지 못했습니다. OS와 브라우저의 마이크 입력 장치를 확인해주세요.";
  }

  if (error === "language-not-supported") {
    return "현재 브라우저가 한국어 음성 인식을 지원하지 않습니다.";
  }

  if (error === "no-speech") {
    return "음성이 감지되지 않았습니다. 다시 눌러 말해주세요.";
  }

  if (error === "aborted") {
    return "음성 인식이 취소되었습니다.";
  }

  return `음성 인식 중 오류가 발생했습니다. (${error})`;
}

function formatTerraformIssueRawMessage(diagnostic: TerraformDiagnostic): string {
  return `${diagnostic.code ?? "terraform.unknown"}\n${formatTerraformDiagnosticTitle(diagnostic)}\n${diagnostic.message}`;
}

function createDraftSafetyWarnings(
  draft: AiArchitectureDraftResult | null,
  boardHasResources: boolean
): ArchitectureGuardrailWarning[] {
  if (draft === null || !boardHasResources) {
    return [];
  }

  return [
    {
      code: "board_replacement_required",
      message:
        "생성을 누르면 현재 보드가 AI 초안으로 전체 교체됩니다. 이번 버전은 패치 적용이 아니라 전체 교체입니다."
    }
  ];
}

function readStoredChatMessages(projectId: string): WorkspaceAiChatMessage[] {
  if (typeof window === "undefined") {
    return createInitialChatMessages();
  }

  try {
    const rawValue = window.localStorage.getItem(createWorkspaceAiChatStorageKey(projectId));
    const parsedValue = rawValue ? JSON.parse(rawValue) : null;

    if (Array.isArray(parsedValue)) {
      const storedMessages = parsedValue.filter(isWorkspaceAiChatMessage);
      return storedMessages.length > 0
        ? trimChatMessages(storedMessages)
        : createInitialChatMessages();
    }
  } catch {
    // Ignore malformed local chat history and start fresh.
  }

  return createInitialChatMessages();
}

function storeChatMessages(projectId: string, messages: readonly WorkspaceAiChatMessage[]): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      createWorkspaceAiChatStorageKey(projectId),
      JSON.stringify(trimChatMessages(messages))
    );
  } catch {
    // Chat history is helpful UI state, not a blocking persistence contract.
  }
}

function createChatMessage(
  role: WorkspaceAiChatMessageRole,
  kind: WorkspaceAiChatMessageKind,
  content: string,
  suggestions: readonly string[] = [],
  selectionMode: WorkspaceAiChatSelectionMode = "single",
  scope: WorkspaceAiChatScope = "draft"
): WorkspaceAiChatMessage {
  const message: WorkspaceAiChatMessage = {
    id: createChatMessageId(),
    content,
    createdAt: new Date().toISOString(),
    kind,
    role,
    scope,
    selectionMode
  };

  if (suggestions.length > 0) {
    return {
      ...message,
      suggestions
    };
  }

  return message;
}

function getChatMessageScope(message: WorkspaceAiChatMessage): WorkspaceAiChatScope {
  if (message.scope === "draft" || message.scope === "errors" || message.scope === "preview") {
    return message.scope;
  }

  if (message.kind === "preview") {
    return "preview";
  }

  if (message.kind === "terraform_issue") {
    return "errors";
  }

  return "draft";
}

function createChatMessageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function trimChatMessages(messages: readonly WorkspaceAiChatMessage[]): WorkspaceAiChatMessage[] {
  return messages.slice(-MAX_CHAT_MESSAGES);
}

function markChatMessageSuggestionsSelected(
  messages: readonly WorkspaceAiChatMessage[],
  selection: WorkspaceAiChatSuggestionSelection
): WorkspaceAiChatMessage[] {
  const selectedSuggestions = Array.from(new Set(selection.suggestions ?? []));

  if (selectedSuggestions.length === 0) {
    return [...messages];
  }

  return messages.map((message) => {
    if (message.id !== selection.messageId) {
      return message;
    }

    const existingSuggestions = message.selectedSuggestions ?? [];
    const nextSelectedSuggestions = [...existingSuggestions];
    const nextSuggestions = [...(message.suggestions ?? [])];

    for (const suggestion of selectedSuggestions) {
      if (!nextSelectedSuggestions.includes(suggestion)) nextSelectedSuggestions.push(suggestion);
      if (!nextSuggestions.includes(suggestion)) nextSuggestions.push(suggestion);
    }

    return {
      ...message,
      selectedSuggestions: nextSelectedSuggestions,
      suggestions: nextSuggestions
    };
  });
}

function isWorkspaceAiChatMessage(value: unknown): value is WorkspaceAiChatMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<WorkspaceAiChatMessage>;

  return (
    (candidate.role === "assistant" || candidate.role === "user") &&
    typeof candidate.content === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.id === "string" &&
    (candidate.scope === undefined ||
      candidate.scope === "draft" ||
      candidate.scope === "errors" ||
      candidate.scope === "preview") &&
    (candidate.selectionMode === undefined ||
      candidate.selectionMode === "single" ||
      candidate.selectionMode === "multiple") &&
    (candidate.selectedSuggestions === undefined ||
      (Array.isArray(candidate.selectedSuggestions) &&
        candidate.selectedSuggestions.every((suggestion) => typeof suggestion === "string"))) &&
    (candidate.suggestions === undefined ||
      (Array.isArray(candidate.suggestions) &&
        candidate.suggestions.every((suggestion) => typeof suggestion === "string"))) &&
    (candidate.kind === "draft" ||
      candidate.kind === "error" ||
      candidate.kind === "patch" ||
      candidate.kind === "preview" ||
      candidate.kind === "question" ||
      candidate.kind === "status" ||
      candidate.kind === "terraform_issue")
  );
}

function isBuiltInTemplateId(templateId: string): templateId is (typeof TEMPLATE_IDS)[number] {
  return (TEMPLATE_IDS as readonly string[]).includes(templateId);
}
