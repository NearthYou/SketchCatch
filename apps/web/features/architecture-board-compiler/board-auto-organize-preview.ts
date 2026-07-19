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
  readonly candidates: readonly BoardAutoOrganizeCandidate[];
  readonly selectedCandidateId: string;
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

/** Task 6 후보 전체와 생성 당시 Board revision을 독립적인 로컬 session으로 복사합니다. */
export function createBoardAutoOrganizePreviewSession(
  originalDiagram: DiagramJson,
  candidateSet: BoardAutoOrganizeCandidateSet,
  sourceDraftRevision: number | null,
  viewportBeforePreview: DiagramJson["viewport"] = originalDiagram.viewport
): BoardAutoOrganizePreviewSession {
  const candidates = structuredClone(candidateSet.candidates);
  const selectedCandidate = candidates[0];

  if (!selectedCandidate) {
    throw new Error("표시할 Board 정리안이 없습니다.");
  }

  return {
    sessionId: candidateSet.sessionId,
    originalDiagram: structuredClone(originalDiagram),
    candidates,
    selectedCandidateId: selectedCandidate.id,
    activeView: "organized",
    sourceFingerprint: candidateSet.sourceFingerprint,
    sourceDraftRevision,
    viewportBeforePreview: structuredClone(viewportBeforePreview)
  };
}

/** 후보 버튼 선택은 저장 payload를 만들지 않고 session의 선택값만 바꿉니다. */
export function selectBoardAutoOrganizeCandidate(
  session: BoardAutoOrganizePreviewSession,
  candidateId: string
): BoardAutoOrganizePreviewSession {
  if (!session.candidates.some((candidate) => candidate.id === candidateId)) {
    return session;
  }

  return {
    ...session,
    activeView: "organized",
    selectedCandidateId: candidateId
  };
}

/** 모바일 원본·정리안 전환은 선택 후보와 저장 상태를 건드리지 않습니다. */
export function selectBoardAutoOrganizePreviewView(
  session: BoardAutoOrganizePreviewSession,
  activeView: BoardAutoOrganizePreviewView
): BoardAutoOrganizePreviewSession {
  return { ...session, activeView };
}

/** 현재 session에서 사용자가 고른 후보를 찾습니다. */
export function getBoardAutoOrganizeSelectedCandidate(
  session: BoardAutoOrganizePreviewSession
): BoardAutoOrganizeCandidate | null {
  return (
    session.candidates.find((candidate) => candidate.id === session.selectedCandidateId) ?? null
  );
}

/** 현재 toggle에 맞는 Diagram 복사본만 미리보기 canvas에 제공합니다. */
export function getBoardAutoOrganizeVisibleDiagram(
  session: BoardAutoOrganizePreviewSession
): DiagramJson {
  const selectedCandidate = getBoardAutoOrganizeSelectedCandidate(session);
  const visibleDiagram =
    session.activeView === "original" || !selectedCandidate
      ? session.originalDiagram
      : selectedCandidate.diagram;

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
  const selectedCandidate = getBoardAutoOrganizeSelectedCandidate(session);
  const sourceIsCurrent =
    serializeBoardAutoOrganizeSource(currentDiagram) ===
    serializeBoardAutoOrganizeSource(session.originalDiagram);

  if (
    !selectedCandidate ||
    currentDraftRevision !== session.sourceDraftRevision ||
    !sourceIsCurrent ||
    !hasSameBoardAutoOrganizeSemantics(
      session.originalDiagram,
      selectedCandidate.diagram
    )
  ) {
    return { status: "stale" };
  }

  const saveResult = await save({
    sessionId: session.sessionId,
    candidateId: selectedCandidate.id,
    sourceDiagram: structuredClone(session.originalDiagram),
    sourceFingerprint: session.sourceFingerprint,
    candidateDiagram: structuredClone(selectedCandidate.diagram),
    expectedRevision: session.sourceDraftRevision,
    terraformFiles: terraformFiles.map((file) => ({ ...file }))
  });

  return {
    status: "saved",
    diagramToApply: structuredClone(selectedCandidate.diagram),
    saveResult
  };
}
