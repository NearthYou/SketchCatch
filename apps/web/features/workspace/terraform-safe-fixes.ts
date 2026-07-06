import type { AiTerraformSafeFix, TerraformDiagnostic } from "@sketchcatch/types";

const APPLYABLE_TERRAFORM_SAFE_FIXES = new Set([
  "terraform.trailing_comma",
  "terraform.quoted_reference"
]);

export type TerraformSafeFixResult =
  | {
      readonly applied: true;
      readonly code: string;
      readonly message: string;
    }
  | {
      readonly applied: false;
      readonly code: string;
      readonly message: string;
    };

export type TerraformCodeReplacementPreview = {
  readonly currentCode: string;
  readonly nextCode: string;
  readonly sourceLine?: number | undefined;
  readonly source?: "safe_fix" | "amazon_q" | undefined;
};

export function getTerraformSafeFix(diagnostic: TerraformDiagnostic): AiTerraformSafeFix {
  const code = diagnostic.code ?? "terraform.unknown";
  const applicable = APPLYABLE_TERRAFORM_SAFE_FIXES.has(code);

  if (code === "terraform.trailing_comma") {
    return {
      applicable,
      code,
      label: "Trailing comma 제거",
      description: "Terraform attribute 줄 끝의 불필요한 comma를 제거합니다."
    };
  }

  if (code === "terraform.quoted_reference") {
    return {
      applicable,
      code,
      label: "Reference quote 제거",
      description: "Terraform reference를 문자열이 아니라 expression으로 해석되게 quote를 제거합니다."
    };
  }

  return {
    applicable: false,
    code,
    label: "수동 수정 필요",
    description: "이 진단은 의미 판단이 필요해 자동 적용하지 않습니다."
  };
}

export function applyTerraformSafeFix({
  code,
  diagnostic
}: {
  readonly code: string;
  readonly diagnostic: TerraformDiagnostic;
}): TerraformSafeFixResult {
  const fix = getTerraformSafeFix(diagnostic);

  if (!fix.applicable) {
    return {
      applied: false,
      code,
      message: fix.description
    };
  }

  if (diagnostic.line === undefined || diagnostic.line < 1) {
    return {
      applied: false,
      code,
      message: "진단 위치를 특정할 수 없어 자동 적용하지 않았습니다."
    };
  }

  if (diagnostic.code === "terraform.trailing_comma") {
    return applyLineFix(code, diagnostic.line, (line) => line.replace(/,\s*$/, ""));
  }

  if (diagnostic.code === "terraform.quoted_reference") {
    return applyLineFix(code, diagnostic.line, unquoteSimpleTerraformReference);
  }

  return {
    applied: false,
    code,
    message: fix.description
  };
}

export function applyTerraformCodeReplacement({
  code,
  preview
}: {
  readonly code: string;
  readonly preview: TerraformCodeReplacementPreview;
}): TerraformSafeFixResult {
  if (preview.currentCode.trim().length === 0) {
    return {
      applied: false,
      code,
      message: "AI 제안 코드 조각이 비어 있어 적용하지 않았습니다."
    };
  }

  const match = findTerraformCodeReplacementMatch(code, preview);

  if (!match) {
    return {
      applied: false,
      code,
      message: "AI가 인용한 기존 코드 조각을 현재 Terraform 파일에서 찾지 못했습니다."
    };
  }

  return {
    applied: true,
    code: `${code.slice(0, match.index)}${preview.nextCode}${code.slice(match.index + match.length)}`,
    message: "Amazon Q 제안 코드 조각을 적용했습니다."
  };
}

function findTerraformCodeReplacementMatch(
  code: string,
  preview: TerraformCodeReplacementPreview
): { readonly index: number; readonly length: number } | null {
  if (preview.sourceLine !== undefined && preview.sourceLine > 0) {
    const sourceLineStartOffset = getLineStartOffset(code, preview.sourceLine);

    if (sourceLineStartOffset !== undefined) {
      const exactLineMatch = findClosestExactMatch(code, preview.currentCode, sourceLineStartOffset);

      if (exactLineMatch) {
        return exactLineMatch;
      }

      const trimmedCurrentCode = preview.currentCode.trim();
      const sourceLineText = getLineText(code, preview.sourceLine);
      const trimmedMatchIndex = sourceLineText?.indexOf(trimmedCurrentCode) ?? -1;

      if (trimmedCurrentCode.length > 0 && trimmedMatchIndex >= 0) {
        return {
          index: sourceLineStartOffset + trimmedMatchIndex,
          length: trimmedCurrentCode.length
        };
      }
    }
  }

  const fallbackIndex = code.indexOf(preview.currentCode);

  return fallbackIndex >= 0
    ? {
        index: fallbackIndex,
        length: preview.currentCode.length
      }
    : null;
}

function findClosestExactMatch(
  code: string,
  snippet: string,
  targetOffset: number
): { readonly index: number; readonly length: number } | null {
  let closestIndex = -1;
  let closestDistance = Number.POSITIVE_INFINITY;
  let searchIndex = code.indexOf(snippet);

  while (searchIndex >= 0) {
    const distance = Math.abs(searchIndex - targetOffset);

    if (distance < closestDistance) {
      closestIndex = searchIndex;
      closestDistance = distance;
    }

    searchIndex = code.indexOf(snippet, searchIndex + Math.max(snippet.length, 1));
  }

  return closestIndex >= 0
    ? {
        index: closestIndex,
        length: snippet.length
      }
    : null;
}

function getLineStartOffset(code: string, lineNumber: number): number | undefined {
  const lines = code.split(/\r?\n/);

  if (lineNumber < 1 || lineNumber > lines.length) {
    return undefined;
  }

  const lineBreak = code.includes("\r\n") ? "\r\n" : "\n";
  return lines.slice(0, lineNumber - 1).join(lineBreak).length + (lineNumber > 1 ? lineBreak.length : 0);
}

function getLineText(code: string, lineNumber: number): string | undefined {
  return code.split(/\r?\n/)[lineNumber - 1];
}

function applyLineFix(
  code: string,
  lineNumber: number,
  fixLine: (line: string) => string
): TerraformSafeFixResult {
  const lineBreak = code.includes("\r\n") ? "\r\n" : "\n";
  const lines = code.split(/\r?\n/);
  const lineIndex = lineNumber - 1;
  const currentLine = lines[lineIndex];

  if (currentLine === undefined) {
    return {
      applied: false,
      code,
      message: "진단 줄이 현재 Terraform 코드 범위를 벗어났습니다."
    };
  }

  const nextLine = fixLine(currentLine);

  if (nextLine === currentLine) {
    return {
      applied: false,
      code,
      message: "안전하게 바꿀 수 있는 코드 조각을 찾지 못했습니다."
    };
  }

  lines[lineIndex] = nextLine;

  return {
    applied: true,
    code: lines.join(lineBreak),
    message: "Terraform 안전 수정안을 적용했습니다."
  };
}

function unquoteSimpleTerraformReference(line: string): string {
  return line.replace(
    /(=\s*)"((?:data\.)?[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+)"/,
    "$1$2"
  );
}

