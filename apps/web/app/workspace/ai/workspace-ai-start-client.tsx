"use client";

import {
  ArrowLeft,
  Check,
  LoaderCircle,
  Mic,
  RefreshCw,
  Send,
  TriangleAlert,
  Undo2
} from "lucide-react";
import { useEffect, useRef, type KeyboardEvent } from "react";
import type {
  AiArchitectureDraftResult,
  AiResultSource,
  ArchitectureDraftProgressStage,
  LlmExplanationFallbackReason
} from "@sketchcatch/types";
import { AiDraftBoardPreview } from "./ai-draft-board-preview";
import type { AiStartExistingProject, AiStartMessage } from "./ai-start-model";
import { useAiStartWorkflow } from "./use-ai-start-workflow";
import { ArchitectureBoardCompilationSummary } from "../../../features/architecture-board-compiler/architecture-board-compilation-summary";
import styles from "./workspace-ai-start.module.css";

type AiStartWorkflow = ReturnType<typeof useAiStartWorkflow>;

export function WorkspaceAiStartClient({
  existingProject
}: {
  readonly existingProject?: AiStartExistingProject | undefined;
}) {
  const workflow = useAiStartWorkflow({ existingProject });
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

  function handleMobileTabKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }

    event.preventDefault();
    let nextPane: AiStartWorkflow["mobilePane"] =
      event.currentTarget.id === "ai-start-conversation-tab" ? "progress" : "conversation";
    if (event.key === "Home") {
      nextPane = "conversation";
    } else if (event.key === "End") {
      nextPane = "progress";
    }
    workflow.setMobilePane(nextPane);
    window.requestAnimationFrame(() => {
      document
        .getElementById(`ai-start-${nextPane === "conversation" ? "conversation" : "progress"}-tab`)
        ?.focus();
    });
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <button
          aria-label={existingProject ? "Repository 추천으로 돌아가기" : "새 프로젝트 화면으로 돌아가기"}
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
        <span
          className={styles.previewStatus}
          data-active={workflow.previewDiagram !== null || workflow.progressSnapshot !== null}
          role="status"
        >
          {getTopStatusLabel(workflow)}
        </span>
      </header>

      <div
        className={styles.workspace}
        data-has-preview={
          workflow.previewDiagram !== null || workflow.progressSnapshot !== null
        }
        data-mobile-pane={workflow.mobilePane}
        data-progress-enabled={existingProject === undefined}
      >
        {existingProject === undefined ? (
          <div
            aria-label="AI Architecture 모바일 화면"
            className={styles.mobilePaneTabs}
            role="tablist"
          >
            <button
              aria-controls="ai-start-conversation-pane"
              aria-selected={workflow.mobilePane === "conversation"}
              id="ai-start-conversation-tab"
              onClick={() => workflow.setMobilePane("conversation")}
              onKeyDown={handleMobileTabKeyDown}
              role="tab"
              tabIndex={workflow.mobilePane === "conversation" ? 0 : -1}
              type="button"
            >
              대화
            </button>
            <button
              aria-controls="ai-start-progress-pane"
              aria-selected={workflow.mobilePane === "progress"}
              id="ai-start-progress-tab"
              onClick={() => workflow.setMobilePane("progress")}
              onKeyDown={handleMobileTabKeyDown}
              role="tab"
              tabIndex={workflow.mobilePane === "progress" ? 0 : -1}
              type="button"
            >
              진행 중인 초안
            </button>
          </div>
        ) : null}

        <section
          aria-label="AI Architecture 대화"
          aria-labelledby={
            existingProject === undefined ? "ai-start-conversation-tab" : undefined
          }
          className={styles.conversation}
          id="ai-start-conversation-pane"
          role={existingProject === undefined ? "tabpanel" : undefined}
        >
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

        <section
          aria-label="Architecture Draft PREVIEW"
          aria-labelledby={existingProject === undefined ? "ai-start-progress-tab" : undefined}
          className={styles.preview}
          id="ai-start-progress-pane"
          role={existingProject === undefined ? "tabpanel" : undefined}
        >
          {workflow.previewDiagram !== null && workflow.draft !== null ? (
            <>
              <header className={styles.previewHeader}>
                <div>
                  <span>ARCHITECTURE DRAFT</span>
                  <h1>{workflow.draft.title}</h1>
                  {workflow.finalProgressDifference !== null ? (
                    <p className={styles.finalTransition} role="status">
                      진행 초안에서 {workflow.finalProgressDifference.added}개 추가 ·{" "}
                      {workflow.finalProgressDifference.removed}개 제외
                    </p>
                  ) : null}
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

              {workflow.compilationProposal ? (
                <ArchitectureBoardCompilationSummary proposal={workflow.compilationProposal} />
              ) : null}

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
          ) : existingProject === undefined && workflow.progressSnapshot !== null ? (
            <DraftProgressPreview workflow={workflow} />
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

function DraftProgressPreview({ workflow }: { readonly workflow: AiStartWorkflow }) {
  const snapshot = workflow.progressSnapshot;
  if (snapshot === null) {
    return null;
  }

  const recentHistory = workflow.progressHistory.slice(-6);
  const excludableCandidateIds = snapshot.excludableCandidateIds;

  return (
    <div className={styles.progressPreview}>
      <header className={`${styles.previewHeader} ${styles.progressHeader}`}>
        <div>
          <span>진행 중인 초안</span>
          <h1>{getProgressStageLabel(snapshot.stage)}</h1>
        </div>
        <span className={styles.progressState} data-status={workflow.progressStatus}>
          {getProgressStatusLabel(workflow.progressStatus)}
        </span>
      </header>

      <section className={styles.progressContext} aria-label="확정된 요구사항과 남은 질문">
        <div className={styles.progressRequirements}>
          <strong>확정된 요구사항</strong>
          {snapshot.confirmedRequirements.length > 0 ? (
            <ul>
              {snapshot.confirmedRequirements.map((requirement) => (
                <li key={requirement}>{requirement}</li>
              ))}
            </ul>
          ) : (
            <span>대화에서 요구사항을 확인하고 있습니다.</span>
          )}
        </div>
        <div className={styles.pendingQuestions}>
          <span>남은 질문</span>
          <strong>{snapshot.pendingQuestions.length}개</strong>
        </div>
      </section>

      <div className={styles.progressBoard}>
        <p className={styles.provisionalNotice}>대화에 따라 바뀔 수 있어요</p>
        {workflow.progressDiagram !== null ? (
          <AiDraftBoardPreview
            diagram={workflow.progressDiagram}
            excludableCandidateIds={excludableCandidateIds}
            onExcludeCandidate={workflow.excludeProgressCandidate}
          />
        ) : (
          <div className={styles.progressWaiting} role="status">
            <LoaderCircle aria-hidden="true" size={18} />
            Resource 후보를 구조화하고 있습니다.
          </div>
        )}
      </div>

      <footer className={styles.progressFooter}>
        {recentHistory.length > 0 ? (
          <div className={styles.progressHistory} aria-label="최근 초안 변경">
            <strong>최근 변경</strong>
            <ul>
              {recentHistory.map((entry, index) => (
                <li key={`${entry.kind}-${entry.candidateId}-${index}`} data-kind={entry.kind}>
                  <span>{entry.kind === "added" ? "+" : "−"}</span>
                  {entry.label}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <span className={styles.progressHistoryEmpty}>구조 변경을 기다리는 중</span>
        )}

        <div className={styles.progressNotices}>
          {workflow.lastExclusion !== null ? (
            <div aria-live="polite" className={styles.exclusionNotice} role="status">
              <span>{workflow.lastExclusion.label} 후보를 제외했습니다.</span>
              <button onClick={workflow.undoLastExclusion} type="button">
                <Undo2 aria-hidden="true" size={14} />
                되돌리기
              </button>
            </div>
          ) : null}
          {workflow.progressStatus === "interrupted" ? (
            <div className={styles.interruptedNotice} role="alert">
              <span>업데이트가 중단됐습니다. 마지막 초안을 유지합니다.</span>
              <button onClick={() => void workflow.retryDraft()} type="button">
                <RefreshCw aria-hidden="true" size={14} />
                다시 시도
              </button>
            </div>
          ) : null}
        </div>
      </footer>
    </div>
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

function getTopStatusLabel(workflow: AiStartWorkflow): string {
  if (workflow.previewDiagram !== null) {
    return "PREVIEW 준비됨";
  }
  if (workflow.progressStatus === "interrupted") {
    return "업데이트 중단됨";
  }
  if (workflow.progressStatus === "awaiting_input") {
    return "추가 확인 필요";
  }
  if (workflow.progressSnapshot !== null) {
    return getProgressStageLabel(workflow.progressSnapshot.stage);
  }
  if (workflow.requestState === "loading") {
    return "초안 생성 중";
  }
  return "요구사항 입력";
}

function getProgressStatusLabel(status: AiStartWorkflow["progressStatus"]): string {
  const labels = {
    awaiting_input: "답변 기다리는 중",
    idle: "업데이트 대기",
    interrupted: "업데이트 중단",
    streaming: "업데이트 중"
  } as const;

  return labels[status];
}

function getProgressStageLabel(stage: ArchitectureDraftProgressStage): string {
  const labels: Record<ArchitectureDraftProgressStage, string> = {
    building_diagram: "다이어그램 구성",
    normalizing_requirements: "요구사항 정리",
    preparing_requirements: "요구사항 준비",
    querying_amazon_q: "Resource 후보 탐색",
    validating_architecture: "구조 검증"
  };

  return labels[stage];
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
