import type {
  DiagramJson,
  ReverseEngineeringImportDecision,
  ReverseEngineeringImportDecisionRequest,
  ReverseEngineeringImportSuggestionStatus,
  ReverseEngineeringScanResult
} from "@sketchcatch/types";
import {
  ReverseEngineeringImportDependencyError,
  validateReverseEngineeringImportDependencies
} from "./reverse-engineering-import-dependency.js";
import { normalizeReverseEngineeringScanResult } from "./reverse-engineering-service.js";

export type ReverseEngineeringImportDecisionValidationReason =
  | "invalid_request"
  | "duplicate_resource_id"
  | "overlapping_resource_id"
  | "unknown_resource_id"
  | "resource_outside_applied_set"
  | "missing_review_acknowledgement"
  | "resource_not_ready"
  | "resource_not_review_only"
  | "invalid_applied_source"
  | "invalid_server_suggestion"
  | "missing_import_dependency";

const VALIDATION_MESSAGE_BY_REASON: Readonly<
  Record<ReverseEngineeringImportDecisionValidationReason, string>
> = {
  invalid_request: "가져오기 결정 요청 형식이 올바르지 않습니다.",
  duplicate_resource_id: "가져오기 결정에 중복된 리소스가 있습니다.",
  overlapping_resource_id: "한 리소스에 서로 다른 가져오기 결정을 할 수 없습니다.",
  unknown_resource_id: "확인할 수 없는 가져오기 대상이 포함되어 있습니다.",
  resource_outside_applied_set: "적용하지 않은 리소스의 가져오기 결정을 저장할 수 없습니다.",
  missing_review_acknowledgement: "보드에서 바로 수정할 수 없는 리소스를 확인해 주세요.",
  resource_not_ready: "준비되지 않은 리소스는 기존 리소스로 가져올 수 없습니다.",
  resource_not_review_only: "바로 수정할 수 있는 리소스에는 별도 확인을 사용할 수 없습니다.",
  invalid_applied_source: "적용할 Reverse Engineering 원본을 확인할 수 없습니다.",
  invalid_server_suggestion: "저장된 Reverse Engineering 가져오기 상태를 확인할 수 없습니다.",
  missing_import_dependency: "함께 가져와야 하는 AWS 리소스를 선택해 주세요."
};

export class ReverseEngineeringImportDecisionValidationError extends Error {
  readonly reason: ReverseEngineeringImportDecisionValidationReason;

  /** gg: 외부에는 고정된 안전 문구만 노출하고 내부 판별용 reason을 보존합니다. */
  constructor(reason: ReverseEngineeringImportDecisionValidationReason, message?: string) {
    super(message ?? VALIDATION_MESSAGE_BY_REASON[reason]);
    this.name = "ReverseEngineeringImportDecisionValidationError";
    this.reason = reason;
  }
}

export type ValidateAndStampReverseEngineeringImportDecisionsInput = {
  request: ReverseEngineeringImportDecisionRequest;
  diagramJson: DiagramJson;
  appliedSourceNodeIds: readonly string[];
  storedScanResult: ReverseEngineeringScanResult;
};

/** gg: 저장된 스캔을 기준으로 선택을 다시 검증하고 서버가 승인한 결정을 node에 기록합니다. */
export function validateAndStampReverseEngineeringImportDecisions({
  request,
  diagramJson,
  appliedSourceNodeIds,
  storedScanResult
}: ValidateAndStampReverseEngineeringImportDecisionsInput): DiagramJson {
  validateRequest(request);
  const publicResult = normalizeStoredScanResult(storedScanResult);
  const suggestionStatusByResourceId = createSuggestionStatusMap(publicResult, storedScanResult);
  const appliedSourceNodeIdSet = validateAppliedSourceNodeIds({
    appliedSourceNodeIds,
    diagramJson,
    publicResult,
    suggestionStatusByResourceId
  });
  validateRequestedResourceIds(request, appliedSourceNodeIdSet, suggestionStatusByResourceId);

  const selectedReadyResourceIdSet = new Set(request.selectedReadyResourceIds);
  const acknowledgedReviewOnlyResourceIdSet = new Set(request.acknowledgedReviewOnlyResourceIds);

  validateStatuses({
    appliedSourceNodeIdSet,
    selectedReadyResourceIdSet,
    acknowledgedReviewOnlyResourceIdSet,
    suggestionStatusByResourceId
  });
  try {
    validateReverseEngineeringImportDependencies({
      storedScanResult: publicResult,
      importExistingResourceIds: request.selectedReadyResourceIds
    });
  } catch (error) {
    if (error instanceof ReverseEngineeringImportDependencyError) {
      throw new ReverseEngineeringImportDecisionValidationError(
        "missing_import_dependency",
        error.message
      );
    }
    throw error;
  }

  return {
    ...diagramJson,
    nodes: diagramJson.nodes.map((node) => {
      if (!appliedSourceNodeIdSet.has(node.id)) {
        return node;
      }

      const statusAtConfirmation = suggestionStatusByResourceId.get(node.id);
      if (!statusAtConfirmation) {
        throw new ReverseEngineeringImportDecisionValidationError("invalid_server_suggestion");
      }

      const importDecision: ReverseEngineeringImportDecision = {
        version: 1,
        mode:
          statusAtConfirmation === "ready" && selectedReadyResourceIdSet.has(node.id)
            ? "import_existing"
            : "observe_only",
        statusAtConfirmation
      };

      return {
        ...node,
        metadata: {
          ...node.metadata,
          reverseEngineering: {
            source: "aws_scan",
            protectedValueKeys: [...publicResult.reverseEngineeringDraft.protectedValueKeys],
            editableValueKeys: [...publicResult.reverseEngineeringDraft.editableValueKeys],
            importDecision
          }
        }
      };
    })
  };
}

/** gg: 브라우저가 보낸 선택 요청의 exact shape와 ID 집합 불변식을 확인합니다. */
function validateRequest(request: ReverseEngineeringImportDecisionRequest): void {
  if (
    !isRecord(request) ||
    !hasExactKeys(request, [
      "version",
      "selectedReadyResourceIds",
      "acknowledgedReviewOnlyResourceIds"
    ]) ||
    request["version"] !== 1 ||
    !isResourceIdArray(request["selectedReadyResourceIds"]) ||
    !isResourceIdArray(request["acknowledgedReviewOnlyResourceIds"])
  ) {
    throw new ReverseEngineeringImportDecisionValidationError("invalid_request");
  }

  const selectedReadyResourceIds = request.selectedReadyResourceIds;
  const acknowledgedReviewOnlyResourceIds = request.acknowledgedReviewOnlyResourceIds;

  if (
    new Set(selectedReadyResourceIds).size !== selectedReadyResourceIds.length ||
    new Set(acknowledgedReviewOnlyResourceIds).size !== acknowledgedReviewOnlyResourceIds.length
  ) {
    throw new ReverseEngineeringImportDecisionValidationError("duplicate_resource_id");
  }

  const selectedReadyResourceIdSet = new Set(selectedReadyResourceIds);
  if (
    acknowledgedReviewOnlyResourceIds.some((resourceId) =>
      selectedReadyResourceIdSet.has(resourceId)
    )
  ) {
    throw new ReverseEngineeringImportDecisionValidationError("overlapping_resource_id");
  }
}

/** gg: 비공개 AWS ID가 결정 비교에 섞이지 않도록 저장 결과를 공개 ID 형태로 정규화합니다. */
function normalizeStoredScanResult(
  storedScanResult: ReverseEngineeringScanResult
): ReverseEngineeringScanResult {
  try {
    return normalizeReverseEngineeringScanResult(storedScanResult.scan, storedScanResult);
  } catch {
    throw new ReverseEngineeringImportDecisionValidationError("invalid_server_suggestion");
  }
}

/** gg: 서버가 저장한 제안만 신뢰해 공개 리소스 ID별 적용 가능 상태를 만듭니다. */
function createSuggestionStatusMap(
  publicResult: ReverseEngineeringScanResult,
  storedScanResult: ReverseEngineeringScanResult
): ReadonlyMap<string, ReverseEngineeringImportSuggestionStatus> {
  if (publicResult.importSuggestions.length !== storedScanResult.importSuggestions.length) {
    throw new ReverseEngineeringImportDecisionValidationError("invalid_server_suggestion");
  }

  const statusByResourceId = new Map<string, ReverseEngineeringImportSuggestionStatus>();

  for (const suggestion of publicResult.importSuggestions) {
    if (
      !isResourceId(suggestion.resourceId) ||
      !isImportSuggestionStatus(suggestion.status) ||
      statusByResourceId.has(suggestion.resourceId)
    ) {
      throw new ReverseEngineeringImportDecisionValidationError("invalid_server_suggestion");
    }

    statusByResourceId.set(suggestion.resourceId, suggestion.status);
  }

  return statusByResourceId;
}

/** gg: 실제 후보에 포함된 source node가 저장 스캔과 Diagram에 정확히 한 번씩 존재하는지 확인합니다. */
function validateAppliedSourceNodeIds({
  appliedSourceNodeIds,
  diagramJson,
  publicResult,
  suggestionStatusByResourceId
}: {
  appliedSourceNodeIds: readonly string[];
  diagramJson: DiagramJson;
  publicResult: ReverseEngineeringScanResult;
  suggestionStatusByResourceId: ReadonlyMap<string, ReverseEngineeringImportSuggestionStatus>;
}): ReadonlySet<string> {
  if (
    !isResourceIdArray(appliedSourceNodeIds) ||
    new Set(appliedSourceNodeIds).size !== appliedSourceNodeIds.length
  ) {
    throw new ReverseEngineeringImportDecisionValidationError("invalid_applied_source");
  }

  const appliedSourceNodeIdSet = new Set(appliedSourceNodeIds);
  const diagramNodeCounts = countNodeIds(diagramJson.nodes);
  const publicNodeCounts = countNodeIds(
    publicResult.reverseEngineeringDraft.architectureJson.nodes
  );

  for (const sourceNodeId of appliedSourceNodeIds) {
    if (
      diagramNodeCounts.get(sourceNodeId) !== 1 ||
      publicNodeCounts.get(sourceNodeId) !== 1 ||
      !suggestionStatusByResourceId.has(sourceNodeId)
    ) {
      throw new ReverseEngineeringImportDecisionValidationError("invalid_applied_source");
    }
  }

  return appliedSourceNodeIdSet;
}

/** gg: 선택된 모든 리소스가 서버 제안과 실제 적용 범위 안에만 있는지 확인합니다. */
function validateRequestedResourceIds(
  request: ReverseEngineeringImportDecisionRequest,
  appliedSourceNodeIdSet: ReadonlySet<string>,
  suggestionStatusByResourceId: ReadonlyMap<string, ReverseEngineeringImportSuggestionStatus>
): void {
  const requestedResourceIds = [
    ...request.selectedReadyResourceIds,
    ...request.acknowledgedReviewOnlyResourceIds
  ];

  for (const resourceId of requestedResourceIds) {
    if (!suggestionStatusByResourceId.has(resourceId)) {
      throw new ReverseEngineeringImportDecisionValidationError("unknown_resource_id");
    }
    if (!appliedSourceNodeIdSet.has(resourceId)) {
      throw new ReverseEngineeringImportDecisionValidationError("resource_outside_applied_set");
    }
  }
}

/** gg: 적용 가능한 리소스 선택과 확인 필수 리소스 승인이 서로 뒤바뀌지 않게 검증합니다. */
function validateStatuses({
  appliedSourceNodeIdSet,
  selectedReadyResourceIdSet,
  acknowledgedReviewOnlyResourceIdSet,
  suggestionStatusByResourceId
}: {
  appliedSourceNodeIdSet: ReadonlySet<string>;
  selectedReadyResourceIdSet: ReadonlySet<string>;
  acknowledgedReviewOnlyResourceIdSet: ReadonlySet<string>;
  suggestionStatusByResourceId: ReadonlyMap<string, ReverseEngineeringImportSuggestionStatus>;
}): void {
  for (const resourceId of selectedReadyResourceIdSet) {
    if (suggestionStatusByResourceId.get(resourceId) !== "ready") {
      throw new ReverseEngineeringImportDecisionValidationError("resource_not_ready");
    }
  }

  for (const resourceId of acknowledgedReviewOnlyResourceIdSet) {
    if (suggestionStatusByResourceId.get(resourceId) === "ready") {
      throw new ReverseEngineeringImportDecisionValidationError("resource_not_review_only");
    }
  }

  for (const resourceId of appliedSourceNodeIdSet) {
    const status = suggestionStatusByResourceId.get(resourceId);
    if (status !== "ready" && !acknowledgedReviewOnlyResourceIdSet.has(resourceId)) {
      throw new ReverseEngineeringImportDecisionValidationError("missing_review_acknowledgement");
    }
  }
}

/** gg: 중복 ID를 조용히 덮어쓰지 않도록 node ID별 등장 횟수를 계산합니다. */
function countNodeIds(nodes: readonly { readonly id: string }[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();

  for (const node of nodes) {
    counts.set(node.id, (counts.get(node.id) ?? 0) + 1);
  }

  return counts;
}

/** gg: 승인 요청에 서버가 모르는 필드가 섞이면 거부하도록 키 집합을 정확히 비교합니다. */
function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(value);
  const expectedKeys = new Set(keys);

  return (
    actualKeys.length === expectedKeys.size && actualKeys.every((key) => expectedKeys.has(key))
  );
}

/** gg: 런타임 입력이 일반 객체인지 좁힙니다. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** gg: 리소스 ID 배열만 승인 요청에 사용할 수 있게 좁힙니다. */
function isResourceIdArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(isResourceId);
}

/** gg: 빈 값이나 앞뒤 공백이 있는 모호한 리소스 ID를 거부합니다. */
function isResourceId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}

/** gg: 서버가 지원하는 가져오기 상태만 결정 근거로 사용합니다. */
function isImportSuggestionStatus(
  value: unknown
): value is ReverseEngineeringImportSuggestionStatus {
  return value === "ready" || value === "manual_review" || value === "unsupported_resource_type";
}
