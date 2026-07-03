import type { TerraformDiagnostic } from "@sketchcatch/types";

type TerraformDiagnosticLineNumberOptions = {
  readonly codeLineCount: number;
  readonly sourceFileName?: string | null | undefined;
  readonly sourceLineOffset?: number | undefined;
};

export function createTerraformDiagnosticLineNumbers(
  diagnostics: readonly TerraformDiagnostic[],
  {
    codeLineCount,
    sourceFileName,
    sourceLineOffset = 0
  }: TerraformDiagnosticLineNumberOptions
): number[] {
  const errorLines = new Set<number>();

  for (const diagnostic of diagnostics) {
    const line = diagnostic.line;

    if (diagnostic.severity !== "error" || line === undefined) {
      continue;
    }

    if (
      diagnostic.sourceFileName &&
      sourceFileName &&
      diagnostic.sourceFileName !== sourceFileName
    ) {
      continue;
    }

    const displayedLine = line - sourceLineOffset;

    if (!Number.isInteger(displayedLine) || displayedLine < 1 || displayedLine > codeLineCount) {
      continue;
    }

    errorLines.add(displayedLine);
  }

  return Array.from(errorLines)
    .sort((left, right) => left - right);
}
