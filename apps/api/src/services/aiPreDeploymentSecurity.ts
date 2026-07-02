import type { CheckFinding, ResourceConfig, ResourceNode } from "@sketchcatch/types";

export function createSecurityFindings(node: ResourceNode): CheckFinding[] {
  const findings: CheckFinding[] = [];

  if (node.type === "SECURITY_GROUP" && detectOpenSshRule(node.config)) {
    findings.push({
      id: `security-open-ssh-${node.id}`,
      category: "security",
      severity: "high",
      resourceId: node.id,
      title: "SSH is open to the public internet",
      description:
        "Port 22 allows 0.0.0.0/0 or ::/0 ingress, so anyone on the internet can attempt SSH access.",
      recommendation: "Restrict SSH ingress to a trusted administration CIDR or remove direct SSH."
    });
  }

  if (node.type === "RDS" && detectPublicRdsConfig(node.config)) {
    findings.push({
      id: `security-public-rds-${node.id}`,
      category: "security",
      severity: "high",
      resourceId: node.id,
      title: "RDS is publicly accessible",
      description:
        "The database is configured for public network reachability, which exposes the data plane to internet scanning and brute-force attempts.",
      recommendation:
        "Set publiclyAccessible to false and place the database in private subnets behind application access."
    });
  }

  if (node.type === "S3" && detectPublicS3Config(node.config)) {
    findings.push({
      id: `security-public-s3-${node.id}`,
      category: "security",
      severity: "high",
      resourceId: node.id,
      title: "S3 public access is enabled",
      description:
        "The bucket configuration allows public ACLs, public policies, or public read/write access.",
      recommendation:
        "Enable S3 Block Public Access and remove public ACL or bucket policy statements unless public hosting is explicitly required."
    });
  }

  if (detectExcessiveIamConfig(node.config)) {
    findings.push({
      id: `security-excessive-iam-${node.id}`,
      category: "permission",
      severity: "high",
      resourceId: node.id,
      title: "IAM permissions are overly broad",
      description:
        "The resource configuration contains wildcard actions, wildcard resources, or administrator policy attachment.",
      recommendation:
        "Replace wildcard IAM permissions with least-privilege actions and resource ARNs for this architecture."
    });
  }

  return findings;
}

function detectOpenSshRule(config: ResourceConfig): boolean {
  const ingress = config["ingress"];

  return Array.isArray(ingress) && ingress.some(isDetectedOpenSshRule);
}

function isDetectedOpenSshRule(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const fromPort = getNumberValue(value["fromPort"] ?? value["from_port"] ?? value["port"]);
  const toPort = getNumberValue(value["toPort"] ?? value["to_port"] ?? value["port"]);
  const cidrs = [
    value["cidr"],
    value["cidrBlock"],
    value["cidr_block"],
    value["cidrIpv4"],
    value["cidr_ipv4"],
    ...getArrayValues(value["cidrBlocks"] ?? value["cidr_blocks"]),
    ...getArrayValues(value["ipv6CidrBlocks"] ?? value["ipv6_cidr_blocks"])
  ];

  return (
    fromPort !== null &&
    toPort !== null &&
    fromPort <= 22 &&
    toPort >= 22 &&
    cidrs.some(isPublicCidr)
  );
}

function detectPublicRdsConfig(config: ResourceConfig): boolean {
  return [
    config["publiclyAccessible"],
    config["publicly_accessible"],
    config["publicAccess"],
    config["public_access"],
    config["isPublic"]
  ].some((value) => value === true || value === "true");
}

function detectPublicS3Config(config: ResourceConfig): boolean {
  const acl = getStringValue(config["acl"] ?? config["accessControl"] ?? config["access_control"]);
  const publicAclValues = new Set(["public-read", "public-read-write", "website"]);

  if (acl && publicAclValues.has(acl)) {
    return true;
  }

  if (
    [config["publicAccess"], config["public_access"], config["isPublic"], config["publicRead"]].some(
      (value) => value === true || value === "true"
    )
  ) {
    return true;
  }

  const blockPublicAccess =
    config["blockPublicAccess"] ?? config["block_public_access"] ?? config["publicAccessBlock"];

  if (blockPublicAccess === false || blockPublicAccess === "false") {
    return true;
  }

  return containsPublicPrincipalAllow(
    config["policy"] ?? config["bucketPolicy"] ?? config["policyDocument"]
  );
}

function detectExcessiveIamConfig(config: ResourceConfig): boolean {
  const relevantEntries = Object.entries(config).filter(([key]) => {
    const normalizedKey = key.toLowerCase();

    return (
      normalizedKey.includes("iam") ||
      normalizedKey.includes("policy") ||
      normalizedKey.includes("permission") ||
      normalizedKey.includes("action")
    );
  });

  return relevantEntries.some(([, value]) => containsExcessiveIamPolicy(value));
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
    value["Action"] ?? value["action"] ?? value["actions"] ?? value["Actions"]
  );
  const resources = getArrayValues(
    value["Resource"] ?? value["resource"] ?? value["resources"] ?? value["Resources"]
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

  const effect = getStringValue(value["Effect"] ?? value["effect"]);
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

function getStringValue(value: unknown): string | null {
  return typeof value === "string" ? value.trim().toLowerCase() : null;
}

function getArrayValues(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
}

function isPublicCidr(value: unknown): boolean {
  return value === "0.0.0.0/0" || value === "::/0";
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

// 현재 MVP에서는 Security Group의 SSH 전체 공개 여부를 가장 먼저 잡습니다.
function _createLegacySecurityFindings(node: ResourceNode): CheckFinding[] {
  if (node.type !== "SECURITY_GROUP" || !hasOpenSshRule(node.config)) {
    return [];
  }

  return [
    {
      id: `security-open-ssh-${node.id}`,
      category: "security",
      severity: "high",
      resourceId: node.id,
      title: "SSH가 전체 인터넷에 열려 있습니다",
      description: "22번 포트가 0.0.0.0/0으로 열려 있어 누구나 SSH 접속을 시도할 수 있습니다.",
      recommendation: "SSH 접근 대상을 본인 IP나 팀에서 정한 관리용 CIDR로 제한하세요."
    }
  ];
}

// Security Group config 안에 SSH 전체 공개 ingress rule이 있는지 찾습니다.
function hasOpenSshRule(config: ResourceConfig): boolean {
  const ingress = config["ingress"];

  if (!Array.isArray(ingress)) {
    return false;
  }

  return ingress.some(isOpenSshRule);
}

// ingress rule 하나가 "22번 포트 + 전체 공개" 조합인지 확인합니다.
function isOpenSshRule(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const port = value["port"];
  const cidr = value["cidr"];

  return (port === 22 || port === "22") && cidr === "0.0.0.0/0";
}

// unknown 값을 index 접근 가능한 객체로 좁히는 작은 타입 guard입니다.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
