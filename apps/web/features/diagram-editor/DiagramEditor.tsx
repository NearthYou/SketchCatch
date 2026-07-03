"use client";

import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  PanOnScrollMode,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  getViewportForBounds,
  useReactFlow
} from "@xyflow/react";
import type {
  Connection,
  EdgeChange,
  NodeChange,
  NodePositionChange,
  NodeSelectionChange,
  OnConnect,
  OnConnectEnd,
  OnConnectStart,
  OnEdgesChange,
  OnInit,
  OnMoveEnd,
  OnNodesChange,
  OnSelectionChangeFunc,
  ReactFlowInstance,
  Viewport
} from "@xyflow/react";
import {
  Box,
  LayoutGrid,
  Maximize2,
  MousePointer2,
  Move,
  Redo2,
  Undo2,
  UserRound,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  DragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent
} from "react";
import type { DiagramEdge, DiagramJson, DiagramNode } from "../../../../packages/types/src";

import { ParameterInputPanel } from "../parameter-input";
import { terraformParameterCatalog } from "../parameter-input/catalog";
import { ResourceSettingsPanel } from "../resource-settings";
import { DEFAULT_DIAGRAM_VIEWPORT, EMPTY_DIAGRAM } from "./constants";
import {
  applyAreaNodeParentAssignments,
  clearDeletedAreaParentAssignments,
  clearOutOfBoundsAreaParentAssignments
} from "./area-node-movement";
import { findInnermostAreaNodeAtPoint } from "./area-nodes";
import {
  getAreaBlankInteractionTarget,
  isCanvasInteractiveElementTarget
} from "./canvas-pointer-hit-test";
import { DiagramEdgeToolbar } from "./DiagramEdgeToolbar";
import { DiagramNodeView } from "./DiagramNodeView";
import {
  finalizeDraggedNodes,
  getDraggedPreviewNodes,
  snapPositionToDiagramGrid
} from "./drag-transaction";
import {
  applyNodeMetadataUpdate,
  applyNodeParametersUpdateWithResourceLabel,
  areDiagramsEqual,
  clearActiveResourceDragPayload,
  cloneDiagram,
  createDiagramEdge,
  createDiagramNodeFromPayload,
  createPastedNodes,
  getDefaultViewport,
  getActiveResourceDragPayload,
  getNextZIndex,
  removeEdgesFromDiagram,
  removeNodesFromDiagram,
  updateDiagramViewport,
  updateNodeById
} from "./diagram-utils";
import { toFlowEdges, toFlowNodes } from "./flow-mappers";
import {
  applyContainingReferenceDropTargets,
  findInnermostVisualDropTarget
} from "./reference-drop-targets";
import type { NodeResizeUpdate } from "./node-resize";
import {
  canStartAreaBlankDrag,
  getSingleSelectedEdgeForToolbar,
  normalizeSelectedNodeIds
} from "./selection-utils";
import type {
  DiagramEditorPanelContext,
  DiagramEditorProps,
  DiagramFlowEdge,
  DiagramFlowNode,
  DiagramHistoryState,
  DiagramNodeMetadataUpdate
} from "./types";
import styles from "./diagram-editor.module.css";

const NODE_TYPES = {
  diagramNode: DiagramNodeView
};

const MAX_HISTORY_ITEMS = 80;
const LEFT_PANEL_WIDTH_STORAGE_KEY = "sketchcatch.diagramEditor.leftPanelWidth";
const RIGHT_PANEL_WIDTH_STORAGE_KEY = "sketchcatch.diagramEditor.rightPanelWidth";
const DEFAULT_LEFT_PANEL_WIDTH = 420;
const DEFAULT_RIGHT_PANEL_WIDTH = 420;
const MIN_LEFT_PANEL_WIDTH = 300;
const MAX_LEFT_PANEL_WIDTH = 640;
const MIN_RIGHT_PANEL_WIDTH = 300;
const MAX_RIGHT_PANEL_WIDTH = 640;
const MIN_WORKSPACE_WIDTH = 420;
const DIAGRAM_SNAP_GRID_SIZE = 12;
const DIAGRAM_SNAP_GRID: [number, number] = [DIAGRAM_SNAP_GRID_SIZE, DIAGRAM_SNAP_GRID_SIZE];
const SNAP_ANIMATION_MS = 110;
const SNAP_ANIMATION_CLEAR_MS = SNAP_ANIMATION_MS + 30;

type AreaBlankDragState = {
  before: DiagramJson;
  hasMoved: boolean;
  latestNodePosition: DiagramNode["position"];
  nodeId: string;
  pointerId: number;
  snapshotNodes: DiagramNode[];
  startClientPosition: DiagramNode["position"];
  startNodePosition: DiagramNode["position"];
};

export function DiagramEditor(props: DiagramEditorProps) {
  return (
    <ReactFlowProvider>
      <DiagramEditorInner {...props} />
    </ReactFlowProvider>
  );
}

function DiagramEditorInner({
  draftStatusPanel,
  floatingPanel,
  initialDiagram,
  leftPanel,
  onDiagramChange,
  myPageHref = "/mypage",
  projectName = "Project workspace",
  rightPanel,
  saveStatus = "Local editing"
}: DiagramEditorProps) {
  const reactFlow = useReactFlow<DiagramFlowNode, DiagramFlowEdge>();
  const [diagram, setDiagram] = useState<DiagramJson>(() => cloneDiagram(initialDiagram ?? EMPTY_DIAGRAM));
  const diagramRef = useRef(diagram);
  const [previewDiagram, setPreviewDiagram] = useState<DiagramJson | null>(null);
  const [history, setHistory] = useState<DiagramHistoryState>({ past: [], future: [] });
  const [inspectedNodeId, setInspectedNodeId] = useState<string | null>(null);
  const [isLeftPanelOpen, setLeftPanelOpen] = useState(true);
  const [isRightPanelOpen, setRightPanelOpen] = useState(true);
  const [leftPanelWidth, setLeftPanelWidth] = useState(readStoredLeftPanelWidth);
  const [rightPanelWidth, setRightPanelWidth] = useState(readStoredRightPanelWidth);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
  const [dragPreviewNodes, setDragPreviewNodes] = useState<DiagramNode[] | null>(null);
  const [activeReferenceDropTargetNodeId, setActiveReferenceDropTargetNodeId] = useState<string | null>(null);
  const [interactionMode, setInteractionMode] = useState<"select" | "pan">("select");
  const [isFlowReady, setFlowReady] = useState(false);
  const temporaryPanPreviousModeRef = useRef<"select" | "pan" | null>(null);
  const clipboardRef = useRef<DiagramNode[]>([]);
  const canvasPanelRef = useRef<HTMLDivElement | null>(null);
  const directNodeDragIdsRef = useRef<Set<string> | null>(null);
  const dragAnchorNodeIdRef = useRef<string | null>(null);
  const dragPreviewNodesRef = useRef<DiagramNode[] | null>(null);
  const dragSnapshotRef = useRef<DiagramJson | null>(null);
  const editorShellRef = useRef<HTMLElement | null>(null);
  const leftRailRef = useRef<HTMLDivElement | null>(null);
  const resizeSnapshotRef = useRef<DiagramJson | null>(null);
  const areaBlankDragRef = useRef<AreaBlankDragState | null>(null);
  const flowInstanceRef = useRef<ReactFlowInstance<DiagramFlowNode, DiagramFlowEdge> | null>(null);
  const connectStartNodeIdRef = useRef<string | null>(null);
  const shouldAutoFitInitialDiagramRef = useRef((initialDiagram?.nodes.length ?? 0) > 0);
  const initialAutoFitFrameRef = useRef<number | null>(null);
  const isLeftPanelResizingRef = useRef(false);
  const isRightPanelResizingRef = useRef(false);
  const snapAnimationFrameRef = useRef<number | null>(null);
  const snapAnimationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hoveredAreaBlankNodeId, setHoveredAreaBlankNodeId] = useState<string | null>(null);
  const [isAreaBlankDragging, setAreaBlankDragging] = useState(false);
  const [isSnapAnimating, setSnapAnimating] = useState(false);

  const selectedNodeId = selectedNodeIds.length === 1 ? selectedNodeIds[0] ?? null : null;
  const isPreviewActive = previewDiagram !== null;
  const visibleDiagram = previewDiagram ?? diagram;
  const selectedEdge = isPreviewActive ? null : getSingleSelectedEdgeForToolbar(diagram.edges, selectedNodeIds, selectedEdgeIds);
  const hoveredSelectedAreaNode = hoveredAreaBlankNodeId && selectedNodeId === hoveredAreaBlankNodeId
    ? diagram.nodes.find((node) => node.id === hoveredAreaBlankNodeId) ?? null
    : null;
  const shouldShowAreaBlankMoveCursor = Boolean(hoveredSelectedAreaNode && !hoveredSelectedAreaNode.locked);
  const shouldShowAreaBlankBlockedCursor = Boolean(hoveredSelectedAreaNode?.locked);

  const replaceDiagram = useCallback(
    (nextDiagram: DiagramJson, notifyChange = true) => {
      diagramRef.current = nextDiagram;
      setDiagram(nextDiagram);

      if (notifyChange) {
        onDiagramChange?.(cloneDiagram(nextDiagram));
      }
    },
    [onDiagramChange]
  );

  const setDragPreviewNodesForState = useCallback((nodes: DiagramNode[] | null) => {
    dragPreviewNodesRef.current = nodes;
    setDragPreviewNodes(nodes);
  }, []);

  const clearSnapAnimationHandles = useCallback(() => {
    if (snapAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(snapAnimationFrameRef.current);
      snapAnimationFrameRef.current = null;
    }

    if (snapAnimationTimeoutRef.current !== null) {
      clearTimeout(snapAnimationTimeoutRef.current);
      snapAnimationTimeoutRef.current = null;
    }
  }, []);

  const cancelSnapAnimation = useCallback(() => {
    clearSnapAnimationHandles();
    setSnapAnimating(false);
    setDragPreviewNodesForState(null);
  }, [clearSnapAnimationHandles, setDragPreviewNodesForState]);

  const startSnapAnimation = useCallback(
    (fromNodes: readonly DiagramNode[], toNodes: readonly DiagramNode[]) => {
      clearSnapAnimationHandles();

      if (
        !haveAnyNodePositionDifference(fromNodes, toNodes) ||
        (typeof window !== "undefined" &&
          typeof window.matchMedia === "function" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      ) {
        setSnapAnimating(false);
        setDragPreviewNodesForState(null);
        return;
      }

      setSnapAnimating(true);
      setDragPreviewNodesForState([...fromNodes]);
      snapAnimationFrameRef.current = window.requestAnimationFrame(() => {
        snapAnimationFrameRef.current = window.requestAnimationFrame(() => {
          snapAnimationFrameRef.current = null;
          setDragPreviewNodesForState([...toNodes]);
        });
      });
      snapAnimationTimeoutRef.current = setTimeout(() => {
        snapAnimationTimeoutRef.current = null;
        setSnapAnimating(false);
        setDragPreviewNodesForState(null);
      }, SNAP_ANIMATION_CLEAR_MS);
    },
    [clearSnapAnimationHandles, setDragPreviewNodesForState]
  );

  const clearNodeDragState = useCallback(() => {
    dragSnapshotRef.current = null;
    directNodeDragIdsRef.current = null;
    dragAnchorNodeIdRef.current = null;
  }, []);

  useEffect(() => () => clearSnapAnimationHandles(), [clearSnapAnimationHandles]);

  useEffect(() => {
    cancelSnapAnimation();
    const nextDiagram = cloneDiagram(initialDiagram ?? EMPTY_DIAGRAM);
    replaceDiagram(nextDiagram, false);
    shouldAutoFitInitialDiagramRef.current = nextDiagram.nodes.length > 0;
    setHistory({ past: [], future: [] });
    setPreviewDiagram(null);
    setInspectedNodeId(null);
    setSelectedNodeIds([]);
    setSelectedEdgeIds([]);
    setActiveReferenceDropTargetNodeId(null);

    if (initialAutoFitFrameRef.current !== null) {
      window.cancelAnimationFrame(initialAutoFitFrameRef.current);
      initialAutoFitFrameRef.current = null;
    }
  }, [cancelSnapAnimation, initialDiagram, replaceDiagram]);

  const pushHistory = useCallback((before: DiagramJson, after: DiagramJson) => {
    if (areDiagramsEqual(before, after)) {
      return;
    }

    setHistory((currentHistory) => ({
      past: [...currentHistory.past, cloneDiagram(before)].slice(-MAX_HISTORY_ITEMS),
      future: []
    }));
  }, []);

  const commitDiagramUpdate = useCallback(
    (updater: (currentDiagram: DiagramJson) => DiagramJson) => {
      const before = diagramRef.current;
      const after = updater(before);

      if (areDiagramsEqual(before, after)) {
        return;
      }

      pushHistory(before, after);
      replaceDiagram(after);
    },
    [pushHistory, replaceDiagram]
  );

  const applyLiveDiagramUpdate = useCallback(
    (updater: (currentDiagram: DiagramJson) => DiagramJson) => {
      const after = updater(diagramRef.current);
      replaceDiagram(after);
    },
    [replaceDiagram]
  );

  const focusEditorShell = useCallback(() => {
    editorShellRef.current?.focus({ preventScroll: true });
  }, []);

  const updateLeftPanelWidth = useCallback((nextWidth: number) => {
    setLeftPanelWidth(() => {
      const clampedWidth = clampLeftPanelWidth(nextWidth);
      storeLeftPanelWidth(clampedWidth);
      return clampedWidth;
    });
  }, []);

  const updateRightPanelWidth = useCallback((nextWidth: number) => {
    setRightPanelWidth(() => {
      const clampedWidth = clampRightPanelWidth(nextWidth);
      storeRightPanelWidth(clampedWidth);
      return clampedWidth;
    });
  }, []);

  const handleLeftPanelResizeStart = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    isLeftPanelResizingRef.current = true;
    updateLeftPanelWidth(getLeftPanelWidthFromPointer(event.clientX, leftRailRef.current));
  }, [updateLeftPanelWidth]);

  const handleLeftPanelResizeMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!isLeftPanelResizingRef.current) {
      return;
    }

    updateLeftPanelWidth(getLeftPanelWidthFromPointer(event.clientX, leftRailRef.current));
  }, [updateLeftPanelWidth]);

  const handleLeftPanelResizeEnd = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!isLeftPanelResizingRef.current) {
      return;
    }

    isLeftPanelResizingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const handleLeftPanelResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") {
        return;
      }

      event.preventDefault();

      if (event.key === "Home") {
        updateLeftPanelWidth(MIN_LEFT_PANEL_WIDTH);
        return;
      }

      if (event.key === "End") {
        updateLeftPanelWidth(MAX_LEFT_PANEL_WIDTH);
        return;
      }

      updateLeftPanelWidth(leftPanelWidth + (event.key === "ArrowRight" ? 24 : -24));
    },
    [leftPanelWidth, updateLeftPanelWidth]
  );

  const handleRightPanelResizeStart = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    isRightPanelResizingRef.current = true;
    updateRightPanelWidth(window.innerWidth - event.clientX);
  }, [updateRightPanelWidth]);

  const handleRightPanelResizeMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!isRightPanelResizingRef.current) {
      return;
    }

    updateRightPanelWidth(window.innerWidth - event.clientX);
  }, [updateRightPanelWidth]);

  const handleRightPanelResizeEnd = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!isRightPanelResizingRef.current) {
      return;
    }

    isRightPanelResizingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const handleRightPanelResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") {
        return;
      }

      event.preventDefault();

      if (event.key === "Home") {
        updateRightPanelWidth(MIN_RIGHT_PANEL_WIDTH);
        return;
      }

      if (event.key === "End") {
        updateRightPanelWidth(MAX_RIGHT_PANEL_WIDTH);
        return;
      }

      updateRightPanelWidth(rightPanelWidth + (event.key === "ArrowLeft" ? 24 : -24));
    },
    [rightPanelWidth, updateRightPanelWidth]
  );

  const updateActiveReferenceDropTargetNodeId = useCallback((nodeId: string | null) => {
    setActiveReferenceDropTargetNodeId((currentNodeId) => (currentNodeId === nodeId ? currentNodeId : nodeId));
  }, []);

  const getVisualDropTargetNodeId = useCallback((childNode: DiagramNode, nodes: readonly DiagramNode[]) => {
    return findInnermostVisualDropTarget(childNode, nodes, terraformParameterCatalog)?.id ?? null;
  }, []);

  const undo = useCallback(() => {
    cancelSnapAnimation();
    setHistory((currentHistory) => {
      const previous = currentHistory.past.at(-1);

      if (!previous) {
        return currentHistory;
      }

      const currentDiagram = diagramRef.current;
      replaceDiagram(cloneDiagram(previous));
      setInspectedNodeId(null);
      setSelectedNodeIds([]);
      setSelectedEdgeIds([]);

      return {
        past: currentHistory.past.slice(0, -1),
        future: [cloneDiagram(currentDiagram), ...currentHistory.future]
      };
    });
  }, [cancelSnapAnimation, replaceDiagram]);

  const redo = useCallback(() => {
    cancelSnapAnimation();
    setHistory((currentHistory) => {
      const next = currentHistory.future[0];

      if (!next) {
        return currentHistory;
      }

      const currentDiagram = diagramRef.current;
      replaceDiagram(cloneDiagram(next));
      setInspectedNodeId(null);
      setSelectedNodeIds([]);
      setSelectedEdgeIds([]);

      return {
        past: [...currentHistory.past, cloneDiagram(currentDiagram)].slice(-MAX_HISTORY_ITEMS),
        future: currentHistory.future.slice(1)
      };
    });
  }, [cancelSnapAnimation, replaceDiagram]);

  const updateNodeMetadata = useCallback(
    (nodeId: string, update: DiagramNodeMetadataUpdate | ((node: DiagramNode) => DiagramNodeMetadataUpdate)) => {
      commitDiagramUpdate((currentDiagram) => ({
        ...currentDiagram,
        nodes: updateNodeById(currentDiagram.nodes, nodeId, (node) =>
          applyNodeMetadataUpdate(node, typeof update === "function" ? update(node) : update)
        )
      }));
    },
    [commitDiagramUpdate]
  );

  const updateNodeParameters = useCallback<DiagramEditorPanelContext["updateNodeParameters"]>(
    (nodeId, update) => {
      commitDiagramUpdate((currentDiagram) => ({
        ...currentDiagram,
        nodes: updateNodeById(currentDiagram.nodes, nodeId, (node) =>
          applyNodeParametersUpdateWithResourceLabel(node, update)
        )
      }));
    },
    [commitDiagramUpdate]
  );

  const applyDiagramJson = useCallback<DiagramEditorPanelContext["applyDiagramJson"]>(
    (nextDiagram) => {
      commitDiagramUpdate(() => cloneDiagram(nextDiagram));
      setPreviewDiagram(null);
      setInspectedNodeId(null);
      setSelectedNodeIds([]);
      setSelectedEdgeIds([]);
    },
    [commitDiagramUpdate]
  );

  const focusResourceNode = useCallback<DiagramEditorPanelContext["focusResourceNode"]>(
    (nodeId) => {
      const targetNode = diagramRef.current.nodes.find((node) => node.id === nodeId);

      if (!targetNode) {
        return;
      }

      setSelectedNodeIds([nodeId]);
      setSelectedEdgeIds([]);
      setInspectedNodeId(nodeId);
      setRightPanelOpen(true);

      const canvasBounds = canvasPanelRef.current?.getBoundingClientRect();
      const editorBounds = editorShellRef.current?.getBoundingClientRect();

      if (!canvasBounds || canvasBounds.width <= 0 || canvasBounds.height <= 0) {
        void reactFlow.fitView({
          duration: 180,
          maxZoom: 1.5,
          minZoom: 0.35,
          nodes: [{ id: nodeId }],
          padding: 0.6
        });
        return;
      }

      const fitViewWidth = editorBounds && editorBounds.width > 0 ? editorBounds.width : canvasBounds.width;
      const viewport = getViewportForBounds(
        getDiagramBounds([targetNode]),
        fitViewWidth,
        canvasBounds.height,
        0.35,
        1.5,
        0.6
      );

      void reactFlow.setViewport(viewport, { duration: 180 });
      applyLiveDiagramUpdate((currentDiagram) => updateDiagramViewport(currentDiagram, viewport));
      focusEditorShell();
    },
    [applyLiveDiagramUpdate, focusEditorShell, reactFlow]
  );

  const selectResourceNode = useCallback<DiagramEditorPanelContext["selectResourceNode"]>((nodeId) => {
    const targetNode = diagramRef.current.nodes.find((node) => node.id === nodeId);

    if (!targetNode) {
      return;
    }

    setSelectedNodeIds([nodeId]);
    setSelectedEdgeIds([]);
    setInspectedNodeId(nodeId);
    setRightPanelOpen(true);
  }, []);

  const panelContext = useMemo<DiagramEditorPanelContext>(
    () => ({
      diagram,
      inspectedNodeId,
      isPreviewActive,
      isRightPanelOpen,
      previewDiagram,
      selectedNodeId,
      nodes: diagram.nodes,
      edges: diagram.edges,
      applyDiagramJson,
      closeInspectedNode: () => setInspectedNodeId(null),
      focusResourceNode,
      selectResourceNode,
      setPreviewDiagram,
      setRightPanelOpen,
      updateNodeParameters,
      updateNodeMetadata
    }),
    [
      applyDiagramJson,
      diagram,
      focusResourceNode,
      inspectedNodeId,
      isPreviewActive,
      isRightPanelOpen,
      previewDiagram,
      selectResourceNode,
      selectedNodeId,
      updateNodeMetadata,
      updateNodeParameters
    ]
  );

  const handleBringForward = useCallback(
    (nodeId: string) => {
      updateNodeMetadata(nodeId, () => ({
        zIndex: getNextZIndex(diagramRef.current.nodes)
      }));
    },
    [updateNodeMetadata]
  );

  const handleSendBackward = useCallback(
    (nodeId: string) => {
      updateNodeMetadata(nodeId, () => {
        const minZIndex = Math.min(0, ...diagramRef.current.nodes.map((node) => node.zIndex));
        return {
          zIndex: minZIndex - 1
        };
      });
    },
    [updateNodeMetadata]
  );

  const handleTextColorChange = useCallback(
    (nodeId: string, color: string) => {
      updateNodeMetadata(nodeId, (node) => ({
        style: {
          ...node.style,
          textColor: color
        }
      }));
    },
    [updateNodeMetadata]
  );

  const handleBorderColorChange = useCallback(
    (nodeId: string, color: string) => {
      updateNodeMetadata(nodeId, (node) => ({
        style: {
          ...node.style,
          borderColor: color
        }
      }));
    },
    [updateNodeMetadata]
  );

  const handleToggleLock = useCallback(
    (nodeId: string) => {
      updateNodeMetadata(nodeId, (node) => ({
        locked: !node.locked
      }));
    },
    [updateNodeMetadata]
  );

  const handleResizeStart = useCallback(() => {
    cancelSnapAnimation();
    resizeSnapshotRef.current = cloneDiagram(diagramRef.current);
  }, [cancelSnapAnimation]);

  const handleResize = useCallback(
    (nodeId: string, update: NodeResizeUpdate) => {
      applyLiveDiagramUpdate((currentDiagram) => ({
        ...currentDiagram,
        nodes: updateNodeById(currentDiagram.nodes, nodeId, (node) => ({
          ...node,
          position: update.position,
          size: update.size
        }))
      }));
    },
    [applyLiveDiagramUpdate]
  );

  const handleResizeEnd = useCallback(
    (nodeId: string, update: NodeResizeUpdate) => {
      const before = resizeSnapshotRef.current;
      const resizedDiagram = {
        ...diagramRef.current,
        nodes: updateNodeById(diagramRef.current.nodes, nodeId, (node) => ({
          ...node,
          position: update.position,
          size: update.size
        }))
      };
      const after = {
        ...resizedDiagram,
        nodes: clearOutOfBoundsAreaParentAssignments(resizedDiagram.nodes, new Set([nodeId]))
      };

      replaceDiagram(after);

      if (before) {
        pushHistory(before, after);
      }

      resizeSnapshotRef.current = null;
    },
    [pushHistory, replaceDiagram]
  );

  const displayNodes = isPreviewActive ? visibleDiagram.nodes : dragPreviewNodes ?? diagram.nodes;
  const flowNodes = useMemo(
    () => {
      const nextFlowNodes = toFlowNodes(
        displayNodes,
        isPreviewActive ? [] : selectedNodeIds,
        isPreviewActive ? null : activeReferenceDropTargetNodeId,
        {
          onBringForward: handleBringForward,
          onSendBackward: handleSendBackward,
          onTextColorChange: handleTextColorChange,
          onBorderColorChange: handleBorderColorChange,
          onToggleLock: handleToggleLock,
          onResizeStart: handleResizeStart,
          onResize: handleResize,
          onResizeEnd: handleResizeEnd
        },
        { isPreview: isPreviewActive }
      );

      if (interactionMode === "select" && !isPreviewActive) {
        return nextFlowNodes;
      }

      // React Flow는 노드별 draggable 값이 있으면 전체 nodesDraggable 설정보다 그 값을 우선한다.
      return nextFlowNodes.map((node) => ({
        ...node,
        connectable: false,
        draggable: false
      }));
    },
    [
      activeReferenceDropTargetNodeId,
      displayNodes,
      handleBorderColorChange,
      handleBringForward,
      interactionMode,
      isPreviewActive,
      handleResizeEnd,
      handleResize,
      handleResizeStart,
      handleSendBackward,
      handleTextColorChange,
      handleToggleLock,
      selectedNodeIds
    ]
  );

  const flowEdges = useMemo(
    () => toFlowEdges(visibleDiagram.edges, isPreviewActive ? [] : selectedEdgeIds, { isPreview: isPreviewActive }),
    [isPreviewActive, selectedEdgeIds, visibleDiagram.edges]
  );

  const handleInit = useCallback<OnInit<DiagramFlowNode, DiagramFlowEdge>>((instance) => {
    flowInstanceRef.current = instance;
    setFlowReady(true);
  }, []);

  const handleNodesChange = useCallback<OnNodesChange<DiagramFlowNode>>(
    (changes) => {
      const nextSelectedNodeIds = applySelectionChanges(selectedNodeIds, changes);
      const positionChanges = changes.filter(isNodePositionChangeWithPosition);

      if (nextSelectedNodeIds) {
        setSelectedNodeIds(normalizeSelectedNodeIds(diagramRef.current.nodes, nextSelectedNodeIds));
      }

      if (positionChanges.length === 0 || interactionMode !== "select") {
        return;
      }

      const positionByNodeId = new Map(positionChanges.map((change) => [change.id, change.position]));
      const dragSnapshot = dragSnapshotRef.current;
      const directNodeDragIds = directNodeDragIdsRef.current;

      if (dragSnapshot && directNodeDragIds) {
        setDragPreviewNodesForState(
          getDraggedPreviewNodes({
            currentNodes: diagramRef.current.nodes,
            directlyMovedNodeIds: directNodeDragIds,
            positionByNodeId,
            snapshotNodes: dragSnapshot.nodes
          })
        );
        return;
      }

      applyLiveDiagramUpdate((currentDiagram) => {
        const directlyMovedNodeIds = new Set(positionByNodeId.keys());

        return {
          ...currentDiagram,
          nodes: getDraggedPreviewNodes({
            currentNodes: currentDiagram.nodes,
            directlyMovedNodeIds,
            positionByNodeId,
            snapshotNodes: currentDiagram.nodes
          })
        };
      });
    },
    [applyLiveDiagramUpdate, interactionMode, selectedNodeIds, setDragPreviewNodesForState]
  );

  const handleEdgesChange = useCallback<OnEdgesChange<DiagramFlowEdge>>(
    (changes) => {
      const nextSelectedEdgeIds = applySelectionChanges(selectedEdgeIds, changes);

      if (nextSelectedEdgeIds) {
        setSelectedEdgeIds(nextSelectedEdgeIds);
      }
    },
    [selectedEdgeIds]
  );

  const handleSelectionChange = useCallback<OnSelectionChangeFunc<DiagramFlowNode, DiagramFlowEdge>>(
    ({ edges, nodes }) => {
      const nextSelectedNodeIds = normalizeSelectedNodeIds(
        diagramRef.current.nodes,
        nodes.map((node) => node.id)
      );

      setSelectedNodeIds(nextSelectedNodeIds);
      setSelectedEdgeIds(nextSelectedNodeIds.length > 0 ? [] : edges.map((edge) => edge.id));

      if (nodes.length > 0 || edges.length > 0) {
        focusEditorShell();
      }
    },
    [focusEditorShell]
  );

  const handleCanvasMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.button !== 1) {
        return;
      }

      event.preventDefault();
      if (interactionMode !== "pan" && temporaryPanPreviousModeRef.current === null) {
        temporaryPanPreviousModeRef.current = interactionMode;
      }
      setInteractionMode("pan");
      focusEditorShell();
    },
    [focusEditorShell, interactionMode]
  );

  const handleCanvasAuxClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button === 1) {
      event.preventDefault();
    }
  }, []);

  const selectAreaBlankNode = useCallback(
    (nodeId: string) => {
      setSelectedNodeIds([nodeId]);
      setSelectedEdgeIds([]);
      setInspectedNodeId(null);
      focusEditorShell();
    },
    [focusEditorShell]
  );

  const inspectAreaBlankNode = useCallback(
    (nodeId: string) => {
      setSelectedNodeIds([nodeId]);
      setSelectedEdgeIds([]);
      setInspectedNodeId(nodeId);
      setRightPanelOpen(true);
      focusEditorShell();
    },
    [focusEditorShell]
  );

  const getAreaNodeFromPointerEvent = useCallback(
    (clientX: number, clientY: number) => {
      const position = reactFlow.screenToFlowPosition({
        x: clientX,
        y: clientY
      });

      return findInnermostAreaNodeAtPoint(diagramRef.current.nodes, position);
    },
    [reactFlow]
  );

  const handleAreaBlankDragMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const dragState = areaBlankDragRef.current;

      if (!dragState || dragState.pointerId !== event.pointerId) {
        return false;
      }

      event.preventDefault();
      event.stopPropagation();

      const zoom = reactFlow.getZoom() || 1;
      const nextPosition = {
        x: dragState.startNodePosition.x + (event.clientX - dragState.startClientPosition.x) / zoom,
        y: dragState.startNodePosition.y + (event.clientY - dragState.startClientPosition.y) / zoom
      };

      if (!isDifferentPosition(dragState.startNodePosition, nextPosition) && !dragState.hasMoved) {
        return true;
      }

      if (isDifferentPosition(dragState.startNodePosition, nextPosition)) {
        dragState.hasMoved = true;
      }

      dragState.latestNodePosition = nextPosition;
      const directlyMovedNodeIds = new Set([dragState.nodeId]);
      const previewNodes = getDraggedPreviewNodes({
        currentNodes: diagramRef.current.nodes,
        directlyMovedNodeIds,
        positionByNodeId: new Map([[dragState.nodeId, nextPosition]]),
        snapshotNodes: dragState.snapshotNodes
      });
      const draggedNode = previewNodes.find((node) => node.id === dragState.nodeId);

      setDragPreviewNodesForState(previewNodes);
      updateActiveReferenceDropTargetNodeId(
        draggedNode ? getVisualDropTargetNodeId(draggedNode, previewNodes) : null
      );

      return true;
    },
    [
      getVisualDropTargetNodeId,
      reactFlow,
      setDragPreviewNodesForState,
      updateActiveReferenceDropTargetNodeId
    ]
  );

  const finishAreaBlankDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const dragState = areaBlankDragRef.current;

      if (!dragState || dragState.pointerId !== event.pointerId) {
        return false;
      }

      event.preventDefault();
      event.stopPropagation();

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      if (dragState.hasMoved) {
        const directlyMovedNodeIds = new Set([dragState.nodeId]);
        const positionByNodeId = new Map([[dragState.nodeId, dragState.latestNodePosition]]);
        const previewNodes = dragPreviewNodesRef.current ?? getDraggedPreviewNodes({
          currentNodes: diagramRef.current.nodes,
          directlyMovedNodeIds,
          positionByNodeId,
          snapshotNodes: dragState.snapshotNodes
        });
        const finalizedNodes = finalizeDraggedNodes({
          anchorNodeId: dragState.nodeId,
          catalog: terraformParameterCatalog,
          currentNodes: diagramRef.current.nodes,
          directlyMovedNodeIds,
          positionByNodeId,
          snapGridSize: DIAGRAM_SNAP_GRID_SIZE,
          snapshotNodes: dragState.snapshotNodes
        });
        const after = {
          ...diagramRef.current,
          nodes: finalizedNodes.nodes
        };

        if (!areDiagramsEqual(dragState.before, after)) {
          replaceDiagram(after);
          pushHistory(dragState.before, after);
          startSnapAnimation(previewNodes, finalizedNodes.nodes);
        } else {
          setDragPreviewNodesForState(null);
        }
      } else {
        setDragPreviewNodesForState(null);
      }

      areaBlankDragRef.current = null;
      setAreaBlankDragging(false);
      updateActiveReferenceDropTargetNodeId(null);

      return true;
    },
    [
      pushHistory,
      replaceDiagram,
      setDragPreviewNodesForState,
      startSnapAnimation,
      updateActiveReferenceDropTargetNodeId
    ]
  );

  const handleCanvasPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (
        getAreaBlankInteractionTarget({
          button: event.button,
          ctrlKey: event.ctrlKey,
          interactionMode,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
          target: event.target,
          temporaryPanPreviousMode: temporaryPanPreviousModeRef.current
        }) === null
      ) {
        return;
      }

      const areaNode = getAreaNodeFromPointerEvent(event.clientX, event.clientY);

      if (!areaNode) {
        return;
      }

      if (!canStartAreaBlankDrag(areaNode.id, selectedNodeIds)) {
        return;
      }

      cancelSnapAnimation();
      event.preventDefault();
      event.stopPropagation();
      selectAreaBlankNode(areaNode.id);
      setHoveredAreaBlankNodeId(areaNode.id);

      if (areaNode.locked) {
        return;
      }

      const before = cloneDiagram(diagramRef.current);

      event.currentTarget.setPointerCapture(event.pointerId);
      areaBlankDragRef.current = {
        before,
        hasMoved: false,
        latestNodePosition: { ...areaNode.position },
        nodeId: areaNode.id,
        pointerId: event.pointerId,
        snapshotNodes: before.nodes,
        startClientPosition: {
          x: event.clientX,
          y: event.clientY
        },
        startNodePosition: { ...areaNode.position }
      };
      setAreaBlankDragging(true);
      updateActiveReferenceDropTargetNodeId(null);
    },
    [
      cancelSnapAnimation,
      getAreaNodeFromPointerEvent,
      interactionMode,
      selectAreaBlankNode,
      selectedNodeIds,
      updateActiveReferenceDropTargetNodeId
    ]
  );

  const handleCanvasPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (handleAreaBlankDragMove(event)) {
        return;
      }

      if (
        interactionMode !== "select" ||
        isCanvasInteractiveElementTarget(event.target) ||
        selectedNodeIds.length !== 1
      ) {
        setHoveredAreaBlankNodeId(null);
        return;
      }

      const areaNode = getAreaNodeFromPointerEvent(event.clientX, event.clientY);
      const selectedAreaNodeId = selectedNodeIds[0] ?? null;
      const nextHoveredNodeId = areaNode && areaNode.id === selectedAreaNodeId ? areaNode.id : null;

      setHoveredAreaBlankNodeId((currentNodeId) =>
        currentNodeId === nextHoveredNodeId ? currentNodeId : nextHoveredNodeId
      );
    },
    [getAreaNodeFromPointerEvent, handleAreaBlankDragMove, interactionMode, selectedNodeIds]
  );

  const handleCanvasPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      finishAreaBlankDrag(event);
    },
    [finishAreaBlankDrag]
  );

  const handleCanvasPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      finishAreaBlankDrag(event);
    },
    [finishAreaBlankDrag]
  );

  const handleCanvasMouseLeave = useCallback(() => {
    if (!areaBlankDragRef.current) {
      setHoveredAreaBlankNodeId(null);
    }
  }, []);

  const handleCanvasDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (
        getAreaBlankInteractionTarget({
          button: event.button,
          ctrlKey: event.ctrlKey,
          interactionMode,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
          target: event.target,
          temporaryPanPreviousMode: temporaryPanPreviousModeRef.current
        }) === null
      ) {
        return;
      }

      const areaNode = getAreaNodeFromPointerEvent(event.clientX, event.clientY);

      if (!areaNode) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      inspectAreaBlankNode(areaNode.id);
    },
    [getAreaNodeFromPointerEvent, inspectAreaBlankNode, interactionMode]
  );

  const handleNodeDragStart = useCallback((_event: MouseEvent | TouchEvent, draggedFlowNode: DiagramFlowNode) => {
    if (interactionMode !== "select") {
      return;
    }

    cancelSnapAnimation();
    dragSnapshotRef.current = cloneDiagram(diagramRef.current);
    dragAnchorNodeIdRef.current = draggedFlowNode.id;
    directNodeDragIdsRef.current = createDirectNodeDragIdSet(draggedFlowNode.id, selectedNodeIds);
    updateActiveReferenceDropTargetNodeId(null);
  }, [cancelSnapAnimation, interactionMode, selectedNodeIds, updateActiveReferenceDropTargetNodeId]);

  const handleNodeDrag = useCallback(
    (_event: MouseEvent | TouchEvent, draggedFlowNode: DiagramFlowNode, nodes: DiagramFlowNode[]) => {
      if (interactionMode !== "select") {
        return;
      }

      const positionByNodeId = new Map(nodes.map((node) => [node.id, node.position]));
      const snapshotNodes = dragSnapshotRef.current?.nodes ?? diagramRef.current.nodes;
      const directlyMovedNodeIds =
        directNodeDragIdsRef.current ?? createDirectNodeDragIdSet(draggedFlowNode.id, selectedNodeIds);
      const previewNodes = getDraggedPreviewNodes({
        currentNodes: diagramRef.current.nodes,
        directlyMovedNodeIds,
        positionByNodeId,
        snapshotNodes
      });
      const draggedNode = previewNodes.find((node) => node.id === draggedFlowNode.id);

      setDragPreviewNodesForState(previewNodes);
      updateActiveReferenceDropTargetNodeId(
        draggedNode ? getVisualDropTargetNodeId(draggedNode, previewNodes) : null
      );
    },
    [
      getVisualDropTargetNodeId,
      interactionMode,
      selectedNodeIds,
      setDragPreviewNodesForState,
      updateActiveReferenceDropTargetNodeId
    ]
  );

  const handleNodeDragStop = useCallback(
    (_event: MouseEvent | TouchEvent, node: DiagramFlowNode, nodes: DiagramFlowNode[]) => {
      if (interactionMode !== "select") {
        clearNodeDragState();
        setDragPreviewNodesForState(null);
        updateActiveReferenceDropTargetNodeId(null);
        return;
      }

      const before = dragSnapshotRef.current;
      const positionByNodeId = new Map(nodes.map((node) => [node.id, node.position]));
      const snapshotNodes = before?.nodes ?? diagramRef.current.nodes;
      const directlyMovedNodeIds =
        directNodeDragIdsRef.current ?? createDirectNodeDragIdSet(node.id, selectedNodeIds);
      const previewNodes = dragPreviewNodesRef.current ?? getDraggedPreviewNodes({
        currentNodes: diagramRef.current.nodes,
        directlyMovedNodeIds,
        positionByNodeId,
        snapshotNodes
      });
      const finalizedNodes = finalizeDraggedNodes({
        anchorNodeId: dragAnchorNodeIdRef.current ?? node.id,
        catalog: terraformParameterCatalog,
        currentNodes: diagramRef.current.nodes,
        directlyMovedNodeIds,
        positionByNodeId,
        snapGridSize: DIAGRAM_SNAP_GRID_SIZE,
        snapshotNodes
      });
      const after = {
        ...diagramRef.current,
        nodes: finalizedNodes.nodes
      };

      if (before && !areDiagramsEqual(before, after)) {
        replaceDiagram(after);
        pushHistory(before, after);
        startSnapAnimation(previewNodes, finalizedNodes.nodes);
      } else {
        setDragPreviewNodesForState(null);
      }

      clearNodeDragState();
      updateActiveReferenceDropTargetNodeId(null);
    },
    [
      clearNodeDragState,
      interactionMode,
      pushHistory,
      replaceDiagram,
      selectedNodeIds,
      setDragPreviewNodesForState,
      startSnapAnimation,
      updateActiveReferenceDropTargetNodeId
    ]
  );

  const handleConnectStart = useCallback<OnConnectStart>((_event, params) => {
    connectStartNodeIdRef.current = params.nodeId;
  }, []);

  const handleConnectEnd = useCallback<OnConnectEnd>(() => {
    connectStartNodeIdRef.current = null;
  }, []);

  const handleConnect = useCallback<OnConnect>(
    (connection) => {
      const directedConnection = getUserDirectedConnection(connection, connectStartNodeIdRef.current);

      if (
        !directedConnection ||
        !isConnectionAllowed(directedConnection.sourceNodeId, directedConnection.targetNodeId, diagramRef.current.nodes)
      ) {
        return;
      }

      commitDiagramUpdate((currentDiagram) => {
        const edge = createDiagramEdge(
          directedConnection.sourceNodeId,
          directedConnection.targetNodeId,
          directedConnection.sourceHandleId,
          directedConnection.targetHandleId,
          currentDiagram.edges
        );

        if (!edge) {
          return currentDiagram;
        }

        return {
          ...currentDiagram,
          edges: [...currentDiagram.edges, edge]
        };
      });
    },
    [commitDiagramUpdate]
  );

  const finalizeAreaBlankDragWithoutAnimation = useCallback(() => {
    const dragState = areaBlankDragRef.current;

    if (!dragState || !dragState.hasMoved) {
      return false;
    }

    const directlyMovedNodeIds = new Set([dragState.nodeId]);
    const finalizedNodes = finalizeDraggedNodes({
      anchorNodeId: dragState.nodeId,
      catalog: terraformParameterCatalog,
      currentNodes: diagramRef.current.nodes,
      directlyMovedNodeIds,
      positionByNodeId: new Map([[dragState.nodeId, dragState.latestNodePosition]]),
      snapGridSize: DIAGRAM_SNAP_GRID_SIZE,
      snapshotNodes: dragState.snapshotNodes
    });
    const after = {
      ...diagramRef.current,
      nodes: finalizedNodes.nodes
    };

    if (!areDiagramsEqual(dragState.before, after)) {
      replaceDiagram(after);
      pushHistory(dragState.before, after);
    }

    areaBlankDragRef.current = null;
    setAreaBlankDragging(false);
    setDragPreviewNodesForState(null);
    updateActiveReferenceDropTargetNodeId(null);

    return true;
  }, [pushHistory, replaceDiagram, setDragPreviewNodesForState, updateActiveReferenceDropTargetNodeId]);

  const finalizeNodeDragWithoutAnimation = useCallback(() => {
    const before = dragSnapshotRef.current;
    const directlyMovedNodeIds = directNodeDragIdsRef.current;
    const anchorNodeId = dragAnchorNodeIdRef.current;
    const previewNodes = dragPreviewNodesRef.current;

    if (!before || !directlyMovedNodeIds || !anchorNodeId || !previewNodes) {
      return false;
    }

    const finalizedNodes = finalizeDraggedNodes({
      anchorNodeId,
      catalog: terraformParameterCatalog,
      currentNodes: diagramRef.current.nodes,
      directlyMovedNodeIds,
      positionByNodeId: new Map(previewNodes.map((previewNode) => [previewNode.id, previewNode.position])),
      snapGridSize: DIAGRAM_SNAP_GRID_SIZE,
      snapshotNodes: before.nodes
    });
    const after = {
      ...diagramRef.current,
      nodes: finalizedNodes.nodes
    };

    if (!areDiagramsEqual(before, after)) {
      replaceDiagram(after);
      pushHistory(before, after);
    }

    clearNodeDragState();
    setDragPreviewNodesForState(null);
    updateActiveReferenceDropTargetNodeId(null);

    return true;
  }, [
    clearNodeDragState,
    pushHistory,
    replaceDiagram,
    setDragPreviewNodesForState,
    updateActiveReferenceDropTargetNodeId
  ]);

  const finalizeActiveDragWithoutAnimation = useCallback(() => {
    if (finalizeAreaBlankDragWithoutAnimation()) {
      return;
    }

    finalizeNodeDragWithoutAnimation();
  }, [finalizeAreaBlankDragWithoutAnimation, finalizeNodeDragWithoutAnimation]);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      cancelSnapAnimation();

      const payload = getActiveResourceDragPayload(event.dataTransfer);

      if (!payload) {
        updateActiveReferenceDropTargetNodeId(null);
        clearActiveResourceDragPayload();
        return;
      }

      const position = snapPositionToDiagramGrid(
        reactFlow.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY
        }),
        DIAGRAM_SNAP_GRID_SIZE
      );

      const nextNode = createDiagramNodeFromPayload(payload, position, getNextZIndex(diagramRef.current.nodes));

      commitDiagramUpdate((currentDiagram) => {
        const nodesWithNextNode = [...currentDiagram.nodes, nextNode];
        const nodesWithAssignedParents = applyAreaNodeParentAssignments(
          nodesWithNextNode,
          new Set([nextNode.id])
        );

        return {
          ...currentDiagram,
          nodes: applyContainingReferenceDropTargets(
            nodesWithAssignedParents,
            new Set([nextNode.id]),
            terraformParameterCatalog
          )
        };
      });
      setSelectedNodeIds([nextNode.id]);
      setSelectedEdgeIds([]);
      updateActiveReferenceDropTargetNodeId(null);
      clearActiveResourceDragPayload();
      focusEditorShell();
    },
    [cancelSnapAnimation, commitDiagramUpdate, focusEditorShell, reactFlow, updateActiveReferenceDropTargetNodeId]
  );

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();

      const payload = getActiveResourceDragPayload(event.dataTransfer);

      if (!payload) {
        event.dataTransfer.dropEffect = "none";
        updateActiveReferenceDropTargetNodeId(null);
        return;
      }

      event.dataTransfer.dropEffect = "copy";

      const position = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY
      });
      const previewNode = createDiagramNodeFromPayload(payload, position, 0);
      const nodesWithPreviewNode = [...diagramRef.current.nodes, previewNode];

      updateActiveReferenceDropTargetNodeId(getVisualDropTargetNodeId(previewNode, nodesWithPreviewNode));
    },
    [getVisualDropTargetNodeId, reactFlow, updateActiveReferenceDropTargetNodeId]
  );

  const handleDragLeave = useCallback(() => {
    updateActiveReferenceDropTargetNodeId(null);
  }, [updateActiveReferenceDropTargetNodeId]);

  const handlePaneClick = useCallback(
    (event: ReactMouseEvent) => {
      cancelSnapAnimation();
      const position = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY
      });
      const areaNode = findInnermostAreaNodeAtPoint(diagramRef.current.nodes, position);

      setSelectedNodeIds(areaNode ? [areaNode.id] : []);
      setSelectedEdgeIds([]);
      setInspectedNodeId(null);
      focusEditorShell();
    },
    [cancelSnapAnimation, focusEditorShell, reactFlow]
  );

  const handleFlowNodeClick = useCallback(
    (_event: ReactMouseEvent, node: DiagramFlowNode) => {
      setSelectedNodeIds([node.id]);
      setSelectedEdgeIds([]);
      setInspectedNodeId(null);
      focusEditorShell();
    },
    [focusEditorShell]
  );

  const handleFlowNodeDoubleClick = useCallback(
    (_event: ReactMouseEvent, node: DiagramFlowNode) => {
      setSelectedNodeIds([node.id]);
      setSelectedEdgeIds([]);
      setInspectedNodeId(node.id);
      setRightPanelOpen(true);
      focusEditorShell();
    },
    [focusEditorShell]
  );

  const deleteSelection = useCallback(() => {
    cancelSnapAnimation();
    const nodeIds = selectedNodeIds;
    const edgeIds = selectedEdgeIds;

    if (nodeIds.length === 0 && edgeIds.length === 0) {
      return;
    }

    commitDiagramUpdate((currentDiagram) => {
      const deletedNodeIds = new Set(nodeIds);
      const diagramWithoutSelection = removeEdgesFromDiagram(
        removeNodesFromDiagram(currentDiagram, nodeIds),
        edgeIds
      );

      return {
        ...diagramWithoutSelection,
        nodes: clearDeletedAreaParentAssignments(diagramWithoutSelection.nodes, deletedNodeIds)
      };
    });
    setSelectedNodeIds([]);
    setSelectedEdgeIds([]);
  }, [cancelSnapAnimation, commitDiagramUpdate, selectedEdgeIds, selectedNodeIds]);

  const copySelectedNodes = useCallback(() => {
    if (selectedNodeIds.length === 0) {
      return;
    }

    const selectedNodeIdSet = new Set(selectedNodeIds);
    clipboardRef.current = diagramRef.current.nodes
      .filter((node) => selectedNodeIdSet.has(node.id))
      .map((node) => cloneDiagram({ nodes: [node], edges: [], viewport: getDefaultViewport() }).nodes[0])
      .filter((node): node is DiagramNode => Boolean(node));
  }, [selectedNodeIds]);

  const pasteNodes = useCallback(() => {
    if (clipboardRef.current.length === 0) {
      return;
    }

    cancelSnapAnimation();
    const pastedNodes = createPastedNodes(clipboardRef.current, diagramRef.current.nodes);

    commitDiagramUpdate((currentDiagram) => {
      const nodesWithPastedNodes = [...currentDiagram.nodes, ...pastedNodes];

      return {
        ...currentDiagram,
        nodes: applyAreaNodeParentAssignments(
          nodesWithPastedNodes,
          new Set(pastedNodes.map((node) => node.id))
        )
      };
    });
    setSelectedNodeIds(pastedNodes.map((node) => node.id));
    setSelectedEdgeIds([]);
  }, [cancelSnapAnimation, commitDiagramUpdate]);

  const updateEdgeStyle = useCallback(
    (edgeId: string, style: DiagramEdge["style"]) => {
      commitDiagramUpdate((currentDiagram) => ({
        ...currentDiagram,
        edges: currentDiagram.edges.map((edge) => (edge.id === edgeId ? { ...edge, style } : edge))
      }));
    },
    [commitDiagramUpdate]
  );

  const updateEdgeType = useCallback(
    (edgeId: string, type: NonNullable<DiagramEdge["type"]>) => {
      commitDiagramUpdate((currentDiagram) => ({
        ...currentDiagram,
        edges: currentDiagram.edges.map((edge) => (edge.id === edgeId ? { ...edge, type } : edge))
      }));
    },
    [commitDiagramUpdate]
  );

  const deleteEdge = useCallback(
    (edgeId: string) => {
      commitDiagramUpdate((currentDiagram) => removeEdgesFromDiagram(currentDiagram, [edgeId]));
      setSelectedEdgeIds((currentIds) => currentIds.filter((currentId) => currentId !== edgeId));
    },
    [commitDiagramUpdate]
  );

  const handleMoveEnd = useCallback<OnMoveEnd>(
    (_event, viewport) => {
      applyLiveDiagramUpdate((currentDiagram) => updateDiagramViewport(currentDiagram, toDiagramViewport(viewport)));
    },
    [applyLiveDiagramUpdate]
  );

  const handleZoomIn = useCallback(() => {
    void reactFlow.zoomIn({ duration: 140 });
  }, [reactFlow]);

  const handleZoomOut = useCallback(() => {
    void reactFlow.zoomOut({ duration: 140 });
  }, [reactFlow]);

  const handleFitView = useCallback(() => {
    const currentNodes = previewDiagram?.nodes ?? diagramRef.current.nodes;
    const shouldPersistViewport = previewDiagram === null;

    if (currentNodes.length === 0) {
      void reactFlow.setViewport(DEFAULT_DIAGRAM_VIEWPORT, { duration: 180 });
      if (shouldPersistViewport) {
        applyLiveDiagramUpdate((currentDiagram) => updateDiagramViewport(currentDiagram, DEFAULT_DIAGRAM_VIEWPORT));
      }
      return;
    }

    const canvasBounds = canvasPanelRef.current?.getBoundingClientRect();
    const editorBounds = editorShellRef.current?.getBoundingClientRect();

    if (!canvasBounds || canvasBounds.width <= 0 || canvasBounds.height <= 0) {
      void reactFlow.fitView({
        duration: 180,
        maxZoom: 1.35,
        minZoom: 0.25,
        nodes: currentNodes.map((node) => ({ id: node.id })),
        padding: 0.24
      });
      return;
    }

    const fitViewWidth = editorBounds && editorBounds.width > 0 ? editorBounds.width : canvasBounds.width;
    const viewport = getViewportForBounds(
      getDiagramBounds(currentNodes),
      fitViewWidth,
      canvasBounds.height,
      0.25,
      1.35,
      0.24
    );

    void reactFlow.setViewport(viewport, { duration: 180 });
    if (shouldPersistViewport) {
      applyLiveDiagramUpdate((currentDiagram) => updateDiagramViewport(currentDiagram, viewport));
    }
  }, [applyLiveDiagramUpdate, previewDiagram, reactFlow]);

  useEffect(() => {
    if (!isFlowReady || !shouldAutoFitInitialDiagramRef.current || diagram.nodes.length === 0) {
      return;
    }

    if (initialAutoFitFrameRef.current !== null) {
      return;
    }

    initialAutoFitFrameRef.current = window.requestAnimationFrame(() => {
      initialAutoFitFrameRef.current = window.requestAnimationFrame(() => {
        initialAutoFitFrameRef.current = null;
        shouldAutoFitInitialDiagramRef.current = false;
        handleFitView();
      });
    });

    return () => {
      if (initialAutoFitFrameRef.current !== null) {
        window.cancelAnimationFrame(initialAutoFitFrameRef.current);
        initialAutoFitFrameRef.current = null;
      }
    };
  }, [diagram.nodes.length, handleFitView, isFlowReady]);

  useEffect(() => {
    if (!isFlowReady || previewDiagram === null || previewDiagram.nodes.length === 0) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      handleFitView();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [handleFitView, isFlowReady, previewDiagram]);

  useEffect(() => {
    function handleVisibilityChange(): void {
      if (document.visibilityState === "hidden") {
        finalizeActiveDragWithoutAnimation();
      }
    }

    function handlePageHide(): void {
      finalizeActiveDragWithoutAnimation();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange, { capture: true });
    window.addEventListener("pagehide", handlePageHide, { capture: true });

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange, { capture: true });
      window.removeEventListener("pagehide", handlePageHide, { capture: true });
    };
  }, [finalizeActiveDragWithoutAnimation]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (isPreviewActive) {
        return;
      }

      if (isEditableEventTarget(event.target)) {
        return;
      }

      const isModifierPressed = event.metaKey || event.ctrlKey;
      const key = event.key.toLocaleLowerCase();

      if ((event.key === "Backspace" || event.key === "Delete") && !isModifierPressed) {
        event.preventDefault();
        deleteSelection();
        return;
      }

      if (isModifierPressed && key === "c") {
        event.preventDefault();
        copySelectedNodes();
        return;
      }

      if (isModifierPressed && key === "v") {
        event.preventDefault();
        pasteNodes();
        return;
      }

      if (isModifierPressed && key === "z" && event.shiftKey) {
        event.preventDefault();
        redo();
        return;
      }

      if (isModifierPressed && key === "z") {
        event.preventDefault();
        undo();
      }
    },
    [copySelectedNodes, deleteSelection, isPreviewActive, pasteNodes, redo, undo]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    function handleWindowMouseUp(event: MouseEvent): void {
      if (event.button !== 1) {
        return;
      }

      const previousMode = temporaryPanPreviousModeRef.current;
      temporaryPanPreviousModeRef.current = null;

      if (previousMode) {
        setInteractionMode(previousMode);
      }
    }

    window.addEventListener("mouseup", handleWindowMouseUp);

    return () => window.removeEventListener("mouseup", handleWindowMouseUp);
  }, []);

  useEffect(() => {
    function handleWindowResize(): void {
      updateLeftPanelWidth(leftPanelWidth);
      updateRightPanelWidth(rightPanelWidth);
    }

    window.addEventListener("resize", handleWindowResize);

    return () => window.removeEventListener("resize", handleWindowResize);
  }, [leftPanelWidth, rightPanelWidth, updateLeftPanelWidth, updateRightPanelWidth]);

  function handleShellKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      setInspectedNodeId(null);
      setSelectedNodeIds([]);
      setSelectedEdgeIds([]);
    }
  }

  const editorShellStyle = {
    "--left-panel-width": `${leftPanelWidth}px`,
    "--right-panel-width": `${rightPanelWidth}px`
  } as CSSProperties;
  const canvasPanelClassName = [
    styles.canvasPanel,
    isPreviewActive ? styles.canvasPanelPreviewing : undefined,
    isAreaBlankDragging ? styles.canvasPanelAreaBlankDragging : undefined,
    isSnapAnimating ? styles.canvasPanelSnapAnimating : undefined,
    shouldShowAreaBlankMoveCursor ? styles.canvasPanelAreaBlankMoveTarget : undefined,
    shouldShowAreaBlankBlockedCursor ? styles.canvasPanelAreaBlankBlockedTarget : undefined
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      className={`${styles.editorShell} ${isRightPanelOpen ? "" : styles.editorShellRightCollapsed}`}
      onKeyDown={handleShellKeyDown}
      ref={editorShellRef}
      style={editorShellStyle}
      tabIndex={0}
    >
      {isLeftPanelOpen ? (
        <div className={styles.leftRail} ref={leftRailRef}>
          {leftPanel === undefined ? (
            <ResourceSettingsPanel onCollapse={() => setLeftPanelOpen(false)} />
          ) : (
            leftPanel
          )}
          <button
            aria-label="Resize left panel"
            aria-orientation="vertical"
            aria-valuemax={MAX_LEFT_PANEL_WIDTH}
            aria-valuemin={MIN_LEFT_PANEL_WIDTH}
            aria-valuenow={leftPanelWidth}
            className={styles.leftRailResizeHandle}
            onKeyDown={handleLeftPanelResizeKeyDown}
            onPointerCancel={handleLeftPanelResizeEnd}
            onPointerDown={handleLeftPanelResizeStart}
            onPointerMove={handleLeftPanelResizeMove}
            onPointerUp={handleLeftPanelResizeEnd}
            role="separator"
            title="Drag to resize left panel"
            type="button"
          />
        </div>
      ) : (
        <div className={styles.collapsedLeftPanel} aria-label="Left panel shortcuts">
          <button
            aria-label="Open resources panel"
            className={styles.collapsedLeftPanelButton}
            onClick={() => setLeftPanelOpen(true)}
            title="Open resources"
            type="button"
          >
            <Box aria-hidden="true" size={18} />
          </button>
          <button
            aria-label="Open templates panel"
            className={styles.collapsedLeftPanelButton}
            onClick={() => setLeftPanelOpen(true)}
            title="Open templates"
            type="button"
          >
            <LayoutGrid aria-hidden="true" size={18} />
          </button>
        </div>
      )}

      <div className={styles.workspace}>
        <header className={styles.canvasToolbar}>
          <div className={styles.toolbarBrand}>
            <a aria-label="Go to my page" className={styles.toolbarHomeLink} href={myPageHref} title="My page">
              <UserRound aria-hidden="true" size={16} />
            </a>
            <span className={styles.toolbarTitle}>{projectName}</span>
          </div>

          <div className={styles.toolbarGroup} aria-label="편집 도구">
            <button
              aria-label="선택 모드"
              aria-pressed={interactionMode === "select"}
              className={interactionMode === "select" ? styles.iconButtonSelected : styles.iconButton}
              onClick={() => setInteractionMode("select")}
              title="선택 모드"
              type="button"
            >
              <MousePointer2 aria-hidden="true" size={16} />
            </button>
            <button
              aria-label="캔버스 이동"
              aria-pressed={interactionMode === "pan"}
              className={interactionMode === "pan" ? styles.iconButtonSelected : styles.iconButton}
              onClick={() => setInteractionMode("pan")}
              title="캔버스 이동"
              type="button"
            >
              <Move aria-hidden="true" size={16} />
            </button>
          </div>

          <div className={styles.toolbarGroup} aria-label="History">
            <button
              aria-label="Undo"
              className={styles.iconButton}
              disabled={isPreviewActive || history.past.length === 0}
              onClick={undo}
              title="Undo"
              type="button"
            >
              <Undo2 aria-hidden="true" size={16} />
            </button>
            <button
              aria-label="Redo"
              className={styles.iconButton}
              disabled={isPreviewActive || history.future.length === 0}
              onClick={redo}
              title="Redo"
              type="button"
            >
              <Redo2 aria-hidden="true" size={16} />
            </button>
          </div>

          <div className={styles.toolbarGroup} aria-label="Viewport">
            <button aria-label="Zoom in" className={styles.iconButton} onClick={handleZoomIn} title="Zoom in" type="button">
              <ZoomIn aria-hidden="true" size={16} />
            </button>
            <button aria-label="Zoom out" className={styles.iconButton} onClick={handleZoomOut} title="Zoom out" type="button">
              <ZoomOut aria-hidden="true" size={16} />
            </button>
            <button
              aria-label="Fit view"
              className={styles.iconButton}
              onClick={handleFitView}
              title="Fit view"
              type="button"
            >
              <Maximize2 aria-hidden="true" size={16} />
            </button>
          </div>

          <div className={styles.toolbarStatus}>
            <span>{saveStatus}</span>
          </div>
        </header>

        {draftStatusPanel ? (
          <div className={styles.draftStatusPanelSlot}>{draftStatusPanel}</div>
        ) : null}

        {isPreviewActive ? (
          <div className={styles.previewNotice} role="status">
            AI 초안 미리보기입니다. AI 채팅창에서 생성 또는 취소를 선택하세요.
          </div>
        ) : null}

        <div
          className={canvasPanelClassName}
          onAuxClickCapture={handleCanvasAuxClick}
          onDoubleClickCapture={isPreviewActive ? undefined : handleCanvasDoubleClick}
          onMouseDownCapture={handleCanvasMouseDown}
          onMouseLeave={handleCanvasMouseLeave}
          onPointerCancelCapture={isPreviewActive ? undefined : handleCanvasPointerCancel}
          onPointerDownCapture={isPreviewActive ? undefined : handleCanvasPointerDown}
          onPointerMoveCapture={isPreviewActive ? undefined : handleCanvasPointerMove}
          onPointerUpCapture={isPreviewActive ? undefined : handleCanvasPointerUp}
          ref={canvasPanelRef}
        >
          {selectedEdge ? (
            <DiagramEdgeToolbar
              edge={selectedEdge}
              onDelete={deleteEdge}
              onStyleChange={updateEdgeStyle}
              onTypeChange={updateEdgeType}
            />
          ) : null}

          {visibleDiagram.nodes.length === 0 ? (
            <div className={styles.emptyState} aria-hidden="true">
              <strong>Empty diagram</strong>
              <span>Drag resources from the left panel onto the canvas.</span>
            </div>
          ) : null}

          <ReactFlow
            connectionMode={ConnectionMode.Loose}
            defaultViewport={DEFAULT_DIAGRAM_VIEWPORT}
            deleteKeyCode={null}
            edges={flowEdges}
            elementsSelectable={!isPreviewActive}
            maxZoom={2}
            minZoom={0.25}
            multiSelectionKeyCode={["Shift", "Meta", "Control"]}
            nodeTypes={NODE_TYPES}
            nodes={flowNodes}
            nodesConnectable={interactionMode === "select" && !isPreviewActive}
            nodesDraggable={interactionMode === "select" && !isPreviewActive}
            onInit={handleInit}
            panOnDrag={isPreviewActive || interactionMode === "pan"}
            panOnScroll
            panOnScrollMode={PanOnScrollMode.Free}
            proOptions={{ hideAttribution: true }}
            selectionKeyCode={["Shift", "Meta", "Control"]}
            selectionMode={SelectionMode.Partial}
            selectionOnDrag={interactionMode === "select" && !isPreviewActive}
            snapGrid={DIAGRAM_SNAP_GRID}
            snapToGrid={false}
            zoomOnDoubleClick={false}
            zoomActivationKeyCode={["Meta", "Control"]}
            {...(!isPreviewActive
              ? {
                  onClickConnectEnd: handleConnectEnd,
                  onClickConnectStart: handleConnectStart,
                  onConnect: handleConnect,
                  onConnectEnd: handleConnectEnd,
                  onConnectStart: handleConnectStart,
                  onDragLeave: handleDragLeave,
                  onDragOver: handleDragOver,
                  onDrop: handleDrop,
                  onEdgesChange: handleEdgesChange,
                  onMoveEnd: handleMoveEnd,
                  onNodeClick: handleFlowNodeClick,
                  onNodeDoubleClick: handleFlowNodeDoubleClick,
                  onNodeDrag: handleNodeDrag,
                  onNodeDragStart: handleNodeDragStart,
                  onNodeDragStop: handleNodeDragStop,
                  onNodesChange: handleNodesChange,
                  onPaneClick: handlePaneClick,
                  onSelectionChange: handleSelectionChange
                }
              : {})}
          >
            <Background color="#d8e0ef" gap={24} size={2} variant={BackgroundVariant.Dots} />
          </ReactFlow>
        </div>
      </div>

      <div className={styles.rightRail}>
        <button
          aria-label="Resize right panel"
          aria-orientation="vertical"
          aria-valuemax={MAX_RIGHT_PANEL_WIDTH}
          aria-valuemin={MIN_RIGHT_PANEL_WIDTH}
          aria-valuenow={rightPanelWidth}
          className={styles.rightRailResizeHandle}
          onKeyDown={handleRightPanelResizeKeyDown}
          onPointerCancel={handleRightPanelResizeEnd}
          onPointerDown={handleRightPanelResizeStart}
          onPointerMove={handleRightPanelResizeMove}
          onPointerUp={handleRightPanelResizeEnd}
          role="separator"
          title="Drag to resize right panel"
          type="button"
        />
        {rightPanel === undefined ? (
          <ParameterInputPanel key={panelContext.selectedNodeId ?? "no-selection"} {...panelContext} />
        ) : (
          rightPanel(panelContext)
        )}
      </div>

      {floatingPanel ? (
        <div className={styles.floatingPanelSlot}>{floatingPanel?.(panelContext)}</div>
      ) : null}
    </section>
  );
}

function isNodePositionChangeWithPosition(
  change: NodeChange<DiagramFlowNode>
): change is NodePositionChange & { position: NonNullable<NodePositionChange["position"]> } {
  return change.type === "position" && Boolean(change.position);
}

function createDirectNodeDragIdSet(
  draggedNodeId: string,
  selectedNodeIds: readonly string[]
): Set<string> {
  return new Set(selectedNodeIds.includes(draggedNodeId) ? selectedNodeIds : [draggedNodeId]);
}

function isDifferentPosition(left: DiagramNode["position"], right: DiagramNode["position"]) {
  return left.x !== right.x || left.y !== right.y;
}

function haveAnyNodePositionDifference(
  leftNodes: readonly DiagramNode[],
  rightNodes: readonly DiagramNode[]
): boolean {
  const rightPositionByNodeId = new Map(rightNodes.map((node) => [node.id, node.position]));

  return leftNodes.some((node) => {
    const rightPosition = rightPositionByNodeId.get(node.id);

    return Boolean(rightPosition && isDifferentPosition(node.position, rightPosition));
  });
}

function readStoredLeftPanelWidth(): number {
  if (typeof window === "undefined") {
    return DEFAULT_LEFT_PANEL_WIDTH;
  }

  const storedWidth = Number(window.localStorage.getItem(LEFT_PANEL_WIDTH_STORAGE_KEY));

  return Number.isFinite(storedWidth) ? clampLeftPanelWidth(storedWidth) : DEFAULT_LEFT_PANEL_WIDTH;
}

function readStoredRightPanelWidth(): number {
  if (typeof window === "undefined") {
    return DEFAULT_RIGHT_PANEL_WIDTH;
  }

  const storedWidth = Number(window.localStorage.getItem(RIGHT_PANEL_WIDTH_STORAGE_KEY));

  return Number.isFinite(storedWidth) ? clampRightPanelWidth(storedWidth) : DEFAULT_RIGHT_PANEL_WIDTH;
}

function storeLeftPanelWidth(width: number): void {
  window.localStorage.setItem(LEFT_PANEL_WIDTH_STORAGE_KEY, String(width));
}

function storeRightPanelWidth(width: number): void {
  window.localStorage.setItem(RIGHT_PANEL_WIDTH_STORAGE_KEY, String(width));
}

function clampLeftPanelWidth(width: number): number {
  if (typeof window === "undefined") {
    return clamp(width, MIN_LEFT_PANEL_WIDTH, MAX_LEFT_PANEL_WIDTH);
  }

  const viewportLimitedMaxWidth = Math.max(MIN_LEFT_PANEL_WIDTH, window.innerWidth - MIN_WORKSPACE_WIDTH);
  return clamp(width, MIN_LEFT_PANEL_WIDTH, Math.min(MAX_LEFT_PANEL_WIDTH, viewportLimitedMaxWidth));
}

function clampRightPanelWidth(width: number): number {
  if (typeof window === "undefined") {
    return clamp(width, MIN_RIGHT_PANEL_WIDTH, MAX_RIGHT_PANEL_WIDTH);
  }

  const viewportLimitedMaxWidth = Math.max(MIN_RIGHT_PANEL_WIDTH, window.innerWidth - MIN_WORKSPACE_WIDTH);
  return clamp(width, MIN_RIGHT_PANEL_WIDTH, Math.min(MAX_RIGHT_PANEL_WIDTH, viewportLimitedMaxWidth));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getLeftPanelWidthFromPointer(clientX: number, panelElement: HTMLElement | null): number {
  const panelLeft = panelElement?.getBoundingClientRect().left ?? 0;

  return clientX - panelLeft;
}

function applySelectionChanges(
  selectedIds: readonly string[],
  changes: readonly NodeChange<DiagramFlowNode>[] | readonly EdgeChange<DiagramFlowEdge>[]
): string[] | null {
  const selectionChanges = changes.filter(isSelectionChange);

  if (selectionChanges.length === 0) {
    return null;
  }

  const nextSelectedIds = new Set(selectedIds);

  for (const change of selectionChanges) {
    if (change.selected) {
      nextSelectedIds.add(change.id);
    } else {
      nextSelectedIds.delete(change.id);
    }
  }

  return Array.from(nextSelectedIds);
}

function isSelectionChange(
  change: NodeChange<DiagramFlowNode> | EdgeChange<DiagramFlowEdge>
): change is NodeSelectionChange {
  return change.type === "select";
}

function getUserDirectedConnection(connection: Connection, startNodeId: string | null) {
  if (!connection.source || !connection.target) {
    return null;
  }

  if (!startNodeId || (startNodeId !== connection.source && startNodeId !== connection.target)) {
    return {
      sourceNodeId: connection.source,
      targetNodeId: connection.target,
      sourceHandleId: normalizeConnectionHandleId(connection.sourceHandle),
      targetHandleId: normalizeConnectionHandleId(connection.targetHandle)
    };
  }

  if (startNodeId === connection.target) {
    return {
      sourceNodeId: startNodeId,
      targetNodeId: connection.source,
      sourceHandleId: normalizeConnectionHandleId(connection.targetHandle),
      targetHandleId: normalizeConnectionHandleId(connection.sourceHandle)
    };
  }

  return {
    sourceNodeId: startNodeId,
    targetNodeId: connection.target,
    sourceHandleId: normalizeConnectionHandleId(connection.sourceHandle),
    targetHandleId: normalizeConnectionHandleId(connection.targetHandle)
  };
}

function normalizeConnectionHandleId(handleId: string | null): string | undefined {
  if (!handleId) {
    return undefined;
  }

  const side = handleId.match(/(?:source-|target-|handle-)?(left|top|right|bottom)$/u)?.[1];
  return side ? `handle-${side}` : handleId;
}

function isConnectionAllowed(
  sourceNodeId: string | null | undefined,
  targetNodeId: string | null | undefined,
  nodes: readonly DiagramNode[]
): boolean {
  if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) {
    return false;
  }

  const sourceNode = nodes.find((node) => node.id === sourceNodeId);
  const targetNode = nodes.find((node) => node.id === targetNodeId);

  return Boolean(sourceNode && targetNode && !sourceNode.locked && !targetNode.locked);
}

function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLocaleLowerCase();

  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
}

function toDiagramViewport(viewport: Viewport): DiagramJson["viewport"] {
  return {
    x: viewport.x,
    y: viewport.y,
    zoom: viewport.zoom
  };
}

function getDiagramBounds(nodes: readonly DiagramNode[]) {
  const firstNode = nodes[0];

  if (!firstNode) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }

  let minX = firstNode.position.x;
  let minY = firstNode.position.y;
  let maxX = firstNode.position.x + firstNode.size.width;
  let maxY = firstNode.position.y + firstNode.size.height;

  for (const node of nodes.slice(1)) {
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + node.size.width);
    maxY = Math.max(maxY, node.position.y + node.size.height);
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1)
  };
}
