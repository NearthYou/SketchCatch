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
import { Mic, Send, Trash2, X } from "lucide-react";
import { getApiErrorMessage } from "../../lib/api-client";
import { compileArchitectureDraftProposal } from "../architecture-board-compiler";
import type { DiagramEditorPanelContext } from "../diagram-editor";
import {
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
  isWorkspaceAiChatStorageHydrated,
  readStoredActiveChatScope,
  shouldShowWorkspaceAiChatMessage,
  storeActiveChatScope,
  workspaceAiChatScopes,
  type WorkspaceAiChatComposerState,
  type WorkspaceAiChatScope
} from "./workspace-ai-chat-conversation";
import {
  WorkspaceAiExplanation,
  WorkspaceAiTechnicalDetails,
  WorkspaceAiTechnicalList,
  WorkspaceAiTerraformPreviewResult,
  WorkspaceAiRequestMessage
} from "./WorkspaceAiPanelPieces";
import type { AiRequestState } from "./WorkspaceAiPanelPieces";
import {
  planArchitectureDraftPreview,
  resolveArchitectureDraftFollowUpAnswer,
  type ArchitectureDraftFollowUpSession
} from "./workspace-ai-draft-follow-up";
import {
  createLatestUserRequirementPrompt,
  createLatestUserRequirementPromptExcluding
} from "./workspace-ai-chat-history";
import {
  classifyWorkspaceAiChatPrompt,
  resolvePendingPreviewChatAction,
  resolveWorkspaceAiChatAction,
  type WorkspaceAiChatPromptClassification
} from "./workspace-ai-chat-routing";
import {
  createWorkspaceAiPatchPreviewModel,
  type WorkspaceAiPatchPreviewModel
} from "./workspace-ai-patch-preview";
import { formatTerraformDiagnosticTitle } from "./terraform-panel-utils";
import {
  createTerraformIssueFixPlan,
  type TerraformIssueAiRequest,
  type TerraformPreviewAiRequest,
  type TerraformSafeFixApplyRequest,
  type TerraformSafeFixApplyResult
} from "./workspace-terraform-ai";
import {
  createTerraformIssuePresentation,
  formatTerraformReviewContext
} from "./workspace-ai-result-presentation";
import {
  getTerraformPreviewReviewProgressStep,
  getWorkspaceAiChatDockStatus,
  terraformPreviewReviewSteps
} from "./workspace-ai-chat-status";
import {
  isWorkspaceAiChatAbortError,
  WorkspaceAiChatRequestRegistry
} from "./workspace-ai-chat-request";
import { WorkspaceAiChatLauncher } from "./WorkspaceAiChatLauncher";
import { TerraformAgentReviewButton } from "./TerraformAgentReviewButton";
import styles from "./workspace.module.css";

export type WorkspaceAiChatDockProps = {
  readonly context: DiagramEditorPanelContext;
  readonly canRequestTerraformPreviewReview: boolean;
  readonly onApplyTerraformIssueFix: (request: TerraformSafeFixApplyRequest) => void;
  readonly onRequestTerraformPreviewReview: () => void;
  readonly projectId: string;
  readonly repositoryAnalysisSourceRepositoryId?: string | undefined;
  readonly repositoryTemplateId?: string | undefined;
  readonly terraformIssueRequest: TerraformIssueAiRequest | null;
  readonly terraformPreviewRequest: TerraformPreviewAiRequest | null;
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
  readonly prompt: string;
  readonly clarification: ArchitectureDraftClarification;
};

type TerraformIssueResolutionState = {
  readonly explanation: AiTerraformErrorExplanationResult | null;
  readonly message: string;
  readonly request: TerraformIssueAiRequest;
  readonly state: AiRequestState;
};

type TerraformIssueHistoryEntry = {
  readonly explanation: AiTerraformErrorExplanationResult;
  readonly request: TerraformIssueAiRequest;
};

type TerraformPreviewExplanationState = {
  readonly explanation: AiTerraformPreviewExplanationResult | null;
  readonly message: string;
  readonly request: TerraformPreviewAiRequest;
  readonly state: AiRequestState;
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

const MAX_CHAT_MESSAGES = 80;
const MAX_TERRAFORM_ISSUE_HISTORY = 20;
const STORAGE_KEY_PREFIX = "sketchcatch.workspaceAiChat";
const NO_RESOURCE_ADDITION_SUGGESTION = "추가 안 함";
const NO_RESOURCE_ADDITION_MESSAGE = "추가 없이 지금까지의 요청으로 새 초안을 생성합니다.";
const REQUEST_CANCELLED_MESSAGE = "요청을 중지했습니다.";
const VOICE_NO_SPEECH_TIMEOUT_MS = 8000;

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
  canRequestTerraformPreviewReview,
  onApplyTerraformIssueFix,
  onRequestTerraformPreviewReview,
  projectId,
  repositoryAnalysisSourceRepositoryId,
  repositoryTemplateId,
  terraformIssueRequest,
  terraformPreviewRequest,
  terraformSafeFixApplyResult
}: WorkspaceAiChatDockProps) {
  const [isOpen, setOpen] = useState(false);
  const [activeChatTab, setActiveChatTab] = useState<WorkspaceAiChatScope>("draft");
  const [composerStates, setComposerStates] = useState<
    Record<WorkspaceAiChatScope, WorkspaceAiChatComposerState>
  >(() => createWorkspaceAiChatComposerStates());
  const [voiceListeningScope, setVoiceListeningScope] = useState<WorkspaceAiChatScope | null>(null);
  const [isVoiceInputSupported, setVoiceInputSupported] = useState(true);
  const [isMobileChatSurface, setMobileChatSurface] = useState(false);
  const [messages, setMessages] = useState<WorkspaceAiChatMessage[]>(() =>
    createInitialChatMessages()
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
    useState<ArchitectureDraftFollowUpSession | null>(null);
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
  const [terraformIssueResolution, setTerraformIssueResolution] =
    useState<TerraformIssueResolutionState | null>(null);
  const [terraformIssueHistory, setTerraformIssueHistory] = useState<
    readonly TerraformIssueHistoryEntry[]
  >([]);
  const [hydratedStorageProjectId, setHydratedStorageProjectId] = useState<string | null>(null);
  const [openTerraformIssueRequestIds, setOpenTerraformIssueRequestIds] = useState<
    readonly number[]
  >([]);
  const [applyingTerraformFixRequestId, setApplyingTerraformFixRequestId] = useState<number | null>(
    null
  );
  const [completedTerraformFixRequestIds, setCompletedTerraformFixRequestIds] = useState<
    readonly number[]
  >([]);
  const [draftState, setDraftState] = useState<AiRequestState>("idle");
  const [draftErrorMessage, setDraftErrorMessage] = useState("");
  const repositoryTemplate = useMemo(
    () =>
      repositoryTemplateId
        ? listBoardTemplates().find((template) => template.id === repositoryTemplateId) ?? null
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
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const voiceInputBaseRef = useRef<VoiceInputBase>({ scope: "draft", value: "" });
  const voiceNoSpeechTimerRef = useRef<number | null>(null);
  const latestTerraformIssueRequestIdRef = useRef<number | null>(null);
  const latestTerraformPreviewRequestIdRef = useRef<number | null>(null);
  const latestTerraformSafeFixResultRequestIdRef = useRef<number | null>(null);
  const requestRegistryRef = useRef(new WorkspaceAiChatRequestRegistry());
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

  const visibleMessages = useMemo(
    () => messages.filter((message) => getChatMessageScope(message) === activeChatTab),
    [activeChatTab, messages]
  );
  const displayedMessages = visibleMessages.filter(shouldShowWorkspaceAiChatMessage);
  const lastVisibleMessageId = displayedMessages.at(-1)?.id ?? null;
  const hasActiveChatHistory =
    displayedMessages.length > 0 ||
    (activeChatTab === "draft" && draft !== null) ||
    (activeChatTab === "errors" &&
      (terraformIssueResolution !== null || terraformIssueHistory.length > 0)) ||
    (activeChatTab === "preview" && terraformPreviewExplanation !== null);
  const activeRequestState: AiRequestState =
    activeChatTab === "draft"
      ? draftState
      : activeChatTab === "errors"
        ? (terraformIssueResolution?.state ?? "idle")
        : (terraformPreviewExplanation?.state ?? "idle");
  const activeHasPendingApproval =
    activeChatTab === "draft" && (draft !== null || patchPreviewModel !== null);
  const activeProposalIsStale = activeChatTab === "draft" && (draftIsStale || patchPreviewIsStale);
  const chatDockStatus = getWorkspaceAiChatDockStatus({
    hasPendingApproval: activeHasPendingApproval,
    isStale: activeProposalIsStale,
    requestState: activeRequestState
  });
  const isChatBusy = activeRequestState === "loading";

  const closeChatDock = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => {
      launcherButtonRef.current?.focus();
    });
  }, []);

  useEffect(() => {
    if (!isWorkspaceAiChatStorageHydrated(hydratedStorageProjectId, projectId)) {
      return;
    }

    storeChatMessages(projectId, messages);
  }, [hydratedStorageProjectId, messages, projectId]);

  useEffect(() => {
    if (!isWorkspaceAiChatStorageHydrated(hydratedStorageProjectId, projectId)) {
      return;
    }

    storeTerraformIssueHistory(projectId, terraformIssueHistory);
  }, [hydratedStorageProjectId, projectId, terraformIssueHistory]);

  useEffect(() => {
    if (!terraformIssueResolution?.explanation || terraformIssueResolution.state === "loading") {
      return;
    }

    const nextEntry = {
      explanation: terraformIssueResolution.explanation,
      request: terraformIssueResolution.request
    } satisfies TerraformIssueHistoryEntry;

    setTerraformIssueHistory((currentHistory) =>
      upsertTerraformIssueHistory(currentHistory, nextEntry)
    );
  }, [terraformIssueResolution]);

  useEffect(() => {
    if (!isWorkspaceAiChatStorageHydrated(hydratedStorageProjectId, projectId)) {
      return;
    }

    storeActiveChatScope(projectId, activeChatTab);
  }, [activeChatTab, hydratedStorageProjectId, projectId]);

  useEffect(() => {
    requestRegistryRef.current.cancelAll();
    setMessages(readStoredChatMessages(projectId));
    setActiveChatTab(readStoredActiveChatScope(projectId));
    setTerraformIssueHistory(readStoredTerraformIssueHistory(projectId));
    setOpenTerraformIssueRequestIds([]);
    setComposerStates(createWorkspaceAiChatComposerStates());
    setVoiceListeningScope(null);
    setSelectedSuggestionLabelsByMessageId({});
    setCompletedTerraformFixRequestIds([]);
    setDraft(null);
    setPatchPreviewModel(null);
    setPatchClarification(null);
    setDraftClarification(null);
    setDraftFollowUpSession(null);
    setDraftSourceFingerprint(null);
    setPatchPreviewSourceFingerprint(null);
    setDraftSourceRevision(null);
    setPatchPreviewSourceRevision(null);
    setHydratedStorageProjectId(projectId);
  }, [projectId]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const focusFrame = window.requestAnimationFrame(() => {
      if (activeScopeDefinition.inputAvailable) {
        composerTextareaRef.current?.focus();
        return;
      }

      tabButtonRefs.current[activeChatTab]?.focus();
    });
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
      window.cancelAnimationFrame(focusFrame);
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
    if (!isOpen) {
      return undefined;
    }

    scrollChatTranscriptToBottom();
    transcriptScrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollChatTranscriptToBottom();
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

  useEffect(() => {
    if (!terraformIssueRequest) {
      return;
    }

    const request = terraformIssueRequest;

    if (latestTerraformIssueRequestIdRef.current === request.id) {
      return;
    }

    latestTerraformIssueRequestIdRef.current = request.id;
    const controller = requestRegistryRef.current.begin("errors");
    setOpen(true);
    setActiveChatTab("errors");
    setTerraformIssueResolution({
      explanation: null,
      message: "",
      request,
      state: "loading"
    });
    setOpenTerraformIssueRequestIds((currentRequestIds) =>
      currentRequestIds.filter((requestId) => requestId !== request.id)
    );
    appendAssistantMessage(
      "terraform_issue",
      "오류 분석을 시작했습니다.",
      [],
      "single",
      "errors"
    );

    async function explainIssue(): Promise<void> {
      const { diagnostic } = request.issue;

      try {
        const explanation = await runAiTerraformErrorExplanation(
          {
            diagnostic,
            rawMessage: formatTerraformIssueRawMessage(diagnostic),
            relatedResourceId: diagnostic.resourceAddress,
            stage: "validate",
            terraformCodeContext: request.terraformCode
          },
          { signal: controller.signal }
        );

        if (latestTerraformIssueRequestIdRef.current !== request.id) {
          return;
        }

        setTerraformIssueResolution({
          explanation,
          message: "",
          request,
          state: "idle"
        });
        appendAssistantMessage(
          "terraform_issue",
          "분석이 끝났습니다. 아래에서 문제와 해결 방법을 확인하세요.",
          [],
          "single",
          "errors"
        );
      } catch (error) {
        if (isWorkspaceAiChatAbortError(error)) {
          return;
        }

        const message = getApiErrorMessage(
          error,
          "Terraform 이슈 AI 해결 가이드를 불러오지 못했습니다."
        );

        if (latestTerraformIssueRequestIdRef.current !== request.id) {
          return;
        }

        setTerraformIssueResolution({
          explanation: null,
          message,
          request,
          state: "error"
        });
        appendAssistantMessage("error", message, [], "single", "errors");
      } finally {
        requestRegistryRef.current.complete("errors", controller);
      }
    }

    void explainIssue();
  }, [terraformIssueRequest]);

  useEffect(() => {
    if (!terraformPreviewRequest) {
      return;
    }

    const request = terraformPreviewRequest;

    if (latestTerraformPreviewRequestIdRef.current === request.id) {
      return;
    }

    latestTerraformPreviewRequestIdRef.current = request.id;
    const controller = requestRegistryRef.current.begin("preview");
    setOpen(true);
    setActiveChatTab("preview");
    setTerraformPreviewExplanation({
      explanation: null,
      message: "",
      request,
      state: "loading"
    });
    appendAssistantMessage(
      "preview",
      `${formatTerraformReviewContext(request.label)} 검토를 시작했습니다.`,
      [],
      "single",
      "preview"
    );

    async function explainPreview(): Promise<void> {
      try {
        const explanation = await runAiTerraformPreviewExplanation(request.terraformCode, {
          signal: controller.signal
        });

        if (latestTerraformPreviewRequestIdRef.current !== request.id) {
          return;
        }

        setTerraformPreviewExplanation({
          explanation,
          message: "",
          request,
          state: "idle"
        });
        appendAssistantMessage(
          "preview",
          "검토가 끝났습니다. 아래에서 요약과 확인할 점을 확인하세요.",
          [],
          "single",
          "preview"
        );
      } catch (error) {
        if (isWorkspaceAiChatAbortError(error)) {
          return;
        }

        const message = getApiErrorMessage(error, "에이전트 리뷰 중 오류가 발생했습니다.");

        if (latestTerraformPreviewRequestIdRef.current !== request.id) {
          return;
        }

        setTerraformPreviewExplanation({
          explanation: null,
          message,
          request,
          state: "error"
        });
        appendAssistantMessage("error", message, [], "single", "preview");
      } finally {
        requestRegistryRef.current.complete("preview", controller);
      }
    }

    void explainPreview();
  }, [terraformPreviewRequest]);

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
  }, [terraformPreviewExplanation?.request.id, terraformPreviewExplanation?.state]);

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
    setApplyingTerraformFixRequestId(null);

    if (terraformSafeFixApplyResult.applied) {
      setCompletedTerraformFixRequestIds((currentRequestIds) =>
        currentRequestIds.includes(terraformSafeFixApplyResult.requestId)
          ? currentRequestIds
          : [...currentRequestIds, terraformSafeFixApplyResult.requestId]
      );
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
  ): void {
    setMessages((currentMessages) =>
      trimChatMessages([
        ...currentMessages,
        createChatMessage("assistant", kind, content, suggestions, selectionMode, scope)
      ])
    );
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
    if (activeChatTab === "errors") {
      setOpenTerraformIssueRequestIds([]);
    }
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

  async function submitChatPrompt(event?: FormEvent<HTMLFormElement>): Promise<void> {
    event?.preventDefault();

    await submitUserMessage(activeComposer.value);
  }

  function clearActiveChatHistory(): void {
    requestRegistryRef.current.cancel(activeChatTab);
    setSelectedSuggestionLabelsByMessageId({});
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
      setTerraformIssueResolution(null);
      setTerraformIssueHistory([]);
      setOpenTerraformIssueRequestIds([]);
      setApplyingTerraformFixRequestId(null);
      setCompletedTerraformFixRequestIds([]);
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

    const previousPrompt = draftClarification.prompt;
    const question = draftClarification.clarification.question;

    setDraftClarification(null);
    await createDraftFromRequest({
      prompt: `${previousPrompt}\n\n${question}\n${trimmedPrompt}`
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
      if (isWorkspaceAiChatAbortError(error)) {
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
    context.setPreviewDiagram(model.visualPreviewDiagram, model.annotations);
    setDraftState("idle");
    appendAssistantMessage("patch", createPatchPreviewSummary(preview));
  }

  async function handleDraftFollowUpMessage(trimmedPrompt: string): Promise<void> {
    if (draftFollowUpSession === null) {
      return;
    }

    const resolution = resolveArchitectureDraftFollowUpAnswer(draftFollowUpSession, trimmedPrompt);

    if (resolution.action === "show_pending_draft") {
      const pendingDraft = draftFollowUpSession.pendingDraft;

      setDraftFollowUpSession(null);
      showDraftPreview(pendingDraft);
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
    draftRequest: CreateArchitectureDraftRequest
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
      const result = await createAiArchitectureDraft(normalizedDraftRequest, {
        signal: controller.signal
      });

      if (isArchitectureDraftClarification(result)) {
        setDraftClarification({
          prompt,
          clarification: result
        });
        setDraftState("idle");
        appendAssistantMessage("question", result.question, result.suggestions);
        return;
      }

      const previewDecision = planArchitectureDraftPreview(normalizedDraftRequest, result);
      if (previewDecision.action === "ask_follow_up") {
        setDraftFollowUpSession(previewDecision.session);
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
      if (isWorkspaceAiChatAbortError(error)) {
        return;
      }

      const message = getApiErrorMessage(error, "아키텍처 초안 생성 중 오류가 발생했습니다.");

      setDraftState("error");
      setDraftErrorMessage(message);
      appendAssistantMessage("error", message);
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
      latestTerraformIssueRequestIdRef.current = null;
      setTerraformIssueResolution(null);
    } else {
      latestTerraformPreviewRequestIdRef.current = null;
      setTerraformPreviewExplanation(null);
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

  if (!isOpen) {
    return (
      <WorkspaceAiChatLauncher
        isRightPanelOpen={context.isRightPanelOpen}
        onOpen={() => setOpen(true)}
        ref={launcherButtonRef}
      />
    );
  }

  return (
    <div
      className={styles.aiChatOverlay}
      data-workspace-ai-chat-overlay
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          closeChatDock();
        }
      }}
    >
      <section
        aria-busy={isChatBusy}
        aria-label="AI 채팅"
        aria-labelledby="workspace-ai-chat-title"
        aria-modal={isMobileChatSurface || undefined}
        className={styles.aiChatDock}
        data-chat-tab={activeChatTab}
        data-right-panel-open={context.isRightPanelOpen}
        data-terraform-leave-guard-ignore
        ref={chatDialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className={styles.aiChatChrome}>
          <header className={styles.aiChatHeader}>
            <h2 id="workspace-ai-chat-title">AI 채팅</h2>
            <button
              aria-label="AI 채팅 닫기"
              className={styles.aiChatCloseButton}
              onClick={closeChatDock}
              title="닫기"
              type="button"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </header>

          {chatDockStatus ? (
            <div
              aria-live="polite"
              className={styles.aiChatStatusBar}
              data-status={chatDockStatus.label}
              role="status"
            >
              <span aria-hidden="true" className={styles.aiChatStatusMark} />
              <div>
                <strong>{chatDockStatus.label}</strong>
                <p>{chatDockStatus.description}</p>
              </div>
              {isChatBusy ? (
                <button
                  className={styles.aiChatCancelRequestButton}
                  onClick={cancelActiveRequest}
                  type="button"
                >
                  요청 중지
                </button>
              ) : null}
            </div>
          ) : null}

          {repositoryTemplate ? (
            <div className={styles.aiChatTemplateContext} role="status">
              <span>Repository Analysis Template</span>
              <strong>{repositoryTemplate.title}</strong>
              <code>{repositoryTemplate.id}</code>
              <p>AI는 이 Template을 바꾸지 않고 부족한 요구사항만 보완합니다.</p>
            </div>
          ) : null}

          <div className={styles.aiChatTabBar} aria-label="AI 채팅 기능">
            <div className={styles.aiChatTabs} role="tablist" aria-label="AI 기능">
              {workspaceAiChatScopes.map((scope) => (
                <button
                  aria-controls={`workspace-ai-chat-panel-${scope}`}
                  aria-selected={activeChatTab === scope}
                  className={styles.aiChatTabButton}
                  id={`workspace-ai-chat-tab-${scope}`}
                  key={scope}
                  onClick={() => selectChatTab(scope)}
                  onKeyDown={handleChatTabKeyDown}
                  ref={(element) => {
                    tabButtonRefs.current[scope] = element;
                  }}
                  role="tab"
                  tabIndex={activeChatTab === scope ? 0 : -1}
                  type="button"
                >
                  {getWorkspaceAiChatScopeDefinition(scope).label}
                </button>
              ))}
            </div>
            <button
              className={styles.aiChatClearButton}
              disabled={!hasActiveChatHistory}
              onClick={clearActiveChatHistory}
              type="button"
            >
              <Trash2 size={14} aria-hidden="true" />
              내역 지우기
            </button>
          </div>
        </div>

        <div
          aria-labelledby={`workspace-ai-chat-tab-${activeChatTab}`}
          className={styles.aiChatTranscript}
          id={`workspace-ai-chat-panel-${activeChatTab}`}
          ref={transcriptRef}
          role="tabpanel"
        >
          {!hasActiveChatHistory ? (
            <article className={styles.aiChatAssistantMessage} data-kind="question">
              <span>안내</span>
              <p>{activeScopeDefinition.emptyDescription}</p>
            </article>
          ) : null}
          {displayedMessages.map((message) => {
            const isMultiSelect = message.selectionMode === "multiple";
            const submittedSuggestions = message.selectedSuggestions ?? [];
            const hasSubmittedSuggestion = submittedSuggestions.length > 0;
            const selectedSuggestions = hasSubmittedSuggestion
              ? submittedSuggestions
              : (selectedSuggestionLabelsByMessageId[message.id] ?? []);

            return (
              <article
                className={
                  message.role === "user" ? styles.aiChatUserMessage : styles.aiChatAssistantMessage
                }
                data-kind={message.kind}
                key={message.id}
              >
                <span>
                  {message.role === "user" ? "나" : message.kind === "question" ? "질문" : "AI"}
                </span>
                <p>{message.content}</p>
                {message.role === "assistant" &&
                message.suggestions &&
                message.suggestions.length > 0 ? (
                  <div className={styles.aiChatSuggestions} aria-label="추천 답안">
                    {message.suggestions.map((suggestion) => {
                      const isSelected = selectedSuggestions.includes(suggestion);
                      const isSuggestionDisabled = isChatBusy || hasSubmittedSuggestion;
                      const suggestionButtonClassName = isSelected
                        ? `${styles.aiChatSuggestionButton} ${styles.aiChatSuggestionButtonSelected}`
                        : styles.aiChatSuggestionButton;

                      return (
                        <button
                          aria-pressed={isMultiSelect ? isSelected : undefined}
                          className={suggestionButtonClassName}
                          disabled={isSuggestionDisabled}
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
                          {suggestion}
                        </button>
                      );
                    })}
                    {isMultiSelect ? (
                      <button
                        className={styles.aiChatSelectionSubmitButton}
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
              </article>
            );
          })}

          {activeChatTab === "draft" ? (
            <WorkspaceAiRequestMessage state={draftState} message={draftErrorMessage} />
          ) : null}

          {activeChatTab === "preview" && terraformPreviewExplanation?.state === "loading" ? (
            <article className={`${styles.aiChatDraftCard} ${styles.aiReviewProgressCard}`}>
              <p className={styles.aiResultContext} aria-label="검토 범위">
                {formatTerraformReviewContext(terraformPreviewExplanation.request.label)}
              </p>
              <div aria-live="polite" className={styles.aiReviewProgressHeader} role="status">
                <span aria-hidden="true" className={styles.aiReviewProgressSpinner} />
                <div>
                  <strong>Amazon Q 에이전트 리뷰 중</strong>
                  <span>
                    {
                      terraformPreviewReviewSteps[
                        getTerraformPreviewReviewProgressStep(terraformPreviewReviewElapsedMs)
                      ]?.description
                    }
                  </span>
                </div>
              </div>
              <ol className={styles.aiReviewProgressSteps}>
                {terraformPreviewReviewSteps.map((step, index) => {
                  const currentStep = getTerraformPreviewReviewProgressStep(
                    terraformPreviewReviewElapsedMs
                  );
                  const state = index < currentStep ? "complete" : index === currentStep ? "active" : "pending";

                  return (
                    <li
                      aria-current={state === "active" ? "step" : undefined}
                      data-state={state}
                      key={step.label}
                    >
                      <span aria-hidden="true" className={styles.aiReviewProgressMarker} />
                      <div>
                        <strong>{step.label}</strong>
                        <span>{step.description}</span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </article>
          ) : null}

          {activeChatTab === "preview" &&
          terraformPreviewExplanation !== null &&
          terraformPreviewExplanation.state !== "loading" ? (
            <article className={styles.aiChatDraftCard}>
              <p className={styles.aiResultContext} aria-label="검토 범위">
                {formatTerraformReviewContext(terraformPreviewExplanation.request.label)}
              </p>
              {terraformPreviewExplanation.state === "error" ? (
                <WorkspaceAiRequestMessage
                  state="error"
                  message={terraformPreviewExplanation.message}
                />
              ) : null}
              {terraformPreviewExplanation.explanation ? (
                <WorkspaceAiTerraformPreviewResult
                  preview={terraformPreviewExplanation.explanation}
                />
              ) : null}
            </article>
          ) : null}

          {activeChatTab === "errors" && terraformIssueResolution?.state === "error" ? (
            <article className={styles.aiChatDraftCard}>
              <WorkspaceAiRequestMessage
                state="error"
                message={terraformIssueResolution.message}
              />
            </article>
          ) : null}

          {activeChatTab === "errors"
            ? terraformIssueHistory.map((historyEntry) => {
                const requestId = historyEntry.request.id;
                const isCurrentResult = terraformIssueResolution?.request.id === requestId;
                const isDetailsOpen = openTerraformIssueRequestIds.includes(requestId);
                const fixPlan = createTerraformIssueFixPlan({
                  diagnostic: historyEntry.request.issue.diagnostic,
                  explanation: historyEntry.explanation,
                  terraformCode: historyEntry.request.terraformCode
                });
                const hasCompletedTerraformFix = completedTerraformFixRequestIds.includes(requestId);

                return (
                  <article className={styles.aiChatDraftCard} key={requestId}>
                    {historyEntry.request.issue.isStale ? (
                      <p className={styles.aiStaleNotice}>
                        Terraform 코드가 편집되어 재검증이 필요합니다.
                      </p>
                    ) : null}
                    <TerraformIssueExplanationCard
                      diagnostic={historyEntry.request.issue.diagnostic}
                      explanation={historyEntry.explanation}
                      isDetailsOpen={isDetailsOpen}
                      onDetailsOpenChange={(nextIsOpen) =>
                        setOpenTerraformIssueRequestIds((currentRequestIds) =>
                          updateOpenTerraformIssueRequestIds(
                            currentRequestIds,
                            requestId,
                            nextIsOpen
                          )
                        )
                      }
                      terraformCode={historyEntry.request.terraformCode}
                    />
                    {isCurrentResult && fixPlan.canApply ? (
                      <div className={styles.aiActionRow}>
                        <button
                          className={styles.aiPrimaryButton}
                          disabled={
                            hasCompletedTerraformFix || applyingTerraformFixRequestId === requestId
                          }
                          onClick={() => {
                            const applyRequest = {
                              codePreview: fixPlan.codePreview,
                              diagnostic: historyEntry.request.issue.diagnostic,
                              id: requestId
                            };

                            setApplyingTerraformFixRequestId(applyRequest.id);
                            onApplyTerraformIssueFix(applyRequest);
                          }}
                          type="button"
                        >
                          {hasCompletedTerraformFix
                            ? "수정 완료"
                            : applyingTerraformFixRequestId === requestId
                              ? "적용 중"
                              : "수정안 적용"}
                        </button>
                      </div>
                    ) : null}
                  </article>
                );
              })
            : null}

          {activeChatTab === "draft" && draft !== null ? (
            <article className={styles.aiChatDraftCard}>
              <div className={styles.aiResultHeader}>
                <h3>{draft.title}</h3>
                <span>{draft.architectureJson.nodes.length}개 리소스</span>
              </div>
              <WorkspaceAiExplanation explanation={draft.llmExplanation} />
              <div className={styles.aiActionRow}>
                <button
                  className={styles.aiPrimaryButton}
                  disabled={draftIsStale}
                  onClick={applyDraftToBoard}
                  type="button"
                >
                  생성
                </button>
                <button
                  className={styles.aiSecondaryButton}
                  onClick={cancelDraftPreview}
                  type="button"
                >
                  취소
                </button>
                <button
                  className={styles.aiSecondaryButton}
                  disabled={isChatBusy}
                  onClick={() => void regenerateDraft()}
                  type="button"
                >
                  {draftIsStale ? "최신 기준으로 다시 생성" : "다시 생성"}
                </button>
              </div>
              {draftSafetyWarnings.length > 0 ? (
                <div className={styles.aiSafetyNotice} role="status">
                  {draftSafetyWarnings.map((warning) => (
                    <p key={`${warning.code}-${warning.message}`}>{warning.message}</p>
                  ))}
                </div>
              ) : null}
              {draftIsStale ? (
                <div className={styles.aiSafetyNotice} role="status">
                  <p>
                    보드가 변경되어 이 제안은 적용할 수 없습니다. 최신 기준으로 다시 생성하세요.
                  </p>
                </div>
              ) : null}
            </article>
          ) : null}

          {activeChatTab === "draft" && patchPreviewModel !== null ? (
            <article className={styles.aiChatDraftCard}>
              <div className={styles.aiResultHeader}>
                <h3>수정 미리보기</h3>
                <span>{patchPreviewModel.preview.changes.length}개 변경</span>
              </div>
              <WorkspaceAiExplanation explanation={patchPreviewModel.preview.llmExplanation} />
              <div className={styles.aiSafetyNotice} role="status">
                {patchPreviewModel.preview.changes.map((change) => (
                  <p
                    key={`${change.action}-${change.resourceId ?? change.resourceType ?? change.summary}`}
                  >
                    {change.summary}
                  </p>
                ))}
              </div>
              <div className={styles.aiActionRow}>
                <button
                  className={styles.aiPrimaryButton}
                  disabled={patchPreviewIsStale}
                  onClick={applyPatchPreviewToBoard}
                  type="button"
                >
                  적용
                </button>
                <button
                  className={styles.aiSecondaryButton}
                  onClick={cancelPatchPreview}
                  type="button"
                >
                  취소
                </button>
                {patchPreviewIsStale ? (
                  <button
                    className={styles.aiSecondaryButton}
                    disabled={isChatBusy}
                    onClick={() => void regeneratePatchPreview()}
                    type="button"
                  >
                    최신 기준으로 다시 생성
                  </button>
                ) : null}
              </div>
              {patchPreviewIsStale ? (
                <div className={styles.aiSafetyNotice} role="status">
                  <p>
                    보드가 변경되어 이 수정안은 적용할 수 없습니다. 최신 기준으로 다시 생성하세요.
                  </p>
                </div>
              ) : null}
            </article>
          ) : null}
        </div>

        {activeChatTab === "preview" ? (
          <div className={styles.aiReviewActionBar}>
            <TerraformAgentReviewButton
              disabled={!canRequestTerraformPreviewReview || isChatBusy}
              isLoading={isChatBusy}
              onRequest={onRequestTerraformPreviewReview}
              title="최신 Terraform 전체 구성을 Amazon Q로 검토"
            />
          </div>
        ) : null}

        {activeScopeDefinition.inputAvailable ? (
          <form
            className={styles.aiChatComposer}
            onSubmit={(event) => void submitChatPrompt(event)}
          >
            <label className={styles.aiChatInput}>
              <textarea
                aria-label="AI 채팅 입력"
                onChange={(event) => setComposerValue(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                ref={composerTextareaRef}
                rows={2}
                value={activeComposer.value}
              />
            </label>
            <button
              aria-label={isVoiceListening ? "음성 인식 중지" : "음성 인식 시작"}
              aria-pressed={isVoiceListening}
              className={styles.aiChatVoiceButton}
              data-listening={isVoiceListening}
              disabled={!isVoiceInputSupported || isChatBusy}
              onClick={toggleVoiceRecognition}
              title={isVoiceListening ? "음성 인식 중지" : "음성 인식 시작"}
              type="button"
            >
              <Mic size={17} aria-hidden="true" />
            </button>
            <button
              className={styles.aiChatSendButton}
              disabled={activeComposer.value.trim().length === 0 || isChatBusy}
              type="submit"
            >
              <Send size={16} aria-hidden="true" />
              보내기
            </button>
            {activeComposer.voiceStatusMessage.length > 0 ? (
              <p className={styles.aiChatVoiceStatus} role="status">
                {activeComposer.voiceStatusMessage}
              </p>
            ) : null}
          </form>
        ) : null}
      </section>
    </div>
  );
}

export function createWorkspaceAiChatStorageKey(projectId: string): string {
  return `${STORAGE_KEY_PREFIX}.${projectId}`;
}

function createTerraformIssueHistoryStorageKey(projectId: string): string {
  return `${STORAGE_KEY_PREFIX}.${projectId}.terraformIssueHistory`;
}

function trapFocusWithin(container: HTMLElement, event: KeyboardEvent): void {
  const focusableElements = [
    ...container.querySelectorAll<HTMLElement>(
      "button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex='-1'])"
    )
  ].filter((element) => element.getAttribute("aria-hidden") !== "true");
  const first = focusableElements[0];
  const last = focusableElements.at(-1);

  if (!first || !last) {
    event.preventDefault();
    container.focus();
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

function TerraformIssueExplanationCard({
  diagnostic,
  explanation,
  isDetailsOpen,
  onDetailsOpenChange,
  terraformCode
}: {
  readonly diagnostic: TerraformDiagnostic;
  readonly explanation: AiTerraformErrorExplanationResult;
  readonly isDetailsOpen: boolean;
  readonly onDetailsOpenChange: (isOpen: boolean) => void;
  readonly terraformCode: string;
}) {
  const result = createTerraformIssuePresentation({ diagnostic, explanation, terraformCode });

  return (
    <div className={styles.aiStructuredResult}>
      <section className={styles.aiResultLead}>
        <h3>{result.title}</h3>
        {result.summary ? <p>{result.summary}</p> : null}
      </section>

      <WorkspaceAiTechnicalDetails
        isOpen={isDetailsOpen}
        onOpenChange={onDetailsOpenChange}
      >
        <dl className={styles.aiTechnicalFacts}>
          <div>
            <dt>오류 위치</dt>
            <dd>{result.location}</dd>
          </div>
          <div>
            <dt>오류 유형</dt>
            <dd>
              <code>{result.technical.errorType}</code>
            </dd>
          </div>
        </dl>

        <section className={styles.aiTechnicalSection}>
          <strong>분석한 원인</strong>
          <p>{result.technical.likelyCause}</p>
        </section>

        <section className={styles.aiTechnicalSection}>
          <strong>Terraform 원문 오류</strong>
          <code className={styles.aiTechnicalRawError}>{result.technical.rawMessage}</code>
        </section>

        {result.technical.nextActions.length > 0 ? (
          <WorkspaceAiTechnicalList title="해결 절차" items={result.technical.nextActions} />
        ) : null}

        {result.technical.codeFrame.length > 0 ? (
          <div className={styles.terraformIssueCodeFrame}>
            <strong>오류 주변 코드</strong>
            <pre>
              <code>
                {result.technical.codeFrame
                  .map((line) => {
                    const marker = line.isErrorLine ? ">" : " ";
                    return `${marker} ${String(line.lineNumber).padStart(3, " ")} | ${line.text}`;
                  })
                  .join("\n")}
              </code>
            </pre>
          </div>
        ) : null}
        {result.technical.codePreview ? (
          <div className={styles.terraformIssueCodePreview}>
            <section>
              <strong>현재 코드</strong>
              <pre>
                <code>{result.technical.codePreview.currentCode}</code>
              </pre>
            </section>
            <section>
              <strong>수정할 코드</strong>
              <pre>
                <code>
                  {formatTerraformIssuePreviewCode(result.technical.codePreview.nextCode)}
                </code>
              </pre>
            </section>
          </div>
        ) : null}

      </WorkspaceAiTechnicalDetails>
    </div>
  );
}

function createInitialChatMessages(): WorkspaceAiChatMessage[] {
  return [
    createChatMessage(
      "assistant",
      "question",
      "질문: 만들고 싶은 서비스를 자연어로 말해주세요. 정보가 부족하면 제가 먼저 되물어볼게요."
    )
  ];
}

function findPatchClarificationCandidate(
  clarification: ArchitecturePatchClarification,
  answer: string
): ArchitecturePatchClarificationCandidate | undefined {
  const normalizedAnswer = answer.trim().toLowerCase();

  return clarification.candidates.find((candidate) => {
    const suggestionLabel = formatPatchCandidateSuggestion(candidate).toLowerCase();

    return (
      normalizedAnswer === candidate.resourceId.toLowerCase() ||
      normalizedAnswer === candidate.label.toLowerCase() ||
      normalizedAnswer === suggestionLabel ||
      normalizedAnswer.includes(candidate.resourceId.toLowerCase()) ||
      normalizedAnswer.includes(candidate.label.toLowerCase())
    );
  });
}

function findPatchClarificationSuggestion(
  clarification: ArchitecturePatchClarification,
  answer: string
): string | undefined {
  const normalizedAnswer = normalizePatchClarificationAnswer(answer);

  return clarification.suggestions?.find((suggestion) => {
    const normalizedSuggestion = normalizePatchClarificationAnswer(suggestion);

    return (
      normalizedAnswer === normalizedSuggestion ||
      normalizedAnswer.includes(normalizedSuggestion) ||
      (normalizedAnswer.length > 1 && normalizedSuggestion.includes(normalizedAnswer))
    );
  });
}

function isAddResourceConnectionClarification(
  clarification: ArchitecturePatchClarification
): boolean {
  return (
    clarification.intent.requestedAction === "add_resource" &&
    clarification.intent.resourceType !== undefined &&
    clarification.candidates.length > 0
  );
}

function isServicePurposePatchClarification(
  clarification: ArchitecturePatchClarification
): boolean {
  return (
    clarification.intent.requestedAction === "manual_review" &&
    clarification.candidates.length === 0
  );
}

function isSkipConnectionSuggestion(suggestion: string): boolean {
  return (
    normalizePatchClarificationAnswer(suggestion) ===
    normalizePatchClarificationAnswer("연결하지 않기")
  );
}

function isNoResourceAdditionSuggestion(suggestion: string): boolean {
  return (
    normalizePatchClarificationAnswer(suggestion) ===
    normalizePatchClarificationAnswer(NO_RESOURCE_ADDITION_SUGGESTION)
  );
}

function getPatchClarificationSuggestions(
  clarification: ArchitecturePatchClarification
): readonly string[] {
  if (isAddResourceConnectionClarification(clarification)) {
    return [
      ...clarification.candidates.map(formatPatchCandidateSuggestion),
      ...(clarification.suggestions ?? [])
    ];
  }

  return clarification.suggestions && clarification.suggestions.length > 0
    ? clarification.suggestions
    : clarification.candidates.map(formatPatchCandidateSuggestion);
}

function normalizePatchClarificationAnswer(value: string): string {
  return value.trim().toLowerCase();
}

function formatPatchCandidateSuggestion(
  candidate: ArchitecturePatchClarificationCandidate
): string {
  return `${candidate.label} (${candidate.resourceType})`;
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

function readStoredTerraformIssueHistory(projectId: string): TerraformIssueHistoryEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(
      createTerraformIssueHistoryStorageKey(projectId)
    );
    const parsedValue = rawValue ? JSON.parse(rawValue) : null;

    if (Array.isArray(parsedValue)) {
      return trimTerraformIssueHistory(parsedValue.filter(isTerraformIssueHistoryEntry));
    }
  } catch {
    // Ignore malformed local history and keep the error analysis tab usable.
  }

  return [];
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

function storeTerraformIssueHistory(
  projectId: string,
  history: readonly TerraformIssueHistoryEntry[]
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      createTerraformIssueHistoryStorageKey(projectId),
      JSON.stringify(trimTerraformIssueHistory(history))
    );
  } catch {
    // Error analysis history is helpful UI state, not a blocking persistence contract.
  }
}

function formatTerraformIssuePreviewCode(code: string): string {
  return code.length > 0 ? code : "(이 코드 조각 삭제)";
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

function trimTerraformIssueHistory(
  history: readonly TerraformIssueHistoryEntry[]
): TerraformIssueHistoryEntry[] {
  return history.slice(-MAX_TERRAFORM_ISSUE_HISTORY);
}

function upsertTerraformIssueHistory(
  history: readonly TerraformIssueHistoryEntry[],
  nextEntry: TerraformIssueHistoryEntry
): TerraformIssueHistoryEntry[] {
  return trimTerraformIssueHistory([
    ...history.filter((entry) => entry.request.id !== nextEntry.request.id),
    nextEntry
  ]);
}

function updateOpenTerraformIssueRequestIds(
  requestIds: readonly number[],
  requestId: number,
  isOpen: boolean
): readonly number[] {
  const isAlreadyOpen = requestIds.includes(requestId);

  if (isOpen === isAlreadyOpen) {
    return requestIds;
  }

  return isOpen ? [...requestIds, requestId] : requestIds.filter((id) => id !== requestId);
}

function markChatMessageSuggestionsSelected(
  messages: readonly WorkspaceAiChatMessage[],
  selection: WorkspaceAiChatSuggestionSelection
): WorkspaceAiChatMessage[] {
  const selectedSuggestions = Array.from(new Set(selection.suggestions));

  if (selectedSuggestions.length === 0) {
    return [...messages];
  }

  return messages.map((message) => {
    if (message.id !== selection.messageId) {
      return message;
    }

    const existingSuggestions = message.selectedSuggestions ?? [];
    const nextSelectedSuggestions = [...existingSuggestions];

    for (const suggestion of selectedSuggestions) {
      if (!nextSelectedSuggestions.includes(suggestion)) {
        nextSelectedSuggestions.push(suggestion);
      }
    }

    return {
      ...message,
      selectedSuggestions: nextSelectedSuggestions
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

function isTerraformIssueHistoryEntry(value: unknown): value is TerraformIssueHistoryEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<TerraformIssueHistoryEntry>;
  const request = candidate.request;
  const explanation = candidate.explanation;

  return (
    typeof request?.id === "number" &&
    typeof request.terraformCode === "string" &&
    typeof request.issue?.diagnostic?.message === "string" &&
    typeof request.issue.diagnostic.severity === "string" &&
    typeof explanation?.category === "string" &&
    isTerraformErrorCategory(explanation.category) &&
    typeof explanation.likelyCause === "string" &&
    Array.isArray(explanation.nextActions) &&
    explanation.nextActions.every((action) => typeof action === "string")
  );
}

function isTerraformErrorCategory(
  value: string
): value is AiTerraformErrorExplanationResult["category"] {
  return [
    "permission",
    "credential",
    "region_or_resource",
    "quota",
    "syntax",
    "dependency",
    "unknown"
  ].includes(value);
}

function isBuiltInTemplateId(templateId: string): templateId is (typeof TEMPLATE_IDS)[number] {
  return (TEMPLATE_IDS as readonly string[]).includes(templateId);
}
