"use client";

import { EdgeText } from "@xyflow/react";
import type { EdgeProps } from "@xyflow/react";
import type { CSSProperties } from "react";

import { resolveAuthoredEdgePath } from "./authored-edge-path";
import { BOARD_DEFAULT_EDGE_COLOR } from "./constants";
import { getDiagramEdgePatchBadgePosition } from "./diagram-edge-patch-badge";
import { getDiagramEdgePath } from "./diagram-edge-path";
import type { DiagramFlowEdge } from "./types";
import styles from "./diagram-editor.module.css";

const EDGE_PATCH_BADGES = {
  added: { glyph: "+", label: "추가됨" },
  modified: { glyph: "~", label: "수정됨" },
  deleted: { glyph: "−", label: "삭제됨" }
} as const;

export function DiagramEdgeView({
  data,
  interactionWidth = 18,
  label,
  labelBgBorderRadius = 5,
  labelBgPadding = [8, 3],
  labelBgStyle,
  labelStyle,
  markerEnd,
  markerStart,
  selected,
  source,
  sourcePosition,
  sourceX,
  sourceY,
  style,
  target,
  targetPosition,
  targetX,
  targetY
}: EdgeProps<DiagramFlowEdge>) {
  const resolvedPath = data?.authoredRoute
    ? resolveAuthoredEdgePath(data.authoredRoute, {
        isStale: data.isAuthoredRouteStale,
        sourceX,
        sourceY,
        targetX,
        targetY
      })
    : resolveLegacyEdgePath(data?.pathKind ?? "smoothstep", {
        sourcePosition,
        sourceX,
        sourceY,
        targetPosition,
        targetX,
        targetY
      });
  const semanticStrokeWidth = getNumericStrokeWidth(style?.strokeWidth);
  const semanticStroke = typeof style?.stroke === "string" ? style.stroke : BOARD_DEFAULT_EDGE_COLOR;
  const patchState = data?.previewState;
  const patchBadge = patchState ? EDGE_PATCH_BADGES[patchState] : undefined;
  const edgeAccessibleName = getEdgeAccessibleName(data?.edge.label ?? label, source, target);
  const patchBadgeAccessibleLabel = patchBadge
    ? `${patchBadge.label}: ${edgeAccessibleName}`
    : undefined;
  const patchBadgePosition = patchState
    ? getDiagramEdgePatchBadgePosition({
        hasLabel: Boolean(label),
        labelX: resolvedPath.labelX,
        labelY: resolvedPath.labelY,
        patchState,
        sourceX: resolvedPath.sourceX,
        sourceY: resolvedPath.sourceY,
        targetX: resolvedPath.targetX,
        targetY: resolvedPath.targetY
      })
    : null;
  const haloStyle = {
    "--edge-hover-halo-width": `${semanticStrokeWidth + 4}px`,
    "--edge-selected-halo-width": `${semanticStrokeWidth + 6}px`
  } as CSSProperties;

  return (
    <>
      <title>{edgeAccessibleName}</title>
      <path
        aria-hidden="true"
        className={`${styles.edgeHalo} ${selected ? styles.edgeHaloSelected : ""}`}
        d={resolvedPath.path}
        fill="none"
        style={haloStyle}
      />
      <path
        className={`react-flow__edge-path ${styles.edgeSemanticPath}`}
        d={resolvedPath.path}
        fill="none"
        markerEnd={markerEnd}
        markerStart={markerStart}
        style={style}
      />
      {data?.isAnimated ? (
        <path
          aria-hidden="true"
          className={styles.edgeMotionPath}
          d={resolvedPath.path}
          fill="none"
          stroke={semanticStroke}
          strokeWidth={semanticStrokeWidth}
        />
      ) : null}
      <path
        className={`react-flow__edge-interaction ${styles.edgeInteractionPath}`}
        d={resolvedPath.path}
        fill="none"
        stroke="transparent"
        strokeWidth={interactionWidth}
      />
      {label ? (
        <EdgeText
          className={styles.edgeLabel ?? ""}
          label={label}
          labelBgBorderRadius={labelBgBorderRadius}
          labelBgPadding={labelBgPadding}
          {...(labelBgStyle ? { labelBgStyle } : {})}
          labelShowBg
          {...(labelStyle ? { labelStyle } : {})}
          x={resolvedPath.labelX}
          y={resolvedPath.labelY}
        />
      ) : null}
      {patchBadge && patchState && patchBadgeAccessibleLabel && patchBadgePosition ? (
        <g
          aria-label={patchBadgeAccessibleLabel}
          className={styles.edgePatchBadge}
          data-preview-state={patchState}
          role="img"
          transform={`translate(${patchBadgePosition.x} ${patchBadgePosition.y})`}
        >
          <title>{patchBadgeAccessibleLabel}</title>
          <circle aria-hidden="true" r={8.5} />
          <text aria-hidden="true" dy="0.35em" textAnchor="middle">
            {patchBadge.glyph}
          </text>
        </g>
      ) : null}
    </>
  );
}

function resolveLegacyEdgePath(
  kind: NonNullable<DiagramFlowEdge["data"]>["pathKind"],
  input: Parameters<typeof getDiagramEdgePath>[1]
) {
  const [path, labelX, labelY] = getDiagramEdgePath(kind, input);

  return {
    path,
    labelX,
    labelY,
    sourceX: input.sourceX,
    sourceY: input.sourceY,
    targetX: input.targetX,
    targetY: input.targetY
  };
}

function getEdgeAccessibleName(label: unknown, source: string, target: string): string {
  if (typeof label === "string" && label.trim().length > 0) {
    return label.trim();
  }

  if (typeof label === "number") {
    return String(label);
  }

  return `${source} → ${target}`;
}

function getNumericStrokeWidth(value: CSSProperties["strokeWidth"]): number {
  if (typeof value === "number") {
    return value;
  }

  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 1.25;
}
