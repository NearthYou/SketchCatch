"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DiagramJson } from "../../../../packages/types/src";
import { DiagramEditor } from "../diagram-editor";
import { EMPTY_DIAGRAM } from "../diagram-editor/constants";
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
import { WorkspaceRightPanel } from "./WorkspaceRightPanel";
import type {
  TerraformIssueAiRequest,
  TerraformSafeFixApplyRequest,
  TerraformSafeFixApplyResult
} from "./workspace-terraform-ai";
import styles from "./workspace.module.css";

const LOCAL_PROJECT_ID = "local-sketchcatch-project";
const LOCAL_PROJECT_NAME = "Local workspace";
const LOCAL_SAVE_DEBOUNCE_MS = 800;

type LoadState = "loading" | "ready" | "error";
type SaveState = "idle" | "local-pending" | "local-saved" | "failed";

const saveStatusLabels: Record<SaveState, string> = {
  idle: "편집 중",
  "local-pending": "저장 중",
  "local-saved": "저장됨",
  failed: "저장 실패"
};

export function WorkspaceDraftManager() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState(LOCAL_PROJECT_NAME);
  const [initialDiagram, setInitialDiagram] = useState<DiagramJson | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [terraformIssueAiRequest, setTerraformIssueAiRequest] =
    useState<TerraformIssueAiRequest | null>(null);
  const [terraformSafeFixApplyRequest, setTerraformSafeFixApplyRequest] =
    useState<TerraformSafeFixApplyRequest | null>(null);
  const [terraformSafeFixApplyResult, setTerraformSafeFixApplyResult] =
    useState<TerraformSafeFixApplyResult | null>(null);
  const latestDiagramRef = useRef<DiagramJson>(EMPTY_DIAGRAM);
  const localDraftRef = useRef<LocalProjectDraft | null>(null);
  const localSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasUnsavedChangesRef = useRef(false);
  const draftChangeVersionRef = useRef(0);

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
        const metadata = await readWorkspaceClientMetadata();
        const nextWorkspaceId = metadata?.workspaceId ?? createWorkspaceId();
        const nextProjectName = normalizeProjectName(metadata?.activeProjectName);
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

        const nextDiagram = storedLocalDraft?.diagramJson ?? EMPTY_DIAGRAM;
        latestDiagramRef.current = nextDiagram;
        hasUnsavedChangesRef.current = false;
        draftChangeVersionRef.current = 0;
        setWorkspaceId(nextWorkspaceId);
        setProjectName(nextProjectName);
        setInitialDiagram(nextDiagram);
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
  }, [clearLocalSaveTimer, setCurrentLocalDraft]);

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

  const requestTerraformSafeFixApply = useCallback((
    diagnostic: TerraformSafeFixApplyRequest["diagnostic"],
    codePreview?: TerraformSafeFixApplyRequest["codePreview"]
  ): void => {
    setTerraformSafeFixApplyRequest({
      codePreview,
      diagnostic,
      id: Date.now()
    });
  }, []);

  if (loadState === "loading") {
    return <WorkspaceNotice title="Workspace loading" body="로컬 저장 정보를 불러오는 중입니다." />;
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
          onApplyTerraformIssueFix={requestTerraformSafeFixApply}
          projectId={LOCAL_PROJECT_ID}
          terraformIssueRequest={terraformIssueAiRequest}
          terraformSafeFixApplyResult={terraformSafeFixApplyResult}
        />
      )}
      initialDiagram={initialDiagram}
      onDiagramChange={handleDiagramChange}
      projectName={projectName}
      rightPanel={(context) => (
        <WorkspaceRightPanel
          context={context}
          onTerraformIssueAiRequest={setTerraformIssueAiRequest}
          onTerraformSafeFixApplyResult={setTerraformSafeFixApplyResult}
          projectId={LOCAL_PROJECT_ID}
          projectName={projectName}
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
