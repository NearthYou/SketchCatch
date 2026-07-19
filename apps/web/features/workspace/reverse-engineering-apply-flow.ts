import {
  serializeBoardAutoOrganizeSource,
  type DiagramJson
} from "@sketchcatch/types";

export type ReverseEngineeringApplyPreview = {
  readonly sourceDiagram: DiagramJson;
  readonly sourceDraftRevision: number | null;
  readonly sourceFingerprint: string;
};

export type ExistingReverseEngineeringApplyOutcome =
  | { readonly status: "stale" }
  | { readonly status: "saved" };

/** Reverse 미리보기가 시작된 순간의 저장 revision과 Board 내용을 함께 고정합니다. */
export function createReverseEngineeringApplyPreview({
  diagram,
  draftRevision
}: {
  readonly diagram: DiagramJson;
  readonly draftRevision: number | null;
}): ReverseEngineeringApplyPreview {
  const sourceDiagram = structuredClone(diagram);

  return {
    sourceDiagram,
    sourceDraftRevision: draftRevision,
    sourceFingerprint: serializeBoardAutoOrganizeSource(sourceDiagram)
  };
}

/** 고정한 revision과 Board가 모두 현재일 때만 서버 CAS와 후속 Snapshot을 실행합니다. */
export async function applyExistingReverseEngineeringPreview({
  currentDiagram,
  currentDraftRevision,
  diagramToApply,
  persistAndApply,
  preview,
  saveSnapshot
}: {
  readonly currentDiagram: DiagramJson;
  readonly currentDraftRevision: number | null;
  readonly diagramToApply: DiagramJson;
  readonly persistAndApply: (diagram: DiagramJson, expectedRevision: number) => Promise<void>;
  readonly preview: ReverseEngineeringApplyPreview;
  readonly saveSnapshot: () => Promise<void>;
}): Promise<ExistingReverseEngineeringApplyOutcome> {
  if (
    preview.sourceDraftRevision === null ||
    currentDraftRevision !== preview.sourceDraftRevision ||
    serializeBoardAutoOrganizeSource(currentDiagram) !== preview.sourceFingerprint
  ) {
    return { status: "stale" };
  }

  await persistAndApply(structuredClone(diagramToApply), preview.sourceDraftRevision);
  await saveSnapshot();

  return { status: "saved" };
}
