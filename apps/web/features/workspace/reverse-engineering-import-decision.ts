import type {
  ReverseEngineeringImportDecisionRequest,
  ReverseEngineeringImportSuggestionStatus,
  ReverseEngineeringScanResult
} from "@sketchcatch/types";

export type ReverseEngineeringImportDecisionOption = {
  readonly id: string;
  readonly label: string;
  readonly status: ReverseEngineeringImportSuggestionStatus;
};

export type ReverseEngineeringImportDecisionOptions = {
  readonly ready: readonly ReverseEngineeringImportDecisionOption[];
  readonly reviewOnly: readonly ReverseEngineeringImportDecisionOption[];
  readonly invalidResourceIds: readonly string[];
};

/** gg: 서버가 공개한 suggestion만 사용해 적용할 리소스의 선택 항목을 만듭니다. */
export function createReverseEngineeringImportDecisionOptions(
  result: ReverseEngineeringScanResult,
  appliedSourceNodeIds: readonly string[]
): ReverseEngineeringImportDecisionOptions {
  const resourceLabels = createUniqueResourceLabelMap(result);
  const suggestionStatuses = createUniqueSuggestionStatusMap(result);
  const ready: ReverseEngineeringImportDecisionOption[] = [];
  const reviewOnly: ReverseEngineeringImportDecisionOption[] = [];
  const invalidResourceIds: string[] = [];
  const seenIds = new Set<string>();

  for (const resourceId of appliedSourceNodeIds) {
    if (seenIds.has(resourceId)) {
      invalidResourceIds.push(resourceId);
      continue;
    }
    seenIds.add(resourceId);

    const label = resourceLabels.get(resourceId);
    const status = suggestionStatuses.get(resourceId);
    if (!label || !status) {
      invalidResourceIds.push(resourceId);
      continue;
    }

    const option = { id: resourceId, label, status };
    if (status === "ready") {
      ready.push(option);
    } else {
      reviewOnly.push(option);
    }
  }

  return { ready, reviewOnly, invalidResourceIds };
}

/** gg: 현재 적용 범위 안에서 사용자가 고른 값만 API 요청에 담습니다. */
export function createReverseEngineeringImportDecisionRequest({
  acknowledgedReviewOnlyResourceIds,
  options,
  selectedReadyResourceIds
}: {
  readonly acknowledgedReviewOnlyResourceIds: readonly string[];
  readonly options: ReverseEngineeringImportDecisionOptions;
  readonly selectedReadyResourceIds: readonly string[];
}): ReverseEngineeringImportDecisionRequest {
  const selectedReadyIdSet = new Set(selectedReadyResourceIds);
  const acknowledgedReviewOnlyIdSet = new Set(acknowledgedReviewOnlyResourceIds);

  return {
    version: 1,
    selectedReadyResourceIds: options.ready
      .map((option) => option.id)
      .filter((resourceId) => selectedReadyIdSet.has(resourceId)),
    acknowledgedReviewOnlyResourceIds: options.reviewOnly
      .map((option) => option.id)
      .filter((resourceId) => acknowledgedReviewOnlyIdSet.has(resourceId))
  };
}

/** gg: 바로 관리하지 못하는 모든 리소스를 확인해야 마지막 적용 버튼을 엽니다. */
export function isReverseEngineeringImportDecisionComplete(
  options: ReverseEngineeringImportDecisionOptions,
  acknowledgedReviewOnlyResourceIds: readonly string[]
): boolean {
  if (options.invalidResourceIds.length > 0) {
    return false;
  }

  const acknowledgedIdSet = new Set(acknowledgedReviewOnlyResourceIds);
  return options.reviewOnly.every((option) => acknowledgedIdSet.has(option.id));
}

/** gg: 같은 공개 ID가 둘이면 이름을 잘못 붙이지 않고 선택 자체를 막습니다. */
function createUniqueResourceLabelMap(
  result: ReverseEngineeringScanResult
): ReadonlyMap<string, string> {
  const labels = new Map<string, string>();
  const duplicateIds = new Set<string>();

  for (const resource of result.discoveredResources) {
    if (labels.has(resource.id)) {
      duplicateIds.add(resource.id);
      continue;
    }

    const label = resource.displayName.trim();
    labels.set(resource.id, label.length > 0 ? label : "이름을 확인할 수 없는 리소스");
  }

  for (const resourceId of duplicateIds) {
    labels.delete(resourceId);
  }

  return labels;
}

/** gg: 같은 공개 ID의 상태가 둘이면 browser에서 임의로 하나를 고르지 않습니다. */
function createUniqueSuggestionStatusMap(
  result: ReverseEngineeringScanResult
): ReadonlyMap<string, ReverseEngineeringImportSuggestionStatus> {
  const statuses = new Map<string, ReverseEngineeringImportSuggestionStatus>();
  const duplicateIds = new Set<string>();

  for (const suggestion of result.importSuggestions) {
    if (statuses.has(suggestion.resourceId)) {
      duplicateIds.add(suggestion.resourceId);
      continue;
    }

    statuses.set(suggestion.resourceId, suggestion.status);
  }

  for (const resourceId of duplicateIds) {
    statuses.delete(resourceId);
  }

  return statuses;
}
