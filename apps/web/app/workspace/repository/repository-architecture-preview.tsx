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
import styles from "./repository-architecture-preview.module.css";

type RepositoryPreviewNodeData = Record<string, unknown> & {
  readonly diagramNode: DiagramNode;
};

type RepositoryPreviewFlowNode = Node<RepositoryPreviewNodeData, "repositoryPreview">;

const NODE_TYPES = {
  repositoryPreview: RepositoryPreviewNode
};

export function RepositoryArchitecturePreview({ diagram }: { readonly diagram: DiagramJson }) {
  const nodes = useMemo(() => createPreviewNodes(diagram), [diagram]);
  const edges = useMemo(() => createPreviewEdges(diagram), [diagram]);

  return (
    <div className={styles.canvas} data-testid="repository-architecture-preview">
      <ReactFlow<RepositoryPreviewFlowNode, Edge>
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

function RepositoryPreviewNode({ data }: NodeProps<RepositoryPreviewFlowNode>) {
  const node = data.diagramNode;
  const area = isAreaNode(node);
  const label = area ? getAreaNodeLabel(node) : node.label;
  const metaLabel = area ? getAreaNodeMetaLabel(node) : undefined;

  if (area) {
    return (
      <section className={styles.areaNode}>
        <header className={styles.areaHeader}>
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
    <article className={styles.resourceNode}>
      <span className={styles.resourceIcon}>
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

function createPreviewNodes(diagram: DiagramJson): RepositoryPreviewFlowNode[] {
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
      type: "repositoryPreview"
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
