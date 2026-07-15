import type { DiagramJson } from "@sketchcatch/types";
import { extractArchitectureBoardKnowledgeCase } from "./architecture-board-knowledge-metrics";
import type {
  ArchitectureBoardKnowledgeArtifact,
  ArchitectureBoardKnowledgeCase
} from "./architecture-board-knowledge-contract";

export type ArchitectureBoardKnowledgeEvaluation = {
  readonly metrics: Record<string, number>;
  readonly penalty: number;
  readonly referenceTemplateIds: readonly string[];
};

export type ArchitectureBoardKnowledgeLayoutProfile = {
  readonly columnGap: number;
  readonly id: string;
  readonly referenceTemplateId: string;
  readonly rowGap: number;
};

type RankedKnowledgeCase = {
  readonly knowledgeCase: ArchitectureBoardKnowledgeCase;
  readonly similarity: number;
};

const KNOWLEDGE_LAYOUT_COLUMN_GAP = { maximum: 160, minimum: 40 } as const;
const KNOWLEDGE_LAYOUT_ROW_GAP = { maximum: 112, minimum: 24 } as const;

// 사례는 좌표를 복사하는 blueprint가 아니라, 비슷한 graph가 어느 정도의 간격·흐름·밀도를
// 가지는지 알려 주는 비용 기준이다. 이 정책은 Compiler 내부에서만 사용한다.
export function evaluateArchitectureBoardKnowledgeQuality(
  diagram: DiagramJson,
  artifact: ArchitectureBoardKnowledgeArtifact
): ArchitectureBoardKnowledgeEvaluation {
  const ranked = rankArchitectureBoardKnowledgeCases(diagram, artifact);
  const reference = ranked[0];

  if (!reference) {
    return {
      penalty: 0,
      referenceTemplateIds: [],
      metrics: {
        knowledgePenalty: 0,
        knowledgeReferenceSimilarity: 0,
        knowledgeViewportAspectRatio: 0,
        knowledgeContainmentDepth: 0,
        knowledgeSiblingGap: 0,
        knowledgeEdgeLength: 0
      }
    };
  }

  const candidate = extractArchitectureBoardKnowledgeCase("compiler-candidate", diagram);
  const knowledgePenalty = round(
    weightedRelativeError(candidate.viewportAspectRatio, reference.knowledgeCase.viewportAspectRatio, 120) +
      weightedRelativeError(candidate.maxContainmentDepth, reference.knowledgeCase.maxContainmentDepth, 80) +
      weightedRelativeError(candidate.meanSiblingGap, reference.knowledgeCase.meanSiblingGap, 36) +
      weightedRelativeError(candidate.meanVerticalGap, reference.knowledgeCase.meanVerticalGap, 32) +
      weightedRelativeError(candidate.meanAreaPadding, reference.knowledgeCase.meanAreaPadding, 24) +
      weightedRelativeError(candidate.meanEdgeLength, reference.knowledgeCase.meanEdgeLength, 20) +
      weightedAbsoluteError(candidate.horizontalFlowRatio, reference.knowledgeCase.horizontalFlowRatio, 90) +
      weightedAbsoluteError(candidate.supportNodeRatio, reference.knowledgeCase.supportNodeRatio, 70) +
      weightedAbsoluteError(candidate.whitespaceRatio, reference.knowledgeCase.whitespaceRatio, 55)
  );

  return {
    penalty: knowledgePenalty,
    referenceTemplateIds: ranked.slice(0, 3).map(({ knowledgeCase }) => knowledgeCase.id),
    metrics: {
      knowledgePenalty,
      knowledgeReferenceSimilarity: round(reference.similarity),
      knowledgeViewportAspectRatio: reference.knowledgeCase.viewportAspectRatio,
      knowledgeContainmentDepth: reference.knowledgeCase.maxContainmentDepth,
      knowledgeSiblingGap: reference.knowledgeCase.meanSiblingGap,
      knowledgeEdgeLength: reference.knowledgeCase.meanEdgeLength
    }
  };
}

/**
 * The existing layout engine owns lane/order variants. Knowledge contributes a bounded
 * spacing profile derived from the nearest real Board, so it expands that candidate set
 * instead of replacing the deterministic baseline layouts.
 */
export function deriveArchitectureBoardKnowledgeLayoutProfiles(
  diagram: DiagramJson,
  artifact: ArchitectureBoardKnowledgeArtifact
): readonly ArchitectureBoardKnowledgeLayoutProfile[] {
  const reference = rankArchitectureBoardKnowledgeCases(diagram, artifact)[0];

  if (!reference || reference.similarity <= 0) {
    return [];
  }

  return [
    {
      id: `knowledge:${reference.knowledgeCase.id}`,
      referenceTemplateId: reference.knowledgeCase.id,
      columnGap: clamp(
        reference.knowledgeCase.meanSiblingGap,
        KNOWLEDGE_LAYOUT_COLUMN_GAP.minimum,
        KNOWLEDGE_LAYOUT_COLUMN_GAP.maximum
      ),
      rowGap: clamp(
        reference.knowledgeCase.meanVerticalGap,
        KNOWLEDGE_LAYOUT_ROW_GAP.minimum,
        KNOWLEDGE_LAYOUT_ROW_GAP.maximum
      )
    }
  ];
}

export function rankArchitectureBoardKnowledgeCases(
  diagram: DiagramJson,
  artifact: ArchitectureBoardKnowledgeArtifact
): readonly RankedKnowledgeCase[] {
  const candidate = extractArchitectureBoardKnowledgeCase("compiler-candidate", diagram);

  return artifact.cases
    .map((knowledgeCase) => ({
      knowledgeCase,
      similarity: getKnowledgeCaseSimilarity(candidate, knowledgeCase)
    }))
    .sort(
      (left, right) =>
        right.similarity - left.similarity || left.knowledgeCase.id.localeCompare(right.knowledgeCase.id)
    );
}

function getKnowledgeCaseSimilarity(
  candidate: ArchitectureBoardKnowledgeCase,
  reference: ArchitectureBoardKnowledgeCase
): number {
  return round(
    jaccard(candidate.nodeTypes, reference.nodeTypes) * 0.65 +
      relativeSimilarity(candidate.nodeCount, reference.nodeCount) * 0.15 +
      relativeSimilarity(candidate.edgeCount, reference.edgeCount) * 0.1 +
      relativeSimilarity(candidate.areaCount, reference.areaCount) * 0.05 +
      relativeSimilarity(candidate.maxContainmentDepth, reference.maxContainmentDepth) * 0.05
  );
}

function jaccard(left: readonly string[], right: readonly string[]): number {
  const rightValues = new Set(right);
  const union = new Set([...left, ...right]);

  return union.size === 0 ? 1 : left.filter((value) => rightValues.has(value)).length / union.size;
}

function relativeSimilarity(left: number, right: number): number {
  return 1 - Math.min(relativeError(left, right), 1);
}

function weightedRelativeError(actual: number, expected: number, weight: number): number {
  return relativeError(actual, expected) * weight;
}

function weightedAbsoluteError(actual: number, expected: number, weight: number): number {
  return Math.min(1, Math.abs(actual - expected)) * weight;
}

function relativeError(actual: number, expected: number): number {
  if (expected === 0) return actual === 0 ? 0 : 1;
  return Math.min(1, Math.abs(actual - expected) / Math.abs(expected));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
