import type {
  ArchitectureJson,
  DiagramEdge,
  DiagramJson,
  DiagramNode,
  ReverseEngineeringScanResult
} from "@sketchcatch/types";
import {
  isNodeInsideReverseEngineeringInfrastructureFrame,
  isReverseEngineeringInfrastructureFrameNode
} from "@sketchcatch/types";
import { hasSameBoardAutoOrganizeSemantics } from "../architecture-board-compiler";
import {
  convertDiagramJsonToArchitectureJson
} from "./workspace-ai-diagram-adapter";
import { fitReverseEngineeringInfrastructureFrameToMembers } from "./reverse-engineering-infrastructure-frames";
import { createSourceExactReverseEngineeringDiagram } from "./reverse-engineering-source-exact";

export type ReverseEngineeringBoardApplicationMode = "replace" | "append";
export type ReverseEngineeringPlacement = "original" | "compiled";

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

export type ReverseEngineeringBoardApplication = {
  readonly compilation: null;
  readonly comparison: ReverseEngineeringBoardComparison;
  readonly diagram: DiagramJson;
  readonly previewDiagram: DiagramJson;
  readonly sourceOwnership: ReverseEngineeringSourceOwnership;
};

export type ReverseEngineeringSourceOwnership = {
  readonly nodeIds: readonly string[];
  readonly edgeIds: readonly string[];
};

export type CreateReverseEngineeringBoardApplicationInput = {
  readonly currentDiagram: DiagramJson;
  readonly mode: ReverseEngineeringBoardApplicationMode;
  readonly organizedDiagram?: DiagramJson | undefined;
  readonly placement: ReverseEngineeringPlacement;
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
  const originalPreview = createOriginalReverseEngineeringPreview(input.result);
  const comparison = compareDiagrams(input.currentDiagram, originalPreview.diagram);
  const replaceSourceOwnership = {
    nodeIds: originalPreview.diagram.nodes
      .filter((node) => node.kind === "resource")
      .map((node) => node.id),
    edgeIds: originalPreview.diagram.edges.map((edge) => edge.id)
  } satisfies ReverseEngineeringSourceOwnership;

  if (input.mode === "replace") {
    const diagram = input.placement === "compiled"
      ? useSelectedReverseEngineeringOrganization(
          originalPreview.diagram,
          input.organizedDiagram
        )
      : originalPreview.diagram;

    return {
      compilation: null,
      comparison,
      diagram,
      previewDiagram: diagram,
      sourceOwnership: replaceSourceOwnership
    };
  }

  const appendResult = appendAdditionsToCurrentDiagram(
    input.currentDiagram,
    originalPreview.diagram,
    comparison
  );
  const appendDiagram = appendResult.diagram;

  if (input.placement === "original") {
    return {
      compilation: null,
      comparison,
      diagram: appendDiagram,
      previewDiagram: appendDiagram,
      sourceOwnership: appendResult.sourceOwnership
    };
  }

  const diagram = useSelectedReverseEngineeringOrganization(
    appendDiagram,
    input.organizedDiagram
  );

  return {
    compilation: null,
    comparison,
    diagram,
    previewDiagram: diagram,
    sourceOwnership: appendResult.sourceOwnership
  };
}

// 현재 보드와 스캔 후보를 비교해서 자동 추가, 중복, 사용자 확인 대상을 나눕니다.
export function createReverseEngineeringBoardComparison(
  input: CreateReverseEngineeringBoardComparisonInput
): ReverseEngineeringBoardComparison {
  return compareDiagrams(
    input.currentDiagram,
    createOriginalReverseEngineeringPreview(input.result).diagram
  );
}

// Board 저장용 Architecture에도 가져온 Resource의 type·label·config·관계를 그대로 되돌립니다.
export function convertReverseEngineeringBoardToArchitectureJson(
  diagram: DiagramJson,
  result: ReverseEngineeringScanResult,
  sourceOwnership?: ReverseEngineeringSourceOwnership
): ArchitectureJson {
  const converted = convertDiagramJsonToArchitectureJson(diagram);
  const sourceNodeById = new Map(result.architectureJson.nodes.map((node) => [node.id, node]));
  const sourceEdgeById = new Map(result.architectureJson.edges.map((edge) => [edge.id, edge]));
  const convertedNodeById = new Map(converted.nodes.map((node) => [node.id, node]));
  const convertedEdgeById = new Map(converted.edges.map((edge) => [edge.id, edge]));
  const ownedSourceNodeIds = new Set(
    sourceOwnership?.nodeIds ?? result.architectureJson.nodes.map((node) => node.id)
  );
  const ownedSourceEdgeIds = new Set(
    sourceOwnership?.edgeIds ?? result.architectureJson.edges.map((edge) => edge.id)
  );

  return {
    nodes: diagram.nodes.flatMap((diagramNode) => {
      const sourceNode = ownedSourceNodeIds.has(diagramNode.id)
        ? sourceNodeById.get(diagramNode.id)
        : undefined;
      const convertedNode = convertedNodeById.get(diagramNode.id);

      return sourceNode
        ? [{
            ...structuredClone(sourceNode),
            positionX: diagramNode.position.x,
            positionY: diagramNode.position.y
          }]
        : convertedNode
          ? [structuredClone(convertedNode)]
          : [];
    }),
    edges: diagram.edges.flatMap((diagramEdge) => {
      const sourceEdge = ownedSourceEdgeIds.has(diagramEdge.id)
        ? sourceEdgeById.get(diagramEdge.id)
        : undefined;
      const convertedEdge = convertedEdgeById.get(diagramEdge.id);

      return sourceEdge
        ? [structuredClone(sourceEdge)]
        : convertedEdge
          ? [structuredClone(convertedEdge)]
          : [];
    })
  };
}

// AWS가 만든 Architecture를 일반 AI 추론 없이 source-exact Board 모델로 옮깁니다.
function createOriginalReverseEngineeringPreview(result: ReverseEngineeringScanResult): {
  readonly compilation: null;
  readonly diagram: DiagramJson;
} {
  return {
    compilation: null,
    diagram: markReverseEngineeringDiagram(
      createSourceExactReverseEngineeringDiagram(result.architectureJson)
    )
  };
}

// gg: shared 후보가 원본 의미를 보존한 경우에만 사용자가 고른 시각 배치를 채택합니다.
function useSelectedReverseEngineeringOrganization(
  sourceDiagram: DiagramJson,
  organizedDiagram: DiagramJson | undefined
): DiagramJson {
  if (!organizedDiagram) {
    throw new Error("선택한 Board 정리안을 찾지 못했습니다.");
  }

  if (!hasSameBoardAutoOrganizeSemantics(sourceDiagram, organizedDiagram)) {
    throw new Error("Board 정리안이 가져온 AWS 원본을 변경했습니다.");
  }

  return constrainSelectedReverseEngineeringInfrastructureFrames(
    sourceDiagram,
    organizedDiagram
  );
}

/** gg: 정리안 적용 시 프레임은 원본으로 고정하고 프레임 밖 멤버 이동은 원본 geometry로 되돌립니다. */
function constrainSelectedReverseEngineeringInfrastructureFrames(
  sourceDiagram: DiagramJson,
  organizedDiagram: DiagramJson
): DiagramJson {
  const sourceNodeById = new Map(sourceDiagram.nodes.map((node) => [node.id, node]));
  const frameByMemberNodeId = new Map<string, DiagramNode>();

  for (const frame of [...sourceDiagram.nodes]
    .filter(isReverseEngineeringInfrastructureFrameNode)
    .sort((left, right) => left.id.localeCompare(right.id))) {
    for (
      const memberNodeId of
      frame.metadata?.reverseEngineeringInfrastructureFrame?.memberNodeIds ?? []
    ) {
      if (!frameByMemberNodeId.has(memberNodeId)) {
        frameByMemberNodeId.set(memberNodeId, frame);
      }
    }
  }

  return {
    ...structuredClone(organizedDiagram),
    nodes: organizedDiagram.nodes.map((candidateNode) => {
      const sourceNode = sourceNodeById.get(candidateNode.id);
      if (!sourceNode) {
        return structuredClone(candidateNode);
      }
      if (isReverseEngineeringInfrastructureFrameNode(sourceNode)) {
        return structuredClone(sourceNode);
      }

      const frame = frameByMemberNodeId.get(sourceNode.id);
      if (
        frame &&
        !isNodeInsideReverseEngineeringInfrastructureFrame(candidateNode, frame)
      ) {
        return {
          ...structuredClone(candidateNode),
          position: structuredClone(sourceNode.position),
          size: structuredClone(sourceNode.size)
        };
      }

      return structuredClone(candidateNode);
    })
  };
}

// AWS에서 가져온 노드에 보호해야 하는 원본 값 목록을 남깁니다.
function markReverseEngineeringDiagram(
  diagram: DiagramJson,
  nodeIds?: ReadonlySet<string>
): DiagramJson {
  return {
    ...diagram,
    nodes: diagram.nodes.map((node) =>
      node.kind === "resource" && (nodeIds === undefined || nodeIds.has(node.id))
        ? markReverseEngineeringNode(node)
        : node
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

function isUnsupportedUnknownNode(node: DiagramNode): boolean {
  const values = node.parameters?.values;
  return node.type === "UNKNOWN" || values?.["analysisExcluded"] === true;
}

// 표시 프레임은 비교 항목에서 빼고 실제 AWS Resource만 추가·중복·확인 대상으로 나눕니다.
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

  for (const node of previewDiagram.nodes.filter((candidate) => candidate.kind === "resource")) {
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

  for (const node of currentDiagram.nodes.filter((candidate) => candidate.kind === "resource")) {
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
): {
  readonly diagram: DiagramJson;
  readonly sourceOwnership: ReverseEngineeringSourceOwnership;
} {
  const additionNodeIds = new Set(comparison.additions.map((item) => item.nodeId));
  const currentNodeIds = new Set(currentDiagram.nodes.map((node) => node.id));
  const currentNodesWithFrameMembership = mergeAppendedFrameMembership(
    currentDiagram.nodes,
    previewDiagram.nodes,
    additionNodeIds
  );
  const currentNodeIdsWithFrames = new Set(
    currentNodesWithFrameMembership.map((node) => node.id)
  );
  const currentFrameById = new Map(
    currentNodesWithFrameMembership
      .filter(isReverseEngineeringInfrastructureFrameNode)
      .map((node) => [node.id, node])
  );
  const previewResourceNodeById = new Map(
    previewDiagram.nodes
      .filter((node) => node.kind === "resource")
      .map((node) => [node.id, node])
  );
  const appendedFrames = previewDiagram.nodes
    .filter(isReverseEngineeringInfrastructureFrameNode)
    .flatMap((frame) => {
      const marker = frame.metadata?.reverseEngineeringInfrastructureFrame;
      const memberNodeIds = marker?.memberNodeIds.filter((nodeId) => additionNodeIds.has(nodeId));
      const members = memberNodeIds?.flatMap((nodeId) => {
        const node = previewResourceNodeById.get(nodeId);
        return node ? [node] : [];
      });

      if (
        !marker ||
        !memberNodeIds ||
        memberNodeIds.length === 0 ||
        !members ||
        members.length !== memberNodeIds.length
      ) {
        return [];
      }

      const currentFrame = currentFrameById.get(frame.id);
      const currentMemberNodeIds = new Set(
        currentFrame?.metadata?.reverseEngineeringInfrastructureFrame?.memberNodeIds ?? []
      );
      if (memberNodeIds.every((nodeId) => currentMemberNodeIds.has(nodeId))) {
        return [];
      }

      const frameId = currentNodeIdsWithFrames.has(frame.id)
        ? createAppendedInfrastructureFrameId(frame.id, memberNodeIds)
        : frame.id;
      if (currentNodeIdsWithFrames.has(frameId)) {
        return [];
      }

      return [
        fitReverseEngineeringInfrastructureFrameToMembers(frame, members, frameId)
      ];
    });
  const nodes = [
    ...currentNodesWithFrameMembership,
    ...appendedFrames,
    ...previewDiagram.nodes.filter(
      (node) => node.kind === "resource" && additionNodeIds.has(node.id)
    )
  ];
  const nodeIdsAfterAppend = new Set([...currentNodeIds, ...additionNodeIds]);
  const appendedEdges = previewDiagram.edges.filter((edge) =>
    shouldAppendEdge(edge, currentDiagram, nodeIdsAfterAppend)
  );

  return {
    diagram: {
      ...currentDiagram,
      edges: [...currentDiagram.edges, ...appendedEdges],
      nodes,
      viewport: currentDiagram.viewport
    },
    sourceOwnership: {
      nodeIds: [...additionNodeIds],
      edgeIds: appendedEdges.map((edge) => edge.id)
    }
  };
}

/** gg: 같은 표시 프레임이 이미 있으면 geometry는 지키고 새 Resource 소속만 합칩니다. */
function mergeAppendedFrameMembership(
  currentNodes: readonly DiagramNode[],
  previewNodes: readonly DiagramNode[],
  additionNodeIds: ReadonlySet<string>
): DiagramNode[] {
  const previewFrameById = new Map(
    previewNodes
      .filter(isReverseEngineeringInfrastructureFrameNode)
      .map((node) => [node.id, node])
  );
  const previewResourceNodeById = new Map(
    previewNodes
      .filter((node) => node.kind === "resource")
      .map((node) => [node.id, node])
  );

  return currentNodes.map((node) => {
    if (!isReverseEngineeringInfrastructureFrameNode(node)) {
      return structuredClone(node);
    }

    const currentMarker = node.metadata?.reverseEngineeringInfrastructureFrame;
    const previewMarker = previewFrameById.get(node.id)?.metadata
      ?.reverseEngineeringInfrastructureFrame;
    if (!currentMarker || !previewMarker) {
      return structuredClone(node);
    }

    const appendedMemberNodeIds = previewMarker.memberNodeIds.filter((nodeId) =>
      additionNodeIds.has(nodeId)
    );
    const appendedMembers = appendedMemberNodeIds.flatMap((nodeId) => {
      const member = previewResourceNodeById.get(nodeId);
      return member ? [member] : [];
    });
    if (
      appendedMemberNodeIds.length === 0 ||
      appendedMembers.length !== appendedMemberNodeIds.length ||
      appendedMembers.some(
        (member) => !isNodeInsideReverseEngineeringInfrastructureFrame(member, node)
      )
    ) {
      return structuredClone(node);
    }

    return {
      ...structuredClone(node),
      metadata: {
        ...structuredClone(node.metadata),
        reverseEngineeringInfrastructureFrame: {
          ...structuredClone(currentMarker),
          memberNodeIds: [...new Set([
            ...currentMarker.memberNodeIds,
            ...appendedMemberNodeIds
          ])].sort()
        }
      }
    };
  });
}

/** gg: 기존 같은 그룹 프레임에 안전하게 들어가지 않는 추가분은 별도 안정 ID 프레임으로 보존합니다. */
function createAppendedInfrastructureFrameId(
  baseFrameId: string,
  memberNodeIds: readonly string[]
): string {
  let hash = 0x811c9dc5;
  const value = [...memberNodeIds].sort().join("|");

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `${baseFrameId}:append:${(hash >>> 0).toString(16).padStart(8, "0")}`;
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
