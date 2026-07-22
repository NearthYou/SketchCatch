"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent
} from "react";
import {
  type ArchitectureDiagnostic,
  type CheckFinding,
  type LiveObservationV2Session,
  type LiveObservationV2Snapshot,
  type TerraformDiagnostic,
  type TerraformSourceLocation,
  type TerraformSyncFileInput
} from "@sketchcatch/types";
import {
  createArchitectureRuleInputFingerprint,
  evaluateArchitectureDependencies
} from "@sketchcatch/types/architecture-dependency-rules";
import { createPortal } from "react-dom";
import {
  Activity,
  CloudDownload,
  Code2,
  GalleryVerticalEnd,
  PanelRightClose,
  PanelRightOpen,
  Rocket,
  X
} from "lucide-react";
import type { DiagramEditorPanelContext } from "../diagram-editor";
import {
  DeploymentPanel,
  initialPreDeploymentCheckState,
  type DeploymentPreDeploymentCheckState
} from "./DeploymentPanel";
import { ResourceWorkspacePanel } from "./ResourceWorkspacePanel";
import { ReverseEngineeringPanel } from "./ReverseEngineeringPanel";
import {
  TerraformCodePanel,
  type TerraformFilesReplacementRequest,
  type TerraformCodePanelHandle
} from "./TerraformCodePanel";
import { WorkspaceIssuesPanel } from "./WorkspaceIssuesPanel";
import { TerraformLeaveDialog } from "./TerraformLeaveDialog";
import { LiveObservationModal } from "./LiveObservationModal";
import {
  incrementLiveObservationEcsMaxCapacity,
  type LiveObservationTerraformUpdateResult
} from "./live-observation-terraform-update";
import type { LiveObservationSelection } from "./live-observation";
import {
  createLiveObservationViewState,
  readLiveObservationViewState,
  selectLiveObservationDeployment
} from "./live-observation-view-state";
import {
  createLiveObservationSessionState,
  readLiveObservationSessionState,
  retainLiveObservationSession,
  retainLiveObservationSnapshot
} from "./live-observation-session-state";
import {
  createWorkspaceOverlayNotifications,
  type WorkspaceOverlayNotifications
} from "./workspace-overlay-notifications";
import { defaultResourceWorkspaceView } from "./resource-workspace-view";
import { getPreDeploymentFindingTerraformSourceLocation } from "./pre-deployment-finding-source";
import {
  saveWorkspaceTerraformArtifact,
  type PreparedWorkspaceDeploymentArtifacts,
  type SavedWorkspaceTerraformArtifact
} from "./workspace-deployment-artifacts";
import {
  prepareWorkspaceTerraformSource,
  validateWorkspaceTerraformFiles,
  WorkspaceTerraformPreparationError,
  type PreparedTerraformArtifactSource
} from "./workspace-terraform-preparation";
import { requireSavedProjectDraftRevision } from "./project-deployment-preparation";
import { DeploymentPreparationError } from "./deployment-preparation-error";
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
import { replaceArchitectureDiagnostics } from "./architecture-diagnostics-state";
import type {
  WorkspaceTerraformAiCodeContext,
  WorkspaceTerraformAiContext,
  TerraformSafeFixApplyRequest,
  TerraformSafeFixApplyResult
} from "./workspace-terraform-ai";
import {
  createWorkspaceTerraformFingerprint,
  EMPTY_WORKSPACE_TERRAFORM_AI_CONTEXT
} from "./workspace-terraform-ai";
import type { ResourceWorkspaceView, WorkspaceRightPanelView } from "./workspace-right-panel.types";
import type { DeploymentAvailability } from "./deployment-availability";
import type { InitialCicdReturnCommand } from "./cicd-return-command";
import type { WorkspaceReverseEngineeringEntryResult } from "./workspace-reverse-engineering-entry";
import styles from "./workspace.module.css";

export type WorkspaceRightPanelProps = {
  readonly context: DiagramEditorPanelContext;
  readonly deploymentAvailability: DeploymentAvailability;
  readonly deploymentOpenRequestId?: number | undefined;
  readonly hasUnsavedProjectDraft?: boolean | undefined;
  readonly initialView?: WorkspaceRightPanelView | undefined;
  readonly initialCicdReturnCommand?: InitialCicdReturnCommand | undefined;
  readonly initialTerraformFiles?: readonly TerraformSyncFileInput[] | undefined;
  readonly onInitialCicdReturnCommandReady?: ((cleanedHref: string) => void) | undefined;
  readonly terraformFilesReplacement?: TerraformFilesReplacementRequest | null | undefined;
  readonly onBlockingPanelOpenChange: (isOpen: boolean) => void;
  readonly onDeploymentConsoleOpenChange?: ((isOpen: boolean) => void) | undefined;
  readonly onPanelOpenRequest: () => void;
  readonly onLiveObservationTerraformFilesApply?:
    | ((files: readonly TerraformSyncFileInput[]) => void)
    | undefined;
  readonly onReverseEngineeringOpenRequest?:
    | (() => Promise<WorkspaceReverseEngineeringEntryResult>)
    | undefined;
  readonly onSelectTerraformIssue: (diagnosticKey: string | null) => void;
  readonly onTerraformAiContextChange: (context: WorkspaceTerraformAiContext) => void;
  readonly onTerraformAiInteraction: (
    scope: "draft" | "errors" | "preview",
    diagnosticKey?: string | undefined
  ) => void;
  readonly onTerraformSafeFixApplyResult: (result: TerraformSafeFixApplyResult) => void;
  readonly projectId: string;
  readonly projectDraftRevision?: number | null | undefined;
  readonly projectName: string;
  readonly onTerraformFilesChange?:
    | ((files: readonly TerraformSyncFileInput[]) => void)
    | undefined;
  readonly onTerraformFilesReplacementApplied?: ((id: number) => void) | undefined;
  readonly selectedTerraformIssueKey: string | null;
  readonly terraformSafeFixApplyRequest: TerraformSafeFixApplyRequest | null;
};

type PendingTerraformLeaveAction =
  | { readonly kind: "view"; readonly view: WorkspaceRightPanelView }
  | { readonly kind: "deployment-console" }
  | { readonly kind: "reverse-engineering" }
  | { readonly kind: "right-panel-close" }
  | { readonly kind: "replay-click"; readonly target: HTMLElement };

const DEFAULT_TERRAFORM_CODE_PANE_RATIO = 62;
const MIN_TERRAFORM_CODE_PANE_RATIO = 32;
const MAX_TERRAFORM_CODE_PANE_RATIO = 78;
const TERRAFORM_SPLIT_KEYBOARD_STEP = 4;

// 오른쪽 패널은 현재 Project를 서버에 저장한 뒤에만 AWS 구조 가져오기를 열어줍니다.
export function WorkspaceRightPanel({
  context,
  deploymentAvailability,
  deploymentOpenRequestId = 0,
  hasUnsavedProjectDraft = false,
  initialCicdReturnCommand,
  initialView,
  initialTerraformFiles,
  terraformFilesReplacement,
  onBlockingPanelOpenChange,
  onDeploymentConsoleOpenChange = noopDeploymentConsoleOpenChange,
  onPanelOpenRequest,
  onInitialCicdReturnCommandReady,
  onLiveObservationTerraformFilesApply,
  onReverseEngineeringOpenRequest,
  onSelectTerraformIssue,
  onTerraformAiContextChange,
  onTerraformAiInteraction,
  onTerraformSafeFixApplyResult,
  projectId,
  projectDraftRevision = null,
  projectName,
  onTerraformFilesChange,
  onTerraformFilesReplacementApplied,
  selectedTerraformIssueKey,
  terraformSafeFixApplyRequest
}: WorkspaceRightPanelProps) {
  const terraformPanelRef = useRef<TerraformCodePanelHandle | null>(null);
  const terraformSplitRef = useRef<HTMLDivElement | null>(null);
  const terraformViewRef = useRef<HTMLDivElement | null>(null);
  const pendingTerraformLeaveActionRef = useRef<PendingTerraformLeaveAction | null>(null);
  const skipTerraformLeaveGuardRef = useRef(false);
  const latestTerraformDiagnosticsRef = useRef<TerraformDiagnostic[]>([]);
  const latestTerraformFilesRef = useRef<TerraformSyncFileInput[]>(
    initialTerraformFiles?.map((file) => ({ ...file })) ?? []
  );
  const latestTerraformSaveRequestIdRef = useRef(0);
  const overlayNotificationsRef = useRef<WorkspaceOverlayNotifications | null>(null);
  if (overlayNotificationsRef.current === null) {
    overlayNotificationsRef.current = createWorkspaceOverlayNotifications(
      onBlockingPanelOpenChange,
      onDeploymentConsoleOpenChange
    );
  }
  const [activeView, setActiveView] = useState<WorkspaceRightPanelView>(
    initialView === "deployment" ? "resource" : (initialView ?? "resource")
  );
  const [resourceWorkspaceView, setResourceWorkspaceView] = useState<ResourceWorkspaceView>(
    defaultResourceWorkspaceView
  );
  const [hasUnsavedTerraformChanges, setHasUnsavedTerraformChanges] = useState(false);
  const [isReverseEngineeringOpen, setReverseEngineeringOpen] = useState(false);
  const [isReverseEngineeringPreparing, setReverseEngineeringPreparing] = useState(false);
  const [reverseEngineeringEntryMessage, setReverseEngineeringEntryMessage] = useState<
    string | null
  >(null);
  const [isDeploymentBaselineDirty, setIsDeploymentBaselineDirty] = useState(false);
  const [lastSavedDeploymentBaselineFingerprint, setLastSavedDeploymentBaselineFingerprint] =
    useState<string | null>(() => toDeploymentBaselineFingerprint(context.diagram));
  const [showTerraformLeaveDialog, setShowTerraformLeaveDialog] = useState(false);
  const [terraformLeaveSaveState, setTerraformLeaveSaveState] =
    useState<TerraformLeaveSaveState>("idle");
  const [terraformLeaveSaveMessage, setTerraformLeaveSaveMessage] = useState("");
  const [terraformSaveRequestId, setTerraformSaveRequestId] = useState(0);
  const [terraformDiscardRequestId, setTerraformDiscardRequestId] = useState(0);
  const [terraformCodePaneRatio, setTerraformCodePaneRatio] = useState(
    DEFAULT_TERRAFORM_CODE_PANE_RATIO
  );
  const [terraformIssues, setTerraformIssues] = useState<TerraformIssueRecord[]>([]);
  const [terraformAiCodeContext, setTerraformAiCodeContext] =
    useState<WorkspaceTerraformAiCodeContext>(() => ({
      combinedTerraformCode: EMPTY_WORKSPACE_TERRAFORM_AI_CONTEXT.combinedTerraformCode,
      files: EMPTY_WORKSPACE_TERRAFORM_AI_CONTEXT.files,
      fingerprint: EMPTY_WORKSPACE_TERRAFORM_AI_CONTEXT.fingerprint,
      reviewScope: EMPTY_WORKSPACE_TERRAFORM_AI_CONTEXT.reviewScope
    }));
  const [architectureDiagnostics, setArchitectureDiagnostics] = useState<ArchitectureDiagnostic[]>(
    []
  );
  const [loadedTerraformIssuesProjectId, setLoadedTerraformIssuesProjectId] = useState<
    string | null
  >(null);
  const [pendingTerraformIssueFixSourceLocation, setPendingTerraformIssueFixSourceLocation] =
    useState<TerraformSourceLocation | null>(null);
  const [preDeploymentCheckState, setPreDeploymentCheckState] =
    useState<DeploymentPreDeploymentCheckState>(initialPreDeploymentCheckState);
  const [isDeploymentConsoleOpen, setIsDeploymentConsoleOpen] = useState(
    initialView === "deployment" || initialCicdReturnCommand?.shouldOpenDeploymentConsole === true
  );

  useEffect(() => {
    if (deploymentOpenRequestId > 0) {
      onPanelOpenRequest();
      setIsDeploymentConsoleOpen(true);
    }
  }, [deploymentOpenRequestId, onPanelOpenRequest]);

  useEffect(() => {
    latestTerraformFilesRef.current = initialTerraformFiles?.map((file) => ({ ...file })) ?? [];
  }, [initialTerraformFiles]);
  const [canRenderDeploymentPortal, setCanRenderDeploymentPortal] = useState(false);
  const [isLiveObservationOpen, setIsLiveObservationOpen] = useState(false);
  const [liveObservationSelection, setLiveObservationSelection] =
    useState<LiveObservationSelection | null>(null);
  const [liveObservationViewState, setLiveObservationViewState] = useState(() =>
    createLiveObservationViewState(projectId)
  );
  const retainedLiveObservationView = readLiveObservationViewState(
    liveObservationViewState,
    projectId
  );
  const [liveObservationSessionState, setLiveObservationSessionState] = useState(() =>
    createLiveObservationSessionState(projectId)
  );
  const retainedLiveObservationSession = readLiveObservationSessionState(
    liveObservationSessionState,
    projectId
  );
  const [liveObservationIncidentSnapshot, setLiveObservationIncidentSnapshot] =
    useState<LiveObservationV2Snapshot | null>(null);
  const [liveObservationAppliedTerraformUpdate, setLiveObservationAppliedTerraformUpdate] =
    useState<LiveObservationTerraformUpdateResult | null>(null);

  useEffect(() => {
    setLiveObservationIncidentSnapshot(null);
    setLiveObservationAppliedTerraformUpdate(null);
  }, [projectId]);

  useEffect(() => {
    overlayNotificationsRef.current?.setCallbacks(
      onBlockingPanelOpenChange,
      onDeploymentConsoleOpenChange
    );
  }, [onBlockingPanelOpenChange, onDeploymentConsoleOpenChange]);

  useEffect(() => {
    overlayNotificationsRef.current?.notifyBlockingPanel(
      isDeploymentConsoleOpen || isLiveObservationOpen
    );
  }, [isDeploymentConsoleOpen, isLiveObservationOpen]);

  useEffect(() => {
    overlayNotificationsRef.current?.notifyDeploymentConsole(isDeploymentConsoleOpen);
  }, [isDeploymentConsoleOpen]);

  useEffect(
    () => () => {
      overlayNotificationsRef.current?.reset();
    },
    []
  );
  const latestTerraformSafeFixApplyRequestIdRef = useRef<number | null>(null);
  const terraformDiagnostics = useMemo(
    () => terraformIssues.map((issue) => issue.diagnostic),
    [terraformIssues]
  );
  const architectureInputFingerprint = useMemo(
    () => createArchitectureRuleInputFingerprint(context.diagram),
    [context.diagram]
  );
  const contextualArchitectureDiagram = useMemo(
    () => context.diagram,
    [architectureInputFingerprint]
  );
  const hasIssueErrors =
    terraformDiagnostics.some((diagnostic) => diagnostic.severity === "error") ||
    architectureDiagnostics.some((diagnostic) => diagnostic.severity === "error");
  const issueCount = terraformDiagnostics.length + architectureDiagnostics.length;
  const currentDeploymentBaselineFingerprint = useMemo(
    () => toDeploymentBaselineFingerprint(context.diagram),
    [context.diagram]
  );
  const hasUnsavedDeploymentBaseline =
    hasUnsavedProjectDraft ||
    isDeploymentBaselineDirty ||
    lastSavedDeploymentBaselineFingerprint !== currentDeploymentBaselineFingerprint;

  useEffect(() => {
    setCanRenderDeploymentPortal(true);
  }, []);

  const handleTerraformDirtyChange = useCallback((isDirty: boolean): void => {
    setHasUnsavedTerraformChanges(isDirty);

    if (isDirty) {
      setIsDeploymentBaselineDirty(true);
      setTerraformIssues((currentIssues) => markTerraformIssuesStale(currentIssues));
    }
  }, []);

  const handleTerraformDiagnosticsChange = useCallback(
    (diagnostics: TerraformDiagnostic[]): void => {
      latestTerraformDiagnosticsRef.current = diagnostics;
      const validatedAt = new Date().toISOString();
      setTerraformIssues((currentIssues) => {
        return mergeTerraformValidationDiagnostics(currentIssues, diagnostics, validatedAt);
      });
    },
    []
  );

  const handleWorkspaceTerraformFilesChange = useCallback(
    (files: readonly TerraformSyncFileInput[]): void => {
      const nextFiles = files.map((file) => ({ ...file }));
      latestTerraformFilesRef.current = nextFiles;
      onTerraformFilesChange?.(nextFiles);
    },
    [onTerraformFilesChange]
  );

  const openTerraformIssueSourceLocation = useCallback(
    (sourceLocation: TerraformSourceLocation): void => {
      context.setRightPanelOpen(true);
      setActiveView("terraform");
      setPendingTerraformIssueFixSourceLocation(sourceLocation);
    },
    [context]
  );

  const handleTerraformIssueSelection = useCallback(
    (issue: TerraformIssueRecord): void => {
      const sourceLocation = getTerraformIssueSourceLocation(issue);
      openTerraformIssueSourceLocation(sourceLocation);
      onSelectTerraformIssue(issue.diagnosticKey);
      onTerraformAiInteraction("errors", issue.diagnosticKey);
    },
    [onSelectTerraformIssue, onTerraformAiInteraction, openTerraformIssueSourceLocation]
  );

  const handleResourceWorkspaceViewChange = useCallback(
    (nextView: ResourceWorkspaceView): void => {
      setResourceWorkspaceView(nextView);
      onTerraformAiInteraction("draft");
    },
    [onTerraformAiInteraction]
  );

  useEffect(() => {
    onTerraformAiContextChange({
      ...terraformAiCodeContext,
      issues: terraformIssues
    });
  }, [onTerraformAiContextChange, terraformAiCodeContext, terraformIssues]);

  useEffect(() => {
    if (
      selectedTerraformIssueKey !== null &&
      terraformIssues.some((issue) => issue.diagnosticKey === selectedTerraformIssueKey)
    ) {
      return;
    }

    const nextIssue =
      terraformIssues.find((issue) => issue.diagnostic.severity === "error") ??
      terraformIssues[0] ??
      null;
    onSelectTerraformIssue(nextIssue?.diagnosticKey ?? null);
  }, [onSelectTerraformIssue, selectedTerraformIssueKey, terraformIssues]);

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
    setPreDeploymentCheckState(initialPreDeploymentCheckState);
  }, [projectId]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setArchitectureDiagnostics((currentDiagnostics) =>
        replaceArchitectureDiagnostics(
          currentDiagnostics,
          evaluateArchitectureDependencies(contextualArchitectureDiagram, "contextual")
        )
      );
    }, 300);

    return () => window.clearTimeout(timerId);
  }, [architectureInputFingerprint, contextualArchitectureDiagram]);

  const handleArchitectureDiagnosticsChange = useCallback(
    (diagnostics: ArchitectureDiagnostic[]): void => {
      setArchitectureDiagnostics((currentDiagnostics) =>
        replaceArchitectureDiagnostics(currentDiagnostics, diagnostics)
      );
    },
    []
  );

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

    if (!context.isRightPanelOpen || activeView !== "terraform" || !terraformPanelRef.current) {
      context.setRightPanelOpen(true);
      setActiveView("terraform");
      return;
    }

    latestTerraformSafeFixApplyRequestIdRef.current = request.id;

    async function applySafeFix(): Promise<void> {
      const panel = terraformPanelRef.current;

      if (!panel) {
        onTerraformSafeFixApplyResult({
          requestId: request.id,
          applied: false,
          message: "Terraform 패널이 준비되지 않아 적용하지 못했습니다."
        });
        return;
      }

      const currentFingerprint = createWorkspaceTerraformFingerprint(
        panel.getTerraformFiles().map((file) => ({
          fileName: file.fileName,
          terraformCode: file.code
        }))
      );

      if (currentFingerprint !== request.expectedTerraformFingerprint) {
        onTerraformSafeFixApplyResult({
          requestId: request.id,
          applied: false,
          message: "Terraform 코드가 변경되어 수정안을 적용하지 않았습니다. 다시 분석하세요."
        });
        return;
      }

      const result = await panel.applyTerraformSafeFixes(request.fixes);

      if (result?.applied) {
        const sourceLocation = getTerraformIssueFixSourceLocation(request);
        openTerraformIssueSourceLocation(sourceLocation);
      }

      onTerraformSafeFixApplyResult({
        requestId: request.id,
        applied: result?.applied ?? false,
        message: result?.message ?? "Terraform 패널이 준비되지 않아 적용하지 못했습니다."
      });
    }

    void applySafeFix();
  }, [
    activeView,
    context,
    onTerraformSafeFixApplyResult,
    openTerraformIssueSourceLocation,
    terraformSafeFixApplyRequest
  ]);

  useEffect(() => {
    if (
      activeView !== "terraform" ||
      !context.isRightPanelOpen ||
      pendingTerraformIssueFixSourceLocation === null
    ) {
      return;
    }

    terraformPanelRef.current?.openTerraformSourceLocation(pendingTerraformIssueFixSourceLocation);
    setPendingTerraformIssueFixSourceLocation(null);
  }, [activeView, context.isRightPanelOpen, pendingTerraformIssueFixSourceLocation]);

  const requestTerraformLeave = useCallback(
    (action: PendingTerraformLeaveAction): boolean => {
      if (!hasUnsavedTerraformChanges || skipTerraformLeaveGuardRef.current) {
        return true;
      }

      pendingTerraformLeaveActionRef.current = action;
      setTerraformLeaveSaveState("idle");
      setTerraformLeaveSaveMessage("");
      setShowTerraformLeaveDialog(true);
      return false;
    },
    [hasUnsavedTerraformChanges]
  );

  /** AWS 후보를 닫을 때 실제 Board는 건드리지 않고 미리보기만 제거합니다. */
  const closeReverseEngineering = useCallback((): boolean => {
    if (context.isMutationLocked) {
      setReverseEngineeringEntryMessage("적용 결과를 확인하고 있습니다. 잠시만 기다려주세요.");
      return false;
    }

    context.setPreviewDiagram(null);
    setReverseEngineeringOpen(false);
    setReverseEngineeringEntryMessage(null);
    return true;
  }, [context]);

  /** 현재 Project의 서버 저장이 확인된 경우에만 AWS 스캔 화면을 엽니다. */
  const performReverseEngineeringOpen = useCallback(async (): Promise<void> => {
    if (!onReverseEngineeringOpenRequest || isReverseEngineeringPreparing) {
      return;
    }

    setReverseEngineeringPreparing(true);
    setReverseEngineeringEntryMessage(null);

    try {
      const result = await onReverseEngineeringOpenRequest();

      if (!result.ok) {
        setReverseEngineeringEntryMessage(result.message);
        return;
      }

      onPanelOpenRequest();
      context.setRightPanelOpen(true);
      context.setPreviewDiagram(context.diagram);
      setReverseEngineeringOpen(true);
    } catch {
      setReverseEngineeringEntryMessage(
        "현재 보드를 준비하지 못했습니다. 저장 상태를 확인한 뒤 다시 시도해주세요."
      );
    } finally {
      setReverseEngineeringPreparing(false);
    }
  }, [context, isReverseEngineeringPreparing, onPanelOpenRequest, onReverseEngineeringOpenRequest]);

  /** Terraform 저장 확인 뒤 사용자가 고른 원래 작업을 한 번만 이어갑니다. */
  const runPendingTerraformLeaveAction = useCallback((): void => {
    const pendingAction = pendingTerraformLeaveActionRef.current;
    pendingTerraformLeaveActionRef.current = null;

    if (!pendingAction) {
      return;
    }

    skipTerraformLeaveGuardRef.current = true;

    try {
      if (pendingAction.kind === "view") {
        onPanelOpenRequest();
        setActiveView(pendingAction.view);
        onTerraformAiInteraction(pendingAction.view === "terraform" ? "preview" : "draft");
        return;
      }

      if (pendingAction.kind === "deployment-console") {
        onPanelOpenRequest();
        setIsDeploymentConsoleOpen(true);
        return;
      }

      if (pendingAction.kind === "reverse-engineering") {
        void performReverseEngineeringOpen();
        return;
      }

      if (pendingAction.kind === "right-panel-close") {
        context.setRightPanelOpen(false);
        return;
      }

      pendingAction.target.click();
    } finally {
      window.setTimeout(() => {
        skipTerraformLeaveGuardRef.current = false;
      }, 0);
    }
  }, [context, onPanelOpenRequest, onTerraformAiInteraction, performReverseEngineeringOpen]);

  /** Terraform 편집 내용이 남아 있으면 기존 저장 확인을 거친 뒤 AWS 스캔을 시작합니다. */
  const requestReverseEngineeringOpen = useCallback((): void => {
    if (isReverseEngineeringOpen) {
      closeReverseEngineering();
      return;
    }

    if (context.isMutationLocked) {
      setReverseEngineeringEntryMessage("다른 Board 적용이 끝난 뒤 다시 시도해주세요.");
      context.setRightPanelOpen(true);
      return;
    }

    onPanelOpenRequest();
    context.setRightPanelOpen(true);

    if (!requestTerraformLeave({ kind: "reverse-engineering" })) {
      return;
    }

    void performReverseEngineeringOpen();
  }, [
    closeReverseEngineering,
    context,
    isReverseEngineeringOpen,
    onPanelOpenRequest,
    performReverseEngineeringOpen,
    requestTerraformLeave
  ]);

  /** 다른 오른쪽 작업으로 이동하면 적용 전 AWS 후보 미리보기만 닫습니다. */
  const requestView = useCallback(
    (nextView: WorkspaceRightPanelView): void => {
      if (isReverseEngineeringOpen) {
        if (!closeReverseEngineering()) {
          return;
        }
        onPanelOpenRequest();
        setActiveView(nextView);
        onTerraformAiInteraction(nextView === "terraform" ? "preview" : "draft");
        return;
      }

      if (nextView === activeView) {
        onPanelOpenRequest();
        onTerraformAiInteraction(nextView === "terraform" ? "preview" : "draft");
        return;
      }

      if (nextView === "terraform") {
        onPanelOpenRequest();
        setActiveView("terraform");
        onTerraformAiInteraction("preview");
        return;
      }

      if (!requestTerraformLeave({ kind: "view", view: nextView })) {
        return;
      }

      onPanelOpenRequest();
      setActiveView(nextView);
      onTerraformAiInteraction("draft");
    },
    [
      activeView,
      closeReverseEngineering,
      isReverseEngineeringOpen,
      onPanelOpenRequest,
      onTerraformAiInteraction,
      requestTerraformLeave
    ]
  );

  const startTerraformSplitResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      const splitElement = terraformSplitRef.current;

      if (!splitElement) {
        return;
      }

      event.preventDefault();
      const splitBounds = splitElement.getBoundingClientRect();

      if (splitBounds.height <= 0) {
        return;
      }

      const resizeHandle = event.currentTarget;
      const pointerId = event.pointerId;

      resizeHandle.setPointerCapture(pointerId);

      const updateTerraformCodePaneRatio = (clientY: number): void => {
        const nextRatio = ((clientY - splitBounds.top) / splitBounds.height) * 100;
        setTerraformCodePaneRatio(clampTerraformCodePaneRatio(nextRatio));
      };

      const handlePointerMove = (pointerEvent: PointerEvent): void => {
        updateTerraformCodePaneRatio(pointerEvent.clientY);
      };

      const stopTerraformSplitResize = (): void => {
        if (resizeHandle.hasPointerCapture(pointerId)) {
          resizeHandle.releasePointerCapture(pointerId);
        }

        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", stopTerraformSplitResize);
        window.removeEventListener("pointercancel", stopTerraformSplitResize);
      };

      updateTerraformCodePaneRatio(event.clientY);
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", stopTerraformSplitResize);
      window.addEventListener("pointercancel", stopTerraformSplitResize);
    },
    []
  );

  const handleTerraformSplitKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>): void => {
      if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
        return;
      }

      event.preventDefault();
      setTerraformCodePaneRatio((currentRatio) => {
        if (event.key === "Home") {
          return MIN_TERRAFORM_CODE_PANE_RATIO;
        }

        if (event.key === "End") {
          return MAX_TERRAFORM_CODE_PANE_RATIO;
        }

        const delta =
          event.key === "ArrowUp" ? -TERRAFORM_SPLIT_KEYBOARD_STEP : TERRAFORM_SPLIT_KEYBOARD_STEP;

        return clampTerraformCodePaneRatio(currentRatio + delta);
      });
    },
    []
  );

  const openDeploymentConsole = useCallback((): void => {
    if (!requestTerraformLeave({ kind: "deployment-console" })) {
      return;
    }

    onPanelOpenRequest();
    setIsDeploymentConsoleOpen(true);
  }, [onPanelOpenRequest, requestTerraformLeave]);

  const openLiveObservation = useCallback(
    (selection?: LiveObservationSelection): void => {
      onPanelOpenRequest();
      setLiveObservationSelection(selection ?? null);
      setIsLiveObservationOpen(true);
    },
    [onPanelOpenRequest]
  );

  const applyLiveObservationTerraformUpdate =
    useCallback(async (): Promise<LiveObservationTerraformUpdateResult> => {
      const result = incrementLiveObservationEcsMaxCapacity(terraformAiCodeContext.files);

      if (onLiveObservationTerraformFilesApply) {
        onLiveObservationTerraformFilesApply(result.files);
      } else {
        onTerraformFilesChange?.(result.files);
      }

      const saveResult = await context.saveDiagramNow?.();
      requireSavedProjectDraftRevision(saveResult);
      setHasUnsavedTerraformChanges(false);
      setIsDeploymentBaselineDirty(false);
      return result;
    }, [
      context,
      onLiveObservationTerraformFilesApply,
      onTerraformFilesChange,
      terraformAiCodeContext.files
    ]);

  const openLiveObservationTerraformEditor = useCallback((): void => {
    setIsLiveObservationOpen(false);
    setLiveObservationSelection(null);

    if (liveObservationAppliedTerraformUpdate) {
      openTerraformIssueSourceLocation({
        fileName: liveObservationAppliedTerraformUpdate.fileName,
        line: liveObservationAppliedTerraformUpdate.line,
        resourceAddress: liveObservationAppliedTerraformUpdate.address
      });
    } else {
      context.setRightPanelOpen(true);
      setActiveView("terraform");
    }

    onTerraformAiInteraction("preview");
  }, [
    context,
    liveObservationAppliedTerraformUpdate,
    onTerraformAiInteraction,
    openTerraformIssueSourceLocation
  ]);

  const updateLiveObservationDeployment = useCallback(
    (deploymentId: string): void => {
      setLiveObservationIncidentSnapshot(null);
      setLiveObservationAppliedTerraformUpdate(null);
      setLiveObservationViewState((current) =>
        selectLiveObservationDeployment(current, projectId, deploymentId)
      );
    },
    [projectId]
  );

  const updateLiveObservationSession = useCallback(
    (session: LiveObservationV2Session | null): void => {
      setLiveObservationIncidentSnapshot(null);
      setLiveObservationAppliedTerraformUpdate(null);
      setLiveObservationSessionState((current) =>
        retainLiveObservationSession(current, projectId, session)
      );
    },
    [projectId]
  );

  const updateLiveObservationSnapshot = useCallback(
    (snapshot: LiveObservationV2Snapshot | null): void => {
      setLiveObservationSessionState((current) =>
        retainLiveObservationSnapshot(current, projectId, snapshot)
      );
    },
    [projectId]
  );

  const applyTerraformLeaveSaveFeedback = useCallback(
    (feedback: TerraformLeaveSaveFeedback): void => {
      setTerraformLeaveSaveState(feedback.state);
      setTerraformLeaveSaveMessage(feedback.message);
    },
    []
  );

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
    if (nextView === "deployment") {
      openDeploymentConsole();
      return;
    }

    if (nextView === "terraform") {
      context.setRightPanelOpen(true);
      setActiveView("terraform");
      onTerraformAiInteraction("preview");
      return;
    }

    if (!requestTerraformLeave({ kind: "view", view: nextView })) {
      return;
    }

    context.setRightPanelOpen(true);
    setActiveView(nextView);
    onTerraformAiInteraction("draft");
  }

  /** 오른쪽 패널을 닫아도 적용 전 AWS 후보가 실제 Board에 남지 않게 합니다. */
  function requestRightPanelClose(): void {
    if (isReverseEngineeringOpen) {
      if (!closeReverseEngineering()) {
        return;
      }
      context.setRightPanelOpen(false);
      return;
    }

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

  const prepareDeploymentArtifacts =
    useCallback(async (): Promise<PreparedWorkspaceDeploymentArtifacts> => {
      const requestDiagramRevision = context.getDiagramRevision();
      let preparedSource: PreparedTerraformArtifactSource;

      try {
        const prepared = await prepareWorkspaceTerraformSource({
          diagramJson: context.diagram,
          terraformFiles: latestTerraformFilesRef.current
        });

        if (requestDiagramRevision !== context.getDiagramRevision()) {
          throw new Error("Terraform 준비 중 Architecture Board가 변경되었습니다.");
        }

        preparedSource = prepared;
        handleTerraformDiagnosticsChange([...prepared.diagnostics]);
        if (prepared.architectureDiagnostics) {
          handleArchitectureDiagnosticsChange([...prepared.architectureDiagnostics]);
        }
        context.applyDiagramJson(prepared.diagramJson);
        handleWorkspaceTerraformFilesChange(prepared.terraformFiles);
      } catch (cause) {
        if (cause instanceof WorkspaceTerraformPreparationError) {
          handleTerraformDiagnosticsChange([...cause.diagnostics]);
          if (cause.architectureDiagnostics.length > 0) {
            handleArchitectureDiagnosticsChange([...cause.architectureDiagnostics]);
          }
        }
        throw new DeploymentPreparationError({ cause, stage: "terraform_prepare" });
      }

      let saveResult: unknown;

      try {
        saveResult = await context.saveDiagramNow?.();
      } catch (cause) {
        throw new DeploymentPreparationError({ cause, stage: "project_draft_save" });
      }

      let preparedDraftRevision: number;

      try {
        preparedDraftRevision = requireSavedProjectDraftRevision(saveResult);
      } catch (cause) {
        throw new DeploymentPreparationError({ cause, stage: "project_draft_save" });
      }

      const savedArtifacts = await savePreparedTerraformArtifact(preparedSource);

      setHasUnsavedTerraformChanges(false);
      setLastSavedDeploymentBaselineFingerprint(
        toDeploymentBaselineFingerprint(preparedSource.diagramJson)
      );
      setIsDeploymentBaselineDirty(false);

      return {
        ...savedArtifacts,
        diagramJson: preparedSource.diagramJson,
        preparedDraftRevision,
        terraformFiles: preparedSource.terraformFiles
      };
    }, [
      context,
      handleArchitectureDiagnosticsChange,
      handleTerraformDiagnosticsChange,
      handleWorkspaceTerraformFilesChange,
      savePreparedTerraformArtifact
    ]);

  const validateTerraformForPreDeployment = useCallback(async (): Promise<
    TerraformDiagnostic[]
  > => {
    const diagnostics = await validateWorkspaceTerraformFiles(latestTerraformFilesRef.current);
    handleTerraformDiagnosticsChange(diagnostics);
    return diagnostics;
  }, [handleTerraformDiagnosticsChange]);

  const openPreDeploymentFindingTerraformSource = useCallback(
    (finding: CheckFinding): TerraformSourceLocation | null => {
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
    },
    [context]
  );

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

  const deploymentConsoleContent =
    isDeploymentConsoleOpen && canRenderDeploymentPortal ? (
      <DeploymentPanel
        deploymentAvailability={deploymentAvailability}
        diagramJson={context.diagram}
        fullScreenOnly
        hasUnsavedDeploymentBaseline={hasUnsavedDeploymentBaseline}
        initialCicdReturnCommand={initialCicdReturnCommand}
        initialActiveScreen={initialView === "deployment" ? "cicd" : "deployment"}
        initialExpanded
        onInitialCicdReturnCommandReady={onInitialCicdReturnCommandReady}
        onExpandedClose={() => setIsDeploymentConsoleOpen(false)}
        onOpenLiveObservation={openLiveObservation}
        onOpenFindingTerraformSource={(finding) => {
          const sourceLocation = openPreDeploymentFindingTerraformSource(finding);

          if (sourceLocation) {
            setIsDeploymentConsoleOpen(false);
          }

          return sourceLocation;
        }}
        onPrepareDeploymentArtifacts={prepareDeploymentArtifacts}
        onPreDeploymentCheckStateChange={setPreDeploymentCheckState}
        onValidateTerraformDiagnostics={validateTerraformForPreDeployment}
        preDeploymentCheckState={preDeploymentCheckState}
        projectId={projectId}
        projectDraftRevision={projectDraftRevision}
        projectName={projectName}
      />
    ) : null;
  const deploymentConsole = deploymentConsoleContent
    ? createPortal(deploymentConsoleContent, document.body)
    : null;
  const liveObservationModal = isLiveObservationOpen ? (
    <LiveObservationModal
      appliedTerraformUpdate={liveObservationAppliedTerraformUpdate}
      onAppliedTerraformUpdateChange={setLiveObservationAppliedTerraformUpdate}
      onTrafficIncidentSnapshotChange={setLiveObservationIncidentSnapshot}
      onApplyTerraformUpdate={applyLiveObservationTerraformUpdate}
      onClose={() => {
        setIsLiveObservationOpen(false);
        setLiveObservationSelection(null);
      }}
      onSessionChange={updateLiveObservationSession}
      onOpenTerraformEditor={openLiveObservationTerraformEditor}
      onSelectedDeploymentIdChange={updateLiveObservationDeployment}
      onSnapshotChange={updateLiveObservationSnapshot}
      projectId={projectId}
      selectedDeploymentId={retainedLiveObservationView.selectedDeploymentId}
      session={retainedLiveObservationSession.session}
      selection={liveObservationSelection}
      snapshot={retainedLiveObservationSession.snapshot}
      terraformFiles={terraformAiCodeContext.files}
      trafficIncidentSnapshot={liveObservationIncidentSnapshot}
    />
  ) : null;
  const terraformSplitStyle = {
    "--terraform-code-pane-ratio": `${terraformCodePaneRatio}%`
  } as CSSProperties;

  if (!context.isRightPanelOpen) {
    return (
      <>
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
          {onReverseEngineeringOpenRequest ? (
            <button
              aria-label="AWS 구조 가져오기"
              className={styles.collapsedPanelButton}
              disabled={isReverseEngineeringPreparing || context.isMutationLocked}
              onClick={requestReverseEngineeringOpen}
              title="AWS 구조 가져오기"
              type="button"
            >
              <CloudDownload size={18} aria-hidden="true" />
            </button>
          ) : null}
          <button
            className={styles.collapsedPanelButton}
            data-terraform-editor-navigation
            onClick={() => openCollapsedView("terraform")}
            title="Terraform code"
            type="button"
          >
            <Code2 size={18} aria-hidden="true" />
            <span className={hasIssueErrors ? styles.panelIssueBadgeError : styles.panelIssueBadge}>
              {issueCount}
            </span>
          </button>
          <button
            className={styles.collapsedPanelButton}
            data-deployment-console-trigger
            onClick={openDeploymentConsole}
            title="Deploy"
            type="button"
          >
            <Rocket size={18} aria-hidden="true" />
          </button>
          <button
            aria-label="Live Observation"
            className={styles.collapsedPanelButton}
            onClick={() => openLiveObservation()}
            title="Live Observation"
            type="button"
          >
            <Activity size={18} aria-hidden="true" />
          </button>
        </aside>
        <div hidden>
          <TerraformCodePanel
            ref={terraformPanelRef}
            context={context}
            initialTerraformFiles={initialTerraformFiles}
            externalTerraformFilesReplacement={terraformFilesReplacement}
            externalDiscardRequestId={terraformDiscardRequestId}
            externalSaveRequestId={terraformSaveRequestId}
            isMutationLocked={context.isMutationLocked}
            isVisible={false}
            onArchitectureDiagnosticsChange={handleArchitectureDiagnosticsChange}
            onDiagnosticsChange={handleTerraformDiagnosticsChange}
            onDirtyChange={handleTerraformDirtyChange}
            onExternalSaveComplete={handleTerraformExternalSaveComplete}
            onTerraformAiCodeContextChange={setTerraformAiCodeContext}
            onTerraformAiInteraction={() => onTerraformAiInteraction("preview")}
            onTerraformFilesChange={onTerraformFilesChange}
            onTerraformFilesReplacementApplied={onTerraformFilesReplacementApplied}
          />
        </div>
        {deploymentConsole}
        {liveObservationModal}
      </>
    );
  }

  return (
    <>
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
          <div
            className={styles.panelModeIconGroup}
            role="group"
            aria-label="Configurator and code"
          >
            <button
              aria-pressed={activeView === "resource" && !isReverseEngineeringOpen}
              className={
                activeView === "resource" && !isReverseEngineeringOpen
                  ? styles.panelModeButtonActive
                  : styles.panelModeButton
              }
              onClick={() => requestView("resource")}
              title="Resources"
              type="button"
            >
              <GalleryVerticalEnd size={16} aria-hidden="true" />
            </button>
            <button
              aria-pressed={activeView === "terraform" && !isReverseEngineeringOpen}
              className={
                activeView === "terraform" && !isReverseEngineeringOpen
                  ? styles.panelModeButtonActive
                  : styles.panelModeButton
              }
              data-terraform-editor-navigation
              onClick={() => requestView("terraform")}
              title="Terraform code"
              type="button"
            >
              <Code2 size={16} aria-hidden="true" />
              <span
                className={hasIssueErrors ? styles.panelIssueBadgeError : styles.panelIssueBadge}
                aria-label={`${issueCount} issues`}
              >
                {issueCount}
              </span>
            </button>
            {onReverseEngineeringOpenRequest ? (
              <button
                aria-label="AWS 구조 가져오기"
                aria-pressed={isReverseEngineeringOpen}
                className={
                  isReverseEngineeringOpen
                    ? styles.panelModeTextButtonActive
                    : styles.panelModeTextButton
                }
                disabled={isReverseEngineeringPreparing || context.isMutationLocked}
                onClick={requestReverseEngineeringOpen}
                title={isReverseEngineeringOpen ? "AWS 구조 가져오기 닫기" : "AWS 구조 가져오기"}
                type="button"
              >
                <CloudDownload size={16} aria-hidden="true" />
                <span>AWS 가져오기</span>
              </button>
            ) : null}
            <button
              aria-label="Live Observation"
              className={styles.panelModeButton}
              onClick={() => openLiveObservation()}
              title="Live Observation"
              type="button"
            >
              <Activity size={16} aria-hidden="true" />
            </button>
          </div>
          {isReverseEngineeringPreparing ? (
            <span className={styles.reverseEngineeringEntryMessage} role="status">
              현재 보드를 저장하는 중입니다.
            </span>
          ) : reverseEngineeringEntryMessage ? (
            <span className={styles.reverseEngineeringEntryError} role="alert">
              {reverseEngineeringEntryMessage}
            </span>
          ) : null}
        </div>

        <div
          className={styles.rightPanelView}
          hidden={activeView !== "resource" || isReverseEngineeringOpen}
        >
          <ResourceWorkspacePanel
            context={context}
            onViewChange={handleResourceWorkspaceViewChange}
            view={resourceWorkspaceView}
          />
        </div>
        <div
          ref={terraformViewRef}
          className={styles.rightPanelView}
          hidden={activeView !== "terraform" || isReverseEngineeringOpen}
        >
          <div
            className={styles.terraformSplitLayout}
            ref={terraformSplitRef}
            style={terraformSplitStyle}
          >
            <div className={styles.terraformCodePane}>
              <TerraformCodePanel
                ref={terraformPanelRef}
                context={context}
                initialTerraformFiles={initialTerraformFiles}
                externalTerraformFilesReplacement={terraformFilesReplacement}
                externalDiscardRequestId={terraformDiscardRequestId}
                externalSaveRequestId={terraformSaveRequestId}
                isMutationLocked={context.isMutationLocked}
                isVisible={activeView === "terraform" && !isReverseEngineeringOpen}
                onArchitectureDiagnosticsChange={handleArchitectureDiagnosticsChange}
                onDiagnosticsChange={handleTerraformDiagnosticsChange}
                onDirtyChange={handleTerraformDirtyChange}
                onExternalSaveComplete={handleTerraformExternalSaveComplete}
                onTerraformAiCodeContextChange={setTerraformAiCodeContext}
                onTerraformAiInteraction={() => onTerraformAiInteraction("preview")}
                onTerraformFilesChange={handleWorkspaceTerraformFilesChange}
                onTerraformFilesReplacementApplied={onTerraformFilesReplacementApplied}
              />
            </div>
            <div
              aria-label="Resize Terraform code and issues panels"
              aria-orientation="horizontal"
              aria-valuemax={MAX_TERRAFORM_CODE_PANE_RATIO}
              aria-valuemin={MIN_TERRAFORM_CODE_PANE_RATIO}
              aria-valuenow={terraformCodePaneRatio}
              className={styles.terraformSplitResizeHandle}
              onKeyDown={handleTerraformSplitKeyDown}
              onPointerDown={startTerraformSplitResize}
              role="separator"
              tabIndex={0}
            />
            <div className={styles.terraformIssuesPane}>
              <WorkspaceIssuesPanel
                architectureDiagnostics={architectureDiagnostics}
                onFocusArchitectureResource={(diagnostic) => {
                  context.selectResourceNode(diagnostic.resourceNodeId);
                  setActiveView("resource");
                }}
                onSelectTerraformIssue={handleTerraformIssueSelection}
                selectedTerraformIssueKey={selectedTerraformIssueKey}
                terraformIssues={terraformIssues}
              />
            </div>
          </div>
        </div>
        <div
          className={`${styles.rightPanelView} ${styles.reverseEngineeringWorkspaceView}`}
          hidden={!isReverseEngineeringOpen}
        >
          <header className={styles.reverseEngineeringWorkspaceHeader}>
            <div>
              <strong>AWS 구조 가져오기</strong>
              <span>현재 프로젝트에 적용하기 전에 후보를 먼저 확인합니다.</span>
            </div>
            <button
              aria-label="AWS 구조 가져오기 취소"
              className={styles.panelIconButton}
              disabled={context.isMutationLocked}
              onClick={closeReverseEngineering}
              title="취소"
              type="button"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </header>
          <ReverseEngineeringPanel
            context={context}
            projectId={projectId}
            projectName={projectName}
          />
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
      {deploymentConsole}
      {liveObservationModal}
    </>
  );
}

function clampTerraformCodePaneRatio(ratio: number): number {
  return Math.min(
    MAX_TERRAFORM_CODE_PANE_RATIO,
    Math.max(MIN_TERRAFORM_CODE_PANE_RATIO, Math.round(ratio))
  );
}

function noopDeploymentConsoleOpenChange(): void {}

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
  return (
    target instanceof Element && Boolean(target.closest("[data-terraform-leave-guard-ignore]"))
  );
}

function isTerraformEditorNavigationTarget(target: Node): boolean {
  return target instanceof Element && Boolean(target.closest("[data-terraform-editor-navigation]"));
}

function getTerraformIssueFixSourceLocation(
  request: TerraformSafeFixApplyRequest
): TerraformSourceLocation {
  const fix = request.fixes[0];

  return {
    fileName: fix?.diagnostic.sourceFileName ?? "main.tf",
    line: fix?.codePreview?.sourceLine ?? fix?.diagnostic.line ?? 1,
    ...(fix?.diagnostic.resourceAddress ? { resourceAddress: fix.diagnostic.resourceAddress } : {})
  };
}

function getTerraformIssueSourceLocation(issue: TerraformIssueRecord): TerraformSourceLocation {
  return {
    fileName: issue.diagnostic.sourceFileName ?? "main.tf",
    line: issue.diagnostic.line ?? 1,
    ...(issue.diagnostic.resourceAddress
      ? { resourceAddress: issue.diagnostic.resourceAddress }
      : {})
  };
}
