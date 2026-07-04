export type TerraformTokenKind =
  | "brace"
  | "comment"
  | "identifier"
  | "keyword"
  | "number"
  | "operator"
  | "plain"
  | "reference"
  | "string";

export type TerraformHighlightedToken = {
  readonly kind: TerraformTokenKind;
  readonly text: string;
};

export type TerraformHighlightedLine = {
  readonly hasDiagnostic: boolean;
  readonly line: number;
  readonly tokens: readonly TerraformHighlightedToken[];
};

const TERRAFORM_KEYWORDS = new Set([
  "data",
  "locals",
  "module",
  "output",
  "provider",
  "resource",
  "terraform",
  "variable"
]);

export function createTerraformHighlightedLines(
  code: string,
  diagnosticLines: ReadonlySet<number> = new Set()
): TerraformHighlightedLine[] {
  return code.split(/\r\n|\r|\n/).map((line, index) => {
    const lineNumber = index + 1;

    return {
      hasDiagnostic: diagnosticLines.has(lineNumber),
      line: lineNumber,
      tokens: tokenizeTerraformLine(line)
    };
  });
}

function tokenizeTerraformLine(line: string): TerraformHighlightedToken[] {
  const tokens: TerraformHighlightedToken[] = [];
  let index = 0;

  while (index < line.length) {
    const remaining = line.slice(index);
    const whitespaceMatch = /^[\t ]+/.exec(remaining);

    if (whitespaceMatch?.[0]) {
      tokens.push({ kind: "plain", text: whitespaceMatch[0] });
      index += whitespaceMatch[0].length;
      continue;
    }

    if (remaining.startsWith("#") || remaining.startsWith("//")) {
      tokens.push({ kind: "comment", text: remaining });
      break;
    }

    if (remaining.startsWith('"')) {
      const stringToken = readTerraformString(remaining);
      tokens.push({ kind: "string", text: stringToken });
      index += stringToken.length;
      continue;
    }

    const punctuationMatch = /^[{}[\](),]/.exec(remaining);

    if (punctuationMatch?.[0]) {
      tokens.push({ kind: "brace", text: punctuationMatch[0] });
      index += punctuationMatch[0].length;
      continue;
    }

    if (remaining.startsWith("=")) {
      tokens.push({ kind: "operator", text: "=" });
      index += 1;
      continue;
    }

    const numberMatch = /^-?\d+(?:\.\d+)?/.exec(remaining);

    if (numberMatch?.[0]) {
      tokens.push({ kind: "number", text: numberMatch[0] });
      index += numberMatch[0].length;
      continue;
    }

    const symbolMatch = /^[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)*/.exec(remaining);

    if (symbolMatch?.[0]) {
      const text = symbolMatch[0];
      tokens.push({ kind: getTerraformSymbolKind(text), text });
      index += text.length;
      continue;
    }

    tokens.push({ kind: "plain", text: remaining[0] ?? "" });
    index += 1;
  }

  return tokens;
}

function readTerraformString(value: string): string {
  let escaped = false;

  for (let index = 1; index < value.length; index += 1) {
    const character = value[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      continue;
    }

    if (character === '"') {
      return value.slice(0, index + 1);
    }
  }

  return value;
}

function getTerraformSymbolKind(text: string): TerraformTokenKind {
  if (TERRAFORM_KEYWORDS.has(text)) {
    return "keyword";
  }

  if (isTerraformReference(text)) {
    return "reference";
  }

  return "identifier";
}

function isTerraformReference(text: string): boolean {
  return (
    /^aws_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(text) ||
    /^data\.aws_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(text) ||
    /^(?:var|local|module)\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(text)
  );
}
