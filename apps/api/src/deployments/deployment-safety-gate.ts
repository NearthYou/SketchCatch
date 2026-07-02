import type {
  DeploymentPlanWarning,
  DeploymentSafetyGateWarningCode
} from "@sketchcatch/types";

type TerraformShowJson = {
  resource_changes?: unknown;
};

type TerraformResourceChange = {
  address?: unknown;
  mode?: unknown;
  type?: unknown;
  change?: {
    actions?: unknown;
    after?: unknown;
  };
};

type SafetyGateWarningInput = {
  code: DeploymentSafetyGateWarningCode;
  message: string;
  resourceAddress: string;
};

export function createDeploymentSafetyGateWarningsFromTerraformShowJson(
  terraformShowJson: string
): DeploymentPlanWarning[] {
  const parsed = parseTerraformShowJson(terraformShowJson);
  const resourceChanges = Array.isArray(parsed.resource_changes) ? parsed.resource_changes : [];
  const warnings: DeploymentPlanWarning[] = [];

  for (const resourceChange of resourceChanges) {
    if (!isTerraformResourceChange(resourceChange) || resourceChange.mode === "data") {
      continue;
    }

    const resourceType = typeof resourceChange.type === "string" ? resourceChange.type : "";
    const resourceAddress =
      typeof resourceChange.address === "string" ? resourceChange.address : resourceType;
    const actions = getStringArray(resourceChange.change?.actions);

    if (actions.length === 0 || isSameActions(actions, ["no-op"]) || isSameActions(actions, ["read"])) {
      continue;
    }

    const after = isRecord(resourceChange.change?.after) ? resourceChange.change.after : null;

    if (!after) {
      continue;
    }

    warnings.push(
      ...createSafetyGateWarningsForResource({
        after,
        resourceAddress,
        resourceType
      })
    );
  }

  return dedupeWarnings(warnings);
}

export function hasApprovalBlockingSafetyGateWarning(
  warnings: readonly DeploymentPlanWarning[]
): boolean {
  return warnings.some((warning) => warning.level === "high" && warning.blocksApproval === true);
}

function createSafetyGateWarningsForResource(input: {
  after: Record<string, unknown>;
  resourceAddress: string;
  resourceType: string;
}): DeploymentPlanWarning[] {
  const warnings: DeploymentPlanWarning[] = [];

  if (isPublicRds(input.resourceType, input.after)) {
    warnings.push(
      createSafetyGateWarning({
        code: "public_rds",
        resourceAddress: input.resourceAddress,
        message: `${input.resourceAddress} exposes an RDS database publicly. Disable public accessibility and use private subnets before apply.`
      })
    );
  }

  if (hasPublicSshIngress(input.resourceType, input.after)) {
    warnings.push(
      createSafetyGateWarning({
        code: "public_ssh",
        resourceAddress: input.resourceAddress,
        message: `${input.resourceAddress} allows SSH from 0.0.0.0/0 or ::/0. Restrict port 22 before apply.`
      })
    );
  }

  if (hasS3PublicAccess(input.resourceType, input.after)) {
    warnings.push(
      createSafetyGateWarning({
        code: "s3_public_access",
        resourceAddress: input.resourceAddress,
        message: `${input.resourceAddress} enables S3 public access. Enable Block Public Access or remove public policy and ACL settings.`
      })
    );
  }

  if (hasExcessiveIam(input.resourceType, input.after)) {
    warnings.push(
      createSafetyGateWarning({
        code: "excessive_iam",
        resourceAddress: input.resourceAddress,
        message: `${input.resourceAddress} grants overly broad IAM permissions. Replace wildcard permissions with least privilege.`
      })
    );
  }

  return warnings;
}

function createSafetyGateWarning(input: SafetyGateWarningInput): DeploymentPlanWarning {
  return {
    level: "high",
    message: input.message,
    relatedResourceId: input.resourceAddress,
    code: input.code,
    source: "terraform_plan",
    blocksApproval: true,
    approvalRequired: false
  };
}

function isPublicRds(resourceType: string, after: Record<string, unknown>): boolean {
  return (
    (resourceType === "aws_db_instance" || resourceType === "aws_rds_cluster_instance") &&
    isTrue(after["publicly_accessible"])
  );
}

function hasPublicSshIngress(resourceType: string, after: Record<string, unknown>): boolean {
  if (resourceType === "aws_security_group") {
    return getArrayValues(after["ingress"]).some(isPublicSshRule);
  }

  if (
    resourceType === "aws_security_group_rule" ||
    resourceType === "aws_vpc_security_group_ingress_rule"
  ) {
    return isPublicSshRule(after);
  }

  return false;
}

function isPublicSshRule(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const ruleType = getLowerString(value["type"]);

  if (ruleType !== null && ruleType !== "ingress") {
    return false;
  }

  const fromPort = getNumberValue(value["from_port"] ?? value["fromPort"] ?? value["port"]);
  const toPort = getNumberValue(value["to_port"] ?? value["toPort"] ?? value["port"]);
  const cidrs = [
    value["cidr"],
    value["cidr_block"],
    value["cidrBlock"],
    value["cidr_ipv4"],
    value["cidrIpv4"],
    value["cidr_ipv6"],
    value["cidrIpv6"],
    ...getArrayValues(value["cidr_blocks"]),
    ...getArrayValues(value["cidrBlocks"]),
    ...getArrayValues(value["ipv6_cidr_blocks"]),
    ...getArrayValues(value["ipv6CidrBlocks"])
  ];

  return (
    fromPort !== null &&
    toPort !== null &&
    fromPort <= 22 &&
    toPort >= 22 &&
    cidrs.some(isPublicCidr)
  );
}

function hasS3PublicAccess(resourceType: string, after: Record<string, unknown>): boolean {
  if (resourceType === "aws_s3_bucket" || resourceType === "aws_s3_bucket_acl") {
    const acl = getLowerString(after["acl"]);

    if (acl === "public-read" || acl === "public-read-write" || acl === "website") {
      return true;
    }
  }

  if (resourceType === "aws_s3_bucket_public_access_block") {
    return [
      after["block_public_acls"],
      after["block_public_policy"],
      after["ignore_public_acls"],
      after["restrict_public_buckets"]
    ].some((value) => value === false || value === "false");
  }

  if (resourceType === "aws_s3_bucket_policy") {
    return containsPublicPrincipalAllow(after["policy"]);
  }

  return false;
}

function hasExcessiveIam(resourceType: string, after: Record<string, unknown>): boolean {
  if (!resourceType.startsWith("aws_iam_")) {
    return false;
  }

  if (getLowerString(after["policy_arn"])?.endsWith("administratoraccess") === true) {
    return true;
  }

  return [
    after["policy"],
    after["policy_document"],
    after["inline_policy"],
    after["managed_policy_arns"],
    after["actions"],
    after["action"]
  ].some(containsExcessiveIamPolicy);
}

function containsExcessiveIamPolicy(value: unknown): boolean {
  if (typeof value === "string") {
    const normalized = value.trim();

    if (normalized.includes("AdministratorAccess")) {
      return true;
    }

    if (normalized === "*" || normalized.endsWith(":*")) {
      return true;
    }

    const parsed = parseJsonString(normalized);

    return parsed === null ? false : containsExcessiveIamPolicy(parsed);
  }

  if (Array.isArray(value)) {
    return value.some(containsExcessiveIamPolicy);
  }

  if (!isRecord(value)) {
    return false;
  }

  const actions = getArrayValues(
    value["Action"] ?? value["action"] ?? value["Actions"] ?? value["actions"]
  );
  const resources = getArrayValues(
    value["Resource"] ?? value["resource"] ?? value["Resources"] ?? value["resources"]
  );
  const hasWildcardAction = actions.some(
    (action) => typeof action === "string" && (action === "*" || action.endsWith(":*"))
  );
  const hasWildcardResource =
    resources.length === 0 || resources.some((resource) => resource === "*" || resource === "arn:*");

  if (hasWildcardAction && hasWildcardResource) {
    return true;
  }

  return Object.values(value).some(containsExcessiveIamPolicy);
}

function containsPublicPrincipalAllow(value: unknown): boolean {
  if (typeof value === "string") {
    const parsed = parseJsonString(value);

    return parsed === null ? false : containsPublicPrincipalAllow(parsed);
  }

  if (Array.isArray(value)) {
    return value.some(containsPublicPrincipalAllow);
  }

  if (!isRecord(value)) {
    return false;
  }

  const statement = value["Statement"] ?? value["statement"] ?? value["statements"];

  if (statement !== undefined) {
    return getArrayValues(statement).some(containsPublicPrincipalAllow);
  }

  const effect = getLowerString(value["Effect"] ?? value["effect"]);
  const principal = value["Principal"] ?? value["principal"];

  return effect === "allow" && isPublicPrincipal(principal);
}

function isPublicPrincipal(value: unknown): boolean {
  if (value === "*") {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some(isPublicPrincipal);
  }

  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).some(isPublicPrincipal);
}

function parseTerraformShowJson(terraformShowJson: string): TerraformShowJson {
  try {
    const parsed: unknown = JSON.parse(terraformShowJson);

    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isTerraformResourceChange(value: unknown): value is TerraformResourceChange {
  return isRecord(value);
}

function dedupeWarnings(warnings: readonly DeploymentPlanWarning[]): DeploymentPlanWarning[] {
  const seen = new Set<string>();

  return warnings.filter((warning) => {
    const key = `${warning.code ?? "unknown"}:${warning.relatedResourceId ?? ""}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
}

function getArrayValues(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
}

function getNumberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getLowerString(value: unknown): string | null {
  return typeof value === "string" ? value.trim().toLowerCase() : null;
}

function isPublicCidr(value: unknown): boolean {
  return value === "0.0.0.0/0" || value === "::/0";
}

function isTrue(value: unknown): boolean {
  return value === true || value === "true";
}

function isSameActions(actions: readonly string[], expectedActions: readonly string[]): boolean {
  return (
    actions.length === expectedActions.length &&
    actions.every((action, index) => action === expectedActions[index])
  );
}

function parseJsonString(value: string): unknown | null {
  if (!value.startsWith("{") && !value.startsWith("[")) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
