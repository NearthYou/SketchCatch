import type {
  DiagramJson,
  DiagramNode,
  ResourceItem,
  TerraformBlockType,
  TerraformDiagramChangeProposal
} from "../../../../packages/types/src";
import { cloneParameterValue } from "../diagram-editor/parameter-value-utils";
import { RESOURCE_NODE_DEFAULT_SIZE } from "../diagram-editor/resource-node-geometry";
import { resourceCatalog } from "../resource-settings/catalog";
import type { TerraformVirtualFile } from "./terraform-panel-utils";

type ApprovedProposalIds = ReadonlySet<string> | readonly string[];
const DEFAULT_CREATED_NODE_SIZE = RESOURCE_NODE_DEFAULT_SIZE;
const AREA_CHILD_MARGIN = 24;
const AREA_CHILD_HEADER_OFFSET = 40;

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

type TerraformReferenceRewrite = {
  readonly fromAddress: string;
  readonly toAddress: string;
};

export function rewriteTerraformReferencesForSyncProposals(
  files: readonly TerraformVirtualFile[],
  proposals: readonly TerraformDiagramChangeProposal[]
): TerraformVirtualFile[] {
  const rewrites = proposals
    .filter(
      (proposal): proposal is Extract<TerraformDiagramChangeProposal, { kind: "rename_candidate" }> =>
        proposal.kind === "rename_candidate"
    )
    .map((proposal) => ({
      fromAddress: createTerraformAddress(proposal.from),
      toAddress: createTerraformAddress(proposal.to)
    }))
    .filter((rewrite) => rewrite.fromAddress !== rewrite.toAddress)
    .sort((left, right) => right.fromAddress.length - left.fromAddress.length);

  if (rewrites.length === 0) {
    return [...files];
  }

  return files.map((file) => {
    if (!file.fileName.endsWith(".tf")) {
      return file;
    }

    const code = rewriteTerraformReferenceExpressions(file.code, rewrites);

    return code === file.code ? file : { ...file, code };
  });
}

function createTerraformAddress(identity: {
  readonly terraformBlockType: TerraformBlockType;
  readonly resourceType: string;
  readonly resourceName: string;
}): string {
  const address = `${identity.resourceType}.${identity.resourceName}`;
  return identity.terraformBlockType === "data" ? `data.${address}` : address;
}

function rewriteTerraformReferenceExpressions(
  code: string,
  rewrites: readonly TerraformReferenceRewrite[]
): string {
  const parts = code.split(/(\r\n|\r|\n)/);
  let heredocMarker: string | null = null;
  let inBlockComment = false;

  return parts
    .map((part) => {
      if (/^(?:\r\n|\r|\n)$/.test(part)) {
        return part;
      }

      if (heredocMarker) {
        if (part.trim() === heredocMarker) {
          heredocMarker = null;
        }

        return part;
      }

      let index = 0;
      let inString = false;
      let escaped = false;
      let rewrittenLine = "";

      while (index < part.length) {
        const character = part[index] ?? "";
        const nextCharacter = part[index + 1] ?? "";

        if (inBlockComment) {
          rewrittenLine += character;

          if (character === "*" && nextCharacter === "/") {
            rewrittenLine += nextCharacter;
            index += 2;
            inBlockComment = false;
            continue;
          }

          index += 1;
          continue;
        }

        if (inString) {
          rewrittenLine += character;

          if (escaped) {
            escaped = false;
          } else if (character === "\\") {
            escaped = true;
          } else if (character === '"') {
            inString = false;
          }

          index += 1;
          continue;
        }

        if (character === '"') {
          inString = true;
          rewrittenLine += character;
          index += 1;
          continue;
        }

        if (character === "#" || (character === "/" && nextCharacter === "/")) {
          rewrittenLine += part.slice(index);
          break;
        }

        if (character === "/" && nextCharacter === "*") {
          inBlockComment = true;
          rewrittenLine += "/*";
          index += 2;
          continue;
        }

        const heredocMatch = /^<<-?\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(part.slice(index));

        if (heredocMatch?.[1]) {
          heredocMarker = heredocMatch[1];
          rewrittenLine += part.slice(index);
          break;
        }

        const rewrite = rewrites.find((candidate) =>
          isTerraformReferenceRewriteAt(part, index, candidate.fromAddress)
        );

        if (rewrite) {
          rewrittenLine += rewrite.toAddress;
          index += rewrite.fromAddress.length;
          continue;
        }

        rewrittenLine += character;
        index += 1;
      }

      return rewrittenLine;
    })
    .join("");
}

function isTerraformReferenceRewriteAt(
  codeLine: string,
  index: number,
  fromAddress: string
): boolean {
  if (!codeLine.startsWith(fromAddress, index)) {
    return false;
  }

  const previousCharacter = codeLine[index - 1];
  const nextCharacter = codeLine[index + fromAddress.length];

  return (
    (previousCharacter === undefined || !/[A-Za-z0-9_.-]/.test(previousCharacter)) &&
    nextCharacter === "."
  );
}

function applyCreateProposal(
  diagramJson: DiagramJson,
  proposal: Extract<TerraformDiagramChangeProposal, { kind: "create_candidate" }>
): DiagramJson {
  const nodeId = resolveCreateProposalNodeId(diagramJson.nodes, proposal);
  const catalogResource = findCatalogResourceForTerraformBlock(
    proposal.identity.resourceType,
    proposal.identity.terraformBlockType
  );
  const nodeSize = catalogResource
    ? { ...catalogResource.nodeDefaults.size }
    : { ...DEFAULT_CREATED_NODE_SIZE };
  const metadata = proposal.metadata ? { ...proposal.metadata } : undefined;
  const createdNode: DiagramNode = {
    id: nodeId,
    type: proposal.identity.resourceType,
    kind: "resource",
    position: getCreateProposalPosition(diagramJson.nodes, proposal, nodeSize, metadata),
    size: nodeSize,
    label: proposal.identity.resourceName,
    ...(catalogResource ? { iconUrl: catalogResource.iconUrl } : {}),
    locked: false,
    zIndex: 0,
    ...(metadata ? { metadata } : {}),
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

function resolveCreateProposalNodeId(
  nodes: readonly DiagramNode[],
  proposal: Extract<TerraformDiagramChangeProposal, { kind: "create_candidate" }>
): string {
  if (proposal.nodeId && !nodes.some((node) => node.id === proposal.nodeId)) {
    return proposal.nodeId;
  }

  return createUniqueNodeId(
    nodes,
    proposal.nodeId ?? `terraform-${proposal.identity.resourceType}-${proposal.identity.resourceName}`
  );
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

function getCreateProposalPosition(
  nodes: readonly DiagramNode[],
  proposal: Extract<TerraformDiagramChangeProposal, { kind: "create_candidate" }>,
  nodeSize: DiagramNode["size"],
  metadata: DiagramNode["metadata"] | undefined
): DiagramNode["position"] {
  if (proposal.position) {
    return { ...proposal.position };
  }

  const parentAreaNode = metadata?.parentAreaNodeId
    ? nodes.find((node) => node.id === metadata.parentAreaNodeId)
    : undefined;

  if (parentAreaNode) {
    return getPositionInsideParentArea(parentAreaNode, nodeSize);
  }

  return getNextCreatedNodePosition(nodes.length);
}

function getPositionInsideParentArea(
  parentAreaNode: DiagramNode,
  nodeSize: DiagramNode["size"]
): DiagramNode["position"] {
  const maxXOffset = Math.max(0, parentAreaNode.size.width - nodeSize.width);
  const maxYOffset = Math.max(0, parentAreaNode.size.height - nodeSize.height);

  return {
    x: parentAreaNode.position.x + Math.min(AREA_CHILD_MARGIN, maxXOffset),
    y: parentAreaNode.position.y + Math.min(AREA_CHILD_HEADER_OFFSET, maxYOffset)
  };
}

function getNextCreatedNodePosition(nodeCount: number): { x: number; y: number } {
  return {
    x: 80 + (nodeCount % 4) * 220,
    y: 80 + Math.floor(nodeCount / 4) * 160
  };
}
