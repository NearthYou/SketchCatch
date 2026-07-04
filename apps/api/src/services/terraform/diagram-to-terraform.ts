import type {
  InfrastructureGraph,
  InfrastructureGraphNode,
  TerraformBlockType
} from "@sketchcatch/types";
import { isTerraformNestedBlockAttribute } from "./terraform-nested-blocks.js";

const DEFAULT_TERRAFORM_BLOCK_TYPE: TerraformBlockType = "resource";
const INDENT_UNIT = "  ";
export const TERRAFORM_IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;
const TERRAFORM_REFERENCE_PATTERN =
  /^(?:var|local|each|count|path|terraform)\.[a-zA-Z_][a-zA-Z0-9_]*$|^module\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*$|^aws_[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*$|^data\.aws_[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*$/;

export class TerraformDiagramValidationError extends Error {
  readonly reason = "invalid_identifier";

  constructor(label: string, value: string) {
    super(`Invalid Terraform ${label}: ${value}`);
    this.name = "TerraformDiagramValidationError";
  }
}

export function renderTerraformFromInfrastructureGraph(graph: InfrastructureGraph): string {
  return graph.nodes
    .map(renderBlock)
    .join("\n\n");
}

// resource/data block 하나를 만든다. 예: resource "aws_vpc" "main" { ... }
function renderBlock(node: InfrastructureGraphNode): string {
  const terraformBlockType = node.iac.terraformBlockType ?? DEFAULT_TERRAFORM_BLOCK_TYPE;
  assertTerraformIdentifier(node.iac.resourceType, "resource type");
  assertTerraformIdentifier(node.iac.resourceName, "resource name");

  const config = normalizeResourceConfig(node.iac.resourceType, node.config);
  const body = Object.entries(config).flatMap(([key, value]) =>
    renderBodyEntry(node.iac.resourceType, key, value, 1)
  );

  return [
    `${terraformBlockType} "${node.iac.resourceType}" "${node.iac.resourceName}" {`,
    ...body,
    "}"
  ].join("\n");
}

function renderBodyEntry(
  resourceType: string,
  key: string,
  value: unknown,
  indentLevel: number
): string[] {
  const normalizedValue = normalizeTopLevelValue(resourceType, key, value);
  const nestedBlockValues = getNestedBlockValues(resourceType, key, normalizedValue);

  if (nestedBlockValues) {
    return renderNestedBlocks(key, nestedBlockValues, indentLevel);
  }

  return [renderAttribute(key, normalizedValue, indentLevel)];
}

function normalizeResourceConfig(
  resourceType: string,
  config: Record<string, unknown>
): Record<string, unknown> {
  if (resourceType === "aws_s3_bucket_versioning") {
    return normalizeS3BucketVersioningConfig(config);
  }

  if (resourceType === "aws_s3_bucket_server_side_encryption_configuration") {
    return normalizeS3BucketEncryptionConfig(config);
  }

  if (resourceType === "aws_s3_bucket_lifecycle_configuration") {
    return normalizeS3BucketLifecycleConfig(config);
  }

  return config;
}

function normalizeS3BucketVersioningConfig(
  config: Record<string, unknown>
): Record<string, unknown> {
  const hasExplicitVersioningConfiguration = hasAnyKey(config, [
    "versioningConfiguration",
    "versioning_configuration"
  ]);
  const status = config["status"];
  const shouldAddVersioningConfiguration =
    status !== undefined && !hasExplicitVersioningConfiguration;
  const normalizedConfig: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(config)) {
    if (key === "status") {
      continue;
    }

    normalizedConfig[key] = value;
  }

  if (shouldAddVersioningConfiguration) {
    normalizedConfig.versioningConfiguration = [{ status }];
  }

  return normalizedConfig;
}

function normalizeS3BucketEncryptionConfig(
  config: Record<string, unknown>
): Record<string, unknown> {
  const hasExplicitRule = config["rule"] !== undefined;
  const sseAlgorithm = config["sseAlgorithm"] ?? config["sse_algorithm"];
  const kmsMasterKeyId = config["kmsMasterKeyId"] ?? config["kms_master_key_id"];
  const shouldAddRule =
    !hasExplicitRule && (sseAlgorithm !== undefined || kmsMasterKeyId !== undefined);
  const normalizedConfig: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(config)) {
    if (
      key === "sseAlgorithm" ||
      key === "sse_algorithm" ||
      key === "kmsMasterKeyId" ||
      key === "kms_master_key_id"
    ) {
      continue;
    }

    normalizedConfig[key] = value;
  }

  if (shouldAddRule) {
    const encryptionDefaults: Record<string, unknown> = {};

    if (sseAlgorithm !== undefined) {
      encryptionDefaults.sseAlgorithm = sseAlgorithm;
    }

    if (kmsMasterKeyId !== undefined) {
      encryptionDefaults.kmsMasterKeyId = kmsMasterKeyId;
    }

    normalizedConfig.rule = [
      {
        applyServerSideEncryptionByDefault: [encryptionDefaults]
      }
    ];
  }

  return normalizedConfig;
}

function normalizeS3BucketLifecycleConfig(
  config: Record<string, unknown>
): Record<string, unknown> {
  const normalizedConfig: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(config)) {
    if (key === "rule" && Array.isArray(value)) {
      normalizedConfig.rule = value.map((item) =>
        isRecord(item) ? normalizeS3BucketLifecycleRuleBlock(item) : item
      );
      continue;
    }

    normalizedConfig[key] = value;
  }

  return normalizedConfig;
}

function normalizeS3BucketLifecycleRuleBlock(
  rule: Record<string, unknown>
): Record<string, unknown> {
  const hasExplicitExpiration = rule["expiration"] !== undefined;
  const expirationDays = rule["expirationDays"] ?? rule["expiration_days"];
  const normalizedRule: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(rule)) {
    if (key === "expirationDays" || key === "expiration_days") {
      continue;
    }

    normalizedRule[key] = value;
  }

  if (expirationDays !== undefined && !hasExplicitExpiration) {
    normalizedRule.expiration = [{ days: expirationDays }];
  }

  return normalizedRule;
}

function normalizeTopLevelValue(resourceType: string, key: string, value: unknown): unknown {
  if (
    resourceType === "aws_security_group" &&
    (key === "egress" || key === "ingress") &&
    Array.isArray(value)
  ) {
    return value.map((item) => (isRecord(item) ? normalizeSecurityGroupRuleBlock(item) : item));
  }

  return value;
}

function normalizeSecurityGroupRuleBlock(rule: Record<string, unknown>): Record<string, unknown> {
  const normalizedRule: Record<string, unknown> = {};
  const port = rule["port"];
  const cidr = rule["cidr"];
  const hasCidrBlocks = rule["cidrBlocks"] !== undefined || rule["cidr_blocks"] !== undefined;

  for (const [key, value] of Object.entries(rule)) {
    if (key !== "cidr" && key !== "port") {
      normalizedRule[key] = value;
    }
  }

  if (port !== undefined) {
    if (rule["fromPort"] === undefined && rule["from_port"] === undefined) {
      normalizedRule.fromPort = port;
    }

    if (rule["toPort"] === undefined && rule["to_port"] === undefined) {
      normalizedRule.toPort = port;
    }

    if (rule["protocol"] === undefined) {
      normalizedRule.protocol = "tcp";
    }
  }

  if (cidr !== undefined && !hasCidrBlocks) {
    normalizedRule.cidrBlocks = [cidr];
  }

  return normalizedRule;
}

function getNestedBlockValues(
  resourceType: string,
  key: string,
  value: unknown
): Record<string, unknown>[] | undefined {
  if (!isTerraformNestedBlockAttribute(resourceType, key)) {
    return undefined;
  }

  if (Array.isArray(value) && value.every(isRecord)) {
    return value;
  }

  if (isRecord(value)) {
    return [value];
  }

  return undefined;
}

function renderNestedBlocks(
  key: string,
  values: Record<string, unknown>[],
  indentLevel: number
): string[] {
  const blockName = toSnakeCase(key);
  assertTerraformIdentifier(blockName, "nested block name");

  return values.map((value) =>
    [
      `${indent(indentLevel)}${blockName} {`,
      ...Object.entries(value).flatMap(([nestedKey, nestedValue]) =>
        renderNestedBlockEntry(nestedKey, nestedValue, indentLevel + 1)
      ),
      `${indent(indentLevel)}}`
    ].join("\n")
  );
}

function renderNestedBlockEntry(key: string, value: unknown, indentLevel: number): string[] {
  if (Array.isArray(value) && value.every(isRecord)) {
    return renderNestedBlocks(key, value, indentLevel);
  }

  return [renderAttribute(key, value, indentLevel)];
}

function renderAttribute(key: string, value: unknown, indentLevel: number): string {
  const attributeName = toSnakeCase(key);
  assertTerraformIdentifier(attributeName, "attribute name");

  return `${indent(indentLevel)}${attributeName} = ${renderValue(value, indentLevel)}`;
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
        `${indent(indentLevel + 1)}${renderObjectKey(key)} = ${renderValue(nestedValue, indentLevel + 1)}`
    ),
    `${indent(indentLevel)}}`
  ].join("\n");
}

function renderObjectKey(key: string): string {
  return TERRAFORM_IDENTIFIER_PATTERN.test(key) ? key : JSON.stringify(key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasAnyKey(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.some((key) => value[key] !== undefined);
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

function assertTerraformIdentifier(value: string, label: string): void {
  if (TERRAFORM_IDENTIFIER_PATTERN.test(value)) {
    return;
  }

  throw new TerraformDiagramValidationError(label, value);
}
