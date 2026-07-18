"use client";

import { RotateCcw, X } from "lucide-react";
import { useEffect, useRef } from "react";
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
  const retryRequestLabel = getRetryRequestLabel(requestState);

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

              {message.role === "assistant" && message.suggestions?.length ? (
                <div aria-label="답변 선택지" className={styles.suggestionList} role="group">
                  {message.suggestions.map((suggestion) => {
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
                        {selected ? (
                          <span className={styles.suggestionSelected}>선택됨</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </article>
          );
        })}

        {requestState === "loading" ? (
          <div className={styles.requestStatus} role="status">
            <span className={styles.requestStatusDot} />
            <span>응답 생성 중</span>
            <button onClick={onCancelRequest} type="button">
              <X aria-hidden="true" size={14} /> 요청 취소
            </button>
          </div>
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
