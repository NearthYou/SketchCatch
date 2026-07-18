import type { TerraformBlockIdentity, TerraformBlockType } from "@sketchcatch/types";
import { createTerraformBlockIdentityKey } from "./terraform-identity.js";

type TerraformToken =
  | { kind: "identifier"; value: string }
  | { kind: "string"; value: string }
  | { kind: "open_brace" }
  | { kind: "close_brace" };

const HEADER_BLOCK_TYPES = new Set<TerraformBlockType>(["resource", "data"]);

// This is deliberately a small lexical scanner rather than a Terraform validator. It only
// extracts top-level resource/data identities for safety gates, and leaves malformed input
// diagnostics to the existing Terraform parser and validation flow.
export function scanTerraformBlockIdentities(terraformCode: string): TerraformBlockIdentity[] {
  const tokens = tokenizeTerraform(terraformCode);
  const identities = new Map<string, TerraformBlockIdentity>();
  let blockDepth = 0;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;

    if (token.kind === "open_brace") {
      blockDepth += 1;
      continue;
    }

    if (token.kind === "close_brace") {
      blockDepth = Math.max(0, blockDepth - 1);
      continue;
    }

    if (
      blockDepth !== 0 ||
      token.kind !== "identifier" ||
      !HEADER_BLOCK_TYPES.has(token.value as TerraformBlockType)
    ) {
      continue;
    }

    const resourceType = tokens[index + 1];
    const resourceName = tokens[index + 2];
    const openingBrace = tokens[index + 3];

    if (
      resourceType?.kind !== "string" ||
      resourceName?.kind !== "string" ||
      openingBrace?.kind !== "open_brace"
    ) {
      continue;
    }

    const identity: TerraformBlockIdentity = {
      terraformBlockType: token.value as TerraformBlockType,
      resourceType: resourceType.value,
      resourceName: resourceName.value
    };
    identities.set(createTerraformBlockIdentityKey(identity), identity);
    blockDepth = 1;
    index += 3;
  }

  return [...identities.values()];
}

function tokenizeTerraform(terraformCode: string): TerraformToken[] {
  const tokens: TerraformToken[] = [];
  let index = 0;

  while (index < terraformCode.length) {
    const character = terraformCode[index]!;

    if (isWhitespace(character)) {
      index += 1;
      continue;
    }

    if (character === "#") {
      index = skipLine(terraformCode, index + 1);
      continue;
    }

    if (character === "/" && terraformCode[index + 1] === "/") {
      index = skipLine(terraformCode, index + 2);
      continue;
    }

    if (character === "/" && terraformCode[index + 1] === "*") {
      index = skipBlockComment(terraformCode, index + 2);
      continue;
    }

    if (character === '"') {
      const parsedString = readQuotedString(terraformCode, index);
      if (parsedString === null) {
        break;
      }

      tokens.push({ kind: "string", value: parsedString.value });
      index = parsedString.nextIndex;
      continue;
    }

    if (character === "<" && terraformCode[index + 1] === "<") {
      const nextIndex = skipHeredoc(terraformCode, index);
      if (nextIndex !== null) {
        index = nextIndex;
        continue;
      }
    }

    if (isIdentifierStart(readCodePoint(terraformCode, index))) {
      const end = readIdentifierEnd(terraformCode, index);
      tokens.push({ kind: "identifier", value: terraformCode.slice(index, end) });
      index = end;
      continue;
    }

    if (character === "{") {
      tokens.push({ kind: "open_brace" });
      index += 1;
      continue;
    }

    if (character === "}") {
      tokens.push({ kind: "close_brace" });
      index += 1;
      continue;
    }

    index += 1;
  }

  return tokens;
}

function readQuotedString(
  source: string,
  startIndex: number
): { value: string; nextIndex: number } | null {
  let value = "";

  for (let index = startIndex + 1; index < source.length; index += 1) {
    const character = source[index]!;

    if (character === "\\") {
      const escapedValue = readQuotedStringEscape(source, index);
      if (escapedValue === null) {
        return null;
      }

      value += escapedValue.value;
      index = escapedValue.nextIndex - 1;
      continue;
    }

    if (
      (character === "$" || character === "%") &&
      source[index + 1] === character &&
      source[index + 2] === "{"
    ) {
      value += `${character}{`;
      index += 2;
      continue;
    }

    if ((character === "$" || character === "%") && source[index + 1] === "{") {
      const expressionEnd = skipTemplateExpression(source, index);
      if (expressionEnd === null) {
        return null;
      }

      value += source.slice(index, expressionEnd);
      index = expressionEnd - 1;
      continue;
    }

    if (character === '"') {
      return { value, nextIndex: index + 1 };
    }

    value += character;
  }

  return null;
}

function readQuotedStringEscape(
  source: string,
  startIndex: number
): { value: string; nextIndex: number } | null {
  const escape = source[startIndex + 1];
  if (escape === undefined) {
    return null;
  }

  const simpleEscapes: Record<string, string> = {
    '"': '"',
    "\\": "\\",
    "/": "/",
    b: "\b",
    f: "\f",
    n: "\n",
    r: "\r",
    t: "\t"
  };
  const simpleValue = simpleEscapes[escape];
  if (simpleValue !== undefined) {
    return { value: simpleValue, nextIndex: startIndex + 2 };
  }

  const unicodeLength = escape === "u" ? 4 : escape === "U" ? 8 : 0;
  if (unicodeLength > 0) {
    const hexStart = startIndex + 2;
    const hex = source.slice(hexStart, hexStart + unicodeLength);
    if (hex.length === unicodeLength && /^[0-9A-Fa-f]+$/.test(hex)) {
      const codePoint = Number.parseInt(hex, 16);
      if (unicodeLength === 4) {
        return {
          value: String.fromCharCode(codePoint),
          nextIndex: hexStart + unicodeLength
        };
      }

      if (codePoint <= 0x10ffff && (codePoint < 0xd800 || codePoint > 0xdfff)) {
        return {
          value: String.fromCodePoint(codePoint),
          nextIndex: hexStart + unicodeLength
        };
      }
    }
  }

  return { value: escape, nextIndex: startIndex + 2 };
}

function skipTemplateExpression(source: string, startIndex: number): number | null {
  let braceDepth = 1;

  for (let index = startIndex + 2; index < source.length; index += 1) {
    const character = source[index]!;

    if (character === '"') {
      const nestedString = readQuotedString(source, index);
      if (nestedString === null) {
        return null;
      }

      index = nestedString.nextIndex - 1;
      continue;
    }

    if (character === "#") {
      index = skipLine(source, index + 1) - 1;
      continue;
    }

    if (character === "/" && source[index + 1] === "/") {
      index = skipLine(source, index + 2) - 1;
      continue;
    }

    if (character === "/" && source[index + 1] === "*") {
      index = skipBlockComment(source, index + 2) - 1;
      continue;
    }

    if (character === "<" && source[index + 1] === "<") {
      const heredocEnd = skipHeredoc(source, index);
      if (heredocEnd !== null) {
        index = heredocEnd - 1;
        continue;
      }
    }

    if (character === "{") {
      braceDepth += 1;
      continue;
    }

    if (character === "}") {
      braceDepth -= 1;
      if (braceDepth === 0) {
        return index + 1;
      }
    }
  }

  return null;
}

function skipLine(source: string, startIndex: number): number {
  const nextLine = source.indexOf("\n", startIndex);
  return nextLine === -1 ? source.length : nextLine + 1;
}

function skipBlockComment(source: string, startIndex: number): number {
  const end = source.indexOf("*/", startIndex);
  return end === -1 ? source.length : end + 2;
}

function skipHeredoc(source: string, startIndex: number): number | null {
  let index = startIndex + 2;
  const allowIndentedTerminator = source[index] === "-";
  if (allowIndentedTerminator) {
    index += 1;
  }

  while (source[index] === " " || source[index] === "\t") {
    index += 1;
  }

  if (!isIdentifierStart(readCodePoint(source, index))) {
    return null;
  }

  const delimiterEnd = readIdentifierEnd(source, index);
  const delimiter = source.slice(index, delimiterEnd);
  const lineEnd = source.indexOf("\n", delimiterEnd);
  if (
    lineEnd === -1 ||
    !isWhitespaceOrTrailingLineComment(source.slice(delimiterEnd, lineEnd))
  ) {
    return null;
  }

  let lineStart = lineEnd + 1;
  while (lineStart <= source.length) {
    const nextLineEnd = source.indexOf("\n", lineStart);
    const lineEndIndex = nextLineEnd === -1 ? source.length : nextLineEnd;
    const line = source.slice(lineStart, lineEndIndex).replace(/\r$/, "");
    const candidate = allowIndentedTerminator ? line.trim() : line;

    if (candidate === delimiter) {
      return nextLineEnd === -1 ? source.length : nextLineEnd + 1;
    }

    if (nextLineEnd === -1) {
      return source.length;
    }

    lineStart = nextLineEnd + 1;
  }

  return source.length;
}

function isWhitespaceOrTrailingLineComment(value: string): boolean {
  let index = 0;

  while (index < value.length) {
    while (value[index] === " " || value[index] === "\t" || value[index] === "\r") {
      index += 1;
    }

    if (index === value.length || value[index] === "#" || value.slice(index, index + 2) === "//") {
      return true;
    }

    if (value.slice(index, index + 2) !== "/*") {
      return false;
    }

    const commentEnd = value.indexOf("*/", index + 2);
    if (commentEnd === -1) {
      return false;
    }

    index = commentEnd + 2;
  }

  return true;
}

function isWhitespace(value: string): boolean {
  return value === " " || value === "\t" || value === "\n" || value === "\r";
}

function isIdentifierStart(value: string): boolean {
  return /^[_\p{ID_Start}]$/u.test(value);
}

function isIdentifierPart(value: string): boolean {
  return /^[-\p{ID_Continue}]$/u.test(value);
}

function readIdentifierEnd(source: string, startIndex: number): number {
  let index = startIndex;
  while (index < source.length) {
    const codePoint = readCodePoint(source, index);
    if (!isIdentifierPart(codePoint)) {
      break;
    }

    index += codePoint.length;
  }
  return index;
}

function readCodePoint(source: string, index: number): string {
  const codePoint = source.codePointAt(index);
  return codePoint === undefined ? "" : String.fromCodePoint(codePoint);
}
