import type { DiagramJson, ProjectDraftResponse, TerraformSyncFileInput } from "../../../../packages/types/src";
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
  terraformFiles?: TerraformSyncFileInput[] | undefined;
  localCacheWorkspaceId?: string | undefined;
  previousLocalDraft?: LocalProjectDraft | null | undefined;
  projectId: string;
  shouldSyncLocalDraft?: (() => boolean) | undefined;
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

type SaveLocalProjectDiagramDraftDependencies = {
  now?: (() => string) | undefined;
  writeLocalProjectDraft?: typeof writeLocalProjectDraft | undefined;
};

type SaveServerProjectDiagramDraftDependencies = {
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

export type SavedLocalProjectDiagramDraft = {
  localDraft: LocalProjectDraft;
};

export type SavedServerProjectDiagramDraft =
  | {
      ok: true;
      localDraft: LocalProjectDraft;
      serverDraft: NonNullable<ProjectDraftResponse["draft"]>;
    }
  | {
      ok: false;
      error: unknown;
      localDraft: LocalProjectDraft | null;
      serverDraft: null;
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
  const localResult = await saveLocalProjectDiagramDraft(input, dependencies);
  const serverResult = await saveServerProjectDiagramDraft(
    {
      ...input,
      previousLocalDraft: localResult.localDraft
    },
    dependencies
  );

  if (!serverResult.ok) {
    return {
      localDraft: localResult.localDraft,
      serverDraft: null
    };
  }

  return {
    localDraft: serverResult.localDraft,
    serverDraft: serverResult.serverDraft
  };
}

export async function saveLocalProjectDiagramDraft(
  input: SaveProjectDiagramDraftInput,
  dependencies: SaveLocalProjectDiagramDraftDependencies = {}
): Promise<SavedLocalProjectDiagramDraft> {
  const writeLocal = dependencies.writeLocalProjectDraft ?? writeLocalProjectDraft;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const localDraft = createProjectLocalDraft(input, now());

  await writeLocal(localDraft);

  return {
    localDraft
  };
}

export async function saveServerProjectDiagramDraft(
  input: SaveProjectDiagramDraftInput,
  dependencies: SaveServerProjectDiagramDraftDependencies = {}
): Promise<SavedServerProjectDiagramDraft> {
  const writeLocal = dependencies.writeLocalProjectDraft ?? writeLocalProjectDraft;
  const saveServer = dependencies.saveProjectDraft ?? saveProjectDraft;
  const now = dependencies.now ?? (() => new Date().toISOString());
  let serverResponse: ProjectDraftResponse;

  try {
    serverResponse = await saveServer({
      projectId: input.projectId,
      diagramJson: input.diagramJson,
      ...(input.terraformFiles !== undefined ? { terraformFiles: input.terraformFiles } : {})
    });
  } catch (error) {
    return {
      ok: false,
      error,
      localDraft: input.previousLocalDraft ?? null,
      serverDraft: null
    };
  }

  if (!serverResponse.draft) {
    return {
      ok: false,
      error: new Error("Project draft save returned an empty draft."),
      localDraft: input.previousLocalDraft ?? null,
      serverDraft: null
    };
  }

  const localDraft = input.previousLocalDraft ?? createProjectLocalDraft(input, now());
  const syncedLocalDraft = markDraftServerSaved(localDraft, serverResponse.draft);

  if (input.shouldSyncLocalDraft?.() ?? true) {
    await writeLocal(syncedLocalDraft);
  }

  return {
    ok: true,
    localDraft: syncedLocalDraft,
    serverDraft: serverResponse.draft
  };
}

function createProjectLocalDraft(input: SaveProjectDiagramDraftInput, savedAt: string): LocalProjectDraft {
  return createLocalProjectDraft({
    workspaceId: getLocalCacheWorkspaceId(input),
    projectId: input.projectId,
    diagramJson: input.diagramJson,
    terraformFiles: input.terraformFiles,
    previousDraft: input.previousLocalDraft,
    savedAt
  });
}

function getLocalCacheWorkspaceId(input: {
  localCacheWorkspaceId?: string | undefined;
  projectId: string;
  workspaceId?: string | undefined;
}): string {
  return input.localCacheWorkspaceId ?? input.workspaceId ?? `project:${input.projectId}`;
}
