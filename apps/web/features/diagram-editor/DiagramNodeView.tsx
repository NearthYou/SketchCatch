"use client";

import { BringToFront, Layers2, Lock, SendToBack, Square, Type, Unlock } from "lucide-react";
import {
  Handle,
  NodeToolbar,
  Position,
  useReactFlow,
  useStore,
  useUpdateNodeInternals
} from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { Fragment, memo, useCallback, useEffect } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode
} from "react";

import { ResourceIconImage } from "../../components/ui/ResourceIconImage";
import { getBoardNodeStateBadge, getBoardZoomLevel } from "./board-visual-state";
import { BORDER_COLOR_SWATCHES, NODE_COLOR_SWATCHES } from "./constants";
import {
  getAreaNodeIconUrl,
  getAreaNodeLabel,
  getAreaNodeMetaLabel,
  isAreaNode,
  isSecurityGroupScopeNode
} from "./area-nodes";
import { getNodeResizeBounds } from "./node-resize-bounds";
import { calculateNodeResize } from "./node-resize";
import type { NodeResizeHandlePosition, NodeResizeUpdate } from "./node-resize";
import {
  canChangeNodeBorderColor,
  getNodeDisplayBorderColor,
  getNodeDisplayBorderStyle
} from "./node-style";
import { getResourceNodePresentation } from "./resource-node-presentation";
import {
  shouldRenderDiagramNodeEdgeAnchors,
  shouldRenderDiagramNodeInteractionHandles,
  type DiagramFlowNode
} from "./types";
import styles from "./diagram-editor.module.css";

const CONNECTION_HANDLES = [
  { id: "handle-left", label: "왼쪽", position: Position.Left },
  { id: "handle-top", label: "위쪽", position: Position.Top },
  { id: "handle-right", label: "오른쪽", position: Position.Right },
  { id: "handle-bottom", label: "아래쪽", position: Position.Bottom }
] as const;

const AREA_NODE_HIT_EDGES = [
  styles.areaNodeHitEdgeTop,
  styles.areaNodeHitEdgeRight,
  styles.areaNodeHitEdgeBottom,
  styles.areaNodeHitEdgeLeft
] as const;

const AREA_DEPTH_CLASSES = [
  styles.nodeShellAreaDepth0,
  styles.nodeShellAreaDepth1,
  styles.nodeShellAreaDepth2,
  styles.nodeShellAreaDepth3
] as const;

const DESIGN_NODE_ICON_URLS_BY_TYPE: Readonly<Record<string, string>> = {
  aws_ecs_task_definition:
    "/Resource-Icons_07312025/Res_Containers/Res_Amazon-Elastic-Container-Service_Task_48.svg",
  client: "/Resource-Icons_07312025/Res_General-Icons/Res_48_Light/Res_Client_48_Light.svg",
  "design-user-client":
    "/Resource-Icons_07312025/Res_General-Icons/Res_48_Light/Res_Client_48_Light.svg",
  github_actions:
    "/Resource-Icons_07312025/Res_General-Icons/Res_48_Light/Res_Git-Repository_48_Light.svg",
  sketchcatch_user_client:
    "/Resource-Icons_07312025/Res_General-Icons/Res_48_Light/Res_Client_48_Light.svg"
};

const RESIZE_HANDLES: readonly {
  className: string;
  isSide?: boolean;
  label: string;
  position: NodeResizeHandlePosition;
}[] = [
  {
    className: styles.manualResizeHandleTopLeft ?? "",
    label: "좌상단에서 노드 크기 조절",
    position: "top-left"
  },
  {
    className: styles.manualResizeHandleTop ?? "",
    isSide: true,
    label: "위쪽 면에서 노드 크기 조절",
    position: "top"
  },
  {
    className: styles.manualResizeHandleTopRight ?? "",
    label: "우상단에서 노드 크기 조절",
    position: "top-right"
  },
  {
    className: styles.manualResizeHandleRight ?? "",
    isSide: true,
    label: "오른쪽 면에서 노드 크기 조절",
    position: "right"
  },
  {
    className: styles.manualResizeHandleBottomRight ?? "",
    label: "우하단에서 노드 크기 조절",
    position: "bottom-right"
  },
  {
    className: styles.manualResizeHandleBottom ?? "",
    isSide: true,
    label: "아래쪽 면에서 노드 크기 조절",
    position: "bottom"
  },
  {
    className: styles.manualResizeHandleBottomLeft ?? "",
    label: "좌하단에서 노드 크기 조절",
    position: "bottom-left"
  },
  {
    className: styles.manualResizeHandleLeft ?? "",
    isSide: true,
    label: "왼쪽 면에서 노드 크기 조절",
    position: "left"
  }
];

/** 실제 containment와 보안 범위를 서로 다른 Board 표면으로 렌더링합니다. */
export const DiagramNodeView = memo(function DiagramNodeView({
  data,
  id,
  isConnectable,
  selected
}: NodeProps<DiagramFlowNode>) {
  const reactFlow = useReactFlow();
  const zoomLevel = useStore((state) => getBoardZoomLevel(state.transform[2]));
  const updateNodeInternals = useUpdateNodeInternals();
  const node = data.node;
  const toolbarVisible = !data.isPreview && selected && data.selectedNodeCount === 1;
  const canConnect = !data.isPreview && Boolean(isConnectable) && !node.locked;
  const canResize =
    !node.locked && !data.isPreview && !data.isConnectionActive && (node.rotation ?? 0) === 0;
  const nodeRotationStyle =
    node.rotation === undefined || node.rotation === 0
      ? undefined
      : {
          transform: `rotate(${node.rotation}deg)`,
          transformOrigin: "center"
        };
  const displayIconUrl = node.iconUrl ?? getDesignNodeFallbackIconUrl(node);
  const isResourceNode = node.kind === "resource";
  const isArea = isAreaNode(node);
  const isSecurityGroupScope = isSecurityGroupScopeNode(node);
  const usesIconTileLayout =
    isResourceNode || (node.kind === "design" && !isArea && Boolean(displayIconUrl));
  const canChangeBorderColor = canChangeNodeBorderColor(node);
  const borderColor = getNodeDisplayBorderColor(node);
  const borderStyle = getNodeDisplayBorderStyle(node);
  const textColor = node.style?.textColor ?? "#172033";
  const resizeBounds = getNodeResizeBounds(node);
  const resourcePresentation = getResourceNodePresentation({ ...node, iconUrl: displayIconUrl });
  const nodeShellStyle = getNodeShellStyle(isArea, usesIconTileLayout, borderColor, borderStyle);
  const areaNodeIconUrl = isArea ? getAreaNodeIconUrl(node) : undefined;
  const areaNodeMetaLabel = isArea ? getAreaNodeMetaLabel(node) : undefined;
  const resourceNodeLabel = isArea ? getAreaNodeLabel(node) : resourcePresentation.label;
  const toolbarGroupName = `node-toolbar-${id}`;
  const stateBadge = getBoardNodeStateBadge(data.previewState);
  const areaDepthClass = isArea
    ? AREA_DEPTH_CLASSES[Math.min(Math.max(0, data.areaDepth), AREA_DEPTH_CLASSES.length - 1)]
    : undefined;

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, node.rotation, node.size.height, node.size.width, updateNodeInternals]);

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
          resizeMode: usesIconTileLayout && !isArea ? "square" : "free",
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
    [
      data,
      id,
      isArea,
      node.locked,
      node.position,
      node.size,
      reactFlow,
      resizeBounds,
      usesIconTileLayout
    ]
  );

  const handleResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>, handlePosition: NodeResizeHandlePosition) => {
      const keyboardDelta = getKeyboardResizeDelta(event.key, event.shiftKey ? 1 : 12);

      if (!keyboardDelta || node.locked) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const zoom = reactFlow.getZoom() || 1;
      const update = calculateNodeResize({
        bounds: resizeBounds,
        delta: {
          x: keyboardDelta.x * zoom,
          y: keyboardDelta.y * zoom
        },
        handlePosition,
        resizeMode: usesIconTileLayout && !isArea ? "square" : "free",
        startPosition: node.position,
        startSize: node.size,
        zoom
      });

      data.onResizeStart();
      data.onResize(id, update);
      data.onResizeEnd(id, update);
    },
    [
      data,
      id,
      isArea,
      node.locked,
      node.position,
      node.size,
      reactFlow,
      resizeBounds,
      usesIconTileLayout
    ]
  );

  return (
    <>
      <NodeToolbar
        align="center"
        aria-label={`${resourceNodeLabel} 노드 편집`}
        className={[styles.nodeToolbar, isArea ? styles.nodeToolbarArea : undefined]
          .filter(Boolean)
          .join(" ")}
        isVisible={toolbarVisible}
        nodeId={id}
        offset={34}
        position={isArea ? Position.Bottom : Position.Top}
        role="toolbar"
      >
        <LayerMenu
          groupName={toolbarGroupName}
          onBringForward={() => data.onBringForward(id)}
          onSendBackward={() => data.onSendBackward(id)}
        />
        <ColorMenu
          colors={NODE_COLOR_SWATCHES}
          groupName={toolbarGroupName}
          icon={<Type aria-hidden="true" size={15} />}
          label="텍스트 색상"
          onChange={(color) => data.onTextColorChange(id, color)}
          value={textColor}
        />
        {canChangeBorderColor ? (
          <ColorMenu
            colors={BORDER_COLOR_SWATCHES}
            groupName={toolbarGroupName}
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
          {node.locked ? (
            <Lock aria-hidden="true" size={15} />
          ) : (
            <Unlock aria-hidden="true" size={15} />
          )}
        </button>
      </NodeToolbar>

      <div className={styles.nodeRotationFrame} style={nodeRotationStyle}>
        <div
          className={[
            styles.nodeShell,
            selected ? styles.nodeShellSelected : undefined,
            data.isDimmed ? styles.nodeShellDimmed : undefined,
            data.isPreview ? styles.nodeShellAiPreview : undefined,
            data.previewState === "added" ? styles.nodeShellPatchAdded : undefined,
            data.previewState === "modified" ? styles.nodeShellPatchModified : undefined,
            data.previewState === "deleted" ? styles.nodeShellPatchDeleted : undefined,
            data.isAreaDropTarget ? styles.nodeShellAreaDropTarget : undefined,
            data.isValidConnectionTarget ? styles.nodeShellConnectionCandidate : undefined,
            isArea ? styles.nodeShellArea : undefined,
            isSecurityGroupScope ? styles.nodeShellSecurityGroupScope : undefined,
            areaDepthClass,
            !isArea
              ? usesIconTileLayout
                ? styles.nodeShellResource
                : styles.nodeShellDesign
              : undefined,
            zoomLevel === "far" ? styles.nodeShellZoomFar : undefined,
            zoomLevel === "medium" ? styles.nodeShellZoomMedium : undefined,
            node.locked ? styles.nodeShellLocked : undefined
          ]
            .filter(Boolean)
            .join(" ")}
          style={nodeShellStyle}
          title={resourceNodeLabel}
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
                <ResourceIconImage
                  alt=""
                  className={styles.areaNodeHeaderIcon}
                  fallbackClassName={styles.areaNodeHeaderIcon}
                  fallbackSize={16}
                  src={areaNodeIconUrl}
                />
                <span className={styles.areaNodeHeaderText}>{resourceNodeLabel}</span>
                {areaNodeMetaLabel ? (
                  <span className={styles.areaNodeHeaderMeta}>{areaNodeMetaLabel}</span>
                ) : null}
              </div>
            </>
          ) : usesIconTileLayout ? (
            <>
              <div
                className={styles.resourceNodeIconFrame}
                data-icon-family={resourcePresentation.icon.family}
              >
                <ResourceIconImage
                  alt=""
                  className={styles.resourceNodeIcon}
                  fallbackClassName={styles.resourceNodeIconFallback}
                  fallbackSize={18}
                  src={displayIconUrl}
                />
              </div>
              <div
                className={styles.resourceNodeLabel}
                data-board-thumbnail-persistent-label="true"
                style={{ color: textColor }}
                title={resourceNodeLabel}
              >
                {resourceNodeLabel}
              </div>
            </>
          ) : (
            <>
              <div className={styles.nodeGlyph} aria-hidden="true">
                <ResourceIconImage
                  alt=""
                  className={styles.nodeGlyphIcon}
                  fallbackClassName={styles.nodeGlyphIcon}
                  fallbackSize={28}
                  src={displayIconUrl}
                />
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
            <div
              aria-label={`잠김: ${resourceNodeLabel}`}
              className={styles.lockBadge}
              role="img"
              title={`잠김: ${resourceNodeLabel}`}
            >
              <Lock aria-hidden="true" size={12} />
            </div>
          ) : null}
          {stateBadge ? (
            <div
              aria-label={`${stateBadge.label}: ${resourceNodeLabel}`}
              className={`${styles.stateBadge} ${getStateBadgeToneClass(stateBadge.tone)}`}
              role="img"
              title={`${stateBadge.label}: ${resourceNodeLabel}`}
            >
              {stateBadge.glyph}
            </div>
          ) : null}
        </div>

        {canResize ? (
          <>
            {RESIZE_HANDLES.map((handle) => (
              <button
                aria-label={handle.label}
                className={[
                  styles.manualResizeHandle,
                  isArea ? styles.manualResizeHandleArea : undefined,
                  handle.isSide ? styles.manualResizeHandleSide : undefined,
                  handle.className,
                  "nodrag"
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={handle.position}
                onKeyDown={(event) => handleResizeKeyDown(event, handle.position)}
                onPointerDown={(event) => handleResizePointerDown(event, handle.position)}
                tabIndex={selected ? 0 : -1}
                title={handle.label}
                type="button"
              />
            ))}
          </>
        ) : null}

        {shouldRenderDiagramNodeInteractionHandles(data.isPreview)
          ? CONNECTION_HANDLES.map((handle) => {
              const canStartFromHandle = canConnect && !data.isConnectionActive;
              const canEndAtHandle = data.isValidConnectionTarget;
              const isAccessibleConnectionSource =
                selected && canStartFromHandle && handle.id === "handle-right";
              const isAccessibleConnectionTarget =
                canEndAtHandle && handle.id === "handle-left";

              return (
                <Fragment key={handle.id}>
                  <Handle
                    aria-hidden={!isAccessibleConnectionSource}
                    aria-label={
                      isAccessibleConnectionSource
                        ? `${resourceNodeLabel} ${handle.label} 연결 시작`
                        : undefined
                    }
                    className={[
                      styles.connectionHandle,
                      styles.connectionHandleSource,
                      canStartFromHandle ? undefined : styles.connectionHandleInactive
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    id={`source-${handle.id}`}
                    isConnectable={canStartFromHandle}
                    isConnectableEnd={false}
                    isConnectableStart={canStartFromHandle}
                    onKeyDown={handleConnectionHandleKeyDown}
                    position={handle.position}
                    role={isAccessibleConnectionSource ? "button" : undefined}
                    tabIndex={isAccessibleConnectionSource ? 0 : -1}
                    type="source"
                  />
                  <Handle
                    aria-hidden={!isAccessibleConnectionTarget}
                    aria-label={
                      isAccessibleConnectionTarget
                        ? `${resourceNodeLabel} ${handle.label} 연결 대상`
                        : undefined
                    }
                    className={[
                      styles.connectionHandle,
                      styles.connectionHandleTarget,
                      canEndAtHandle
                        ? styles.connectionHandleActive
                        : styles.connectionHandleInactive
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    id={`target-${handle.id}`}
                    isConnectable={canEndAtHandle}
                    isConnectableEnd={canEndAtHandle}
                    isConnectableStart={false}
                    isValidConnection={() => canEndAtHandle}
                    onKeyDown={handleConnectionHandleKeyDown}
                    position={handle.position}
                    role={isAccessibleConnectionTarget ? "button" : undefined}
                    tabIndex={isAccessibleConnectionTarget ? 0 : -1}
                    type="target"
                  />
                </Fragment>
              );
            })
          : null}
        {shouldRenderDiagramNodeEdgeAnchors(data.isPreview)
          ? CONNECTION_HANDLES.map((handle) => (
              <Fragment key={`preview-${handle.id}`}>
                <Handle
                  aria-hidden="true"
                  className={styles.edgeAnchorHandle}
                  id={`source-${handle.id}`}
                  isConnectable={false}
                  isConnectableEnd={false}
                  isConnectableStart={false}
                  position={handle.position}
                  tabIndex={-1}
                  type="source"
                />
                <Handle
                  aria-hidden="true"
                  className={styles.edgeAnchorHandle}
                  id={`target-${handle.id}`}
                  isConnectable={false}
                  isConnectableEnd={false}
                  isConnectableStart={false}
                  position={handle.position}
                  tabIndex={-1}
                  type="target"
                />
              </Fragment>
            ))
          : null}
      </div>
    </>
  );
});

function getKeyboardResizeDelta(key: string, step: number): DiagramFlowNode["position"] | null {
  if (key === "ArrowLeft") {
    return { x: -step, y: 0 };
  }

  if (key === "ArrowRight") {
    return { x: step, y: 0 };
  }

  if (key === "ArrowUp") {
    return { x: 0, y: -step };
  }

  if (key === "ArrowDown") {
    return { x: 0, y: step };
  }

  return null;
}

function handleConnectionHandleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.click();
}

function getDesignNodeFallbackIconUrl(
  node: Pick<DiagramFlowNode["data"]["node"], "kind" | "metadata" | "type">
): string | undefined {
  if (node.kind !== "design") {
    return undefined;
  }

  const presentationCatalogItemId = node.metadata?.presentationCatalogItemId;

  if (presentationCatalogItemId === "design-user-client") {
    return DESIGN_NODE_ICON_URLS_BY_TYPE["design-user-client"];
  }

  if (presentationCatalogItemId === "design-source-repository") {
    return DESIGN_NODE_ICON_URLS_BY_TYPE.github_actions;
  }

  return DESIGN_NODE_ICON_URLS_BY_TYPE[node.type];
}

function getNodeShellStyle(
  isArea: boolean,
  usesIconTileLayout: boolean,
  borderColor: string,
  borderStyle: string
): CSSProperties {
  if (isArea) {
    return {
      "--node-border-color": borderColor,
      "--area-border-style": borderStyle
    } as CSSProperties;
  }

  if (usesIconTileLayout) {
    return {};
  }

  return { borderColor };
}

function getStateBadgeToneClass(tone: "danger" | "preview" | "success" | "warning"): string {
  if (tone === "success") {
    return styles.stateBadgeSuccess ?? "";
  }

  if (tone === "warning") {
    return styles.stateBadgeWarning ?? "";
  }

  if (tone === "danger") {
    return styles.stateBadgeDanger ?? "";
  }

  return styles.stateBadgePreview ?? "";
}

type ColorMenuProps = {
  colors: readonly string[];
  groupName: string;
  icon: ReactNode;
  label: string;
  onChange: (color: string) => void;
  value: string;
};

type LayerMenuProps = {
  groupName: string;
  onBringForward: () => void;
  onSendBackward: () => void;
};

const COLOR_ACCESSIBLE_NAMES: Readonly<Record<string, string>> = {
  "#172033": "기본",
  "#1f6feb": "파랑",
  "#6f4cf6": "보라",
  "#287d3c": "초록",
  "#b45309": "주황",
  "#b42318": "빨강",
  "#8b98aa": "회색",
  "#2f6db3": "파랑",
  "#2f8c55": "초록",
  "#d76613": "주황",
  "#c9473d": "빨강"
};

function LayerMenu({ groupName, onBringForward, onSendBackward }: LayerMenuProps) {
  return (
    <details
      className={styles.nodeToolbarDisclosure}
      name={groupName}
      onKeyDown={handleDisclosureKeyDown}
    >
      <summary aria-label="레이어 순서" className={styles.iconButton} title="레이어 순서">
        <Layers2 aria-hidden="true" size={15} />
      </summary>
      <div
        aria-label="레이어 순서"
        className={`${styles.nodeToolbarPanel} ${styles.nodeToolbarActionPanel}`}
        role="group"
      >
        <button
          className={styles.nodeToolbarAction}
          onClick={(event) => {
            onBringForward();
            closeDisclosure(event.currentTarget);
          }}
          type="button"
        >
          <BringToFront aria-hidden="true" size={15} />
          <span>앞으로 가져오기</span>
        </button>
        <button
          className={styles.nodeToolbarAction}
          onClick={(event) => {
            onSendBackward();
            closeDisclosure(event.currentTarget);
          }}
          type="button"
        >
          <SendToBack aria-hidden="true" size={15} />
          <span>뒤로 보내기</span>
        </button>
      </div>
    </details>
  );
}

function ColorMenu({ colors, groupName, icon, label, onChange, value }: ColorMenuProps) {
  return (
    <details
      className={styles.nodeToolbarDisclosure}
      name={groupName}
      onKeyDown={handleDisclosureKeyDown}
    >
      <summary aria-label={`${label}, 현재 ${value}`} className={styles.iconButton} title={label}>
        {icon}
        <span
          aria-hidden="true"
          className={styles.nodeToolbarTriggerColor}
          style={{ backgroundColor: value }}
        />
      </summary>
      <div aria-label={label} className={styles.nodeToolbarPanel} role="group">
        <div className={styles.nodeToolbarPalette}>
          {colors.map((color) => (
            <button
              aria-label={`${label} ${COLOR_ACCESSIBLE_NAMES[color] ?? color} (${color})`}
              aria-pressed={value === color}
              className={styles.swatchButton}
              key={color}
              onClick={(event) => {
                onChange(color);
                closeDisclosure(event.currentTarget);
              }}
              type="button"
            >
              <span
                aria-hidden="true"
                className={styles.nodeSwatchVisual}
                style={{ backgroundColor: color }}
              />
            </button>
          ))}
        </div>
        <label className={styles.nodeToolbarCustomColor}>
          <span>사용자 지정</span>
          <input
            aria-label={`${label} 사용자 지정`}
            className={styles.colorInput}
            onChange={(event) => onChange(event.target.value)}
            type="color"
            value={value}
          />
        </label>
      </div>
    </details>
  );
}

function handleDisclosureKeyDown(event: ReactKeyboardEvent<HTMLDetailsElement>): void {
  if (event.key !== "Escape") {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.removeAttribute("open");
  event.currentTarget.querySelector("summary")?.focus();
}

function closeDisclosure(target: HTMLElement): void {
  const details = target.closest("details");

  details?.removeAttribute("open");
  details?.querySelector("summary")?.focus();
}
