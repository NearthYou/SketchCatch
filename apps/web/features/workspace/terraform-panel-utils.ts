import type { DiagramNode, TerraformDiagnostic } from "@sketchcatch/types";
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

export function toDiagramFingerprint(value: unknown): string {
  return JSON.stringify(value);
}

export function createTerraformFilesFromGeneratedCode(
  diagramJson: DiagramEditorPanelContext["diagram"],
  generatedCode: string
): TerraformVirtualFile[] {
  const fileNames = getTerraformFileOptions(diagramJson, []);
  const codeByFileName = new Map(fileNames.map((fileName) => [fileName, ""]));
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

  return Array.from(codeByFileName.entries()).map(([fileName, code]) => ({
    code,
    fileName
  }));
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
  const leftStandardIndex = TERRAFORM_STANDARD_FILE_NAMES.indexOf(left as (typeof TERRAFORM_STANDARD_FILE_NAMES)[number]);
  const rightStandardIndex = TERRAFORM_STANDARD_FILE_NAMES.indexOf(right as (typeof TERRAFORM_STANDARD_FILE_NAMES)[number]);

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
  const address = toNodeTerraformAddress(node);
  const fileName = toNodeTerraformFileName(node);

  if (!address || !fileName) {
    return null;
  }

  return (
    blocks.find((block) => block.address === address && block.fileName === fileName) ??
    blocks.find((block) => block.address === address) ??
    null
  );
}

function toNodeTerraformAddress(node: DiagramNode | null): string | null {
  const parameters = node?.parameters;
  const resourceType = parameters?.resourceType?.trim();
  const resourceName = parameters?.resourceName?.trim();
  const blockType = parameters?.terraformBlockType === "data" ? "data" : "resource";

  if (!resourceType || !resourceName) {
    return null;
  }

  return toTerraformBlockAddress(blockType, resourceType, resourceName);
}

function toNodeTerraformFileName(node: DiagramNode | null): string | null {
  if (!node?.parameters) {
    return null;
  }

  return normalizeTerraformFileName(node.parameters.fileName);
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
      address: toTerraformBlockAddress(blockType, terraformType, name),
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

function toTerraformBlockAddress(blockType: "resource" | "data", terraformType: string, name: string): string {
  return blockType === "data" ? `data.${terraformType}.${name}` : `${terraformType}.${name}`;
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
  const location = diagnostic.line ? `line ${diagnostic.line}` : "Terraform";
  const resource = diagnostic.resourceAddress ? ` | ${diagnostic.resourceAddress}` : "";
  return `${diagnostic.severity.toUpperCase()} | ${location}${resource}`;
}
