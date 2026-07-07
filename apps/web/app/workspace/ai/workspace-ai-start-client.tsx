"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ArrowLeft, Check, RefreshCw, Send, X } from "lucide-react";
import type {
  AiArchitectureDraftResult,
  ArchitectureDraftClarification,
  CreateArchitectureDraftRequest,
  DiagramJson
} from "@sketchcatch/types";
import { getApiErrorMessage } from "../../../lib/api-client";
import {
  createAiArchitectureDraft,
  createProject,
  saveProjectDraft
} from "../../../features/workspace/api";
import { convertArchitectureJsonToDiagramJson } from "../../../features/workspace/workspace-ai-diagram-adapter";
import {
  planArchitectureDraftPreview,
  resolveArchitectureDraftFollowUpAnswer,
  type ArchitectureDraftFollowUpSession
} from "../../../features/workspace/workspace-ai-draft-follow-up";
import { createWorkspaceAiChatStorageKey } from "../../../features/workspace/WorkspaceAiChatDock";

const AI_START_DRAFT_STORAGE_KEY = "sketchcatch.newProjectDraft";
const MAX_CHAT_MESSAGES = 80;
const COPY = {
  approve: "\uC2B9\uC778",
  cancel: "\uCDE8\uC18C",
  chatInput: "AI \uCC44\uD305 \uC785\uB825",
  diagramPreview: "\uB2E4\uC774\uC5B4\uADF8\uB7A8 \uBBF8\uB9AC\uBCF4\uAE30",
  error: "\uC624\uB958",
  generateError: "Architecture Draft \uC0DD\uC131 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.",
  initialQuestion: "\uD504\uB85C\uC81D\uD2B8 \uC694\uAD6C\uC0AC\uD56D\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694.",
  loadingDraft: "\uC0C8 \uD504\uB85C\uC81D\uD2B8 \uC815\uBCF4\uB97C \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.",
  me: "\uB098",
  placeholder: "\uB9CC\uB4E4\uACE0 \uC2F6\uC740 \uC11C\uBE44\uC2A4 \uC694\uAD6C\uC0AC\uD56D\uC744 \uC785\uB825\uD558\uC138\uC694.",
  preparingDiagram: "\uB2E4\uC774\uC5B4\uADF8\uB7A8\uC744 \uC900\uBE44\uD558\uB294 \uC911\uC785\uB2C8\uB2E4.",
  question: "\uC9C8\uBB38",
  regenerate: "\uB2E4\uC2DC \uC0DD\uC131",
  saveApprovedError: "\uC2B9\uC778\uD55C PREVIEW\uB97C \uBCF4\uB4DC\uB85C \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.",
  send: "\uBCF4\uB0B4\uAE30"
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
  readonly suggestions?: readonly string[] | undefined;
};

type PendingArchitectureDraftClarification = {
  readonly clarification: ArchitectureDraftClarification;
  readonly prompt: string;
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
  const [draftFollowUpSession, setDraftFollowUpSession] =
    useState<ArchitectureDraftFollowUpSession | null>(null);
  const [lastDraftRequest, setLastDraftRequest] =
    useState<CreateArchitectureDraftRequest | null>(null);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const transcriptRef = useRef<HTMLDivElement>(null);

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

  async function submitPrompt(value = composerValue): Promise<void> {
    const trimmedPrompt = value.trim();

    if (!trimmedPrompt || requestState === "loading") {
      return;
    }

    appendMessage(createChatMessage("user", "status", trimmedPrompt));
    setComposerValue("");

    if (draftFollowUpSession) {
      await handleDraftFollowUpMessage(trimmedPrompt);
      return;
    }

    if (draftClarification) {
      await handleDraftClarificationMessage(trimmedPrompt);
      return;
    }

    await createDraftFromRequest({
      prompt: trimmedPrompt
    });
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
      const project = await createProject({
        name: projectDraft.projectName
      });
      const approvedMessages = appendMessage(
        createChatMessage(
          "assistant",
          "status",
          `${draft.title} PREVIEW\uB97C \uC2B9\uC778\uD588\uC2B5\uB2C8\uB2E4. \uB300\uD654 \uB0B4\uC5ED\uACFC \uB2E4\uC774\uC5B4\uADF8\uB7A8\uC744 \uBCF4\uB4DC\uC5D0 \uC62E\uAE41\uB2C8\uB2E4.`
        )
      );

      await saveProjectDraft({
        projectId: project.id,
        diagramJson: previewDiagram
      });
      storeApprovedChatHistory(project.id, approvedMessages);
      clearAiStartDraft();

      const params = new URLSearchParams({
        projectId: project.id,
        projectName: project.name
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
                  {message.suggestions.map((suggestion) => (
                    <button
                      disabled={requestState === "loading"}
                      key={suggestion}
                      onClick={() => void submitPrompt(suggestion)}
                      type="button"
                    >
                      {suggestion}
                    </button>
                  ))}
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
          <button disabled={!canSubmit} type="submit">
            <Send size={16} aria-hidden="true" />
            {COPY.send}
          </button>
        </form>
      </section>
    </main>
  );
}

function MiniDiagramPreview({ diagram }: { readonly diagram: DiagramJson }) {
  const layout = createMiniDiagramLayout(diagram);

  return (
    <svg
      aria-label={COPY.diagramPreview}
      className="workspaceAiMiniDiagram"
      role="img"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
    >
      {diagram.edges.map((edge) => {
        const source = layout.nodes.get(edge.sourceNodeId);
        const target = layout.nodes.get(edge.targetNodeId);

        if (!source || !target) {
          return null;
        }

        return (
          <line
            className="workspaceAiMiniDiagramEdge"
            key={edge.id}
            x1={source.x}
            x2={target.x}
            y1={source.y}
            y2={target.y}
          />
        );
      })}
      {diagram.nodes.map((node) => {
        const point = layout.nodes.get(node.id);

        if (!point) {
          return null;
        }

        return (
          <g className="workspaceAiMiniDiagramNode" key={node.id}>
            <title>{node.label}</title>
            <rect height="42" rx="7" width="42" x={point.x - 21} y={point.y - 21} />
            {node.iconUrl ? (
              <image
                height="28"
                href={node.iconUrl}
                preserveAspectRatio="xMidYMid meet"
                width="28"
                x={point.x - 14}
                y={point.y - 14}
              />
            ) : (
              <g className="workspaceAiMiniDiagramNodeFallback" aria-hidden="true">
                <circle cx={point.x} cy={point.y} r="7" />
                <path d={`M ${point.x - 11} ${point.y + 9} L ${point.x} ${point.y - 12} L ${point.x + 11} ${point.y + 9} Z`} />
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function createMiniDiagramLayout(diagram: DiagramJson): {
  readonly height: number;
  readonly nodes: Map<string, { readonly x: number; readonly y: number }>;
  readonly width: number;
} {
  const width = 560;
  const height = 300;
  const nodes = new Map<string, { x: number; y: number }>();

  if (diagram.nodes.length === 0) {
    return { height, nodes, width };
  }

  const bounds = diagram.nodes.reduce(
    (currentBounds, node) => ({
      bottom: Math.max(currentBounds.bottom, node.position.y + node.size.height),
      left: Math.min(currentBounds.left, node.position.x),
      right: Math.max(currentBounds.right, node.position.x + node.size.width),
      top: Math.min(currentBounds.top, node.position.y)
    }),
    {
      bottom: -Infinity,
      left: Infinity,
      right: -Infinity,
      top: Infinity
    }
  );
  const sourceWidth = Math.max(bounds.right - bounds.left, 1);
  const sourceHeight = Math.max(bounds.bottom - bounds.top, 1);
  const padding = 38;
  const scale = Math.min((width - padding * 2) / sourceWidth, (height - padding * 2) / sourceHeight);

  for (const node of diagram.nodes) {
    nodes.set(node.id, {
      x: padding + (node.position.x + node.size.width / 2 - bounds.left) * scale,
      y: padding + (node.position.y + node.size.height / 2 - bounds.top) * scale
    });
  }

  return { height, nodes, width };
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

  window.localStorage.setItem(
    createWorkspaceAiChatStorageKey(projectId),
    JSON.stringify(trimChatMessages(messages))
  );
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

function isArchitectureDraftClarification(
  response: AiArchitectureDraftResult | ArchitectureDraftClarification
): response is ArchitectureDraftClarification {
  return "status" in response && response.status === "needs_clarification";
}
