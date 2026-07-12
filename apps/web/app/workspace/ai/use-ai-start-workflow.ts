"use client";

// allow: SIZE_OK — AI 초안, 수정, 추가 질문, 승인 상태 전환을 한 상태 머신에서 순서대로 관리합니다.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type {
  AiArchitectureDraftResult,
  ArchitectureDraftClarification,
  ArchitecturePatchClarification,
  CreateArchitectureDraftRequest,
  DiagramJson
} from "@sketchcatch/types";
import { getApiErrorMessage } from "../../../lib/api-client";
import {
  createAiArchitectureDraft,
  createAiArchitecturePatchPreview,
  createProject,
  saveProjectDraft
} from "../../../features/workspace/api";
import { useBrowserVoiceInput } from "../../../features/workspace/use-browser-voice-input";
import {
  convertDiagramJsonToArchitectureJson,
  getDiagramJsonForArchitectureDraft
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
import {
  clearAiStartProjectDraft,
  createAiStartMessage,
  createDraftFromPatch,
  createPatchSummary,
  findPatchClarificationCandidate,
  findPatchClarificationSuggestion,
  getPatchClarificationSuggestions,
  isArchitectureDraftClarification,
  isArchitecturePatchClarification,
  readAiStartProjectDraft,
  storeApprovedAiStartMessages,
  trimAiStartMessages,
  type AiStartMessage,
  type AiStartProjectDraft
} from "./ai-start-model";

type PendingDraftClarification = {
  readonly clarification: ArchitectureDraftClarification;
  readonly prompt: string;
};

type PendingPatchClarification = {
  readonly baseDiagram: DiagramJson;
  readonly clarification: ArchitecturePatchClarification;
};

type RequestState = "idle" | "loading" | "error";

type PatchTargetOptions = {
  readonly connectionTargetResourceId?: string | undefined;
  readonly selectedTargetResourceId?: string | undefined;
  readonly skipConnection?: boolean | undefined;
};

export function useAiStartWorkflow() {
  const router = useRouter();
  const [projectDraft, setProjectDraft] = useState<AiStartProjectDraft | null>(null);
  const [composerValue, setComposerValue] = useState("");
  const [messages, setMessages] = useState<AiStartMessage[]>([]);
  const messagesRef = useRef<AiStartMessage[]>([]);
  const [draft, setDraft] = useState<AiArchitectureDraftResult | null>(null);
  const [previewDiagram, setPreviewDiagram] = useState<DiagramJson | null>(null);
  const [draftClarification, setDraftClarification] =
    useState<PendingDraftClarification | null>(null);
  const [patchClarification, setPatchClarification] =
    useState<PendingPatchClarification | null>(null);
  const [draftFollowUp, setDraftFollowUp] = useState<ArchitectureDraftFollowUpSession | null>(null);
  const [lastDraftRequest, setLastDraftRequest] = useState<CreateArchitectureDraftRequest | null>(
    null
  );
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const requestAbortControllerRef = useRef<AbortController | null>(null);
  const [voiceTranscriptNeedsConfirmation, setVoiceTranscriptNeedsConfirmation] = useState(false);
  const voiceInput = useBrowserVoiceInput({
    onChange: handleVoiceTranscriptChange,
    value: composerValue
  });

  useEffect(() => {
    const storedDraft = readAiStartProjectDraft();

    if (storedDraft === null) {
      router.replace("/workspace/new");
      return;
    }

    setProjectDraft(storedDraft);
    replaceMessages([
      createAiStartMessage(
        "assistant",
        "question",
        `${storedDraft.projectName}에 필요한 구조를 알려주세요.`
      )
    ]);
  }, [router]);

  useEffect(() => () => requestAbortControllerRef.current?.abort(), []);

  async function submitPrompt(value = composerValue): Promise<void> {
    const prompt = value.trim();

    if (
      prompt.length === 0 ||
      requestState === "loading" ||
      voiceTranscriptNeedsConfirmation
    ) {
      return;
    }

    appendMessage(createAiStartMessage("user", "status", prompt));
    setComposerValue("");
    setVoiceTranscriptNeedsConfirmation(false);

    if (patchClarification !== null) {
      await answerPatchClarification(prompt, patchClarification);
      return;
    }

    if (draftFollowUp !== null) {
      await answerDraftFollowUp(prompt, draftFollowUp);
      return;
    }

    if (draftClarification !== null) {
      const nextPrompt = `${draftClarification.prompt}\n\n${draftClarification.clarification.question}\n${prompt}`;
      setDraftClarification(null);
      await requestDraft({ prompt: nextPrompt });
      return;
    }

    const classification = classifyWorkspaceAiChatPrompt(prompt);
    if (classification !== "architecture") {
      appendAssistantMessage("question", createWorkspaceAiPromptGateMessage(classification));
      return;
    }

    if (draft !== null && previewDiagram !== null) {
      await requestPatch(prompt, previewDiagram);
      return;
    }

    await requestDraft({ prompt });
  }

  function handleVoiceTranscriptChange(transcript: string): void {
    setComposerValue(transcript);
    setVoiceTranscriptNeedsConfirmation(transcript.trim().length > 0);
  }

  function confirmVoiceTranscript(): void {
    if (composerValue.trim().length > 0) {
      setVoiceTranscriptNeedsConfirmation(false);
    }
  }

  function updateComposerValue(value: string): void {
    setComposerValue(value);
    if (value.trim().length === 0) {
      setVoiceTranscriptNeedsConfirmation(false);
    }
  }

  async function requestDraft(
    request: CreateArchitectureDraftRequest,
    preservePreview = false
  ): Promise<void> {
    const signal = beginRequest(!preservePreview);
    setLastDraftRequest(request);

    try {
      const response = await createAiArchitectureDraft(request, signal);

      if (isArchitectureDraftClarification(response)) {
        setDraftClarification({ clarification: response, prompt: request.prompt });
        finishRequest();
        appendAssistantMessage("question", response.question, response.suggestions);
        return;
      }

      const decision = planArchitectureDraftPreview(request, response);
      if (decision.action === "ask_follow_up") {
        setDraftFollowUp(decision.session);
        finishRequest();
        appendAssistantMessage("question", decision.session.question, decision.session.suggestions);
        return;
      }

      showDraft(decision.result);
    } catch (error) {
      if (isAbortedRequest(error)) return;
      failRequest(getApiErrorMessage(error, "Architecture Draft를 만들지 못했습니다."));
    }
  }

  async function requestPatch(
    instruction: string,
    baseDiagram: DiagramJson,
    options: PatchTargetOptions = {}
  ): Promise<void> {
    const signal = beginRequest(false);

    try {
      const response = await createAiArchitecturePatchPreview(
        {
          architectureJson: convertDiagramJsonToArchitectureJson(baseDiagram),
          instruction,
          ...options
        },
        signal
      );

      if (isArchitecturePatchClarification(response)) {
        setPatchClarification({ baseDiagram, clarification: response });
        finishRequest();
        appendAssistantMessage(
          "question",
          response.question,
          getPatchClarificationSuggestions(response)
        );
        return;
      }

      const nextDraft = createDraftFromPatch(response, draft);
      setDraft(nextDraft);
      setPreviewDiagram(getDiagramJsonForArchitectureDraft(nextDraft));
      finishRequest();
      appendAssistantMessage("draft", createPatchSummary(response));
    } catch (error) {
      if (isAbortedRequest(error)) return;
      failRequest(getApiErrorMessage(error, "수정 PREVIEW를 만들지 못했습니다."));
    }
  }

  async function approveDraft(): Promise<void> {
    if (projectDraft === null || draft === null || previewDiagram === null) {
      return;
    }

    beginRequest(false);

    try {
      let projectId = createdProjectId;

      if (projectId === null) {
        const project = await createProject({ name: projectDraft.projectName });
        projectId = project.id;
        setCreatedProjectId(project.id);
      }

      const approvedMessages = appendMessage(
        createAiStartMessage("assistant", "status", `${draft.title}을 Board에 적용했습니다.`)
      );
      await saveProjectDraft({ diagramJson: previewDiagram, projectId });
      storeApprovedAiStartMessages(projectId, approvedMessages);
      clearAiStartProjectDraft();
      router.push(
        `/workspace?${new URLSearchParams({
          projectId,
          projectName: projectDraft.projectName
        }).toString()}`
      );
    } catch (error) {
      failRequest(getApiErrorMessage(error, "승인한 Draft를 저장하지 못했습니다."));
    }
  }

  async function regenerateDraft(): Promise<void> {
    if (lastDraftRequest !== null) {
      await requestDraft(lastDraftRequest, true);
    }
  }

  // 현재 AI 요청만 중단하고 대화와 기존 PREVIEW는 그대로 유지합니다.
  function cancelRequest(): void {
    requestAbortControllerRef.current?.abort();
    requestAbortControllerRef.current = null;
    setRequestState("idle");
    appendAssistantMessage("status", "요청을 중단했습니다. 내용을 고쳐 다시 보낼 수 있습니다.");
  }

  // 마지막 Draft 요청을 그대로 다시 실행해 입력을 반복하지 않게 합니다.
  async function retryRequest(): Promise<void> {
    if (lastDraftRequest) await requestDraft(lastDraftRequest, previewDiagram !== null);
  }

  function cancelStart(): void {
    router.push("/workspace/new");
  }

  async function answerDraftFollowUp(
    answer: string,
    session: ArchitectureDraftFollowUpSession
  ): Promise<void> {
    const resolution = resolveArchitectureDraftFollowUpAnswer(session, answer);

    if (resolution.action === "show_pending_draft") {
      setDraftFollowUp(null);
      showDraft(session.pendingDraft);
      return;
    }

    if (resolution.action === "regenerate") {
      setDraftFollowUp(null);
      await requestDraft(resolution.request);
      return;
    }

    appendAssistantMessage("question", resolution.question, resolution.suggestions);
  }

  async function answerPatchClarification(
    answer: string,
    pending: PendingPatchClarification
  ): Promise<void> {
    const candidate = findPatchClarificationCandidate(pending.clarification, answer);
    const suggestion = findPatchClarificationSuggestion(pending.clarification, answer);

    if (candidate !== undefined) {
      setPatchClarification(null);
      const useAsConnection = pending.clarification.intent.requestedAction === "add_resource";
      await requestPatch(pending.clarification.intent.instruction, pending.baseDiagram, {
        ...(useAsConnection
          ? { connectionTargetResourceId: candidate.resourceId }
          : { selectedTargetResourceId: candidate.resourceId })
      });
      return;
    }

    if (suggestion !== undefined) {
      setPatchClarification(null);
      await requestPatch(pending.clarification.intent.instruction, pending.baseDiagram, {
        ...(suggestion === "연결하지 않기" ? { skipConnection: true } : {})
      });
      return;
    }

    appendAssistantMessage(
      "question",
      pending.clarification.question,
      getPatchClarificationSuggestions(pending.clarification)
    );
  }

  function showDraft(result: AiArchitectureDraftResult): void {
    setDraft(result);
    setPreviewDiagram(getDiagramJsonForArchitectureDraft(result));
    finishRequest();
    appendAssistantMessage("draft", `${result.title} PREVIEW가 준비됐습니다.`);
  }

  function beginRequest(clearPreview = true): AbortSignal {
    requestAbortControllerRef.current?.abort();
    const controller = new AbortController();
    requestAbortControllerRef.current = controller;
    setRequestState("loading");
    setErrorMessage("");
    setDraftClarification(null);
    setPatchClarification(null);
    setDraftFollowUp(null);
    if (clearPreview) {
      setDraft(null);
      setPreviewDiagram(null);
    }
    return controller.signal;
  }

  function finishRequest(): void {
    requestAbortControllerRef.current = null;
    setRequestState("idle");
  }

  function failRequest(message: string): void {
    requestAbortControllerRef.current = null;
    setRequestState("error");
    setErrorMessage(message);
    appendAssistantMessage("error", message);
  }

  function appendAssistantMessage(
    kind: AiStartMessage["kind"],
    content: string,
    suggestions: readonly string[] = []
  ): AiStartMessage[] {
    return appendMessage(createAiStartMessage("assistant", kind, content, suggestions));
  }

  function appendMessage(message: AiStartMessage): AiStartMessage[] {
    const nextMessages = trimAiStartMessages([...messagesRef.current, message]);
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    return nextMessages;
  }

  function replaceMessages(nextMessages: readonly AiStartMessage[]): void {
    const trimmedMessages = trimAiStartMessages(nextMessages);
    messagesRef.current = trimmedMessages;
    setMessages(trimmedMessages);
  }

  return {
    approveDraft,
    canApprove: draft !== null && previewDiagram !== null && requestState !== "loading",
    canSubmit:
      composerValue.trim().length > 0 &&
      requestState !== "loading" &&
      !voiceTranscriptNeedsConfirmation,
    cancelStart,
    cancelRequest,
    composerValue,
    confirmVoiceTranscript,
    draft,
    errorMessage,
    messages,
    previewDiagram,
    projectDraft,
    regenerateDraft,
    retryRequest,
    requestState,
    setComposerValue: updateComposerValue,
    submitPrompt,
    voiceInput,
    voiceTranscriptNeedsConfirmation
  };
}

// AbortController가 취소한 요청은 실패 메시지 대신 중단 상태로 처리합니다.
function isAbortedRequest(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
