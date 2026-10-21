import type { DiagramNode } from "@sketchcatch/types";

const TARGET_RESOURCE_TYPE = "aws_appautoscaling_target";
const POLICY_RESOURCE_TYPE = "aws_appautoscaling_policy";

export function applyAddedApplicationAutoScalingTargetReferences(
  nodes: readonly DiagramNode[],
  addedNodeId: string
): DiagramNode[] {
  const addedTarget = nodes.find((node) => node.id === addedNodeId);
  if (addedTarget?.parameters?.resourceType !== TARGET_RESOURCE_TYPE) {
    return [...nodes];
  }

  const targets = nodes.filter(
    (node) => node.parameters?.resourceType === TARGET_RESOURCE_TYPE
  );
  const policies = nodes.filter(
    (node) => node.parameters?.resourceType === POLICY_RESOURCE_TYPE
  );
  if (targets.length !== 1 || policies.length !== 1) {
    return [...nodes];
  }

  const targetResourceName = addedTarget.parameters.resourceName.trim();
  if (!targetResourceName) {
    return [...nodes];
  }

  const policyId = policies[0]!.id;
  const referencePrefix = `${TARGET_RESOURCE_TYPE}.${targetResourceName}`;

  return nodes.map((node) =>
    node.id === policyId && node.parameters
      ? {
          ...node,
          parameters: {
            ...node.parameters,
            values: {
              ...node.parameters.values,
              resourceId: `${referencePrefix}.resource_id`,
              scalableDimension: `${referencePrefix}.scalable_dimension`,
              serviceNamespace: `${referencePrefix}.service_namespace`
            }
          }
        }
      : node
  );
}
