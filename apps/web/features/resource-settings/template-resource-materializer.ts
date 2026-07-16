import type {
  DiagramEdge,
  DiagramJson,
  DiagramNode,
  DiagramNodeParameters,
  ResourceItem
} from "../../../../packages/types/src";
import { isAreaNode } from "../diagram-editor/area-nodes";
import { createDiagramNodeFromPayload } from "../diagram-editor/diagram-utils";
import { cloneParameterValue } from "../diagram-editor/parameter-value-utils";
import { resourceCatalog } from "./catalog";
import { arrangeTemplateTopology } from "./template-topology-layout";

export type TemplatePresentationMode = "authored" | "compact";

export type CatalogNodeMaterializationOptions = {
  readonly mode: "strict" | "tolerant";
  readonly preserveGeometry?: boolean | undefined;
  readonly currentNodes?: readonly DiagramNode[] | undefined;
  readonly workspaceSeedPolicy?: "preserve" | "replace-with-palette-defaults" | undefined;
};

// Deployable templates keep their reviewed Board-capture geometry; legacy fixtures may still opt into compact auto-layout.
export function materializeTemplateDiagram(
  diagram: DiagramJson,
  presentationMode: TemplatePresentationMode = "compact"
): DiagramJson {
  const materialized = materializeCatalogResourceNodes(diagram, { mode: "strict" });
  const preservesAuthoredGeometry = diagram.presentation?.geometryPolicy === "source-exact";

  return presentationMode === "authored" || preservesAuthoredGeometry
    ? materialized
    : arrangeTemplateTopology(materialized);
}

export function hydrateCatalogResourceNodes(diagram: DiagramJson): DiagramJson {
  return materializeCatalogResourceNodes(diagram, { mode: "tolerant" });
}

/**
 * Materializes only the supplied Diagram nodes through the real Resource Palette factory.
 * `currentNodes` participates in default-name selection but is never returned or modified.
 */
export function materializeCatalogResourceNodes(
  diagram: DiagramJson,
  options: CatalogNodeMaterializationOptions
): DiagramJson {
  // Exact Catalog ids keep presentation-only Region/AZ nodes separate from normal manual-drag resource behavior.
  const nodes: DiagramNode[] = [];
  const materializationContextNodes: DiagramNode[] = [...(options.currentNodes ?? [])];
  const preservesAuthoredGeometry =
    options.preserveGeometry ?? diagram.presentation?.geometryPolicy === "source-exact";

  const appendNode = (node: DiagramNode): void => {
    nodes.push(node);
    materializationContextNodes.push(node);
  };

  for (const templateNode of diagram.nodes) {
    const presentationCatalogItemId = templateNode.metadata?.presentationCatalogItemId;

    if (templateNode.kind === "design" && !presentationCatalogItemId && !templateNode.parameters) {
      appendNode(cloneUnresolvedPresentationNode(templateNode));
      continue;
    }

    if (templateNode.kind === "design" && presentationCatalogItemId) {
      const presentationItem = findCatalogItemById(presentationCatalogItemId);

      if (!presentationItem) {
        if (options.mode === "strict") {
          throw new Error(`Missing presentation catalog resource: ${presentationCatalogItemId}`);
        }

        appendNode(templateNode);
        continue;
      }

      appendNode(
        materializeCatalogPresentationNode(
          templateNode,
          presentationItem,
          materializationContextNodes,
          preservesAuthoredGeometry
        )
      );
      continue;
    }

    const terraformBlockType = templateNode.parameters?.terraformBlockType ?? "resource";
    const resourceType = templateNode.parameters?.resourceType ?? templateNode.type;
    const resourceItem = findCatalogResourceItem(terraformBlockType, resourceType);

    if (!resourceItem) {
      if (options.mode === "strict") {
        throw new Error(`Missing catalog resource: ${terraformBlockType}/${resourceType}`);
      }

      appendNode(templateNode);
      continue;
    }

    appendNode(
      materializeCatalogResourceNode(
        templateNode,
        resourceItem,
        materializationContextNodes,
        preservesAuthoredGeometry,
        options.workspaceSeedPolicy ?? "preserve"
      )
    );
  }

  const geometryChangedNodeIds = getGeometryChangedNodeIds(diagram.nodes, nodes);

  return {
    ...diagram,
    nodes,
    edges: invalidateAuthoredEdgeGeometry(diagram.edges, geometryChangedNodeIds)
  };
}

// Presentation lookup uses the panel's stable id so duplicate Terraform-like Region/AZ identities are impossible.
function findCatalogItemById(catalogItemId: string): ResourceItem | undefined {
  return resourceCatalog.find((candidate) => candidate.id === catalogItemId);
}

function findCatalogResourceItem(
  terraformBlockType: string,
  resourceType: string
): ResourceItem | undefined {
  return resourceCatalog.find(
    (candidate) =>
      (candidate.nodeDefaults.terraformBlockType ?? "resource") === terraformBlockType &&
      candidate.nodeDefaults.type === resourceType
  );
}

function materializeCatalogResourceNode(
  templateNode: DiagramNode,
  resourceItem: ResourceItem,
  currentNodes: readonly DiagramNode[],
  preservesAuthoredGeometry: boolean,
  workspaceSeedPolicy: NonNullable<CatalogNodeMaterializationOptions["workspaceSeedPolicy"]>
): DiagramNode {
  const paletteNode = createDiagramNodeFromPayload(
    { source: "resource-settings-panel", item: resourceItem },
    templateNode.position,
    templateNode.zIndex,
    currentNodes
  );
  const parameters = mergeTemplateParameters(
    paletteNode.parameters,
    templateNode.parameters,
    workspaceSeedPolicy
  );
  const materializedNode: DiagramNode = {
    ...paletteNode,
    id: templateNode.id,
    label: getAuthoredOrPaletteLabel(templateNode, paletteNode),
    locked: templateNode.locked,
    metadata: templateNode.metadata ? { ...templateNode.metadata } : undefined,
    parameters,
    position: { ...templateNode.position },
    style: templateNode.style ? { ...templateNode.style } : paletteNode.style,
    zIndex: templateNode.zIndex,
    ...(templateNode.rotation === undefined ? {} : { rotation: templateNode.rotation })
  };

  return applyMaterializedGeometry(
    templateNode,
    paletteNode,
    materializedNode,
    preservesAuthoredGeometry
  );
}

// Reuse the real panel icon and type while stripping parameters that manual Region/AZ drag normally creates.
function materializeCatalogPresentationNode(
  templateNode: DiagramNode,
  resourceItem: ResourceItem,
  currentNodes: readonly DiagramNode[],
  preservesAuthoredGeometry: boolean
): DiagramNode {
  const paletteNode = createDiagramNodeFromPayload(
    { source: "resource-settings-panel", item: resourceItem },
    templateNode.position,
    templateNode.zIndex,
    currentNodes
  );
  const { parameters: _parameters, ...parameterlessPaletteNode } = paletteNode;
  const materializedNode: DiagramNode = {
    ...parameterlessPaletteNode,
    id: templateNode.id,
    kind: "design",
    label: getAuthoredOrPaletteLabel(templateNode, paletteNode),
    locked: templateNode.locked,
    metadata: templateNode.metadata ? { ...templateNode.metadata } : undefined,
    position: { ...templateNode.position },
    style: templateNode.style ? { ...templateNode.style } : paletteNode.style,
    zIndex: templateNode.zIndex,
    ...(templateNode.rotation === undefined ? {} : { rotation: templateNode.rotation })
  };

  return applyMaterializedGeometry(
    templateNode,
    paletteNode,
    materializedNode,
    preservesAuthoredGeometry
  );
}

function mergeTemplateParameters(
  paletteParameters: DiagramNodeParameters | undefined,
  templateParameters: DiagramNodeParameters | undefined,
  workspaceSeedPolicy: NonNullable<CatalogNodeMaterializationOptions["workspaceSeedPolicy"]>
): DiagramNodeParameters | undefined {
  if (
    templateParameters?.terraformSourceAuthority === "workspace-seed" &&
    workspaceSeedPolicy === "preserve"
  ) {
    return cloneParameters(templateParameters);
  }

  const materializedTemplateParameters =
    templateParameters?.terraformSourceAuthority === "workspace-seed"
      ? omitWorkspaceSeedAuthority(templateParameters)
      : templateParameters;

  if (!paletteParameters) {
    return materializedTemplateParameters
      ? cloneParameters(materializedTemplateParameters)
      : undefined;
  }

  if (!materializedTemplateParameters) {
    return cloneParameters(paletteParameters);
  }

  return {
    ...paletteParameters,
    ...materializedTemplateParameters,
    values: {
      ...cloneParameterValue(paletteParameters.values),
      ...cloneParameterValue(materializedTemplateParameters.values)
    }
  };
}

function omitWorkspaceSeedAuthority(parameters: DiagramNodeParameters): DiagramNodeParameters {
  const { terraformSourceAuthority: _terraformSourceAuthority, ...materialized } = parameters;

  return {
    ...materialized,
    values: cloneParameterValue(parameters.values)
  };
}

function getAuthoredOrPaletteLabel(authoredNode: DiagramNode, paletteNode: DiagramNode): string {
  return authoredNode.label.trim().length > 0 ? authoredNode.label : paletteNode.label;
}

function cloneUnresolvedPresentationNode(node: DiagramNode): DiagramNode {
  return {
    ...node,
    position: { ...node.position },
    size: { ...node.size },
    ...(node.style ? { style: { ...node.style } } : {}),
    ...(node.metadata ? { metadata: { ...node.metadata } } : {})
  };
}

function cloneParameters(parameters: DiagramNodeParameters): DiagramNodeParameters {
  return {
    ...parameters,
    values: cloneParameterValue(parameters.values)
  };
}

function applyMaterializedGeometry(
  templateNode: DiagramNode,
  paletteNode: DiagramNode,
  materializedNode: DiagramNode,
  preservesAuthoredGeometry: boolean
): DiagramNode {
  const size = getMaterializedSize(
    templateNode,
    paletteNode,
    materializedNode,
    preservesAuthoredGeometry
  );
  const position =
    !isAreaNode(materializedNode) &&
    (size.width !== templateNode.size.width || size.height !== templateNode.size.height)
      ? {
          x: templateNode.position.x + (templateNode.size.width - size.width) / 2,
          y: templateNode.position.y + (templateNode.size.height - size.height) / 2
        }
      : { ...templateNode.position };

  return {
    ...materializedNode,
    position,
    size
  };
}

function getGeometryChangedNodeIds(
  authoredNodes: readonly DiagramNode[],
  materializedNodes: readonly DiagramNode[]
): ReadonlySet<string> {
  const authoredNodeById = new Map(authoredNodes.map((node) => [node.id, node]));
  const changedNodeIds = new Set<string>();

  for (const materializedNode of materializedNodes) {
    const authoredNode = authoredNodeById.get(materializedNode.id);

    if (
      !authoredNode ||
      authoredNode.position.x !== materializedNode.position.x ||
      authoredNode.position.y !== materializedNode.position.y ||
      authoredNode.size.width !== materializedNode.size.width ||
      authoredNode.size.height !== materializedNode.size.height
    ) {
      changedNodeIds.add(materializedNode.id);
    }
  }

  return changedNodeIds;
}

function invalidateAuthoredEdgeGeometry(
  edges: readonly DiagramEdge[],
  geometryChangedNodeIds: ReadonlySet<string>
): DiagramEdge[] {
  if (geometryChangedNodeIds.size === 0) return [...edges];

  return edges.map((edge) => {
    if (
      !geometryChangedNodeIds.has(edge.sourceNodeId) &&
      !geometryChangedNodeIds.has(edge.targetNodeId)
    ) {
      return edge;
    }

    const {
      route: _route,
      sourceHandleId: _sourceHandleId,
      targetHandleId: _targetHandleId,
      ...edgeWithoutAuthoredGeometry
    } = edge;
    return edgeWithoutAuthoredGeometry;
  });
}

function getMaterializedSize(
  templateNode: DiagramNode,
  paletteNode: DiagramNode,
  materializedNode: DiagramNode,
  preservesAuthoredGeometry: boolean
): DiagramNode["size"] {
  if (!isAreaNode(materializedNode)) {
    return { ...paletteNode.size };
  }

  if (preservesAuthoredGeometry) {
    return { ...templateNode.size };
  }

  const templateExceedsPaletteArea =
    templateNode.size.width > paletteNode.size.width ||
    templateNode.size.height > paletteNode.size.height;

  return templateExceedsPaletteArea ? { ...templateNode.size } : { ...paletteNode.size };
}
