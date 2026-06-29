import { type KeyboardEvent, useMemo, useState } from "react";
import type { DiagramNode } from "@sketchcatch/types";
import {
  Box,
  CopyPlus,
  Edit3,
  ListTree,
  Maximize2,
  MoreHorizontal,
  Minimize2,
  Trash2
} from "lucide-react";
import type { DiagramEditorPanelContext } from "../diagram-editor";
import { ParameterInputPanel } from "../parameter-input";
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
  const resourceNodes = useMemo(
    () => context.nodes.filter((node) => node.kind === "resource" || node.parameters?.resourceType),
    [context.nodes]
  );

  return (
    <div className={styles.resourceWorkspacePanel}>
      <div className={styles.resourceSectionToolbar}>
        <div className={styles.resourceSectionTabs} aria-label="Resource sections">
          <button
            aria-pressed={view === "settings"}
            className={
              view === "settings"
                ? styles.resourceSectionButtonActive
                : styles.resourceSectionButton
            }
            onClick={() => onViewChange("settings")}
            title="Resource settings"
            type="button"
          >
            <Box size={18} aria-hidden="true" />
          </button>
          <button
            aria-pressed={view === "list"}
            className={
              view === "list"
                ? styles.resourceSectionButtonActive
                : styles.resourceSectionButton
            }
            onClick={() => onViewChange("list")}
            title="Resource list"
            type="button"
          >
            <ListTree size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      {view === "settings" ? (
        <ParameterInputPanel {...context} />
      ) : (
        <ResourceListPanel context={context} nodes={resourceNodes} onViewChange={onViewChange} />
      )}
    </div>
  );
}

function ResourceListPanel({
  context,
  nodes,
  onViewChange
}: {
  readonly context: DiagramEditorPanelContext;
  readonly nodes: readonly DiagramNode[];
  readonly onViewChange: (view: ResourceWorkspaceView) => void;
}) {
  const [expandedNodeIds, setExpandedNodeIds] = useState<ReadonlySet<string>>(() => new Set());
  const [openMenuNodeId, setOpenMenuNodeId] = useState<string | null>(null);

  if (nodes.length === 0) {
    return (
      <div className={styles.resourceListEmpty}>
        <strong>No resources on canvas</strong>
        <span>Drag resources onto the board to see them here.</span>
      </div>
    );
  }

  return (
    <div className={styles.resourceListPanel}>
      {nodes.map((node) => {
        const summaryRows = getResourceSummaryRows(node);
        const isActive = node.id === context.selectedNodeId;
        const isExpanded = expandedNodeIds.has(node.id);
        const visibleSummaryRows = isExpanded
          ? summaryRows
          : summaryRows.slice(0, RESOURCE_SUMMARY_COLLAPSED_LIMIT);
        const hasHiddenSummaryRows = summaryRows.length > RESOURCE_SUMMARY_COLLAPSED_LIMIT;

        return (
          <article
            className={isActive ? styles.resourceListItemActive : styles.resourceListItem}
            key={node.id}
            onClick={() => focusNode(context, node.id)}
            onDoubleClick={() => openResourceConfig(context, node.id, onViewChange)}
            onKeyDown={(event) => handleResourceCardKeyDown(event, context, node.id)}
            tabIndex={0}
          >
            <div className={styles.resourceListHeader}>
              <span className={styles.resourceListIdentity}>
                <span className={styles.resourceListCubeIcon}>
                  <Box size={16} aria-hidden="true" />
                </span>
                <span className={styles.resourceListServiceIcon}>
                  {node.iconUrl ? (
                    <img alt="" draggable={false} src={node.iconUrl} />
                  ) : (
                    <Box size={15} aria-hidden="true" />
                  )}
                </span>
                <strong>{getNodeDisplayName(node)}</strong>
              </span>
              <button
                aria-expanded={openMenuNodeId === node.id}
                aria-haspopup="menu"
                aria-label={`${getNodeDisplayName(node)} actions`}
                className={styles.resourceListMoreButton}
                onClick={(event) => {
                  event.stopPropagation();
                  focusNode(context, node.id);
                  setOpenMenuNodeId((currentNodeId) => (currentNodeId === node.id ? null : node.id));
                }}
                onDoubleClick={(event) => event.stopPropagation()}
                type="button"
              >
                <MoreHorizontal size={18} aria-hidden="true" />
              </button>
              {openMenuNodeId === node.id ? (
                <ResourceCardMenu
                  context={context}
                  isExpanded={isExpanded}
                  node={node}
                  onClose={() => setOpenMenuNodeId(null)}
                  onEditConfig={() => {
                    openResourceConfig(context, node.id, onViewChange);
                    setOpenMenuNodeId(null);
                  }}
                  onToggleSize={() => {
                    setExpandedNodeIds((currentNodeIds) =>
                      isExpanded ? removeSetValue(currentNodeIds, node.id) : addSetValue(currentNodeIds, node.id)
                    );
                    setOpenMenuNodeId(null);
                  }}
                  canMaximize={hasHiddenSummaryRows}
                />
              ) : null}
            </div>
            <div className={styles.resourceListAddress}>{getNodeTerraformAddress(node)}</div>
            {summaryRows.length > 0 ? (
              <div className={styles.resourceListValues}>
                {visibleSummaryRows.map((row) => (
                  <div className={styles.resourceListValueRow} key={row.key}>
                    <span>{row.label}</span>
                    <InlineResourceValueInput
                      context={context}
                      node={node}
                      parameterKey={row.key}
                      value={row.rawValue}
                    />
                  </div>
                ))}
                {hasHiddenSummaryRows ? (
                  <button
                    className={styles.resourceListConfigToggle}
                    onClick={(event) => {
                      event.stopPropagation();
                      setExpandedNodeIds((currentNodeIds) =>
                        isExpanded ? removeSetValue(currentNodeIds, node.id) : addSetValue(currentNodeIds, node.id)
                      );
                    }}
                    onDoubleClick={(event) => event.stopPropagation()}
                    type="button"
                  >
                    <span aria-hidden="true">{isExpanded ? "-" : "+"}</span>
                    {isExpanded ? "Minimize configuration" : "Show full configuration"}
                  </button>
                ) : null}
              </div>
            ) : (
              <div className={styles.resourceListNoValues}>No configured parameters</div>
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
  nodeId: string
): void {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  focusNode(context, nodeId);
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
          focusNode(context, node.id);
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

function focusNode(context: DiagramEditorPanelContext, nodeId: string): void {
  context.focusResourceNode(nodeId);
  context.setRightPanelOpen(true);
}

function openResourceConfig(
  context: DiagramEditorPanelContext,
  nodeId: string,
  onViewChange: (view: ResourceWorkspaceView) => void
): void {
  focusNode(context, nodeId);
  onViewChange("settings");
}

function InlineResourceValueInput({
  context,
  node,
  parameterKey,
  value
}: {
  readonly context: DiagramEditorPanelContext;
  readonly node: DiagramNode;
  readonly parameterKey: string;
  readonly value: unknown;
}) {
  if (!node.parameters || !isInlineEditableResourceValue(value)) {
    return <strong title={formatResourceSummaryValue(value)}>{formatResourceSummaryValue(value)}</strong>;
  }

  if (typeof value === "boolean") {
    return (
      <select
        className={styles.resourceListInlineSelect}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => updateInlineParameterValue(context, node, parameterKey, event.target.value === "true")}
        onDoubleClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        value={String(value)}
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }

  return (
    <input
      className={styles.resourceListInlineInput}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) =>
        updateInlineParameterValue(context, node, parameterKey, parseInlineResourceValue(event.target.value, value))
      }
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      value={String(value)}
    />
  );
}

function updateInlineParameterValue(
  context: DiagramEditorPanelContext,
  node: DiagramNode,
  parameterKey: string,
  value: string | number | boolean
): void {
  if (!node.parameters) {
    return;
  }

  context.updateNodeParameters(node.id, {
    ...node.parameters,
    values: {
      ...node.parameters.values,
      [parameterKey]: value
    }
  });
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
  const nextResourceName = node.parameters?.resourceName ? `${node.parameters.resourceName}_copy` : undefined;
  const duplicatedNode: DiagramNode = {
    ...node,
    id: nextNodeId,
    label: `${getNodeDisplayName(node)} copy`,
    position: {
      x: node.position.x + 36,
      y: node.position.y + 36
    },
    zIndex: getNextResourceZIndex(context.nodes),
    parameters: node.parameters
      ? {
          ...node.parameters,
          resourceName: nextResourceName ?? node.parameters.resourceName
        }
      : node.parameters
  };

  context.applyDiagramJson({
    ...context.diagram,
    nodes: [...context.diagram.nodes, duplicatedNode]
  });
  context.focusResourceNode(nextNodeId);
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

  return `${baseId}-copy-${Date.now()}`;
}

function getNextResourceZIndex(nodes: readonly DiagramNode[]): number {
  return Math.max(0, ...nodes.map((node) => node.zIndex)) + 1;
}

function getNodeDisplayName(node: DiagramNode): string {
  return node.label || node.parameters?.resourceName || node.parameters?.resourceType || node.type;
}

function getNodeTerraformAddress(node: DiagramNode): string {
  const blockType = node.parameters?.terraformBlockType === "data" ? "data" : "resource";
  const resourceType = node.parameters?.resourceType;
  const resourceName = node.parameters?.resourceName;

  if (!resourceType || !resourceName) {
    return node.type;
  }

  return `${blockType}.${resourceType}.${resourceName}`;
}

function getResourceSummaryRows(node: DiagramNode): Array<{ key: string; label: string; rawValue: unknown }> {
  const values = node.parameters?.values ?? {};

  return Object.entries(values)
    .filter(([, value]) => !isEmptyResourceValue(value))
    .map(([key, value]) => ({
      key,
      label: toResourceSummaryLabel(key),
      rawValue: value
    }));
}

function isEmptyResourceValue(value: unknown): boolean {
  if (value === null || value === undefined || value === "") {
    return true;
  }

  if (Array.isArray(value)) {
    return value.length === 0 || value.every(isEmptyResourceValue);
  }

  if (typeof value === "object") {
    return Object.keys(value).length === 0;
  }

  return false;
}

function toResourceSummaryLabel(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^./, (firstLetter) => firstLetter.toUpperCase());
}

function formatResourceSummaryValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .filter((item) => !isEmptyResourceValue(item))
      .map(formatResourceSummaryValue)
      .join(", ");
  }

  if (typeof value === "object" && value !== null) {
    return Object.values(value)
      .filter((item) => !isEmptyResourceValue(item))
      .map(formatResourceSummaryValue)
      .join(", ");
  }

  return "";
}

function isInlineEditableResourceValue(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function parseInlineResourceValue(value: string, previousValue: string | number | boolean): string | number {
  if (typeof previousValue !== "number") {
    return value;
  }

  const nextNumber = Number(value);
  return Number.isFinite(nextNumber) ? nextNumber : previousValue;
}
