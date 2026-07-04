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
  { resourceType: "VPC", keywords: ["vpc", "network"], label: "VPC" },
  { resourceType: "SUBNET", keywords: ["subnet"], label: "Subnet" },
  { resourceType: "INTERNET_GATEWAY", keywords: ["internet gateway", "igw"], label: "Internet Gateway" },
  { resourceType: "ROUTE_TABLE", keywords: ["route table"], label: "Route Table" },
  { resourceType: "EC2", keywords: ["ec2", "server", "instance", "compute"], label: "EC2 Instance" },
  { resourceType: "RDS", keywords: ["rds", "database", "postgres", "mysql"], label: "RDS Database" },
  { resourceType: "S3", keywords: ["s3", "bucket", "storage", "file", "upload"], label: "S3 Bucket" },
  { resourceType: "SECURITY_GROUP", keywords: ["security group", "firewall", "ssh"], label: "Security Group" },
  { resourceType: "CLOUDFRONT", keywords: ["cloudfront", "cdn"], label: "CloudFront CDN" },
  { resourceType: "LAMBDA", keywords: ["lambda", "serverless", "function"], label: "Lambda Function" },
  { resourceType: "API_GATEWAY_REST_API", keywords: ["api gateway", "rest api"], label: "API Gateway" },
  { resourceType: "IAM_ROLE", keywords: ["iam role", "role"], label: "IAM Role" },
  { resourceType: "IAM_POLICY", keywords: ["iam policy", "policy"], label: "IAM Policy" },
  { resourceType: "KMS_KEY", keywords: ["kms", "key", "encryption"], label: "KMS Key" },
  {
    resourceType: "CLOUDWATCH_LOG_GROUP",
    keywords: ["cloudwatch log", "log group", "logs"],
    label: "CloudWatch Log Group"
  },
  {
    resourceType: "CLOUDWATCH_METRIC_ALARM",
    keywords: ["cloudwatch alarm", "metric alarm", "alarm"],
    label: "CloudWatch Alarm"
  }
];

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
  const normalizedInstruction = instruction.toLowerCase();
  const resourceType = findResourceType(normalizedInstruction);
  const requestedAction = resolvePatchActionFromNaturalLanguage(normalizedInstruction);

  return {
    instruction,
    requestedAction,
    ...(selectedTargetResourceId ? { targetResourceId: selectedTargetResourceId } : {}),
    ...(resourceType ? { resourceType } : {})
  };
}

function resolvePatchActionFromNaturalLanguage(normalizedInstruction: string): ArchitecturePatchAction {
  if (/\b(remove|delete|drop|detach)\b|제거|삭제|지워|없애|빼줘/.test(normalizedInstruction)) {
    return "remove_resource";
  }

  if (/\b(change|modify|update|set|resize|rename)\b|수정|변경|바꿔|늘려|줄여|교체/.test(normalizedInstruction)) {
    return "modify_resource";
  }

  if (/\b(add|create|attach|include|connect)\b|추가|생성|만들|붙여|넣어|연결/.test(normalizedInstruction)) {
    return "add_resource";
  }

  return "manual_review";
}

function _resolvePatchAction(normalizedInstruction: string): ArchitecturePatchAction {
  if (/\b(remove|delete|drop)\b|제거|삭제/.test(normalizedInstruction)) {
    return "remove_resource";
  }

  if (/\b(change|modify|update|set)\b|수정|변경/.test(normalizedInstruction)) {
    return "modify_resource";
  }

  if (/\b(add|create|attach|include)\b|추가|생성/.test(normalizedInstruction)) {
    return "add_resource";
  }

  return "manual_review";
}

function findResourceType(normalizedInstruction: string): ResourceType | undefined {
  return RESOURCE_KEYWORDS.find((item) =>
    item.keywords.some((keyword) => normalizedInstruction.includes(keyword))
  )?.resourceType;
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
    return {
      status: "needs_clarification",
      candidates: architectureJson.nodes.map(toClarificationCandidate)
    };
  }

  const matchingNodes = architectureJson.nodes.filter((node) => node.type === intent.resourceType);

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
    return "I could not find a matching resource on the current diagram. Please describe the target resource more specifically.";
  }

  const actionLabel =
    intent.requestedAction === "remove_resource"
      ? "remove"
      : intent.requestedAction === "modify_resource"
        ? "modify"
        : "change";

  return `Which resource should I ${actionLabel}?`;
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
  if (intent.requestedAction === "manual_review" || intent.resourceType === undefined) {
    return [
      {
        action: "manual_review",
        summary: "The request needs manual review before it can become a diagram patch."
      }
    ];
  }

  if (intent.requestedAction === "add_resource") {
    return [
      {
        action: "add_resource",
        resourceType: intent.resourceType,
        summary: `${intent.resourceType} resource will be added to the preview.`
      }
    ];
  }

  if (targetNode === null) {
    return [
      {
        action: "manual_review",
        resourceType: intent.resourceType,
        summary: `${intent.resourceType} resource could not be resolved automatically.`
      }
    ];
  }

  return [
    {
      action: intent.requestedAction,
      resourceType: targetNode.type,
      resourceId: targetNode.id,
      summary: `${targetNode.label ?? targetNode.id} will be changed by ${intent.requestedAction}.`
    }
  ];
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
  const normalizedInstruction = intent.instruction.toLowerCase();
  const instanceType = normalizedInstruction.match(
    /\b(?:instance\s*type|instancetype|type)\s*(?:to|=|:)?\s*((?:[tmacr][0-9][a-z]?\.[a-z0-9]+))/i
  )?.[1];

  if (intent.resourceType === "EC2" && instanceType) {
    return {
      instanceType
    };
  }

  return {
    naturalLanguageChangeRequest: intent.instruction
  };
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
