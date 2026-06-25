import type { CheckFinding, ResourceConfig, ResourceNode } from "@sketchcatch/types";

export function createConfigurationFindings(node: ResourceNode): CheckFinding[] {
  const missingKeys = getRequiredConfigKeys(node).filter((key) => !hasConfigValue(node.config, key));

  if (missingKeys.length === 0) {
    return [];
  }

  return [
    {
      id: `configuration-missing-${node.id}`,
      category: "configuration",
      severity: "medium",
      resourceId: node.id,
      title: "필수 Resource 설정이 빠져 있습니다",
      description: `${node.label ?? node.id}에 ${missingKeys.join(", ")} 설정이 필요합니다.`,
      recommendation: "Architecture Board의 Resource 설정 패널에서 빠진 값을 채운 뒤 다시 확인하세요."
    }
  ];
}

function getRequiredConfigKeys(node: ResourceNode): readonly string[] {
  switch (node.type) {
    case "VPC":
      return ["cidrBlock"];
    case "SUBNET":
      return ["cidrBlock", "vpcId"];
    case "EC2":
      return ["instanceType", "subnetId", "securityGroupIds"];
    case "RDS":
      return ["engine", "instanceClass"];
    case "SECURITY_GROUP":
      return ["vpcId"];
    case "S3":
    case "CLOUDFRONT":
    case "LAMBDA":
    case "UNKNOWN":
      return [];
  }
}

function hasConfigValue(config: ResourceConfig, key: string): boolean {
  const value = config[key];

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return value !== undefined && value !== null && value !== "";
}
