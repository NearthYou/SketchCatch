import type {
  AiBillingMode,
  AiProvider,
  AiProviderService,
  AiProviderMetadata,
  ArchitectureJson,
  ArchitecturePatchAction,
  ArchitecturePatchClarification,
  ArchitecturePatchClarificationCandidate,
  ArchitecturePatchIntent,
  ArchitecturePatchPlan,
  ArchitecturePatchPlanOperation,
  ArchitecturePatchPreview,
  ArchitecturePatchPreviewChange,
  ArchitecturePatchPreviewResponse,
  CreateArchitecturePatchPreviewRequest,
  ResourceNode,
  ResourceType
} from "@sketchcatch/types";
import { resourceDefinitions } from "@sketchcatch/types/resource-definitions";
import { createArchitectureResourceDeploymentConfig } from "./aiArchitectureResourceCatalog.js";
import { createNormalizedAiCacheKey, estimateAiUsage } from "./aiProviderSafety.js";
import {
  createBedrockTextProvider,
  resolveAiProviderRegions,
  type AiCreditPolicy,
  type AiTextProvider
} from "./aiLlmExplanation.js";

export type CreateArchitecturePatchPreviewInput = CreateArchitecturePatchPreviewRequest;
export type CreateArchitecturePatchPreviewFactory = (
  input: CreateArchitecturePatchPreviewInput
) => ArchitecturePatchPreviewResponse | Promise<ArchitecturePatchPreviewResponse>;

export type CreateConfiguredArchitecturePatchPreviewOptions = {
  readonly bedrockProvider?: AiTextProvider | undefined;
  readonly creditPolicy?: Pick<AiCreditPolicy, "bedrock" | "billingMode"> | undefined;
  readonly env?: NodeJS.ProcessEnv | undefined;
};

const MANUAL_RESOURCE_KEYWORDS: readonly {
  readonly resourceType: ResourceType;
  readonly keywords: readonly string[];
  readonly label: string;
}[] = [
  {
    resourceType: "VPC",
    keywords: ["vpc", "virtual private cloud", "network", "네트워크", "네트워크 공간", "브이피씨"],
    label: "VPC"
  },
  {
    resourceType: "SUBNET",
    keywords: ["subnet", "sub net", "서브넷", "작은 네트워크"],
    label: "서브넷"
  },
  {
    resourceType: "NAT_GATEWAY",
    keywords: ["nat gateway", "nat gw", "nat 게이트웨이", "내트 게이트웨이"],
    label: "NAT Gateway"
  },
  {
    resourceType: "INTERNET_GATEWAY",
    keywords: ["internet gateway", "igw", "internet gw", "인터넷 게이트웨이", "인터넷 gateway"],
    label: "인터넷 게이트웨이"
  },
  {
    resourceType: "ROUTE_TABLE",
    keywords: ["route table", "routing table", "라우트 테이블", "라우팅 테이블"],
    label: "라우트 테이블"
  },
  {
    resourceType: "ROUTE_TABLE_ASSOCIATION",
    keywords: ["route table association", "route association", "라우트 테이블 연결", "라우팅 연결"],
    label: "라우트 테이블 연결"
  },
  {
    resourceType: "EC2",
    keywords: ["ec2", "server", "instance", "compute", "서버", "인스턴스", "컴퓨트"],
    label: "EC2 인스턴스"
  },
  {
    resourceType: "RDS",
    keywords: [
      "rds",
      "database",
      "db",
      "postgres",
      "mysql",
      "데이터베이스",
      "디비",
      "데이터 저장소",
      "데이터 저장 공간"
    ],
    label: "RDS 데이터베이스"
  },
  {
    resourceType: "S3",
    keywords: [
      "s3",
      "bucket",
      "storage",
      "file",
      "upload",
      "버킷",
      "스토리지",
      "파일",
      "파일 저장 공간",
      "업로드"
    ],
    label: "S3 버킷"
  },
  {
    resourceType: "SECURITY_GROUP",
    keywords: [
      "security group",
      "securitygroup",
      "firewall",
      "ssh",
      "보안 그룹",
      "보안그룹",
      "보안 설정",
      "방화벽"
    ],
    label: "보안 그룹"
  },
  {
    resourceType: "CLOUDFRONT",
    keywords: ["cloudfront", "cloud front", "cdn", "클라우드프론트"],
    label: "CloudFront CDN"
  },
  {
    resourceType: "LAMBDA",
    keywords: ["lambda", "serverless", "function", "람다", "서버리스", "함수"],
    label: "Lambda 함수"
  },
  {
    resourceType: "AMI",
    keywords: ["ami", "machine image", "image", "이미지", "머신 이미지"],
    label: "AMI"
  },
  {
    resourceType: "API_GATEWAY_REST_API",
    keywords: ["api gateway", "rest api", "apigateway", "api 게이트웨이", "api 입구"],
    label: "API Gateway"
  },
  { resourceType: "IAM_ROLE", keywords: ["iam role", "role", "역할", "롤"], label: "IAM 역할" },
  {
    resourceType: "IAM_POLICY",
    keywords: ["iam policy", "policy", "정책", "폴리시"],
    label: "IAM 정책"
  },
  {
    resourceType: "IAM_INSTANCE_PROFILE",
    keywords: ["iam instance profile", "instance profile", "인스턴스 프로파일"],
    label: "IAM 인스턴스 프로파일"
  },
  {
    resourceType: "KMS_KEY",
    keywords: ["kms", "kms key", "key", "encryption key", "암호화 키", "키"],
    label: "KMS 키"
  },
  {
    resourceType: "CLOUDWATCH_LOG_GROUP",
    keywords: ["cloudwatch log", "cloudwatch logs", "log group", "logs", "로그 그룹", "로그그룹"],
    label: "CloudWatch 로그 그룹"
  },
  {
    resourceType: "CLOUDWATCH_METRIC_ALARM",
    keywords: ["cloudwatch alarm", "metric alarm", "alarm", "알람", "경보"],
    label: "CloudWatch 알람"
  },
  {
    resourceType: "LAMBDA_PERMISSION",
    keywords: ["lambda permission", "lambda invoke permission", "람다 권한", "람다 호출 권한"],
    label: "Lambda 권한"
  }
];

const REMOVE_ACTION_KEYWORDS = [
  "remove",
  "delete",
  "drop",
  "detach",
  "제거",
  "삭제",
  "지워",
  "지우",
  "없애",
  "빼",
  "분리"
];

const MODIFY_ACTION_KEYWORDS = [
  "change",
  "modify",
  "update",
  "set",
  "resize",
  "rename",
  "enable",
  "disable",
  "open",
  "close",
  "allow",
  "block",
  "수정",
  "변경",
  "바꿔",
  "바꾸",
  "늘려",
  "줄여",
  "키워",
  "낮춰",
  "업데이트",
  "교체",
  "설정",
  "켜",
  "꺼",
  "활성화",
  "비활성화",
  "허용",
  "차단",
  "열어",
  "닫아"
];

const REPLACE_ACTION_KEYWORDS = ["replace", "swap", "substitute", "convert", "교체", "대체"];

const ADD_ACTION_KEYWORDS = [
  "add",
  "create",
  "attach",
  "connect",
  "link",
  "include",
  "provision",
  "deploy",
  "expand",
  "추가",
  "생성",
  "만들",
  "붙",
  "달아",
  "연결",
  "꽂",
  "넣",
  "구성",
  "배치",
  "확장"
];

const SERVICE_PURPOSE_PATCH_SUGGESTIONS = [
  "로그인 있는 작은 웹서비스로 확장해줘",
  "파일 업로드가 되는 서비스로 확장해줘",
  "예약이나 신청을 받는 서비스로 확장해줘",
  "정적 소개 웹사이트로 정리해줘"
] as const;

const RESOURCE_TYPE_PATCH_SUGGESTIONS = [
  "데이터 저장 공간",
  "파일 저장 공간",
  "서버",
  "보안 설정",
  "네트워크 공간",
  "API 입구",
  "추가 안 함"
] as const;

const NO_RESOURCE_ADDITION_KEYWORDS = [
  "추가 안 함",
  "추가 안함",
  "추가하지 않",
  "추가하지마",
  "추가하지 마",
  "아무것도 추가하지",
  "더 추가 안",
  "더 넣지",
  "넣지 마",
  "넣지마",
  "필요 없어",
  "필요없어",
  "no additional",
  "do not add",
  "don't add",
  "nothing else",
  "no more"
] as const;

const NO_RESOURCE_ADDITION_ALTERNATIVE_KEYWORDS = ["말고", "대신", "but add", "instead"] as const;

const VPC_SCOPED_RESOURCE_TYPES: ReadonlySet<ResourceType> = new Set([
  "SUBNET",
  "INTERNET_GATEWAY",
  "ROUTE_TABLE",
  "ROUTE_TABLE_ASSOCIATION",
  "SECURITY_GROUP",
  "EC2",
  "RDS",
  "LOAD_BALANCER",
  "LAMBDA"
]);

const WHOLE_SCOPE_PATCH_KEYWORDS = [
  "안의",
  "안에",
  "내부",
  "전체",
  "통째",
  "모두",
  "전부",
  "whole",
  "inside",
  "entire"
] as const;

const ADD_RESOURCE_PURPOSE_SUGGESTIONS: Partial<Record<ResourceType, readonly string[]>> = {
  RDS: [
    "로그인/회원 데이터를 저장할래",
    "주문이나 예약 데이터를 저장할래",
    "기존 서버가 읽고 쓰는 서비스 DB로 쓸래"
  ],
  S3: ["사용자 업로드 파일을 저장할래", "정적 웹사이트 파일을 배포할래", "로그나 백업을 보관할래"],
  EC2: ["웹/API 서버를 실행할래", "백그라운드 작업을 처리할래", "관리용 서버로 쓸래"],
  SECURITY_GROUP: [
    "웹 서버 접근을 제한할래",
    "DB 접근을 앱에서만 허용할래",
    "관리자 접속만 열어둘래"
  ],
  SUBNET: [
    "외부 진입용 public subnet으로 쓸래",
    "앱 서버용 private subnet으로 쓸래",
    "DB용 private subnet으로 쓸래"
  ],
  API_GATEWAY_REST_API: [
    "외부 API 입구로 쓸래",
    "Lambda 앞단 API로 쓸래",
    "앱 서버 앞단 API로 쓸래"
  ],
  CLOUDFRONT: [
    "정적 웹사이트를 빠르게 배포할래",
    "S3 파일을 CDN으로 배포할래",
    "웹서비스 앞단 캐시로 쓸래"
  ]
};

const GENERIC_ADD_RESOURCE_PURPOSE_SUGGESTIONS = [
  "서비스가 이 리소스를 직접 사용하게 할래",
  "운영 보조 리소스로 쓸래",
  "지금은 연결 없이 따로 둘래"
] as const;

function createResourceDefinitionKeywords(
  definition: (typeof resourceDefinitions)[number]
): string[] {
  return uniqueStrings([
    definition.resourceType,
    definition.resourceType.replaceAll("_", " "),
    definition.id.replace(/^aws-/, "").replaceAll("-", " "),
    definition.terraform.resourceType,
    definition.terraform.resourceType.replace(/^aws_/, "").replaceAll("_", " "),
    ...createResourceDefinitionServiceAliases(definition)
  ]).filter((keyword) => keyword.trim().length >= 2);
}

function createResourceDefinitionServiceAliases(
  definition: (typeof resourceDefinitions)[number]
): string[] {
  const haystack = [
    definition.id,
    definition.resourceType,
    definition.terraform.resourceType
  ].join(" ").toLowerCase();
  const aliases: string[] = [];

  for (const serviceAlias of RESOURCE_SERVICE_ALIASES) {
    if (haystack.includes(serviceAlias.token)) {
      aliases.push(serviceAlias.alias);
    }
  }

  if (haystack.includes("ecs")) {
    aliases.push("fargate");
  }

  return aliases;
}

const RESOURCE_SERVICE_ALIASES = [
  { token: "acm", alias: "acm" },
  { token: "apigateway", alias: "api gateway" },
  { token: "api_gateway", alias: "api gateway" },
  { token: "autoscaling", alias: "auto scaling" },
  { token: "cloudfront", alias: "cloudfront" },
  { token: "cloudtrail", alias: "cloudtrail" },
  { token: "cloudwatch", alias: "cloudwatch" },
  { token: "codebuild", alias: "codebuild" },
  { token: "codedeploy", alias: "codedeploy" },
  { token: "codepipeline", alias: "codepipeline" },
  { token: "codestar", alias: "codestar" },
  { token: "cognito", alias: "cognito" },
  { token: "dynamodb", alias: "dynamodb" },
  { token: "ecr", alias: "ecr" },
  { token: "ecs", alias: "ecs" },
  { token: "efs", alias: "efs" },
  { token: "eks", alias: "eks" },
  { token: "elasticache", alias: "elasticache" },
  { token: "eventbridge", alias: "eventbridge" },
  { token: "guardduty", alias: "guardduty" },
  { token: "iam", alias: "iam" },
  { token: "kms", alias: "kms" },
  { token: "lambda", alias: "lambda" },
  { token: "rds", alias: "rds" },
  { token: "route53", alias: "route 53" },
  { token: "s3", alias: "s3" },
  { token: "scheduler", alias: "scheduler" },
  { token: "secretsmanager", alias: "secrets manager" },
  { token: "sfn", alias: "step functions" },
  { token: "shield", alias: "shield" },
  { token: "sns", alias: "sns" },
  { token: "sqs", alias: "sqs" },
  { token: "ssm", alias: "ssm" },
  { token: "vpc", alias: "vpc" },
  { token: "waf", alias: "waf" },
  { token: "xray", alias: "x-ray" }
] as const;

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function formatGeneratedResourceLabel(resourceId: string): string {
  return resourceId
    .replace(/^aws-/, "")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const RESOURCE_DEFINITION_KEYWORDS = resourceDefinitions
  .filter((definition) => definition.resourceType !== "UNKNOWN")
  .map((definition) => ({
    definition,
    keywords: createResourceDefinitionKeywords(definition),
    label: formatGeneratedResourceLabel(definition.id)
  }));

const RESOURCE_KEYWORDS: readonly {
  readonly resourceType: ResourceType;
  readonly keywords: readonly string[];
  readonly label: string;
}[] = [
  ...MANUAL_RESOURCE_KEYWORDS,
  ...RESOURCE_DEFINITION_KEYWORDS.map((item) => ({
    resourceType: item.definition.resourceType,
    keywords: item.keywords,
    label: item.label
  }))
];

const STATIC_SITE_INTENT_PHRASES = [
  "\uC815\uC801",
  "\uC18C\uAC1C",
  "\uC6F9\uC0AC\uC774\uD2B8",
  "\uC0AC\uC774\uD2B8",
  "static",
  "website",
  "landing",
  "intro"
] as const;

const ENGLISH_RESOURCE_LABELS: Partial<Record<ResourceType, string>> = {
  VPC: "VPC",
  SUBNET: "Subnet",
  INTERNET_GATEWAY: "Internet Gateway",
  ROUTE_TABLE: "Route Table",
  ROUTE_TABLE_ASSOCIATION: "Route Table Association",
  NAT_GATEWAY: "NAT Gateway",
  EC2: "EC2 Instance",
  AUTO_SCALING_GROUP: "Auto Scaling Group",
  LAUNCH_TEMPLATE: "Launch Template",
  KEY_PAIR: "Key Pair",
  ELASTIC_IP: "Elastic IP",
  EBS_VOLUME: "EBS Volume",
  RDS: "RDS Database",
  RDS_READ_REPLICA: "RDS Read Replica",
  RDS_CLUSTER: "RDS Cluster",
  S3: "S3 Bucket",
  DYNAMODB_TABLE: "DynamoDB Table",
  ELASTICACHE_REDIS: "ElastiCache Redis",
  SECURITY_GROUP: "Security Group",
  CLOUDFRONT: "CloudFront CDN",
  LOAD_BALANCER_TARGET_GROUP: "Load Balancer Target Group",
  ROUTE53_RECORD: "Route 53 Record",
  WAF_WEB_ACL: "WAF Web ACL",
  LOAD_BALANCER: "Application Load Balancer",
  LOAD_BALANCER_LISTENER: "Load Balancer Listener",
  LAMBDA: "Lambda Function",
  LAMBDA_EVENT_SOURCE_MAPPING: "Lambda Event Source Mapping",
  AMI: "AMI",
  IAM_ROLE: "IAM Role",
  IAM_POLICY: "IAM Policy",
  IAM_INSTANCE_PROFILE: "IAM Instance Profile",
  KMS_KEY: "KMS Key",
  ACM_CERTIFICATE: "ACM Certificate",
  COGNITO_USER_POOL: "Cognito User Pool",
  COGNITO_USER_POOL_CLIENT: "Cognito User Pool Client",
  DB_SUBNET_GROUP: "DB Subnet Group",
  SECRETS_MANAGER_SECRET: "Secrets Manager Secret",
  VPC_ENDPOINT: "VPC Endpoint",
  CLOUDWATCH_LOG_GROUP: "CloudWatch Log Group",
  CLOUDWATCH_METRIC_ALARM: "CloudWatch Alarm",
  CLOUDWATCH_DASHBOARD: "CloudWatch Dashboard",
  API_GATEWAY_REST_API: "API Gateway REST API",
  API_GATEWAY_WEBSOCKET_API: "API Gateway WebSocket API",
  API_GATEWAY_RESOURCE: "API Gateway Resource",
  API_GATEWAY_METHOD: "API Gateway Method",
  API_GATEWAY_INTEGRATION: "API Gateway Integration",
  API_GATEWAY_STAGE: "API Gateway Stage",
  LAMBDA_PERMISSION: "Lambda Permission",
  SNS_TOPIC: "SNS Topic",
  SQS_QUEUE: "SQS Queue",
  EVENTBRIDGE_RULE: "EventBridge Rule",
  EVENTBRIDGE_TARGET: "EventBridge Target",
  STEP_FUNCTIONS_STATE_MACHINE: "Step Functions State Machine",
  ECR_REPOSITORY: "ECR Repository",
  ECS_CLUSTER: "ECS Cluster",
  ECS_SERVICE: "ECS Service",
  ECS_TASK_DEFINITION: "ECS Task Definition",
  EKS_CLUSTER: "EKS Cluster",
  UNKNOWN: "Unknown Resource"
};

type ReplacementPatchIntent = {
  readonly sourceResourceType?: ResourceType | undefined;
  readonly replacementResourceType: ResourceType;
};

const PATCH_PLAN_MODIFY_PRESERVE_PATHS = [
  "position",
  "edges",
  "config.subnetId",
  "config.subnetIds",
  "config.vpcId",
  "config.vpcSecurityGroupIds",
  "config.securityGroupIds",
  "metadata.parentAreaNodeId"
] as const;
const PATCH_PLAN_REMOVE_PRESERVE_PATHS = ["position", "unrelatedResources", "unrelatedEdges"] as const;
const PATCH_PLAN_ADD_PRESERVE_PATHS = [
  "existingResources",
  "existingEdges",
  "existingPositions"
] as const;
const PATCH_PLAN_EMPTY_PRESERVE_PATHS: readonly string[] = [];

const PATCH_PLAN_COMPILER_SYSTEM_PROMPT = `You are SketchCatch PatchPlan Compiler.

SketchCatch is an IaC architecture editor. Users ask to add, remove, or modify cloud resources in natural language.

Your job is to convert the provided PATCH_PLAN_INPUT_JSON into a STRICT JSON PatchPlan.

You must NOT modify the architecture directly.
You must NOT generate a new architecture.
You must NOT generate diagram coordinates.
You must NOT invent resources, ids, subnets, VPCs, edges, Terraform references, parameters, or labels.
You must NOT choose a target when multiple resources match.
You must prefer modifying an existing resource over replacing it when the user asks to change a setting, size, type, storage, runtime, port, name, or boolean option.

Output JSON only. No markdown. No explanation.

The caller will provide:
{
  "userRequest": string,
  "selectedTargetResourceId": string | null,
  "resources": [
    {
      "id": string,
      "type": string,
      "label": string,
      "config": object
    }
  ]
}

If userRequest and resources are present, never ask the caller to provide them.
Compile the provided userRequest against the provided resources.

Allowed status:
- planned
- needs_clarification
- unsupported

Allowed actions:
- modify_resource
- remove_resource
- add_resource

Allowed operations:
- set_value
- increase_one_step
- decrease_one_step
- enable
- disable
- rename

Allowed modification paths by resource type:
EC2:
- config.instanceType
- config.associatePublicIpAddress
- config.ami

RDS:
- config.allocatedStorage
- config.instanceClass
- config.engine
- config.multiAz

RDS_CLUSTER:
- config.instanceClass
- config.engine

S3:
- config.versioning
- config.bucketName
- config.encryption

SECURITY_GROUP:
- config.ingress
- config.egress

LAMBDA:
- config.runtime
- config.memorySize
- config.timeout

LOAD_BALANCER:
- config.internal

AUTO_SCALING_GROUP:
- config.minSize
- config.maxSize
- config.desiredCapacity

Rules:
1. If selectedTargetResourceId is present, use that resource as the target if it exists. Do not ask which resource to modify.
2. If selectedTargetResourceId is present but does not exist, return needs_clarification.
3. If exactly one resource matches the request, select it.
4. If more than one resource matches and no selectedTargetResourceId is present, return needs_clarification with candidateResourceIds.
5. Never guess among multiple matching resources.
6. If the user asks to change a parameter, return modify_resource, not remove_resource or add_resource.
7. Do not use replace/remove+add for parameter changes.

Parameter-change examples:
- bigger EC2
- smaller EC2
- larger server
- upgrade instance
- RDS storage 200
- DB storage 200GB
- enable S3 versioning
- disable S3 versioning
- open port 443
- Lambda memory 512
- timeout 30 seconds
- make load balancer internal
- rename bucket

EC2 instance type rules:
- If the user asks to make an EC2/server/instance larger, bigger, upgraded, scaled up, "스펙 올려", "더 크게", "큰 거로", return:
  op = increase_one_step
  path = config.instanceType
  value = null
- If the user asks to make an EC2/server/instance smaller, cheaper, downgraded, scaled down, "더 작게", return:
  op = decrease_one_step
  path = config.instanceType
  value = null
- If the user gives an explicit EC2 instance type such as t3.medium, t3.large, m7i.large, return:
  op = set_value
  path = config.instanceType
  value = that exact type as a string

Database rules:
- If the user asks for DB/database/RDS storage size and at least one RDS exists, use resourceType RDS.
- Storage values are numeric GB unless another unit is explicitly provided.
- For "스토리지 200으로", "DB storage 200", "RDS 용량 200GB", return:
  op = set_value
  path = config.allocatedStorage
  value = 200

Delete rules:
- If the user asks to delete/remove a resource type and multiple resources of that type exist, return needs_clarification with candidateResourceIds.
- If exactly one resource of that type exists, return planned remove_resource.

Add rules:
- For add_resource, set target.resourceType to the requested resource type.
- Do not invent resourceId.
- resourceId must be null for add_resource.
- If the requested resource type is unclear, return needs_clarification.

Preservation rules:
For every modify_resource response, include these preserve fields unless the user explicitly asks to move, reconnect, or change networking:
- position
- edges
- config.subnetId
- config.subnetIds
- config.vpcId
- config.vpcSecurityGroupIds
- config.securityGroupIds
- metadata.parentAreaNodeId

For remove_resource, preserve should include:
- position
- unrelatedResources
- unrelatedEdges

For add_resource, preserve should include:
- existingResources
- existingEdges
- existingPositions

Return unsupported if:
- the request requires an operation outside the allowed schema
- the request asks for direct deployment/apply/destroy
- the request asks to mutate real cloud infrastructure
- the requested parameter path is not allowed for the resource type

Return exactly this JSON shape:
{
  "status": "planned" | "needs_clarification" | "unsupported",
  "action": "modify_resource" | "remove_resource" | "add_resource" | null,
  "target": {
    "resourceType": string | null,
    "resourceId": string | null,
    "label": string | null
  },
  "candidateResourceIds": string[],
  "operations": [
    {
      "op": "set_value" | "increase_one_step" | "decrease_one_step" | "enable" | "disable" | "rename",
      "path": string,
      "value": string | number | boolean | null
    }
  ],
  "preserve": string[],
  "clarificationQuestion": string | null,
  "confidence": number
}`;

const PATCH_PLAN_ALLOWED_OPERATION_PATHS: Readonly<Partial<Record<ResourceType, readonly string[]>>> = {
  EC2: ["config.instanceType", "config.associatePublicIpAddress", "config.ami"],
  RDS: ["config.allocatedStorage", "config.instanceClass", "config.engine", "config.multiAz"],
  RDS_CLUSTER: ["config.instanceClass", "config.engine"],
  S3: ["config.versioning", "config.bucketName", "config.encryption"],
  SECURITY_GROUP: ["config.ingress", "config.egress"],
  LAMBDA: ["config.runtime", "config.memorySize", "config.timeout"],
  LOAD_BALANCER: ["config.internal"],
  AUTO_SCALING_GROUP: ["config.minSize", "config.maxSize", "config.desiredCapacity"]
};

export function createArchitecturePatchPlan(
  input: CreateArchitecturePatchPreviewInput
): ArchitecturePatchPlan {
  const normalizedInstruction = normalizeSearchText(input.instruction);

  if (
    !isEc2InstanceTypeModificationInstruction(normalizedInstruction) &&
    resolveReplacementPatchIntent(normalizedInstruction) !== undefined
  ) {
    return createUnsupportedPatchPlan(
      "replace_resource is not an allowed PatchPlan action. Ask for an explicit add or remove plan."
    );
  }

  const naturalLanguageAction = isEc2InstanceTypeModificationInstruction(normalizedInstruction)
    ? "modify_resource"
    : resolvePatchActionFromNaturalLanguage(normalizedInstruction);
  const resourceType = findResourceType(normalizedInstruction);

  if (naturalLanguageAction === "manual_review") {
    return createNeedsClarificationPatchPlan(
      resourceType ?? null,
      "Which resource and parameter should be changed?"
    );
  }

  if (naturalLanguageAction === "add_resource") {
    if (resourceType === undefined) {
      return createNeedsClarificationPatchPlan(null, "Which resource type should be added?");
    }

    return {
      status: "planned",
      action: "add_resource",
      target: {
        resourceType,
        resourceId: null,
        label: null
      },
      candidateResourceIds: [],
      operations: [],
      preserve: [...PATCH_PLAN_ADD_PRESERVE_PATHS],
      clarificationQuestion: null,
      confidence: 0.78
    };
  }

  const targetResolution = resolvePatchPlanTarget(input.architectureJson, {
    resourceType,
    selectedTargetResourceId: input.selectedTargetResourceId
  });

  if (targetResolution.status === "needs_clarification") {
    return createNeedsClarificationPatchPlan(
      resourceType ?? null,
      targetResolution.question,
      targetResolution.candidateResourceIds
    );
  }

  if (naturalLanguageAction === "remove_resource") {
    return {
      status: "planned",
      action: "remove_resource",
      target: createPatchPlanTarget(targetResolution.targetNode),
      candidateResourceIds: [],
      operations: [],
      preserve: [...PATCH_PLAN_REMOVE_PRESERVE_PATHS],
      clarificationQuestion: null,
      confidence: 0.9
    };
  }

  const operations = createPatchPlanOperations(
    normalizedInstruction,
    targetResolution.targetNode
  );

  if (operations.length === 0) {
    return createUnsupportedPatchPlan(
      "The request does not map to an allowed PatchPlan operation."
    );
  }

  return {
    status: "planned",
    action: "modify_resource",
    target: createPatchPlanTarget(targetResolution.targetNode),
    candidateResourceIds: [],
    operations,
    preserve: [...PATCH_PLAN_MODIFY_PRESERVE_PATHS],
    clarificationQuestion: null,
    confidence: 0.92
  };
}

export function createConfiguredArchitecturePatchPreview(
  options: CreateConfiguredArchitecturePatchPreviewOptions = {}
): CreateArchitecturePatchPreviewFactory {
  const env = options.env ?? process.env;
  const creditPolicy = options.creditPolicy ?? readPatchPlanCreditPolicy(env);
  const regions = resolveAiProviderRegions(env);
  const bedrockProvider =
    options.bedrockProvider ??
    (creditPolicy.bedrock
      ? createBedrockTextProvider({
          region: regions.bedrockRegion,
          modelId: env.BEDROCK_MODEL_ID ?? "anthropic.claude-3-5-sonnet-20240620-v1:0"
        })
      : undefined);

  return async (input) =>
    createArchitecturePatchPreviewWithPatchPlanCompiler(input, {
      bedrockProvider,
      creditPolicy
    });
}

export async function createArchitecturePatchPreviewWithPatchPlanCompiler(
  input: CreateArchitecturePatchPreviewInput,
  options: {
    readonly bedrockProvider?: AiTextProvider | undefined;
    readonly creditPolicy?: Pick<AiCreditPolicy, "bedrock" | "billingMode"> | undefined;
  } = {}
): Promise<ArchitecturePatchPreviewResponse> {
  const fallbackPlan = createArchitecturePatchPlan(input);
  const fallbackMetadata = createPatchFallbackMetadata(input.instruction);
  const providerResult = await createProviderBackedPatchPlan(input, options);

  return createArchitecturePatchPreviewFromPlan(
    input,
    providerResult?.patchPlan ?? fallbackPlan,
    providerResult?.providerMetadata ?? fallbackMetadata
  );
}

export function createArchitecturePatchPreview(
  input: CreateArchitecturePatchPreviewInput
): ArchitecturePatchPreviewResponse {
  const providerMetadata = createPatchFallbackMetadata(input.instruction);
  const patchPlan = createArchitecturePatchPlan(input);

  return createArchitecturePatchPreviewFromPlan(input, patchPlan, providerMetadata);
}

function createArchitecturePatchPreviewFromPlan(
  input: CreateArchitecturePatchPreviewInput,
  patchPlan: ArchitecturePatchPlan,
  providerMetadata: AiProviderMetadata
): ArchitecturePatchPreviewResponse {
  if (
    patchPlan.status === "needs_clarification" &&
    providerMetadata.routeTarget === "architecture_patch_plan"
  ) {
    return withArchitecturePatchPlan(
      createPatchPlanClarificationResponse(input, patchPlan, providerMetadata),
      patchPlan
    );
  }

  const effectiveInput = createPatchPlanEffectiveInput(input, patchPlan);

  if (isNoResourceAdditionInstruction(input.instruction)) {
    return withArchitecturePatchPlan(createNoResourceAdditionPreview(effectiveInput, providerMetadata), patchPlan);
  }

  const structuralPreview = createStructuralPatchPreview(effectiveInput, providerMetadata);

  if (structuralPreview !== undefined) {
    return withArchitecturePatchPlan(
      applyPatchPlanToPreviewResponse(structuralPreview, patchPlan),
      patchPlan
    );
  }

  const compoundChanges = createCompoundPatchChanges(effectiveInput);

  if (compoundChanges !== undefined) {
    const intent: ArchitecturePatchIntent = {
      instruction: effectiveInput.instruction,
      requestedAction: "manual_review",
      ...(effectiveInput.skipConnection === true ? { skipConnection: true } : {}),
      ...(effectiveInput.connectionTargetResourceId
        ? { connectionTargetResourceId: effectiveInput.connectionTargetResourceId }
        : {})
    };

    return applyPatchPlanToPreviewResponse({
      status: "preview",
      intent,
      baseArchitectureJson: effectiveInput.architectureJson,
      proposedArchitectureJson: applyResolvedPreviewChanges(
        effectiveInput.architectureJson,
        compoundChanges,
        intent
      ),
      changes: compoundChanges,
      requiresUserAcceptance: true,
      userAcceptedChange: null,
      patchPlan,
      providerMetadata
    }, patchPlan);
  }

  const intent = resolvePatchIntentFromPatchPlan(effectiveInput, patchPlan);
  const selectedTargetNode =
    intent.requestedAction === "add_resource"
      ? undefined
      : getSelectedTargetNode(effectiveInput.architectureJson, effectiveInput.selectedTargetResourceId);
  const resolvedIntent = selectedTargetNode
    ? {
        ...intent,
        resourceType: selectedTargetNode.type,
        targetResourceId: selectedTargetNode.id
      }
    : intent;
  const targetResolution = resolveTarget(effectiveInput.architectureJson, resolvedIntent);

  if (targetResolution.status === "needs_clarification") {
    return withArchitecturePatchPlan(
      createClarificationResponse({
        candidates: targetResolution.candidates,
        intent: resolvedIntent,
        suggestions: targetResolution.suggestions,
        providerMetadata
      }),
      patchPlan
    );
  }

  const changes = createResolvedPatchChanges(
    effectiveInput.architectureJson,
    resolvedIntent,
    targetResolution.targetNode
  );
  const proposedArchitectureJson = applyResolvedPreviewChanges(
    effectiveInput.architectureJson,
    changes,
    resolvedIntent
  );

  return applyPatchPlanToPreviewResponse({
    status: "preview",
    intent: resolvedIntent,
    baseArchitectureJson: effectiveInput.architectureJson,
    proposedArchitectureJson,
    changes,
    requiresUserAcceptance: true,
    userAcceptedChange: null,
    patchPlan,
    providerMetadata
  }, patchPlan);
}

function createNoResourceAdditionPreview(
  input: CreateArchitecturePatchPreviewInput,
  providerMetadata: AiProviderMetadata
): ArchitecturePatchPreview {
  return {
    status: "preview",
    intent: {
      instruction: input.instruction,
      requestedAction: "manual_review"
    },
    baseArchitectureJson: input.architectureJson,
    proposedArchitectureJson: input.architectureJson,
    changes: [],
    requiresUserAcceptance: true,
    userAcceptedChange: null,
    providerMetadata
  };
}

function createPatchPlanClarificationResponse(
  input: CreateArchitecturePatchPreviewInput,
  patchPlan: ArchitecturePatchPlan,
  providerMetadata: AiProviderMetadata
): ArchitecturePatchClarification {
  const candidates = patchPlan.candidateResourceIds
    .map((resourceId) => input.architectureJson.nodes.find((node) => node.id === resourceId))
    .filter((node): node is ResourceNode => node !== undefined)
    .map(toClarificationCandidate);

  return {
    status: "needs_clarification",
    intent: {
      instruction: input.instruction,
      requestedAction: patchPlan.action ?? "manual_review",
      ...(patchPlan.target.resourceType ? { resourceType: patchPlan.target.resourceType } : {}),
      ...(input.selectedTargetResourceId ? { targetResourceId: input.selectedTargetResourceId } : {})
    },
    question: patchPlan.clarificationQuestion ?? "Which resource should be changed?",
    candidates,
    providerMetadata
  };
}

function createPatchPlanEffectiveInput(
  input: CreateArchitecturePatchPreviewInput,
  patchPlan: ArchitecturePatchPlan
): CreateArchitecturePatchPreviewInput {
  if (
    patchPlan.status !== "planned" ||
    patchPlan.action === "add_resource" ||
    patchPlan.target.resourceId === null
  ) {
    return input;
  }

  return {
    ...input,
    selectedTargetResourceId: patchPlan.target.resourceId
  };
}

function resolvePatchIntentFromPatchPlan(
  input: CreateArchitecturePatchPreviewInput,
  patchPlan: ArchitecturePatchPlan
): ArchitecturePatchIntent {
  const resolvedIntent = resolvePatchIntent(input);

  if (patchPlan.status !== "planned" || patchPlan.action === null) {
    return resolvedIntent;
  }

  return {
    ...resolvedIntent,
    requestedAction: patchPlan.action,
    ...(patchPlan.target.resourceType ? { resourceType: patchPlan.target.resourceType } : {}),
    ...(patchPlan.target.resourceId ? { targetResourceId: patchPlan.target.resourceId } : {})
  };
}

async function createProviderBackedPatchPlan(
  input: CreateArchitecturePatchPreviewInput,
  options: {
    readonly bedrockProvider?: AiTextProvider | undefined;
    readonly creditPolicy?: Pick<AiCreditPolicy, "bedrock" | "billingMode"> | undefined;
  }
): Promise<
  | {
      readonly patchPlan: ArchitecturePatchPlan;
      readonly providerMetadata: AiProviderMetadata;
    }
  | null
> {
  const creditPolicy = options.creditPolicy ?? readPatchPlanCreditPolicy(process.env);

  if (options.bedrockProvider === undefined || !creditPolicy.bedrock) {
    return null;
  }

  const payload = createPatchPlanCompilerPayload(input);

  try {
    const response = await options.bedrockProvider.generate({
      target: "architecture_patch_preview",
      instructions: PATCH_PLAN_COMPILER_SYSTEM_PROMPT,
      prompt: createPatchPlanCompilerUserMessage(payload),
      payload
    });
    const parsedPlan = parseProviderPatchPlan(response.text);
    const validation = validateProviderPatchPlan(parsedPlan, input);

    if (!validation.valid) {
      return null;
    }

    return {
      patchPlan: validation.patchPlan,
      providerMetadata: createPatchProviderMetadata({
        provider: options.bedrockProvider.provider,
        service: options.bedrockProvider.service,
        model: options.bedrockProvider.model,
        billingMode: creditPolicy.billingMode,
        payload,
        outputCharacters: response.outputCharacters ?? response.text.length
      })
    };
  } catch {
    return null;
  }
}

function createPatchPlanCompilerPayload(input: CreateArchitecturePatchPreviewInput): {
  readonly userRequest: string;
  readonly selectedTargetResourceId: string | null;
  readonly resources: readonly {
    readonly id: string;
    readonly type: ResourceType;
    readonly label: string;
    readonly config: Record<string, unknown>;
  }[];
} {
  return {
    userRequest: input.instruction,
    selectedTargetResourceId: input.selectedTargetResourceId ?? null,
    resources: input.architectureJson.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      label: node.label ?? node.id,
      config: { ...node.config }
    }))
  };
}

function createPatchPlanCompilerUserMessage(payload: ReturnType<typeof createPatchPlanCompilerPayload>): string {
  return `Compile this exact PatchPlan input.

PATCH_PLAN_INPUT_JSON:
${JSON.stringify(payload, null, 2)}`;
}

function parseProviderPatchPlan(text: string): unknown {
  const trimmed = text.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return JSON.parse(trimmed);
  }

  const objectMatch = trimmed.match(/\{[\s\S]*\}/);

  if (objectMatch === null) {
    throw new Error("PatchPlan provider did not return JSON.");
  }

  return JSON.parse(objectMatch[0]);
}

function validateProviderPatchPlan(
  value: unknown,
  input: CreateArchitecturePatchPreviewInput
):
  | { readonly valid: true; readonly patchPlan: ArchitecturePatchPlan }
  | { readonly valid: false } {
  if (!isRecord(value)) {
    return { valid: false };
  }

  const status = value.status;
  const action = value.action;
  const target = value.target;
  const candidateResourceIds = value.candidateResourceIds;
  const operations = value.operations;
  const preserve = value.preserve;
  const clarificationQuestion = value.clarificationQuestion;
  const confidence = value.confidence;

  if (!isPatchPlanStatus(status) || !isPatchPlanActionOrNull(action) || !isRecord(target)) {
    return { valid: false };
  }

  if (!Array.isArray(candidateResourceIds) || !candidateResourceIds.every((id) => typeof id === "string")) {
    return { valid: false };
  }

  if (!Array.isArray(operations) || !Array.isArray(preserve) || !preserve.every((item) => typeof item === "string")) {
    return { valid: false };
  }

  if (clarificationQuestion !== null && typeof clarificationQuestion !== "string") {
    return { valid: false };
  }

  if (typeof confidence !== "number" || !Number.isFinite(confidence)) {
    return { valid: false };
  }

  const resourceIds = new Set(input.architectureJson.nodes.map((node) => node.id));
  const targetResourceId = target.resourceId;
  const targetResourceType = target.resourceType;
  const targetLabel = target.label;

  if (
    (targetResourceId !== null && typeof targetResourceId !== "string") ||
    (targetResourceType !== null && !isResourceType(targetResourceType)) ||
    (targetLabel !== null && typeof targetLabel !== "string")
  ) {
    return { valid: false };
  }

  if (!candidateResourceIds.every((resourceId) => resourceIds.has(resourceId))) {
    return { valid: false };
  }

  if (status !== "planned") {
    if (action !== null || operations.length > 0) {
      return { valid: false };
    }

    return {
      valid: true,
      patchPlan: {
        status,
        action: null,
        target: {
          resourceType: targetResourceType,
          resourceId: null,
          label: null
        },
        candidateResourceIds: [...candidateResourceIds],
        operations: [],
        preserve: [],
        clarificationQuestion,
        confidence
      }
    };
  }

  if (!isPatchPlanAction(action)) {
    return { valid: false };
  }

  if (action === "add_resource") {
    if (targetResourceId !== null || targetResourceType === null) {
      return { valid: false };
    }

    return {
      valid: true,
      patchPlan: {
        status,
        action,
        target: {
          resourceType: targetResourceType,
          resourceId: null,
          label: null
        },
        candidateResourceIds: [],
        operations: [],
        preserve: [...PATCH_PLAN_ADD_PRESERVE_PATHS],
        clarificationQuestion: null,
        confidence
      }
    };
  }

  if (targetResourceId === null || !resourceIds.has(targetResourceId)) {
    return { valid: false };
  }

  const targetNode = input.architectureJson.nodes.find((node) => node.id === targetResourceId);

  if (targetNode === undefined || targetResourceType !== targetNode.type) {
    return { valid: false };
  }

  if (targetLabel !== null && targetLabel !== (targetNode.label ?? targetNode.id)) {
    return { valid: false };
  }

  if (
    input.selectedTargetResourceId === undefined &&
    input.architectureJson.nodes.filter((node) => node.type === targetNode.type).length > 1
  ) {
    return { valid: false };
  }

  const validatedOperations = validatePatchPlanOperations(operations, targetNode.type);

  if (validatedOperations === null) {
    return { valid: false };
  }

  if (action === "remove_resource" && validatedOperations.length > 0) {
    return { valid: false };
  }

  if (action === "modify_resource" && validatedOperations.length === 0) {
    return { valid: false };
  }

  return {
    valid: true,
    patchPlan: {
      status,
      action,
      target: createPatchPlanTarget(targetNode),
      candidateResourceIds: [],
      operations: validatedOperations,
      preserve:
        action === "modify_resource"
          ? [...PATCH_PLAN_MODIFY_PRESERVE_PATHS]
          : [...PATCH_PLAN_REMOVE_PRESERVE_PATHS],
      clarificationQuestion: null,
      confidence
    }
  };
}

function validatePatchPlanOperations(
  operations: readonly unknown[],
  resourceType: ResourceType
): ArchitecturePatchPlanOperation[] | null {
  const allowedPaths = PATCH_PLAN_ALLOWED_OPERATION_PATHS[resourceType] ?? [];
  const validatedOperations: ArchitecturePatchPlanOperation[] = [];

  for (const operation of operations) {
    if (!isRecord(operation)) {
      return null;
    }

    const op = operation.op;
    const path = operation.path;
    const value = operation.value;

    if (!isPatchPlanOperationType(op) || typeof path !== "string" || !allowedPaths.includes(path)) {
      return null;
    }

    if (value !== null && typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      return null;
    }

    validatedOperations.push({ op, path, value });
  }

  return validatedOperations;
}

function applyPatchPlanToPreviewResponse<TResponse extends ArchitecturePatchPreviewResponse>(
  response: TResponse,
  patchPlan: ArchitecturePatchPlan
): TResponse {
  if (response.status !== "preview" || patchPlan.status !== "planned" || patchPlan.action !== "modify_resource") {
    return response;
  }

  const resourceId = patchPlan.target.resourceId;

  if (resourceId === null) {
    return response;
  }

  const baseTargetNode = response.baseArchitectureJson.nodes.find((node) => node.id === resourceId);

  return {
    ...response,
    proposedArchitectureJson: {
      ...response.proposedArchitectureJson,
      nodes: response.proposedArchitectureJson.nodes.map((node) =>
        node.id === resourceId
          ? {
              ...node,
              config: applyPatchPlanOperationsToConfig(baseTargetNode ?? node, patchPlan.operations)
            }
          : node
      )
    }
  };
}

function applyPatchPlanOperationsToConfig(
  node: ResourceNode,
  operations: readonly ArchitecturePatchPlanOperation[]
): Record<string, unknown> {
  const nextConfig: Record<string, unknown> = { ...node.config };

  for (const operation of operations) {
    const key = operation.path.startsWith("config.") ? operation.path.slice("config.".length) : operation.path;

    if (operation.op === "increase_one_step" && operation.path === "config.instanceType") {
      const nextInstanceType = findAdjacentEc2InstanceType(node.config.instanceType, "increase");

      if (nextInstanceType !== undefined) {
        nextConfig.instanceType = nextInstanceType;
      }

      continue;
    }

    if (operation.op === "decrease_one_step" && operation.path === "config.instanceType") {
      const nextInstanceType = findAdjacentEc2InstanceType(node.config.instanceType, "decrease");

      if (nextInstanceType !== undefined) {
        nextConfig.instanceType = nextInstanceType;
      }

      continue;
    }

    if (operation.op === "enable") {
      nextConfig[key] = true;
      continue;
    }

    if (operation.op === "disable") {
      nextConfig[key] = false;
      continue;
    }

    if (operation.path === "config.ingress" && typeof operation.value === "number") {
      nextConfig.ingress = upsertIngressPort(node.config.ingress, operation.value);
      continue;
    }

    if (operation.op === "set_value" || operation.op === "rename") {
      nextConfig[key] = operation.value;
    }
  }

  return nextConfig;
}

function createPatchPlanTarget(
  node: ResourceNode
): ArchitecturePatchPlan["target"] {
  return {
    resourceType: node.type,
    resourceId: node.id,
    label: node.label ?? null
  };
}

function createNeedsClarificationPatchPlan(
  resourceType: ResourceType | null,
  question: string,
  candidateResourceIds: readonly string[] = []
): ArchitecturePatchPlan {
  return {
    status: "needs_clarification",
    action: null,
    target: {
      resourceType,
      resourceId: null,
      label: null
    },
    candidateResourceIds: [...candidateResourceIds],
    operations: [],
    preserve: [...PATCH_PLAN_EMPTY_PRESERVE_PATHS],
    clarificationQuestion: question,
    confidence: 0.6
  };
}

function createUnsupportedPatchPlan(reason: string): ArchitecturePatchPlan {
  return {
    status: "unsupported",
    action: null,
    target: {
      resourceType: null,
      resourceId: null,
      label: null
    },
    candidateResourceIds: [],
    operations: [],
    preserve: [...PATCH_PLAN_EMPTY_PRESERVE_PATHS],
    clarificationQuestion: reason,
    confidence: 0.3
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isResourceType(value: unknown): value is ResourceType {
  return (
    typeof value === "string" &&
    resourceDefinitions.some((definition) => definition.resourceType === value)
  );
}

function isPatchPlanStatus(value: unknown): value is ArchitecturePatchPlan["status"] {
  return value === "planned" || value === "needs_clarification" || value === "unsupported";
}

function isPatchPlanAction(value: unknown): value is NonNullable<ArchitecturePatchPlan["action"]> {
  return value === "modify_resource" || value === "remove_resource" || value === "add_resource";
}

function isPatchPlanActionOrNull(value: unknown): value is ArchitecturePatchPlan["action"] {
  return value === null || isPatchPlanAction(value);
}

function isPatchPlanOperationType(
  value: unknown
): value is ArchitecturePatchPlanOperation["op"] {
  return (
    value === "set_value" ||
    value === "increase_one_step" ||
    value === "decrease_one_step" ||
    value === "enable" ||
    value === "disable" ||
    value === "rename"
  );
}

function resolvePatchPlanTarget(
  architectureJson: ArchitectureJson,
  input: {
    readonly resourceType: ResourceType | undefined;
    readonly selectedTargetResourceId: string | undefined;
  }
):
  | { readonly status: "planned"; readonly targetNode: ResourceNode }
  | {
      readonly status: "needs_clarification";
      readonly question: string;
      readonly candidateResourceIds: readonly string[];
    } {
  if (input.selectedTargetResourceId !== undefined) {
    const selectedNode = architectureJson.nodes.find(
      (node) => node.id === input.selectedTargetResourceId
    );

    if (selectedNode === undefined) {
      return {
        status: "needs_clarification",
        question: "The selected resource no longer exists. Which resource should be changed?",
        candidateResourceIds: []
      };
    }

    if (input.resourceType !== undefined && selectedNode.type !== input.resourceType) {
      return {
        status: "needs_clarification",
        question: "The selected resource does not match the requested resource type.",
        candidateResourceIds: []
      };
    }

    return {
      status: "planned",
      targetNode: selectedNode
    };
  }

  if (input.resourceType === undefined) {
    return {
      status: "needs_clarification",
      question: "Which resource should be changed?",
      candidateResourceIds: []
    };
  }

  const candidates = architectureJson.nodes.filter((node) => node.type === input.resourceType);

  if (candidates.length !== 1) {
    return {
      status: "needs_clarification",
      question:
        candidates.length === 0
          ? "No matching resource exists. Which resource should be changed?"
          : "Multiple matching resources exist. Which one should be changed?",
      candidateResourceIds: candidates.map((candidate) => candidate.id)
    };
  }

  return {
    status: "planned",
    targetNode: candidates[0]!
  };
}

function createPatchPlanOperations(
  normalizedInstruction: string,
  targetNode: ResourceNode
): ArchitecturePatchPlanOperation[] {
  if (targetNode.type === "EC2") {
    const explicitInstanceType = findEc2InstanceType(normalizedInstruction);

    if (explicitInstanceType !== undefined) {
      return [
        {
          op: "set_value",
          path: "config.instanceType",
          value: explicitInstanceType.toLowerCase()
        }
      ];
    }

    if (isEc2InstanceSizeIncreaseInstruction(normalizedInstruction)) {
      return [
        {
          op: "increase_one_step",
          path: "config.instanceType",
          value: null
        }
      ];
    }

    if (isEc2InstanceSizeDecreaseInstruction(normalizedInstruction)) {
      return [
        {
          op: "decrease_one_step",
          path: "config.instanceType",
          value: null
        }
      ];
    }
  }

  if (targetNode.type === "RDS" || targetNode.type === "RDS_CLUSTER") {
    const allocatedStorage = findStorageGb(normalizedInstruction);
    const instanceClass = findRdsInstanceClass(normalizedInstruction);
    const engine = findDatabaseEngine(normalizedInstruction);
    const multiAz = findBooleanPreference(normalizedInstruction, [
      "multi-az",
      "multi az",
      "multiple availability zones",
      "다중 az",
      "멀티 az"
    ]);
    const operations: ArchitecturePatchPlanOperation[] = [];

    if (allocatedStorage !== undefined) {
      operations.push({
        op: "set_value",
        path: "config.allocatedStorage",
        value: allocatedStorage
      });
    }

    if (instanceClass !== undefined) {
      operations.push({
        op: "set_value",
        path: "config.instanceClass",
        value: instanceClass
      });
    }

    if (engine !== undefined) {
      operations.push({
        op: "set_value",
        path: "config.engine",
        value: engine
      });
    }

    if (targetNode.type === "RDS" && multiAz !== undefined) {
      operations.push({
        op: multiAz ? "enable" : "disable",
        path: "config.multiAz",
        value: null
      });
    }

    return operations;
  }

  if (targetNode.type === "LAMBDA") {
    const memorySize = findMemorySize(normalizedInstruction);
    const timeout = findTimeoutSeconds(normalizedInstruction);
    const runtime = findLambdaRuntime(normalizedInstruction);
    const operations: ArchitecturePatchPlanOperation[] = [];

    if (memorySize !== undefined) {
      operations.push({ op: "set_value", path: "config.memorySize", value: memorySize });
    }

    if (timeout !== undefined) {
      operations.push({ op: "set_value", path: "config.timeout", value: timeout });
    }

    if (runtime !== undefined) {
      operations.push({ op: "set_value", path: "config.runtime", value: runtime });
    }

    return operations;
  }

  if (targetNode.type === "S3") {
    const versioning = findBooleanPreference(normalizedInstruction, [
      "versioning",
      "bucket version",
      "버전 관리",
      "버전"
    ]);
    const encryption = findBooleanPreference(normalizedInstruction, [
      "encryption",
      "encrypt",
      "암호화"
    ]);
    const bucketName = findBucketName(normalizedInstruction);

    if (versioning === true) {
      return [{ op: "enable", path: "config.versioning", value: null }];
    }

    if (versioning === false) {
      return [{ op: "disable", path: "config.versioning", value: null }];
    }

    if (encryption === true) {
      return [{ op: "enable", path: "config.encryption", value: null }];
    }

    if (encryption === false) {
      return [{ op: "disable", path: "config.encryption", value: null }];
    }

    if (bucketName !== undefined) {
      return [{ op: "rename", path: "config.bucketName", value: bucketName }];
    }
  }

  if (targetNode.type === "SECURITY_GROUP") {
    const port = findPort(normalizedInstruction);

    if (port !== undefined) {
      return [{ op: "set_value", path: "config.ingress", value: port }];
    }
  }

  if (targetNode.type === "LOAD_BALANCER") {
    const internalPreference = findBooleanPreference(normalizedInstruction, [
      "internal",
      "private",
      "내부",
      "프라이빗"
    ]);
    const publicPreference = findBooleanPreference(normalizedInstruction, [
      "internet-facing",
      "public",
      "external",
      "공개",
      "퍼블릭",
      "외부"
    ]);

    if (internalPreference !== undefined) {
      return [
        {
          op: internalPreference ? "enable" : "disable",
          path: "config.internal",
          value: null
        }
      ];
    }

    if (publicPreference !== undefined) {
      return [
        {
          op: publicPreference ? "disable" : "enable",
          path: "config.internal",
          value: null
        }
      ];
    }
  }

  if (targetNode.type === "AUTO_SCALING_GROUP") {
    const desiredCapacity = findCapacityValue(normalizedInstruction, [
      "desired",
      "desired capacity"
    ]);
    const minSize = findCapacityValue(normalizedInstruction, ["min", "minimum"]);
    const maxSize = findCapacityValue(normalizedInstruction, ["max", "maximum"]);
    const operations: ArchitecturePatchPlanOperation[] = [];

    if (desiredCapacity !== undefined) {
      operations.push({
        op: "set_value",
        path: "config.desiredCapacity",
        value: desiredCapacity
      });
    }

    if (minSize !== undefined) {
      operations.push({
        op: "set_value",
        path: "config.minSize",
        value: minSize
      });
    }

    if (maxSize !== undefined) {
      operations.push({
        op: "set_value",
        path: "config.maxSize",
        value: maxSize
      });
    }

    return operations;
  }

  return [];
}

function createStructuralPatchPreview(
  input: CreateArchitecturePatchPreviewInput,
  providerMetadata: AiProviderMetadata
): ArchitecturePatchPreview | undefined {
  const normalizedInstruction = normalizeSearchText(input.instruction);

  if (!isServerlessMigrationInstruction(normalizedInstruction)) {
    return undefined;
  }

  return createServerlessMigrationPreview(input, providerMetadata);
}

function isServerlessMigrationInstruction(normalizedInstruction: string): boolean {
  return (
    includesAnyPhrase(normalizedInstruction, [
      "serverless",
      "lambda",
      "api gateway",
      "서버리스",
      "람다"
    ]) &&
    includesAnyPhrase(normalizedInstruction, [
      "ec2",
      "instance",
      "server",
      "runtime",
      "environment",
      "architecture",
      "구조",
      "환경"
    ]) &&
    includesAnyPhrase(normalizedInstruction, [
      "convert",
      "change",
      "replace",
      "migrate",
      "전환",
      "변경",
      "수정",
      "교체",
      "바꿔"
    ])
  );
}

function createServerlessMigrationPreview(
  input: CreateArchitecturePatchPreviewInput,
  providerMetadata: AiProviderMetadata
): ArchitecturePatchPreview | undefined {
  const ec2Nodes = input.architectureJson.nodes.filter((node) => node.type === "EC2");

  if (ec2Nodes.length === 0) {
    return undefined;
  }

  const intent: ArchitecturePatchIntent = {
    instruction: input.instruction,
    requestedAction: "modify_resource",
    resourceType: "EC2",
    ...(input.selectedTargetResourceId ? { targetResourceId: input.selectedTargetResourceId } : {}),
    ...(input.connectionTargetResourceId
      ? { connectionTargetResourceId: input.connectionTargetResourceId }
      : {}),
    ...(input.skipConnection === true ? { skipConnection: true } : {})
  };
  const removedResourceIds = findServerlessMigrationRemovedResourceIds(input.architectureJson);
  const dataTargetNodes = findRuntimeDataTargets(input.architectureJson, removedResourceIds);
  const basePosition = getAverageNodePosition(ec2Nodes);
  const filteredNodes = input.architectureJson.nodes
    .filter((node) => !removedResourceIds.has(node.id))
    .map((node) => ({ ...node, config: { ...node.config } }));
  const changes: ArchitecturePatchPreviewChange[] = input.architectureJson.nodes
    .filter((node) => removedResourceIds.has(node.id))
    .map((node) => ({
      action: "remove_resource",
      resourceType: node.type,
      resourceId: node.id,
      summary: `${node.label ?? node.id} resource is removed from the EC2 runtime path.`
    }));
  let nextNodes = [...filteredNodes];
  let apiGatewayNode = findBestNode(nextNodes, ["API_GATEWAY_REST_API"]);

  if (apiGatewayNode === undefined) {
    apiGatewayNode = createBundleNode("API_GATEWAY_REST_API", nextNodes, {
      label: "API Gateway REST API",
      positionX: basePosition.positionX - 180,
      positionY: basePosition.positionY,
      config: {
        ...createNewResourceConfig("API_GATEWAY_REST_API", nextNodes, intent),
        endpointType: "REGIONAL"
      }
    });
    nextNodes.push(apiGatewayNode);
    changes.push({
      action: "add_resource",
      resourceType: "API_GATEWAY_REST_API",
      summary: "API Gateway REST API resource is added as the serverless traffic entry."
    });
  }

  let lambdaNode = findBestNode(nextNodes, ["LAMBDA"]);

  if (lambdaNode === undefined) {
    lambdaNode = createBundleNode("LAMBDA", nextNodes, {
      label: "Lambda Function",
      positionX: basePosition.positionX + 40,
      positionY: basePosition.positionY,
      config: {
        ...createNewResourceConfig("LAMBDA", nextNodes, intent),
        ...createServerlessRuntimeConfig(intent)
      }
    });
    nextNodes.push(lambdaNode);
    changes.push({
      action: "add_resource",
      resourceType: "LAMBDA",
      summary: "Lambda resource is added as the serverless runtime."
    });
  } else {
    nextNodes = nextNodes.map((node) =>
      node.id === lambdaNode?.id
        ? {
            ...node,
            config: {
              ...node.config,
              ...createServerlessRuntimeConfig(intent)
            }
          }
        : node
    );
    lambdaNode = nextNodes.find((node) => node.id === lambdaNode?.id) ?? lambdaNode;
  }

  let nextEdges = input.architectureJson.edges.filter(
    (edge) => !removedResourceIds.has(edge.sourceId) && !removedResourceIds.has(edge.targetId)
  );

  if (input.skipConnection !== true) {
    nextEdges = addSpecificConnectionEdge(nextEdges, apiGatewayNode, lambdaNode, "routes to Lambda");
    nextEdges = dataTargetNodes.reduce(
      (edges, targetNode) =>
        addSpecificConnectionEdge(edges, lambdaNode, targetNode, createConnectionLabel(lambdaNode, targetNode)),
      nextEdges
    );
  }

  return {
    status: "preview",
    intent,
    baseArchitectureJson: input.architectureJson,
    proposedArchitectureJson: {
      nodes: nextNodes,
      edges: nextEdges
    },
    changes,
    requiresUserAcceptance: true,
    userAcceptedChange: null,
    providerMetadata
  };
}

const SERVERLESS_MIGRATION_REMOVED_RESOURCE_TYPES: ReadonlySet<ResourceType> = new Set([
  "EC2",
  "AMI",
  "IAM_INSTANCE_PROFILE",
  "LOAD_BALANCER",
  "LOAD_BALANCER_LISTENER",
  "LOAD_BALANCER_TARGET_GROUP",
  "LOAD_BALANCER_TARGET_GROUP_ATTACHMENT",
  "AUTO_SCALING_GROUP",
  "LAUNCH_TEMPLATE"
]);

const RUNTIME_DATA_RESOURCE_TYPES: ReadonlySet<ResourceType> = new Set([
  "S3",
  "RDS",
  "RDS_CLUSTER",
  "DYNAMODB_TABLE",
  "ELASTICACHE_REDIS",
  "SECRETS_MANAGER_SECRET",
  "CLOUDWATCH_LOG_GROUP",
  "KMS_KEY"
]);

function findServerlessMigrationRemovedResourceIds(
  architectureJson: ArchitectureJson
): ReadonlySet<string> {
  return new Set(
    architectureJson.nodes
      .filter((node) => SERVERLESS_MIGRATION_REMOVED_RESOURCE_TYPES.has(node.type))
      .map((node) => node.id)
  );
}

function findRuntimeDataTargets(
  architectureJson: ArchitectureJson,
  removedResourceIds: ReadonlySet<string>
): ResourceNode[] {
  const dataNodeIds = new Set(
    architectureJson.edges
      .filter(
        (edge) =>
          removedResourceIds.has(edge.sourceId) !== removedResourceIds.has(edge.targetId)
      )
      .flatMap((edge) => [edge.sourceId, edge.targetId])
      .filter((resourceId) => !removedResourceIds.has(resourceId))
  );

  return architectureJson.nodes.filter(
    (node) => dataNodeIds.has(node.id) && RUNTIME_DATA_RESOURCE_TYPES.has(node.type)
  );
}

function getAverageNodePosition(
  nodes: readonly ResourceNode[]
): Pick<ResourceNode, "positionX" | "positionY"> {
  if (nodes.length === 0) {
    return {
      positionX: 240,
      positionY: 180
    };
  }

  return {
    positionX: Math.round(nodes.reduce((total, node) => total + node.positionX, 0) / nodes.length),
    positionY: Math.round(nodes.reduce((total, node) => total + node.positionY, 0) / nodes.length)
  };
}

function createServerlessRuntimeConfig(intent: ArchitecturePatchIntent): Record<string, unknown> {
  return {
    runtime: "nodejs20.x",
    handler: "index.handler",
    memorySize: findMemorySize(normalizeSearchText(intent.instruction)) ?? 256,
    timeout: findTimeoutSeconds(normalizeSearchText(intent.instruction)) ?? 30
  };
}

function createCompoundPatchChanges(
  input: CreateArchitecturePatchPreviewInput
): ArchitecturePatchPreviewChange[] | undefined {
  const normalizedInstruction = normalizeSearchText(input.instruction);

  if (
    !includesAnyPhrase(normalizedInstruction, ADD_ACTION_KEYWORDS) &&
    !includesAnyPhrase(normalizedInstruction, REMOVE_ACTION_KEYWORDS)
  ) {
    return undefined;
  }

  const clauses = splitPatchOperationClauses(input.instruction);
  const changes: ArchitecturePatchPreviewChange[] = [];
  const removedResourceIds = new Set<string>();
  const addedResourceTypes = new Set<ResourceType>();

  for (const clause of clauses) {
    const normalizedClause = normalizeSearchText(clause);

    if (includesAnyPhrase(normalizedClause, REMOVE_ACTION_KEYWORDS)) {
      for (const node of findRemovableNodesForClause(
        input.architectureJson.nodes,
        normalizedClause
      )) {
        if (removedResourceIds.has(node.id)) {
          continue;
        }

        removedResourceIds.add(node.id);
        changes.push({
          action: "remove_resource",
          resourceId: node.id,
          resourceType: node.type,
          summary: `${node.label ?? node.id} 리소스를 삭제합니다.`
        });
      }
    }

    if (includesAnyPhrase(normalizedClause, ADD_ACTION_KEYWORDS)) {
      for (const resourceType of findResourceTypes(normalizedClause)) {
        if (addedResourceTypes.has(resourceType)) {
          continue;
        }

        addedResourceTypes.add(resourceType);
        changes.push({
          action: "add_resource",
          resourceType,
          summary: `${formatPatchResourceType(resourceType)} 리소스를 미리보기에 추가합니다.`
        });
      }
    }
  }

  return changes.length > 1 ? changes : undefined;
}

export function withArchitecturePatchProviderMetadata(
  preview: ArchitecturePatchPreview,
  providerMetadata: AiProviderMetadata
): ArchitecturePatchPreview {
  return {
    ...preview,
    providerMetadata,
    llmExplanation:
      preview.llmExplanation === undefined
        ? undefined
        : {
            ...preview.llmExplanation,
            providerMetadata
          }
  };
}

function withArchitecturePatchPlan<
  TResponse extends ArchitecturePatchPreviewResponse
>(response: TResponse, patchPlan: ArchitecturePatchPlan): TResponse {
  return {
    ...response,
    patchPlan
  };
}

function resolvePatchIntent(input: CreateArchitecturePatchPreviewInput): ArchitecturePatchIntent {
  const instruction = input.instruction;
  const normalizedInstruction = normalizeSearchText(instruction);
  const replacementIntent = resolveReplacementPatchIntent(normalizedInstruction);
  const explicitResourceType = findResourceType(normalizedInstruction);
  const serviceExpansionResourceType =
    explicitResourceType === undefined
      ? inferServiceExpansionResourceType(normalizedInstruction, input.architectureJson.nodes)
      : undefined;
  const resourceType = replacementIntent
    ? replacementIntent.sourceResourceType
    : (explicitResourceType ?? serviceExpansionResourceType);
  const naturalLanguageAction = isEc2InstanceTypeModificationInstruction(normalizedInstruction)
    ? "modify_resource"
    : resolvePatchActionFromNaturalLanguage(normalizedInstruction);
  const requestedAction = replacementIntent
    ? "modify_resource"
    : naturalLanguageAction === "manual_review" && serviceExpansionResourceType !== undefined
      ? "add_resource"
      : naturalLanguageAction;

  return {
    instruction,
    requestedAction,
    ...(input.selectedTargetResourceId ? { targetResourceId: input.selectedTargetResourceId } : {}),
    ...(input.connectionTargetResourceId
      ? { connectionTargetResourceId: input.connectionTargetResourceId }
      : {}),
    ...(input.skipConnection === true ? { skipConnection: true } : {}),
    ...(resourceType ? { resourceType } : {})
  };
}

function resolvePatchActionFromNaturalLanguage(
  normalizedInstruction: string
): ArchitecturePatchAction {
  if (includesAnyPhrase(normalizedInstruction, REMOVE_ACTION_KEYWORDS)) {
    return "remove_resource";
  }

  if (includesAnyPhrase(normalizedInstruction, ADD_ACTION_KEYWORDS)) {
    return "add_resource";
  }

  if (includesAnyPhrase(normalizedInstruction, MODIFY_ACTION_KEYWORDS)) {
    return "modify_resource";
  }

  return "manual_review";
}

function isNoResourceAdditionInstruction(instruction: string): boolean {
  const normalizedInstruction = normalizeSearchText(instruction);

  return (
    includesAnyPhrase(normalizedInstruction, NO_RESOURCE_ADDITION_KEYWORDS) &&
    !includesAnyPhrase(normalizedInstruction, NO_RESOURCE_ADDITION_ALTERNATIVE_KEYWORDS)
  );
}

function resolveReplacementPatchIntent(
  normalizedInstruction: string
): ReplacementPatchIntent | undefined {
  if (isEc2InstanceTypeModificationInstruction(normalizedInstruction)) {
    return undefined;
  }

  const replacementSegments = splitReplacementInstruction(normalizedInstruction);

  if (replacementSegments === undefined) {
    return undefined;
  }

  const replacementResourceType = findResourceType(replacementSegments.replacementText);

  if (replacementResourceType === undefined) {
    return undefined;
  }

  return {
    sourceResourceType: findResourceType(replacementSegments.sourceText),
    replacementResourceType
  };
}

function splitReplacementInstruction(
  normalizedInstruction: string
): { readonly sourceText: string; readonly replacementText: string } | undefined {
  const koreanReplacementMatch = normalizedInstruction.match(
    /^(?<source>.+?)(?:을|를|은|는)\s*(?<replacement>.+?)(?:로|으로)\s*(?:교체|대체|바꿔|바꾸|변경).*/u
  );

  if (koreanReplacementMatch?.groups?.source && koreanReplacementMatch.groups.replacement) {
    return {
      sourceText: koreanReplacementMatch.groups.source,
      replacementText: koreanReplacementMatch.groups.replacement
    };
  }

  const koreanLooseReplacementMatch = normalizedInstruction.match(
    /^(?<source>.+?)\s+(?<replacement>.+?)(?:로|으로)\s*(?:교체|대체|바꿔|바꾸|변경).*/u
  );

  if (
    koreanLooseReplacementMatch?.groups?.source &&
    koreanLooseReplacementMatch.groups.replacement
  ) {
    return {
      sourceText: koreanLooseReplacementMatch.groups.source,
      replacementText: koreanLooseReplacementMatch.groups.replacement
    };
  }

  const englishReplacementMatch = normalizedInstruction.match(
    /^(?:replace|swap|substitute)\s+(?<source>.+?)\s+(?:with|to|for)\s+(?<replacement>.+)$/u
  );

  if (englishReplacementMatch?.groups?.source && englishReplacementMatch.groups.replacement) {
    return {
      sourceText: englishReplacementMatch.groups.source,
      replacementText: englishReplacementMatch.groups.replacement
    };
  }

  const englishConversionMatch = normalizedInstruction.match(
    /^(?:change|convert)\s+(?<source>.+?)\s+(?:to|into)\s+(?<replacement>.+)$/u
  );

  if (
    englishConversionMatch?.groups?.source &&
    englishConversionMatch.groups.replacement &&
    includesAnyPhrase(normalizedInstruction, REPLACE_ACTION_KEYWORDS)
  ) {
    return {
      sourceText: englishConversionMatch.groups.source,
      replacementText: englishConversionMatch.groups.replacement
    };
  }

  return undefined;
}

function findResourceType(normalizedInstruction: string): ResourceType | undefined {
  if (isDatabaseStorageModificationInstruction(normalizedInstruction)) {
    return "RDS";
  }

  return RESOURCE_KEYWORDS.flatMap((item, resourceIndex) =>
    item.keywords
      .filter((keyword) => includesPhrase(normalizedInstruction, keyword))
      .map((keyword) => ({
        resourceIndex,
        resourceType: item.resourceType,
        score: compactSearchText(keyword).length
      }))
  ).sort((left, right) => right.score - left.score || left.resourceIndex - right.resourceIndex)[0]
    ?.resourceType;
}

function isDatabaseStorageModificationInstruction(normalizedInstruction: string): boolean {
  return (
    includesAnyPhrase(normalizedInstruction, ["rds", "database", "db", "데이터베이스", "디비"]) &&
    includesAnyPhrase(normalizedInstruction, ["storage", "스토리지", "저장공간", "저장 공간"])
  );
}

function findResourceTypes(normalizedInstruction: string): ResourceType[] {
  const matches = RESOURCE_KEYWORDS.flatMap((item, resourceIndex) =>
    item.keywords
      .filter((keyword) => includesPhrase(normalizedInstruction, keyword))
      .map((keyword) => {
        const normalizedKeyword = normalizeSearchText(keyword);

        return {
          resourceIndex,
          resourceType: item.resourceType,
          keyword: normalizedKeyword,
          score: compactSearchText(normalizedKeyword).length,
          textIndex: normalizedInstruction.indexOf(normalizedKeyword)
        };
      })
  ).sort((left, right) => right.score - left.score || left.resourceIndex - right.resourceIndex);
  const selectedMatches: typeof matches = [];

  for (const match of matches) {
    if (
      selectedMatches.some((selectedMatch) => selectedMatch.resourceType === match.resourceType)
    ) {
      continue;
    }

    if (
      selectedMatches.some((selectedMatch) =>
        compactSearchText(selectedMatch.keyword).includes(compactSearchText(match.keyword))
      )
    ) {
      continue;
    }

    selectedMatches.push(match);
  }

  return selectedMatches
    .sort(
      (left, right) => left.textIndex - right.textIndex || left.resourceIndex - right.resourceIndex
    )
    .map((match) => match.resourceType);
}

function findResourceDefinitionForInstruction(
  normalizedInstruction: string,
  resourceType: ResourceType
): (typeof resourceDefinitions)[number] | undefined {
  return RESOURCE_DEFINITION_KEYWORDS.flatMap((item, resourceIndex) => {
    if (item.definition.resourceType !== resourceType) {
      return [];
    }

    return item.keywords
      .filter((keyword) => includesPhrase(normalizedInstruction, keyword))
      .map((keyword) => ({
        definition: item.definition,
        resourceIndex,
        score: compactSearchText(keyword).length
      }));
  }).sort((left, right) => right.score - left.score || left.resourceIndex - right.resourceIndex)[0]
    ?.definition;
}

function splitPatchOperationClauses(instruction: string): string[] {
  return normalizeSearchText(instruction)
    .split(/(?:\n|;|\.|그리고|그 다음|다음으로|한 다음|후에|하고|하며|하면서)/u)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function findRemovableNodesForClause(
  nodes: readonly ResourceNode[],
  normalizedClause: string
): ResourceNode[] {
  const mentionedNodes = findMentionedNodes(nodes, normalizedClause);

  if (mentionedNodes.length > 0) {
    return expandWholeScopeRemovals(nodes, mentionedNodes, normalizedClause);
  }

  const resourceTypes = findResourceTypes(normalizedClause);

  const matchingNodes = resourceTypes.flatMap((resourceType) => {
    const filteredNodes = nodes.filter((node) => node.type === resourceType);

    return filteredNodes.length === 1 ? filteredNodes : [];
  });

  return expandWholeScopeRemovals(nodes, matchingNodes, normalizedClause);
}

function expandWholeScopeRemovals(
  nodes: readonly ResourceNode[],
  rootNodes: readonly ResourceNode[],
  normalizedClause: string
): ResourceNode[] {
  if (!includesAnyPhrase(normalizedClause, WHOLE_SCOPE_PATCH_KEYWORDS)) {
    return [...rootNodes];
  }

  const resultById = new Map(rootNodes.map((node) => [node.id, node]));
  let changed = true;

  while (changed) {
    changed = false;

    for (const node of nodes) {
      if (resultById.has(node.id) || !isScopedDependentCandidate(node)) {
        continue;
      }

      if (Array.from(resultById.values()).some((rootNode) => isNodeDependentOn(node, rootNode))) {
        resultById.set(node.id, node);
        changed = true;
      }
    }
  }

  return nodes.filter((node) => resultById.has(node.id));
}

function isScopedDependentCandidate(node: ResourceNode): boolean {
  return VPC_SCOPED_RESOURCE_TYPES.has(node.type);
}

function isNodeDependentOn(node: ResourceNode, rootNode: ResourceNode): boolean {
  if (rootNode.type === "VPC" && VPC_SCOPED_RESOURCE_TYPES.has(node.type)) {
    return (
      doesConfigReferenceNode(node.config, rootNode) ||
      (node.type === "SUBNET" && includesAnyPhrase(normalizeSearchText(node.id), ["subnet"])) ||
      (node.type === "SECURITY_GROUP" &&
        includesAnyPhrase(normalizeSearchText(node.id), ["security", "sg"]))
    );
  }

  return doesConfigReferenceNode(node.config, rootNode);
}

function doesConfigReferenceNode(value: unknown, node: ResourceNode): boolean {
  const normalizedNeedles = nodeReferenceNeedles(node);

  if (typeof value === "string") {
    const normalizedValue = compactSearchText(value.replace(/[._]/g, "-"));

    return normalizedNeedles.some((needle) => normalizedValue.includes(needle));
  }

  if (Array.isArray(value)) {
    return value.some((item) => doesConfigReferenceNode(item, node));
  }

  if (value !== null && typeof value === "object") {
    return Object.values(value).some((item) => doesConfigReferenceNode(item, node));
  }

  return false;
}

function nodeReferenceNeedles(node: ResourceNode): string[] {
  const idNeedle = compactSearchText(node.id);
  const terraformNameNeedle = compactSearchText(node.id.replace(/-/g, "_"));

  return Array.from(new Set([idNeedle, terraformNameNeedle]));
}

function inferServiceExpansionResourceType(
  normalizedInstruction: string,
  existingNodes: readonly ResourceNode[]
): ResourceType | undefined {
  const hasResourceType = (resourceType: ResourceType) =>
    existingNodes.some((node) => node.type === resourceType);
  const hasStaticWebsiteIntent = isStaticSiteIntent(normalizedInstruction);

  if (
    includesAnyPhrase(normalizedInstruction, [
      "로그인",
      "회원",
      "사용자",
      "계정",
      "예약",
      "신청",
      "주문",
      "결제"
    ]) &&
    !hasResourceType("RDS")
  ) {
    return "RDS";
  }

  if (hasStaticWebsiteIntent && hasResourceType("S3") && !hasResourceType("CLOUDFRONT")) {
    return "CLOUDFRONT";
  }

  if (
    includesAnyPhrase(normalizedInstruction, [
      "파일 업로드",
      "업로드",
      "이미지",
      "첨부",
      "정적",
      "웹사이트",
      "사이트"
    ]) &&
    !hasResourceType("S3")
  ) {
    return "S3";
  }

  if (
    includesAnyPhrase(normalizedInstruction, ["api", "웹서비스", "서비스", "앱", "백엔드"]) &&
    !hasResourceType("EC2")
  ) {
    return "EC2";
  }

  return undefined;
}

function includesAnyPhrase(value: string, candidates: readonly string[]): boolean {
  return candidates.some((candidate) => includesPhrase(value, candidate));
}

function includesPhrase(value: string, phrase: string): boolean {
  const normalizedPhrase = normalizeSearchText(phrase);

  return (
    value.includes(normalizedPhrase) ||
    compactSearchText(value).includes(compactSearchText(normalizedPhrase))
  );
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function compactSearchText(value: string): string {
  return normalizeSearchText(value).replace(/\s+/g, "");
}

type TargetResolution =
  | {
      readonly status: "resolved";
      readonly targetNode: ResourceNode | null;
    }
  | {
      readonly status: "needs_clarification";
      readonly candidates: ArchitecturePatchClarificationCandidate[];
      readonly suggestions?: readonly string[] | undefined;
    };

function resolveTarget(
  architectureJson: ArchitectureJson,
  intent: ArchitecturePatchIntent
): TargetResolution {
  if (intent.requestedAction === "manual_review") {
    return {
      status: "needs_clarification",
      candidates: [],
      suggestions: SERVICE_PURPOSE_PATCH_SUGGESTIONS
    };
  }

  if (intent.requestedAction === "add_resource" && intent.resourceType === undefined) {
    return {
      status: "needs_clarification",
      candidates: [],
      suggestions: RESOURCE_TYPE_PATCH_SUGGESTIONS
    };
  }

  if (
    intent.requestedAction === "add_resource" &&
    intent.resourceType === "NAT_GATEWAY" &&
    intent.connectionTargetResourceId === undefined &&
    findPublicSubnet(architectureJson.nodes) === undefined
  ) {
    return {
      status: "needs_clarification",
      candidates: architectureJson.nodes
        .filter((node) => node.type === "SUBNET")
        .map(toClarificationCandidate),
      suggestions: ["NAT Gateway를 배치할 퍼블릭 서브넷을 선택해줘"]
    };
  }

  if (
    intent.requestedAction === "add_resource" &&
    intent.resourceType !== undefined &&
    intent.connectionTargetResourceId !== undefined &&
    !architectureJson.nodes.some((node) => node.id === intent.connectionTargetResourceId)
  ) {
    return {
      status: "needs_clarification",
      candidates: [],
      suggestions: getAddResourcePurposeSuggestions(intent.resourceType)
    };
  }

  if (
    intent.requestedAction === "add_resource" &&
    intent.resourceType !== undefined &&
    intent.connectionTargetResourceId === undefined &&
    intent.skipConnection !== true &&
    architectureJson.nodes.length > 0 &&
    !hasAddResourcePurpose(intent)
  ) {
    return {
      status: "needs_clarification",
      candidates: [],
      suggestions: getAddResourcePurposeSuggestions(intent.resourceType)
    };
  }

  if (intent.requestedAction === "add_resource") {
    return {
      status: "resolved",
      targetNode: null
    };
  }

  if (intent.targetResourceId) {
    const targetNode = architectureJson.nodes.find((node) => node.id === intent.targetResourceId);

    return targetNode
      ? {
          status: "resolved",
          targetNode
        }
      : {
          status: "needs_clarification",
          candidates: architectureJson.nodes.map(toClarificationCandidate)
        };
  }

  if (intent.resourceType === undefined) {
    const mentionedNodes = findMentionedNodes(architectureJson.nodes, intent.instruction);

    if (mentionedNodes.length === 1) {
      return {
        status: "resolved",
        targetNode: mentionedNodes[0] ?? null
      };
    }

    return {
      status: "needs_clarification",
      candidates: (mentionedNodes.length > 0 ? mentionedNodes : architectureJson.nodes).map(
        toClarificationCandidate
      )
    };
  }

  const matchingNodes = architectureJson.nodes.filter((node) => node.type === intent.resourceType);
  const mentionedMatchingNodes = findMentionedNodes(matchingNodes, intent.instruction);

  if (mentionedMatchingNodes.length === 1) {
    return {
      status: "resolved",
      targetNode: mentionedMatchingNodes[0] ?? null
    };
  }

  if (mentionedMatchingNodes.length > 1) {
    return {
      status: "needs_clarification",
      candidates: mentionedMatchingNodes.map(toClarificationCandidate)
    };
  }

  if (matchingNodes.length === 1) {
    return {
      status: "resolved",
      targetNode: matchingNodes[0] ?? null
    };
  }

  return {
    status: "needs_clarification",
    candidates: (matchingNodes.length > 0 ? matchingNodes : architectureJson.nodes).map(
      toClarificationCandidate
    )
  };
}

function findMentionedNodes(nodes: readonly ResourceNode[], instruction: string): ResourceNode[] {
  const normalizedInstruction = normalizeSearchText(instruction);

  return nodes.filter((node) =>
    nodeSearchAliases(node).some((alias) => includesPhrase(normalizedInstruction, alias))
  );
}

function nodeSearchAliases(node: ResourceNode): string[] {
  return [node.id, node.label].filter(
    (alias): alias is string => alias !== undefined && alias.trim().length > 0
  );
}

function getAddResourcePurposeSuggestions(resourceType: ResourceType): readonly string[] {
  return ADD_RESOURCE_PURPOSE_SUGGESTIONS[resourceType] ?? GENERIC_ADD_RESOURCE_PURPOSE_SUGGESTIONS;
}

function hasAddResourcePurpose(intent: ArchitecturePatchIntent): boolean {
  if (intent.connectionTargetResourceId !== undefined || intent.skipConnection === true) {
    return true;
  }

  if (intent.resourceType === "EC2") {
    return true;
  }

  if (
    intent.resourceType === "NAT_GATEWAY" &&
    includesAnyPhrase(normalizeSearchText(intent.instruction), [
      "붙",
      "달아",
      "연결",
      "배치",
      "attach",
      "connect"
    ])
  ) {
    return true;
  }

  const normalizedInstruction = normalizeSearchText(intent.instruction);

  if (
    includesAnyPhrase(normalizedInstruction, [
      "용도",
      "쓸래",
      "사용",
      "운영",
      "서비스",
      "웹서비스",
      "로그인",
      "회원",
      "사용자",
      "계정",
      "예약",
      "신청",
      "주문",
      "결제",
      "업로드",
      "이미지",
      "첨부",
      "정적",
      "웹사이트",
      "사이트",
      "로그",
      "백업",
      "배포",
      "api",
      "백엔드",
      "관리"
    ])
  ) {
    return true;
  }

  return getAddResourcePurposeSuggestions(intent.resourceType ?? "UNKNOWN").some((suggestion) =>
    includesPhrase(normalizedInstruction, suggestion)
  );
}

function createClarificationResponse(input: {
  readonly candidates: readonly ArchitecturePatchClarificationCandidate[];
  readonly intent: ArchitecturePatchIntent;
  readonly suggestions?: readonly string[] | undefined;
  readonly providerMetadata: AiProviderMetadata;
}): ArchitecturePatchClarification {
  const response: ArchitecturePatchClarification = {
    status: "needs_clarification",
    intent: input.intent,
    question: createClarificationQuestion(input.intent, input.candidates),
    candidates: [...input.candidates],
    providerMetadata: input.providerMetadata
  };

  if (input.suggestions !== undefined && input.suggestions.length > 0) {
    return {
      ...response,
      suggestions: [...input.suggestions]
    };
  }

  return response;
}

function createClarificationQuestion(
  intent: ArchitecturePatchIntent,
  candidates: readonly ArchitecturePatchClarificationCandidate[]
): string {
  if (intent.requestedAction === "manual_review") {
    return "어떤 서비스로 만들거나 고치고 싶은지 알려주세요. 용도를 말해주면 필요한 리소스와 연결은 제가 잡겠습니다.";
  }

  if (intent.requestedAction === "add_resource" && intent.resourceType === undefined) {
    return "무엇을 더 추가할까요? 데이터 저장 공간, 파일 저장 공간, 서버처럼 필요한 것을 골라주세요.";
  }

  if (intent.requestedAction === "add_resource" && intent.resourceType !== undefined) {
    if (intent.resourceType === "NAT_GATEWAY" && candidates.length > 0) {
      return "NAT Gateway를 어느 퍼블릭 서브넷에 배치할까요?";
    }
    return `새 ${formatPatchResourceType(intent.resourceType)}을 어떤 용도로 쓸까요? 용도를 알려주면 제가 어울리는 연결까지 잡겠습니다.`;
  }

  if (candidates.length === 0) {
    return "현재 다이어그램에서 일치하는 리소스를 찾지 못했습니다. 대상 리소스를 조금 더 구체적으로 알려주세요.";
  }

  if (resolveReplacementPatchIntent(normalizeSearchText(intent.instruction)) !== undefined) {
    return "어떤 리소스를 교체할까요?";
  }

  const actionLabel =
    intent.requestedAction === "remove_resource"
      ? "삭제"
      : intent.requestedAction === "modify_resource"
        ? "수정"
        : "변경";

  return `어떤 리소스를 ${actionLabel}할까요?`;
}

function toClarificationCandidate(node: ResourceNode): ArchitecturePatchClarificationCandidate {
  return {
    resourceId: node.id,
    resourceType: node.type,
    label: node.label ?? node.id
  };
}

function getSelectedTargetNode(
  architectureJson: ArchitectureJson,
  selectedTargetResourceId: string | undefined
): ResourceNode | undefined {
  if (!selectedTargetResourceId) {
    return undefined;
  }

  return architectureJson.nodes.find((node) => node.id === selectedTargetResourceId);
}

function createResolvedPatchChanges(
  architectureJson: ArchitectureJson,
  intent: ArchitecturePatchIntent,
  targetNode: ResourceNode | null
): ArchitecturePatchPreviewChange[] {
  const replacementIntent = resolveReplacementPatchIntent(normalizeSearchText(intent.instruction));

  if (replacementIntent !== undefined) {
    if (targetNode === null) {
      return [
        {
          action: "manual_review",
          resourceType: replacementIntent.sourceResourceType,
          summary: "교체할 기존 리소스를 자동으로 찾지 못했습니다."
        }
      ];
    }

    return [
      {
        action: "remove_resource",
        resourceType: targetNode.type,
        resourceId: targetNode.id,
        summary: `${targetNode.label ?? targetNode.id} 리소스를 교체 대상으로 삭제합니다.`
      },
      {
        action: "add_resource",
        resourceType: replacementIntent.replacementResourceType,
        summary: `${formatPatchResourceType(replacementIntent.replacementResourceType)} 리소스를 교체 대상으로 미리보기에 추가합니다.`
      }
    ];
  }

  if (intent.requestedAction === "manual_review" || intent.resourceType === undefined) {
    return [
      {
        action: "manual_review",
        summary: "요청을 다이어그램 패치로 만들기 전에 수동 검토가 필요합니다."
      }
    ];
  }

  if (intent.requestedAction === "add_resource") {
    const staticSiteChanges = createStaticSiteReorganizationChanges(architectureJson, intent);

    if (staticSiteChanges.length > 0) {
      return staticSiteChanges;
    }

    return [
      {
        action: "add_resource",
        resourceType: intent.resourceType,
        summary: `${formatPatchResourceType(intent.resourceType)} 리소스를 미리보기에 추가합니다.`
      }
    ];
  }

  if (targetNode === null) {
    return [
      {
        action: "manual_review",
        resourceType: intent.resourceType,
        summary: `${formatPatchResourceType(intent.resourceType)} 리소스를 자동으로 찾지 못했습니다.`
      }
    ];
  }

  return [
    {
      action: intent.requestedAction,
      resourceType: targetNode.type,
      resourceId: targetNode.id,
      summary: `${targetNode.label ?? targetNode.id} 리소스를 ${formatPatchAction(intent.requestedAction)}합니다.`
    }
  ];
}

function createStaticSiteReorganizationChanges(
  architectureJson: ArchitectureJson,
  intent: ArchitecturePatchIntent
): ArchitecturePatchPreviewChange[] {
  if (!isStaticSiteIntent(normalizeSearchText(intent.instruction))) {
    return [];
  }

  const hasS3 = architectureJson.nodes.some((node) => node.type === "S3");
  const hasCloudFront = architectureJson.nodes.some((node) => node.type === "CLOUDFRONT");
  const changes: ArchitecturePatchPreviewChange[] = [];

  if (!hasS3) {
    changes.push({
      action: "add_resource",
      resourceType: "S3",
      summary: `${formatPatchResourceType("S3")} \uB9AC\uC18C\uC2A4\uB97C \uC815\uC801 \uC6F9\uC0AC\uC774\uD2B8 \uD30C\uC77C \uC800\uC7A5\uC18C\uB85C \uCD94\uAC00\uD569\uB2C8\uB2E4.`
    });
  }

  if (!hasCloudFront) {
    changes.push({
      action: "add_resource",
      resourceType: "CLOUDFRONT",
      summary: `${formatPatchResourceType("CLOUDFRONT")} \uB9AC\uC18C\uC2A4\uB97C \uC815\uC801 \uC6F9\uC0AC\uC774\uD2B8 \uACF5\uAC1C \uC9C4\uC785\uC810\uC73C\uB85C \uCD94\uAC00\uD569\uB2C8\uB2E4.`
    });
  }

  return changes;
}

function formatPatchResourceType(resourceType: ResourceType): string {
  const defaultDefinition = RESOURCE_DEFINITION_KEYWORDS.find(
    (item) => item.definition.resourceType === resourceType
  );

  return ENGLISH_RESOURCE_LABELS[resourceType] ?? defaultDefinition?.label ?? resourceType;
}

function formatPatchAction(action: ArchitecturePatchAction): string {
  if (action === "remove_resource") {
    return "삭제";
  }

  if (action === "modify_resource") {
    return "수정";
  }

  if (action === "add_resource") {
    return "추가";
  }

  return "검토";
}

function applyResolvedPreviewChanges(
  architectureJson: ArchitectureJson,
  changes: readonly ArchitecturePatchPreviewChange[],
  intent: ArchitecturePatchIntent
): ArchitectureJson {
  let nextArchitectureJson: ArchitectureJson = {
    nodes: architectureJson.nodes.map((node) => ({
      ...node,
      config: { ...node.config }
    })),
    edges: architectureJson.edges.map((edge) => ({ ...edge }))
  };

  for (const change of changes) {
    if (change.action === "add_resource" && change.resourceType !== undefined) {
      nextArchitectureJson = addResource(nextArchitectureJson, change.resourceType, intent);
    }

    if (change.action === "remove_resource" && change.resourceId !== undefined) {
      nextArchitectureJson = removeResource(nextArchitectureJson, change.resourceId);
    }

    if (change.action === "modify_resource" && change.resourceId !== undefined) {
      nextArchitectureJson = modifyResource(nextArchitectureJson, change.resourceId, intent);
    }
  }

  return nextArchitectureJson;
}

function addResource(
  architectureJson: ArchitectureJson,
  resourceType: ResourceType,
  intent: ArchitecturePatchIntent
): ArchitectureJson {
  if (resourceType === "EC2") {
    return addEc2RuntimeBundle(architectureJson, intent);
  }

  if (resourceType === "NAT_GATEWAY") {
    return addNatGatewayBundle(architectureJson, intent);
  }

  const nextNodes = [...architectureJson.nodes];
  const newNode: ResourceNode = {
    id: createUniqueResourceId(resourceType, nextNodes),
    type: resourceType,
    label: formatPatchResourceType(resourceType),
    ...getNewResourcePosition(nextNodes),
    config: createNewResourceConfig(resourceType, nextNodes, intent)
  };

  nextNodes.push(newNode);

  return {
    nodes: nextNodes,
    edges: addConnectionEdge(architectureJson.edges, architectureJson.nodes, newNode, intent)
  };
}

function addNatGatewayBundle(
  architectureJson: ArchitectureJson,
  intent: ArchitecturePatchIntent
): ArchitectureJson {
  const selectedSubnet = intent.connectionTargetResourceId
    ? architectureJson.nodes.find(
        (node) => node.id === intent.connectionTargetResourceId && node.type === "SUBNET"
      )
    : undefined;
  const publicSubnet = selectedSubnet ?? findPublicSubnet(architectureJson.nodes);

  if (publicSubnet === undefined) {
    return architectureJson;
  }

  const nextNodes = architectureJson.nodes.map((node) => ({
    ...node,
    config: { ...node.config }
  }));
  const eipNode = createBundleNode("ELASTIC_IP", nextNodes, {
    label: "NAT Elastic IP",
    positionX: publicSubnet.positionX + 180,
    positionY: publicSubnet.positionY - 120,
    config: { domain: "vpc" }
  });
  nextNodes.push(eipNode);
  const natNode = createBundleNode("NAT_GATEWAY", nextNodes, {
    label: "NAT Gateway",
    positionX: publicSubnet.positionX + 180,
    positionY: publicSubnet.positionY,
    config: {
      allocationId: createTerraformReference(eipNode, "aws_eip"),
      subnetId: createTerraformReference(publicSubnet, "aws_subnet")
    }
  });
  nextNodes.push(natNode);

  let nextEdges = architectureJson.edges.map((edge) => ({ ...edge }));
  nextEdges = addSpecificConnectionEdge(nextEdges, eipNode, natNode, "allocates");
  nextEdges = addSpecificConnectionEdge(nextEdges, publicSubnet, natNode, "hosts NAT gateway");

  return { nodes: nextNodes, edges: nextEdges };
}

function findPublicSubnet(nodes: readonly ResourceNode[]): ResourceNode | undefined {
  return nodes.find(
    (node) =>
      node.type === "SUBNET" &&
      (node.config.tier === "public" ||
        node.config.mapPublicIpOnLaunch === true ||
        /(^|[-_\s])public($|[-_\s])/iu.test(`${node.id} ${node.label ?? ""}`))
  );
}

function addEc2RuntimeBundle(
  architectureJson: ArchitectureJson,
  intent: ArchitecturePatchIntent
): ArchitectureJson {
  const nextNodes = [...architectureJson.nodes];
  const basePosition = getNewResourcePosition(nextNodes);
  const vpcNode =
    findBestNode(nextNodes, ["VPC"]) ??
    createBundleNode("VPC", nextNodes, {
      label: "VPC",
      positionX: basePosition.positionX,
      positionY: basePosition.positionY,
      config: {
        cidrBlock: "10.0.0.0/16"
      }
    });
  addNodeIfMissing(nextNodes, vpcNode);

  const subnetNode =
    findBestNode(nextNodes, ["SUBNET"]) ??
    createBundleNode("SUBNET", nextNodes, {
      label: "Public Subnet",
      positionX: vpcNode.positionX + 90,
      positionY: vpcNode.positionY + 160,
      config: {
        cidrBlock: "10.0.1.0/24",
        mapPublicIpOnLaunch: true,
        vpcId: createTerraformReference(vpcNode, "aws_vpc")
      }
    });
  addNodeIfMissing(nextNodes, subnetNode);

  const securityGroupNode =
    findBestNode(nextNodes, ["SECURITY_GROUP"]) ??
    createBundleNode("SECURITY_GROUP", nextNodes, {
      label: "App Security Group",
      positionX: subnetNode.positionX,
      positionY: subnetNode.positionY + 140,
      config: {
        egress: [{ protocol: "-1", cidr: "0.0.0.0/0" }],
        ingress: [{ protocol: "tcp", port: 80, cidr: "0.0.0.0/0" }],
        vpcId: createTerraformReference(vpcNode, "aws_vpc")
      }
    });
  addNodeIfMissing(nextNodes, securityGroupNode);

  const amiNode =
    findBestNode(nextNodes, ["AMI"]) ??
    createBundleNode("AMI", nextNodes, {
      label: "Amazon Linux AMI",
      positionX: subnetNode.positionX - 160,
      positionY: subnetNode.positionY + 140,
      config: {
        mostRecent: true,
        nameRegex: "^al2023-ami-2023.*-x86_64$",
        owners: ["amazon"]
      }
    });
  addNodeIfMissing(nextNodes, amiNode);

  const ec2Node = createBundleNode("EC2", nextNodes, {
    label: "EC2 Instance",
    positionX: subnetNode.positionX + 180,
    positionY: subnetNode.positionY + 140,
    config: {
      ami: createTerraformReference(amiNode, "aws_ami", "id", "data"),
      associatePublicIpAddress: true,
      instanceType: "t3.micro",
      subnetId: createTerraformReference(subnetNode, "aws_subnet"),
      vpcSecurityGroupIds: [createTerraformReference(securityGroupNode, "aws_security_group")]
    }
  });
  nextNodes.push(ec2Node);

  let nextEdges = architectureJson.edges;
  nextEdges = addSpecificConnectionEdge(nextEdges, vpcNode, subnetNode, "contains");
  nextEdges = addSpecificConnectionEdge(nextEdges, securityGroupNode, ec2Node, "allows traffic");
  nextEdges = addSpecificConnectionEdge(nextEdges, amiNode, ec2Node, "launch image");
  nextEdges = addSpecificConnectionEdge(nextEdges, subnetNode, ec2Node, "hosts runtime");
  nextEdges = addRuntimeDataEdges(nextEdges, nextNodes, ec2Node, intent);

  return {
    nodes: nextNodes,
    edges: nextEdges
  };
}

function createBundleNode(
  resourceType: ResourceType,
  existingNodes: readonly ResourceNode[],
  node: Pick<ResourceNode, "config" | "label" | "positionX" | "positionY">
): ResourceNode {
  return {
    id: createUniqueResourceId(resourceType, existingNodes),
    type: resourceType,
    ...node
  };
}

function addNodeIfMissing(nodes: ResourceNode[], node: ResourceNode): void {
  if (!nodes.some((existingNode) => existingNode.id === node.id)) {
    nodes.push(node);
  }
}

function addRuntimeDataEdges(
  edges: ArchitectureJson["edges"],
  nodes: readonly ResourceNode[],
  ec2Node: ResourceNode,
  intent: ArchitecturePatchIntent
): ArchitectureJson["edges"] {
  if (intent.skipConnection === true) {
    return edges;
  }

  return nodes
    .filter((node) => node.id !== ec2Node.id && ["S3", "RDS"].includes(node.type))
    .reduce(
      (nextEdges, targetNode) =>
        addSpecificConnectionEdge(
          nextEdges,
          ec2Node,
          targetNode,
          createConnectionLabel(ec2Node, targetNode)
        ),
      edges
    );
}

function createNewResourceConfig(
  resourceType: ResourceType,
  existingNodes: readonly ResourceNode[],
  intent: ArchitecturePatchIntent
): ResourceNode["config"] {
  const matchingDefinition = findResourceDefinitionForInstruction(
    normalizeSearchText(intent.instruction),
    resourceType
  );
  const baseConfig: ResourceNode["config"] = matchingDefinition
    ? {
        ...createArchitectureResourceDeploymentConfig(matchingDefinition.terraform.resourceType),
        terraformResourceType: matchingDefinition.terraform.resourceType,
        ...(matchingDefinition.terraform.blockType !== "resource"
          ? { terraformBlockType: matchingDefinition.terraform.blockType }
          : {})
      }
    : {};

  if (resourceType === "CLOUDFRONT") {
    const originNode = findBestNode(existingNodes, [
      "S3",
      "EC2",
      "LOAD_BALANCER",
      "API_GATEWAY_REST_API"
    ]);

    return originNode ? { ...baseConfig, originResourceId: originNode.id } : baseConfig;
  }

  return baseConfig;
}

function createTerraformReference(
  node: ResourceNode,
  terraformResourceType: string,
  attribute = "id",
  terraformBlockType?: "data"
): string {
  const reference = `${terraformResourceType}.${toTerraformResourceName(node.id)}.${attribute}`;

  return terraformBlockType === "data" ? `data.${reference}` : reference;
}

function toTerraformResourceName(value: string): string {
  const name = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return name.length > 0 ? name : "resource";
}

function addConnectionEdge(
  edges: ArchitectureJson["edges"],
  existingNodes: readonly ResourceNode[],
  newNode: ResourceNode,
  intent: ArchitecturePatchIntent
): ArchitectureJson["edges"] {
  if (intent.skipConnection === true) {
    return edges;
  }

  const inferredConnection = inferConnection(existingNodes, newNode, intent);
  const sourceNode = inferredConnection?.sourceNode;
  const targetNode = inferredConnection?.targetNode;

  if (sourceNode === undefined || targetNode === undefined) {
    return edges;
  }

  const edgeId = createUniqueEdgeId(`${sourceNode.id}-to-${targetNode.id}`, edges);

  return [
    ...edges,
    {
      id: edgeId,
      sourceId: sourceNode.id,
      targetId: targetNode.id,
      label: createConnectionLabel(sourceNode, targetNode)
    }
  ];
}

function inferConnection(
  existingNodes: readonly ResourceNode[],
  newNode: ResourceNode,
  intent: ArchitecturePatchIntent
): { readonly sourceNode: ResourceNode; readonly targetNode: ResourceNode } | undefined {
  if (
    includesAnyPhrase(normalizeSearchText(intent.instruction), ["연결 없이", "연결하지", "따로 둘"])
  ) {
    return undefined;
  }

  if (intent.connectionTargetResourceId !== undefined) {
    const sourceNode = existingNodes.find((node) => node.id === intent.connectionTargetResourceId);

    return sourceNode ? { sourceNode, targetNode: newNode } : undefined;
  }

  if (
    newNode.type === "CLOUDFRONT" &&
    isStaticSiteIntent(normalizeSearchText(intent.instruction))
  ) {
    const targetNode = findBestNode(existingNodes, ["S3"]);

    return targetNode ? { sourceNode: newNode, targetNode } : undefined;
  }

  if (isExternallyEnteredResource(newNode.type)) {
    const targetNode = findBestNode(existingNodes, [
      "LOAD_BALANCER",
      "API_GATEWAY_REST_API",
      "CLOUDFRONT",
      "EC2",
      "LAMBDA"
    ]);

    return targetNode ? { sourceNode: newNode, targetNode } : undefined;
  }

  if (newNode.type === "SUBNET") {
    const sourceNode = findBestNode(existingNodes, ["VPC"]);

    return sourceNode ? { sourceNode, targetNode: newNode } : undefined;
  }

  if (newNode.type === "SECURITY_GROUP") {
    const sourceNode = findBestNode(existingNodes, ["VPC"]);

    if (sourceNode !== undefined) {
      return { sourceNode, targetNode: newNode };
    }
  }

  if (newNode.type === "EC2") {
    const sourceNode = findBestNode(existingNodes, ["SUBNET", "SECURITY_GROUP"]);

    return sourceNode ? { sourceNode, targetNode: newNode } : undefined;
  }

  if (
    newNode.type === "S3" &&
    includesAnyPhrase(normalizeSearchText(intent.instruction), ["정적", "웹사이트", "cdn", "배포"])
  ) {
    const sourceNode = findBestNode(existingNodes, [
      "CLOUDFRONT",
      "API_GATEWAY_REST_API",
      "LOAD_BALANCER",
      "EC2",
      "LAMBDA"
    ]);

    return sourceNode ? { sourceNode, targetNode: newNode } : undefined;
  }

  if (
    ["RDS", "S3", "CLOUDWATCH_LOG_GROUP", "SECRETS_MANAGER_SECRET", "KMS_KEY"].includes(
      newNode.type
    )
  ) {
    const sourceNode = findBestNode(existingNodes, [
      "EC2",
      "LAMBDA",
      "API_GATEWAY_REST_API",
      "LOAD_BALANCER"
    ]);

    return sourceNode ? { sourceNode, targetNode: newNode } : undefined;
  }

  if (newNode.type === "SECURITY_GROUP") {
    const targetNode = findBestNode(existingNodes, ["EC2", "RDS", "LOAD_BALANCER", "LAMBDA"]);

    return targetNode ? { sourceNode: newNode, targetNode } : undefined;
  }

  if (newNode.type === "VPC_ENDPOINT") {
    const sourceNode = findBestNode(existingNodes, ["EC2", "LAMBDA", "RDS"]);

    return sourceNode ? { sourceNode, targetNode: newNode } : undefined;
  }

  const sourceNode = findBestNode(existingNodes, [
    "EC2",
    "LAMBDA",
    "API_GATEWAY_REST_API",
    "LOAD_BALANCER"
  ]);

  return sourceNode ? { sourceNode, targetNode: newNode } : undefined;
}

function addSpecificConnectionEdge(
  edges: ArchitectureJson["edges"],
  sourceNode: ResourceNode,
  targetNode: ResourceNode,
  label: string
): ArchitectureJson["edges"] {
  if (edges.some((edge) => edge.sourceId === sourceNode.id && edge.targetId === targetNode.id)) {
    return edges;
  }

  const edgeId = createUniqueEdgeId(`${sourceNode.id}-to-${targetNode.id}`, edges);

  return [
    ...edges,
    {
      id: edgeId,
      sourceId: sourceNode.id,
      targetId: targetNode.id,
      label
    }
  ];
}

function isStaticSiteIntent(normalizedInstruction: string): boolean {
  return includesAnyPhrase(normalizedInstruction, STATIC_SITE_INTENT_PHRASES);
}

function isExternallyEnteredResource(resourceType: ResourceType): boolean {
  return [
    "ROUTE53_RECORD",
    "WAF_WEB_ACL",
    "CLOUDFRONT",
    "LOAD_BALANCER",
    "API_GATEWAY_REST_API"
  ].includes(resourceType);
}

function findBestNode(
  nodes: readonly ResourceNode[],
  preferredTypes: readonly ResourceType[]
): ResourceNode | undefined {
  for (const resourceType of preferredTypes) {
    const matchingNode = nodes.find((node) => node.type === resourceType);

    if (matchingNode !== undefined) {
      return matchingNode;
    }
  }

  return undefined;
}

function createConnectionLabel(_sourceNode: ResourceNode, targetNode: ResourceNode): string {
  return `uses ${targetNode.label ?? formatPatchResourceType(targetNode.type)}`;
}

function removeResource(architectureJson: ArchitectureJson, resourceId: string): ArchitectureJson {
  return {
    nodes: architectureJson.nodes.filter((node) => node.id !== resourceId),
    edges: architectureJson.edges.filter(
      (edge) => edge.sourceId !== resourceId && edge.targetId !== resourceId
    )
  };
}

function modifyResource(
  architectureJson: ArchitectureJson,
  resourceId: string,
  intent: ArchitecturePatchIntent
): ArchitectureJson {
  return {
    nodes: architectureJson.nodes.map((node) =>
      node.id === resourceId
        ? {
            ...node,
            config: {
              ...node.config,
              ...createModificationConfig(intent, node)
            }
          }
        : node
    ),
    edges: architectureJson.edges
  };
}

function createModificationConfig(
  intent: ArchitecturePatchIntent,
  targetNode: ResourceNode
): Record<string, unknown> {
  const normalizedInstruction = normalizeSearchText(intent.instruction);
  const resourceType = intent.resourceType ?? targetNode.type;
  const updates: Record<string, unknown> = {};

  if (resourceType === "EC2") {
    const instanceType = findEc2InstanceTypeForPatch(
      normalizedInstruction,
      targetNode.config.instanceType
    );

    if (instanceType) {
      updates.instanceType = instanceType;
    }
  }

  if (resourceType === "LAMBDA") {
    const memorySize = findMemorySize(normalizedInstruction);
    const timeout = findTimeoutSeconds(normalizedInstruction);
    const runtime = findLambdaRuntime(normalizedInstruction);

    if (memorySize !== undefined) {
      updates.memorySize = memorySize;
    }

    if (timeout !== undefined) {
      updates.timeout = timeout;
    }

    if (runtime !== undefined) {
      updates.runtime = runtime;
    }
  }

  if (resourceType === "RDS" || resourceType === "RDS_CLUSTER") {
    const instanceClass = findRdsInstanceClass(normalizedInstruction);
    const allocatedStorage = findStorageGb(normalizedInstruction);
    const engine = findDatabaseEngine(normalizedInstruction);

    if (instanceClass !== undefined) {
      updates.instanceClass = instanceClass;
    }

    if (allocatedStorage !== undefined) {
      updates.allocatedStorage = allocatedStorage;
    }

    if (engine !== undefined) {
      updates.engine = engine;
    }
  }

  if (resourceType === "S3") {
    const versioning = findBooleanPreference(normalizedInstruction, [
      "versioning",
      "bucket version",
      "버전 관리",
      "버저닝"
    ]);

    if (versioning !== undefined) {
      updates.versioning = versioning;
    }
  }

  if (resourceType === "SECURITY_GROUP") {
    const port = findPort(normalizedInstruction);

    if (port !== undefined) {
      updates.ingress = upsertIngressPort(targetNode.config.ingress, port);
    }
  }

  if (resourceType === "LOAD_BALANCER") {
    const internalPreference = findBooleanPreference(normalizedInstruction, [
      "internal",
      "private",
      "내부",
      "프라이빗"
    ]);
    const publicPreference = findBooleanPreference(normalizedInstruction, [
      "internet-facing",
      "public",
      "외부",
      "퍼블릭"
    ]);

    if (internalPreference !== undefined) {
      updates.internal = internalPreference;
    } else if (publicPreference !== undefined) {
      updates.internal = !publicPreference;
    }
  }

  if (resourceType === "AUTO_SCALING_GROUP") {
    const desiredCapacity = findCapacityValue(normalizedInstruction, [
      "desired",
      "desired capacity"
    ]);
    const minSize = findCapacityValue(normalizedInstruction, ["min", "minimum"]);
    const maxSize = findCapacityValue(normalizedInstruction, ["max", "maximum"]);

    if (desiredCapacity !== undefined) {
      updates.desiredCapacity = desiredCapacity;
    }

    if (minSize !== undefined) {
      updates.minSize = minSize;
    }

    if (maxSize !== undefined) {
      updates.maxSize = maxSize;
    }
  }

  if (resourceType === "CODEBUILD_PROJECT") {
    const timeoutInMinutes = findTimeoutMinutes(normalizedInstruction);

    if (timeoutInMinutes !== undefined) {
      updates.timeoutInMinutes = timeoutInMinutes;
    }
  }

  if (Object.keys(updates).length > 0) {
    return updates;
  }

  return {
    naturalLanguageChangeRequest: intent.instruction
  };
}

const EC2_INSTANCE_SIZE_ORDER = [
  "nano",
  "micro",
  "small",
  "medium",
  "large",
  "xlarge",
  "2xlarge",
  "3xlarge",
  "4xlarge",
  "6xlarge",
  "8xlarge",
  "9xlarge",
  "10xlarge",
  "12xlarge",
  "16xlarge",
  "18xlarge",
  "24xlarge",
  "32xlarge",
  "48xlarge"
] as const;

function isEc2InstanceTypeModificationInstruction(normalizedInstruction: string): boolean {
  const mentionsEc2Instance =
    findResourceType(normalizedInstruction) === "EC2" ||
    includesAnyPhrase(normalizedInstruction, ["instance", "인스턴스"]);

  return (
    mentionsEc2Instance &&
    (includesAnyPhrase(normalizedInstruction, [
      "instance type",
      "instancetype",
      "인스턴스 타입",
      "larger",
      "bigger",
      "upsize",
      "smaller",
      "downsize",
      "더 큰",
      "큰거",
      "크게",
      "더 작은",
      "작은",
      "작게"
    ]) ||
      /\b(?:[a-z][0-9][a-z]?\.[a-z0-9]+)\b/i.test(normalizedInstruction))
  );
}

function findEc2InstanceTypeForPatch(
  normalizedInstruction: string,
  currentInstanceType: unknown
): string | undefined {
  const explicitInstanceType = findEc2InstanceType(normalizedInstruction);

  if (explicitInstanceType !== undefined) {
    return explicitInstanceType.toLowerCase();
  }

  return findRelativeEc2InstanceType(normalizedInstruction, currentInstanceType);
}

function findRelativeEc2InstanceType(
  normalizedInstruction: string,
  currentInstanceType: unknown
): string | undefined {
  if (isEc2InstanceSizeIncreaseInstruction(normalizedInstruction)) {
    return findAdjacentEc2InstanceType(currentInstanceType, "increase");
  }

  if (isEc2InstanceSizeDecreaseInstruction(normalizedInstruction)) {
    return findAdjacentEc2InstanceType(currentInstanceType, "decrease");
  }

  return undefined;
}

function findAdjacentEc2InstanceType(
  currentInstanceType: unknown,
  direction: "increase" | "decrease"
): string | undefined {
  if (typeof currentInstanceType !== "string") {
    return undefined;
  }

  const currentMatch = currentInstanceType.match(/^([a-z][0-9][a-z]?)\.([a-z0-9]+)$/i);

  if (currentMatch === null) {
    return undefined;
  }

  const family = currentMatch[1]?.toLowerCase();
  const currentSize = currentMatch[2]?.toLowerCase();
  const currentSizeIndex = EC2_INSTANCE_SIZE_ORDER.findIndex((size) => size === currentSize);

  if (family === undefined || currentSizeIndex < 0) {
    return undefined;
  }

  if (direction === "increase") {
    const nextSize = EC2_INSTANCE_SIZE_ORDER[currentSizeIndex + 1];

    return nextSize === undefined ? undefined : `${family}.${nextSize}`;
  }

  if (direction === "decrease") {
    const nextSize = EC2_INSTANCE_SIZE_ORDER[currentSizeIndex - 1];

    return nextSize === undefined ? undefined : `${family}.${nextSize}`;
  }

  return undefined;
}

function isEc2InstanceSizeIncreaseInstruction(normalizedInstruction: string): boolean {
  return includesAnyPhrase(normalizedInstruction, [
    "larger",
    "bigger",
    "upsize",
    "increase",
    "더 큰",
    "큰거",
    "크게"
  ]);
}

function isEc2InstanceSizeDecreaseInstruction(normalizedInstruction: string): boolean {
  return includesAnyPhrase(normalizedInstruction, [
    "smaller",
    "downsize",
    "decrease",
    "더 작은",
    "작은",
    "작게"
  ]);
}

function findEc2InstanceType(normalizedInstruction: string): string | undefined {
  return (
    normalizedInstruction.match(
      /\b(?:instance\s*type|instancetype|type|인스턴스\s*타입|타입)\s*(?:to|=|:|을|를|은|는)?\s*((?:[a-z][0-9][a-z]?\.[a-z0-9]+))/i
    )?.[1] ?? normalizedInstruction.match(/\b(?:[a-z][0-9][a-z]?\.[a-z0-9]+)\b/i)?.[0]
  );
}

function findBucketName(normalizedInstruction: string): string | undefined {
  return (
    normalizedInstruction.match(
      /\b(?:bucket\s*name|bucketname|name)\s*(?:to|=|:)\s*([a-z0-9][a-z0-9.-]{1,61}[a-z0-9])\b/i
    )?.[1] ??
    normalizedInstruction.match(
      /(?:버킷\s*이름|버킷명|이름).*?([a-z0-9][a-z0-9.-]{1,61}[a-z0-9])/iu
    )?.[1]
  );
}

function findMemorySize(normalizedInstruction: string): number | undefined {
  return parsePositiveInteger(
    normalizedInstruction.match(/\bmemory\b.*?\b(\d{2,5})\s*(?:mb|mib)?\b/i)?.[1] ??
      normalizedInstruction.match(/\b(\d{2,5})\s*(?:mb|mib)\b.*?\bmemory\b/i)?.[1] ??
      normalizedInstruction.match(/(?:메모리|memorysize).*?(\d{2,5})/iu)?.[1]
  );
}

function findTimeoutSeconds(normalizedInstruction: string): number | undefined {
  const seconds = parsePositiveInteger(
    normalizedInstruction.match(/\btimeout\b.*?\b(\d{1,4})\s*(?:seconds?|secs?|s)\b/i)?.[1] ??
      normalizedInstruction.match(/\b(\d{1,4})\s*(?:seconds?|secs?|s)\b.*?\btimeout\b/i)?.[1] ??
      normalizedInstruction.match(/(?:타임아웃|timeout).*?(\d{1,4})\s*초/iu)?.[1]
  );

  if (seconds !== undefined) {
    return seconds;
  }

  const minutes = parsePositiveInteger(
    normalizedInstruction.match(/\btimeout\b.*?\b(\d{1,3})\s*(?:minutes?|mins?)\b/i)?.[1] ??
      normalizedInstruction.match(/(?:타임아웃|timeout).*?(\d{1,3})\s*분/iu)?.[1]
  );

  return minutes === undefined ? undefined : minutes * 60;
}

function findTimeoutMinutes(normalizedInstruction: string): number | undefined {
  return parsePositiveInteger(
    normalizedInstruction.match(/\btimeout\b.*?\b(\d{1,3})\s*(?:minutes?|mins?)?\b/i)?.[1] ??
      normalizedInstruction.match(/(?:타임아웃|timeout).*?(\d{1,3})\s*분?/iu)?.[1]
  );
}

function findLambdaRuntime(normalizedInstruction: string): string | undefined {
  if (includesAnyPhrase(normalizedInstruction, ["nodejs20", "node.js 20", "node 20"])) {
    return "nodejs20.x";
  }

  if (includesAnyPhrase(normalizedInstruction, ["nodejs18", "node.js 18", "node 18"])) {
    return "nodejs18.x";
  }

  if (includesAnyPhrase(normalizedInstruction, ["python 3.12", "python3.12"])) {
    return "python3.12";
  }

  if (includesAnyPhrase(normalizedInstruction, ["python 3.11", "python3.11"])) {
    return "python3.11";
  }

  return undefined;
}

function findRdsInstanceClass(normalizedInstruction: string): string | undefined {
  return normalizedInstruction.match(/\bdb\.[a-z0-9]+(?:\.[a-z0-9]+)+\b/i)?.[0];
}

function findStorageGb(normalizedInstruction: string): number | undefined {
  return parsePositiveInteger(
    normalizedInstruction.match(/\bstorage\b.*?\b(\d{1,5})\s*(?:gb|gib)\b/i)?.[1] ??
      normalizedInstruction.match(/\b(\d{1,5})\s*(?:gb|gib)\b.*?\bstorage\b/i)?.[1] ??
      normalizedInstruction.match(/(?:스토리지|저장\s*공간).*?(\d{1,5})\s*(?:gb|gib|기가|로|으로)?/iu)?.[1] ??
      normalizedInstruction.match(/\bstorage\b.*?\b(\d{1,5})\s*(?:gb|gib|to)?\b/i)?.[1]
  );
}

function findDatabaseEngine(normalizedInstruction: string): string | undefined {
  if (includesAnyPhrase(normalizedInstruction, ["postgresql", "postgres"])) {
    return "postgres";
  }

  if (includesAnyPhrase(normalizedInstruction, ["mysql"])) {
    return "mysql";
  }

  if (includesAnyPhrase(normalizedInstruction, ["mariadb", "maria db"])) {
    return "mariadb";
  }

  return undefined;
}

function findBooleanPreference(
  normalizedInstruction: string,
  subjectPhrases: readonly string[]
): boolean | undefined {
  if (!includesAnyPhrase(normalizedInstruction, subjectPhrases)) {
    return undefined;
  }

  if (
    includesAnyPhrase(normalizedInstruction, [
      "disable",
      "off",
      "false",
      "remove",
      "without",
      "끄",
      "비활성",
      "없"
    ])
  ) {
    return false;
  }

  if (
    includesAnyPhrase(normalizedInstruction, [
      "enable",
      "on",
      "true",
      "use",
      "allow",
      "open",
      "켜",
      "활성",
      "사용",
      "허용"
    ])
  ) {
    return true;
  }

  return undefined;
}

function findPort(normalizedInstruction: string): number | undefined {
  const port = parsePositiveInteger(
    normalizedInstruction.match(/\bport\b.*?\b(\d{1,5})\b/i)?.[1] ??
      normalizedInstruction.match(/\b(\d{1,5})\s*(?:port|포트)\b/iu)?.[1] ??
      normalizedInstruction.match(/(?:포트|port).*?(\d{1,5})/iu)?.[1]
  );

  return port !== undefined && port > 0 && port <= 65535 ? port : undefined;
}

function upsertIngressPort(currentIngress: unknown, port: number): unknown[] {
  const currentRules = Array.isArray(currentIngress) ? currentIngress : [];

  if (
    currentRules.some(
      (rule) =>
        typeof rule === "object" &&
        rule !== null &&
        "port" in rule &&
        Number((rule as { readonly port?: unknown }).port) === port
    )
  ) {
    return currentRules;
  }

  return [
    ...currentRules,
    {
      protocol: "tcp",
      port,
      cidr: "0.0.0.0/0"
    }
  ];
}

function findCapacityValue(
  normalizedInstruction: string,
  labels: readonly string[]
): number | undefined {
  for (const label of labels) {
    const value = parsePositiveInteger(
      normalizedInstruction.match(
        new RegExp(`\\b${escapeRegExp(label)}\\b.*?\\b(\\d{1,3})\\b`, "i")
      )?.[1]
    );

    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getNewResourcePosition(
  nodes: readonly ResourceNode[]
): Pick<ResourceNode, "positionX" | "positionY"> {
  if (nodes.length === 0) {
    return {
      positionX: 160,
      positionY: 160
    };
  }

  const maxX = Math.max(...nodes.map((node) => node.positionX));
  const minY = Math.min(...nodes.map((node) => node.positionY));

  return {
    positionX: maxX + 160,
    positionY: minY + 40
  };
}

function createUniqueResourceId(
  resourceType: ResourceType,
  nodes: readonly ResourceNode[]
): string {
  const baseId = resourceType.toLowerCase().replace(/_/g, "-");
  const existingIds = new Set(nodes.map((node) => node.id));
  let sequence = nodes.length + 1;
  let nextId = createPreviewResourceId(baseId, sequence);

  while (existingIds.has(nextId)) {
    sequence += 1;
    nextId = createPreviewResourceId(baseId, sequence);
  }

  return nextId;
}

function createPreviewResourceId(baseId: string, sequence: number): string {
  return `${baseId}-${sequence}`;
}

function createUniqueEdgeId(
  baseId: string,
  edges: readonly ArchitectureJson["edges"][number][]
): string {
  const existingIds = new Set(edges.map((edge) => edge.id));

  if (!existingIds.has(baseId)) {
    return baseId;
  }

  let sequence = 2;
  let nextId = `${baseId}-${sequence}`;

  while (existingIds.has(nextId)) {
    sequence += 1;
    nextId = `${baseId}-${sequence}`;
  }

  return nextId;
}

function _createPatchChanges(
  architectureJson: ArchitectureJson,
  intent: ArchitecturePatchIntent
): ArchitecturePatchPreviewChange[] {
  if (intent.requestedAction === "manual_review" || intent.resourceType === undefined) {
    return [
      {
        action: "manual_review",
        summary: "요청을 자동 patch로 확정하지 않고 사용자가 직접 검토해야 합니다."
      }
    ];
  }

  if (intent.requestedAction === "add_resource") {
    return [
      {
        action: "add_resource",
        resourceType: intent.resourceType,
        summary: `${intent.resourceType} resource를 preview에 추가합니다.`
      }
    ];
  }

  const targetNode = architectureJson.nodes.find((node) => node.type === intent.resourceType);

  if (targetNode === undefined) {
    return [
      {
        action: "manual_review",
        resourceType: intent.resourceType,
        summary: `${intent.resourceType} resource를 찾지 못해 자동 변경 대신 수동 검토가 필요합니다.`
      }
    ];
  }

  return [
    {
      action: intent.requestedAction,
      resourceType: intent.resourceType,
      resourceId: targetNode.id,
      summary: `${targetNode.id} resource에 대한 ${intent.requestedAction} preview를 만듭니다.`
    }
  ];
}

function _applyPreviewChanges(
  architectureJson: ArchitectureJson,
  changes: readonly ArchitecturePatchPreviewChange[]
): ArchitectureJson {
  const addChanges = changes.filter(
    (change) => change.action === "add_resource" && change.resourceType !== undefined
  );

  if (addChanges.length === 0) {
    return architectureJson;
  }

  const nextNodes = [...architectureJson.nodes];

  for (const change of addChanges) {
    const resourceType = change.resourceType;

    if (resourceType === undefined) {
      continue;
    }

    nextNodes.push({
      id: _createResourceId(resourceType, nextNodes.length + 1),
      type: resourceType,
      label:
        RESOURCE_KEYWORDS.find((item) => item.resourceType === resourceType)?.label ?? resourceType,
      positionX: 160 + nextNodes.length * 80,
      positionY: 160 + nextNodes.length * 40,
      config: {}
    });
  }

  return {
    nodes: nextNodes,
    edges: architectureJson.edges
  };
}

function _createResourceId(resourceType: ResourceType, sequence: number): string {
  return `${resourceType.toLowerCase().replace(/_/g, "-")}-${sequence}`;
}

function createPatchFallbackMetadata(instruction: string): AiProviderMetadata {
  const payload = {
    instruction
  };

  return {
    provider: "fallback",
    service: "rule_fallback",
    routeTarget: "architecture_patch_preview",
    cacheHit: false,
    cacheKey: createNormalizedAiCacheKey({
      provider: "fallback",
      routeTarget: "architecture_patch_preview",
      payload
    }),
    estimatedUsage: estimateAiUsage(payload),
    billingMode: "disabled",
    generatedAt: new Date().toISOString()
  };
}

function createPatchProviderMetadata(input: {
  readonly provider: AiProvider;
  readonly service: AiProviderService;
  readonly model?: string | undefined;
  readonly billingMode: AiBillingMode;
  readonly payload: unknown;
  readonly outputCharacters?: number | undefined;
}): AiProviderMetadata {
  return {
    provider: input.provider,
    service: input.service,
    model: input.model,
    routeTarget: "architecture_patch_plan",
    cacheHit: false,
    cacheKey: createNormalizedAiCacheKey({
      provider: input.provider,
      model: input.model,
      routeTarget: "architecture_patch_plan",
      payload: input.payload
    }),
    estimatedUsage: estimateAiUsage(input.payload, input.outputCharacters),
    billingMode: input.billingMode,
    generatedAt: new Date().toISOString()
  };
}

function readPatchPlanCreditPolicy(
  env: NodeJS.ProcessEnv
): Pick<AiCreditPolicy, "bedrock" | "billingMode"> {
  return {
    bedrock: env.BEDROCK_CREDIT_CONFIRMED === "true",
    billingMode: readPatchPlanBillingMode(env)
  };
}

function readPatchPlanBillingMode(env: NodeJS.ProcessEnv): AiBillingMode {
  switch (env.AI_BILLING_MODE) {
    case "aws_credit_only":
      return "aws_credit_only";
    case "standard":
      return "standard";
    case "disabled":
      return "disabled";
    default:
      return "disabled";
  }
}
