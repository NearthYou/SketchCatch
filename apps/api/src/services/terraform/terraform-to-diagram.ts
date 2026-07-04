import { getResourceDefinitionByTerraform } from "@sketchcatch/types/resource-definitions";
import type {
  AwsAvailabilityZoneCode,
  DiagramJson,
  DiagramNode,
  DiagramNodeMetadata,
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
import { isTerraformNestedBlockAttribute } from "./terraform-nested-blocks.js";

const DEFAULT_TERRAFORM_BLOCK_TYPE: TerraformBlockType = "resource";
const AWS_AVAILABILITY_ZONE_RESOURCE_TYPE = "aws_availability_zone";
const AWS_AVAILABILITY_ZONE_AWARE_RESOURCE_TYPES = new Set(["aws_subnet", "aws_ebs_volume"]);
const AWS_AVAILABILITY_ZONE_PATTERN = /^[a-z]{2}-[a-z]+-\d[a-z]$/;
const BLOCK_HEADER_PATTERN = /^\s*(resource|data)\s+"([^"]+)"\s+"([^"]+)"\s*\{\s*$/;
const PROVIDER_HEADER_PATTERN = /^\s*provider\s+"[^"]+"\s*\{\s*$/;
const TOP_LEVEL_BLOCK_PATTERN = /^\s*([A-Za-z_][A-Za-z0-9_-]*)\b.*\{\s*$/;
const NESTED_BLOCK_PATTERN = /^\s*([A-Za-z_][A-Za-z0-9_-]*)\s*\{\s*$/;
const ATTRIBUTE_PATTERN = /^\s*([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*(.*)$/;
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const REFERENCE_PATTERN =
  /^(?:var|local|each|count|path|terraform)\.[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*$|^module\.[A-Za-z0-9_]+\.[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$|^aws_[A-Za-z0-9_]+\.[A-Za-z0-9_]+\.[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$|^data\.aws_[A-Za-z0-9_]+\.[A-Za-z0-9_]+\.[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$/;
type ParsedBlock = {
  blockType: TerraformBlockType;
  resourceType: string;
  resourceName: string;
  address: string;
  identity: TerraformBlockIdentity;
  line: number;
  sourceFileName: string;
  values: Record<string, unknown>;
};

type ParseResult = {
  blocks: ParsedBlock[];
  diagnostics: TerraformDiagnostic[];
  ignoredTopLevelBlockCount: number;
};

type AreaSyncResult = {
  metadataByBlockKey: Map<string, DiagramNodeMetadata | undefined>;
  metadataByNodeId: Map<string, DiagramNodeMetadata | undefined>;
  proposals: TerraformDiagramChangeProposal[];
  valuesByAreaNodeId: Map<string, Record<string, unknown>>;
  valuesByBlockKey: Map<string, Record<string, unknown>>;
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

export function syncTerraformToDiagramJson(
  diagramJson: DiagramJson,
  input: TerraformSyncInput
): TerraformSyncToDiagramResponse {
  const parseResult = parseTerraformInput(input);

  if (parseResult.diagnostics.length > 0) {
    return {
      diagramJson,
      diagnostics: parseResult.diagnostics,
      proposals: []
    };
  }

  if (parseResult.blocks.length === 0 && parseResult.ignoredTopLevelBlockCount > 0) {
    return {
      diagramJson,
      diagnostics: [],
      proposals: []
    };
  }

  if (parseResult.blocks.length === 0 && parseResult.ignoredTopLevelBlockCount === 0) {
    if (!isTerraformSyncInputBlank(input)) {
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
  }

  const nodeMapResult = createNodeIdentityMap(diagramJson.nodes);

  if (nodeMapResult.diagnostics.length > 0) {
    return {
      diagramJson,
      diagnostics: nodeMapResult.diagnostics,
      proposals: []
    };
  }

  const nodeByIdentityKey = nodeMapResult.nodeByIdentityKey;
  const blockByIdentityKey = new Map(
    parseResult.blocks.map((block) => [createTerraformBlockIdentityKey(block.identity), block])
  );
  const areaSync = createAreaSyncResult(diagramJson, parseResult, nodeByIdentityKey);
  const diagnostics: TerraformDiagnostic[] = [];
  const valuesByNodeId = new Map<string, Record<string, unknown>>();
  const terraformOnlyBlocks: ParsedBlock[] = [];

  for (const block of parseResult.blocks) {
    const node = nodeByIdentityKey.get(createTerraformBlockIdentityKey(block.identity));

    if (!node) {
      if (isProposalSupportedBlock(block.identity)) {
        terraformOnlyBlocks.push(block);
      } else {
        diagnostics.push({
          severity: "error",
          code: "terraform.sync.unsupported_resource",
          line: block.line,
          sourceFileName: block.sourceFileName,
          resourceAddress: block.address,
          message: `${block.address}는 Terraform 동기화 v1 지원 리소스가 아닙니다.`
        });
      }
      continue;
    }

    const blockKey = createTerraformBlockIdentityKey(block.identity);
    valuesByNodeId.set(node.id, areaSync.valuesByBlockKey.get(blockKey) ?? block.values);
  }

  if (diagnostics.length > 0) {
    return {
      diagramJson,
      diagnostics,
      proposals: []
    };
  }

  const diagramOnlyNodes = createDiagramOnlyNodes(diagramJson.nodes, blockByIdentityKey);
  const proposals = [
    ...areaSync.proposals,
    ...createChangeProposals(diagramOnlyNodes, terraformOnlyBlocks, areaSync)
  ];

  return {
    diagramJson: {
      ...diagramJson,
      nodes: diagramJson.nodes.map((node) => {
        const values = areaSync.valuesByAreaNodeId.get(node.id) ?? valuesByNodeId.get(node.id);
        const metadata = areaSync.metadataByNodeId.has(node.id)
          ? areaSync.metadataByNodeId.get(node.id)
          : node.metadata;

        if (!values && metadata === node.metadata) {
          return node;
        }

        return {
          ...node,
          ...(metadata ? { metadata } : { metadata: undefined }),
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
    diagnostics: [],
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

function createAreaSyncResult(
  diagramJson: DiagramJson,
  parseResult: ParseResult,
  nodeByIdentityKey: ReadonlyMap<string, DiagramNode>
): AreaSyncResult {
  const metadataByBlockKey = new Map<string, DiagramNodeMetadata | undefined>();
  const metadataByNodeId = new Map<string, DiagramNodeMetadata | undefined>();
  const valuesByAreaNodeId = new Map<string, Record<string, unknown>>();
  const valuesByBlockKey = new Map<string, Record<string, unknown>>();
  const proposals: TerraformDiagramChangeProposal[] = [];
  const usedNodeIds = new Set(diagramJson.nodes.map((node) => node.id));
  const usedResourceNamesByType = createUsedResourceNamesByType(diagramJson.nodes);
  const availabilityZoneNodes = diagramJson.nodes.filter(isAvailabilityZoneAreaNode);
  const deleteAreaNodeIds = new Set<string>();
  const usedAvailabilityZoneNodeIds = new Set<string>();
  const availabilityZoneNodeIdByCode = new Map<AwsAvailabilityZoneCode, string>();

  for (const availabilityZoneNode of availabilityZoneNodes) {
    const availabilityZone = getNodeAvailabilityZone(availabilityZoneNode);

    if (availabilityZone) {
      availabilityZoneNodeIdByCode.set(availabilityZone, availabilityZoneNode.id);
    }
  }

  for (const block of parseResult.blocks) {
    if (!AWS_AVAILABILITY_ZONE_AWARE_RESOURCE_TYPES.has(block.resourceType)) {
      continue;
    }

    const blockKey = createTerraformBlockIdentityKey(block.identity);
    const node = nodeByIdentityKey.get(blockKey);
    const availabilityZone = getBlockAvailabilityZone(block);

    if (!availabilityZone) {
      if (
        node &&
        isAvailabilityZoneAreaNodeId(node.metadata?.parentAreaNodeId, diagramJson.nodes)
      ) {
        metadataByNodeId.set(node.id, omitParentAreaNodeId(node.metadata));
      }
      continue;
    }

    valuesByBlockKey.set(blockKey, omitAvailabilityZoneValues(block.values));

    const existingParentAvailabilityZoneNode = findAvailabilityZoneAreaNodeById(
      node?.metadata?.parentAreaNodeId,
      diagramJson.nodes
    );
    let availabilityZoneNodeId =
      existingParentAvailabilityZoneNode?.id ?? availabilityZoneNodeIdByCode.get(availabilityZone);

    if (availabilityZoneNodeId) {
      usedAvailabilityZoneNodeIds.add(availabilityZoneNodeId);
      const areaNode = diagramJson.nodes.find(
        (candidate) => candidate.id === availabilityZoneNodeId
      );

      if (areaNode?.parameters) {
        valuesByAreaNodeId.set(availabilityZoneNodeId, {
          ...areaNode.parameters.values,
          awsAvailabilityZone: availabilityZone
        });
      }
    } else {
      availabilityZoneNodeId = createUniqueNodeId(
        usedNodeIds,
        `terraform-aws-availability-zone-${availabilityZone}`
      );
      availabilityZoneNodeIdByCode.set(availabilityZone, availabilityZoneNodeId);
      usedAvailabilityZoneNodeIds.add(availabilityZoneNodeId);
      proposals.push(
        createAreaCreateProposal({
          nodeId: availabilityZoneNodeId,
          resourceName: createUniqueResourceName(
            getOrCreateResourceNameSet(
              usedResourceNamesByType,
              AWS_AVAILABILITY_ZONE_RESOURCE_TYPE
            ),
            "availability_zone"
          ),
          resourceType: AWS_AVAILABILITY_ZONE_RESOURCE_TYPE,
          values: {
            awsAvailabilityZone: availabilityZone
          }
        })
      );
    }

    if (node) {
      metadataByNodeId.set(node.id, {
        ...node.metadata,
        parentAreaNodeId: availabilityZoneNodeId
      });
    } else {
      metadataByBlockKey.set(blockKey, {
        parentAreaNodeId: availabilityZoneNodeId
      });
    }
  }

  for (const availabilityZoneNode of availabilityZoneNodes) {
    if (!usedAvailabilityZoneNodeIds.has(availabilityZoneNode.id)) {
      addAreaDeleteProposal(proposals, availabilityZoneNode, deleteAreaNodeIds);
    }
  }

  for (const node of diagramJson.nodes) {
    const parentAreaNodeId = node.metadata?.parentAreaNodeId;

    if (!parentAreaNodeId || !deleteAreaNodeIds.has(parentAreaNodeId)) {
      continue;
    }

    metadataByNodeId.set(node.id, omitParentAreaNodeId(node.metadata));
  }

  return {
    metadataByBlockKey,
    metadataByNodeId,
    proposals,
    valuesByAreaNodeId,
    valuesByBlockKey
  };
}

function createAreaCreateProposal({
  metadata,
  nodeId,
  resourceName,
  resourceType,
  values
}: {
  metadata?: DiagramNodeMetadata | undefined;
  nodeId: string;
  resourceName: string;
  resourceType: string;
  values: Record<string, unknown>;
}): TerraformDiagramChangeProposal {
  return {
    kind: "create_candidate",
    identity: {
      terraformBlockType: DEFAULT_TERRAFORM_BLOCK_TYPE,
      resourceType,
      resourceName
    },
    ...(metadata ? { metadata } : {}),
    nodeId,
    parameters: {
      resourceType,
      resourceName,
      fileName: "main.tf",
      values
    }
  };
}

function addAreaDeleteProposal(
  proposals: TerraformDiagramChangeProposal[],
  node: DiagramNode,
  deleteAreaNodeIds: Set<string>
): void {
  if (!node.parameters) {
    return;
  }

  const identity = toNodeIdentity(node);
  deleteAreaNodeIds.add(node.id);
  proposals.push({
    kind: "delete_candidate",
    identity,
    nodeId: node.id,
    resourceAddress: createTerraformBlockAddress(identity)
  });
}

function isAvailabilityZoneAreaNode(node: DiagramNode): boolean {
  return (
    node.kind === "resource" && getResourceNodeType(node) === AWS_AVAILABILITY_ZONE_RESOURCE_TYPE
  );
}

function findAvailabilityZoneAreaNodeById(
  nodeId: string | undefined,
  nodes: readonly DiagramNode[]
): DiagramNode | undefined {
  return nodes.find((node) => node.id === nodeId && isAvailabilityZoneAreaNode(node));
}

function isAvailabilityZoneAreaNodeId(
  nodeId: string | undefined,
  nodes: readonly DiagramNode[]
): boolean {
  return findAvailabilityZoneAreaNodeById(nodeId, nodes) !== undefined;
}

function getNodeAvailabilityZone(node: DiagramNode): AwsAvailabilityZoneCode | null {
  const value =
    node.parameters?.values.awsAvailabilityZone ?? node.parameters?.values.availabilityZone;

  return isAwsAvailabilityZoneCode(value) ? value : null;
}

function getBlockAvailabilityZone(block: ParsedBlock): AwsAvailabilityZoneCode | null {
  if (!AWS_AVAILABILITY_ZONE_AWARE_RESOURCE_TYPES.has(block.resourceType)) {
    return null;
  }

  const value = block.values.availabilityZone ?? block.values.availability_zone;

  return isAwsAvailabilityZoneCode(value) ? value : null;
}

function omitAvailabilityZoneValues(values: Record<string, unknown>): Record<string, unknown> {
  const {
    availabilityZone: _availabilityZone,
    availability_zone: _availability_zone,
    ...nextValues
  } = values;

  return nextValues;
}

function omitParentAreaNodeId(
  metadata: DiagramNodeMetadata | undefined
): DiagramNodeMetadata | undefined {
  if (!metadata?.parentAreaNodeId) {
    return metadata;
  }

  const { parentAreaNodeId: _parentAreaNodeId, ...nextMetadata } = metadata;

  return Object.keys(nextMetadata).length > 0 ? nextMetadata : undefined;
}

function createUniqueNodeId(usedNodeIds: Set<string>, baseId: string): string {
  let candidate = baseId;
  let suffix = 2;

  while (usedNodeIds.has(candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }

  usedNodeIds.add(candidate);
  return candidate;
}

function createUsedResourceNamesByType(nodes: readonly DiagramNode[]): Map<string, Set<string>> {
  const resourceNamesByType = new Map<string, Set<string>>();

  for (const node of nodes) {
    const resourceType = node.parameters?.resourceType;
    const resourceName = node.parameters?.resourceName;

    if (!resourceType || !resourceName) {
      continue;
    }

    getOrCreateResourceNameSet(resourceNamesByType, resourceType).add(resourceName);
  }

  return resourceNamesByType;
}

function getOrCreateResourceNameSet(
  resourceNamesByType: Map<string, Set<string>>,
  resourceType: string
): Set<string> {
  const existingSet = resourceNamesByType.get(resourceType);

  if (existingSet) {
    return existingSet;
  }

  const nextSet = new Set<string>();
  resourceNamesByType.set(resourceType, nextSet);
  return nextSet;
}

function createUniqueResourceName(usedNames: Set<string>, baseName: string): string {
  let candidate = baseName;
  let suffix = 2;

  while (usedNames.has(candidate)) {
    candidate = `${baseName}_${suffix}`;
    suffix += 1;
  }

  usedNames.add(candidate);
  return candidate;
}

function getResourceNodeType(node: DiagramNode): string {
  return node.parameters?.resourceType ?? node.type;
}

function isAwsAvailabilityZoneCode(value: unknown): value is AwsAvailabilityZoneCode {
  return typeof value === "string" && AWS_AVAILABILITY_ZONE_PATTERN.test(value);
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
  areaSync: AreaSyncResult
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

  for (const block of terraformOnlyBlocks) {
    if (usedTerraformBlockKeys.has(createTerraformBlockIdentityKey(block.identity))) {
      continue;
    }

    proposals.push({
      kind: "create_candidate",
      identity: block.identity,
      sourceFileName: block.sourceFileName,
      line: block.line,
      ...(areaSync.metadataByBlockKey.get(createTerraformBlockIdentityKey(block.identity))
        ? {
            metadata: areaSync.metadataByBlockKey.get(
              createTerraformBlockIdentityKey(block.identity)
            )
          }
        : {}),
      parameters: toDiagramNodeParameters({
        ...block,
        values:
          areaSync.valuesByBlockKey.get(createTerraformBlockIdentityKey(block.identity)) ??
          block.values
      })
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
    ...(block.blockType !== DEFAULT_TERRAFORM_BLOCK_TYPE
      ? { terraformBlockType: block.blockType }
      : {}),
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
    typeof input === "string" ||
    input.terraformFiles === undefined ||
    input.terraformFiles.length === 0
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
  let ignoredTopLevelBlockCount = 0;

  for (const file of files) {
    const parseResult = parseTerraformBlocks(file.fileName, file.terraformCode);
    ignoredTopLevelBlockCount += parseResult.ignoredTopLevelBlockCount;

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
  }

  return { blocks, diagnostics, ignoredTopLevelBlockCount };
}

function isTerraformSyncInputBlank(input: TerraformSyncInput): boolean {
  const files =
    typeof input === "string" ||
    input.terraformFiles === undefined ||
    input.terraformFiles.length === 0
      ? [typeof input === "string" ? input : input.terraformCode]
      : input.terraformFiles.map((file) => file.terraformCode);

  return files.every((terraformCode) => terraformCode.trim().length === 0);
}

function parseTerraformBlocks(sourceFileName: string, terraformCode: string): ParseResult {
  const lines = splitTerraformLines(terraformCode);
  const blocks: ParsedBlock[] = [];
  const diagnostics: TerraformDiagnostic[] = [];
  let ignoredTopLevelBlockCount = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const lineText = lines[index] ?? "";
    const codeLine = stripLineComment(lineText);
    const trimmedLine = codeLine.trim();

    if (!trimmedLine) {
      continue;
    }

    const providerHeaderMatch = PROVIDER_HEADER_PATTERN.exec(codeLine);

    if (providerHeaderMatch) {
      const headerLineNumber = index + 1;
      const bodyResult = collectBlockBody(lines, index + 1, headerLineNumber, "provider");
      diagnostics.push(...bodyResult.diagnostics);

      if (!bodyResult.closed) {
        index = lines.length;
        continue;
      }

      ignoredTopLevelBlockCount += 1;
      index = bodyResult.endIndex;
      continue;
    }

    const headerMatch = BLOCK_HEADER_PATTERN.exec(codeLine);

    if (!headerMatch) {
      const topLevelBlockMatch = TOP_LEVEL_BLOCK_PATTERN.exec(codeLine);

      diagnostics.push({
        severity: "error",
        code:
          topLevelBlockMatch &&
          topLevelBlockMatch[1] !== "resource" &&
          topLevelBlockMatch[1] !== "data"
            ? "terraform.sync.unsupported_block"
            : "terraform.sync.block_header",
        line: index + 1,
        message: 'block header는 resource/data "type" "name" { 형식이어야 합니다.'
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
        message: 'block header는 resource/data "type" "name" { 형식이어야 합니다.'
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

    const valuesResult = parseAttributes(bodyResult.bodyLines, address, resourceType);
    diagnostics.push(...valuesResult.diagnostics);

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

  return { blocks, diagnostics, ignoredTopLevelBlockCount };
}

function splitTerraformLines(terraformCode: string): string[] {
  return terraformCode.split(/\r?\n/);
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
  allowNestedBlocks = false
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

      if (!allowNestedBlocks && !isSupportedNestedBlock(resourceType, nestedBlockName)) {
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

      const nestedValues = parseAttributes(nestedBlock.bodyLines, resourceAddress, undefined, true);
      diagnostics.push(...nestedValues.diagnostics);
      appendNestedBlockValue(values, nestedBlockName, nestedValues.values);
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
    const parsedValue = parseAttributeValue(valueText, bodyLine.line, resourceAddress);

    if (parsedValue.diagnostic) {
      diagnostics.push(parsedValue.diagnostic);
      continue;
    }

    values[toCamelCase(terraformName)] = parsedValue.value;
  }

  return { values, diagnostics };
}

function isSupportedNestedBlock(
  resourceType: string | undefined,
  nestedBlockName: string
): boolean {
  return (
    resourceType !== undefined && isTerraformNestedBlockAttribute(resourceType, nestedBlockName)
  );
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
  nestedValue: Record<string, unknown>
): void {
  const name = toCamelCase(terraformName);
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
  resourceAddress: string
): { value?: unknown; diagnostic?: TerraformDiagnostic } {
  const parser = new HclValueParser(valueText);
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

  constructor(private readonly source: string) {}

  parseValue(): ValueParseResult {
    this.skipWhitespace();
    const char = this.peek();

    if (!char) {
      return { status: "invalid" };
    }

    if (char === '"') {
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

      if (char === '"') {
        this.index += 1;
        const rawString = this.source.slice(start, this.index);

        if (rawString.includes("${")) {
          return { status: "unsupported" };
        }

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

    if (this.peek() === '"') {
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

    if (REFERENCE_PATTERN.test(literal)) {
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

    if (char === '"') {
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

    if (char === '"') {
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
