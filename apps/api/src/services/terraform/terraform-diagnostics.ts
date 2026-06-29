import type { TerraformDiagnostic } from "@sketchcatch/types";

const BLOCK_HEADER_PATTERN =
  /^\s*(resource|data)\s+"([^"]+)"\s+"([^"]+)"\s*\{\s*$/;
const QUOTED_REFERENCE_PATTERN =
  /"((?:aws_[A-Za-z0-9_]+|data\.aws_[A-Za-z0-9_]+)\.[A-Za-z0-9_]+\.[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)"/g;

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
    ...checkQuotedReferences(terraformCode)
  ];
}

function checkBalancedTokens(terraformCode: string): TerraformDiagnostic[] {
  const diagnostics: TerraformDiagnostic[] = [];
  const stack: Array<{ token: "{" | "["; line: number }> = [];
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

      if (char === "{" || char === "[") {
        stack.push({ token: char, line: lineIndex + 1 });
        continue;
      }

      if (char === "}" || char === "]") {
        const expectedOpeningToken = char === "}" ? "{" : "[";
        const last = stack.pop();

        if (!last || last.token !== expectedOpeningToken) {
          diagnostics.push({
            severity: "error",
            code: "terraform.unbalanced",
            line: lineIndex + 1,
            message: `${char}에 대응하는 여는 기호가 없습니다.`
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

  lines.forEach((lineText, index) => {
    const codeLine = stripLineComment(lineText);
    const trimmedLine = codeLine.trim();

    if (!trimmedLine.startsWith("resource") && !trimmedLine.startsWith("data")) {
      return;
    }

    const match = BLOCK_HEADER_PATTERN.exec(codeLine);

    if (!match) {
      diagnostics.push({
        severity: "error",
        code: "terraform.block_header",
        line: index + 1,
        message: "block header는 resource/data \"type\" \"name\" { 형식이어야 합니다."
      });
      return;
    }

    const [, blockType, resourceType, resourceName] = match;
    const address = `${blockType}.${resourceType}.${resourceName}`;

    if (addresses.has(address)) {
      diagnostics.push({
        severity: "warning",
        code: "terraform.duplicate_address",
        line: index + 1,
        resourceAddress: address,
        message: `${address} block이 중복되었습니다.`
      });
    }

    addresses.add(address);

    if (isEmptyBlock(lines, index)) {
      diagnostics.push({
        severity: "warning",
        code: "terraform.empty_block",
        line: index + 1,
        resourceAddress: address,
        message: `${address} block에 attribute가 없습니다.`
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
  return terraformCode.split("\n").map((line) => line.replace(/\r$/, ""));
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
