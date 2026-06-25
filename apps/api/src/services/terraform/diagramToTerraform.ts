import type {
  DiagramJson,
  DiagramNodeParameters,
  TerraformBlockType
} from "@sketchcatch/types";

const DEFAULT_TERRAFORM_BLOCK_TYPE: TerraformBlockType = "resource";
const INDENT_UNIT = "  ";
const TERRAFORM_REFERENCE_PATTERN =
  /^[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*$/;

// DiagramJson 전체를 Terraform 코드 문자열 하나로 변환하는 공개 순수 함수다.
export function generateTerraformFromDiagramJson(diagramJson: DiagramJson): string {
  return diagramJson.nodes
    .filter((node) => node.kind === "resource")
    .map((node) => node.parameters)
    .filter(isRenderableParameters)
    .map(renderBlock)
    .join("\n\n");
}

// parameters가 없거나 invalid 표시가 있는 resource node는 Terraform 출력에서 제외한다.
function isRenderableParameters(
  parameters: DiagramNodeParameters | undefined
): parameters is DiagramNodeParameters {
  return parameters !== undefined && parameters.invalid !== true;
}

// resource/data block 하나를 만든다. 예: resource "aws_vpc" "main" { ... }
function renderBlock(parameters: DiagramNodeParameters): string {
  const terraformBlockType = parameters.terraformBlockType ?? DEFAULT_TERRAFORM_BLOCK_TYPE;
  const body = Object.entries(parameters.values).map(([key, value]) =>
    renderAttribute(key, value, 1)
  );

  return [
    `${terraformBlockType} "${parameters.resourceType}" "${parameters.resourceName}" {`,
    ...body,
    "}"
  ].join("\n");
}

// DiagramJson의 top-level values key/value 하나를 Terraform attribute 한 줄로 바꾼다.
function renderAttribute(key: string, value: unknown, indentLevel: number): string {
  return `${indent(indentLevel)}${toSnakeCase(key)} = ${renderValue(value, indentLevel)}`;
}

// JavaScript 값을 Terraform HCL 값 표현으로 바꾼다.
function renderValue(value: unknown, indentLevel: number): string {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value === "string") {
    return isTerraformReference(value) ? value : JSON.stringify(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return renderArray(value, indentLevel);
  }

  if (isRecord(value)) {
    return renderObject(value, indentLevel);
  }

  return JSON.stringify(String(value));
}

// 배열 값을 사람이 읽기 쉬운 여러 줄 Terraform list로 출력한다.
function renderArray(values: unknown[], indentLevel: number): string {
  if (values.length === 0) {
    return "[]";
  }

  return [
    "[",
    ...values.map((value) => `${indent(indentLevel + 1)}${renderValue(value, indentLevel + 1)},`),
    `${indent(indentLevel)}]`
  ].join("\n");
}

// object 값을 Terraform map/object 표현으로 바꾼다. tags 같은 nested key는 원래 이름을 유지한다.
function renderObject(value: Record<string, unknown>, indentLevel: number): string {
  const entries = Object.entries(value);

  if (entries.length === 0) {
    return "{}";
  }

  return [
    "{",
    ...entries.map(
      ([key, nestedValue]) =>
        `${indent(indentLevel + 1)}${key} = ${renderValue(nestedValue, indentLevel + 1)}`
    ),
    `${indent(indentLevel)}}`
  ].join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// Terraform reference는 따옴표 없이 출력해야 하므로 일반 문자열과 구분한다.
function isTerraformReference(value: string): boolean {
  return TERRAFORM_REFERENCE_PATTERN.test(value);
}

function toSnakeCase(value: string): string {
  return value
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/-/g, "_")
    .toLowerCase();
}

function indent(level: number): string {
  return INDENT_UNIT.repeat(level);
}
