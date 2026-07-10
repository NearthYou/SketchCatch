"use client";

import Image from "next/image";
import {
  AlertCircle,
  Check,
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Save
} from "lucide-react";

import styles from "./diagram-editor.module.css";
import { getSaveStatusTone, isSaveInProgress } from "./workspace-project-save-status";

type WorkspaceProjectBarProps = {
  readonly actions: {
    readonly onSave?: (() => Promise<unknown>) | undefined;
    readonly onToggleLeftPanel: () => void;
    readonly onToggleRightPanel: () => void;
  };
  readonly panels: {
    readonly hasRightPanel: boolean;
    readonly isLeftPanelOpen: boolean;
    readonly isRightPanelOpen: boolean;
  };
  readonly workspace: {
    readonly dashboardHref: string;
    readonly projectName: string;
    readonly saveStatus: string;
    readonly userName: string;
  };
};

/** 프로젝트 이름, 저장 상태, 양쪽 패널 동작을 한 줄에 고정합니다. */
export function WorkspaceProjectBar({
  actions,
  panels,
  workspace
}: WorkspaceProjectBarProps) {
  const saveStatusTone = getSaveStatusTone(workspace.saveStatus);
  const isSaving = isSaveInProgress(workspace.saveStatus);

  /** 현재 DiagramJson을 기존 저장 경로로 넘깁니다. */
  function handleSave(): void {
    void actions.onSave?.();
  }

  return (
    <header className={styles.projectBar}>
      <a
        aria-label="대시보드로 이동"
        className={styles.projectBarBrand}
        href={workspace.dashboardHref}
        title="대시보드"
      >
        <Image
          alt=""
          aria-hidden="true"
          className={styles.projectBarLogo}
          height={28}
          priority
          src="/sketchcatch-logo.png"
          width={19}
        />
        <span>SketchCatch</span>
      </a>

      <div className={styles.projectBarContext}>
        <strong title={workspace.projectName}>{workspace.projectName}</strong>
        <span title={workspace.userName}>{workspace.userName}</span>
      </div>

      <div className={styles.projectBarActions}>
        <div
          className={styles.projectBarSaveStatus}
          data-tone={saveStatusTone}
          role="status"
        >
          {saveStatusTone === "error" ? <AlertCircle aria-hidden="true" size={15} /> : null}
          {saveStatusTone === "pending" ? (
            <LoaderCircle aria-hidden="true" className={isSaving ? styles.saveStatusSpinner : undefined} size={15} />
          ) : null}
          {saveStatusTone === "saved" ? <Check aria-hidden="true" size={15} /> : null}
          <span>{workspace.saveStatus}</span>
        </div>

        <button
          aria-label="지금 저장"
          className={styles.projectBarIconButton}
          disabled={!actions.onSave || isSaving}
          onClick={handleSave}
          title="지금 저장"
          type="button"
        >
          <Save aria-hidden="true" size={17} />
        </button>

        <span aria-hidden="true" className={styles.projectBarDivider} />

        <button
          aria-label={panels.isLeftPanelOpen ? "리소스 패널 닫기" : "리소스 패널 열기"}
          aria-pressed={panels.isLeftPanelOpen}
          className={styles.projectBarIconButton}
          onClick={actions.onToggleLeftPanel}
          title={panels.isLeftPanelOpen ? "리소스 패널 닫기" : "리소스 패널 열기"}
          type="button"
        >
          {panels.isLeftPanelOpen ? (
            <PanelLeftClose aria-hidden="true" size={17} />
          ) : (
            <PanelLeftOpen aria-hidden="true" size={17} />
          )}
        </button>

        {panels.hasRightPanel ? (
          <button
            aria-label={panels.isRightPanelOpen ? "Inspector 닫기" : "Inspector 열기"}
            aria-pressed={panels.isRightPanelOpen}
            className={styles.projectBarIconButton}
            onClick={actions.onToggleRightPanel}
            title={panels.isRightPanelOpen ? "Inspector 닫기" : "Inspector 열기"}
            type="button"
          >
            {panels.isRightPanelOpen ? (
              <PanelRightClose aria-hidden="true" size={17} />
            ) : (
              <PanelRightOpen aria-hidden="true" size={17} />
            )}
          </button>
        ) : null}
      </div>
    </header>
  );
}
