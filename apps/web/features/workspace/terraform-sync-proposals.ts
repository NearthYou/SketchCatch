import type {
  DiagramJson,
  DiagramNode,
  TerraformDiagramChangeProposal
} from "../../../../packages/types/src";

type ApprovedProposalIds = ReadonlySet<string> | readonly string[];

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

export function splitTerraformSyncProposalsByApproval(
  proposals: readonly TerraformDiagramChangeProposal[],
  approvedProposalIds: ApprovedProposalIds
): {
  readonly approvedProposals: TerraformDiagramChangeProposal[];
  readonly remainingProposals: TerraformDiagramChangeProposal[];
} {
  const approvedIds =
    approvedProposalIds instanceof Set ? approvedProposalIds : new Set(approvedProposalIds);
  const approvedProposals: TerraformDiagramChangeProposal[] = [];
  const remainingProposals: TerraformDiagramChangeProposal[] = [];

  proposals.forEach((proposal, index) => {
    if (approvedIds.has(getTerraformSyncProposalId(proposal, index))) {
      approvedProposals.push(proposal);
      return;
    }

    remainingProposals.push(proposal);
  });

  return {
    approvedProposals,
    remainingProposals
  };
}

function applyCreateProposal(
  diagramJson: DiagramJson,
  proposal: Extract<TerraformDiagramChangeProposal, { kind: "create_candidate" }>
): DiagramJson {
  const nodeId = createUniqueNodeId(
    diagramJson.nodes,
    `terraform-${proposal.identity.resourceType}-${proposal.identity.resourceName}`
  );
  const createdNode: DiagramNode = {
    id: nodeId,
    type: proposal.identity.resourceType,
    kind: "resource",
    position: getNextCreatedNodePosition(diagramJson.nodes.length),
    size: {
      width: 160,
      height: 96
    },
    label: proposal.identity.resourceName,
    locked: false,
    zIndex: 0,
    parameters: {
      ...proposal.parameters,
      terraformBlockType: proposal.identity.terraformBlockType,
      resourceType: proposal.identity.resourceType,
      resourceName: proposal.identity.resourceName
    }
  };

  return {
    ...diagramJson,
    nodes: [...diagramJson.nodes, createdNode],
    edges: [...diagramJson.edges],
    viewport: { ...diagramJson.viewport }
  };
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
          resourceName: proposal.to.resourceName
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
