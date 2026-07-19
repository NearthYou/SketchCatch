import { isDeepStrictEqual } from "node:util";
import {
  hasSameBoardAutoOrganizeSemantics,
  serializeBoardAutoOrganizeSource,
  type DiagramJson,
  type TerraformSyncFileInput
} from "@sketchcatch/types";
import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { projectDrafts } from "../../db/schema.js";
import type { ProjectDraftRow } from "./project-drafts.js";
import { sanitizeAwsProjectDiagramRead } from "../../reverse-engineering/aws-project-read-sanitizer.js";
import {
  saveProjectDraftRevision,
  type SaveProjectDraftRevisionResult
} from "./project-draft-save-service.js";
import {
  BoardAutoOrganizeSemanticMismatchError,
  recomposeBoardAutoOrganizeDiagram
} from "./board-auto-organize-visual-policy.js";

export { BoardAutoOrganizeSemanticMismatchError } from "./board-auto-organize-visual-policy.js";

type BoardAutoOrganizeApplyInput = {
  readonly candidateDiagram: DiagramJson;
  readonly db: Database;
  readonly expectedRevision: number | null;
  readonly projectId: string;
  readonly sourceDiagram: DiagramJson;
  readonly sourceFingerprint: string;
  readonly terraformFiles: TerraformSyncFileInput[];
  readonly userId: string;
};

type BoardAutoOrganizeApplyDependencies = {
  readonly readDraft?: typeof readProjectDraft;
  readonly saveDraftRevision?: typeof saveProjectDraftRevision;
};

/** 서버가 요청 원본과 시각 후보를 다시 검증한 뒤 기존 ProjectDraft CAS만 호출합니다. */
export async function applyBoardAutoOrganizeDraft(
  input: BoardAutoOrganizeApplyInput,
  dependencies: BoardAutoOrganizeApplyDependencies = {}
): Promise<SaveProjectDraftRevisionResult> {
  const serializedRequestSource = serializeBoardAutoOrganizeSource(input.sourceDiagram);

  if (createFingerprint(serializedRequestSource) !== input.sourceFingerprint) {
    throw new BoardAutoOrganizeSourceMismatchError();
  }

  const readDraft = dependencies.readDraft ?? readProjectDraft;
  const persistedDraft = await readDraft({ db: input.db, projectId: input.projectId });

  if (!persistedDraft || input.expectedRevision === null) {
    throw new BoardAutoOrganizeSourceMismatchError();
  }

  if (persistedDraft.revision !== input.expectedRevision) {
    return { status: "conflict", currentDraft: persistedDraft };
  }

  const publicPersistedDraft = {
    ...persistedDraft,
    diagramJson: sanitizeAwsProjectDiagramRead(persistedDraft.diagramJson)
  };

  if (
    serializeBoardAutoOrganizeSource(publicPersistedDraft.diagramJson) !== serializedRequestSource ||
    !hasSameBoardAutoOrganizeSemantics(publicPersistedDraft.diagramJson, input.sourceDiagram)
  ) {
    throw new BoardAutoOrganizeSourceMismatchError();
  }

  if (!isDeepStrictEqual(publicPersistedDraft.terraformFiles ?? [], input.terraformFiles)) {
    throw new BoardAutoOrganizeSourceMismatchError();
  }

  if (
    !hasSameBoardAutoOrganizeSemantics(publicPersistedDraft.diagramJson, input.candidateDiagram)
  ) {
    throw new BoardAutoOrganizeSemanticMismatchError();
  }

  const diagramToSave = recomposeBoardAutoOrganizeDiagram(
    publicPersistedDraft.diagramJson,
    input.candidateDiagram
  );

  if (!hasSameBoardAutoOrganizeSemantics(publicPersistedDraft.diagramJson, diagramToSave)) {
    throw new BoardAutoOrganizeSemanticMismatchError();
  }

  const saveDraftRevision = dependencies.saveDraftRevision ?? saveProjectDraftRevision;

  return saveDraftRevision({
    db: input.db,
    input: {
      diagramJson: diagramToSave,
      expectedRevision: input.expectedRevision,
      ...(publicPersistedDraft.terraformFiles !== null
        ? { terraformFiles: publicPersistedDraft.terraformFiles.map((file) => ({ ...file })) }
        : {})
    },
    projectId: input.projectId,
    userId: input.userId
  });
}

/** 적용 직전의 ProjectDraft를 읽어 요청 source가 실제 저장 revision에서 왔는지 확인합니다. */
async function readProjectDraft({
  db,
  projectId
}: {
  readonly db: Database;
  readonly projectId: string;
}): Promise<ProjectDraftRow | null> {
  const [draft] = await db
    .select()
    .from(projectDrafts)
    .where(eq(projectDrafts.projectId, projectId));

  return draft ?? null;
}

/** Task 6 후보와 같은 source serializer/FNV-1a 규칙으로 서버 fingerprint를 다시 만듭니다. */
export function createBoardAutoOrganizeSourceFingerprint(diagram: DiagramJson): string {
  return createFingerprint(serializeBoardAutoOrganizeSource(diagram));
}

/** 브라우저 후보 생성과 동일한 UTF-16 FNV-1a 값을 8자리 hex로 고정합니다. */
function createFingerprint(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** 요청 source와 fingerprint가 다를 때 저장 전에 stale 처리를 요구합니다. */
export class BoardAutoOrganizeSourceMismatchError extends Error {
  /** 사용자에게 내부 fingerprint를 노출하지 않는 고정 오류를 만듭니다. */
  constructor() {
    super("미리보기를 만든 뒤 프로젝트 초안이 바뀌었습니다.");
    this.name = "BoardAutoOrganizeSourceMismatchError";
  }
}
