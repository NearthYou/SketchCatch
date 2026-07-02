import {
  loadProjectDiagramDraft,
  saveLocalProjectDiagramDraft,
  saveProjectDiagramDraft,
  saveServerProjectDiagramDraft,
  type LoadProjectDiagramDraftInput,
  type LoadedProjectDiagramDraft,
  type SavedLocalProjectDiagramDraft,
  type SaveProjectDiagramDraftInput,
  type SavedProjectDiagramDraft,
  type SavedServerProjectDiagramDraft
} from "./project-draft-sync";

export type ProjectDraftRepository = {
  load(input: LoadProjectDiagramDraftInput): Promise<LoadedProjectDiagramDraft>;
  save(input: SaveProjectDiagramDraftInput): Promise<SavedProjectDiagramDraft>;
  saveLocal(input: SaveProjectDiagramDraftInput): Promise<SavedLocalProjectDiagramDraft>;
  saveServer(input: SaveProjectDiagramDraftInput): Promise<SavedServerProjectDiagramDraft>;
};

export type ProjectDraftRepositoryDependencies = {
  loadProjectDiagramDraft?: typeof loadProjectDiagramDraft | undefined;
  saveLocalProjectDiagramDraft?: typeof saveLocalProjectDiagramDraft | undefined;
  saveProjectDiagramDraft?: typeof saveProjectDiagramDraft | undefined;
  saveServerProjectDiagramDraft?: typeof saveServerProjectDiagramDraft | undefined;
};

export function createProjectDraftRepository(
  dependencies: ProjectDraftRepositoryDependencies = {}
): ProjectDraftRepository {
  const loadDraft = dependencies.loadProjectDiagramDraft ?? loadProjectDiagramDraft;
  const saveDraft = dependencies.saveProjectDiagramDraft ?? saveProjectDiagramDraft;
  const saveLocalDraft = dependencies.saveLocalProjectDiagramDraft ?? saveLocalProjectDiagramDraft;
  const saveServerDraft = dependencies.saveServerProjectDiagramDraft ?? saveServerProjectDiagramDraft;

  return {
    load: (input) => loadDraft(input),
    save: (input) => saveDraft(input),
    saveLocal: (input) => saveLocalDraft(input),
    saveServer: (input) => saveServerDraft(input)
  };
}

export const defaultProjectDraftRepository = createProjectDraftRepository();
