import type {
  DiagramEdge,
  DiagramEdgeStyle,
  DiagramJson,
  DiagramNode,
  DiagramNodeKind,
  DiagramNodeParameters,
  DiagramNodeStyle,
  ResourceDragPayload,
  ResourceItem
} from "../../../../packages/types/src";

import {
  BOARD_DEFAULT_EDGE_COLOR,
  DEFAULT_DIAGRAM_VIEWPORT,
  RESOURCE_DRAG_MIME_TYPE
} from "./constants";
import { getDefaultParameterValues } from "./default-parameter-values";
import { cloneParameterValue } from "./parameter-value-utils";
import type { DiagramEdgeKind, DiagramNodeMetadataUpdate } from "./types";

let activeResourceDragPayload: ResourceDragPayload | null = null;
const areaResourceParameterDefaults: Readonly<
  Record<string, { readonly resourceName: string; readonly values: Record<string, unknown> }>
> = {
  aws_availability_zone: {
    resourceName: "ap_northeast_2a",
    values: {
      awsAvailabilityZone: "ap-northeast-2a"
    }
  },
  aws_region: {
    resourceName: "ap_northeast_2",
    values: {
      awsRegion: "ap-northeast-2"
    }
  },
  aws_appautoscaling_target: {
    resourceName: "ecs_service_requests",
    values: {}
  }
};

export function cloneDiagram(diagram: DiagramJson): DiagramJson {
  const variables = diagram.variables?.map((variable) => ({
    ...variable,
    value: cloneParameterValue(variable.value),
    bindings: variable.bindings.map((binding) => ({ ...binding }))
  }));
  const presentation = diagram.presentation
    ? {
        ...diagram.presentation,
        ...(diagram.presentation.sourceViewBox
          ? { sourceViewBox: { ...diagram.presentation.sourceViewBox } }
          : {})
      }
    : undefined;

  return {
    nodes: diagram.nodes.map((node) => cloneNode(node)),
    edges: diagram.edges.map((edge) => cloneEdge(edge)),
    viewport: { ...diagram.viewport },
    ...(variables ? { variables } : {}),
    ...(presentation ? { presentation } : {})
  };
}

export function areDiagramsEqual(first: DiagramJson, second: DiagramJson): boolean {
  return areDiagramValuesEqual(first, second);
}

function areDiagramValuesEqual(first: unknown, second: unknown): boolean {
  if (Object.is(first, second)) {
    return true;
  }

  if (typeof first !== "object" || first === null || typeof second !== "object" || second === null) {
    return false;
  }

  if (Array.isArray(first) || Array.isArray(second)) {
    return (
      Array.isArray(first) &&
      Array.isArray(second) &&
      first.length === second.length &&
      first.every((value, index) => areDiagramValuesEqual(value, second[index]))
    );
  }

  const firstEntries = Object.entries(first);
  const secondKeys = Object.keys(second);

  return (
    firstEntries.length === secondKeys.length &&
    firstEntries.every(
      ([key, value]) =>
        Object.prototype.hasOwnProperty.call(second, key) &&
        areDiagramValuesEqual(value, Reflect.get(second, key))
    )
  );
}

export function clearAuthoredRoutesForNodeIds(
  diagram: DiagramJson,
  nodeIds: ReadonlySet<string>
): DiagramJson {
  if (nodeIds.size === 0) {
    return diagram;
  }

  let didClearRoute = false;
  const edges = diagram.edges.map((edge) => {
    if (
      !edge.route ||
      (!nodeIds.has(edge.sourceNodeId) && !nodeIds.has(edge.targetNodeId))
    ) {
      return edge;
    }

    const { route: _route, ...edgeWithoutRoute } = edge;
    didClearRoute = true;
    return edgeWithoutRoute;
  });

  return didClearRoute ? { ...diagram, edges } : diagram;
}

export function getNodeGeometryChangedIds(
  previousNodes: readonly DiagramNode[],
  currentNodes: readonly DiagramNode[]
): Set<string> {
  const previousNodeById = new Map(previousNodes.map((node) => [node.id, node]));
  const currentNodeById = new Map(currentNodes.map((node) => [node.id, node]));
  const changedNodeIds = new Set<string>();

  for (const [nodeId, currentNode] of currentNodeById) {
    const previousNode = previousNodeById.get(nodeId);

    if (!previousNode || hasNodeGeometryChanged(previousNode, currentNode)) {
      changedNodeIds.add(nodeId);
    }
  }

  for (const nodeId of previousNodeById.keys()) {
    if (!currentNodeById.has(nodeId)) {
      changedNodeIds.add(nodeId);
    }
  }

  return changedNodeIds;
}

function hasNodeGeometryChanged(previousNode: DiagramNode, currentNode: DiagramNode): boolean {
  return (
    previousNode.position.x !== currentNode.position.x ||
    previousNode.position.y !== currentNode.position.y ||
    previousNode.size.width !== currentNode.size.width ||
    previousNode.size.height !== currentNode.size.height ||
    (previousNode.rotation ?? 0) !== (currentNode.rotation ?? 0)
  );
}

export function parseResourceDragPayload(dataTransfer: DataTransfer): ResourceDragPayload | null {
  const serializedPayload =
    dataTransfer.getData(RESOURCE_DRAG_MIME_TYPE) ||
    dataTransfer.getData("application/json") ||
    dataTransfer.getData("text/plain");

  if (serializedPayload.length === 0) {
    return null;
  }

  try {
    const payload: unknown = JSON.parse(serializedPayload);
    return isResourceDragPayload(payload) ? payload : null;
  } catch {
    return null;
  }
}

export function writeResourceDragPayload(dataTransfer: DataTransfer, item: ResourceItem): ResourceDragPayload {
  const payload: ResourceDragPayload = {
    source: "resource-settings-panel",
    item
  };
  const serializedPayload = JSON.stringify(payload);

  activeResourceDragPayload = payload;
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData(RESOURCE_DRAG_MIME_TYPE, serializedPayload);
  dataTransfer.setData("application/json", serializedPayload);
  dataTransfer.setData("text/plain", serializedPayload);

  return payload;
}

export function getActiveResourceDragPayload(dataTransfer: DataTransfer): ResourceDragPayload | null {
  return parseResourceDragPayload(dataTransfer) ?? activeResourceDragPayload;
}

export function clearActiveResourceDragPayload(): void {
  activeResourceDragPayload = null;
}

export function createDiagramNodeFromPayload(
  payload: ResourceDragPayload,
  position: DiagramNode["position"],
  zIndex: number,
  currentNodes: readonly DiagramNode[] = []
): DiagramNode {
  const item = payload.item;
  const kind = getNodeKind(item);
  const nodeBase = {
    id: createDiagramId("node"),
    type: item.nodeDefaults.type,
    kind,
    position,
    size: { ...item.nodeDefaults.size },
    label: item.nodeDefaults.label,
    iconUrl: item.iconUrl,
    locked: false,
    zIndex,
    style: getDefaultNodeStyle(kind)
  };

  if (kind === "design") {
    return nodeBase;
  }

  return {
    ...nodeBase,
    parameters: createDefaultNodeParameters(item, currentNodes)
  };
}

export function createDiagramEdge(
  sourceNodeId: string,
  targetNodeId: string,
  sourceHandleId: string | undefined,
  targetHandleId: string | undefined,
  existingEdges: readonly DiagramEdge[]
): DiagramEdge | null {
  if (sourceNodeId === targetNodeId) {
    return null;
  }

  const alreadyExists = existingEdges.some(
    (edge) => edge.sourceNodeId === sourceNodeId && edge.targetNodeId === targetNodeId
  );

  if (alreadyExists) {
    return null;
  }

  return {
    id: createDiagramId("edge"),
    sourceNodeId,
    targetNodeId,
    ...(sourceHandleId ? { sourceHandleId } : {}),
    ...(targetHandleId ? { targetHandleId } : {}),
    type: "smoothstep",
    style: {
      color: BOARD_DEFAULT_EDGE_COLOR,
      lineStyle: "solid",
      width: "thin",
      animated: false
    }
  };
}

export function updateNodeById(
  nodes: readonly DiagramNode[],
  nodeId: string,
  updater: (node: DiagramNode) => DiagramNode
): DiagramNode[] {
  return nodes.map((node) => (node.id === nodeId ? updater(node) : node));
}

export function applyNodeMetadataUpdate(
  node: DiagramNode,
  update: DiagramNodeMetadataUpdate
): DiagramNode {
  const nextStyle = mergeOptionalStyle(node.style, update.style);

  return {
    ...node,
    ...update,
    ...(nextStyle ? { style: nextStyle } : {})
  };
}

export function applyNodeParametersUpdate(
  node: DiagramNode,
  update:
    | DiagramNodeParameters
    | undefined
    | ((parameters: DiagramNodeParameters | undefined) => DiagramNodeParameters | undefined)
): DiagramNode {
  const nextParameters = typeof update === "function" ? update(node.parameters) : update;
  const { parameters: _parameters, ...nodeWithoutParameters } = node;

  if (!nextParameters) {
    return nodeWithoutParameters;
  }

  return {
    ...node,
    parameters: cloneParameters(nextParameters)
  };
}

export function applyNodeParametersUpdateWithAutoTagSync(
  node: DiagramNode,
  update:
    | DiagramNodeParameters
    | undefined
    | ((parameters: DiagramNodeParameters | undefined) => DiagramNodeParameters | undefined)
): DiagramNode {
  const nextNode = applyNodeParametersUpdate(node, update);
  const nextResourceName = nextNode.parameters?.resourceName?.trim();
  const currentResourceName = node.parameters?.resourceName?.trim();

  if (!nextResourceName || nextResourceName === currentResourceName) {
    return nextNode;
  }

  return {
    ...nextNode,
    parameters: nextNode.parameters
      ? syncAutoGeneratedTagName(nextNode.parameters, currentResourceName, nextResourceName)
      : nextNode.parameters
  };
}

function syncAutoGeneratedTagName(
  parameters: DiagramNodeParameters,
  previousResourceName: string | undefined,
  nextResourceName: string
): DiagramNodeParameters {
  if (!previousResourceName || previousResourceName === nextResourceName) {
    return parameters;
  }

  const tags = parameters.values.tags;

  if (!isRecord(tags) || tags.Name !== previousResourceName) {
    return parameters;
  }

  return {
    ...parameters,
    values: {
      ...parameters.values,
      tags: {
        ...tags,
        Name: nextResourceName
      }
    }
  };
}

export function removeNodesFromDiagram(diagram: DiagramJson, nodeIds: readonly string[]): DiagramJson {
  const nodeIdSet = new Set(nodeIds);

  return {
    ...diagram,
    nodes: diagram.nodes.filter((node) => !nodeIdSet.has(node.id)),
    edges: diagram.edges.filter(
      (edge) => !nodeIdSet.has(edge.sourceNodeId) && !nodeIdSet.has(edge.targetNodeId)
    )
  };
}

export function removeEdgesFromDiagram(diagram: DiagramJson, edgeIds: readonly string[]): DiagramJson {
  const edgeIdSet = new Set(edgeIds);

  return {
    ...diagram,
    edges: diagram.edges.filter((edge) => !edgeIdSet.has(edge.id))
  };
}

export function updateDiagramViewport(diagram: DiagramJson, viewport: DiagramJson["viewport"]): DiagramJson {
  if (
    diagram.viewport.x === viewport.x &&
    diagram.viewport.y === viewport.y &&
    diagram.viewport.zoom === viewport.zoom
  ) {
    return diagram;
  }

  return {
    ...diagram,
    viewport: { ...viewport }
  };
}

export function normalizeEdgeKind(type: string | undefined): DiagramEdgeKind {
  if (type === "default" || type === "smoothstep" || type === "step" || type === "straight") {
    return type;
  }

  return "smoothstep";
}

export function getEdgeStrokeWidth(width: DiagramEdgeStyle["width"]): number {
  if (width === "thin") {
    return 1.25;
  }

  if (width === "thick") {
    return 2.25;
  }

  return 1.75;
}

export function createPastedNodes(
  sourceNodes: readonly DiagramNode[],
  currentNodes: readonly DiagramNode[]
): DiagramNode[] {
  const maxZIndex = Math.max(0, ...currentNodes.map((node) => node.zIndex));
  const resourceNamesByType = getResourceNamesByType(currentNodes);

  return sourceNodes.map((node, index) => {
    const pastedNode = clearAreaPlacementMetadata({
      ...cloneNode(node),
      id: createDiagramId("node"),
      position: {
        x: node.position.x + 32 + index * 12,
        y: node.position.y + 32 + index * 12
      },
      zIndex: maxZIndex + index + 1
    });

    if (!pastedNode.parameters) {
      return pastedNode;
    }

    const usedNames = getOrCreateSet(resourceNamesByType, pastedNode.parameters.resourceType);
    const previousResourceName = pastedNode.parameters.resourceName;
    const resourceName = createUniqueResourceName(pastedNode.parameters.resourceName, usedNames);
    usedNames.add(resourceName);

    return {
      ...pastedNode,
      parameters: syncAutoGeneratedTagName(
        {
          ...pastedNode.parameters,
          resourceName
        },
        previousResourceName,
        resourceName
      )
    };
  });
}

export function getNextZIndex(nodes: readonly DiagramNode[]): number {
  return Math.max(0, ...nodes.map((node) => node.zIndex)) + 1;
}

export function getDefaultViewport(): DiagramJson["viewport"] {
  return { ...DEFAULT_DIAGRAM_VIEWPORT };
}

function cloneNode(node: DiagramNode): DiagramNode {
  const style = node.style ? { ...node.style } : undefined;
  const metadata = node.metadata ? { ...node.metadata } : undefined;
  const parameters = node.parameters ? cloneParameters(node.parameters) : undefined;

  return {
    ...node,
    position: { ...node.position },
    size: { ...node.size },
    ...(style ? { style } : {}),
    ...(metadata ? { metadata } : {}),
    ...(parameters ? { parameters } : {})
  };
}

function clearAreaPlacementMetadata(node: DiagramNode): DiagramNode {
  if (!node.metadata?.parentAreaNodeId && !node.metadata?.areaAutoSizeBaseline) {
    return node;
  }

  const {
    areaAutoSizeBaseline: _areaAutoSizeBaseline,
    parentAreaNodeId: _parentAreaNodeId,
    ...nextMetadata
  } = node.metadata;

  return {
    ...node,
    ...(Object.keys(nextMetadata).length > 0 ? { metadata: nextMetadata } : { metadata: undefined })
  };
}

function cloneEdge(edge: DiagramEdge): DiagramEdge {
  const route = edge.route
    ? {
        ...edge.route,
        sourcePoint: { ...edge.route.sourcePoint },
        targetPoint: { ...edge.route.targetPoint },
        waypoints: edge.route.waypoints.map((waypoint) => ({ ...waypoint })),
        ...(edge.route.labelPosition
          ? { labelPosition: { ...edge.route.labelPosition } }
          : {})
      }
    : undefined;

  return {
    ...edge,
    ...(edge.style ? { style: { ...edge.style } } : {}),
    ...(route ? { route } : {})
  };
}

function cloneParameters(parameters: DiagramNodeParameters): DiagramNodeParameters {
  return {
    ...parameters,
    values: cloneParameterValue(parameters.values) as Record<string, unknown>
  };
}

function getResourceNamesByType(nodes: readonly DiagramNode[]) {
  const resourceNamesByType = new Map<string, Set<string>>();

  for (const node of nodes) {
    if (!node.parameters) {
      continue;
    }

    getOrCreateSet(resourceNamesByType, node.parameters.resourceType).add(node.parameters.resourceName);
  }

  return resourceNamesByType;
}

function getOrCreateSet(map: Map<string, Set<string>>, key: string) {
  const existingSet = map.get(key);

  if (existingSet) {
    return existingSet;
  }

  const nextSet = new Set<string>();
  map.set(key, nextSet);
  return nextSet;
}

function createUniqueResourceName(resourceName: string, usedNames: ReadonlySet<string>) {
  const baseName = resourceName.replace(/_copy(?:_\d+)?$/u, "") || "resource";
  let candidate = `${baseName}_copy`;
  let index = 2;

  while (usedNames.has(candidate)) {
    candidate = `${baseName}_copy_${index}`;
    index += 1;
  }

  return candidate;
}

function getNodeKind(item: ResourceItem): DiagramNodeKind {
  if (item.id.startsWith("design-") || item.nodeDefaults.type.startsWith("sketchcatch_")) {
    return "design";
  }

  return "resource";
}

function getDefaultNodeStyle(kind: DiagramNodeKind): DiagramNodeStyle {
  if (kind === "design") {
    return {
      textColor: "#243246",
      borderColor: "#8b98aa"
    };
  }

  return {
    textColor: "#172033",
    borderColor: "#2f6db3"
  };
}

function createDefaultNodeParameters(
  item: ResourceItem,
  currentNodes: readonly DiagramNode[]
): DiagramNodeParameters {
  const resourceType = item.nodeDefaults.type;
  const areaDefaults = areaResourceParameterDefaults[resourceType];
  const baseResourceName = areaDefaults?.resourceName ?? toTerraformName(item.nodeDefaults.label);
  const usedNames = getResourceNamesByType(currentNodes).get(resourceType) ?? new Set<string>();
  const resourceName = createUniqueNumberedResourceName(baseResourceName, usedNames);

  return {
    ...(item.nodeDefaults.terraformBlockType
      ? { terraformBlockType: item.nodeDefaults.terraformBlockType }
      : {}),
    resourceType,
    resourceName,
    fileName: "main",
    values: {
      ...(areaDefaults?.values ?? {}),
      ...getDefaultParameterValues(item.id, currentNodes)
    }
  };
}

function createUniqueNumberedResourceName(resourceName: string, usedNames: ReadonlySet<string>) {
  if (!usedNames.has(resourceName)) {
    return resourceName;
  }

  let index = 2;
  let candidate = `${resourceName}_${index}`;

  while (usedNames.has(candidate)) {
    index += 1;
    candidate = `${resourceName}_${index}`;
  }

  return candidate;
}

function mergeOptionalStyle(
  currentStyle: DiagramNodeStyle | undefined,
  updateStyle: DiagramNodeStyle | undefined
): DiagramNodeStyle | undefined {
  if (!currentStyle && !updateStyle) {
    return undefined;
  }

  return {
    ...currentStyle,
    ...updateStyle
  };
}

function createDiagramId(prefix: string): string {
  const time = Date.now().toString(36);
  const entropy = Math.random().toString(36).slice(2, 8);

  return `${prefix}-${time}-${entropy}`;
}

function toTerraformName(label: string): string {
  const normalizedLabel = label
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalizedLabel.length > 0 ? normalizedLabel : "resource";
}

function isResourceDragPayload(payload: unknown): payload is ResourceDragPayload {
  if (!isRecord(payload) || payload.source !== "resource-settings-panel") {
    return false;
  }

  return isResourceItem(payload.item);
}

function isResourceItem(item: unknown): item is ResourceItem {
  if (!isRecord(item) || !isRecord(item.nodeDefaults)) {
    return false;
  }

  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    item.cloudProvider === "aws" &&
    typeof item.area === "string" &&
    typeof item.iconUrl === "string" &&
    typeof item.enabled === "boolean" &&
    typeof item.nodeDefaults.type === "string" &&
    typeof item.nodeDefaults.label === "string" &&
    isSize(item.nodeDefaults.size)
  );
}

function isSize(size: unknown): size is DiagramNode["size"] {
  return (
    isRecord(size) &&
    typeof size.width === "number" &&
    Number.isFinite(size.width) &&
    typeof size.height === "number" &&
    Number.isFinite(size.height)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
