import {
  adaptBrainboardTemplateSource,
  brainboardTemplateRegistry,
  buildTemplateDiagramJson,
  templateDefinitions,
  type DiagramJson
} from "@sketchcatch/types";

export const ARCHITECTURE_BOARD_KNOWLEDGE_VERSION = "architecture-board-knowledge/v1";

export type ArchitectureBoardKnowledgeCase = {
  readonly id: string;
  readonly nodeTypes: readonly string[];
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly areaCount: number;
  readonly meanSiblingGap: number;
  readonly meanAspectRatio: number;
};

export type ArchitectureBoardKnowledgeArtifact = {
  readonly version: typeof ARCHITECTURE_BOARD_KNOWLEDGE_VERSION;
  readonly hash: string;
  readonly cases: readonly ArchitectureBoardKnowledgeCase[];
  readonly unavailableTemplateIds: readonly string[];
};

export type ArchitectureBoardLeaveOneOutResult = {
  readonly heldOutCaseId: string;
  readonly nearestCaseId: string;
  readonly resourceTypeRecall: number;
  readonly aspectRatioError: number;
  readonly siblingGapError: number;
};

export function createArchitectureBoardKnowledgeArtifact(): ArchitectureBoardKnowledgeArtifact {
  const repositoryCases = templateDefinitions.map((definition) =>
    extractKnowledgeCase(
      `repository:${definition.id}`,
      buildTemplateDiagramJson(definition.id, {
        projectSlug: "compiler-knowledge",
        shortId: definition.id
      })
    )
  );
  const brainboardCases = brainboardTemplateRegistry.flatMap((entry) =>
    entry.status === "available"
      ? [extractKnowledgeCase(`brainboard:${entry.id}`, adaptBrainboardTemplateSource(entry.source).diagramJson)]
      : []
  );
  const unavailableTemplateIds = brainboardTemplateRegistry.flatMap((entry) =>
    entry.status === "unavailable" ? [entry.id] : []
  );
  const cases = [...repositoryCases, ...brainboardCases].sort((left, right) =>
    left.id.localeCompare(right.id)
  );
  const content = stableSerialize({
    cases,
    unavailableTemplateIds,
    version: ARCHITECTURE_BOARD_KNOWLEDGE_VERSION
  });

  return {
    version: ARCHITECTURE_BOARD_KNOWLEDGE_VERSION,
    hash: fnv1a(content),
    cases,
    unavailableTemplateIds
  };
}

export const architectureBoardKnowledge = createArchitectureBoardKnowledgeArtifact();

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

function extractKnowledgeCase(id: string, diagram: DiagramJson): ArchitectureBoardKnowledgeCase {
  const nodes = [...diagram.nodes].sort((left, right) => left.id.localeCompare(right.id));
  const sortedX = nodes.map((node) => node.position.x).sort((left, right) => left - right);
  const siblingGaps = sortedX.slice(1).map((value, index) => Math.max(0, value - sortedX[index]!));

  return {
    id,
    nodeTypes: [...new Set(nodes.map((node) => node.type))].sort(),
    nodeCount: nodes.length,
    edgeCount: diagram.edges.length,
    areaCount: nodes.filter((node) => node.metadata?.presentationArea === true).length,
    meanSiblingGap: round(mean(siblingGaps)),
    meanAspectRatio: round(mean(nodes.map((node) => node.size.width / Math.max(1, node.size.height))))
  };
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
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
