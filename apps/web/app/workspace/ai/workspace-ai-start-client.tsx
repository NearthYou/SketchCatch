"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ArrowLeft, Check, Maximize2, Mic, RefreshCw, Send, X, ZoomIn, ZoomOut } from "lucide-react";
import type {
  AiArchitectureDraftResult,
  ArchitecturePatchClarification,
  ArchitecturePatchClarificationCandidate,
  ArchitecturePatchPreview,
  ArchitectureDraftClarification,
  CreateArchitectureDraftRequest,
  DiagramJson,
  DiagramNode
} from "@sketchcatch/types";
import { getApiErrorMessage } from "../../../lib/api-client";
import {
  createAiArchitectureDraft,
  createAiArchitecturePatchPreview,
  createProject,
  saveProjectDraft
} from "../../../features/workspace/api";
import {
  convertArchitectureJsonToDiagramJson,
  convertDiagramJsonToArchitectureJson
} from "../../../features/workspace/workspace-ai-diagram-adapter";
import {
  planArchitectureDraftPreview,
  resolveArchitectureDraftFollowUpAnswer,
  type ArchitectureDraftFollowUpSession
} from "../../../features/workspace/workspace-ai-draft-follow-up";
import {
  classifyWorkspaceAiChatPrompt,
  createWorkspaceAiPromptGateMessage
} from "../../../features/workspace/workspace-ai-chat-routing";
import { createWorkspaceAiChatStorageKey } from "../../../features/workspace/WorkspaceAiChatDock";
import {
  getAreaNodeIconUrl,
  getAreaNodeLabel,
  getAreaNodeMetaLabel,
  isAreaNode
} from "../../../features/diagram-editor/area-nodes";
import { useBrowserVoiceInput } from "../../../features/workspace/use-browser-voice-input";

const AI_START_DRAFT_STORAGE_KEY = "sketchcatch.newProjectDraft";
const MAX_CHAT_MESSAGES = 80;
const MINI_DIAGRAM_PADDING = 56;
const MINI_DIAGRAM_AREA_HEADER_HEIGHT = 24;
const MINI_DIAGRAM_AREA_HEADER_MAX_WIDTH = 260;
const MINI_DIAGRAM_MAX_LABEL_LENGTH = 28;
const MINI_DIAGRAM_ZOOM_LEVELS = [1, 1.35, 1.7, 2.1, 2.6] as const;
const MINI_DIAGRAM_MIN_ZOOM = 1;
const MINI_DIAGRAM_MAX_ZOOM = 2.6;
const COPY = {
  approve: "\uC2B9\uC778",
  cancel: "\uCDE8\uC18C",
  chatInput: "AI \uCC44\uD305 \uC785\uB825",
  diagramPreview: "\uB2E4\uC774\uC5B4\uADF8\uB7A8 \uBBF8\uB9AC\uBCF4\uAE30",
  error: "\uC624\uB958",
  fullScreen: "\uC804\uCCB4 \uD654\uBA74",
  fullScreenPreviewClose: "\uC804\uCCB4 \uD654\uBA74 \uB2E4\uC774\uC5B4\uADF8\uB7A8 \uBBF8\uB9AC\uBCF4\uAE30 \uB2EB\uAE30",
  fullScreenPreviewOpen: "\uC804\uCCB4 \uD654\uBA74 \uB2E4\uC774\uC5B4\uADF8\uB7A8 \uBBF8\uB9AC\uBCF4\uAE30 \uC5F4\uAE30",
  generateError: "Architecture Draft \uC0DD\uC131 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.",
  initialQuestion: "\uD504\uB85C\uC81D\uD2B8 \uC694\uAD6C\uC0AC\uD56D\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694.",
  loadingDraft: "\uC0C8 \uD504\uB85C\uC81D\uD2B8 \uC815\uBCF4\uB97C \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.",
  me: "\uB098",
  placeholder: "\uB9CC\uB4E4\uACE0 \uC2F6\uC740 \uC11C\uBE44\uC2A4 \uC694\uAD6C\uC0AC\uD56D\uC744 \uC785\uB825\uD558\uC138\uC694.",
  preparingDiagram: "\uB2E4\uC774\uC5B4\uADF8\uB7A8\uC744 \uC900\uBE44\uD558\uB294 \uC911\uC785\uB2C8\uB2E4.",
  question: "\uC9C8\uBB38",
  regenerate: "\uB2E4\uC2DC \uC0DD\uC131",
  saveApprovedError: "\uC2B9\uC778\uD55C PREVIEW\uB97C \uBCF4\uB4DC\uB85C \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.",
  send: "\uBCF4\uB0B4\uAE30",
  zoomIn: "\uD655\uB300",
  zoomOut: "\uCD95\uC18C",
  zoomReset: "\uBC30\uC728 \uCD08\uAE30\uD654"
} as const;

type WorkspaceStartDraft = {
  readonly projectName: string;
  readonly startMode: "ai";
  readonly updatedAt: string;
};

type AiStartChatMessage = {
  readonly content: string;
  readonly createdAt: string;
  readonly id: string;
  readonly kind: "draft" | "error" | "question" | "status";
  readonly role: "assistant" | "user";
  readonly scope: "draft";
  readonly selectionMode: "single";
  readonly selectedSuggestions?: readonly string[];
  readonly suggestions?: readonly string[] | undefined;
};

type AiStartSuggestionSelection = {
  readonly messageId: string;
  readonly suggestions: readonly string[];
};

type PendingArchitectureDraftClarification = {
  readonly clarification: ArchitectureDraftClarification;
  readonly prompt: string;
};

type PendingArchitecturePatchClarification = {
  readonly baseDiagram: DiagramJson;
  readonly clarification: ArchitecturePatchClarification;
};

type RequestState = "idle" | "loading" | "error";

export function WorkspaceAiStartClient() {
  const router = useRouter();
  const [projectDraft, setProjectDraft] = useState<WorkspaceStartDraft | null>(null);
  const [composerValue, setComposerValue] = useState("");
  const [messages, setMessages] = useState<AiStartChatMessage[]>([]);
  const messagesRef = useRef<AiStartChatMessage[]>([]);
  const [draft, setDraft] = useState<AiArchitectureDraftResult | null>(null);
  const [previewDiagram, setPreviewDiagram] = useState<DiagramJson | null>(null);
  const [draftClarification, setDraftClarification] =
    useState<PendingArchitectureDraftClarification | null>(null);
  const [patchClarification, setPatchClarification] =
    useState<PendingArchitecturePatchClarification | null>(null);
  const [draftFollowUpSession, setDraftFollowUpSession] =
    useState<ArchitectureDraftFollowUpSession | null>(null);
  const [lastDraftRequest, setLastDraftRequest] =
    useState<CreateArchitectureDraftRequest | null>(null);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const {
    isListening: isVoiceListening,
    isSupported: isVoiceInputSupported,
    statusMessage: voiceStatusMessage,
    toggle: toggleVoiceRecognition
  } = useBrowserVoiceInput({
    onChange: setComposerValue,
    value: composerValue
  });

  const projectName = projectDraft?.projectName ?? "";
  const canSubmit = composerValue.trim().length > 0 && requestState !== "loading";
  const canApprove = draft !== null && previewDiagram !== null && requestState !== "loading";

  const resourceCountLabel = useMemo(() => {
    if (!draft) {
      return "0 resources";
    }

    return `${draft.architectureJson.nodes.length} resources`;
  }, [draft]);

  useEffect(() => {
    const storedDraft = readAiStartDraft();

    if (!storedDraft) {
      router.replace("/workspace/new");
      return;
    }

    setProjectDraft(storedDraft);
    replaceMessages([
      createChatMessage(
        "assistant",
        "question",
        `${storedDraft.projectName} ${COPY.initialQuestion}`
      )
    ]);
  }, [router]);

  useEffect(() => {
    scrollTranscriptToBottom();
  }, [draft, errorMessage, messages, requestState]);

  async function submitPrompt(
    value = composerValue,
    suggestionSelection?: AiStartSuggestionSelection
  ): Promise<void> {
    const trimmedPrompt = value.trim();

    if (!trimmedPrompt || requestState === "loading") {
      return;
    }

    const messagesWithSelection = suggestionSelection
      ? markAiStartMessageSuggestionsSelected(messagesRef.current, suggestionSelection)
      : messagesRef.current;
    messagesRef.current = messagesWithSelection;
    setMessages(messagesWithSelection);
    appendMessage(createChatMessage("user", "status", trimmedPrompt));
    setComposerValue("");

    if (patchClarification) {
      await handlePatchClarificationMessage(trimmedPrompt);
      return;
    }

    if (draftFollowUpSession) {
      await handleDraftFollowUpMessage(trimmedPrompt);
      return;
    }

    if (draftClarification) {
      await handleDraftClarificationMessage(trimmedPrompt);
      return;
    }

    const promptClassification = classifyWorkspaceAiChatPrompt(trimmedPrompt);

    if (promptClassification !== "architecture") {
      appendAssistantMessage("question", createWorkspaceAiPromptGateMessage(promptClassification));
      return;
    }

    if (draft !== null && previewDiagram !== null) {
      await createPatchPreviewFromPrompt(trimmedPrompt, previewDiagram);
      return;
    }

    await createDraftFromRequest({
      prompt: trimmedPrompt
    });
  }

  async function handlePatchClarificationMessage(trimmedPrompt: string): Promise<void> {
    if (!patchClarification) {
      return;
    }

    const selectedCandidate = findPatchClarificationCandidate(
      patchClarification.clarification,
      trimmedPrompt
    );

    if (selectedCandidate) {
      const clarification = patchClarification.clarification;
      const baseDiagram = patchClarification.baseDiagram;

      setPatchClarification(null);
      await createPatchPreviewFromPrompt(clarification.intent.instruction, baseDiagram, {
        ...(isAddResourceConnectionClarification(clarification)
          ? { connectionTargetResourceId: selectedCandidate.resourceId }
          : { selectedTargetResourceId: selectedCandidate.resourceId })
      });
      return;
    }

    const selectedSuggestion = findPatchClarificationSuggestion(
      patchClarification.clarification,
      trimmedPrompt
    );

    if (selectedSuggestion) {
      const clarification = patchClarification.clarification;
      const baseDiagram = patchClarification.baseDiagram;
      const instruction = isSkipConnectionSuggestion(selectedSuggestion)
        ? clarification.intent.instruction
        : `${clarification.intent.instruction}\n${selectedSuggestion}`;

      setPatchClarification(null);
      await createPatchPreviewFromPrompt(instruction, baseDiagram, {
        ...(isSkipConnectionSuggestion(selectedSuggestion) ? { skipConnection: true } : {})
      });
      return;
    }

    appendAssistantMessage(
      "question",
      patchClarification.clarification.question,
      getPatchClarificationSuggestions(patchClarification.clarification)
    );
  }

  async function handleDraftClarificationMessage(trimmedPrompt: string): Promise<void> {
    if (!draftClarification) {
      return;
    }

    const previousPrompt = draftClarification.prompt;
    const question = draftClarification.clarification.question;

    setDraftClarification(null);
    await createDraftFromRequest({
      prompt: `${previousPrompt}\n\n${question}\n${trimmedPrompt}`
    });
  }

  async function handleDraftFollowUpMessage(trimmedPrompt: string): Promise<void> {
    if (!draftFollowUpSession) {
      return;
    }

    const currentSession = draftFollowUpSession;
    const resolution = resolveArchitectureDraftFollowUpAnswer(currentSession, trimmedPrompt);

    if (resolution.action === "show_pending_draft") {
      setDraftFollowUpSession(null);
      showDraftPreview(currentSession.pendingDraft);
      return;
    }

    if (resolution.action === "regenerate") {
      setDraftFollowUpSession(null);
      await createDraftFromRequest(resolution.request);
      return;
    }

    appendAssistantMessage("question", resolution.question, resolution.suggestions);
  }

  async function createDraftFromRequest(draftRequest: CreateArchitectureDraftRequest): Promise<void> {
    setRequestState("loading");
    setErrorMessage("");
    setDraft(null);
    setPreviewDiagram(null);
    setDraftClarification(null);
    setPatchClarification(null);
    setDraftFollowUpSession(null);
    setLastDraftRequest(draftRequest);

    try {
      const result = await createAiArchitectureDraft(draftRequest);

      if (isArchitectureDraftClarification(result)) {
        setDraftClarification({
          clarification: result,
          prompt: draftRequest.prompt
        });
        setRequestState("idle");
        appendAssistantMessage("question", result.question, result.suggestions);
        return;
      }

      const previewDecision = planArchitectureDraftPreview(draftRequest, result);
      if (previewDecision.action === "ask_follow_up") {
        setDraftFollowUpSession(previewDecision.session);
        setRequestState("idle");
        appendAssistantMessage(
          "question",
          previewDecision.session.question,
          previewDecision.session.suggestions
        );
        return;
      }

      showDraftPreview(previewDecision.result);
    } catch (error) {
      const message = getApiErrorMessage(
        error,
        COPY.generateError
      );

      setRequestState("error");
      setErrorMessage(message);
      appendAssistantMessage("error", message);
    }
  }

  async function createPatchPreviewFromPrompt(
    instruction: string,
    baseDiagram: DiagramJson,
    options: {
      readonly selectedTargetResourceId?: string | undefined;
      readonly connectionTargetResourceId?: string | undefined;
      readonly skipConnection?: boolean | undefined;
    } = {}
  ): Promise<void> {
    setRequestState("loading");
    setErrorMessage("");
    setDraft(null);
    setPreviewDiagram(null);
    setDraftClarification(null);
    setPatchClarification(null);
    setDraftFollowUpSession(null);

    try {
      const response = await createAiArchitecturePatchPreview({
        architectureJson: convertDiagramJsonToArchitectureJson(baseDiagram),
        instruction,
        ...(options.selectedTargetResourceId !== undefined
          ? { selectedTargetResourceId: options.selectedTargetResourceId }
          : {}),
        ...(options.connectionTargetResourceId !== undefined
          ? { connectionTargetResourceId: options.connectionTargetResourceId }
          : {}),
        ...(options.skipConnection === true ? { skipConnection: true } : {})
      });

      if (isArchitecturePatchClarification(response)) {
        setPatchClarification({
          baseDiagram,
          clarification: response
        });
        setRequestState("idle");
        appendAssistantMessage("question", response.question, getPatchClarificationSuggestions(response));
        return;
      }

      showPatchPreview(response);
    } catch (error) {
      const message = getApiErrorMessage(
        error,
        "Architecture Patch PREVIEW 생성 중 오류가 발생했습니다."
      );

      setRequestState("error");
      setErrorMessage(message);
      appendAssistantMessage("error", message);
    }
  }

  function showPatchPreview(preview: ArchitecturePatchPreview): void {
    const nextDraft: AiArchitectureDraftResult = {
      architectureJson: preview.proposedArchitectureJson,
      diagramJson: convertArchitectureJsonToDiagramJson(preview.proposedArchitectureJson),
      title: draft?.title ?? "Practice Architecture",
      metadata: draft?.metadata ?? {
        assumptions: [],
        confidence: "low",
        explanations: [],
        guardrailWarnings: [],
        source: "prompt"
      },
      llmExplanation: preview.llmExplanation ?? draft?.llmExplanation
    };

    setDraft(nextDraft);
    setPreviewDiagram(nextDraft.diagramJson ?? convertArchitectureJsonToDiagramJson(nextDraft.architectureJson));
    setRequestState("idle");
    appendAssistantMessage("draft", createPatchPreviewSummary(preview));
  }

  function showDraftPreview(result: AiArchitectureDraftResult): void {
    setDraft(result);
    setPreviewDiagram(convertArchitectureJsonToDiagramJson(result.architectureJson));
    setRequestState("idle");
    appendAssistantMessage(
      "draft",
      `${result.title} PREVIEW\uB97C \uB9CC\uB4E4\uC5C8\uC2B5\uB2C8\uB2E4. \uC2B9\uC778\uD558\uBA74 \uC0C8 \uBCF4\uB4DC\uC5D0 \uBC14\uB85C \uBC30\uCE58\uD569\uB2C8\uB2E4.`
    );
  }

  async function approveDraft(): Promise<void> {
    if (!projectDraft || !draft || !previewDiagram) {
      return;
    }

    setRequestState("loading");
    setErrorMessage("");

    try {
      let activeProjectId = createdProjectId;

      if (!activeProjectId) {
        const project = await createProject({
          name: projectDraft.projectName
        });

        activeProjectId = project.id;
        setCreatedProjectId(project.id);
      }

      const approvedMessages = appendMessage(
        createChatMessage(
          "assistant",
          "status",
          `${draft.title} PREVIEW\uB97C \uC2B9\uC778\uD588\uC2B5\uB2C8\uB2E4. \uB300\uD654 \uB0B4\uC5ED\uACFC \uB2E4\uC774\uC5B4\uADF8\uB7A8\uC744 \uBCF4\uB4DC\uC5D0 \uC62E\uAE41\uB2C8\uB2E4.`
        )
      );

      await saveProjectDraft({
        projectId: activeProjectId,
        diagramJson: previewDiagram
      });
      storeApprovedChatHistory(activeProjectId, approvedMessages);
      clearAiStartDraft();

      const params = new URLSearchParams({
        projectId: activeProjectId,
        projectName: projectDraft.projectName
      });

      router.push(`/workspace?${params.toString()}`);
    } catch (error) {
      const message = getApiErrorMessage(
        error,
        COPY.saveApprovedError
      );

      setRequestState("error");
      setErrorMessage(message);
      appendAssistantMessage("error", message);
    }
  }

  function cancelAiStart(): void {
    router.push("/workspace/new");
  }

  async function regenerateDraft(): Promise<void> {
    if (lastDraftRequest) {
      await createDraftFromRequest(lastDraftRequest);
    }
  }

  function appendAssistantMessage(
    kind: AiStartChatMessage["kind"],
    content: string,
    suggestions: readonly string[] = []
  ): AiStartChatMessage[] {
    return appendMessage(createChatMessage("assistant", kind, content, suggestions));
  }

  function appendMessage(message: AiStartChatMessage): AiStartChatMessage[] {
    const nextMessages = trimChatMessages([...messagesRef.current, message]);
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    return nextMessages;
  }

  function replaceMessages(nextMessages: readonly AiStartChatMessage[]): void {
    const trimmedMessages = trimChatMessages(nextMessages);
    messagesRef.current = trimmedMessages;
    setMessages(trimmedMessages);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    void submitPrompt();
  }

  function scrollTranscriptToBottom(): void {
    window.requestAnimationFrame(() => {
      const transcript = transcriptRef.current;

      if (!transcript) {
        return;
      }

      transcript.scrollTo({
        behavior: "smooth",
        top: transcript.scrollHeight
      });
    });
  }

  if (!projectDraft) {
    return (
      <main className="workspaceAiStartShell">
        <section className="workspaceAiStartNotice">{COPY.loadingDraft}</section>
      </main>
    );
  }

  return (
    <main className="workspaceAiStartShell">
      <section className="workspaceAiStartPanel" aria-labelledby="workspace-ai-start-title">
        <header className="workspaceAiStartHeader">
          <button className="workspaceAiIconButton" onClick={cancelAiStart} type="button">
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
          <div>
            <p>AI</p>
            <h1 id="workspace-ai-start-title">{projectName}</h1>
          </div>
        </header>

        <div className="workspaceAiStartTranscript" ref={transcriptRef}>
          {messages.map((message) => (
            <article
              className={
                message.role === "user"
                  ? "workspaceAiStartMessage workspaceAiStartUserMessage"
                  : "workspaceAiStartMessage"
              }
              key={message.id}
            >
              <span>{message.role === "user" ? COPY.me : message.kind === "question" ? COPY.question : "AI"}</span>
              <p>{message.content}</p>
              {message.suggestions && message.suggestions.length > 0 ? (
                <div className="workspaceAiStartSuggestions">
                  {message.suggestions.map((suggestion) => {
                    const submittedSuggestions = message.selectedSuggestions ?? [];
                    const hasSubmittedSuggestion = submittedSuggestions.length > 0;
                    const isSuggestionSelected = submittedSuggestions.includes(suggestion);
                    const isSuggestionDisabled = requestState === "loading" || hasSubmittedSuggestion;

                    return (
                      <button
                        data-selected={isSuggestionSelected ? "true" : undefined}
                        disabled={isSuggestionDisabled}
                        key={suggestion}
                        onClick={() =>
                          void submitPrompt(suggestion, {
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
                </div>
              ) : null}
            </article>
          ))}

          {requestState === "loading" ? (
            <article className="workspaceAiStartMessage">
              <span>AI</span>
              <p>{COPY.preparingDiagram}</p>
            </article>
          ) : null}

          {errorMessage ? (
            <article className="workspaceAiStartMessage workspaceAiStartError" role="alert">
              <span>{COPY.error}</span>
              <p>{errorMessage}</p>
            </article>
          ) : null}

          {draft && previewDiagram ? (
            <article className="workspaceAiPreviewCard">
              <div className="workspaceAiPreviewHeader">
                <div>
                  <span>PREVIEW</span>
                  <h2>{draft.title}</h2>
                </div>
                <strong>{resourceCountLabel}</strong>
              </div>
              <MiniDiagramPreview diagram={previewDiagram} />
              <div className="workspaceAiPreviewActions">
                <button
                  className="workspaceAiPrimaryButton"
                  disabled={!canApprove}
                  onClick={() => void approveDraft()}
                  type="button"
                >
                  <Check size={15} aria-hidden="true" />
                  {COPY.approve}
                </button>
                <button className="workspaceAiSecondaryButton" onClick={cancelAiStart} type="button">
                  <X size={15} aria-hidden="true" />
                  {COPY.cancel}
                </button>
                <button
                  className="workspaceAiSecondaryButton"
                  disabled={requestState === "loading" || lastDraftRequest === null}
                  onClick={() => void regenerateDraft()}
                  type="button"
                >
                  <RefreshCw size={15} aria-hidden="true" />
                  {COPY.regenerate}
                </button>
              </div>
            </article>
          ) : null}
        </div>

        <form
          className="workspaceAiStartComposer"
          onSubmit={(event) => {
            event.preventDefault();
            void submitPrompt();
          }}
        >
          <textarea
            aria-label={COPY.chatInput}
            onKeyDown={handleComposerKeyDown}
            onChange={(event) => setComposerValue(event.target.value)}
            placeholder={COPY.placeholder}
            rows={3}
            value={composerValue}
          />
          <button
            aria-label={isVoiceListening ? "음성 인식 중지" : "음성 인식 시작"}
            aria-pressed={isVoiceListening}
            className="workspaceAiStartVoiceButton"
            data-listening={isVoiceListening}
            disabled={!isVoiceInputSupported || requestState === "loading"}
            onClick={toggleVoiceRecognition}
            title={isVoiceListening ? "음성 인식 중지" : "음성 인식 시작"}
            type="button"
          >
            <Mic size={17} aria-hidden="true" />
          </button>
          <button disabled={!canSubmit} type="submit">
            <Send size={16} aria-hidden="true" />
            {COPY.send}
          </button>
          {voiceStatusMessage.length > 0 ? (
            <p className="workspaceAiStartVoiceStatus" role="status">
              {voiceStatusMessage}
            </p>
          ) : null}
        </form>
      </section>
    </main>
  );
}

function MiniDiagramPreview({ diagram }: { readonly diagram: DiagramJson }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(MINI_DIAGRAM_MIN_ZOOM);
  const layout = createMiniDiagramLayout(diagram);
  const nodeById = new Map(layout.nodes.map((node) => [node.id, node]));
  const areaNodes = layout.nodes.filter((node) => node.isArea);
  const resourceNodes = layout.nodes.filter((node) => !node.isArea);
  const isZoomed = zoomLevel > MINI_DIAGRAM_MIN_ZOOM;
  const canZoomOut = zoomLevel > MINI_DIAGRAM_MIN_ZOOM;
  const canZoomIn = zoomLevel < MINI_DIAGRAM_MAX_ZOOM;

  useEffect(() => {
    if (!isExpanded) {
      return;
    }

    function handleKeyDown(event: globalThis.KeyboardEvent): void {
      if (event.key === "Escape") {
        setIsExpanded(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isExpanded]);

  function openExpandedPreview(): void {
    setZoomLevel(MINI_DIAGRAM_MIN_ZOOM);
    setIsExpanded(true);
  }

  return (
    <div className="workspaceAiMiniDiagramPanel">
      <div className="workspaceAiMiniDiagramToolbar" aria-label={COPY.diagramPreview}>
        <span>100%</span>
        <div>
          <button
            aria-label={COPY.fullScreenPreviewOpen}
            onClick={openExpandedPreview}
            title={COPY.fullScreen}
            type="button"
          >
            <Maximize2 size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="workspaceAiMiniDiagramViewport">
        <MiniDiagramCanvas
          areaNodes={areaNodes}
          diagram={diagram}
          fitToViewport
          layout={layout}
          nodeById={nodeById}
          resourceNodes={resourceNodes}
          zoomLevel={MINI_DIAGRAM_MIN_ZOOM}
        />
      </div>

      {isExpanded ? (
        <div aria-label={COPY.diagramPreview} aria-modal="true" className="workspaceAiMiniDiagramOverlay" role="dialog">
          <div className="workspaceAiMiniDiagramOverlaySurface">
            <div className="workspaceAiMiniDiagramToolbar workspaceAiMiniDiagramFullscreenToolbar">
              <span>{Math.round(zoomLevel * 100)}%</span>
              <div>
                <button
                  aria-label={COPY.zoomOut}
                  disabled={!canZoomOut}
                  onClick={() => setZoomLevel((currentZoomLevel) => getNextMiniDiagramZoom(currentZoomLevel, -1))}
                  title={COPY.zoomOut}
                  type="button"
                >
                  <ZoomOut size={15} aria-hidden="true" />
                </button>
                <button
                  aria-label={COPY.zoomIn}
                  disabled={!canZoomIn}
                  onClick={() => setZoomLevel((currentZoomLevel) => getNextMiniDiagramZoom(currentZoomLevel, 1))}
                  title={COPY.zoomIn}
                  type="button"
                >
                  <ZoomIn size={15} aria-hidden="true" />
                </button>
                <button
                  aria-label={COPY.zoomReset}
                  disabled={!isZoomed}
                  onClick={() => setZoomLevel(MINI_DIAGRAM_MIN_ZOOM)}
                  title={COPY.zoomReset}
                  type="button"
                >
                  <RefreshCw size={15} aria-hidden="true" />
                </button>
                <button
                  aria-label={COPY.fullScreenPreviewClose}
                  onClick={() => setIsExpanded(false)}
                  title={COPY.cancel}
                  type="button"
                >
                  <X size={15} aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="workspaceAiMiniDiagramFullscreenViewport" data-zoomed={isZoomed ? "true" : "false"}>
              <MiniDiagramCanvas
                areaNodes={areaNodes}
                diagram={diagram}
                fitToViewport={!isZoomed}
                layout={layout}
                nodeById={nodeById}
                resourceNodes={resourceNodes}
                zoomLevel={zoomLevel}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MiniDiagramCanvas({
  areaNodes,
  diagram,
  fitToViewport,
  layout,
  nodeById,
  resourceNodes,
  zoomLevel
}: {
  readonly areaNodes: readonly MiniDiagramNode[];
  readonly diagram: DiagramJson;
  readonly fitToViewport: boolean;
  readonly layout: MiniDiagramLayout;
  readonly nodeById: ReadonlyMap<string, MiniDiagramNode>;
  readonly resourceNodes: readonly MiniDiagramNode[];
  readonly zoomLevel: number;
}) {
  return (
    <svg
      aria-label={COPY.diagramPreview}
      className="workspaceAiMiniDiagram"
      data-fit={fitToViewport ? "true" : "false"}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      style={fitToViewport ? undefined : { width: `${zoomLevel * 100}%` }}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
    >
      {areaNodes.map((node) => (
        <g className="workspaceAiMiniDiagramAreaNode" key={node.id}>
          <title>{node.label}</title>
          <rect
            className="workspaceAiMiniDiagramAreaBody"
            height={node.height}
            rx="8"
            width={node.width}
            x={node.x}
            y={node.y}
          />
          <g className="workspaceAiMiniDiagramAreaHeader">
            <rect
              height={MINI_DIAGRAM_AREA_HEADER_HEIGHT}
              rx="7"
              width={node.headerWidth}
              x={node.x}
              y={node.y - MINI_DIAGRAM_AREA_HEADER_HEIGHT}
            />
            {node.iconUrl ? (
              <image
                height="15"
                href={node.iconUrl}
                preserveAspectRatio="xMidYMid meet"
                width="15"
                x={node.x + 9}
                y={node.y - MINI_DIAGRAM_AREA_HEADER_HEIGHT + 4.5}
              />
            ) : null}
            <text
              className="workspaceAiMiniDiagramAreaLabel"
              x={node.x + (node.iconUrl ? 30 : 11)}
              y={node.y - 8}
            >
              {truncateMiniDiagramLabel(node.label, MINI_DIAGRAM_MAX_LABEL_LENGTH)}
            </text>
            {node.metaLabel ? (
              <text
                className="workspaceAiMiniDiagramAreaMeta"
                x={node.x + node.headerWidth - 10}
                y={node.y - 8}
                textAnchor="end"
              >
                {truncateMiniDiagramLabel(node.metaLabel, 12)}
              </text>
            ) : null}
          </g>
        </g>
      ))}

      {diagram.edges.map((edge) => {
        const source = nodeById.get(edge.sourceNodeId);
        const target = nodeById.get(edge.targetNodeId);

        if (!source || !target) {
          return null;
        }

        return (
          <g className="workspaceAiMiniDiagramEdgeGroup" key={edge.id}>
            <path
              className="workspaceAiMiniDiagramEdge"
              d={createMiniDiagramEdgePath(source, target)}
            />
            {edge.label ? (
              <text
                className="workspaceAiMiniDiagramEdgeLabel"
                x={(source.centerX + target.centerX) / 2}
                y={(source.centerY + target.centerY) / 2 - 5}
                textAnchor="middle"
              >
                {truncateMiniDiagramLabel(edge.label, 16)}
              </text>
            ) : null}
          </g>
        );
      })}

      {resourceNodes.map((node) => {
        return (
          <g className="workspaceAiMiniDiagramResourceNode" key={node.id}>
            <title>{node.label}</title>
            {node.iconUrl ? (
              <image
                height={node.iconSize}
                href={node.iconUrl}
                preserveAspectRatio="xMidYMid meet"
                width={node.iconSize}
                x={node.centerX - node.iconSize / 2}
                y={node.iconY}
              />
            ) : (
              <g className="workspaceAiMiniDiagramNodeFallback" aria-hidden="true">
                <rect
                  height={node.iconSize}
                  rx="7"
                  width={node.iconSize}
                  x={node.centerX - node.iconSize / 2}
                  y={node.iconY}
                />
                <text
                  textAnchor="middle"
                  x={node.centerX}
                  y={node.iconY + node.iconSize / 2 + 4}
                >
                  AWS
                </text>
              </g>
            )}
            <text
              className="workspaceAiMiniDiagramResourceLabel"
              textAnchor="middle"
              x={node.centerX}
              y={node.labelY}
            >
              {truncateMiniDiagramLabel(node.label, 18)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function getNextMiniDiagramZoom(currentZoomLevel: number, direction: -1 | 1): number {
  const currentIndex = MINI_DIAGRAM_ZOOM_LEVELS.findIndex((zoomLevel) => zoomLevel === currentZoomLevel);
  const fallbackIndex = MINI_DIAGRAM_ZOOM_LEVELS.reduce(
    (closestIndex, zoomLevel, index) => {
      const closestZoomLevel = MINI_DIAGRAM_ZOOM_LEVELS[closestIndex] ?? MINI_DIAGRAM_MIN_ZOOM;

      return Math.abs(zoomLevel - currentZoomLevel) < Math.abs(closestZoomLevel - currentZoomLevel)
        ? index
        : closestIndex;
    },
    0
  );
  const nextIndex = Math.min(
    Math.max((currentIndex === -1 ? fallbackIndex : currentIndex) + direction, 0),
    MINI_DIAGRAM_ZOOM_LEVELS.length - 1
  );

  return MINI_DIAGRAM_ZOOM_LEVELS[nextIndex] ?? MINI_DIAGRAM_MIN_ZOOM;
}

function createMiniDiagramLayout(diagram: DiagramJson): {
  readonly height: number;
  readonly nodes: readonly MiniDiagramNode[];
  readonly width: number;
} {
  if (diagram.nodes.length === 0) {
    return { height: 1, nodes: [], width: 1 };
  }

  const bounds = diagram.nodes.reduce(
    (currentBounds, node) => ({
      bottom: Math.max(currentBounds.bottom, node.position.y + node.size.height),
      left: Math.min(currentBounds.left, node.position.x),
      right: Math.max(currentBounds.right, node.position.x + node.size.width),
      top: Math.min(
        currentBounds.top,
        isAreaNode(node) ? node.position.y - MINI_DIAGRAM_AREA_HEADER_HEIGHT : node.position.y
      )
    }),
    {
      bottom: -Infinity,
      left: Infinity,
      right: -Infinity,
      top: Infinity
    }
  );
  const nodes = diagram.nodes.map((node) => createMiniDiagramNode(node, bounds));

  return {
    height: Math.max(bounds.bottom - bounds.top + MINI_DIAGRAM_PADDING * 2, 1),
    nodes,
    width: Math.max(bounds.right - bounds.left + MINI_DIAGRAM_PADDING * 2, 1)
  };
}

type MiniDiagramLayout = ReturnType<typeof createMiniDiagramLayout>;

type MiniDiagramNode = {
  readonly centerX: number;
  readonly centerY: number;
  readonly headerWidth: number;
  readonly height: number;
  readonly iconSize: number;
  readonly iconUrl: string | undefined;
  readonly iconY: number;
  readonly id: string;
  readonly isArea: boolean;
  readonly label: string;
  readonly labelY: number;
  readonly metaLabel: string | undefined;
  readonly width: number;
  readonly x: number;
  readonly y: number;
};

function createMiniDiagramNode(
  node: DiagramNode,
  bounds: { readonly left: number; readonly top: number }
): MiniDiagramNode {
  const isArea = isAreaNode(node);
  const x = MINI_DIAGRAM_PADDING + node.position.x - bounds.left;
  const y = MINI_DIAGRAM_PADDING + node.position.y - bounds.top;
  const width = node.size.width;
  const height = node.size.height;
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const label = (isArea ? getAreaNodeLabel(node) : node.label) ?? "";
  const iconSize = getMiniDiagramResourceIconSize(node);

  return {
    centerX,
    centerY,
    headerWidth: isArea ? getMiniDiagramAreaHeaderWidth(label, width, getAreaNodeMetaLabel(node)) : 0,
    height,
    iconSize,
    iconUrl: isArea ? getAreaNodeIconUrl(node) : node.iconUrl,
    iconY: y + Math.max(4, (height - 22 - iconSize) / 2),
    id: node.id,
    isArea,
    label,
    labelY: y + height - 4,
    metaLabel: isArea ? getAreaNodeMetaLabel(node) : undefined,
    width,
    x,
    y
  };
}

function createMiniDiagramEdgePath(source: MiniDiagramNode, target: MiniDiagramNode): string {
  const midX = (source.centerX + target.centerX) / 2;

  return [
    `M ${source.centerX} ${source.centerY}`,
    `C ${midX} ${source.centerY}`,
    `${midX} ${target.centerY}`,
    `${target.centerX} ${target.centerY}`
  ].join(" ");
}

function getMiniDiagramResourceIconSize(node: DiagramNode): number {
  if (isAreaNode(node)) {
    return 15;
  }

  return Math.min(64, Math.max(28, Math.min(node.size.width, Math.max(28, node.size.height - 22)) * 0.78));
}

function getMiniDiagramAreaHeaderWidth(
  label: string,
  areaWidth: number,
  metaLabel: string | undefined
): number {
  const iconSpace = 30;
  const metaSpace = metaLabel ? 56 : 0;
  const estimatedLabelWidth = Math.min(label.length, MINI_DIAGRAM_MAX_LABEL_LENGTH) * 7;
  const requestedWidth = iconSpace + estimatedLabelWidth + metaSpace + 18;

  return Math.min(Math.max(92, requestedWidth), Math.min(MINI_DIAGRAM_AREA_HEADER_MAX_WIDTH, areaWidth));
}

function truncateMiniDiagramLabel(label: string, maxLength: number): string {
  return label.length > maxLength ? `${label.slice(0, Math.max(0, maxLength - 3))}...` : label;
}

function readAiStartDraft(): WorkspaceStartDraft | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(AI_START_DRAFT_STORAGE_KEY);
    const parsedValue = rawValue ? JSON.parse(rawValue) : null;

    return isWorkspaceStartDraft(parsedValue) ? parsedValue : null;
  } catch {
    return null;
  }
}

function clearAiStartDraft(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(AI_START_DRAFT_STORAGE_KEY);
}

function isWorkspaceStartDraft(value: unknown): value is WorkspaceStartDraft {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<WorkspaceStartDraft>;

  return (
    candidate.startMode === "ai" &&
    typeof candidate.projectName === "string" &&
    candidate.projectName.trim().length > 0 &&
    typeof candidate.updatedAt === "string"
  );
}

function storeApprovedChatHistory(projectId: string, messages: readonly AiStartChatMessage[]): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      createWorkspaceAiChatStorageKey(projectId),
      JSON.stringify(trimChatMessages(messages))
    );
  } catch (error) {
    console.error("Failed to store approved chat history to localStorage:", error);
  }
}

function createChatMessage(
  role: AiStartChatMessage["role"],
  kind: AiStartChatMessage["kind"],
  content: string,
  suggestions: readonly string[] = []
): AiStartChatMessage {
  return {
    content,
    createdAt: new Date().toISOString(),
    id: createChatMessageId(),
    kind,
    role,
    scope: "draft",
    selectionMode: "single",
    ...(suggestions.length > 0 ? { suggestions } : {})
  };
}

function createChatMessageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function trimChatMessages(messages: readonly AiStartChatMessage[]): AiStartChatMessage[] {
  return messages.slice(-MAX_CHAT_MESSAGES);
}

function markAiStartMessageSuggestionsSelected(
  messages: readonly AiStartChatMessage[],
  selection: AiStartSuggestionSelection
): AiStartChatMessage[] {
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

function isArchitectureDraftClarification(
  response: AiArchitectureDraftResult | ArchitectureDraftClarification
): response is ArchitectureDraftClarification {
  return "status" in response && response.status === "needs_clarification";
}

function isArchitecturePatchClarification(
  response: ArchitecturePatchPreview | ArchitecturePatchClarification
): response is ArchitecturePatchClarification {
  return "status" in response && response.status === "needs_clarification";
}

function createPatchPreviewSummary(preview: ArchitecturePatchPreview): string {
  if (preview.changes.length === 0) {
    return "변경 없이 현재 PREVIEW를 유지합니다.";
  }

  const changeSummary =
    preview.changes.length === 1
      ? preview.changes[0]?.summary
      : `${preview.changes.length}개 변경 사항을 PREVIEW로 만들었습니다.`;

  return changeSummary ?? "수정 PREVIEW를 만들었습니다. 승인할까요?";
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

function isSkipConnectionSuggestion(suggestion: string): boolean {
  return normalizePatchClarificationAnswer(suggestion) === normalizePatchClarificationAnswer("연결하지 않기");
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
