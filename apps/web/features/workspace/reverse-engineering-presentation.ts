import type {
  DiscoveredResource,
  ReverseEngineeringScanError,
  ReverseEngineeringScanResult
} from "@sketchcatch/types";

export type ReverseEngineeringDisplayState = "supported" | "review_only";

export type ReverseEngineeringResourcePresentation = {
  readonly displayState: ReverseEngineeringDisplayState;
  readonly displayName: string;
  readonly serviceLabel: string;
  readonly statusLabel: string;
  readonly statusDescription: string;
  readonly regionLabel: string;
  readonly technicalIdentity: string;
};

export type ReverseEngineeringScanSummary = {
  readonly discoveredCount: number;
  readonly boardCount: number;
  readonly reviewOnlyCount: number;
  readonly unreadableServiceCount: number;
};

export type ReverseEngineeringScanErrorPresentation = {
  readonly key: string;
  readonly serviceName: string;
  readonly causeLabel: string;
  readonly remedy: string;
  readonly affectedProviderResourceTypes?: readonly string[];
  readonly failedAwsApiActions?: readonly string[];
};

type ReverseEngineeringScanSummaryInput = Pick<
  ReverseEngineeringScanResult,
  "architectureJson" | "coverage" | "discoveredResources" | "scanErrors"
>;

const SERVICE_LABELS: Readonly<Record<string, string>> = {
  "AWS::ApiGateway::RestApi": "API Gateway API",
  "AWS::CloudWatch::Alarm": "CloudWatch 알람",
  "AWS::EC2::VPC": "VPC",
  "AWS::EC2::Subnet": "서브넷",
  "AWS::EC2::Image": "AMI 이미지",
  "AWS::EC2::InternetGateway": "인터넷 게이트웨이",
  "AWS::EC2::EIP": "고정 공인 IP",
  "AWS::EC2::NatGateway": "NAT 게이트웨이",
  "AWS::EC2::RouteTable": "라우팅 테이블",
  "AWS::EC2::RouteTableAssociation": "서브넷 경로 연결",
  "AWS::EC2::SubnetRouteTableAssociation": "서브넷 경로 연결",
  "AWS::EC2::SecurityGroup": "보안 그룹",
  "AWS::EC2::Instance": "EC2 인스턴스",
  "AWS::Events::Rule": "EventBridge 규칙",
  "AWS::IAM::InstanceProfile": "IAM 인스턴스 프로필",
  "AWS::IAM::Policy": "IAM 정책",
  "AWS::IAM::Role": "IAM 역할",
  "AWS::KMS::Key": "KMS 암호화 키",
  "AWS::Lambda::Function": "Lambda 함수",
  "AWS::Lambda::Permission": "Lambda 호출 권한",
  "AWS::Logs::LogGroup": "CloudWatch 로그 그룹",
  "AWS::ElasticLoadBalancingV2::LoadBalancer": "애플리케이션 로드 밸런서(ALB)",
  "AWS::ElasticLoadBalancingV2::TargetGroup": "로드 밸런서 대상 그룹",
  "AWS::ElasticLoadBalancingV2::Listener": "로드 밸런서 요청 연결",
  "AWS::CloudFront::Distribution": "CloudFront 배포",
  "AWS::ECR::Repository": "컨테이너 이미지 저장소",
  "AWS::SecretsManager::Secret": "보안 값 저장소",
  "AWS::ApplicationAutoScaling::ScalableTarget": "자동 확장 범위",
  "AWS::ApplicationAutoScaling::ScalingPolicy": "자동 확장 기준",
  "AWS::ECS::Cluster": "ECS 클러스터",
  "AWS::ECS::Service": "ECS 서비스",
  "AWS::ECS::TaskDefinition": "ECS 작업 정의",
  "AWS::RDS::DBInstance": "RDS 데이터베이스",
  "AWS::S3::Bucket": "S3 버킷"
};

const MAX_DISPLAY_NAME_LENGTH = 42;
const SCAN_ERROR_SERVICE_NAMES: Readonly<Record<string, string>> = {
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
const SAFE_REVERSE_ENGINEERING_READ_ACTION_PREFIXES = [
  "apigateway:",
  "application-autoscaling:",
  "cloudformation:",
  "cloudfront:",
  "cloudwatch:",
  "ec2:",
  "ecr:",
  "ecs:",
  "elasticloadbalancing:",
  "events:",
  "iam:",
  "kms:",
  "lambda:",
  "logs:",
  "rds:",
  "resource-explorer-2:",
  "s3:",
  "secretsmanager:",
  "tag:"
] as const;

export function presentReverseEngineeringResource(
  resource: DiscoveredResource
): ReverseEngineeringResourcePresentation {
  const displayState =
    resource.resourceType === "UNKNOWN" || resource.analysisExcluded ? "review_only" : "supported";
  const hasRelationships = (resource.relationships?.length ?? 0) > 0;
  const serviceLabel = getReverseEngineeringServiceLabel(resource.providerResourceType);

  return {
    displayState,
    displayName: getDisplayName(resource, serviceLabel),
    serviceLabel,
    statusLabel: getStatusLabel(resource, displayState),
    statusDescription: getStatusDescription(resource, displayState, hasRelationships),
    regionLabel: resource.region,
    technicalIdentity: resource.providerResourceId
  };
}

export function getReverseEngineeringServiceLabel(providerResourceType: string): string {
  return SERVICE_LABELS[providerResourceType] ?? getReadableAwsProviderTypeLabel(providerResourceType);
}

// 팔레트에 아직 없는 종류도 원문을 버리지 않고 사람이 먼저 이해할 수 있는 이름으로 보여줍니다.
export function getReverseEngineeringProviderTypeLabel(providerResourceType: string): string {
  return SERVICE_LABELS[providerResourceType] ?? getReadableAwsProviderTypeLabel(providerResourceType);
}

export function summarizeReverseEngineeringScan(
  result: ReverseEngineeringScanSummaryInput
): ReverseEngineeringScanSummary {
  return {
    discoveredCount: result.discoveredResources.length,
    boardCount: result.architectureJson.nodes.length,
    reviewOnlyCount: result.discoveredResources.filter(
      (resource) => presentReverseEngineeringResource(resource).displayState === "review_only"
    ).length,
    unreadableServiceCount:
      result.coverage?.unavailableServices.length ??
      presentReverseEngineeringScanErrors(result.scanErrors).length
  };
}

// 내부 AWS 오류 대신 서비스 이름과 사용자가 바로 할 수 있는 짧은 해결 방법만 남깁니다.
export function presentReverseEngineeringScanErrors(
  scanErrors: readonly ReverseEngineeringScanError[]
): ReverseEngineeringScanErrorPresentation[] {
  const presentationByService = new Map<string, ReverseEngineeringScanErrorPresentation>();

  for (const scanError of scanErrors) {
    const key = getScanErrorServiceKey(scanError);

    if (presentationByService.has(key)) {
      continue;
    }

    const affectedProviderResourceTypes = getSafeAffectedProviderResourceTypes(scanError);
    const failedAwsApiActions = getSafeFailedAwsApiActions(scanError);
    presentationByService.set(key, {
      key,
      serviceName: getScanErrorServiceName(key),
      causeLabel: getScanErrorCauseLabel(scanError.reason),
      remedy: getScanErrorRemedy(scanError.reason),
      ...(affectedProviderResourceTypes.length > 0 ? { affectedProviderResourceTypes } : {}),
      ...(failedAwsApiActions.length > 0 ? { failedAwsApiActions } : {})
    });
  }

  return [...presentationByService.values()];
}

/** gg: API contract 밖의 ARN·식별자는 상세 오류에서도 보여주지 않습니다. */
function getSafeAffectedProviderResourceTypes(
  scanError: ReverseEngineeringScanError
): string[] {
  return [
    ...new Set(
      (scanError.affectedProviderResourceTypes ?? []).filter((providerResourceType) =>
        /^AWS::[A-Za-z0-9]{1,64}::[A-Za-z0-9]{1,64}$/u.test(providerResourceType)
      )
    )
  ].sort();
}

function getSafeFailedAwsApiActions(scanError: ReverseEngineeringScanError): string[] {
  return [
    ...new Set(
      (scanError.failedAwsApiActions ?? []).filter((action) =>
        SAFE_REVERSE_ENGINEERING_READ_ACTION_PREFIXES.some((prefix) =>
          action.startsWith(prefix)
        ) && /^[a-z0-9][a-z0-9-]{0,63}:[A-Za-z][A-Za-z0-9]{0,127}$/u.test(action)
      )
    )
  ].sort();
}

// gg: 새 응답의 allowlisted serviceKey를 우선하고 과거 저장 결과는 기존 ID/type으로 보정합니다.
function getScanErrorServiceKey(scanError: ReverseEngineeringScanError): string {
  const explicitServiceKey = scanError.serviceKey?.trim().toLowerCase();
  if (
    explicitServiceKey &&
    Object.prototype.hasOwnProperty.call(SCAN_ERROR_SERVICE_NAMES, explicitServiceKey)
  ) {
    return explicitServiceKey;
  }

  const serviceIdMatch = /^scan-error-service-([a-z0-9-]+)$/u.exec(scanError.id);

  if (serviceIdMatch?.[1]) {
    return serviceIdMatch[1];
  }

  if (scanError.id === "scan-error-resource-explorer") {
    return "resource-explorer";
  }

  const serviceByResourceType: Readonly<Record<string, string>> = {
    VPC: "ec2",
    SUBNET: "ec2",
    INTERNET_GATEWAY: "ec2",
    ROUTE_TABLE: "ec2",
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
    API_GATEWAY_REST_API: "api-gateway",
    APPLICATION_AUTO_SCALING_TARGET: "application-autoscaling",
    APPLICATION_AUTO_SCALING_POLICY: "application-autoscaling",
    ECR_REPOSITORY: "ecr",
    EVENT_RULE: "eventbridge",
    LAMBDA: "lambda",
    LAMBDA_PERMISSION: "lambda",
    SECRETS_MANAGER_SECRET: "secretsmanager"
  };

  return serviceByResourceType[scanError.resourceType] ?? "aws-inventory";
}

// gg: 공개 목록에 없는 식별자는 기술 이름 대신 일반 AWS 서비스로 표시합니다.
function getScanErrorServiceName(key: string): string {
  return SCAN_ERROR_SERVICE_NAMES[key] ?? "AWS 서비스";
}

function getScanErrorCauseLabel(reason: ReverseEngineeringScanError["reason"]): string {
  if (reason === "permission_denied") {
    return "권한 부족";
  }

  if (reason === "not_configured") {
    return "서비스 준비 필요";
  }

  if (reason === "invalid_region") {
    return "리전 설정 오류";
  }

  if (reason === "expired_credential") {
    return "AWS 연결 만료";
  }

  if (reason === "throttled") {
    return "AWS 요청 제한";
  }

  if (reason === "provider_error") {
    return "AWS 서비스 일시 오류";
  }

  return "원인 확인 필요";
}

function getScanErrorRemedy(reason: ReverseEngineeringScanError["reason"]): string {
  if (reason === "permission_denied") {
    return "가져오기 권한을 추가한 뒤 다시 시도해 주세요.";
  }

  if (reason === "expired_credential") {
    return "AWS 연결을 다시 확인한 뒤 시도해 주세요.";
  }

  if (reason === "invalid_region") {
    return "AWS 연결 리전을 확인한 뒤 시도해 주세요.";
  }

  return "잠시 후 다시 시도해 주세요.";
}

function getDisplayName(resource: DiscoveredResource, serviceLabel: string): string {
  const displayName = resource.displayName.trim();

  return isHumanDisplayName(displayName, resource.providerResourceId)
    ? displayName
    : getFallbackDisplayName(resource.providerResourceId, serviceLabel);
}

function isHumanDisplayName(displayName: string, providerResourceId: string): boolean {
  return (
    displayName.length > 0 &&
    displayName.length <= MAX_DISPLAY_NAME_LENGTH &&
    !displayName.startsWith("arn:") &&
    !displayName.startsWith("resource-") &&
    displayName !== providerResourceId
  );
}

function getFallbackDisplayName(providerResourceId: string, serviceLabel: string): string {
  if (!providerResourceId.startsWith("arn:")) {
    return `이름 미확인 ${serviceLabel}`;
  }

  const arnResource = providerResourceId.split(":").slice(5).join(":");
  const arnResourceName = arnResource.split(/[/:]/).filter(Boolean).at(-1);

  return arnResourceName ? shortenDisplayName(arnResourceName) : `이름 미확인 ${serviceLabel}`;
}

function shortenDisplayName(displayName: string): string {
  return displayName.length <= MAX_DISPLAY_NAME_LENGTH
    ? displayName
    : `${displayName.slice(0, MAX_DISPLAY_NAME_LENGTH - 1)}…`;
}

function getReadableAwsProviderTypeLabel(providerResourceType: string): string {
  const match = /^AWS::([^:]+)::([^:]+)$/u.exec(providerResourceType);

  if (!match) {
    return "기타 AWS 리소스";
  }

  const serviceName = match[1] ?? "";
  const resourceName = match[2] ?? "";
  return `${splitAwsTypeWords(serviceName)} ${splitAwsTypeWords(resourceName)}`.trim();
}

function splitAwsTypeWords(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/gu, "$1 $2")
    .replace(/([a-z])([0-9]+)/gu, "$1 $2")
    .replace(/V2$/u, " V2")
    .trim();
}

function getStatusLabel(
  resource: DiscoveredResource,
  displayState: ReverseEngineeringDisplayState
): string {
  if (displayState === "supported") {
    return "구조 확인 가능";
  }

  return resource.importSuggestionStatus === "manual_review"
    ? "추가 확인 필요"
    : "보드에서만 확인";
}

function getStatusDescription(
  resource: DiscoveredResource,
  displayState: ReverseEngineeringDisplayState,
  hasRelationships: boolean
): string {
  if (displayState === "supported") {
    return "AWS에서 읽은 구조와 연결을 보드에서 확인할 수 있습니다. 이 화면은 AWS 리소스를 변경하지 않습니다.";
  }

  if (resource.importSuggestionStatus === "manual_review") {
    return "AWS에서 읽은 정보가 일부 부족하거나 자동으로 해석하기 어려운 리소스입니다. 원본 정보를 확인한 뒤 보드에서 검토하세요.";
  }

  return hasRelationships
    ? "보드에서 위치와 연결 관계를 확인할 수 있습니다. 이 화면에서는 코드 생성이나 AWS 변경을 하지 않습니다."
    : "보드에서 위치를 확인할 수 있습니다. 이 화면에서는 코드 생성이나 AWS 변경을 하지 않습니다.";
}
