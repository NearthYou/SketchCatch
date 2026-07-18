import { getDefaultResourceDefinitionByResourceType } from "@sketchcatch/types/resource-definitions";
import type {
  ArchitectureJson,
  DiagramJson,
  DiagramNode,
  ResourceNode,
  TerraformBlockIdentity,
  TerraformBlockType
} from "@sketchcatch/types";
import { createTerraformBlockAddress } from "./terraform-identity.js";

const DEFAULT_TERRAFORM_BLOCK_TYPE: TerraformBlockType = "resource";

export type AnalysisExcludedTerraformConflict = {
  nodeId: string;
  resourceAddress: string;
  excludedResourceAddress: string;
};

// Review-only reverse-engineering nodes remain visible on the Board, but cannot regain
// execution eligibility through an authored Terraform block.
export function findAnalysisExcludedTerraformConflicts(
  source: DiagramJson | ArchitectureJson,
  identities: readonly TerraformBlockIdentity[]
): AnalysisExcludedTerraformConflict[] {
  const excludedNodes = source.nodes
    .map(toAnalysisExcludedResource)
    .filter((node): node is AnalysisExcludedResource => node !== null);
  const conflicts: AnalysisExcludedTerraformConflict[] = [];
  const seen = new Set<string>();

  for (const node of excludedNodes) {
    for (const identity of identities) {
      if (!matchesExcludedIdentity(node.identity, identity)) {
        continue;
      }

      const resourceAddress = createTerraformBlockAddress(identity);
      const key = `${node.id}:${resourceAddress}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      conflicts.push({
        nodeId: node.id,
        resourceAddress,
        excludedResourceAddress: node.identity.resourceName
          ? createTerraformBlockAddress(node.identity)
          : node.identity.resourceType
      });
    }
  }

  return conflicts;
}

type AnalysisExcludedResource = {
  id: string;
  identity: TerraformBlockIdentity;
};

function toAnalysisExcludedResource(
  node: DiagramNode | ResourceNode
): AnalysisExcludedResource | null {
  if (isDiagramNode(node)) {
    if (node.kind !== "resource" || node.parameters?.values?.["analysisExcluded"] !== true) {
      return null;
    }

    const identity = toDiagramTerraformIdentity(node);
    return identity ? { id: node.id, identity } : null;
  }

  if (node.config["analysisExcluded"] !== true) {
    return null;
  }

  const identity = toArchitectureTerraformIdentity(node);
  return identity ? { id: node.id, identity } : null;
}

function isDiagramNode(node: DiagramNode | ResourceNode): node is DiagramNode {
  return "kind" in node;
}

function toDiagramTerraformIdentity(node: DiagramNode): TerraformBlockIdentity | null {
  const resourceType = node.parameters?.resourceType?.trim();

  if (!resourceType) {
    return null;
  }

  return {
    terraformBlockType: node.parameters?.terraformBlockType ?? DEFAULT_TERRAFORM_BLOCK_TYPE,
    resourceType,
    resourceName: node.parameters?.resourceName?.trim() ?? ""
  };
}

function toArchitectureTerraformIdentity(node: ResourceNode): TerraformBlockIdentity | null {
  const configuredResourceType = node.config["terraformResourceType"];
  const definition = getDefaultResourceDefinitionByResourceType(node.type);
  const resourceType =
    typeof configuredResourceType === "string" && configuredResourceType.trim().length > 0
      ? configuredResourceType.trim()
      : definition?.terraform.resourceType;

  if (!resourceType) {
    return null;
  }

  const configuredBlockType = node.config["terraformBlockType"];
  const configuredResourceName = node.config["terraformResourceName"];

  return {
    terraformBlockType:
      configuredBlockType === "data" || configuredBlockType === "resource"
        ? configuredBlockType
        : definition?.terraform.blockType ?? DEFAULT_TERRAFORM_BLOCK_TYPE,
    resourceType,
    resourceName:
      typeof configuredResourceName === "string" ? configuredResourceName.trim() : ""
  };
}

function matchesExcludedIdentity(
  excluded: TerraformBlockIdentity,
  candidate: TerraformBlockIdentity
): boolean {
  if (
    excluded.terraformBlockType !== candidate.terraformBlockType ||
    excluded.resourceType !== candidate.resourceType
  ) {
    return false;
  }

  return excluded.resourceName.length === 0 || excluded.resourceName === candidate.resourceName;
}
