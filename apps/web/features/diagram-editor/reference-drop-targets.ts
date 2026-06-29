import type { DiagramNode } from "../../../../packages/types/src";
import type { ParameterCatalog, ParameterCatalogDefinition } from "../parameter-input/catalog";
import { mergeNodeParameters } from "../parameter-input/validation";

export type ReferenceDropTarget = {
  definitions: ParameterCatalogDefinition[];
  node: DiagramNode;
};

type ReferenceDropTargetCandidate = ReferenceDropTarget & {
  area: number;
};

export function findInnermostReferenceDropTarget(
  childNode: DiagramNode,
  nodes: readonly DiagramNode[],
  catalog: ParameterCatalog
): ReferenceDropTarget | null {
  if (childNode.kind !== "resource") {
    return null;
  }

  const childParameters = mergeNodeParameters(childNode, catalog);
  const referenceDefinitions = getReferenceDefinitions(catalog.resources[childParameters.resourceType] ?? []);

  if (referenceDefinitions.length === 0) {
    return null;
  }

  const childCenter = getNodeCenter(childNode);
  const candidates: ReferenceDropTargetCandidate[] = [];

  for (const node of nodes) {
    if (node.id === childNode.id || node.kind !== "resource" || !containsPoint(node, childCenter)) {
      continue;
    }

    const parentParameters = mergeNodeParameters(node, catalog);
    const definitions = referenceDefinitions.filter((definition) =>
      definition.referenceTargetTypes?.includes(parentParameters.resourceType)
    );

    if (definitions.length === 0) {
      continue;
    }

    candidates.push({
      definitions,
      node,
      area: getNodeArea(node)
    });
  }

  return candidates.sort(compareReferenceDropTargetCandidates)[0] ?? null;
}

function getReferenceDefinitions(definitions: readonly ParameterCatalogDefinition[]) {
  return definitions.filter(
    (definition) =>
      definition.inputKind === "reference-picker" && (definition.referenceTargetTypes?.length ?? 0) > 0
  );
}

function compareReferenceDropTargetCandidates(
  left: ReferenceDropTargetCandidate,
  right: ReferenceDropTargetCandidate
) {
  const areaDifference = left.area - right.area;

  if (areaDifference !== 0) {
    return areaDifference;
  }

  return right.node.zIndex - left.node.zIndex;
}

function containsPoint(
  node: DiagramNode,
  point: DiagramNode["position"]
) {
  return (
    point.x >= node.position.x &&
    point.x <= node.position.x + node.size.width &&
    point.y >= node.position.y &&
    point.y <= node.position.y + node.size.height
  );
}

function getNodeCenter(node: DiagramNode): DiagramNode["position"] {
  return {
    x: node.position.x + node.size.width / 2,
    y: node.position.y + node.size.height / 2
  };
}

function getNodeArea(node: DiagramNode) {
  return Math.max(0, node.size.width) * Math.max(0, node.size.height);
}
