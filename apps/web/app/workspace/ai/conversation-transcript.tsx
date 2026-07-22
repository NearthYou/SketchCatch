"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { WorkspaceAiWorkbenchDraftProgress } from "../../../features/workspace/WorkspaceAiWorkbenchResults";
import {
  ARCHITECTURE_DRAFT_GENERATION_STEP_DURATION_MS,
  architectureDraftGenerationSteps
} from "../../../features/workspace/workspace-ai-chat-status";
import type { AiStartMessage } from "./ai-start-model";
import type { SelectedAssistantOption } from "./selected-option-model";
import {
  getRetryRequestLabel,
  isSuggestionDisabled,
  shouldAutoFollowTranscript,
  shouldReleaseForcedTranscriptFollow,
  type WorkspaceAiRequestState
} from "./workspace-ai-presentation";
import styles from "./workspace-ai.module.css";

export function ConversationTranscript({
  hasFinalPreview,
  isInteractionLocked,
  isSuggestionInputBlocked,
  messages,
  onCancelRequest,
  onOpenPreview,
  onRetry,
  onSuggestionSelect,
  requestState,
  selections
}: {
  readonly hasFinalPreview: boolean;
  readonly isInteractionLocked: boolean;
  readonly isSuggestionInputBlocked: boolean;
  readonly messages: readonly AiStartMessage[];
  readonly onCancelRequest: () => void;
  readonly onOpenPreview: () => void;
  readonly onRetry: () => Promise<void>;
  readonly onSuggestionSelect: (message: AiStartMessage, suggestion: string) => void;
  readonly requestState: WorkspaceAiRequestState;
  readonly selections: readonly SelectedAssistantOption[];
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const shouldFollowRef = useRef(true);
  const forcedFollowTargetMessageCountRef = useRef<number | null>(null);
  const [draftProgressStep, setDraftProgressStep] = useState(0);
  const retryRequestLabel = getRetryRequestLabel(requestState);

  useEffect(() => {
    if (requestState !== "loading") {
      setDraftProgressStep(0);
      return;
    }

    const timerId = window.setInterval(() => {
      setDraftProgressStep((currentStep) =>
        Math.min(currentStep + 1, architectureDraftGenerationSteps.length - 1)
      );
    }, ARCHITECTURE_DRAFT_GENERATION_STEP_DURATION_MS);

    return () => window.clearInterval(timerId);
  }, [requestState]);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    const forcedFollowTargetMessageCount = forcedFollowTargetMessageCountRef.current;
    const isForcedFollow = forcedFollowTargetMessageCount !== null;
    if (!scrollElement || (!isForcedFollow && !shouldFollowRef.current)) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scrollElement.scrollTo({
      behavior: reduceMotion || isForcedFollow ? "auto" : "smooth",
      top: scrollElement.scrollHeight
    });

    if (
      isForcedFollow &&
      (requestState === "error" ||
        requestState === "cancelled" ||
        (requestState === "idle" && messages.length >= forcedFollowTargetMessageCount))
    ) {
      forcedFollowTargetMessageCountRef.current = null;
    }
  }, [hasFinalPreview, messages, requestState, selections.length]);

  function handleScroll(): void {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    const scrollPosition = {
      clientHeight: scrollElement.clientHeight,
      scrollHeight: scrollElement.scrollHeight,
      scrollTop: scrollElement.scrollTop
    };
    shouldFollowRef.current = shouldAutoFollowTranscript({
      ...scrollPosition,
      source: "scroll"
    });

    if (shouldReleaseForcedTranscriptFollow(scrollPosition)) {
      forcedFollowTargetMessageCountRef.current = null;
    }
  }

  function handleSuggestionSelect(message: AiStartMessage, suggestion: string): void {
    forcedFollowTargetMessageCountRef.current = messages.length + 2;
    shouldFollowRef.current = shouldAutoFollowTranscript({
      source: "assistant-option-selection"
    });
    onSuggestionSelect(message, suggestion);
  }

  return (
    <div
      aria-label="AI 대화 기록"
      className={styles.transcript}
      onScroll={handleScroll}
      ref={scrollRef}
      role="log"
    >
      <div className={styles.transcriptInner}>
        {messages.map((message) => {
          const selectedForQuestion = selections.find(
            ({ questionMessageId }) => questionMessageId === message.id
          );
          const visibleSuggestions = [...(message.suggestions ?? [])];
          if (
            selectedForQuestion !== undefined &&
            !visibleSuggestions.includes(selectedForQuestion.label)
          ) {
            visibleSuggestions.push(selectedForQuestion.label);
          }

          return (
            <article
              className={`${styles.message} ${message.role === "user" ? styles.messageUser : styles.messageAssistant}`}
              data-kind={message.kind}
              key={message.id}
            >
              <span className={styles.messageRole}>
                {message.role === "user" ? "You" : "SketchCatch AI"}
              </span>
              <div className={styles.messageBubble}>
                <p>{message.content}</p>
              </div>

              {message.role === "assistant" && visibleSuggestions.length > 0 ? (
                <div aria-label="답변 선택지" className={styles.suggestionList} role="group">
                  {visibleSuggestions.map((suggestion) => {
                    const selected = selectedForQuestion?.label === suggestion;
                    return (
                      <button
                        aria-pressed={selected}
                        className={styles.suggestionButton}
                        disabled={isSuggestionDisabled(
                          selections,
                          message.id,
                          requestState,
                          isSuggestionInputBlocked
                        )}
                        key={suggestion}
                        onClick={() => handleSuggestionSelect(message, suggestion)}
                        type="button"
                      >
                        <span>{suggestion}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </article>
          );
        })}

        {requestState === "loading" ? (
          <WorkspaceAiWorkbenchDraftProgress
            currentStep={draftProgressStep}
            onCancel={onCancelRequest}
          />
        ) : null}

        {retryRequestLabel ? (
          <button
            className={styles.retryButton}
            disabled={isInteractionLocked}
            onClick={() => void onRetry()}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={15} /> {retryRequestLabel}
          </button>
        ) : null}

        {hasFinalPreview ? (
          <div className={styles.previewArrival} role="status">
            <span>초안이 준비됐어요</span>
            <button onClick={onOpenPreview} type="button">
              미리보기 보기
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
