import type { AiArchitectureDraftResult, ArchitectureJson, CreateArchitectureDraftRequest } from "@sketchcatch/types";

// 운영 조건 중 보안 우선순위가 높을 때만 지원 가능한 config를 초안에 덧붙입니다.
export function applyOperatingConditionConfig(
  draft: AiArchitectureDraftResult,
  request: CreateArchitectureDraftRequest
): AiArchitectureDraftResult {
  return {
    ...draft,
    architectureJson: {
      ...draft.architectureJson,
      nodes: draft.architectureJson.nodes.map((node) => applyNodeOperatingConditionConfig(node, request))
    }
  };
}

// Helper choices must affect generated resource parameters, not only metadata text.
function applyNodeOperatingConditionConfig(
  node: ArchitectureJson["nodes"][number],
  request: CreateArchitectureDraftRequest
): ArchitectureJson["nodes"][number] {
  const configuredNode = applySizingAndTrafficConfig(node, request);

  return request.securityPriority === "high" ? applyHighSecurityConfig(configuredNode) : configuredNode;
}

function applySizingAndTrafficConfig(
  node: ArchitectureJson["nodes"][number],
  request: CreateArchitectureDraftRequest
): ArchitectureJson["nodes"][number] {
  if (node.type === "EC2") {
    return {
      ...node,
      config: {
        ...node.config,
        instanceType: selectEc2InstanceType(request),
        monitoring: request.trafficLevel === "normal"
      }
    };
  }

  if (node.type === "RDS") {
    return {
      ...node,
      config: {
        ...node.config,
        allocatedStorage: request.trafficLevel === "normal" ? 50 : 20,
        deletionProtection: request.securityPriority === "high",
        instanceClass: selectRdsInstanceClass(request),
        skipFinalSnapshot: request.securityPriority !== "high"
      }
    };
  }

  if (node.type === "S3") {
    return {
      ...node,
      config: {
        ...node.config,
        forceDestroy: request.budgetLevel === "low"
      }
    };
  }

  if (node.type === "CLOUDFRONT") {
    return {
      ...node,
      config: {
        ...node.config,
        enabled: true,
        priceClass: selectCloudFrontPriceClass(request)
      }
    };
  }

  if (node.type === "LAMBDA") {
    return {
      ...node,
      config: {
        ...node.config,
        memorySize: request.budgetLevel === "normal" && request.trafficLevel === "normal" ? 256 : 128,
        timeout: request.trafficLevel === "normal" ? 20 : 10
      }
    };
  }

  if (node.type === "CLOUDWATCH_LOG_GROUP") {
    return {
      ...node,
      config: {
        ...node.config,
        retentionInDays: request.securityPriority === "high" || request.trafficLevel === "normal" ? 30 : 7
      }
    };
  }

  return node;
}

function selectEc2InstanceType(request: CreateArchitectureDraftRequest): string {
  return request.budgetLevel === "normal" && request.trafficLevel === "normal" ? "t3.small" : "t3.micro";
}

function selectRdsInstanceClass(request: CreateArchitectureDraftRequest): string {
  return request.budgetLevel === "normal" && request.trafficLevel === "normal" ? "db.t3.small" : "db.t4g.micro";
}

function selectCloudFrontPriceClass(request: CreateArchitectureDraftRequest): string {
  return request.budgetLevel === "normal" && request.trafficLevel === "normal" ? "PriceClass_200" : "PriceClass_100";
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
