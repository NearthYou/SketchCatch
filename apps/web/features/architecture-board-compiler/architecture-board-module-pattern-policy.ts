import type { DiagramEdge, DiagramJson, DiagramNode, DiagramPoint } from "@sketchcatch/types";
import { isAreaNode } from "../diagram-editor/area-nodes";
import type {
  ArchitectureBoardKnowledgeArtifact,
  ArchitectureBoardModulePattern
} from "./architecture-board-knowledge-contract";

export type ArchitectureBoardModulePatternMatch = {
  readonly patternId: string;
  readonly projection: "full" | "resource";
  readonly nodeIdByPatternNodeId: Readonly<Record<string, string>>;
  readonly edgeIdByPatternEdgeId: Readonly<Record<string, string>>;
  readonly representativeTemplateId: string;
  readonly referenceTemplateIds: readonly string[];
};

export type ArchitectureBoardModulePatternKnowledgeResult = {
  readonly candidateId: string;
  readonly diagram: DiagramJson;
  readonly matches: readonly ArchitectureBoardModulePatternMatch[];
  readonly matchedPatternIds: readonly string[];
  readonly representativeTemplateIds: readonly string[];
  readonly referenceTemplateIds: readonly string[];
};

export type ArchitectureBoardModulePatternKnowledgeOptions = {
  readonly projection?: "strict" | "compiler-roundtrip";
  readonly semanticEdgeLabelsById?: Readonly<Record<string, string | undefined>>;
  readonly moduleExpansionByNodeId?: Readonly<
    Record<string, { readonly moduleId: string; readonly expansionId: string }>
  >;
  readonly resourceParentByNodeId?: Readonly<Record<string, string | null>>;
};

type MutableMatch = {
  readonly pattern: ArchitectureBoardModulePattern;
  readonly projection: "full" | "resource";
  readonly nodes: ArchitectureBoardModulePattern["nodes"];
  readonly edges: ArchitectureBoardModulePattern["edges"];
  readonly nodeIdByPatternNodeId: ReadonlyMap<string, string>;
  readonly edgeIdByPatternEdgeId: ReadonlyMap<string, string>;
};

type PatternProjection = Pick<MutableMatch, "pattern" | "projection" | "nodes" | "edges">;

type PreparedPatternProjection = PatternProjection & {
  readonly relations: RelationIndex;
};

type StructuralNode = {
  readonly id: string;
  readonly kind: DiagramNode["kind"];
  readonly type: string;
  readonly metadata?: { readonly parentAreaNodeId?: string | undefined } | undefined;
  readonly parameters?: { readonly resourceType: string } | undefined;
};

type StructuralEdge = {
  readonly id: string;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly label?: string | undefined;
  readonly type?: string | undefined;
  readonly metadata?:
    | {
        readonly managedBy?: "parameter-reference" | undefined;
        readonly parameterPath?: string | undefined;
        readonly presentationRole?: "primary" | "detail" | "summary" | undefined;
      }
    | undefined;
};

type ReadonlyPoint = { readonly x: number; readonly y: number };

type ReadonlyRoute = {
  readonly svgPath: string;
  readonly sourcePoint: ReadonlyPoint;
  readonly targetPoint: ReadonlyPoint;
  readonly waypoints: readonly ReadonlyPoint[];
  readonly labelPosition?: ReadonlyPoint | undefined;
  readonly arrowDirection?: NonNullable<DiagramEdge["route"]>["arrowDirection"];
  readonly arrowAngle?: number | undefined;
};

/**
 * Applies complete, non-overlapping Template pattern matches as a geometry-only candidate.
 * Resource identity, containment metadata, parameters and semantic edge endpoints are never
 * rewritten here: the compiler already owns those decisions before this policy runs.
 */
export function applyArchitectureBoardModulePatternKnowledge(
  diagram: DiagramJson,
  artifact: ArchitectureBoardKnowledgeArtifact,
  options: ArchitectureBoardModulePatternKnowledgeOptions = {}
): ArchitectureBoardModulePatternKnowledgeResult | null {
  const mode = options.projection ?? "strict";
  const matchingDiagram = createMatchingDiagram(
    diagram,
    mode,
    options.semanticEdgeLabelsById,
    options.resourceParentByNodeId
  );
  const matches = findNonOverlappingPatternMatches(
    matchingDiagram,
    artifact.modulePatterns,
    mode,
    options.moduleExpansionByNodeId
  );
  if (matches.length === 0) return null;

  const nextDiagram = applyPatternGeometry(diagram, matches);
  const publicMatches = matches.map(toPublicMatch).sort(comparePublicMatches);
  const matchedPatternIds = uniqueSorted(publicMatches.map(({ patternId }) => patternId));
  const representativeTemplateIds = uniqueSorted(
    publicMatches.map(({ representativeTemplateId }) => representativeTemplateId)
  );
  const referenceTemplateIds = uniqueSorted(
    publicMatches.flatMap(({ referenceTemplateIds }) => referenceTemplateIds)
  );

  return {
    candidateId: `module-pattern:${matchedPatternIds.join("+")}`,
    diagram: nextDiagram,
    matches: publicMatches,
    matchedPatternIds,
    representativeTemplateIds,
    referenceTemplateIds
  };
}

function findNonOverlappingPatternMatches(
  diagram: DiagramJson,
  patterns: readonly ArchitectureBoardModulePattern[],
  mode: "strict" | "compiler-roundtrip",
  moduleExpansionByNodeId:
    | Readonly<Record<string, { readonly moduleId: string; readonly expansionId: string }>>
    | undefined
): MutableMatch[] {
  const usedNodeIds = new Set<string>();
  const matches: MutableMatch[] = [];
  const fullProjections: PatternProjection[] =
    mode === "strict"
      ? patterns
          .map((pattern) => ({
            pattern,
            projection: "full" as const,
            nodes: pattern.nodes,
            edges: pattern.edges
          }))
          .filter(hasInternalPatternRelation)
      : [];
  const resourceProjections = patterns.flatMap((pattern): PatternProjection[] => {
    const nodes = projectResourceNodes(
      pattern.nodes.map((node) => structuredClone(node) as DiagramNode)
    );
    if ((mode === "strict" && nodes.length === pattern.nodes.length) || nodes.length < 2) return [];
    const nodeIds = new Set(nodes.map(({ id }) => id));
    const edges = pattern.edges.filter(
      (edge) =>
        nodeIds.has(edge.sourceNodeId) &&
        nodeIds.has(edge.targetNodeId) &&
        (mode === "strict" || !isContainmentEdgeLabel(edge.label))
    );
    const projection = { pattern, projection: "resource" as const, nodes, edges };
    return hasInternalPatternRelation(projection) ? [projection] : [];
  });
  const orderedProjections: PreparedPatternProjection[] = [
    ...fullProjections.sort(compareProjections),
    ...resourceProjections.sort(compareProjections)
  ].map((projection) => ({
    ...projection,
    relations: createRelationIndex(projection.nodes, projection.edges, mode, true)
  }));
  const context = createMatchingContext(diagram, mode, moduleExpansionByNodeId);

  for (const patternProjection of orderedProjections) {
    while (true) {
      const nodeMapping = findNextNodeMapping(patternProjection, usedNodeIds, context);
      if (!nodeMapping) break;
      const edgeMapping = mapPatternEdges(patternProjection, nodeMapping, context);
      if (!edgeMapping) break;
      matches.push({
        ...patternProjection,
        nodeIdByPatternNodeId: nodeMapping,
        edgeIdByPatternEdgeId: edgeMapping
      });
      for (const nodeId of nodeMapping.values()) usedNodeIds.add(nodeId);
    }
  }

  return matches;
}

function hasInternalPatternRelation(projection: PatternProjection): boolean {
  if (projection.edges.length > 0) return true;
  const nodeIds = new Set(projection.nodes.map(({ id }) => id));
  return projection.nodes.some((node) => {
    const parentId = node.metadata?.parentAreaNodeId;
    return parentId !== undefined && nodeIds.has(parentId);
  });
}

function compareProjections(left: PatternProjection, right: PatternProjection): number {
  return (
    right.nodes.length - left.nodes.length ||
    right.edges.length - left.edges.length ||
    left.pattern.id.localeCompare(right.pattern.id)
  );
}

function findNextNodeMapping(
  patternProjection: PreparedPatternProjection,
  excludedNodeIds: ReadonlySet<string>,
  context: MatchingContext
): ReadonlyMap<string, string> | null {
  if (
    patternProjection.nodes.length === 0 ||
    patternProjection.nodes.length > context.diagram.nodes.length
  )
    return null;

  const patternRelations = patternProjection.relations;
  const diagramRelations = context.relations;
  const candidatesByPatternNodeId = new Map(
    patternProjection.nodes.map((patternNode) => [
      patternNode.id,
      (context.nodesBySignature.get(nodeSignature(patternNode)) ?? [])
        .filter((node) => !excludedNodeIds.has(node.id))
        .filter((node) => {
          const moduleExpansion = context.moduleExpansionByNodeId.get(node.id);
          return !moduleExpansion || moduleExpansion.moduleId === patternProjection.pattern.id;
        })
        .filter((node) =>
          hasEnoughRelations(patternNode.id, node.id, patternRelations, diagramRelations)
        )
    ])
  );
  if ([...candidatesByPatternNodeId.values()].some((candidates) => candidates.length === 0)) {
    return null;
  }

  const patternNodeOrder = [...patternProjection.nodes]
    .sort((left, right) => {
      const leftCandidateCount = candidatesByPatternNodeId.get(left.id)?.length ?? 0;
      const rightCandidateCount = candidatesByPatternNodeId.get(right.id)?.length ?? 0;
      return (
        leftCandidateCount - rightCandidateCount ||
        relationCount(right.id, patternRelations) - relationCount(left.id, patternRelations) ||
        left.id.localeCompare(right.id)
      );
    })
    .map(({ id }) => id);
  const mapping = new Map<string, string>();
  const usedDiagramNodeIds = new Set<string>();

  const matchNext = (index: number): boolean => {
    if (index === patternNodeOrder.length) return true;
    const patternNodeId = patternNodeOrder[index]!;
    for (const candidate of candidatesByPatternNodeId.get(patternNodeId) ?? []) {
      if (usedDiagramNodeIds.has(candidate.id)) continue;
      if (!moduleExpansionsAgreeWithMapping(candidate.id, mapping, context)) continue;
      if (
        !relationsAgreeWithMapping(
          patternNodeId,
          candidate.id,
          mapping,
          patternRelations,
          diagramRelations
        )
      ) {
        continue;
      }
      mapping.set(patternNodeId, candidate.id);
      usedDiagramNodeIds.add(candidate.id);
      if (matchNext(index + 1)) return true;
      mapping.delete(patternNodeId);
      usedDiagramNodeIds.delete(candidate.id);
    }
    return false;
  };

  return matchNext(0) ? new Map(mapping) : null;
}

function moduleExpansionsAgreeWithMapping(
  candidateNodeId: string,
  mapping: ReadonlyMap<string, string>,
  context: MatchingContext
): boolean {
  const candidateExpansion = context.moduleExpansionByNodeId.get(candidateNodeId);
  for (const mappedNodeId of mapping.values()) {
    const mappedExpansion = context.moduleExpansionByNodeId.get(mappedNodeId);
    if (!candidateExpansion || !mappedExpansion) {
      if (candidateExpansion !== mappedExpansion) return false;
      continue;
    }
    if (
      candidateExpansion.moduleId !== mappedExpansion.moduleId ||
      candidateExpansion.expansionId !== mappedExpansion.expansionId
    ) {
      return false;
    }
  }
  return true;
}

type RelationIndex = {
  readonly bySource: ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>;
  readonly incomingByNodeId: ReadonlyMap<string, readonly string[]>;
  readonly outgoingByNodeId: ReadonlyMap<string, readonly string[]>;
  readonly countByNodeId: ReadonlyMap<string, number>;
};

type MatchingContext = {
  readonly diagram: DiagramJson;
  readonly relations: RelationIndex;
  readonly nodesBySignature: ReadonlyMap<string, readonly DiagramNode[]>;
  readonly edgeIdsByMatchKey: ReadonlyMap<string, readonly string[]>;
  readonly moduleExpansionByNodeId: ReadonlyMap<
    string,
    { readonly moduleId: string; readonly expansionId: string }
  >;
  readonly mode: "strict" | "compiler-roundtrip";
};

function createRelationIndex(
  nodes: readonly StructuralNode[],
  edges: readonly StructuralEdge[],
  mode: "strict" | "compiler-roundtrip",
  includeContainment: boolean
): RelationIndex {
  const nodeIds = new Set(nodes.map(({ id }) => id));
  const mutable = new Map<string, Map<string, string[]>>();
  const add = (sourceId: string, targetId: string, signature: string): void => {
    if (!nodeIds.has(sourceId) || !nodeIds.has(targetId)) return;
    const targets = mutable.get(sourceId) ?? new Map<string, string[]>();
    const signatures = targets.get(targetId) ?? [];
    signatures.push(signature);
    targets.set(targetId, signatures);
    mutable.set(sourceId, targets);
  };

  for (const edge of edges) {
    add(
      edge.sourceNodeId,
      edge.targetNodeId,
      `edge:${edgeSemanticSignature(edge, mode)}`
    );
  }
  if (includeContainment) {
    for (const node of nodes) {
      const parentId = node.metadata?.parentAreaNodeId;
      if (parentId) add(node.id, parentId, "containment:parent");
    }
  }

  const bySource = new Map(
    [...mutable].map(
      ([sourceId, targets]) =>
        [
          sourceId,
          new Map(
            [...targets].map(
              ([targetId, signatures]) => [targetId, [...signatures].sort()] as const
            )
          )
        ] as const
    )
  );
  const incomingByNodeId = new Map<string, string[]>();
  const outgoingByNodeId = new Map<string, string[]>();
  const countByNodeId = new Map<string, number>();
  for (const [sourceId, targets] of bySource) {
    for (const [targetId, signatures] of targets) {
      outgoingByNodeId.set(sourceId, [...(outgoingByNodeId.get(sourceId) ?? []), ...signatures]);
      incomingByNodeId.set(targetId, [...(incomingByNodeId.get(targetId) ?? []), ...signatures]);
      countByNodeId.set(sourceId, (countByNodeId.get(sourceId) ?? 0) + signatures.length);
      if (targetId !== sourceId) {
        countByNodeId.set(targetId, (countByNodeId.get(targetId) ?? 0) + signatures.length);
      }
    }
  }
  return {
    bySource,
    incomingByNodeId: sortMapValues(incomingByNodeId),
    outgoingByNodeId: sortMapValues(outgoingByNodeId),
    countByNodeId
  };
}

function hasEnoughRelations(
  patternNodeId: string,
  diagramNodeId: string,
  patternRelations: RelationIndex,
  diagramRelations: RelationIndex
): boolean {
  const patternIncoming = relationSignaturesTouching(patternNodeId, patternRelations, "incoming");
  const patternOutgoing = relationSignaturesTouching(patternNodeId, patternRelations, "outgoing");
  const diagramIncoming = relationSignaturesTouching(diagramNodeId, diagramRelations, "incoming");
  const diagramOutgoing = relationSignaturesTouching(diagramNodeId, diagramRelations, "outgoing");
  return (
    multisetContains(diagramIncoming, patternIncoming) &&
    multisetContains(diagramOutgoing, patternOutgoing)
  );
}

function relationSignaturesTouching(
  nodeId: string,
  relations: RelationIndex,
  direction: "incoming" | "outgoing"
): string[] {
  return [
    ...((direction === "outgoing"
      ? relations.outgoingByNodeId.get(nodeId)
      : relations.incomingByNodeId.get(nodeId)) ?? [])
  ];
}

function multisetContains(superset: readonly string[], subset: readonly string[]): boolean {
  const counts = new Map<string, number>();
  for (const entry of superset) counts.set(entry, (counts.get(entry) ?? 0) + 1);
  for (const entry of subset) {
    const remaining = counts.get(entry) ?? 0;
    if (remaining === 0) return false;
    counts.set(entry, remaining - 1);
  }
  return true;
}

function relationsAgreeWithMapping(
  patternNodeId: string,
  diagramNodeId: string,
  mapping: ReadonlyMap<string, string>,
  patternRelations: RelationIndex,
  diagramRelations: RelationIndex
): boolean {
  if (
    !sameRelations(
      patternRelations,
      patternNodeId,
      patternNodeId,
      diagramRelations,
      diagramNodeId,
      diagramNodeId
    )
  ) {
    return false;
  }
  for (const [mappedPatternNodeId, mappedDiagramNodeId] of mapping) {
    if (
      !sameRelations(
        patternRelations,
        patternNodeId,
        mappedPatternNodeId,
        diagramRelations,
        diagramNodeId,
        mappedDiagramNodeId
      ) ||
      !sameRelations(
        patternRelations,
        mappedPatternNodeId,
        patternNodeId,
        diagramRelations,
        mappedDiagramNodeId,
        diagramNodeId
      )
    ) {
      return false;
    }
  }
  return true;
}

function sameRelations(
  left: RelationIndex,
  leftSourceId: string,
  leftTargetId: string,
  right: RelationIndex,
  rightSourceId: string,
  rightTargetId: string
): boolean {
  return (
    stableSerialize(left.bySource.get(leftSourceId)?.get(leftTargetId) ?? []) ===
    stableSerialize(right.bySource.get(rightSourceId)?.get(rightTargetId) ?? [])
  );
}

function relationCount(nodeId: string, relations: RelationIndex): number {
  return relations.countByNodeId.get(nodeId) ?? 0;
}

function mapPatternEdges(
  patternProjection: PatternProjection,
  nodeMapping: ReadonlyMap<string, string>,
  context: MatchingContext
): ReadonlyMap<string, string> | null {
  const usedDiagramEdgeIds = new Set<string>();
  const mapping = new Map<string, string>();
  for (const patternEdge of [...patternProjection.edges].sort((left, right) =>
    left.id.localeCompare(right.id)
  )) {
    const sourceId = nodeMapping.get(patternEdge.sourceNodeId);
    const targetId = nodeMapping.get(patternEdge.targetNodeId);
    const edgeId = context.edgeIdsByMatchKey
      .get(edgeMatchKey(sourceId, targetId, patternEdge, context.mode))
      ?.find((id) => !usedDiagramEdgeIds.has(id));
    if (!edgeId) return null;
    mapping.set(patternEdge.id, edgeId);
    usedDiagramEdgeIds.add(edgeId);
  }
  return mapping;
}

function applyPatternGeometry(diagram: DiagramJson, matches: readonly MutableMatch[]): DiagramJson {
  const nodeGeometryById = new Map<string, DiagramNode>();
  const edgeGeometryById = new Map<string, DiagramEdge>();
  const nodeById = new Map(diagram.nodes.map((node) => [node.id, node]));

  for (const match of matches) {
    const matchedNodes = [...match.nodeIdByPatternNodeId.values()]
      .map((nodeId) => nodeById.get(nodeId))
      .filter((node): node is DiagramNode => node !== undefined);
    const anchorX = Math.min(...matchedNodes.map(({ position }) => position.x));
    const anchorY = Math.min(...matchedNodes.map(({ position }) => position.y));
    const patternOriginX = Math.min(...match.nodes.map(({ position }) => position.x));
    const patternOriginY = Math.min(...match.nodes.map(({ position }) => position.y));
    const offsetX = anchorX - patternOriginX;
    const offsetY = anchorY - patternOriginY;

    for (const patternNode of match.nodes) {
      const nodeId = match.nodeIdByPatternNodeId.get(patternNode.id);
      const currentNode = nodeId ? nodeById.get(nodeId) : undefined;
      if (!nodeId || !currentNode) continue;
      nodeGeometryById.set(nodeId, {
        ...structuredClone(currentNode),
        position: translatePoint(patternNode.position, offsetX, offsetY),
        // Pattern examples own container geometry, while ordinary Resource tiles keep the
        // current Palette contract instead of regressing to an old captured icon size.
        size: structuredClone(isAreaNode(currentNode) ? patternNode.size : currentNode.size),
        zIndex: patternNode.zIndex,
        ...(patternNode.rotation === undefined ? {} : { rotation: patternNode.rotation })
      });
    }

    const patternEdgeById = new Map(match.edges.map((edge) => [edge.id, edge]));
    const diagramEdgeById = new Map(diagram.edges.map((edge) => [edge.id, edge]));
    for (const [patternEdgeId, edgeId] of match.edgeIdByPatternEdgeId) {
      const patternEdge = patternEdgeById.get(patternEdgeId);
      const currentEdge = diagramEdgeById.get(edgeId);
      if (!patternEdge || !currentEdge) continue;
      edgeGeometryById.set(edgeId, {
        ...structuredClone(currentEdge),
        ...(patternEdge.sourceHandleId === undefined
          ? {}
          : { sourceHandleId: patternEdge.sourceHandleId }),
        ...(patternEdge.targetHandleId === undefined
          ? {}
          : { targetHandleId: patternEdge.targetHandleId }),
        ...(patternEdge.route === undefined
          ? {}
          : {
              route: translateRoute(patternEdge.route, offsetX, offsetY, currentEdge.route)
            }),
        ...(patternEdge.zIndex === undefined ? {} : { zIndex: patternEdge.zIndex })
      });
    }
  }

  return {
    ...structuredClone(diagram),
    nodes: diagram.nodes.map((node) => structuredClone(nodeGeometryById.get(node.id) ?? node)),
    edges: diagram.edges.map((edge) => structuredClone(edgeGeometryById.get(edge.id) ?? edge))
  };
}

function translateRoute(
  route: ReadonlyRoute,
  offsetX: number,
  offsetY: number,
  currentRoute: DiagramEdge["route"]
): NonNullable<DiagramEdge["route"]> {
  const {
    arrowDirection: _patternArrowDirection,
    arrowAngle: _patternArrowAngle,
    ...geometry
  } = structuredClone(route);
  return {
    ...geometry,
    svgPath: translateSvgPath(route.svgPath, offsetX, offsetY),
    sourcePoint: translatePoint(route.sourcePoint, offsetX, offsetY),
    targetPoint: translatePoint(route.targetPoint, offsetX, offsetY),
    waypoints: route.waypoints.map((point) => translatePoint(point, offsetX, offsetY)),
    ...(route.labelPosition === undefined
      ? {}
      : { labelPosition: translatePoint(route.labelPosition, offsetX, offsetY) }),
    ...(currentRoute?.arrowDirection === undefined
      ? {}
      : { arrowDirection: currentRoute.arrowDirection }),
    ...(currentRoute?.arrowAngle === undefined ? {} : { arrowAngle: currentRoute.arrowAngle })
  };
}

function translatePoint(point: ReadonlyPoint, offsetX: number, offsetY: number): DiagramPoint {
  return { x: normalizeNumber(point.x + offsetX), y: normalizeNumber(point.y + offsetY) };
}

function translateSvgPath(svgPath: string, offsetX: number, offsetY: number): string {
  const commands = svgPath.match(/[A-Za-z]/g) ?? [];
  if (commands.some((command) => command !== "M" && command !== "L" && command !== "Q")) {
    return svgPath;
  }
  let coordinateIndex = 0;
  return svgPath.replace(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi, (raw) => {
    const offset = coordinateIndex % 2 === 0 ? offsetX : offsetY;
    coordinateIndex += 1;
    return String(normalizeNumber(Number(raw) + offset));
  });
}

function toPublicMatch(match: MutableMatch): ArchitectureBoardModulePatternMatch {
  return {
    patternId: match.pattern.id,
    projection: match.projection,
    nodeIdByPatternNodeId: Object.fromEntries([...match.nodeIdByPatternNodeId].sort(byEntryKey)),
    edgeIdByPatternEdgeId: Object.fromEntries([...match.edgeIdByPatternEdgeId].sort(byEntryKey)),
    representativeTemplateId: match.pattern.provenance.representativeTemplateId,
    referenceTemplateIds: uniqueSorted(match.pattern.provenance.sourceTemplateIds)
  };
}

function comparePublicMatches(
  left: ArchitectureBoardModulePatternMatch,
  right: ArchitectureBoardModulePatternMatch
): number {
  return (
    left.patternId.localeCompare(right.patternId) ||
    Object.values(left.nodeIdByPatternNodeId)
      .join("|")
      .localeCompare(Object.values(right.nodeIdByPatternNodeId).join("|"))
  );
}

function byEntryKey(left: readonly [string, string], right: readonly [string, string]): number {
  return left[0].localeCompare(right[0]);
}

function nodeSignature(node: StructuralNode): string {
  return `${node.kind}:${node.parameters?.resourceType ?? node.type}`;
}

function edgeSemanticSignature(
  edge: StructuralEdge,
  mode: "strict" | "compiler-roundtrip"
): string {
  if (mode === "compiler-roundtrip") {
    return stableSerialize({ label: edge.label?.trim().toLowerCase() ?? null });
  }
  return stableSerialize({
    label: edge.label?.trim().toLowerCase() ?? null,
    managedBy: edge.metadata?.managedBy ?? null,
    parameterPath: edge.metadata?.parameterPath ?? null,
    presentationRole: edge.metadata?.presentationRole ?? null,
    type: edge.type ?? null
  });
}

function createMatchingDiagram(
  diagram: DiagramJson,
  mode: "strict" | "compiler-roundtrip",
  semanticEdgeLabelsById: Readonly<Record<string, string | undefined>> | undefined,
  resourceParentByNodeId: Readonly<Record<string, string | null>> | undefined
): DiagramJson {
  if (mode === "strict") return diagram;
  const resourceNodes = projectResourceNodes(diagram.nodes).map((node) => {
    if (!resourceParentByNodeId || !(node.id in resourceParentByNodeId)) return node;
    const parentId = resourceParentByNodeId[node.id];
    const metadata = { ...(node.metadata ?? {}) };
    if (parentId) metadata.parentAreaNodeId = parentId;
    else delete metadata.parentAreaNodeId;
    return {
      ...node,
      ...(Object.keys(metadata).length > 0 ? { metadata } : { metadata: undefined })
    };
  });
  const resourceNodeIds = new Set(resourceNodes.map(({ id }) => id));
  return {
    ...diagram,
    nodes: resourceNodes,
    edges: diagram.edges
      .map((edge) => ({
        ...edge,
        ...(semanticEdgeLabelsById && edge.id in semanticEdgeLabelsById
          ? { label: semanticEdgeLabelsById[edge.id] }
          : {})
      }))
      .filter(
        (edge) =>
          resourceNodeIds.has(edge.sourceNodeId) &&
          resourceNodeIds.has(edge.targetNodeId) &&
          !isContainmentEdgeLabel(edge.label)
      )
  };
}

export function createArchitectureBoardModulePatternResourceParentMap(
  nodes: readonly DiagramNode[]
): Readonly<Record<string, string | null>> {
  return Object.fromEntries(
    projectResourceNodes(nodes).map((node) => [node.id, node.metadata?.parentAreaNodeId ?? null])
  );
}

function projectResourceNodes(nodes: readonly DiagramNode[]): DiagramNode[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const resourceNodeIds = new Set(
    nodes.filter(({ kind }) => kind === "resource").map(({ id }) => id)
  );

  return nodes
    .filter(({ id }) => resourceNodeIds.has(id))
    .map((node) => {
      let parentId = node.metadata?.parentAreaNodeId;
      const visited = new Set<string>();
      while (parentId && !resourceNodeIds.has(parentId) && !visited.has(parentId)) {
        visited.add(parentId);
        parentId = nodeById.get(parentId)?.metadata?.parentAreaNodeId;
      }
      const metadata = { ...(node.metadata ?? {}) };
      if (parentId && resourceNodeIds.has(parentId)) metadata.parentAreaNodeId = parentId;
      else delete metadata.parentAreaNodeId;
      return {
        ...node,
        ...(Object.keys(metadata).length > 0 ? { metadata } : { metadata: undefined })
      };
    });
}

function createMatchingContext(
  diagram: DiagramJson,
  mode: "strict" | "compiler-roundtrip",
  moduleExpansionByNodeId:
    | Readonly<Record<string, { readonly moduleId: string; readonly expansionId: string }>>
    | undefined
): MatchingContext {
  const nodesBySignature = new Map<string, DiagramNode[]>();
  for (const node of [...diagram.nodes].sort((left, right) => left.id.localeCompare(right.id))) {
    if (node.locked) continue;
    const signature = nodeSignature(node);
    nodesBySignature.set(signature, [...(nodesBySignature.get(signature) ?? []), node]);
  }
  const edgeIdsByMatchKey = new Map<string, string[]>();
  for (const edge of [...diagram.edges].sort((left, right) => left.id.localeCompare(right.id))) {
    const key = edgeMatchKey(edge.sourceNodeId, edge.targetNodeId, edge, mode);
    edgeIdsByMatchKey.set(key, [...(edgeIdsByMatchKey.get(key) ?? []), edge.id]);
  }
  return {
    diagram,
    relations: createRelationIndex(diagram.nodes, diagram.edges, mode, true),
    nodesBySignature,
    edgeIdsByMatchKey,
    moduleExpansionByNodeId: new Map(Object.entries(moduleExpansionByNodeId ?? {})),
    mode
  };
}

function edgeMatchKey(
  sourceNodeId: string | undefined,
  targetNodeId: string | undefined,
  edge: StructuralEdge,
  mode: "strict" | "compiler-roundtrip"
): string {
  return `${sourceNodeId ?? ""}\u0000${targetNodeId ?? ""}\u0000${edgeSemanticSignature(edge, mode)}`;
}

function isContainmentEdgeLabel(label: string | undefined): boolean {
  const normalized = label?.trim().toLowerCase();
  return normalized === "contains" || normalized === "hosts";
}

function sortMapValues(
  values: ReadonlyMap<string, readonly string[]>
): ReadonlyMap<string, readonly string[]> {
  return new Map([...values].map(([key, entries]) => [key, [...entries].sort()] as const));
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function normalizeNumber(value: number): number {
  const normalized = Math.round(value * 1_000) / 1_000;
  return Object.is(normalized, -0) ? 0 : normalized;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
