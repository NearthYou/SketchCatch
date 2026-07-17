"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DiagramJson, TerraformSyncFileInput } from "../../../../packages/types/src";
import { useAuth } from "../../components/auth/auth-provider";
import { DiagramEditor, type DiagramPreviewAnnotations } from "../diagram-editor";
import { EMPTY_DIAGRAM } from "../diagram-editor/constants";
import { cloneDiagram } from "../diagram-editor/diagram-utils";
import {
  createWorkspaceId,
  createLocalProjectDraft,
  isWorkspaceCloudPlatform,
  readLocalProjectDraft,
  readWorkspaceClientMetadata,
  writeLocalProjectDraft,
  writeWorkspaceClientMetadata
} from "./project-draft-persistence";
import type { LocalProjectDraft } from "./project-draft-persistence";
import { WorkspaceAiChatDock } from "./WorkspaceAiChatDock";
import { WorkspaceLoadingSkeleton } from "./WorkspaceLoadingSkeleton";
import { WorkspaceRightPanel } from "./WorkspaceRightPanel";
import type { TerraformFilesReplacementRequest } from "./TerraformCodePanel";
import { toTerraformRefreshFingerprint } from "./terraform-panel-utils";
import { restoreSavedDiagram } from "./workspace-draft-restore";
import type { WorkspaceRightPanelView } from "./workspace-right-panel.types";
import type {
  WorkspaceAiContextInteraction,
  WorkspaceTerraformAiContext,
  TerraformSafeFixApplyRequest,
  TerraformSafeFixApplyResult
} from "./workspace-terraform-ai";
import { EMPTY_WORKSPACE_TERRAFORM_AI_CONTEXT } from "./workspace-terraform-ai";
import styles from "./workspace.module.css";

const LOCAL_PROJECT_ID = "local-sketchcatch-project";
const LOCAL_PROJECT_NAME = "Local workspace";
const LOCAL_SAVE_DEBOUNCE_MS = 800;

export type WorkspaceDraftManagerProps = {
  readonly initialBoardZoom?: number | undefined;
  readonly initialDiagramOverride?: DiagramJson | undefined;
  readonly initialPreviewAnnotations?: DiagramPreviewAnnotations | undefined;
  readonly initialPreviewDiagram?: DiagramJson | undefined;
  readonly initialProjectName?: string | undefined;
  readonly initialReferenceDropTargetNodeId?: string | undefined;
  readonly initialRightPanelView?: WorkspaceRightPanelView | undefined;
  readonly initialSelectedEdgeIds?: readonly string[] | undefined;
  readonly initialSelectedNodeIds?: readonly string[] | undefined;
};

type LoadState = "loading" | "ready" | "error";
type SaveState = "idle" | "local-pending" | "local-saved" | "failed";

const saveStatusLabels: Record<SaveState, string> = {
  idle: "편집 중",
  "local-pending": "저장 중",
  "local-saved": "저장됨",
  failed: "저장 실패"
};

export function WorkspaceDraftManager({
  initialBoardZoom,
  initialDiagramOverride,
  initialPreviewAnnotations,
  initialPreviewDiagram,
  initialProjectName,
  initialReferenceDropTargetNodeId,
  initialRightPanelView,
  initialSelectedEdgeIds,
  initialSelectedNodeIds
}: WorkspaceDraftManagerProps) {
  const { user } = useAuth();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState(initialProjectName ?? LOCAL_PROJECT_NAME);
  const [initialDiagram, setInitialDiagram] = useState<DiagramJson | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [isAiChatOpen, setAiChatOpen] = useState(false);
  const [isBlockingPanelOpen, setBlockingPanelOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [terraformAiContext, setTerraformAiContext] = useState<WorkspaceTerraformAiContext>(
    EMPTY_WORKSPACE_TERRAFORM_AI_CONTEXT
  );
  const [selectedTerraformIssueKey, setSelectedTerraformIssueKey] = useState<string | null>(null);
  const [terraformAiInteraction, setTerraformAiInteraction] =
    useState<WorkspaceAiContextInteraction | null>(null);
  const [terraformSafeFixApplyRequest, setTerraformSafeFixApplyRequest] =
    useState<TerraformSafeFixApplyRequest | null>(null);
  const [terraformSafeFixApplyResult, setTerraformSafeFixApplyResult] =
    useState<TerraformSafeFixApplyResult | null>(null);
  const latestDiagramRef = useRef<DiagramJson>(EMPTY_DIAGRAM);
  const latestTerraformFilesRef = useRef<TerraformSyncFileInput[]>([]);
  const [initialTerraformFiles, setInitialTerraformFiles] = useState<TerraformSyncFileInput[]>([]);
  const [terraformFilesReplacement, setTerraformFilesReplacement] =
    useState<TerraformFilesReplacementRequest | null>(null);
  const terraformFilesReplacementIdRef = useRef(0);
  const terraformAiInteractionIdRef = useRef(0);
  const localDraftRef = useRef<LocalProjectDraft | null>(null);
  const localSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasUnsavedChangesRef = useRef(false);
  const draftChangeVersionRef = useRef(0);
  const workspaceUserName =
    user?.nickname?.trim() || user?.username?.trim() || user?.email?.trim() || "Personal workspace";
  const closeAiChat = useCallback((): void => {
    setAiChatOpen(false);
  }, []);

  const setCurrentLocalDraft = useCallback((draft: LocalProjectDraft | null) => {
    localDraftRef.current = draft;
  }, []);

  const clearLocalSaveTimer = useCallback(() => {
    if (localSaveTimerRef.current) {
      clearTimeout(localSaveTimerRef.current);
      localSaveTimerRef.current = null;
    }
  }, []);

  const persistLocalDraftNow = useCallback(async () => {
    if (!workspaceId) {
      return null;
    }

    const changeVersion = draftChangeVersionRef.current;
    const draft = createLocalProjectDraft({
      workspaceId,
      projectId: LOCAL_PROJECT_ID,
      diagramJson: latestDiagramRef.current,
      terraformFiles: latestTerraformFilesRef.current,
      previousDraft: localDraftRef.current,
      savedAt: new Date().toISOString()
    });

    await writeLocalProjectDraft(draft);

    if (draftChangeVersionRef.current === changeVersion) {
      setCurrentLocalDraft(draft);
      hasUnsavedChangesRef.current = false;
      setSaveState("local-saved");
    }

    return draft;
  }, [setCurrentLocalDraft, workspaceId]);

  const saveCurrentDraftLocally = useCallback(async () => {
    clearLocalSaveTimer();

    try {
      await persistLocalDraftNow();
    } catch {
      setSaveState("failed");
    }
  }, [clearLocalSaveTimer, persistLocalDraftNow]);

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspace() {
      try {
        if (initialDiagramOverride) {
          const nextWorkspaceId = "workspace-diagram-fixture";
          const nextProjectName = initialProjectName ?? LOCAL_PROJECT_NAME;

          if (cancelled) {
            return;
          }

          const nextDiagram = cloneDiagram(initialDiagramOverride);
          latestDiagramRef.current = nextDiagram;
          latestTerraformFilesRef.current = [];
          hasUnsavedChangesRef.current = false;
          draftChangeVersionRef.current = 0;
          setWorkspaceId(nextWorkspaceId);
          setProjectName(nextProjectName);
          setInitialDiagram(nextDiagram);
          setInitialTerraformFiles([]);
          setCurrentLocalDraft(null);
          setSaveState("idle");
          setLoadState("ready");
          return;
        }

        const metadata = await readWorkspaceClientMetadata();
        const nextWorkspaceId = metadata?.workspaceId ?? createWorkspaceId();
        const nextProjectName =
          initialProjectName ?? normalizeProjectName(metadata?.activeProjectName);
        const nextCloudPlatform = isWorkspaceCloudPlatform(metadata?.cloudPlatform)
          ? metadata.cloudPlatform
          : "aws";

        await writeWorkspaceClientMetadata({
          workspaceId: nextWorkspaceId,
          activeProjectId: LOCAL_PROJECT_ID,
          activeProjectName: nextProjectName,
          cloudPlatform: nextCloudPlatform,
          updatedAt: new Date().toISOString()
        });

        const storedLocalDraft = await readLocalProjectDraft(nextWorkspaceId, LOCAL_PROJECT_ID);

        if (cancelled) {
          return;
        }

        const nextDiagram = restoreSavedDiagram(storedLocalDraft?.diagramJson, EMPTY_DIAGRAM);
        latestDiagramRef.current = nextDiagram;
        latestTerraformFilesRef.current = storedLocalDraft?.terraformFiles ?? [];
        hasUnsavedChangesRef.current = false;
        draftChangeVersionRef.current = 0;
        setWorkspaceId(nextWorkspaceId);
        setProjectName(nextProjectName);
        setInitialDiagram(nextDiagram);
        setInitialTerraformFiles(storedLocalDraft?.terraformFiles ?? []);
        setCurrentLocalDraft(storedLocalDraft);
        setSaveState(storedLocalDraft ? "local-saved" : "idle");
        setLoadState("ready");
      } catch {
        if (cancelled) {
          return;
        }

        setErrorMessage("로컬 작업 공간을 불러오지 못했습니다.");
        setLoadState("error");
      }
    }

    void loadWorkspace();

    return () => {
      cancelled = true;
      clearLocalSaveTimer();
    };
  }, [clearLocalSaveTimer, initialDiagramOverride, initialProjectName, setCurrentLocalDraft]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden" && hasUnsavedChangesRef.current) {
        void saveCurrentDraftLocally();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [saveCurrentDraftLocally]);

  const handleDiagramChange = useCallback(
    (diagram: DiagramJson) => {
      if (!workspaceId) {
        return;
      }

      draftChangeVersionRef.current += 1;
      latestDiagramRef.current = diagram;
      hasUnsavedChangesRef.current = true;
      setSaveState("local-pending");
      clearLocalSaveTimer();
      localSaveTimerRef.current = setTimeout(() => {
        void persistLocalDraftNow().catch(() => setSaveState("failed"));
      }, LOCAL_SAVE_DEBOUNCE_MS);
    },
    [clearLocalSaveTimer, persistLocalDraftNow, workspaceId]
  );

  const handleTerraformFilesChange = useCallback(
    (files: readonly TerraformSyncFileInput[]): void => {
      if (!workspaceId) return;

      latestTerraformFilesRef.current = files.map((file) => ({ ...file }));
      setInitialTerraformFiles(files.map((file) => ({ ...file })));
      draftChangeVersionRef.current += 1;
      hasUnsavedChangesRef.current = true;
      setSaveState("local-pending");
      clearLocalSaveTimer();
      localSaveTimerRef.current = setTimeout(() => {
        void persistLocalDraftNow().catch(() => setSaveState("failed"));
      }, LOCAL_SAVE_DEBOUNCE_MS);
    },
    [clearLocalSaveTimer, persistLocalDraftNow, workspaceId]
  );

  const handleTemplateWorkspaceApply = useCallback(
    ({
      diagramJson,
      terraformFiles
    }: {
      readonly diagramJson: DiagramJson;
      readonly terraformFiles: readonly TerraformSyncFileInput[];
    }): void => {
      const files = terraformFiles.map((file) => ({ ...file }));
      latestDiagramRef.current = diagramJson;
      handleTerraformFilesChange(files);
      terraformFilesReplacementIdRef.current += 1;
      setTerraformFilesReplacement({
        diagramFingerprint: toTerraformRefreshFingerprint(diagramJson),
        files,
        id: terraformFilesReplacementIdRef.current
      });
    },
    [handleTerraformFilesChange]
  );

  const handleTerraformFilesReplacementApplied = useCallback((replacementId: number): void => {
    setTerraformFilesReplacement((currentReplacement) =>
      currentReplacement?.id === replacementId ? null : currentReplacement
    );
  }, []);

  const requestTerraformSafeFixApply = useCallback(
    (request: TerraformSafeFixApplyRequest): void => {
      setTerraformSafeFixApplyRequest(request);
    },
    []
  );

  const notifyTerraformAiInteraction = useCallback(
    (
      scope: WorkspaceAiContextInteraction["scope"],
      diagnosticKey?: string | undefined
    ): void => {
      terraformAiInteractionIdRef.current += 1;
      setTerraformAiInteraction({
        ...(diagnosticKey ? { diagnosticKey } : {}),
        id: terraformAiInteractionIdRef.current,
        scope
      });
    },
    []
  );

  if (loadState === "loading") {
    return (
      <WorkspaceLoadingSkeleton
        message="로컬 저장 정보를 불러오는 중입니다."
        projectName={projectName}
      />
    );
  }

  if (loadState === "error" || !initialDiagram) {
    return (
      <WorkspaceNotice
        title="Workspace unavailable"
        body={errorMessage ?? "로컬 작업 공간을 불러오지 못했습니다."}
      />
    );
  }

  return (
    <DiagramEditor
      floatingPanel={(context) => (
        <WorkspaceAiChatDock
          context={context}
          isBlockedByWorkspaceOverlay={isBlockingPanelOpen}
          isOpen={isAiChatOpen}
          onApplyTerraformIssueFix={requestTerraformSafeFixApply}
          onOpenChange={setAiChatOpen}
          onSelectTerraformIssue={setSelectedTerraformIssueKey}
          projectId={LOCAL_PROJECT_ID}
          selectedTerraformIssueKey={selectedTerraformIssueKey}
          terraformAiContext={terraformAiContext}
          terraformAiInteraction={terraformAiInteraction}
          terraformSafeFixApplyResult={terraformSafeFixApplyResult}
        />
      )}
      initialDiagram={initialDiagram}
      initialBoardZoom={initialBoardZoom}
      initialPreviewAnnotations={initialPreviewAnnotations}
      initialPreviewDiagram={initialPreviewDiagram}
      initialReferenceDropTargetNodeId={initialReferenceDropTargetNodeId}
      initialSelectedEdgeIds={initialSelectedEdgeIds}
      initialSelectedNodeIds={initialSelectedNodeIds}
      onDiagramChange={handleDiagramChange}
      onDiagramSaveRequest={saveCurrentDraftLocally}
      onWorkspacePanelOpen={closeAiChat}
      onTemplateWorkspaceApply={handleTemplateWorkspaceApply}
      projectName={projectName}
      workspaceUserName={workspaceUserName}
      rightPanel={(context) => (
        <WorkspaceRightPanel
          context={context}
          deploymentAvailability="project_required"
          initialTerraformFiles={initialTerraformFiles}
          initialView={initialRightPanelView}
          onBlockingPanelOpenChange={setBlockingPanelOpen}
          onPanelOpenRequest={closeAiChat}
          onSelectTerraformIssue={setSelectedTerraformIssueKey}
          onTerraformAiContextChange={setTerraformAiContext}
          onTerraformAiInteraction={notifyTerraformAiInteraction}
          onTerraformSafeFixApplyResult={setTerraformSafeFixApplyResult}
          onTerraformFilesChange={handleTerraformFilesChange}
          onTerraformFilesReplacementApplied={handleTerraformFilesReplacementApplied}
          projectId={LOCAL_PROJECT_ID}
          projectName={projectName}
          selectedTerraformIssueKey={selectedTerraformIssueKey}
          terraformFilesReplacement={terraformFilesReplacement}
          terraformSafeFixApplyRequest={terraformSafeFixApplyRequest}
        />
      )}
      saveStatus={saveStatusLabels[saveState]}
    />
  );
}

function WorkspaceNotice({ title, body }: { title: string; body: string }) {
  return (
    <main className={styles.projectShell}>
      <section className={styles.noticePanel}>
        <span className={styles.projectEyebrow}>{title}</span>
        <p>{body}</p>
      </section>
    </main>
  );
}

function normalizeProjectName(value: string | undefined): string {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : LOCAL_PROJECT_NAME;
}
