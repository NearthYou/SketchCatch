import type {
  DiagramJson,
  ProjectDraftConflictResponse,
  ProjectDraftResponse,
  TerraformSyncFileInput
} from "../../../../packages/types/src";
import { ApiClientError } from "../../lib/api-client";
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
  writeLocalProjectDraft?: typeof writeLocalProjectDraft | undefined;
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
      conflict: ProjectDraftConflictResponse | null;
      localDraft: LocalProjectDraft | null;
      serverDraft: null;
    };

export async function loadProjectDiagramDraft(
  input: LoadProjectDiagramDraftInput,
  dependencies: LoadProjectDiagramDraftDependencies = {}
): Promise<LoadedProjectDiagramDraft> {
  const readLocal = dependencies.readLocalProjectDraft ?? readLocalProjectDraft;
  const readServer = dependencies.getProjectDraft ?? getProjectDraft;
  const writeLocal = dependencies.writeLocalProjectDraft ?? writeLocalProjectDraft;
  const localCacheWorkspaceId = getLocalCacheWorkspaceId(input);
  const [localDraft, serverResponse] = await Promise.all([
    readLocal(localCacheWorkspaceId, input.projectId),
    readServer(input.projectId)
  ]);
  const choice = chooseInitialDiagram({
    fallbackDiagram: input.fallbackDiagram,
    localDraft,
    serverDraft: serverResponse.draft
  });
  let resolvedLocalDraft = localDraft;

  if (choice.source === "server" && serverResponse.draft) {
    const localDraftForServer =
      localDraft ??
      createLocalProjectDraft({
        workspaceId: localCacheWorkspaceId,
        projectId: input.projectId,
        diagramJson: serverResponse.draft.diagramJson,
        terraformFiles: serverResponse.draft.terraformFiles,
        baseServerRevision: serverResponse.draft.revision,
        savedAt: serverResponse.draft.serverSavedAt
      });
    resolvedLocalDraft = markDraftServerSaved(localDraftForServer, serverResponse.draft);
    await writeLocal(resolvedLocalDraft);
  }

  return {
    ...choice,
    localDraft: resolvedLocalDraft,
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
      expectedRevision: input.previousLocalDraft?.baseServerRevision ?? null,
      ...(input.terraformFiles !== undefined ? { terraformFiles: input.terraformFiles } : {})
    });
  } catch (error) {
    return {
      ok: false,
      error,
      conflict: getProjectDraftConflict(error),
      localDraft: input.previousLocalDraft ?? null,
      serverDraft: null
    };
  }

  if (!serverResponse.draft) {
    return {
      ok: false,
      error: new Error("Project draft save returned an empty draft."),
      conflict: null,
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

function getProjectDraftConflict(error: unknown): ProjectDraftConflictResponse | null {
  if (!(error instanceof ApiClientError) || error.status !== 409) {
    return null;
  }

  const response = error.response as Partial<ProjectDraftConflictResponse>;

  if (
    response.error !== "conflict" ||
    typeof response.message !== "string" ||
    typeof response.currentRevision !== "number" ||
    !Number.isInteger(response.currentRevision) ||
    response.currentRevision < 1 ||
    typeof response.currentServerSavedAt !== "string"
  ) {
    return null;
  }

  return {
    error: "conflict",
    message: response.message,
    currentRevision: response.currentRevision,
    currentServerSavedAt: response.currentServerSavedAt
  };
}

function createProjectLocalDraft(
  input: SaveProjectDiagramDraftInput,
  savedAt: string
): LocalProjectDraft {
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
