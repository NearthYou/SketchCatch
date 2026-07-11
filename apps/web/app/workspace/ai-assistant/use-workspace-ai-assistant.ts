"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ArchitecturePatchClarification, DiagramJson } from "@sketchcatch/types";
import type { DiagramEditorPanelContext } from "../../../features/diagram-editor";
import {
  createAiArchitectureDraft,
  createAiArchitecturePatchPreview,
  runAiDesignSimulation,
  runAiTerraformErrorExplanation,
  runAiTerraformPreviewExplanation
} from "../../../features/workspace/api";
import { useBrowserVoiceInput } from "../../../features/workspace/use-browser-voice-input";
import {
  convertDiagramJsonToArchitectureJson,
  getDiagramJsonForArchitectureDraft
} from "../../../features/workspace/workspace-ai-diagram-adapter";
import { createWorkspaceAiChatStorageKey } from "../../../features/workspace/workspace-ai-chat-history";
import {
  classifyWorkspaceAiChatPrompt,
  createWorkspaceAiPromptGateMessage,
  resolveWorkspaceAiChatMode
} from "../../../features/workspace/workspace-ai-chat-routing";
import { createWorkspaceAiPatchPreviewModel } from "../../../features/workspace/workspace-ai-patch-preview";
import type { WorkspaceTerraformState } from "../operations/use-workspace-terraform";
import {
  isArchitectureDraftClarification,
  isArchitecturePatchClarification,
  findPatchClarificationCandidate,
  findPatchClarificationSuggestion
} from "../ai/ai-start-model";

export type WorkspaceAssistantMessage = {
  readonly content: string;
  readonly id: string;
  readonly role: "assistant" | "user";
  readonly state: "completed" | "error" | "preview" | "question";
  readonly suggestions?: readonly string[] | undefined;
};

type PendingBoardPreview = {
  readonly diagram: DiagramJson;
  readonly summary: string;
};

type PendingTerraformFix = {
  readonly code: string;
  readonly currentCode: string;
  readonly summary: string;
};

export type WorkspaceAssistantRequestState = "idle" | "sending" | "generating";

export type WorkspaceAiAssistantState = {
  readonly errorMessage: string;
  readonly input: string;
  readonly messages: readonly WorkspaceAssistantMessage[];
  readonly pendingBoardPreview: PendingBoardPreview | null;
  readonly pendingTerraformFix: PendingTerraformFix | null;
  readonly requestState: WorkspaceAssistantRequestState;
  readonly voice: ReturnType<typeof useBrowserVoiceInput>;
  readonly applyBoardPreview: () => void;
  readonly applyTerraformFix: () => void;
  readonly answerSuggestion: (suggestion: string) => Promise<void>;
  readonly cancelPreview: () => void;
  readonly cancelRequest: () => void;
  readonly explainTerraform: () => Promise<void>;
  readonly runSimulation: () => Promise<void>;
  readonly send: (overridePrompt?: string) => Promise<void>;
  readonly setInput: (input: string) => void;
};

// 현재 Architecture Board와 Terraform 문맥을 보존하며 AI 대화와 승인 대기 상태를 관리합니다.
export function useWorkspaceAiAssistant({
  context,
  projectId,
  terraform
}: {
  readonly context: DiagramEditorPanelContext;
  readonly projectId: string;
  readonly terraform: WorkspaceTerraformState;
}): WorkspaceAiAssistantState {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<readonly WorkspaceAssistantMessage[]>([]);
  const [requestState, setRequestState] = useState<WorkspaceAssistantRequestState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [pendingBoardPreview, setPendingBoardPreview] = useState<PendingBoardPreview | null>(null);
  const [pendingTerraformFix, setPendingTerraformFix] = useState<PendingTerraformFix | null>(null);
  const [pendingPatchClarification, setPendingPatchClarification] = useState<{
    readonly baseDiagram: DiagramJson;
    readonly clarification: ArchitecturePatchClarification;
  } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const storageKey = useMemo(() => createWorkspaceAiChatStorageKey(projectId), [projectId]);
  const voice = useBrowserVoiceInput({ onChange: setInput, value: input });

  // 프로젝트별로 저장한 대화를 처음 열 때 복원합니다.
  useEffect(() => {
    setMessages(readStoredMessages(storageKey));
  }, [storageKey]);

  // 새 메시지가 생길 때만 현재 프로젝트의 대화를 저장합니다.
  useEffect(() => {
    if (messages.length === 0) return;
    window.localStorage.setItem(storageKey, JSON.stringify(messages.slice(-80)));
  }, [messages, storageKey]);

  // 한 메시지 추가 규칙을 모아 상태별 화면이 같은 형식을 사용하게 합니다.
  const appendMessage = useCallback((message: Omit<WorkspaceAssistantMessage, "id">): void => {
    setMessages((current) => [...current, { ...message, id: crypto.randomUUID() }].slice(-80));
  }, []);

  // 자연어 요청을 새 Architecture 또는 현재 Board 수정 미리보기로 보냅니다.
  const send = useCallback(async (overridePrompt?: string): Promise<void> => {
    const prompt = (overridePrompt ?? input).trim();
    if (!prompt || requestState !== "idle") return;

    const classification = classifyWorkspaceAiChatPrompt(prompt);
    setInput("");
    appendMessage({ content: prompt, role: "user", state: "completed" });
    if (classification !== "architecture") {
      appendMessage({
        content: createWorkspaceAiPromptGateMessage(classification),
        role: "assistant",
        state: "question"
      });
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current?.abort();
    abortControllerRef.current = controller;
    setRequestState("sending");
    setErrorMessage("");

    try {
      setRequestState("generating");
      const mode = resolveWorkspaceAiChatMode({
        boardHasResources: context.diagram.nodes.length > 0,
        prompt
      });

      if (mode === "draft") {
        const response = await createAiArchitectureDraft({ prompt }, controller.signal);
        if (isArchitectureDraftClarification(response)) {
          appendMessage({
            content: response.question,
            role: "assistant",
            state: "question",
            suggestions: response.suggestions
          });
          return;
        }
        const diagram = getDiagramJsonForArchitectureDraft(response);
        context.setPreviewDiagram(diagram);
        setPendingBoardPreview({ diagram, summary: response.title });
        appendMessage({ content: `${response.title} 제안을 만들었습니다.`, role: "assistant", state: "preview" });
        return;
      }

      const response = await createAiArchitecturePatchPreview({
        architectureJson: convertDiagramJsonToArchitectureJson(context.diagram),
        instruction: prompt
      }, controller.signal);
      if (isArchitecturePatchClarification(response)) {
        setPendingPatchClarification({ baseDiagram: context.diagram, clarification: response });
        appendMessage({
          content: response.question,
          role: "assistant",
          state: "question",
          suggestions: [...response.candidates.map((candidate) => candidate.label), ...(response.suggestions ?? [])]
        });
        return;
      }
      const preview = createWorkspaceAiPatchPreviewModel(context.diagram, response);
      context.setPreviewDiagram(preview.visualPreviewDiagram, preview.annotations);
      setPendingBoardPreview({ diagram: preview.proposedDiagram, summary: response.intent.instruction });
      appendMessage({
        content: `${response.changes.length}개 변경 제안을 만들었습니다.`,
        role: "assistant",
        state: "preview"
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = toAssistantError(error);
      setErrorMessage(message);
      appendMessage({ content: message, role: "assistant", state: "error" });
    } finally {
      if (!controller.signal.aborted) setRequestState("idle");
      abortControllerRef.current = null;
    }
  }, [appendMessage, context, input, requestState]);

  // 앞선 수정 질문의 선택지는 새 요청으로 분류하지 않고 원래 Resource ID와 함께 이어서 보냅니다.
  const answerSuggestion = useCallback(async (suggestion: string): Promise<void> => {
    if (!pendingPatchClarification) {
      await send(suggestion);
      return;
    }
    const { baseDiagram, clarification } = pendingPatchClarification;
    const candidate = findPatchClarificationCandidate(clarification, suggestion);
    const selectedSuggestion = findPatchClarificationSuggestion(clarification, suggestion);
    setPendingPatchClarification(null);
    appendMessage({ content: suggestion, role: "user", state: "completed" });
    setRequestState("generating");
    setErrorMessage("");
    try {
      const useAsConnection = clarification.intent.requestedAction === "add_resource";
      const isSkipSuggestion = selectedSuggestion === "연결하지 않기" || selectedSuggestion === "추가 안 함";
      const continuedInstruction = !candidate && selectedSuggestion && !isSkipSuggestion
        ? `${clarification.intent.instruction}. 선택한 항목: ${selectedSuggestion}`
        : clarification.intent.instruction;
      const response = await createAiArchitecturePatchPreview({
        architectureJson: convertDiagramJsonToArchitectureJson(baseDiagram),
        instruction: continuedInstruction,
        ...(candidate && useAsConnection ? { connectionTargetResourceId: candidate.resourceId } : {}),
        ...(candidate && !useAsConnection ? { selectedTargetResourceId: candidate.resourceId } : {}),
        ...(isSkipSuggestion ? { skipConnection: true } : {})
      });
      if (isArchitecturePatchClarification(response)) {
        setPendingPatchClarification({ baseDiagram, clarification: response });
        appendMessage({
          content: response.question,
          role: "assistant",
          state: "question",
          suggestions: [...response.candidates.map((item) => item.label), ...(response.suggestions ?? [])]
        });
        return;
      }
      const preview = createWorkspaceAiPatchPreviewModel(baseDiagram, response);
      context.setPreviewDiagram(preview.visualPreviewDiagram, preview.annotations);
      setPendingBoardPreview({ diagram: preview.proposedDiagram, summary: response.intent.instruction });
      appendMessage({ content: `${response.changes.length}개 변경 제안을 만들었습니다.`, role: "assistant", state: "preview" });
    } catch (error) {
      const message = toAssistantError(error);
      setErrorMessage(message);
      appendMessage({ content: message, role: "assistant", state: "error" });
    } finally {
      setRequestState("idle");
    }
  }, [appendMessage, context, pendingPatchClarification, send]);

  // 현재 Terraform 코드 또는 첫 진단을 쉬운 설명과 안전한 수정 미리보기로 바꿉니다.
  const explainTerraform = useCallback(async (): Promise<void> => {
    if (requestState !== "idle") return;
    setRequestState("generating");
    setErrorMessage("");
    try {
      const code = terraform.code;
      if (!code.trim()) {
        throw new Error("Terraform Preview에서 코드를 먼저 생성한 뒤 설명을 요청해주세요.");
      }
      const diagnostic = terraform.diagnostics[0];
      if (diagnostic) {
        const result = await runAiTerraformErrorExplanation({
          diagnostic,
          rawMessage: diagnostic.message,
          relatedResourceId: diagnostic.nodeId,
          stage: "validate",
          terraformCodeContext: code
        });
        const fixedCode = result.safeFix?.applicable ? result.safeFix.code : undefined;
        if (fixedCode) {
          setPendingTerraformFix({
            code: fixedCode,
            currentCode: code,
            summary: result.summary
          });
        }
        appendMessage({ content: `${result.summary}\n${result.likelyCause}`, role: "assistant", state: fixedCode ? "preview" : "completed" });
        return;
      }
      const result = await runAiTerraformPreviewExplanation(code);
      appendMessage({
        content: `${result.summary}\n${result.consensusRecommendation}`,
        role: "assistant",
        state: "completed"
      });
    } catch (error) {
      const message = toAssistantError(error);
      setErrorMessage(message);
      appendMessage({ content: message, role: "assistant", state: "error" });
    } finally {
      setRequestState("idle");
    }
  }, [appendMessage, requestState, terraform]);

  // 현재 Board를 보통 트래픽과 보통 예산 조건으로 시뮬레이션합니다.
  const runSimulation = useCallback(async (): Promise<void> => {
    if (requestState !== "idle" || context.diagram.nodes.length === 0) return;
    setRequestState("generating");
    setErrorMessage("");
    try {
      const result = await runAiDesignSimulation({
        architectureJson: convertDiagramJsonToArchitectureJson(context.diagram),
        budgetLevel: "normal",
        trafficLevel: "normal"
      });
      appendMessage({
        content: `${result.summary}\n${result.recommendations.slice(0, 3).join("\n")}`,
        role: "assistant",
        state: "completed"
      });
    } catch (error) {
      const message = toAssistantError(error);
      setErrorMessage(message);
      appendMessage({ content: message, role: "assistant", state: "error" });
    } finally {
      setRequestState("idle");
    }
  }, [appendMessage, context.diagram, requestState]);

  // 사용자가 승인한 Architecture 미리보기만 실제 Board에 적용합니다.
  const applyBoardPreview = useCallback((): void => {
    if (!pendingBoardPreview) return;
    context.applyDiagramJson(pendingBoardPreview.diagram);
    context.setPreviewDiagram(null);
    appendMessage({ content: `${pendingBoardPreview.summary} 제안을 Board에 적용했습니다.`, role: "assistant", state: "completed" });
    setPendingBoardPreview(null);
  }, [appendMessage, context, pendingBoardPreview]);

  // 사용자가 승인한 Terraform 수정안만 편집 중인 코드에 적용합니다.
  const applyTerraformFix = useCallback((): void => {
    if (!pendingTerraformFix) return;
    terraform.setCode(pendingTerraformFix.code);
    appendMessage({ content: `${pendingTerraformFix.summary} 수정안을 Terraform 코드에 적용했습니다.`, role: "assistant", state: "completed" });
    setPendingTerraformFix(null);
  }, [appendMessage, pendingTerraformFix, terraform]);

  // 적용하지 않은 모든 미리보기를 버리고 실제 상태는 유지합니다.
  const cancelPreview = useCallback((): void => {
    context.setPreviewDiagram(null);
    setPendingBoardPreview(null);
    setPendingTerraformFix(null);
    appendMessage({ content: "제안을 취소했습니다. 실제 상태는 바뀌지 않았습니다.", role: "assistant", state: "completed" });
  }, [appendMessage, context]);

  // 현재 네트워크 요청만 중단하고 이전 대화와 미리보기는 유지합니다.
  const cancelRequest = useCallback((): void => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setRequestState("idle");
  }, []);

  return {
    applyBoardPreview,
    applyTerraformFix,
    answerSuggestion,
    cancelPreview,
    cancelRequest,
    errorMessage,
    explainTerraform,
    input,
    messages,
    pendingBoardPreview,
    pendingTerraformFix,
    requestState,
    runSimulation,
    send,
    setInput,
    voice
  };
}

// 저장소의 알 수 없는 값을 화면에서 사용할 수 있는 메시지만 남겨 복원합니다.
function readStoredMessages(storageKey: string): readonly WorkspaceAssistantMessage[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isWorkspaceAssistantMessage).slice(-80) : [];
  } catch {
    return [];
  }
}

// 저장된 한 항목이 새 AI 패널 메시지 계약과 맞는지 확인합니다.
function isWorkspaceAssistantMessage(value: unknown): value is WorkspaceAssistantMessage {
  if (typeof value !== "object" || value === null) return false;
  return "id" in value && "content" in value && "role" in value && "state" in value;
}

// 여러 API 오류 모양을 사용자에게 보여줄 한 문장으로 바꿉니다.
function toAssistantError(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "AI 요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.";
}
