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
import { createNormalizedAiCacheKey, estimateAiUsage } from "./aiProviderSafety.js";

export type CreateArchitecturePatchPreviewInput = CreateArchitecturePatchPreviewRequest;

const RESOURCE_KEYWORDS: readonly {
  readonly resourceType: ResourceType;
  readonly keywords: readonly string[];
  readonly label: string;
}[] = [
  { resourceType: "VPC", keywords: ["vpc", "virtual private cloud", "network", "네트워크", "브이피씨"], label: "VPC" },
  { resourceType: "SUBNET", keywords: ["subnet", "sub net", "서브넷"], label: "서브넷" },
  {
    resourceType: "INTERNET_GATEWAY",
    keywords: ["internet gateway", "igw", "internet gw", "인터넷 게이트웨이", "인터넷 gateway"],
    label: "인터넷 게이트웨이"
  },
  { resourceType: "ROUTE_TABLE", keywords: ["route table", "routing table", "라우트 테이블", "라우팅 테이블"], label: "라우트 테이블" },
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
    keywords: ["rds", "database", "db", "postgres", "mysql", "데이터베이스", "디비", "데이터 저장소"],
    label: "RDS 데이터베이스"
  },
  { resourceType: "S3", keywords: ["s3", "bucket", "storage", "file", "upload", "버킷", "스토리지", "파일", "업로드"], label: "S3 버킷" },
  {
    resourceType: "SECURITY_GROUP",
    keywords: ["security group", "securitygroup", "firewall", "ssh", "보안 그룹", "보안그룹", "방화벽"],
    label: "보안 그룹"
  },
  { resourceType: "CLOUDFRONT", keywords: ["cloudfront", "cloud front", "cdn", "클라우드프론트"], label: "CloudFront CDN" },
  { resourceType: "LAMBDA", keywords: ["lambda", "serverless", "function", "람다", "서버리스", "함수"], label: "Lambda 함수" },
  { resourceType: "AMI", keywords: ["ami", "machine image", "image", "이미지", "머신 이미지"], label: "AMI" },
  { resourceType: "API_GATEWAY_REST_API", keywords: ["api gateway", "rest api", "apigateway", "api 게이트웨이"], label: "API Gateway" },
  { resourceType: "IAM_ROLE", keywords: ["iam role", "role", "역할", "롤"], label: "IAM 역할" },
  { resourceType: "IAM_POLICY", keywords: ["iam policy", "policy", "정책", "폴리시"], label: "IAM 정책" },
  {
    resourceType: "IAM_INSTANCE_PROFILE",
    keywords: ["iam instance profile", "instance profile", "인스턴스 프로파일"],
    label: "IAM 인스턴스 프로파일"
  },
  { resourceType: "KMS_KEY", keywords: ["kms", "kms key", "key", "encryption key", "암호화 키", "키"], label: "KMS 키" },
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
  "추가",
  "생성",
  "만들",
  "붙여",
  "넣",
  "구성",
  "배치"
];

type ReplacementPatchIntent = {
  readonly sourceResourceType?: ResourceType | undefined;
  readonly replacementResourceType: ResourceType;
};

export function createArchitecturePatchPreview(
  input: CreateArchitecturePatchPreviewInput
): ArchitecturePatchPreviewResponse {
  const providerMetadata = createPatchFallbackMetadata(input.instruction);
  const intent = resolvePatchIntent(input.instruction, input.selectedTargetResourceId);
  const selectedTargetNode = getSelectedTargetNode(input.architectureJson, input.selectedTargetResourceId);
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
      providerMetadata
    });
  }

  const changes = createResolvedPatchChanges(resolvedIntent, targetResolution.targetNode);
  const proposedArchitectureJson = applyResolvedPreviewChanges(input.architectureJson, changes, resolvedIntent);

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

function resolvePatchIntent(
  instruction: string,
  selectedTargetResourceId: string | undefined
): ArchitecturePatchIntent {
  const normalizedInstruction = normalizeSearchText(instruction);
  const replacementIntent = resolveReplacementPatchIntent(normalizedInstruction);
  const resourceType = replacementIntent
    ? replacementIntent.sourceResourceType
    : findResourceType(normalizedInstruction);
  const requestedAction = replacementIntent
    ? "modify_resource"
    : resolvePatchActionFromNaturalLanguage(normalizedInstruction);

  return {
    instruction,
    requestedAction,
    ...(selectedTargetResourceId ? { targetResourceId: selectedTargetResourceId } : {}),
    ...(resourceType ? { resourceType } : {})
  };
}

function resolvePatchActionFromNaturalLanguage(normalizedInstruction: string): ArchitecturePatchAction {
  if (includesAnyPhrase(normalizedInstruction, REMOVE_ACTION_KEYWORDS)) {
    return "remove_resource";
  }

  if (includesAnyPhrase(normalizedInstruction, MODIFY_ACTION_KEYWORDS)) {
    return "modify_resource";
  }

  if (includesAnyPhrase(normalizedInstruction, ADD_ACTION_KEYWORDS)) {
    return "add_resource";
  }

  return "manual_review";
}

function resolveReplacementPatchIntent(normalizedInstruction: string): ReplacementPatchIntent | undefined {
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

  if (koreanLooseReplacementMatch?.groups?.source && koreanLooseReplacementMatch.groups.replacement) {
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
  ).sort((left, right) => right.score - left.score || left.resourceIndex - right.resourceIndex)[0]?.resourceType;
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
    };

function resolveTarget(
  architectureJson: ArchitectureJson,
  intent: ArchitecturePatchIntent
): TargetResolution {
  if (intent.requestedAction === "add_resource" || intent.requestedAction === "manual_review") {
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
      candidates: (mentionedNodes.length > 0 ? mentionedNodes : architectureJson.nodes).map(toClarificationCandidate)
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
    candidates: (matchingNodes.length > 0 ? matchingNodes : architectureJson.nodes).map(toClarificationCandidate)
  };
}

function findMentionedNodes(nodes: readonly ResourceNode[], instruction: string): ResourceNode[] {
  const normalizedInstruction = normalizeSearchText(instruction);

  return nodes.filter((node) => nodeSearchAliases(node).some((alias) => includesPhrase(normalizedInstruction, alias)));
}

function nodeSearchAliases(node: ResourceNode): string[] {
  return [node.id, node.label].filter((alias): alias is string => alias !== undefined && alias.trim().length > 0);
}

function createClarificationResponse(input: {
  readonly candidates: readonly ArchitecturePatchClarificationCandidate[];
  readonly intent: ArchitecturePatchIntent;
  readonly providerMetadata: AiProviderMetadata;
}): ArchitecturePatchClarification {
  return {
    status: "needs_clarification",
    intent: input.intent,
    question: createClarificationQuestion(input.intent, input.candidates),
    candidates: [...input.candidates],
    providerMetadata: input.providerMetadata
  };
}

function createClarificationQuestion(
  intent: ArchitecturePatchIntent,
  candidates: readonly ArchitecturePatchClarificationCandidate[]
): string {
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

function formatPatchResourceType(resourceType: ResourceType): string {
  return RESOURCE_KEYWORDS.find((item) => item.resourceType === resourceType)?.label ?? resourceType;
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
      nextArchitectureJson = addResource(nextArchitectureJson, change.resourceType);
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

function addResource(architectureJson: ArchitectureJson, resourceType: ResourceType): ArchitectureJson {
  const nextNodes = [...architectureJson.nodes];

  nextNodes.push({
    id: createUniqueResourceId(resourceType, nextNodes),
    type: resourceType,
    label: RESOURCE_KEYWORDS.find((item) => item.resourceType === resourceType)?.label ?? resourceType,
    ...getNewResourcePosition(nextNodes),
    config: {}
  });

  return {
    nodes: nextNodes,
    edges: architectureJson.edges
  };
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

function getNewResourcePosition(nodes: readonly ResourceNode[]): Pick<ResourceNode, "positionX" | "positionY"> {
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

function createUniqueResourceId(resourceType: ResourceType, nodes: readonly ResourceNode[]): string {
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
  const addChanges = changes.filter((change) => change.action === "add_resource" && change.resourceType !== undefined);

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
      label: RESOURCE_KEYWORDS.find((item) => item.resourceType === resourceType)?.label ?? resourceType,
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
