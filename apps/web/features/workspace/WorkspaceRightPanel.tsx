"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CheckFinding, TerraformDiagnostic, TerraformSourceLocation } from "@sketchcatch/types";
import {
  AlertCircle,
  ChevronRight,
  Code2,
  GalleryVerticalEnd,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Rocket
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
import { defaultResourceWorkspaceView } from "./resource-workspace-view";
import { getPreDeploymentFindingTerraformSourceLocation } from "./pre-deployment-finding-source";
import {
  saveWorkspaceTerraformArtifact,
  type SavedWorkspaceTerraformArtifact
} from "./workspace-deployment-artifacts";
import {
  createTerraformLeaveSaveStartFeedback,
  resolveTerraformLeaveSaveCompletion,
  type TerraformLeaveSaveFeedback,
  type TerraformLeaveSaveState
} from "./terraform-leave-save-state";
import { toDeploymentBaselineFingerprint } from "./terraform-panel-utils";
import {
  markTerraformIssuesStale,
  mergeTerraformValidationDiagnostics,
  readStoredTerraformIssues,
  storeTerraformIssues,
  type TerraformIssueRecord
} from "./terraform-issues-state";
import type {
  TerraformIssueAiRequest,
  TerraformPreviewAiRequest,
  TerraformSafeFixApplyRequest,
  TerraformSafeFixApplyResult
} from "./workspace-terraform-ai";
import type { ResourceWorkspaceView, WorkspaceRightPanelView } from "./workspace-right-panel.types";
import styles from "./workspace.module.css";

export type WorkspaceRightPanelProps = {
  readonly context: DiagramEditorPanelContext;
  readonly initialView?: WorkspaceRightPanelView | undefined;
  readonly onTerraformIssueAiRequest: (request: TerraformIssueAiRequest) => void;
  readonly onTerraformPreviewAiRequest: (request: TerraformPreviewAiRequest) => void;
  readonly onTerraformSafeFixApplyResult: (result: TerraformSafeFixApplyResult) => void;
  readonly projectId: string;
  readonly projectName: string;
  readonly terraformSafeFixApplyRequest: TerraformSafeFixApplyRequest | null;
};

type PendingTerraformLeaveAction =
  | { readonly kind: "view"; readonly view: WorkspaceRightPanelView }
  | { readonly kind: "right-panel-close" }
  | { readonly kind: "resource-settings" }
  | { readonly kind: "replay-click"; readonly target: HTMLElement };

// 오른쪽 패널은 작업 중 필요한 모드만 노출하고, Reverse는 새 프로젝트 시작 흐름에서만 진입하게 둡니다.
export function WorkspaceRightPanel({
  context,
  initialView,
  onTerraformIssueAiRequest,
  onTerraformPreviewAiRequest,
  onTerraformSafeFixApplyResult,
  projectId,
  projectName,
  terraformSafeFixApplyRequest
}: WorkspaceRightPanelProps) {
  const terraformPanelRef = useRef<TerraformCodePanelHandle | null>(null);
  const terraformViewRef = useRef<HTMLDivElement | null>(null);
  const pendingTerraformLeaveActionRef = useRef<PendingTerraformLeaveAction | null>(null);
  const skipTerraformLeaveGuardRef = useRef(false);
  const latestTerraformDiagnosticsRef = useRef<TerraformDiagnostic[]>([]);
  const latestTerraformSaveRequestIdRef = useRef(0);
  const [activeView, setActiveView] = useState<WorkspaceRightPanelView>(initialView ?? "resource");
  const [isPlanActionStripOpen, setIsPlanActionStripOpen] = useState(false);
  const [resourceWorkspaceView, setResourceWorkspaceView] = useState<ResourceWorkspaceView>(
    defaultResourceWorkspaceView
  );
  const [hasUnsavedTerraformChanges, setHasUnsavedTerraformChanges] = useState(false);
  const [isDeploymentBaselineDirty, setIsDeploymentBaselineDirty] = useState(true);
  const [lastSavedDeploymentBaselineFingerprint, setLastSavedDeploymentBaselineFingerprint] =
    useState<string | null>(null);
  const [showTerraformLeaveDialog, setShowTerraformLeaveDialog] = useState(false);
  const [terraformLeaveSaveState, setTerraformLeaveSaveState] =
    useState<TerraformLeaveSaveState>("idle");
  const [terraformLeaveSaveMessage, setTerraformLeaveSaveMessage] = useState("");
  const [terraformSaveRequestId, setTerraformSaveRequestId] = useState(0);
  const [terraformDiscardRequestId, setTerraformDiscardRequestId] = useState(0);
  const [terraformIssues, setTerraformIssues] = useState<TerraformIssueRecord[]>([]);
  const [loadedTerraformIssuesProjectId, setLoadedTerraformIssuesProjectId] = useState<string | null>(null);
  const latestTerraformSafeFixApplyRequestIdRef = useRef<number | null>(null);
  const terraformDiagnostics = useMemo(
    () => terraformIssues.map((issue) => issue.diagnostic),
    [terraformIssues]
  );
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
      setTerraformIssues((currentIssues) => markTerraformIssuesStale(currentIssues));
    }
  }, []);

  const handleTerraformDiagnosticsChange = useCallback((diagnostics: TerraformDiagnostic[]): void => {
    latestTerraformDiagnosticsRef.current = diagnostics;
    const validatedAt = new Date().toISOString();
    setTerraformIssues((currentIssues) => {
      return mergeTerraformValidationDiagnostics(
        currentIssues,
        diagnostics,
        validatedAt
      );
    });
  }, []);

  const handleTerraformIssueAiClick = useCallback((issue: TerraformIssueRecord): void => {
    onTerraformIssueAiRequest({
      id: Date.now(),
      issue,
      terraformCode: terraformPanelRef.current?.getCurrentTerraformCode() ?? ""
    });
  }, [onTerraformIssueAiRequest]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedIssues = readStoredTerraformIssues(window.localStorage, projectId);
    latestTerraformDiagnosticsRef.current = storedIssues.map((issue) => issue.diagnostic);
    setTerraformIssues(storedIssues);
    setLoadedTerraformIssuesProjectId(projectId);
  }, [projectId]);

  useEffect(() => {
    if (loadedTerraformIssuesProjectId !== projectId || typeof window === "undefined") {
      return;
    }

    storeTerraformIssues(window.localStorage, projectId, terraformIssues);
  }, [loadedTerraformIssuesProjectId, projectId, terraformIssues]);

  useEffect(() => {
    if (!terraformSafeFixApplyRequest) {
      return;
    }

    const request = terraformSafeFixApplyRequest;

    if (latestTerraformSafeFixApplyRequestIdRef.current === request.id) {
      return;
    }

    latestTerraformSafeFixApplyRequestIdRef.current = request.id;

    async function applySafeFix(): Promise<void> {
      const result = await terraformPanelRef.current?.applyTerraformSafeFix(request.diagnostic, request.codePreview);

      onTerraformSafeFixApplyResult({
        requestId: request.id,
        applied: result?.applied ?? false,
        message: result?.message ?? "Terraform 패널이 준비되지 않아 적용하지 못했습니다."
      });
    }

    void applySafeFix();
  }, [onTerraformSafeFixApplyResult, terraformSafeFixApplyRequest]);

  const requestTerraformLeave = useCallback((action: PendingTerraformLeaveAction): boolean => {
    if (!hasUnsavedTerraformChanges || skipTerraformLeaveGuardRef.current) {
      return true;
    }

    pendingTerraformLeaveActionRef.current = action;
    setTerraformLeaveSaveState("idle");
    setTerraformLeaveSaveMessage("");
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

    if (nextView === "terraform") {
      setActiveView("terraform");
      return;
    }

    if (nextView === "issues") {
      setActiveView("issues");
      return;
    }

    if (!requestTerraformLeave({ kind: "view", view: nextView })) {
      return;
    }

    setActiveView(nextView);
  }, [activeView, requestTerraformLeave]);

  function openDeploymentFromPlan(): void {
    setIsPlanActionStripOpen(false);
    requestView("deployment");
  }

  const applyTerraformLeaveSaveFeedback = useCallback((feedback: TerraformLeaveSaveFeedback): void => {
    setTerraformLeaveSaveState(feedback.state);
    setTerraformLeaveSaveMessage(feedback.message);
  }, []);

  const resetTerraformLeaveSaveFeedback = useCallback((): void => {
    setTerraformLeaveSaveState("idle");
    setTerraformLeaveSaveMessage("");
  }, []);

  function invalidatePendingTerraformSaveCompletion(): void {
    latestTerraformSaveRequestIdRef.current += 1;
  }

  function continueTerraformEditing(): void {
    invalidatePendingTerraformSaveCompletion();
    pendingTerraformLeaveActionRef.current = null;
    resetTerraformLeaveSaveFeedback();
    setShowTerraformLeaveDialog(false);
  }

  function discardTerraformChanges(): void {
    invalidatePendingTerraformSaveCompletion();
    setTerraformDiscardRequestId((requestId) => requestId + 1);
    setHasUnsavedTerraformChanges(false);
    resetTerraformLeaveSaveFeedback();
    setShowTerraformLeaveDialog(false);
    runPendingTerraformLeaveAction();
  }

  function saveTerraformBeforeLeaving(): void {
    if (terraformLeaveSaveState === "saving") {
      return;
    }

    applyTerraformLeaveSaveFeedback(createTerraformLeaveSaveStartFeedback());
    setTerraformSaveRequestId((requestId) => {
      const nextRequestId = requestId + 1;
      latestTerraformSaveRequestIdRef.current = nextRequestId;
      return nextRequestId;
    });
  }

  function handleTerraformExternalSaveComplete(saved: boolean, requestId: number): void {
    if (requestId !== latestTerraformSaveRequestIdRef.current) {
      return;
    }

    if (!showTerraformLeaveDialog) {
      return;
    }

    const hasBlockingDiagnostics = latestTerraformDiagnosticsRef.current.some(
      (diagnostic) => diagnostic.severity === "error"
    );
    const feedback = resolveTerraformLeaveSaveCompletion(saved, { hasBlockingDiagnostics });
    applyTerraformLeaveSaveFeedback(feedback);

    if (feedback.shouldRevealTerraformPanel) {
      pendingTerraformLeaveActionRef.current = null;
      context.setRightPanelOpen(true);
      setActiveView("terraform");
      setShowTerraformLeaveDialog(false);
      return;
    }

    if (!feedback.canRunPendingAction) {
      return;
    }

    setHasUnsavedTerraformChanges(false);
    setShowTerraformLeaveDialog(feedback.shouldKeepDialogOpen);
    runPendingTerraformLeaveAction();
  }

  function openCollapsedView(nextView: WorkspaceRightPanelView): void {
    if (nextView === "terraform") {
      context.setRightPanelOpen(true);
      setActiveView("terraform");
      return;
    }

    if (nextView === "issues") {
      context.setRightPanelOpen(true);
      setActiveView("issues");
      return;
    }

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
        skipValidation: true,
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

  const openPreDeploymentFindingTerraformSource = useCallback((finding: CheckFinding): TerraformSourceLocation | null => {
    const sourceLocation = getPreDeploymentFindingTerraformSourceLocation({
      diagramJson: context.diagram,
      files: terraformPanelRef.current?.getTerraformFiles() ?? [],
      finding
    });

    if (!sourceLocation) {
      return null;
    }

    context.setRightPanelOpen(true);
    setActiveView("terraform");
    terraformPanelRef.current?.openTerraformSourceLocation(sourceLocation);

    return sourceLocation;
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

      if (isTerraformLeaveGuardIgnoredTarget(target)) {
        return;
      }

      if (isTerraformEditorNavigationTarget(target)) {
        return;
      }

      if (isTerraformIssuesNavigationTarget(target)) {
        return;
      }

      if (isTerraformIssueAiResolutionTarget(target)) {
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
      resetTerraformLeaveSaveFeedback();
      setShowTerraformLeaveDialog(true);
    }

    document.addEventListener("click", handleDocumentClick, true);
    return () => document.removeEventListener("click", handleDocumentClick, true);
  }, [hasUnsavedTerraformChanges, resetTerraformLeaveSaveFeedback]);

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
          data-terraform-editor-navigation
          onClick={() => openCollapsedView("terraform")}
          title="Terraform code"
          type="button"
        >
          <Code2 size={18} aria-hidden="true" />
        </button>
        <button
          className={styles.collapsedPanelButton}
          data-terraform-issues-navigation
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
      <div className={styles.rightPanelUtilityBar}>
        <button
          className={styles.panelCollapseButton}
          onClick={requestRightPanelClose}
          title="Close right panel"
          type="button"
        >
          <PanelRightClose size={18} aria-hidden="true" />
        </button>
      </div>
      <div className={styles.rightPanelModeBar} role="group" aria-label="Panel mode">
        <div className={styles.panelModeIconGroup} role="group" aria-label="Configurator and code">
          <button
            aria-pressed={activeView === "resource"}
            className={activeView === "resource" ? styles.panelModeButtonActive : styles.panelModeButton}
            onClick={() => requestView("resource")}
            title="Resources"
            type="button"
          >
            <GalleryVerticalEnd size={16} aria-hidden="true" />
          </button>
          <button
            aria-pressed={activeView === "terraform"}
            className={activeView === "terraform" ? styles.panelModeButtonActive : styles.panelModeButton}
            data-terraform-editor-navigation
            onClick={() => requestView("terraform")}
            title="Terraform code"
            type="button"
          >
            <Code2 size={16} aria-hidden="true" />
          </button>
        </div>
        <button
          aria-pressed={activeView === "issues"}
          className={
            activeView === "issues"
              ? `${styles.panelModeTextButton} ${styles.panelModeTextButtonActive}`
              : styles.panelModeTextButton
          }
          data-terraform-issues-navigation
          onClick={() => requestView("issues")}
          type="button"
        >
          <AlertCircle size={14} aria-hidden="true" />
          <span>Issues</span>
          <span
            className={hasTerraformIssueErrors ? styles.panelIssueBadgeError : styles.panelIssueBadge}
            aria-label={`${terraformDiagnostics.length} issues`}
          >
            {terraformDiagnostics.length}
          </span>
        </button>
        <button
          aria-pressed={activeView === "deployment"}
          className={
            activeView === "deployment"
              ? `${styles.panelModeTextButton} ${styles.panelModeTextButtonActive}`
              : styles.panelModeTextButton
          }
          onClick={() => requestView("deployment")}
          type="button"
        >
          <Rocket size={14} aria-hidden="true" />
          <span>Deploy</span>
        </button>
        <div className={styles.panelPlanSplitButton}>
          <button
            className={styles.panelPlanMainButton}
            onClick={openDeploymentFromPlan}
            type="button"
          >
            <Play size={14} aria-hidden="true" />
            <span>Plan</span>
          </button>
          <button
            aria-expanded={isPlanActionStripOpen}
            className={styles.panelPlanExpandButton}
            onClick={() => setIsPlanActionStripOpen((isOpen) => !isOpen)}
            title="Plan actions"
            type="button"
          >
            <ChevronRight size={14} aria-hidden="true" />
          </button>
        </div>
        {isPlanActionStripOpen ? (
          <div className={styles.panelPlanActionStrip} role="group" aria-label="Plan actions">
            <button
              className={`${styles.panelPlanActionButton} ${styles.panelPlanActionButtonActive}`}
              onClick={openDeploymentFromPlan}
              type="button"
            >
              Plan
            </button>
            <button
              className={styles.panelPlanActionButton}
              onClick={openDeploymentFromPlan}
              type="button"
            >
              Validate
            </button>
            <button
              className={styles.panelPlanActionButton}
              onClick={openDeploymentFromPlan}
              type="button"
            >
              Apply
            </button>
            <button
              className={`${styles.panelPlanActionButton} ${styles.panelPlanActionDangerButton}`}
              onClick={openDeploymentFromPlan}
              type="button"
            >
              Destroy
            </button>
          </div>
        ) : null}
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
          onDiagnosticsChange={handleTerraformDiagnosticsChange}
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
          onTerraformPreviewAiRequest={onTerraformPreviewAiRequest}
        />
      </div>
      <div className={styles.rightPanelView} hidden={activeView !== "issues"}>
        <TerraformIssuesPanel issues={terraformIssues} onResolveWithAi={handleTerraformIssueAiClick} />
      </div>
      <div className={styles.rightPanelView} hidden={activeView !== "deployment"}>
        {activeView === "deployment" ? (
          <DeploymentPanel
            currentNodeCount={context.nodes.length}
            diagramJson={context.diagram}
            hasUnsavedDeploymentBaseline={hasUnsavedDeploymentBaseline}
            onOpenFindingTerraformSource={openPreDeploymentFindingTerraformSource}
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
          saveMessage={terraformLeaveSaveMessage}
          saveState={terraformLeaveSaveState}
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

function isTerraformLeaveGuardIgnoredTarget(target: Node): boolean {
  return target instanceof Element && Boolean(target.closest("[data-terraform-leave-guard-ignore]"));
}

function isTerraformEditorNavigationTarget(target: Node): boolean {
  return target instanceof Element && Boolean(target.closest("[data-terraform-editor-navigation]"));
}

function isTerraformIssuesNavigationTarget(target: Node): boolean {
  return target instanceof Element && Boolean(target.closest("[data-terraform-issues-navigation]"));
}

function isTerraformIssueAiResolutionTarget(target: Node): boolean {
  return target instanceof Element && Boolean(target.closest("[data-terraform-issue-ai-resolution]"));
}
