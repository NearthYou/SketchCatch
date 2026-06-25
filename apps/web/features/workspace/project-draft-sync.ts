import type { DiagramJson, ProjectDraftResponse } from "../../../../packages/types/src";
import { getProjectDraft, saveProjectDraft } from "./api";
import {
  chooseInitialDiagram,
  createLocalProjectDraft,
  markDraftServerSaved,
  readLocalProjectDraft,
  writeLocalProjectDraft
} from "./project-draft-persistence";
import type { InitialDiagramChoice, LocalProjectDraft } from "./project-draft-persistence";

export type LoadProjectDiagramDraftInput = {
  fallbackDiagram: DiagramJson;
  localCacheWorkspaceId?: string | undefined;
  projectId: string;
  workspaceId?: string | undefined;
};

export type SaveProjectDiagramDraftInput = {
  diagramJson: DiagramJson;
  localCacheWorkspaceId?: string | undefined;
  previousLocalDraft?: LocalProjectDraft | null | undefined;
  projectId: string;
  workspaceId?: string | undefined;
};

type LoadProjectDiagramDraftDependencies = {
  getProjectDraft?: typeof getProjectDraft | undefined;
  readLocalProjectDraft?: typeof readLocalProjectDraft | undefined;
};

type SaveProjectDiagramDraftDependencies = {
  now?: (() => string) | undefined;
  saveProjectDraft?: typeof saveProjectDraft | undefined;
  writeLocalProjectDraft?: typeof writeLocalProjectDraft | undefined;
};

export type LoadedProjectDiagramDraft = InitialDiagramChoice & {
  localDraft: LocalProjectDraft | null;
  serverDraft: ProjectDraftResponse["draft"];
};

export type SavedProjectDiagramDraft = {
  localDraft: LocalProjectDraft;
  serverDraft: ProjectDraftResponse["draft"];
};

export async function loadProjectDiagramDraft(
  input: LoadProjectDiagramDraftInput,
  dependencies: LoadProjectDiagramDraftDependencies = {}
): Promise<LoadedProjectDiagramDraft> {
  const readLocal = dependencies.readLocalProjectDraft ?? readLocalProjectDraft;
  const readServer = dependencies.getProjectDraft ?? getProjectDraft;
  const localCacheWorkspaceId = getLocalCacheWorkspaceId(input);
  const [localDraft, serverResponse] = await Promise.all([
    readLocal(localCacheWorkspaceId, input.projectId),
    readServer(input.projectId).catch((): ProjectDraftResponse => ({ draft: null }))
  ]);
  const choice = chooseInitialDiagram({
    fallbackDiagram: input.fallbackDiagram,
    localDraft,
    serverDraft: serverResponse.draft
  });

  return {
    ...choice,
    localDraft,
    serverDraft: serverResponse.draft
  };
}

export async function saveProjectDiagramDraft(
  input: SaveProjectDiagramDraftInput,
  dependencies: SaveProjectDiagramDraftDependencies = {}
): Promise<SavedProjectDiagramDraft> {
  const writeLocal = dependencies.writeLocalProjectDraft ?? writeLocalProjectDraft;
  const saveServer = dependencies.saveProjectDraft ?? saveProjectDraft;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const localCacheWorkspaceId = getLocalCacheWorkspaceId(input);
  const localDraft = createLocalProjectDraft({
    workspaceId: localCacheWorkspaceId,
    projectId: input.projectId,
    diagramJson: input.diagramJson,
    previousDraft: input.previousLocalDraft,
    savedAt: now()
  });

  await writeLocal(localDraft);

  let serverResponse: ProjectDraftResponse;

  try {
    serverResponse = await saveServer({
      projectId: input.projectId,
      diagramJson: input.diagramJson
    });
  } catch {
    return {
      localDraft,
      serverDraft: null
    };
  }

  if (!serverResponse.draft) {
    return {
      localDraft,
      serverDraft: null
    };
  }

  const syncedLocalDraft = markDraftServerSaved(localDraft, serverResponse.draft);
  await writeLocal(syncedLocalDraft);

  return {
    localDraft: syncedLocalDraft,
    serverDraft: serverResponse.draft
  };
}

function getLocalCacheWorkspaceId(input: {
  localCacheWorkspaceId?: string | undefined;
  projectId: string;
  workspaceId?: string | undefined;
}): string {
  return input.localCacheWorkspaceId ?? input.workspaceId ?? `project:${input.projectId}`;
}
