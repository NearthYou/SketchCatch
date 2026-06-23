import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type {
  AiArchitectureDraftResult,
  AiPreDeploymentAnalysisResult,
  AiTerraformErrorExplanationResult,
  ArchitectureJson,
  CheckFinding,
  ResourceConfig
} from "@sketchcatch/types";

const resourceTypeSchema = z.enum([
  "VPC",
  "SUBNET",
  "EC2",
  "RDS",
  "S3",
  "SECURITY_GROUP",
  "CLOUDFRONT",
  "LAMBDA",
  "UNKNOWN"
]);

const resourceNodeSchema = z.object({
  id: z.string().min(1),
  type: resourceTypeSchema,
  label: z.string().min(1).optional(),
  positionX: z.number(),
  positionY: z.number(),
  config: z.record(z.string(), z.unknown())
});

const resourceEdgeSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  label: z.string().min(1).optional()
});

const architectureJsonSchema: z.ZodType<ArchitectureJson> = z.object({
  nodes: z.array(resourceNodeSchema),
  edges: z.array(resourceEdgeSchema)
});

const architectureDraftBodySchema = z.object({
  prompt: z.string().trim().min(1)
});

const preDeploymentCheckBodySchema = z.object({
  architectureJson: architectureJsonSchema
});

const terraformErrorExplanationBodySchema = z.object({
  stage: z.enum(["validate", "plan", "apply"]),
  rawMessage: z.string().trim().min(1),
  relatedResourceId: z.string().min(1).optional()
});

export async function registerAiRoutes(app: FastifyInstance): Promise<void> {
  app.post("/ai/architecture-draft", async (request): Promise<AiArchitectureDraftResult> => {
    architectureDraftBodySchema.parse(request.body);

    return createStaticWebsiteDraft();
  });

  app.post("/ai/pre-deployment-check", async (request): Promise<AiPreDeploymentAnalysisResult> => {
    const body = preDeploymentCheckBodySchema.parse(request.body);

    return analyzePreDeployment(body.architectureJson);
  });

  app.post(
    "/ai/terraform-error-explanation",
    async (request): Promise<AiTerraformErrorExplanationResult> => {
      const body = terraformErrorExplanationBodySchema.parse(request.body);

      return explainTerraformError(body);
    }
  );
}

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

function analyzePreDeployment(architectureJson: ArchitectureJson): AiPreDeploymentAnalysisResult {
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

function explainTerraformError(
  input: z.infer<typeof terraformErrorExplanationBodySchema>
): AiTerraformErrorExplanationResult {
  if (isPermissionError(input.rawMessage)) {
    return {
      stage: input.stage,
      category: "permission",
      severity: "high",
      rawMessage: input.rawMessage,
      relatedResourceId: input.relatedResourceId,
      summary: "AWS 권한이 부족해서 Terraform 작업이 막혔습니다.",
      likelyCause: "연결된 AWS 사용자나 Role에 필요한 작업 권한이 없습니다.",
      nextActions: [
        "AWS 연결에 사용한 사용자나 Role의 IAM 정책을 확인하세요.",
        "오류 메시지에 나온 AWS action 권한이 허용되어 있는지 확인하세요.",
        "권한을 수정한 뒤 같은 Plan 단계를 다시 실행하세요."
      ]
    };
  }

  return {
    stage: input.stage,
    category: "unknown",
    severity: "medium",
    rawMessage: input.rawMessage,
    relatedResourceId: input.relatedResourceId,
    summary: "Terraform 오류를 기본 fallback 설명으로 분류했습니다.",
    likelyCause: "아직 MVP fallback 규칙에 등록되지 않은 오류입니다.",
    nextActions: ["원본 오류 메시지를 확인하고 권한, region, quota, 문법 문제를 차례대로 점검하세요."]
  };
}

function isPermissionError(rawMessage: string): boolean {
  const normalizedMessage = rawMessage.toLowerCase();

  return (
    normalizedMessage.includes("accessdenied") ||
    normalizedMessage.includes("not authorized") ||
    normalizedMessage.includes("unauthorizedoperation")
  );
}
