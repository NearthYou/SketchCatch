"use client";

import {
  BringToFront,
  Lock,
  SendToBack,
  Square,
  Type,
  Unlock
} from "lucide-react";
import {
  Handle,
  NodeToolbar,
  Position,
  useReactFlow
} from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { useCallback } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";

import { BORDER_COLOR_SWATCHES, NODE_COLOR_SWATCHES } from "./constants";
import { getAreaNodeIconUrl, getAreaNodeLabel, isAreaNode } from "./area-nodes";
import { getNodeResizeBounds } from "./node-resize-bounds";
import { calculateNodeResize } from "./node-resize";
import type { NodeResizeHandlePosition, NodeResizeUpdate } from "./node-resize";
import {
  RESOURCE_NODE_BORDER_COLOR,
  canChangeNodeBorderColor,
  getNodeDisplayBorderColor
} from "./node-style";
import type { DiagramFlowNode } from "./types";
import styles from "./diagram-editor.module.css";

const CONNECTION_HANDLES = [
  { id: "handle-left", position: Position.Left },
  { id: "handle-top", position: Position.Top },
  { id: "handle-right", position: Position.Right },
  { id: "handle-bottom", position: Position.Bottom }
] as const;

const AREA_NODE_HIT_EDGES = [
  styles.areaNodeHitEdgeTop,
  styles.areaNodeHitEdgeRight,
  styles.areaNodeHitEdgeBottom,
  styles.areaNodeHitEdgeLeft
] as const;

const RESIZE_HANDLES: readonly {
  className: string;
  label: string;
  position: NodeResizeHandlePosition;
}[] = [
  {
    className: styles.manualResizeHandleTopLeft ?? "",
    label: "좌상단에서 노드 크기 조절",
    position: "top-left"
  },
  {
    className: styles.manualResizeHandleTopRight ?? "",
    label: "우상단에서 노드 크기 조절",
    position: "top-right"
  },
  {
    className: styles.manualResizeHandleBottomLeft ?? "",
    label: "좌하단에서 노드 크기 조절",
    position: "bottom-left"
  },
  {
    className: styles.manualResizeHandleBottomRight ?? "",
    label: "우하단에서 노드 크기 조절",
    position: "bottom-right"
  }
];

export function DiagramNodeView({ data, id, isConnectable, selected }: NodeProps<DiagramFlowNode>) {
  const reactFlow = useReactFlow();
  const node = data.node;
  const toolbarVisible = selected && data.selectedNodeCount === 1;
  const canConnect = isConnectable && !node.locked;
  const isResourceNode = node.kind === "resource";
  const isArea = isAreaNode(node);
  const canChangeBorderColor = canChangeNodeBorderColor(node);
  const borderColor = getNodeDisplayBorderColor(node);
  const textColor = node.style?.textColor ?? "#172033";
  const isDataNode = node.parameters?.terraformBlockType === "data";
  const resizeBounds = getNodeResizeBounds(node);
  const nodeShellStyle = getNodeShellStyle(isArea, isResourceNode, borderColor);
  const areaNodeIconUrl = isArea ? getAreaNodeIconUrl(node) : undefined;
  const areaNodeLabel = isArea ? getAreaNodeLabel(node) : "";
  const handleResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, handlePosition: NodeResizeHandlePosition) => {
      if (node.locked) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const zoom = reactFlow.getZoom() || 1;
      const startX = event.clientX;
      const startY = event.clientY;
      const startPosition = node.position;
      const startSize = node.size;
      let latestUpdate: NodeResizeUpdate = {
        position: startPosition,
        size: startSize
      };

      data.onResizeStart();

      const handlePointerMove = (moveEvent: PointerEvent) => {
        latestUpdate = calculateNodeResize({
          bounds: resizeBounds,
          delta: {
            x: moveEvent.clientX - startX,
            y: moveEvent.clientY - startY
          },
          handlePosition,
          resizeMode: isResourceNode && !isArea ? "square" : "free",
          startPosition,
          startSize,
          zoom
        });
        data.onResize(id, latestUpdate);
      };

      const handlePointerUp = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        data.onResizeEnd(id, latestUpdate);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp, { once: true });
    },
    [data, id, isArea, isResourceNode, node.locked, node.position, node.size, reactFlow, resizeBounds]
  );

  return (
    <>
      <NodeToolbar
        align="center"
        className={styles.nodeToolbar}
        isVisible={toolbarVisible}
        nodeId={id}
        offset={10}
        position={Position.Top}
      >
        <button
          aria-label="앞으로 가져오기"
          className={styles.iconButton}
          onClick={() => data.onBringForward(id)}
          title="앞으로 가져오기"
          type="button"
        >
          <BringToFront aria-hidden="true" size={15} />
        </button>
        <button
          aria-label="뒤로 보내기"
          className={styles.iconButton}
          onClick={() => data.onSendBackward(id)}
          title="뒤로 보내기"
          type="button"
        >
          <SendToBack aria-hidden="true" size={15} />
        </button>
        <ColorMenu
          colors={NODE_COLOR_SWATCHES}
          icon={<Type aria-hidden="true" size={15} />}
          label="텍스트 색상"
          onChange={(color) => data.onTextColorChange(id, color)}
          value={textColor}
        />
        {canChangeBorderColor ? (
          <ColorMenu
            colors={BORDER_COLOR_SWATCHES}
            icon={<Square aria-hidden="true" size={15} />}
            label="테두리 색상"
            onChange={(color) => data.onBorderColorChange(id, color)}
            value={borderColor}
          />
        ) : null}
        <button
          aria-label={node.locked ? "잠금 해제" : "잠금"}
          aria-pressed={node.locked}
          className={styles.iconButton}
          onClick={() => data.onToggleLock(id)}
          title={node.locked ? "잠금 해제" : "잠금"}
          type="button"
        >
          {node.locked ? <Lock aria-hidden="true" size={15} /> : <Unlock aria-hidden="true" size={15} />}
        </button>
      </NodeToolbar>

      <div
        className={[
          styles.nodeShell,
          selected ? styles.nodeShellSelected : undefined,
          data.isDimmed ? styles.nodeShellDimmed : undefined,
          data.isPreview ? styles.nodeShellAiPreview : undefined,
          data.previewState === "added" ? styles.nodeShellPatchAdded : undefined,
          data.previewState === "modified" ? styles.nodeShellPatchModified : undefined,
          data.previewState === "deleted" ? styles.nodeShellPatchDeleted : undefined,
          data.isReferenceDropTarget ? styles.nodeShellReferenceDropTarget : undefined,
          isArea ? styles.nodeShellArea : undefined,
          node.kind === "design" ? styles.nodeShellDesign : styles.nodeShellResource,
          node.locked ? styles.nodeShellLocked : undefined
        ]
          .filter(Boolean)
          .join(" ")}
        style={nodeShellStyle}
      >
        {isArea ? (
          <>
            {AREA_NODE_HIT_EDGES.map((edgeClassName) => (
              <div
                aria-hidden="true"
                className={`${styles.areaNodeHitEdge} ${edgeClassName}`}
                key={edgeClassName}
              />
            ))}
            <div className={styles.areaNodeHeader} style={{ color: textColor }}>
              {areaNodeIconUrl ? (
                <img alt="" className={styles.areaNodeHeaderIcon} draggable={false} src={areaNodeIconUrl} />
              ) : null}
              <span className={styles.areaNodeHeaderText}>{areaNodeLabel}</span>
            </div>
          </>
        ) : isResourceNode ? (
          <>
            <div className={styles.resourceNodeIconFrame}>
              {node.iconUrl ? (
                <img alt="" className={styles.resourceNodeIcon} draggable={false} src={node.iconUrl} />
              ) : (
                <div className={styles.resourceNodeIconFallback} aria-hidden="true">
                  AWS
                </div>
              )}
            </div>
            <div className={styles.resourceNodeLabel} style={{ color: textColor }}>
              {node.label}
            </div>
            {isDataNode ? <div className={styles.resourceNodeBadge}>Data</div> : null}
          </>
        ) : (
          <>
            <div className={styles.nodeGlyph} aria-hidden="true">
              D
            </div>
            <div className={styles.nodeContent}>
              <div className={styles.nodeType}>Design</div>
              <div className={styles.nodeLabel} style={{ color: textColor }}>
                {node.label}
              </div>
              <div className={styles.nodeSubtitle}>{node.type}</div>
            </div>
          </>
        )}
        {node.locked ? (
          <div aria-label="잠김" className={styles.lockBadge} title="잠김">
            <Lock aria-hidden="true" size={12} />
          </div>
        ) : null}
      </div>

      {selected && !node.locked ? (
        <>
          {RESIZE_HANDLES.map((handle) => (
            <button
              aria-label={handle.label}
              className={`${styles.manualResizeHandle} ${handle.className} nodrag`}
              key={handle.position}
              onPointerDown={(event) => handleResizePointerDown(event, handle.position)}
              title={handle.label}
              type="button"
            />
          ))}
        </>
      ) : null}

      {canConnect ? (
        <>
          {CONNECTION_HANDLES.map((handle) => (
            <Handle
              className={styles.connectionHandle}
              id={handle.id}
              key={handle.id}
              position={handle.position}
              type="source"
            />
          ))}
        </>
      ) : null}
    </>
  );
}

function getNodeShellStyle(isArea: boolean, isResourceNode: boolean, borderColor: string): CSSProperties {
  if (isArea) {
    return { "--node-border-color": borderColor, borderColor } as CSSProperties;
  }

  if (isResourceNode) {
    return { "--resource-node-border-color": RESOURCE_NODE_BORDER_COLOR } as CSSProperties;
  }

  return { borderColor };
}

type ColorMenuProps = {
  colors: readonly string[];
  icon: ReactNode;
  label: string;
  onChange: (color: string) => void;
  value: string;
};

function ColorMenu({ colors, icon, label, onChange, value }: ColorMenuProps) {
  return (
    <div aria-label={label} className={styles.colorMenu} title={label}>
      <span className={styles.colorMenuIcon}>{icon}</span>
      <div className={styles.swatchGroup}>
        {colors.map((color) => (
          <button
            aria-label={`${label} ${color}`}
            aria-pressed={value === color}
            className={styles.swatchButton}
            key={color}
            onClick={() => onChange(color)}
            style={{ backgroundColor: color }}
            type="button"
          />
        ))}
      </div>
      <input
        aria-label={label}
        className={styles.colorInput}
        onChange={(event) => onChange(event.target.value)}
        type="color"
        value={value}
      />
    </div>
  );
}
