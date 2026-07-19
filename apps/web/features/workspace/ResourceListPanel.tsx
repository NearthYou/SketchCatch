import { type KeyboardEvent, useState } from "react";
import { Box, ChevronDown } from "lucide-react";
import type { DiagramEditorPanelContext } from "../diagram-editor";
import { ResourceIconImage } from "../../components/ui/ResourceIconImage";
import { getResourceCardKeyboardActivation } from "./resource-card-interaction";
import type { buildResourceListItems } from "./resource-list-summary";
import { openResourceConfig, selectResourceNode } from "./resource-workspace-actions";
import type { ResourceWorkspaceView } from "./workspace-right-panel.types";
import styles from "./resource-workspace.module.css";

type ResourceCardActivationContext = {
  readonly context: DiagramEditorPanelContext;
  readonly nodeId: string;
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
          <h2>보드 Resource</h2>
        </div>
        <strong>{items.length}개</strong>
      </header>
      <div className={styles.resourceListBody}>
        {items.map((item) => {
          const summaryRows = item.rows;
          const isActive = item.nodeId === context.selectedNodeId;
          const isExpanded = expandedNodeIds.has(item.nodeId);
          const detailsId = `resource-details-${item.nodeId}`;

          return (
            <article
              className={isActive ? styles.resourceListItemActive : styles.resourceListItem}
              key={item.nodeId}
              onClick={() => selectResourceNode(context, item.nodeId)}
              onKeyDown={(event) =>
                handleResourceCardKeyDown(event, {
                  context,
                  nodeId: item.nodeId
                })
              }
              tabIndex={0}
            >
              <div className={styles.resourceListHeader}>
                <span className={styles.resourceListIdentity}>
                  <span className={styles.resourceListServiceIcon}>
                    <ResourceIconImage
                      alt=""
                      className={styles.resourceListServiceIconImage}
                      fallbackClassName={styles.resourceListServiceIconFallback}
                      fallbackSize={15}
                      src={item.iconUrl}
                    />
                  </span>
                  <button
                    className={styles.resourceListNameButton}
                    onClick={(event) => {
                      event.stopPropagation();
                      selectResourceNode(context, item.nodeId);
                      openResourceConfig(context, item.nodeId, onViewChange);
                    }}
                    onDoubleClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                    type="button"
                  >
                    {item.displayName}
                  </button>
                </span>
                <button
                  aria-controls={detailsId}
                  aria-expanded={isExpanded}
                  aria-label={`${item.displayName} 상세 정보 ${isExpanded ? "접기" : "펼치기"}`}
                  className={styles.resourceListDisclosureButton}
                  onClick={(event) => {
                    event.stopPropagation();
                    setExpandedNodeIds((currentNodeIds) =>
                      currentNodeIds.has(item.nodeId)
                        ? removeSetValue(currentNodeIds, item.nodeId)
                        : addSetValue(currentNodeIds, item.nodeId)
                    );
                  }}
                  onDoubleClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                  type="button"
                >
                  <ChevronDown
                    aria-hidden="true"
                    className={
                      isExpanded
                        ? styles.resourceListDisclosureIconExpanded
                        : styles.resourceListDisclosureIcon
                    }
                    size={18}
                  />
                </button>
              </div>
              <div className={styles.resourceListAddress}>
                {item.terraformAddress ?? item.typeLabel}
              </div>
              {summaryRows.length > 0 ? (
                <div className={styles.resourceListValues} hidden={!isExpanded} id={detailsId}>
                  {summaryRows.map((row) => (
                    <div className={styles.resourceListValueRow} key={row.key}>
                      <span>{row.label}</span>
                      <strong title={row.value}>{row.value}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.resourceListNoValues} hidden={!isExpanded} id={detailsId}>
                  주요 파라미터 없음
                </div>
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
  const { context, nodeId } = activationContext;
  const activation = getResourceCardKeyboardActivation(event.key);

  if (activation === "ignore") {
    return;
  }

  event.preventDefault();
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
