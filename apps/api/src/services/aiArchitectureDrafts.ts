import type {
  AiArchitectureDraftResult,
  ArchitectureDraftScenarioHint,
  ArchitectureJson,
  CreateArchitectureDraftRequest
} from "@sketchcatch/types";

// 자연어 요청을 보드가 열 수 있는 ArchitectureJson 초안으로 바꾸는 1차 진입점입니다.
export function createArchitectureDraft(input: string | CreateArchitectureDraftRequest): AiArchitectureDraftResult {
  const request = normalizeArchitectureDraftRequest(input);
  const draft = createDraftByScenarioHint(request);

  return applyGuardrailAssumptions(draft, request);
}

// GitHub 링크 요청도 결국 가벼운 텍스트 근거를 모아 자연어 초안 생성 흐름을 재사용합니다.
export function createArchitectureDraftFromRepositoryEvidence(
  repositoryUrl: string,
  evidence: readonly string[]
): AiArchitectureDraftResult {
  const evidenceText = evidence.join("\n").toLowerCase();
  const draft = createArchitectureDraft(evidenceText || repositoryUrl);

  return {
    ...draft,
    metadata: {
      ...draft.metadata,
      source: "github",
      assumptions: [
        ...draft.metadata.assumptions,
        "Source Repository의 README와 package metadata만 근거로 Architecture Draft를 추론했습니다."
      ]
    }
  };
}

function normalizeArchitectureDraftRequest(input: string | CreateArchitectureDraftRequest): CreateArchitectureDraftRequest {
  if (typeof input !== "string") {
    return input;
  }

  return {
    prompt: input,
    scenarioHint: "auto",
    budgetLevel: "normal",
    trafficLevel: "normal",
    securityPriority: "basic"
  };
}

function createDraftByScenarioHint(request: CreateArchitectureDraftRequest): AiArchitectureDraftResult {
  const scenarioHint = resolveScenarioHint(request);

  switch (scenarioHint) {
    case "static_site":
      return createStaticWebsiteDraft();
    case "api_server":
      return createApiServerDraft();
    case "backend_with_db":
      return createDatabaseBackendDraft();
    case "auto":
      return createStaticWebsiteDraft();
  }
}

function resolveScenarioHint(request: CreateArchitectureDraftRequest): ArchitectureDraftScenarioHint {
  if (request.scenarioHint !== "auto") {
    return request.scenarioHint;
  }

  const normalizedPrompt = request.prompt.toLowerCase();

  if (containsAny(normalizedPrompt, ["db", "database", "데이터베이스", "rds", "백엔드"])) {
    return "backend_with_db";
  }

  if (containsAny(normalizedPrompt, ["api", "서버", "ec2"])) {
    return "api_server";
  }

  return "static_site";
}

function applyGuardrailAssumptions(
  draft: AiArchitectureDraftResult,
  request: CreateArchitectureDraftRequest
): AiArchitectureDraftResult {
  return {
    ...draft,
    metadata: {
      ...draft.metadata,
      assumptions: [...draft.metadata.assumptions, ...createGuardrailAssumptions(request)]
    }
  };
}

function createGuardrailAssumptions(request: CreateArchitectureDraftRequest): string[] {
  const assumptions: string[] = [];

  if (request.budgetLevel === "low") {
    assumptions.push("낮은 예산을 우선해 작은 Practice Resource 기준으로 초안을 만들었습니다.");
  }

  if (request.trafficLevel === "small") {
    assumptions.push("작은 트래픽을 기준으로 단순한 구조부터 시작합니다.");
  }

  if (request.securityPriority === "high") {
    assumptions.push("보안 우선순위가 높으므로 배포 전 Security Finding을 반드시 확인해야 합니다.");
  }

  return assumptions;
}

// 애매한 요청은 정적 웹사이트 기본 구조로 떨어지게 만든 fallback 초안입니다.
function createStaticWebsiteDraft(): AiArchitectureDraftResult {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "s3-static-site",
        type: "S3",
        label: "Static Website Bucket",
        positionX: 160,
        positionY: 220,
        config: {
          bucketPurpose: "static_website_origin"
        }
      },
      {
        id: "cloudfront-cdn",
        type: "CLOUDFRONT",
        label: "CloudFront CDN",
        positionX: 420,
        positionY: 220,
        config: {
          originResourceId: "s3-static-site"
        }
      }
    ],
    edges: [
      {
        id: "cloudfront-to-s3",
        sourceId: "cloudfront-cdn",
        targetId: "s3-static-site",
        label: "origin"
      }
    ]
  };

  return {
    title: "정적 웹사이트 Practice Architecture",
    architectureJson,
    metadata: {
      source: "template_fallback",
      confidence: "medium",
      assumptions: ["정적 파일은 S3에 저장하고 CloudFront가 CDN 역할을 한다고 가정합니다."],
      explanations: ["외부 LLM 없이도 고정 템플릿으로 Architecture Board가 열 수 있는 초안을 반환합니다."]
    }
  };
}

// API 서버 요청이 들어왔을 때 쓰는 고정 초안입니다. EC2 중심 구조를 만듭니다.
function createApiServerDraft(): AiArchitectureDraftResult {
  return {
    title: "API 서버 Practice Architecture",
    architectureJson: {
      nodes: [
        createVpcNode(),
        createSubnetNode("public-subnet", "Public Subnet", 280, 140),
        createSecurityGroupNode("api-security-group", "API Security Group", 280, 300),
        {
          id: "api-server",
          type: "EC2",
          label: "API Server",
          positionX: 500,
          positionY: 220,
          config: {
            instanceType: "t3.micro",
            subnetId: "public-subnet",
            securityGroupIds: ["api-security-group"]
          }
        }
      ],
      edges: [
        createEdge("vpc-to-public-subnet", "main-vpc", "public-subnet", "contains"),
        createEdge("public-subnet-to-api-server", "public-subnet", "api-server", "hosts"),
        createEdge("api-security-group-to-api-server", "api-security-group", "api-server", "allows traffic")
      ]
    },
    metadata: {
      source: "template_fallback",
      confidence: "medium",
      assumptions: ["단일 EC2가 API 요청을 처리하는 연습용 구조로 가정합니다."],
      explanations: ["VPC, Subnet, Security Group, EC2를 포함해 IaC Preview 생성기가 해석하기 쉬운 초안을 반환합니다."]
    }
  };
}

// DB 포함 백엔드 요청이 들어왔을 때 쓰는 고정 초안입니다. EC2와 RDS를 같이 둡니다.
function createDatabaseBackendDraft(): AiArchitectureDraftResult {
  return {
    title: "DB 포함 백엔드 Practice Architecture",
    architectureJson: {
      nodes: [
        createVpcNode(),
        createSubnetNode("app-subnet", "App Subnet", 280, 140),
        createSubnetNode("db-subnet", "DB Subnet", 280, 340),
        createSecurityGroupNode("app-security-group", "App Security Group", 500, 140),
        createSecurityGroupNode("db-security-group", "DB Security Group", 500, 340),
        {
          id: "backend-server",
          type: "EC2",
          label: "Backend Server",
          positionX: 720,
          positionY: 140,
          config: {
            instanceType: "t3.micro",
            subnetId: "app-subnet",
            securityGroupIds: ["app-security-group"]
          }
        },
        {
          id: "backend-database",
          type: "RDS",
          label: "Backend Database",
          positionX: 720,
          positionY: 340,
          config: {
            engine: "postgres",
            instanceClass: "db.t4g.micro",
            subnetId: "db-subnet",
            securityGroupIds: ["db-security-group"]
          }
        }
      ],
      edges: [
        createEdge("vpc-to-app-subnet", "main-vpc", "app-subnet", "contains"),
        createEdge("vpc-to-db-subnet", "main-vpc", "db-subnet", "contains"),
        createEdge("app-subnet-to-backend-server", "app-subnet", "backend-server", "hosts"),
        createEdge("db-subnet-to-backend-database", "db-subnet", "backend-database", "hosts"),
        createEdge("backend-server-to-backend-database", "backend-server", "backend-database", "reads/writes")
      ]
    },
    metadata: {
      source: "template_fallback",
      confidence: "medium",
      assumptions: ["백엔드 서버가 RDS PostgreSQL에 연결하는 연습용 구조로 가정합니다."],
      explanations: ["App Resource와 DB Resource를 분리해 비용과 보안 Check Finding을 붙이기 쉬운 초안을 반환합니다."]
    }
  };
}

function createVpcNode(): ArchitectureJson["nodes"][number] {
  return {
    id: "main-vpc",
    type: "VPC",
    label: "Main VPC",
    positionX: 80,
    positionY: 220,
    config: {
      cidrBlock: "10.0.0.0/16"
    }
  };
}

function createSubnetNode(
  id: string,
  label: string,
  positionX: number,
  positionY: number
): ArchitectureJson["nodes"][number] {
  return {
    id,
    type: "SUBNET",
    label,
    positionX,
    positionY,
    config: {
      cidrBlock: "10.0.1.0/24",
      vpcId: "main-vpc"
    }
  };
}

function createSecurityGroupNode(
  id: string,
  label: string,
  positionX: number,
  positionY: number
): ArchitectureJson["nodes"][number] {
  return {
    id,
    type: "SECURITY_GROUP",
    label,
    positionX,
    positionY,
    config: {
      vpcId: "main-vpc"
    }
  };
}

function createEdge(
  id: string,
  sourceId: string,
  targetId: string,
  label: string
): ArchitectureJson["edges"][number] {
  return {
    id,
    sourceId,
    targetId,
    label
  };
}

function containsAny(value: string, candidates: readonly string[]): boolean {
  return candidates.some((candidate) => value.includes(candidate));
}
