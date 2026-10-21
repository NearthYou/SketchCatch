import type { ResourceType, ReverseEngineeringResourceSelection } from "@sketchcatch/types";
import {
  getReverseEngineeringAwsScanSelection,
  reverseEngineeringAwsResourceTypes,
  reverseEngineeringAwsScanResourceTypes
} from "@sketchcatch/types/resource-definitions";

export const REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION =
  "ALL" satisfies ReverseEngineeringResourceSelection;

export const REVERSE_ENGINEERING_RESOURCE_TYPES: ResourceType[] = [
  ...reverseEngineeringAwsResourceTypes
];

export const REVERSE_ENGINEERING_REQUEST_RESOURCE_TYPES: ResourceType[] = [
  ...reverseEngineeringAwsScanResourceTypes
];

export const REVERSE_ENGINEERING_RESOURCE_SELECTIONS: ReverseEngineeringResourceSelection[] = [
  REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION,
  ...REVERSE_ENGINEERING_RESOURCE_TYPES
];

/** gg: 상위 family 하나를 선택해도 함께 읽는 하위 구성이 화면에서 선택된 상태로 보이게 합니다. */
export function isReverseEngineeringResourceSelectionChecked(
  selectedResourceTypes: readonly ReverseEngineeringResourceSelection[],
  resourceType: ReverseEngineeringResourceSelection
): boolean {
  const selectedScanResourceTypes =
    normalizeReverseEngineeringScanSelections(selectedResourceTypes);

  if (resourceType === REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION) {
    return (
      selectedResourceTypes.includes(REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION) ||
      REVERSE_ENGINEERING_REQUEST_RESOURCE_TYPES.every((selectedResourceType) =>
        selectedScanResourceTypes.includes(selectedResourceType)
      )
    );
  }

  const scanSelection = getReverseEngineeringAwsScanSelection(resourceType) ?? resourceType;

  return (
    selectedResourceTypes.includes(REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION) ||
    selectedScanResourceTypes.includes(scanSelection)
  );
}

/** gg: 하위 구성 선택을 상위 family 요청으로 합쳐 같은 AWS reader를 중복 실행하지 않게 합니다. */
export function getNextReverseEngineeringResourceSelections(
  currentResourceTypes: readonly ReverseEngineeringResourceSelection[],
  resourceType: ReverseEngineeringResourceSelection
): ReverseEngineeringResourceSelection[] {
  if (resourceType === REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION) {
    return isReverseEngineeringResourceSelectionChecked(currentResourceTypes, resourceType)
      ? []
      : [REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION];
  }

  const scanSelection = getReverseEngineeringAwsScanSelection(resourceType) ?? resourceType;
  const currentExplicitResourceTypes = currentResourceTypes.includes(
    REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION
  )
    ? REVERSE_ENGINEERING_REQUEST_RESOURCE_TYPES
    : normalizeReverseEngineeringScanSelections(currentResourceTypes);
  const nextResourceTypes = currentExplicitResourceTypes.includes(scanSelection)
    ? currentExplicitResourceTypes.filter(
        (currentResourceType) => currentResourceType !== scanSelection
      )
    : [...currentExplicitResourceTypes, scanSelection];

  return REVERSE_ENGINEERING_REQUEST_RESOURCE_TYPES.every((currentResourceType) =>
    nextResourceTypes.includes(currentResourceType)
  )
    ? [REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION]
    : REVERSE_ENGINEERING_REQUEST_RESOURCE_TYPES.filter((currentResourceType) =>
        nextResourceTypes.includes(currentResourceType)
      );
}

/** gg: API로 보낼 선택값을 catalog의 상위 scan family 순서로 중복 없이 정리합니다. */
function normalizeReverseEngineeringScanSelections(
  selections: readonly ReverseEngineeringResourceSelection[]
): ResourceType[] {
  const normalizedSelections = new Set<ResourceType>();

  for (const selection of selections) {
    if (selection === REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION) {
      continue;
    }

    normalizedSelections.add(getReverseEngineeringAwsScanSelection(selection) ?? selection);
  }

  return REVERSE_ENGINEERING_REQUEST_RESOURCE_TYPES.filter((resourceType) =>
    normalizedSelections.has(resourceType)
  );
}
