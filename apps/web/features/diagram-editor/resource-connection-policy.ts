import type { DiagramEdge, DiagramNode } from "../../../../packages/types/src";

export type RestrictedResourceConnectionRules = ReadonlyMap<string, ReadonlySet<string>>;

export type DiagramConnectionPolicyInput = {
  readonly sourceNode: DiagramNode | null | undefined;
  readonly targetNode: DiagramNode | null | undefined;
  readonly edges: readonly DiagramEdge[];
};

export function isDiagramConnectionAllowed(
  { sourceNode, targetNode, edges }: DiagramConnectionPolicyInput,
  rules: RestrictedResourceConnectionRules
): boolean {
  if (
    !sourceNode ||
    !targetNode ||
    sourceNode.id === targetNode.id ||
    sourceNode.locked ||
    targetNode.locked
  ) {
    return false;
  }

  if (
    edges.some(
      (edge) =>
        edge.sourceNodeId === sourceNode.id && edge.targetNodeId === targetNode.id
    )
  ) {
    return false;
  }

  const sourceResourceType = sourceNode.parameters?.resourceType;
  const targetResourceType = targetNode.parameters?.resourceType;

  if (!sourceResourceType || !targetResourceType) {
    return true;
  }

  return (
    isCounterpartAllowed(sourceResourceType, targetResourceType, rules) &&
    isCounterpartAllowed(targetResourceType, sourceResourceType, rules)
  );
}

function isCounterpartAllowed(
  resourceType: string,
  counterpartType: string,
  rules: RestrictedResourceConnectionRules
): boolean {
  const allowedCounterparts = rules.get(resourceType);
  return allowedCounterparts === undefined || allowedCounterparts.has(counterpartType);
}
