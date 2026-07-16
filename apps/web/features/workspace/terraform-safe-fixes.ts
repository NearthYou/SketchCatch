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

export type TerraformSafeFixBatchItem = {
  readonly codePreview?: TerraformCodeReplacementPreview | undefined;
  readonly diagnostic: TerraformDiagnostic;
};

export type TerraformSafeFixBatchResult =
  | {
      readonly applied: true;
      readonly files: readonly { readonly code: string; readonly fileName: string }[];
      readonly message: string;
    }
  | {
      readonly applied: false;
      readonly files: readonly { readonly code: string; readonly fileName: string }[];
      readonly message: string;
    };

export function applyTerraformSafeFixesAtomically({
  files,
  fixes
}: {
  readonly files: readonly { readonly code: string; readonly fileName: string }[];
  readonly fixes: readonly TerraformSafeFixBatchItem[];
}): TerraformSafeFixBatchResult {
  if (fixes.length === 0) {
    return {
      applied: false,
      files,
      message: "적용할 Terraform 수정안이 없습니다."
    };
  }

  const replacements: PlannedTerraformReplacement[] = [];

  for (const [fixIndex, fix] of fixes.entries()) {
    const target = resolveTerraformSafeFixTarget(files, fix.diagnostic);

    if (!target.resolved) {
      return {
        applied: false,
        files,
        message: target.message
      };
    }

    const planned = planTerraformSafeFixReplacement({
      code: target.file.code,
      fileIndex: target.fileIndex,
      fix,
      fixIndex
    });

    if (!planned.planned) {
      return {
        applied: false,
        files,
        message: planned.message
      };
    }

    replacements.push(planned.replacement);
  }

  const conflict = findTerraformReplacementConflict(replacements);

  if (conflict) {
    return {
      applied: false,
      files,
      message: "같은 Terraform 코드 범위를 중복하거나 겹쳐 수정할 수 없습니다."
    };
  }

  const replacementsByFile = groupTerraformReplacementsByFile(replacements);
  const nextFiles = files.map((file, fileIndex) => {
    const fileReplacements = [...(replacementsByFile.get(fileIndex) ?? [])].sort(
      compareTerraformReplacementsForApply
    );
    let code = file.code;

    for (const replacement of fileReplacements) {
      code = `${code.slice(0, replacement.start)}${replacement.nextCode}${code.slice(replacement.end)}`;
    }

    return { ...file, code };
  });

  return {
    applied: true,
    files: nextFiles,
    message: `${fixes.length}개 Terraform 수정안을 적용했습니다.`
  };
}

type PlannedTerraformReplacement = {
  readonly end: number;
  readonly fileIndex: number;
  readonly fixIndex: number;
  readonly nextCode: string;
  readonly sourceLine: number;
  readonly start: number;
};

type TerraformSafeFixTargetResult =
  | {
      readonly file: { readonly code: string; readonly fileName: string };
      readonly fileIndex: number;
      readonly resolved: true;
    }
  | {
      readonly message: string;
      readonly resolved: false;
    };

function resolveTerraformSafeFixTarget(
  files: readonly { readonly code: string; readonly fileName: string }[],
  diagnostic: TerraformDiagnostic
): TerraformSafeFixTargetResult {
  const sourceFileName = diagnostic.sourceFileName?.trim();

  if (!sourceFileName) {
    const onlyFile = files[0];

    if (files.length !== 1 || !onlyFile) {
      return {
        resolved: false,
        message: "진단 대상 Terraform 파일을 특정할 수 없습니다."
      };
    }

    return {
      file: onlyFile,
      fileIndex: 0,
      resolved: true
    };
  }

  const matchingFileIndexes = files.flatMap((file, fileIndex) =>
    file.fileName === sourceFileName ? [fileIndex] : []
  );

  if (matchingFileIndexes.length !== 1) {
    return {
      resolved: false,
      message:
        matchingFileIndexes.length === 0
          ? "진단이 가리키는 Terraform 파일을 찾지 못했습니다."
          : "같은 이름의 Terraform 파일이 여러 개라 수정 대상을 특정할 수 없습니다."
    };
  }

  const fileIndex = matchingFileIndexes[0];
  const file = fileIndex === undefined ? undefined : files[fileIndex];

  return file !== undefined && fileIndex !== undefined
    ? {
        file,
        fileIndex,
        resolved: true
      }
    : {
        resolved: false,
        message: "진단이 가리키는 Terraform 파일을 찾지 못했습니다."
      };
}

function planTerraformSafeFixReplacement({
  code,
  fileIndex,
  fix,
  fixIndex
}: {
  readonly code: string;
  readonly fileIndex: number;
  readonly fix: TerraformSafeFixBatchItem;
  readonly fixIndex: number;
}):
  | { readonly planned: true; readonly replacement: PlannedTerraformReplacement }
  | { readonly message: string; readonly planned: false } {
  if (fix.codePreview !== undefined && fix.codePreview.source !== "safe_fix") {
    if (fix.codePreview.currentCode.trim().length === 0) {
      return {
        planned: false,
        message: "AI 제안 코드 조각이 비어 있어 적용하지 않았습니다."
      };
    }

    const match = findTerraformCodeReplacementMatch(code, fix.codePreview);

    if (!match) {
      return {
        planned: false,
        message: "AI가 인용한 기존 코드 조각을 현재 Terraform 파일에서 찾지 못했습니다."
      };
    }

    return {
      planned: true,
      replacement: {
        end: match.index + match.length,
        fileIndex,
        fixIndex,
        nextCode: fix.codePreview.nextCode,
        sourceLine: getLineNumberAtOffset(code, match.index),
        start: match.index
      }
    };
  }

  const result = applyTerraformSafeFix({ code, diagnostic: fix.diagnostic });

  if (!result.applied) {
    return {
      planned: false,
      message: result.message
    };
  }

  const diff = findSingleTerraformReplacement(code, result.code);

  if (!diff) {
    return {
      planned: false,
      message: "수정 전후 Terraform 코드가 같아 적용하지 않았습니다."
    };
  }

  return {
    planned: true,
    replacement: {
      ...diff,
      fileIndex,
      fixIndex,
      sourceLine: getLineNumberAtOffset(code, diff.start)
    }
  };
}

function findSingleTerraformReplacement(
  currentCode: string,
  nextCode: string
): { readonly end: number; readonly nextCode: string; readonly start: number } | null {
  if (currentCode === nextCode) {
    return null;
  }

  let start = 0;

  while (start < currentCode.length && currentCode[start] === nextCode[start]) {
    start += 1;
  }

  let currentEnd = currentCode.length;
  let nextEnd = nextCode.length;

  while (
    currentEnd > start &&
    nextEnd > start &&
    currentCode[currentEnd - 1] === nextCode[nextEnd - 1]
  ) {
    currentEnd -= 1;
    nextEnd -= 1;
  }

  return {
    end: currentEnd,
    nextCode: nextCode.slice(start, nextEnd),
    start
  };
}

function findTerraformReplacementConflict(
  replacements: readonly PlannedTerraformReplacement[]
): boolean {
  const replacementsByFile = groupTerraformReplacementsByFile(replacements);

  return [...replacementsByFile.values()].some((fileReplacements) => {
    const ordered = [...fileReplacements].sort(
      (left, right) => left.start - right.start || left.end - right.end || left.fixIndex - right.fixIndex
    );

    return ordered.some((replacement, index) => {
      const previous = ordered[index - 1];
      return previous !== undefined && replacement.start < previous.end;
    });
  });
}

function groupTerraformReplacementsByFile(
  replacements: readonly PlannedTerraformReplacement[]
): Map<number, PlannedTerraformReplacement[]> {
  const replacementsByFile = new Map<number, PlannedTerraformReplacement[]>();

  for (const replacement of replacements) {
    const fileReplacements = replacementsByFile.get(replacement.fileIndex) ?? [];
    fileReplacements.push(replacement);
    replacementsByFile.set(replacement.fileIndex, fileReplacements);
  }

  return replacementsByFile;
}

function compareTerraformReplacementsForApply(
  left: PlannedTerraformReplacement,
  right: PlannedTerraformReplacement
): number {
  return (
    right.sourceLine - left.sourceLine ||
    right.start - left.start ||
    right.end - left.end ||
    right.fixIndex - left.fixIndex
  );
}

function getLineNumberAtOffset(code: string, offset: number): number {
  return code.slice(0, offset).split(/\r?\n/).length;
}

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
