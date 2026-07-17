import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { SaveProjectDraftRequest } from "@sketchcatch/types";
import type { Database } from "../../db/client.js";
import { projectDrafts, projects, touchUpdatedAt } from "../../db/schema.js";
import {
  getNextDraftRevision,
  hasSameProjectDraftContent,
  type ProjectDraftRow
} from "./project-drafts.js";

export type SaveProjectDraftRevisionResult =
  | {
      status: "saved";
      draft: ProjectDraftRow;
    }
  | {
      status: "conflict";
      currentDraft: ProjectDraftRow;
    };

export async function saveProjectDraftRevision({
  db,
  input,
  projectId,
  userId
}: {
  db: Database;
  input: SaveProjectDraftRequest;
  projectId: string;
  userId: string;
}): Promise<SaveProjectDraftRevisionResult> {
  const [existingDraft] = await db
    .select()
    .from(projectDrafts)
    .where(eq(projectDrafts.projectId, projectId));

  if (existingDraft && input.expectedRevision !== existingDraft.revision) {
    return { status: "conflict", currentDraft: existingDraft };
  }

  if (!existingDraft && input.expectedRevision !== null) {
    throw new ProjectDraftRevisionMissingError();
  }

  const terraformFiles = input.terraformFiles ?? null;
  if (
    existingDraft &&
    hasSameProjectDraftContent(existingDraft, {
      diagramJson: input.diagramJson,
      terraformFiles
    })
  ) {
    const [verifiedDraft] = await db
      .update(projectDrafts)
      .set({ revision: existingDraft.revision })
      .where(
        and(
          eq(projectDrafts.projectId, projectId),
          eq(projectDrafts.revision, input.expectedRevision)
        )
      )
      .returning();

    return verifiedDraft
      ? { status: "saved", draft: verifiedDraft }
      : readProjectDraftConflict(db, projectId, "unchanged save");
  }

  const now = new Date();
  const revision = getNextDraftRevision(existingDraft?.revision);
  const savedDraft = existingDraft
    ? await updateExistingDraft({
        db,
        expectedRevision: input.expectedRevision,
        input,
        now,
        projectId,
        revision,
        terraformFiles
      })
    : await insertFirstDraft({ db, input, now, projectId, revision, terraformFiles });

  if (savedDraft.status === "conflict") {
    return savedDraft;
  }

  await db
    .update(projects)
    .set(touchUpdatedAt)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));

  return savedDraft;
}

export class ProjectDraftRevisionMissingError extends Error {
  constructor() {
    super("서버에 저장된 프로젝트 draft revision이 없습니다.");
    this.name = "ProjectDraftRevisionMissingError";
  }
}

async function updateExistingDraft({
  db,
  expectedRevision,
  input,
  now,
  projectId,
  revision,
  terraformFiles
}: {
  db: Database;
  expectedRevision: number | null;
  input: SaveProjectDraftRequest;
  now: Date;
  projectId: string;
  revision: number;
  terraformFiles: SaveProjectDraftRequest["terraformFiles"] | null;
}): Promise<SaveProjectDraftRevisionResult> {
  const [draft] = await db
    .update(projectDrafts)
    .set({
      diagramJson: input.diagramJson,
      terraformFiles,
      revision,
      serverSavedAt: now,
      updatedAt: now
    })
    .where(
      and(eq(projectDrafts.projectId, projectId), eq(projectDrafts.revision, expectedRevision))
    )
    .returning();

  return draft
    ? { status: "saved", draft }
    : readProjectDraftConflict(db, projectId, "save");
}

async function insertFirstDraft({
  db,
  input,
  now,
  projectId,
  revision,
  terraformFiles
}: {
  db: Database;
  input: SaveProjectDraftRequest;
  now: Date;
  projectId: string;
  revision: number;
  terraformFiles: SaveProjectDraftRequest["terraformFiles"] | null;
}): Promise<SaveProjectDraftRevisionResult> {
  const [draft] = await db
    .insert(projectDrafts)
    .values({
      id: randomUUID(),
      projectId,
      diagramJson: input.diagramJson,
      terraformFiles,
      revision,
      serverSavedAt: now,
      updatedAt: now
    })
    .onConflictDoNothing({ target: projectDrafts.projectId })
    .returning();

  return draft
    ? { status: "saved", draft }
    : readProjectDraftConflict(db, projectId, "first save");
}

async function readProjectDraftConflict(
  db: Database,
  projectId: string,
  operation: string
): Promise<SaveProjectDraftRevisionResult> {
  const [currentDraft] = await db
    .select()
    .from(projectDrafts)
    .where(eq(projectDrafts.projectId, projectId));

  if (!currentDraft) {
    throw new Error(`Project draft disappeared during ${operation}`);
  }

  return { status: "conflict", currentDraft };
}
