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
  "S3"
];

export const REVERSE_ENGINEERING_RESOURCE_SELECTIONS: ReverseEngineeringResourceSelection[] = [
  REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION,
  ...REVERSE_ENGINEERING_RESOURCE_TYPES
];

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
