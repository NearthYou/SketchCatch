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
import type {
  AiArchitectureDraftResult,
  AiResultSource,
  LlmExplanationFallbackReason
} from "@sketchcatch/types";
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
            {workflow.voiceTranscriptNeedsConfirmation ? (
              <div className={styles.voiceConfirmation} role="status">
                <div>
                  <strong>전사문을 확인해주세요</strong>
                  <span>문장을 고친 뒤 확인해야 AI에 보낼 수 있습니다.</span>
                </div>
                <button onClick={workflow.confirmVoiceTranscript} type="button">
                  <Check aria-hidden="true" size={15} />
                  전사문 확인
                </button>
              </div>
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

function DraftMetadata({ draft }: { readonly draft: AiArchitectureDraftResult }) {
  const warnings = draft.metadata.guardrailWarnings ?? [];
  const assumptions = draft.metadata.assumptions;
  const explanations = draft.metadata.explanations;
  const llmExplanation = draft.llmExplanation;
  const detailCount =
    warnings.length +
    assumptions.length +
    explanations.length +
    (llmExplanation?.highlights.length ?? 0) +
    (llmExplanation?.nextActions.length ?? 0);

  return (
    <div className={styles.draftEvidence}>
      <div className={styles.draftSource}>
        <span>{getDraftSourceLabel(draft.metadata.source)}</span>
        <strong>{getDraftProviderLabel(draft)}</strong>
        {llmExplanation?.fallbackUsed ? <em>fallback</em> : null}
      </div>
      {detailCount === 0 ? (
        <span className={styles.cleanState}>검토할 추가 조건 없음</span>
      ) : (
        <details className={styles.metadataDisclosure}>
      <summary>
        {warnings.length > 0 ? <TriangleAlert aria-hidden="true" size={15} /> : null}
            근거 및 주의사항 {detailCount}
      </summary>
      <ul>
        {warnings.map((warning, index) => (
          <li key={`warning-${warning.code}-${index}`}>{warning.message}</li>
        ))}
        {assumptions.map((assumption, index) => (
          <li key={`assumption-${index}`}>{assumption}</li>
        ))}
            {explanations.map((explanation, index) => (
              <li key={`explanation-${index}`}>{explanation}</li>
            ))}
            {llmExplanation?.highlights.map((highlight, index) => (
              <li key={`highlight-${index}`}>{highlight}</li>
            ))}
            {llmExplanation?.nextActions.map((nextAction, index) => (
              <li key={`next-action-${index}`}>{nextAction}</li>
            ))}
            {llmExplanation?.fallbackReason ? (
              <li>fallback 이유: {getFallbackReasonLabel(llmExplanation.fallbackReason)}</li>
            ) : null}
      </ul>
    </details>
      )}
    </div>
  );
}

function getDraftSourceLabel(source: AiResultSource): string {
  const labels = {
    amazon_q: "Amazon Q 추천",
    github: "Source Repository 근거",
    llm_fallback: "LLM fallback",
    prompt: "Requirement Prompt",
    template_fallback: "Template fallback"
  } as const;

  return labels[source];
}

function getDraftProviderLabel(draft: AiArchitectureDraftResult): string {
  const providerMetadata = draft.llmExplanation?.providerMetadata;

  if (providerMetadata === undefined) {
    return "결정형 생성";
  }

  const providerLabels = {
    amazon_q_business: "Amazon Q",
    amazon_transcribe: "Amazon Transcribe",
    bedrock_runtime: "Amazon Bedrock",
    openai_responses: "OpenAI",
    rule_fallback: "Rule fallback"
  } as const;

  return providerLabels[providerMetadata.service];
}

function getFallbackReasonLabel(reason: LlmExplanationFallbackReason): string {
  const labels = {
    auth_error: "인증 오류",
    credit_not_confirmed: "AI 사용 승인이 확인되지 않음",
    daily_limit_exceeded: "일일 사용 한도 초과",
    invalid_request: "요청 형식 오류",
    invalid_response: "응답 형식 오류",
    missing_api_key: "API Key 없음",
    provider_error: "AI provider 오류",
    provider_not_configured: "AI provider 미설정",
    rate_limited: "요청 제한",
    timeout: "응답 시간 초과"
  } as const;

  return labels[reason];
}
