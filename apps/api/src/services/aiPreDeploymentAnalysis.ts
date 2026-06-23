import type {
  AiPreDeploymentAnalysisResult,
  ArchitectureJson,
  CheckFinding,
  ResourceConfig
} from "@sketchcatch/types";

export function analyzePreDeployment(architectureJson: ArchitectureJson): AiPreDeploymentAnalysisResult {
  const findings = architectureJson.nodes.flatMap((node): CheckFinding[] => {
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
  });

  return {
    summary:
      findings.length > 0
        ? "배포 전에 해결해야 할 Security Risk가 있습니다."
        : "현재 기본 Pre-Deployment Check에서 막는 항목은 없습니다.",
    totalMonthlyEstimate: {
      amount: 0,
      currency: "USD",
      pricingAssumption: "MVP fallback은 실제 AWS 가격 API 없이 위험 분석 중심으로 0 USD를 반환합니다."
    },
    resourceCostEstimates: architectureJson.nodes.map((node) => ({
      resourceId: node.id,
      resourceType: node.type,
      name: node.label ?? node.id,
      monthlyEstimate: {
        amount: 0,
        currency: "USD"
      },
      costDrivers: [],
      explanation: "외부 가격 API 연동 전 fallback 비용 추정입니다."
    })),
    findings,
    checklist: [
      {
        id: "security-open-ssh-check",
        label: "SSH 전체 공개 여부 확인",
        status: findings.length > 0 ? "fail" : "pass",
        relatedFindingIds: findings.map((finding) => finding.id)
      }
    ]
  };
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
