"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DiagramEditorPanelContext } from "../../../features/diagram-editor";
import {
  getWorkspaceAiDockFocusTarget,
  getWorkspaceAiDockUnread,
  resolveWorkspaceAiDockPhase
} from "../../../features/workspace/workspace-ai-dock-state";
import { useWorkspaceAiAssistant } from "../ai-assistant/use-workspace-ai-assistant";
import type { WorkspaceTerraformState } from "../operations/use-workspace-terraform";
import { WorkspaceAiDockPanel } from "./WorkspaceAiDockPanel";
import styles from "./workspace-ai-dock.module.css";

// Workspace의 AI 런처와 panel 전환, unread, focus 복귀를 소유합니다.
export function WorkspaceAiDock({
  context,
  hasOperationsPanelOpen,
  isOpen,
  onOpenChange,
  projectId,
  terraform
}: {
  readonly context: DiagramEditorPanelContext;
  readonly hasOperationsPanelOpen: boolean;
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
  readonly projectId: string;
  readonly terraform: WorkspaceTerraformState;
}) {
  const assistant = useWorkspaceAiAssistant({ context, projectId, terraform });
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const seenMessageIdRef = useRef<string | null>(null);
  const shouldFollowMessagesRef = useRef(true);
  const wasOpenRef = useRef(false);
  const [hasUnreadResponse, setHasUnreadResponse] = useState(false);
  const [isOnline, setOnline] = useState(true);
  const [isTerraformFixReviewed, setTerraformFixReviewed] = useState(false);
  const hasProjectContext = projectId.trim().length > 0;
  const isBusy = assistant.requestState !== "idle";
  const hasApproval = assistant.pendingBoardPreview !== null || assistant.pendingTerraformFix !== null;
  const lastMessage = assistant.messages.at(-1);
  const phase = resolveWorkspaceAiDockPhase({
    errorMessage: assistant.errorMessage,
    hasApproval,
    hasProjectContext,
    isOnline,
    lastMessageRole: lastMessage?.role ?? null,
    lastMessageState: lastMessage?.state ?? null,
    messageCount: assistant.messages.length,
    requestState: assistant.requestState
  });

  // Browser online 상태를 AI 실행 가능 여부와 즉시 맞춥니다.
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

  // 새 응답이 와도 focus를 빼앗지 않고 실제 열기와 닫기에서만 이동합니다.
  useEffect(() => {
    const focusTarget = getWorkspaceAiDockFocusTarget(wasOpenRef.current, isOpen);
    wasOpenRef.current = isOpen;
    if (focusTarget === "composer") {
      requestAnimationFrame(() => composerRef.current?.focus());
      return;
    }
    if (focusTarget === "launcher") launcherRef.current?.focus();
  }, [isOpen]);

  // 열린 panel에서 본 최신 응답은 unread 상태로 남기지 않습니다.
  useEffect(() => {
    if (!isOpen) return;
    setHasUnreadResponse(false);
    seenMessageIdRef.current = lastMessage?.id ?? null;
  }, [isOpen, lastMessage?.id]);

  // 닫힌 동안 끝난 새 응답만 작은 상태점으로 알립니다.
  useEffect(() => {
    const responseCompleted =
      lastMessage?.role === "assistant" &&
      seenMessageIdRef.current !== null &&
      seenMessageIdRef.current !== lastMessage.id;
    if (getWorkspaceAiDockUnread({ isOpen, responseCompleted })) setHasUnreadResponse(true);
  }, [isOpen, lastMessage]);

  // 사용자가 대화 끝을 보고 있을 때만 새 메시지를 따라갑니다.
  useEffect(() => {
    if (!isOpen || !shouldFollowMessagesRef.current) return;
    const scrollArea = scrollRef.current;
    if (!scrollArea) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scrollArea.scrollTo({
      behavior: reduceMotion ? "auto" : "smooth",
      top: scrollArea.scrollHeight
    });
  }, [assistant.messages, assistant.requestState, isOpen]);

  // 새 Terraform 수정안은 이전 비교 확인 값을 이어받지 않습니다.
  useEffect(() => {
    setTerraformFixReviewed(false);
  }, [assistant.pendingTerraformFix?.code]);

  // 프로젝트가 있는 경우에만 런처가 panel을 엽니다.
  function openDock(): void {
    if (hasProjectContext) onOpenChange(true);
  }

  // Escape와 mobile focus 순환을 한 keyboard 계약으로 처리합니다.
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

  // 대화 끝에서 멀어지면 자동 scroll을 멈춥니다.
  function handleMessageScroll(): void {
    const scrollArea = scrollRef.current;
    if (!scrollArea) return;
    shouldFollowMessagesRef.current =
      scrollArea.scrollHeight - scrollArea.scrollTop - scrollArea.clientHeight < 72;
  }

  // Enter는 전송하고 Shift+Enter와 한글 조합 중 Enter는 줄바꿈으로 남깁니다.
  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void assistant.send();
  }

  return (
    <div
      className={styles.layer}
      data-inspector-open={context.isRightPanelOpen}
      data-open={isOpen}
      data-operations-open={hasOperationsPanelOpen}
    >
      {isOpen ? (
        <WorkspaceAiDockPanel
          assistant={assistant}
          composerRef={composerRef}
          context={context}
          isBusy={isBusy}
          isOnline={isOnline}
          isTerraformFixReviewed={isTerraformFixReviewed}
          onClose={() => onOpenChange(false)}
          onComposerKeyDown={handleComposerKeyDown}
          onMessageScroll={handleMessageScroll}
          onPanelKeyDown={handlePanelKeyDown}
          onTerraformFixReviewedChange={setTerraformFixReviewed}
          panelRef={panelRef}
          phase={phase}
          scrollRef={scrollRef}
        />
      ) : (
        <div className={styles.launcherAnchor}>
          <button
            aria-controls="workspace-ai-dock-panel"
            aria-describedby="workspace-ai-dock-tooltip"
            aria-disabled={!hasProjectContext}
            aria-expanded={false}
            aria-label={hasUnreadResponse ? "AI 채팅 열기, 읽지 않은 응답 있음" : "AI 채팅 열기"}
            className={styles.launcher}
            onClick={openDock}
            ref={launcherRef}
            type="button"
          >
            <Sparkles aria-hidden="true" size={18} strokeWidth={1.8} />
            {hasUnreadResponse ? <span aria-hidden="true" className={styles.unreadDot} /> : null}
          </button>
          <span className={styles.tooltip} id="workspace-ai-dock-tooltip" role="tooltip">
            {hasProjectContext ? "AI 채팅 열기" : "프로젝트를 연 뒤 사용할 수 있습니다"}
          </span>
        </div>
      )}
    </div>
  );
}

// Mobile focus 순환에 포함할 실제 조작 요소만 DOM 순서대로 찾습니다.
function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      "button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex='-1'])"
    )
  );
}
