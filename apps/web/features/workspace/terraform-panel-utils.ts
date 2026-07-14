import {
  createTerraformProviderFiles,
  isTerraformDeployableNode,
  type DiagramJson,
  type DiagramNode,
  type DiagramNodeParameters,
  type TerraformDiagnostic
} from "@sketchcatch/types";
import type { DiagramEditorPanelContext } from "../diagram-editor";

export type TerraformSaveBanner =
  | {
      readonly kind: "dirty";
    }
  | {
      readonly kind: "error";
      readonly line?: number | undefined;
      readonly message: string;
    };

export type TerraformVirtualFile = {
  readonly code: string;
  readonly fileName: string;
};

const TERRAFORM_STANDARD_FILE_NAMES = ["main.tf"] as const;
const TERRAFORM_FILE_SORT_ORDER = ["providers.tf", "main.tf"] as const;

export function toDiagramFingerprint(value: unknown): string {
  return JSON.stringify(value);
}

export function toTerraformRefreshFingerprint(diagramJson: DiagramJson): string {
  return toDiagramContentFingerprint(diagramJson);
}

export type TerraformDiagramRequestToken = {
  readonly fingerprint: string;
  readonly revision: number;
};

export type TerraformDiagramRequestGuard = {
  capture: () => TerraformDiagramRequestToken;
  isCurrent: (token: TerraformDiagramRequestToken) => boolean;
  update: (fingerprint: string) => void;
};

// The revision invalidates every committed Diagram snapshot, including geometry-only edits and
// D1 -> D2 -> Undo(D1), while the fingerprint records which Terraform semantics were requested.
export function createTerraformDiagramRequestGuard(
  initialFingerprint: string
): TerraformDiagramRequestGuard {
  let fingerprint = initialFingerprint;
  let revision = 0;

  return {
    capture: () => ({ fingerprint, revision }),
    isCurrent: (token) => token.fingerprint === fingerprint && token.revision === revision,
    update: (nextFingerprint) => {
      fingerprint = nextFingerprint;
      revision += 1;
    }
  };
}

export function markTerraformSourceAuthoritative(diagramJson: DiagramJson): DiagramJson {
  return {
    ...diagramJson,
    presentation: {
      ...(diagramJson.presentation ?? { geometryPolicy: "catalog-normalized" }),
      terraformSourceFingerprint: toTerraformRefreshFingerprint(diagramJson)
    }
  };
}

export function clearTerraformSourceAuthority(diagramJson: DiagramJson): DiagramJson {
  if (!diagramJson.presentation?.terraformSourceFingerprint) {
    return diagramJson;
  }

  const { terraformSourceFingerprint: _terraformSourceFingerprint, ...presentation } =
    diagramJson.presentation;

  return {
    ...diagramJson,
    presentation
  };
}

export function hasAuthoritativeTerraformSource(diagramJson: DiagramJson): boolean {
  return (
    diagramJson.presentation?.terraformSourceFingerprint ===
    toTerraformRefreshFingerprint(diagramJson)
  );
}

export function toDeploymentBaselineFingerprint(diagramJson: DiagramJson): string {
  return toDiagramContentFingerprint(diagramJson);
}

// Deployment state follows Terraform semantics, not Board geometry or Design presentation layers.
function toDiagramContentFingerprint(diagramJson: DiagramJson): string {
  const deployableNodes = diagramJson.nodes.filter(isTerraformDeployableNode);
  const deployableNodeIds = new Set(deployableNodes.map((node) => node.id));
  const nodeById = new Map(diagramJson.nodes.map((node) => [node.id, node]));

  return stableJsonStringify({
    nodes: deployableNodes.map((node) => {
      const inheritedAvailabilityZone = getInheritedAvailabilityZoneFingerprint(node, nodeById);

      return {
        id: node.id,
        parameters: toTerraformFingerprintParameters(node.parameters),
        ...(inheritedAvailabilityZone !== undefined ? { inheritedAvailabilityZone } : {})
      };
    }),
    edges: diagramJson.edges
      .filter(
        (edge) =>
          deployableNodeIds.has(edge.sourceNodeId) && deployableNodeIds.has(edge.targetNodeId)
      )
      .map((edge) => ({
        id: edge.id,
        sourceNodeId: edge.sourceNodeId,
        targetNodeId: edge.targetNodeId,
        ...(edge.label !== undefined ? { label: edge.label } : {})
      }))
  });
}

function stableJsonStringify(value: unknown): string {
  return JSON.stringify(sortJsonObjectKeys(value));
}

function sortJsonObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonObjectKeys);
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([leftKey], [rightKey]) => (leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0))
      .map(([key, nestedValue]) => [key, sortJsonObjectKeys(nestedValue)])
  );
}

// Fingerprints omit diagram-only values that the Terraform graph renderer deliberately drops.
function toTerraformFingerprintParameters(
  parameters: DiagramNodeParameters
): DiagramNodeParameters {
  return {
    ...parameters,
    values: Object.fromEntries(
      Object.entries(parameters.values ?? {}).filter(([key]) => !/^diagram(?:_|[A-Z])/.test(key))
    )
  };
}

// Subnet and EBS fingerprints retain the Design AZ context that changes generated Terraform.
function getInheritedAvailabilityZoneFingerprint(
  node: DiagramNode & { readonly parameters: DiagramNodeParameters },
  nodeById: ReadonlyMap<string, DiagramNode>
): string | undefined {
  const resourceType = node.parameters.resourceType;

  if (resourceType !== "aws_subnet" && resourceType !== "aws_ebs_volume") {
    return undefined;
  }

  const ownAvailabilityZone = node.parameters.values?.["availabilityZone"];

  if (
    ownAvailabilityZone !== undefined &&
    ownAvailabilityZone !== null &&
    ownAvailabilityZone !== ""
  ) {
    return undefined;
  }

  const parentNode = node.metadata?.parentAreaNodeId
    ? nodeById.get(node.metadata.parentAreaNodeId)
    : undefined;
  const parentResourceType = parentNode?.parameters?.resourceType ?? parentNode?.type;
  const inheritedAvailabilityZone = parentNode?.parameters?.values?.["awsAvailabilityZone"];

  return parentResourceType === "aws_availability_zone" &&
    typeof inheritedAvailabilityZone === "string" &&
    inheritedAvailabilityZone.trim().length > 0
    ? inheritedAvailabilityZone
    : undefined;
}

export function createTerraformFilesFromGeneratedCode(
  diagramJson: DiagramEditorPanelContext["diagram"],
  generatedCode: string
): TerraformVirtualFile[] {
  const fileNames = getTerraformFileOptions(diagramJson, []);
  const codeByFileName = new Map(fileNames.map((fileName) => [fileName, ""]));
  for (const providerFile of createTerraformProviderFiles(diagramJson)) {
    codeByFileName.set(providerFile.fileName, providerFile.terraformCode.trim());
  }
  const nodeFileByAddress = new Map(
    diagramJson.nodes
      .map(
        (node) =>
          [
            toNodeTerraformAddress(node),
            normalizeTerraformFileName(node.parameters?.fileName)
          ] as const
      )
      .filter((entry): entry is readonly [string, string] => Boolean(entry[0]))
  );
  const generatedBlocks = parseTerraformBlocks("main.tf", generatedCode);
  const generatedOutputBlocks = parseTerraformOutputBlocks(generatedCode);

  for (const block of generatedBlocks) {
    const fileName = nodeFileByAddress.get(block.address) ?? "main.tf";
    const currentCode = codeByFileName.get(fileName) ?? "";
    codeByFileName.set(fileName, appendTerraformBlock(currentCode, block.code));
  }

  for (const block of generatedOutputBlocks) {
    const currentCode = codeByFileName.get("main.tf") ?? "";
    codeByFileName.set("main.tf", appendTerraformBlock(currentCode, block.code));
  }

  if (generatedBlocks.length === 0 && generatedOutputBlocks.length === 0 && generatedCode.trim()) {
    codeByFileName.set("main.tf", generatedCode.trim());
  }

  return Array.from(codeByFileName.entries())
    .sort(([leftFileName], [rightFileName]) =>
      compareTerraformFileNames(leftFileName, rightFileName)
    )
    .map(([fileName, code]) => ({
      code,
      fileName
    }));
}

export function mergeGeneratedTerraformFiles(
  existingFiles: readonly TerraformVirtualFile[],
  generatedFiles: readonly TerraformVirtualFile[],
  preservedResourceAddresses: ReadonlySet<string>
): TerraformVirtualFile[] {
  const generatedAddresses = new Set(
    generatedFiles.flatMap((file) =>
      parseTerraformBlocks(file.fileName, file.code).map((block) => block.address)
    )
  );
  const staleManagedAddresses = parseTerraformFiles(existingFiles)
    .map((block) => block.address)
    .filter(
      (address) => !generatedAddresses.has(address) && !preservedResourceAddresses.has(address)
    );
  const nextFiles = removeTerraformBlocksByAddress(existingFiles, staleManagedAddresses).map(
    (file) => ({ ...file })
  );

  upsertGeneratedTerraformOutputs(nextFiles, generatedFiles);

  for (const generatedFile of generatedFiles) {
    const generatedBlocks = parseTerraformBlocks(generatedFile.fileName, generatedFile.code);

    if (generatedBlocks.length === 0) {
      if (!nextFiles.some((file) => file.fileName === generatedFile.fileName)) {
        nextFiles.push({ ...generatedFile });
      }
      continue;
    }

    for (const generatedBlock of generatedBlocks) {
      if (preservedResourceAddresses.has(generatedBlock.address)) {
        continue;
      }

      let replaced = false;
      for (let fileIndex = 0; fileIndex < nextFiles.length; fileIndex += 1) {
        const file = nextFiles[fileIndex];
        if (!file) continue;
        const existingBlock = parseTerraformBlocks(file.fileName, file.code).find(
          (block) => block.address === generatedBlock.address
        );
        if (!existingBlock) continue;

        nextFiles[fileIndex] = {
          ...file,
          code: `${file.code.slice(0, existingBlock.startOffset)}${generatedBlock.code}${file.code.slice(existingBlock.endOffset)}`
        };
        replaced = true;
        break;
      }

      if (!replaced) {
        const targetIndex = nextFiles.findIndex((file) => file.fileName === generatedFile.fileName);
        if (targetIndex === -1) {
          nextFiles.push({ fileName: generatedFile.fileName, code: generatedBlock.code });
        } else {
          const target = nextFiles[targetIndex]!;
          nextFiles[targetIndex] = {
            ...target,
            code: appendTerraformBlock(target.code, generatedBlock.code)
          };
        }
      }
    }
  }

  return nextFiles.sort((left, right) => compareTerraformFileNames(left.fileName, right.fileName));
}

export function createTerraformFilesForRefresh({
  baselineFiles,
  currentFiles,
  generatedFiles,
  preserveExistingSource,
  preservedResourceAddresses
}: {
  readonly baselineFiles: readonly TerraformVirtualFile[];
  readonly currentFiles: readonly TerraformVirtualFile[];
  readonly generatedFiles: readonly TerraformVirtualFile[];
  readonly preserveExistingSource: boolean;
  readonly preservedResourceAddresses: ReadonlySet<string>;
}): TerraformVirtualFile[] {
  if (!preserveExistingSource && preservedResourceAddresses.size === 0) {
    return generatedFiles.map((file) => ({ ...file }));
  }

  return mergeGeneratedTerraformFiles(
    preserveExistingSource ? currentFiles : baselineFiles,
    generatedFiles,
    preservedResourceAddresses
  );
}

function upsertGeneratedTerraformOutputs(
  files: TerraformVirtualFile[],
  generatedFiles: readonly TerraformVirtualFile[]
): void {
  const generatedOutputs = generatedFiles.flatMap((file) => parseTerraformOutputBlocks(file.code));

  for (const generatedOutput of generatedOutputs) {
    let replaced = false;

    for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
      const file = files[fileIndex];
      if (!file) continue;
      const existingOutput = parseTerraformOutputBlocks(file.code).find(
        (block) => block.name === generatedOutput.name
      );
      if (!existingOutput) continue;

      files[fileIndex] = {
        ...file,
        code: `${file.code.slice(0, existingOutput.startOffset)}${generatedOutput.code}${file.code.slice(existingOutput.endOffset)}`
      };
      replaced = true;
      break;
    }

    if (replaced) continue;

    const mainFileIndex = files.findIndex((file) => file.fileName === "main.tf");
    if (mainFileIndex === -1) {
      files.push({ fileName: "main.tf", code: generatedOutput.code });
      continue;
    }

    const mainFile = files[mainFileIndex]!;
    files[mainFileIndex] = {
      ...mainFile,
      code: appendTerraformBlock(mainFile.code, generatedOutput.code)
    };
  }
}

export function getTerraformAddressesRemovedFromDiagram(
  previousAddresses: ReadonlySet<string>,
  currentAddresses: ReadonlySet<string>,
  preservedResourceAddresses: ReadonlySet<string>
): string[] {
  return Array.from(previousAddresses).filter(
    (address) => !currentAddresses.has(address) && !preservedResourceAddresses.has(address)
  );
}

export function getDiagramTerraformAddresses(
  diagramJson: DiagramEditorPanelContext["diagram"]
): Set<string> {
  const addresses = new Set<string>();

  for (const node of diagramJson.nodes) {
    const address = toNodeTerraformAddress(node);

    if (address) {
      addresses.add(address);
    }
  }

  return addresses;
}

export function getSourceAuthoritativeTerraformAddresses(
  diagramJson: DiagramEditorPanelContext["diagram"]
): Set<string> {
  const addresses = new Set<string>();

  for (const node of diagramJson.nodes) {
    if (node.parameters?.terraformSourceAuthority !== "workspace-seed") {
      continue;
    }

    const address = toNodeTerraformAddress(node);
    if (address) {
      addresses.add(address);
    }
  }

  return addresses;
}

export function getEffectivePreservedTerraformAddresses(
  diagramJson: DiagramEditorPanelContext["diagram"],
  classifiedAddresses: ReadonlySet<string>
): Set<string> {
  return new Set([
    ...classifiedAddresses,
    ...getSourceAuthoritativeTerraformAddresses(diagramJson)
  ]);
}

export function getTerraformFileOptions(
  diagramJson: DiagramEditorPanelContext["diagram"],
  files: readonly TerraformVirtualFile[]
): string[] {
  const fileNames = new Set<string>(TERRAFORM_STANDARD_FILE_NAMES);

  for (const node of diagramJson.nodes) {
    fileNames.add(normalizeTerraformFileName(node.parameters?.fileName));
  }

  for (const file of files) {
    fileNames.add(normalizeTerraformFileName(file.fileName));
  }

  return Array.from(fileNames).sort(compareTerraformFileNames);
}

export function compareTerraformFileNames(left: string, right: string): number {
  const leftStandardIndex = TERRAFORM_FILE_SORT_ORDER.indexOf(
    left as (typeof TERRAFORM_FILE_SORT_ORDER)[number]
  );
  const rightStandardIndex = TERRAFORM_FILE_SORT_ORDER.indexOf(
    right as (typeof TERRAFORM_FILE_SORT_ORDER)[number]
  );

  if (leftStandardIndex !== -1 || rightStandardIndex !== -1) {
    if (leftStandardIndex === -1) {
      return 1;
    }

    if (rightStandardIndex === -1) {
      return -1;
    }

    return leftStandardIndex - rightStandardIndex;
  }

  return left.localeCompare(right);
}

function normalizeTerraformFileName(fileName: string | undefined): string {
  const trimmedFileName = fileName?.trim();

  if (!trimmedFileName) {
    return "main.tf";
  }

  if (trimmedFileName.endsWith(".tf") || trimmedFileName.endsWith(".tfvars")) {
    return trimmedFileName;
  }

  return `${trimmedFileName}.tf`;
}

function appendTerraformBlock(currentCode: string, blockCode: string): string {
  const trimmedBlock = blockCode.trim();

  if (!currentCode.trim()) {
    return trimmedBlock;
  }

  return `${currentCode.trimEnd()}\n\n${trimmedBlock}`;
}

function normalizeTerraformCodeAfterBlockRemoval(terraformCode: string): string {
  return terraformCode.replace(/(?:\r?\n){3,}/g, "\n\n").trim();
}

export function getTerraformFileCode(
  files: readonly TerraformVirtualFile[],
  fileName: string
): string {
  return files.find((file) => file.fileName === fileName)?.code ?? "";
}

export function combineTerraformFiles(files: readonly TerraformVirtualFile[]): string {
  return files
    .map((file) => file.code.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function parseTerraformFiles(
  files: readonly TerraformVirtualFile[]
): TerraformBlockLocation[] {
  return files.flatMap((file) => parseTerraformBlocks(file.fileName, file.code));
}

export function removeTerraformBlocksByAddress(
  files: readonly TerraformVirtualFile[],
  addresses: Iterable<string>
): TerraformVirtualFile[] {
  const addressSet = new Set(addresses);

  if (addressSet.size === 0) {
    return [...files];
  }

  let didRemoveBlock = false;

  const nextFiles = files.map((file) => {
    const removableBlocks = parseTerraformBlocks(file.fileName, file.code)
      .filter((block) => addressSet.has(block.address))
      .sort((left, right) => right.startOffset - left.startOffset);

    if (removableBlocks.length === 0) {
      return file;
    }

    didRemoveBlock = true;
    let nextCode = file.code;

    for (const block of removableBlocks) {
      let removeEndOffset = block.endOffset;

      if (nextCode.slice(removeEndOffset, removeEndOffset + 2) === "\r\n") {
        removeEndOffset += 2;
      } else if (nextCode[removeEndOffset] === "\n") {
        removeEndOffset += 1;
      }

      nextCode = `${nextCode.slice(0, block.startOffset)}${nextCode.slice(removeEndOffset)}`;
    }

    return {
      ...file,
      code: normalizeTerraformCodeAfterBlockRemoval(nextCode)
    };
  });

  return didRemoveBlock ? nextFiles : [...files];
}

export type TerraformBlockLocation = {
  readonly address: string;
  readonly blockType: "resource" | "data";
  readonly code: string;
  readonly endLine: number;
  readonly endOffset: number;
  readonly fileName: string;
  readonly name: string;
  readonly startLine: number;
  readonly startOffset: number;
  readonly terraformType: string;
};

export function findTerraformBlockForNode(
  blocks: readonly TerraformBlockLocation[],
  node: DiagramNode | null
): TerraformBlockLocation | null {
  const candidateAddresses = getNodeTerraformAddressCandidates(node);

  if (candidateAddresses.length === 0) {
    return null;
  }

  for (const address of candidateAddresses) {
    const block = blocks.find((candidateBlock) => candidateBlock.address === address);

    if (block) {
      return block;
    }
  }

  return null;
}

function toNodeTerraformAddress(node: DiagramNode | null): string | null {
  const parameters = node?.parameters;
  const resourceType = parameters?.resourceType?.trim();
  const resourceName = parameters?.resourceName?.trim();
  const terraformBlockType = parameters?.terraformBlockType === "data" ? "data" : "resource";

  if (!resourceType || !resourceName) {
    return null;
  }

  return terraformBlockType === "data"
    ? `data.${resourceType}.${resourceName}`
    : `${resourceType}.${resourceName}`;
}

function getNodeTerraformAddressCandidates(node: DiagramNode | null): string[] {
  if (!node) {
    return [];
  }

  const parameterAddress = toNodeTerraformAddress(node);
  const displayAddress = toNodeDisplayTerraformAddress(node);
  const hasMatchingResourceType = node.parameters?.resourceType?.trim() === node.type.trim();
  const candidates =
    node.parameters?.terraformBlockType === "data" || hasMatchingResourceType
      ? [
          parameterAddress,
          displayAddress,
          toNodeTypeAndParameterNameTerraformAddress(node),
          toParameterTypeAndDisplayNameTerraformAddress(node)
        ]
      : [
          displayAddress,
          parameterAddress,
          toNodeTypeAndParameterNameTerraformAddress(node),
          toParameterTypeAndDisplayNameTerraformAddress(node)
        ];

  return Array.from(new Set(candidates.filter((address): address is string => Boolean(address))));
}

function toNodeDisplayTerraformAddress(node: DiagramNode): string | null {
  const resourceType = node.type.trim();
  const resourceName = toTerraformLocalName(node.label);

  if (!resourceType || !resourceName) {
    return null;
  }

  return `${resourceType}.${resourceName}`;
}

function toNodeTypeAndParameterNameTerraformAddress(node: DiagramNode): string | null {
  const resourceType = node.type.trim();
  const resourceName = node.parameters?.resourceName?.trim();

  if (!resourceType || !resourceName) {
    return null;
  }

  return `${resourceType}.${resourceName}`;
}

function toParameterTypeAndDisplayNameTerraformAddress(node: DiagramNode): string | null {
  const resourceType = node.parameters?.resourceType?.trim();
  const resourceName = toTerraformLocalName(node.label);

  if (!resourceType || !resourceName) {
    return null;
  }

  return `${resourceType}.${resourceName}`;
}

function toTerraformLocalName(label: string): string {
  return label
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseTerraformBlocks(fileName: string, terraformCode: string): TerraformBlockLocation[] {
  const blocks: TerraformBlockLocation[] = [];
  const rawLines = terraformCode.split("\n");
  const lines = rawLines.map((line) => line.replace(/\r$/, ""));
  const lineOffsets: number[] = [];
  let offset = 0;

  for (let index = 0; index < rawLines.length; index += 1) {
    lineOffsets.push(offset);
    offset += (rawLines[index] ?? "").length + 1;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const headerMatch = line.match(/^\s*(resource|data)\s+"([^"]+)"\s+"([^"]+)"\s*\{/);

    if (!headerMatch) {
      continue;
    }

    const startLine = index + 1;
    const startOffset = lineOffsets[index] ?? 0;
    let depth = countBraceDelta(line);
    let endIndex = index;
    let endOffset = startOffset + line.length;

    for (let scanIndex = index + 1; scanIndex < lines.length && depth > 0; scanIndex += 1) {
      const scanLine = lines[scanIndex] ?? "";
      depth += countBraceDelta(scanLine);
      endIndex = scanIndex;
      endOffset = (lineOffsets[scanIndex] ?? 0) + scanLine.length;
    }

    const blockType = headerMatch[1] as "resource" | "data";
    const terraformType = headerMatch[2] ?? "";
    const name = headerMatch[3] ?? "";

    blocks.push({
      address: blockType === "data" ? `data.${terraformType}.${name}` : `${terraformType}.${name}`,
      blockType,
      code: terraformCode.slice(startOffset, endOffset),
      endLine: endIndex + 1,
      endOffset,
      fileName,
      name,
      startLine,
      startOffset,
      terraformType
    });

    index = endIndex;
  }

  return blocks;
}

type TerraformOutputBlockLocation = {
  readonly code: string;
  readonly endOffset: number;
  readonly name: string;
  readonly startOffset: number;
};

function parseTerraformOutputBlocks(terraformCode: string): TerraformOutputBlockLocation[] {
  const blocks: TerraformOutputBlockLocation[] = [];
  const rawLines = terraformCode.split("\n");
  const lines = rawLines.map((line) => line.replace(/\r$/, ""));
  const lineOffsets: number[] = [];
  let offset = 0;

  for (const rawLine of rawLines) {
    lineOffsets.push(offset);
    offset += rawLine.length + 1;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const headerMatch = line.match(/^\s*output\s+"([^"]+)"\s*\{/);
    if (!headerMatch) continue;

    const startOffset = lineOffsets[index] ?? 0;
    let depth = countBraceDelta(line);
    let endIndex = index;
    let endOffset = startOffset + line.length;

    for (let scanIndex = index + 1; scanIndex < lines.length && depth > 0; scanIndex += 1) {
      const scanLine = lines[scanIndex] ?? "";
      depth += countBraceDelta(scanLine);
      endIndex = scanIndex;
      endOffset = (lineOffsets[scanIndex] ?? 0) + scanLine.length;
    }

    blocks.push({
      code: terraformCode.slice(startOffset, endOffset),
      endOffset,
      name: headerMatch[1] ?? "",
      startOffset
    });
    index = endIndex;
  }

  return blocks;
}

function countBraceDelta(line: string): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      continue;
    }

    if (character === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (character === "#") {
      break;
    }

    if (character === "/" && line[index + 1] === "/") {
      break;
    }

    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
    }
  }

  return depth;
}

export function formatTerraformDiagnosticTitle(diagnostic: TerraformDiagnostic): string {
  const location = diagnostic.line
    ? diagnostic.sourceFileName
      ? `${diagnostic.sourceFileName}:${diagnostic.line}`
      : `line ${diagnostic.line}`
    : "Terraform";
  const resource = diagnostic.resourceAddress ? ` | ${diagnostic.resourceAddress}` : "";
  return `${diagnostic.severity.toUpperCase()} | ${location}${resource}`;
}
