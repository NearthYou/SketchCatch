import { type KeyboardEvent, useState } from "react";
import { Box, MoreHorizontal } from "lucide-react";
import type { DiagramEditorPanelContext } from "../diagram-editor";
import { getResourceCardKeyboardActivation } from "./resource-card-interaction";
import { ResourceCardMenu } from "./ResourceCardMenu";
import type { buildResourceListItems } from "./resource-list-summary";
import { openResourceConfig, selectResourceNode } from "./resource-workspace-actions";
import type { ResourceWorkspaceView } from "./workspace-right-panel.types";
import styles from "./resource-workspace.module.css";

const RESOURCE_SUMMARY_COLLAPSED_LIMIT = 5;

type ResourceCardActivationContext = {
  readonly context: DiagramEditorPanelContext;
  readonly nodeId: string;
  readonly onViewChange: (view: ResourceWorkspaceView) => void;
};

// Board에 놓인 Resource를 선택하고 설정 화면으로 들어갈 수 있는 목록을 보여줍니다.
export function ResourceListPanel({
  context,
  items,
  onViewChange
}: {
  readonly context: DiagramEditorPanelContext;
  readonly items: ReturnType<typeof buildResourceListItems>;
  readonly onViewChange: (view: ResourceWorkspaceView) => void;
}) {
  const [expandedNodeIds, setExpandedNodeIds] = useState<ReadonlySet<string>>(() => new Set());
  const [openMenuNodeId, setOpenMenuNodeId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className={styles.resourceListEmpty}>
        <Box aria-hidden="true" size={20} />
        <strong>보드에 Resource가 없습니다</strong>
        <span>왼쪽 목록에서 Resource를 보드에 추가해 주세요.</span>
      </div>
    );
  }

  return (
    <section className={styles.resourceListPanel} aria-label="보드 Resource 목록">
      <header className={styles.resourceListTitle}>
        <div>
          <span>Resources</span>
          <h2>보드 Resource</h2>
        </div>
        <strong>{items.length}개</strong>
      </header>
      <div className={styles.resourceListBody}>
        {items.map((item) => {
          const { node } = item;
          const summaryRows = item.rows;
          const isActive = item.nodeId === context.selectedNodeId;
          const isExpanded = expandedNodeIds.has(item.nodeId);
          const visibleSummaryRows = isExpanded
            ? summaryRows
            : summaryRows.slice(0, RESOURCE_SUMMARY_COLLAPSED_LIMIT);
          const hasHiddenSummaryRows = summaryRows.length > RESOURCE_SUMMARY_COLLAPSED_LIMIT;

          return (
            <article
              className={isActive ? styles.resourceListItemActive : styles.resourceListItem}
              key={item.nodeId}
              onClick={() => selectResourceNode(context, item.nodeId)}
              onDoubleClick={() => openResourceConfig(context, item.nodeId, onViewChange)}
              onKeyDown={(event) =>
                handleResourceCardKeyDown(event, {
                  context,
                  nodeId: item.nodeId,
                  onViewChange
                })
              }
              tabIndex={0}
            >
              <div className={styles.resourceListHeader}>
                <span className={styles.resourceListIdentity}>
                  <span className={styles.resourceListServiceIcon}>
                    {item.iconUrl ? (
                      <img alt="" draggable={false} src={item.iconUrl} />
                    ) : (
                      <Box size={15} aria-hidden="true" />
                    )}
                  </span>
                  <strong>{item.displayName}</strong>
                </span>
                <button
                  aria-expanded={openMenuNodeId === item.nodeId}
                  aria-haspopup="menu"
                  aria-label={`${item.displayName} 작업`}
                  className={styles.resourceListMoreButton}
                  onClick={(event) => {
                    event.stopPropagation();
                    selectResourceNode(context, item.nodeId);
                    setOpenMenuNodeId((currentNodeId) =>
                      currentNodeId === item.nodeId ? null : item.nodeId
                    );
                  }}
                  onDoubleClick={(event) => event.stopPropagation()}
                  type="button"
                >
                  <MoreHorizontal size={18} aria-hidden="true" />
                </button>
                {openMenuNodeId === item.nodeId ? (
                  <ResourceCardMenu
                    context={context}
                    node={node}
                    onClose={() => setOpenMenuNodeId(null)}
                    onEditConfig={() => {
                      openResourceConfig(context, item.nodeId, onViewChange);
                      setOpenMenuNodeId(null);
                    }}
                  />
                ) : null}
              </div>
              <div className={styles.resourceListAddress}>
                {item.terraformAddress ?? item.typeLabel}
              </div>
              {summaryRows.length > 0 ? (
                <div className={styles.resourceListValues}>
                  {visibleSummaryRows.map((row) => (
                    <div className={styles.resourceListValueRow} key={row.key}>
                      <span>{row.label}</span>
                      <strong title={row.value}>{row.value}</strong>
                    </div>
                  ))}
                  {hasHiddenSummaryRows ? (
                    <button
                      className={styles.resourceListConfigToggle}
                      onClick={(event) => {
                        event.stopPropagation();
                        setExpandedNodeIds((currentNodeIds) =>
                          isExpanded
                            ? removeSetValue(currentNodeIds, item.nodeId)
                            : addSetValue(currentNodeIds, item.nodeId)
                        );
                      }}
                      onDoubleClick={(event) => event.stopPropagation()}
                      type="button"
                    >
                      <span aria-hidden="true">{isExpanded ? "-" : "+"}</span>
                      {isExpanded ? "상세 접기" : "모두 보기"}
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className={styles.resourceListNoValues}>주요 파라미터 없음</div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

// 키보드 사용자가 Resource 선택과 설정 열기를 같은 목록에서 할 수 있게 합니다.
function handleResourceCardKeyDown(
  event: KeyboardEvent<HTMLElement>,
  activationContext: ResourceCardActivationContext
): void {
  const { context, nodeId, onViewChange } = activationContext;
  const activation = getResourceCardKeyboardActivation(event.key);

  if (activation === "ignore") {
    return;
  }

  event.preventDefault();

  if (activation === "open-settings") {
    openResourceConfig(context, nodeId, onViewChange);
    return;
  }

  selectResourceNode(context, nodeId);
}

// 펼친 Resource ID를 복사한 Set에 추가합니다.
function addSetValue<T>(values: ReadonlySet<T>, value: T): ReadonlySet<T> {
  const nextValues = new Set(values);
  nextValues.add(value);
  return nextValues;
}

// 접은 Resource ID를 복사한 Set에서 제거합니다.
function removeSetValue<T>(values: ReadonlySet<T>, value: T): ReadonlySet<T> {
  const nextValues = new Set(values);
  nextValues.delete(value);
  return nextValues;
}
