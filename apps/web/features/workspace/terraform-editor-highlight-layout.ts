import type { CSSProperties } from "react";

const TERRAFORM_EDITOR_LINE_HEIGHT_EM = 1.6;
const TERRAFORM_EDITOR_VERTICAL_PADDING = 12;

export function createTerraformLineHighlightStyle({
  endLine,
  scrollTop,
  startLine
}: {
  readonly endLine: number;
  readonly scrollTop: number;
  readonly startLine: number;
}): CSSProperties {
  const lineCount = Math.max(1, endLine - startLine + 1);
  const lineOffset = Math.max(0, startLine - 1) * TERRAFORM_EDITOR_LINE_HEIGHT_EM;

  return {
    height: `${lineCount * TERRAFORM_EDITOR_LINE_HEIGHT_EM}em`,
    top: `calc(${TERRAFORM_EDITOR_VERTICAL_PADDING - scrollTop}px + ${lineOffset}em)`
  };
}
