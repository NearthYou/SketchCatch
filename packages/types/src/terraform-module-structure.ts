export type TerraformModuleFile = {
  readonly fileName: string;
  readonly terraformCode: string;
};

export type TerraformRequiredProvidersDeclaration = {
  readonly fileName: string;
  readonly line: number;
};

export type TerraformRequiredProvidersBlockLocation =
  TerraformRequiredProvidersDeclaration & {
    readonly bodyEndOffset: number;
    readonly bodyStartOffset: number;
    readonly endOffset: number;
    readonly startOffset: number;
  };

type StructureToken = {
  readonly endOffset: number;
  readonly kind: "close" | "equals" | "identifier" | "newline" | "open" | "string";
  readonly line: number;
  readonly startOffset: number;
  readonly value: string;
};

type OpenStructureBlock = {
  readonly blockType: string | null;
  readonly requiredProviders?: Omit<
    TerraformRequiredProvidersBlockLocation,
    "bodyEndOffset" | "endOffset"
  > | undefined;
};

export function findTerraformRequiredProvidersDeclarations(
  files: readonly TerraformModuleFile[]
): TerraformRequiredProvidersDeclaration[] {
  return findTerraformRequiredProvidersBlockLocations(files).map(({ fileName, line }) => ({
    fileName,
    line
  }));
}

export function findTerraformRequiredProvidersBlockLocations(
  files: readonly TerraformModuleFile[]
): TerraformRequiredProvidersBlockLocation[] {
  return files.flatMap((file) => findFileRequiredProvidersBlockLocations(file));
}

function findFileRequiredProvidersBlockLocations(
  file: TerraformModuleFile
): TerraformRequiredProvidersBlockLocation[] {
  const declarations: TerraformRequiredProvidersBlockLocation[] = [];
  const stack: OpenStructureBlock[] = [];
  const headerTokensByDepth = new Map<number, StructureToken[]>();
  const attributeValueDepths = new Set<number>();
  let depth = 0;

  for (const token of tokenizeTerraformStructure(file.terraformCode)) {
    if (token.kind === "identifier" || token.kind === "string") {
      if (attributeValueDepths.has(depth)) {
        continue;
      }

      const headerTokens = headerTokensByDepth.get(depth) ?? [];
      headerTokens.push(token);
      headerTokensByDepth.set(depth, headerTokens);
      continue;
    }

    if (token.kind === "equals") {
      headerTokensByDepth.set(depth, []);
      attributeValueDepths.add(depth);
      continue;
    }

    if (token.kind === "newline") {
      attributeValueDepths.delete(depth);
      continue;
    }

    if (token.kind === "open") {
      const headerTokens = headerTokensByDepth.get(depth) ?? [];
      const typeToken = headerTokens[0];
      const blockType = typeToken?.kind === "identifier" ? typeToken.value : null;
      const parentBlockType = stack[stack.length - 1]?.blockType;
      const isRequiredProviders =
        parentBlockType === "terraform" && blockType === "required_providers";

      stack.push({
        blockType,
        ...(isRequiredProviders ? {
          requiredProviders: {
            bodyStartOffset: token.endOffset,
            fileName: file.fileName,
            line: typeToken?.line ?? token.line,
            startOffset: typeToken?.startOffset ?? token.startOffset
          }
        } : {})
      });

      headerTokensByDepth.set(depth, []);
      attributeValueDepths.delete(depth);
      depth += 1;
      continue;
    }

    depth = Math.max(0, depth - 1);
    const closedBlock = stack.pop();

    if (closedBlock?.requiredProviders) {
      declarations.push({
        ...closedBlock.requiredProviders,
        bodyEndOffset: token.startOffset,
        endOffset: token.endOffset
      });
    }

    headerTokensByDepth.delete(depth + 1);
    headerTokensByDepth.set(depth, []);
    attributeValueDepths.delete(depth);
    attributeValueDepths.delete(depth + 1);
  }

  return declarations;
}

function tokenizeTerraformStructure(source: string): StructureToken[] {
  const tokens: StructureToken[] = [];
  let index = 0;
  let line = 1;

  while (index < source.length) {
    const char = source[index]!;
    const nextChar = source[index + 1];

    if (char === "\n") {
      tokens.push({
        endOffset: index + 1,
        kind: "newline",
        value: char,
        line,
        startOffset: index
      });
      line += 1;
      index += 1;
      continue;
    }

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === "#" || (char === "/" && nextChar === "/")) {
      index = skipLine(source, index);
      continue;
    }

    if (char === "/" && nextChar === "*") {
      const skipped = skipBlockComment(source, index, line);
      index = skipped.index;
      line = skipped.line;
      continue;
    }

    if (char === "<" && nextChar === "<") {
      const skipped = skipHeredoc(source, index, line);
      index = skipped.index;
      line = skipped.line;
      continue;
    }

    if (char === "\"") {
      const parsed = parseQuotedString(source, index, line);
      tokens.push({
        endOffset: parsed.index,
        kind: "string",
        value: parsed.value,
        line,
        startOffset: index
      });
      index = parsed.index;
      line = parsed.line;
      continue;
    }

    if (char === "{") {
      tokens.push({
        endOffset: index + 1,
        kind: "open",
        value: char,
        line,
        startOffset: index
      });
      index += 1;
      continue;
    }

    if (char === "}") {
      tokens.push({
        endOffset: index + 1,
        kind: "close",
        value: char,
        line,
        startOffset: index
      });
      index += 1;
      continue;
    }

    if (char === "=") {
      tokens.push({
        endOffset: index + 1,
        kind: "equals",
        value: char,
        line,
        startOffset: index
      });
      index += 1;
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      const start = index;
      index += 1;

      while (index < source.length && /[A-Za-z0-9_-]/.test(source[index]!)) {
        index += 1;
      }

      tokens.push({
        endOffset: index,
        kind: "identifier",
        value: source.slice(start, index),
        line,
        startOffset: start
      });
      continue;
    }

    index += 1;
  }

  return tokens;
}

function skipLine(source: string, index: number): number {
  let nextIndex = index;

  while (nextIndex < source.length && source[nextIndex] !== "\n") {
    nextIndex += 1;
  }

  return nextIndex;
}

function skipBlockComment(
  source: string,
  index: number,
  line: number
): { readonly index: number; readonly line: number } {
  let nextIndex = index + 2;
  let nextLine = line;

  while (nextIndex < source.length - 1) {
    if (source[nextIndex] === "\n") {
      nextLine += 1;
    }

    if (source[nextIndex] === "*" && source[nextIndex + 1] === "/") {
      return { index: nextIndex + 2, line: nextLine };
    }

    nextIndex += 1;
  }

  return { index: source.length, line: nextLine };
}

function skipHeredoc(
  source: string,
  index: number,
  line: number
): { readonly index: number; readonly line: number } {
  const marker = /^<<(-?)\s*([A-Za-z_][A-Za-z0-9_-]*)/.exec(source.slice(index));

  if (!marker?.[2]) {
    return { index: index + 2, line };
  }

  const allowIndent = marker[1] === "-";
  const delimiter = marker[2];
  let nextIndex = skipLine(source, index);
  let nextLine = line;

  while (nextIndex < source.length) {
    if (source[nextIndex] === "\n") {
      nextIndex += 1;
      nextLine += 1;
    }

    const lineEnd = skipLine(source, nextIndex);
    const lineText = source.slice(nextIndex, lineEnd).replace(/\r$/, "");
    const comparableLine = allowIndent ? lineText.trimStart() : lineText;

    if (comparableLine === delimiter) {
      return { index: lineEnd, line: nextLine };
    }

    nextIndex = lineEnd;
  }

  return { index: source.length, line: nextLine };
}

function parseQuotedString(
  source: string,
  index: number,
  line: number
): { readonly value: string; readonly index: number; readonly line: number } {
  let nextIndex = index + 1;
  let nextLine = line;
  let value = "";

  while (nextIndex < source.length) {
    const char = source[nextIndex]!;

    if (char === "\n") {
      nextLine += 1;
    }

    if (char === "\\") {
      value += source[nextIndex + 1] ?? "";
      nextIndex += 2;
      continue;
    }

    if (char === "\"") {
      return { value, index: nextIndex + 1, line: nextLine };
    }

    value += char;
    nextIndex += 1;
  }

  return { value, index: source.length, line: nextLine };
}
