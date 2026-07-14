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
