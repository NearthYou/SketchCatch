"use client";

import { Palette, Route, SlidersHorizontal, Trash2 } from "lucide-react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode
} from "react";
import type { DiagramEdge, DiagramEdgeStyle } from "../../../../packages/types/src";

import { BOARD_DEFAULT_EDGE_COLOR, EDGE_COLOR_SWATCHES } from "./constants";
import type { DiagramEdgeKind } from "./types";
import styles from "./diagram-editor.module.css";

export type DiagramEdgeToolbarProps = {
  edge: DiagramEdge;
  onDelete: (edgeId: string) => void;
  onStyleChange: (edgeId: string, style: DiagramEdgeStyle) => void;
  onTypeChange: (edgeId: string, type: DiagramEdgeKind) => void;
};

const EDGE_TYPES: readonly { label: string; value: DiagramEdgeKind }[] = [
  { label: "Curve", value: "default" },
  { label: "Smooth", value: "smoothstep" },
  { label: "Step", value: "step" },
  { label: "Line", value: "straight" }
];

const EDGE_WIDTHS: readonly { label: string; value: DiagramEdgeStyle["width"] }[] = [
  { label: "얇게", value: "thin" },
  { label: "보통", value: "medium" },
  { label: "굵게", value: "thick" }
];

const EDGE_LINE_STYLES: readonly {
  label: string;
  value: NonNullable<DiagramEdgeStyle["lineStyle"]>;
}[] = [
  { label: "실선", value: "solid" },
  { label: "점선", value: "dashed" },
  { label: "점", value: "dotted" }
];

const EDGE_COLOR_ACCESSIBLE_NAMES: Readonly<Record<string, string>> = {
  [BOARD_DEFAULT_EDGE_COLOR]: "기본 회색",
  "#1f6feb": "파랑",
  "#287d3c": "초록",
  "#d76613": "주황",
  "#b42318": "빨강"
};

export function DiagramEdgeToolbar({
  edge,
  onDelete,
  onStyleChange,
  onTypeChange
}: DiagramEdgeToolbarProps) {
  const color = edge.style?.color ?? BOARD_DEFAULT_EDGE_COLOR;
  const edgeType = (edge.type as DiagramEdgeKind | undefined) ?? "smoothstep";
  const lineStyle = edge.style?.lineStyle ?? "solid";
  const width = edge.style?.width ?? "thin";
  const toolbarGroupName = `edge-toolbar-${edge.id}`;
  const edgeTypeLabel = EDGE_TYPES.find(({ value }) => value === edgeType)?.label ?? "Smooth";
  const lineStyleLabel = EDGE_LINE_STYLES.find(({ value }) => value === lineStyle)?.label ?? "실선";
  const widthLabel = EDGE_WIDTHS.find(({ value }) => value === width)?.label ?? "얇게";

  return (
    <div
      aria-label="연결선 도구"
      aria-orientation="horizontal"
      className={styles.edgeToolbar}
      role="toolbar"
    >
      <EdgeToolbarDisclosure
        groupName={toolbarGroupName}
        icon={<Route aria-hidden="true" size={15} />}
        label={`연결 경로, 현재 ${edgeTypeLabel}`}
        panelClassName={styles.nodeToolbarActionPanel}
        title="연결 경로"
      >
        {EDGE_TYPES.map((option) => {
          const active = edgeType === option.value;

          return (
            <button
              aria-label={`연결 경로 ${option.label}`}
              aria-pressed={active}
              className={[
                styles.nodeToolbarAction,
                active ? styles.edgeToolbarOptionActive : undefined
              ]
                .filter(Boolean)
                .join(" ")}
              key={option.value}
              onClick={(event) => {
                onTypeChange(edge.id, option.value);
                closeEdgeDisclosure(event.currentTarget);
              }}
              type="button"
            >
              <span aria-hidden="true">{active ? "✓" : ""}</span>
              <span>{option.label}</span>
            </button>
          );
        })}
      </EdgeToolbarDisclosure>

      <EdgeToolbarDisclosure
        groupName={toolbarGroupName}
        icon={<Palette aria-hidden="true" size={15} />}
        indicator={
          <span
            aria-hidden="true"
            className={styles.nodeToolbarTriggerColor}
            style={{ backgroundColor: color }}
          />
        }
        label={`연결선 색상, 현재 ${EDGE_COLOR_ACCESSIBLE_NAMES[color] ?? color}`}
        title="연결선 색상"
      >
        <div className={styles.nodeToolbarPalette}>
          {EDGE_COLOR_SWATCHES.map((swatchColor) => (
            <button
              aria-label={`연결선 색상 ${EDGE_COLOR_ACCESSIBLE_NAMES[swatchColor] ?? swatchColor} (${swatchColor})`}
              aria-pressed={color === swatchColor}
              className={styles.edgeSwatchButton}
              key={swatchColor}
              onClick={(event) => {
                onStyleChange(edge.id, { ...edge.style, color: swatchColor });
                closeEdgeDisclosure(event.currentTarget);
              }}
              type="button"
            >
              <span
                aria-hidden="true"
                className={styles.edgeSwatchVisual}
                style={{ backgroundColor: swatchColor }}
              />
            </button>
          ))}
        </div>
        <label className={styles.nodeToolbarCustomColor}>
          <span>사용자 지정</span>
          <input
            aria-label="연결선 색상 사용자 지정"
            className={styles.colorInput}
            onChange={(event) =>
              onStyleChange(edge.id, { ...edge.style, color: event.target.value })
            }
            type="color"
            value={color}
          />
        </label>
      </EdgeToolbarDisclosure>

      <EdgeToolbarDisclosure
        groupName={toolbarGroupName}
        icon={<SlidersHorizontal aria-hidden="true" size={15} />}
        indicator={
          <span
            aria-hidden="true"
            className={styles.edgeToolbarTriggerStroke}
            data-edge-width={width}
            data-line-style={lineStyle}
          />
        }
        label={`선 모양, 현재 ${lineStyleLabel} / ${widthLabel}`}
        panelClassName={styles.edgeToolbarStrokePanel}
        title="선 모양"
      >
        <span className={styles.edgeToolbarPanelLabel}>패턴</span>
        <div aria-label="연결선 패턴" className={styles.segmentedControl} role="group">
          {EDGE_LINE_STYLES.map((edgeLineStyle) => (
            <button
              aria-label={`연결선 ${edgeLineStyle.label}`}
              aria-pressed={lineStyle === edgeLineStyle.value}
              className={[
                styles.segmentButton,
                lineStyle === edgeLineStyle.value ? styles.segmentButtonActive : undefined
              ]
                .filter(Boolean)
                .join(" ")}
              key={edgeLineStyle.value}
              onClick={() =>
                onStyleChange(edge.id, { ...edge.style, lineStyle: edgeLineStyle.value })
              }
              type="button"
            >
              <span
                aria-hidden="true"
                className={styles.edgeLinePreview}
                data-line-style={edgeLineStyle.value}
              />
            </button>
          ))}
        </div>

        <span className={styles.edgeToolbarPanelLabel}>굵기</span>
        <div aria-label="연결선 굵기" className={styles.segmentedControl} role="group">
          {EDGE_WIDTHS.map((edgeWidth) => (
            <button
              aria-label={`연결선 ${edgeWidth.label}`}
              aria-pressed={width === edgeWidth.value}
              className={[
                styles.segmentButton,
                width === edgeWidth.value ? styles.segmentButtonActive : undefined
              ]
                .filter(Boolean)
                .join(" ")}
              key={edgeWidth.value}
              onClick={() => onStyleChange(edge.id, { ...edge.style, width: edgeWidth.value })}
              type="button"
            >
              <span
                aria-hidden="true"
                className={styles.edgeLinePreview}
                data-edge-width={edgeWidth.value}
              />
            </button>
          ))}
        </div>
      </EdgeToolbarDisclosure>

      <div aria-label="연결선 작업" className={styles.edgeToolbarDangerGroup} role="group">
        <button
          aria-label="연결선 삭제"
          className={styles.iconButtonDanger}
          onClick={() => onDelete(edge.id)}
          title="연결선 삭제"
          type="button"
        >
          <Trash2 aria-hidden="true" size={15} />
        </button>
      </div>
    </div>
  );
}

type EdgeToolbarDisclosureProps = {
  children: ReactNode;
  groupName: string;
  icon: ReactNode;
  indicator?: ReactNode;
  label: string;
  panelClassName?: string | undefined;
  title: string;
};

function EdgeToolbarDisclosure({
  children,
  groupName,
  icon,
  indicator,
  label,
  panelClassName,
  title
}: EdgeToolbarDisclosureProps) {
  return (
    <details
      className={styles.nodeToolbarDisclosure}
      name={groupName}
      onKeyDown={handleEdgeDisclosureKeyDown}
    >
      <summary aria-label={label} className={styles.iconButton} title={title}>
        {icon}
        {indicator}
      </summary>
      <div
        aria-label={title}
        className={[styles.nodeToolbarPanel, styles.edgeToolbarPanel, panelClassName]
          .filter(Boolean)
          .join(" ")}
        role="group"
      >
        {children}
      </div>
    </details>
  );
}

function handleEdgeDisclosureKeyDown(event: ReactKeyboardEvent<HTMLDetailsElement>): void {
  if (event.key !== "Escape") {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.removeAttribute("open");
  event.currentTarget.querySelector("summary")?.focus();
}

function closeEdgeDisclosure(target: HTMLElement): void {
  const details = target.closest("details");

  details?.removeAttribute("open");
  details?.querySelector("summary")?.focus();
}
