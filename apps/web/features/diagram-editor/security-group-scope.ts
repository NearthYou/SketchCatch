import type {
  DiagramNode,
  DiagramNodeParameters,
  ResourceConfig
} from "../../../../packages/types/src";

import { isSecurityGroupScopeNode } from "./area-nodes";
import { getResourceNodeVisualBounds } from "./resource-node-visual-footprint";

const SECURITY_GROUP_SCOPE_HORIZONTAL_PADDING = 28;
const SECURITY_GROUP_SCOPE_TOP_PADDING = 44;
const SECURITY_GROUP_SCOPE_BOTTOM_PADDING = 28;
const SECURITY_GROUP_SCOPE_MINIMUM_SIZE: DiagramNode["size"] = { width: 180, height: 120 };
const TERRAFORM_REFERENCE_ATTRIBUTE_SUFFIXES = ["id", "arn", "name", "execution_arn"] as const;
const SECURITY_GROUP_REFERENCE_PATHS = [
  ["securityGroupIds"],
  ["vpcSecurityGroupIds"],
  ["securityGroupId"],
  ["securityGroups"],
  ["networkConfiguration", "securityGroups"],
  ["vpcConfig", "securityGroupIds"]
] as const;

export type FitSecurityGroupScopeOptions = {
  readonly compactOrphanScopes?: boolean;
  readonly preserveScopeNodeIds?: ReadonlySet<string>;
  readonly scopeNodeIds?: ReadonlySet<string>;
};

export type RefitSecurityGroupScopesForTargetChangesInput = {
  readonly changedNodeIds: ReadonlySet<string>;
  readonly currentNodes: readonly DiagramNode[];
  readonly preserveScopeNodeIds?: ReadonlySet<string>;
  readonly previousNodes: readonly DiagramNode[];
};

/** 변경 전후 attachment를 비교해 영향받은 SG scope만 다시 맞춥니다. */
export function refitSecurityGroupScopesForTargetChanges({
  changedNodeIds,
  currentNodes,
  preserveScopeNodeIds,
  previousNodes
}: RefitSecurityGroupScopesForTargetChangesInput): DiagramNode[] {
  const previousNodeById = new Map(previousNodes.map((node) => [node.id, node]));
  const currentNodeById = new Map(currentNodes.map((node) => [node.id, node]));
  const affectedScopeNodeIds = new Set<string>();

  for (const changedNodeId of changedNodeIds) {
    const previousNode = previousNodeById.get(changedNodeId);
    const currentNode = currentNodeById.get(changedNodeId);
    const previousScopeNodeIds = new Set(
      previousNode ? getReferencedSecurityGroupNodeIds(previousNode, previousNodeById) : []
    );
    const currentScopeNodeIds = new Set(
      currentNode ? getReferencedSecurityGroupNodeIds(currentNode, currentNodeById) : []
    );
    const targetGeometryChanged = haveNodePositionOrSizeChanged(previousNode, currentNode);

    for (const scopeNodeId of new Set([...previousScopeNodeIds, ...currentScopeNodeIds])) {
      if (
        targetGeometryChanged ||
        previousScopeNodeIds.has(scopeNodeId) !== currentScopeNodeIds.has(scopeNodeId)
      ) {
        affectedScopeNodeIds.add(scopeNodeId);
      }
    }
  }

  for (const preservedScopeNodeId of preserveScopeNodeIds ?? []) {
    affectedScopeNodeIds.delete(preservedScopeNodeId);
  }

  if (affectedScopeNodeIds.size === 0) {
    return [...currentNodes];
  }

  return fitSecurityGroupScopesToTargets(currentNodes, {
    compactOrphanScopes: true,
    scopeNodeIds: affectedScopeNodeIds
  });
}

/** Terraform SG attachment가 가리키는 실제 Resource 주위로 visual scope를 다시 맞춥니다. */
export function fitSecurityGroupScopesToTargets(
  nodes: readonly DiagramNode[],
  options: FitSecurityGroupScopeOptions = {}
): DiagramNode[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  return nodes.map((node) => {
    if (
      !isSecurityGroupScopeNode(node) ||
      options.preserveScopeNodeIds?.has(node.id) ||
      (options.scopeNodeIds && !options.scopeNodeIds.has(node.id))
    ) {
      return node;
    }

    const targetBounds = nodes
      .filter((candidate) => candidate.id !== node.id && referencesSecurityGroup(candidate, node, nodeById))
      .map(getResourceNodeVisualBounds);

    if (targetBounds.length === 0) {
      return options.compactOrphanScopes
        ? { ...node, size: { ...SECURITY_GROUP_SCOPE_MINIMUM_SIZE } }
        : node;
    }

    const left = Math.min(...targetBounds.map((bounds) => bounds.x)) - SECURITY_GROUP_SCOPE_HORIZONTAL_PADDING;
    const top = Math.min(...targetBounds.map((bounds) => bounds.y)) - SECURITY_GROUP_SCOPE_TOP_PADDING;
    const right = Math.max(...targetBounds.map((bounds) => bounds.x + bounds.width)) + SECURITY_GROUP_SCOPE_HORIZONTAL_PADDING;
    const bottom = Math.max(...targetBounds.map((bounds) => bounds.y + bounds.height)) + SECURITY_GROUP_SCOPE_BOTTOM_PADDING;

    return {
      ...node,
      position: { x: left, y: top },
      size: {
        width: Math.max(SECURITY_GROUP_SCOPE_MINIMUM_SIZE.width, right - left),
        height: Math.max(SECURITY_GROUP_SCOPE_MINIMUM_SIZE.height, bottom - top)
      }
    };
  });
}

/** attachment가 그대로여도 target 위치나 크기가 달라졌을 때만 scope 재배치를 허용합니다. */
function haveNodePositionOrSizeChanged(
  previousNode: DiagramNode | undefined,
  currentNode: DiagramNode | undefined
): boolean {
  if (!previousNode || !currentNode) {
    return false;
  }

  return (
    previousNode.position.x !== currentNode.position.x ||
    previousNode.position.y !== currentNode.position.y ||
    previousNode.size.width !== currentNode.size.width ||
    previousNode.size.height !== currentNode.size.height
  );
}

/** 한 Resource가 attachment로 직접 가리키는 SG node ID만 반환합니다. */
function getReferencedSecurityGroupNodeIds(
  node: DiagramNode,
  nodeById: ReadonlyMap<string, DiagramNode>
): string[] {
  return getSecurityGroupReferenceValues(node)
    .map((referenceValue) => findReferencedNode(referenceValue, nodeById))
    .filter((referencedNode): referencedNode is DiagramNode =>
      referencedNode !== undefined && isSecurityGroupScopeNode(referencedNode)
    )
    .map((referencedNode) => referencedNode.id);
}

/** 대상 Resource의 제한된 attachment 경로만 읽어 SG ingress 내부 참조와 섞이지 않게 합니다. */
function referencesSecurityGroup(
  node: DiagramNode,
  securityGroupNode: DiagramNode,
  nodeById: ReadonlyMap<string, DiagramNode>
): boolean {
  return getSecurityGroupReferenceValues(node).some((referenceValue) => {
    const referencedNode = findReferencedNode(referenceValue, nodeById);

    return referencedNode?.id === securityGroupNode.id;
  });
}

/** Terraform reference 또는 직접 node ID를 현재 Board 노드로 해석합니다. */
function findReferencedNode(
  rawReferenceValue: string,
  nodeById: ReadonlyMap<string, DiagramNode>
): DiagramNode | undefined {
  const referenceValue = normalizeReferenceValue(rawReferenceValue);
  const directNode = nodeById.get(referenceValue);

  if (directNode) {
    return directNode;
  }

  for (const node of nodeById.values()) {
    if (matchesTerraformNodeReference(referenceValue, node)) {
      return node;
    }
  }

  return undefined;
}

/** 지원하는 Terraform attribute reference가 특정 Board Resource와 같은지 비교합니다. */
function matchesTerraformNodeReference(referenceValue: string, node: DiagramNode): boolean {
  const parameters = node.parameters;

  if (!parameters) {
    return false;
  }

  const references = createTerraformReferenceNameCandidates(node, parameters).flatMap((resourceName) => {
    const resourceReferences = TERRAFORM_REFERENCE_ATTRIBUTE_SUFFIXES.map(
      (suffix) => `${parameters.resourceType}.${resourceName}.${suffix}`
    );

    return parameters.terraformBlockType === "data"
      ? [...resourceReferences, ...resourceReferences.map((resourceReference) => `data.${resourceReference}`)]
      : resourceReferences;
  });

  return references.includes(referenceValue);
}

/** 저장 세대별로 달라질 수 있는 Terraform Resource name 후보를 중복 없이 만듭니다. */
function createTerraformReferenceNameCandidates(
  node: DiagramNode,
  parameters: DiagramNodeParameters
): string[] {
  return [
    ...new Set(
      [
        parameters.resourceName,
        getStringConfigValue(parameters.values, "terraformResourceName"),
        node.id,
        toTerraformName(node.id),
        toTerraformName(node.label)
      ].filter(
        (referenceName): referenceName is string =>
          typeof referenceName === "string" && referenceName.length > 0
      )
    )
  ];
}

/** `${...}`로 저장된 기존 Terraform reference도 일반 reference와 같게 비교합니다. */
function normalizeReferenceValue(value: string): string {
  return value.trim().replace(/^\$\{(.+)\}$/u, "$1");
}

/** SG attachment가 저장되는 명시적 root/nested parameter 경로만 수집합니다. */
function getSecurityGroupReferenceValues(node: DiagramNode): string[] {
  return SECURITY_GROUP_REFERENCE_PATHS.flatMap((path) =>
    getNestedStringParameterValues(node, path)
  );
}

/** 주어진 nested parameter 경로의 문자열 또는 문자열 배열을 안전하게 읽습니다. */
function getNestedStringParameterValues(
  node: DiagramNode,
  path: readonly string[]
): string[] {
  let value: unknown = node.parameters?.values;

  for (const key of path) {
    if (!isRecord(value)) {
      return [];
    }

    value = value[key];
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return [value];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isString).filter((item) => item.trim().length > 0);
}

/** config 안에서 비어 있지 않은 문자열만 Terraform name 후보로 허용합니다. */
function getStringConfigValue(config: ResourceConfig, key: string): string | undefined {
  const value = config[key];

  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/** 화면 label이나 ID를 Terraform identifier 후보로 정규화합니다. */
function toTerraformName(value: string): string {
  const name = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return name.length > 0 ? name : "resource";
}

/** nested parameter 순회 전에 plain object인지 판별합니다. */
function isRecord(value: unknown): value is ResourceConfig {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 문자열 배열의 runtime narrowing을 담당합니다. */
function isString(value: unknown): value is string {
  return typeof value === "string";
}
