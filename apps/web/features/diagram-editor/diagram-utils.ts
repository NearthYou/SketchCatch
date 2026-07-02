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

import { DEFAULT_DIAGRAM_VIEWPORT, RESOURCE_DRAG_MIME_TYPE } from "./constants";
import type { DiagramEdgeKind, DiagramNodeMetadataUpdate } from "./types";

let activeResourceDragPayload: ResourceDragPayload | null = null;

export function cloneDiagram(diagram: DiagramJson): DiagramJson {
  return {
    nodes: diagram.nodes.map((node) => cloneNode(node)),
    edges: diagram.edges.map((edge) => cloneEdge(edge)),
    viewport: { ...diagram.viewport }
  };
}

export function areDiagramsEqual(first: DiagramJson, second: DiagramJson): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
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
  zIndex: number
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
    parameters: createDefaultNodeParameters(item)
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
      color: "#506176",
      width: "medium",
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

export function applyNodeParametersUpdateWithResourceLabel(
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
    label: nextResourceName,
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
    return 1.5;
  }

  if (width === "thick") {
    return 4;
  }

  return 2.5;
}

export function createPastedNodes(
  sourceNodes: readonly DiagramNode[],
  currentNodes: readonly DiagramNode[]
): DiagramNode[] {
  const maxZIndex = Math.max(0, ...currentNodes.map((node) => node.zIndex));
  const resourceNamesByType = getResourceNamesByType(currentNodes);

  return sourceNodes.map((node, index) => {
    const pastedNode = clearParentAreaNodeId({
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
      label: resourceName,
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

function clearParentAreaNodeId(node: DiagramNode): DiagramNode {
  if (!node.metadata?.parentAreaNodeId) {
    return node;
  }

  const { parentAreaNodeId: _parentAreaNodeId, ...nextMetadata } = node.metadata;

  return {
    ...node,
    ...(Object.keys(nextMetadata).length > 0 ? { metadata: nextMetadata } : { metadata: undefined })
  };
}

function cloneEdge(edge: DiagramEdge): DiagramEdge {
  return {
    ...edge,
    ...(edge.style ? { style: { ...edge.style } } : {})
  };
}

function cloneParameters(parameters: DiagramNodeParameters): DiagramNodeParameters {
  return {
    ...parameters,
    values: cloneParameterValue(parameters.values) as Record<string, unknown>
  };
}

function cloneParameterValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => cloneParameterValue(item));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneParameterValue(item)])
    );
  }

  return value;
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

function createDefaultNodeParameters(item: ResourceItem): DiagramNodeParameters {
  const resourceName = toTerraformName(item.nodeDefaults.label);

  return {
    ...(item.nodeDefaults.terraformBlockType
      ? { terraformBlockType: item.nodeDefaults.terraformBlockType }
      : {}),
    resourceType: item.nodeDefaults.type,
    resourceName,
    fileName: "main",
    values: {}
  };
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
