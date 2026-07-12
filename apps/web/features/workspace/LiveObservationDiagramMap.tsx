import type { CSSProperties } from "react";
import { useMemo } from "react";
import type { DiagramJson, DiagramNode, LiveObservationSnapshot } from "@sketchcatch/types";
import { isAreaNode } from "../diagram-editor/area-nodes";
import type { LiveObservationSignalMapBurst } from "./LiveObservationSignalMap";
import { createLiveObservationDiagramModel } from "./live-observation-diagram";
import styles from "./workspace.module.css";

export function LiveObservationDiagramMap({
  burst,
  diagram,
  snapshot
}: {
  readonly burst: LiveObservationSignalMapBurst | null;
  readonly diagram: DiagramJson;
  readonly snapshot: LiveObservationSnapshot | null;
}) {
  const model = useMemo(
    () => createLiveObservationDiagramModel(diagram, snapshot),
    [diagram, snapshot]
  );
  const nodeById = new Map(model.nodes.map((node) => [node.id, node]));
  const edgePaths = diagram.edges.flatMap((edge) => {
    const source = nodeById.get(edge.sourceNodeId);
    const target = nodeById.get(edge.targetNodeId);

    if (!source || !target) {
      return [];
    }

    return [{
      ...edge,
      active: model.activeEdgeIds.has(edge.id),
      path: createEdgePath(source, target)
    }];
  });

  return (
    <section
      aria-label="프로젝트 다이어그램 기반 실시간 관측"
      className={styles.liveObservationDiagramMap}
      data-pressure-level={snapshot?.live.pressureLevel ?? "normal"}
    >
      <svg
        aria-hidden="true"
        className={styles.liveObservationDiagramEdges}
        preserveAspectRatio="none"
        viewBox={`${model.bounds.x} ${model.bounds.y} ${model.bounds.width} ${model.bounds.height}`}
      >
        {edgePaths.map((edge) => (
          <g key={edge.id}>
            <path
              className={edge.active ? styles.liveObservationDiagramEdgeActive : styles.liveObservationDiagramEdge}
              d={edge.path}
            />
            {edge.active && burst ? Array.from({ length: Math.min(2, burst.visibleParticleCount) }, (_, index) => (
              <circle className={styles.liveObservationDiagramPulse} key={`${burst.sequence}-${edge.id}-${index}`} r="6">
                <animateMotion
                  begin={`${index * 0.18}s`}
                  dur="1.25s"
                  fill="freeze"
                  path={edge.path}
                />
                <animate attributeName="opacity" dur="1.25s" values="0;1;1;0" />
              </circle>
            )) : null}
          </g>
        ))}
      </svg>

      {model.nodes.map((node) => (
        <article
          className={isAreaNode(node) ? styles.liveObservationDiagramArea : styles.liveObservationDiagramNode}
          data-observation-state={node.observationState}
          key={node.id}
          style={getNodeStyle(node, model.bounds)}
          title={node.label}
        >
          {node.iconUrl && !isAreaNode(node) ? <img alt="" src={node.iconUrl} /> : null}
          <strong>{node.label}</strong>
        </article>
      ))}
    </section>
  );
}

function createEdgePath(source: DiagramNode, target: DiagramNode): string {
  const sourceX = source.position.x + source.size.width / 2;
  const sourceY = source.position.y + source.size.height / 2;
  const targetX = target.position.x + target.size.width / 2;
  const targetY = target.position.y + target.size.height / 2;
  const controlOffset = Math.max(50, Math.abs(targetX - sourceX) * 0.45);

  return `M ${sourceX} ${sourceY} C ${sourceX + controlOffset} ${sourceY}, ${targetX - controlOffset} ${targetY}, ${targetX} ${targetY}`;
}

function getNodeStyle(
  node: DiagramNode,
  bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
): CSSProperties {
  return {
    height: `${(node.size.height / bounds.height) * 100}%`,
    left: `${((node.position.x - bounds.x) / bounds.width) * 100}%`,
    top: `${((node.position.y - bounds.y) / bounds.height) * 100}%`,
    width: `${(node.size.width / bounds.width) * 100}%`,
    zIndex: node.zIndex ?? 1
  };
}
