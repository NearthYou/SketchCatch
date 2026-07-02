import type { AiArchitectureDraftResult, ArchitectureJson, CreateArchitectureDraftRequest } from "@sketchcatch/types";

// 운영 조건 중 보안 우선순위가 높을 때만 지원 가능한 config를 초안에 덧붙입니다.
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

// MVP에서 안전하게 표현할 수 있는 보안 설정만 Resource config에 반영합니다.
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
