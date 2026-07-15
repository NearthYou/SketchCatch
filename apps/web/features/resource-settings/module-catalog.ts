import type {
  DiagramEdge,
  DiagramJson,
  DiagramNode,
  DiagramPoint,
  DiagramVariable
} from "../../../../packages/types/src";
import {
  ARCHITECTURE_BOARD_KNOWLEDGE_VERSION,
  architectureBoardKnowledge,
  type ArchitectureBoardModulePattern
} from "../architecture-board-compiler/architecture-board-knowledge";

export type CuratedModuleDefinition = ArchitectureBoardModulePattern & {
  readonly version: typeof ARCHITECTURE_BOARD_KNOWLEDGE_VERSION;
};

/**
 * Runtime catalog backed only by the checked-in knowledge artifact. Template fixtures are read by
 * the generator, never by this browser materializer.
 */
export const curatedModules: readonly CuratedModuleDefinition[] =
  architectureBoardKnowledge.modulePatterns.map((pattern) => ({
    ...pattern,
    version: ARCHITECTURE_BOARD_KNOWLEDGE_VERSION
  }));

export function expandCuratedModuleIntoDiagram(input: {
  readonly diagram: DiagramJson;
  readonly moduleId: string;
}): DiagramJson {
  const pattern = architectureBoardKnowledge.modulePatterns.find(
    ({ id }) => id === input.moduleId
  );

  if (!pattern) return input.diagram;

  return materializeCuratedModulePattern({
    diagram: input.diagram,
    pattern
  });
}

/** Pure fragment materializer. Exported so remapping behavior can be verified with small fixtures. */
export function materializeCuratedModulePattern(input: {
  readonly diagram: DiagramJson;
  readonly pattern: ArchitectureBoardModulePattern;
  readonly expandedAt?: string | undefined;
}): DiagramJson {
  if (input.pattern.nodes.length === 0) return input.diagram;

  const expandedAt = input.expandedAt ?? createUniqueExpandedAt(input.diagram);
  const nodeIds = createIdMap(
    input.pattern.nodes.map(({ id }) => id),
    new Set(input.diagram.nodes.map(({ id }) => id)),
    input.pattern.id,
    "node"
  );
  const edgeIds = createIdMap(
    input.pattern.edges.map(({ id }) => id),
    new Set(input.diagram.edges.map(({ id }) => id)),
    input.pattern.id,
    "edge"
  );
  const variableIds = createIdMap(
    input.pattern.variables.map(({ id }) => id),
    new Set((input.diagram.variables ?? []).map(({ id }) => id)),
    input.pattern.id,
    "variable"
  );
  const resourceNames = createResourceNameMap(input.diagram.nodes, input.pattern.nodes);
  const variableNames = createVariableNameMap(
    input.diagram.variables ?? [],
    input.pattern.variables
  );
  const rewrite = (value: unknown) => rewriteReferences(value, resourceNames, variableNames);
  const placement = getFragmentPlacement(input.diagram.nodes, input.pattern.nodes);
  const zIndexDelta = getZIndexDelta(
    input.diagram.nodes,
    input.diagram.edges,
    input.pattern.nodes,
    input.pattern.edges
  );

  const nextNodes = input.pattern.nodes.map((sourceNode) => {
    const clonedNode = structuredClone(sourceNode) as DiagramNode;
    const parameters = sourceNode.parameters;
    const parentAreaNodeId = sourceNode.metadata?.parentAreaNodeId;
    const areaBaseline = sourceNode.metadata?.areaAutoSizeBaseline;

    return {
      ...clonedNode,
      id: requireMappedValue(nodeIds, sourceNode.id),
      position: translatePoint(sourceNode.position, placement),
      zIndex: sourceNode.zIndex + zIndexDelta,
      ...(sourceNode.metadata
        ? {
            metadata: {
              ...clonedNode.metadata,
              ...(parentAreaNodeId
                ? { parentAreaNodeId: requireMappedValue(nodeIds, parentAreaNodeId) }
                : {}),
              ...(areaBaseline
                ? {
                    areaAutoSizeBaseline: {
                      ...structuredClone(areaBaseline),
                      position: translatePoint(areaBaseline.position, placement)
                    }
                  }
                : {}),
              moduleSource: {
                expandedAt,
                moduleId: input.pattern.id,
                moduleVersion: ARCHITECTURE_BOARD_KNOWLEDGE_VERSION,
                representativeTemplateId: input.pattern.provenance.representativeTemplateId,
                referenceTemplateIds: [...input.pattern.provenance.sourceTemplateIds]
              }
            }
          }
        : {
            metadata: {
              moduleSource: {
                expandedAt,
                moduleId: input.pattern.id,
                moduleVersion: ARCHITECTURE_BOARD_KNOWLEDGE_VERSION,
                representativeTemplateId: input.pattern.provenance.representativeTemplateId,
                referenceTemplateIds: [...input.pattern.provenance.sourceTemplateIds]
              }
            }
          }),
      ...(parameters
        ? {
            parameters: {
              ...clonedNode.parameters!,
              resourceName: requireMappedValue(
                resourceNames,
                terraformAddress(parameters)
              ).split(".").at(-1)!,
              values: rewrite(parameters.values) as Record<string, unknown>
            }
          }
        : {})
    } satisfies DiagramNode;
  });

  const nextEdges = input.pattern.edges.map(
    (sourceEdge) => {
      const clonedEdge = structuredClone(sourceEdge) as DiagramEdge;
      return {
        ...clonedEdge,
        id: requireMappedValue(edgeIds, sourceEdge.id),
        sourceNodeId: requireMappedValue(nodeIds, sourceEdge.sourceNodeId),
        targetNodeId: requireMappedValue(nodeIds, sourceEdge.targetNodeId),
        ...(sourceEdge.zIndex === undefined
          ? {}
          : { zIndex: sourceEdge.zIndex + zIndexDelta }),
        ...(sourceEdge.route
          ? { route: translateRoute(sourceEdge.route, placement) }
          : {})
      } satisfies DiagramEdge;
    }
  );

  const nextVariables = input.pattern.variables.map(
    (sourceVariable) =>
      ({
        ...(structuredClone(sourceVariable) as DiagramVariable),
        id: requireMappedValue(variableIds, sourceVariable.id),
        name: requireMappedValue(variableNames, sourceVariable.name),
        value: rewrite(sourceVariable.value),
        bindings: sourceVariable.bindings.map((binding) => ({
          ...structuredClone(binding),
          nodeId: requireMappedValue(nodeIds, binding.nodeId)
        })),
        source: "module"
      }) satisfies DiagramVariable
  );

  return {
    ...input.diagram,
    nodes: [...input.diagram.nodes, ...nextNodes],
    edges: [...input.diagram.edges, ...nextEdges],
    ...(input.diagram.variables !== undefined || nextVariables.length > 0
      ? { variables: [...(input.diagram.variables ?? []), ...nextVariables] }
      : {})
  };
}

function createUniqueExpandedAt(diagram: DiagramJson): string {
  const used = new Set(
    diagram.nodes.flatMap((node) =>
      node.metadata?.moduleSource ? [node.metadata.moduleSource.expandedAt] : []
    )
  );
  let timestamp = Date.now();
  while (used.has(new Date(timestamp).toISOString())) timestamp += 1;
  return new Date(timestamp).toISOString();
}

function createIdMap(
  sourceIds: readonly string[],
  usedIds: Set<string>,
  patternId: string,
  kind: "node" | "edge" | "variable"
): Map<string, string> {
  const result = new Map<string, string>();

  for (const sourceId of sourceIds) {
    result.set(
      sourceId,
      createUniqueValue(
        `${kind}-${sanitizeIdentifier(patternId)}-${sanitizeIdentifier(sourceId)}`,
        usedIds
      )
    );
  }

  return result;
}

function createResourceNameMap(
  currentNodes: readonly DiagramNode[],
  sourceNodes: readonly ArchitectureBoardModulePattern["nodes"][number][]
): Map<string, string> {
  const usedNames = new Set(
    currentNodes.flatMap(({ parameters }) => (parameters ? [parameters.resourceName] : []))
  );
  const result = new Map<string, string>();

  for (const { parameters } of sourceNodes) {
    if (!parameters) continue;
    const nextName = createUniqueValue(sanitizeTerraformName(parameters.resourceName), usedNames);
    result.set(
      terraformAddress(parameters),
      terraformAddress({ ...parameters, resourceName: nextName })
    );
  }

  return result;
}

function createVariableNameMap(
  currentVariables: readonly DiagramVariable[],
  sourceVariables: readonly ArchitectureBoardModulePattern["variables"][number][]
): Map<string, string> {
  const usedNames = new Set(currentVariables.map(({ name }) => name));
  return new Map(
    sourceVariables.map(({ name }) => [
      name,
      createUniqueValue(sanitizeTerraformName(name), usedNames)
    ])
  );
}

function rewriteReferences(
  value: unknown,
  resourceNames: ReadonlyMap<string, string>,
  variableNames: ReadonlyMap<string, string>
): unknown {
  if (typeof value === "string") {
    let result = value;
    const replacements = [
      ...[...resourceNames.entries()].map(([from, to]) => ({ from, to })),
      ...[...variableNames.entries()].map(([from, to]) => ({
        from: `var.${from}`,
        to: `var.${to}`
      }))
    ].sort((left, right) => right.from.length - left.from.length);

    for (const { from, to } of replacements) {
      result = result.replace(
        new RegExp(`(^|[^A-Za-z0-9_-])(${escapeRegExp(from)})(?=$|[^A-Za-z0-9_-])`, "g"),
        (_match, prefix: string) => `${prefix}${to}`
      );
    }
    return result;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => rewriteReferences(entry, resourceNames, variableNames));
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        rewriteReferences(entry, resourceNames, variableNames)
      ])
    );
  }

  return value;
}

function getFragmentPlacement(
  currentNodes: readonly DiagramNode[],
  sourceNodes: readonly ArchitectureBoardModulePattern["nodes"][number][]
): { readonly x: number; readonly y: number } {
  const sourceOrigin = {
    x: Math.min(...sourceNodes.map(({ position }) => position.x)),
    y: Math.min(...sourceNodes.map(({ position }) => position.y))
  };
  const targetOrigin =
    currentNodes.length === 0
      ? { x: 120, y: 120 }
      : {
          x: Math.max(...currentNodes.map((node) => node.position.x + node.size.width)) + 96,
          y: 120
        };

  return {
    x: targetOrigin.x - sourceOrigin.x,
    y: targetOrigin.y - sourceOrigin.y
  };
}

function getZIndexDelta(
  currentNodes: readonly DiagramNode[],
  currentEdges: readonly DiagramEdge[],
  sourceNodes: readonly ArchitectureBoardModulePattern["nodes"][number][],
  sourceEdges: ArchitectureBoardModulePattern["edges"]
): number {
  const currentTop = Math.max(
    0,
    ...currentNodes.map(({ zIndex }) => zIndex),
    ...currentEdges.flatMap(({ zIndex }) => (zIndex === undefined ? [] : [zIndex]))
  );
  const sourceBottom = Math.min(
    ...sourceNodes.map(({ zIndex }) => zIndex),
    ...sourceEdges.flatMap(({ zIndex }) => (zIndex === undefined ? [] : [zIndex]))
  );
  return currentTop + 1 - sourceBottom;
}

function translateRoute(
  route: NonNullable<ArchitectureBoardModulePattern["edges"][number]["route"]>,
  delta: DiagramPoint
): NonNullable<DiagramEdge["route"]> {
  return {
    ...(structuredClone(route) as NonNullable<DiagramEdge["route"]>),
    svgPath: translateSvgPath(route.svgPath, delta),
    sourcePoint: translatePoint(route.sourcePoint, delta),
    targetPoint: translatePoint(route.targetPoint, delta),
    waypoints: route.waypoints.map((point) => translatePoint(point, delta)),
    ...(route.labelPosition
      ? { labelPosition: translatePoint(route.labelPosition, delta) }
      : {})
  };
}

function translateSvgPath(svgPath: string, delta: DiagramPoint): string {
  let coordinateIndex = 0;
  return svgPath.replace(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi, (raw) => {
    const offset = coordinateIndex % 2 === 0 ? delta.x : delta.y;
    coordinateIndex += 1;
    return String(normalizeNumber(Number(raw) + offset));
  });
}

function translatePoint(point: DiagramPoint, delta: DiagramPoint): DiagramPoint {
  return {
    x: normalizeNumber(point.x + delta.x),
    y: normalizeNumber(point.y + delta.y)
  };
}

function terraformAddress(
  parameters: NonNullable<DiagramNode["parameters"]>
): string {
  return `${parameters.terraformBlockType === "data" ? "data." : ""}${parameters.resourceType}.${parameters.resourceName}`;
}

function requireMappedValue(map: ReadonlyMap<string, string>, key: string): string {
  const value = map.get(key);
  if (!value) throw new Error(`Curated Module remap is missing: ${key}`);
  return value;
}

function createUniqueValue(baseValue: string, usedValues: Set<string>): string {
  let candidate = baseValue;
  let suffix = 2;

  while (usedValues.has(candidate)) {
    candidate = `${baseValue}_${suffix}`;
    suffix += 1;
  }

  usedValues.add(candidate);
  return candidate;
}

function sanitizeIdentifier(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "item";
}

function sanitizeTerraformName(value: string): string {
  const normalized = value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "resource";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeNumber(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
