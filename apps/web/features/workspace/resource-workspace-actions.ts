import type { DiagramEditorPanelContext } from "../diagram-editor";
import type { ResourceWorkspaceView } from "./workspace-right-panel.types";

// 목록에서 고른 Resource를 Board 선택 상태와 맞춥니다.
export function selectResourceNode(context: DiagramEditorPanelContext, nodeId: string): void {
  context.selectResourceNode(nodeId);
}

// Resource를 선택한 뒤 오른쪽 패널에서 설정 화면을 엽니다.
export function openResourceConfig(
  context: DiagramEditorPanelContext,
  nodeId: string,
  onViewChange: (view: ResourceWorkspaceView) => void
): void {
  selectResourceNode(context, nodeId);
  onViewChange("settings");
}
