import type {
  AiArchitectureDraftResult,
  ArchitectureDraftOperatingProfile,
  ArchitectureJson
} from "@sketchcatch/types";

// 운영 조건 중 보안 우선순위가 높을 때만 지원 가능한 config를 초안에 덧붙입니다.
export function applyOperatingConditionConfig(
  draft: AiArchitectureDraftResult,
  operatingProfile: ArchitectureDraftOperatingProfile
): AiArchitectureDraftResult {
  return {
    ...draft,
    architectureJson: {
      ...draft.architectureJson,
      nodes: draft.architectureJson.nodes.map((node) => applyNodeOperatingConditionConfig(node, operatingProfile))
    }
  };
}

// Helper choices must affect generated resource parameters, not only metadata text.
function applyNodeOperatingConditionConfig(
  node: ArchitectureJson["nodes"][number],
  operatingProfile: ArchitectureDraftOperatingProfile
): ArchitectureJson["nodes"][number] {
  const configuredNode = applySizingAndTrafficConfig(node, operatingProfile);

  return operatingProfile.securityPriority === "high" ? applyHighSecurityConfig(configuredNode) : configuredNode;
}

function applySizingAndTrafficConfig(
  node: ArchitectureJson["nodes"][number],
  operatingProfile: ArchitectureDraftOperatingProfile
): ArchitectureJson["nodes"][number] {
  if (node.type === "EC2") {
    return {
      ...node,
      config: {
        ...node.config,
        instanceType: selectEc2InstanceType(operatingProfile),
        monitoring: operatingProfile.trafficLevel === "normal"
      }
    };
  }

  if (node.type === "RDS") {
    return {
      ...node,
      config: {
        ...node.config,
        allocatedStorage: operatingProfile.trafficLevel === "normal" ? 50 : 20,
        deletionProtection: operatingProfile.securityPriority === "high",
        instanceClass: selectRdsInstanceClass(operatingProfile),
        skipFinalSnapshot: operatingProfile.securityPriority !== "high"
      }
    };
  }

  if (node.type === "S3") {
    return {
      ...node,
      config: {
        ...node.config,
        forceDestroy: operatingProfile.budgetLevel === "low"
      }
    };
  }

  if (node.type === "CLOUDFRONT") {
    return {
      ...node,
      config: {
        ...node.config,
        enabled: true,
        priceClass: selectCloudFrontPriceClass(operatingProfile)
      }
    };
  }

  if (node.type === "LAMBDA") {
    return {
      ...node,
      config: {
        ...node.config,
        memorySize: operatingProfile.budgetLevel === "normal" && operatingProfile.trafficLevel === "normal" ? 256 : 128,
        timeout: operatingProfile.trafficLevel === "normal" ? 20 : 10
      }
    };
  }

  if (node.type === "CLOUDWATCH_LOG_GROUP") {
    return {
      ...node,
      config: {
        ...node.config,
        retentionInDays: operatingProfile.securityPriority === "high" || operatingProfile.trafficLevel === "normal" ? 30 : 7
      }
    };
  }

  return node;
}

function selectEc2InstanceType(operatingProfile: ArchitectureDraftOperatingProfile): string {
  return operatingProfile.budgetLevel === "normal" && operatingProfile.trafficLevel === "normal" ? "t3.small" : "t3.micro";
}

function selectRdsInstanceClass(operatingProfile: ArchitectureDraftOperatingProfile): string {
  return operatingProfile.budgetLevel === "normal" && operatingProfile.trafficLevel === "normal" ? "db.t3.small" : "db.t4g.micro";
}

function selectCloudFrontPriceClass(operatingProfile: ArchitectureDraftOperatingProfile): string {
  return operatingProfile.budgetLevel === "normal" && operatingProfile.trafficLevel === "normal" ? "PriceClass_200" : "PriceClass_100";
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
