"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { templateDefinitions } from "@sketchcatch/types";
import type { TemplateId } from "@sketchcatch/types";
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
import { Mic, Send, Sparkles, Trash2, X } from "lucide-react";
import { getApiErrorMessage } from "../../lib/api-client";
import type { DiagramEditorPanelContext } from "../diagram-editor";
import {
  createAiArchitecturePatchPreview,
  createAiArchitectureDraft,
  runAiTerraformPreviewExplanation,
  runAiTerraformErrorExplanation
} from "./api";
import {
  convertDiagramJsonToArchitectureJson,
  getDiagramJsonForArchitectureDraft
} from "./workspace-ai-diagram-adapter";
import { createWorkspaceAiBoardSnapshot } from "./workspace-ai-panel-state";
import {
  WorkspaceAiExplanation,
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
  createTerraformIssueChatSummary,
  createTerraformIssueFixPlan,
  type TerraformIssueAiRequest,
  type TerraformPreviewAiRequest,
  type TerraformSafeFixApplyRequest,
  type TerraformSafeFixApplyResult
} from "./workspace-terraform-ai";
import { getWorkspaceAiChatDockStatus } from "./workspace-ai-chat-status";
import styles from "./workspace.module.css";

export type WorkspaceAiChatDockProps = {
  readonly context: DiagramEditorPanelContext;
  readonly onApplyTerraformIssueFix: (request: TerraformSafeFixApplyRequest) => void;
  readonly projectId: string;
  readonly repositoryAnalysisSourceRepositoryId?: string | undefined;
  readonly repositoryTemplateId?: TemplateId | undefined;
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
type WorkspaceAiChatScope = "draft" | "errors" | "preview";

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

type TerraformPreviewExplanationState = {
  readonly explanation: AiTerraformPreviewExplanationResult | null;
  readonly message: string;
  readonly request: TerraformPreviewAiRequest;
  readonly state: AiRequestState;
};

const MAX_CHAT_MESSAGES = 80;
const STORAGE_KEY_PREFIX = "sketchcatch.workspaceAiChat";
const NO_RESOURCE_ADDITION_SUGGESTION = "추가 안 함";
const NO_RESOURCE_ADDITION_MESSAGE = "추가 없이 지금까지의 요청으로 새 초안을 생성합니다.";
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
  onApplyTerraformIssueFix,
  projectId,
  repositoryAnalysisSourceRepositoryId,
  repositoryTemplateId,
  terraformIssueRequest,
  terraformPreviewRequest,
  terraformSafeFixApplyResult
}: WorkspaceAiChatDockProps) {
  const [isOpen, setOpen] = useState(false);
  const [activeChatTab, setActiveChatTab] = useState<WorkspaceAiChatScope>("draft");
  const [composerValue, setComposerValue] = useState("");
  const [isVoiceListening, setVoiceListening] = useState(false);
  const [isVoiceInputSupported, setVoiceInputSupported] = useState(true);
  const [voiceStatusMessage, setVoiceStatusMessage] = useState("");
  const [messages, setMessages] = useState<WorkspaceAiChatMessage[]>(() =>
    readStoredChatMessages(projectId)
  );
  const [selectedSuggestionLabelsByMessageId, setSelectedSuggestionLabelsByMessageId] = useState<
    Record<string, readonly string[]>
  >({});
  const [draft, setDraft] = useState<AiArchitectureDraftResult | null>(null);
  const [patchPreviewModel, setPatchPreviewModel] =
    useState<WorkspaceAiPatchPreviewModel | null>(null);
  const [patchClarification, setPatchClarification] =
    useState<ArchitecturePatchClarification | null>(null);
  const [draftClarification, setDraftClarification] =
    useState<PendingArchitectureDraftClarification | null>(null);
  const [draftFollowUpSession, setDraftFollowUpSession] =
    useState<ArchitectureDraftFollowUpSession | null>(null);
  const [lastDraftRequest, setLastDraftRequest] = useState<CreateArchitectureDraftRequest | null>(
    null
  );
  const [terraformPreviewExplanation, setTerraformPreviewExplanation] =
    useState<TerraformPreviewExplanationState | null>(null);
  const [terraformIssueResolution, setTerraformIssueResolution] =
    useState<TerraformIssueResolutionState | null>(null);
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
        ? templateDefinitions.find((template) => template.id === repositoryTemplateId) ?? null
        : null,
    [repositoryTemplateId]
  );
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const launcherButtonRef = useRef<HTMLButtonElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const transcriptScrollFrameRef = useRef<number | null>(null);
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const voiceInputBaseRef = useRef("");
  const voiceNoSpeechTimerRef = useRef<number | null>(null);
  const loadedProjectIdRef = useRef(projectId);
  const latestTerraformIssueRequestIdRef = useRef<number | null>(null);
  const latestTerraformPreviewRequestIdRef = useRef<number | null>(null);
  const latestTerraformSafeFixResultRequestIdRef = useRef<number | null>(null);
  const dismissedTerraformIssueRequestIdRef = useRef<number | null>(null);
  const boardSnapshot = useMemo(
    () => createWorkspaceAiBoardSnapshot(context.diagram),
    [context.diagram]
  );
  const draftSafetyWarnings = useMemo(
    () => createDraftSafetyWarnings(draft, boardSnapshot.hasResources),
    [boardSnapshot.hasResources, draft]
  );

  const visibleMessages = useMemo(
    () => messages.filter((message) => getChatMessageScope(message) === activeChatTab),
    [activeChatTab, messages]
  );
  const lastVisibleMessageId = visibleMessages.at(-1)?.id ?? null;
  const hasActiveChatHistory =
    visibleMessages.length > 0 ||
    (activeChatTab === "draft" && draft !== null) ||
    (activeChatTab === "errors" && terraformIssueResolution !== null) ||
    (activeChatTab === "preview" && terraformPreviewExplanation !== null);
  const hasTerraformLoading =
    terraformIssueResolution?.state === "loading" || terraformPreviewExplanation?.state === "loading";
  const hasTerraformError =
    terraformIssueResolution?.state === "error" || terraformPreviewExplanation?.state === "error";
  const chatDockStatus = getWorkspaceAiChatDockStatus({
    draftState,
    hasCompletedResponse:
      visibleMessages.length > 0 ||
      terraformIssueResolution?.explanation != null ||
      terraformPreviewExplanation?.explanation != null,
    hasPendingApproval: draft !== null || patchPreviewModel !== null,
    hasTerraformError,
    hasTerraformLoading
  });
  const isChatBusy = draftState === "loading" || hasTerraformLoading;
  const activeTerraformIssueRequestId =
    terraformIssueResolution?.request.id ?? terraformIssueRequest?.id ?? null;

  const closeChatDock = useCallback(() => {
    dismissedTerraformIssueRequestIdRef.current = activeTerraformIssueRequestId;
    setOpen(false);
    setTerraformIssueResolution(null);
    setApplyingTerraformFixRequestId(null);
    window.requestAnimationFrame(() => {
      launcherButtonRef.current?.focus();
    });
  }, [activeTerraformIssueRequestId]);

  useEffect(() => {
    if (loadedProjectIdRef.current !== projectId) {
      return;
    }

    storeChatMessages(projectId, messages);
  }, [messages, projectId]);

  useEffect(() => {
    setMessages(readStoredChatMessages(projectId));
    setSelectedSuggestionLabelsByMessageId({});
    setCompletedTerraformFixRequestIds([]);
    loadedProjectIdRef.current = projectId;
  }, [projectId]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const focusFrame = window.requestAnimationFrame(() => {
      composerTextareaRef.current?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
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
  }, [closeChatDock, isOpen]);

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
    dismissedTerraformIssueRequestIdRef.current = null;
    setOpen(true);
    setActiveChatTab("errors");
    setTerraformIssueResolution({
      explanation: null,
      message: "",
      request,
      state: "loading"
    });
    appendAssistantMessage(
      "terraform_issue",
      `Terraform 이슈를 분석합니다: ${formatTerraformDiagnosticTitle(request.issue.diagnostic)}`,
      [],
      "single",
      "errors"
    );

    async function explainIssue(): Promise<void> {
      const { diagnostic } = request.issue;

      try {
        const explanation = await runAiTerraformErrorExplanation({
          diagnostic,
          rawMessage: formatTerraformIssueRawMessage(diagnostic),
          relatedResourceId: diagnostic.resourceAddress,
          stage: "validate",
          terraformCodeContext: request.terraformCode
        });

        if (dismissedTerraformIssueRequestIdRef.current === request.id) {
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
          `Terraform 이슈 원인: ${createTerraformIssueChatSummary(explanation)}`,
          [],
          "single",
          "errors"
        );
      } catch (error) {
        const message = getApiErrorMessage(error, "Terraform 이슈 AI 해결 가이드를 불러오지 못했습니다.");

        if (dismissedTerraformIssueRequestIdRef.current === request.id) {
          return;
        }

        setTerraformIssueResolution({
          explanation: null,
          message,
          request,
          state: "error"
        });
        appendAssistantMessage("error", message, [], "single", "errors");
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
      `에이전트 리뷰를 요청했습니다. ${request.label}`,
      [],
      "single",
      "preview"
    );

    async function explainPreview(): Promise<void> {
      try {
        const explanation = await runAiTerraformPreviewExplanation(request.terraformCode);

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
          `에이전트 리뷰 완료: ${explanation.summary}`,
          [],
          "single",
          "preview"
        );
      } catch (error) {
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
      }
    }

    void explainPreview();
  }, [terraformPreviewRequest]);

  useEffect(() => {
    if (!terraformSafeFixApplyResult) {
      return;
    }

    if (latestTerraformSafeFixResultRequestIdRef.current === terraformSafeFixApplyResult.requestId) {
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
    };
  }, []);

  function appendAssistantMessage(
    kind: WorkspaceAiChatMessageKind,
    content: string,
    suggestions: readonly string[] = [],
    selectionMode: WorkspaceAiChatSelectionMode = "single",
    scope: WorkspaceAiChatScope = activeChatTab
  ): void {
    setMessages((currentMessages) => trimChatMessages([
      ...currentMessages,
      createChatMessage("assistant", kind, content, suggestions, selectionMode, scope)
    ]));
  }

  async function submitChatPrompt(event?: FormEvent<HTMLFormElement>): Promise<void> {
    event?.preventDefault();

    await submitUserMessage(composerTextareaRef.current?.value ?? composerValue);
  }

  function clearActiveChatHistory(): void {
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
    setDraftClarification(null);
    setDraftFollowUpSession(null);
    setDraftErrorMessage("");
    setDraftState("idle");
    setTerraformIssueResolution(null);
    setApplyingTerraformFixRequestId(null);
    setCompletedTerraformFixRequestIds([]);
    context.setPreviewDiagram(null);
  }

  async function submitUserMessage(
    value: string,
    suggestionSelection?: WorkspaceAiChatSuggestionSelection
  ): Promise<void> {
    const trimmedPrompt = value.trim();

    if (trimmedPrompt.length === 0 || draftState === "loading") {
      return;
    }

    const userMessage = createChatMessage("user", "status", trimmedPrompt, [], "single", "draft");
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

    if (
      draft !== null &&
      context.previewDiagram !== null &&
      pendingPreviewAction === "patch"
    ) {
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
      const selectedSuggestion = findPatchClarificationSuggestion(patchClarification, trimmedPrompt);

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
    setDraftState("loading");
    setDraftErrorMessage("");
    setDraft(null);
    setPatchPreviewModel(null);
    setPatchClarification(null);
    setDraftClarification(null);
    setDraftFollowUpSession(null);
    context.setPreviewDiagram(null);

    try {
      const baseArchitectureJson = options.baseArchitectureJson ?? boardSnapshot.architectureJson;
      const response = await createAiArchitecturePatchPreview({
        architectureJson: baseArchitectureJson,
        instruction,
        ...(options.selectedTargetResourceId !== undefined
          ? { selectedTargetResourceId: options.selectedTargetResourceId }
          : {}),
        ...(options.connectionTargetResourceId !== undefined
          ? { connectionTargetResourceId: options.connectionTargetResourceId }
          : {}),
        ...(options.skipConnection === true ? { skipConnection: true } : {})
      });

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

      showPatchPreview(response, options.baseDiagram);
    } catch (error) {
      const message = getApiErrorMessage(error, "수정 미리보기 생성 중 오류가 발생했습니다.");

      setDraftState("error");
      setDraftErrorMessage(message);
      appendAssistantMessage("error", message);
    }
  }

  function showPatchPreview(preview: ArchitecturePatchPreview, baseDiagram = context.diagram): void {
    const model = createWorkspaceAiPatchPreviewModel(baseDiagram, preview);

    setPatchPreviewModel(model);
    context.setPreviewDiagram(model.visualPreviewDiagram, model.annotations);
    setDraftState("idle");
    appendAssistantMessage("patch", createPatchPreviewSummary(preview));
  }

  async function handleDraftFollowUpMessage(trimmedPrompt: string): Promise<void> {
    if (draftFollowUpSession === null) {
      return;
    }

    const resolution = resolveArchitectureDraftFollowUpAnswer(
      draftFollowUpSession,
      trimmedPrompt
    );

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

  async function createDraftFromConversation(conversation: readonly WorkspaceAiChatMessage[]): Promise<void> {
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

  async function createDraftFromRequest(draftRequest: CreateArchitectureDraftRequest): Promise<void> {
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
      ...(repositoryTemplate
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

    setDraftState("loading");
    setDraftErrorMessage("");
    setDraft(null);
    setPatchPreviewModel(null);
    setPatchClarification(null);
    setDraftFollowUpSession(null);
    setLastDraftRequest(normalizedDraftRequest);
    context.setPreviewDiagram(null);

    try {
      const result = await createAiArchitectureDraft(normalizedDraftRequest);

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

      showDraftPreview(previewDecision.result);
    } catch (error) {
      const message = getApiErrorMessage(error, "아키텍처 초안 생성 중 오류가 발생했습니다.");

      setDraftState("error");
      setDraftErrorMessage(message);
      appendAssistantMessage("error", message);
    }
  }

  function showDraftPreview(result: AiArchitectureDraftResult): void {
    const previewDiagram = getDiagramJsonForArchitectureDraft(result);

    setDraft(result);
    setDraftClarification(null);
    context.setPreviewDiagram(previewDiagram);
    setDraftState("idle");
    appendAssistantMessage(
      "draft",
      `${result.title} 초안을 보드에 반투명 미리보기로 띄웠습니다. 생성할까요?`
    );
  }

  function applyDraftToBoard(): void {
    if (draft === null) {
      return;
    }

    context.applyDiagramJson(getDiagramJsonForArchitectureDraft(draft));
    context.requestTerraformRefresh();
    requestImmediateDiagramSave();
    setDraft(null);
    setPatchPreviewModel(null);
    setPatchClarification(null);
    setDraftClarification(null);
    setDraftFollowUpSession(null);
    appendAssistantMessage("status", "생성했습니다. 현재 보드가 AI 초안으로 전체 교체되었습니다.");
  }

  function applyPatchPreviewToBoard(): void {
    if (patchPreviewModel === null) {
      return;
    }

    context.applyDiagramJson(patchPreviewModel.proposedDiagram);
    context.requestTerraformRefresh();
    requestImmediateDiagramSave();
    setPatchPreviewModel(null);
    setPatchClarification(null);
    appendAssistantMessage("status", "수정 사항을 보드에 적용했습니다.");
  }

  function requestImmediateDiagramSave(): void {
    const savePromise = context.saveDiagramNow?.();

    if (savePromise) {
      void savePromise.catch(() => undefined);
    }
  }

  function cancelDraftPreview(): void {
    context.setPreviewDiagram(null);
    setDraft(null);
    setPatchPreviewModel(null);
    setPatchClarification(null);
    setDraftFollowUpSession(null);
    setDraftErrorMessage("");
    setDraftState("idle");
    appendAssistantMessage("status", "초안 미리보기를 취소했습니다.");
  }

  function cancelPatchPreview(): void {
    context.setPreviewDiagram(null);
    setPatchPreviewModel(null);
    setPatchClarification(null);
    setDraftErrorMessage("");
    setDraftState("idle");
    appendAssistantMessage("status", "수정 미리보기를 취소했습니다.");
  }

  async function regenerateDraft(): Promise<void> {
    if (lastDraftRequest !== null) {
      await createDraftFromRequest(lastDraftRequest);
      return;
    }

    await createDraftFromConversation(messages);
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
    const SpeechRecognitionConstructor = getBrowserSpeechRecognitionConstructor();

    if (SpeechRecognitionConstructor === undefined) {
      setVoiceInputSupported(false);
      setVoiceStatusMessage("이 브라우저는 음성 인식을 지원하지 않습니다.");
      return;
    }

    if (!window.isSecureContext) {
      setVoiceStatusMessage("음성 인식은 HTTPS 또는 localhost 주소에서만 사용할 수 있습니다.");
      return;
    }

    clearVoiceNoSpeechTimer();
    releaseSpeechRecognition("abort");

    const recognition = new SpeechRecognitionConstructor();
    voiceInputBaseRef.current = composerValue;
    recognition.lang = "ko-KR";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      clearVoiceNoSpeechTimer();
      const transcript = getSpeechRecognitionTranscript(event);

      if (transcript.length > 0) {
        setComposerValue(mergeVoiceTranscript(voiceInputBaseRef.current, transcript));
      }
    };
    recognition.onspeechstart = () => {
      clearVoiceNoSpeechTimer();
    };
    recognition.onerror = (event) => {
      clearVoiceNoSpeechTimer();
      setVoiceListening(false);
      speechRecognitionRef.current = null;
      setVoiceStatusMessage(getVoiceRecognitionErrorMessage(event.error));
    };
    recognition.onend = () => {
      clearVoiceNoSpeechTimer();
      setVoiceListening(false);
      speechRecognitionRef.current = null;
      setVoiceStatusMessage((currentMessage) =>
        currentMessage === "음성 인식 중입니다." ? "" : currentMessage
      );
    };

    try {
      speechRecognitionRef.current = recognition;
      setVoiceListening(true);
      setVoiceStatusMessage("음성 인식 중입니다.");
      recognition.start();
      voiceNoSpeechTimerRef.current = window.setTimeout(() => {
        releaseSpeechRecognition("abort");
        setVoiceListening(false);
        setVoiceStatusMessage("8초 동안 음성이 들리지 않아 음성 인식을 중지했습니다.");
      }, VOICE_NO_SPEECH_TIMEOUT_MS);
    } catch {
      speechRecognitionRef.current = null;
      setVoiceListening(false);
      setVoiceStatusMessage("음성 인식을 시작하지 못했습니다.");
    }
  }

  function stopVoiceRecognition(): void {
    clearVoiceNoSpeechTimer();
    releaseSpeechRecognition("stop");
    setVoiceListening(false);
    setVoiceStatusMessage("");
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
      <button
        aria-label="AI 채팅 열기"
        aria-expanded={false}
        className={styles.aiChatLauncher}
        data-right-panel-open={context.isRightPanelOpen}
        data-terraform-leave-guard-ignore
        onClick={() => setOpen(true)}
        ref={launcherButtonRef}
        title="AI 채팅"
        type="button"
      >
        <Sparkles size={22} aria-hidden="true" />
      </button>
    );
  }

  return (
    <div
      className={styles.aiChatOverlay}
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
        className={styles.aiChatDock}
        data-chat-tab={activeChatTab}
        data-right-panel-open={context.isRightPanelOpen}
        data-terraform-leave-guard-ignore
        role="dialog"
      >
        <header className={styles.aiChatHeader}>
          <div>
            <span>Workspace Assistant</span>
            <h2 id="workspace-ai-chat-title">AI 채팅</h2>
          </div>
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
        </div>

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
          <button
            aria-selected={activeChatTab === "draft"}
            className={styles.aiChatTabButton}
            onClick={() => setActiveChatTab("draft")}
            role="tab"
            type="button"
          >
            설계 제안
          </button>
          <button
            aria-selected={activeChatTab === "errors"}
            className={styles.aiChatTabButton}
            onClick={() => setActiveChatTab("errors")}
            role="tab"
            type="button"
          >
            오류 분석
          </button>
          <button
            aria-selected={activeChatTab === "preview"}
            className={styles.aiChatTabButton}
            onClick={() => setActiveChatTab("preview")}
            role="tab"
            type="button"
          >
            에이전트 리뷰
          </button>
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

      <div className={styles.aiChatTranscript} ref={transcriptRef}>
        {visibleMessages.map((message) => {
          const isMultiSelect = message.selectionMode === "multiple";
          const submittedSuggestions = message.selectedSuggestions ?? [];
          const hasSubmittedSuggestion = submittedSuggestions.length > 0;
          const selectedSuggestions = hasSubmittedSuggestion
            ? submittedSuggestions
            : selectedSuggestionLabelsByMessageId[message.id] ?? [];

          return (
            <article
              className={
                message.role === "user" ? styles.aiChatUserMessage : styles.aiChatAssistantMessage
              }
              data-kind={message.kind}
              key={message.id}
            >
              <span>{message.role === "user" ? "나" : message.kind === "question" ? "질문" : "AI"}</span>
              <p>{message.content}</p>
              {message.role === "assistant" && message.suggestions && message.suggestions.length > 0 ? (
                <div className={styles.aiChatSuggestions} aria-label="추천 답안">
                  {message.suggestions.map((suggestion) => {
                    const isSelected = selectedSuggestions.includes(suggestion);
                    const isSuggestionDisabled = draftState === "loading" || hasSubmittedSuggestion;
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
                        draftState === "loading" ||
                        hasSubmittedSuggestion ||
                        selectedSuggestions.length === 0
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

        {activeChatTab === "preview" && terraformPreviewExplanation !== null ? (
          <article className={styles.aiChatDraftCard}>
            <div className={styles.aiResultHeader}>
              <h3>에이전트 리뷰</h3>
              <span>{terraformPreviewExplanation.request.label}</span>
            </div>
            {terraformPreviewExplanation.state === "loading" ? (
              <WorkspaceAiRequestMessage state="loading" message="" />
            ) : null}
            {terraformPreviewExplanation.state === "error" ? (
              <WorkspaceAiRequestMessage state="error" message={terraformPreviewExplanation.message} />
            ) : null}
            {terraformPreviewExplanation.explanation ? (
              <WorkspaceAiTerraformPreviewResult preview={terraformPreviewExplanation.explanation} />
            ) : null}
          </article>
        ) : null}

        {activeChatTab === "errors" && terraformIssueResolution !== null ? (
          <article className={styles.aiChatDraftCard}>
            <div className={styles.aiResultHeader}>
              <h3>{formatTerraformDiagnosticTitle(terraformIssueResolution.request.issue.diagnostic)}</h3>
              <span>Terraform Issue</span>
            </div>
            <p className={styles.terraformIssueRawMessage}>
              {terraformIssueResolution.request.issue.diagnostic.message}
            </p>
            {terraformIssueResolution.request.issue.isStale ? (
              <p className={styles.aiStaleNotice}>Terraform 코드가 편집되어 재검증이 필요합니다.</p>
            ) : null}
            {terraformIssueResolution.state === "loading" ? (
              <WorkspaceAiRequestMessage state="loading" message="" />
            ) : null}
            {terraformIssueResolution.state === "error" ? (
              <WorkspaceAiRequestMessage state="error" message={terraformIssueResolution.message} />
            ) : null}
            {terraformIssueResolution.explanation ? (
              <TerraformIssueExplanationCard
                diagnostic={terraformIssueResolution.request.issue.diagnostic}
                explanation={terraformIssueResolution.explanation}
                terraformCode={terraformIssueResolution.request.terraformCode}
              />
            ) : null}
            <div className={styles.aiActionRow}>
              {terraformIssueResolution.explanation
                ? (() => {
                    const fixPlan = createTerraformIssueFixPlan({
                      diagnostic: terraformIssueResolution.request.issue.diagnostic,
                      explanation: terraformIssueResolution.explanation,
                      terraformCode: terraformIssueResolution.request.terraformCode
                    });
                    const hasCompletedTerraformFix = completedTerraformFixRequestIds.includes(
                      terraformIssueResolution.request.id
                    );

                    return (
                      <>
                        {fixPlan.canApply ? (
                          <button
                            className={styles.aiPrimaryButton}
                            disabled={hasCompletedTerraformFix || applyingTerraformFixRequestId === terraformIssueResolution.request.id}
                            onClick={() => {
                              const applyRequest = {
                                codePreview: fixPlan.codePreview,
                                diagnostic: terraformIssueResolution.request.issue.diagnostic,
                                id: terraformIssueResolution.request.id
                              };

                              setApplyingTerraformFixRequestId(applyRequest.id);
                              onApplyTerraformIssueFix(applyRequest);
                            }}
                            type="button"
                          >
                            {hasCompletedTerraformFix
                              ? "수정완료"
                              : applyingTerraformFixRequestId === terraformIssueResolution.request.id
                                ? "수정 중"
                                : "수정"}
                          </button>
                        ) : null}
                        <button className={styles.aiSecondaryButton} disabled type="button">
                          {fixPlan.canApply ? "자동 수정 가능" : "자동 수정안 없음"}
                        </button>
                      </>
                    );
                  })()
                : null}
            </div>
          </article>
        ) : null}

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
                onClick={applyDraftToBoard}
                type="button"
              >
                생성
              </button>
              <button className={styles.aiSecondaryButton} onClick={cancelDraftPreview} type="button">
                취소
              </button>
              <button
                className={styles.aiSecondaryButton}
                disabled={draftState === "loading"}
                onClick={() => void regenerateDraft()}
                type="button"
              >
                다시 생성
              </button>
            </div>
            {draftSafetyWarnings.length > 0 ? (
              <div className={styles.aiSafetyNotice} role="status">
                {draftSafetyWarnings.map((warning) => (
                  <p key={`${warning.code}-${warning.message}`}>{warning.message}</p>
                ))}
              </div>
            ) : null}
          </article>
        ) : null}

        {patchPreviewModel !== null ? (
          <article className={styles.aiChatDraftCard}>
            <div className={styles.aiResultHeader}>
              <h3>수정 미리보기</h3>
              <span>{patchPreviewModel.preview.changes.length}개 변경</span>
            </div>
            <WorkspaceAiExplanation explanation={patchPreviewModel.preview.llmExplanation} />
            <div className={styles.aiSafetyNotice} role="status">
              {patchPreviewModel.preview.changes.map((change) => (
                <p key={`${change.action}-${change.resourceId ?? change.resourceType ?? change.summary}`}>
                  {change.summary}
                </p>
              ))}
            </div>
            <div className={styles.aiActionRow}>
              <button className={styles.aiPrimaryButton} onClick={applyPatchPreviewToBoard} type="button">
                적용
              </button>
              <button className={styles.aiSecondaryButton} onClick={cancelPatchPreview} type="button">
                취소
              </button>
            </div>
          </article>
        ) : null}

      </div>

      <form className={styles.aiChatComposer} onSubmit={(event) => void submitChatPrompt(event)}>
        <label className={styles.aiChatInput}>
          <textarea
            aria-label="AI 채팅 입력"
            onChange={(event) => setComposerValue(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            ref={composerTextareaRef}
            rows={2}
            value={composerValue}
          />
        </label>
        <button
          aria-label={isVoiceListening ? "음성 인식 중지" : "음성 인식 시작"}
          aria-pressed={isVoiceListening}
          className={styles.aiChatVoiceButton}
          data-listening={isVoiceListening}
          disabled={!isVoiceInputSupported || draftState === "loading"}
          onClick={toggleVoiceRecognition}
          title={isVoiceListening ? "음성 인식 중지" : "음성 인식 시작"}
          type="button"
        >
          <Mic size={17} aria-hidden="true" />
        </button>
        <button
          className={styles.aiChatSendButton}
          disabled={composerValue.trim().length === 0 || draftState === "loading"}
          type="submit"
        >
          <Send size={16} aria-hidden="true" />
          보내기
        </button>
        {voiceStatusMessage.length > 0 ? (
          <p className={styles.aiChatVoiceStatus} role="status">
            {voiceStatusMessage}
          </p>
        ) : null}
      </form>
      </section>
    </div>
  );
}

export function createWorkspaceAiChatStorageKey(projectId: string): string {
  return `${STORAGE_KEY_PREFIX}.${projectId}`;
}

function TerraformIssueExplanationCard({
  diagnostic,
  explanation,
  terraformCode
}: {
  readonly diagnostic: TerraformDiagnostic;
  readonly explanation: AiTerraformErrorExplanationResult;
  readonly terraformCode: string;
}) {
  const fixPlan = createTerraformIssueFixPlan({ diagnostic, explanation, terraformCode });

  return (
    <div>
      <section className={styles.terraformIssueFixPlan}>
        <div className={styles.terraformIssueFixPlanHeader}>
          <strong>수정 계획</strong>
          <span>{fixPlan.providerLabel}</span>
        </div>
        <p>{fixPlan.summary}</p>
        {fixPlan.providerNotice ? (
          <p className={styles.terraformIssueFixPlanNotice}>{fixPlan.providerNotice}</p>
        ) : null}
        <dl className={styles.terraformIssueGuidanceList}>
          <div>
            <dt>오류 위치</dt>
            <dd>{fixPlan.location}</dd>
          </div>
          <div>
            <dt>오류 유형</dt>
            <dd>{fixPlan.errorType}</dd>
          </div>
          <div>
            <dt>어떤 오류인가</dt>
            <dd>{fixPlan.plainExplanation}</dd>
          </div>
          <div>
            <dt>어떻게 고칠까</dt>
            <dd>{fixPlan.fixExplanation}</dd>
          </div>
        </dl>
        {fixPlan.codeFrame.length > 0 ? (
          <div className={styles.terraformIssueCodeFrame}>
            <strong>오류 주변 코드</strong>
            <pre>
              <code>
                {fixPlan.codeFrame
                  .map((line) => {
                    const marker = line.isErrorLine ? ">" : " ";
                    return `${marker} ${String(line.lineNumber).padStart(3, " ")} | ${line.text}`;
                  })
                  .join("\n")}
              </code>
            </pre>
          </div>
        ) : null}
        {fixPlan.codePreview ? (
          <div className={styles.terraformIssueCodePreview}>
            <section>
              <strong>현재 코드</strong>
              <pre>
                <code>{fixPlan.codePreview.currentCode}</code>
              </pre>
            </section>
            <section>
              <strong>수정할 코드</strong>
              <pre>
                <code>{formatTerraformIssuePreviewCode(fixPlan.codePreview.nextCode)}</code>
              </pre>
            </section>
          </div>
        ) : null}
      </section>
      <dl className={styles.terraformIssueGuidanceList}>
        <div>
          <dt>원인</dt>
          <dd>{explanation.likelyCause}</dd>
        </div>
      </dl>
      <ul className={styles.terraformIssueActions}>
        {explanation.nextActions.map((action) => (
          <li key={action}>{action}</li>
        ))}
      </ul>
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
  return clarification.intent.requestedAction === "manual_review" && clarification.candidates.length === 0;
}

function isSkipConnectionSuggestion(suggestion: string): boolean {
  return normalizePatchClarificationAnswer(suggestion) === normalizePatchClarificationAnswer("연결하지 않기");
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

function formatPatchCandidateSuggestion(candidate: ArchitecturePatchClarificationCandidate): string {
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

function createRequirementPromptFromMessages(
  messages: readonly WorkspaceAiChatMessage[]
): string {
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
      message: "생성을 누르면 현재 보드가 AI 초안으로 전체 교체됩니다. 이번 버전은 패치 적용이 아니라 전체 교체입니다."
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
      return storedMessages.length > 0 ? trimChatMessages(storedMessages) : createInitialChatMessages();
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
  if (
    message.scope === "draft" ||
    message.scope === "errors" ||
    message.scope === "preview"
  ) {
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
