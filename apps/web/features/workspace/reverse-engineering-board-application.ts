import type {
  ArchitectureBoardCompilationContextSignal,
  DiagramEdge,
  DiagramJson,
  DiagramNode,
  ReverseEngineeringScanResult
} from "@sketchcatch/types";
import {
  compileArchitectureBoard,
  type ArchitectureBoardCompilationProposal
} from "../architecture-board-compiler";
import { convertDiagramJsonToArchitectureJson } from "./workspace-ai-diagram-adapter";

export type ReverseEngineeringBoardApplicationMode = "replace" | "append";

export type ReverseEngineeringBoardComparisonItem = {
  readonly nodeId: string;
  readonly label: string;
  readonly providerResourceId?: string | undefined;
  readonly terraformIdentity?: string | undefined;
};

export type ReverseEngineeringBoardComparison = {
  readonly additions: ReverseEngineeringBoardComparisonItem[];
  readonly changes: ReverseEngineeringBoardComparisonItem[];
  readonly deletions: ReverseEngineeringBoardComparisonItem[];
  readonly duplicates: ReverseEngineeringBoardComparisonItem[];
  readonly manualReviews: ReverseEngineeringBoardComparisonItem[];
};

const IGNORED_COMPARISON_VALUE_KEYS = new Set(["providerResourceId", "providerResourceType"]);
const REVERSE_ENGINEERING_PROTECTED_VALUE_KEYS = [
  "providerResourceId",
  "providerResourceType",
  "region",
  "accountId",
  "terraformResourceName",
  "terraformResourceType"
] as const;
const REVERSE_ENGINEERING_EDITABLE_VALUE_KEYS = ["displayName", "description"] as const;
const UNKNOWN_RESOURCE_STYLE = {
  borderColor: "#f97316",
  textColor: "#9a3412"
} as const;
const UNKNOWN_MANUAL_REVIEW_LABEL_PREFIX = "확인 필요";

export type ReverseEngineeringBoardApplication = {
  readonly compilation: ArchitectureBoardCompilationProposal;
  readonly comparison: ReverseEngineeringBoardComparison;
  readonly diagram: DiagramJson;
  readonly previewDiagram: DiagramJson;
};

export type CreateReverseEngineeringBoardApplicationInput = {
  readonly currentDiagram: DiagramJson;
  readonly mode: ReverseEngineeringBoardApplicationMode;
  readonly result: ReverseEngineeringScanResult;
};

export type CreateReverseEngineeringBoardComparisonInput = {
  readonly currentDiagram: DiagramJson;
  readonly result: ReverseEngineeringScanResult;
};

// 스캔 결과를 보드 후보로 바꾸고, 사용자가 고른 적용 방식에 맞춰 최종 DiagramJson을 만듭니다.
export function createReverseEngineeringBoardApplication(
  input: CreateReverseEngineeringBoardApplicationInput
): ReverseEngineeringBoardApplication {
  const preview = createReverseEngineeringPreview(input.result);
  const previewDiagram = preview.diagram;
  const comparison = compareDiagrams(input.currentDiagram, previewDiagram);

  if (input.mode === "replace") {
    return {
      compilation: preview.compilation,
      comparison,
      diagram: previewDiagram,
      previewDiagram
    };
  }

  const appendDiagram = appendAdditionsToCurrentDiagram(input.currentDiagram, previewDiagram, comparison);
  const compilation = compileReverseEngineeringAppendArchitecture(
    input.currentDiagram,
    appendDiagram,
    new Set(comparison.additions.map((item) => item.nodeId)),
    input.result
  );

  return {
    compilation,
    comparison,
    diagram: compilation.diagram,
    previewDiagram: compilation.diagram
  };
}

// 현재 보드와 스캔 후보를 비교해서 자동 추가, 중복, 사용자 확인 대상을 나눕니다.
export function createReverseEngineeringBoardComparison(
  input: CreateReverseEngineeringBoardComparisonInput
): ReverseEngineeringBoardComparison {
  return compareDiagrams(input.currentDiagram, createReverseEngineeringPreviewDiagram(input.result));
}

// 오래된 scan 기록에 UNKNOWN 노드가 남아 있어도 보드 중앙에는 올리지 않습니다.
function createReverseEngineeringPreviewDiagram(result: ReverseEngineeringScanResult): DiagramJson {
  return createReverseEngineeringPreview(result).diagram;
}

function createReverseEngineeringPreview(result: ReverseEngineeringScanResult): {
  readonly compilation: ArchitectureBoardCompilationProposal;
  readonly diagram: DiagramJson;
} {
  const compilation = compileReverseEngineeringArchitecture(result);
  const diagram = markReverseEngineeringDiagram(compilation.diagram);

  return {
    compilation: { ...compilation, diagram },
    diagram
  };
}

// append는 원본 보드와 안전한 scan 추가분을 합친 뒤에만 Compiler에 넘깁니다.
// 그래야 proposal의 quality/diff와 실제 승인·저장할 Board가 같은 상태를 가리킵니다.
function compileReverseEngineeringAppendArchitecture(
  currentDiagram: DiagramJson,
  appendDiagram: DiagramJson,
  reverseEngineeringNodeIds: ReadonlySet<string>,
  result: ReverseEngineeringScanResult
): ArchitectureBoardCompilationProposal {
  const compilation = compileArchitectureBoard({
    architecture: convertDiagramJsonToArchitectureJson(appendDiagram),
    currentDiagram,
    semanticContext: { signals: createReverseEngineeringContextSignals(result) },
    trigger: "reverse-engineering"
  });

  return {
    ...compilation,
    diagram: markReverseEngineeringDiagram(compilation.diagram, reverseEngineeringNodeIds)
  };
}

export function compileReverseEngineeringArchitecture(
  result: ReverseEngineeringScanResult
): ArchitectureBoardCompilationProposal {
  return compileArchitectureBoard({
    architecture: result.architectureJson,
    semanticContext: { signals: createReverseEngineeringContextSignals(result) },
    trigger: "reverse-engineering"
  });
}

// Scan facts are not hard gates. Passing them through the Compiler keeps the imported
// diagram, the review summary, and the user-accepted apply boundary on the same proposal.
function createReverseEngineeringContextSignals(
  result: ReverseEngineeringScanResult
): ArchitectureBoardCompilationContextSignal[] {
  return [
    ...result.findings.map((finding) => ({
      id: finding.id,
      kind: "deployment" as const,
      level: toFindingDiagnosticLevel(finding.severity),
      summary: finding.title,
      message: `${finding.description} ${finding.recommendation}`.trim(),
      ...(finding.resourceId ? { relatedResourceIds: [finding.resourceId] } : {}),
      penalty: finding.severity === "high" ? 500 : finding.severity === "medium" ? 200 : 50
    })),
    ...result.analysisExclusions.map((exclusion) => ({
      id: exclusion.id,
      kind: "provider" as const,
      level: "warning" as const,
      summary: `자동 분석 제외: ${formatAnalysisExclusionReason(exclusion.reason)}`,
      message: formatAnalysisExclusionMessage(exclusion.reason),
      relatedResourceIds: [exclusion.resourceId],
      penalty: 150
    })),
    ...result.scanErrors.map((error) => ({
      id: error.id,
      kind: "provider" as const,
      level: error.retryable ? "warning" as const : "error" as const,
      summary: `스캔 실패: ${formatScanStage(error.stage)} · ${formatScanErrorReason(error.reason)}`,
      message: formatScanErrorMessage(error.stage, error.reason, error.retryable),
      penalty: error.retryable ? 200 : 500
    }))
  ].sort((left, right) => left.id.localeCompare(right.id));
}

function formatAnalysisExclusionReason(
  reason: ReverseEngineeringScanResult["analysisExclusions"][number]["reason"]
): string {
  return reason === "unsupported_resource_type" ? "자동 분석 범위 밖" : "필수 정보 부족";
}

function formatAnalysisExclusionMessage(
  reason: ReverseEngineeringScanResult["analysisExclusions"][number]["reason"]
): string {
  return reason === "unsupported_resource_type"
    ? "이 Resource는 현재 자동 분석 범위에 포함되지 않습니다."
    : "이 Resource에 필요한 정보가 없어 자동 분석에 포함되지 않습니다.";
}

function formatScanStage(stage: ReverseEngineeringScanResult["scanErrors"][number]["stage"]): string {
  const labels: Readonly<Record<ReverseEngineeringScanResult["scanErrors"][number]["stage"], string>> = {
    credential: "AWS 인증 정보 확인",
    region: "리전 확인",
    provider_api: "AWS 서비스 조회",
    normalize: "스캔 결과 정리",
    draft: "보드 초안 생성",
    analysis: "자동 분석",
    import_suggestion: "import 제안 생성"
  };

  return labels[stage];
}

function formatScanErrorReason(
  reason: ReverseEngineeringScanResult["scanErrors"][number]["reason"]
): string {
  const labels: Readonly<Record<ReverseEngineeringScanResult["scanErrors"][number]["reason"], string>> = {
    permission_denied: "권한 부족",
    invalid_region: "리전을 확인할 수 없음",
    expired_credential: "인증 정보 만료",
    throttled: "요청 제한",
    provider_error: "AWS 서비스 오류",
    unknown: "알 수 없는 오류"
  };

  return labels[reason];
}

function formatScanErrorMessage(
  stage: ReverseEngineeringScanResult["scanErrors"][number]["stage"],
  reason: ReverseEngineeringScanResult["scanErrors"][number]["reason"],
  retryable: boolean
): string {
  return `${formatScanStage(stage)} 중 ${formatScanErrorReason(reason)}으로 완료하지 못했습니다. ${
    retryable ? "잠시 후 다시 시도할 수 있습니다." : "AWS 연결과 권한을 확인하세요."
  }`;
}

function toFindingDiagnosticLevel(
  severity: ReverseEngineeringScanResult["findings"][number]["severity"]
): ArchitectureBoardCompilationContextSignal["level"] {
  if (severity === "high") return "error";
  if (severity === "medium") return "warning";
  return "info";
}

// AWS에서 가져온 노드에 보호해야 하는 원본 값 목록을 남깁니다.
function markReverseEngineeringDiagram(
  diagram: DiagramJson,
  nodeIds?: ReadonlySet<string>
): DiagramJson {
  return {
    ...diagram,
    nodes: diagram.nodes.map((node) =>
      nodeIds === undefined || nodeIds.has(node.id) ? markReverseEngineeringNode(node) : node
    )
  };
}

// providerResourceId 같은 원본 식별자는 수정 대상이 아니라 추적용 metadata로 표시합니다.
function markReverseEngineeringNode(node: DiagramNode): DiagramNode {
  const isUnsupportedUnknown = isUnsupportedUnknownNode(node);
  const nextStyle = isUnsupportedUnknown
    ? { ...node.style, ...UNKNOWN_RESOURCE_STYLE }
    : node.style;

  return {
    ...node,
    label: isUnsupportedUnknown ? createUnknownManualReviewLabel(node.label) : node.label,
    ...(nextStyle ? { style: nextStyle } : {}),
    metadata: {
      ...node.metadata,
      reverseEngineering: {
        source: "aws_scan",
        protectedValueKeys: [...REVERSE_ENGINEERING_PROTECTED_VALUE_KEYS],
        editableValueKeys: [...REVERSE_ENGINEERING_EDITABLE_VALUE_KEYS]
      }
    }
  };
}

// UNKNOWN 노드는 사용자가 직접 확인해야 하므로 보드 이름표 앞에 확인 표시를 붙입니다.
function createUnknownManualReviewLabel(label: string): string {
  return label.startsWith(`${UNKNOWN_MANUAL_REVIEW_LABEL_PREFIX} · `)
    ? label
    : `${UNKNOWN_MANUAL_REVIEW_LABEL_PREFIX} · ${label}`;
}

function isUnsupportedUnknownNode(node: DiagramNode): boolean {
  const values = node.parameters?.values;
  return node.type === "UNKNOWN" || values?.["analysisExcluded"] === true;
}

function compareDiagrams(
  currentDiagram: DiagramJson,
  previewDiagram: DiagramJson
): ReverseEngineeringBoardComparison {
  const currentProviderResourceIds = new Set(currentDiagram.nodes.flatMap(getProviderResourceId));
  const currentNodeByProviderResourceId = new Map(
    currentDiagram.nodes.flatMap((node) =>
      getProviderResourceId(node).map((providerResourceId) => [providerResourceId, node])
    )
  );
  const previewProviderResourceIds = new Set(previewDiagram.nodes.flatMap(getProviderResourceId));
  const currentTerraformIdentities = new Set(currentDiagram.nodes.flatMap(getTerraformIdentity));
  const additions: ReverseEngineeringBoardComparisonItem[] = [];
  const changes: ReverseEngineeringBoardComparisonItem[] = [];
  const deletions: ReverseEngineeringBoardComparisonItem[] = [];
  const duplicates: ReverseEngineeringBoardComparisonItem[] = [];
  const manualReviews: ReverseEngineeringBoardComparisonItem[] = [];

  for (const node of previewDiagram.nodes) {
    const item = toComparisonItem(node);
    const providerResourceId = item.providerResourceId;
    const terraformIdentity = item.terraformIdentity;

    if (providerResourceId && currentProviderResourceIds.has(providerResourceId)) {
      const currentNode = currentNodeByProviderResourceId.get(providerResourceId);

      if (currentNode && hasSharedValueDifference(currentNode, node)) {
        changes.push(item);
        continue;
      }

      duplicates.push(item);
      continue;
    }

    if (!providerResourceId) {
      if (terraformIdentity && currentTerraformIdentities.has(terraformIdentity)) {
        duplicates.push(item);
        continue;
      }

      manualReviews.push(item);
      continue;
    }

    if (terraformIdentity && currentTerraformIdentities.has(terraformIdentity)) {
      manualReviews.push(item);
      continue;
    }

    additions.push(item);
  }

  for (const node of currentDiagram.nodes) {
    const providerResourceId = getProviderResourceId(node)[0];

    if (providerResourceId && !previewProviderResourceIds.has(providerResourceId)) {
      deletions.push(toComparisonItem(node));
    }
  }

  return { additions, changes, deletions, duplicates, manualReviews };
}

// 현재 보드에 없는 안전한 추가 후보만 골라 붙이고, 기존 viewport는 그대로 둡니다.
function appendAdditionsToCurrentDiagram(
  currentDiagram: DiagramJson,
  previewDiagram: DiagramJson,
  comparison: ReverseEngineeringBoardComparison
): DiagramJson {
  const additionNodeIds = new Set(comparison.additions.map((item) => item.nodeId));
  const currentNodeIds = new Set(currentDiagram.nodes.map((node) => node.id));
  const nodes = [
    ...currentDiagram.nodes,
    ...previewDiagram.nodes.filter((node) => additionNodeIds.has(node.id))
  ];
  const nodeIdsAfterAppend = new Set([...currentNodeIds, ...additionNodeIds]);

  return {
    edges: [
      ...currentDiagram.edges,
      ...previewDiagram.edges.filter((edge) => shouldAppendEdge(edge, currentDiagram, nodeIdsAfterAppend))
    ],
    nodes,
    viewport: currentDiagram.viewport
  };
}

// 양쪽 끝 노드가 보드에 있을 때만 관계선을 추가해 끊어진 선을 만들지 않습니다.
function shouldAppendEdge(
  edge: DiagramEdge,
  currentDiagram: DiagramJson,
  nodeIdsAfterAppend: ReadonlySet<string>
): boolean {
  if (!nodeIdsAfterAppend.has(edge.sourceNodeId) || !nodeIdsAfterAppend.has(edge.targetNodeId)) {
    return false;
  }

  return !currentDiagram.edges.some((currentEdge) => currentEdge.id === edge.id);
}

// 비교 화면에서 보여줄 최소 이름표를 DiagramNode에서 뽑습니다.
function toComparisonItem(node: DiagramNode): ReverseEngineeringBoardComparisonItem {
  return {
    label: node.label,
    nodeId: node.id,
    providerResourceId: getProviderResourceId(node)[0],
    terraformIdentity: getTerraformIdentity(node)[0]
  };
}

// AWS 원본 Resource ID가 있으면 중복 판단의 1순위 기준으로 사용합니다.
function getProviderResourceId(node: DiagramNode): string[] {
  const value = node.parameters?.values["providerResourceId"];

  return typeof value === "string" && value.trim().length > 0 ? [value] : [];
}

// 양쪽에 모두 있는 설정값만 비교해서 과한 변경 후보를 만들지 않습니다.
function hasSharedValueDifference(currentNode: DiagramNode, previewNode: DiagramNode): boolean {
  const currentValues = currentNode.parameters?.values ?? {};
  const previewValues = previewNode.parameters?.values ?? {};

  return Object.keys(currentValues).some((key) => {
    if (IGNORED_COMPARISON_VALUE_KEYS.has(key) || !(key in previewValues)) {
      return false;
    }

    return JSON.stringify(currentValues[key]) !== JSON.stringify(previewValues[key]);
  });
}

// AWS 원본 ID가 없을 때 보조 기준으로 쓸 Terraform 주소 비슷한 이름표를 만듭니다.
function getTerraformIdentity(node: DiagramNode): string[] {
  const parameters = node.parameters;

  if (!parameters) {
    return [];
  }

  return [
    `${parameters.terraformBlockType ?? "resource"}:${parameters.resourceType}:${parameters.resourceName}`
  ];
}
