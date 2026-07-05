import type { DiagramEdge, DiagramJson, DiagramNode, ReverseEngineeringScanResult } from "@sketchcatch/types";
import { convertArchitectureJsonToDiagramJson } from "./workspace-ai-diagram-adapter";

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

export type ReverseEngineeringBoardApplication = {
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
  const previewDiagram = markReverseEngineeringDiagram(
    convertArchitectureJsonToDiagramJson(input.result.architectureJson)
  );
  const comparison = compareDiagrams(input.currentDiagram, previewDiagram);

  if (input.mode === "replace") {
    return {
      comparison,
      diagram: previewDiagram,
      previewDiagram
    };
  }

  return {
    comparison,
    diagram: appendAdditionsToCurrentDiagram(input.currentDiagram, previewDiagram, comparison),
    previewDiagram
  };
}

// 현재 보드와 스캔 후보를 비교해서 자동 추가, 중복, 사용자 확인 대상을 나눕니다.
export function createReverseEngineeringBoardComparison(
  input: CreateReverseEngineeringBoardComparisonInput
): ReverseEngineeringBoardComparison {
  return compareDiagrams(
    input.currentDiagram,
    markReverseEngineeringDiagram(convertArchitectureJsonToDiagramJson(input.result.architectureJson))
  );
}

// AWS에서 가져온 노드에 보호해야 하는 원본 값 목록을 남깁니다.
function markReverseEngineeringDiagram(diagram: DiagramJson): DiagramJson {
  return {
    ...diagram,
    nodes: diagram.nodes.map(markReverseEngineeringNode)
  };
}

// providerResourceId 같은 원본 식별자는 수정 대상이 아니라 추적용 metadata로 표시합니다.
function markReverseEngineeringNode(node: DiagramNode): DiagramNode {
  return {
    ...node,
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
