import type {
  TerraformBlockType,
  TerraformDiagnostic,
  TerraformValidateRequest
} from "@sketchcatch/types";
import { getResourceDefinitionByTerraform } from "@sketchcatch/types/resource-definitions";
import { isTerraformNestedBlockAttribute } from "./terraform-nested-blocks.js";

const BLOCK_HEADER_PATTERN =
  /^\s*(resource|data)\s+"([^"]+)"\s+"([^"]+)"\s*\{\s*(?:\}\s*)?$/;
const PROVIDER_BLOCK_HEADER_PATTERN = /^\s*provider\s+"([^"]+)"\s*\{\s*(?:\}\s*)?$/;
const PROVIDER_BLOCK_PREFIX_PATTERN = /^provider\b/;
const TOP_LEVEL_BLOCK_PATTERN = /^\s*([A-Za-z_][A-Za-z0-9_]*)\b/;
const ATTRIBUTE_ASSIGNMENT_PATTERN = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;
const ATTRIBUTE_DOUBLE_EQUALS_PATTERN = /^\s*[A-Za-z_][A-Za-z0-9_]*\s*==/;
const ATTRIBUTE_LIKE_PATTERN = /^\s*[A-Za-z_][A-Za-z0-9_]*\s+\S+/;
const NESTED_BLOCK_PATTERN = /^\s*[A-Za-z_][A-Za-z0-9_]*\s*\{\s*$/;
const QUOTED_REFERENCE_PATTERN =
  /"((?:aws_[A-Za-z0-9_]+|data\.aws_[A-Za-z0-9_]+)\.[A-Za-z0-9_]+\.[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)"/g;
const TERRAFORM_REFERENCE_PATTERN =
  /\b(?:data\.aws_[A-Za-z0-9_]+\.[A-Za-z0-9_]+|aws_[A-Za-z0-9_]+\.[A-Za-z0-9_]+)(?:\.[A-Za-z0-9_]+)*\b/g;
const TRAILING_ATTRIBUTE_COMMA_PATTERN = /^\s*[A-Za-z_][A-Za-z0-9_]*\s*=.+,\s*$/;
const HEREDOC_MARKER_PATTERN = /<<-?\s*([A-Za-z_][A-Za-z0-9_]*)/g;
const STRING_LITERAL_PATTERN = /^"(?:[^"\\]|\\.)*"$/s;
const NUMBER_LITERAL_PATTERN = /^-?\d+(?:\.\d+)?$/;
const EC2_INSTANCE_TYPE_PATTERN =
  /^(?:t2|t3|t3a|t4g|m5|m5a|m5n|m6i|m6a|m6g|m7i|m7a|m7g|c5|c5a|c5n|c6i|c6a|c6g|c7i|c7a|c7g|r5|r5a|r5n|r6i|r6a|r6g|r7i|r7a|r7g|a1|g4dn|g5|p3|p4d|p5|i3|i4i|d3|x2idn|x2iedn)\.(?:nano|micro|small|medium|large|xlarge|[0-9]+xlarge|metal)$/;

const FAST_AWS_NUMBER_ATTRIBUTES: Record<string, ReadonlySet<string>> = {
  aws_security_group_rule: new Set(["from_port", "to_port"])
};

const FAST_AWS_JSON_STRING_ATTRIBUTES: Record<string, ReadonlySet<string>> = {
  aws_iam_policy: new Set(["policy"]),
  aws_iam_role: new Set(["assume_role_policy"])
};

const FAST_AWS_UNSUPPORTED_ARGUMENTS: Record<string, ReadonlySet<string>> = {
  aws_s3_bucket: new Set(["bucket_purpose", "origin_resource_id", "public_access_block"])
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

type TerraformAttribute = {
  readonly line: number;
  readonly name: string;
  readonly rawValue: string;
  readonly valueKind: "expression" | "number" | "string";
};

type TerraformResourceBlock = TerraformBlockHeader & {
  readonly attributes: readonly TerraformAttribute[];
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

  const commentStrippedCode = stripBlockCommentsPreservingLines(terraformCode);
  const syntaxScannedCode = stripHeredocsPreservingLines(commentStrippedCode);
  const tokenDiagnostics = checkBalancedTokens(syntaxScannedCode);
  const blockDiagnostics = checkBlocks(syntaxScannedCode);

  if (hasBlockingTokenDiagnostics(tokenDiagnostics)) {
    return mergeBlockErrorsAroundTokenDiagnostics(tokenDiagnostics, blockDiagnostics);
  }

  return [
    ...tokenDiagnostics,
    ...blockDiagnostics,
    ...checkBodySyntax(syntaxScannedCode),
    ...checkUnexpectedTokens(syntaxScannedCode),
    ...checkTrailingAttributeCommas(syntaxScannedCode),
    ...checkUndefinedReferences(syntaxScannedCode),
    ...checkQuotedReferences(syntaxScannedCode),
    ...checkFastAwsSchemaDiagnostics(commentStrippedCode)
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

function sortDiagnosticsBySourceOrder(
  diagnostics: readonly TerraformDiagnostic[]
): TerraformDiagnostic[] {
  return [...diagnostics].sort(
    (left, right) => getDiagnosticSortLine(left) - getDiagnosticSortLine(right)
  );
}

function mergeBlockErrorsAroundTokenDiagnostics(
  tokenDiagnostics: readonly TerraformDiagnostic[],
  blockDiagnostics: readonly TerraformDiagnostic[]
): TerraformDiagnostic[] {
  const [firstTokenDiagnostic] = tokenDiagnostics;
  const firstTokenLine = firstTokenDiagnostic
    ? getDiagnosticSortLine(firstTokenDiagnostic)
    : Number.MAX_SAFE_INTEGER;
  const blockErrors = blockDiagnostics.filter((diagnostic) => diagnostic.severity === "error");
  const earlierBlockErrors = blockErrors.filter(
    (diagnostic) => getDiagnosticSortLine(diagnostic) < firstTokenLine
  );
  const laterBlockErrors = blockErrors.filter(
    (diagnostic) => getDiagnosticSortLine(diagnostic) >= firstTokenLine
  );

  return [
    ...sortDiagnosticsBySourceOrder(earlierBlockErrors),
    ...tokenDiagnostics,
    ...sortDiagnosticsBySourceOrder(laterBlockErrors)
  ];
}

function hasBlockingTokenDiagnostics(diagnostics: readonly TerraformDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

function checkBalancedTokens(terraformCode: string): TerraformDiagnostic[] {
  const diagnostics: TerraformDiagnostic[] = [];
  const stack: Array<{ token: "{" | "[" | "("; line: number }> = [];
  let inString = false;
  let escaped = false;
  let stringStartLine: number | null = null;

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

        if (inString) {
          stringStartLine = lineIndex + 1;
        } else {
          stringStartLine = null;
        }

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

    if (inString) {
      diagnostics.push({
        severity: "error",
        code: "terraform.unbalanced",
        line: stringStartLine ?? lineIndex + 1,
        message: "문자열 따옴표가 닫히지 않았습니다."
      });
    }

    inString = false;
    escaped = false;
    stringStartLine = null;
  });

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
      !isSupportedTopLevelBlockType(topLevelBlockMatch[1]) &&
      trimmedLine.endsWith("{")
    ) {
      diagnostics.push({
        severity: "error",
        code: "terraform.unsupported_block",
        line: index + 1,
        message: "Terraform editor 검증은 resource/data block만 지원합니다."
      });
    }

    if (currentDepth === 0 && PROVIDER_BLOCK_PREFIX_PATTERN.test(trimmedLine)) {
      const match = PROVIDER_BLOCK_HEADER_PATTERN.exec(codeLine);

      if (!match) {
        diagnostics.push({
          severity: "error",
          code: "terraform.block_header",
          line: index + 1,
          message: "provider block header는 provider \"name\" { 형식이어야 합니다."
        });
      }
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

function isSupportedTopLevelBlockType(blockType: string | undefined): boolean {
  return blockType === "resource" || blockType === "data" || blockType === "provider";
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
        severity: "error",
        code: "terraform.undefined_reference",
        line: index + 1,
        resourceAddress: referenceAddress,
        message: `${referenceAddress} reference가 현재 Terraform 코드에 선언되어 있지 않습니다.`
      });
    }
  });

  return diagnostics;
}

function checkUnexpectedTokens(terraformCode: string): TerraformDiagnostic[] {
  const diagnostics: TerraformDiagnostic[] = [];
  let depth = 0;

  splitTerraformLines(terraformCode).forEach((lineText, lineIndex) => {
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

      if (isLineCommentStart(lineText, index)) {
        break;
      }

      if (char === "{") {
        depth += 1;
        continue;
      }

      if (char !== "}") {
        continue;
      }

      depth = Math.max(depth - 1, 0);

      if (depth === 0 && hasCodeAfterToken(lineText, index + 1)) {
        diagnostics.push({
          severity: "error",
          code: "terraform.unexpected_token",
          line: lineIndex + 1,
          message: "닫힌 block 뒤에 알 수 없는 Terraform 코드가 붙어 있습니다."
        });
      }
    }
  });

  return diagnostics;
}

function checkTrailingAttributeCommas(terraformCode: string): TerraformDiagnostic[] {
  const diagnostics: TerraformDiagnostic[] = [];

  splitTerraformLines(terraformCode).forEach((lineText, index) => {
    const codeLine = stripLineComment(lineText);

    if (TRAILING_ATTRIBUTE_COMMA_PATTERN.test(codeLine)) {
      diagnostics.push({
        severity: "error",
        code: "terraform.trailing_comma",
        line: index + 1,
        message: "Terraform attribute 할당 끝에는 쉼표를 붙이지 않습니다."
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

function checkFastAwsSchemaDiagnostics(terraformCode: string): TerraformDiagnostic[] {
  return collectTerraformResourceBlocks(terraformCode).flatMap((block) => [
    ...checkFastAwsUnsupportedArguments(block),
    ...checkFastAwsAttributeTypes(block),
    ...checkFastAwsJsonStrings(block),
    ...checkFastAwsCatalogValues(block)
  ]);
}

function checkFastAwsUnsupportedArguments(block: TerraformResourceBlock): TerraformDiagnostic[] {
  const unsupportedAttributes = FAST_AWS_UNSUPPORTED_ARGUMENTS[block.resourceType];

  if (!unsupportedAttributes) {
    return [];
  }

  return block.attributes
    .filter((attribute) => unsupportedAttributes.has(attribute.name))
    .map((attribute) => ({
      severity: "error",
      code: "terraform.unsupported_argument",
      line: attribute.line,
      resourceAddress: block.address,
      message: `${block.resourceType}.${attribute.name} is not supported by the AWS Terraform provider.`
    }));
}

function checkFastAwsAttributeTypes(block: TerraformResourceBlock): TerraformDiagnostic[] {
  const numberAttributes = FAST_AWS_NUMBER_ATTRIBUTES[block.resourceType];

  if (!numberAttributes) {
    return [];
  }

  return block.attributes
    .filter((attribute) => numberAttributes.has(attribute.name) && attribute.valueKind === "string")
    .map((attribute) => ({
      severity: "error",
      code: "terraform.attribute_type",
      line: attribute.line,
      resourceAddress: block.address,
      message: `${block.resourceType}.${attribute.name} must be a number, but received a string.`
    }));
}

function checkFastAwsJsonStrings(block: TerraformResourceBlock): TerraformDiagnostic[] {
  const jsonAttributes = FAST_AWS_JSON_STRING_ATTRIBUTES[block.resourceType];

  if (!jsonAttributes) {
    return [];
  }

  return block.attributes.flatMap((attribute) => {
    if (!jsonAttributes.has(attribute.name) || attribute.valueKind !== "string") {
      return [];
    }

    const jsonText = readTerraformStringValue(attribute.rawValue);

    if (!jsonText || isValidJsonString(jsonText)) {
      return [];
    }

    return [
      {
        severity: "error",
        code: "terraform.invalid_json",
        line: attribute.line,
        resourceAddress: block.address,
        message: `${block.resourceType}.${attribute.name} must contain valid JSON.`
      }
    ];
  });
}

function checkFastAwsCatalogValues(block: TerraformResourceBlock): TerraformDiagnostic[] {
  if (block.resourceType !== "aws_instance") {
    return [];
  }

  return block.attributes.flatMap((attribute) => {
    if (attribute.name !== "instance_type" || attribute.valueKind !== "string") {
      return [];
    }

    const instanceType = readTerraformStringValue(attribute.rawValue);

    if (!instanceType || EC2_INSTANCE_TYPE_PATTERN.test(instanceType)) {
      return [];
    }

    return [
      {
        severity: "error",
        code: "terraform.invalid_catalog_value",
        line: attribute.line,
        resourceAddress: block.address,
        message: `aws_instance.instance_type is not a known EC2 instance type: ${instanceType}.`
      }
    ];
  });
}

function collectTerraformResourceBlocks(terraformCode: string): TerraformResourceBlock[] {
  const blocks: TerraformResourceBlock[] = [];
  const lines = splitTerraformLines(terraformCode);
  let activeBlock: (TerraformBlockHeader & { attributes: TerraformAttribute[] }) | null = null;
  let depth = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const lineText = lines[index] ?? "";
    const codeLine = stripLineComment(lineText);
    const trimmedLine = codeLine.trim();
    const header = depth === 0 ? toTerraformBlockHeader(codeLine, index + 1) : null;

    if (header) {
      activeBlock = {
        ...header,
        attributes: []
      };
      blocks.push(activeBlock);
      depth += getBraceDelta(codeLine);

      if (depth <= 0) {
        activeBlock = null;
        depth = 0;
      }

      continue;
    }

    if (activeBlock && depth === 1 && trimmedLine && trimmedLine !== "}") {
      const attribute = readTerraformAttribute(lines, index, codeLine);

      if (attribute) {
        activeBlock.attributes.push(attribute.attribute);
        index = attribute.endIndex;
      }
    }

    depth += getBraceDelta(codeLine);

    if (depth <= 0) {
      activeBlock = null;
      depth = 0;
    }
  }

  return blocks;
}

function readTerraformAttribute(
  lines: readonly string[],
  index: number,
  codeLine: string
): { attribute: TerraformAttribute; endIndex: number } | null {
  const assignmentMatch = ATTRIBUTE_ASSIGNMENT_PATTERN.exec(codeLine.trim());

  if (!assignmentMatch) {
    return null;
  }

  const [, attributeName, rawValue] = assignmentMatch;

  if (!attributeName || rawValue === undefined) {
    return null;
  }

  const trimmedRawValue = rawValue.trim();
  const heredocDelimiter = findHeredocDelimiter(trimmedRawValue);

  if (heredocDelimiter) {
    const heredoc = readTerraformHeredoc(lines, index + 1, heredocDelimiter);

    return {
      attribute: {
        line: index + 1,
        name: attributeName,
        rawValue: heredoc.value,
        valueKind: "string"
      },
      endIndex: heredoc.endIndex
    };
  }

  return {
    attribute: {
      line: index + 1,
      name: attributeName,
      rawValue: trimmedRawValue,
      valueKind: classifyTerraformValue(trimmedRawValue)
    },
    endIndex: index
  };
}

function readTerraformHeredoc(
  lines: readonly string[],
  startIndex: number,
  delimiter: string
): { value: string; endIndex: number } {
  const valueLines: string[] = [];

  for (let index = startIndex; index < lines.length; index += 1) {
    const lineText = lines[index] ?? "";

    if (lineText.trim() === delimiter) {
      return {
        value: valueLines.join("\n"),
        endIndex: index
      };
    }

    valueLines.push(lineText);
  }

  return {
    value: valueLines.join("\n"),
    endIndex: lines.length - 1
  };
}

function classifyTerraformValue(rawValue: string): TerraformAttribute["valueKind"] {
  if (STRING_LITERAL_PATTERN.test(rawValue)) {
    return "string";
  }

  if (NUMBER_LITERAL_PATTERN.test(rawValue)) {
    return "number";
  }

  return "expression";
}

function readTerraformStringValue(rawValue: string): string | null {
  if (!STRING_LITERAL_PATTERN.test(rawValue)) {
    return rawValue;
  }

  try {
    return JSON.parse(rawValue) as string;
  } catch {
    return rawValue.slice(1, -1);
  }
}

function isValidJsonString(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

function splitTerraformLines(terraformCode: string): string[] {
  return terraformCode.split(/\r?\n/);
}

function stripBlockCommentsPreservingLines(terraformCode: string): string {
  let result = "";
  let inString = false;
  let inBlockComment = false;
  let escaped = false;

  for (let index = 0; index < terraformCode.length; index += 1) {
    const char = terraformCode[index] ?? "";
    const nextChar = terraformCode[index + 1];

    if (inBlockComment) {
      if (char === "*" && nextChar === "/") {
        result += "  ";
        inBlockComment = false;
        index += 1;
        continue;
      }

      result += char === "\n" || char === "\r" ? char : " ";
      continue;
    }

    if (escaped) {
      result += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      result += char;
      escaped = true;
      continue;
    }

    if (char === "\"") {
      result += char;
      inString = !inString;
      continue;
    }

    if (!inString && char === "/" && nextChar === "*") {
      result += "  ";
      inBlockComment = true;
      index += 1;
      continue;
    }

    result += char;
  }

  return result;
}

function stripHeredocsPreservingLines(terraformCode: string): string {
  const lines = splitTerraformLines(terraformCode);
  const strippedLines: string[] = [];
  let heredocDelimiter: string | null = null;

  for (const lineText of lines) {
    if (heredocDelimiter) {
      if (lineText.trim() === heredocDelimiter) {
        heredocDelimiter = null;
      }

      strippedLines.push("");
      continue;
    }

    strippedLines.push(lineText);

    const assignmentMatch = ATTRIBUTE_ASSIGNMENT_PATTERN.exec(stripLineComment(lineText).trim());
    const rawValue = assignmentMatch?.[2]?.trim();
    const nextHeredocDelimiter = rawValue ? findHeredocDelimiter(rawValue) : null;

    if (nextHeredocDelimiter) {
      heredocDelimiter = nextHeredocDelimiter;
    }
  }

  return strippedLines.join("\n");
}

function findHeredocDelimiter(rawValue: string): string | null {
  for (const match of rawValue.matchAll(HEREDOC_MARKER_PATTERN)) {
    if (typeof match.index === "number" && isInsideDoubleQuotedString(rawValue, match.index)) {
      continue;
    }

    return match[1] ?? null;
  }

  return null;
}

function isInsideDoubleQuotedString(source: string, index: number): boolean {
  let quoteCount = 0;
  let escaped = false;

  for (let charIndex = 0; charIndex < index; charIndex += 1) {
    const char = source[charIndex];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      quoteCount += 1;
    }
  }

  return quoteCount % 2 === 1;
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
  return isTerraformNestedBlockAttribute(resourceType, attributeName);
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

function hasCodeAfterToken(lineText: string, startIndex: number): boolean {
  const rest = stripLineComment(lineText.slice(startIndex));

  return rest.trim().length > 0;
}

function isLineCommentStart(lineText: string, index: number): boolean {
  return lineText[index] === "#" || (lineText[index] === "/" && lineText[index + 1] === "/");
}
