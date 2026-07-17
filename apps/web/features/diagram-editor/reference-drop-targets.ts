import type { DiagramNode } from "../../../../packages/types/src";
import { createTerraformParameterCatalogKey } from "@sketchcatch/types/resource-definitions";
import type { ParameterCatalog, ParameterCatalogDefinition } from "../parameter-input/catalog";
import {
  getReferenceAttribute,
  mergeNodeParameters
} from "../parameter-input/validation";

export type ReferenceDropTarget = {
  definitions: ParameterCatalogDefinition[];
  node: DiagramNode;
};

type ReferenceDropTargetCandidate = ReferenceDropTarget & {
  area: number;
};

type DropTargetCandidate = {
  area: number;
  node: DiagramNode;
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
  const referenceDefinitions = getReferenceDefinitions(
    catalog.resources[
      createTerraformParameterCatalogKey(
        childParameters.terraformBlockType ?? "resource",
        childParameters.resourceType
      )
    ] ?? []
  );

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

  return candidates.sort(compareDropTargetCandidates)[0] ?? null;
}

export function findContainingReferenceDropTargets(
  childNode: DiagramNode,
  nodes: readonly DiagramNode[],
  catalog: ParameterCatalog
): ReferenceDropTarget[] {
  if (childNode.kind !== "resource") {
    return [];
  }

  const childParameters = mergeNodeParameters(childNode, catalog);
  const referenceDefinitions = getReferenceDefinitions(
    catalog.resources[
      createTerraformParameterCatalogKey(
        childParameters.terraformBlockType ?? "resource",
        childParameters.resourceType
      )
    ] ?? []
  );

  if (referenceDefinitions.length === 0) {
    return [];
  }

  const childCenter = getNodeCenter(childNode);
  const candidateByDefinitionName = new Map<string, ReferenceDropTargetCandidate>();

  for (const node of nodes) {
    if (node.id === childNode.id || node.kind !== "resource" || !containsPoint(node, childCenter)) {
      continue;
    }

    const parentParameters = mergeNodeParameters(node, catalog);
    const area = getNodeArea(node);

    for (const definition of referenceDefinitions) {
      if (!definition.referenceTargetTypes?.includes(parentParameters.resourceType)) {
        continue;
      }

      const candidate: ReferenceDropTargetCandidate = {
        definitions: [definition],
        node,
        area
      };
      const currentCandidate = candidateByDefinitionName.get(definition.name);

      if (!currentCandidate || compareDropTargetCandidates(candidate, currentCandidate) < 0) {
        candidateByDefinitionName.set(definition.name, candidate);
      }
    }
  }

  return groupReferenceTargetCandidates(referenceDefinitions, candidateByDefinitionName);
}

export function applyReferenceDropTarget(
  childNode: DiagramNode,
  target: ReferenceDropTarget | null,
  catalog: ParameterCatalog
): DiagramNode {
  if (!target || childNode.kind !== "resource") {
    return childNode;
  }

  const childParameters = mergeNodeParameters(childNode, catalog);
  const parentParameters = mergeNodeParameters(target.node, catalog);
  let nextValues = childParameters.values;

  for (const definition of target.definitions) {
    if (!definition.referenceTargetTypes?.includes(parentParameters.resourceType)) {
      continue;
    }

    const referencePrefix = parentParameters.terraformBlockType === "data" ? "data." : "";
    const reference = `${referencePrefix}${parentParameters.resourceType}.${parentParameters.resourceName}.${getReferenceAttribute(definition)}`;

    nextValues = {
      ...nextValues,
      [definition.name]: createReferenceParameterValue(definition, reference)
    };
  }

  if (nextValues === childParameters.values) {
    return childNode;
  }

  return {
    ...childNode,
    parameters: {
      ...childParameters,
      values: nextValues
    }
  };
}

export function applyReferenceDropTargets(
  childNode: DiagramNode,
  targets: readonly ReferenceDropTarget[],
  catalog: ParameterCatalog
): DiagramNode {
  return targets.reduce(
    (currentNode, target) => applyReferenceDropTarget(currentNode, target, catalog),
    childNode
  );
}

export function applyInnermostReferenceDropTarget(
  childNode: DiagramNode,
  nodes: readonly DiagramNode[],
  catalog: ParameterCatalog
): DiagramNode {
  return applyReferenceDropTarget(childNode, findInnermostReferenceDropTarget(childNode, nodes, catalog), catalog);
}

export function applyContainingReferenceDropTarget(
  childNode: DiagramNode,
  nodes: readonly DiagramNode[],
  catalog: ParameterCatalog
): DiagramNode {
  return applyReferenceDropTargets(childNode, findContainingReferenceDropTargets(childNode, nodes, catalog), catalog);
}

export function applyInnermostReferenceDropTargets(
  nodes: readonly DiagramNode[],
  childNodeIds: ReadonlySet<string>,
  catalog: ParameterCatalog
): DiagramNode[] {
  if (childNodeIds.size === 0) {
    return [...nodes];
  }

  return nodes.map((node) =>
    childNodeIds.has(node.id) ? applyInnermostReferenceDropTarget(node, nodes, catalog) : node
  );
}

export function applyContainingReferenceDropTargets(
  nodes: readonly DiagramNode[],
  childNodeIds: ReadonlySet<string>,
  catalog: ParameterCatalog
): DiagramNode[] {
  if (childNodeIds.size === 0) {
    return [...nodes];
  }

  return nodes.map((node) =>
    childNodeIds.has(node.id) ? applyContainingReferenceDropTarget(node, nodes, catalog) : node
  );
}

function getReferenceDefinitions(definitions: readonly ParameterCatalogDefinition[]) {
  return definitions.filter(
    (definition) =>
      definition.inputKind === "reference-picker" && (definition.referenceTargetTypes?.length ?? 0) > 0
  );
}

function groupReferenceTargetCandidates(
  referenceDefinitions: readonly ParameterCatalogDefinition[],
  candidateByDefinitionName: ReadonlyMap<string, ReferenceDropTargetCandidate>
): ReferenceDropTarget[] {
  const targetByNodeId = new Map<string, ReferenceDropTarget>();

  for (const definition of referenceDefinitions) {
    const candidate = candidateByDefinitionName.get(definition.name);

    if (!candidate) {
      continue;
    }

    const currentTarget = targetByNodeId.get(candidate.node.id);

    if (currentTarget) {
      currentTarget.definitions.push(definition);
      continue;
    }

    targetByNodeId.set(candidate.node.id, {
      definitions: [definition],
      node: candidate.node
    });
  }

  return [...targetByNodeId.values()];
}

function createReferenceParameterValue(definition: ParameterCatalogDefinition, reference: string) {
  if (definition.type === "list" || definition.type === "set") {
    return [reference];
  }

  return reference;
}

function compareDropTargetCandidates(left: DropTargetCandidate, right: DropTargetCandidate) {
  const areaDifference = left.area - right.area;

  if (areaDifference !== 0) {
    return areaDifference;
  }

  return getNodeZIndex(right.node) - getNodeZIndex(left.node);
}

function getNodeZIndex(node: DiagramNode) {
  return Number.isFinite(node.zIndex) ? node.zIndex : 0;
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
