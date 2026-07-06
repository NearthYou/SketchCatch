"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DiagramJson } from "../../../../packages/types/src";
import { DiagramEditor } from "../diagram-editor";
import { EMPTY_DIAGRAM } from "../diagram-editor/constants";
import { WorkspaceAiChatDock } from "./WorkspaceAiChatDock";
import { WorkspaceRightPanel } from "./WorkspaceRightPanel";
import type {
  TerraformIssueAiRequest,
  TerraformPreviewAiRequest,
  TerraformSafeFixApplyRequest,
  TerraformSafeFixApplyResult
} from "./workspace-terraform-ai";
import type { LocalProjectDraft } from "./project-draft-persistence";
import { shouldFlushProjectDraftBeforePageExit } from "./project-draft-page-exit";
import {
  defaultProjectDraftRepository,
  type ProjectDraftRepository
} from "./project-draft-repository";
import { runProjectDraftServerSaveFlight } from "./project-draft-save-flight";
import {
  getProjectSaveStatus,
  type ProjectLocalSaveState,
  type ProjectServerSaveState
} from "./project-draft-save-status";
import type { WorkspaceCloudPlatform } from "./project-draft-persistence";
import type { SavedServerProjectDiagramDraft } from "./project-draft-sync";
import styles from "./workspace.module.css";

const LOCAL_SAVE_DEBOUNCE_MS = 800;
const SERVER_CHECKPOINT_INTERVAL_MS = 5 * 60 * 1000;
const SERVER_SAVE_TOAST_VISIBLE_MS = 3200;

type LoadState = "loading" | "ready" | "error";
export type FlushDraftReason = "manual" | "checkpoint" | "external";
type LocalDraftPersistResult = {
  changeVersion: number;
  current: boolean;
  localDraft: LocalProjectDraft;
};

const sourceServerSaveState = {
  empty: "server-idle",
  local: "server-dirty",
  server: "server-saved"
} satisfies Record<"empty" | "local" | "server", ProjectServerSaveState>;

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
  workspaceId?: string | undefined;
};

export function ProjectWorkspaceDraftManager({
  localCacheWorkspaceId,
  localSaveDebounceMs = LOCAL_SAVE_DEBOUNCE_MS,
  onDraftPersistenceReady,
  projectId,
  projectName = "Project workspace",
  repository = defaultProjectDraftRepository,
  serverCheckpointIntervalMs = SERVER_CHECKPOINT_INTERVAL_MS,
  workspaceId
}: ProjectWorkspaceDraftManagerProps) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [initialDiagram, setInitialDiagram] = useState<DiagramJson | null>(null);
  const [localSaveState, setLocalSaveState] = useState<ProjectLocalSaveState>("idle");
  const [serverSaveState, setServerSaveState] = useState<ProjectServerSaveState>("server-idle");
  const [serverSaveToastVisible, setServerSaveToastVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [terraformIssueAiRequest, setTerraformIssueAiRequest] =
    useState<TerraformIssueAiRequest | null>(null);
  const [terraformPreviewAiRequest, setTerraformPreviewAiRequest] =
    useState<TerraformPreviewAiRequest | null>(null);
  const [terraformSafeFixApplyRequest, setTerraformSafeFixApplyRequest] =
    useState<TerraformSafeFixApplyRequest | null>(null);
  const [terraformSafeFixApplyResult, setTerraformSafeFixApplyResult] =
    useState<TerraformSafeFixApplyResult | null>(null);
  const latestDiagramRef = useRef<DiagramJson>(EMPTY_DIAGRAM);
  const localDraftRef = useRef<LocalProjectDraft | null>(null);
  const localSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasPendingLocalChangesRef = useRef(false);
  const draftReadyRef = useRef(false);
  const draftChangeVersionRef = useRef(0);
  const serverDirtyRef = useRef(false);
  const serverSavingRef = useRef(false);
  const serverSavePromiseRef = useRef<Promise<FlushDraftToServerResult> | null>(null);
  const serverSaveToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDraftPersistenceReadyRef =
    useRef<ProjectWorkspaceDraftManagerProps["onDraftPersistenceReady"]>(onDraftPersistenceReady);

  const setCurrentLocalDraft = useCallback((draft: LocalProjectDraft | null) => {
    localDraftRef.current = draft;
  }, []);

  const clearLocalSaveTimer = useCallback(() => {
    if (localSaveTimerRef.current) {
      clearTimeout(localSaveTimerRef.current);
      localSaveTimerRef.current = null;
    }
  }, []);

  const clearServerSaveToastTimer = useCallback(() => {
    if (serverSaveToastTimerRef.current) {
      clearTimeout(serverSaveToastTimerRef.current);
      serverSaveToastTimerRef.current = null;
    }
  }, []);

  const showServerSaveToast = useCallback(() => {
    clearServerSaveToastTimer();
    setServerSaveToastVisible(true);
    serverSaveToastTimerRef.current = setTimeout(() => {
      setServerSaveToastVisible(false);
      serverSaveToastTimerRef.current = null;
    }, SERVER_SAVE_TOAST_VISIBLE_MS);
  }, [clearServerSaveToastTimer]);

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
      setLocalSaveState("local-saved");
    }

    return {
      changeVersion,
      current,
      localDraft: result.localDraft
    };
  }, [localCacheWorkspaceId, projectId, repository, setCurrentLocalDraft, workspaceId]);

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
                setLocalSaveState("local-saved");
                setServerSaveState("server-saved");
                showServerSaveToast();
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
      showServerSaveToast,
      workspaceId
    ]
  );

  useEffect(() => {
    return clearServerSaveToastTimer;
  }, [clearServerSaveToastTimer]);

  const flushDraftBeforePageExit = useCallback(() => {
    if (
      !shouldFlushProjectDraftBeforePageExit({
        draftReady: draftReadyRef.current,
        hasPendingLocalChanges: hasPendingLocalChangesRef.current,
        serverDirty: serverDirtyRef.current,
        serverSaving: serverSavingRef.current
      })
    ) {
      return;
    }

    void flushDraftToServer("external");
  }, [flushDraftToServer]);

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
      if (document.visibilityState === "hidden") {
        flushDraftBeforePageExit();
      }
    }

    window.addEventListener("pagehide", flushDraftBeforePageExit);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flushDraftBeforePageExit);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [flushDraftBeforePageExit]);

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

  const requestTerraformIssueAi = useCallback((request: TerraformIssueAiRequest): void => {
    setTerraformIssueAiRequest(request);
  }, []);

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
    <>
      <DiagramEditor
        floatingPanel={(context) => (
          <WorkspaceAiChatDock
            context={context}
            onApplyTerraformIssueFix={requestTerraformSafeFixApply}
            projectId={projectId}
            terraformIssueRequest={terraformIssueAiRequest}
            terraformPreviewRequest={terraformPreviewAiRequest}
            terraformSafeFixApplyResult={terraformSafeFixApplyResult}
          />
        )}
        initialDiagram={initialDiagram}
        onDiagramChange={handleDiagramChange}
        onDiagramSaveRequest={() => flushDraftToServer("manual")}
        projectName={projectName}
        rightPanel={(context) => (
          <WorkspaceRightPanel
            context={context}
            onTerraformIssueAiRequest={requestTerraformIssueAi}
            onTerraformPreviewAiRequest={setTerraformPreviewAiRequest}
            onTerraformSafeFixApplyResult={setTerraformSafeFixApplyResult}
            projectId={projectId}
            projectName={projectName}
            terraformSafeFixApplyRequest={terraformSafeFixApplyRequest}
          />
        )}
        saveStatus={getProjectSaveStatus(localSaveState, serverSaveState)}
      />
      {serverSaveToastVisible ? (
        <div className={styles.serverSaveToast} role="status" aria-live="polite">
          저장되었습니다.
        </div>
      ) : null}
    </>
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
