import {
  createTerraformProviderFiles,
  type DiagramJson,
  type DiagramNode,
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

export function toDeploymentBaselineFingerprint(diagramJson: DiagramJson): string {
  return toDiagramContentFingerprint(diagramJson);
}

function toDiagramContentFingerprint(diagramJson: DiagramJson): string {
  return JSON.stringify({
    nodes: diagramJson.nodes,
    edges: diagramJson.edges
  });
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
      .map((node) => [toNodeTerraformAddress(node), normalizeTerraformFileName(node.parameters?.fileName)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[0]))
  );
  const generatedBlocks = parseTerraformBlocks("main.tf", generatedCode);

  for (const block of generatedBlocks) {
    const fileName = nodeFileByAddress.get(block.address) ?? "main.tf";
    const currentCode = codeByFileName.get(fileName) ?? "";
    codeByFileName.set(fileName, appendTerraformBlock(currentCode, block.code));
  }

  if (generatedBlocks.length === 0 && generatedCode.trim()) {
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
    generatedFiles.flatMap((file) => parseTerraformBlocks(file.fileName, file.code).map((block) => block.address))
  );
  const staleManagedAddresses = parseTerraformFiles(existingFiles)
    .map((block) => block.address)
    .filter((address) =>
      !generatedAddresses.has(address) && !preservedResourceAddresses.has(address)
    );
  const nextFiles = removeTerraformBlocksByAddress(existingFiles, staleManagedAddresses)
    .map((file) => ({ ...file }));

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
        const existingBlock = parseTerraformBlocks(file.fileName, file.code)
          .find((block) => block.address === generatedBlock.address);
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
          nextFiles[targetIndex] = { ...target, code: appendTerraformBlock(target.code, generatedBlock.code) };
        }
      }
    }
  }

  return nextFiles.sort((left, right) => compareTerraformFileNames(left.fileName, right.fileName));
}

export function getTerraformAddressesRemovedFromDiagram(
  previousAddresses: ReadonlySet<string>,
  currentAddresses: ReadonlySet<string>,
  preservedResourceAddresses: ReadonlySet<string>
): string[] {
  return Array.from(previousAddresses).filter((address) =>
    !currentAddresses.has(address) && !preservedResourceAddresses.has(address)
  );
}

export function getDiagramTerraformAddresses(diagramJson: DiagramEditorPanelContext["diagram"]): Set<string> {
  const addresses = new Set<string>();

  for (const node of diagramJson.nodes) {
    const address = toNodeTerraformAddress(node);

    if (address) {
      addresses.add(address);
    }
  }

  return addresses;
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
  const leftStandardIndex = TERRAFORM_FILE_SORT_ORDER.indexOf(left as (typeof TERRAFORM_FILE_SORT_ORDER)[number]);
  const rightStandardIndex = TERRAFORM_FILE_SORT_ORDER.indexOf(right as (typeof TERRAFORM_FILE_SORT_ORDER)[number]);

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

export function getTerraformFileCode(files: readonly TerraformVirtualFile[], fileName: string): string {
  return files.find((file) => file.fileName === fileName)?.code ?? "";
}

export function combineTerraformFiles(files: readonly TerraformVirtualFile[]): string {
  return files
    .map((file) => file.code.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function parseTerraformFiles(files: readonly TerraformVirtualFile[]): TerraformBlockLocation[] {
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
  const hasMatchingResourceType =
    node.parameters?.resourceType?.trim() === node.type.trim();
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

    if (character === "\"") {
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
