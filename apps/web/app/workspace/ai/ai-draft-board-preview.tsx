"use client";

import Image from "next/image";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps
} from "@xyflow/react";
import { Box } from "lucide-react";
import { useMemo } from "react";
import type { DiagramJson, DiagramNode } from "@sketchcatch/types";
import {
  getAreaNodeLabel,
  getAreaNodeMetaLabel,
  isAreaNode
} from "../../../features/diagram-editor/area-nodes";
import styles from "./workspace-ai-start.module.css";

type DraftPreviewNodeData = Record<string, unknown> & {
  readonly diagramNode: DiagramNode;
};

type DraftPreviewFlowNode = Node<DraftPreviewNodeData, "draftPreview">;

const NODE_TYPES = {
  draftPreview: DraftPreviewNode
};

export function AiDraftBoardPreview({ diagram }: { readonly diagram: DiagramJson }) {
  const nodes = useMemo(() => createPreviewNodes(diagram), [diagram]);
  const edges = useMemo(() => createPreviewEdges(diagram), [diagram]);

  return (
    <div className={styles.previewCanvas} data-testid="ai-draft-board-preview">
      <ReactFlow<DraftPreviewFlowNode, Edge>
        colorMode="light"
        edges={edges}
        elementsSelectable={false}
        fitView
        fitViewOptions={{ maxZoom: 1.25, minZoom: 0.25, padding: 0.16 }}
        maxZoom={1.8}
        minZoom={0.15}
        nodeTypes={NODE_TYPES}
        nodes={nodes}
        nodesConnectable={false}
        nodesDraggable={false}
        panOnDrag
        proOptions={{ hideAttribution: true }}
        zoomOnDoubleClick={false}
      >
        <Background color="#d9dde3" gap={24} size={1} variant={BackgroundVariant.Dots} />
        <Controls position="bottom-right" showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

function DraftPreviewNode({ data }: NodeProps<DraftPreviewFlowNode>) {
  const node = data.diagramNode;
  const area = isAreaNode(node);
  const label = area ? getAreaNodeLabel(node) : node.label;
  const metaLabel = area ? getAreaNodeMetaLabel(node) : undefined;

  if (area) {
    return (
      <section className={styles.previewAreaNode}>
        <header className={styles.previewAreaHeader}>
          {node.iconUrl ? (
            <Image alt="" height={16} src={node.iconUrl} unoptimized width={16} />
          ) : (
            <Box aria-hidden="true" size={15} />
          )}
          <strong>{label}</strong>
          {metaLabel ? <span>{metaLabel}</span> : null}
        </header>
      </section>
    );
  }

  return (
    <article className={styles.previewResourceNode}>
      <span className={styles.previewResourceIcon}>
        {node.iconUrl ? (
          <Image alt="" height={34} src={node.iconUrl} unoptimized width={34} />
        ) : (
          <Box aria-hidden="true" size={26} />
        )}
      </span>
      <strong title={label}>{label}</strong>
      <small>{node.parameters?.resourceType ?? node.type}</small>
    </article>
  );
}

function createPreviewNodes(diagram: DiagramJson): DraftPreviewFlowNode[] {
  return [...diagram.nodes]
    .sort((left, right) => left.zIndex - right.zIndex)
    .map((node) => ({
      data: { diagramNode: node },
      draggable: false,
      id: node.id,
      position: node.position,
      selectable: false,
      style: {
        height: node.size.height,
        width: node.size.width,
        zIndex: node.zIndex
      },
      type: "draftPreview"
    }));
}

function createPreviewEdges(diagram: DiagramJson): Edge[] {
  return diagram.edges
    .filter((edge) => edge.label?.trim().toLowerCase() !== "contains")
    .map((edge) => ({
      id: edge.id,
      label: edge.label,
      markerEnd: {
        color: "#6b7280",
        height: 16,
        type: MarkerType.ArrowClosed,
        width: 16
      },
      source: edge.sourceNodeId,
      style: {
        stroke: edge.style?.color ?? "#6b7280",
        strokeDasharray: edge.style?.lineStyle === "dashed" ? "6 5" : undefined,
        strokeWidth: edge.style?.width === "thick" ? 2.5 : 1.5
      },
      target: edge.targetNodeId,
      type: "smoothstep"
    }));
}
