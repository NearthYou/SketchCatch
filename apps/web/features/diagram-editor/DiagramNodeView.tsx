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
import type { DiagramFlowNode } from "./types";
import styles from "./diagram-editor.module.css";

const CONNECTION_HANDLES = [
  { id: "handle-left", position: Position.Left },
  { id: "handle-top", position: Position.Top },
  { id: "handle-right", position: Position.Right },
  { id: "handle-bottom", position: Position.Bottom }
] as const;

const AREA_NODE_DEFAULT_BORDER_COLOR = "#bfdbfe";
const LEGACY_DEFAULT_BORDER_COLORS = new Set(["#8b98aa", "#2f6db3"]);

export function DiagramNodeView({ data, id, isConnectable, selected }: NodeProps<DiagramFlowNode>) {
  const reactFlow = useReactFlow();
  const node = data.node;
  const toolbarVisible = selected && data.selectedNodeCount === 1;
  const canConnect = isConnectable && !node.locked;
  const isResourceNode = node.kind === "resource";
  const isArea = isAreaNode(node);
  const borderColor = getDisplayBorderColor(isArea, node.style?.borderColor);
  const textColor = node.style?.textColor ?? "#172033";
  const isDataNode = node.parameters?.terraformBlockType === "data";
  const resizeBounds = getNodeResizeBounds(node);
  const nodeShellStyle = getNodeShellStyle(isArea, isResourceNode, borderColor);
  const areaNodeIconUrl = isArea ? getAreaNodeIconUrl(node) : undefined;
  const areaNodeLabel = isArea ? getAreaNodeLabel(node) : "";
  const handleResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (node.locked) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const zoom = reactFlow.getZoom() || 1;
      const startX = event.clientX;
      const startY = event.clientY;
      const startSize = node.size;
      let latestSize = startSize;

      data.onResizeStart();

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const nextWidth = clamp(
          startSize.width + (moveEvent.clientX - startX) / zoom,
          resizeBounds.minWidth,
          resizeBounds.maxWidth
        );
        const nextHeight = clamp(
          startSize.height + (moveEvent.clientY - startY) / zoom,
          resizeBounds.minHeight,
          resizeBounds.maxHeight
        );

        latestSize = {
          width: Math.round(nextWidth),
          height: Math.round(nextHeight)
        };
        data.onResize(id, latestSize);
      };

      const handlePointerUp = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        data.onResizeEnd(id, latestSize);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp, { once: true });
    },
    [data, id, node.locked, node.size, reactFlow, resizeBounds]
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
        <ColorMenu
          colors={BORDER_COLOR_SWATCHES}
          icon={<Square aria-hidden="true" size={15} />}
          label="테두리 색상"
          onChange={(color) => data.onBorderColorChange(id, color)}
          value={borderColor}
        />
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
          <div className={styles.areaNodeHeader} style={{ color: textColor }}>
            {areaNodeIconUrl ? (
              <img alt="" className={styles.areaNodeHeaderIcon} draggable={false} src={areaNodeIconUrl} />
            ) : null}
            <span className={styles.areaNodeHeaderText}>{areaNodeLabel}</span>
          </div>
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
        <button
          aria-label="노드 크기 조절"
          className={`${styles.manualResizeHandle} nodrag`}
          onPointerDown={handleResizePointerDown}
          title="노드 크기 조절"
          type="button"
        />
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
    return { "--node-border-color": borderColor } as CSSProperties;
  }

  return { borderColor };
}

function getDisplayBorderColor(isArea: boolean, borderColor: string | undefined): string {
  if (isArea && (!borderColor || LEGACY_DEFAULT_BORDER_COLORS.has(borderColor))) {
    return AREA_NODE_DEFAULT_BORDER_COLOR;
  }

  return borderColor ?? "#8b98aa";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
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
