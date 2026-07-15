import type { DiagramEdge, DiagramNode, DiagramVariable } from "@sketchcatch/types";

export const ARCHITECTURE_BOARD_KNOWLEDGE_VERSION = "architecture-board-knowledge/v1";
export const ARCHITECTURE_BOARD_MODULE_PATTERN_EXTRACTOR_VERSION =
  "architecture-board-module-pattern-extractor/v2";

type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Entry)[]
    ? readonly DeepReadonly<Entry>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

export type ArchitectureBoardModulePatternLens = {
  readonly kind: "functional" | "purpose";
  readonly key: string;
  readonly label: string;
};

export type ArchitectureBoardModulePattern = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly lenses: readonly ArchitectureBoardModulePatternLens[];
  readonly structuralFingerprint: string;
  readonly nodes: readonly DeepReadonly<DiagramNode>[];
  readonly edges: readonly DeepReadonly<DiagramEdge>[];
  readonly variables: readonly DeepReadonly<DiagramVariable>[];
  readonly provenance: {
    readonly extractorVersion: typeof ARCHITECTURE_BOARD_MODULE_PATTERN_EXTRACTOR_VERSION;
    readonly representativeTemplateId: string;
    readonly sourceTemplateIds: readonly string[];
  };
};

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
  readonly modulePatterns: readonly ArchitectureBoardModulePattern[];
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
