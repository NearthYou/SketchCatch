"use client";

import { useCallback, useState } from "react";
import type { TerraformDiagnostic } from "@sketchcatch/types";
import {
  AlertCircle,
  Code2,
  GalleryVerticalEnd,
  PanelRightClose,
  PanelRightOpen,
  Rocket
} from "lucide-react";
import type { DiagramEditorPanelContext } from "../diagram-editor";
import { DeploymentPanel } from "./DeploymentPanel";
import { ResourceWorkspacePanel } from "./ResourceWorkspacePanel";
import { TerraformCodePanel } from "./TerraformCodePanel";
import { TerraformIssuesPanel } from "./TerraformIssuesPanel";
import { TerraformLeaveDialog } from "./TerraformLeaveDialog";
import type { ResourceWorkspaceView, WorkspaceRightPanelView } from "./workspace-right-panel.types";
import styles from "./workspace.module.css";

export type WorkspaceRightPanelProps = {
  readonly context: DiagramEditorPanelContext;
  readonly projectId: string;
  readonly projectName: string;
};

export function WorkspaceRightPanel({ context, projectId, projectName }: WorkspaceRightPanelProps) {
  const [activeView, setActiveView] = useState<WorkspaceRightPanelView>("resource");
  const [resourceWorkspaceView, setResourceWorkspaceView] = useState<ResourceWorkspaceView>("settings");
  const [pendingView, setPendingView] = useState<WorkspaceRightPanelView | null>(null);
  const [hasUnsavedTerraformChanges, setHasUnsavedTerraformChanges] = useState(false);
  const [showTerraformLeaveDialog, setShowTerraformLeaveDialog] = useState(false);
  const [terraformSaveRequestId, setTerraformSaveRequestId] = useState(0);
  const [terraformDiagnostics, setTerraformDiagnostics] = useState<TerraformDiagnostic[]>([]);
  const hasTerraformIssueErrors = terraformDiagnostics.some((diagnostic) => diagnostic.severity === "error");

  const requestView = useCallback((nextView: WorkspaceRightPanelView): void => {
    if (nextView === activeView) {
      return;
    }

    if (
      (activeView === "terraform" || activeView === "issues") &&
      nextView !== "terraform" &&
      nextView !== "issues" &&
      hasUnsavedTerraformChanges
    ) {
      setPendingView(nextView);
      setShowTerraformLeaveDialog(true);
      return;
    }

    setActiveView(nextView);
  }, [activeView, hasUnsavedTerraformChanges]);

  function continueTerraformEditing(): void {
    setPendingView(null);
    setShowTerraformLeaveDialog(false);
  }

  function discardTerraformChanges(): void {
    setHasUnsavedTerraformChanges(false);
    setShowTerraformLeaveDialog(false);
    setActiveView(pendingView ?? "resource");
    setPendingView(null);
  }

  function saveTerraformBeforeLeaving(): void {
    setTerraformSaveRequestId((requestId) => requestId + 1);
  }

  function handleTerraformExternalSaveComplete(saved: boolean): void {
    if (!saved || !showTerraformLeaveDialog) {
      return;
    }

    setHasUnsavedTerraformChanges(false);
    setShowTerraformLeaveDialog(false);
    setActiveView(pendingView ?? "resource");
    setPendingView(null);
  }

  function openCollapsedView(nextView: WorkspaceRightPanelView): void {
    context.setRightPanelOpen(true);
    requestView(nextView);
  }

  if (!context.isRightPanelOpen) {
    return (
      <aside className={styles.collapsedRightPanel} aria-label="Right panel shortcuts">
        <button
          className={styles.collapsedPanelButton}
          onClick={() => context.setRightPanelOpen(true)}
          title="Open right panel"
          type="button"
        >
          <PanelRightOpen size={18} aria-hidden="true" />
        </button>
        <button
          className={styles.collapsedPanelButton}
          onClick={() => openCollapsedView("resource")}
          title="Resources"
          type="button"
        >
          <GalleryVerticalEnd size={18} aria-hidden="true" />
        </button>
        <button
          className={styles.collapsedPanelButton}
          onClick={() => openCollapsedView("terraform")}
          title="Terraform"
          type="button"
        >
          <Code2 size={18} aria-hidden="true" />
        </button>
        <button
          className={styles.collapsedPanelButton}
          onClick={() => openCollapsedView("issues")}
          title="Issues"
          type="button"
        >
          <AlertCircle size={18} aria-hidden="true" />
          <span className={hasTerraformIssueErrors ? styles.panelIssueBadgeError : styles.panelIssueBadge}>
            {terraformDiagnostics.length}
          </span>
        </button>
        <button
          className={styles.collapsedPanelButton}
          onClick={() => openCollapsedView("deployment")}
          title="Deploy"
          type="button"
        >
          <Rocket size={18} aria-hidden="true" />
        </button>
      </aside>
    );
  }

  return (
    <aside className={styles.rightPanelShell}>
      <div className={styles.rightPanelToolbar}>
        <button
          className={styles.panelCollapseButton}
          onClick={() => context.setRightPanelOpen(false)}
          title="Close right panel"
          type="button"
        >
          <PanelRightClose size={18} aria-hidden="true" />
        </button>
        <div className={styles.panelModeToggle} role="group" aria-label="Panel mode">
          <button
            aria-pressed={activeView === "resource"}
            className={activeView === "resource" ? styles.panelModeButtonActive : styles.panelModeButton}
            onClick={() => requestView("resource")}
            title="Resource mode"
            type="button"
          >
            <GalleryVerticalEnd size={18} aria-hidden="true" />
          </button>
          <button
            aria-pressed={activeView === "terraform"}
            className={activeView === "terraform" ? styles.panelModeButtonActive : styles.panelModeButton}
            onClick={() => requestView("terraform")}
            title="Terraform mode"
            type="button"
          >
            <Code2 size={18} aria-hidden="true" />
          </button>
          <button
            aria-pressed={activeView === "issues"}
            className={activeView === "issues" ? styles.panelModeButtonActive : styles.panelModeButton}
            onClick={() => requestView("issues")}
            title="Issues"
            type="button"
          >
            <AlertCircle size={18} aria-hidden="true" />
            <span
              className={hasTerraformIssueErrors ? styles.panelIssueBadgeError : styles.panelIssueBadge}
              aria-label={`${terraformDiagnostics.length} issues`}
            >
              {terraformDiagnostics.length}
            </span>
          </button>
        </div>
        <button
          aria-pressed={activeView === "deployment"}
          className={`${activeView === "deployment" ? styles.panelIconButtonActive : styles.panelIconButton} ${styles.panelDeployButton}`}
          onClick={() => requestView("deployment")}
          title="Deploy"
          type="button"
        >
          <Rocket size={18} aria-hidden="true" />
        </button>
      </div>

      <div className={styles.rightPanelView} hidden={activeView !== "resource"}>
        <ResourceWorkspacePanel
          context={context}
          onViewChange={setResourceWorkspaceView}
          view={resourceWorkspaceView}
        />
      </div>
      <div className={styles.rightPanelView} hidden={activeView !== "terraform"}>
        <TerraformCodePanel
          context={context}
          externalSaveRequestId={terraformSaveRequestId}
          isVisible={activeView === "terraform"}
          onDiagnosticsChange={setTerraformDiagnostics}
          onDirtyChange={setHasUnsavedTerraformChanges}
          onExternalSaveComplete={handleTerraformExternalSaveComplete}
          onOpenIssues={() => requestView("issues")}
          onOpenResourceSettings={() => {
            setResourceWorkspaceView("settings");
            requestView("resource");
          }}
        />
      </div>
      <div className={styles.rightPanelView} hidden={activeView !== "issues"}>
        <TerraformIssuesPanel diagnostics={terraformDiagnostics} />
      </div>

      {activeView === "deployment" ? (
        <DeploymentPanel
          currentNodeCount={context.nodes.length}
          projectId={projectId}
          projectName={projectName}
        />
      ) : null}

      {showTerraformLeaveDialog ? (
        <TerraformLeaveDialog
          onContinue={continueTerraformEditing}
          onDiscard={discardTerraformChanges}
          onSave={saveTerraformBeforeLeaving}
        />
      ) : null}
    </aside>
  );
}
