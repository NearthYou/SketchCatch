import { type KeyboardEvent, useMemo, useState } from "react";
import type { DiagramNode } from "@sketchcatch/types";
import {
  ArrowLeft,
  Box,
  CopyPlus,
  Edit3,
  Maximize2,
  MoreHorizontal,
  Minimize2,
  Trash2
} from "lucide-react";
import type { DiagramEditorPanelContext } from "../diagram-editor";
import { applyNodeParametersUpdateWithResourceLabel } from "../diagram-editor/diagram-utils";
import { ParameterInputPanel, terraformParameterCatalog } from "../parameter-input";
import { getResourceCardKeyboardActivation } from "./resource-card-interaction";
import { buildResourceListItems } from "./resource-list-summary";
import {
  getResourceWorkspaceToolbarState,
  getVisibleResourceWorkspaceView
} from "./resource-workspace-view";
import type { ResourceWorkspaceView } from "./workspace-right-panel.types";
import styles from "./workspace.module.css";

const RESOURCE_SUMMARY_COLLAPSED_LIMIT = 5;

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
  const toolbarState = getResourceWorkspaceToolbarState(visibleView);

  return (
    <div className={styles.resourceWorkspacePanel}>
      <div className={styles.resourceSectionToolbar}>
        <div className={styles.resourceSectionTabs} aria-label="Resource navigation">
          {toolbarState.action === "back-to-list" ? (
            <button
              aria-label="Back to resource list"
              className={styles.resourceSectionButton}
              onClick={() => onViewChange("list")}
              title="Back to resource list"
              type="button"
            >
              <ArrowLeft size={18} aria-hidden="true" />
            </button>
          ) : (
            <button
              aria-label="Resource list"
              aria-pressed={true}
              className={styles.resourceSectionButtonActive}
              onClick={() => onViewChange("list")}
              title="Resource list"
              type="button"
            >
              <Box size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {visibleView === "settings" ? (
        <ParameterInputPanel {...context} />
      ) : (
        <ResourceListPanel context={context} items={resourceListItems} onViewChange={onViewChange} />
      )}
    </div>
  );
}

function ResourceListPanel({
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
        <strong>No resources on canvas</strong>
        <span>Drag resources onto the board to see them here.</span>
      </div>
    );
  }

  return (
    <div className={styles.resourceListPanel}>
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
            onClick={() => selectNode(context, item.nodeId)}
            onDoubleClick={() => openResourceConfig(context, item.nodeId, onViewChange)}
            onKeyDown={(event) => handleResourceCardKeyDown(event, context, item.nodeId, onViewChange)}
            tabIndex={0}
          >
            <div className={styles.resourceListHeader}>
              <span className={styles.resourceListIdentity}>
                <span className={styles.resourceListCubeIcon}>
                  <Box size={16} aria-hidden="true" />
                </span>
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
                aria-label={`${item.displayName} actions`}
                className={styles.resourceListMoreButton}
                onClick={(event) => {
                  event.stopPropagation();
                  selectNode(context, item.nodeId);
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
                  isExpanded={isExpanded}
                  node={node}
                  onClose={() => setOpenMenuNodeId(null)}
                  onEditConfig={() => {
                    openResourceConfig(context, item.nodeId, onViewChange);
                    setOpenMenuNodeId(null);
                  }}
                  onToggleSize={() => {
                    setExpandedNodeIds((currentNodeIds) =>
                      isExpanded
                        ? removeSetValue(currentNodeIds, item.nodeId)
                        : addSetValue(currentNodeIds, item.nodeId)
                    );
                    setOpenMenuNodeId(null);
                  }}
                  canMaximize={hasHiddenSummaryRows}
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
                    {isExpanded ? "Minimize details" : "Show all details"}
                  </button>
                ) : null}
              </div>
            ) : (
              <div className={styles.resourceListNoValues}>No key parameters</div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function handleResourceCardKeyDown(
  event: KeyboardEvent<HTMLElement>,
  context: DiagramEditorPanelContext,
  nodeId: string,
  onViewChange: (view: ResourceWorkspaceView) => void
): void {
  const activation = getResourceCardKeyboardActivation(event.key);

  if (activation === "ignore") {
    return;
  }

  event.preventDefault();

  if (activation === "open-settings") {
    openResourceConfig(context, nodeId, onViewChange);
    return;
  }

  selectNode(context, nodeId);
}

function ResourceCardMenu({
  canMaximize,
  context,
  isExpanded,
  node,
  onClose,
  onEditConfig,
  onToggleSize
}: {
  readonly canMaximize: boolean;
  readonly context: DiagramEditorPanelContext;
  readonly isExpanded: boolean;
  readonly node: DiagramNode;
  readonly onClose: () => void;
  readonly onEditConfig: () => void;
  readonly onToggleSize: () => void;
}) {
  const terraformBlockType = node.parameters?.terraformBlockType === "data" ? "data" : "resource";
  const switchLabel = terraformBlockType === "data" ? "Switch to resource" : "Switch to data source";
  const isToggleDisabled = !isExpanded && !canMaximize;

  return (
    <div
      className={styles.resourceCardMenu}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      role="menu"
    >
      <button
        className={styles.resourceCardMenuItem}
        onClick={() => {
          onEditConfig();
        }}
        role="menuitem"
        type="button"
      >
        <Edit3 size={17} aria-hidden="true" />
        <span>Edit config</span>
      </button>
      <button
        className={styles.resourceCardMenuItem}
        onClick={() => {
          switchTerraformBlockType(context, node);
          onClose();
        }}
        role="menuitem"
        type="button"
      >
        <Box size={17} aria-hidden="true" />
        <span>{switchLabel}</span>
      </button>
      <button
        className={styles.resourceCardMenuItem}
        onClick={() => {
          duplicateResourceNode(context, node);
          onClose();
        }}
        role="menuitem"
        type="button"
      >
        <CopyPlus size={17} aria-hidden="true" />
        <span>Duplicate</span>
      </button>
      <button
        className={styles.resourceCardMenuItem}
        disabled={isToggleDisabled}
        onClick={onToggleSize}
        role="menuitem"
        type="button"
      >
        {isExpanded ? (
          <Minimize2 size={17} aria-hidden="true" />
        ) : (
          <Maximize2 size={17} aria-hidden="true" />
        )}
        <span>{isExpanded ? "Minimize" : "Maximize"}</span>
      </button>
      <button
        className={`${styles.resourceCardMenuItem} ${styles.resourceCardMenuDanger}`}
        onClick={() => {
          deleteResourceNode(context, node.id);
          onClose();
        }}
        role="menuitem"
        type="button"
      >
        <Trash2 size={17} aria-hidden="true" />
        <span>Delete</span>
      </button>
    </div>
  );
}

function selectNode(context: DiagramEditorPanelContext, nodeId: string): void {
  context.selectResourceNode(nodeId);
}

function openResourceConfig(
  context: DiagramEditorPanelContext,
  nodeId: string,
  onViewChange: (view: ResourceWorkspaceView) => void
): void {
  selectNode(context, nodeId);
  onViewChange("settings");
}

function switchTerraformBlockType(context: DiagramEditorPanelContext, node: DiagramNode): void {
  if (!node.parameters) {
    return;
  }

  context.updateNodeParameters(node.id, {
    ...node.parameters,
    terraformBlockType: node.parameters.terraformBlockType === "data" ? "resource" : "data"
  });
}

function duplicateResourceNode(context: DiagramEditorPanelContext, node: DiagramNode): void {
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
    ? applyNodeParametersUpdateWithResourceLabel(
        duplicatedNodeBase,
        {
          ...structuredClone(node.parameters),
          resourceName: nextResourceName
        }
      )
    : duplicatedNodeBase;

  context.applyDiagramJson({
    ...context.diagram,
    nodes: [...context.diagram.nodes, duplicatedNode]
  });
  context.focusResourceNode(nextNodeId);
}

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

function deleteResourceNode(context: DiagramEditorPanelContext, nodeId: string): void {
  context.applyDiagramJson({
    ...context.diagram,
    edges: context.diagram.edges.filter((edge) => edge.sourceNodeId !== nodeId && edge.targetNodeId !== nodeId),
    nodes: context.diagram.nodes.filter((node) => node.id !== nodeId)
  });
  context.closeInspectedNode();
}

function addSetValue<T>(values: ReadonlySet<T>, value: T): ReadonlySet<T> {
  const nextValues = new Set(values);
  nextValues.add(value);
  return nextValues;
}

function removeSetValue<T>(values: ReadonlySet<T>, value: T): ReadonlySet<T> {
  const nextValues = new Set(values);
  nextValues.delete(value);
  return nextValues;
}

function createResourceNodeId(baseId: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${baseId}-copy-${crypto.randomUUID()}`;
  }

  return `${baseId}-copy-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getNextResourceZIndex(nodes: readonly DiagramNode[]): number {
  return Math.max(0, ...nodes.map((node) => node.zIndex)) + 1;
}

function getNodeDisplayName(node: DiagramNode): string {
  return node.label || node.parameters?.resourceName || node.parameters?.resourceType || node.type;
}
