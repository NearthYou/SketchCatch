"use client";

import {
  AlertCircle,
  ArrowUp,
  AudioLines,
  Bot,
  Check,
  Code2,
  LoaderCircle,
  Square,
  X
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DiagramEditorPanelContext } from "../../../features/diagram-editor";
import type { WorkspaceTerraformState } from "../operations/use-workspace-terraform";
import { useWorkspaceAiAssistant } from "./use-workspace-ai-assistant";
import styles from "./workspace-ai-assistant.module.css";

// Workspace 위에서 AI 런처, 대화 panel, 명시적 적용 동작을 한 surface로 제공합니다.
export function WorkspaceAiAssistant({
  context,
  isOpen,
  onOpenChange,
  projectId,
  terraform
}: {
  readonly context: DiagramEditorPanelContext;
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
  readonly projectId: string;
  readonly terraform: WorkspaceTerraformState;
}) {
  const assistant = useWorkspaceAiAssistant({ context, projectId, terraform });
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const shouldFollowMessagesRef = useRef(true);
  const seenMessageIdRef = useRef<string | null>(null);
  const [hasUnreadResponse, setHasUnreadResponse] = useState(false);
  const [isOnline, setOnline] = useState(true);
  const [isTerraformFixReviewed, setTerraformFixReviewed] = useState(false);
  const lastMessage = assistant.messages.at(-1);
  const isBusy = assistant.requestState !== "idle";
  const hasApproval = assistant.pendingBoardPreview !== null || assistant.pendingTerraformFix !== null;
  const hasProjectContext = projectId.trim().length > 0;

  // Browser 연결 상태가 바뀌면 AI를 사용할 수 없는 이유를 즉시 갱신합니다.
  useEffect(() => {
    function updateOnlineState(): void {
      setOnline(window.navigator.onLine);
    }
    updateOnlineState();
    window.addEventListener("online", updateOnlineState);
    window.addEventListener("offline", updateOnlineState);
    return () => {
      window.removeEventListener("online", updateOnlineState);
      window.removeEventListener("offline", updateOnlineState);
    };
  }, []);

  // 열린 panel은 입력창으로 focus를 옮기고 닫힌 panel은 런처로 focus를 돌려줍니다.
  useEffect(() => {
    if (isOpen) {
      setHasUnreadResponse(false);
      seenMessageIdRef.current = lastMessage?.id ?? null;
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    launcherRef.current?.focus();
  }, [isOpen, lastMessage?.id]);

  // panel이 닫힌 동안 실제 assistant 응답이 끝나면 작은 상태점만 표시합니다.
  useEffect(() => {
    if (
      !isOpen &&
      lastMessage?.role === "assistant" &&
      lastMessage.state !== "question" &&
      seenMessageIdRef.current !== null &&
      seenMessageIdRef.current !== lastMessage.id
    ) {
      setHasUnreadResponse(true);
    }
  }, [isOpen, lastMessage]);

  // 사용자가 최신 대화를 보고 있을 때만 새 메시지 위치를 따라갑니다.
  useEffect(() => {
    if (!isOpen || !shouldFollowMessagesRef.current) return;
    const scrollArea = scrollRef.current;
    if (scrollArea) scrollArea.scrollTo({ top: scrollArea.scrollHeight, behavior: "smooth" });
  }, [assistant.messages, assistant.requestState, isOpen]);

  // 새 Terraform 수정안은 이전 수정안의 비교 확인을 이어받지 않게 합니다.
  useEffect(() => {
    setTerraformFixReviewed(false);
  }, [assistant.pendingTerraformFix?.code]);

  // Escape와 모바일 focus 순환을 panel keyboard 계약으로 처리합니다.
  function handlePanelKeyDown(event: React.KeyboardEvent<HTMLElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onOpenChange(false);
      return;
    }
    if (event.key !== "Tab" || window.innerWidth > 768 || !panelRef.current) return;
    const focusable = getFocusableElements(panelRef.current);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  // 대화 scroll이 아래쪽에 있을 때만 이후 응답을 자동으로 따라가게 합니다.
  function handleMessageScroll(): void {
    const scrollArea = scrollRef.current;
    if (!scrollArea) return;
    shouldFollowMessagesRef.current =
      scrollArea.scrollHeight - scrollArea.scrollTop - scrollArea.clientHeight < 72;
  }

  // Enter는 전송하고 Shift+Enter는 입력 줄바꿈으로 남깁니다.
  function handleInputKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void assistant.send();
  }

  return (
    <div
      className={styles.assistantLayer}
      data-inspector-open={context.isRightPanelOpen}
      data-open={isOpen}
    >
      {!isOpen ? (
        <div className={styles.launcherWrap}>
          <button
            aria-label="AI 채팅 열기"
            className={styles.launcher}
            disabled={!hasProjectContext}
            onClick={() => onOpenChange(true)}
            ref={launcherRef}
            type="button"
          >
            <Bot aria-hidden="true" size={19} strokeWidth={1.8} />
            {hasUnreadResponse ? <span aria-label="읽지 않은 AI 응답" className={styles.unreadDot} /> : null}
          </button>
          <span className={styles.tooltip} role="tooltip">
            {hasProjectContext ? "AI 채팅 열기" : "프로젝트를 연 뒤 사용할 수 있습니다"}
          </span>
        </div>
      ) : (
        <aside
          aria-label="AI Assistant"
          className={styles.panel}
          onKeyDown={handlePanelKeyDown}
          ref={panelRef}
        >
          <header className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>Workspace assistant</span>
              <h2>AI Assistant</h2>
              <p>현재 Architecture Board 기준</p>
            </div>
            <button aria-label="AI 채팅 닫기" className={styles.iconButton} onClick={() => onOpenChange(false)} type="button">
              <X aria-hidden="true" size={18} />
            </button>
          </header>

          <div aria-live="polite" className={styles.statusBar} data-state={getAssistantState(isBusy, hasApproval, assistant.errorMessage, isOnline)}>
            {getAssistantStateIcon(isBusy, hasApproval, assistant.errorMessage, isOnline)}
            <span>{getAssistantStateLabel(isBusy, hasApproval, assistant.errorMessage, isOnline)}</span>
          </div>

          <div className={styles.quickActions}>
            <button disabled={isBusy || context.diagram.nodes.length === 0} onClick={() => void assistant.runSimulation()} type="button">
              <Check aria-hidden="true" size={14} /> 설계 점검
            </button>
            <button disabled={isBusy || context.diagram.nodes.length === 0} onClick={() => void assistant.explainTerraform()} type="button">
              <Code2 aria-hidden="true" size={14} /> Terraform 설명
            </button>
          </div>

          <div className={styles.messages} onScroll={handleMessageScroll} ref={scrollRef}>
            {assistant.messages.length === 0 ? (
              <div className={styles.emptyState}>
                <Bot aria-hidden="true" size={22} />
                <strong>아직 대화가 없습니다</strong>
                <p>Resource 추가, 연결 변경 또는 현재 Terraform 설명을 요청하세요.</p>
              </div>
            ) : (
              assistant.messages.map((message) => (
                <article className={styles.message} data-role={message.role} data-state={message.state} key={message.id}>
                  <span>{message.role === "user" ? "나" : "AI"}</span>
                  <p>{message.content}</p>
                  {message.suggestions?.length ? (
                    <div className={styles.suggestions}>
                      {message.suggestions.map((suggestion) => (
                        <button disabled={isBusy} key={suggestion} onClick={() => void assistant.answerSuggestion(suggestion)} type="button">
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))
            )}
            {isBusy ? (
              <div className={styles.generating} role="status">
                <LoaderCircle aria-hidden="true" className={styles.spinner} size={16} />
                {assistant.requestState === "sending" ? "요청 보내는 중" : "제안 만드는 중"}
              </div>
            ) : null}
          </div>

          {hasApproval ? (
            <section className={styles.approvalBar} aria-label="AI 제안 적용 대기">
              <div>
                <strong>적용 대기</strong>
                <span>확인 전에는 실제 상태가 바뀌지 않습니다.</span>
              </div>
              {assistant.pendingTerraformFix ? (
                <>
                  <div className={styles.terraformComparison}>
                    <span className={styles.comparisonFileName}>{assistant.pendingTerraformFix.fileName}</span>
                    <div>
                      <span>현재 코드</span>
                      <pre>{assistant.pendingTerraformFix.currentCode}</pre>
                    </div>
                    <div>
                      <span>제안 코드</span>
                      <pre>{assistant.pendingTerraformFix.code}</pre>
                    </div>
                  </div>
                  <label className={styles.reviewConfirmation}>
                    <input
                      checked={isTerraformFixReviewed}
                      onChange={(event) => setTerraformFixReviewed(event.target.checked)}
                      type="checkbox"
                    />
                    <span>현재 코드와 제안 코드를 비교 확인했습니다.</span>
                  </label>
                </>
              ) : null}
              <div className={styles.approvalActions}>
                <button className={styles.secondaryButton} onClick={assistant.cancelPreview} type="button">취소</button>
                <button
                  className={styles.primaryButton}
                  disabled={assistant.pendingTerraformFix !== null && !isTerraformFixReviewed}
                  onClick={assistant.pendingBoardPreview ? assistant.applyBoardPreview : assistant.applyTerraformFix}
                  type="button"
                >
                  {assistant.pendingBoardPreview ? "Board에 적용" : "수정 적용"}
                </button>
              </div>
            </section>
          ) : null}

          <footer className={styles.composer}>
            {assistant.voice.statusMessage ? <p role="status">{assistant.voice.statusMessage}</p> : null}
            <div className={styles.inputShell}>
              <textarea
                aria-label="AI에게 요청"
                disabled={isBusy}
                onChange={(event) => assistant.setInput(event.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="예: 현재 API 앞에 ALB를 추가해줘"
                ref={inputRef}
                rows={1}
                value={assistant.input}
              />
              {assistant.voice.isSupported ? (
                <button
                  aria-label={assistant.voice.isListening ? "음성 입력 중지" : "음성 입력"}
                  aria-pressed={assistant.voice.isListening}
                  className={styles.iconButton}
                  onClick={assistant.voice.toggle}
                  type="button"
                >
                  <AudioLines aria-hidden="true" size={17} />
                </button>
              ) : null}
              {isBusy ? (
                <button aria-label="AI 생성 중지" className={styles.sendButton} onClick={assistant.cancelRequest} type="button">
                  <Square aria-hidden="true" fill="currentColor" size={12} />
                </button>
              ) : (
                <button aria-label="AI 요청 보내기" className={styles.sendButton} disabled={!assistant.input.trim()} onClick={() => void assistant.send()} type="button">
                  <ArrowUp aria-hidden="true" size={17} />
                </button>
              )}
            </div>
          </footer>
        </aside>
      )}
    </div>
  );
}

// 모바일 focus trap이 이동시킬 실제 조작 요소만 순서대로 찾습니다.
function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>("button:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex='-1'])"));
}

// AI 요청과 승인 대기 여부를 한 가지 표시 상태로 합칩니다.
function getAssistantState(isBusy: boolean, hasApproval: boolean, errorMessage: string, isOnline: boolean): "offline" | "error" | "generating" | "approval" | "ready" {
  if (!isOnline) return "offline";
  if (errorMessage) return "error";
  if (isBusy) return "generating";
  if (hasApproval) return "approval";
  return "ready";
}

// 상태 이름과 함께 보여줄 아이콘을 선택합니다.
function getAssistantStateIcon(isBusy: boolean, hasApproval: boolean, errorMessage: string, isOnline: boolean) {
  const state = getAssistantState(isBusy, hasApproval, errorMessage, isOnline);
  if (state === "error" || state === "offline") return <AlertCircle aria-hidden="true" size={14} />;
  if (state === "generating") return <LoaderCircle aria-hidden="true" className={styles.spinner} size={14} />;
  return <Check aria-hidden="true" size={14} />;
}

// 내부 상태를 사용자가 바로 이해할 수 있는 짧은 말로 바꿉니다.
function getAssistantStateLabel(isBusy: boolean, hasApproval: boolean, errorMessage: string, isOnline: boolean): string {
  const state = getAssistantState(isBusy, hasApproval, errorMessage, isOnline);
  if (state === "offline") return "AI 연결을 사용할 수 없음";
  if (state === "error") return "요청 실패";
  if (state === "generating") return "응답 생성 중";
  if (state === "approval") return "사용자 적용 대기";
  return "입력 가능";
}
