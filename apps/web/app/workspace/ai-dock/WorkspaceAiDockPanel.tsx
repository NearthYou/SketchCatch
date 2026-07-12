"use client";

import {
  AlertCircle,
  ArrowUp,
  AudioLines,
  Check,
  Code2,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  Square,
  X
} from "lucide-react";
import type { Dispatch, KeyboardEvent, RefObject, SetStateAction } from "react";
import type { DiagramEditorPanelContext } from "../../../features/diagram-editor";
import {
  getWorkspaceAiDockStatus,
  type WorkspaceAiDockPhase
} from "../../../features/workspace/workspace-ai-dock-state";
import type {
  WorkspaceAiAssistantState,
  WorkspaceAssistantMessage
} from "../ai-assistant/use-workspace-ai-assistant";
import styles from "./workspace-ai-dock.module.css";

type WorkspaceAiDockPanelProps = {
  readonly assistant: WorkspaceAiAssistantState;
  readonly composerRef: RefObject<HTMLTextAreaElement | null>;
  readonly context: DiagramEditorPanelContext;
  readonly isBusy: boolean;
  readonly isOnline: boolean;
  readonly isTerraformFixReviewed: boolean;
  readonly onClose: () => void;
  readonly onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  readonly onMessageScroll: () => void;
  readonly onPanelKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  readonly onTerraformFixReviewedChange: Dispatch<SetStateAction<boolean>>;
  readonly panelRef: RefObject<HTMLElement | null>;
  readonly phase: WorkspaceAiDockPhase;
  readonly scrollRef: RefObject<HTMLDivElement | null>;
};

// AI 상태, 대화, 승인, 입력을 하나의 dock surface로 보여줍니다.
export function WorkspaceAiDockPanel({
  assistant,
  composerRef,
  context,
  isBusy,
  isOnline,
  isTerraformFixReviewed,
  onClose,
  onComposerKeyDown,
  onMessageScroll,
  onPanelKeyDown,
  onTerraformFixReviewedChange,
  panelRef,
  phase,
  scrollRef
}: WorkspaceAiDockPanelProps) {
  const status = getWorkspaceAiDockStatus(phase);
  const boardActionDisabled = isBusy || !isOnline || context.diagram.nodes.length === 0;

  return (
    <aside
      aria-busy={isBusy}
      aria-label="AI Assistant"
      className={styles.panel}
      id="workspace-ai-dock-panel"
      onKeyDown={onPanelKeyDown}
      ref={panelRef}
    >
      <header className={styles.panelHeader}>
        <div className={styles.panelIdentity}>
          <span className={styles.panelMark}><Sparkles aria-hidden="true" size={16} /></span>
          <div>
            <h2>AI Assistant</h2>
            <p>Architecture Board context</p>
          </div>
        </div>
        <button aria-label="AI 채팅 닫기" className={styles.iconButton} onClick={onClose} type="button">
          <X aria-hidden="true" size={18} />
        </button>
      </header>

      <section aria-live="polite" className={styles.statusStrip} data-tone={status.tone}>
        {getStatusIcon(phase)}
        <div>
          <strong>{status.label}</strong>
          <span>{status.description}</span>
        </div>
      </section>

      <div className={styles.quickActions}>
        <button
          disabled={boardActionDisabled}
          onClick={() => void assistant.runSimulation()}
          title={getQuickActionDisabledReason(isBusy, isOnline, context.diagram.nodes.length)}
          type="button"
        >
          <ShieldCheck aria-hidden="true" size={15} />
          설계 점검
        </button>
        <button
          disabled={boardActionDisabled}
          onClick={() => void assistant.explainTerraform()}
          title={getQuickActionDisabledReason(isBusy, isOnline, context.diagram.nodes.length)}
          type="button"
        >
          <Code2 aria-hidden="true" size={15} />
          Terraform 설명
        </button>
      </div>

      <div
        aria-label="AI 대화"
        className={styles.conversation}
        onScroll={onMessageScroll}
        ref={scrollRef}
        role="log"
      >
        {assistant.messages.length === 0 ? (
          <div className={styles.emptyState}>
            <Sparkles aria-hidden="true" size={20} />
            <strong>무엇을 바꿀까요?</strong>
            <p>Resource 추가, 연결 수정 또는 Terraform 설명을 요청하세요.</p>
          </div>
        ) : (
          assistant.messages.map((message) => (
            <MessageItem
              isBusy={isBusy}
              isOnline={isOnline}
              key={message.id}
              message={message}
              onSuggestion={assistant.answerSuggestion}
            />
          ))
        )}
        {isBusy ? (
          <div className={styles.generating} role="status">
            <LoaderCircle aria-hidden="true" className={styles.spinner} size={15} />
            <span>{assistant.requestState === "sending" ? "요청 보내는 중" : "제안 만드는 중"}</span>
          </div>
        ) : null}
      </div>

      {assistant.pendingBoardPreview || assistant.pendingTerraformFix ? (
        <ApprovalSection
          assistant={assistant}
          isTerraformFixReviewed={isTerraformFixReviewed}
          onTerraformFixReviewedChange={onTerraformFixReviewedChange}
        />
      ) : null}

      <footer className={styles.composer}>
        {assistant.voice.statusMessage ? <p role="status">{assistant.voice.statusMessage}</p> : null}
        <div className={styles.inputShell}>
          <textarea
            aria-label="AI에게 요청"
            disabled={isBusy || !isOnline}
            onChange={(event) => assistant.setInput(event.target.value)}
            onKeyDown={onComposerKeyDown}
            placeholder={isOnline ? "예: 현재 API 앞에 ALB를 추가해줘" : "네트워크 연결을 확인해주세요"}
            ref={composerRef}
            rows={1}
            value={assistant.input}
          />
          {assistant.voice.isSupported ? (
            <button
              aria-label={assistant.voice.isListening ? "음성 입력 중지" : "음성 입력"}
              aria-pressed={assistant.voice.isListening}
              className={styles.iconButton}
              disabled={!isOnline || (isBusy && !assistant.voice.isListening)}
              onClick={assistant.voice.toggle}
              type="button"
            >
              <AudioLines aria-hidden="true" size={17} />
            </button>
          ) : null}
          {isBusy ? (
            <button
              aria-label="AI 생성 중지"
              className={styles.sendButton}
              onClick={assistant.cancelRequest}
              type="button"
            >
              <Square aria-hidden="true" fill="currentColor" size={11} />
            </button>
          ) : (
            <button
              aria-label="AI 요청 보내기"
              className={styles.sendButton}
              disabled={!isOnline || !assistant.input.trim()}
              onClick={() => void assistant.send()}
              type="button"
            >
              <ArrowUp aria-hidden="true" size={17} />
            </button>
          )}
        </div>
      </footer>
    </aside>
  );
}

// 한 대화 항목과 제안 선택지를 상태 label과 함께 표시합니다.
function MessageItem({
  isBusy,
  isOnline,
  message,
  onSuggestion
}: {
  readonly isBusy: boolean;
  readonly isOnline: boolean;
  readonly message: WorkspaceAssistantMessage;
  readonly onSuggestion: (suggestion: string) => Promise<void>;
}) {
  return (
    <article className={styles.message} data-role={message.role} data-state={message.state}>
      <header>
        <span>{message.role === "user" ? "나" : "AI"}</span>
        {message.role === "assistant" ? <small>{getMessageStateLabel(message)}</small> : null}
      </header>
      <p>{message.content}</p>
      {message.suggestions?.length ? (
        <div className={styles.suggestions}>
          {message.suggestions.map((suggestion) => (
            <button
              disabled={isBusy || !isOnline}
              key={suggestion}
              onClick={() => void onSuggestion(suggestion)}
              type="button"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

// Architecture와 Terraform 제안을 실제 적용 버튼과 명확히 분리합니다.
function ApprovalSection({
  assistant,
  isTerraformFixReviewed,
  onTerraformFixReviewedChange
}: {
  readonly assistant: WorkspaceAiAssistantState;
  readonly isTerraformFixReviewed: boolean;
  readonly onTerraformFixReviewedChange: Dispatch<SetStateAction<boolean>>;
}) {
  const terraformFix = assistant.pendingTerraformFix;
  const boardPreview = assistant.pendingBoardPreview;

  return (
    <section aria-label="AI 제안 적용 대기" className={styles.approvalSection}>
      <div className={styles.approvalHeading}>
        <div>
          <strong>제안 생성됨</strong>
          <span>적용 대기</span>
        </div>
        <p>확인 전에는 실제 상태가 바뀌지 않습니다.</p>
      </div>

      {boardPreview ? <p className={styles.previewSummary}>{boardPreview.summary}</p> : null}

      {terraformFix ? (
        <details className={styles.codeComparison} open>
          <summary>{terraformFix.fileName} 변경 비교</summary>
          <div>
            <span>현재 코드</span>
            <pre>{terraformFix.currentCode}</pre>
          </div>
          <div>
            <span>제안 코드</span>
            <pre>{terraformFix.code}</pre>
          </div>
          <label className={styles.reviewConfirmation}>
            <input
              checked={isTerraformFixReviewed}
              onChange={(event) => onTerraformFixReviewedChange(event.target.checked)}
              type="checkbox"
            />
            <span>현재 코드와 제안 코드를 비교 확인했습니다.</span>
          </label>
        </details>
      ) : null}

      <div className={styles.approvalActions}>
        <button className={styles.secondaryButton} onClick={assistant.cancelPreview} type="button">
          취소
        </button>
        <button
          className={styles.primaryButton}
          disabled={terraformFix !== null && !isTerraformFixReviewed}
          onClick={boardPreview ? assistant.applyBoardPreview : assistant.applyTerraformFix}
          type="button"
        >
          {boardPreview ? "Board에 적용" : "수정 적용"}
        </button>
      </div>
    </section>
  );
}

// Panel 상태에 맞는 의미 icon을 선택합니다.
function getStatusIcon(phase: WorkspaceAiDockPhase) {
  if (phase === "error" || phase === "offline") return <AlertCircle aria-hidden="true" size={17} />;
  if (phase === "sending" || phase === "generating") {
    return <LoaderCircle aria-hidden="true" className={styles.spinner} size={17} />;
  }
  if (phase === "approval" || phase === "preview") return <ShieldCheck aria-hidden="true" size={17} />;
  return <Check aria-hidden="true" size={17} />;
}

// AI message가 제안인지 적용 결과인지 짧은 label로 구분합니다.
function getMessageStateLabel(message: WorkspaceAssistantMessage): string {
  if (message.state === "preview") return "제안 생성됨";
  if (message.state === "question") return "확인 필요";
  if (message.state === "error") {
    return message.content.includes("적용") || message.content.includes("바뀌었습니다")
      ? "적용 실패"
      : "요청 실패";
  }
  return message.content.includes("적용했습니다") ? "사용자가 적용함" : "응답 완료";
}

// 비활성 quick action의 이유를 hover 사용자에게도 알려줍니다.
function getQuickActionDisabledReason(isBusy: boolean, isOnline: boolean, nodeCount: number): string {
  if (!isOnline) return "네트워크 연결을 확인해주세요";
  if (isBusy) return "현재 AI 요청이 끝난 뒤 실행할 수 있습니다";
  if (nodeCount === 0) return "Architecture Board에 Resource를 먼저 추가해주세요";
  return "";
}
