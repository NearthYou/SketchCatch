const FILEBASE64_EXPRESSION_PATTERN = /^filebase64\(\s*"(?:[^"\\]|\\.)*"\s*\)$/s;

export function isSupportedTerraformFunctionExpression(value: string): boolean {
  return FILEBASE64_EXPRESSION_PATTERN.test(value.trim());
}
