import {
  serializeBoardAutoOrganizeSource,
  type BoardAutoOrganizeCandidate,
  type DiagramJson,
  type ReverseEngineeringSourceKind
} from "@sketchcatch/types";

export type ReverseEngineeringApplyPreview = {
  readonly sourceDiagram: DiagramJson;
  readonly sourceDraftRevision: number | null;
  readonly sourceFingerprint: string;
};

export type ExistingReverseEngineeringApplyOutcome =
  | { readonly status: "stale" }
  | { readonly status: "saved" }
  | { readonly status: "saved_without_snapshot" };

/** 이번 scan application이 소유한 node에만 추적용 provenance를 남깁니다. */
export function attachReverseEngineeringSourceToDiagram({
  diagram,
  draftId,
  sourceNodeIds,
  sourceKind,
  sourceScanId
}: {
  readonly diagram: DiagramJson;
  readonly draftId: string;
  readonly sourceNodeIds: readonly string[];
  readonly sourceKind: ReverseEngineeringSourceKind;
  readonly sourceScanId: string;
}): DiagramJson {
  const ownedNodeIds = new Set(sourceNodeIds);

  return {
    ...diagram,
    nodes: diagram.nodes.map((node) => {
      if (!ownedNodeIds.has(node.id) || !node.parameters) {
        return node;
      }

      return {
        ...node,
        parameters: {
          ...node.parameters,
          values: {
            ...node.parameters.values,
            reverseEngineeringSourceScanId: sourceScanId,
            reverseEngineeringDraftId: draftId,
            reverseEngineeringSourceKind: sourceKind
          }
        }
      };
    })
  };
}

/** 비영속 preview scan은 삭제된 저장 기록으로 오인하지 않고, durable scan만 돌려줍니다. */
export function getSavedReverseEngineeringSourceScanIds(diagram: DiagramJson): string[] {
  return [
    ...new Set(
      diagram.nodes.flatMap((node) => {
        const values = node.parameters?.values;
        const sourceScanId = values?.["reverseEngineeringSourceScanId"];
        const sourceKind = values?.["reverseEngineeringSourceKind"];

        if (sourceKind === "preview_scan") {
          return [];
        }

        return typeof sourceScanId === "string" && sourceScanId.length > 0
          ? [sourceScanId]
          : [];
      })
    )
  ];
}

/** 각 mode가 독립 정렬한 후보 중 실제로 미리볼 후보만 그 mode 안에서 고릅니다. */
export function selectReverseEngineeringOrganizationCandidate({
  candidates,
  mode,
  selectedCandidateId
}: {
  readonly candidates: {
    readonly append: readonly BoardAutoOrganizeCandidate[] | null;
    readonly replace: readonly BoardAutoOrganizeCandidate[];
  };
  readonly mode: "replace" | "append";
  readonly selectedCandidateId: string | null;
}): BoardAutoOrganizeCandidate | null {
  const modeCandidates = mode === "append" ? candidates.append : candidates.replace;

  if (!modeCandidates) {
    return null;
  }

  return (
    modeCandidates.find((candidate) => candidate.id === selectedCandidateId) ??
    modeCandidates[0] ??
    null
  );
}

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

  try {
    await saveSnapshot();
  } catch {
    return { status: "saved_without_snapshot" };
  }

  return { status: "saved" };
}
