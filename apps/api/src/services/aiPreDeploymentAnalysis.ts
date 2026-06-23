import type {
  AiPreDeploymentAnalysisResult,
  ArchitectureJson,
  ChecklistItem,
  CheckFinding,
  ResourceConfig,
  ResourceCostEstimate,
  ResourceNode
} from "@sketchcatch/types";

export function analyzePreDeployment(architectureJson: ArchitectureJson): AiPreDeploymentAnalysisResult {
  const findings = architectureJson.nodes.flatMap(createFindingsForNode);
  const resourceCostEstimates = architectureJson.nodes.map(createResourceCostEstimate);

  return {
    summary: createSummary(findings),
    totalMonthlyEstimate: {
      amount: 0,
      currency: "USD",
      pricingAssumption: "MVP fallback은 실제 AWS 가격 API 없이 위험 분석 중심으로 0 USD를 반환합니다."
    },
    resourceCostEstimates,
    findings,
    checklist: createChecklist(findings)
  };
}

function createSummary(findings: readonly CheckFinding[]): string {
  if (findings.length === 0) {
    return "현재 기본 Pre-Deployment Check에서 막는 항목은 없습니다.";
  }

  if (findings.some((finding) => finding.category === "security")) {
    return "배포 전에 해결해야 할 Security Risk가 있습니다.";
  }

  if (findings.some((finding) => finding.category === "configuration")) {
    return "배포 전에 빠진 Resource 설정을 확인해야 합니다.";
  }

  return "배포 전에 Cost Risk를 확인해야 합니다.";
}

function createFindingsForNode(node: ResourceNode): CheckFinding[] {
  return [
    ...createSecurityFindings(node),
    ...createCostFindings(node),
    ...createConfigurationFindings(node)
  ];
}

function createSecurityFindings(node: ResourceNode): CheckFinding[] {
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

function createCostFindings(node: ResourceNode): CheckFinding[] {
  if (node.type === "RDS") {
    return [
      {
        id: `cost-rds-${node.id}`,
        category: "cost",
        severity: "medium",
        resourceId: node.id,
        title: "RDS는 연습 비용이 커질 수 있습니다",
        description: "RDS는 인스턴스 실행 시간과 스토리지 비용이 함께 발생할 수 있습니다.",
        recommendation: "연습 시간이 짧다면 작은 instanceClass를 쓰고 Practice Session 종료 후 정리 계획을 확인하세요."
      }
    ];
  }

  if (node.type === "UNKNOWN" && getTextConfig(node.config, "service").toLowerCase() === "nat_gateway") {
    return [
      {
        id: `cost-nat-gateway-${node.id}`,
        category: "cost",
        severity: "high",
        resourceId: node.id,
        title: "NAT Gateway는 시간당 비용이 큽니다",
        description: "NAT Gateway는 실행 시간과 데이터 처리량에 따라 비용이 빠르게 늘 수 있습니다.",
        recommendation: "MVP 연습에서는 NAT Gateway가 정말 필요한지 확인하고 대체 구조를 검토하세요."
      }
    ];
  }

  return [];
}

function createConfigurationFindings(node: ResourceNode): CheckFinding[] {
  const missingKeys = getRequiredConfigKeys(node).filter((key) => !hasConfigValue(node.config, key));

  if (missingKeys.length === 0) {
    return [];
  }

  return [
    {
      id: `configuration-missing-${node.id}`,
      category: "configuration",
      severity: "medium",
      resourceId: node.id,
      title: "필수 Resource 설정이 빠져 있습니다",
      description: `${node.label ?? node.id}에 ${missingKeys.join(", ")} 설정이 필요합니다.`,
      recommendation: "Architecture Board의 Resource 설정 패널에서 빠진 값을 채운 뒤 다시 확인하세요."
    }
  ];
}

function createResourceCostEstimate(node: ResourceNode): ResourceCostEstimate {
  if (node.type === "RDS") {
    return {
      resourceId: node.id,
      resourceType: node.type,
      name: node.label ?? node.id,
      monthlyEstimate: {
        amount: 15,
        currency: "USD"
      },
      costDrivers: ["DB instance runtime", "allocated storage"],
      explanation: "MVP fallback은 작은 RDS 인스턴스 기준의 보수적 월 예상 비용을 제공합니다."
    };
  }

  if (node.type === "UNKNOWN" && getTextConfig(node.config, "service").toLowerCase() === "nat_gateway") {
    return {
      resourceId: node.id,
      resourceType: node.type,
      name: node.label ?? node.id,
      monthlyEstimate: {
        amount: 32,
        currency: "USD"
      },
      costDrivers: ["NAT Gateway hourly runtime", "data processing"],
      explanation: "공통 ResourceType 확정 전에는 service=nat_gateway 설정을 비용 추정 fallback으로 사용합니다."
    };
  }

  return {
    resourceId: node.id,
    resourceType: node.type,
    name: node.label ?? node.id,
    monthlyEstimate: {
      amount: 0,
      currency: "USD"
    },
    costDrivers: [],
    explanation: "외부 가격 API 연동 전 fallback 비용 추정입니다."
  };
}

function createChecklist(findings: readonly CheckFinding[]): ChecklistItem[] {
  const securityFindingIds = getFindingIdsByCategory(findings, "security");
  const costFindingIds = getFindingIdsByCategory(findings, "cost");
  const configurationFindingIds = getFindingIdsByCategory(findings, "configuration");

  return [
    {
      id: "security-open-ssh-check",
      label: "SSH 전체 공개 여부 확인",
      status: securityFindingIds.length > 0 ? "fail" : "pass",
      relatedFindingIds: securityFindingIds
    },
    {
      id: "cost-risk-check",
      label: "고비용 Resource 여부 확인",
      status: costFindingIds.length > 0 ? "warning" : "pass",
      relatedFindingIds: costFindingIds
    },
    {
      id: "required-config-check",
      label: "필수 Resource 설정 입력 여부 확인",
      status: configurationFindingIds.length > 0 ? "fail" : "pass",
      relatedFindingIds: configurationFindingIds
    }
  ];
}

function getFindingIdsByCategory(
  findings: readonly CheckFinding[],
  category: CheckFinding["category"]
): string[] {
  return findings.filter((finding) => finding.category === category).map((finding) => finding.id);
}

function getRequiredConfigKeys(node: ResourceNode): readonly string[] {
  switch (node.type) {
    case "VPC":
      return ["cidrBlock"];
    case "SUBNET":
      return ["cidrBlock", "vpcId"];
    case "EC2":
      return ["instanceType", "subnetId", "securityGroupIds"];
    case "RDS":
      return ["engine", "instanceClass"];
    case "SECURITY_GROUP":
      return ["vpcId"];
    case "S3":
    case "CLOUDFRONT":
    case "LAMBDA":
    case "UNKNOWN":
      return [];
  }
}

function hasOpenSshRule(config: ResourceConfig): boolean {
  const ingress = config["ingress"];

  if (!Array.isArray(ingress)) {
    return false;
  }

  return ingress.some(isOpenSshRule);
}

function isOpenSshRule(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const port = value["port"];
  const cidr = value["cidr"];

  return (port === 22 || port === "22") && cidr === "0.0.0.0/0";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasConfigValue(config: ResourceConfig, key: string): boolean {
  const value = config[key];

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return value !== undefined && value !== null && value !== "";
}

function getTextConfig(config: ResourceConfig, key: string): string {
  const value = config[key];

  return typeof value === "string" ? value : "";
}
