import type { AiArchitectureDraftResult, ArchitectureJson, CreateArchitectureDraftRequest } from "@sketchcatch/types";

export function applyOperatingConditionConfig(
  draft: AiArchitectureDraftResult,
  request: CreateArchitectureDraftRequest
): AiArchitectureDraftResult {
  if (request.securityPriority !== "high") {
    return draft;
  }

  return {
    ...draft,
    architectureJson: {
      ...draft.architectureJson,
      nodes: draft.architectureJson.nodes.map(applyHighSecurityConfig)
    }
  };
}

function applyHighSecurityConfig(node: ArchitectureJson["nodes"][number]): ArchitectureJson["nodes"][number] {
  if (node.type === "S3") {
    return {
      ...node,
      config: {
        ...node.config,
        publicAccessBlock: true
      }
    };
  }

  if (node.type === "RDS") {
    return {
      ...node,
      config: {
        ...node.config,
        publiclyAccessible: false
      }
    };
  }

  if (node.type === "SECURITY_GROUP") {
    return {
      ...node,
      config: {
        ...node.config,
        ingress: []
      }
    };
  }

  return node;
}
