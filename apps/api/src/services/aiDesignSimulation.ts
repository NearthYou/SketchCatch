import type {
  CreateDesignSimulationRequest,
  DesignSimulationBottleneck,
  DesignSimulationFailureScenario,
  DesignSimulationRequestFlowStep,
  DesignSimulationResult,
  ResourceEdge,
  ResourceNode
} from "@sketchcatch/types";

// ArchitectureJson만 근거로 삼아 실제 부하 테스트처럼 보이지 않는 설계 추정을 만듭니다.
export function simulateDesign(input: CreateDesignSimulationRequest): DesignSimulationResult {
  const resourceById = createResourceLookup(input.architectureJson.nodes);
  const requestFlow = createRequestFlow(input.architectureJson.edges, resourceById);
  const bottlenecks = createBottlenecks(input.architectureJson.nodes, input.trafficLevel);
  const failureScenarios = createFailureScenarios(input.architectureJson.nodes);
  const costPressure = createCostPressure(input.architectureJson.nodes, input.budgetLevel);

  return {
    summary: `${input.architectureJson.nodes.length}개 Resource와 ${input.architectureJson.edges.length}개 연결을 기준으로 Design Simulation을 만들었습니다.`,
    assumptions: [
      "실제 부하 테스트가 아닌 ArchitectureJson 기반 추정입니다.",
      `트래픽은 ${input.trafficLevel === "normal" ? "보통" : "작음"} 수준으로 가정합니다.`,
      `예산은 ${input.budgetLevel === "low" ? "낮음" : "보통"} 수준으로 가정합니다.`
    ],
    requestFlow,
    bottlenecks,
    failureScenarios,
    costPressure,
    recommendations: createRecommendations(bottlenecks, failureScenarios, costPressure)
  };
}

// Edge 설명을 만들 때 Resource id로 label과 type을 바로 찾기 위한 lookup입니다.
function createResourceLookup(nodes: readonly ResourceNode[]): ReadonlyMap<string, ResourceNode> {
  return new Map(nodes.map((node) => [node.id, node]));
}

// Infrastructure Graph의 Edge를 사용자에게 읽히는 요청 흐름 단계로 바꿉니다.
function createRequestFlow(
  edges: readonly ResourceEdge[],
  resourceById: ReadonlyMap<string, ResourceNode>
): DesignSimulationRequestFlowStep[] {
  return edges.map((edge) => {
    const source = resourceById.get(edge.sourceId);
    const target = resourceById.get(edge.targetId);

    return {
      fromResourceId: edge.sourceId,
      toResourceId: edge.targetId,
      description: `${describeResource(source, edge.sourceId)}에서 ${describeResource(target, edge.targetId)}로 요청이나 데이터가 이동합니다.`
    };
  });
}

// 단일 Resource가 트래픽을 혼자 받는 MVP 위험을 병목 후보로 잡습니다.
function createBottlenecks(
  nodes: readonly ResourceNode[],
  trafficLevel: CreateDesignSimulationRequest["trafficLevel"]
): DesignSimulationBottleneck[] {
  const ec2Nodes = nodes.filter((node) => node.type === "EC2");
  const rdsNodes = nodes.filter((node) => node.type === "RDS");
  const bottlenecks: DesignSimulationBottleneck[] = [];

  if (trafficLevel === "normal" && ec2Nodes.length === 1) {
    const [node] = ec2Nodes;

    if (node !== undefined) {
      bottlenecks.push({
        id: `bottleneck-single-ec2-${node.id}`,
        resourceId: node.id,
        severity: "medium",
        title: "단일 EC2 처리 용량 주의",
        description: "보통 트래픽에서 EC2가 하나뿐이면 요청이 몰릴 때 응답 지연이 생길 수 있습니다."
      });
    }
  }

  if (rdsNodes.length === 1) {
    const [node] = rdsNodes;

    if (node !== undefined) {
      bottlenecks.push({
        id: `bottleneck-single-rds-${node.id}`,
        resourceId: node.id,
        severity: "medium",
        title: "단일 RDS 연결 집중 주의",
        description: "DB가 하나뿐이면 API 요청이 늘 때 연결과 쿼리가 한 Resource에 집중됩니다."
      });
    }
  }

  return bottlenecks;
}

// Resource 구성이 하나뿐일 때 장애가 어디까지 번지는지 사용자에게 먼저 보여줍니다.
function createFailureScenarios(nodes: readonly ResourceNode[]): DesignSimulationFailureScenario[] {
  const ec2Nodes = nodes.filter((node) => node.type === "EC2");
  const rdsNodes = nodes.filter((node) => node.type === "RDS");
  const publicExposureNodes = nodes.filter(hasPublicExposure);
  const scenarios: DesignSimulationFailureScenario[] = [];

  if (ec2Nodes.length === 1) {
    const [node] = ec2Nodes;

    if (node !== undefined) {
      scenarios.push({
        id: `failure-single-ec2-${node.id}`,
        title: "EC2 장애 시 API 응답 중단 가능",
        affectedResourceIds: [node.id],
        description: "대체 EC2나 Load Balancer가 없으면 해당 서버 장애가 곧 서비스 중단으로 이어질 수 있습니다.",
        mitigation: "두 번째 EC2, Auto Scaling, Load Balancer는 후속 설계에서 검토하세요."
      });
    }
  }

  if (rdsNodes.length === 1) {
    const [node] = rdsNodes;

    if (node !== undefined) {
      scenarios.push({
        id: `failure-single-rds-${node.id}`,
        title: "RDS 장애 시 읽기와 쓰기 중단 가능",
        affectedResourceIds: [node.id],
        description: "DB가 하나뿐이면 장애나 점검 시간 동안 애플리케이션이 데이터를 읽고 쓰기 어렵습니다.",
        mitigation: "백업, Multi-AZ, 복구 절차는 비용과 함께 후속 설계에서 검토하세요."
      });
    }
  }

  for (const node of publicExposureNodes) {
    scenarios.push({
      id: `failure-public-exposure-${node.id}`,
      title: "Public 노출 Resource 접근 시도 증가 가능",
      affectedResourceIds: [node.id],
      description: "전체 인터넷에 열린 접근 규칙은 연습 환경에서도 불필요한 접속 시도와 보안 점검 부담을 늘릴 수 있습니다.",
      mitigation: "접근 대상을 본인 IP나 팀 관리용 CIDR로 줄이는 방안을 먼저 검토하세요."
    });
  }

  return scenarios;
}

// 현재 MVP에서 확실히 표현된 public 노출인 SSH 전체 공개 Security Group을 찾습니다.
function hasPublicExposure(node: ResourceNode): boolean {
  return node.type === "SECURITY_GROUP" && hasOpenSshRule(node);
}

// Security Group config의 ingress 배열에서 SSH 전체 공개 조합을 확인합니다.
function hasOpenSshRule(node: ResourceNode): boolean {
  const ingress = node.config["ingress"];

  if (!Array.isArray(ingress)) {
    return false;
  }

  return ingress.some(isOpenSshRule);
}

// ingress rule 하나를 unknown에서 좁힌 뒤 22번 포트와 0.0.0.0/0 조합만 잡습니다.
function isOpenSshRule(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const port = value["port"];
  const cidr = value["cidr"];

  return (port === 22 || port === "22") && cidr === "0.0.0.0/0";
}

// Resource config 내부의 unknown 값을 안전하게 읽기 위한 작은 타입 guard입니다.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// 낮은 예산에서 비용 압박이 생기기 쉬운 Resource를 별도 문장으로 분리합니다.
function createCostPressure(
  nodes: readonly ResourceNode[],
  budgetLevel: CreateDesignSimulationRequest["budgetLevel"]
): string[] {
  const pressure: string[] = [];

  if (nodes.some((node) => node.type === "RDS")) {
    pressure.push(
      budgetLevel === "low"
        ? "RDS는 낮은 예산에서 가장 먼저 비용 압박을 만들 수 있습니다."
        : "RDS는 실행 시간과 스토리지 비용을 함께 확인해야 합니다."
    );
  }

  if (nodes.some((node) => node.type === "EC2")) {
    pressure.push("EC2는 인스턴스 크기와 실행 시간이 비용에 직접 영향을 줍니다.");
  }

  return pressure;
}

// 병목, 장애, 비용 압박을 사용자가 다음 설계 행동으로 옮길 수 있는 문장으로 줄입니다.
function createRecommendations(
  bottlenecks: readonly DesignSimulationBottleneck[],
  failureScenarios: readonly DesignSimulationFailureScenario[],
  costPressure: readonly string[]
): string[] {
  const recommendations: string[] = [];

  if (bottlenecks.some((item) => item.resourceId.includes("ec2"))) {
    recommendations.push("EC2가 하나뿐이면 보통 트래픽 전에 두 번째 EC2나 Load Balancer 필요성을 검토하세요.");
  }

  if (failureScenarios.some((item) => item.affectedResourceIds.some((id) => id.includes("rds")))) {
    recommendations.push("RDS 장애 시나리오는 백업과 복구 시간을 함께 적어두세요.");
  }

  if (costPressure.length > 0) {
    recommendations.push("비용 압박이 있는 Resource는 Practice Session 시간을 짧게 잡고 Auto Cleanup 계획을 확인하세요.");
  }

  return recommendations;
}

// label이 없거나 Edge가 끊겨 있어도 흐름 설명이 비지 않게 fallback 이름을 만듭니다.
function describeResource(node: ResourceNode | undefined, fallbackId: string): string {
  if (node === undefined) {
    return fallbackId;
  }

  return `${node.label ?? node.id}(${node.type})`;
}
