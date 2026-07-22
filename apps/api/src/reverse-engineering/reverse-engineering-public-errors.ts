import type {
  ResourceType,
  ReverseEngineeringScanError,
  ReverseEngineeringServiceCoverage
} from "@sketchcatch/types";
import { selectHigherPriorityReverseEngineeringScanError } from "./reverse-engineering-scan-error-priority.js";

const SERVICE_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  "api-gateway": "API Gateway",
  "aws-inventory": "AWS 리소스 목록",
  cloudfront: "CloudFront",
  cloudwatch: "CloudWatch",
  "cloudwatch-logs": "CloudWatch Logs",
  ec2: "EC2",
  ecs: "ECS",
  "elastic-load-balancing": "Elastic Load Balancing",
  eventbridge: "EventBridge",
  iam: "IAM",
  kms: "KMS",
  lambda: "Lambda",
  rds: "RDS",
  "resource-explorer": "Resource Explorer",
  "resource-explorer-2": "Resource Explorer",
  "resource-groups-tagging": "Resource Groups Tagging API",
  s3: "S3"
};

export type ReverseEngineeringConnectionFailureClassification = {
  readonly internalCode:
    | "caller_credentials_unavailable"
    | "target_role_unavailable"
    | "provider_unavailable";
  readonly publicReason: "retry" | "open_settings";
  readonly publicMessage: string;
};

/** gg: 원문 provider 오류를 서비스 단위 공개 범위로 줄이고 같은 서비스는 한 번만 남깁니다. */
export function createReverseEngineeringPublicCoverage(
  scanErrors: readonly ReverseEngineeringScanError[]
): { readonly coverage: ReverseEngineeringServiceCoverage } {
  const strongestErrors = new Map<string, ReverseEngineeringScanError>();

  for (const scanError of scanErrors) {
    const serviceKey = getSafeServiceKey(scanError);
    strongestErrors.set(
      serviceKey,
      selectHigherPriorityReverseEngineeringScanError(
        strongestErrors.get(serviceKey),
        scanError
      )
    );
  }

  const unavailableServices = [...strongestErrors].map(([serviceKey, scanError]) => {
    const reason = getPublicCoverageReason(scanError.reason);
    return {
      serviceKey,
      displayName: SERVICE_DISPLAY_NAMES[serviceKey] ?? "AWS 서비스",
      reason,
      remedy: reason === "permission_required" ? ("open_settings" as const) : ("retry" as const)
    };
  });

  return {
    coverage: {
      status: unavailableServices.length > 0 ? "partial" : "complete",
      unavailableServices
    }
  };
}

/** gg: 저장·응답 호환용 scanErrors도 원문을 버린 고정 문장과 allowlist serviceKey만 가집니다. */
export function sanitizeReverseEngineeringScanErrors(
  scanErrors: readonly ReverseEngineeringScanError[]
): ReverseEngineeringScanError[] {
  const strongestErrors = new Map<string, ReverseEngineeringScanError>();

  for (const scanError of scanErrors) {
    const serviceKey = getSafeServiceKey(scanError);
    strongestErrors.set(
      serviceKey,
      selectHigherPriorityReverseEngineeringScanError(
        strongestErrors.get(serviceKey),
        scanError
      )
    );
  }

  return [...strongestErrors].map(([serviceKey, scanError]) => ({
    id: `scan-error-service-${serviceKey}`,
    serviceKey,
    resourceType: scanError.resourceType,
    stage: "provider_api",
    reason: scanError.reason,
    message: getSafeScanErrorMessage(scanError.reason),
    retryable: scanError.reason === "throttled" || scanError.reason === "provider_error"
  }));
}

/** gg: 서버 자격 증명 문제와 고객 Role 문제를 서로 다른 안전한 다음 행동으로 분리합니다. */
export function classifyReverseEngineeringConnectionFailure(
  error: unknown
): ReverseEngineeringConnectionFailureClassification {
  const errorName = error instanceof Error ? error.name.toLowerCase() : "";
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (
    errorName === "credentialsprovidererror" ||
    errorName === "tokenprovidererror" ||
    message.includes("aws caller credentials") ||
    message.includes("aws sso credentials") ||
    message.includes("could not load credentials") ||
    message.includes("sso session")
  ) {
    return {
      internalCode: "caller_credentials_unavailable",
      publicReason: "retry",
      publicMessage: "AWS 연결을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요."
    };
  }

  if (
    message.includes("aws role assume permission denied") ||
    message.includes("aws role account mismatch") ||
    message.includes("aws role trust policy") ||
    message.includes("aws role external id requirement") ||
    message.includes("aws connection must be verified") ||
    message.includes("aws connection region") ||
    message.includes("aws connection external id")
  ) {
    return {
      internalCode: "target_role_unavailable",
      publicReason: "open_settings",
      publicMessage: "AWS Role 연결을 확인해 주세요."
    };
  }

  return {
    internalCode: "provider_unavailable",
    publicReason: "retry",
    publicMessage: "AWS에서 항목을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요."
  };
}

/** gg: provider가 보낸 serviceKey는 공개 allowlist에 있을 때만 사용합니다. */
function getSafeServiceKey(scanError: ReverseEngineeringScanError): string {
  const explicitKey = scanError.serviceKey?.trim().toLowerCase();
  if (explicitKey && Object.prototype.hasOwnProperty.call(SERVICE_DISPLAY_NAMES, explicitKey)) {
    return explicitKey;
  }

  const idKey = /^scan-error-service-([a-z0-9-]+)$/u.exec(scanError.id)?.[1];
  if (idKey && Object.prototype.hasOwnProperty.call(SERVICE_DISPLAY_NAMES, idKey)) {
    return idKey;
  }

  if (scanError.id === "scan-error-resource-explorer") {
    return "resource-explorer";
  }

  return getServiceKeyByResourceType(scanError.resourceType);
}

/** gg: 과거 저장 결과는 ResourceType을 안전한 서비스 이름으로만 보정합니다. */
function getServiceKeyByResourceType(resourceType: ResourceType | "UNKNOWN"): string {
  const keys: Partial<Record<ResourceType, string>> = {
    VPC: "ec2",
    SUBNET: "ec2",
    INTERNET_GATEWAY: "ec2",
    ROUTE_TABLE: "ec2",
    ROUTE_TABLE_ASSOCIATION: "ec2",
    ELASTIC_IP: "ec2",
    NAT_GATEWAY: "ec2",
    SECURITY_GROUP: "ec2",
    EC2: "ec2",
    AMI: "ec2",
    LOAD_BALANCER: "elastic-load-balancing",
    CLOUDFRONT: "cloudfront",
    ECS_CLUSTER: "ecs",
    ECS_SERVICE: "ecs",
    ECS_TASK_DEFINITION: "ecs",
    RDS: "rds",
    S3: "s3",
    IAM_ROLE: "iam",
    IAM_POLICY: "iam",
    IAM_INSTANCE_PROFILE: "iam",
    KMS_KEY: "kms",
    CLOUDWATCH_LOG_GROUP: "cloudwatch-logs",
    CLOUDWATCH_METRIC_ALARM: "cloudwatch",
    EVENTBRIDGE_RULE: "eventbridge",
    EVENTBRIDGE_TARGET: "eventbridge",
    API_GATEWAY_REST_API: "api-gateway",
    LAMBDA: "lambda",
    LAMBDA_PERMISSION: "lambda"
  };

  return keys[resourceType] ?? "aws-inventory";
}

/** gg: 내부 reason은 사용자에게 필요한 세 가지 해결 분류로만 줄입니다. */
function getPublicCoverageReason(
  reason: ReverseEngineeringScanError["reason"]
): ReverseEngineeringServiceCoverage["unavailableServices"][number]["reason"] {
  if (reason === "permission_denied") {
    return "permission_required";
  }

  return reason === "not_configured" ? "not_configured" : "retry";
}

/** gg: 원문 SDK message 대신 고정된 짧은 문장만 호환 필드에 남깁니다. */
function getSafeScanErrorMessage(reason: ReverseEngineeringScanError["reason"]): string {
  if (reason === "permission_denied") {
    return "이 서비스를 읽을 권한이 부족합니다.";
  }

  if (reason === "not_configured") {
    return "이 서비스의 조회 준비가 필요합니다.";
  }

  return "이 서비스를 읽지 못했습니다.";
}
