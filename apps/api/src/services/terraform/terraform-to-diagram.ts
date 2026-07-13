import { getResourceDefinitionByTerraform } from "@sketchcatch/types/resource-definitions";
import type {
  DiagramJson,
  DiagramNode,
  DiagramNodeParameters,
  TerraformBlockIdentity,
  TerraformBlockType,
  TerraformDiagramChangeProposal,
  TerraformDiagnostic,
  TerraformSyncFileInput,
  TerraformSyncToDiagramResponse
} from "@sketchcatch/types";
import {
  createTerraformBlockAddress,
  createTerraformBlockIdentityKey
} from "./terraform-identity.js";
import { isSupportedTerraformFunctionExpression } from "./terraform-function-expressions.js";
import {
  isGenericTerraformNestedBlock,
  isTerraformNestedBlockAttribute,
  isTerraformSingleNestedBlockAttribute
} from "./terraform-nested-blocks.js";

const DEFAULT_TERRAFORM_BLOCK_TYPE: TerraformBlockType = "resource";
const BLOCK_HEADER_PATTERN =
  /^\s*(resource|data)\s+"([^"]+)"\s+"([^"]+)"\s*\{\s*$/;
const PROVIDER_BLOCK_HEADER_PATTERN = /^\s*provider\s+"([^"]+)"\s*\{\s*(?:\}\s*)?$/;
const TERRAFORM_BLOCK_HEADER_PATTERN = /^\s*terraform\s*\{\s*(?:\}\s*)?$/;
const TOP_LEVEL_BLOCK_PATTERN = /^\s*([A-Za-z_][A-Za-z0-9_-]*)\b.*\{\s*$/;
const NESTED_BLOCK_PATTERN = /^\s*([A-Za-z_][A-Za-z0-9_-]*)\s*\{\s*$/;
const ATTRIBUTE_PATTERN = /^\s*([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*(.*)$/;
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const REFERENCE_PATTERN =
  /^(?:var|local|each|count|path|terraform)\.[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)*$|^module\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$|^(?:aws|kubernetes)_[A-Za-z0-9_]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$|^data\.(?:aws|kubernetes)_[A-Za-z0-9_]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/;
const DEPENDENCY_ADDRESS_PATTERN =
  /^(?:(?:aws|kubernetes)_[A-Za-z0-9_]+\.[A-Za-z0-9_-]+|data\.(?:aws|kubernetes)_[A-Za-z0-9_]+\.[A-Za-z0-9_-]+|module\.[A-Za-z0-9_-]+)$/;
const TERRAFORM_UTILITY_BLOCK_KEYS = new Set(["resource/random_password", "resource/terraform_data"]);
type ParsedBlock = {
  blockType: TerraformBlockType;
  resourceType: string;
  resourceName: string;
  address: string;
  identity: TerraformBlockIdentity;
  line: number;
  sourceFileName: string;
  values: Record<string, unknown>;
  opaque?: boolean | undefined;
};

type ParseResult = {
  blocks: ParsedBlock[];
  diagnostics: TerraformDiagnostic[];
  ignoredConfigurationBlockCount: number;
};

type BodyLine = {
  text: string;
  line: number;
};

type TerraformSyncInput =
  | string
  | {
      terraformCode: string;
      terraformFiles?: TerraformSyncFileInput[] | undefined;
    };

type CreateCandidateProposal = Extract<
  TerraformDiagramChangeProposal,
  { kind: "create_candidate" }
>;

type AvailabilityZoneProposalPlan = {
  azCreateProposals: CreateCandidateProposal[];
  parentAreaNodeIdByBlockKey: Map<string, string>;
};

// Sync safe Terraform values while keeping structural changes explicit and presentation-neutral.
export function syncTerraformToDiagramJson(
  diagramJson: DiagramJson,
  input: TerraformSyncInput
): TerraformSyncToDiagramResponse {
  const parseResult = parseTerraformInput(input);
  const preservedResourceAddressSet = new Set(
    parseResult.blocks
      .filter((block) => block.opaque || isKnownTerraformUtilityBlock(block.identity))
      .map((block) => block.address)
  );
  const getPreservedResourceAddresses = (): string[] => Array.from(preservedResourceAddressSet);

  if (parseResult.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return {
      diagramJson,
      diagnostics: parseResult.diagnostics,
      preservedResourceAddresses: getPreservedResourceAddresses(),
      proposals: []
    };
  }

  const syncBlocks = parseResult.blocks.filter(
    (block) => !block.opaque && !isKnownTerraformUtilityBlock(block.identity)
  );
  const ignoredUtilityBlockCount = parseResult.blocks.length - syncBlocks.length;

  if (syncBlocks.length === 0) {
    if (isTerraformSyncInputBlank(input)) {
      return {
        diagramJson,
        diagnostics: [],
        proposals: createChangeProposals(createDiagramOnlyNodes(diagramJson.nodes, new Map()), [])
      };
    }

    if (
      parseResult.ignoredConfigurationBlockCount > 0 ||
      ignoredUtilityBlockCount > 0 ||
      parseResult.diagnostics.length > 0
    ) {
      return {
        diagramJson,
        diagnostics: parseResult.diagnostics,
        preservedResourceAddresses: getPreservedResourceAddresses(),
        proposals: []
      };
    }

    return {
      diagramJson,
      diagnostics: [
        {
          severity: "error",
          code: "terraform.sync.empty",
          message: "동기화할 resource/data block이 없습니다."
        }
      ],
      proposals: []
    };
  }

  const nodeMapResult = createNodeIdentityMap(diagramJson.nodes);

  if (nodeMapResult.diagnostics.length > 0) {
    return {
      diagramJson,
      diagnostics: nodeMapResult.diagnostics,
      preservedResourceAddresses: getPreservedResourceAddresses(),
      proposals: []
    };
  }

  const nodeByIdentityKey = nodeMapResult.nodeByIdentityKey;
  const blockByIdentityKey = new Map(
    parseResult.blocks.map((block) => [createTerraformBlockIdentityKey(block.identity), block])
  );
  const availabilityZoneProposalPlan = createAvailabilityZoneProposalPlan(
    diagramJson.nodes,
    syncBlocks,
    nodeByIdentityKey
  );
  const diagnostics: TerraformDiagnostic[] = [];
  const valuesByNodeId = new Map<string, Record<string, unknown>>();
  const metadataByNodeId = new Map<string, DiagramNode["metadata"]>();
  const terraformOnlyBlocks: ParsedBlock[] = [];

  for (const block of syncBlocks) {
    const blockKey = createTerraformBlockIdentityKey(block.identity);
    const node = nodeByIdentityKey.get(blockKey);

    if (!node) {
      if (isProposalSupportedBlock(block.identity)) {
        terraformOnlyBlocks.push(block);
      } else {
        preservedResourceAddressSet.add(block.address);
        diagnostics.push({
          severity: "warning",
          code: "terraform.sync.unsupported_resource",
          line: block.line,
          sourceFileName: block.sourceFileName,
          resourceAddress: block.address,
          message: `${block.address}는 Terraform 동기화 v1 지원 리소스가 아닙니다.`
        });
      }
      continue;
    }

    valuesByNodeId.set(node.id, block.values);

    const parentAreaNodeId = availabilityZoneProposalPlan.parentAreaNodeIdByBlockKey.get(blockKey);

    if (parentAreaNodeId) {
      metadataByNodeId.set(node.id, {
        ...node.metadata,
        parentAreaNodeId
      });
    }
  }

  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return {
      diagramJson,
      diagnostics,
      preservedResourceAddresses: getPreservedResourceAddresses(),
      proposals: []
    };
  }

  const diagramOnlyNodes = createDiagramOnlyNodes(diagramJson.nodes, blockByIdentityKey);
  const proposals = createChangeProposals(
    diagramOnlyNodes,
    terraformOnlyBlocks,
    availabilityZoneProposalPlan
  );

  return {
    diagramJson: {
      ...diagramJson,
      nodes: diagramJson.nodes.map((node) => {
        const values = valuesByNodeId.get(node.id);
        const metadata = metadataByNodeId.get(node.id);

        if (!values && !metadata) {
          return node;
        }

        return {
          ...node,
          ...(metadata ? { metadata } : {}),
          ...(values && node.parameters
            ? {
                parameters: {
                  ...node.parameters,
                  values
                }
              }
            : {})
        };
      }),
      edges: diagramJson.edges.map((edge) => ({ ...edge })),
      viewport: { ...diagramJson.viewport }
    },
    diagnostics: [...parseResult.diagnostics, ...diagnostics],
    preservedResourceAddresses: getPreservedResourceAddresses(),
    proposals
  };
}

function createDiagramOnlyNodes(
  nodes: DiagramNode[],
  blockByIdentityKey: ReadonlyMap<string, ParsedBlock>
): DiagramNode[] {
  return nodes.filter((node) => {
    if (node.kind !== "resource" || !node.parameters) {
      return false;
    }

    const identity = toNodeIdentity(node);

    return (
      isProposalSupportedBlock(identity) &&
      !blockByIdentityKey.has(createTerraformBlockIdentityKey(identity))
    );
  });
}

function createNodeIdentityMap(nodes: DiagramNode[]): {
  nodeByIdentityKey: Map<string, DiagramNode>;
  diagnostics: TerraformDiagnostic[];
} {
  const nodeByIdentityKey = new Map<string, DiagramNode>();
  const diagnostics: TerraformDiagnostic[] = [];

  for (const node of nodes) {
    if (node.kind !== "resource" || !node.parameters) {
      continue;
    }

    const identity = toNodeIdentity(node);

    if (!isProposalSupportedBlock(identity)) {
      continue;
    }

    const key = createTerraformBlockIdentityKey(identity);

    if (nodeByIdentityKey.has(key)) {
      diagnostics.push({
        severity: "error",
        code: "terraform.sync.duplicate_diagram_identity",
        nodeId: node.id,
        resourceAddress: createTerraformBlockAddress(identity),
        message: `${createTerraformBlockAddress(identity)} DiagramJson node가 중복되었습니다.`
      });
      continue;
    }

    nodeByIdentityKey.set(key, node);
  }

  return { nodeByIdentityKey, diagnostics };
}

function createChangeProposals(
  diagramOnlyNodes: DiagramNode[],
  terraformOnlyBlocks: ParsedBlock[],
  availabilityZoneProposalPlan: AvailabilityZoneProposalPlan = {
    azCreateProposals: [],
    parentAreaNodeIdByBlockKey: new Map()
  }
): TerraformDiagramChangeProposal[] {
  const proposals: TerraformDiagramChangeProposal[] = [];
  const usedTerraformBlockKeys = new Set<string>();
  const usedDiagramNodeIds = new Set<string>();
  const renameGroups = createRenameCandidateGroups(diagramOnlyNodes, terraformOnlyBlocks);

  for (const group of renameGroups.values()) {
    if (group.diagramNodes.length !== 1 || group.terraformBlocks.length !== 1) {
      continue;
    }

    const node = group.diagramNodes[0]!;
    const renameBlock = group.terraformBlocks[0]!;
    const from = toNodeIdentity(node);

    usedDiagramNodeIds.add(node.id);
    usedTerraformBlockKeys.add(createTerraformBlockIdentityKey(renameBlock.identity));
    proposals.push({
      kind: "rename_candidate",
      from,
      to: renameBlock.identity,
      sourceFileName: renameBlock.sourceFileName,
      line: renameBlock.line,
      nodeId: node.id,
      resourceAddress: createTerraformBlockAddress(from)
    });
  }

  proposals.push(...availabilityZoneProposalPlan.azCreateProposals);

  for (const block of terraformOnlyBlocks) {
    const blockKey = createTerraformBlockIdentityKey(block.identity);

    if (usedTerraformBlockKeys.has(blockKey)) {
      continue;
    }

    const parentAreaNodeId = availabilityZoneProposalPlan.parentAreaNodeIdByBlockKey.get(blockKey);

    proposals.push({
      kind: "create_candidate",
      identity: block.identity,
      sourceFileName: block.sourceFileName,
      line: block.line,
      ...(parentAreaNodeId ? { metadata: { parentAreaNodeId } } : {}),
      parameters: toDiagramNodeParameters(block)
    });
  }

  for (const node of diagramOnlyNodes) {
    if (!node.parameters || usedDiagramNodeIds.has(node.id)) {
      continue;
    }

    const identity = toNodeIdentity(node);

    proposals.push({
      kind: "delete_candidate",
      identity,
      nodeId: node.id,
      resourceAddress: createTerraformBlockAddress(identity)
    });
  }

  return proposals;
}

// Preserve authored presentation AZ hierarchy while still grouping genuinely Terraform-only children.
function createAvailabilityZoneProposalPlan(
  nodes: readonly DiagramNode[],
  blocks: readonly ParsedBlock[],
  nodeByIdentityKey: ReadonlyMap<string, DiagramNode>
): AvailabilityZoneProposalPlan {
  const usedNodeIds = new Set(nodes.map((node) => node.id));
  const azNodeIdByValue = createExistingAvailabilityZoneNodeIdByValue(nodes);
  const azCreateProposalByValue = new Map<string, CreateCandidateProposal>();
  const parentAreaNodeIdByBlockKey = new Map<string, string>();

  for (const block of blocks) {
    const blockKey = createTerraformBlockIdentityKey(block.identity);
    const matchedNode = nodeByIdentityKey.get(blockKey);

    if (matchedNode?.metadata?.parentAreaNodeId) {
      continue;
    }

    const availabilityZone = getBlockAvailabilityZone(block);

    if (!availabilityZone) {
      continue;
    }

    let azNodeId = azNodeIdByValue.get(availabilityZone);

    if (!azNodeId) {
      azNodeId = createUniqueNodeId(`terraform-az-${availabilityZone}`, usedNodeIds);
      usedNodeIds.add(azNodeId);
      azNodeIdByValue.set(availabilityZone, azNodeId);
      azCreateProposalByValue.set(
        availabilityZone,
        createAvailabilityZoneProposal(availabilityZone, azNodeId, block.sourceFileName)
      );
    }

    parentAreaNodeIdByBlockKey.set(blockKey, azNodeId);
  }

  return {
    azCreateProposals: [...azCreateProposalByValue.values()],
    parentAreaNodeIdByBlockKey
  };
}

function createExistingAvailabilityZoneNodeIdByValue(
  nodes: readonly DiagramNode[]
): Map<string, string> {
  const nodeIdByValue = new Map<string, string>();

  for (const node of nodes) {
    if (node.kind !== "resource" || getNodeResourceType(node) !== "aws_availability_zone") {
      continue;
    }

    const availabilityZone = node.parameters?.values?.["awsAvailabilityZone"];

    if (typeof availabilityZone === "string" && availabilityZone.trim().length > 0) {
      nodeIdByValue.set(availabilityZone, node.id);
    }
  }

  return nodeIdByValue;
}

function createAvailabilityZoneProposal(
  availabilityZone: string,
  nodeId: string,
  fileName: string
): CreateCandidateProposal {
  const resourceName = toTerraformLocalName(availabilityZone);

  return {
    kind: "create_candidate",
    identity: {
      terraformBlockType: "resource",
      resourceType: "aws_availability_zone",
      resourceName
    },
    nodeId,
    parameters: {
      resourceType: "aws_availability_zone",
      resourceName,
      fileName,
      values: {
        awsAvailabilityZone: availabilityZone
      }
    }
  };
}

function getBlockAvailabilityZone(block: ParsedBlock): string | null {
  if (block.resourceType !== "aws_subnet" && block.resourceType !== "aws_ebs_volume") {
    return null;
  }

  const availabilityZone = block.values["availabilityZone"];

  return typeof availabilityZone === "string" && availabilityZone.trim().length > 0
    ? availabilityZone
    : null;
}

function getNodeResourceType(node: DiagramNode): string {
  return node.parameters?.resourceType ?? node.type;
}

function createUniqueNodeId(baseId: string, usedNodeIds: ReadonlySet<string>): string {
  const normalizedBaseId = baseId.replace(/[^A-Za-z0-9_-]+/g, "-");

  if (!usedNodeIds.has(normalizedBaseId)) {
    return normalizedBaseId;
  }

  for (let index = 2; ; index += 1) {
    const candidate = `${normalizedBaseId}-${index}`;

    if (!usedNodeIds.has(candidate)) {
      return candidate;
    }
  }
}

function toTerraformLocalName(value: string): string {
  return value.replace(/[^A-Za-z0-9_]+/g, "_");
}

function createRenameCandidateGroups(
  diagramOnlyNodes: DiagramNode[],
  terraformOnlyBlocks: ParsedBlock[]
): Map<string, { diagramNodes: DiagramNode[]; terraformBlocks: ParsedBlock[] }> {
  const groups = new Map<string, { diagramNodes: DiagramNode[]; terraformBlocks: ParsedBlock[] }>();

  for (const node of diagramOnlyNodes) {
    if (!node.parameters) {
      continue;
    }

    const identity = toNodeIdentity(node);
    const key = createRenameCandidateKey(identity, node.parameters.values);
    const group = getOrCreateRenameCandidateGroup(groups, key);
    group.diagramNodes.push(node);
  }

  for (const block of terraformOnlyBlocks) {
    const key = createRenameCandidateKey(block.identity, block.values);
    const group = getOrCreateRenameCandidateGroup(groups, key);
    group.terraformBlocks.push(block);
  }

  return groups;
}

function createRenameCandidateKey(
  identity: TerraformBlockIdentity,
  values: Record<string, unknown>
): string {
  return JSON.stringify({
    terraformBlockType: identity.terraformBlockType,
    resourceType: identity.resourceType,
    values: normalizeComparisonValue(values)
  });
}

function getOrCreateRenameCandidateGroup(
  groups: Map<string, { diagramNodes: DiagramNode[]; terraformBlocks: ParsedBlock[] }>,
  key: string
): { diagramNodes: DiagramNode[]; terraformBlocks: ParsedBlock[] } {
  const existingGroup = groups.get(key);

  if (existingGroup) {
    return existingGroup;
  }

  const group = {
    diagramNodes: [],
    terraformBlocks: []
  };

  groups.set(key, group);

  return group;
}

function toDiagramNodeParameters(block: ParsedBlock): DiagramNodeParameters {
  return {
    ...(block.blockType !== DEFAULT_TERRAFORM_BLOCK_TYPE ? { terraformBlockType: block.blockType } : {}),
    resourceType: block.resourceType,
    resourceName: block.resourceName,
    fileName: block.sourceFileName,
    values: block.values
  };
}

function toNodeIdentity(node: DiagramNode): TerraformBlockIdentity {
  const parameters = node.parameters;

  return {
    terraformBlockType: parameters?.terraformBlockType ?? DEFAULT_TERRAFORM_BLOCK_TYPE,
    resourceType: parameters?.resourceType ?? "",
    resourceName: parameters?.resourceName ?? ""
  };
}

function isProposalSupportedBlock(identity: TerraformBlockIdentity): boolean {
  return (
    getResourceDefinitionByTerraform(identity.terraformBlockType, identity.resourceType)
      ?.capabilities.terraformSync === true
  );
}

function isKnownTerraformUtilityBlock(identity: TerraformBlockIdentity): boolean {
  return TERRAFORM_UTILITY_BLOCK_KEYS.has(
    `${identity.terraformBlockType}/${identity.resourceType}`
  );
}

function normalizeComparisonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeComparisonValue(item));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, normalizeComparisonValue(value[key])])
    );
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseTerraformInput(input: TerraformSyncInput): ParseResult {
  const files =
    typeof input === "string" || input.terraformFiles === undefined || input.terraformFiles.length === 0
      ? [
          {
            fileName: "main.tf",
            terraformCode: typeof input === "string" ? input : input.terraformCode
          }
        ]
      : input.terraformFiles;
  const blocks: ParsedBlock[] = [];
  const diagnostics: TerraformDiagnostic[] = [];
  const identityKeys = new Set<string>();
  let ignoredConfigurationBlockCount = 0;

  for (const file of files) {
    const parseResult = parseTerraformBlocks(file.fileName, file.terraformCode);

    for (const block of parseResult.blocks) {
      const identityKey = createTerraformBlockIdentityKey(block.identity);

      if (identityKeys.has(identityKey)) {
        diagnostics.push({
          severity: "error",
          code: "terraform.sync.duplicate_address",
          line: block.line,
          sourceFileName: block.sourceFileName,
          resourceAddress: block.address,
          message: `${block.address} block이 중복되었습니다.`
        });
      }

      identityKeys.add(identityKey);
      blocks.push(block);
    }

    diagnostics.push(
      ...parseResult.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        sourceFileName: diagnostic.sourceFileName ?? file.fileName
      }))
    );
    ignoredConfigurationBlockCount += parseResult.ignoredConfigurationBlockCount;
  }

  return { blocks, diagnostics, ignoredConfigurationBlockCount };
}

function isTerraformSyncInputBlank(input: TerraformSyncInput): boolean {
  const files =
    typeof input === "string" || input.terraformFiles === undefined || input.terraformFiles.length === 0
      ? [typeof input === "string" ? input : input.terraformCode]
      : input.terraformFiles.map((file) => file.terraformCode);

  return files.every((terraformCode) => terraformCode.trim().length === 0);
}

function parseTerraformBlocks(sourceFileName: string, terraformCode: string): ParseResult {
  const lines = splitTerraformLines(terraformCode);
  const blocks: ParsedBlock[] = [];
  const diagnostics: TerraformDiagnostic[] = [];
  let ignoredConfigurationBlockCount = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const lineText = lines[index] ?? "";
    const codeLine = stripLineComment(lineText);
    const trimmedLine = codeLine.trim();

    if (!trimmedLine) {
      continue;
    }

    if (TERRAFORM_BLOCK_HEADER_PATTERN.test(codeLine)) {
      ignoredConfigurationBlockCount += 1;

      if (!isInlineEmptyBlock(codeLine)) {
        const bodyResult = collectBlockBody(lines, index + 1, index + 1, "terraform");
        diagnostics.push(...bodyResult.diagnostics);

        if (!bodyResult.closed) {
          index = lines.length;
          continue;
        }

        index = bodyResult.endIndex;
      }

      continue;
    }

    const providerHeaderMatch = PROVIDER_BLOCK_HEADER_PATTERN.exec(codeLine);

    if (providerHeaderMatch) {
      ignoredConfigurationBlockCount += 1;

      if (!isInlineEmptyBlock(codeLine)) {
        const bodyResult = collectBlockBody(lines, index + 1, index + 1, "provider");
        diagnostics.push(...bodyResult.diagnostics);

        if (!bodyResult.closed) {
          index = lines.length;
          continue;
        }

        index = bodyResult.endIndex;
      }

      continue;
    }

    const headerMatch = BLOCK_HEADER_PATTERN.exec(codeLine);

    if (!headerMatch) {
      const topLevelBlockMatch = TOP_LEVEL_BLOCK_PATTERN.exec(codeLine);
      const topLevelBlockType = topLevelBlockMatch?.[1];

      if (topLevelBlockType && topLevelBlockType !== "resource" && topLevelBlockType !== "data") {
        const bodyResult = collectBlockBody(lines, index + 1, index + 1, topLevelBlockType);
        diagnostics.push(...bodyResult.diagnostics);

        if (!bodyResult.closed) {
          index = lines.length;
          continue;
        }

        if (topLevelBlockType !== "output") {
          diagnostics.push({
            severity: "warning",
            code: "terraform.sync.unsupported_block",
            line: index + 1,
            message: `${topLevelBlockType} block은 Diagram으로 동기화하지 않고 Terraform 원문으로 보존합니다.`
          });
        }
        ignoredConfigurationBlockCount += 1;
        index = bodyResult.endIndex;
        continue;
      }

      diagnostics.push({
        severity: "error",
        code: "terraform.sync.block_header",
        line: index + 1,
        message: "block header는 resource/data \"type\" \"name\" { 형식이어야 합니다."
      });
      continue;
    }

    const blockType = headerMatch[1] as TerraformBlockType | undefined;
    const resourceType = headerMatch[2];
    const resourceName = headerMatch[3];

    if (!blockType || !resourceType || !resourceName) {
      diagnostics.push({
        severity: "error",
        code: "terraform.sync.block_header",
        line: index + 1,
        message: "block header는 resource/data \"type\" \"name\" { 형식이어야 합니다."
      });
      continue;
    }

    const identity = { terraformBlockType: blockType, resourceType, resourceName };
    const address = createTerraformBlockAddress(identity);

    const headerLineNumber = index + 1;
    const bodyResult = collectBlockBody(lines, index + 1, headerLineNumber, address);
    diagnostics.push(...bodyResult.diagnostics);

    if (!bodyResult.closed) {
      index = lines.length;
      continue;
    }

    if (isKnownTerraformUtilityBlock(identity)) {
      blocks.push({
        blockType,
        resourceType,
        resourceName,
        address,
        identity,
        line: index + 1,
        sourceFileName,
        values: {}
      });
      index = bodyResult.endIndex;
      continue;
    }

    const valuesResult = parseAttributes(
      bodyResult.bodyLines,
      address,
      resourceType
    );
    diagnostics.push(...valuesResult.diagnostics.map((diagnostic) =>
      isOpaqueTerraformSyncDiagnostic(diagnostic)
        ? { ...diagnostic, severity: "warning" as const }
        : diagnostic
    ));

    if (valuesResult.diagnostics.some(isOpaqueTerraformSyncDiagnostic)) {
      blocks.push({
        blockType,
        resourceType,
        resourceName,
        address,
        identity,
        line: index + 1,
        sourceFileName,
        values: {},
        opaque: true
      });
      ignoredConfigurationBlockCount += 1;
      index = bodyResult.endIndex;
      continue;
    }

    blocks.push({
      blockType,
      resourceType,
      resourceName,
      address,
      identity,
      line: index + 1,
      sourceFileName,
      values: valuesResult.values
    });

    index = bodyResult.endIndex;
  }

  return { blocks, diagnostics, ignoredConfigurationBlockCount };
}

function splitTerraformLines(terraformCode: string): string[] {
  return terraformCode.split(/\r?\n/);
}

function isInlineEmptyBlock(lineText: string): boolean {
  return /\{\s*\}\s*$/.test(stripLineComment(lineText));
}

function collectBlockBody(
  lines: string[],
  startIndex: number,
  headerLine: number,
  resourceAddress: string
): {
  bodyLines: BodyLine[];
  diagnostics: TerraformDiagnostic[];
  endIndex: number;
  closed: boolean;
} {
  const bodyLines: BodyLine[] = [];
  const diagnostics: TerraformDiagnostic[] = [];
  let valueDepth = 0;
  let nestedBlockDepth = 0;

  for (let index = startIndex; index < lines.length; index += 1) {
    const lineText = lines[index] ?? "";
    const codeLine = stripLineComment(lineText);
    const trimmedLine = codeLine.trim();

    if (valueDepth === 0 && trimmedLine === "}") {
      if (nestedBlockDepth > 0) {
        bodyLines.push({ text: lineText, line: index + 1 });
        nestedBlockDepth -= 1;
        continue;
      }

      return {
        bodyLines,
        diagnostics,
        endIndex: index,
        closed: true
      };
    }

    if (valueDepth === 0 && isNestedBlockOpening(trimmedLine)) {
      bodyLines.push({ text: lineText, line: index + 1 });
      nestedBlockDepth += 1;
      continue;
    }

    bodyLines.push({ text: lineText, line: index + 1 });
    valueDepth += countOpenValueDelimiters(codeLine);
  }

  diagnostics.push({
    severity: "error",
    code: "terraform.sync.block_header",
    line: headerLine,
    resourceAddress,
    message: `${resourceAddress} block이 닫히지 않았습니다.`
  });

  return {
    bodyLines,
    diagnostics,
    endIndex: lines.length - 1,
    closed: false
  };
}

function parseAttributes(
  bodyLines: BodyLine[],
  resourceAddress: string,
  resourceType?: string,
  parentPath: readonly string[] = []
): { values: Record<string, unknown>; diagnostics: TerraformDiagnostic[] } {
  const values: Record<string, unknown> = {};
  const diagnostics: TerraformDiagnostic[] = [];

  for (let index = 0; index < bodyLines.length; index += 1) {
    const bodyLine = bodyLines[index];

    if (!bodyLine) {
      continue;
    }

    const codeLine = stripLineComment(bodyLine.text);
    const trimmedLine = codeLine.trim();

    if (!trimmedLine) {
      continue;
    }

    const nestedBlockName = getNestedBlockName(trimmedLine);

    if (nestedBlockName) {
      const nestedBlock = collectNestedBlockBody(
        bodyLines,
        index + 1,
        bodyLine.line,
        resourceAddress
      );

      diagnostics.push(...nestedBlock.diagnostics);
      index = nestedBlock.endIndex;

      const isSupportedNestedBlock = resourceType && (
        isTerraformNestedBlockAttribute(resourceType, nestedBlockName, parentPath) ||
        (parentPath.length > 0 && isGenericTerraformNestedBlock(nestedBlockName))
      );

      if (!isSupportedNestedBlock) {
        diagnostics.push({
          severity: "error",
          code: "terraform.sync.nested_block",
          line: bodyLine.line,
          resourceAddress,
          message: "nested block은 Terraform 동기화 subset에서 지원하지 않습니다."
        });
        continue;
      }

      if (!nestedBlock.closed) {
        continue;
      }

      const nestedValues = parseAttributes(
        nestedBlock.bodyLines,
        resourceAddress,
        resourceType,
        [...parentPath, nestedBlockName]
      );
      diagnostics.push(...nestedValues.diagnostics);
      appendNestedBlockValue(
        values,
        nestedBlockName,
        nestedValues.values,
        isTerraformSingleNestedBlockAttribute(resourceType, nestedBlockName)
      );
      continue;
    }

    const attributeMatch = ATTRIBUTE_PATTERN.exec(codeLine);

    if (!attributeMatch) {
      diagnostics.push({
        severity: "error",
        code: trimmedLine.endsWith("{")
          ? "terraform.sync.nested_block"
          : "terraform.sync.unsupported_expression",
        line: bodyLine.line,
        resourceAddress,
        message: "top-level attribute만 Terraform 동기화 subset에서 지원합니다."
      });
      continue;
    }

    const terraformName = attributeMatch[1];
    const firstValueLine = attributeMatch[2];

    if (!terraformName) {
      diagnostics.push({
        severity: "error",
        code: "terraform.sync.unsupported_expression",
        line: bodyLine.line,
        resourceAddress,
        message: "top-level attribute만 Terraform 동기화 subset에서 지원합니다."
      });
      continue;
    }

    const valueLines = [firstValueLine ?? ""];
    let valueDepth = countOpenValueDelimiters(firstValueLine ?? "");

    while (valueDepth > 0 && index + 1 < bodyLines.length) {
      index += 1;
      const nextLine = bodyLines[index];

      if (!nextLine) {
        continue;
      }

      const nextCodeLine = stripLineComment(nextLine.text);
      valueLines.push(nextCodeLine);
      valueDepth += countOpenValueDelimiters(nextCodeLine);
    }

    const valueText = valueLines.join("\n");
    const parsedValue = parseAttributeValue(
      valueText,
      bodyLine.line,
      resourceAddress,
      terraformName === "depends_on"
    );

    if (parsedValue.diagnostic) {
      diagnostics.push(parsedValue.diagnostic);
      continue;
    }

    values[toCamelCase(terraformName)] = parsedValue.value;
  }

  return { values, diagnostics };
}

function isOpaqueTerraformSyncDiagnostic(diagnostic: TerraformDiagnostic): boolean {
  return diagnostic.code === "terraform.sync.unsupported_expression" ||
    diagnostic.code === "terraform.sync.trailing_tokens" ||
    diagnostic.code === "terraform.sync.nested_block";
}

function collectNestedBlockBody(
  bodyLines: BodyLine[],
  startIndex: number,
  blockLine: number,
  resourceAddress: string
): {
  bodyLines: BodyLine[];
  diagnostics: TerraformDiagnostic[];
  endIndex: number;
  closed: boolean;
} {
  const nestedBodyLines: BodyLine[] = [];
  const diagnostics: TerraformDiagnostic[] = [];
  let valueDepth = 0;
  let nestedBlockDepth = 0;

  for (let index = startIndex; index < bodyLines.length; index += 1) {
    const bodyLine = bodyLines[index];

    if (!bodyLine) {
      continue;
    }

    const codeLine = stripLineComment(bodyLine.text);
    const trimmedLine = codeLine.trim();

    if (valueDepth === 0 && trimmedLine === "}") {
      if (nestedBlockDepth > 0) {
        nestedBodyLines.push(bodyLine);
        nestedBlockDepth -= 1;
        continue;
      }

      return {
        bodyLines: nestedBodyLines,
        diagnostics,
        endIndex: index,
        closed: true
      };
    }

    if (valueDepth === 0 && isNestedBlockOpening(trimmedLine)) {
      nestedBodyLines.push(bodyLine);
      nestedBlockDepth += 1;
      continue;
    }

    nestedBodyLines.push(bodyLine);
    valueDepth += countOpenValueDelimiters(codeLine);
  }

  diagnostics.push({
    severity: "error",
    code: "terraform.sync.block_header",
    line: blockLine,
    resourceAddress,
    message: "nested block이 닫히지 않았습니다."
  });

  return {
    bodyLines: nestedBodyLines,
    diagnostics,
    endIndex: bodyLines.length - 1,
    closed: false
  };
}

function appendNestedBlockValue(
  values: Record<string, unknown>,
  terraformName: string,
  nestedValue: Record<string, unknown>,
  singleBlock: boolean
): void {
  const name = toCamelCase(terraformName);

  if (singleBlock) {
    values[name] = nestedValue;
    return;
  }

  const currentValue = values[name];

  if (Array.isArray(currentValue)) {
    currentValue.push(nestedValue);
    return;
  }

  values[name] = [nestedValue];
}

function getNestedBlockName(lineText: string): string | null {
  return NESTED_BLOCK_PATTERN.exec(lineText)?.[1] ?? null;
}

function isNestedBlockOpening(lineText: string): boolean {
  return getNestedBlockName(lineText) !== null;
}

function parseAttributeValue(
  valueText: string,
  line: number,
  resourceAddress: string,
  allowDependencyAddress = false
): { value?: unknown; diagnostic?: TerraformDiagnostic } {
  const trimmedValueText = valueText.trim();

  if (isSupportedTerraformFunctionExpression(trimmedValueText)) {
    return { value: trimmedValueText };
  }

  const parser = new HclValueParser(valueText, allowDependencyAddress);
  const value = parser.parseValue();

  if (value.status === "unsupported") {
    return {
      diagnostic: {
        severity: "error",
        code: "terraform.sync.unsupported_expression",
        line,
        resourceAddress,
        message: "지원하지 않는 Terraform expression입니다."
      }
    };
  }

  if (value.status === "invalid") {
    return {
      diagnostic: {
        severity: "error",
        code: "terraform.sync.unsupported_expression",
        line,
        resourceAddress,
        message: "Terraform attribute 값을 해석할 수 없습니다."
      }
    };
  }

  parser.skipWhitespace();

  if (!parser.isAtEnd()) {
    return {
      diagnostic: {
        severity: "error",
        code: "terraform.sync.trailing_tokens",
        line,
        resourceAddress,
        message: "attribute 값 뒤에 알 수 없는 토큰이 남아 있습니다."
      }
    };
  }

  return { value: value.value };
}

type ValueParseResult =
  | { status: "ok"; value: unknown }
  | { status: "invalid" }
  | { status: "unsupported" };

class HclValueParser {
  private index = 0;

  constructor(
    private readonly source: string,
    private readonly allowDependencyAddress = false
  ) {}

  parseValue(): ValueParseResult {
    this.skipWhitespace();
    const char = this.peek();

    if (!char) {
      return { status: "invalid" };
    }

    if (char === "\"") {
      return this.parseString();
    }

    if (char === "[") {
      return this.parseList();
    }

    if (char === "{") {
      return this.parseObject();
    }

    return this.parseLiteral();
  }

  skipWhitespace(): void {
    while (/\s/.test(this.peek() ?? "")) {
      this.index += 1;
    }
  }

  isAtEnd(): boolean {
    return this.index >= this.source.length;
  }

  private parseString(): ValueParseResult {
    const start = this.index;
    this.index += 1;
    let escaped = false;

    while (!this.isAtEnd()) {
      const char = this.source[this.index];

      if (escaped) {
        escaped = false;
        this.index += 1;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        this.index += 1;
        continue;
      }

      if (char === "\"") {
        this.index += 1;
        const rawString = this.source.slice(start, this.index);

        try {
          return { status: "ok", value: JSON.parse(rawString) };
        } catch {
          return { status: "invalid" };
        }
      }

      this.index += 1;
    }

    return { status: "invalid" };
  }

  private parseList(): ValueParseResult {
    const values: unknown[] = [];
    this.index += 1;

    while (!this.isAtEnd()) {
      this.skipWhitespace();

      if (this.peek() === "]") {
        this.index += 1;
        return { status: "ok", value: values };
      }

      const item = this.parseValue();

      if (item.status !== "ok") {
        return item;
      }

      values.push(item.value);
      this.skipWhitespace();

      if (this.peek() === ",") {
        this.index += 1;
      }
    }

    return { status: "invalid" };
  }

  private parseObject(): ValueParseResult {
    const value: Record<string, unknown> = {};
    this.index += 1;

    while (!this.isAtEnd()) {
      this.skipWhitespace();

      if (this.peek() === "}") {
        this.index += 1;
        return { status: "ok", value };
      }

      const key = this.parseObjectKey();

      if (!key) {
        return { status: "invalid" };
      }

      this.skipWhitespace();

      if (this.peek() !== "=") {
        return { status: "invalid" };
      }

      this.index += 1;
      const nestedValue = this.parseValue();

      if (nestedValue.status !== "ok") {
        return nestedValue;
      }

      value[key] = nestedValue.value;
      this.skipWhitespace();

      if (this.peek() === ",") {
        this.index += 1;
      }
    }

    return { status: "invalid" };
  }

  private parseObjectKey(): string | null {
    this.skipWhitespace();

    if (this.peek() === "\"") {
      const parsedKey = this.parseString();

      return parsedKey.status === "ok" && typeof parsedKey.value === "string"
        ? parsedKey.value
        : null;
    }

    const start = this.index;

    while (/[A-Za-z0-9_-]/.test(this.peek() ?? "")) {
      this.index += 1;
    }

    const key = this.source.slice(start, this.index);

    return IDENTIFIER_PATTERN.test(key) ? key : null;
  }

  private parseLiteral(): ValueParseResult {
    const start = this.index;

    while (!this.isAtEnd() && !/[\s,\]}]/.test(this.peek() ?? "")) {
      this.index += 1;
    }

    const literal = this.source.slice(start, this.index);

    if (literal === "true") {
      return { status: "ok", value: true };
    }

    if (literal === "false") {
      return { status: "ok", value: false };
    }

    if (literal === "null") {
      return { status: "ok", value: null };
    }

    if (/^-?\d+(?:\.\d+)?$/.test(literal)) {
      return { status: "ok", value: Number(literal) };
    }

    if (
      REFERENCE_PATTERN.test(literal) ||
      (this.allowDependencyAddress && DEPENDENCY_ADDRESS_PATTERN.test(literal))
    ) {
      return { status: "ok", value: literal };
    }

    if (/[()[\]${}?]/.test(literal) || literal.includes("for")) {
      return { status: "unsupported" };
    }

    return { status: "invalid" };
  }

  private peek(): string | undefined {
    return this.source[this.index];
  }
}

function countOpenValueDelimiters(source: string): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "[" || char === "{") {
      depth += 1;
      continue;
    }

    if (char === "]" || char === "}") {
      depth -= 1;
    }
  }

  return depth;
}

function stripLineComment(lineText: string): string {
  let inString = false;
  let escaped = false;

  for (let index = 0; index < lineText.length; index += 1) {
    const char = lineText[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (!inString && (char === "#" || (char === "/" && lineText[index + 1] === "/"))) {
      return lineText.slice(0, index);
    }
  }

  return lineText;
}

function toCamelCase(value: string): string {
  return value.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}
