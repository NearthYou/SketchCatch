import type { DiagramNode } from "@sketchcatch/types";
import type { DiagramEditorPanelContext } from "../diagram-editor";
import { applyNodeParametersUpdateWithResourceLabel } from "../diagram-editor/diagram-utils";
import type { ResourceWorkspaceView } from "./workspace-right-panel.types";

// 목록에서 고른 Resource를 Board 선택 상태와 맞춥니다.
export function selectResourceNode(context: DiagramEditorPanelContext, nodeId: string): void {
  context.selectResourceNode(nodeId);
}

// Resource를 선택한 뒤 같은 오른쪽 패널에서 설정 화면을 엽니다.
export function openResourceConfig(
  context: DiagramEditorPanelContext,
  nodeId: string,
  onViewChange: (view: ResourceWorkspaceView) => void
): void {
  selectResourceNode(context, nodeId);
  onViewChange("settings");
}

// Resource와 파라미터를 깊은 복사해 원본과 독립된 새 Board node를 만듭니다.
export function duplicateResourceNode(context: DiagramEditorPanelContext, node: DiagramNode): void {
  const nextNodeId = createResourceNodeId(node.id);
  const nextResourceName = createDuplicateResourceName(context.nodes, node);
  const duplicatedNodeBase: DiagramNode = {
    ...node,
    id: nextNodeId,
    label: `${getNodeDisplayName(node)} copy`,
    position: {
      x: node.position.x + 36,
      y: node.position.y + 36
    },
    zIndex: getNextResourceZIndex(context.nodes),
    parameters: node.parameters ? structuredClone(node.parameters) : undefined
  };
  const duplicatedNode = node.parameters && nextResourceName
    ? applyNodeParametersUpdateWithResourceLabel(duplicatedNodeBase, {
        ...structuredClone(node.parameters),
        resourceName: nextResourceName
      })
    : duplicatedNodeBase;

  context.applyDiagramJson({
    ...context.diagram,
    nodes: [...context.diagram.nodes, duplicatedNode]
  });
  context.focusResourceNode(nextNodeId);
}

// Resource와 연결선을 함께 제거해 끊어진 관계가 Board에 남지 않게 합니다.
export function deleteResourceNode(context: DiagramEditorPanelContext, nodeId: string): void {
  context.applyDiagramJson({
    ...context.diagram,
    edges: context.diagram.edges.filter(
      (edge) => edge.sourceNodeId !== nodeId && edge.targetNodeId !== nodeId
    ),
    nodes: context.diagram.nodes.filter((node) => node.id !== nodeId)
  });
  context.closeInspectedNode();
}

// 같은 Terraform Resource 이름이 겹치지 않도록 copy 번호를 붙입니다.
function createDuplicateResourceName(
  nodes: readonly DiagramNode[],
  node: DiagramNode
): string | undefined {
  const resourceType = node.parameters?.resourceType;
  const resourceName = node.parameters?.resourceName;

  if (!resourceType || !resourceName) {
    return undefined;
  }

  const usedNames = new Set(
    nodes
      .filter((candidate) => candidate.parameters?.resourceType === resourceType)
      .map((candidate) => candidate.parameters?.resourceName)
      .filter((candidateName): candidateName is string => Boolean(candidateName))
  );
  const baseName = resourceName.replace(/_copy(?:_\d+)?$/u, "") || "resource";
  let candidate = `${baseName}_copy`;
  let index = 2;

  while (usedNames.has(candidate)) {
    candidate = `${baseName}_copy_${index}`;
    index += 1;
  }

  return candidate;
}

// 복제한 node가 원본과 충돌하지 않는 고유 ID를 만들도록 합니다.
function createResourceNodeId(baseId: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${baseId}-copy-${crypto.randomUUID()}`;
  }

  return `${baseId}-copy-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// 복제 Resource가 기존 Resource보다 위에 표시될 z-index를 정합니다.
function getNextResourceZIndex(nodes: readonly DiagramNode[]): number {
  return Math.max(0, ...nodes.map((node) => node.zIndex)) + 1;
}

// 복제 이름에 사용할 사람이 읽을 수 있는 Resource 이름을 고릅니다.
function getNodeDisplayName(node: DiagramNode): string {
  return node.label || node.parameters?.resourceName || node.parameters?.resourceType || node.type;
}
