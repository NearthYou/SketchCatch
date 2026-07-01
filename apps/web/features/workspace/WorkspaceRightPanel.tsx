"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { TerraformDiagnostic } from "@sketchcatch/types";
import {
  AlertCircle,
  Code2,
  GalleryVerticalEnd,
  PanelRightClose,
  PanelRightOpen,
  Rocket,
  Sparkles
} from "lucide-react";
import type { DiagramEditorPanelContext } from "../diagram-editor";
import { DeploymentPanel } from "./DeploymentPanel";
import { ResourceWorkspacePanel } from "./ResourceWorkspacePanel";
import {
  TerraformCodePanel,
  type PreparedTerraformArtifactSource,
  type TerraformCodePanelHandle
} from "./TerraformCodePanel";
import { TerraformIssuesPanel } from "./TerraformIssuesPanel";
import { TerraformLeaveDialog } from "./TerraformLeaveDialog";
import { WorkspaceAiPanel } from "./WorkspaceAiPanel";
import { defaultResourceWorkspaceView } from "./resource-workspace-view";
import {
  saveWorkspaceTerraformArtifact,
  type SavedWorkspaceTerraformArtifact
} from "./workspace-deployment-artifacts";
import { toDeploymentBaselineFingerprint } from "./terraform-panel-utils";
import type { ResourceWorkspaceView, WorkspaceRightPanelView } from "./workspace-right-panel.types";
import styles from "./workspace.module.css";

export type WorkspaceRightPanelProps = {
  readonly context: DiagramEditorPanelContext;
  readonly projectId: string;
  readonly projectName: string;
};

export function WorkspaceRightPanel({ context, projectId, projectName }: WorkspaceRightPanelProps) {
  const terraformPanelRef = useRef<TerraformCodePanelHandle | null>(null);
  const [activeView, setActiveView] = useState<WorkspaceRightPanelView>("resource");
  const [resourceWorkspaceView, setResourceWorkspaceView] = useState<ResourceWorkspaceView>(
    defaultResourceWorkspaceView
  );
  const [pendingView, setPendingView] = useState<WorkspaceRightPanelView | null>(null);
  const [hasUnsavedTerraformChanges, setHasUnsavedTerraformChanges] = useState(false);
  const [isDeploymentBaselineDirty, setIsDeploymentBaselineDirty] = useState(true);
  const [lastSavedDeploymentBaselineFingerprint, setLastSavedDeploymentBaselineFingerprint] =
    useState<string | null>(null);
  const [showTerraformLeaveDialog, setShowTerraformLeaveDialog] = useState(false);
  const [terraformSaveRequestId, setTerraformSaveRequestId] = useState(0);
  const [terraformDiagnostics, setTerraformDiagnostics] = useState<TerraformDiagnostic[]>([]);
  const hasTerraformIssueErrors = terraformDiagnostics.some((diagnostic) => diagnostic.severity === "error");
  const currentDeploymentBaselineFingerprint = useMemo(
    () => toDeploymentBaselineFingerprint(context.diagram),
    [context.diagram]
  );
  const hasUnsavedDeploymentBaseline =
    isDeploymentBaselineDirty ||
    lastSavedDeploymentBaselineFingerprint !== currentDeploymentBaselineFingerprint;

  const handleTerraformDirtyChange = useCallback((isDirty: boolean): void => {
    setHasUnsavedTerraformChanges(isDirty);

    if (isDirty) {
      setIsDeploymentBaselineDirty(true);
    }
  }, []);

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

  const savePreparedTerraformArtifact = useCallback(
    async (source: PreparedTerraformArtifactSource): Promise<SavedWorkspaceTerraformArtifact> => {
      return saveWorkspaceTerraformArtifact({
        diagramJson: source.diagramJson,
        projectId,
        source: "manual",
        terraformCode: source.terraformCode
      });
    },
    [projectId]
  );

  const prepareDeploymentArtifacts = useCallback(async (): Promise<SavedWorkspaceTerraformArtifact> => {
    const preparedSource = await terraformPanelRef.current?.prepareTerraformArtifact();

    if (!preparedSource) {
      throw new Error("Terraform 패널을 준비하지 못했습니다.");
    }

    const savedArtifacts = await savePreparedTerraformArtifact(preparedSource);

    setLastSavedDeploymentBaselineFingerprint(toDeploymentBaselineFingerprint(preparedSource.diagramJson));
    setIsDeploymentBaselineDirty(false);

    return savedArtifacts;
  }, [savePreparedTerraformArtifact]);

  const validateTerraformForPreDeployment = useCallback(async (): Promise<TerraformDiagnostic[]> => {
    return terraformPanelRef.current?.validateCurrentTerraform() ?? terraformDiagnostics;
  }, [terraformDiagnostics]);

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
          onClick={() => openCollapsedView("ai")}
          title="AI"
          type="button"
        >
          <Sparkles size={18} aria-hidden="true" />
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
          <button
            aria-pressed={activeView === "ai"}
            className={activeView === "ai" ? styles.panelModeButtonActive : styles.panelModeButton}
            onClick={() => requestView("ai")}
            title="AI"
            type="button"
          >
            <Sparkles size={18} aria-hidden="true" />
          </button>
          <button
            aria-pressed={activeView === "deployment"}
            className={activeView === "deployment" ? styles.panelModeButtonActive : styles.panelModeButton}
            onClick={() => requestView("deployment")}
            title="Deploy"
            type="button"
          >
            <Rocket size={18} aria-hidden="true" />
          </button>
        </div>
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
          ref={terraformPanelRef}
          context={context}
          externalSaveRequestId={terraformSaveRequestId}
          isVisible={activeView === "terraform"}
          onDiagnosticsChange={setTerraformDiagnostics}
          onDirtyChange={handleTerraformDirtyChange}
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
      <div className={styles.rightPanelView} hidden={activeView !== "ai"}>
        <WorkspaceAiPanel context={context} />
      </div>
      <div className={styles.rightPanelView} hidden={activeView !== "deployment"}>
        {activeView === "deployment" ? (
          <DeploymentPanel
            currentNodeCount={context.nodes.length}
            diagramJson={context.diagram}
            hasUnsavedDeploymentBaseline={hasUnsavedDeploymentBaseline}
            onPrepareDeploymentArtifacts={prepareDeploymentArtifacts}
            onValidateTerraformDiagnostics={validateTerraformForPreDeployment}
            projectId={projectId}
            projectName={projectName}
          />
        ) : null}
      </div>

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
