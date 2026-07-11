import { useEffect, useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import type { DiagramEditorPanelContext } from "../diagram-editor";
import { ParameterInputPanel, terraformParameterCatalog } from "../parameter-input";
import { buildResourceListItems } from "./resource-list-summary";
import { ResourceListPanel } from "./ResourceListPanel";
import { getVisibleResourceWorkspaceView } from "./resource-workspace-view";
import type { ResourceWorkspaceView } from "./workspace-right-panel.types";
import styles from "./resource-workspace.module.css";

// 오른쪽 Resource 영역에서 목록과 선택한 Resource의 설정 화면을 전환합니다.
export function ResourceWorkspacePanel({
  context,
  onViewChange,
  view
}: {
  readonly context: DiagramEditorPanelContext;
  readonly onViewChange: (view: ResourceWorkspaceView) => void;
  readonly view: ResourceWorkspaceView;
}) {
  const resourceListItems = useMemo(
    () => buildResourceListItems(context.nodes, terraformParameterCatalog),
    [context.nodes]
  );
  const visibleView = getVisibleResourceWorkspaceView(view, context.selectedNodeId);

  /** Board에서 선택한 Resource를 오른쪽 상세 설정으로 바로 연결합니다. */
  useEffect(() => {
    if (context.inspectedNodeId) {
      onViewChange("settings");
    }
  }, [context.inspectedNodeId, onViewChange]);

  return (
    <div className={styles.resourceWorkspacePanel}>
      {visibleView === "settings" ? (
        <div className={styles.resourceSettingsPanel}>
          <div className={styles.resourceSettingsHeader}>
            <button
              aria-label="Resource 목록으로 돌아가기"
              className={styles.resourceSettingsBackButton}
              onClick={() => {
                context.closeInspectedNode();
                onViewChange("list");
              }}
              title="Resource 목록으로 돌아가기"
              type="button"
            >
              <ArrowLeft size={18} aria-hidden="true" />
              <span>Resource 목록</span>
            </button>
          </div>
          <ParameterInputPanel {...context} />
        </div>
      ) : (
        <ResourceListPanel context={context} items={resourceListItems} onViewChange={onViewChange} />
      )}
    </div>
  );
}
