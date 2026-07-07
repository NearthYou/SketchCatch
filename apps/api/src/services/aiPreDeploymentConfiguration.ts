import type { CheckFinding, ResourceConfig, ResourceNode } from "@sketchcatch/types";

// Resource가 Terraform 생성에 필요한 기본 설정값을 가지고 있는지 확인합니다.
export function createConfigurationFindings(node: ResourceNode): CheckFinding[] {
  const missingKeys = getRequiredConfigKeys(node).filter((key) => !hasRequiredConfigValue(node, key));

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

// ResourceType별 최소 config 약속입니다. sw Terraform 생성기와 맞춰야 하는 부분입니다.
function getRequiredConfigKeys(node: ResourceNode): readonly string[] {
  switch (node.type) {
    case "VPC":
      return ["cidrBlock"];
    case "SUBNET":
      return ["cidrBlock", "vpcId"];
    case "INTERNET_GATEWAY":
      return ["vpcId"];
    case "ROUTE_TABLE":
      return ["vpcId"];
    case "ROUTE_TABLE_ASSOCIATION":
      return ["subnetId", "routeTableId"];
    case "EC2":
      return ["instanceType", "subnetId", "securityGroupIds"];
    case "RDS":
      return ["engine", "instanceClass"];
    case "SECURITY_GROUP":
      return ["vpcId"];
    case "S3":
    case "CLOUDFRONT":
    case "LAMBDA":
    case "AMI":
    case "KMS_KEY":
    case "CLOUDWATCH_LOG_GROUP":
    case "API_GATEWAY_REST_API":
      return [];
    case "IAM_ROLE":
      return ["assumeRolePolicy"];
    case "IAM_POLICY":
      return ["policy"];
    case "IAM_INSTANCE_PROFILE":
      return ["role"];
    case "CLOUDWATCH_METRIC_ALARM":
      return [
        "alarmName",
        "namespace",
        "metricName",
        "comparisonOperator",
        "threshold",
        "evaluationPeriods",
        "period"
      ];
    case "LAMBDA_PERMISSION":
      return ["action", "functionName", "principal"];
    case "RDS_READ_REPLICA":
      return ["replicateSourceDb"];
    case "NAT_GATEWAY":
    case "AUTO_SCALING_GROUP":
    case "LAUNCH_TEMPLATE":
    case "KEY_PAIR":
    case "ELASTIC_IP":
    case "EBS_VOLUME":
    case "RDS_CLUSTER":
    case "DYNAMODB_TABLE":
    case "ELASTICACHE_REDIS":
    case "LOAD_BALANCER_TARGET_GROUP":
    case "LAMBDA_EVENT_SOURCE_MAPPING":
    case "ACM_CERTIFICATE":
    case "COGNITO_USER_POOL":
    case "COGNITO_USER_POOL_CLIENT":
    case "CLOUDWATCH_DASHBOARD":
    case "API_GATEWAY_WEBSOCKET_API":
    case "API_GATEWAY_RESOURCE":
    case "API_GATEWAY_METHOD":
    case "API_GATEWAY_INTEGRATION":
    case "API_GATEWAY_STAGE":
    case "SNS_TOPIC":
    case "SQS_QUEUE":
    case "EVENTBRIDGE_RULE":
    case "EVENTBRIDGE_TARGET":
    case "STEP_FUNCTIONS_STATE_MACHINE":
    case "ECR_REPOSITORY":
    case "ECS_CLUSTER":
    case "ECS_SERVICE":
    case "ECS_TASK_DEFINITION":
    case "EKS_CLUSTER":
      return [];
    case "UNKNOWN":
      return [];
  }
}

// 빈 문자열이나 빈 배열은 "입력 안 됨"으로 봅니다.
function hasRequiredConfigValue(node: ResourceNode, key: string): boolean {
  if (node.type === "EC2" && key === "securityGroupIds") {
    return hasConfigValue(node.config, "securityGroupIds") || hasConfigValue(node.config, "vpcSecurityGroupIds");
  }

  return hasConfigValue(node.config, key);
}

function hasConfigValue(config: ResourceConfig, key: string): boolean {
  const value = config[key];

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return value !== undefined && value !== null && value !== "";
}
