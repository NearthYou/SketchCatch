import { isDeepStrictEqual } from "node:util";
import type { ProjectDraft, DiagramJson, TerraformSyncFileInput } from "@sketchcatch/types";

export type ProjectDraftRow = {
  id: string;
  projectId: string;
  diagramJson: DiagramJson;
  terraformFiles: TerraformSyncFileInput[] | null;
  revision: number;
  serverSavedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export function getNextDraftRevision(currentRevision: number | null | undefined): number {
  return currentRevision === null || currentRevision === undefined ? 1 : currentRevision + 1;
}

export function hasSameProjectDraftContent(
  current: Pick<ProjectDraftRow, "diagramJson" | "terraformFiles">,
  next: Pick<ProjectDraftRow, "diagramJson" | "terraformFiles">
): boolean {
  return (
    isDeepStrictEqual(current.diagramJson, next.diagramJson) &&
    isDeepStrictEqual(current.terraformFiles, next.terraformFiles)
  );
}

export function toProjectDraft(row: ProjectDraftRow): ProjectDraft {
  return {
    id: row.id,
    projectId: row.projectId,
    diagramJson: row.diagramJson,
    ...(row.terraformFiles ? { terraformFiles: row.terraformFiles } : {}),
    revision: row.revision,
    serverSavedAt: row.serverSavedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
