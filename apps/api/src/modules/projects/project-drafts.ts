import type { ProjectDraft, DiagramJson } from "@sketchcatch/types";

export type ProjectDraftRow = {
  projectId: string;
  diagramJson: DiagramJson;
  revision: number;
  serverSavedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export function getNextDraftRevision(currentRevision: number | null | undefined): number {
  return currentRevision === null || currentRevision === undefined ? 1 : currentRevision + 1;
}

export function toProjectDraft(row: ProjectDraftRow): ProjectDraft {
  return {
    projectId: row.projectId,
    diagramJson: row.diagramJson,
    revision: row.revision,
    serverSavedAt: row.serverSavedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
