"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TerraformDiagnostic, TerraformSourceLocation } from "@sketchcatch/types";
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

type PendingTerraformLeaveAction =
  | { readonly kind: "view"; readonly view: WorkspaceRightPanelView }
  | { readonly kind: "right-panel-close" }
  | { readonly kind: "resource-settings" }
  | { readonly kind: "replay-click"; readonly target: HTMLElement };

export function WorkspaceRightPanel({ context, projectId, projectName }: WorkspaceRightPanelProps) {
  const terraformPanelRef = useRef<TerraformCodePanelHandle | null>(null);
  const terraformViewRef = useRef<HTMLDivElement | null>(null);
  const pendingTerraformLeaveActionRef = useRef<PendingTerraformLeaveAction | null>(null);
  const skipTerraformLeaveGuardRef = useRef(false);
  const [activeView, setActiveView] = useState<WorkspaceRightPanelView>("resource");
  const [resourceWorkspaceView, setResourceWorkspaceView] = useState<ResourceWorkspaceView>(
    defaultResourceWorkspaceView
  );
  const [hasUnsavedTerraformChanges, setHasUnsavedTerraformChanges] = useState(false);
  const [isDeploymentBaselineDirty, setIsDeploymentBaselineDirty] = useState(true);
  const [lastSavedDeploymentBaselineFingerprint, setLastSavedDeploymentBaselineFingerprint] =
    useState<string | null>(null);
  const [showTerraformLeaveDialog, setShowTerraformLeaveDialog] = useState(false);
  const [terraformSaveRequestId, setTerraformSaveRequestId] = useState(0);
  const [terraformDiscardRequestId, setTerraformDiscardRequestId] = useState(0);
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

  const requestTerraformLeave = useCallback((action: PendingTerraformLeaveAction): boolean => {
    if (!hasUnsavedTerraformChanges || skipTerraformLeaveGuardRef.current) {
      return true;
    }

    pendingTerraformLeaveActionRef.current = action;
    setShowTerraformLeaveDialog(true);
    return false;
  }, [hasUnsavedTerraformChanges]);

  const runPendingTerraformLeaveAction = useCallback((): void => {
    const pendingAction = pendingTerraformLeaveActionRef.current;
    pendingTerraformLeaveActionRef.current = null;

    if (!pendingAction) {
      return;
    }

    skipTerraformLeaveGuardRef.current = true;

    try {
      if (pendingAction.kind === "view") {
        setActiveView(pendingAction.view);
        return;
      }

      if (pendingAction.kind === "right-panel-close") {
        context.setRightPanelOpen(false);
        return;
      }

      if (pendingAction.kind === "resource-settings") {
        setResourceWorkspaceView("settings");
        setActiveView("resource");
        return;
      }

      pendingAction.target.click();
    } finally {
      window.setTimeout(() => {
        skipTerraformLeaveGuardRef.current = false;
      }, 0);
    }
  }, [context]);

  const requestView = useCallback((nextView: WorkspaceRightPanelView): void => {
    if (nextView === activeView) {
      return;
    }

    if (!requestTerraformLeave({ kind: "view", view: nextView })) {
      return;
    }

    setActiveView(nextView);
  }, [activeView, requestTerraformLeave]);

  function continueTerraformEditing(): void {
    pendingTerraformLeaveActionRef.current = null;
    setShowTerraformLeaveDialog(false);
  }

  function discardTerraformChanges(): void {
    setTerraformDiscardRequestId((requestId) => requestId + 1);
    setHasUnsavedTerraformChanges(false);
    setShowTerraformLeaveDialog(false);
    runPendingTerraformLeaveAction();
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
    runPendingTerraformLeaveAction();
  }

  function openCollapsedView(nextView: WorkspaceRightPanelView): void {
    if (!requestTerraformLeave({ kind: "view", view: nextView })) {
      return;
    }

    context.setRightPanelOpen(true);
    setActiveView(nextView);
  }

  function requestRightPanelClose(): void {
    if (!requestTerraformLeave({ kind: "right-panel-close" })) {
      return;
    }

    context.setRightPanelOpen(false);
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

  const openTerraformSourceLocation = useCallback((sourceLocation: TerraformSourceLocation): void => {
    context.setRightPanelOpen(true);
    setActiveView("terraform");
    window.setTimeout(() => {
      terraformPanelRef.current?.openTerraformSourceLocation(sourceLocation);
    }, 0);
  }, [context]);

  useEffect(() => {
    if (!hasUnsavedTerraformChanges) {
      return;
    }

    function handleDocumentClick(event: MouseEvent): void {
      if (skipTerraformLeaveGuardRef.current) {
        return;
      }

      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (isInsideTerraformLeaveDialog(target) || terraformViewRef.current?.contains(target)) {
        return;
      }

      const replayTarget = getTerraformLeaveReplayTarget(target);

      if (!replayTarget) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      pendingTerraformLeaveActionRef.current = { kind: "replay-click", target: replayTarget };
      setShowTerraformLeaveDialog(true);
    }

    document.addEventListener("click", handleDocumentClick, true);
    return () => document.removeEventListener("click", handleDocumentClick, true);
  }, [hasUnsavedTerraformChanges]);

  useEffect(() => {
    if (!hasUnsavedTerraformChanges) {
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent): void {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedTerraformChanges]);

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
          onClick={requestRightPanelClose}
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
      <div ref={terraformViewRef} className={styles.rightPanelView} hidden={activeView !== "terraform"}>
        <TerraformCodePanel
          ref={terraformPanelRef}
          context={context}
          externalDiscardRequestId={terraformDiscardRequestId}
          externalSaveRequestId={terraformSaveRequestId}
          isVisible={activeView === "terraform"}
          onDiagnosticsChange={setTerraformDiagnostics}
          onDirtyChange={handleTerraformDirtyChange}
          onExternalSaveComplete={handleTerraformExternalSaveComplete}
          onOpenIssues={() => requestView("issues")}
          onOpenResourceSettings={() => {
            if (!requestTerraformLeave({ kind: "resource-settings" })) {
              return;
            }

            setResourceWorkspaceView("settings");
            setActiveView("resource");
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
            onOpenTerraformSourceLocation={openTerraformSourceLocation}
            onPrepareDeploymentArtifacts={prepareDeploymentArtifacts}
            onReadTerraformSourceFiles={() => terraformPanelRef.current?.getTerraformFiles() ?? []}
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

function getTerraformLeaveReplayTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) {
    return null;
  }

  const interactiveTarget = target.closest<HTMLElement>(
    "button, a, input, select, textarea, [role='button'], [tabindex]"
  );

  if (interactiveTarget) {
    return interactiveTarget;
  }

  if (target instanceof HTMLElement) {
    return target;
  }

  return target.parentElement;
}

function isInsideTerraformLeaveDialog(target: Node): boolean {
  return target instanceof Element && Boolean(target.closest("[data-terraform-leave-dialog]"));
}
