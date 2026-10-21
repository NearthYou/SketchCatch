import {
  hasSameBoardAutoOrganizeSemantics,
  serializeBoardAutoOrganizeSource,
  type BoardAutoOrganizeCandidate,
  type BoardAutoOrganizeCandidateSet,
  type DiagramJson,
  type TerraformSyncFileInput
} from "@sketchcatch/types";

export type BoardAutoOrganizePreviewView = "original" | "organized";
export type BoardAutoOrganizeViewportAction = "open" | "switch";

export type BoardAutoOrganizeViewportPolicy = {
  readonly applySourceViewport: boolean;
  readonly autoFit: boolean;
};

export type BoardAutoOrganizePreviewSession = {
  readonly sessionId: string;
  readonly originalDiagram: DiagramJson;
  readonly organizedResult: BoardAutoOrganizeCandidate;
  readonly activeView: BoardAutoOrganizePreviewView;
  readonly sourceFingerprint: string;
  readonly sourceDraftRevision: number | null;
  readonly viewportBeforePreview: DiagramJson["viewport"];
};

export type BoardAutoOrganizeApplyRequest = {
  readonly sessionId: string;
  readonly candidateId: string;
  readonly sourceDiagram: DiagramJson;
  readonly sourceFingerprint: string;
  readonly candidateDiagram: DiagramJson;
  readonly expectedRevision: number | null;
  readonly terraformFiles: TerraformSyncFileInput[];
};

export type BoardAutoOrganizeApplyResult<TSaveResult> =
  | { readonly status: "stale" }
  | {
      readonly status: "saved";
      readonly diagramToApply: DiagramJson;
      readonly saveResult: TSaveResult;
    };

/** 미리보기를 처음 열 때만 화면을 맞추고 이후 선택은 현재 viewport를 유지합니다. */
export function getBoardAutoOrganizeViewportPolicy(
  action: BoardAutoOrganizeViewportAction
): BoardAutoOrganizeViewportPolicy {
  return action === "open"
    ? { applySourceViewport: true, autoFit: true }
    : { applySourceViewport: false, autoFit: false };
}

/** 가장 높은 순위의 정리 결과와 생성 당시 Board revision을 독립적인 로컬 session으로 복사합니다. */
export function createBoardAutoOrganizePreviewSession(
  originalDiagram: DiagramJson,
  candidateSet: BoardAutoOrganizeCandidateSet,
  sourceDraftRevision: number | null,
  viewportBeforePreview: DiagramJson["viewport"] = originalDiagram.viewport
): BoardAutoOrganizePreviewSession {
  const organizedResult = candidateSet.candidates[0];

  if (!organizedResult) {
    throw new Error("표시할 Board 정리본이 없습니다.");
  }

  return {
    sessionId: candidateSet.sessionId,
    originalDiagram: structuredClone(originalDiagram),
    organizedResult: structuredClone(organizedResult),
    activeView: "organized",
    sourceFingerprint: candidateSet.sourceFingerprint,
    sourceDraftRevision,
    viewportBeforePreview: structuredClone(viewportBeforePreview)
  };
}

/** 원본·정리본 전환은 정리 결과와 저장 상태를 건드리지 않습니다. */
export function selectBoardAutoOrganizePreviewView(
  session: BoardAutoOrganizePreviewSession,
  activeView: BoardAutoOrganizePreviewView
): BoardAutoOrganizePreviewSession {
  return { ...session, activeView };
}

/** 현재 toggle에 맞는 Diagram 복사본만 미리보기 canvas에 제공합니다. */
export function getBoardAutoOrganizeVisibleDiagram(
  session: BoardAutoOrganizePreviewSession
): DiagramJson {
  const visibleDiagram =
    session.activeView === "original"
      ? session.originalDiagram
      : session.organizedResult.diagram;

  return structuredClone(visibleDiagram);
}

/** 원본과 revision이 그대로일 때만 서버 성공 뒤 적용 가능한 Diagram을 반환합니다. */
export async function applyBoardAutoOrganizeCandidate<TSaveResult>({
  currentDiagram,
  currentDraftRevision,
  save,
  session,
  terraformFiles
}: {
  readonly currentDiagram: DiagramJson;
  readonly currentDraftRevision: number | null;
  readonly save: (request: BoardAutoOrganizeApplyRequest) => Promise<TSaveResult>;
  readonly session: BoardAutoOrganizePreviewSession;
  readonly terraformFiles: readonly TerraformSyncFileInput[];
}): Promise<BoardAutoOrganizeApplyResult<TSaveResult>> {
  const organizedResult = session.organizedResult;
  const sourceIsCurrent =
    serializeBoardAutoOrganizeSource(currentDiagram) ===
    serializeBoardAutoOrganizeSource(session.originalDiagram);

  if (
    currentDraftRevision !== session.sourceDraftRevision ||
    !sourceIsCurrent ||
    !hasSameBoardAutoOrganizeSemantics(
      session.originalDiagram,
      organizedResult.diagram
    )
  ) {
    return { status: "stale" };
  }

  const saveResult = await save({
    sessionId: session.sessionId,
    candidateId: organizedResult.id,
    sourceDiagram: structuredClone(session.originalDiagram),
    sourceFingerprint: session.sourceFingerprint,
    candidateDiagram: structuredClone(organizedResult.diagram),
    expectedRevision: session.sourceDraftRevision,
    terraformFiles: terraformFiles.map((file) => ({ ...file }))
  });

  return {
    status: "saved",
    diagramToApply: structuredClone(organizedResult.diagram),
    saveResult
  };
}
