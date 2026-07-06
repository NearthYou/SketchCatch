"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AiArchitectureDraftResult,
  AiTerraformErrorExplanationResult,
  AiTerraformPreviewExplanationResult,
  ArchitectureGuardrailWarning,
  CreateArchitectureDraftRequest,
  DesignSimulationResult,
  TerraformDiagnostic
} from "@sketchcatch/types";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { Mic, Send, Sparkles, Trash2, X } from "lucide-react";
import { getApiErrorMessage } from "../../lib/api-client";
import type { DiagramEditorPanelContext } from "../diagram-editor";
import {
  createAiArchitectureDraft,
  runAiTerraformPreviewExplanation,
  runAiTerraformErrorExplanation,
  runAiDesignSimulation
} from "./api";
import { convertArchitectureJsonToDiagramJson } from "./workspace-ai-diagram-adapter";
import {
  createWorkspaceAiBoardSnapshot,
  isWorkspaceAiResultStale
} from "./workspace-ai-panel-state";
import {
  WorkspaceAiDesignSimulationResult,
  WorkspaceAiExplanation,
  WorkspaceAiTerraformPreviewResult,
  WorkspaceAiRequestMessage
} from "./WorkspaceAiPanelPieces";
import type { AiRequestState } from "./WorkspaceAiPanelPieces";
import {
  answerArchitectureClarification,
  createArchitectureClarificationQuestionMessage,
  createArchitectureClarificationSession,
  createArchitectureClarificationSummaryMessage,
  createClarifiedDraftRequest,
  getCurrentArchitectureClarificationQuestion,
  isArchitectureClarificationProceedCommand,
  needsArchitectureClarification,
  type ArchitectureClarificationSession
} from "./workspace-ai-clarification";
import {
  planArchitectureDraftPreview,
  resolveArchitectureDraftFollowUpAnswer,
  type ArchitectureDraftFollowUpSession
} from "./workspace-ai-draft-follow-up";
import {
  promptGuideExamples
} from "./workspace-ai-panel-options";
import { formatTerraformDiagnosticTitle } from "./terraform-panel-utils";
import {
  createTerraformIssueChatSummary,
  createTerraformIssueFixPlan,
  type TerraformIssueAiRequest,
  type TerraformIssueCodePreview,
  type TerraformPreviewAiRequest,
  type TerraformSafeFixApplyResult
} from "./workspace-terraform-ai";
import styles from "./workspace.module.css";

export type WorkspaceAiChatDockProps = {
  readonly context: DiagramEditorPanelContext;
  readonly onApplyTerraformIssueFix: (
    diagnostic: TerraformDiagnostic,
    codePreview?: TerraformIssueCodePreview | undefined
  ) => void;
  readonly projectId: string;
  readonly terraformIssueRequest: TerraformIssueAiRequest | null;
  readonly terraformPreviewRequest: TerraformPreviewAiRequest | null;
  readonly terraformSafeFixApplyResult: TerraformSafeFixApplyResult | null;
};

type WorkspaceAiChatMessageRole = "assistant" | "user";
type WorkspaceAiChatMessageKind =
  | "draft"
  | "error"
  | "question"
  | "preview"
  | "simulation"
  | "status"
  | "terraform_issue";
type WorkspaceAiChatSelectionMode = "single" | "multiple";
type WorkspaceAiChatScope = "draft" | "errors" | "preview" | "simulation";

type WorkspaceAiChatMessage = {
  readonly id: string;
  readonly content: string;
  readonly createdAt: string;
  readonly kind: WorkspaceAiChatMessageKind;
  readonly role: WorkspaceAiChatMessageRole;
  readonly scope?: WorkspaceAiChatScope;
  readonly selectionMode?: WorkspaceAiChatSelectionMode;
  readonly suggestions?: readonly string[];
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
const DESIGN_SIMULATION_DEFAULTS = {
  budgetLevel: "normal",
  expectedUserCount: 1000,
  period: "month",
  region: "ap-northeast-2",
  trafficLevel: "normal"
} as const;
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

export function WorkspaceAiChatDock({
  context,
  onApplyTerraformIssueFix,
  projectId,
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
  const [clarificationSession, setClarificationSession] =
    useState<ArchitectureClarificationSession | null>(null);
  const [draftFollowUpSession, setDraftFollowUpSession] =
    useState<ArchitectureDraftFollowUpSession | null>(null);
  const [lastDraftRequest, setLastDraftRequest] = useState<CreateArchitectureDraftRequest | null>(
    null
  );
  const [designSimulation, setDesignSimulation] = useState<DesignSimulationResult | null>(null);
  const [terraformPreviewExplanation, setTerraformPreviewExplanation] =
    useState<TerraformPreviewExplanationState | null>(null);
  const [terraformIssueResolution, setTerraformIssueResolution] =
    useState<TerraformIssueResolutionState | null>(null);
  const [applyingTerraformFixRequestId, setApplyingTerraformFixRequestId] = useState<number | null>(
    null
  );
  const [draftState, setDraftState] = useState<AiRequestState>("idle");
  const [simulationState, setSimulationState] = useState<AiRequestState>("idle");
  const [draftErrorMessage, setDraftErrorMessage] = useState("");
  const [simulationErrorMessage, setSimulationErrorMessage] = useState("");
  const [simulationFingerprint, setSimulationFingerprint] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
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
  const hasStaleDesignSimulation =
    designSimulation !== null &&
    isWorkspaceAiResultStale(simulationFingerprint, boardSnapshot.fingerprint);
  const draftSafetyWarnings = useMemo(
    () => createDraftSafetyWarnings(draft, boardSnapshot.hasResources),
    [boardSnapshot.hasResources, draft]
  );
  const visibleMessages = useMemo(
    () => messages.filter((message) => getChatMessageScope(message) === activeChatTab),
    [activeChatTab, messages]
  );
  const hasActiveChatHistory =
    visibleMessages.length > 0 ||
    (activeChatTab === "draft" && draft !== null) ||
    (activeChatTab === "errors" && terraformIssueResolution !== null) ||
    (activeChatTab === "preview" && terraformPreviewExplanation !== null) ||
    (activeChatTab === "simulation" && designSimulation !== null);

  useEffect(() => {
    if (loadedProjectIdRef.current !== projectId) {
      return;
    }

    storeChatMessages(projectId, messages);
  }, [messages, projectId]);

  useEffect(() => {
    setMessages(readStoredChatMessages(projectId));
    setSelectedSuggestionLabelsByMessageId({});
    loadedProjectIdRef.current = projectId;
  }, [projectId]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      behavior: "smooth",
      top: transcriptRef.current.scrollHeight
    });
  }, [activeChatTab, visibleMessages, draft, designSimulation]);

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
      `Preview 설명을 요청했습니다. ${request.label}`,
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
          `Preview 설명 완료: ${explanation.summary}`,
          [],
          "single",
          "preview"
        );
      } catch (error) {
        const message = getApiErrorMessage(error, "Terraform Preview 설명 중 오류가 발생했습니다.");

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

    await submitUserMessage(composerValue);
  }

  function clearActiveChatHistory(): void {
    setSelectedSuggestionLabelsByMessageId({});
    stopVoiceRecognition();
    setVoiceStatusMessage("");

    if (activeChatTab === "simulation") {
      setMessages((currentMessages) =>
        currentMessages.filter((message) => getChatMessageScope(message) !== "simulation")
      );
      setDesignSimulation(null);
      setSimulationFingerprint(null);
      setSimulationErrorMessage("");
      setSimulationState("idle");
      return;
    }

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
      return;
    }

    setMessages((currentMessages) => [
      ...currentMessages.filter((message) => getChatMessageScope(message) !== "draft"),
      ...createInitialChatMessages()
    ]);
    setComposerValue("");
    setDraft(null);
    setClarificationSession(null);
    setDraftFollowUpSession(null);
    setDraftErrorMessage("");
    setDraftState("idle");
    setTerraformIssueResolution(null);
    setApplyingTerraformFixRequestId(null);
    context.setPreviewDiagram(null);
  }

  async function submitUserMessage(value: string): Promise<void> {
    const trimmedPrompt = value.trim();

    if (trimmedPrompt.length === 0 || draftState === "loading") {
      return;
    }

    const userMessage = createChatMessage("user", "status", trimmedPrompt, [], "single", "draft");
    const nextMessages = trimChatMessages([...messages, userMessage]);

    setComposerValue("");
    setSelectedSuggestionLabelsByMessageId({});
    setMessages(nextMessages);
    await handleUserMessage(trimmedPrompt, nextMessages);
  }

  async function handleUserMessage(
    trimmedPrompt: string,
    nextMessages: readonly WorkspaceAiChatMessage[]
  ): Promise<void> {
    if (draftFollowUpSession !== null) {
      await handleDraftFollowUpMessage(trimmedPrompt);
      return;
    }

    if (clarificationSession !== null) {
      await handleClarificationMessage(trimmedPrompt);
      return;
    }

    if (needsArchitectureClarification(trimmedPrompt)) {
      const session = createArchitectureClarificationSession(trimmedPrompt);

      setClarificationSession(session);
      appendClarificationQuestion(session);
      return;
    }

    await createDraftFromConversation(nextMessages);
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

  async function handleClarificationMessage(trimmedPrompt: string): Promise<void> {
    if (clarificationSession === null) {
      return;
    }

    if (clarificationSession.awaitingConfirmation) {
      if (isArchitectureClarificationProceedCommand(trimmedPrompt)) {
        const draftRequest = createClarifiedDraftRequest(clarificationSession);

        setClarificationSession(null);
        await createDraftFromRequest(draftRequest);
        return;
      }

      const restartedSession = createArchitectureClarificationSession(
        `${clarificationSession.originalPrompt}\n${trimmedPrompt}`
      );

      setClarificationSession(restartedSession);
      appendAssistantMessage(
        "question",
        "좋아요. 조건을 다시 정리할게요. 아래 질문부터 다시 골라주세요."
      );
      appendClarificationQuestion(restartedSession);
      return;
    }

    const nextSession = answerArchitectureClarification(clarificationSession, trimmedPrompt);

    setClarificationSession(nextSession);

    if (nextSession.awaitingConfirmation) {
      const summary = createArchitectureClarificationSummaryMessage(nextSession);

      appendAssistantMessage("question", summary.content, summary.suggestions, summary.selectionMode);
      return;
    }

    appendClarificationQuestion(nextSession);
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
    setDraftState("loading");
    setDraftErrorMessage("");
    setDraft(null);
    setDraftFollowUpSession(null);
    setLastDraftRequest(draftRequest);
    context.setPreviewDiagram(null);

    try {
      const result = await createAiArchitectureDraft(draftRequest);
      const previewDecision = planArchitectureDraftPreview(draftRequest, result);
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
      const message = getApiErrorMessage(error, "Architecture Draft 생성 중 오류가 발생했습니다.");
      const question = createQuestionFromDraftError(message);

      if (question) {
        const session = createArchitectureClarificationSession(draftRequest.prompt);

        setClarificationSession(session);
        setDraftState("idle");
        appendAssistantMessage("question", question);
        appendClarificationQuestion(session);
        return;
      }

      setDraftState("error");
      setDraftErrorMessage(message);
      appendAssistantMessage("error", message);
    }
  }

  function closeChatDock(): void {
    dismissedTerraformIssueRequestIdRef.current =
      terraformIssueResolution?.request.id ?? terraformIssueRequest?.id ?? null;
    setOpen(false);
    setTerraformIssueResolution(null);
    setApplyingTerraformFixRequestId(null);
  }

  function showDraftPreview(result: AiArchitectureDraftResult): void {
    const previewDiagram = convertArchitectureJsonToDiagramJson(result.architectureJson);

    setDraft(result);
    context.setPreviewDiagram(previewDiagram);
    setDraftState("idle");
    appendAssistantMessage(
      "draft",
      `${result.title} 초안을 보드에 반투명 미리보기로 띄웠습니다. 생성할까요?`
    );
  }

  function appendClarificationQuestion(session: ArchitectureClarificationSession): void {
    const question = getCurrentArchitectureClarificationQuestion(session);

    if (!question) {
      return;
    }

    const message = createArchitectureClarificationQuestionMessage(question);

    appendAssistantMessage("question", message.content, message.suggestions, message.selectionMode);
  }

  function applyDraftToBoard(): void {
    if (draft === null) {
      return;
    }

    context.applyDiagramJson(
      context.previewDiagram ?? convertArchitectureJsonToDiagramJson(draft.architectureJson)
    );
    setDraft(null);
    setDraftFollowUpSession(null);
    setDesignSimulation(null);
    setSimulationFingerprint(null);
    appendAssistantMessage("status", "생성했습니다. 현재 보드가 AI 초안으로 전체 교체되었습니다.");
  }

  function cancelDraftPreview(): void {
    context.setPreviewDiagram(null);
    setDraft(null);
    setDraftFollowUpSession(null);
    setDraftErrorMessage("");
    setDraftState("idle");
    appendAssistantMessage("status", "초안 미리보기를 취소했습니다.");
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

    await submitUserMessage(selectedSuggestions.join(", "));
  }

  async function runDesignSimulation(): Promise<void> {
    setActiveChatTab("simulation");

    if (context.isPreviewActive) {
      setSimulationState("error");
      setSimulationErrorMessage("AI 초안 미리보기 중에는 현재 보드 시뮬레이션을 실행할 수 없습니다.");
      appendAssistantMessage(
        "question",
        "질문: 먼저 초안을 생성하거나 취소한 뒤 현재 보드 시뮬레이션을 실행할까요?"
      );
      return;
    }

    if (!boardSnapshot.hasResources) {
      setSimulationState("error");
      setSimulationErrorMessage("Architecture Board에 Resource가 있어야 실행할 수 있습니다.");
      appendAssistantMessage(
        "question",
        "질문: 아직 보드에 리소스가 없습니다. 먼저 만들고 싶은 서비스를 알려주면 초안을 생성해볼게요."
      );
      return;
    }

    setSimulationState("loading");
    setSimulationErrorMessage("");

    try {
      const result = await runAiDesignSimulation({
        architectureJson: boardSnapshot.architectureJson,
        ...DESIGN_SIMULATION_DEFAULTS
      });
      setDesignSimulation(result);
      setSimulationFingerprint(boardSnapshot.fingerprint);
      setSimulationState("idle");
      appendAssistantMessage("simulation", createSimulationResultMessage(result));
    } catch (error) {
      const message = getApiErrorMessage(error, "Design Simulation 중 오류가 발생했습니다.");

      setSimulationState("error");
      setSimulationErrorMessage(message);
      appendAssistantMessage("error", message);
    }
  }

  function handleComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>): void {
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
        className={styles.aiChatLauncher}
        data-right-panel-open={context.isRightPanelOpen}
        data-terraform-leave-guard-ignore
        onClick={() => setOpen(true)}
        title="AI 채팅"
        type="button"
      >
        <Sparkles size={22} aria-hidden="true" />
      </button>
    );
  }

  return (
    <section
      aria-label="AI 채팅"
      className={styles.aiChatDock}
      data-chat-tab={activeChatTab}
      data-right-panel-open={context.isRightPanelOpen}
      data-terraform-leave-guard-ignore
    >
      <header className={styles.aiChatHeader}>
        <div>
          <span>Natural Language Diagramming</span>
          <h2>AI 채팅</h2>
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

      <div className={styles.aiChatTabBar} aria-label="AI 채팅 기능">
        <div className={styles.aiChatTabs} role="tablist" aria-label="AI 기능">
          <button
            aria-selected={activeChatTab === "draft"}
            className={styles.aiChatTabButton}
            onClick={() => setActiveChatTab("draft")}
            role="tab"
            type="button"
          >
            초안 제안
          </button>
          <button
            aria-selected={activeChatTab === "errors"}
            className={styles.aiChatTabButton}
            onClick={() => setActiveChatTab("errors")}
            role="tab"
            type="button"
          >
            AI 오류
          </button>
          <button
            aria-selected={activeChatTab === "preview"}
            className={styles.aiChatTabButton}
            onClick={() => setActiveChatTab("preview")}
            role="tab"
            type="button"
          >
            Preview 설명
          </button>
          <button
            aria-selected={activeChatTab === "simulation"}
            className={styles.aiChatTabButton}
            onClick={() => setActiveChatTab("simulation")}
            role="tab"
            type="button"
          >
            시뮬레이션
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
        {activeChatTab === "simulation" ? (
          <div className={styles.aiChatSimulationIntro}>
            <strong>현재 보드 기준으로 흐름, 병목, 장애, 예상 비용을 봅니다.</strong>
            <button
              className={styles.aiPrimaryButton}
              disabled={simulationState === "loading" || context.isPreviewActive}
              onClick={() => void runDesignSimulation()}
              type="button"
            >
              <Sparkles size={14} aria-hidden="true" />
              {simulationState === "loading" ? "계산 중" : "시뮬레이션 실행"}
            </button>
          </div>
        ) : null}

        {visibleMessages.map((message) => {
          const isMultiSelect = message.selectionMode === "multiple";
          const selectedSuggestions = selectedSuggestionLabelsByMessageId[message.id] ?? [];

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
                    const suggestionButtonClassName = isSelected
                      ? `${styles.aiChatSuggestionButton} ${styles.aiChatSuggestionButtonSelected}`
                      : styles.aiChatSuggestionButton;

                    return (
                      <button
                        aria-pressed={isMultiSelect ? isSelected : undefined}
                        className={suggestionButtonClassName}
                        disabled={draftState === "loading"}
                        key={suggestion}
                        onClick={
                          isMultiSelect
                            ? () => toggleSuggestionSelection(message.id, suggestion)
                            : () => void submitUserMessage(suggestion)
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
                      disabled={draftState === "loading" || selectedSuggestions.length === 0}
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
        {activeChatTab === "simulation" ? (
          <WorkspaceAiRequestMessage state={simulationState} message={simulationErrorMessage} />
        ) : null}

        {activeChatTab === "preview" && terraformPreviewExplanation !== null ? (
          <article className={styles.aiChatDraftCard}>
            <div className={styles.aiResultHeader}>
              <h3>Preview 설명</h3>
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

                    return (
                      <>
                        {fixPlan.canApply ? (
                          <button
                            className={styles.aiPrimaryButton}
                            disabled={applyingTerraformFixRequestId === terraformIssueResolution.request.id}
                            onClick={() => {
                              setApplyingTerraformFixRequestId(terraformIssueResolution.request.id);
                              onApplyTerraformIssueFix(
                                terraformIssueResolution.request.issue.diagnostic,
                                fixPlan.codePreview
                              );
                            }}
                            type="button"
                          >
                            {applyingTerraformFixRequestId === terraformIssueResolution.request.id ? "수정 중" : "수정"}
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

        {activeChatTab === "simulation" && hasStaleDesignSimulation ? (
          <p className={styles.aiStaleNotice}>보드 변경됨 · 다시 실행 필요</p>
        ) : null}
        {activeChatTab === "simulation" && designSimulation !== null ? (
          <WorkspaceAiDesignSimulationResult simulation={designSimulation} />
        ) : null}
      </div>

      <form className={styles.aiChatComposer} onSubmit={(event) => void submitChatPrompt(event)}>
        <div
          className={`${styles.aiPromptGuide} ${styles.aiChatPromptGuide}`}
          aria-label="프롬프트 작성 가이드"
        >
          <div className={styles.aiPromptGuideHeader}>
            <strong>그냥 이렇게 시작해도 돼요</strong>
          </div>
          <div className={styles.aiPromptChips}>
            {promptGuideExamples.map((example) => (
              <button
                className={styles.aiPromptChip}
                key={example}
                onClick={() => setComposerValue(example)}
                type="button"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
        <label className={styles.aiChatInput}>
          <textarea
            aria-label="AI 채팅 입력"
            onChange={(event) => setComposerValue(event.target.value)}
            onKeyDown={handleComposerKeyDown}
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

function createRequirementPromptFromMessages(
  messages: readonly WorkspaceAiChatMessage[]
): string {
  return messages
    .filter((message) => message.role === "user")
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join("\n");
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

function createQuestionFromDraftError(message: string): string | null {
  if (/명확한 아키텍처 단서|초안을 생성하지 않았습니다/.test(message)) {
    return "질문: 아키텍처 단서가 아직 부족합니다. 정적 홈페이지인지, 서버가 필요한 웹서비스인지, 파일 저장이나 로그인 같은 기능이 필요한지 알려주세요.";
  }

  return null;
}

function formatTerraformIssueRawMessage(diagnostic: TerraformDiagnostic): string {
  return `${diagnostic.code ?? "terraform.unknown"}\n${formatTerraformDiagnosticTitle(diagnostic)}\n${diagnostic.message}`;
}

function createSimulationResultMessage(result: DesignSimulationResult): string {
  const costHeadline = result.costEstimate?.reviewMessages[0];

  return costHeadline === undefined
    ? `현재 보드 시뮬레이션 결과: ${result.summary}`
    : `현재 보드 시뮬레이션 결과: ${result.summary} ${costHeadline}`;
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
    message.scope === "preview" ||
    message.scope === "simulation"
  ) {
    return message.scope;
  }

  if (message.kind === "preview") {
    return "preview";
  }

  if (message.kind === "simulation") {
    return "simulation";
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
      candidate.scope === "preview" ||
      candidate.scope === "simulation") &&
    (candidate.selectionMode === undefined ||
      candidate.selectionMode === "single" ||
      candidate.selectionMode === "multiple") &&
    (candidate.suggestions === undefined ||
      (Array.isArray(candidate.suggestions) &&
        candidate.suggestions.every((suggestion) => typeof suggestion === "string"))) &&
    (candidate.kind === "draft" ||
      candidate.kind === "error" ||
      candidate.kind === "preview" ||
      candidate.kind === "question" ||
      candidate.kind === "simulation" ||
      candidate.kind === "status" ||
      candidate.kind === "terraform_issue")
  );
}
