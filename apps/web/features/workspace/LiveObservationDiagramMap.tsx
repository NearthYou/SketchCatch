"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps
} from "@xyflow/react";
import { useMemo } from "react";
import type {
  ArchitectureJson,
  DiagramNode,
  LiveObservationV2Snapshot
} from "@sketchcatch/types";
import { ResourceIconImage } from "../../components/ui/ResourceIconImage";
import {
  getAreaNodeLabel,
  getAreaNodeMetaLabel,
  isAreaNode
} from "../diagram-editor/area-nodes";
import {
  createLiveObservationArchitectureModel,
  type LiveObservationArchitectureModel,
  type LiveObservationArchitectureResource,
  type LiveObservationArchitectureResourceState
} from "./live-observation-architecture";
import styles from "./workspace.module.css";

type LiveObservationFlowNodeData = Record<string, unknown> & {
  readonly diagramNode: DiagramNode;
  readonly resource: LiveObservationArchitectureResource | null;
};

type LiveObservationFlowNode = Node<LiveObservationFlowNodeData, "liveObservationResource">;

const NODE_TYPES = {
  liveObservationResource: LiveObservationResourceNode
};
const LIVE_OBSERVATION_LAYOUT_SCALE = 2.75;
const LIVE_OBSERVATION_RESOURCE_MIN_WIDTH = 168;
const LIVE_OBSERVATION_RESOURCE_MIN_HEIGHT = 112;
const LIVE_OBSERVATION_DETAIL_RESOURCE_MIN_WIDTH = 216;
const LIVE_OBSERVATION_DETAIL_RESOURCE_MIN_HEIGHT = 124;

export function LiveObservationDiagramMap({
  architecture,
  snapshot
}: {
  readonly architecture: ArchitectureJson;
  readonly snapshot: LiveObservationV2Snapshot | null;
}) {
  const model = useMemo(
    () => createLiveObservationArchitectureModel(architecture, snapshot),
    [architecture, snapshot]
  );
  const nodes = useMemo(() => createFlowNodes(model), [model]);
  const edges = useMemo(() => createFlowEdges(model), [model]);

  return (
    <section
      aria-label="배포된 전체 Architecture 읽기 전용 지도"
      className={styles.liveObservationDiagramMap}
      data-aggregate-state={model.aggregateObservationState}
      data-testid="live-observation-architecture-map"
    >
      <header className={styles.liveObservationArchitectureHeader}>
        <div>
          <strong>DEPLOYED ARCHITECTURE · READ ONLY</strong>
          <span>
            {model.resources.length} Resources
            {model.capacityModeLabel ? ` · ${model.capacityModeLabel}` : ""}
          </span>
        </div>
        <p>
          {getAggregateStateLabel(model.aggregateObservationState)} · 지원 Resource에는 AWS 세션의
          집계 상태를 표시합니다. 개별 Resource API 성공을 의미하지 않습니다. 전체 구조는
          미니맵과 드래그로 이동하고 +/-로 확대·축소할 수 있습니다.
        </p>
      </header>
      <div className={styles.liveObservationArchitectureCanvas}>
        <ReactFlow<LiveObservationFlowNode, Edge>
          colorMode="light"
          edges={edges}
          elementsSelectable={false}
          fitView
          fitViewOptions={{ maxZoom: 1.2, minZoom: 0.8, padding: 0.16 }}
          maxZoom={1.8}
          minZoom={0.12}
          nodeTypes={NODE_TYPES}
          nodes={nodes}
          nodesConnectable={false}
          nodesDraggable={false}
          panOnDrag
          proOptions={{ hideAttribution: true }}
          zoomOnDoubleClick={false}
        >
          <Background color="#d9dde3" gap={24} size={1} variant={BackgroundVariant.Dots} />
          <MiniMap pannable position="bottom-left" zoomable />
          <Controls position="bottom-right" showInteractive={false} />
        </ReactFlow>
      </div>
    </section>
  );
}

function LiveObservationResourceNode({ data }: NodeProps<LiveObservationFlowNode>) {
  const node = data.diagramNode;
  const resource = data.resource;
  const area = isAreaNode(node);
  const label = area ? getAreaNodeLabel(node) : node.label;
  const metaLabel = area ? getAreaNodeMetaLabel(node) : undefined;

  if (area) {
    return (
      <section
        className={styles.liveObservationArchitectureAreaNode}
        data-observation-state={resource?.observationState}
      >
        <LiveObservationEdgeEndpoints />
        <header className={styles.liveObservationArchitectureAreaHeader}>
          <ResourceIcon node={node} size={16} />
          <strong title={label}>{label}</strong>
          {resource ? (
            <small className={styles.liveObservationArchitectureAreaResourceType}>
              {resource.resourceType}
            </small>
          ) : null}
          {metaLabel ? <em>{metaLabel}</em> : null}
          {resource ? <ObservationStateBadge state={resource.observationState} /> : null}
        </header>
      </section>
    );
  }

  return (
    <article
      className={styles.liveObservationArchitectureResourceNode}
      data-observation-state={resource?.observationState}
    >
      <LiveObservationEdgeEndpoints />
      <span className={styles.liveObservationArchitectureResourceIcon}>
        <ResourceIcon node={node} size={34} />
      </span>
      <strong title={label}>{label}</strong>
      <small>{resource?.resourceType ?? node.parameters?.resourceType ?? node.type}</small>
      {resource?.detailLines.map((detailLine) => (
        <span
          className={styles.liveObservationArchitectureResourceDetail}
          key={detailLine}
          title={detailLine}
        >
          {detailLine}
        </span>
      ))}
      {resource ? <ObservationStateBadge state={resource.observationState} /> : null}
    </article>
  );
}

function LiveObservationEdgeEndpoints() {
  return (
    <>
      <Handle
        aria-hidden="true"
        className={styles.liveObservationArchitectureEdgeHandle}
        isConnectable={false}
        position={Position.Left}
        tabIndex={-1}
        type="target"
      />
      <Handle
        aria-hidden="true"
        className={styles.liveObservationArchitectureEdgeHandle}
        isConnectable={false}
        position={Position.Right}
        tabIndex={-1}
        type="source"
      />
    </>
  );
}

function ResourceIcon({ node, size }: { readonly node: DiagramNode; readonly size: number }) {
  const baseSize = 46;
  const inset = (baseSize - size) / 2;

  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-flex",
        height: baseSize,
        margin: `-${inset}px`,
        transform: `scale(${size / baseSize})`,
        transformOrigin: "center",
        width: baseSize
      }}
    >
      <ResourceIconImage
        alt=""
        className={styles.liveObservationPresentationIconImage}
        fallbackClassName={styles.liveObservationPresentationIconFallback}
        fallbackSize={baseSize}
        src={node.iconUrl}
      />
    </span>
  );
}

function ObservationStateBadge({
  state
}: {
  readonly state: LiveObservationArchitectureResourceState;
}) {
  return (
    <span
      className={styles.liveObservationArchitectureStateBadge}
      data-observation-state={state}
    >
      {getResourceStateLabel(state)}
    </span>
  );
}

function createFlowNodes(model: LiveObservationArchitectureModel): LiveObservationFlowNode[] {
  const resourceById = new Map(model.resources.map((resource) => [resource.id, resource]));

  return [...model.diagram.nodes]
    .sort((left, right) => left.zIndex - right.zIndex)
    .map((node) => {
      const resource = resourceById.get(node.id) ?? null;
      const hasDetailLines = (resource?.detailLines.length ?? 0) > 0;
      const layout = getLiveObservationMapNodeLayout(
        node,
        isAreaNode(node),
        hasDetailLines
      );

      return {
        data: {
          diagramNode: node,
          resource
        },
        draggable: false,
        id: node.id,
        position: layout.position,
        selectable: false,
        style: {
          height: layout.height,
          width: layout.width,
          zIndex: node.zIndex
        },
        type: "liveObservationResource" as const
      };
    });
}

function getLiveObservationMapNodeLayout(
  node: DiagramNode,
  area: boolean,
  hasDetailLines: boolean
): {
  readonly height: number;
  readonly position: DiagramNode["position"];
  readonly width: number;
} {
  const position = {
    x: node.position.x * LIVE_OBSERVATION_LAYOUT_SCALE,
    y: node.position.y * LIVE_OBSERVATION_LAYOUT_SCALE
  };

  if (area) {
    return {
      height: node.size.height * LIVE_OBSERVATION_LAYOUT_SCALE,
      position,
      width: node.size.width * LIVE_OBSERVATION_LAYOUT_SCALE
    };
  }

  return {
    height: Math.max(
      node.size.height,
      hasDetailLines
        ? LIVE_OBSERVATION_DETAIL_RESOURCE_MIN_HEIGHT
        : LIVE_OBSERVATION_RESOURCE_MIN_HEIGHT
    ),
    position,
    width: Math.max(
      node.size.width,
      hasDetailLines
        ? LIVE_OBSERVATION_DETAIL_RESOURCE_MIN_WIDTH
        : LIVE_OBSERVATION_RESOURCE_MIN_WIDTH
    )
  };
}

function createFlowEdges(model: LiveObservationArchitectureModel): Edge[] {
  return model.diagram.edges.map((edge) => ({
    animated: false,
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
      strokeDasharray:
        edge.style?.lineStyle === "dashed"
          ? "6 5"
          : edge.style?.lineStyle === "dotted"
            ? "2 5"
            : undefined,
      strokeWidth:
        edge.style?.width === "thick" ? 2.5 : edge.style?.width === "medium" ? 2 : 1.5
    },
    target: edge.targetNodeId,
    type: "smoothstep"
  }));
}

function getAggregateStateLabel(
  state: LiveObservationArchitectureModel["aggregateObservationState"]
): string {
  if (state === "configured") return "관측 세션 시작 전";
  if (state === "observed") return "AWS 집계 관측됨";
  if (state === "delayed") return "AWS 집계 지연";
  return "AWS 집계 사용 불가";
}

function getResourceStateLabel(state: LiveObservationArchitectureResourceState): string {
  if (state === "configured") return "설정됨";
  if (state === "observed") return "집계 관측됨";
  if (state === "delayed") return "집계 지연";
  if (state === "unavailable") return "집계 사용 불가";
  return "관측 데이터 없음";
}
