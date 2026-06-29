import { useMemo } from "react";
import type { DiagramNode } from "@sketchcatch/types";
import { Box, ListTree, MoreHorizontal } from "lucide-react";
import type { DiagramEditorPanelContext } from "../diagram-editor";
import { ParameterInputPanel } from "../parameter-input";
import type { ResourceWorkspaceView } from "./workspace-right-panel.types";
import styles from "./workspace.module.css";

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
        <ResourceListPanel context={context} nodes={resourceNodes} />
      )}
    </div>
  );
}

function ResourceListPanel({
  context,
  nodes
}: {
  readonly context: DiagramEditorPanelContext;
  readonly nodes: readonly DiagramNode[];
}) {
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

        return (
          <button
            className={
              node.id === context.selectedNodeId
                ? styles.resourceListItemActive
                : styles.resourceListItem
            }
            key={node.id}
            onClick={() => context.focusResourceNode(node.id)}
            type="button"
          >
            <span className={styles.resourceListHeader}>
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
              <MoreHorizontal size={18} aria-hidden="true" />
            </span>
            <span className={styles.resourceListAddress}>{getNodeTerraformAddress(node)}</span>
            {summaryRows.length > 0 ? (
              <span className={styles.resourceListValues}>
                {summaryRows.map((row) => (
                  <span className={styles.resourceListValueRow} key={row.label}>
                    <span>{row.label}</span>
                    <strong>{row.value}</strong>
                  </span>
                ))}
              </span>
            ) : (
              <span className={styles.resourceListNoValues}>No configured parameters</span>
            )}
          </button>
        );
      })}
    </div>
  );
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

function getResourceSummaryRows(node: DiagramNode): Array<{ label: string; value: string }> {
  const values = node.parameters?.values ?? {};

  return Object.entries(values)
    .filter(([, value]) => !isEmptyResourceValue(value))
    .slice(0, 4)
    .map(([key, value]) => ({
      label: toResourceSummaryLabel(key),
      value: formatResourceSummaryValue(value)
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
