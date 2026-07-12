const TERRAFORM_INDENT = "  ";

export type TerraformEditorIndentationInput = {
  readonly code: string;
  readonly outdent: boolean;
  readonly selectionEnd: number;
  readonly selectionStart: number;
};

export type TerraformEditorIndentationResult = {
  readonly code: string;
  readonly selectionEnd: number;
  readonly selectionStart: number;
};

type TextEdit = {
  readonly deleteCount: number;
  readonly insertText: string;
  readonly offset: number;
};

export function applyTerraformEditorIndentation(
  input: TerraformEditorIndentationInput
): TerraformEditorIndentationResult {
  const selectionStart = clampSelection(input.selectionStart, input.code.length);
  const selectionEnd = clampSelection(
    Math.max(selectionStart, input.selectionEnd),
    input.code.length
  );

  if (!input.outdent && selectionStart === selectionEnd) {
    return {
      code:
        input.code.slice(0, selectionStart) +
        TERRAFORM_INDENT +
        input.code.slice(selectionEnd),
      selectionEnd: selectionEnd + TERRAFORM_INDENT.length,
      selectionStart: selectionStart + TERRAFORM_INDENT.length
    };
  }

  const lineStarts = getSelectedLineStarts(input.code, selectionStart, selectionEnd);
  const edits = input.outdent
    ? lineStarts.flatMap((offset) => {
        const deleteCount = getOutdentCharacterCount(input.code, offset);
        return deleteCount === 0
          ? []
          : [{ deleteCount, insertText: "", offset } satisfies TextEdit];
      })
    : lineStarts.map(
        (offset): TextEdit => ({
          deleteCount: 0,
          insertText: TERRAFORM_INDENT,
          offset
        })
      );

  return {
    code: applyTextEdits(input.code, edits),
    selectionEnd: mapSelectionPosition(selectionEnd, edits),
    selectionStart: mapSelectionPosition(selectionStart, edits)
  };
}

function applyTextEdits(code: string, edits: readonly TextEdit[]): string {
  return [...edits]
    .reverse()
    .reduce(
      (currentCode, edit) =>
        currentCode.slice(0, edit.offset) +
        edit.insertText +
        currentCode.slice(edit.offset + edit.deleteCount),
      code
    );
}

function clampSelection(position: number, codeLength: number): number {
  return Math.min(Math.max(position, 0), codeLength);
}

function getOutdentCharacterCount(code: string, lineStart: number): number {
  if (code[lineStart] === "\t") {
    return 1;
  }

  if (code[lineStart] !== " ") {
    return 0;
  }

  return code[lineStart + 1] === " " ? 2 : 1;
}

function getSelectedLineStarts(
  code: string,
  selectionStart: number,
  selectionEnd: number
): number[] {
  const firstLineStart = code.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
  const effectiveEnd =
    selectionEnd > selectionStart && code[selectionEnd - 1] === "\n"
      ? selectionEnd - 1
      : selectionEnd;
  const lineStarts = [firstLineStart];

  for (
    let newlineIndex = code.indexOf("\n", firstLineStart);
    newlineIndex >= 0 && newlineIndex + 1 < effectiveEnd;
    newlineIndex = code.indexOf("\n", newlineIndex + 1)
  ) {
    lineStarts.push(newlineIndex + 1);
  }

  return lineStarts;
}

function mapSelectionPosition(position: number, edits: readonly TextEdit[]): number {
  return edits.reduce((mappedPosition, edit) => {
    if (position < edit.offset) {
      return mappedPosition;
    }

    if (edit.deleteCount === 0) {
      return mappedPosition + edit.insertText.length;
    }

    if (position <= edit.offset) {
      return mappedPosition;
    }

    if (position < edit.offset + edit.deleteCount) {
      return mappedPosition - (position - edit.offset);
    }

    return mappedPosition - edit.deleteCount;
  }, position);
}
