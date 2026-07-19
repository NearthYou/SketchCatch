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
    architectureJson: applyOperatingConditionConfigToArchitecture(draft.architectureJson, operatingProfile)
  };
}

export function applyOperatingConditionConfigToArchitecture(
  architectureJson: ArchitectureJson,
  operatingProfile: ArchitectureDraftOperatingProfile
): ArchitectureJson {
  return {
    ...architectureJson,
    nodes: architectureJson.nodes.map((node) => applyNodeOperatingConditionConfig(node, operatingProfile))
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
        monitoring: operatingProfile.trafficProfile !== "small"
      }
    };
  }

  if (node.type === "RDS") {
    return {
      ...node,
      config: {
        ...node.config,
        allocatedStorage: selectRdsAllocatedStorage(operatingProfile),
        deletionProtection: operatingProfile.securityPriority === "high",
        instanceClass: selectRdsInstanceClass(operatingProfile),
        skipFinalSnapshot: operatingProfile.securityPriority !== "high",
        multiAz: operatingProfile.availabilityProfile === "99.99",
        backupRetentionPeriod: selectRdsBackupRetentionPeriod(operatingProfile),
        autoMinorVersionUpgrade: operatingProfile.managementProfile !== "self_managed"
      }
    };
  }

  if (node.type === "S3") {
    const bucketPrefix = selectUploadBucketPrefix(operatingProfile);

    return {
      ...node,
      config: {
        ...node.config,
        forceDestroy: operatingProfile.budgetLevel === "low",
        ...(bucketPrefix === undefined ? {} : { bucketPrefix })
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
        memorySize: selectLambdaMemorySize(operatingProfile),
        timeout: selectLambdaTimeout(operatingProfile)
      }
    };
  }

  if (node.type === "CLOUDWATCH_LOG_GROUP") {
    return {
      ...node,
      config: {
        ...node.config,
        retentionInDays: selectLogRetentionDays(operatingProfile)
      }
    };
  }


  if (node.type === "AUTO_SCALING_GROUP") {
    const capacity = selectAutoScalingCapacity(operatingProfile);

    return {
      ...node,
      config: {
        ...node.config,
        minSize: capacity.minSize,
        desiredCapacity: capacity.desiredCapacity,
        maxSize: capacity.maxSize
      }
    };
  }
  return node;
}

function selectEc2InstanceType(operatingProfile: ArchitectureDraftOperatingProfile): string {
  if (operatingProfile.trafficProfile === "large" || operatingProfile.budgetProfile === "enterprise") {
    return "m7i.large";
  }
  if (operatingProfile.trafficProfile === "bursty" || operatingProfile.budgetProfile === "high") {
    return "t3.medium";
  }
  if (operatingProfile.trafficProfile === "medium" || operatingProfile.budgetProfile === "normal") {
    return "t3.small";
  }
  return "t3.micro";
}

function selectRdsInstanceClass(operatingProfile: ArchitectureDraftOperatingProfile): string {
  if (
    operatingProfile.databaseProfile === "large" ||
    operatingProfile.trafficProfile === "large" ||
    operatingProfile.budgetProfile === "enterprise"
  ) {
    return "db.r6g.large";
  }
  if (
    operatingProfile.databaseProfile === "medium" ||
    operatingProfile.trafficProfile === "bursty" ||
    operatingProfile.budgetProfile === "high"
  ) {
    return "db.t4g.medium";
  }
  if (operatingProfile.trafficProfile === "medium" || operatingProfile.budgetProfile === "normal") {
    return "db.t4g.small";
  }
  return "db.t4g.micro";
}

function selectCloudFrontPriceClass(operatingProfile: ArchitectureDraftOperatingProfile): string {
  if (operatingProfile.budgetProfile === "enterprise") return "PriceClass_All";
  return operatingProfile.budgetProfile === "low" ? "PriceClass_100" : "PriceClass_200";
}

function selectRdsAllocatedStorage(operatingProfile: ArchitectureDraftOperatingProfile): number {
  if (operatingProfile.databaseProfile === "large") return 200;
  if (operatingProfile.databaseProfile === "medium") return 100;
  if (operatingProfile.trafficProfile === "large") return 100;
  if (operatingProfile.trafficProfile === "bursty") return 80;
  if (operatingProfile.trafficProfile === "medium") return 50;
  return 20;
}

function selectRdsBackupRetentionPeriod(operatingProfile: ArchitectureDraftOperatingProfile): number {
  if (operatingProfile.availabilityProfile === "99.99") return 14;
  if (operatingProfile.availabilityProfile === "99.9") return 7;
  return operatingProfile.securityPriority === "high" ? 7 : 1;
}

function selectLambdaMemorySize(operatingProfile: ArchitectureDraftOperatingProfile): number {
  if (operatingProfile.trafficProfile === "large") return 1024;
  if (
    operatingProfile.trafficProfile === "bursty" ||
    operatingProfile.realtimeProfile === "chat" ||
    operatingProfile.realtimeProfile === "data_updates" ||
    operatingProfile.budgetProfile === "high" ||
    operatingProfile.budgetProfile === "enterprise"
  ) {
    return 512;
  }
  return operatingProfile.trafficProfile === "medium" ? 256 : 128;
}

function selectLambdaTimeout(operatingProfile: ArchitectureDraftOperatingProfile): number {
  if (operatingProfile.trafficProfile === "large" || operatingProfile.realtimeProfile === "data_updates") return 30;
  if (operatingProfile.trafficProfile === "bursty" || operatingProfile.realtimeProfile === "chat") return 20;
  return operatingProfile.realtimeProfile === "notification" ? 15 : 10;
}

function selectLogRetentionDays(operatingProfile: ArchitectureDraftOperatingProfile): number {
  if (operatingProfile.availabilityProfile === "99.99" || operatingProfile.budgetProfile === "enterprise") return 90;
  if (
    operatingProfile.securityPriority === "high" ||
    operatingProfile.trafficProfile !== "small" ||
    operatingProfile.managementProfile === "fully_managed"
  ) {
    return 30;
  }
  return 7;
}

function selectUploadBucketPrefix(
  operatingProfile: ArchitectureDraftOperatingProfile
): string | undefined {
  if (operatingProfile.uploadProfile === "image") return "sketchcatch-image-uploads-";
  if (operatingProfile.uploadProfile === "mixed") return "sketchcatch-file-uploads-";
  if (operatingProfile.uploadProfile === "large") return "sketchcatch-large-file-uploads-";
  return undefined;
}

function selectAutoScalingCapacity(
  operatingProfile: ArchitectureDraftOperatingProfile
): { readonly minSize: number; readonly desiredCapacity: number; readonly maxSize: number } {
  const capacity = operatingProfile.trafficProfile === "large"
    ? { minSize: 2, desiredCapacity: 4, maxSize: 12 }
    : operatingProfile.trafficProfile === "bursty"
      ? { minSize: 1, desiredCapacity: 2, maxSize: 12 }
      : operatingProfile.trafficProfile === "medium"
        ? { minSize: 2, desiredCapacity: 2, maxSize: 4 }
        : { minSize: 1, desiredCapacity: 1, maxSize: 2 };

  return operatingProfile.availabilityProfile === "99.99"
    ? { ...capacity, minSize: Math.max(2, capacity.minSize), desiredCapacity: Math.max(2, capacity.desiredCapacity) }
    : capacity;
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
