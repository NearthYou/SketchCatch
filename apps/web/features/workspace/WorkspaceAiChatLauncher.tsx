"use client";

import { forwardRef } from "react";
import styles from "./workspace-ai-chat-launcher.module.css";

export type WorkspaceAiChatLauncherProps = {
  readonly isRightPanelOpen: boolean;
  readonly onOpen: () => void;
};

export const WorkspaceAiChatLauncher = forwardRef<
  HTMLButtonElement,
  WorkspaceAiChatLauncherProps
>(function WorkspaceAiChatLauncher({ isRightPanelOpen, onOpen }, ref) {
  return (
    <button
      aria-label="AI 채팅 열기"
      aria-expanded={false}
      className={styles.launcher}
      data-right-panel-open={isRightPanelOpen}
      data-terraform-leave-guard-ignore
      onClick={onOpen}
      ref={ref}
      title="AI 어시스턴트 열기"
      type="button"
    >
      <span aria-hidden="true" className={styles.mark}>
        AI
      </span>
    </button>
  );
});
