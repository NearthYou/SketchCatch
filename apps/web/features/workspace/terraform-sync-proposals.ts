import type {
  DiagramJson,
  DiagramNode,
  ResourceItem,
  TerraformBlockType,
  TerraformDiagramChangeProposal
} from "../../../../packages/types/src";
import { resourceCatalog } from "../resource-settings/catalog";

type ApprovedProposalIds = ReadonlySet<string> | readonly string[];
const DEFAULT_CREATED_NODE_SIZE = {
  width: 56,
  height: 56
} as const;

export function getTerraformSyncProposalId(
  proposal: TerraformDiagramChangeProposal,
  index = 0
): string {
  if (proposal.kind === "rename_candidate") {
    return `${proposal.kind}:${proposal.from.terraformBlockType}/${proposal.from.resourceType}/${proposal.from.resourceName}->${proposal.to.resourceName}:${proposal.nodeId}:${index}`;
  }

  return `${proposal.kind}:${proposal.identity.terraformBlockType}/${proposal.identity.resourceType}/${proposal.identity.resourceName}:${index}`;
}

export function applyTerraformSyncProposals(
  diagramJson: DiagramJson,
  proposals: readonly TerraformDiagramChangeProposal[],
  approvedProposalIds: ApprovedProposalIds
): DiagramJson {
  const approvedIds =
    approvedProposalIds instanceof Set ? approvedProposalIds : new Set(approvedProposalIds);
  let nextDiagramJson = cloneDiagramJson(diagramJson);

  for (const [index, proposal] of proposals.entries()) {
    if (!approvedIds.has(getTerraformSyncProposalId(proposal, index))) {
      continue;
    }

    if (proposal.kind === "rename_candidate") {
      nextDiagramJson = applyRenameProposal(nextDiagramJson, proposal);
      continue;
    }

    if (proposal.kind === "delete_candidate") {
      nextDiagramJson = applyDeleteProposal(nextDiagramJson, proposal);
      continue;
    }

    nextDiagramJson = applyCreateProposal(nextDiagramJson, proposal);
  }

  return nextDiagramJson;
}

export function applyAllTerraformSyncProposals(
  diagramJson: DiagramJson,
  proposals: readonly TerraformDiagramChangeProposal[]
): DiagramJson {
  return applyTerraformSyncProposals(
    diagramJson,
    proposals,
    proposals.map((proposal, index) => getTerraformSyncProposalId(proposal, index))
  );
}

function applyCreateProposal(
  diagramJson: DiagramJson,
  proposal: Extract<TerraformDiagramChangeProposal, { kind: "create_candidate" }>
): DiagramJson {
  const nodeId = createUniqueNodeId(
    diagramJson.nodes,
    `terraform-${proposal.identity.resourceType}-${proposal.identity.resourceName}`
  );
  const catalogResource = findCatalogResourceForTerraformBlock(
    proposal.identity.resourceType,
    proposal.identity.terraformBlockType
  );
  const createdNode: DiagramNode = {
    id: nodeId,
    type: proposal.identity.resourceType,
    kind: "resource",
    position: getNextCreatedNodePosition(diagramJson.nodes.length),
    size: catalogResource
      ? { ...catalogResource.nodeDefaults.size }
      : { ...DEFAULT_CREATED_NODE_SIZE },
    label: proposal.identity.resourceName,
    ...(catalogResource ? { iconUrl: catalogResource.iconUrl } : {}),
    locked: false,
    zIndex: 0,
    parameters: {
      ...proposal.parameters,
      terraformBlockType: proposal.identity.terraformBlockType,
      resourceType: proposal.identity.resourceType,
      resourceName: proposal.identity.resourceName,
      values: cloneParameterValue(proposal.parameters.values)
    }
  };

  return {
    ...diagramJson,
    nodes: [...diagramJson.nodes, createdNode],
    edges: [...diagramJson.edges],
    viewport: { ...diagramJson.viewport }
  };
}

function findCatalogResourceForTerraformBlock(
  resourceType: string,
  terraformBlockType: TerraformBlockType
): ResourceItem | undefined {
  return resourceCatalog.find((resource) => {
    const catalogTerraformBlockType = resource.nodeDefaults.terraformBlockType ?? "resource";

    return (
      resource.nodeDefaults.type === resourceType &&
      catalogTerraformBlockType === terraformBlockType
    );
  });
}

function applyDeleteProposal(
  diagramJson: DiagramJson,
  proposal: Extract<TerraformDiagramChangeProposal, { kind: "delete_candidate" }>
): DiagramJson {
  return {
    ...diagramJson,
    nodes: diagramJson.nodes.filter((node) => node.id !== proposal.nodeId),
    edges: diagramJson.edges.filter(
      (edge) => edge.sourceNodeId !== proposal.nodeId && edge.targetNodeId !== proposal.nodeId
    ),
    viewport: { ...diagramJson.viewport }
  };
}

function applyRenameProposal(
  diagramJson: DiagramJson,
  proposal: Extract<TerraformDiagramChangeProposal, { kind: "rename_candidate" }>
): DiagramJson {
  return {
    ...diagramJson,
    nodes: diagramJson.nodes.map((node) => {
      if (node.id !== proposal.nodeId || !node.parameters) {
        return node;
      }

      return {
        ...node,
        label: proposal.to.resourceName,
        parameters: {
          ...node.parameters,
          terraformBlockType: proposal.to.terraformBlockType,
          resourceType: proposal.to.resourceType,
          resourceName: proposal.to.resourceName,
          fileName: proposal.sourceFileName ?? node.parameters.fileName
        }
      };
    }),
    edges: [...diagramJson.edges],
    viewport: { ...diagramJson.viewport }
  };
}

function cloneDiagramJson(diagramJson: DiagramJson): DiagramJson {
  return {
    nodes: diagramJson.nodes.map((node) => ({
      ...node,
      position: { ...node.position },
      size: { ...node.size },
      ...(node.style ? { style: { ...node.style } } : {}),
      ...(node.metadata ? { metadata: { ...node.metadata } } : {}),
      ...(node.parameters
        ? {
            parameters: {
              ...node.parameters,
              values: cloneParameterValue(node.parameters.values)
            }
          }
        : {})
    })),
    edges: diagramJson.edges.map((edge) => ({
      ...edge,
      ...(edge.style ? { style: { ...edge.style } } : {})
    })),
    viewport: { ...diagramJson.viewport }
  };
}

function cloneParameterValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneParameterValue(item)) as T;
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, cloneParameterValue(nestedValue)])
    ) as T;
  }

  return value;
}

function createUniqueNodeId(nodes: readonly DiagramNode[], baseId: string): string {
  const existingNodeIds = new Set(nodes.map((node) => node.id));
  const normalizedBaseId = baseId.replace(/[^A-Za-z0-9_-]+/g, "-");

  if (!existingNodeIds.has(normalizedBaseId)) {
    return normalizedBaseId;
  }

  for (let index = 2; ; index += 1) {
    const candidate = `${normalizedBaseId}-${index}`;

    if (!existingNodeIds.has(candidate)) {
      return candidate;
    }
  }
}

function getNextCreatedNodePosition(nodeCount: number): { x: number; y: number } {
  return {
    x: 80 + (nodeCount % 4) * 220,
    y: 80 + Math.floor(nodeCount / 4) * 160
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
