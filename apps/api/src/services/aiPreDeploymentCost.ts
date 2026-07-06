import type { CheckFinding, ResourceConfig, ResourceCostEstimate, ResourceNode } from "@sketchcatch/types";

// 비용이 커질 수 있는 Resource를 찾아 사용자에게 먼저 알려줍니다.
export function createCostFindings(node: ResourceNode): CheckFinding[] {
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

// 실제 AWS 가격 API 없이도 화면이 비용 추정 모양을 확인할 수 있게 fallback 값을 만듭니다.
export function createResourceCostEstimate(node: ResourceNode): ResourceCostEstimate {
  if (node.type === "RDS") {
    return {
      resourceId: node.id,
      resourceType: node.type,
      name: node.label ?? node.id,
      monthlyEstimate: {
        amount: 15,
        currency: "USD"
      },
      periodEstimate: {
        amount: 15,
        currency: "USD"
      },
      supportLevel: "fallback_estimate",
      supportReason: "추정 단가로 계산했습니다.",
      costDrivers: ["DB instance runtime", "allocated storage"],
      explanation: "1차 제공 fallback은 작은 RDS 인스턴스 기준의 보수적 월 예상 비용을 제공합니다."
    };
  }

  if (node.type === "UNKNOWN" && getTextConfig(node.config, "service").toLowerCase() === "nat_gateway") {
    return {
      resourceId: node.id,
      resourceType: node.type,
      terraformResourceType: "aws_nat_gateway",
      name: node.label ?? node.id,
      monthlyEstimate: {
        amount: 32,
        currency: "USD"
      },
      periodEstimate: {
        amount: 32,
        currency: "USD"
      },
      supportLevel: "fallback_estimate",
      supportReason: "추정 단가로 계산했습니다.",
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
    periodEstimate: {
      amount: 0,
      currency: "USD"
    },
    supportLevel: "not_estimated",
    supportReason: "비용 산정 규칙이 없는 Resource입니다.",
    costDrivers: [],
    explanation: "외부 가격 API 연동 전 fallback 비용 추정입니다."
  };
}

// Resource config에서 문자열 값만 꺼내 비용 규칙이 잘못된 타입을 읽지 않게 합니다.
function getTextConfig(config: ResourceConfig, key: string): string {
  const value = config[key];

  return typeof value === "string" ? value : "";
}
