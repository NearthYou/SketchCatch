"use client";

import {
  AlertCircle,
  Check,
  LoaderCircle,
  Rocket,
  Save
} from "lucide-react";

import { WorkspaceDeploymentNotificationCenterSlot } from "../../components/notifications/DeploymentNotificationCenter";
import { ProductBrand } from "../../components/ui/ProductBrand";
import styles from "./diagram-editor.module.css";
import { getSaveStatusTone, isSaveInProgress } from "./workspace-project-save-status";

type WorkspaceProjectBarProps = {
  readonly actions: {
    readonly onSave?: (() => Promise<unknown>) | undefined;
    readonly onSaveAndDeploy?: (() => void) | undefined;
  };
  readonly workspace: {
    readonly dashboardHref: string;
    readonly isDeploymentConsoleOpen: boolean;
    readonly projectName: string;
    readonly saveStatus: string;
    readonly showSaveAction: boolean;
    readonly userName: string;
  };
};

/** 프로젝트 이름, 저장 상태, 주요 Workspace 작업을 한 줄에 고정합니다. */
export function WorkspaceProjectBar({
  actions,
  workspace
}: WorkspaceProjectBarProps) {
  const saveStatusTone = getSaveStatusTone(workspace.saveStatus);
  const isSaving = isSaveInProgress(workspace.saveStatus);

  /** 현재 DiagramJson을 기존 저장 경로로 넘깁니다. */
  function handleSave(): void {
    void actions.onSave?.();
  }

  function handleSaveAndDeploy(): void {
    actions.onSaveAndDeploy?.();
  }
  return (
    <header className={styles.projectBar}>
      <ProductBrand href={workspace.dashboardHref} />

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

        {workspace.showSaveAction ? (
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
        ) : null}

        <WorkspaceDeploymentNotificationCenterSlot />

        {actions.onSaveAndDeploy ? (
          <button
            aria-haspopup="dialog"
            aria-label="배포"
            className={`${styles.projectBarIconButton} ${styles.projectBarDeployButton}`}
            data-active={workspace.isDeploymentConsoleOpen}
            onClick={handleSaveAndDeploy}
            title="배포"
            type="button"
          >
            <Rocket aria-hidden="true" size={17} />
          </button>
        ) : null}
      </div>
    </header>
  );
}
