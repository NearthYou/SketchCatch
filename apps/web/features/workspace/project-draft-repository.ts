import {
  loadProjectDiagramDraft,
  saveProjectDiagramDraft,
  type LoadProjectDiagramDraftInput,
  type LoadedProjectDiagramDraft,
  type SaveProjectDiagramDraftInput,
  type SavedProjectDiagramDraft
} from "./project-draft-sync";

export type ProjectDraftRepository = {
  load(input: LoadProjectDiagramDraftInput): Promise<LoadedProjectDiagramDraft>;
  save(input: SaveProjectDiagramDraftInput): Promise<SavedProjectDiagramDraft>;
};

export type ProjectDraftRepositoryDependencies = {
  loadProjectDiagramDraft?: typeof loadProjectDiagramDraft | undefined;
  saveProjectDiagramDraft?: typeof saveProjectDiagramDraft | undefined;
};

export function createProjectDraftRepository(
  dependencies: ProjectDraftRepositoryDependencies = {}
): ProjectDraftRepository {
  const loadDraft = dependencies.loadProjectDiagramDraft ?? loadProjectDiagramDraft;
  const saveDraft = dependencies.saveProjectDiagramDraft ?? saveProjectDiagramDraft;

  return {
    load: (input) => loadDraft(input),
    save: (input) => saveDraft(input)
  };
}

export const defaultProjectDraftRepository = createProjectDraftRepository();
