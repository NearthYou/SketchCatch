import type { DiagramNode, ResourceNodeParameters } from "../../../../packages/types/src";
import type { ParameterCatalog, ParameterCatalogDefinition } from "./catalog";

export type ParameterInputMetadataUpdate = Partial<
  Pick<ResourceNodeParameters, "fileName" | "invalid" | "resourceName" | "terraformBlockType">
>;

export type ParameterValidationResult = {
  invalid: boolean;
  metadataErrors: {
    fileName?: string;
    resourceName?: string;
  };
  parameterErrors: Record<string, string>;
};

export type ReferenceOption = {
  label: string;
  nodeId: string;
  reference: string;
  resourceName: string;
  resourceType: string;
  terraformBlockType: "resource" | "data";
};

const terraformLocalNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const terraformFileNamePattern = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

const resourceTypeAliases: Record<string, string> = {
  apigateway: "aws_api_gateway_rest_api",
  api: "aws_api_gateway_rest_api",
  api_gateway_integration: "aws_api_gateway_integration",
  api_gateway_method: "aws_api_gateway_method",
  api_gateway_resource: "aws_api_gateway_resource",
  api_gateway: "aws_api_gateway_rest_api",
  api_gateway_rest_api: "aws_api_gateway_rest_api",
  asg: "aws_autoscaling_group",
  auto_scaling_group: "aws_autoscaling_group",
  autoscaling: "aws_autoscaling_group",
  autoscaling_group: "aws_autoscaling_group",
  cloudwatch_alarm: "aws_cloudwatch_metric_alarm",
  cloudwatch_dashboard: "aws_cloudwatch_dashboard",
  cloudwatch_event_rule: "aws_cloudwatch_event_rule",
  cloudwatch_event_target: "aws_cloudwatch_event_target",
  cloudwatch_log_group: "aws_cloudwatch_log_group",
  aws_apigateway: "aws_api_gateway_rest_api",
  aws_api_gateway: "aws_api_gateway_rest_api",
  database: "aws_db_instance",
  db_instance: "aws_db_instance",
  db_option_group: "aws_db_option_group",
  db_parameter_group: "aws_db_parameter_group",
  db_snapshot: "aws_db_snapshot",
  db_subnet_group: "aws_db_subnet_group",
  db: "aws_db_instance",
  dynamodb: "aws_dynamodb_table",
  dynamodb_table: "aws_dynamodb_table",
  ebs: "aws_ebs_volume",
  ebs_volume: "aws_ebs_volume",
  ec2: "aws_instance",
  eip: "aws_eip",
  elastic_ip: "aws_eip",
  event_rule: "aws_cloudwatch_event_rule",
  event_target: "aws_cloudwatch_event_target",
  eventbridge_rule: "aws_cloudwatch_event_rule",
  eventbridge_target: "aws_cloudwatch_event_target",
  iam_instance_profile: "aws_iam_instance_profile",
  iam_policy: "aws_iam_policy",
  iam_role: "aws_iam_role",
  igw: "aws_internet_gateway",
  instance: "aws_instance",
  internet_gateway: "aws_internet_gateway",
  key_pair: "aws_key_pair",
  kms: "aws_kms_key",
  kms_key: "aws_kms_key",
  lambda: "aws_lambda_function",
  lambda_function: "aws_lambda_function",
  launch_template: "aws_launch_template",
  log_group: "aws_cloudwatch_log_group",
  nat: "aws_nat_gateway",
  nat_gateway: "aws_nat_gateway",
  rds: "aws_db_instance",
  route_table: "aws_route_table",
  route_table_association: "aws_route_table_association",
  rta: "aws_route_table_association",
  s3: "aws_s3_bucket",
  s3_bucket: "aws_s3_bucket",
  s3_lifecycle: "aws_s3_bucket_lifecycle_configuration",
  s3_public_access_block: "aws_s3_bucket_public_access_block",
  s3_server_side_encryption: "aws_s3_bucket_server_side_encryption_configuration",
  s3_versioning: "aws_s3_bucket_versioning",
  security_group: "aws_security_group",
  security_group_rule: "aws_security_group_rule",
  sg: "aws_security_group",
  sns: "aws_sns_topic",
  sns_topic: "aws_sns_topic",
  subnet: "aws_subnet",
  vpc: "aws_vpc",
  vpc_endpoint: "aws_vpc_endpoint"
};

export function getVisibleDefinitions(definitions: readonly ParameterCatalogDefinition[]) {
  return getConfigurableDefinitions(definitions).sort(
    (left, right) =>
      Number(right.required) - Number(left.required) ||
      Number(right.core ?? false) - Number(left.core ?? false)
  );
}

export function getRequiredDefinitions(definitions: readonly ParameterCatalogDefinition[]) {
  return getVisibleDefinitions(definitions).filter((definition) => definition.required);
}

export function getMainDefinitions(definitions: readonly ParameterCatalogDefinition[]) {
  return getVisibleDefinitions(definitions).filter(
    (definition) => definition.required || definition.core
  );
}

export function getOptionalDefinitions(definitions: readonly ParameterCatalogDefinition[]) {
  return getVisibleDefinitions(definitions).filter(
    (definition) => !definition.required && definition.optional
  );
}

export function getActiveOptionalDefinitions(
  definitions: readonly ParameterCatalogDefinition[],
  values: Record<string, unknown>
) {
  return getOptionalDefinitions(definitions).filter(
    (definition) =>
      Object.prototype.hasOwnProperty.call(values, definition.name) &&
      !isEmptyParameterValue(values[definition.name])
  );
}

export function getValidationDefinitions(
  definitions: readonly ParameterCatalogDefinition[],
  values: Record<string, unknown>
) {
  return [
    ...getRequiredDefinitions(definitions),
    ...getActiveOptionalDefinitions(definitions, values)
  ];
}

function getConfigurableDefinitions(definitions: readonly ParameterCatalogDefinition[]) {
  return definitions
    .filter((definition) => !definition.computed || definition.required || definition.optional)
    .slice();
}

export function getNodeResourceType(node: DiagramNode, catalog: ParameterCatalog) {
  const candidates = [node.parameters?.resourceType, node.type, node.label].filter(Boolean);

  for (const candidate of candidates) {
    const normalized = normalizeResourceType(candidate ?? "", catalog);
    if (normalized) {
      return normalized;
    }
  }

  return node.parameters?.resourceType ?? node.type;
}

export function buildDefaultParameters(
  node: DiagramNode,
  catalog: ParameterCatalog
): ResourceNodeParameters {
  const resourceType = getNodeResourceType(node, catalog);

  return {
    terraformBlockType: node.parameters?.terraformBlockType ?? "resource",
    resourceType,
    resourceName: toTerraformLocalName(node.parameters?.resourceName ?? node.label ?? resourceType),
    fileName: node.parameters?.fileName ?? "main",
    values: node.parameters?.values ?? {},
    invalid: node.parameters?.invalid
  };
}

export function mergeNodeParameters(
  node: DiagramNode,
  catalog: ParameterCatalog
): ResourceNodeParameters {
  const defaults = buildDefaultParameters(node, catalog);

  if (!node.parameters) {
    return defaults;
  }

  return {
    ...defaults,
    ...node.parameters,
    terraformBlockType: node.parameters.terraformBlockType ?? defaults.terraformBlockType,
    resourceType:
      normalizeResourceType(node.parameters.resourceType, catalog) ?? defaults.resourceType,
    resourceName: node.parameters.resourceName ?? defaults.resourceName,
    fileName: node.parameters.fileName ?? defaults.fileName,
    values: node.parameters.values ?? defaults.values
  };
}

export function validateParameters(
  params: ResourceNodeParameters,
  definitions: ParameterCatalogDefinition[],
  nodes: readonly DiagramNode[],
  currentNodeId: string,
  catalog: ParameterCatalog
): ParameterValidationResult {
  const metadataErrors: ParameterValidationResult["metadataErrors"] = {};
  const parameterErrors: Record<string, string> = {};
  const trimmedResourceName = params.resourceName.trim();
  const trimmedFileName = params.fileName.trim();

  if (!trimmedResourceName) {
    metadataErrors.resourceName = "Resource name은 필수입니다.";
  } else if (!terraformLocalNamePattern.test(trimmedResourceName)) {
    metadataErrors.resourceName = "영문자 또는 _로 시작하고 영문자, 숫자, _만 사용할 수 있습니다.";
  } else if (hasDuplicateResourceName(params, nodes, currentNodeId, catalog)) {
    metadataErrors.resourceName = "같은 resource type 안에서 이미 사용 중인 이름입니다.";
  }

  if (!trimmedFileName) {
    metadataErrors.fileName = "File name은 필수입니다.";
  } else if (!terraformFileNamePattern.test(trimmedFileName) || trimmedFileName.includes("..")) {
    metadataErrors.fileName = "파일명에는 경로 없이 영문자, 숫자, _, ., -만 사용할 수 있습니다.";
  }

  for (const definition of definitions) {
    collectDefinitionErrors(
      definition,
      params.values[definition.name],
      definition.name,
      nodes,
      currentNodeId,
      catalog,
      parameterErrors
    );
  }

  collectAutoScalingGroupCapacityErrors(params, parameterErrors);

  return {
    invalid: Object.keys(metadataErrors).length > 0 || Object.keys(parameterErrors).length > 0,
    metadataErrors,
    parameterErrors
  };
}

function collectAutoScalingGroupCapacityErrors(
  params: ResourceNodeParameters,
  errors: Record<string, string>
) {
  if (params.resourceType !== "aws_autoscaling_group") {
    return;
  }

  const { desiredCapacity, maxSize, minSize } = params.values;

  if (isFiniteNumber(minSize) && isFiniteNumber(maxSize) && minSize > maxSize) {
    errors.minSize = "minSize는 maxSize보다 클 수 없습니다.";
  }

  if (
    isFiniteNumber(desiredCapacity) &&
    ((isFiniteNumber(minSize) && desiredCapacity < minSize) ||
      (isFiniteNumber(maxSize) && desiredCapacity > maxSize))
  ) {
    errors.desiredCapacity = "desiredCapacity는 minSize와 maxSize 범위 안에 있어야 합니다.";
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function buildReferenceOptions(
  nodes: readonly DiagramNode[],
  currentNodeId: string,
  definition: ParameterCatalogDefinition,
  catalog: ParameterCatalog
): ReferenceOption[] {
  const targetTypes = definition.referenceTargetTypes ?? [];
  const options: ReferenceOption[] = [];

  for (const node of nodes) {
    if (node.id === currentNodeId || node.kind !== "resource") {
      continue;
    }

    const params = mergeNodeParameters(node, catalog);

    if (!targetTypes.includes(params.resourceType)) {
      continue;
    }

    const referencePrefix = params.terraformBlockType === "data" ? "data." : "";
    const reference = `${referencePrefix}${params.resourceType}.${params.resourceName}.${getReferenceAttribute(definition)}`;

    options.push({
      label: `${node.label || params.resourceName} (${reference})`,
      nodeId: node.id,
      reference,
      resourceName: params.resourceName,
      resourceType: params.resourceType,
      terraformBlockType: params.terraformBlockType ?? "resource"
    });
  }

  return options;
}

export function isEmptyParameterValue(value: unknown) {
  if (value === undefined || value === null) {
    return true;
  }

  if (typeof value === "string") {
    return value.trim() === "";
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  if (isRecord(value)) {
    return Object.keys(value).length === 0;
  }

  return false;
}

function collectDefinitionErrors(
  definition: ParameterCatalogDefinition,
  value: unknown,
  path: string,
  nodes: readonly DiagramNode[],
  currentNodeId: string,
  catalog: ParameterCatalog,
  errors: Record<string, string>
) {
  if (definition.required && isEmptyParameterValue(value)) {
    errors[path] = "필수 파라미터입니다.";
    return;
  }

  if (isEmptyParameterValue(value)) {
    return;
  }

  const typeError = getTypeError(definition, value);
  if (typeError) {
    errors[path] = typeError;
    return;
  }

  const sensitiveError = getSensitiveError(definition, value);
  if (sensitiveError) {
    errors[path] = sensitiveError;
  }

  const referenceError = getReferenceError(definition, value, nodes, currentNodeId, catalog);
  if (referenceError) {
    errors[path] = referenceError;
  }

  if (definition.inputKind === "nested-block" && definition.children) {
    collectNestedErrors(definition, value, path, nodes, currentNodeId, catalog, errors);
  }
}

function collectNestedErrors(
  definition: ParameterCatalogDefinition,
  value: unknown,
  path: string,
  nodes: readonly DiagramNode[],
  currentNodeId: string,
  catalog: ParameterCatalog,
  errors: Record<string, string>
) {
  if (Array.isArray(value)) {
    value.forEach((item, itemIndex) => {
      if (!isRecord(item)) {
        errors[`${path}.${itemIndex}`] = "Nested block 값은 object여야 합니다.";
        return;
      }

      for (const child of definition.children ?? []) {
        collectDefinitionErrors(
          child,
          item[child.name],
          `${path}.${itemIndex}.${child.name}`,
          nodes,
          currentNodeId,
          catalog,
          errors
        );
      }
    });
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const child of definition.children ?? []) {
    collectDefinitionErrors(
      child,
      value[child.name],
      `${path}.${child.name}`,
      nodes,
      currentNodeId,
      catalog,
      errors
    );
  }
}

function getTypeError(definition: ParameterCatalogDefinition, value: unknown) {
  if (definition.type === "string" && typeof value !== "string") {
    return "문자열 값이어야 합니다.";
  }

  if (definition.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
    return "숫자 값이어야 합니다.";
  }

  if (definition.type === "boolean" && typeof value !== "boolean") {
    return "true 또는 false 값이어야 합니다.";
  }

  if ((definition.type === "list" || definition.type === "set") && !Array.isArray(value)) {
    return "목록 값이어야 합니다.";
  }

  if (
    (definition.type === "map" || definition.type === "object") &&
    (!isRecord(value) || Array.isArray(value))
  ) {
    return "key-value object 값이어야 합니다.";
  }

  return null;
}

function getSensitiveError(definition: ParameterCatalogDefinition, value: unknown) {
  if (!definition.sensitive) {
    return null;
  }

  if (typeof value === "string") {
    return isSafeSensitiveString(value)
      ? null
      : "민감값은 실제 secret 대신 var.name 또는 placeholder 문자열로 저장해야 합니다.";
  }

  if (isRecord(value)) {
    const unsafeValue = Object.values(value).find(
      (entry) => typeof entry === "string" && !isSafeSensitiveString(entry)
    );

    return unsafeValue
      ? "민감 map 값은 실제 secret 대신 var.name 또는 placeholder 문자열로 저장해야 합니다."
      : null;
  }

  return null;
}

function getReferenceError(
  definition: ParameterCatalogDefinition,
  value: unknown,
  nodes: readonly DiagramNode[],
  currentNodeId: string,
  catalog: ParameterCatalog
) {
  if (definition.inputKind !== "reference-picker") {
    return null;
  }

  const values = Array.isArray(value) ? value : [value];

  for (const entry of values) {
    if (
      typeof entry !== "string" ||
      (!entry.startsWith("aws_") && !entry.startsWith("data.aws_"))
    ) {
      continue;
    }

    if (!hasReferenceTarget(entry, nodes, currentNodeId, definition, catalog)) {
      return "현재 다이어그램에서 찾을 수 없는 Terraform reference입니다.";
    }
  }

  return null;
}

function hasReferenceTarget(
  value: string,
  nodes: readonly DiagramNode[],
  currentNodeId: string,
  definition: ParameterCatalogDefinition,
  catalog: ParameterCatalog
) {
  const parsedReference = parseTerraformReference(value);

  if (!parsedReference) {
    return false;
  }

  const targetTypes = definition.referenceTargetTypes ?? [];

  return nodes.some((node) => {
    if (node.id === currentNodeId || node.kind !== "resource") {
      return false;
    }

    const params = mergeNodeParameters(node, catalog);

    return (
      targetTypes.includes(params.resourceType) &&
      parsedReference.terraformBlockType === (params.terraformBlockType ?? "resource") &&
      parsedReference.resourceType === params.resourceType &&
      parsedReference.resourceName === params.resourceName
    );
  });
}

function parseTerraformReference(value: string) {
  const match =
    /^(data\.)?(aws_[A-Za-z0-9_]+)\.([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(
      value
    );

  if (!match) {
    return null;
  }

  const [, dataPrefix, resourceType, resourceName, attribute] = match;

  if (!resourceType || !resourceName || !attribute) {
    return null;
  }

  return {
    attribute,
    terraformBlockType: dataPrefix ? "data" : "resource",
    resourceName,
    resourceType
  };
}

function hasDuplicateResourceName(
  params: ResourceNodeParameters,
  nodes: readonly DiagramNode[],
  currentNodeId: string,
  catalog: ParameterCatalog
) {
  return nodes.some((node) => {
    if (node.id === currentNodeId || node.kind !== "resource") {
      return false;
    }

    const otherParams = mergeNodeParameters(node, catalog);

    return (
      otherParams.resourceType === params.resourceType &&
      otherParams.resourceName.trim() === params.resourceName.trim()
    );
  });
}

export function getReferenceAttribute(definition: ParameterCatalogDefinition) {
  if (definition.referenceAttribute) {
    return definition.referenceAttribute;
  }

  const terraformName = definition.terraformName.toLowerCase();

  if (terraformName.endsWith("_arn") || terraformName === "role") {
    return "arn";
  }

  if (terraformName.endsWith("_name")) {
    return "name";
  }

  return "id";
}

function normalizeResourceType(value: string, catalog: ParameterCatalog) {
  const normalized = value.trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  const withAwsPrefix = normalized.startsWith("aws_") ? normalized : `aws_${normalized}`;
  const alias = resourceTypeAliases[normalized] ?? resourceTypeAliases[withAwsPrefix];

  if (alias && alias in catalog.resources) {
    return alias;
  }

  if (normalized in catalog.resources) {
    return normalized;
  }

  if (withAwsPrefix in catalog.resources) {
    return withAwsPrefix;
  }

  return null;
}

function toTerraformLocalName(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/^aws_/, "")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

  if (!normalized) {
    return "main";
  }

  if (/^[0-9]/.test(normalized)) {
    return `resource_${normalized}`;
  }

  return terraformLocalNamePattern.test(normalized) ? normalized : "main";
}

function isSafeSensitiveString(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return true;
  }

  return (
    /^var\.[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed) ||
    /^\${var\.[A-Za-z_][A-Za-z0-9_]*}$/.test(trimmed) ||
    /^placeholder:[A-Za-z0-9_.-]+$/.test(trimmed) ||
    /^REPLACE_ME[A-Za-z0-9_]*$/.test(trimmed) ||
    /^<[^<>]+>$/.test(trimmed)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
