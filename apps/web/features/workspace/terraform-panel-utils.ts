import {
  createTerraformProviderFiles,
  findTerraformRequiredProvidersBlockLocations,
  findTerraformRequiredProvidersDeclarations,
  isTerraformDeployableNode,
  type DiagramJson,
  type DiagramNode,
  type DiagramNodeParameters,
  type TerraformDiagnostic,
  type TerraformSyncFileInput
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
const TERRAFORM_MANAGED_REFERENCE_PATTERN =
  /\b(?:data\.(?:aws|kubernetes)_[A-Za-z0-9_]+\.[A-Za-z0-9_-]+|(?:aws|kubernetes)_[A-Za-z0-9_]+\.[A-Za-z0-9_-]+)(?:\.[A-Za-z0-9_-]+)*\b/g;

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

/** Keeps every supplied seed file; only a truly empty seed falls back to generated providers. */
export function createInitialTerraformFiles(
  diagramJson: DiagramEditorPanelContext["diagram"],
  initialFiles: readonly TerraformSyncFileInput[] | undefined
): TerraformVirtualFile[] {
  return initialFiles && initialFiles.length > 0
    ? initialFiles.map((file) => ({
        fileName: file.fileName,
        code: file.terraformCode
      }))
    : createTerraformFilesFromGeneratedCode(diagramJson, "");
}

export function mergeGeneratedTerraformFiles(
  existingFiles: readonly TerraformVirtualFile[],
  generatedFiles: readonly TerraformVirtualFile[],
  preservedResourceAddresses: ReadonlySet<string>
): TerraformVirtualFile[] {
  const existingRequiredProviders = findTerraformRequiredProvidersBlockLocations(
    existingFiles.map((file) => ({
      fileName: file.fileName,
      terraformCode: file.code
    }))
  );
  const [existingRequiredProvidersBlock] = existingRequiredProviders;
  const providerAwareExistingFiles = existingRequiredProvidersBlock
    ? mergeRequiredProviderEntries(
        existingFiles,
        generatedFiles,
        existingRequiredProvidersBlock
      )
    : existingFiles;
  const effectiveGeneratedFiles = existingRequiredProvidersBlock
    ? generatedFiles.flatMap((file) => {
        if (
          findTerraformRequiredProvidersDeclarations([
            { fileName: file.fileName, terraformCode: file.code }
          ]).length === 0
        ) {
          return [file];
        }

        const runtimeCode = removeGeneratedRequiredProvidersBlocks(file.code);

        return runtimeCode
          ? [{
              code: runtimeCode,
              fileName: existingRequiredProvidersBlock.fileName
            }]
          : [];
      })
    : generatedFiles;
  const generatedAddresses = new Set(
    effectiveGeneratedFiles.flatMap((file) =>
      parseTerraformBlocks(file.fileName, file.code).map((block) => block.address)
    )
  );
  const staleManagedAddresses = parseTerraformFiles(providerAwareExistingFiles)
    .map((block) => block.address)
    .filter(
      (address) => !generatedAddresses.has(address) && !preservedResourceAddresses.has(address)
    );
  const nextFiles = removeTerraformBlocksAndDependentOutputsByAddress(
    providerAwareExistingFiles,
    staleManagedAddresses
  ).map((file) => ({ ...file }));

  upsertGeneratedTerraformOutputs(nextFiles, effectiveGeneratedFiles);

  for (const generatedFile of effectiveGeneratedFiles) {
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

  upsertGeneratedProviderBlocks(nextFiles, effectiveGeneratedFiles);

  return removeTerraformOutputsWithUndeclaredManagedReferences(nextFiles).sort((left, right) =>
    compareTerraformFileNames(left.fileName, right.fileName)
  );
}

type TerraformRequiredProviderEntry = {
  readonly code: string;
  readonly name: string;
};

function mergeRequiredProviderEntries(
  existingFiles: readonly TerraformVirtualFile[],
  generatedFiles: readonly TerraformVirtualFile[],
  existingBlock: ReturnType<typeof findTerraformRequiredProvidersBlockLocations>[number]
): TerraformVirtualFile[] {
  const generatedEntries = generatedFiles.flatMap((file) =>
    findTerraformRequiredProvidersBlockLocations([
      { fileName: file.fileName, terraformCode: file.code }
    ]).flatMap((block) =>
      parseRequiredProviderEntries(file.code.slice(block.bodyStartOffset, block.bodyEndOffset))
    )
  );
  const existingFileIndex = existingFiles.findIndex(
    (file) => file.fileName === existingBlock.fileName
  );
  const existingFile = existingFiles[existingFileIndex];

  if (!existingFile) {
    return [...existingFiles];
  }

  const existingBody = existingFile.code.slice(
    existingBlock.bodyStartOffset,
    existingBlock.bodyEndOffset
  );
  const existingNames = new Set(
    parseRequiredProviderEntries(existingBody).map((entry) => entry.name)
  );
  const missingEntries = generatedEntries.filter((entry) => !existingNames.has(entry.name));

  if (missingEntries.length === 0) {
    return [...existingFiles];
  }

  const closingIndent = existingBody.match(/(?:^|\n)([ \t]*)$/)?.[1] ?? "";
  const bodyWithoutTrailingWhitespace = existingBody.replace(/\s*$/, "");
  const mergedBody = `${bodyWithoutTrailingWhitespace}\n${missingEntries
    .map((entry) => entry.code.trimEnd())
    .join("\n")}\n${closingIndent}`;
  const nextFiles = [...existingFiles];

  nextFiles[existingFileIndex] = {
    ...existingFile,
    code: `${existingFile.code.slice(0, existingBlock.bodyStartOffset)}${mergedBody}${existingFile.code.slice(existingBlock.bodyEndOffset)}`
  };

  return nextFiles;
}

function parseRequiredProviderEntries(body: string): TerraformRequiredProviderEntry[] {
  const entries: TerraformRequiredProviderEntry[] = [];
  const lines = body.split("\n");
  let depth = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const entryMatch = depth === 0
      ? /^\s*([A-Za-z_][A-Za-z0-9_-]*)\s*=/.exec(line)
      : null;

    if (!entryMatch?.[1]) {
      depth += countBraceDelta(line);
      continue;
    }

    const entryLines = [line];
    let entryDepth = countBraceDelta(line);

    while (entryDepth > 0 && index + 1 < lines.length) {
      index += 1;
      const nextLine = lines[index] ?? "";
      entryLines.push(nextLine);
      entryDepth += countBraceDelta(nextLine);
    }

    entries.push({
      code: entryLines.join("\n"),
      name: entryMatch[1]
    });
  }

  return entries;
}

type TerraformTopLevelBlockLocation = {
  readonly blockType: "provider" | "terraform";
  readonly code: string;
  readonly endOffset: number;
  readonly label?: string | undefined;
  readonly startOffset: number;
};

function parseTerraformTopLevelBlocks(terraformCode: string): TerraformTopLevelBlockLocation[] {
  const blocks: TerraformTopLevelBlockLocation[] = [];
  const rawLines = terraformCode.split("\n");
  const lineOffsets: number[] = [];
  let offset = 0;

  for (const line of rawLines) {
    lineOffsets.push(offset);
    offset += line.length + 1;
  }

  for (let index = 0; index < rawLines.length; index += 1) {
    const line = rawLines[index] ?? "";
    const headerMatch = /^\s*(terraform|provider)(?:\s+"([^"]+)")?\s*\{/.exec(line);

    if (!headerMatch) {
      continue;
    }

    const startOffset = lineOffsets[index] ?? 0;
    let depth = countBraceDelta(line);
    let endIndex = index;
    let endOffset = startOffset + line.length;

    while (depth > 0 && endIndex + 1 < rawLines.length) {
      endIndex += 1;
      const nextLine = rawLines[endIndex] ?? "";
      depth += countBraceDelta(nextLine);
      endOffset = (lineOffsets[endIndex] ?? 0) + nextLine.length;
    }

    blocks.push({
      blockType: headerMatch[1] as "provider" | "terraform",
      code: terraformCode.slice(startOffset, endOffset),
      endOffset,
      ...(headerMatch[2] ? { label: headerMatch[2] } : {}),
      startOffset
    });
    index = endIndex;
  }

  return blocks;
}

function removeGeneratedRequiredProvidersBlocks(terraformCode: string): string {
  const removableBlocks = parseTerraformTopLevelBlocks(terraformCode)
    .filter(
      (block) =>
        block.blockType === "terraform" &&
        findTerraformRequiredProvidersDeclarations([
          { fileName: "generated.tf", terraformCode: block.code }
        ]).length > 0
    )
    .sort((left, right) => right.startOffset - left.startOffset);
  let nextCode = terraformCode;

  for (const block of removableBlocks) {
    nextCode = `${nextCode.slice(0, block.startOffset)}${nextCode.slice(block.endOffset)}`;
  }

  return normalizeTerraformCodeAfterBlockRemoval(nextCode);
}

function upsertGeneratedProviderBlocks(
  files: TerraformVirtualFile[],
  generatedFiles: readonly TerraformVirtualFile[]
): void {
  for (const generatedFile of generatedFiles) {
    const generatedProviderBlocks = parseTerraformTopLevelBlocks(generatedFile.code).filter(
      (block) => block.blockType === "provider"
    );

    for (const generatedProviderBlock of generatedProviderBlocks) {
      const generatedAlias = getTerraformProviderAlias(generatedProviderBlock.code);
      const matchingExistingBlocks = files.flatMap((file, fileIndex) =>
        parseTerraformTopLevelBlocks(file.code)
          .filter(
            (block) =>
              block.blockType === "provider" &&
              block.label === generatedProviderBlock.label &&
              getTerraformProviderAlias(block.code) === generatedAlias
          )
          .map((block) => ({ block, file, fileIndex }))
      );
      const managedExistingBlock = matchingExistingBlocks.find(({ block }) =>
        isSketchCatchManagedProviderBlock(block.code)
      );

      if (managedExistingBlock) {
        const { block, file, fileIndex } = managedExistingBlock;
        files[fileIndex] = {
          ...file,
          code: `${file.code.slice(0, block.startOffset)}${generatedProviderBlock.code}${file.code.slice(block.endOffset)}`
        };
        continue;
      }

      if (matchingExistingBlocks.length > 0) {
        continue;
      }

      const targetFileIndex = files.findIndex(
        (file) => file.fileName === generatedFile.fileName
      );
      if (targetFileIndex === -1) {
        files.push({
          fileName: generatedFile.fileName,
          code: generatedProviderBlock.code
        });
        continue;
      }

      const targetFile = files[targetFileIndex]!;
      files[targetFileIndex] = {
        ...targetFile,
        code: appendTerraformBlock(targetFile.code, generatedProviderBlock.code)
      };
    }
  }
}

function getTerraformProviderAlias(providerCode: string): string | null {
  const bodyStart = providerCode.indexOf("{");
  const bodyEnd = providerCode.lastIndexOf("}");

  if (bodyStart === -1 || bodyEnd <= bodyStart) {
    return null;
  }

  const body = providerCode.slice(bodyStart + 1, bodyEnd);
  let depth = 0;
  let index = 0;

  while (index < body.length) {
    const character = body[index]!;
    const nextCharacter = body[index + 1];

    if (/\s/.test(character)) {
      index += 1;
      continue;
    }

    if (character === "#" || (character === "/" && nextCharacter === "/")) {
      index = body.indexOf("\n", index);
      if (index === -1) return null;
      continue;
    }

    if (character === "/" && nextCharacter === "*") {
      const commentEnd = body.indexOf("*/", index + 2);
      index = commentEnd === -1 ? body.length : commentEnd + 2;
      continue;
    }

    if (character === "\"") {
      index = skipTerraformQuotedString(body, index);
      continue;
    }

    if (character === "{") {
      depth += 1;
      index += 1;
      continue;
    }

    if (character === "}") {
      depth = Math.max(0, depth - 1);
      index += 1;
      continue;
    }

    if (depth === 0 && /[A-Za-z_]/.test(character)) {
      const identifierStart = index;
      index += 1;

      while (index < body.length && /[A-Za-z0-9_-]/.test(body[index]!)) {
        index += 1;
      }

      const identifier = body.slice(identifierStart, index);
      while (index < body.length && /\s/.test(body[index]!)) index += 1;

      if (identifier !== "alias" || body[index] !== "=") {
        continue;
      }

      index += 1;
      while (index < body.length && /\s/.test(body[index]!)) index += 1;
      if (body[index] !== "\"") return null;

      const valueStart = index + 1;
      const valueEnd = skipTerraformQuotedString(body, index) - 1;
      return body.slice(valueStart, valueEnd);
    }

    index += 1;
  }

  return null;
}

function skipTerraformQuotedString(source: string, startOffset: number): number {
  let index = startOffset + 1;

  while (index < source.length) {
    if (source[index] === "\\") {
      index += 2;
      continue;
    }

    if (source[index] === "\"") {
      return index + 1;
    }

    index += 1;
  }

  return source.length;
}

function isSketchCatchManagedProviderBlock(providerCode: string): boolean {
  return providerCode.includes("# sketchcatch:managed-provider") ||
    (
      /cluster_ca_certificate\s*=\s*base64decode\(aws_eks_cluster\./.test(providerCode) &&
      /token\s*=\s*data\.aws_eks_cluster_auth\.sketchcatch\.token/.test(providerCode)
    );
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

/** Provider declarations alone are not a Terraform resource seed that needs classification. */
export function hasTerraformResourceBlocks(
  files: readonly TerraformVirtualFile[]
): boolean {
  return parseTerraformFiles(files).length > 0;
}

/** Marks newly generated or replaced resource sources for classification on the next refresh. */
export function getTerraformSourceClassificationAfterRefresh({
  currentFiles,
  didClassifyCurrentSource,
  nextFiles,
  preserveExistingSource,
  sourceWasClassified
}: {
  readonly currentFiles: readonly TerraformVirtualFile[];
  readonly didClassifyCurrentSource: boolean;
  readonly nextFiles: readonly TerraformVirtualFile[];
  readonly preserveExistingSource: boolean;
  readonly sourceWasClassified: boolean;
}): boolean {
  if (didClassifyCurrentSource) {
    return true;
  }

  if (!hasTerraformResourceBlocks(nextFiles)) {
    return true;
  }

  if (!preserveExistingSource || !hasTerraformResourceBlocks(currentFiles)) {
    return false;
  }

  return sourceWasClassified;
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

export function removeTerraformBlocksAndDependentOutputsByAddress(
  files: readonly TerraformVirtualFile[],
  addresses: Iterable<string>
): TerraformVirtualFile[] {
  const addressSet = new Set(addresses);
  const nextFiles = removeTerraformBlocksByAddress(files, addressSet);

  if (addressSet.size === 0) {
    return nextFiles;
  }

  return removeTerraformOutputBlocks(nextFiles, (block) =>
    terraformOutputReferencesAnyAddress(block.code, addressSet)
  );
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

function removeTerraformOutputsWithUndeclaredManagedReferences(
  files: readonly TerraformVirtualFile[]
): TerraformVirtualFile[] {
  const declaredAddresses = new Set(parseTerraformFiles(files).map((block) => block.address));

  return removeTerraformOutputBlocks(files, (block) =>
    getTerraformManagedReferenceAddresses(block.code).some(
      (address) => !declaredAddresses.has(address)
    )
  );
}

function removeTerraformOutputBlocks(
  files: readonly TerraformVirtualFile[],
  shouldRemove: (block: TerraformOutputBlockLocation) => boolean
): TerraformVirtualFile[] {
  let didRemoveOutput = false;
  const nextFiles = files.map((file) => {
    const removableOutputs = parseTerraformOutputBlocks(file.code)
      .filter(shouldRemove)
      .sort((left, right) => right.startOffset - left.startOffset);

    if (removableOutputs.length === 0) {
      return file;
    }

    didRemoveOutput = true;
    let nextCode = file.code;

    for (const output of removableOutputs) {
      let removeEndOffset = output.endOffset;

      if (nextCode.slice(removeEndOffset, removeEndOffset + 2) === "\r\n") {
        removeEndOffset += 2;
      } else if (nextCode[removeEndOffset] === "\n") {
        removeEndOffset += 1;
      }

      nextCode = `${nextCode.slice(0, output.startOffset)}${nextCode.slice(removeEndOffset)}`;
    }

    return {
      ...file,
      code: normalizeTerraformCodeAfterBlockRemoval(nextCode)
    };
  });

  return didRemoveOutput ? nextFiles : [...files];
}

function terraformOutputReferencesAnyAddress(
  terraformCode: string,
  addresses: ReadonlySet<string>
): boolean {
  return getTerraformManagedReferenceAddresses(terraformCode).some((address) =>
    addresses.has(address)
  );
}

function getTerraformManagedReferenceAddresses(terraformCode: string): string[] {
  return Array.from(terraformCode.matchAll(TERRAFORM_MANAGED_REFERENCE_PATTERN), (match) => {
    const reference = match[0];
    const segments = reference.split(".");

    return reference.startsWith("data.")
      ? segments.slice(0, 3).join(".")
      : segments.slice(0, 2).join(".");
  });
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
