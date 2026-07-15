"use client";

import type { KeyboardEvent as ReactKeyboardEvent, ReactNode, Ref } from "react";
import {
  DraftingCompass,
  ScanSearch,
  Trash2,
  TriangleAlert,
  X,
  type LucideIcon
} from "lucide-react";
import type { WorkspaceAiChatScope } from "./workspace-ai-chat-conversation";
import type { WorkspaceAiChatDockStatus } from "./workspace-ai-chat-status";
import styles from "./workspace-ai-workbench.module.css";

export type WorkspaceAiWorkbenchScopeDefinition = {
  readonly inputAvailable: boolean;
  readonly label: string;
  readonly scope: WorkspaceAiChatScope;
};

export type WorkspaceAiWorkbenchProps = {
  readonly activeScope: WorkspaceAiChatScope;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly hasHistory: boolean;
  readonly isBusy: boolean;
  readonly isMobileSurface: boolean;
  readonly isRightPanelOpen: boolean;
  readonly onCancelRequest: () => void;
  readonly onClear: () => void;
  readonly onClose: () => void;
  readonly onScopeButtonRef: (
    scope: WorkspaceAiChatScope,
    element: HTMLButtonElement | null
  ) => void;
  readonly onScopeChange: (scope: WorkspaceAiChatScope) => void;
  readonly onScopeKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  readonly scopeDefinitions: readonly WorkspaceAiWorkbenchScopeDefinition[];
  readonly status: WorkspaceAiChatDockStatus | null;
  readonly surfaceRef: Ref<HTMLElement>;
  readonly transcriptRef: Ref<HTMLDivElement>;
};

const scopeIcons: Record<WorkspaceAiChatScope, LucideIcon> = {
  draft: DraftingCompass,
  errors: TriangleAlert,
  preview: ScanSearch
};

export function WorkspaceAiWorkbench({
  activeScope,
  children,
  footer,
  hasHistory,
  isBusy,
  isMobileSurface,
  isRightPanelOpen,
  onCancelRequest,
  onClear,
  onClose,
  onScopeButtonRef,
  onScopeChange,
  onScopeKeyDown,
  scopeDefinitions,
  status,
  surfaceRef,
  transcriptRef
}: WorkspaceAiWorkbenchProps) {
  const activeDefinition = scopeDefinitions.find((definition) => definition.scope === activeScope);
  const activeScopeLabel = activeDefinition?.label ?? "AI 작업";
  const readyLabel = activeDefinition?.inputAvailable ? "입력 가능" : "작업 선택 가능";
  const modeList = isMobileSurface ? (
    <WorkspaceAiModeList
      activeScope={activeScope}
      ariaOrientation="horizontal"
      className={styles.mobileTabList}
      onScopeButtonRef={onScopeButtonRef}
      onScopeChange={onScopeChange}
      onScopeKeyDown={onScopeKeyDown}
      scopeDefinitions={scopeDefinitions}
    />
  ) : (
    <WorkspaceAiModeList
      activeScope={activeScope}
      ariaOrientation="vertical"
      className={styles.desktopModeRail}
      onScopeButtonRef={onScopeButtonRef}
      onScopeChange={onScopeChange}
      onScopeKeyDown={onScopeKeyDown}
      scopeDefinitions={scopeDefinitions}
    />
  );

  return (
    <div className={styles.overlay} data-workspace-ai-chat-overlay>
      <section
        aria-busy={isBusy}
        aria-labelledby="workspace-ai-chat-title"
        aria-modal={isMobileSurface || undefined}
        className={styles.workWindow}
        data-active-scope={activeScope}
        data-right-panel-open={isRightPanelOpen}
        data-terraform-leave-guard-ignore
        ref={surfaceRef}
        role="dialog"
        tabIndex={-1}
      >
        {modeList}

        <div className={styles.workArea}>
          <header className={styles.header}>
            <div className={styles.heading}>
              <h2 id="workspace-ai-chat-title">AI 작업실</h2>
              <p>
                {activeScopeLabel} · {isBusy ? "작업 중" : "현재 Board 기준"}
              </p>
            </div>
            <div className={styles.headerActions}>
              <button
                aria-label="현재 AI 작업 내역 지우기"
                className={styles.iconButton}
                disabled={!hasHistory}
                onClick={onClear}
                title="내역 지우기"
                type="button"
              >
                <Trash2 aria-hidden="true" size={16} />
              </button>
              <button
                aria-label="AI 작업실 닫기"
                className={styles.iconButton}
                onClick={onClose}
                title="닫기"
                type="button"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>
          </header>

          <div
            aria-live="polite"
            className={styles.statusLine}
            data-status={status?.label ?? "준비"}
            role="status"
          >
            <span aria-hidden="true" className={styles.statusMark} />
            <div>
              <strong>{status?.label ?? readyLabel}</strong>
              <p>{status?.description ?? `${activeScopeLabel} 작업을 시작할 수 있습니다.`}</p>
            </div>
            {isBusy ? (
              <button className={styles.cancelButton} onClick={onCancelRequest} type="button">
                요청 중지
              </button>
            ) : null}
          </div>

          <div
            aria-labelledby={`workspace-ai-chat-tab-${activeScope}`}
            className={styles.transcript}
            id={`workspace-ai-chat-panel-${activeScope}`}
            ref={transcriptRef}
            role="tabpanel"
          >
            {children}
          </div>

          {footer ? <footer className={styles.footer}>{footer}</footer> : null}
        </div>
      </section>
    </div>
  );
}

function WorkspaceAiModeList({
  activeScope,
  ariaOrientation,
  className,
  onScopeButtonRef,
  onScopeChange,
  onScopeKeyDown,
  scopeDefinitions
}: {
  readonly activeScope: WorkspaceAiChatScope;
  readonly ariaOrientation: "horizontal" | "vertical";
  readonly className: string | undefined;
  readonly onScopeButtonRef: (
    scope: WorkspaceAiChatScope,
    element: HTMLButtonElement | null
  ) => void;
  readonly onScopeChange: (scope: WorkspaceAiChatScope) => void;
  readonly onScopeKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  readonly scopeDefinitions: readonly WorkspaceAiWorkbenchScopeDefinition[];
}) {
  return (
    <nav
      aria-label="AI 작업"
      aria-orientation={ariaOrientation}
      className={className}
      role="tablist"
    >
      {scopeDefinitions.map(({ label, scope }) => {
        const Icon = scopeIcons[scope];

        return (
          <button
            aria-controls={`workspace-ai-chat-panel-${scope}`}
            aria-selected={activeScope === scope}
            className={styles.modeButton}
            id={`workspace-ai-chat-tab-${scope}`}
            key={scope}
            onClick={() => onScopeChange(scope)}
            onKeyDown={onScopeKeyDown}
            ref={(element) => onScopeButtonRef(scope, element)}
            role="tab"
            tabIndex={activeScope === scope ? 0 : -1}
            type="button"
          >
            <Icon aria-hidden="true" size={18} />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
