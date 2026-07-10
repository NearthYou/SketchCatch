import type {
  AiTerraformDetectedResource,
  AiTerraformPreviewExplanationResult,
  AiWellArchitectedGuidance,
  CheckFinding
} from "@sketchcatch/types";

// Terraform 코드 조각을 읽고 어떤 Resource와 위험 신호가 있는지 설명합니다.
export function explainTerraformPreview(terraformCode: string): AiTerraformPreviewExplanationResult {
  const normalizedCode = terraformCode.toLowerCase();
  const resourceBlocks = parseTerraformResourceBlocks(terraformCode);
  const detectedResources = detectTerraformResources(terraformCode, resourceBlocks);
  const findings = createTerraformPreviewFindings(normalizedCode);
  const evaluationContext: TerraformPreviewEvaluationContext = {
    detectedResources,
    findings,
    normalizedCode,
    resourceBlocks
  };

  return {
    summary: createTerraformPreviewSummary(detectedResources),
    detectedResources,
    findings,
    checklist: [
      {
        id: "terraform-review-check",
        label: "IaC Preview가 만드는 Resource와 위험 항목 확인",
        status: findings.length > 0 ? "warning" : "pass",
        relatedFindingIds: findings.map((finding) => finding.id)
      }
    ],
    wellArchitectedGuidance: createTerraformPreviewWellArchitectedGuidance(evaluationContext),
    consensusRecommendation: createTerraformPreviewConsensusRecommendation(evaluationContext)
  };
}

type TerraformResourceBlock = {
  readonly terraformType: string;
  readonly resourceName: string;
  readonly body: string;
};

type TerraformResourceExplanation = {
  readonly label: string;
  readonly explain: (block: TerraformResourceBlock) => string;
};

type TerraformPreviewEvaluationContext = {
  readonly detectedResources: readonly AiTerraformDetectedResource[];
  readonly findings: readonly CheckFinding[];
  readonly normalizedCode: string;
  readonly resourceBlocks: readonly TerraformResourceBlock[];
};

type TerraformPreviewPillarEvaluator = {
  readonly pillar: AiWellArchitectedGuidance["pillar"];
  readonly title: string;
  readonly evaluate: (context: TerraformPreviewEvaluationContext) => {
    readonly observation: string;
    readonly recommendation: string;
  };
};

const terraformResourceExplanations: Record<string, TerraformResourceExplanation> = {
  aws_db_instance: {
    label: "RDS Database",
    explain: (block) => {
      const engine = readTerraformAttribute(block.body, "engine");
      const instanceClass = readTerraformAttribute(block.body, "instance_class");

      return [
        "관리형 데이터베이스 인스턴스를 만듭니다.",
        engine ? `${engine} 엔진을 사용합니다.` : "",
        instanceClass ? `${instanceClass} 크기로 과금과 성능 범위가 결정됩니다.` : ""
      ]
        .filter(Boolean)
        .join(" ");
    }
  },
  aws_instance: {
    label: "EC2 Instance",
    explain: (block) => {
      const instanceType = readTerraformAttribute(block.body, "instance_type");
      const subnetId = readTerraformAttribute(block.body, "subnet_id");

      return [
        "가상 서버를 생성합니다.",
        instanceType ? `${instanceType} 인스턴스 타입을 사용합니다.` : "",
        subnetId ? `${subnetId} 서브넷 안에 배치됩니다.` : ""
      ]
        .filter(Boolean)
        .join(" ");
    }
  },
  aws_internet_gateway: {
    label: "Internet Gateway",
    explain: (block) => {
      const vpcId = readTerraformAttribute(block.body, "vpc_id");

      return vpcId
        ? `${vpcId} VPC가 인터넷과 통신할 수 있도록 게이트웨이를 붙입니다.`
        : "VPC가 인터넷과 통신할 수 있도록 게이트웨이를 붙입니다.";
    }
  },
  aws_route_table: {
    label: "Route Table",
    explain: (block) => {
      const vpcId = readTerraformAttribute(block.body, "vpc_id");
      const gatewayId = readTerraformAttribute(block.body, "gateway_id");

      return [
        vpcId ? `${vpcId} VPC 안의 트래픽 경로 규칙을 정의합니다.` : "트래픽 경로 규칙을 정의합니다.",
        gatewayId ? `${gatewayId}로 나가는 경로가 포함되어 인터넷 통신 방향을 잡습니다.` : ""
      ]
        .filter(Boolean)
        .join(" ");
    }
  },
  aws_route_table_association: {
    label: "Route Table Association",
    explain: (block) => {
      const subnetId = readTerraformAttribute(block.body, "subnet_id");
      const routeTableId = readTerraformAttribute(block.body, "route_table_id");

      if (subnetId && routeTableId) {
        return `${subnetId} 서브넷에 ${routeTableId} 라우팅 규칙을 적용합니다. 이 연결이 있어야 해당 서브넷의 트래픽이 지정된 Route Table을 따라 이동합니다.`;
      }

      return "특정 서브넷에 Route Table을 연결해서 해당 서브넷의 트래픽 경로를 결정합니다.";
    }
  },
  aws_s3_bucket: {
    label: "S3 Bucket",
    explain: (block) => {
      const bucket = readTerraformAttribute(block.body, "bucket");

      return bucket
        ? `${bucket} 이름의 객체 저장소를 만듭니다. 정적 파일, 업로드 파일, Terraform artifact 같은 데이터를 저장할 수 있습니다.`
        : "객체 저장소를 만듭니다. 정적 파일, 업로드 파일, Terraform artifact 같은 데이터를 저장할 수 있습니다.";
    }
  },
  aws_security_group: {
    label: "Security Group",
    explain: (block) => {
      const vpcId = readTerraformAttribute(block.body, "vpc_id");

      return vpcId
        ? `${vpcId} VPC 안에서 리소스의 inbound/outbound 트래픽을 제어하는 방화벽 규칙 묶음을 만듭니다.`
        : "리소스의 inbound/outbound 트래픽을 제어하는 방화벽 규칙 묶음을 만듭니다.";
    }
  },
  aws_security_group_rule: {
    label: "Security Group Rule",
    explain: (block) => {
      const ruleType = readTerraformAttribute(block.body, "type");
      const fromPort = readTerraformAttribute(block.body, "from_port");
      const toPort = readTerraformAttribute(block.body, "to_port");
      const cidrBlocks = readTerraformAttribute(block.body, "cidr_blocks");

      return [
        `Security Group의 ${ruleType ?? "ingress/egress"} 규칙을 정의합니다.`,
        fromPort && toPort ? `${fromPort}-${toPort} 포트 범위를 다룹니다.` : "",
        cidrBlocks ? `${cidrBlocks} 대상과 통신을 허용합니다.` : ""
      ]
        .filter(Boolean)
        .join(" ");
    }
  },
  aws_subnet: {
    label: "Subnet",
    explain: (block) => {
      const vpcId = readTerraformAttribute(block.body, "vpc_id");
      const cidrBlock = readTerraformAttribute(block.body, "cidr_block");

      return [
        vpcId ? `${vpcId} VPC 안의 네트워크 구역을 만듭니다.` : "VPC 안의 네트워크 구역을 만듭니다.",
        cidrBlock ? `${cidrBlock} IP 대역을 사용합니다.` : ""
      ]
        .filter(Boolean)
        .join(" ");
    }
  },
  aws_vpc: {
    label: "VPC",
    explain: (block) => {
      const cidrBlock = readTerraformAttribute(block.body, "cidr_block");

      return cidrBlock
        ? `${cidrBlock} CIDR 범위를 가진 AWS 가상 네트워크를 만듭니다. 이후 Subnet, Route Table, Security Group이 이 네트워크 안에 배치됩니다.`
        : "AWS 가상 네트워크를 만듭니다. 이후 Subnet, Route Table, Security Group이 이 네트워크 안에 배치됩니다.";
    }
  }
};

const terraformPreviewPillarEvaluators: TerraformPreviewPillarEvaluator[] = [
  {
    pillar: "operational_excellence",
    title: "운영 우수성 에이전트",
    evaluate: (context) => {
      if (context.detectedResources.length === 0) {
        return {
          observation: "현재 코드 범위에서는 평가할 Terraform resource 블록이 없습니다.",
          recommendation: "provider, variable, output만 있는 조각이라면 실제 resource가 포함된 파일 범위에서 다시 Preview 설명을 요청하세요."
        };
      }

      return {
        observation: `${context.detectedResources.length}개 Terraform resource를 기준으로 변경 영향과 검증 순서를 평가했습니다.`,
        recommendation: "변경 전 `terraform validate`와 plan 검토를 통과시키고, 경고가 있는 항목은 배포 승인 전에 코드 위치에서 먼저 수정하세요."
      };
    }
  },
  {
    pillar: "security",
    title: "보안 에이전트",
    evaluate: (context) => {
      const openSshFinding = context.findings.find((finding) => finding.id === "terraform-security-open-ssh");

      if (openSshFinding) {
        return {
          observation: "Security Group Rule에서 SSH 22번 포트가 0.0.0.0/0으로 열려 있어 외부 공격 표면이 큽니다.",
          recommendation: "관리자 고정 IP나 VPN CIDR만 허용하고, 가능하면 Session Manager 같은 비공개 운영 접속 경로로 전환하세요."
        };
      }

      if (hasTerraformResourceType(context, "aws_security_group") || hasTerraformResourceType(context, "aws_security_group_rule")) {
        return {
          observation: "보안 그룹 관련 리소스가 있으나, 현재 rule 기반 검사에서는 전체 공개 SSH 패턴은 감지되지 않았습니다.",
          recommendation: "ingress/egress 범위, 관리 포트, 암호화 관련 설정을 실제 요구사항 기준으로 한 번 더 좁혀 검토하세요."
        };
      }

      return {
        observation: "현재 코드 범위에서 명시적인 네트워크 보안 경계가 보이지 않습니다.",
        recommendation: "컴퓨트나 데이터 저장소가 포함된 다이어그램이라면 Security Group, IAM, 암호화 설정이 함께 정의되어 있는지 확인하세요."
      };
    }
  },
  {
    pillar: "reliability",
    title: "신뢰성 에이전트",
    evaluate: (context) => {
      const rdsBlocks = findTerraformBlocksByType(context, "aws_db_instance");
      const hasRdsWithoutMultiAz = rdsBlocks.some((block) => readTerraformAttribute(block.body, "multi_az") !== "true");

      if (hasRdsWithoutMultiAz) {
        return {
          observation: "RDS 인스턴스가 있지만 `multi_az = true`가 보이지 않아 단일 AZ 장애에 취약할 수 있습니다.",
          recommendation: "운영 성격의 다이어그램이면 Multi-AZ, backup retention, 삭제 보호 설정을 Preview 코드에 명시하세요."
        };
      }

      if (countTerraformBlocksByType(context, "aws_subnet") < 2 && hasRuntimeResource(context)) {
        return {
          observation: "런타임 리소스가 보이지만 Subnet 구성이 2개 미만이라 가용 영역 분산 근거가 약합니다.",
          recommendation: "고가용성이 필요한 서비스라면 최소 2개 AZ의 Subnet과 라우팅 경로를 함께 검토하세요."
        };
      }

      return {
        observation: "현재 rule 기반 평가에서는 명확한 단일 장애점 경고가 크지 않습니다.",
        recommendation: "배포 전에는 Terraform plan에서 교체/삭제 대상과 복구 설정을 확인해 장애 대응 경로를 보강하세요."
      };
    }
  },
  {
    pillar: "performance_efficiency",
    title: "성능 효율성 에이전트",
    evaluate: (context) => {
      const instanceTypes = findTerraformAttributeValues(context, "aws_instance", "instance_type");
      const dbClasses = findTerraformAttributeValues(context, "aws_db_instance", "instance_class");
      const sizingValues = [...instanceTypes, ...dbClasses];

      if (sizingValues.length > 0) {
        return {
          observation: `성능을 좌우하는 크기 설정이 감지되었습니다: ${sizingValues.join(", ")}.`,
          recommendation: "예상 트래픽, 연결 수, 처리량을 기준으로 초기 크기를 정하고 CloudWatch 지표로 조정할 수 있게 모니터링을 붙이세요."
        };
      }

      return {
        observation: "현재 코드 범위에서는 인스턴스 크기나 처리량 설정을 판단할 정보가 제한적입니다.",
        recommendation: "런타임, 데이터베이스, 캐시, 큐 리소스가 있다면 크기와 스케일링 기준을 Terraform 코드에 명시하세요."
      };
    }
  },
  {
    pillar: "cost_optimization",
    title: "비용 최적화 에이전트",
    evaluate: (context) => {
      const costFinding = context.findings.find((finding) => finding.category === "cost");

      if (costFinding) {
        return {
          observation: "RDS처럼 상시 과금될 수 있는 리소스가 포함되어 비용 검토가 필요합니다.",
          recommendation: "연습/검증 환경이면 작은 instance_class, 짧은 보존 기간, 명확한 cleanup 경로를 먼저 설정하세요."
        };
      }

      if (context.detectedResources.length > 0) {
        return {
          observation: "현재 rule 기반 비용 경고는 크지 않지만 Terraform resource는 생성 즉시 과금될 수 있습니다.",
          recommendation: "배포 전 비용 산정과 태그 기준 정리를 거쳐 유휴 리소스를 추적할 수 있게 하세요."
        };
      }

      return {
        observation: "비용을 만들 resource 블록이 현재 코드 범위에서 확인되지 않았습니다.",
        recommendation: "실제 배포 대상 파일 범위에서 다시 평가해 상시 실행 리소스와 저장소 비용을 확인하세요."
      };
    }
  },
  {
    pillar: "sustainability",
    title: "지속 가능성 에이전트",
    evaluate: (context) => {
      const hasTags = context.normalizedCode.includes("tags") || context.normalizedCode.includes("tag");

      if (!hasTags && context.detectedResources.length > 0) {
        return {
          observation: "리소스는 감지되지만 태그/소유자 표시가 보이지 않아 정리 대상 추적이 어려울 수 있습니다.",
          recommendation: "프로젝트, 환경, 만료 시점 태그를 추가하고 Auto Cleanup 또는 destroy 절차에서 같은 기준으로 회수하세요."
        };
      }

      return {
        observation: "현재 코드 범위는 리소스 정리와 소유 추적을 함께 검토할 수 있는 상태입니다.",
        recommendation: "필요한 리소스만 남기고 Practice Session 종료 시 destroy/cleanup이 가능한지 배포 기록과 함께 확인하세요."
      };
    }
  }
];

function createTerraformPreviewSummary(resources: AiTerraformDetectedResource[]): string {
  if (resources.length === 0) {
    return "IaC Preview 기준으로 이 코드는 resource 블록이 아닌 Terraform 설정 조각입니다. 변수, provider 설정, output처럼 주변 코드와 함께 의미를 확인해야 합니다.";
  }

  if (resources.length === 1) {
    const resource = resources[0];

    if (!resource) {
      return "IaC Preview 기준으로 이 코드는 resource 블록이 아닌 Terraform 설정 조각입니다. 변수, provider 설정, output처럼 주변 코드와 함께 흐름을 확인해야 합니다.";
    }

    return `IaC Preview 기준으로 이 코드는 ${resource.label}(${resource.terraformType})을 설정합니다. ${resource.explanation}`;
  }

  const visibleResources = resources
    .slice(0, 3)
    .map((resource) => `${resource.label}(${resource.terraformType})`)
    .join(", ");
  const hiddenResourceCount = resources.length - 3;

  return `IaC Preview 기준으로 이 코드는 ${visibleResources}${hiddenResourceCount > 0 ? ` 외 ${hiddenResourceCount}개` : ""}를 함께 설정합니다. 각 블록의 참조 관계와 보안/비용 설정을 순서대로 확인해야 합니다.`;
}

function parseTerraformResourceBlocks(terraformCode: string): TerraformResourceBlock[] {
  const blocks: TerraformResourceBlock[] = [];
  const resourceHeaderPattern = /resource\s+"([^"]+)"\s+"([^"]+)"\s*\{/gi;

  for (const match of terraformCode.matchAll(resourceHeaderPattern)) {
    const terraformType = match[1];
    const resourceName = match[2];

    if (!terraformType || !resourceName) {
      continue;
    }

    const bodyStartIndex = (match.index ?? 0) + match[0].length;
    const bodyEndIndex = findTerraformBlockEndIndex(terraformCode, bodyStartIndex);

    blocks.push({
      body: terraformCode.slice(bodyStartIndex, bodyEndIndex),
      resourceName,
      terraformType
    });
  }

  return blocks;
}

function findTerraformBlockEndIndex(terraformCode: string, bodyStartIndex: number): number {
  let depth = 1;
  let inString = false;
  let inSingleLineComment = false;
  let inMultiLineComment = false;

  for (let index = bodyStartIndex; index < terraformCode.length; index += 1) {
    const char = terraformCode[index] ?? "";
    const nextChar = terraformCode[index + 1] ?? "";

    if (inSingleLineComment) {
      if (char === "\n" || char === "\r") {
        inSingleLineComment = false;
      }
      continue;
    }

    if (inMultiLineComment) {
      if (char === "*" && nextChar === "/") {
        inMultiLineComment = false;
        index += 1;
      }
      continue;
    }

    if (inString) {
      if (char === "\\") {
        index += 1;
        continue;
      }

      if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "#") {
      inSingleLineComment = true;
      continue;
    }

    if (char === "/" && nextChar === "/") {
      inSingleLineComment = true;
      index += 1;
      continue;
    }

    if (char === "/" && nextChar === "*") {
      inMultiLineComment = true;
      index += 1;
      continue;
    }

    if (char === "{") {
      depth += 1;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }
  }

  return terraformCode.length;
}

function createTerraformDetectedResource(block: TerraformResourceBlock): AiTerraformDetectedResource {
  const explanation = terraformResourceExplanations[block.terraformType] ?? null;

  return {
    explanation: explanation?.explain(block) ?? createUnknownTerraformResourceExplanation(block),
    label: `${explanation?.label ?? createTerraformResourceLabel(block.terraformType)} · ${block.resourceName}`,
    terraformType: block.terraformType
  };
}

function createUnknownTerraformResourceExplanation(block: TerraformResourceBlock): string {
  return `${block.resourceName} 이름의 ${block.terraformType} Terraform resource를 정의합니다. SketchCatch 기본 설명 목록에 없는 타입이므로 provider 문서 기준으로 인자와 비용 영향을 확인해야 합니다.`;
}

function createTerraformResourceLabel(terraformType: string): string {
  return terraformType
    .replace(/^aws_/, "")
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function readTerraformAttribute(body: string, attributeName: string): string | null {
  const match = new RegExp(`\\b${attributeName}\\s*=\\s*([^\\n#]+)`, "i").exec(body);

  if (!match) {
    return null;
  }

  return (match[1] ?? "").trim().replace(/,$/, "").replace(/^"|"$/g, "");
}

// Terraform resource 블록 이름을 기준으로 현재 코드가 만들 대상을 감지합니다.
function detectTerraformResources(
  terraformCode: string,
  resourceBlocks = parseTerraformResourceBlocks(terraformCode)
): AiTerraformDetectedResource[] {
  if (resourceBlocks.length > 0) {
    return resourceBlocks.map(createTerraformDetectedResource);
  }

  const normalizedCode = terraformCode.toLowerCase();
  const resources: AiTerraformDetectedResource[] = [];

  if (normalizedCode.includes('resource "aws_instance"')) {
    resources.push({
      terraformType: "aws_instance",
      label: "EC2 Instance",
      explanation: "EC2 서버 Resource를 생성합니다."
    });
  }

  if (normalizedCode.includes('resource "aws_db_instance"')) {
    resources.push({
      terraformType: "aws_db_instance",
      label: "RDS Database",
      explanation: "RDS 데이터베이스 Resource를 생성합니다."
    });
  }

  if (normalizedCode.includes('resource "aws_s3_bucket"')) {
    resources.push({
      terraformType: "aws_s3_bucket",
      label: "S3 Bucket",
      explanation: "파일이나 정적 웹 자산을 담는 S3 버킷을 생성합니다."
    });
  }

  if (normalizedCode.includes('resource "aws_security_group_rule"')) {
    resources.push({
      terraformType: "aws_security_group_rule",
      label: "Security Group Rule",
      explanation: "Security Group의 inbound 또는 outbound 규칙을 생성합니다."
    });
  }

  return resources;
}

function createTerraformPreviewWellArchitectedGuidance(
  context: TerraformPreviewEvaluationContext
): AiWellArchitectedGuidance[] {
  return terraformPreviewPillarEvaluators.map((evaluator) => {
    const evaluation = evaluator.evaluate(context);

    return {
      pillar: evaluator.pillar,
      title: evaluator.title,
      observation: evaluation.observation,
      recommendation: evaluation.recommendation
    };
  });
}

function createTerraformPreviewConsensusRecommendation(context: TerraformPreviewEvaluationContext): string {
  const hasHighFinding = context.findings.some((finding) => finding.severity === "high");
  const hasMediumFinding = context.findings.some((finding) => finding.severity === "medium");

  if (hasHighFinding) {
    return "결론: 이 Terraform Preview는 배포 전에 보안 위험을 먼저 줄여야 합니다. 특히 공개 SSH 같은 high finding을 수정하고 다시 검증한 뒤 Plan 단계로 넘어가세요.";
  }

  if (hasMediumFinding) {
    return "결론: 이 다이어그램은 생성 가능한 구조지만 비용이나 운영 설정 보강이 필요합니다. medium finding을 확인하고 환경 규모에 맞게 값을 조정하세요.";
  }

  if (context.detectedResources.length === 0) {
    return "결론: 현재 코드 조각만으로는 다이어그램 리소스 평가가 부족합니다. 실제 resource 블록이 포함된 Terraform 코드로 다시 평가하세요.";
  }

  return "결론: 현재 rule 기반 평가에서는 즉시 차단할 위험은 크지 않습니다. 그래도 배포 전 plan, 비용 산정, 보안 범위 검토를 통과시킨 뒤 승인하세요.";
}

function hasTerraformResourceType(context: TerraformPreviewEvaluationContext, terraformType: string): boolean {
  return context.resourceBlocks.some((block) => block.terraformType === terraformType);
}

function findTerraformBlocksByType(
  context: TerraformPreviewEvaluationContext,
  terraformType: string
): TerraformResourceBlock[] {
  return context.resourceBlocks.filter((block) => block.terraformType === terraformType);
}

function countTerraformBlocksByType(context: TerraformPreviewEvaluationContext, terraformType: string): number {
  return findTerraformBlocksByType(context, terraformType).length;
}

function findTerraformAttributeValues(
  context: TerraformPreviewEvaluationContext,
  terraformType: string,
  attributeName: string
): string[] {
  return findTerraformBlocksByType(context, terraformType)
    .map((block) => readTerraformAttribute(block.body, attributeName))
    .filter((value): value is string => Boolean(value));
}

function hasRuntimeResource(context: TerraformPreviewEvaluationContext): boolean {
  return ["aws_instance", "aws_lambda_function", "aws_ecs_service", "aws_eks_cluster"].some((terraformType) =>
    hasTerraformResourceType(context, terraformType)
  );
}

// Terraform 코드에서 보안/비용 경고를 모아 finding 목록으로 만듭니다.
function createTerraformPreviewFindings(normalizedCode: string): CheckFinding[] {
  return [
    ...createOpenSshFindings(normalizedCode),
    ...createDatabaseCostFindings(normalizedCode)
  ];
}

// Terraform 코드에 "SSH 22번 포트 전체 공개" 조합이 있으면 보안 finding을 만듭니다.
function createOpenSshFindings(normalizedCode: string): CheckFinding[] {
  if (
    !normalizedCode.includes("0.0.0.0/0") ||
    !normalizedCode.includes("from_port = 22") ||
    !normalizedCode.includes("to_port = 22")
  ) {
    return [];
  }

  return [
    {
      id: "terraform-security-open-ssh",
      category: "security",
      severity: "high",
      title: "Terraform 코드에서 SSH가 전체 공개되어 있습니다",
      description: "22번 포트가 0.0.0.0/0으로 열려 있어 누구나 SSH 접속을 시도할 수 있습니다.",
      recommendation: "cidr_blocks 값을 본인 IP나 관리용 CIDR로 제한하세요."
    }
  ];
}

// Terraform 코드에 RDS Resource가 있으면 비용 확인 finding을 만듭니다.
function createDatabaseCostFindings(normalizedCode: string): CheckFinding[] {
  if (!normalizedCode.includes('resource "aws_db_instance"')) {
    return [];
  }

  return [
    {
      id: "terraform-cost-rds",
      category: "cost",
      severity: "medium",
      title: "Terraform 코드가 RDS 비용을 만들 수 있습니다",
      description: "RDS는 실행 시간과 스토리지에 따라 비용이 발생합니다.",
      recommendation: "작은 instance_class와 짧은 Practice Session 기준으로 비용을 확인하세요."
    }
  ];
}
