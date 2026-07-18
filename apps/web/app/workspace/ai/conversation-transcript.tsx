"use client";

import { RotateCcw, Undo2, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import type {
  ArchitectureDraftCandidateExclusion,
  ArchitectureDraftProgressSnapshot
} from "@sketchcatch/types";
import type { AiStartMessage } from "./ai-start-model";
import type { SelectedAssistantOption } from "./selected-option-model";
import {
  getProgressCandidateActions,
  getRetryRequestLabel,
  isSuggestionDisabled,
  shouldAutoFollowTranscript,
  type WorkspaceAiRequestState
} from "./workspace-ai-presentation";
import styles from "./workspace-ai.module.css";

export function ConversationTranscript({
  hasFinalPreview,
  isInteractionLocked,
  isSuggestionInputBlocked,
  lastExclusion,
  messages,
  onCancelRequest,
  onExcludeCandidate,
  onRetry,
  onSuggestionSelect,
  onUndoExclusion,
  progressSnapshot,
  requestState,
  selections
}: {
  readonly hasFinalPreview: boolean;
  readonly isInteractionLocked: boolean;
  readonly isSuggestionInputBlocked: boolean;
  readonly lastExclusion: ArchitectureDraftCandidateExclusion | null;
  readonly messages: readonly AiStartMessage[];
  readonly onCancelRequest: () => void;
  readonly onExcludeCandidate: (candidateId: string) => void;
  readonly onRetry: () => Promise<void>;
  readonly onSuggestionSelect: (message: AiStartMessage, suggestion: string) => void;
  readonly onUndoExclusion: () => void;
  readonly progressSnapshot: ArchitectureDraftProgressSnapshot | null;
  readonly requestState: WorkspaceAiRequestState;
  readonly selections: readonly SelectedAssistantOption[];
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const shouldFollowRef = useRef(true);
  const forcedFollowTargetMessageCountRef = useRef<number | null>(null);
  const candidateActions = useMemo(
    () => getProgressCandidateActions(progressSnapshot),
    [progressSnapshot]
  );
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
  }, [candidateActions.length, hasFinalPreview, messages, requestState, selections.length]);

  function handleScroll(): void {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    shouldFollowRef.current = shouldAutoFollowTranscript({
      clientHeight: scrollElement.clientHeight,
      scrollHeight: scrollElement.scrollHeight,
      scrollTop: scrollElement.scrollTop,
      source: "scroll"
    });
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
                <div aria-label="Assistant 선택지" className={styles.suggestionList} role="group">
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

        {candidateActions.length > 0 ? (
          <section aria-labelledby="candidate-action-heading" className={styles.candidateActions}>
            <div>
              <h3 id="candidate-action-heading">추천 후보 제외</h3>
            </div>
            <ul>
              {candidateActions.map((candidate) => (
                <li key={candidate.candidateId}>
                  <span>
                    <strong>{candidate.label}</strong>
                    <small>{candidate.resourceType}</small>
                  </span>
                  <button
                    disabled={isInteractionLocked}
                    onClick={() => onExcludeCandidate(candidate.candidateId)}
                    type="button"
                  >
                    제외
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {lastExclusion ? (
          <div className={styles.exclusionUndo} role="status">
            <span>{lastExclusion.label} 제외됨</span>
            <button disabled={isInteractionLocked} onClick={onUndoExclusion} type="button">
              <Undo2 aria-hidden="true" size={14} /> 되돌리기
            </button>
          </div>
        ) : null}

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
            <span>최종 Preview 준비됨</span>
            <a href="#final-architecture-preview">Preview로 이동</a>
          </div>
        ) : null}
      </div>
    </div>
  );
}
