import type { DiscoveredResource, ReverseEngineeringScanResult } from "@sketchcatch/types";

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

const SERVICE_LABELS: Readonly<Record<string, string>> = {
  "AWS::EC2::VPC": "VPC",
  "AWS::EC2::Subnet": "서브넷",
  "AWS::EC2::Instance": "EC2 인스턴스",
  "AWS::IAM::Role": "IAM 역할",
  "AWS::Lambda::Function": "Lambda 함수",
  "AWS::ElasticLoadBalancingV2::LoadBalancer": "로드 밸런서",
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
  result: ReverseEngineeringScanResult
): ReverseEngineeringScanSummary {
  return {
    discoveredCount: result.discoveredResources.length,
    boardCount: result.architectureJson.nodes.length,
    reviewOnlyCount: result.discoveredResources.filter(
      (resource) => presentReverseEngineeringResource(resource).displayState === "review_only"
    ).length,
    unreadableServiceCount: new Set(result.scanErrors.map((error) => error.resourceType)).size
  };
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

  return arnResourceName
    ? shortenDisplayName(arnResourceName)
    : `이름 미확인 ${serviceLabel}`;
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
