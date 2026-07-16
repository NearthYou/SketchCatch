"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  createAiArchitectureDraft,
  createAiArchitectureDraftStream,
  createAiArchitecturePatchPreview,
  createProject,
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
import {
  acceptProgressSnapshot,
  applyProgressCandidateExclusions,
  computeDraftProgressDifference,
  createDraftProgressHistory,
  createProgressDiagram,
  excludeProgressCandidate as projectProgressCandidateExclusion,
  preserveDraftProgressProjection,
  undoProgressCandidate as restoreProgressCandidate,
  type DraftProgressDifference,
  type DraftProgressHistoryEntry
} from "./ai-draft-progress-model";

type PendingDraftClarification = {
  readonly clarification: ArchitectureDraftClarification;
  readonly prompt: string;
};

type PendingPatchClarification = {
  readonly baseDiagram: DiagramJson;
  readonly clarification: ArchitecturePatchClarification;
};

type RequestState = "idle" | "loading" | "error";
type ProgressStatus = "idle" | "streaming" | "awaiting_input" | "interrupted";
type MobilePane = "conversation" | "progress";

type LastProgressExclusion = {
  readonly exclusion: ArchitectureDraftCandidateExclusion;
};

type PatchTargetOptions = {
  readonly connectionTargetResourceId?: string | undefined;
  readonly selectedTargetResourceId?: string | undefined;
  readonly skipConnection?: boolean | undefined;
};

export function useAiStartWorkflow({
  existingProject
}: {
  readonly existingProject?: AiStartExistingProject | undefined;
} = {}) {
  const router = useRouter();
  const existingProjectId = existingProject?.projectId;
  const existingProjectName = existingProject?.projectName;
  const existingProjectReturnHref = existingProject?.returnHref;
  const [projectDraft, setProjectDraft] = useState<AiStartProjectDraft | null>(null);
  const [composerValue, setComposerValue] = useState("");
  const [messages, setMessages] = useState<AiStartMessage[]>([]);
  const messagesRef = useRef<AiStartMessage[]>([]);
  const activeDraftRequestRef = useRef<AbortController | null>(null);
  const requestIdentityRef = useRef(0);
  const rawProgressSnapshotRef = useRef<ArchitectureDraftProgressSnapshot | null>(null);
  const progressSnapshotRef = useRef<ArchitectureDraftProgressSnapshot | null>(null);
  const candidateExclusionsRef = useRef<readonly ArchitectureDraftCandidateExclusion[]>([]);
  const lastDraftRequestRef = useRef<CreateArchitectureDraftRequest | null>(null);
  const lastExclusionRef = useRef<LastProgressExclusion | null>(null);
  const mobilePaneSelectionRef = useRef(false);
  const [draft, setDraft] = useState<AiArchitectureDraftResult | null>(null);
  const [compilationProposal, setCompilationProposal] =
    useState<ArchitectureBoardCompilationProposal | null>(null);
  const [previewDiagram, setPreviewDiagram] = useState<DiagramJson | null>(null);
  const [draftClarification, setDraftClarification] =
    useState<PendingDraftClarification | null>(null);
  const [patchClarification, setPatchClarification] =
    useState<PendingPatchClarification | null>(null);
  const [draftFollowUp, setDraftFollowUp] = useState<ArchitectureDraftFollowUpSession | null>(null);
  const [lastDraftRequest, setLastDraftRequest] = useState<CreateArchitectureDraftRequest | null>(
    null
  );
  const [progressSnapshot, setProgressSnapshot] =
    useState<ArchitectureDraftProgressSnapshot | null>(null);
  const [progressStatus, setProgressStatus] = useState<ProgressStatus>("idle");
  const [progressHistory, setProgressHistory] = useState<DraftProgressHistoryEntry[]>([]);
  const [lastExclusion, setLastExclusion] =
    useState<ArchitectureDraftCandidateExclusion | null>(null);
  const [finalProgressDifference, setFinalProgressDifference] =
    useState<DraftProgressDifference | null>(null);
  const [mobilePane, setMobilePaneState] = useState<MobilePane>("conversation");
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [voiceTranscriptNeedsConfirmation, setVoiceTranscriptNeedsConfirmation] = useState(false);
  const voiceInput = useBrowserVoiceInput({
    onChange: handleVoiceTranscriptChange,
    value: composerValue
  });

  useEffect(() => {
    const storedDraft = existingProjectId && existingProjectName
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
      requestIdentityRef.current += 1;
      activeDraftRequestRef.current?.abort();
      activeDraftRequestRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (finalProgressDifference === null) {
      return;
    }

    const timeoutId = window.setTimeout(() => setFinalProgressDifference(null), 4_000);
    return () => window.clearTimeout(timeoutId);
  }, [finalProgressDifference]);

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

  async function requestDraft(request: CreateArchitectureDraftRequest): Promise<void> {
    beginRequest();
    setFinalProgressDifference(null);

    if (existingProjectId !== undefined) {
      abortActiveDraftRequest();
      rememberDraftRequest(request);

      try {
        const response = await createAiArchitectureDraft(request);
        handleDraftResponse(request, response);
      } catch (error) {
        failRequest(getApiErrorMessage(error, "Architecture Draft를 만들지 못했습니다."));
      }
      return;
    }

    const streamRequest = withCurrentCandidateExclusions(request);
    rememberDraftRequest(streamRequest);
    candidateExclusionsRef.current = streamRequest.candidateExclusions ?? [];
    abortActiveDraftRequest();
    const requestIdentity = ++requestIdentityRef.current;
    const controller = new AbortController();
    activeDraftRequestRef.current = controller;
    rawProgressSnapshotRef.current = null;
    if (progressSnapshotRef.current === null) {
      setProgressHistory([]);
    }
    setProgressStatus("streaming");

    try {
      const response = await createAiArchitectureDraftStream(streamRequest, {
        signal: controller.signal,
        onProgress: (snapshot) => {
          if (isInactiveDraftRequest(requestIdentity, controller)) {
            return;
          }

          const acceptedSnapshot = acceptProgressSnapshot(
            rawProgressSnapshotRef.current,
            snapshot
          );
          if (acceptedSnapshot === rawProgressSnapshotRef.current) {
            return;
          }

          rawProgressSnapshotRef.current = acceptedSnapshot;
          const projectedSnapshot = applyProgressCandidateExclusions(
            acceptedSnapshot,
            candidateExclusionsRef.current
          );
          const visibleSnapshot = preserveDraftProgressProjection(
            progressSnapshotRef.current,
            projectedSnapshot
          );
          const shouldRevealProgress =
            progressSnapshotRef.current === null && !mobilePaneSelectionRef.current;
          updateVisibleProgress(visibleSnapshot);
          setProgressStatus("streaming");
          if (shouldRevealProgress) {
            setMobilePaneState("progress");
          }
        }
      });

      if (isInactiveDraftRequest(requestIdentity, controller)) {
        return;
      }

      activeDraftRequestRef.current = null;
      handleDraftResponse(streamRequest, response);
    } catch (error) {
      if (requestIdentity !== requestIdentityRef.current) {
        return;
      }

      if (activeDraftRequestRef.current === controller) {
        activeDraftRequestRef.current = null;
      }

      if (controller.signal.aborted) {
        setProgressStatus("interrupted");
        finishRequest();
        return;
      }

      setProgressStatus("interrupted");
      failRequest(getApiErrorMessage(error, "Architecture Draft를 만들지 못했습니다."));
    }
  }

  function handleDraftResponse(
    request: CreateArchitectureDraftRequest,
    response: CreateArchitectureDraftResponse
  ): void {
    if (isArchitectureDraftClarification(response)) {
      setDraftClarification({ clarification: response, prompt: request.prompt });
      setProgressStatus("awaiting_input");
      finishRequest();
      appendAssistantMessage("question", response.question, response.suggestions);
      return;
    }

    const decision = planArchitectureDraftPreview(request, response);
    if (decision.action === "ask_follow_up") {
      setDraftFollowUp(decision.session);
      setProgressStatus("awaiting_input");
      finishRequest();
      appendAssistantMessage("question", decision.session.question, decision.session.suggestions);
      return;
    }

    showDraft(decision.result);
  }

  function withCurrentCandidateExclusions(
    request: CreateArchitectureDraftRequest
  ): CreateArchitectureDraftRequest {
    if (
      request.candidateExclusions !== undefined ||
      candidateExclusionsRef.current.length === 0
    ) {
      return request;
    }

    return {
      ...request,
      candidateExclusions: candidateExclusionsRef.current
    };
  }

  function rememberDraftRequest(request: CreateArchitectureDraftRequest): void {
    lastDraftRequestRef.current = request;
    setLastDraftRequest(request);
  }

  function isInactiveDraftRequest(
    requestIdentity: number,
    controller: AbortController
  ): boolean {
    return (
      requestIdentity !== requestIdentityRef.current ||
      activeDraftRequestRef.current !== controller ||
      controller.signal.aborted
    );
  }

  function abortActiveDraftRequest(markInterrupted = false): void {
    const controller = activeDraftRequestRef.current;
    if (controller === null) {
      return;
    }

    requestIdentityRef.current += 1;
    activeDraftRequestRef.current = null;
    controller.abort();
    if (markInterrupted) {
      setProgressStatus("interrupted");
    }
  }

  function updateVisibleProgress(snapshot: ArchitectureDraftProgressSnapshot): void {
    const history = createDraftProgressHistory(progressSnapshotRef.current, snapshot);
    if (history.length > 0) {
      setProgressHistory((current) => [...current, ...history].slice(-8));
    }
    progressSnapshotRef.current = snapshot;
    setProgressSnapshot(snapshot);
  }

  function excludeCandidateFromProgress(candidateId: string): void {
    const visibleSnapshot = progressSnapshotRef.current;
    const serverSnapshot = rawProgressSnapshotRef.current;
    const request = lastDraftRequestRef.current;
    if (
      visibleSnapshot === null ||
      serverSnapshot === null ||
      request === null ||
      !visibleSnapshot.excludableCandidateIds.includes(candidateId)
    ) {
      return;
    }

    const candidate = serverSnapshot.provisionalArchitectureJson?.nodes.find(
      (node) => node.id === candidateId
    );
    if (candidate === undefined) {
      return;
    }

    const exclusion: ArchitectureDraftCandidateExclusion = {
      candidateId,
      resourceType: candidate.type,
      label: candidate.label?.trim() || candidate.type
    };
    const nextExclusions = [...candidateExclusionsRef.current, exclusion];
    lastExclusionRef.current = { exclusion };
    setLastExclusion(exclusion);
    candidateExclusionsRef.current = nextExclusions;
    updateVisibleProgress(projectProgressCandidateExclusion(visibleSnapshot, exclusion));
    abortActiveDraftRequest();
    void requestDraft({ ...request, candidateExclusions: nextExclusions });
  }

  function undoLastExclusion(): void {
    const undo = lastExclusionRef.current;
    const currentRequest = lastDraftRequestRef.current;
    const currentServerSnapshot = rawProgressSnapshotRef.current;
    if (undo === null || currentRequest === null) {
      return;
    }

    const remainingExclusions = candidateExclusionsRef.current.filter(
      (candidate) =>
        candidate.candidateId !== undo.exclusion.candidateId ||
        candidate.resourceType !== undo.exclusion.resourceType
    );
    candidateExclusionsRef.current = remainingExclusions;
    if (currentServerSnapshot !== null) {
      updateVisibleProgress(
        preserveDraftProgressProjection(
          progressSnapshotRef.current,
          restoreProgressCandidate(currentServerSnapshot, remainingExclusions)
        )
      );
    }
    lastExclusionRef.current = null;
    setLastExclusion(null);
    abortActiveDraftRequest();
    void requestDraft({ ...currentRequest, candidateExclusions: remainingExclusions });
  }

  async function retryDraft(): Promise<void> {
    if (lastDraftRequestRef.current !== null) {
      await requestDraft(lastDraftRequestRef.current);
    }
  }

  function selectMobilePane(pane: MobilePane): void {
    mobilePaneSelectionRef.current = true;
    setMobilePaneState(pane);
  }

  async function requestPatch(
    instruction: string,
    baseDiagram: DiagramJson,
    options: PatchTargetOptions = {}
  ): Promise<void> {
    beginRequest(false);

    try {
      const response = await createAiArchitecturePatchPreview({
        architectureJson: convertDiagramJsonToArchitectureJson(baseDiagram),
        instruction,
        ...options
      });

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
      failRequest(getApiErrorMessage(error, "수정 PREVIEW를 만들지 못했습니다."));
    }
  }

  async function approveDraft(): Promise<void> {
    if (projectDraft === null || draft === null || compilationProposal === null) {
      return;
    }

    beginRequest(false);

    try {
      let projectId = existingProjectId ?? createdProjectId;

      if (projectId === null) {
        const project = await createProject({ name: projectDraft.projectName });
        projectId = project.id;
        setCreatedProjectId(project.id);
      }

      const approvedMessages = appendMessage(
        createAiStartMessage("assistant", "status", `${draft.title}을 Board에 적용했습니다.`)
      );
      await saveProjectDraft({ diagramJson: compilationProposal.diagram, projectId });
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
      failRequest(getApiErrorMessage(error, "승인한 Draft를 저장하지 못했습니다."));
    }
  }

  async function regenerateDraft(): Promise<void> {
    if (lastDraftRequest !== null) {
      await requestDraft(lastDraftRequest);
    }
  }

  function cancelDraftProgress(): void {
    if (existingProjectId !== undefined || activeDraftRequestRef.current === null) {
      return;
    }

    abortActiveDraftRequest(true);
    finishRequest();
  }

  function cancelStart(): void {
    abortActiveDraftRequest(true);
    router.push(existingProjectReturnHref ?? "/workspace/new");
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

  function showDraft(
    result: AiArchitectureDraftResult,
    currentDiagram?: DiagramJson,
    message = `${result.title} PREVIEW가 준비됐습니다.`
  ): void {
    const currentProgress = progressSnapshotRef.current;
    const difference =
      currentProgress === null
        ? null
        : computeDraftProgressDifference(currentProgress, result.architectureJson);
    const proposal = compileArchitectureDraftProposal(result, currentDiagram);

    setFinalProgressDifference(difference);
    setDraft(result);
    setCompilationProposal(proposal);
    setPreviewDiagram(proposal.diagram);
    setProgressSnapshot(null);
    progressSnapshotRef.current = null;
    rawProgressSnapshotRef.current = null;
    setProgressStatus("idle");
    lastExclusionRef.current = null;
    setLastExclusion(null);
    setMobilePaneState("progress");
    finishRequest();
    appendAssistantMessage("draft", message);
  }

  function beginRequest(clearPreview = true): void {
    setRequestState("loading");
    setErrorMessage("");
    setFinalProgressDifference(null);
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

  const progressDiagram = useMemo(
    () => createProgressDiagram(progressSnapshot),
    [progressSnapshot]
  );

  return {
    approveDraft,
    canApprove:
      draft !== null && compilationProposal !== null && previewDiagram !== null && requestState !== "loading",
    canSubmit:
      composerValue.trim().length > 0 &&
      requestState !== "loading" &&
      !voiceTranscriptNeedsConfirmation,
    cancelDraftProgress,
    cancelStart,
    composerValue,
    compilationProposal,
    confirmVoiceTranscript,
    draft,
    errorMessage,
    excludeProgressCandidate: excludeCandidateFromProgress,
    finalProgressDifference,
    lastExclusion,
    mobilePane,
    messages,
    previewDiagram,
    progressDiagram,
    progressHistory,
    progressSnapshot,
    progressStatus,
    projectDraft,
    regenerateDraft,
    requestState,
    retryDraft,
    setComposerValue: updateComposerValue,
    setMobilePane: selectMobilePane,
    submitPrompt,
    undoLastExclusion,
    voiceInput,
    voiceTranscriptNeedsConfirmation
  };
}
