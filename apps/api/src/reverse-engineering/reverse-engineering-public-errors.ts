import type {
  ResourceType,
  ReverseEngineeringScanError,
  ReverseEngineeringServiceCoverage
} from "@sketchcatch/types";
import { AWS_IMPORT_READERS } from "../aws-connections/aws-import-access-catalog.js";
import { selectHigherPriorityReverseEngineeringScanError } from "./reverse-engineering-scan-error-priority.js";

const SERVICE_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  "api-gateway": "API Gateway",
  "application-autoscaling": "Application Auto Scaling",
  "aws-inventory": "AWS 리소스 목록",
  "cloud-control": "Cloud Control",
  cloudfront: "CloudFront",
  cloudwatch: "CloudWatch",
  "cloudwatch-logs": "CloudWatch Logs",
  ec2: "EC2",
  ecr: "ECR",
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
  s3: "S3",
  secretsmanager: "Secrets Manager"
};
const SAFE_REVERSE_ENGINEERING_READ_ACTIONS = new Set<string>(
  AWS_IMPORT_READERS.flatMap((reader) => reader.actions)
);

export type ReverseEngineeringConnectionFailureClassification = {
  readonly internalCode:
    | "caller_sso_session_expired"
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
  const affectedProviderResourceTypesByService = new Map<string, Set<string>>();
  const failedAwsApiActionsByService = new Map<string, Set<string>>();

  for (const scanError of scanErrors) {
    const serviceKey = getSafeServiceKey(scanError);
    addSafeAffectedProviderResourceTypes(
      affectedProviderResourceTypesByService,
      serviceKey,
      scanError
    );
    addSafeFailedAwsApiActions(failedAwsApiActionsByService, serviceKey, scanError);
    strongestErrors.set(
      serviceKey,
      selectHigherPriorityReverseEngineeringScanError(strongestErrors.get(serviceKey), scanError)
    );
  }

  const unavailableServices = [...strongestErrors].map(([serviceKey, scanError]) => {
    const reason = getPublicCoverageReason(scanError.reason);
    const affectedProviderResourceTypes = getAffectedProviderResourceTypes(
      affectedProviderResourceTypesByService,
      serviceKey
    );
    const failedAwsApiActions = getFailedAwsApiActions(failedAwsApiActionsByService, serviceKey);
    return {
      serviceKey,
      displayName: SERVICE_DISPLAY_NAMES[serviceKey] ?? "AWS 서비스",
      reason,
      remedy: reason === "permission_required" ? ("open_settings" as const) : ("retry" as const),
      ...(affectedProviderResourceTypes.length > 0 ? { affectedProviderResourceTypes } : {}),
      ...(failedAwsApiActions.length > 0 ? { failedAwsApiActions } : {})
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
  const affectedProviderResourceTypesByService = new Map<string, Set<string>>();
  const failedAwsApiActionsByService = new Map<string, Set<string>>();

  for (const scanError of scanErrors) {
    const serviceKey = getSafeServiceKey(scanError);
    addSafeAffectedProviderResourceTypes(
      affectedProviderResourceTypesByService,
      serviceKey,
      scanError
    );
    addSafeFailedAwsApiActions(failedAwsApiActionsByService, serviceKey, scanError);
    strongestErrors.set(
      serviceKey,
      selectHigherPriorityReverseEngineeringScanError(strongestErrors.get(serviceKey), scanError)
    );
  }

  return [...strongestErrors].map(([serviceKey, scanError]) => {
    const affectedProviderResourceTypes = getAffectedProviderResourceTypes(
      affectedProviderResourceTypesByService,
      serviceKey
    );
    const failedAwsApiActions = getFailedAwsApiActions(failedAwsApiActionsByService, serviceKey);
    return {
      id: `scan-error-service-${serviceKey}`,
      serviceKey,
      resourceType: scanError.resourceType,
      stage: "provider_api",
      reason: scanError.reason,
      message: getSafeScanErrorMessage(scanError.reason),
      retryable: scanError.reason === "throttled" || scanError.reason === "provider_error",
      ...(affectedProviderResourceTypes.length > 0 ? { affectedProviderResourceTypes } : {}),
      ...(failedAwsApiActions.length > 0 ? { failedAwsApiActions } : {})
    };
  });
}

/** gg: provider type은 AWS CloudFormation type syntax만 공개하고 ARN·식별자·원문 오류는 버립니다. */
function addSafeAffectedProviderResourceTypes(
  affectedProviderResourceTypesByService: Map<string, Set<string>>,
  serviceKey: string,
  scanError: ReverseEngineeringScanError
): void {
  const types = getSafeAffectedProviderResourceTypes(scanError);
  if (types.length === 0) return;

  const collected =
    affectedProviderResourceTypesByService.get(serviceKey) ?? new Set<string>();
  for (const providerResourceType of types) {
    collected.add(providerResourceType);
  }
  affectedProviderResourceTypesByService.set(serviceKey, collected);
}

function getAffectedProviderResourceTypes(
  affectedProviderResourceTypesByService: ReadonlyMap<string, ReadonlySet<string>>,
  serviceKey: string
): string[] {
  return [...(affectedProviderResourceTypesByService.get(serviceKey) ?? [])].sort();
}

/** gg: IAM action은 식별자·ARN 없이 권한 보완에 필요한 고정 operation 이름만 공개합니다. */
function addSafeFailedAwsApiActions(
  failedAwsApiActionsByService: Map<string, Set<string>>,
  serviceKey: string,
  scanError: ReverseEngineeringScanError
): void {
  const actions = getSafeFailedAwsApiActions(scanError);
  if (actions.length === 0) return;

  const collected = failedAwsApiActionsByService.get(serviceKey) ?? new Set<string>();
  for (const action of actions) {
    collected.add(action);
  }
  failedAwsApiActionsByService.set(serviceKey, collected);
}

function getFailedAwsApiActions(
  failedAwsApiActionsByService: ReadonlyMap<string, ReadonlySet<string>>,
  serviceKey: string
): string[] {
  return [...(failedAwsApiActionsByService.get(serviceKey) ?? [])].sort();
}

function getSafeAffectedProviderResourceTypes(scanError: ReverseEngineeringScanError): string[] {
  return [
    ...new Set(
      (scanError.affectedProviderResourceTypes ?? []).filter(isSafeAwsProviderResourceType)
    )
  ].sort();
}

function isSafeAwsProviderResourceType(value: string): boolean {
  return /^AWS::[A-Za-z0-9]{1,64}::[A-Za-z0-9]{1,64}$/u.test(value);
}

function getSafeFailedAwsApiActions(scanError: ReverseEngineeringScanError): string[] {
  return [
    ...new Set(
      (scanError.failedAwsApiActions ?? []).filter((action) =>
        SAFE_REVERSE_ENGINEERING_READ_ACTIONS.has(action)
      )
    )
  ].sort();
}

/** gg: 서버 자격 증명 문제와 고객 Role 문제를 서로 다른 안전한 다음 행동으로 분리합니다. */
export function classifyReverseEngineeringConnectionFailure(
  error: unknown
): ReverseEngineeringConnectionFailureClassification {
  const errorName = error instanceof Error ? error.name.toLowerCase() : "";
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (
    errorName === "ssoproviderinvalidtoken" ||
    errorName === "ssocredentialprovidererror" ||
    message.includes("aws sso credentials") ||
    message.includes("credentials from sso") ||
    message.includes("aws sso 로그인") ||
    message.includes("sso session") ||
    message.includes("sso token") ||
    message.includes(".aws/sso/cache")
  ) {
    return {
      internalCode: "caller_sso_session_expired",
      publicReason: "retry",
      publicMessage:
        "AWS SSO 로그인이 만료되었습니다. 터미널에서 aws sso login을 실행한 뒤 다시 시도해 주세요."
    };
  }

  if (
    errorName === "credentialsprovidererror" ||
    errorName === "tokenprovidererror" ||
    message.includes("aws caller credentials") ||
    message.includes("could not load credentials") ||
    message.includes("caller credentials")
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
