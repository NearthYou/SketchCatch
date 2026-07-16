"use client";

import { forwardRef } from "react";
import { MessageSquareText } from "lucide-react";
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
      aria-label="AI 작업실 열기"
      aria-expanded={false}
      className={styles.launcher}
      data-right-panel-open={isRightPanelOpen}
      data-terraform-leave-guard-ignore
      onClick={onOpen}
      ref={ref}
      title="AI 작업실 열기"
      type="button"
    >
      <MessageSquareText aria-hidden="true" size={16} />
      <span>AI 작업실</span>
    </button>
  );
});
