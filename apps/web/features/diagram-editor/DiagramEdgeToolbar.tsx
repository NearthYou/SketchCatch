"use client";

import { Trash2 } from "lucide-react";
import type { DiagramEdge, DiagramEdgeStyle } from "../../../../packages/types/src";

import { SelectMenu } from "../../components/ui/SelectMenu";
import { EDGE_COLOR_SWATCHES } from "./constants";
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

export function DiagramEdgeToolbar({
  edge,
  onDelete,
  onStyleChange,
  onTypeChange
}: DiagramEdgeToolbarProps) {
  const color = edge.style?.color ?? "#506176";
  const width = edge.style?.width ?? "medium";

  return (
    <div aria-label="연결선 도구" className={styles.edgeToolbar}>
      <SelectMenu
        ariaLabel="연결선 타입"
        className={styles.edgeSelect}
        emptyLabel="Smooth"
        onChange={(nextValue) => onTypeChange(edge.id, nextValue as DiagramEdgeKind)}
        options={EDGE_TYPES}
        size="compact"
        style={{ minWidth: 96 }}
        tone="purple"
        value={(edge.type as DiagramEdgeKind | undefined) ?? "smoothstep"}
        width="content"
      />

      <div aria-label="연결선 색상" className={styles.edgeSwatches}>
        {EDGE_COLOR_SWATCHES.map((swatchColor) => (
          <button
            aria-label={`연결선 색상 ${swatchColor}`}
            aria-pressed={color === swatchColor}
            className={styles.swatchButton}
            key={swatchColor}
            onClick={() => onStyleChange(edge.id, { ...edge.style, color: swatchColor })}
            style={{ backgroundColor: swatchColor }}
            type="button"
          />
        ))}
        <input
          aria-label="연결선 색상"
          className={styles.colorInput}
          onChange={(event) => onStyleChange(edge.id, { ...edge.style, color: event.target.value })}
          type="color"
          value={color}
        />
      </div>

      <div aria-label="연결선 굵기" className={styles.segmentedControl}>
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
            {edgeWidth.label}
          </button>
        ))}
      </div>

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
  );
}
