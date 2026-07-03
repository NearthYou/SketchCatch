"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AiArchitectureDraftResult,
  ArchitectureDraftBudgetLevel,
  ArchitectureDraftScenarioHint,
  ArchitectureDraftSecurityPriority,
  ArchitectureDraftTrafficLevel,
  ArchitectureGuardrailWarning,
  DesignSimulationResult
} from "@sketchcatch/types";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { Send, Sparkles, X } from "lucide-react";
import { getApiErrorMessage } from "../../lib/api-client";
import type { DiagramEditorPanelContext } from "../diagram-editor";
import {
  createAiArchitectureDraft,
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
  WorkspaceAiRequestMessage,
  WorkspaceAiSelect
} from "./WorkspaceAiPanelPieces";
import type { AiRequestState } from "./WorkspaceAiPanelPieces";
import {
  budgetOptions,
  DEFAULT_REQUIREMENT_PROMPT,
  promptGuideExamples,
  scenarioOptions,
  securityOptions,
  trafficOptions
} from "./workspace-ai-panel-options";
import styles from "./workspace.module.css";

export type WorkspaceAiChatDockProps = {
  readonly context: DiagramEditorPanelContext;
  readonly projectId: string;
};

type WorkspaceAiChatMessageRole = "assistant" | "user";
type WorkspaceAiChatMessageKind = "draft" | "error" | "question" | "simulation" | "status";

type WorkspaceAiChatMessage = {
  readonly id: string;
  readonly content: string;
  readonly createdAt: string;
  readonly kind: WorkspaceAiChatMessageKind;
  readonly role: WorkspaceAiChatMessageRole;
};

const MAX_CHAT_MESSAGES = 80;
const STORAGE_KEY_PREFIX = "sketchcatch.workspaceAiChat";

export function WorkspaceAiChatDock({ context, projectId }: WorkspaceAiChatDockProps) {
  const [isOpen, setOpen] = useState(false);
  const [composerValue, setComposerValue] = useState("");
  const [messages, setMessages] = useState<WorkspaceAiChatMessage[]>(() =>
    readStoredChatMessages(projectId)
  );
  const [scenarioHint, setScenarioHint] = useState<ArchitectureDraftScenarioHint>("auto");
  const [budgetLevel, setBudgetLevel] = useState<ArchitectureDraftBudgetLevel>("normal");
  const [trafficLevel, setTrafficLevel] = useState<ArchitectureDraftTrafficLevel>("small");
  const [securityPriority, setSecurityPriority] =
    useState<ArchitectureDraftSecurityPriority>("basic");
  const [draft, setDraft] = useState<AiArchitectureDraftResult | null>(null);
  const [designSimulation, setDesignSimulation] = useState<DesignSimulationResult | null>(null);
  const [draftState, setDraftState] = useState<AiRequestState>("idle");
  const [simulationState, setSimulationState] = useState<AiRequestState>("idle");
  const [draftErrorMessage, setDraftErrorMessage] = useState("");
  const [simulationErrorMessage, setSimulationErrorMessage] = useState("");
  const [simulationFingerprint, setSimulationFingerprint] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    setMessages(readStoredChatMessages(projectId));
  }, [projectId]);

  useEffect(() => {
    storeChatMessages(projectId, messages);
  }, [messages, projectId]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      behavior: "smooth",
      top: transcriptRef.current.scrollHeight
    });
  }, [messages, draft, designSimulation]);

  function appendAssistantMessage(kind: WorkspaceAiChatMessageKind, content: string): void {
    setMessages((currentMessages) => trimChatMessages([
      ...currentMessages,
      createChatMessage("assistant", kind, content)
    ]));
  }

  async function submitChatPrompt(event?: FormEvent<HTMLFormElement>): Promise<void> {
    event?.preventDefault();

    const trimmedPrompt = composerValue.trim();

    if (trimmedPrompt.length === 0 || draftState === "loading") {
      return;
    }

    const userMessage = createChatMessage("user", "status", trimmedPrompt);
    const nextMessages = trimChatMessages([...messages, userMessage]);

    setComposerValue("");
    setMessages(nextMessages);
    await createDraftFromConversation(nextMessages);
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

    setDraftState("loading");
    setDraftErrorMessage("");
    setDraft(null);
    context.setPreviewDiagram(null);

    try {
      const result = await createAiArchitectureDraft({
        budgetLevel,
        prompt: requirementPrompt,
        scenarioHint,
        securityPriority,
        trafficLevel
      });
      const previewDiagram = convertArchitectureJsonToDiagramJson(result.architectureJson);
      const followUpQuestion = createFollowUpQuestionFromWarnings(
        result.metadata.guardrailWarnings
      );

      setDraft(result);
      context.setPreviewDiagram(previewDiagram);
      setDraftState("idle");
      appendAssistantMessage(
        followUpQuestion ? "question" : "draft",
        followUpQuestion ??
          `${result.title} 초안을 보드에 반투명 미리보기로 띄웠습니다. 생성할까요?`
      );
    } catch (error) {
      const message = getApiErrorMessage(error, "Architecture Draft 생성 중 오류가 발생했습니다.");
      const question = createQuestionFromDraftError(message);

      if (question) {
        setDraftState("idle");
        appendAssistantMessage("question", question);
        return;
      }

      setDraftState("error");
      setDraftErrorMessage(message);
      appendAssistantMessage("error", message);
    }
  }

  function applyDraftToBoard(): void {
    if (draft === null) {
      return;
    }

    context.applyDiagramJson(
      context.previewDiagram ?? convertArchitectureJsonToDiagramJson(draft.architectureJson)
    );
    setDraft(null);
    setDesignSimulation(null);
    setSimulationFingerprint(null);
    appendAssistantMessage("status", "생성했습니다. 현재 보드가 AI 초안으로 전체 교체되었습니다.");
  }

  function cancelDraftPreview(): void {
    context.setPreviewDiagram(null);
    setDraft(null);
    setDraftErrorMessage("");
    setDraftState("idle");
    appendAssistantMessage("status", "초안 미리보기를 취소했습니다.");
  }

  async function regenerateDraft(): Promise<void> {
    await createDraftFromConversation(messages);
  }

  async function runDesignSimulation(): Promise<void> {
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
        budgetLevel,
        trafficLevel
      });
      setDesignSimulation(result);
      setSimulationFingerprint(boardSnapshot.fingerprint);
      setSimulationState("idle");
      appendAssistantMessage("simulation", `현재 보드 시뮬레이션 결과: ${result.summary}`);
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

  if (!isOpen) {
    return (
      <button
        aria-label="AI 채팅 열기"
        className={styles.aiChatLauncher}
        data-right-panel-open={context.isRightPanelOpen}
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
      data-right-panel-open={context.isRightPanelOpen}
    >
      <header className={styles.aiChatHeader}>
        <div>
          <span>Natural Language Diagramming</span>
          <h2>AI 채팅</h2>
        </div>
        <button
          aria-label="AI 채팅 닫기"
          className={styles.aiChatCloseButton}
          onClick={() => setOpen(false)}
          title="닫기"
          type="button"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <div className={styles.aiChatControls} aria-label="AI 설정">
        <WorkspaceAiSelect
          label="보조 선택"
          onChange={setScenarioHint}
          options={scenarioOptions}
          value={scenarioHint}
        />
        <WorkspaceAiSelect
          label="예산"
          onChange={setBudgetLevel}
          options={budgetOptions}
          value={budgetLevel}
        />
        <WorkspaceAiSelect
          label="트래픽"
          onChange={setTrafficLevel}
          options={trafficOptions}
          value={trafficLevel}
        />
        <WorkspaceAiSelect
          label="보안"
          onChange={setSecurityPriority}
          options={securityOptions}
          value={securityPriority}
        />
        <button
          className={styles.aiSecondaryButton}
          disabled={simulationState === "loading" || context.isPreviewActive}
          onClick={() => void runDesignSimulation()}
          type="button"
        >
          {simulationState === "loading" ? "계산 중" : "시뮬레이션"}
        </button>
      </div>

      <div className={styles.aiChatTranscript} ref={transcriptRef}>
        {messages.map((message) => (
          <article
            className={
              message.role === "user" ? styles.aiChatUserMessage : styles.aiChatAssistantMessage
            }
            data-kind={message.kind}
            key={message.id}
          >
            <span>{message.role === "user" ? "나" : message.kind === "question" ? "질문" : "AI"}</span>
            <p>{message.content}</p>
          </article>
        ))}

        <WorkspaceAiRequestMessage state={draftState} message={draftErrorMessage} />
        <WorkspaceAiRequestMessage state={simulationState} message={simulationErrorMessage} />

        {draft !== null ? (
          <article className={styles.aiChatDraftCard}>
            <div className={styles.aiResultHeader}>
              <h3>{draft.title}</h3>
              <span>{draft.architectureJson.nodes.length}개 리소스</span>
            </div>
            <WorkspaceAiExplanation explanation={draft.llmExplanation} />
            <div className={styles.aiActionRow}>
              <button className={styles.aiPrimaryButton} onClick={applyDraftToBoard} type="button">
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

        {hasStaleDesignSimulation ? (
          <p className={styles.aiStaleNotice}>보드 변경됨 · 다시 실행 필요</p>
        ) : null}
        {designSimulation !== null ? (
          <WorkspaceAiDesignSimulationResult simulation={designSimulation} />
        ) : null}
      </div>

      <form className={styles.aiChatComposer} onSubmit={(event) => void submitChatPrompt(event)}>
        <div className={styles.aiPromptGuide} aria-label="프롬프트 작성 가이드">
          <div className={styles.aiPromptGuideHeader}>
            <strong>그냥 이렇게 시작해도 돼요</strong>
            <span>원하는 서비스만 적어도 초안을 만듭니다.</span>
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
          <p className={styles.aiPromptTinyHint}>더 정확히: 공개 여부 · 파일/데이터 · 비용/보안</p>
        </div>
        <label className={styles.aiChatInput}>
          <span>메시지</span>
          <textarea
            onChange={(event) => setComposerValue(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder={DEFAULT_REQUIREMENT_PROMPT}
            rows={2}
            value={composerValue}
          />
        </label>
        <button
          className={styles.aiChatSendButton}
          disabled={composerValue.trim().length === 0 || draftState === "loading"}
          type="submit"
        >
          <Send size={16} aria-hidden="true" />
          보내기
        </button>
      </form>
    </section>
  );
}

export function createWorkspaceAiChatStorageKey(projectId: string): string {
  return `${STORAGE_KEY_PREFIX}.${projectId}`;
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

function createFollowUpQuestionFromWarnings(
  warnings: readonly ArchitectureGuardrailWarning[] | undefined
): string | null {
  if (!warnings || warnings.length === 0) {
    return null;
  }

  if (warnings.some((warning) => warning.code === "unsupported_requirement_substituted")) {
    return "질문: 요청한 일부 요구사항은 아직 직접 지원하지 않아서 지원 가능한 구조로 대체한 초안을 미리보기로 띄웠습니다. 이대로 생성할까요, 아니면 원하는 조건을 더 알려줄까요?";
  }

  if (
    warnings.some(
      (warning) =>
        warning.code === "unsupported_resource_omitted" ||
        warning.code === "partial_generation"
    )
  ) {
    return "질문: 지원 가능한 부분만 초안으로 띄웠습니다. 제외된 요구사항을 다른 방식으로 대체할까요?";
  }

  if (warnings.some((warning) => warning.code === "scenario_conflict")) {
    return "질문: 자연어 요구사항과 보조 선택이 달라 보입니다. 자연어 기준으로 만든 초안이 맞을까요?";
  }

  if (warnings.some((warning) => warning.code === "low_budget_rds_cost")) {
    return "질문: DB가 포함되면 비용이 늘 수 있습니다. 낮은 예산을 우선해서 DB 없는 구조로 바꿀까요?";
  }

  return null;
}

function createQuestionFromDraftError(message: string): string | null {
  if (/명확한 아키텍처 단서|초안을 생성하지 않았습니다/.test(message)) {
    return "질문: 아키텍처 단서가 아직 부족합니다. 정적 홈페이지인지, 서버가 필요한 웹서비스인지, 파일 저장이나 로그인 같은 기능이 필요한지 알려주세요.";
  }

  return null;
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

function createChatMessage(
  role: WorkspaceAiChatMessageRole,
  kind: WorkspaceAiChatMessageKind,
  content: string
): WorkspaceAiChatMessage {
  return {
    id: createChatMessageId(),
    content,
    createdAt: new Date().toISOString(),
    kind,
    role
  };
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
    (candidate.kind === "draft" ||
      candidate.kind === "error" ||
      candidate.kind === "question" ||
      candidate.kind === "simulation" ||
      candidate.kind === "status")
  );
}
