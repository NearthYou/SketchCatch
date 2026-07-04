import type {
  AiProviderMetadata,
  ArchitectureJson,
  ArchitecturePatchAction,
  ArchitecturePatchIntent,
  ArchitecturePatchPreview,
  ArchitecturePatchPreviewChange,
  ResourceType
} from "@sketchcatch/types";
import { createNormalizedAiCacheKey, estimateAiUsage } from "./aiProviderSafety.js";

export type CreateArchitecturePatchPreviewInput = {
  readonly architectureJson: ArchitectureJson;
  readonly instruction: string;
};

const RESOURCE_KEYWORDS: readonly {
  readonly resourceType: ResourceType;
  readonly keywords: readonly string[];
  readonly label: string;
}[] = [
  { resourceType: "S3", keywords: ["s3", "bucket", "storage", "file"], label: "S3 Bucket" },
  { resourceType: "EC2", keywords: ["ec2", "server", "instance"], label: "EC2 Instance" },
  { resourceType: "RDS", keywords: ["rds", "database", "postgres", "mysql"], label: "RDS Database" },
  { resourceType: "VPC", keywords: ["vpc", "network"], label: "VPC" },
  { resourceType: "SECURITY_GROUP", keywords: ["security group", "firewall", "ssh"], label: "Security Group" }
];

export function createArchitecturePatchPreview(
  input: CreateArchitecturePatchPreviewInput
): ArchitecturePatchPreview {
  const intent = resolvePatchIntent(input.instruction);
  const changes = createPatchChanges(input.architectureJson, intent);
  const proposedArchitectureJson = applyPreviewChanges(input.architectureJson, changes);
  const providerMetadata = createPatchFallbackMetadata(input.instruction);

  return {
    intent,
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

function resolvePatchIntent(instruction: string): ArchitecturePatchIntent {
  const normalizedInstruction = instruction.toLowerCase();
  const resourceType = findResourceType(normalizedInstruction);
  const requestedAction = resolvePatchAction(normalizedInstruction);

  return {
    instruction,
    requestedAction,
    resourceType
  };
}

function resolvePatchAction(normalizedInstruction: string): ArchitecturePatchAction {
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

function createPatchChanges(
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

function applyPreviewChanges(
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
      id: createResourceId(resourceType, nextNodes.length + 1),
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

function createResourceId(resourceType: ResourceType, sequence: number): string {
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
