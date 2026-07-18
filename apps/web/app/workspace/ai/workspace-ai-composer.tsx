"use client";

import { Check, Mic, Send, Square } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ChangeEvent, CompositionEvent, KeyboardEvent } from "react";
import { getComposerEnterAction } from "./workspace-ai-presentation";
import styles from "./workspace-ai.module.css";

type VoiceInput = {
  readonly isListening: boolean;
  readonly isSupported: boolean;
  readonly statusMessage: string;
  readonly toggle: () => void;
};

export function WorkspaceAiComposer({
  canSubmit,
  onChange,
  onConfirmVoiceTranscript,
  onSubmit,
  value,
  voiceInput,
  voiceTranscriptNeedsConfirmation
}: {
  readonly canSubmit: boolean;
  readonly onChange: (value: string) => void;
  readonly onConfirmVoiceTranscript: () => void;
  readonly onSubmit: () => Promise<void>;
  readonly value: string;
  readonly voiceInput: VoiceInput;
  readonly voiceTranscriptNeedsConfirmation: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isComposingRef = useRef(false);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    const computedStyle = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(computedStyle.lineHeight) || 22;
    const verticalPadding =
      Number.parseFloat(computedStyle.paddingTop) + Number.parseFloat(computedStyle.paddingBottom);
    textarea.style.height = `${Math.min(textarea.scrollHeight, lineHeight * 6 + verticalPadding)}px`;
  }, [value]);

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>): void {
    onChange(event.target.value);
  }

  function handleCompositionStart(_: CompositionEvent<HTMLTextAreaElement>): void {
    isComposingRef.current = true;
  }

  function handleCompositionEnd(_: CompositionEvent<HTMLTextAreaElement>): void {
    isComposingRef.current = false;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    const action = getComposerEnterAction({
      isComposing: isComposingRef.current || event.nativeEvent.isComposing,
      key: event.key,
      shiftKey: event.shiftKey
    });

    if (action !== "submit") return;
    event.preventDefault();
    if (canSubmit) void onSubmit();
  }

  return (
    <div className={styles.composerRegion}>
      {voiceTranscriptNeedsConfirmation ? (
        <div className={styles.voiceConfirmation} role="status">
          <span>전사문 확인 필요</span>
          <button onClick={onConfirmVoiceTranscript} type="button">
            <Check aria-hidden="true" size={14} /> 확인
          </button>
        </div>
      ) : null}

      <div className={styles.composerBox}>
        <textarea
          aria-label="아키텍처 요구사항 입력"
          maxLength={4_000}
          onChange={handleChange}
          onCompositionEnd={handleCompositionEnd}
          onCompositionStart={handleCompositionStart}
          onKeyDown={handleKeyDown}
          placeholder="요구사항을 입력하세요"
          ref={textareaRef}
          rows={1}
          value={value}
        />
        <div className={styles.composerActions}>
          {voiceInput.isSupported ? (
            <button
              aria-label={voiceInput.isListening ? "음성 입력 중지" : "음성 입력 시작"}
              aria-pressed={voiceInput.isListening}
              className={styles.composerIconButton}
              onClick={voiceInput.toggle}
              type="button"
            >
              {voiceInput.isListening ? (
                <Square aria-hidden="true" size={16} />
              ) : (
                <Mic aria-hidden="true" size={17} />
              )}
            </button>
          ) : null}
          <button
            aria-label="메시지 전송"
            className={styles.composerSubmit}
            disabled={!canSubmit}
            onClick={() => void onSubmit()}
            type="button"
          >
            <Send aria-hidden="true" size={16} />
          </button>
        </div>
      </div>

      <div className={styles.composerMeta}>
        <span>{voiceInput.statusMessage || "Enter 전송 · Shift+Enter 줄바꿈"}</span>
        <span>{value.length.toLocaleString("ko-KR")} / 4,000</span>
      </div>
    </div>
  );
}
