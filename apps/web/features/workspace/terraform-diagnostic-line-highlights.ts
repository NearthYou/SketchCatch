import type { CSSProperties } from "react";
import type { TerraformDiagnostic } from "@sketchcatch/types";

export type TerraformDiagnosticLineHighlight = {
  readonly line: number;
  readonly style: Pick<CSSProperties, "top">;
};

type TerraformDiagnosticLineHighlightOptions = {
  readonly codeLineCount: number;
  readonly lineHeight: number;
  readonly scrollTop: number;
  readonly verticalPadding: number;
};

export function createTerraformDiagnosticLineHighlights(
  diagnostics: readonly TerraformDiagnostic[],
  {
    codeLineCount,
    lineHeight,
    scrollTop,
    verticalPadding
  }: TerraformDiagnosticLineHighlightOptions
): TerraformDiagnosticLineHighlight[] {
  const errorLines = new Set<number>();

  for (const diagnostic of diagnostics) {
    const line = diagnostic.line;

    if (diagnostic.severity !== "error" || line === undefined) {
      continue;
    }

    if (!Number.isInteger(line) || line < 1 || line > codeLineCount) {
      continue;
    }

    errorLines.add(line);
  }

  return Array.from(errorLines)
    .sort((left, right) => left - right)
    .map((line) => ({
      line,
      style: {
        top: `${verticalPadding + line * lineHeight - scrollTop - 2}px`
      }
    }));
}
