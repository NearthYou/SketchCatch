import type { ResourceType, ReverseEngineeringResourceSelection } from "../../../../packages/types/src";

export const REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION = "ALL" satisfies ReverseEngineeringResourceSelection;

export const REVERSE_ENGINEERING_RESOURCE_TYPES: ResourceType[] = [
  "VPC",
  "SUBNET",
  "INTERNET_GATEWAY",
  "ROUTE_TABLE",
  "SECURITY_GROUP",
  "EC2",
  "RDS",
  "S3",
  "LOAD_BALANCER",
  "CLOUDFRONT",
  "ECS_CLUSTER",
  "ECS_SERVICE",
  "ECS_TASK_DEFINITION"
];

export const REVERSE_ENGINEERING_RESOURCE_SELECTIONS: ReverseEngineeringResourceSelection[] = [
  REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION,
  ...REVERSE_ENGINEERING_RESOURCE_TYPES
];

const RESOURCE_SELECTION_LABELS: Readonly<Partial<Record<ResourceType, string>>> = {
  VPC: "네트워크(VPC)",
  SUBNET: "서브넷",
  INTERNET_GATEWAY: "인터넷 게이트웨이",
  ROUTE_TABLE: "라우팅 테이블",
  SECURITY_GROUP: "보안 그룹",
  EC2: "가상 서버(EC2)",
  RDS: "데이터베이스(RDS)",
  S3: "파일 저장소(S3)",
  LOAD_BALANCER: "애플리케이션 로드 밸런서(ALB)",
  CLOUDFRONT: "콘텐츠 전송(CloudFront)",
  ECS_CLUSTER: "컨테이너 클러스터(ECS)",
  ECS_SERVICE: "컨테이너 서비스(ECS)",
  ECS_TASK_DEFINITION: "컨테이너 작업 정의(ECS)",
  UNKNOWN: "보드에만 표시하는 AWS 리소스"
};

export function formatReverseEngineeringResourceSelectionLabel(
  resourceType: ReverseEngineeringResourceSelection
): string {
  return resourceType === REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION
    ? "전체"
    : formatReverseEngineeringResourceTypeLabel(resourceType);
}

export function formatReverseEngineeringResourceTypeLabel(resourceType: ResourceType): string {
  return RESOURCE_SELECTION_LABELS[resourceType] ?? "AWS Resource";
}

export function getReverseEngineeringSelectionHelp(
  selection: ReverseEngineeringResourceSelection
): string {
  return selection === REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION
    ? "배포할 수 있는 리소스와 보드에만 표시하는 AWS 리소스를 함께 읽습니다."
    : "선택한 정식 지원 Resource만 읽습니다.";
}

// API의 `ALL` 값은 모든 리소스를 뜻하므로, 화면에서도 개별 항목이 모두 선택된 상태로 보입니다.
export function isReverseEngineeringResourceSelectionChecked(
  selectedResourceTypes: readonly ReverseEngineeringResourceSelection[],
  resourceType: ReverseEngineeringResourceSelection
): boolean {
  if (resourceType === REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION) {
    return (
      selectedResourceTypes.includes(REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION) ||
      REVERSE_ENGINEERING_RESOURCE_TYPES.every((selectedResourceType) =>
        selectedResourceTypes.includes(selectedResourceType)
      )
    );
  }

  return (
    selectedResourceTypes.includes(REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION) ||
    selectedResourceTypes.includes(resourceType)
  );
}

// 전체 선택에서 개별 리소스를 끌 때는 나머지 선택을 보존하고, 모두 선택되면 다시 API용 `ALL`로 정규화합니다.
export function getNextReverseEngineeringResourceSelections(
  currentResourceTypes: readonly ReverseEngineeringResourceSelection[],
  resourceType: ReverseEngineeringResourceSelection
): ReverseEngineeringResourceSelection[] {
  if (resourceType === REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION) {
    return isReverseEngineeringResourceSelectionChecked(currentResourceTypes, resourceType)
      ? []
      : [REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION];
  }

  const currentExplicitResourceTypes = currentResourceTypes.includes(
    REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION
  )
    ? REVERSE_ENGINEERING_RESOURCE_TYPES
    : REVERSE_ENGINEERING_RESOURCE_TYPES.filter((currentResourceType) =>
        currentResourceTypes.includes(currentResourceType)
      );
  const nextResourceTypes = currentExplicitResourceTypes.includes(resourceType)
    ? currentExplicitResourceTypes.filter((currentResourceType) => currentResourceType !== resourceType)
    : [...currentExplicitResourceTypes, resourceType];

  return REVERSE_ENGINEERING_RESOURCE_TYPES.every((currentResourceType) =>
    nextResourceTypes.includes(currentResourceType)
  )
    ? [REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION]
    : REVERSE_ENGINEERING_RESOURCE_TYPES.filter((currentResourceType) =>
        nextResourceTypes.includes(currentResourceType)
      );
}
