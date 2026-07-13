import type {
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

// Deployable templates keep their reviewed PNG geometry; legacy fixtures may still opt into compact auto-layout.
export function materializeTemplateDiagram(
  diagram: DiagramJson,
  presentationMode: TemplatePresentationMode = "compact"
): DiagramJson {
  const materialized = materializeCatalogResourceNodes(diagram, "strict");

  return presentationMode === "authored" ? materialized : arrangeTemplateTopology(materialized);
}

export function hydrateCatalogResourceNodes(diagram: DiagramJson): DiagramJson {
  return materializeCatalogResourceNodes(diagram, "tolerant");
}

function materializeCatalogResourceNodes(
  diagram: DiagramJson,
  mode: "strict" | "tolerant"
): DiagramJson {
  // Exact Catalog ids keep presentation-only Region/AZ nodes separate from normal manual-drag resource behavior.
  const nodes: DiagramNode[] = [];

  for (const templateNode of diagram.nodes) {
    const presentationCatalogItemId = templateNode.metadata?.presentationCatalogItemId;

    if (templateNode.kind === "design" && presentationCatalogItemId) {
      const presentationItem = findCatalogItemById(presentationCatalogItemId);

      if (!presentationItem) {
        if (mode === "strict") {
          throw new Error(`Missing presentation catalog resource: ${presentationCatalogItemId}`);
        }

        nodes.push(templateNode);
        continue;
      }

      nodes.push(materializeCatalogPresentationNode(templateNode, presentationItem, nodes));
      continue;
    }

    const terraformBlockType = templateNode.parameters?.terraformBlockType ?? "resource";
    const resourceType = templateNode.parameters?.resourceType ?? templateNode.type;
    const resourceItem = findCatalogResourceItem(terraformBlockType, resourceType);

    if (!resourceItem) {
      if (mode === "strict") {
        throw new Error(`Missing catalog resource: ${terraformBlockType}/${resourceType}`);
      }

      nodes.push(templateNode);
      continue;
    }

    nodes.push(materializeCatalogResourceNode(templateNode, resourceItem, nodes));
  }

  return { ...diagram, nodes };
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
  currentNodes: readonly DiagramNode[]
): DiagramNode {
  const paletteNode = createDiagramNodeFromPayload(
    { source: "resource-settings-panel", item: resourceItem },
    templateNode.position,
    templateNode.zIndex,
    currentNodes
  );
  const parameters = mergeTemplateParameters(paletteNode.parameters, templateNode.parameters);
  const materializedNode: DiagramNode = {
    ...paletteNode,
    id: templateNode.id,
    label: templateNode.label,
    locked: templateNode.locked,
    metadata: templateNode.metadata ? { ...templateNode.metadata } : undefined,
    parameters,
    position: { ...templateNode.position },
    style: templateNode.style ? { ...templateNode.style } : paletteNode.style,
    zIndex: templateNode.zIndex
  };

  return {
    ...materializedNode,
    size: getMaterializedSize(templateNode, paletteNode, materializedNode)
  };
}

// Reuse the real panel icon and type while stripping parameters that manual Region/AZ drag normally creates.
function materializeCatalogPresentationNode(
  templateNode: DiagramNode,
  resourceItem: ResourceItem,
  currentNodes: readonly DiagramNode[]
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
    label: templateNode.label,
    locked: templateNode.locked,
    metadata: templateNode.metadata ? { ...templateNode.metadata } : undefined,
    position: { ...templateNode.position },
    style: templateNode.style ? { ...templateNode.style } : paletteNode.style,
    zIndex: templateNode.zIndex
  };

  return {
    ...materializedNode,
    size: getMaterializedSize(templateNode, paletteNode, materializedNode)
  };
}

function mergeTemplateParameters(
  paletteParameters: DiagramNodeParameters | undefined,
  templateParameters: DiagramNodeParameters | undefined
): DiagramNodeParameters | undefined {
  if (!paletteParameters) {
    return templateParameters ? cloneParameters(templateParameters) : undefined;
  }

  if (!templateParameters) {
    return cloneParameters(paletteParameters);
  }

  return {
    ...paletteParameters,
    ...templateParameters,
    values: {
      ...cloneParameterValue(paletteParameters.values),
      ...cloneParameterValue(templateParameters.values)
    }
  };
}

function cloneParameters(parameters: DiagramNodeParameters): DiagramNodeParameters {
  return {
    ...parameters,
    values: cloneParameterValue(parameters.values)
  };
}

function getMaterializedSize(
  templateNode: DiagramNode,
  paletteNode: DiagramNode,
  materializedNode: DiagramNode
): DiagramNode["size"] {
  if (!isAreaNode(materializedNode)) {
    return { ...paletteNode.size };
  }

  const templateExceedsPaletteArea =
    templateNode.size.width > paletteNode.size.width ||
    templateNode.size.height > paletteNode.size.height;

  return templateExceedsPaletteArea ? { ...templateNode.size } : { ...paletteNode.size };
}
