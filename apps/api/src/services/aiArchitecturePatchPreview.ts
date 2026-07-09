import type {
  AiProviderMetadata,
  ArchitectureJson,
  ArchitecturePatchAction,
  ArchitecturePatchClarification,
  ArchitecturePatchClarificationCandidate,
  ArchitecturePatchIntent,
  ArchitecturePatchPreview,
  ArchitecturePatchPreviewChange,
  ArchitecturePatchPreviewResponse,
  CreateArchitecturePatchPreviewRequest,
  ResourceNode,
  ResourceType
} from "@sketchcatch/types";
import { resourceDefinitions } from "@sketchcatch/types/resource-definitions";
import { createNormalizedAiCacheKey, estimateAiUsage } from "./aiProviderSafety.js";

export type CreateArchitecturePatchPreviewInput = CreateArchitecturePatchPreviewRequest;

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
  "include",
  "provision",
  "deploy",
  "expand",
  "추가",
  "생성",
  "만들",
  "붙여",
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

export function createArchitecturePatchPreview(
  input: CreateArchitecturePatchPreviewInput
): ArchitecturePatchPreviewResponse {
  const providerMetadata = createPatchFallbackMetadata(input.instruction);

  if (isNoResourceAdditionInstruction(input.instruction)) {
    return createNoResourceAdditionPreview(input, providerMetadata);
  }

  const compoundChanges = createCompoundPatchChanges(input);

  if (compoundChanges !== undefined) {
    const intent: ArchitecturePatchIntent = {
      instruction: input.instruction,
      requestedAction: "manual_review",
      ...(input.skipConnection === true ? { skipConnection: true } : {}),
      ...(input.connectionTargetResourceId
        ? { connectionTargetResourceId: input.connectionTargetResourceId }
        : {})
    };

    return {
      status: "preview",
      intent,
      baseArchitectureJson: input.architectureJson,
      proposedArchitectureJson: applyResolvedPreviewChanges(
        input.architectureJson,
        compoundChanges,
        intent
      ),
      changes: compoundChanges,
      requiresUserAcceptance: true,
      userAcceptedChange: null,
      providerMetadata
    };
  }

  const intent = resolvePatchIntent(input);
  const selectedTargetNode =
    intent.requestedAction === "add_resource"
      ? undefined
      : getSelectedTargetNode(input.architectureJson, input.selectedTargetResourceId);
  const resolvedIntent = selectedTargetNode
    ? {
        ...intent,
        resourceType: selectedTargetNode.type,
        targetResourceId: selectedTargetNode.id
      }
    : intent;
  const targetResolution = resolveTarget(input.architectureJson, resolvedIntent);

  if (targetResolution.status === "needs_clarification") {
    return createClarificationResponse({
      candidates: targetResolution.candidates,
      intent: resolvedIntent,
      suggestions: targetResolution.suggestions,
      providerMetadata
    });
  }

  const changes = createResolvedPatchChanges(
    input.architectureJson,
    resolvedIntent,
    targetResolution.targetNode
  );
  const proposedArchitectureJson = applyResolvedPreviewChanges(
    input.architectureJson,
    changes,
    resolvedIntent
  );

  return {
    status: "preview",
    intent: resolvedIntent,
    baseArchitectureJson: input.architectureJson,
    proposedArchitectureJson,
    changes,
    requiresUserAcceptance: true,
    userAcceptedChange: null,
    providerMetadata
  };
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
  const naturalLanguageAction = resolvePatchActionFromNaturalLanguage(normalizedInstruction);
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
              ...createModificationConfig(intent)
            }
          }
        : node
    ),
    edges: architectureJson.edges
  };
}

function createModificationConfig(intent: ArchitecturePatchIntent): Record<string, unknown> {
  const normalizedInstruction = normalizeSearchText(intent.instruction);
  const instanceType = findEc2InstanceType(normalizedInstruction);

  if (intent.resourceType === "EC2" && instanceType) {
    return {
      instanceType
    };
  }

  return {
    naturalLanguageChangeRequest: intent.instruction
  };
}

function findEc2InstanceType(normalizedInstruction: string): string | undefined {
  return (
    normalizedInstruction.match(
      /\b(?:instance\s*type|instancetype|type|인스턴스\s*타입|타입)\s*(?:to|=|:|을|를|은|는)?\s*((?:[a-z][0-9][a-z]?\.[a-z0-9]+))/i
    )?.[1] ?? normalizedInstruction.match(/\b(?:[a-z][0-9][a-z]?\.[a-z0-9]+)\b/i)?.[0]
  );
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
