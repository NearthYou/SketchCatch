import type { BrainboardSourceResourceNode, BrainboardTemplateSource } from "./source-types.js";

export type BrainboardSourceValidationErrorCode =
  | "brainboard.source.duplicate_node_id"
  | "brainboard.source.duplicate_edge_id"
  | "brainboard.source.duplicate_node_order"
  | "brainboard.source.duplicate_edge_order"
  | "brainboard.source.duplicate_resource_address"
  | "brainboard.source.duplicate_resource_node_address"
  | "brainboard.source.duplicate_file_name"
  | "brainboard.source.invalid_resource_address"
  | "brainboard.source.dangling_parent"
  | "brainboard.source.dangling_edge_source"
  | "brainboard.source.dangling_edge_target"
  | "brainboard.source.non_finite_rotation"
  | "brainboard.source.parent_cycle"
  | "brainboard.source.sha256_mismatch"
  | "brainboard.source.missing_resource_address"
  | "brainboard.source.unmapped_resource_address"
  | "brainboard.source.missing_resource_block"
  | "brainboard.source.clone_uuid_leak"
  | "brainboard.source.invalid_presentation_alias"
  | "brainboard.source.invalid_workspace_seed"
  | "brainboard.source.workspace_sha256_mismatch";

export type BrainboardSourceValidationError = {
  readonly code: BrainboardSourceValidationErrorCode;
  readonly path: string;
  readonly message: string;
};

export type BrainboardSourceValidationResult = {
  readonly valid: boolean;
  readonly errors: readonly BrainboardSourceValidationError[];
};

const CLONE_ARCHITECTURE_UUID_PATTERN =
  /\b(?:arch(?:itecture)?_?uuid|architecture_?id)\s*=\s*["'][0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}["']/iu;
const BRAINBOARD_ARCHITECTURE_UUID_LINE_PATTERN =
  /^[\t ]*arch(?:itecture)?_?uuid[\t ]*=[\t ]*["'][0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}["'][\t ]*\r?\n$/iu;
const TERRAFORM_IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_-]*$/u;

export function validateBrainboardTemplateSource(
  source: BrainboardTemplateSource
): BrainboardSourceValidationResult {
  const errors: BrainboardSourceValidationError[] = [];

  addDuplicateErrors(
    source.nodes,
    ({ sourceNodeId }) => sourceNodeId,
    "brainboard.source.duplicate_node_id",
    "nodes",
    "sourceNodeId",
    errors
  );
  addDuplicateErrors(
    source.edges,
    ({ sourceEdgeId }) => sourceEdgeId,
    "brainboard.source.duplicate_edge_id",
    "edges",
    "sourceEdgeId",
    errors
  );
  addDuplicateErrors(
    source.nodes,
    ({ domOrder }) => domOrder,
    "brainboard.source.duplicate_node_order",
    "nodes",
    "domOrder",
    errors
  );
  addDuplicateErrors(
    source.edges,
    ({ domOrder }) => domOrder,
    "brainboard.source.duplicate_edge_order",
    "edges",
    "domOrder",
    errors
  );
  addDuplicateErrors(
    source.terraform.resourceAddresses,
    (address) => address,
    "brainboard.source.duplicate_resource_address",
    "terraform.resourceAddresses",
    undefined,
    errors
  );
  addDuplicateErrors(
    source.terraform.files,
    ({ fileName }) => fileName,
    "brainboard.source.duplicate_file_name",
    "terraform.files",
    "fileName",
    errors
  );

  const nodeIds = new Set(source.nodes.map(({ sourceNodeId }) => sourceNodeId));
  source.nodes.forEach((node, index) => {
    if (!Number.isFinite(node.rotation)) {
      errors.push({
        code: "brainboard.source.non_finite_rotation",
        path: `nodes[${index}].rotation`,
        message: `Node ${node.sourceNodeId} rotation must be a finite number.`
      });
    }
    if (node.parentSourceNodeId !== null && !nodeIds.has(node.parentSourceNodeId)) {
      errors.push({
        code: "brainboard.source.dangling_parent",
        path: `nodes[${index}].parentSourceNodeId`,
        message: `Parent source node ${node.parentSourceNodeId} does not exist.`
      });
    }
  });
  source.edges.forEach((edge, index) => {
    if (!nodeIds.has(edge.sourceNodeId)) {
      errors.push({
        code: "brainboard.source.dangling_edge_source",
        path: `edges[${index}].sourceNodeId`,
        message: `Edge source node ${edge.sourceNodeId} does not exist.`
      });
    }
    if (!nodeIds.has(edge.targetNodeId)) {
      errors.push({
        code: "brainboard.source.dangling_edge_target",
        path: `edges[${index}].targetNodeId`,
        message: `Edge target node ${edge.targetNodeId} does not exist.`
      });
    }
  });

  addParentCycleErrors(source, errors);
  addTerraformErrors(source, errors);
  addPresentationAliasErrors(source, errors);

  return { valid: errors.length === 0, errors };
}

function addDuplicateErrors<T, K extends string | number>(
  entries: readonly T[],
  getKey: (entry: T) => K,
  code: BrainboardSourceValidationErrorCode,
  collectionPath: string,
  fieldName: string | undefined,
  errors: BrainboardSourceValidationError[]
): void {
  const firstIndexes = new Map<K, number>();

  entries.forEach((entry, index) => {
    const key = getKey(entry);
    const firstIndex = firstIndexes.get(key);
    if (firstIndex === undefined) {
      firstIndexes.set(key, index);
      return;
    }
    errors.push({
      code,
      path: `${collectionPath}[${index}]${fieldName ? `.${fieldName}` : ""}`,
      message: `Duplicate ${String(key)}; first declared at ${collectionPath}[${firstIndex}].`
    });
  });
}

function addParentCycleErrors(
  source: BrainboardTemplateSource,
  errors: BrainboardSourceValidationError[]
): void {
  const nodesById = new Map(
    source.nodes.map((node, index) => [node.sourceNodeId, { node, index }] as const)
  );
  const completed = new Set<string>();

  for (const startNode of source.nodes) {
    if (completed.has(startNode.sourceNodeId)) {
      continue;
    }

    const path: string[] = [];
    const pathIndexes = new Map<string, number>();
    let currentId: string | null = startNode.sourceNodeId;

    while (currentId !== null && nodesById.has(currentId) && !completed.has(currentId)) {
      const cycleStart = pathIndexes.get(currentId);
      if (cycleStart !== undefined) {
        const cycle = path.slice(cycleStart).concat(currentId);
        const sourceIndex = nodesById.get(currentId)!.index;
        errors.push({
          code: "brainboard.source.parent_cycle",
          path: `nodes[${sourceIndex}].parentSourceNodeId`,
          message: `Parent cycle detected: ${cycle.join(" -> ")}.`
        });
        break;
      }

      pathIndexes.set(currentId, path.length);
      path.push(currentId);
      currentId = nodesById.get(currentId)!.node.parentSourceNodeId;
    }

    path.forEach((nodeId) => completed.add(nodeId));
  }
}

function addTerraformErrors(
  source: BrainboardTemplateSource,
  errors: BrainboardSourceValidationError[]
): void {
  const filesByName = new Map(
    source.terraform.files.map((file, index) => [file.fileName, { file, index }] as const)
  );
  const resourceAddresses = new Set(source.terraform.resourceAddresses);

  source.terraform.files.forEach((file, index) => {
    const actualSha256 = sha256Hex(file.code);
    if (actualSha256 !== file.sha256.toLowerCase()) {
      errors.push({
        code: "brainboard.source.sha256_mismatch",
        path: `terraform.files[${index}].sha256`,
        message: `SHA-256 mismatch for ${file.fileName}: expected ${file.sha256}, received ${actualSha256}.`
      });
    }
    const workspaceCode = validateWorkspaceSeed(source, file, index, errors);
    if (file.includeInWorkspace && containsCloneArchitectureUuid(source, workspaceCode)) {
      errors.push({
        code: "brainboard.source.clone_uuid_leak",
        path: file.workspaceSeed
          ? `terraform.files[${index}].workspaceSeed.code`
          : `terraform.files[${index}].code`,
        message: `Workspace seed file ${file.fileName} contains a Brainboard clone architecture UUID.`
      });
    }
  });

  const resourceNodeIndexesByAddress = new Map<string, number[]>();
  const seenNodeIds = new Set<string>();
  source.nodes.forEach((node, index) => {
    if (node.kind !== "resource" || seenNodeIds.has(node.sourceNodeId)) {
      return;
    }
    seenNodeIds.add(node.sourceNodeId);
    const address = getResourceAddress(node);
    const indexes = resourceNodeIndexesByAddress.get(address) ?? [];
    indexes.push(index);
    resourceNodeIndexesByAddress.set(address, indexes);
    if (indexes.length > 1) {
      errors.push({
        code: "brainboard.source.duplicate_resource_node_address",
        path: `nodes[${index}]`,
        message: `Resource address ${address} is already mapped by nodes[${indexes[0]}].`
      });
    }
  });

  source.nodes.forEach((node, index) => {
    if (node.kind !== "resource") {
      return;
    }

    const address = getResourceAddress(node);
    if (!resourceAddresses.has(address)) {
      errors.push({
        code: "brainboard.source.missing_resource_address",
        path: `nodes[${index}]`,
        message: `Resource node ${node.sourceNodeId} is missing source address ${address}.`
      });
    }

    const sourceFile = filesByName.get(node.fileName)?.file;
    if (sourceFile === undefined || !containsTerraformBlock(sourceFile.code, node)) {
      errors.push({
        code: "brainboard.source.missing_resource_block",
        path: `nodes[${index}]`,
        message: `Resource node ${node.sourceNodeId} has no ${node.terraformBlockType} block in ${node.fileName}.`
      });
    }
  });

  const allTerraformCode = source.terraform.files.map(({ code }) => code).join("\n");
  source.terraform.resourceAddresses.forEach((address, index) => {
    const identity = parseResourceAddress(address);
    if (identity === null) {
      errors.push({
        code: "brainboard.source.invalid_resource_address",
        path: `terraform.resourceAddresses[${index}]`,
        message: `Source address ${address} is not a supported Terraform block address.`
      });
      return;
    }
    if ((resourceNodeIndexesByAddress.get(address)?.length ?? 0) === 0) {
      errors.push({
        code: "brainboard.source.unmapped_resource_address",
        path: `terraform.resourceAddresses[${index}]`,
        message: `Source address ${address} has no resource visual mapping.`
      });
    }
    if (!containsTerraformBlock(allTerraformCode, identity)) {
      errors.push({
        code: "brainboard.source.missing_resource_block",
        path: `terraform.resourceAddresses[${index}]`,
        message: `Source address ${address} has no matching Terraform block.`
      });
    }
  });
}

function validateWorkspaceSeed(
  source: BrainboardTemplateSource,
  file: BrainboardTemplateSource["terraform"]["files"][number],
  fileIndex: number,
  errors: BrainboardSourceValidationError[]
): string {
  const workspaceSeed = file.workspaceSeed;
  if (workspaceSeed === undefined) {
    return file.code;
  }

  if (!file.includeInWorkspace || workspaceSeed.omissions.length === 0) {
    errors.push({
      code: "brainboard.source.invalid_workspace_seed",
      path: `terraform.files[${fileIndex}].workspaceSeed`,
      message: `Workspace seed for ${file.fileName} requires an included file and at least one reviewed omission.`
    });
  }

  if (sha256Hex(workspaceSeed.code) !== workspaceSeed.sha256.toLowerCase()) {
    errors.push({
      code: "brainboard.source.workspace_sha256_mismatch",
      path: `terraform.files[${fileIndex}].workspaceSeed.sha256`,
      message: `Workspace seed SHA-256 mismatch for ${file.fileName}.`
    });
  }

  let expectedCode = file.code;
  for (const [omissionIndex, omission] of workspaceSeed.omissions.entries()) {
    if (
      omission.reason !== "brainboard-architecture-uuid" ||
      omission.sourceText.length === 0 ||
      !BRAINBOARD_ARCHITECTURE_UUID_LINE_PATTERN.test(omission.sourceText) ||
      !Number.isInteger(omission.occurrenceCount) ||
      omission.occurrenceCount < 1 ||
      countOccurrences(expectedCode, omission.sourceText) !== omission.occurrenceCount
    ) {
      errors.push({
        code: "brainboard.source.invalid_workspace_seed",
        path: `terraform.files[${fileIndex}].workspaceSeed.omissions[${omissionIndex}]`,
        message: `Workspace omission ${omissionIndex} for ${file.fileName} must identify an exact reviewed count of one UUID assignment line.`
      });
      continue;
    }
    expectedCode = expectedCode.split(omission.sourceText).join("");
  }
  if (expectedCode !== workspaceSeed.code) {
    errors.push({
      code: "brainboard.source.invalid_workspace_seed",
      path: `terraform.files[${fileIndex}].workspaceSeed.code`,
      message: `Workspace seed for ${file.fileName} differs by more than its reviewed omissions.`
    });
  }

  return workspaceSeed.code;
}

function addPresentationAliasErrors(
  source: BrainboardTemplateSource,
  errors: BrainboardSourceValidationError[]
): void {
  const resourceAddresses = new Set(source.terraform.resourceAddresses);
  source.nodes.forEach((node, index) => {
    if (node.kind !== "presentation" || node.aliasOf === null) {
      return;
    }
    if (node.catalogId === null || !resourceAddresses.has(node.aliasOf)) {
      errors.push({
        code: "brainboard.source.invalid_presentation_alias",
        path: `nodes[${index}].aliasOf`,
        message: `Presentation alias ${node.sourceNodeId} requires a catalog identity and a captured Terraform address.`
      });
    }
  });
}

function getResourceAddress(node: BrainboardSourceResourceNode): string {
  const prefix = node.terraformBlockType === "data" ? "data." : "";
  return `${prefix}${node.terraformResourceType}.${node.resourceName}`;
}

function parseResourceAddress(address: string): {
  readonly terraformBlockType: "resource" | "data";
  readonly terraformResourceType: string;
  readonly resourceName: string;
} | null {
  const parts = address.split(".");
  if (
    parts[0] === "data" &&
    parts.length === 3 &&
    isTerraformIdentifier(parts[1]) &&
    isTerraformIdentifier(parts[2])
  ) {
    return {
      terraformBlockType: "data",
      terraformResourceType: parts[1]!,
      resourceName: parts[2]!
    };
  }
  if (parts.length === 2 && isTerraformIdentifier(parts[0]) && isTerraformIdentifier(parts[1])) {
    return {
      terraformBlockType: "resource",
      terraformResourceType: parts[0]!,
      resourceName: parts[1]!
    };
  }
  return null;
}

function containsTerraformBlock(
  code: string,
  identity: Pick<
    BrainboardSourceResourceNode,
    "terraformBlockType" | "terraformResourceType" | "resourceName"
  >
): boolean {
  const tokens = tokenizeTerraformBlockHeaders(code);
  return tokens.some((token, index) => {
    const resourceType = tokens[index + 1];
    const resourceName = tokens[index + 2];
    const openBrace = tokens[index + 3];
    return (
      token.kind === "identifier" &&
      token.value === identity.terraformBlockType &&
      resourceType?.kind === "string" &&
      resourceType.value === identity.terraformResourceType &&
      resourceName?.kind === "string" &&
      resourceName.value === identity.resourceName &&
      openBrace?.kind === "open-brace"
    );
  });
}

type TerraformHeaderToken =
  | { readonly kind: "identifier"; readonly value: string }
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "open-brace" }
  | { readonly kind: "separator" };

function tokenizeTerraformBlockHeaders(code: string): TerraformHeaderToken[] {
  const tokens: TerraformHeaderToken[] = [];
  let index = 0;

  while (index < code.length) {
    const character = code[index]!;
    const nextCharacter = code[index + 1];

    if (/\s/u.test(character)) {
      index += 1;
      continue;
    }
    if (character === "#" || (character === "/" && nextCharacter === "/")) {
      index = skipLine(code, index);
      continue;
    }
    if (character === "/" && nextCharacter === "*") {
      index = skipBlockComment(code, index + 2);
      continue;
    }
    if (character === "<" && nextCharacter === "<") {
      const heredocEnd = findHeredocEnd(code, index);
      if (heredocEnd !== null) {
        index = heredocEnd;
        continue;
      }
    }
    if (character === '"') {
      const stringToken = readQuotedString(code, index + 1);
      tokens.push({ kind: "string", value: stringToken.value });
      index = stringToken.end;
      continue;
    }
    if (/[a-zA-Z_]/u.test(character)) {
      const start = index;
      index += 1;
      while (index < code.length && /[a-zA-Z0-9_-]/u.test(code[index]!)) {
        index += 1;
      }
      tokens.push({ kind: "identifier", value: code.slice(start, index) });
      continue;
    }
    if (character === "{") {
      tokens.push({ kind: "open-brace" });
    } else {
      tokens.push({ kind: "separator" });
    }
    index += 1;
  }

  return tokens;
}

function readQuotedString(
  code: string,
  start: number
): { readonly value: string; readonly end: number } {
  let value = "";
  let index = start;
  while (index < code.length) {
    const character = code[index]!;
    if (character === "\\" && index + 1 < code.length) {
      value += code[index + 1]!;
      index += 2;
      continue;
    }
    if (character === '"') {
      return { value, end: index + 1 };
    }
    value += character;
    index += 1;
  }
  return { value, end: code.length };
}

function skipLine(code: string, start: number): number {
  const lineEnd = code.indexOf("\n", start);
  return lineEnd === -1 ? code.length : lineEnd + 1;
}

function skipBlockComment(code: string, start: number): number {
  const commentEnd = code.indexOf("*/", start);
  return commentEnd === -1 ? code.length : commentEnd + 2;
}

function findHeredocEnd(code: string, start: number): number | null {
  const declarationEnd = code.indexOf("\n", start);
  const declaration = code.slice(start, declarationEnd === -1 ? code.length : declarationEnd);
  const match = /^<<(-?)\s*([a-zA-Z_][a-zA-Z0-9_-]*)\s*\r?$/u.exec(declaration);
  if (match === null) {
    return null;
  }

  const allowsIndent = match[1] === "-";
  const delimiter = match[2]!;
  let lineStart = declarationEnd === -1 ? code.length : declarationEnd + 1;
  while (lineStart < code.length) {
    const lineEnd = code.indexOf("\n", lineStart);
    const rawLine = code
      .slice(lineStart, lineEnd === -1 ? code.length : lineEnd)
      .replace(/\r$/u, "");
    const comparisonLine = allowsIndent ? rawLine.trim() : rawLine;
    if (comparisonLine === delimiter) {
      return lineEnd === -1 ? code.length : lineEnd + 1;
    }
    lineStart = lineEnd === -1 ? code.length : lineEnd + 1;
  }
  return code.length;
}

function isTerraformIdentifier(value: string | undefined): value is string {
  return value !== undefined && TERRAFORM_IDENTIFIER_PATTERN.test(value);
}

function containsCloneArchitectureUuid(source: BrainboardTemplateSource, code: string): boolean {
  const cloneArchitectureId = source.origin.cloneArchitectureId;
  return (
    (cloneArchitectureId !== null &&
      cloneArchitectureId.length > 0 &&
      code.toLowerCase().includes(cloneArchitectureId.toLowerCase())) ||
    CLONE_ARCHITECTURE_UUID_PATTERN.test(code)
  );
}

function countOccurrences(value: string, fragment: string): number {
  let count = 0;
  let index = 0;
  while ((index = value.indexOf(fragment, index)) !== -1) {
    count += 1;
    index += fragment.length;
  }
  return count;
}

function sha256Hex(value: string): string {
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ] as const;
  const bytes = new TextEncoder().encode(value);
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const paddedView = new DataView(padded.buffer);
  const bitLength = bytes.length * 8;
  paddedView.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000));
  paddedView.setUint32(paddedLength - 4, bitLength >>> 0);

  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];
  const words = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = paddedView.getUint32(offset + index * 4);
    }
    for (let index = 16; index < 64; index += 1) {
      const first = words[index - 15]!;
      const second = words[index - 2]!;
      const sigma0 = rotateRight(first, 7) ^ rotateRight(first, 18) ^ (first >>> 3);
      const sigma1 = rotateRight(second, 17) ^ rotateRight(second, 19) ^ (second >>> 10);
      words[index] = (words[index - 16]! + sigma0 + words[index - 7]! + sigma1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number
    ];
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temporary1 = (h + sum1 + choice + constants[index]! + words[index]!) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }

    hash[0] = (hash[0]! + a) >>> 0;
    hash[1] = (hash[1]! + b) >>> 0;
    hash[2] = (hash[2]! + c) >>> 0;
    hash[3] = (hash[3]! + d) >>> 0;
    hash[4] = (hash[4]! + e) >>> 0;
    hash[5] = (hash[5]! + f) >>> 0;
    hash[6] = (hash[6]! + g) >>> 0;
    hash[7] = (hash[7]! + h) >>> 0;
  }

  return hash.map((word) => word.toString(16).padStart(8, "0")).join("");
}

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}
