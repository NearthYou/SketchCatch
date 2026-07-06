import type { CheckFinding, ResourceConfig, ResourceNode } from "@sketchcatch/types";

// 현재 MVP에서는 Security Group의 SSH 전체 공개 여부를 가장 먼저 잡습니다.
function createLegacySecurityFindings(node: ResourceNode): CheckFinding[] {
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

export function createSecurityFindings(node: ResourceNode): CheckFinding[] {
  const findings: CheckFinding[] = [];

  if (node.type === "SECURITY_GROUP" && hasOpenSshRuleExpanded(node.config)) {
    findings.push({
      id: `security-open-ssh-${node.id}`,
      category: "security",
      severity: "high",
      resourceId: node.id,
      title: "SSH가 전체 인터넷에 열려 있습니다",
      description: "22번 포트가 0.0.0.0/0 또는 ::/0으로 열려 있어 누구나 SSH 접속을 시도할 수 있습니다.",
      recommendation: "SSH 접근 대상을 본인 IP나 승인된 관리용 CIDR로 제한하세요."
    });
  }

  if (node.type === "RDS" && hasPublicRdsAccess(node.config)) {
    findings.push({
      id: `security-public-rds-${node.id}`,
      category: "security",
      severity: "high",
      resourceId: node.id,
      title: "RDS가 public access로 설정되어 있습니다",
      description: "데이터베이스가 public endpoint로 노출될 수 있어 네트워크 공격면이 커집니다.",
      recommendation: "RDS publiclyAccessible 설정을 끄고 private subnet과 제한된 Security Group으로만 접근시키세요."
    });
  }

  if (node.type === "S3" && hasPublicS3Access(node.config)) {
    findings.push({
      id: `security-public-s3-${node.id}`,
      category: "security",
      severity: "high",
      resourceId: node.id,
      title: "S3 Bucket이 public access를 허용합니다",
      description: "S3 ACL, bucket policy, public access block 설정 때문에 객체가 외부에 노출될 수 있습니다.",
      recommendation: "public ACL과 public bucket policy를 제거하고 public access block을 활성화하세요."
    });
  }

  if (hasIamWildcardPolicy(node.config)) {
    findings.push({
      id: `permission-iam-wildcard-${node.id}`,
      category: "permission",
      severity: "high",
      resourceId: node.id,
      title: "IAM 정책에 wildcard 권한이 포함되어 있습니다",
      description: "Action과 Resource wildcard 조합은 필요 이상의 권한을 부여할 수 있습니다.",
      recommendation: "필요한 AWS action과 resource ARN만 명시하도록 IAM 정책을 축소하세요."
    });
  }

  return findings.length > 0 ? findings : createLegacySecurityFindings(node);
}

function hasOpenSshRuleExpanded(config: ResourceConfig): boolean {
  const ingress = config["ingress"];

  if (!Array.isArray(ingress)) {
    return false;
  }

  return ingress.some(isOpenSshRuleExpanded);
}

function isOpenSshRuleExpanded(value: unknown): boolean {
  return isRecord(value) && hasPort22(value) && hasPublicCidr(value);
}

function hasPort22(rule: Record<string, unknown>): boolean {
  const directPort = getFirstValue(rule, ["port"]);
  const fromPort = getFirstValue(rule, ["fromPort", "from_port"]);
  const toPort = getFirstValue(rule, ["toPort", "to_port"]);

  if (toPortNumber(directPort) === 22) {
    return true;
  }

  const from = toPortNumber(fromPort);
  const to = toPortNumber(toPort);

  return from !== null && to !== null && from <= 22 && 22 <= to;
}

function hasPublicCidr(value: unknown): boolean {
  if (typeof value === "string") {
    return value === "0.0.0.0/0" || value === "::/0";
  }

  if (Array.isArray(value)) {
    return value.some(hasPublicCidr);
  }

  if (!isRecord(value)) {
    return false;
  }

  return hasPublicCidr(
    getFirstValue(value, [
      "cidr",
      "cidrBlock",
      "cidr_block",
      "cidrBlocks",
      "cidr_blocks",
      "cidrIpv4",
      "cidr_ipv4",
      "cidrIpv6",
      "cidr_ipv6",
      "sourceCidrIp",
      "source_cidr_ip"
    ])
  );
}

function hasPublicRdsAccess(config: ResourceConfig): boolean {
  return isTruthy(
    getFirstValue(config, [
      "publiclyAccessible",
      "publicly_accessible",
      "publicAccess",
      "public_access"
    ])
  );
}

function hasPublicS3Access(config: ResourceConfig): boolean {
  const acl = getFirstValue(config, ["acl", "accessControl", "access_control", "cannedAcl"]);

  if (typeof acl === "string" && ["public-read", "public-read-write"].includes(acl)) {
    return true;
  }

  if (
    isTruthy(
      getFirstValue(config, [
        "public",
        "publicRead",
        "public_read",
        "publicAccess",
        "public_access",
        "publicWebsite",
        "public_website"
      ])
    )
  ) {
    return true;
  }

  const publicAccessBlock = getFirstValue(config, [
    "publicAccessBlock",
    "public_access_block",
    "blockPublicAccess",
    "block_public_access"
  ]);

  if (publicAccessBlock === false || publicAccessBlock === "false") {
    return true;
  }

  return hasPublicPrincipalPolicy(
    getFirstValue(config, ["policy", "bucketPolicy", "bucket_policy"])
  );
}

function hasIamWildcardPolicy(config: ResourceConfig): boolean {
  const policyCandidate =
    getFirstValue(config, [
      "policy",
      "policyDocument",
      "policy_document",
      "inlinePolicy",
      "inline_policy"
    ]) ?? config;

  return containsWildcardIamStatement(policyCandidate);
}

function containsWildcardIamStatement(value: unknown): boolean {
  const parsedValue = parseJsonString(value);

  if (parsedValue !== value) {
    return containsWildcardIamStatement(parsedValue);
  }

  if (typeof value === "string") {
    return hasWildcardPolicyString(value);
  }

  if (Array.isArray(value)) {
    return value.some(containsWildcardIamStatement);
  }

  if (!isRecord(value)) {
    return false;
  }

  const action = getFirstValue(value, ["Action", "action", "Actions", "actions"]);
  const resource = getFirstValue(value, ["Resource", "resource", "Resources", "resources"]);

  if (hasWildcardAction(action) && hasWildcardResource(resource)) {
    return true;
  }

  return Object.values(value).some(containsWildcardIamStatement);
}

function hasPublicPrincipalPolicy(value: unknown): boolean {
  const parsedValue = parseJsonString(value);

  if (parsedValue !== value) {
    return hasPublicPrincipalPolicy(parsedValue);
  }

  if (typeof value === "string") {
    return (
      /"Effect"\s*:\s*"Allow"/.test(value) &&
      /"Principal"\s*:\s*(?:"\*"|\{\s*"AWS"\s*:\s*"\*"\s*\})/.test(value)
    );
  }

  if (Array.isArray(value)) {
    return value.some(hasPublicPrincipalPolicy);
  }

  if (!isRecord(value)) {
    return false;
  }

  const effect = getFirstValue(value, ["Effect", "effect"]);
  const principal = getFirstValue(value, ["Principal", "principal"]);

  if (effect === "Allow" && isWildcardPrincipal(principal)) {
    return true;
  }

  return Object.values(value).some(hasPublicPrincipalPolicy);
}

function hasWildcardAction(value: unknown): boolean {
  if (typeof value === "string") {
    return value === "*" || value.endsWith(":*");
  }

  return Array.isArray(value) && value.some(hasWildcardAction);
}

function hasWildcardResource(value: unknown): boolean {
  if (typeof value === "string") {
    return value === "*";
  }

  return Array.isArray(value) && value.some(hasWildcardResource);
}

function isWildcardPrincipal(value: unknown): boolean {
  if (value === "*") {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some(isWildcardPrincipal);
  }

  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).some(isWildcardPrincipal);
}

function hasWildcardPolicyString(value: string): boolean {
  return (
    /"Action"\s*:\s*(?:"\*"|"[^"]+:\*"|\[[^\]]*(?:"\*"|"[^"]+:\*")[^\]]*\])/.test(value) &&
    /"Resource"\s*:\s*(?:"\*"|\[[^\]]*"\*"[^\]]*\])/.test(value)
  );
}

function parseJsonString(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();

  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return value;
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function getFirstValue(record: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      return record[key];
    }
  }

  return undefined;
}

function isTruthy(value: unknown): boolean {
  return value === true || value === "true";
}

function toPortNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const port = Number(value);

  return Number.isInteger(port) ? port : null;
}
