"use client";

import { Box, Cloud, GripVertical } from "lucide-react";
import type { DragEvent } from "react";
import type { ResourceItem } from "../../../../packages/types/src";

import { clearActiveResourceDragPayload, writeResourceDragPayload } from "./diagram-utils";
import { resourceCatalog } from "../resource-settings/catalog";
import styles from "./diagram-editor.module.css";

export type DefaultDiagramPaletteProps = {
  items?: readonly ResourceItem[] | undefined;
};

export function DefaultDiagramPalette({ items = resourceCatalog }: DefaultDiagramPaletteProps) {
  const resources = items.filter((item) => !isDesignItem(item));
  const designItems = items.filter((item) => isDesignItem(item));

  return (
    <aside aria-label="다이어그램 팔레트" className={styles.palettePanel}>
      <div className={styles.panelHeader}>
        <p className={styles.panelKicker}>Palette</p>
        <h2 className={styles.panelTitle}>리소스</h2>
      </div>

      <PaletteSection icon={<Cloud aria-hidden="true" size={15} />} items={resources} title="AWS" />
      <PaletteSection icon={<Box aria-hidden="true" size={15} />} items={designItems} title="Design" />
    </aside>
  );
}

type PaletteSectionProps = {
  icon: React.ReactNode;
  items: readonly ResourceItem[];
  title: string;
};

function PaletteSection({ icon, items, title }: PaletteSectionProps) {
  return (
    <section className={styles.paletteSection}>
      <div className={styles.paletteSectionTitle}>
        {icon}
        <span>{title}</span>
      </div>
      <div className={styles.paletteList}>
        {items.map((item) => (
          <button
            aria-label={`${item.name} 노드 추가`}
            className={styles.paletteItem}
            draggable={item.enabled}
            key={item.id}
            onDragEnd={clearActiveResourceDragPayload}
            onDragStart={(event) => handlePaletteDragStart(event, item)}
            type="button"
          >
            <img alt="" className={styles.paletteIcon} draggable={false} src={item.iconUrl} />
            <span className={styles.paletteItemText}>
              <span className={styles.paletteItemName}>{item.name}</span>
              <span className={styles.paletteItemType}>{item.nodeDefaults.type}</span>
            </span>
            <GripVertical aria-hidden="true" className={styles.paletteGrip} size={14} />
          </button>
        ))}
      </div>
    </section>
  );
}

function handlePaletteDragStart(event: DragEvent<HTMLButtonElement>, item: ResourceItem) {
  writeResourceDragPayload(event.dataTransfer, item);
}

function isDesignItem(item: ResourceItem): boolean {
  return item.id.startsWith("design-") || item.nodeDefaults.type.startsWith("sketchcatch_");
}
