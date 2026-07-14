const FILEBASE64_EXPRESSION_PATTERN = /^filebase64\(\s*"(?:[^"\\]|\\.)*"\s*\)$/s;
const BASE64ENCODE_EXPRESSION_PATTERN = /^base64encode\s*\(/;
const JSONENCODE_EXPRESSION_PATTERN = /^jsonencode\s*\(/;
const TEMPLATEFILE_EXPRESSION_PATTERN = /^templatefile\s*\(/;

const CLOSING_DELIMITER_BY_OPENING_DELIMITER: Record<string, string> = {
  "(": ")",
  "[": "]",
  "{": "}"
};

export function isSupportedTerraformFunctionExpression(value: string): boolean {
  const expression = value.trim();

  if (FILEBASE64_EXPRESSION_PATTERN.test(expression)) {
    return true;
  }

  if (isBase64EncodedTemplateFileExpression(expression)) {
    return true;
  }

  const jsonencodeMatch = JSONENCODE_EXPRESSION_PATTERN.exec(expression);

  return jsonencodeMatch
    ? hasOneCompleteFunctionCall(expression, jsonencodeMatch[0].length - 1)
    : false;
}

function isBase64EncodedTemplateFileExpression(expression: string): boolean {
  const base64encodeMatch = BASE64ENCODE_EXPRESSION_PATTERN.exec(expression);

  if (
    !base64encodeMatch ||
    !hasOneCompleteFunctionCall(expression, base64encodeMatch[0].length - 1)
  ) {
    return false;
  }

  const templatefileExpression = expression
    .slice(base64encodeMatch[0].length, -1)
    .trim();
  const templatefileMatch = TEMPLATEFILE_EXPRESSION_PATTERN.exec(templatefileExpression);

  return templatefileMatch
    ? hasOneCompleteFunctionCall(
        templatefileExpression,
        templatefileMatch[0].length - 1
      )
    : false;
}

function hasOneCompleteFunctionCall(expression: string, openingParenthesisIndex: number): boolean {
  const closingDelimiters = [")"];
  let inString = false;
  let escaped = false;

  for (let index = openingParenthesisIndex + 1; index < expression.length; index += 1) {
    const character = expression[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === "\\" && inString) {
      escaped = true;
      continue;
    }

    if (character === '"') {
      inString = !inString;
      continue;
    }

    if (inString || !character) {
      continue;
    }

    const closingDelimiter = CLOSING_DELIMITER_BY_OPENING_DELIMITER[character];

    if (closingDelimiter) {
      closingDelimiters.push(closingDelimiter);
      continue;
    }

    if (character !== ")" && character !== "]" && character !== "}") {
      continue;
    }

    if (closingDelimiters.pop() !== character) {
      return false;
    }

    if (closingDelimiters.length === 0) {
      return expression.slice(index + 1).trim().length === 0;
    }
  }

  return false;
}
