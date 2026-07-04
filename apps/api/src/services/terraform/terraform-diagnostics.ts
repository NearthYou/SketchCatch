import type {
  TerraformBlockType,
  TerraformDiagnostic,
  TerraformValidateRequest
} from "@sketchcatch/types";
import { getResourceDefinitionByTerraform } from "@sketchcatch/types/resource-definitions";

const BLOCK_HEADER_PATTERN =
  /^\s*(resource|data)\s+"([^"]+)"\s+"([^"]+)"\s*\{\s*(?:\}\s*)?$/;
const TOP_LEVEL_BLOCK_PATTERN = /^\s*([A-Za-z_][A-Za-z0-9_]*)\b/;
const ATTRIBUTE_ASSIGNMENT_PATTERN = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;
const ATTRIBUTE_DOUBLE_EQUALS_PATTERN = /^\s*[A-Za-z_][A-Za-z0-9_]*\s*==/;
const ATTRIBUTE_LIKE_PATTERN = /^\s*[A-Za-z_][A-Za-z0-9_]*\s+\S+/;
const NESTED_BLOCK_PATTERN = /^\s*[A-Za-z_][A-Za-z0-9_]*\s*\{\s*$/;
const QUOTED_REFERENCE_PATTERN =
  /"((?:aws_[A-Za-z0-9_]+|data\.aws_[A-Za-z0-9_]+)\.[A-Za-z0-9_]+\.[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)"/g;
const TERRAFORM_REFERENCE_PATTERN =
  /\b(?:data\.aws_[A-Za-z0-9_]+\.[A-Za-z0-9_]+|aws_[A-Za-z0-9_]+\.[A-Za-z0-9_]+)(?:\.[A-Za-z0-9_]+)+\b/g;
const TERRAFORM_NESTED_BLOCK_ATTRIBUTES: Record<string, ReadonlySet<string>> = {
  aws_ami: new Set(["filter"]),
  aws_route_table: new Set(["route"]),
  aws_security_group: new Set(["egress", "ingress"])
};

type TerraformValidationFile = {
  readonly fileName: string;
  readonly terraformCode: string;
};

type TerraformBlockHeader = {
  readonly address: string;
  readonly blockType: TerraformBlockType;
  readonly line: number;
  readonly resourceName: string;
  readonly resourceType: string;
};

type ActiveTerraformBlock = {
  readonly address: string;
  readonly resourceType: string;
};

export function createTerraformDiagnostics(terraformCode: string): TerraformDiagnostic[] {
  const trimmedCode = terraformCode.trim();

  if (trimmedCode.length === 0) {
    return [
      {
        severity: "error",
        code: "terraform.empty",
        message: "Terraform 코드가 비어 있습니다."
      }
    ];
  }

  return [
    ...checkBalancedTokens(terraformCode),
    ...checkBlocks(terraformCode),
    ...checkBodySyntax(terraformCode),
    ...checkUndefinedReferences(terraformCode),
    ...checkQuotedReferences(terraformCode)
  ];
}

export function createTerraformValidationDiagnostics(
  input: TerraformValidateRequest
): TerraformDiagnostic[] {
  const files = toValidationFiles(input);
  const nonEmptyFiles = files.filter((file) => file.terraformCode.trim().length > 0);

  if (nonEmptyFiles.length === 0) {
    return createTerraformDiagnostics("").map((diagnostic) =>
      addDiagnosticSource(diagnostic, files[0]?.fileName ?? "main.tf")
    );
  }

  return nonEmptyFiles.flatMap((file) =>
    createTerraformDiagnostics(file.terraformCode).map((diagnostic) =>
      addDiagnosticSource(diagnostic, file.fileName)
    )
  );
}

export function createFirstBlockingTerraformDiagnostic(
  terraformCode: string
): TerraformDiagnostic | null {
  return getFirstDiagnosticBySourceOrder(
    createTerraformDiagnostics(terraformCode).filter(
      (diagnostic) => diagnostic.severity === "error"
    )
  );
}

export function getFirstDiagnosticBySourceOrder(
  diagnostics: readonly TerraformDiagnostic[]
): TerraformDiagnostic | null {
  const [firstDiagnostic] = [...diagnostics].sort(
    (left, right) => getDiagnosticSortLine(left) - getDiagnosticSortLine(right)
  );

  return firstDiagnostic ?? null;
}

function getDiagnosticSortLine(diagnostic: TerraformDiagnostic): number {
  return diagnostic.line ?? Number.MAX_SAFE_INTEGER;
}

function checkBalancedTokens(terraformCode: string): TerraformDiagnostic[] {
  const diagnostics: TerraformDiagnostic[] = [];
  const stack: Array<{ token: "{" | "[" | "("; line: number }> = [];
  let inString = false;
  let escaped = false;

  splitTerraformLines(terraformCode).forEach((lineText, lineIndex) => {
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

      if (inString) {
        continue;
      }

      if (isLineCommentStart(lineText, index)) {
        break;
      }

      if (char === "{" || char === "[" || char === "(") {
        stack.push({ token: char, line: lineIndex + 1 });
        continue;
      }

      if (char === "}" || char === "]" || char === ")") {
        const expectedOpeningToken = toOpeningToken(char);
        const last = stack.pop();

        if (!last) {
          diagnostics.push({
            severity: "error",
            code: "terraform.unbalanced",
            line: lineIndex + 1,
            message: `${char}에 대응하는 여는 기호가 없습니다.`
          });
          continue;
        }

        if (last.token !== expectedOpeningToken) {
          diagnostics.push({
            severity: "error",
            code: "terraform.unbalanced",
            line: last.line,
            message: `${last.token}에 대응하는 닫는 기호가 없습니다.`
          });
        }
      }
    }
  });

  if (inString) {
    diagnostics.push({
      severity: "error",
      code: "terraform.unbalanced",
      message: "문자열 따옴표가 닫히지 않았습니다."
    });
  }

  for (const item of stack) {
    diagnostics.push({
      severity: "error",
      code: "terraform.unbalanced",
      line: item.line,
      message: `${item.token}에 대응하는 닫는 기호가 없습니다.`
    });
  }

  return diagnostics;
}

function checkBlocks(terraformCode: string): TerraformDiagnostic[] {
  const diagnostics: TerraformDiagnostic[] = [];
  const addresses = new Set<string>();
  const lines = splitTerraformLines(terraformCode);
  let depth = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const lineText = lines[index] ?? "";
    const codeLine = stripLineComment(lineText);
    const trimmedLine = codeLine.trim();
    const currentDepth = depth;

    if (!trimmedLine) {
      continue;
    }

    const topLevelBlockMatch = TOP_LEVEL_BLOCK_PATTERN.exec(codeLine);

    if (
      currentDepth === 0 &&
      topLevelBlockMatch &&
      topLevelBlockMatch[1] !== "resource" &&
      topLevelBlockMatch[1] !== "data" &&
      trimmedLine.endsWith("{")
    ) {
      diagnostics.push({
        severity: "error",
        code: "terraform.unsupported_block",
        line: index + 1,
        message: "Terraform editor 검증은 resource/data block만 지원합니다."
      });
    }

    if (
      currentDepth === 0 &&
      (trimmedLine.startsWith("resource") || trimmedLine.startsWith("data"))
    ) {
      const match = BLOCK_HEADER_PATTERN.exec(codeLine);

      if (!match) {
        diagnostics.push({
          severity: "error",
          code: "terraform.block_header",
          line: index + 1,
          message: "block header는 resource/data \"type\" \"name\" { 형식이어야 합니다."
        });
        depth = Math.max(0, depth + getBraceDelta(codeLine));
        continue;
      }

      const [, blockType, resourceType, resourceName] = match;

      if (!blockType || !resourceType || !resourceName) {
        diagnostics.push({
          severity: "error",
          code: "terraform.block_header",
          line: index + 1,
          message: "block header는 resource/data \"type\" \"name\" { 형식이어야 합니다."
        });
        depth = Math.max(0, depth + getBraceDelta(codeLine));
        continue;
      }

      const typedBlockType = blockType as TerraformBlockType;
      const address = `${blockType}.${resourceType}.${resourceName}`;
      const definition = getResourceDefinitionByTerraform(typedBlockType, resourceType);

      if (!definition && isAwsTerraformType(resourceType, typedBlockType)) {
        diagnostics.push({
          severity: "warning",
          code: "terraform.unsupported_resource",
          line: index + 1,
          resourceAddress: address,
          message: `${address}은 현재 SketchCatch Terraform editor가 아는 리소스가 아닙니다.`
        });
      }

      if (addresses.has(address)) {
        diagnostics.push({
          severity: "error",
          code: "terraform.duplicate_address",
          line: index + 1,
          resourceAddress: address,
          message: `${address} block이 중복되었습니다.`
        });
      }

      addresses.add(address);

      if (isInlineEmptyBlock(codeLine) || isEmptyBlock(lines, index)) {
        diagnostics.push({
          severity: "warning",
          code: "terraform.empty_block",
          line: index + 1,
          resourceAddress: address,
          message: `${address} block에 attribute가 없습니다.`
        });
      }
    }

    depth = Math.max(0, depth + getBraceDelta(codeLine));
  }

  return diagnostics;
}

function checkBodySyntax(terraformCode: string): TerraformDiagnostic[] {
  const diagnostics: TerraformDiagnostic[] = [];
  const lines = splitTerraformLines(terraformCode);
  let depth = 0;
  let activeBlock: ActiveTerraformBlock | null = null;

  lines.forEach((lineText, index) => {
    const codeLine = stripLineComment(lineText);
    const trimmedLine = codeLine.trim();

    if (!trimmedLine) {
      return;
    }

    const header = toTerraformBlockHeader(codeLine, index + 1);

    if (depth === 0 && header) {
      activeBlock = {
        address: header.address,
        resourceType: header.resourceType
      };
      depth += getBraceDelta(codeLine);

      if (depth <= 0) {
        activeBlock = null;
        depth = 0;
      }

      return;
    }

    if (activeBlock && depth === 1 && trimmedLine !== "}") {
      diagnostics.push(...checkTopLevelBlockBodyLine(trimmedLine, index + 1, activeBlock));
    }

    depth += getBraceDelta(codeLine);

    if (depth <= 0) {
      activeBlock = null;
      depth = 0;
    }
  });

  return diagnostics;
}

function checkTopLevelBlockBodyLine(
  trimmedLine: string,
  line: number,
  activeBlock: ActiveTerraformBlock
): TerraformDiagnostic[] {
  if (ATTRIBUTE_DOUBLE_EQUALS_PATTERN.test(trimmedLine)) {
    return [
      {
        severity: "error",
        code: "terraform.attribute_syntax",
        line,
        resourceAddress: activeBlock.address,
        message: "block 내부 값은 attribute = value 또는 nested_block { 형식이어야 합니다."
      }
    ];
  }

  const assignmentMatch = ATTRIBUTE_ASSIGNMENT_PATTERN.exec(trimmedLine);

  if (assignmentMatch) {
    const [, attributeName, rawValue] = assignmentMatch;

    if (attributeName && isNestedBlockAttribute(activeBlock.resourceType, attributeName)) {
      return [
        {
          severity: "error",
          code: "terraform.nested_block_assignment",
          line,
          resourceAddress: activeBlock.address,
          message: `${attributeName}는 attribute가 아니라 nested block 형식으로 작성해야 합니다.`
        }
      ];
    }

    if (!rawValue || rawValue.trim().length === 0) {
      return [
        {
          severity: "error",
          code: "terraform.attribute_empty",
          line,
          resourceAddress: activeBlock.address,
          message: "attribute에는 = 뒤에 값이 필요합니다."
        }
      ];
    }

    return [];
  }

  if (NESTED_BLOCK_PATTERN.test(trimmedLine)) {
    return [];
  }

  if (ATTRIBUTE_LIKE_PATTERN.test(trimmedLine)) {
    return [
      {
        severity: "error",
        code: "terraform.attribute_syntax",
        line,
        resourceAddress: activeBlock.address,
        message: "block 내부 값은 attribute = value 또는 nested_block { 형식이어야 합니다."
      }
    ];
  }

  return [];
}

function checkUndefinedReferences(terraformCode: string): TerraformDiagnostic[] {
  const diagnostics: TerraformDiagnostic[] = [];
  const lines = splitTerraformLines(terraformCode);
  const declaredAddresses = new Set(
    collectTerraformBlockHeaders(lines).map((header) => toReferenceAddressFromHeader(header))
  );
  const reportedReferences = new Set<string>();

  lines.forEach((lineText, index) => {
    const codeLine = replaceStringLiteralsWithSpaces(stripLineComment(lineText));

    for (const match of codeLine.matchAll(TERRAFORM_REFERENCE_PATTERN)) {
      const referenceAddress = toReferenceAddressFromExpression(match[0]);

      if (
        !referenceAddress ||
        declaredAddresses.has(referenceAddress) ||
        reportedReferences.has(referenceAddress)
      ) {
        continue;
      }

      reportedReferences.add(referenceAddress);
      diagnostics.push({
        severity: "warning",
        code: "terraform.undefined_reference",
        line: index + 1,
        resourceAddress: referenceAddress,
        message: `${referenceAddress} reference가 현재 Terraform 코드에 선언되어 있지 않습니다.`
      });
    }
  });

  return diagnostics;
}

function isEmptyBlock(lines: string[], headerIndex: number): boolean {
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const lineText = lines[index];

    if (lineText === undefined) {
      continue;
    }

    const trimmedLine = stripLineComment(lineText).trim();

    if (!trimmedLine) {
      continue;
    }

    return trimmedLine === "}";
  }

  return false;
}

function isInlineEmptyBlock(lineText: string): boolean {
  return /\{\s*\}\s*$/.test(stripLineComment(lineText));
}

function checkQuotedReferences(terraformCode: string): TerraformDiagnostic[] {
  const diagnostics: TerraformDiagnostic[] = [];
  const lines = splitTerraformLines(terraformCode);

  lines.forEach((lineText, index) => {
    const codeLine = stripLineComment(lineText);

    for (const match of codeLine.matchAll(QUOTED_REFERENCE_PATTERN)) {
      diagnostics.push({
        severity: "warning",
        code: "terraform.quoted_reference",
        line: index + 1,
        resourceAddress: match[1],
        message: `${match[1]} Terraform reference가 문자열로 감싸져 있습니다.`
      });
    }
  });

  return diagnostics;
}

function splitTerraformLines(terraformCode: string): string[] {
  return terraformCode.split(/\r?\n/);
}

function toValidationFiles(input: TerraformValidateRequest): TerraformValidationFile[] {
  if (input.terraformFiles && input.terraformFiles.length > 0) {
    return input.terraformFiles.map((file) => ({
      fileName: file.fileName,
      terraformCode: file.terraformCode
    }));
  }

  return [
    {
      fileName: "main.tf",
      terraformCode: input.terraformCode
    }
  ];
}

function addDiagnosticSource(
  diagnostic: TerraformDiagnostic,
  sourceFileName: string
): TerraformDiagnostic {
  return {
    ...diagnostic,
    sourceFileName: diagnostic.sourceFileName ?? sourceFileName
  };
}

function collectTerraformBlockHeaders(lines: readonly string[]): TerraformBlockHeader[] {
  return lines.flatMap((lineText, index) => {
    const header = toTerraformBlockHeader(stripLineComment(lineText), index + 1);
    return header ? [header] : [];
  });
}

function toTerraformBlockHeader(codeLine: string, line: number): TerraformBlockHeader | null {
  const match = BLOCK_HEADER_PATTERN.exec(codeLine);

  if (!match) {
    return null;
  }

  const [, blockType, resourceType, resourceName] = match;

  if (!blockType || !resourceType || !resourceName) {
    return null;
  }

  const typedBlockType = blockType as TerraformBlockType;

  return {
    address: `${typedBlockType}.${resourceType}.${resourceName}`,
    blockType: typedBlockType,
    line,
    resourceName,
    resourceType
  };
}

function toReferenceAddressFromHeader(header: TerraformBlockHeader): string {
  return header.blockType === "data"
    ? `data.${header.resourceType}.${header.resourceName}`
    : `${header.resourceType}.${header.resourceName}`;
}

function toReferenceAddressFromExpression(expression: string): string | null {
  const parts = expression.split(".");

  if (parts[0] === "data") {
    const [dataPrefix, resourceType, resourceName] = parts;
    return dataPrefix && resourceType && resourceName
      ? `${dataPrefix}.${resourceType}.${resourceName}`
      : null;
  }

  const [resourceType, resourceName] = parts;
  return resourceType && resourceName ? `${resourceType}.${resourceName}` : null;
}

function getBraceDelta(lineText: string): number {
  let delta = 0;
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

    if (inString) {
      continue;
    }

    if (char === "{") {
      delta += 1;
      continue;
    }

    if (char === "}") {
      delta -= 1;
    }
  }

  return delta;
}

function isNestedBlockAttribute(resourceType: string, attributeName: string): boolean {
  return TERRAFORM_NESTED_BLOCK_ATTRIBUTES[resourceType]?.has(attributeName) === true;
}

function isAwsTerraformType(resourceType: string, blockType: TerraformBlockType): boolean {
  return resourceType.startsWith("aws_") || (blockType === "data" && resourceType.startsWith("aws_"));
}

function replaceStringLiteralsWithSpaces(lineText: string): string {
  let result = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < lineText.length; index += 1) {
    const char = lineText[index];

    if (escaped) {
      result += " ";
      escaped = false;
      continue;
    }

    if (char === "\\") {
      result += " ";
      escaped = true;
      continue;
    }

    if (char === "\"") {
      result += " ";
      inString = !inString;
      continue;
    }

    result += inString ? " " : char;
  }

  return result;
}

function toOpeningToken(closingToken: "}" | "]" | ")"): "{" | "[" | "(" {
  if (closingToken === "}") {
    return "{";
  }

  return closingToken === "]" ? "[" : "(";
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

    if (!inString && isLineCommentStart(lineText, index)) {
      return lineText.slice(0, index);
    }
  }

  return lineText;
}

function isLineCommentStart(lineText: string, index: number): boolean {
  return lineText[index] === "#" || (lineText[index] === "/" && lineText[index + 1] === "/");
}
