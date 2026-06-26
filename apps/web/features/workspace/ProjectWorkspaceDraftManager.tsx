"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DiagramJson } from "../../../../packages/types/src";
import { DiagramEditor } from "../diagram-editor";
import { EMPTY_DIAGRAM } from "../diagram-editor/constants";
import type { LocalProjectDraft } from "./project-draft-persistence";
import {
  defaultProjectDraftRepository,
  type ProjectDraftRepository
} from "./project-draft-repository";
import type { WorkspaceCloudPlatform } from "./project-draft-persistence";
import styles from "./workspace.module.css";

const SERVER_SAVE_DEBOUNCE_MS = 800;

type LoadState = "loading" | "ready" | "error";
type SaveState = "idle" | "server-pending" | "server-saved" | "local-recovery" | "failed";

const saveStatusLabels: Record<SaveState, string> = {
  idle: "DB 편집 중",
  "server-pending": "DB 저장 대기",
  "server-saved": "DB 저장됨",
  "local-recovery": "로컬 복구본",
  failed: "DB 저장 실패 · 로컬 복구본 저장됨"
};

const sourceSaveState = {
  empty: "idle",
  local: "local-recovery",
  server: "server-saved"
} satisfies Record<"empty" | "local" | "server", SaveState>;

const cloudPlatformLabels: Record<WorkspaceCloudPlatform, string> = {
  aws: "AWS",
  gcp: "GCP"
};

export type ProjectWorkspaceDraftManagerProps = {
  cloudPlatform?: WorkspaceCloudPlatform | undefined;
  localCacheWorkspaceId?: string | undefined;
  projectId: string;
  projectName?: string | undefined;
  repository?: ProjectDraftRepository | undefined;
  workspaceId?: string | undefined;
};

export function ProjectWorkspaceDraftManager({
  cloudPlatform,
  localCacheWorkspaceId,
  projectId,
  projectName = "Project workspace",
  repository = defaultProjectDraftRepository,
  workspaceId
}: ProjectWorkspaceDraftManagerProps) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [initialDiagram, setInitialDiagram] = useState<DiagramJson | null>(null);
  const [localDraft, setLocalDraft] = useState<LocalProjectDraft | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const latestDiagramRef = useRef<DiagramJson>(EMPTY_DIAGRAM);
  const localDraftRef = useRef<LocalProjectDraft | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasUnsavedChangesRef = useRef(false);

  const setCurrentLocalDraft = useCallback((draft: LocalProjectDraft | null) => {
    localDraftRef.current = draft;
    setLocalDraft(draft);
  }, []);

  const clearSaveTimer = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const persistProjectDraftNow = useCallback(async () => {
    const result = await repository.save({
      workspaceId,
      localCacheWorkspaceId,
      projectId,
      diagramJson: latestDiagramRef.current,
      previousLocalDraft: localDraftRef.current
    });

    setCurrentLocalDraft(result.localDraft);
    hasUnsavedChangesRef.current = false;
    setSaveState(result.serverDraft ? "server-saved" : "local-recovery");
    return result;
  }, [localCacheWorkspaceId, projectId, repository, setCurrentLocalDraft, workspaceId]);

  const saveCurrentDraft = useCallback(async () => {
    clearSaveTimer();

    try {
      await persistProjectDraftNow();
    } catch {
      setSaveState("failed");
    }
  }, [clearSaveTimer, persistProjectDraftNow]);

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspace() {
      try {
        const loadedDraft = await repository.load({
          workspaceId,
          localCacheWorkspaceId,
          projectId,
          fallbackDiagram: EMPTY_DIAGRAM
        });

        if (cancelled) {
          return;
        }

        latestDiagramRef.current = loadedDraft.diagramJson;
        hasUnsavedChangesRef.current = false;
        setInitialDiagram(loadedDraft.diagramJson);
        setCurrentLocalDraft(loadedDraft.localDraft);
        setSaveState(sourceSaveState[loadedDraft.source]);
        setLoadState("ready");
      } catch {
        if (cancelled) {
          return;
        }

        setErrorMessage("프로젝트 draft를 DB에서 불러오지 못했습니다.");
        setLoadState("error");
      }
    }

    void loadWorkspace();

    return () => {
      cancelled = true;
      clearSaveTimer();
    };
  }, [clearSaveTimer, localCacheWorkspaceId, projectId, repository, setCurrentLocalDraft, workspaceId]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden" && hasUnsavedChangesRef.current) {
        void saveCurrentDraft();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [saveCurrentDraft]);

  const handleDiagramChange = useCallback(
    (diagram: DiagramJson) => {
      latestDiagramRef.current = diagram;
      hasUnsavedChangesRef.current = true;
      setSaveState("server-pending");
      clearSaveTimer();
      saveTimerRef.current = setTimeout(() => {
        void persistProjectDraftNow().catch(() => setSaveState("failed"));
      }, SERVER_SAVE_DEBOUNCE_MS);
    },
    [clearSaveTimer, persistProjectDraftNow]
  );

  if (loadState === "loading") {
    return <WorkspaceNotice title="Project loading" body="DB에 저장된 프로젝트 draft를 불러오는 중입니다." />;
  }

  if (loadState === "error" || !initialDiagram) {
    return (
      <WorkspaceNotice
        title="Project unavailable"
        body={errorMessage ?? "프로젝트 draft를 불러오지 못했습니다."}
      />
    );
  }

  return (
    <DiagramEditor
      initialDiagram={initialDiagram}
      onDiagramChange={handleDiagramChange}
      onSave={() => void saveCurrentDraft()}
      saveDisabled={false}
      saveStatus={`${projectName}${cloudPlatform ? ` · ${cloudPlatformLabels[cloudPlatform]}` : ""} · ${
        saveStatusLabels[saveState]
      }${
        localDraft ? ` · r${localDraft.revision}` : ""
      }`}
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
