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
  readonly remedy: string;
};

type ReverseEngineeringScanSummaryInput = Pick<
  ReverseEngineeringScanResult,
  "architectureJson" | "discoveredResources" | "scanErrors"
>;

const SERVICE_LABELS: Readonly<Record<string, string>> = {
  "AWS::EC2::VPC": "VPC",
  "AWS::EC2::Subnet": "서브넷",
  "AWS::EC2::InternetGateway": "인터넷 게이트웨이",
  "AWS::EC2::RouteTable": "라우팅 테이블",
  "AWS::EC2::SecurityGroup": "보안 그룹",
  "AWS::EC2::Instance": "EC2 인스턴스",
  "AWS::IAM::Role": "IAM 역할",
  "AWS::Lambda::Function": "Lambda 함수",
  "AWS::ElasticLoadBalancingV2::LoadBalancer": "애플리케이션 로드 밸런서(ALB)",
  "AWS::CloudFront::Distribution": "CloudFront 배포",
  "AWS::ECS::Cluster": "ECS 클러스터",
  "AWS::ECS::Service": "ECS 서비스",
  "AWS::ECS::TaskDefinition": "ECS 작업 정의",
  "AWS::RDS::DBInstance": "RDS 데이터베이스",
  "AWS::S3::Bucket": "S3 버킷"
};

const MAX_DISPLAY_NAME_LENGTH = 42;

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
    statusLabel: getStatusLabel(displayState, hasRelationships),
    statusDescription: getStatusDescription(displayState, hasRelationships),
    regionLabel: resource.region,
    technicalIdentity: resource.providerResourceId
  };
}

export function getReverseEngineeringServiceLabel(providerResourceType: string): string {
  return SERVICE_LABELS[providerResourceType] ?? "AWS Resource";
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
    unreadableServiceCount: presentReverseEngineeringScanErrors(result.scanErrors).length
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

    presentationByService.set(key, {
      key,
      serviceName: getScanErrorServiceName(key),
      remedy: getScanErrorRemedy(scanError.reason)
    });
  }

  return [...presentationByService.values()];
}

function getScanErrorServiceKey(scanError: ReverseEngineeringScanError): string {
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
    LAMBDA: "lambda",
    LAMBDA_PERMISSION: "lambda"
  };

  return serviceByResourceType[scanError.resourceType] ?? "aws-inventory";
}

function getScanErrorServiceName(key: string): string {
  const labels: Readonly<Record<string, string>> = {
    "api-gateway": "API Gateway",
    "aws-inventory": "AWS 리소스 목록",
    cloudfront: "CloudFront",
    cloudwatch: "CloudWatch",
    "cloudwatch-logs": "CloudWatch Logs",
    ec2: "EC2",
    ecs: "ECS",
    "elastic-load-balancing": "Elastic Load Balancing",
    iam: "IAM",
    kms: "KMS",
    lambda: "Lambda",
    rds: "RDS",
    "resource-explorer": "Resource Explorer",
    "resource-groups-tagging": "Resource Groups Tagging API",
    s3: "S3"
  };

  return labels[key] ?? "AWS 서비스";
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

function getStatusLabel(
  displayState: ReverseEngineeringDisplayState,
  hasRelationships: boolean
): string {
  if (displayState === "supported") {
    return "지원됨";
  }

  return hasRelationships ? "확인 필요" : "검토 전용";
}

function getStatusDescription(
  displayState: ReverseEngineeringDisplayState,
  hasRelationships: boolean
): string {
  if (displayState === "supported") {
    return "정식 지원 Resource로 Board와 후속 작업에 반영할 수 있습니다.";
  }

  return hasRelationships
    ? "관계를 확인한 뒤 수동으로 반영할 수 있습니다."
    : "정식 지원 전까지 검토용으로만 표시합니다.";
}
