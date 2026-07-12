"use client";

import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type { DiagramJson } from "@sketchcatch/types";
import { useAuth } from "../../components/auth/auth-provider";
import { ProductState } from "../../components/ui/ProductState";
import { DiagramEditor } from "../../features/diagram-editor";
import type { DiagramEditorPanelContext } from "../../features/diagram-editor";
import { EMPTY_DIAGRAM } from "../../features/diagram-editor/constants";
import { buildBoardTemplateDiagram } from "../../features/resource-settings/template-library";
import { listSourceRepositories } from "../../features/workspace/api";
import type { LocalProjectDraft } from "../../features/workspace/project-draft-persistence";
import { defaultProjectDraftRepository } from "../../features/workspace/project-draft-repository";
import { getProjectSaveStatus } from "../../features/workspace/project-draft-save-status";
import { resolveRepositoryAnalysisTemplate } from "../../features/workspace/repository-template-handoff";
import type { RepositoryAnalysisHandoffLocation } from "../../features/workspace/repository-template-handoff";
import { restoreSavedDiagram } from "../../features/workspace/workspace-draft-restore";
import { WorkspaceOperationsDock } from "./operations/WorkspaceOperationsDock";
import styles from "./workspace-project.module.css";

const LOCAL_SAVE_DELAY_MS = 800;

type LoadState = "loading" | "ready" | "conflict" | "error";
type LocalSaveState = "idle" | "local-pending" | "local-saved" | "local-failed";
type ServerSaveState = "server-idle" | "server-dirty" | "server-saving" | "server-saved" | "server-failed";

type WorkspaceProjectClientProps = {
  readonly projectId: string;
  readonly projectName: string;
  readonly repositoryHandoff?: RepositoryAnalysisHandoffLocation | undefined;
};

// Project Draft와 DiagramEditor 사이에서 복원, 자동 저장, 수동 저장을 책임집니다.
export function WorkspaceProjectClient({
  projectId,
  projectName,
  repositoryHandoff
}: WorkspaceProjectClientProps) {
  const { user } = useAuth();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [initialDiagram, setInitialDiagram] = useState<DiagramJson | null>(null);
  const [conflictDiagrams, setConflictDiagrams] = useState<{
    readonly local: DiagramJson;
    readonly server: DiagramJson;
  } | null>(null);
  const [localSaveState, setLocalSaveState] = useState<LocalSaveState>("idle");
  const [serverSaveState, setServerSaveState] = useState<ServerSaveState>("server-idle");
  const [errorMessage, setErrorMessage] = useState("");
  const latestDiagramRef = useRef<DiagramJson>(EMPTY_DIAGRAM);
  const localDraftRef = useRef<LocalProjectDraft | null>(null);
  const changeVersionRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serverSaveRef = useRef<Promise<void> | null>(null);
  const userName =
    user?.nickname?.trim() || user?.username?.trim() || user?.email?.trim() || "Personal workspace";

  // DiagramEditor의 현재 Board 상태를 Workspace 작업 도구에 전달합니다.
  const renderOperationsDock = useCallback(
    (context: DiagramEditorPanelContext) => (
      <WorkspaceOperationsDock context={context} projectId={projectId} />
    ),
    [projectId]
  );

  // 예약된 로컬 저장을 취소해 최신 변경만 저장합니다.
  const clearSaveTimer = useCallback(() => {
    if (!saveTimerRef.current) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
  }, []);

  // 현재 DiagramJson을 browser 복구 저장소에 먼저 기록합니다.
  const saveLocalDraft = useCallback(async (): Promise<LocalProjectDraft> => {
    const version = changeVersionRef.current;
    const result = await defaultProjectDraftRepository.saveLocal({
      diagramJson: latestDiagramRef.current,
      previousLocalDraft: localDraftRef.current,
      projectId
    });

    if (changeVersionRef.current === version) {
      localDraftRef.current = result.localDraft;
      setLocalSaveState("local-saved");
    }

    return result.localDraft;
  }, [projectId]);

  // Project와 Repository handoff를 확인한 뒤 첫 Board를 한 번만 결정합니다.
  useEffect(() => {
    let cancelled = false;

    async function loadProjectDraft(): Promise<void> {
      if (!projectId) {
        setErrorMessage("프로젝트 정보가 없습니다. 새 프로젝트 화면에서 다시 시작해주세요.");
        setLoadState("error");
        return;
      }

      try {
        const fallbackDiagram = await createFallbackDiagram(projectId, projectName, repositoryHandoff);
        const loaded = await defaultProjectDraftRepository.load({ fallbackDiagram, projectId });
        if (cancelled) return;

        const selectedDiagram = restoreSavedDiagram(loaded.diagramJson, fallbackDiagram);
        latestDiagramRef.current = selectedDiagram;
        localDraftRef.current = loaded.localDraft;
        setInitialDiagram(selectedDiagram);
        setLocalSaveState(loaded.localDraft ? "local-saved" : "idle");
        setServerSaveState(loaded.source === "local" ? "server-dirty" : "server-saved");

        const localDiagram = loaded.localDraft?.diagramJson;
        const serverDiagram = loaded.serverDraft?.diagramJson;

        if (localDiagram && serverDiagram && JSON.stringify(localDiagram) !== JSON.stringify(serverDiagram)) {
          setConflictDiagrams({
            local: localDiagram,
            server: serverDiagram
          });
          setLoadState("conflict");
          return;
        }

        setLoadState("ready");
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : "프로젝트를 불러오지 못했습니다.");
        setLoadState("error");
      }
    }

    void loadProjectDraft();
    return () => {
      cancelled = true;
      clearSaveTimer();
    };
  }, [clearSaveTimer, projectId, projectName, repositoryHandoff]);

  // Resource 이동과 설정 변경을 로컬에 자동 저장하도록 예약합니다.
  const handleDiagramChange = useCallback((diagram: DiagramJson) => {
    latestDiagramRef.current = diagram;
    changeVersionRef.current += 1;
    setLocalSaveState("local-pending");
    setServerSaveState("server-dirty");
    clearSaveTimer();
    saveTimerRef.current = setTimeout(() => {
      void saveLocalDraft().catch(() => setLocalSaveState("local-failed"));
    }, LOCAL_SAVE_DELAY_MS);
  }, [clearSaveTimer, saveLocalDraft]);

  // 중복 클릭은 같은 Promise를 돌려주고 최신 Draft 하나만 서버에 저장합니다.
  const saveServerDraft = useCallback(async (): Promise<void> => {
    if (serverSaveRef.current) return serverSaveRef.current;

    const savePromise = (async () => {
      clearSaveTimer();
      setServerSaveState("server-saving");
      const localDraft = await saveLocalDraft();
      const result = await defaultProjectDraftRepository.saveServer({
        diagramJson: latestDiagramRef.current,
        previousLocalDraft: localDraft,
        projectId
      });

      if (!result.ok) {
        setServerSaveState("server-failed");
        throw result.error;
      }

      localDraftRef.current = result.localDraft;
      setLocalSaveState("local-saved");
      setServerSaveState("server-saved");
    })().finally(() => {
      serverSaveRef.current = null;
    });

    serverSaveRef.current = savePromise;
    return savePromise;
  }, [clearSaveTimer, projectId, saveLocalDraft]);

  // 충돌 시 사용자가 고른 한 버전만 편집기의 첫 상태로 사용합니다.
  function resolveConflict(source: "local" | "server"): void {
    const diagram = conflictDiagrams?.[source];
    if (!diagram) return;
    latestDiagramRef.current = diagram;
    setInitialDiagram(diagram);
    setConflictDiagrams(null);
    setServerSaveState(source === "local" ? "server-dirty" : "server-saved");
    setLoadState("ready");
  }

  if (loadState === "loading") {
    return <WorkspaceState kind="loading" message="프로젝트와 저장된 Board를 불러오고 있습니다." />;
  }

  if (loadState === "error" || !initialDiagram) {
    return <WorkspaceState kind="error" message={errorMessage || "프로젝트를 불러오지 못했습니다."} />;
  }

  if (loadState === "conflict") {
    return (
      <WorkspaceState
        action={
          <div className={styles.conflictActions}>
            <button onClick={() => resolveConflict("local")} type="button">이 기기 작업 사용</button>
            <button onClick={() => resolveConflict("server")} type="button">서버 저장본 사용</button>
          </div>
        }
        kind="warning"
        message="이 기기의 작업과 서버 저장본이 다릅니다. 이어서 편집할 버전을 고르세요."
      />
    );
  }

  return (
    <DiagramEditor
      floatingPanel={renderOperationsDock}
      initialDiagram={initialDiagram}
      onDiagramChange={handleDiagramChange}
      onDiagramSaveRequest={saveServerDraft}
      projectName={projectName}
      saveStatus={getProjectSaveStatus(localSaveState, serverSaveState)}
      workspaceUserName={userName}
    />
  );
}

// Workspace를 열 수 없는 상태와 복구 행동을 Board 대신 분명하게 보여줍니다.
function WorkspaceState({
  action,
  kind,
  message
}: {
  readonly action?: ReactNode;
  readonly kind: "error" | "loading" | "warning";
  readonly message: string;
}) {
  return (
    <main className={styles.routeState}>
      <ProductState
        action={action ?? <Link href="/workspace/new">새 프로젝트로 이동</Link>}
        description={message}
        kind={kind}
        title={kind === "loading" ? "Workspace 준비 중" : "Workspace를 확인해주세요"}
      />
    </main>
  );
}

// Repository 분석이 있으면 검증된 Template을 쓰고 아니면 빈 Board를 사용합니다.
async function createFallbackDiagram(
  projectId: string,
  projectName: string,
  handoff: RepositoryAnalysisHandoffLocation | undefined
): Promise<DiagramJson> {
  if (!handoff) return EMPTY_DIAGRAM;
  const repositories = await listSourceRepositories(projectId);
  const template = resolveRepositoryAnalysisTemplate(repositories, handoff);
  return buildBoardTemplateDiagram(template.id, { projectSlug: projectName, shortId: "workspace" }) ?? EMPTY_DIAGRAM;
}
