import type { CheckFinding, DiscoveredResource } from "@sketchcatch/types";

// Reverse Engineering 결과에서 바로 보여줘야 하는 보안/비용 위험을 만듭니다.
export function createReverseEngineeringFindings(
  discoveredResources: DiscoveredResource[]
): CheckFinding[] {
  return discoveredResources.flatMap((resource) => [
    ...createOpenSshFindings(resource),
    ...createPublicRdsFindings(resource),
    ...createPublicS3Findings(resource),
    ...createRdsCostFindings(resource)
  ]);
}

// Security Group이 SSH를 전체 인터넷에 열어둔 경우 high risk로 표시합니다.
function createOpenSshFindings(resource: DiscoveredResource): CheckFinding[] {
  if (resource.resourceType !== "SECURITY_GROUP" || !hasOpenSshIngress(resource.config)) {
    return [];
  }

  return [
    {
      id: `reverse-security-open-ssh-${resource.id}`,
      category: "security",
      severity: "high",
      resourceId: resource.id,
      title: "SSH가 전체 인터넷에 열려 있습니다",
      description: "22번 포트가 0.0.0.0/0으로 열려 있어 누구나 접속을 시도할 수 있습니다.",
      recommendation: "관리자 IP나 팀에서 정한 CIDR만 SSH에 접근할 수 있게 Security Group을 줄이세요."
    }
  ];
}

// RDS가 public 접근 가능 상태면 high risk로 표시합니다.
function createPublicRdsFindings(resource: DiscoveredResource): CheckFinding[] {
  if (resource.resourceType !== "RDS" || resource.config["publiclyAccessible"] !== true) {
    return [];
  }

  return [
    {
      id: `reverse-security-public-rds-${resource.id}`,
      category: "security",
      severity: "high",
      resourceId: resource.id,
      title: "RDS가 public 접근 가능 상태입니다",
      description: "데이터베이스가 인터넷에서 접근 가능한 설정으로 읽혔습니다.",
      recommendation: "RDS를 private subnet에 두고, 필요한 서버 Security Group에서만 접근하게 제한하세요."
    }
  ];
}

// S3 bucket policy가 public 상태면 가져오기 자체는 막지 않고 high risk로 알려줍니다.
function createPublicS3Findings(resource: DiscoveredResource): CheckFinding[] {
  if (resource.resourceType !== "S3" || resource.config["policyStatusIsPublic"] !== true) {
    return [];
  }

  return [
    {
      id: `reverse-security-public-s3-${resource.id}`,
      category: "security",
      severity: "high",
      resourceId: resource.id,
      title: "S3 버킷이 public 접근 가능 상태입니다",
      description: "S3 bucket policy가 인터넷 공개 상태로 읽혔습니다.",
      recommendation: "공개가 꼭 필요한 정적 웹사이트가 아니라면 Public Access Block과 bucket policy를 다시 확인하세요."
    }
  ];
}

// RDS는 켜져 있는 동안 비용이 계속 나가므로 cost risk로 표시합니다.
function createRdsCostFindings(resource: DiscoveredResource): CheckFinding[] {
  if (resource.resourceType !== "RDS") {
    return [];
  }

  return [
    {
      id: `reverse-cost-rds-${resource.id}`,
      category: "cost",
      severity: "medium",
      resourceId: resource.id,
      title: "RDS 월 비용 확인이 필요합니다",
      description: "RDS는 인스턴스가 켜져 있는 동안 지속 비용이 발생합니다.",
      recommendation: "학습/실습 목적이면 작은 인스턴스인지, 중지 또는 삭제 계획이 있는지 확인하세요."
    }
  ];
}

// Security Group ingress 중 22번 포트가 0.0.0.0/0에 열렸는지 확인합니다.
function hasOpenSshIngress(config: Record<string, unknown>): boolean {
  const ingress = config["ingress"];

  if (!Array.isArray(ingress)) {
    return false;
  }

  return ingress.some(isOpenSshIngressRule);
}

// ingress rule 하나가 SSH 전체 공개 조합인지 확인합니다.
function isOpenSshIngressRule(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return value["port"] === 22 && value["cidr"] === "0.0.0.0/0";
}

// unknown 값을 안전하게 key로 읽을 수 있는 객체로 좁힙니다.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
