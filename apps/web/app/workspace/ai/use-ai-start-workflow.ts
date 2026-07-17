"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type {
  AiArchitectureDraftResult,
  ArchitectureDraftCandidateExclusion,
  ArchitectureDraftClarification,
  ArchitectureDraftProgressSnapshot,
  ArchitecturePatchClarification,
  CreateArchitectureDraftRequest,
  CreateArchitectureDraftResponse,
  DiagramJson
} from "@sketchcatch/types";
import { getApiErrorMessage } from "../../../lib/api-client";
import { useAuth } from "../../../components/auth/auth-provider";
import { invalidateProjectQueries } from "../../../components/query/dashboard-query-invalidation";
import {
  createAiArchitectureDraft,
  createAiArchitectureDraftStream,
  createAiArchitecturePatchPreview,
  createProject,
  getProjectDraft,
  saveProjectDraft
} from "../../../features/workspace/api";
import { useBrowserVoiceInput } from "../../../features/workspace/use-browser-voice-input";
import { compileArchitectureDraftProposal } from "../../../features/architecture-board-compiler";
import type { ArchitectureBoardCompilationProposal } from "../../../features/architecture-board-compiler";
import { convertDiagramJsonToArchitectureJson } from "../../../features/workspace/workspace-ai-diagram-adapter";
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
  isWorkspaceAiChatAbortError,
  WorkspaceAiChatRequestRegistry
} from "../../../features/workspace/workspace-ai-chat-request";
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
  type AiStartExistingProject,
  type AiStartMessage,
  type AiStartProjectDraft
} from "./ai-start-model";
import { type DraftProgressState, type DraftProgressStatus } from "./ai-draft-progress-model";
import { AiDraftProgressCoordinator } from "./ai-draft-progress-coordinator";
import { getAiStartDraftTransport } from "./ai-start-request-policy";

type PendingDraftClarification = {
  readonly clarification: ArchitectureDraftClarification;
  readonly prompt: string;
};

type PendingPatchClarification = {
  readonly baseDiagram: DiagramJson;
  readonly clarification: ArchitecturePatchClarification;
};

type RequestState = "idle" | "loading" | "error" | "cancelled";
type ApprovalState = "idle" | "loading" | "error";

type PatchTargetOptions = {
  readonly connectionTargetResourceId?: string | undefined;
  readonly selectedTargetResourceId?: string | undefined;
  readonly skipConnection?: boolean | undefined;
};

type RetryablePatchRequest = {
  readonly baseDiagram: DiagramJson;
  readonly instruction: string;
  readonly options: PatchTargetOptions;
};

export function useAiStartWorkflow({
  existingProject
}: {
  readonly existingProject?: AiStartExistingProject | undefined;
} = {}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const existingProjectId = existingProject?.projectId;
  const existingProjectName = existingProject?.projectName;
  const existingProjectReturnHref = existingProject?.returnHref;
  const [projectDraft, setProjectDraft] = useState<AiStartProjectDraft | null>(null);
  const [composerValue, setComposerValue] = useState("");
  const [messages, setMessages] = useState<AiStartMessage[]>([]);
  const messagesRef = useRef<AiStartMessage[]>([]);
  const draftProgressCoordinatorRef = useRef(new AiDraftProgressCoordinator());
  const requestRegistryRef = useRef(new WorkspaceAiChatRequestRegistry());
  const lastPatchRequestRef = useRef<RetryablePatchRequest | null>(null);
  const approvalRequestRef = useRef(false);
  const [draft, setDraft] = useState<AiArchitectureDraftResult | null>(null);
  const [compilationProposal, setCompilationProposal] =
    useState<ArchitectureBoardCompilationProposal | null>(null);
  const [previewDiagram, setPreviewDiagram] = useState<DiagramJson | null>(null);
  const [draftClarification, setDraftClarification] = useState<PendingDraftClarification | null>(
    null
  );
  const [patchClarification, setPatchClarification] = useState<PendingPatchClarification | null>(
    null
  );
  const [draftFollowUp, setDraftFollowUp] = useState<ArchitectureDraftFollowUpSession | null>(null);
  const [lastDraftRequest, setLastDraftRequest] = useState<CreateArchitectureDraftRequest | null>(
    null
  );
  const [progressSnapshot, setProgressSnapshot] =
    useState<ArchitectureDraftProgressSnapshot | null>(null);
  const [progressStatus, setProgressStatus] = useState<DraftProgressStatus>("idle");
  const [lastExclusion, setLastExclusion] = useState<ArchitectureDraftCandidateExclusion | null>(
    null
  );
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [existingProjectDraftRevision, setExistingProjectDraftRevision] = useState<
    number | null | undefined
  >(existingProjectId ? undefined : null);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [approvalState, setApprovalState] = useState<ApprovalState>("idle");
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [voiceTranscriptNeedsConfirmation, setVoiceTranscriptNeedsConfirmation] = useState(false);
  const voiceInput = useBrowserVoiceInput({
    onChange: handleVoiceTranscriptChange,
    value: composerValue
  });

  useEffect(() => {
    const storedDraft =
      existingProjectId && existingProjectName
        ? {
            projectName: existingProjectName,
            startMode: "ai" as const,
            updatedAt: new Date().toISOString()
          }
        : readAiStartProjectDraft();

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
  }, [existingProjectId, existingProjectName, router]);

  useEffect(() => {
    return () => {
      draftProgressCoordinatorRef.current.dispose();
      requestRegistryRef.current.cancelAll();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!existingProjectId) {
      setExistingProjectDraftRevision(null);
      return;
    }

    setExistingProjectDraftRevision(undefined);
    void getProjectDraft(existingProjectId)
      .then((response) => {
        if (!cancelled) {
          setExistingProjectDraftRevision(response.draft?.revision ?? null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          failRequest(
            getApiErrorMessage(error, "현재 프로젝트의 최신 Draft 상태를 불러오지 못했습니다.")
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [existingProjectId]);

  async function submitPrompt(value = composerValue): Promise<void> {
    const prompt = value.trim();

    if (
      prompt.length === 0 ||
      requestState === "loading" ||
      approvalRequestRef.current ||
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
      const nextPrompt = `${draftClarification.prompt}\n\n${draftClarification.clarification.question}: ${prompt}`;
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

  async function requestDraft(request: CreateArchitectureDraftRequest): Promise<void> {
    beginRequest();

    if (getAiStartDraftTransport(existingProjectId) === "json") {
      abortActiveDraftRequest();
      rememberDraftRequest(request);
      const controller = requestRegistryRef.current.begin("draft");

      try {
        const response = await createAiArchitectureDraft(request, { signal: controller.signal });
        if (!requestRegistryRef.current.isActive("draft", controller)) {
          return;
        }
        handleDraftResponse(request, response);
      } catch (error) {
        if (
          isWorkspaceAiChatAbortError(error) ||
          !requestRegistryRef.current.isActive("draft", controller)
        ) {
          return;
        }
        failRequest(getApiErrorMessage(error, "Architecture Draft를 만들지 못했습니다."));
      } finally {
        requestRegistryRef.current.complete("draft", controller);
      }
      return;
    }

    requestRegistryRef.current.cancel("draft");
    const progressRequest = draftProgressCoordinatorRef.current.begin(request);
    rememberDraftRequest(progressRequest.request);
    publishDraftProgressState(draftProgressCoordinatorRef.current.state);

    try {
      const response = await createAiArchitectureDraftStream(progressRequest.request, {
        signal: progressRequest.signal,
        onProgress: (snapshot) => {
          const nextProgress = draftProgressCoordinatorRef.current.receive(
            progressRequest,
            snapshot
          );
          if (nextProgress === null) {
            return;
          }

          publishDraftProgressState(nextProgress);
        }
      });

      if (!draftProgressCoordinatorRef.current.isActive(progressRequest)) {
        return;
      }

      handleDraftResponse(progressRequest.request, response);
      draftProgressCoordinatorRef.current.complete(progressRequest);
    } catch (error) {
      const interrupted = draftProgressCoordinatorRef.current.interrupt(progressRequest);
      if (interrupted === null) {
        return;
      }

      publishDraftProgressState(interrupted);
      failRequest(getApiErrorMessage(error, "Architecture Draft를 만들지 못했습니다."));
    }
  }

  function handleDraftResponse(
    request: CreateArchitectureDraftRequest,
    response: CreateArchitectureDraftResponse
  ): void {
    if (isArchitectureDraftClarification(response)) {
      setDraftClarification({ clarification: response, prompt: request.prompt });
      publishDraftProgressState(draftProgressCoordinatorRef.current.awaitInput());
      finishRequest();
      appendAssistantMessage("question", response.question, response.suggestions);
      return;
    }

    const decision = planArchitectureDraftPreview(request, response);
    if (decision.action === "ask_follow_up") {
      setDraftFollowUp(decision.session);
      publishDraftProgressState(draftProgressCoordinatorRef.current.awaitInput());
      finishRequest();
      appendAssistantMessage("question", decision.session.question, decision.session.suggestions);
      return;
    }

    showDraft(decision.result);
  }

  function rememberDraftRequest(request: CreateArchitectureDraftRequest): void {
    setLastDraftRequest(request);
    lastPatchRequestRef.current = null;
  }

  function abortActiveDraftRequest(markInterrupted = false): void {
    const hadActiveRequest = draftProgressCoordinatorRef.current.hasActiveRequest;
    const state = draftProgressCoordinatorRef.current.cancel(markInterrupted);
    if (hadActiveRequest && markInterrupted) {
      publishDraftProgressState(state);
    }
  }

  function publishDraftProgressState(nextState: DraftProgressState): void {
    setProgressSnapshot(nextState.visibleSnapshot);
    setProgressStatus(nextState.status);
  }

  function excludeCandidateFromProgress(candidateId: string): void {
    if (approvalRequestRef.current) return;

    const restart = draftProgressCoordinatorRef.current.exclude(candidateId);
    if (restart === null) {
      return;
    }

    setLastExclusion(restart.exclusion);
    publishDraftProgressState(restart.state);
    void requestDraft(restart.request);
  }

  function undoLastExclusion(): void {
    if (approvalRequestRef.current) return;

    const restart = draftProgressCoordinatorRef.current.undoLastExclusion();
    if (restart === null) {
      return;
    }

    setLastExclusion(null);
    publishDraftProgressState(restart.state);
    void requestDraft(restart.request);
  }

  async function retryDraft(): Promise<void> {
    if (approvalRequestRef.current) return;

    const patchRequest = lastPatchRequestRef.current;
    if (patchRequest !== null) {
      await requestPatch(patchRequest.instruction, patchRequest.baseDiagram, patchRequest.options);
      return;
    }

    const retryRequest = draftProgressCoordinatorRef.current.retryRequest() ?? lastDraftRequest;
    if (retryRequest !== null) {
      await requestDraft(retryRequest);
    }
  }

  async function requestPatch(
    instruction: string,
    baseDiagram: DiagramJson,
    options: PatchTargetOptions = {}
  ): Promise<void> {
    beginRequest(false);
    abortActiveDraftRequest();
    lastPatchRequestRef.current = { baseDiagram, instruction, options };
    const controller = requestRegistryRef.current.begin("draft");

    try {
      const response = await createAiArchitecturePatchPreview(
        {
          architectureJson: convertDiagramJsonToArchitectureJson(baseDiagram),
          instruction,
          ...options
        },
        { signal: controller.signal }
      );

      if (!requestRegistryRef.current.isActive("draft", controller)) {
        return;
      }

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
      showDraft(nextDraft, baseDiagram, createPatchSummary(response));
    } catch (error) {
      if (
        isWorkspaceAiChatAbortError(error) ||
        !requestRegistryRef.current.isActive("draft", controller)
      ) {
        return;
      }
      failRequest(getApiErrorMessage(error, "수정 PREVIEW를 만들지 못했습니다."));
    } finally {
      requestRegistryRef.current.complete("draft", controller);
    }
  }

  async function approveDraft(): Promise<void> {
    if (
      projectDraft === null ||
      draft === null ||
      compilationProposal === null ||
      approvalRequestRef.current
    ) {
      return;
    }

    if (existingProjectId && existingProjectDraftRevision === undefined) {
      failRequest(
        "현재 프로젝트의 최신 Draft 상태를 확인하는 중입니다. 잠시 후 다시 시도해주세요."
      );
      return;
    }

    approvalRequestRef.current = true;
    setApprovalState("loading");
    setApprovalError(null);

    try {
      let projectId = existingProjectId ?? createdProjectId;

      if (projectId === null) {
        const project = await createProject({ name: projectDraft.projectName });
        projectId = project.id;
        setCreatedProjectId(project.id);
        await invalidateProjectQueries(queryClient, user?.id);
      }

      await saveProjectDraft({
        diagramJson: compilationProposal.diagram,
        expectedRevision: existingProjectId ? (existingProjectDraftRevision ?? null) : null,
        projectId
      });
      const approvedMessages = appendMessage(
        createAiStartMessage("assistant", "status", `${draft.title}을 Board에 적용했습니다.`)
      );
      storeApprovedAiStartMessages(projectId, approvedMessages);
      if (!existingProjectId) {
        clearAiStartProjectDraft();
      }
      router.push(
        `/workspace?${new URLSearchParams({
          projectId,
          projectName: projectDraft.projectName
        }).toString()}`
      );
    } catch (error) {
      setApprovalState("error");
      setApprovalError(getApiErrorMessage(error, "Board에 적용하지 못했습니다."));
    } finally {
      approvalRequestRef.current = false;
    }
  }

  async function regenerateDraft(): Promise<void> {
    if (approvalRequestRef.current) return;

    if (lastDraftRequest !== null) {
      await requestDraft(lastDraftRequest);
    }
  }

  function cancelDraftProgress(): void {
    if (existingProjectId !== undefined || !draftProgressCoordinatorRef.current.hasActiveRequest) {
      return;
    }

    abortActiveDraftRequest(true);
    finishRequest();
  }

  function cancelRequest(): void {
    const hadProgressRequest = draftProgressCoordinatorRef.current.hasActiveRequest;
    const progressState = draftProgressCoordinatorRef.current.cancel(hadProgressRequest);
    const hadJsonRequest = requestRegistryRef.current.cancel("draft");

    if (!hadProgressRequest && !hadJsonRequest) {
      return;
    }

    if (hadProgressRequest) {
      publishDraftProgressState(progressState);
    }
    setRequestState("cancelled");
  }

  function cancelStart(): void {
    if (approvalRequestRef.current) return;

    abortActiveDraftRequest(true);
    requestRegistryRef.current.cancelAll();
    router.push(existingProjectReturnHref ?? "/workspace/new");
  }

  async function answerDraftFollowUp(
    answer: string,
    session: ArchitectureDraftFollowUpSession
  ): Promise<void> {
    const resolution = resolveArchitectureDraftFollowUpAnswer(session, answer);

    if (resolution.action === "show_pending_draft") {
      setDraftFollowUp(null);
      try {
        showDraft(session.pendingDraft);
      } catch (error) {
        publishDraftProgressState(draftProgressCoordinatorRef.current.markInterrupted());
        failRequest(getApiErrorMessage(error, "Architecture Draft를 만들지 못했습니다."));
      }
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

  function showDraft(
    result: AiArchitectureDraftResult,
    currentDiagram?: DiagramJson,
    message = `${result.title} PREVIEW가 준비됐습니다.`
  ): void {
    const completedProgress = draftProgressCoordinatorRef.current.finalize(() =>
      compileArchitectureDraftProposal(result, currentDiagram)
    );
    const proposal = completedProgress.value;

    setDraft(result);
    setCompilationProposal(proposal);
    setPreviewDiagram(proposal.diagram);
    publishDraftProgressState(completedProgress.state);
    setLastExclusion(null);
    finishRequest();
    appendAssistantMessage("draft", message);
  }

  function beginRequest(clearPreview = true): void {
    setRequestState("loading");
    setApprovalState("idle");
    setApprovalError(null);
    setDraftClarification(null);
    setPatchClarification(null);
    setDraftFollowUp(null);
    if (clearPreview) {
      setDraft(null);
      setCompilationProposal(null);
      setPreviewDiagram(null);
    }
  }

  function finishRequest(): void {
    setRequestState("idle");
  }

  function failRequest(message: string): void {
    setRequestState("error");
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
    approvalError,
    approvalState,
    approveDraft,
    canApprove:
      draft !== null &&
      compilationProposal !== null &&
      previewDiagram !== null &&
      requestState !== "loading" &&
      approvalState !== "loading",
    canSubmit:
      composerValue.trim().length > 0 &&
      requestState !== "loading" &&
      approvalState !== "loading" &&
      !voiceTranscriptNeedsConfirmation,
    cancelDraftProgress,
    cancelRequest,
    cancelStart,
    composerValue,
    compilationProposal,
    confirmVoiceTranscript,
    draft,
    excludeProgressCandidate: excludeCandidateFromProgress,
    lastExclusion,
    messages,
    previewDiagram,
    progressSnapshot,
    progressStatus,
    projectDraft,
    regenerateDraft,
    requestState,
    retryDraft,
    setComposerValue: updateComposerValue,
    submitPrompt,
    undoLastExclusion,
    voiceInput,
    voiceTranscriptNeedsConfirmation
  };
}
