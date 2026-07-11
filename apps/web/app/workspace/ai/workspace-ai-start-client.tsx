"use client";

import {
  ArrowLeft,
  Check,
  LoaderCircle,
  Mic,
  RefreshCw,
  Send,
  TriangleAlert
} from "lucide-react";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { AiDraftBoardPreview } from "./ai-draft-board-preview";
import type { AiStartMessage } from "./ai-start-model";
import { useAiStartWorkflow } from "./use-ai-start-workflow";
import styles from "./workspace-ai-start.module.css";

export function WorkspaceAiStartClient() {
  const workflow = useAiStartWorkflow();
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript !== null) {
      transcript.scrollTo({ behavior: "smooth", top: transcript.scrollHeight });
    }
  }, [workflow.messages, workflow.requestState]);

  if (workflow.projectDraft === null) {
    return null;
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    void workflow.submitPrompt();
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <button
          aria-label="새 프로젝트 화면으로 돌아가기"
          className={styles.iconButton}
          onClick={workflow.cancelStart}
          type="button"
        >
          <ArrowLeft aria-hidden="true" size={18} />
        </button>
        <div className={styles.projectIdentity}>
          <span>AI ARCHITECTURE</span>
          <strong>{workflow.projectDraft.projectName}</strong>
        </div>
        <span className={styles.previewStatus} data-active={workflow.previewDiagram !== null}>
          {workflow.previewDiagram === null ? "요구사항 입력" : "PREVIEW 준비됨"}
        </span>
      </header>

      <div className={styles.workspace} data-has-preview={workflow.previewDiagram !== null}>
        <section className={styles.conversation} aria-label="AI Architecture 대화">
          <div className={styles.transcript} ref={transcriptRef}>
            {workflow.messages.map((message) => (
              <ConversationMessage
                key={message.id}
                message={message}
                onSuggestion={(suggestion) => void workflow.submitPrompt(suggestion)}
              />
            ))}
            {workflow.requestState === "loading" ? (
              <div className={styles.thinking} role="status">
                <LoaderCircle aria-hidden="true" size={16} />
                구조를 계산하는 중
              </div>
            ) : null}
          </div>

          <div className={styles.composerDock}>
            {workflow.voiceInput.statusMessage ? (
              <p className={styles.voiceStatus} role="status">
                {workflow.voiceInput.statusMessage}
              </p>
            ) : null}
            <div className={styles.composer}>
              <textarea
                aria-label="Architecture 요구사항"
                onChange={(event) => workflow.setComposerValue(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder={
                  workflow.previewDiagram === null
                    ? "예: 로그인과 파일 업로드가 필요한 웹 서비스를 만들어줘"
                    : "PREVIEW에서 바꿀 내용을 입력하세요"
                }
                rows={3}
                value={workflow.composerValue}
              />
              <div className={styles.composerActions}>
                {workflow.voiceInput.isSupported ? (
                  <button
                    aria-label={workflow.voiceInput.isListening ? "음성 입력 중지" : "음성 입력"}
                    aria-pressed={workflow.voiceInput.isListening}
                    className={styles.iconButton}
                    onClick={workflow.voiceInput.toggle}
                    type="button"
                  >
                    <Mic aria-hidden="true" size={17} />
                  </button>
                ) : null}
                <button
                  aria-label="요구사항 보내기"
                  className={styles.sendButton}
                  disabled={!workflow.canSubmit}
                  onClick={() => void workflow.submitPrompt()}
                  type="button"
                >
                  <Send aria-hidden="true" size={17} />
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.preview} aria-label="Architecture Draft PREVIEW">
          {workflow.previewDiagram !== null && workflow.draft !== null ? (
            <>
              <header className={styles.previewHeader}>
                <div>
                  <span>ARCHITECTURE DRAFT</span>
                  <h1>{workflow.draft.title}</h1>
                </div>
                <dl>
                  <div>
                    <dt>Resource</dt>
                    <dd>{workflow.previewDiagram.nodes.length}</dd>
                  </div>
                  <div>
                    <dt>신뢰도</dt>
                    <dd>{workflow.draft.metadata.confidence}</dd>
                  </div>
                </dl>
              </header>

              <AiDraftBoardPreview diagram={workflow.previewDiagram} />

              <footer className={styles.previewFooter}>
                <DraftMetadata draft={workflow.draft} />
                <div className={styles.previewActions}>
                  <button
                    className={styles.secondaryButton}
                    disabled={workflow.requestState === "loading"}
                    onClick={() => void workflow.regenerateDraft()}
                    type="button"
                  >
                    <RefreshCw aria-hidden="true" size={16} />
                    다시 생성
                  </button>
                  <button
                    className={styles.primaryButton}
                    disabled={!workflow.canApprove}
                    onClick={() => void workflow.approveDraft()}
                    type="button"
                  >
                    <Check aria-hidden="true" size={16} />
                    Board에 적용
                  </button>
                </div>
              </footer>
            </>
          ) : (
            <div className={styles.emptyPreview}>
              <span>PREVIEW</span>
              <div aria-hidden="true" className={styles.emptyPreviewFrame} />
              <p>요구사항을 보내면 Architecture Draft가 여기에 열립니다.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function ConversationMessage({
  message,
  onSuggestion
}: {
  readonly message: AiStartMessage;
  readonly onSuggestion: (suggestion: string) => void;
}) {
  return (
    <article className={styles.message} data-kind={message.kind} data-role={message.role}>
      <span>{message.role === "user" ? "YOU" : "SKETCHCATCH"}</span>
      <div>
        <p>{message.content}</p>
        {message.suggestions ? (
          <div className={styles.suggestions}>
            {message.suggestions.map((suggestion) => (
              <button key={suggestion} onClick={() => onSuggestion(suggestion)} type="button">
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function DraftMetadata({ draft }: { readonly draft: NonNullable<ReturnType<typeof useAiStartWorkflow>["draft"]> }) {
  const warnings = draft.metadata.guardrailWarnings ?? [];
  const assumptions = draft.metadata.assumptions;

  if (warnings.length === 0 && assumptions.length === 0) {
    return <span className={styles.cleanState}>검토할 추가 조건 없음</span>;
  }

  return (
    <details className={styles.metadataDisclosure}>
      <summary>
        {warnings.length > 0 ? <TriangleAlert aria-hidden="true" size={15} /> : null}
        조건 및 주의사항 {warnings.length + assumptions.length}
      </summary>
      <ul>
        {warnings.map((warning) => (
          <li key={`${warning.code}-${warning.message}`}>{warning.message}</li>
        ))}
        {assumptions.map((assumption) => (
          <li key={assumption}>{assumption}</li>
        ))}
      </ul>
    </details>
  );
}
