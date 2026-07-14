import type {
  ArchitectureBoardKnowledgeArtifact,
  ArchitectureBoardLeaveOneOutResult
} from "./architecture-board-knowledge-contract";
import { generatedArchitectureBoardKnowledgeArtifact } from "./architecture-board-knowledge.generated";

export {
  ARCHITECTURE_BOARD_KNOWLEDGE_VERSION,
  type ArchitectureBoardKnowledgeArtifact,
  type ArchitectureBoardKnowledgeCase,
  type ArchitectureBoardLeaveOneOutResult
} from "./architecture-board-knowledge-contract";

// This is a checked-in static artifact. Source fixtures are only read by the generator.
export const architectureBoardKnowledge: ArchitectureBoardKnowledgeArtifact =
  generatedArchitectureBoardKnowledgeArtifact;

export function createArchitectureBoardKnowledgeArtifact(): ArchitectureBoardKnowledgeArtifact {
  return cloneArchitectureBoardKnowledgeArtifact(architectureBoardKnowledge);
}

export function evaluateArchitectureBoardKnowledgeLeaveOneOut(
  artifact: ArchitectureBoardKnowledgeArtifact = architectureBoardKnowledge
): readonly ArchitectureBoardLeaveOneOutResult[] {
  return artifact.cases.map((heldOutCase) => {
    const candidates = artifact.cases
      .filter((candidate) => candidate.id !== heldOutCase.id)
      .map((candidate) => ({
        candidate,
        similarity: resourceTypeSimilarity(heldOutCase.nodeTypes, candidate.nodeTypes)
      }))
      .sort(
        (left, right) =>
          right.similarity - left.similarity || left.candidate.id.localeCompare(right.candidate.id)
      );
    const nearest = candidates[0]?.candidate;

    if (!nearest) {
      throw new Error("Leave-one-out evaluation requires at least two knowledge cases.");
    }

    return {
      heldOutCaseId: heldOutCase.id,
      nearestCaseId: nearest.id,
      resourceTypeRecall: round(resourceTypeSimilarity(heldOutCase.nodeTypes, nearest.nodeTypes)),
      aspectRatioError: round(relativeError(heldOutCase.meanAspectRatio, nearest.meanAspectRatio)),
      siblingGapError: round(relativeError(heldOutCase.meanSiblingGap, nearest.meanSiblingGap))
    };
  });
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function resourceTypeSimilarity(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0) return right.length === 0 ? 1 : 0;
  const rightTypes = new Set(right);
  return left.filter((type) => rightTypes.has(type)).length / left.length;
}

function relativeError(expected: number, actual: number): number {
  if (expected === 0) return actual === 0 ? 0 : 1;
  return Math.abs(expected - actual) / Math.abs(expected);
}

function cloneArchitectureBoardKnowledgeArtifact(
  artifact: ArchitectureBoardKnowledgeArtifact
): ArchitectureBoardKnowledgeArtifact {
  return {
    version: artifact.version,
    hash: artifact.hash,
    cases: artifact.cases.map((knowledgeCase) => ({
      ...knowledgeCase,
      nodeTypes: [...knowledgeCase.nodeTypes]
    })),
    unavailableTemplateIds: [...artifact.unavailableTemplateIds]
  };
}
