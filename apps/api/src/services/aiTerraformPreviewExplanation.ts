import type {
  AiTerraformDetectedResource,
  AiTerraformPreviewExplanationResult,
  CheckFinding
} from "@sketchcatch/types";

// Terraform 코드 조각을 읽고 어떤 Resource와 위험 신호가 있는지 설명합니다.
export function explainTerraformPreview(terraformCode: string): AiTerraformPreviewExplanationResult {
  const normalizedCode = terraformCode.toLowerCase();
  const detectedResources = detectTerraformResources(terraformCode);
  const findings = createTerraformPreviewFindings(normalizedCode);

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
    ]
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
function detectTerraformResources(terraformCode: string): AiTerraformDetectedResource[] {
  const resourceBlocks = parseTerraformResourceBlocks(terraformCode);

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
