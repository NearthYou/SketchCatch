"use client";

import { useEffect, useMemo, useState } from "react";
import type { DiagramEdge, DiagramJson, DiagramNode } from "@sketchcatch/types";
import { getProjectDraft } from "../../features/workspace/api";

type DraftThumbnailState = "loading" | "ready" | "empty" | "error";

type DraftThumbnailResult = {
  readonly state: Exclude<DraftThumbnailState, "loading">;
  readonly diagram: DiagramJson | null;
};

type ThumbnailNode = {
  readonly id: string;
  readonly kind: DiagramNode["kind"];
  readonly label: string;
  readonly iconUrl: string | undefined;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly zIndex: number;
  readonly borderColor: string | undefined;
  readonly textColor: string | undefined;
};

type ScaledThumbnailNode = ThumbnailNode & {
  readonly fontSize: number;
  readonly showLabel: boolean;
};

type ThumbnailEdge = {
  readonly id: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly color: string | undefined;
  readonly width: number;
};

const THUMBNAIL_WIDTH = 520;
const THUMBNAIL_HEIGHT = 296;
const THUMBNAIL_PADDING = 24;

export function ProjectArchitectureThumbnail({
  projectId,
  projectName
}: {
  readonly projectId: string;
  readonly projectName: string;
}) {
  const [state, setState] = useState<DraftThumbnailState>("loading");
  const [diagram, setDiagram] = useState<DiagramJson | null>(null);

  useEffect(() => {
    let cancelled = false;

    setState("loading");
    setDiagram(null);

    void loadDraftThumbnail(projectId)
      .then((result) => {
        if (cancelled) {
          return;
        }

        setDiagram(result.diagram);
        setState(result.state);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setDiagram(null);
        setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const thumbnail = useMemo(() => {
    if (!diagram || diagram.nodes.length === 0) {
      return null;
    }

    return buildThumbnailModel(diagram);
  }, [diagram]);

  return (
    <div
      className="projectPreview projectArchitecturePreview"
      aria-label={`${projectName} architecture thumbnail`}
      data-state={state}
    >
      {thumbnail ? (
        <svg
          className="projectArchitectureSvg"
          viewBox={`0 0 ${thumbnail.width} ${thumbnail.height}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`${projectName} architecture`}
        >
          {thumbnail.edges.map((edge) => (
            <line
              className="projectArchitectureEdge"
              key={edge.id}
              stroke={edge.color}
              strokeWidth={edge.width}
              x1={edge.x1}
              x2={edge.x2}
              y1={edge.y1}
              y2={edge.y2}
            />
          ))}
          {thumbnail.nodes.map((node) => (
            <g className="projectArchitectureNode" key={node.id}>
              <rect
                className={node.kind === "design" ? "projectArchitectureNodeFrame" : "projectArchitectureNodeBox"}
                height={node.height}
                rx={node.kind === "design" ? 6 : 5}
                stroke={node.borderColor}
                width={node.width}
                x={node.x}
                y={node.y}
              />
              {node.kind !== "design" ? (
                <>
                  <rect
                    className="projectArchitectureNodeAccent"
                    height={Math.max(3, node.height * 0.08)}
                    rx="2"
                    width={Math.max(10, node.width - 12)}
                    x={node.x + 6}
                    y={node.y + 6}
                  />
                  {node.iconUrl ? (
                    <image
                      height={Math.min(22, Math.max(14, node.height * 0.34))}
                      href={node.iconUrl}
                      preserveAspectRatio="xMidYMid meet"
                      width={Math.min(22, Math.max(14, node.width * 0.24))}
                      x={node.x + 8}
                      y={node.y + node.height / 2 - Math.min(22, Math.max(14, node.height * 0.34)) / 2 + 4}
                    />
                  ) : null}
                  {node.showLabel ? (
                    <text
                      className="projectArchitectureNodeText"
                      fill={node.textColor}
                      fontSize={node.fontSize}
                      x={node.iconUrl ? node.x + 30 + (node.width - 36) / 2 : node.x + node.width / 2}
                      y={node.y + node.height / 2 + node.fontSize / 3 + 4}
                    >
                      {node.label}
                    </text>
                  ) : null}
                </>
              ) : null}
            </g>
          ))}
        </svg>
      ) : (
        <span className="projectArchitectureEmptyBoard" aria-hidden="true" />
      )}
    </div>
  );
}

async function loadDraftThumbnail(projectId: string): Promise<DraftThumbnailResult> {
  return getProjectDraft(projectId)
    .then((response) => ({
      diagram: response.draft?.diagramJson ?? null,
      state: response.draft?.diagramJson.nodes.length ? "ready" : "empty"
    }) satisfies DraftThumbnailResult)
    .catch(() => ({
      diagram: null,
      state: "error"
    }) satisfies DraftThumbnailResult);
}

function buildThumbnailModel(diagram: DiagramJson) {
  const nodes = diagram.nodes.map(toThumbnailNode);
  const bounds = getDiagramBounds(nodes);
  const scale = Math.min(
    (THUMBNAIL_WIDTH - THUMBNAIL_PADDING * 2) / Math.max(bounds.width, 1),
    (THUMBNAIL_HEIGHT - THUMBNAIL_PADDING * 2) / Math.max(bounds.height, 1)
  );
  const offsetX = (THUMBNAIL_WIDTH - bounds.width * scale) / 2;
  const offsetY = (THUMBNAIL_HEIGHT - bounds.height * scale) / 2;
  const scaledNodes = nodes
    .sort((left, right) => left.zIndex - right.zIndex)
    .map((node) => scaleNode(node, bounds, scale, offsetX, offsetY));
  const scaledNodeById = new Map(scaledNodes.map((node) => [node.id, node]));

  return {
    width: THUMBNAIL_WIDTH,
    height: THUMBNAIL_HEIGHT,
    nodes: scaledNodes,
    edges: diagram.edges
      .map((edge) => toThumbnailEdge(edge, scaledNodeById))
      .filter((edge): edge is ThumbnailEdge => edge !== null)
  };
}

function toThumbnailNode(node: DiagramNode): ThumbnailNode {
  return {
    id: node.id,
    kind: node.kind,
    label: node.label || node.parameters?.resourceName || node.type,
    iconUrl: node.iconUrl,
    x: node.position.x,
    y: node.position.y,
    width: Math.max(node.size.width, 1),
    height: Math.max(node.size.height, 1),
    zIndex: node.zIndex,
    borderColor: node.style?.borderColor,
    textColor: node.style?.textColor
  };
}

function scaleNode(
  node: ThumbnailNode,
  bounds: ReturnType<typeof getDiagramBounds>,
  scale: number,
  offsetX: number,
  offsetY: number
): ScaledThumbnailNode {
  const width = Math.max(node.width * scale, node.kind === "design" ? 72 : 78);
  const height = Math.max(node.height * scale, node.kind === "design" ? 46 : 50);
  const fontSize = Math.max(10, Math.min(14, height * 0.3));
  const availableTextWidth = width - (node.iconUrl ? 46 : 18);
  const label = trimThumbnailLabel(node.label, Math.max(3, Math.floor(availableTextWidth / (fontSize * 0.58))));

  return {
    ...node,
    label,
    x: (node.x - bounds.x) * scale + offsetX,
    y: (node.y - bounds.y) * scale + offsetY,
    width,
    height,
    fontSize,
    showLabel: label.trim().length > 0 && width >= 64 && height >= 38
  };
}

function trimThumbnailLabel(label: string, maxLength: number): string {
  const normalized = label.trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  if (maxLength <= 3) {
    return normalized.slice(0, Math.max(maxLength, 0));
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}

function toThumbnailEdge(
  edge: DiagramEdge,
  nodeById: ReadonlyMap<string, ScaledThumbnailNode>
): ThumbnailEdge | null {
  const source = nodeById.get(edge.sourceNodeId);
  const target = nodeById.get(edge.targetNodeId);

  if (!source || !target) {
    return null;
  }

  return {
    id: edge.id,
    x1: source.x + source.width / 2,
    y1: source.y + source.height / 2,
    x2: target.x + target.width / 2,
    y2: target.y + target.height / 2,
    color: edge.style?.color,
    width: edge.style?.width === "thick" ? 3 : edge.style?.width === "thin" ? 1.4 : 2
  };
}

function getDiagramBounds(nodes: readonly ThumbnailNode[]) {
  const first = nodes[0];

  if (!first) {
    return {
      x: 0,
      y: 0,
      width: 1,
      height: 1
    };
  }

  let minX = first.x;
  let minY = first.y;
  let maxX = first.x + first.width;
  let maxY = first.y + first.height;

  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}
