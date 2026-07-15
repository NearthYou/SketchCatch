export const ARCHITECTURE_BOARD_KNOWLEDGE_VERSION = "architecture-board-knowledge/v1";

export type ArchitectureBoardKnowledgeCase = {
  readonly id: string;
  readonly nodeTypes: readonly string[];
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly areaCount: number;
  readonly parentedNodeCount: number;
  readonly maxContainmentDepth: number;
  readonly meanAreaChildDensity: number;
  readonly meanAreaPadding: number;
  readonly meanSiblingGap: number;
  readonly meanVerticalGap: number;
  readonly meanNodeWidth: number;
  readonly meanNodeHeight: number;
  readonly meanAspectRatio: number;
  readonly meanCaptionWidth: number;
  readonly meanZIndex: number;
  readonly meanEdgeLength: number;
  readonly meanEdgeWaypointCount: number;
  readonly routedEdgeRatio: number;
  readonly horizontalFlowRatio: number;
  readonly supportNodeRatio: number;
  readonly viewportAspectRatio: number;
  readonly whitespaceRatio: number;
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
  readonly viewportAspectRatioError: number;
  readonly containmentDepthError: number;
  readonly edgeLengthError: number;
};
