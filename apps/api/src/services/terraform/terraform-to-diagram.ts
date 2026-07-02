import type {
  DiagramJson,
  DiagramNode,
  TerraformBlockType,
  TerraformDiagnostic,
  TerraformSyncToDiagramResponse
} from "@sketchcatch/types";

const DEFAULT_TERRAFORM_BLOCK_TYPE: TerraformBlockType = "resource";
const BLOCK_HEADER_PATTERN =
  /^\s*(resource|data)\s+"([^"]+)"\s+"([^"]+)"\s*\{\s*$/;
const TOP_LEVEL_BLOCK_PATTERN = /^\s*([A-Za-z_][A-Za-z0-9_-]*)\b.*\{\s*$/;
const NESTED_BLOCK_PATTERN = /^\s*([A-Za-z_][A-Za-z0-9_-]*)\s*\{\s*$/;
const ATTRIBUTE_PATTERN = /^\s*([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*(.*)$/;
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const REFERENCE_PATTERN =
  /^(?:var|local|each|count|path|terraform)\.[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*$|^module\.[A-Za-z0-9_]+\.[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$|^aws_[A-Za-z0-9_]+\.[A-Za-z0-9_]+\.[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$|^data\.aws_[A-Za-z0-9_]+\.[A-Za-z0-9_]+\.[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$/;
const TERRAFORM_NESTED_BLOCK_ATTRIBUTES: Record<string, ReadonlySet<string>> = {
  aws_ami: new Set(["filter"]),
  aws_route_table: new Set(["route"]),
  aws_security_group: new Set(["egress", "ingress"])
};

type ParsedBlock = {
  blockType: TerraformBlockType;
  resourceType: string;
  resourceName: string;
  address: string;
  line: number;
  values: Record<string, unknown>;
};

type ParseResult = {
  blocks: ParsedBlock[];
  diagnostics: TerraformDiagnostic[];
};

type BodyLine = {
  text: string;
  line: number;
};

export function syncTerraformToDiagramJson(
  diagramJson: DiagramJson,
  terraformCode: string
): TerraformSyncToDiagramResponse {
  const parseResult = parseTerraformBlocks(terraformCode);

  if (parseResult.diagnostics.length > 0) {
    return {
      diagramJson,
      diagnostics: parseResult.diagnostics
    };
  }

  if (parseResult.blocks.length === 0) {
    return {
      diagramJson,
      diagnostics: [
        {
          severity: "error",
          code: "terraform.sync.empty",
          message: "동기화할 resource/data block이 없습니다."
        }
      ]
    };
  }

  const nodeByAddress = createNodeAddressMap(diagramJson.nodes);
  const diagnostics: TerraformDiagnostic[] = [];
  const valuesByNodeId = new Map<string, Record<string, unknown>>();

  for (const block of parseResult.blocks) {
    const node = nodeByAddress.get(block.address);

    if (!node) {
      diagnostics.push({
        severity: "error",
        code: "terraform.sync.unmatched_block",
        line: block.line,
        resourceAddress: block.address,
        message: `${block.address}와 매칭되는 DiagramJson node를 찾을 수 없습니다.`
      });
      continue;
    }

    valuesByNodeId.set(node.id, block.values);
  }

  if (diagnostics.length > 0) {
    return {
      diagramJson,
      diagnostics
    };
  }

  return {
    diagramJson: {
      ...diagramJson,
      nodes: diagramJson.nodes.map((node) => {
        const values = valuesByNodeId.get(node.id);

        if (!values || !node.parameters) {
          return node;
        }

        return {
          ...node,
          parameters: {
            ...node.parameters,
            values
          }
        };
      }),
      edges: diagramJson.edges.map((edge) => ({ ...edge })),
      viewport: { ...diagramJson.viewport }
    },
    diagnostics: []
  };
}

function createNodeAddressMap(nodes: DiagramNode[]): Map<string, DiagramNode> {
  const nodeByAddress = new Map<string, DiagramNode>();

  for (const node of nodes) {
    if (node.kind !== "resource" || !node.parameters) {
      continue;
    }

    const blockType = node.parameters.terraformBlockType ?? DEFAULT_TERRAFORM_BLOCK_TYPE;
    const address = createAddress(
      blockType,
      node.parameters.resourceType,
      node.parameters.resourceName
    );

    nodeByAddress.set(address, node);
  }

  return nodeByAddress;
}

function parseTerraformBlocks(terraformCode: string): ParseResult {
  const lines = splitTerraformLines(terraformCode);
  const blocks: ParsedBlock[] = [];
  const diagnostics: TerraformDiagnostic[] = [];
  const addresses = new Set<string>();

  for (let index = 0; index < lines.length; index += 1) {
    const lineText = lines[index] ?? "";
    const codeLine = stripLineComment(lineText);
    const trimmedLine = codeLine.trim();

    if (!trimmedLine) {
      continue;
    }

    const headerMatch = BLOCK_HEADER_PATTERN.exec(codeLine);

    if (!headerMatch) {
      const topLevelBlockMatch = TOP_LEVEL_BLOCK_PATTERN.exec(codeLine);

      diagnostics.push({
        severity: "error",
        code:
          topLevelBlockMatch && topLevelBlockMatch[1] !== "resource" && topLevelBlockMatch[1] !== "data"
            ? "terraform.sync.unsupported_block"
            : "terraform.sync.block_header",
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

    const address = createAddress(blockType as TerraformBlockType, resourceType, resourceName);

    if (addresses.has(address)) {
      diagnostics.push({
        severity: "error",
        code: "terraform.sync.duplicate_address",
        line: index + 1,
        resourceAddress: address,
        message: `${address} block이 중복되었습니다.`
      });
    }

    addresses.add(address);

    const headerLineNumber = index + 1;
    const bodyResult = collectBlockBody(lines, index + 1, headerLineNumber, address);
    diagnostics.push(...bodyResult.diagnostics);

    if (!bodyResult.closed) {
      index = lines.length;
      continue;
    }

    const valuesResult = parseAttributes(
      bodyResult.bodyLines,
      address,
      TERRAFORM_NESTED_BLOCK_ATTRIBUTES[resourceType]
    );
    diagnostics.push(...valuesResult.diagnostics);

    blocks.push({
      blockType,
      resourceType,
      resourceName,
      address,
      line: index + 1,
      values: valuesResult.values
    });

    index = bodyResult.endIndex;
  }

  return { blocks, diagnostics };
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
  supportedNestedBlocks?: ReadonlySet<string>
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

      if (supportedNestedBlocks?.has(nestedBlockName) !== true) {
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

      const nestedValues = parseAttributes(nestedBlock.bodyLines, resourceAddress);
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

function createAddress(
  blockType: TerraformBlockType,
  resourceType: string,
  resourceName: string
): string {
  return `${blockType}.${resourceType}.${resourceName}`;
}

function toCamelCase(value: string): string {
  return value.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}
