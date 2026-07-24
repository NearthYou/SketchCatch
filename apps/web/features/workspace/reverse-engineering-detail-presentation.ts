import type {
  DiscoveredResource,
  ResourceType,
  ReverseEngineeringScanError,
  ReverseEngineeringScanResult
} from "@sketchcatch/types";

export type ReverseEngineeringResourceDisplayState = "supported" | "review_only";

export type ReverseEngineeringResourceManagementState =
  | "ready"
  | "confirmation_required"
  | "not_supported";

export type ReverseEngineeringResourcePresentation = {
  readonly displayName: string;
  readonly displayState: ReverseEngineeringResourceDisplayState;
  readonly managementState: ReverseEngineeringResourceManagementState;
  readonly managementLabel: string;
  readonly resourceKindLabel: string;
  readonly serviceLabel: string;
  readonly sourceProviderType: string;
  readonly statusDescription: string;
  readonly statusLabel: string;
};

export type ReverseEngineeringScanErrorAction = "open_settings" | "retry" | "none";

export type ReverseEngineeringScanErrorPresentation = {
  readonly action: ReverseEngineeringScanErrorAction;
  readonly affectedProviderResourceTypes: readonly string[];
  readonly causeLabel: string;
  readonly key: string;
  readonly remedy: string;
  readonly serviceLabel: string;
};

export type ReverseEngineeringScanSummary = {
  readonly boardCount: number;
  readonly discoveredCount: number;
  readonly reviewOnlyCount: number;
  readonly unreadableServiceCount: number;
};

type ReverseEngineeringScanSummaryInput = Pick<
  ReverseEngineeringScanResult,
  "architectureJson" | "coverage" | "discoveredResources" | "scanErrors"
>;

const MAX_DISPLAY_NAME_LENGTH = 64;

const AWS_SERVICE_LABELS: Readonly<Record<string, string>> = {
  APIGateway: "API Gateway",
  ApiGateway: "API Gateway",
  ApiGatewayV2: "API Gateway",
  ApplicationAutoScaling: "Application Auto Scaling",
  AutoScaling: "Auto Scaling",
  CertificateManager: "Certificate Manager",
  CloudFormation: "CloudFormation",
  CloudFront: "CloudFront",
  CloudTrail: "CloudTrail",
  CloudWatch: "CloudWatch",
  CodeBuild: "CodeBuild",
  CodeDeploy: "CodeDeploy",
  CodePipeline: "CodePipeline",
  CodeStar: "CodeStar",
  Cognito: "Cognito",
  Config: "AWS Config",
  DynamoDB: "DynamoDB",
  EC2: "EC2",
  ECR: "ECR",
  ECS: "ECS",
  EFS: "EFS",
  EKS: "EKS",
  ElastiCache: "ElastiCache",
  ElasticLoadBalancing: "Elastic Load Balancing",
  ElasticLoadBalancingV2: "Elastic Load Balancing",
  Events: "EventBridge",
  IAM: "IAM",
  KMS: "KMS",
  Lambda: "Lambda",
  Logs: "CloudWatch Logs",
  RDS: "RDS",
  ResourceExplorer2: "Resource Explorer",
  Route53: "Route 53",
  S3: "S3",
  Scheduler: "EventBridge Scheduler",
  SecretsManager: "Secrets Manager",
  SNS: "SNS",
  SQS: "SQS",
  SSM: "Systems Manager",
  StepFunctions: "Step Functions",
  WAF: "WAF",
  WAFv2: "WAF"
};

const PROVIDER_RESOURCE_KIND_LABELS: Readonly<Record<string, string>> = {
  "AWS::ApiGateway::RestApi": "REST API",
  "AWS::CloudFormation::Stack": "스택",
  "AWS::CloudFront::Distribution": "배포",
  "AWS::CloudWatch::Alarm": "알람",
  "AWS::DynamoDB::Table": "테이블",
  "AWS::EC2::EIP": "고정 공인 IP",
  "AWS::EC2::Image": "AMI 이미지",
  "AWS::EC2::Instance": "인스턴스",
  "AWS::EC2::InternetGateway": "인터넷 게이트웨이",
  "AWS::EC2::NatGateway": "NAT 게이트웨이",
  "AWS::EC2::NetworkInterface": "네트워크 인터페이스",
  "AWS::EC2::RouteTable": "라우팅 테이블",
  "AWS::EC2::RouteTableAssociation": "라우팅 테이블 연결",
  "AWS::EC2::SecurityGroup": "보안 그룹",
  "AWS::EC2::Subnet": "서브넷",
  "AWS::EC2::VPC": "VPC",
  "AWS::ECS::Cluster": "클러스터",
  "AWS::ECS::Service": "서비스",
  "AWS::ECS::TaskDefinition": "작업 정의",
  "AWS::ElasticLoadBalancingV2::Listener": "리스너",
  "AWS::ElasticLoadBalancingV2::LoadBalancer": "로드 밸런서",
  "AWS::ElasticLoadBalancingV2::TargetGroup": "대상 그룹",
  "AWS::Events::Rule": "규칙",
  "AWS::IAM::InstanceProfile": "인스턴스 프로필",
  "AWS::IAM::Policy": "정책",
  "AWS::IAM::Role": "역할",
  "AWS::KMS::Key": "암호화 키",
  "AWS::Lambda::Function": "함수",
  "AWS::Lambda::Permission": "호출 권한",
  "AWS::Logs::LogGroup": "로그 그룹",
  "AWS::RDS::DBCluster": "DB 클러스터",
  "AWS::RDS::DBInstance": "데이터베이스",
  "AWS::S3::Bucket": "버킷",
  "AWS::SecretsManager::Secret": "보안 값"
};

const INVENTORY_TYPE_LABELS: Readonly<Record<string, string>> = {
  "ec2:eip-allocation": "EC2 고정 공인 IP",
  "ec2:elastic-ip": "EC2 고정 공인 IP",
  "rds:og": "RDS 옵션 그룹",
  "rds:pg": "RDS 파라미터 그룹",
  "rds:subgrp": "RDS 서브넷 그룹"
};

const SCAN_ERROR_SERVICE_LABELS: Readonly<Record<string, string>> = {
  "api-gateway": "API Gateway",
  "application-autoscaling": "Application Auto Scaling",
  "aws-inventory": "AWS 리소스 목록",
  cloudformation: "CloudFormation",
  "cloud-control": "Cloud Control",
  "cloud-control-capability": "Cloud Control 목록 조회",
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

const RESOURCE_TYPE_SERVICE_KEYS: Readonly<Partial<Record<ResourceType, string>>> = {
  ACM_CERTIFICATE: "cloudformation",
  ACM_CERTIFICATE_VALIDATION: "cloudformation",
  AMI: "ec2",
  API_GATEWAY_AUTHORIZER: "api-gateway",
  API_GATEWAY_DEPLOYMENT: "api-gateway",
  API_GATEWAY_INTEGRATION: "api-gateway",
  API_GATEWAY_METHOD: "api-gateway",
  API_GATEWAY_RESOURCE: "api-gateway",
  API_GATEWAY_REST_API: "api-gateway",
  API_GATEWAY_STAGE: "api-gateway",
  API_GATEWAY_V2_INTEGRATION: "api-gateway",
  API_GATEWAY_V2_ROUTE: "api-gateway",
  API_GATEWAY_V2_STAGE: "api-gateway",
  API_GATEWAY_WEBSOCKET_API: "api-gateway",
  APPLICATION_AUTO_SCALING_POLICY: "application-autoscaling",
  APPLICATION_AUTO_SCALING_TARGET: "application-autoscaling",
  CLOUDWATCH_LOG_GROUP: "cloudwatch-logs",
  CLOUDWATCH_METRIC_ALARM: "cloudwatch",
  CLOUDFRONT: "cloudfront",
  EC2: "ec2",
  ECR_REPOSITORY: "ecr",
  ECS_CLUSTER: "ecs",
  ECS_SERVICE: "ecs",
  ECS_TASK_DEFINITION: "ecs",
  IAM_INSTANCE_PROFILE: "iam",
  IAM_POLICY: "iam",
  IAM_ROLE: "iam",
  KMS_KEY: "kms",
  LAMBDA: "lambda",
  LAMBDA_PERMISSION: "lambda",
  LOAD_BALANCER: "elastic-load-balancing",
  RDS: "rds",
  RDS_CLUSTER: "rds",
  RDS_CLUSTER_INSTANCE: "rds",
  RDS_READ_REPLICA: "rds",
  S3: "s3",
  SECRETS_MANAGER_SECRET: "secretsmanager",
  SECURITY_GROUP: "ec2",
  SUBNET: "ec2",
  VPC: "ec2"
};

/** gg: AWS 원본은 보존하되 기본 상세 화면에는 사람이 읽기 쉬운 이름만 제공합니다. */
export function presentReverseEngineeringResource(
  resource: DiscoveredResource
): ReverseEngineeringResourcePresentation {
  const managementState = getResourceManagementState(resource);
  const displayState = managementState === "ready" ? "supported" : "review_only";
  const serviceLabel = getReverseEngineeringServiceLabel(resource.providerResourceType);
  const resourceKindLabel = getReverseEngineeringResourceKindLabel(resource.providerResourceType);

  return {
    displayName: getSafeDisplayName(resource, resourceKindLabel),
    displayState,
    managementState,
    managementLabel: getManagementLabel(managementState),
    resourceKindLabel,
    serviceLabel,
    sourceProviderType: resource.providerResourceType,
    statusDescription: getResourceStatusDescription(managementState),
    statusLabel: getResourceStatusLabel(managementState)
  };
}

/** gg: AWS 서비스 이름은 원본 type 표기 대신 짧은 서비스명으로 표시합니다. */
export function getReverseEngineeringServiceLabel(providerResourceType: string): string {
  const cloudFormationType = /^AWS::([^:]+)::[^:]+$/u.exec(providerResourceType);

  if (cloudFormationType?.[1]) {
    return AWS_SERVICE_LABELS[cloudFormationType[1]] ?? splitAwsTypeWords(cloudFormationType[1]);
  }

  return INVENTORY_TYPE_LABELS[providerResourceType]?.split(" ")[0] ?? "AWS";
}

/** gg: 원본 provider type을 복사하지 않아도 리소스 종류를 알아볼 수 있게 만듭니다. */
export function getReverseEngineeringResourceKindLabel(providerResourceType: string): string {
  if (PROVIDER_RESOURCE_KIND_LABELS[providerResourceType]) {
    return PROVIDER_RESOURCE_KIND_LABELS[providerResourceType];
  }

  if (INVENTORY_TYPE_LABELS[providerResourceType]) {
    return INVENTORY_TYPE_LABELS[providerResourceType];
  }

  const cloudFormationType = /^AWS::[^:]+::([^:]+)$/u.exec(providerResourceType);
  return cloudFormationType?.[1] ? splitAwsTypeWords(cloudFormationType[1]) : "기타 AWS 리소스";
}

/** gg: 서비스와 종류를 함께 써야 하는 짧은 화면에서는 친숙한 한 줄 이름을 반환합니다. */
export function getReverseEngineeringProviderTypeLabel(providerResourceType: string): string {
  const serviceLabel = getReverseEngineeringServiceLabel(providerResourceType);
  const resourceKindLabel = getReverseEngineeringResourceKindLabel(providerResourceType);

  return resourceKindLabel === "기타 AWS 리소스"
    ? resourceKindLabel
    : `${serviceLabel} ${resourceKindLabel}`;
}

/** gg: 내부 enum도 상세 검색과 보조 설명에서 사람이 읽을 수 있게 바꿉니다. */
export function getReverseEngineeringResourceTypeLabel(resourceType: ResourceType): string {
  if (resourceType === "UNKNOWN") {
    return "기타 AWS 리소스";
  }

  return resourceType
    .toLocaleLowerCase("en-US")
    .split("_")
    .map((word) => (word === "ec2" || word === "rds" || word === "s3" ? word.toUpperCase() : word))
    .join(" ");
}

/** gg: 오류 원문을 노출하지 않고 서비스·원인·다음 행동만 요약합니다. */
export function presentReverseEngineeringScanErrors(
  scanErrors: readonly ReverseEngineeringScanError[]
): readonly ReverseEngineeringScanErrorPresentation[] {
  const presentationByService = new Map<string, ReverseEngineeringScanErrorPresentation>();

  for (const scanError of scanErrors) {
    const key = getScanErrorServiceKey(scanError);
    const nextPresentation = createScanErrorPresentation(scanError, key);
    const currentPresentation = presentationByService.get(key);

    if (!currentPresentation || getScanErrorPriority(scanError.reason) > getPresentationPriority(currentPresentation)) {
      presentationByService.set(key, nextPresentation);
    }
  }

  return [...presentationByService.values()].sort((left, right) =>
    left.serviceLabel.localeCompare(right.serviceLabel, "ko-KR")
  );
}

/** gg: 결과 요약은 읽은 구조와 읽지 못한 범위를 같은 숫자로 섞지 않습니다. */
export function summarizeReverseEngineeringScan(
  result: ReverseEngineeringScanSummaryInput
): ReverseEngineeringScanSummary {
  return {
    boardCount: result.architectureJson.nodes.length,
    discoveredCount: result.discoveredResources.length,
    reviewOnlyCount: result.discoveredResources.filter(
      (resource) => presentReverseEngineeringResource(resource).displayState === "review_only"
    ).length,
    unreadableServiceCount:
      result.coverage?.unavailableServices.length ?? presentReverseEngineeringScanErrors(result.scanErrors).length
  };
}

/** gg: 관리 대상으로 바로 검토할 수 있는지와 원본 확인이 필요한지를 안전하게 나눕니다. */
function getResourceManagementState(
  resource: DiscoveredResource
): ReverseEngineeringResourceManagementState {
  if (resource.importSuggestionStatus === "unsupported_resource_type") {
    return "not_supported";
  }

  if (
    resource.resourceType === "UNKNOWN" ||
    resource.analysisExcluded ||
    resource.importSuggestionStatus === "manual_review"
  ) {
    return "confirmation_required";
  }

  return "ready";
}

/** gg: 관리 상태 문구는 Terraform 실행과 AWS 변경을 약속하지 않도록 제한합니다. */
function getManagementLabel(state: ReverseEngineeringResourceManagementState): string {
  if (state === "ready") {
    return "관리 대상 검토 가능";
  }

  if (state === "confirmation_required") {
    return "확인 필요";
  }

  return "보드에서만 확인";
}

/** gg: 리소스 상태는 보드에서 가능한 다음 행동만 짧게 설명합니다. */
function getResourceStatusLabel(state: ReverseEngineeringResourceManagementState): string {
  if (state === "ready") {
    return "구조 확인 가능";
  }

  return state === "confirmation_required" ? "추가 확인 필요" : "보드에서만 확인";
}

/** gg: 상세 설명은 스캔 결과가 AWS를 바꾸지 않는다는 안전 경계를 유지합니다. */
function getResourceStatusDescription(state: ReverseEngineeringResourceManagementState): string {
  if (state === "ready") {
    return "AWS에서 읽은 구조와 연결을 보드에서 확인할 수 있습니다. 이 화면은 AWS 리소스를 변경하지 않습니다.";
  }

  if (state === "confirmation_required") {
    return "읽은 정보가 일부 부족하거나 자동 해석이 어려운 리소스입니다. 원본 정보를 확인한 뒤 관리 대상으로 검토하세요.";
  }

  return "이 리소스는 보드에서 구조를 확인할 수 있지만, 자동 관리 대상으로 전환하지 않습니다.";
}

/** gg: ARN이나 내부 ID만 들어온 이름은 기본 목록에 그대로 드러내지 않습니다. */
function getSafeDisplayName(resource: DiscoveredResource, resourceKindLabel: string): string {
  const displayName = resource.displayName.trim();

  if (isHumanReadableDisplayName(displayName, resource.providerResourceId)) {
    return shortenDisplayName(displayName);
  }

  const arnName = getArnResourceName(resource.providerResourceId);
  return arnName ? shortenDisplayName(arnName) : `이름 미확인 ${resourceKindLabel}`;
}

/** gg: 평범한 리소스 이름은 유지하고 길거나 식별자 형태인 값만 감춥니다. */
function isHumanReadableDisplayName(displayName: string, providerResourceId: string): boolean {
  return (
    displayName.length > 0 &&
    displayName !== providerResourceId &&
    !displayName.startsWith("arn:") &&
    !displayName.startsWith("resource-") &&
    !looksLikeOpaqueIdentifier(displayName)
  );
}

/** gg: AWS ARN의 마지막 리소스 이름만 기본 화면에 사용합니다. */
function getArnResourceName(providerResourceId: string): string | null {
  if (!providerResourceId.startsWith("arn:")) {
    return null;
  }

  return providerResourceId
    .split(":")
    .slice(5)
    .join(":")
    .split(/[/:]/u)
    .filter(Boolean)
    .at(-1) ?? null;
}

/** gg: UUID와 긴 해시처럼 사람이 읽기 어려운 값은 이름으로 오인하지 않습니다. */
function looksLikeOpaqueIdentifier(value: string): boolean {
  return (
    /^[a-f0-9]{20,}$/iu.test(value) ||
    /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(value)
  );
}

/** gg: 긴 이름은 목록 레이아웃을 깨지 않도록 끝만 줄입니다. */
function shortenDisplayName(value: string): string {
  return value.length <= MAX_DISPLAY_NAME_LENGTH
    ? value
    : `${value.slice(0, MAX_DISPLAY_NAME_LENGTH - 1)}…`;
}

/** gg: CloudFormation 표기를 공백이 있는 일반 이름으로 바꿉니다. */
function splitAwsTypeWords(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/gu, "$1 $2")
    .replace(/([a-z])([0-9]+)/gu, "$1 $2")
    .replace(/V2$/u, " V2")
    .trim();
}

/** gg: 저장된 과거 결과까지 같은 서비스 그룹으로 합치기 위한 안전한 키를 고릅니다. */
function getScanErrorServiceKey(scanError: ReverseEngineeringScanError): string {
  const explicitKey = scanError.serviceKey?.trim().toLocaleLowerCase("en-US");

  if (explicitKey && Object.hasOwn(SCAN_ERROR_SERVICE_LABELS, explicitKey)) {
    return explicitKey;
  }

  const legacyServiceKey = /^scan-error-service-([a-z0-9-]+)$/u.exec(scanError.id)?.[1];

  if (legacyServiceKey && Object.hasOwn(SCAN_ERROR_SERVICE_LABELS, legacyServiceKey)) {
    return legacyServiceKey;
  }

  return RESOURCE_TYPE_SERVICE_KEYS[scanError.resourceType] ?? "aws-inventory";
}

/** gg: 화면이 필요한 최소 오류 정보만 안전한 값으로 만듭니다. */
function createScanErrorPresentation(
  scanError: ReverseEngineeringScanError,
  key: string
): ReverseEngineeringScanErrorPresentation {
  return {
    action: getScanErrorAction(scanError),
    affectedProviderResourceTypes: getSafeAffectedProviderResourceTypes(scanError),
    causeLabel: getScanErrorCauseLabel(scanError.reason),
    key,
    remedy: getScanErrorRemedy(scanError.reason),
    serviceLabel: SCAN_ERROR_SERVICE_LABELS[key] ?? "AWS 서비스"
  };
}

/** gg: 예외 메시지에 섞일 수 있는 식별자 대신 정해진 AWS type 표기만 통과시킵니다. */
function getSafeAffectedProviderResourceTypes(
  scanError: ReverseEngineeringScanError
): readonly string[] {
  return [
    ...new Set(
      (scanError.affectedProviderResourceTypes ?? []).filter((providerResourceType) =>
        /^AWS::[A-Za-z0-9]{1,64}::[A-Za-z0-9]{1,128}$/u.test(providerResourceType)
      )
    )
  ].sort();
}

/** gg: 권한·연결·일시 오류마다 사용자가 갈 수 있는 다음 행동을 분리합니다. */
function getScanErrorAction(scanError: ReverseEngineeringScanError): ReverseEngineeringScanErrorAction {
  if (
    scanError.reason === "permission_denied" ||
    scanError.reason === "not_configured" ||
    scanError.reason === "invalid_region" ||
    scanError.reason === "expired_credential"
  ) {
    return "open_settings";
  }

  return scanError.retryable || scanError.reason === "throttled" || scanError.reason === "provider_error"
    ? "retry"
    : "none";
}

/** gg: 화면의 원인 문구는 AWS 내부 오류 문자열 없이 고정된 표현만 씁니다. */
function getScanErrorCauseLabel(reason: ReverseEngineeringScanError["reason"]): string {
  const labels: Readonly<Record<ReverseEngineeringScanError["reason"], string>> = {
    expired_credential: "AWS 연결 만료",
    invalid_region: "리전 설정 확인 필요",
    not_configured: "연결 설정 필요",
    permission_denied: "권한 부족",
    provider_error: "AWS 서비스 일시 오류",
    throttled: "AWS 요청 제한",
    unknown: "원인 확인 필요",
    unsupported: "AWS 조회 방식 미지원"
  };

  return labels[reason];
}

/** gg: 원인별 해결 문구는 한 번에 할 수 있는 행동만 안내합니다. */
function getScanErrorRemedy(reason: ReverseEngineeringScanError["reason"]): string {
  if (reason === "permission_denied") {
    return "가져오기 권한을 확인한 뒤 다시 시도해 주세요.";
  }

  if (reason === "expired_credential" || reason === "not_configured") {
    return "AWS 연결을 확인한 뒤 다시 시도해 주세요.";
  }

  if (reason === "invalid_region") {
    return "AWS 연결의 리전을 확인한 뒤 다시 시도해 주세요.";
  }

  if (reason === "unsupported") {
    return "이 종류는 현재 조회 범위에서 읽지 못했습니다.";
  }

  return "잠시 후 다시 시도해 주세요.";
}

/** gg: 같은 서비스 오류가 여러 개일 때 사용자가 먼저 봐야 할 원인을 고릅니다. */
function getScanErrorPriority(reason: ReverseEngineeringScanError["reason"]): number {
  const priorities: Readonly<Record<ReverseEngineeringScanError["reason"], number>> = {
    expired_credential: 6,
    invalid_region: 5,
    not_configured: 7,
    permission_denied: 8,
    provider_error: 3,
    throttled: 2,
    unknown: 1,
    unsupported: 4
  };

  return priorities[reason];
}

/** gg: 이미 만든 표시 모델도 같은 우선순위로 비교할 수 있게 원인을 역으로 읽습니다. */
function getPresentationPriority(presentation: ReverseEngineeringScanErrorPresentation): number {
  const priorities: Readonly<Record<string, number>> = {
    "AWS 연결 만료": 6,
    "AWS 서비스 일시 오류": 3,
    "AWS 요청 제한": 2,
    "AWS 조회 방식 미지원": 4,
    "권한 부족": 8,
    "리전 설정 확인 필요": 5,
    "연결 설정 필요": 7,
    "원인 확인 필요": 1
  };

  return priorities[presentation.causeLabel] ?? 0;
}
