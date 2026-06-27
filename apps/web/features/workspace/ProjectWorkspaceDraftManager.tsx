"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DiagramJson } from "../../../../packages/types/src";
import { DiagramEditor } from "../diagram-editor";
import { EMPTY_DIAGRAM } from "../diagram-editor/constants";
import { WorkspaceRightPanel } from "./WorkspaceRightPanel";
import type { LocalProjectDraft } from "./project-draft-persistence";
import {
  defaultProjectDraftRepository,
  type ProjectDraftRepository
} from "./project-draft-repository";
import { runProjectDraftServerSaveFlight } from "./project-draft-save-flight";
import type { WorkspaceCloudPlatform } from "./project-draft-persistence";
import type { SavedServerProjectDiagramDraft } from "./project-draft-sync";
import styles from "./workspace.module.css";

const LOCAL_SAVE_DEBOUNCE_MS = 800;
const SERVER_CHECKPOINT_INTERVAL_MS = 5 * 60 * 1000;

type LoadState = "loading" | "ready" | "error";
type LocalSaveState = "idle" | "local-pending" | "local-saved" | "local-failed";
type ServerSaveState =
  | "server-idle"
  | "server-dirty"
  | "server-saving"
  | "server-checkpoint-pending"
  | "server-saved"
  | "server-failed";
export type FlushDraftReason = "manual" | "checkpoint" | "external";
type LocalDraftPersistResult = {
  changeVersion: number;
  current: boolean;
  localDraft: LocalProjectDraft;
};

const localSaveStatusLabels: Record<LocalSaveState, string> = {
  idle: "로컬 대기",
  "local-pending": "로컬 저장 대기",
  "local-saved": "로컬 저장됨",
  "local-failed": "로컬 저장 실패"
};

const serverSaveStatusLabels: Record<ServerSaveState, string> = {
  "server-idle": "서버 대기",
  "server-dirty": "서버 미저장 변경 있음",
  "server-saving": "서버 저장 중",
  "server-checkpoint-pending": "서버 체크포인트 저장 중",
  "server-saved": "서버 저장됨",
  "server-failed": "서버 저장 실패"
};

const sourceServerSaveState = {
  empty: "server-idle",
  local: "server-dirty",
  server: "server-saved"
} satisfies Record<"empty" | "local" | "server", ServerSaveState>;

const cloudPlatformLabels: Record<WorkspaceCloudPlatform, string> = {
  aws: "AWS",
  gcp: "GCP"
};

export type FlushDraftToServerResult = SavedServerProjectDiagramDraft;

export type ProjectDraftPersistenceController = {
  flushDraftToServer(reason?: FlushDraftReason): Promise<FlushDraftToServerResult>;
};

export type ProjectWorkspaceDraftManagerProps = {
  cloudPlatform?: WorkspaceCloudPlatform | undefined;
  localCacheWorkspaceId?: string | undefined;
  localSaveDebounceMs?: number | undefined;
  onDraftPersistenceReady?: ((controller: ProjectDraftPersistenceController) => void) | undefined;
  projectId: string;
  projectName?: string | undefined;
  repository?: ProjectDraftRepository | undefined;
  serverCheckpointIntervalMs?: number | undefined;
  showDraftDebugStatus?: boolean | undefined;
  workspaceId?: string | undefined;
};

export function ProjectWorkspaceDraftManager({
  cloudPlatform,
  localCacheWorkspaceId,
  localSaveDebounceMs = LOCAL_SAVE_DEBOUNCE_MS,
  onDraftPersistenceReady,
  projectId,
  projectName = "Project workspace",
  repository = defaultProjectDraftRepository,
  serverCheckpointIntervalMs = SERVER_CHECKPOINT_INTERVAL_MS,
  showDraftDebugStatus = process.env.NODE_ENV !== "production",
  workspaceId
}: ProjectWorkspaceDraftManagerProps) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [initialDiagram, setInitialDiagram] = useState<DiagramJson | null>(null);
  const [localDraft, setLocalDraft] = useState<LocalProjectDraft | null>(null);
  const [localSaveState, setLocalSaveState] = useState<LocalSaveState>("idle");
  const [serverSaveState, setServerSaveState] = useState<ServerSaveState>("server-idle");
  const [lastLocalSavedAt, setLastLocalSavedAt] = useState<string | null>(null);
  const [lastServerSavedAt, setLastServerSavedAt] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const latestDiagramRef = useRef<DiagramJson>(EMPTY_DIAGRAM);
  const localDraftRef = useRef<LocalProjectDraft | null>(null);
  const localSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasPendingLocalChangesRef = useRef(false);
  const draftReadyRef = useRef(false);
  const draftChangeVersionRef = useRef(0);
  const serverDirtyRef = useRef(false);
  const serverSavingRef = useRef(false);
  const serverSavePromiseRef = useRef<Promise<FlushDraftToServerResult> | null>(null);
  const onDraftPersistenceReadyRef =
    useRef<ProjectWorkspaceDraftManagerProps["onDraftPersistenceReady"]>(onDraftPersistenceReady);

  const setCurrentLocalDraft = useCallback((draft: LocalProjectDraft | null) => {
    localDraftRef.current = draft;
    setLocalDraft(draft);
  }, []);

  const clearLocalSaveTimer = useCallback(() => {
    if (localSaveTimerRef.current) {
      clearTimeout(localSaveTimerRef.current);
      localSaveTimerRef.current = null;
    }
  }, []);

  const persistLocalDraftNow = useCallback(async (): Promise<LocalDraftPersistResult> => {
    const changeVersion = draftChangeVersionRef.current;
    const result = await repository.saveLocal({
      workspaceId,
      localCacheWorkspaceId,
      projectId,
      diagramJson: latestDiagramRef.current,
      previousLocalDraft: localDraftRef.current
    });
    const current = draftChangeVersionRef.current === changeVersion;

    if (current) {
      setCurrentLocalDraft(result.localDraft);
      hasPendingLocalChangesRef.current = false;
      setLastLocalSavedAt(result.localDraft.draftSavedAt);
      setLocalSaveState("local-saved");
    }

    return {
      changeVersion,
      current,
      localDraft: result.localDraft
    };
  }, [localCacheWorkspaceId, projectId, repository, setCurrentLocalDraft, workspaceId]);

  const saveCurrentDraftLocally = useCallback(async () => {
    clearLocalSaveTimer();

    try {
      await persistLocalDraftNow();
    } catch {
      setLocalSaveState("local-failed");
    }
  }, [clearLocalSaveTimer, persistLocalDraftNow]);

  useEffect(() => {
    onDraftPersistenceReadyRef.current = onDraftPersistenceReady;
  }, [onDraftPersistenceReady]);

  const flushDraftToServer = useCallback(
    (reason: FlushDraftReason = "external"): Promise<FlushDraftToServerResult> => {
      if (serverSavePromiseRef.current) {
        return serverSavePromiseRef.current;
      }

      if (!draftReadyRef.current) {
        return Promise.resolve({
          ok: false,
          error: new Error("Project draft is not loaded yet."),
          localDraft: localDraftRef.current,
          serverDraft: null
        });
      }

      return runProjectDraftServerSaveFlight(serverSavePromiseRef, async () => {
        serverSavingRef.current = true;
        setServerSaveState(reason === "checkpoint" ? "server-checkpoint-pending" : "server-saving");

        try {
          clearLocalSaveTimer();

          let baseLocalDraft = localDraftRef.current;
          let serverSaveVersion = draftChangeVersionRef.current;

          if (hasPendingLocalChangesRef.current) {
            try {
              const localPersistResult = await persistLocalDraftNow();
              baseLocalDraft = localPersistResult.localDraft;
              serverSaveVersion = localPersistResult.changeVersion;

              if (!localPersistResult.current) {
                serverDirtyRef.current = true;
                setServerSaveState("server-dirty");
                return {
                  ok: false,
                  error: new Error("Draft changed while preparing server save."),
                  localDraft: localDraftRef.current,
                  serverDraft: null
                };
              }
            } catch (error) {
              setLocalSaveState("local-failed");
              setServerSaveState("server-failed");
              return {
                ok: false,
                error,
                localDraft: localDraftRef.current,
                serverDraft: null
              };
            }
          }

          try {
            const result = await repository.saveServer({
              workspaceId,
              localCacheWorkspaceId,
              projectId,
              diagramJson: latestDiagramRef.current,
              previousLocalDraft: baseLocalDraft,
              shouldSyncLocalDraft: () => draftChangeVersionRef.current === serverSaveVersion
            });

            if (result.ok) {
              if (draftChangeVersionRef.current === serverSaveVersion) {
                setCurrentLocalDraft(result.localDraft);
                serverDirtyRef.current = false;
                setLastLocalSavedAt(result.localDraft.draftSavedAt);
                setLastServerSavedAt(result.serverDraft.serverSavedAt);
                setLocalSaveState("local-saved");
                setServerSaveState("server-saved");
                return result;
              }

              serverDirtyRef.current = true;
              setServerSaveState("server-dirty");
              await persistLocalDraftNow().catch(() => setLocalSaveState("local-failed"));
              return {
                ok: false,
                error: new Error("Draft changed while server save was in progress."),
                localDraft: localDraftRef.current,
                serverDraft: null
              };
            }

            if (draftChangeVersionRef.current === serverSaveVersion) {
              setServerSaveState("server-failed");
              return result;
            }

            serverDirtyRef.current = true;
            setServerSaveState("server-dirty");
            return result;
          } catch (error) {
            setServerSaveState(draftChangeVersionRef.current === serverSaveVersion ? "server-failed" : "server-dirty");
            return {
              ok: false,
              error,
              localDraft: localDraftRef.current,
              serverDraft: null
            };
          }
        } finally {
          serverSavingRef.current = false;
        }
      });
    },
    [
      clearLocalSaveTimer,
      localCacheWorkspaceId,
      persistLocalDraftNow,
      projectId,
      repository,
      setCurrentLocalDraft,
      workspaceId
    ]
  );

  useEffect(() => {
    let cancelled = false;
    draftReadyRef.current = false;

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
        hasPendingLocalChangesRef.current = false;
        serverDirtyRef.current = loadedDraft.source === "local";
        draftChangeVersionRef.current = 0;
        setInitialDiagram(loadedDraft.diagramJson);
        setCurrentLocalDraft(loadedDraft.localDraft);
        setLocalSaveState(loadedDraft.localDraft ? "local-saved" : "idle");
        setServerSaveState(sourceServerSaveState[loadedDraft.source]);
        setLastLocalSavedAt(loadedDraft.localDraft?.draftSavedAt ?? null);
        setLastServerSavedAt(loadedDraft.serverDraft?.serverSavedAt ?? loadedDraft.localDraft?.serverSavedAt ?? null);
        draftReadyRef.current = true;
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
      draftReadyRef.current = false;
      clearLocalSaveTimer();
    };
  }, [clearLocalSaveTimer, localCacheWorkspaceId, projectId, repository, setCurrentLocalDraft, workspaceId]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden" && hasPendingLocalChangesRef.current) {
        void saveCurrentDraftLocally();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [saveCurrentDraftLocally]);

  useEffect(() => {
    if (serverCheckpointIntervalMs <= 0) {
      return;
    }

    const checkpointTimer = setInterval(() => {
      if (!serverDirtyRef.current || serverSavingRef.current) {
        return;
      }

      void flushDraftToServer("checkpoint");
    }, serverCheckpointIntervalMs);

    return () => clearInterval(checkpointTimer);
  }, [flushDraftToServer, serverCheckpointIntervalMs]);

  useEffect(() => {
    const handleDraftPersistenceReady = onDraftPersistenceReadyRef.current;

    if (!handleDraftPersistenceReady || loadState !== "ready" || !initialDiagram) {
      return;
    }

    handleDraftPersistenceReady({
      flushDraftToServer
    });
  }, [flushDraftToServer, initialDiagram, loadState]);

  const handleDiagramChange = useCallback(
    (diagram: DiagramJson) => {
      latestDiagramRef.current = diagram;
      draftChangeVersionRef.current += 1;
      hasPendingLocalChangesRef.current = true;
      serverDirtyRef.current = true;
      setLocalSaveState("local-pending");
      setServerSaveState("server-dirty");
      clearLocalSaveTimer();
      localSaveTimerRef.current = setTimeout(() => {
        void persistLocalDraftNow().catch(() => setLocalSaveState("local-failed"));
      }, localSaveDebounceMs);
    },
    [clearLocalSaveTimer, localSaveDebounceMs, persistLocalDraftNow]
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

  const draftStatusPanel = showDraftDebugStatus ? (
    <DraftPersistenceStatusPanel
      lastLocalSavedAt={lastLocalSavedAt}
      lastServerSavedAt={lastServerSavedAt}
      localRevision={localDraft?.revision ?? null}
      localSaveState={localSaveState}
      serverSaveState={serverSaveState}
    />
  ) : null;

  return (
    <DiagramEditor
      draftStatusPanel={draftStatusPanel}
      initialDiagram={initialDiagram}
      onDiagramChange={handleDiagramChange}
      rightPanel={(context) => (
        <WorkspaceRightPanel context={context} projectId={projectId} projectName={projectName} />
      )}
      onSave={() => void flushDraftToServer("manual")}
      saveDisabled={serverSaveState === "server-saving" || serverSaveState === "server-checkpoint-pending"}
      saveStatus={`${projectName}${cloudPlatform ? ` · ${cloudPlatformLabels[cloudPlatform]}` : ""} · ${
        localSaveStatusLabels[localSaveState]
      } · ${
        serverSaveStatusLabels[serverSaveState]
      }${
        localDraft ? ` · r${localDraft.revision}` : ""
      }`}
    />
  );
}

function DraftPersistenceStatusPanel({
  lastLocalSavedAt,
  lastServerSavedAt,
  localRevision,
  localSaveState,
  serverSaveState
}: {
  lastLocalSavedAt: string | null;
  lastServerSavedAt: string | null;
  localRevision: number | null;
  localSaveState: LocalSaveState;
  serverSaveState: ServerSaveState;
}) {
  return (
    <div className={styles.draftStatusPanel} role="status" aria-live="polite">
      <span className={styles.draftStatusLabel}>Dev draft status</span>
      <span className={styles.draftStatusItem} data-state={localSaveState}>
        IndexedDB · {localSaveStatusLabels[localSaveState]} · {formatSavedAt(lastLocalSavedAt)}
      </span>
      <span className={styles.draftStatusItem} data-state={serverSaveState}>
        PostgreSQL · {serverSaveStatusLabels[serverSaveState]} · {formatSavedAt(lastServerSavedAt)}
      </span>
      {localRevision ? <span className={styles.draftStatusItem}>r{localRevision}</span> : null}
    </div>
  );
}

function formatSavedAt(savedAt: string | null): string {
  if (!savedAt) {
    return "마지막 저장 없음";
  }

  const date = new Date(savedAt);

  if (Number.isNaN(date.getTime())) {
    return "저장 시간 확인 불가";
  }

  return `마지막 저장 ${new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    second: "2-digit"
  }).format(date)}`;
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
