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
  useReactFlow,
  useStore
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
  Expand,
  Maximize2,
  MousePointer2,
  Move,
  Redo2,
  Sparkles,
  Undo2,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  DragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent
} from "react";
import type { DiagramEdge, DiagramJson, DiagramNode } from "../../../../packages/types/src";

import { BOARD_THUMBNAIL_CAPTURE_CONTRACT } from "../../components/architecture-board/board-thumbnail-capture-contract";
import {
  createBoardAutoOrganizeProposal,
  createArchitectureBoardCompilationPreview,
  type ArchitectureBoardCompilationProposal
} from "../architecture-board-compiler";
import { ParameterInputPanel } from "../parameter-input";
import { terraformParameterCatalog } from "../parameter-input/catalog";
import { ResourceSettingsPanel } from "../resource-settings";
import { expandCuratedModuleIntoDiagram } from "../resource-settings/module-catalog";
import {
  applyTemplateToDiagramWithBackup,
  type AvailableBoardTemplate
} from "../resource-settings/template-library";
import {
  clearTerraformSourceAuthority,
  markTerraformSourceAuthoritative
} from "../workspace/terraform-panel-utils";
import { DEFAULT_DIAGRAM_VIEWPORT, EDGE_LABEL_MIN_ZOOM, EMPTY_DIAGRAM } from "./constants";
import { resolveDiagramCopyShortcut } from "./diagram-keyboard-shortcuts";
import {
  applyAreaNodeParentAssignments,
  clearDeletedAreaParentAssignments,
  clearOutOfBoundsAreaParentAssignments,
  placeDroppedNodeInsideArea
} from "./area-node-movement";
import { reconcileAreaNodeGeometry } from "./area-node-geometry";
import {
  readAutoExpandAreasEnabled,
  writeAutoExpandAreasEnabled
} from "./area-auto-expand-preference";
import {
  findAreaBlankInteractionNodeAtPoint,
  findInnermostAreaDropTarget,
  isAreaNode
} from "./area-nodes";
import {
  getAreaBlankInteractionTarget,
  getTemporaryPanReleaseMode,
  isCanvasInteractiveElementTarget
} from "./canvas-pointer-hit-test";
import { isAwsDiagramConnectionAllowed } from "./aws-resource-connection-policy";
import {
  applyInitialSourceViewBoxViewport,
  getFitViewMinimumZoom,
  getBoardZoomPresentationScale,
  getCenteredBoardViewport,
  getSourceViewBoxMinimumZoom,
  getUnobscuredBoardViewportFrame,
  offsetBoardViewportToFrame,
  parseBoardZoom,
  rebaseBoardViewport
} from "./board-viewport";
import type { BoardViewportFrame } from "./board-viewport";
import { DiagramEdgeToolbar } from "./DiagramEdgeToolbar";
import { DiagramEdgeView } from "./DiagramEdgeView";
import { DiagramNodeView } from "./DiagramNodeView";
import { WorkspaceProjectBar } from "./WorkspaceProjectBar";
import { isProjectDraftSaveShortcut } from "../workspace/project-draft-hotkey";
import { persistViewportAfterMove } from "./viewport-persistence";
import {
  finalizeDraggedNodes,
  getDraggedPreviewNodes,
  snapPositionToDiagramGrid
} from "./drag-transaction";
import {
  applyNodeMetadataUpdate,
  applyNodeParametersUpdateWithAutoTagSync,
  areDiagramsEqual,
  clearActiveResourceDragPayload,
  clearAuthoredRoutesForNodeIds,
  cloneDiagram,
  createDiagramEdge,
  createDiagramNodeFromPayload,
  createPastedNodes,
  getDefaultViewport,
  getActiveResourceDragPayload,
  getNextZIndex,
  getNodeGeometryChangedIds,
  removeEdgesFromDiagram,
  removeNodesFromDiagram,
  updateDiagramViewport,
  updateNodeById
} from "./diagram-utils";
import { toFlowEdges, toFlowNodes } from "./flow-mappers";
import { applyContainingReferenceDropTargets } from "./reference-drop-targets";
import type { NodeResizeUpdate } from "./node-resize";
import { scalePaletteAreaNodeSize } from "./palette-area-node-size";
import { normalizeDiagramResourceNodeGeometry } from "./resource-node-geometry";
import { getDiagramVisualBounds } from "./resource-node-visual-footprint";
import { refitSecurityGroupScopesForTargetChanges } from "./security-group-scope";
import {
  canStartAreaBlankDrag,
  getSingleSelectedEdgeForToolbar,
  normalizeSelectedNodeIds,
  stabilizeSelectedIds
} from "./selection-utils";
import type {
  DiagramEditorPanelContext,
  DiagramEditorProps,
  DiagramFlowEdge,
  DiagramFlowNode,
  DiagramFlowNodeHandlers,
  DiagramHistoryState,
  DiagramNodeMetadataUpdate,
  DiagramPreviewAnnotations
} from "./types";
import styles from "./diagram-editor.module.css";

const NODE_TYPES = {
  diagramNode: DiagramNodeView
};

const EDGE_TYPES = {
  diagramEdge: DiagramEdgeView
};

const MAX_HISTORY_ITEMS = 80;
const LEFT_PANEL_WIDTH_STORAGE_KEY = "sketchcatch.diagramEditor.leftPanelWidth.brainboardV1";
const RIGHT_PANEL_WIDTH_STORAGE_KEY = "sketchcatch.diagramEditor.rightPanelWidth.brainboardV1";
const DEFAULT_LEFT_PANEL_WIDTH = 346;
const DEFAULT_RIGHT_PANEL_WIDTH = 440;
const MIN_LEFT_PANEL_WIDTH = 300;
const MAX_LEFT_PANEL_WIDTH = 520;
const MIN_RIGHT_PANEL_WIDTH = 360;
const MAX_RIGHT_PANEL_WIDTH = 640;
const MIN_WORKSPACE_WIDTH = 420;
const DIAGRAM_SNAP_GRID_SIZE = 12;
const DIAGRAM_SNAP_GRID: [number, number] = [DIAGRAM_SNAP_GRID_SIZE, DIAGRAM_SNAP_GRID_SIZE];
const BOARD_VIEWPORT_TOP_INSET = 84;
const BOARD_VIEWPORT_BOTTOM_INSET = 72;
const FIT_VIEW_PADDING = 0.24;
const SNAP_ANIMATION_MS = 110;
const SNAP_ANIMATION_CLEAR_MS = SNAP_ANIMATION_MS + 30;

function formatCompilerScore(value: number): string {
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 }).format(value);
}

function areBoardViewportFramesEqual(left: BoardViewportFrame, right: BoardViewportFrame): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

function getBoardMotionDuration(durationMs: number): number {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : durationMs;
}

function clearAuthoredRoutesForNodeGeometryChanges(
  previousNodes: readonly DiagramNode[],
  diagram: DiagramJson
): DiagramJson {
  return clearAuthoredRoutesForNodeIds(
    diagram,
    getNodeGeometryChangedIds(previousNodes, diagram.nodes)
  );
}

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

function CompilerPreviewDetail({
  emptyLabel,
  items,
  label,
  title
}: {
  readonly emptyLabel: string;
  readonly items: readonly string[];
  readonly label: string;
  readonly title?: string;
}) {
  return (
    <div className={styles.compilerPreviewDetail}>
      <span>{label}</span>
      <strong title={title}>{items.length > 0 ? items.join(" · ") : emptyLabel}</strong>
    </div>
  );
}

function DiagramEditorInner({
  allowPreviewInspection = false,
  dashboardHref = "/dashboard",
  draftStatusPanel,
  emptyBoardDescription = "왼쪽 패널에서 필요한 항목을 끌어오세요.",
  floatingPanel,
  initialBoardZoom,
  initialDiagram,
  initialPreviewAnnotations,
  initialPreviewDiagram,
  initialReferenceDropTargetNodeId,
  initialSelectedEdgeIds,
  initialSelectedNodeIds,
  isDeploymentConsoleOpen = false,
  leftPanel,
  onBoardReady,
  onDiagramChange,
  onDiagramSaveRequest,
  onWorkspacePanelOpen,
  onTemplateWorkspaceApply,
  onSaveAndDeployRequest,
  projectName = "Project workspace",
  rightPanel,
  saveStatus = "편집 중",
  showSaveAction = true,
  workspaceUserName = "Personal workspace"
}: DiagramEditorProps) {
  const reactFlow = useReactFlow<DiagramFlowNode, DiagramFlowEdge>();
  const fallbackFlowInstanceRef = useRef(reactFlow);
  fallbackFlowInstanceRef.current = reactFlow;
  const boardZoom = useStore((state) => state.transform[2]);
  const setFlowMinimumZoom = useStore((state) => state.setMinZoom);
  const showAllEdgeLabels = boardZoom >= EDGE_LABEL_MIN_ZOOM;
  const boardZoomPresentationScale = getBoardZoomPresentationScale(boardZoom);
  const normalizedInitialBoardZoom = parseBoardZoom(initialBoardZoom);
  const [diagram, setDiagram] = useState<DiagramJson>(() =>
    normalizeDiagramResourceNodeGeometry(cloneDiagram(initialDiagram ?? EMPTY_DIAGRAM))
  );
  const diagramRef = useRef(diagram);
  const diagramRevisionRef = useRef(0);
  const [previewDiagram, setPreviewDiagramState] = useState<DiagramJson | null>(() =>
    initialPreviewDiagram
      ? normalizeDiagramResourceNodeGeometry(cloneDiagram(initialPreviewDiagram))
      : null
  );
  const [previewAnnotations, setPreviewAnnotations] = useState<DiagramPreviewAnnotations | null>(
    () => (initialPreviewDiagram ? (initialPreviewAnnotations ?? null) : null)
  );
  const [compilerPreview, setCompilerPreview] =
    useState<ArchitectureBoardCompilationProposal | null>(null);
  const compilerPreviewSummary = useMemo(
    () =>
      compilerPreview === null
        ? null
        : createArchitectureBoardCompilationPreview(compilerPreview),
    [compilerPreview]
  );
  const [terraformRefreshRequestId, setTerraformRefreshRequestId] = useState(0);
  const [history, setHistory] = useState<DiagramHistoryState>({ past: [], future: [] });
  const [inspectedNodeId, setInspectedNodeId] = useState<string | null>(null);
  const [isLeftPanelOpen, setLeftPanelOpen] = useState(true);
  const [isRightPanelOpen, setRightPanelOpen] = useState(true);
  const [leftPanelWidth, setLeftPanelWidth] = useState(readStoredLeftPanelWidth);
  const [rightPanelWidth, setRightPanelWidth] = useState(readStoredRightPanelWidth);
  const [autoExpandAreasEnabled, setAutoExpandAreasEnabled] = useState(() =>
    readAutoExpandAreasEnabled(typeof window === "undefined" ? null : window.localStorage)
  );
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(() =>
    normalizeSelectedNodeIds(diagram.nodes, initialSelectedNodeIds ?? [])
  );
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>(() =>
    selectedNodeIds.length > 0
      ? []
      : getValidInitialSelectedEdgeIds(diagram.edges, initialSelectedEdgeIds)
  );
  const [dragPreviewNodes, setDragPreviewNodes] = useState<DiagramNode[] | null>(null);
  const [activeAreaDropTargetNodeId, setActiveAreaDropTargetNodeId] = useState<string | null>(() =>
    getValidInitialAreaDropTargetNodeId(diagram.nodes, initialReferenceDropTargetNodeId)
  );
  const [isConnectionActive, setConnectionActive] = useState(false);
  const [interactionMode, setInteractionMode] = useState<"select" | "pan">("select");
  const [isFlowReady, setFlowReady] = useState(false);
  const [boardMinimumZoom, setBoardMinimumZoom] = useState(0.25);
  const temporaryPanPreviousModeRef = useRef<"select" | "pan" | null>(null);
  const clipboardRef = useRef<DiagramNode[]>([]);
  const canvasPanelRef = useRef<HTMLDivElement | null>(null);
  const directNodeDragIdsRef = useRef<Set<string> | null>(null);
  const dragAnchorNodeIdRef = useRef<string | null>(null);
  const dragPreviewNodesRef = useRef<DiagramNode[] | null>(null);
  const nodeDragPreviewFrameRef = useRef<number | null>(null);
  const pendingNodeDragPreviewRef = useRef<{
    readonly draggedNodeId: string;
    readonly nodes: DiagramFlowNode[];
  } | null>(null);
  const dragSnapshotRef = useRef<DiagramJson | null>(null);
  const editorShellRef = useRef<HTMLElement | null>(null);
  const leftRailRef = useRef<HTMLDivElement | null>(null);
  const boardViewportFrameRef = useRef<BoardViewportFrame | null>(null);
  const resizeSnapshotRef = useRef<DiagramJson | null>(null);
  const areaBlankDragRef = useRef<AreaBlankDragState | null>(null);
  const flowInstanceRef = useRef<ReactFlowInstance<DiagramFlowNode, DiagramFlowEdge> | null>(null);
  const flowNodeCacheRef = useRef<ReadonlyMap<string, DiagramFlowNode>>(new Map());
  const connectStartNodeIdRef = useRef<string | null>(null);
  const shouldAutoFitInitialDiagramRef = useRef(
    normalizedInitialBoardZoom === undefined && (initialDiagram?.nodes.length ?? 0) > 0
  );
  const shouldApplyInitialBoardZoomRef = useRef(
    normalizedInitialBoardZoom !== undefined && (initialDiagram?.nodes.length ?? 0) > 0
  );
  const shouldApplySourceViewportRef = useRef(true);
  const wasSourceViewBoxViewportRef = useRef(false);
  const initialSourceViewportFrameRef = useRef<number | null>(null);
  const initialAutoFitFrameRef = useRef<number | null>(null);
  const automaticViewportMoveRequestIdRef = useRef(0);
  const automaticViewportReleaseFrameRef = useRef<number | null>(null);
  const isLeftPanelResizingRef = useRef(false);
  const isRightPanelResizingRef = useRef(false);
  const snapAnimationFrameRef = useRef<number | null>(null);
  const snapAnimationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hoveredAreaBlankNodeId, setHoveredAreaBlankNodeId] = useState<string | null>(null);
  const [isAreaBlankDragging, setAreaBlankDragging] = useState(false);
  const [isSnapAnimating, setSnapAnimating] = useState(false);
  /** 콜백이 실행되는 순간 실제 Architecture Board의 React Flow 인스턴스를 돌려줍니다. */
  const getFlowInstance = useCallback(
    () => flowInstanceRef.current ?? fallbackFlowInstanceRef.current,
    []
  );

  /** 왼쪽 Resource palette를 열거나 닫습니다. */
  const toggleLeftPanel = useCallback(() => {
    setLeftPanelOpen((isOpen) => !isOpen);
  }, []);

  /** 오른쪽 Inspector를 열거나 닫습니다. */
  const toggleRightPanel = useCallback(() => {
    const nextOpen = !isRightPanelOpen;

    if (nextOpen) {
      onWorkspacePanelOpen?.();
    }

    setRightPanelOpen(nextOpen);
  }, [isRightPanelOpen, onWorkspacePanelOpen]);

  const updateRightPanelOpen = useCallback(
    (nextOpen: boolean): void => {
      if (nextOpen) {
        onWorkspacePanelOpen?.();
      }

      setRightPanelOpen(nextOpen);
    },
    [onWorkspacePanelOpen]
  );

  const selectedNodeId = selectedNodeIds.length === 1 ? (selectedNodeIds[0] ?? null) : null;
  const hasRightRail = rightPanel !== null;
  const isPreviewActive = previewDiagram !== null;
  const visibleDiagram = previewDiagram ?? diagram;
  const hasSourceViewBoxViewport =
    visibleDiagram.presentation?.geometryPolicy === "source-exact" &&
    visibleDiagram.presentation.sourceViewBox !== undefined;
  const selectedEdge = isPreviewActive
    ? null
    : getSingleSelectedEdgeForToolbar(diagram.edges, selectedNodeIds, selectedEdgeIds);
  const hoveredSelectedAreaNode =
    hoveredAreaBlankNodeId && selectedNodeId === hoveredAreaBlankNodeId
      ? (diagram.nodes.find((node) => node.id === hoveredAreaBlankNodeId) ?? null)
      : null;
  const shouldShowAreaBlankMoveCursor = Boolean(
    hoveredSelectedAreaNode && !hoveredSelectedAreaNode.locked
  );
  const shouldShowAreaBlankBlockedCursor = Boolean(hoveredSelectedAreaNode?.locked);

  const getCurrentBoardViewportFrame = useCallback((): BoardViewportFrame | null => {
    const canvasBounds = canvasPanelRef.current?.getBoundingClientRect();

    if (!canvasBounds || canvasBounds.width <= 0 || canvasBounds.height <= 0) {
      return null;
    }

    return getUnobscuredBoardViewportFrame(
      canvasBounds,
      leftRailRef.current?.getBoundingClientRect() ?? null,
      12,
      { top: BOARD_VIEWPORT_TOP_INSET, bottom: BOARD_VIEWPORT_BOTTOM_INSET }
    );
  }, []);

  const replaceDiagram = useCallback(
    (nextDiagram: DiagramJson, notifyChange = true) => {
      diagramRevisionRef.current += 1;
      diagramRef.current = nextDiagram;
      setDiagram(nextDiagram);

      if (notifyChange) {
        onDiagramChange?.(cloneDiagram(nextDiagram));
      }
    },
    [onDiagramChange]
  );

  const getDiagramRevision = useCallback<DiagramEditorPanelContext["getDiagramRevision"]>(
    () => diagramRevisionRef.current,
    []
  );

  const setPreviewDiagram = useCallback<DiagramEditorPanelContext["setPreviewDiagram"]>(
    (nextPreviewDiagram, nextPreviewAnnotations = null) => {
      setCompilerPreview(null);
      shouldApplySourceViewportRef.current = true;
      setPreviewDiagramState(
        nextPreviewDiagram === null
          ? null
          : normalizeDiagramResourceNodeGeometry(nextPreviewDiagram)
      );
      setPreviewAnnotations(nextPreviewDiagram === null ? null : nextPreviewAnnotations);
    },
    []
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
    const nextDiagram = normalizeDiagramResourceNodeGeometry(cloneDiagram(initialDiagram ?? EMPTY_DIAGRAM));
    shouldApplySourceViewportRef.current = true;
    replaceDiagram(nextDiagram, false);
    shouldAutoFitInitialDiagramRef.current =
      normalizedInitialBoardZoom === undefined && nextDiagram.nodes.length > 0;
    shouldApplyInitialBoardZoomRef.current =
      normalizedInitialBoardZoom !== undefined && nextDiagram.nodes.length > 0;
    setHistory({ past: [], future: [] });
    setPreviewDiagram(initialPreviewDiagram ?? null, initialPreviewAnnotations ?? null);
    setInspectedNodeId(null);
    const nextSelectedNodeIds = normalizeSelectedNodeIds(
      nextDiagram.nodes,
      initialSelectedNodeIds ?? []
    );
    const nextSelectedEdgeIds = getValidInitialSelectedEdgeIds(
      nextDiagram.edges,
      initialSelectedEdgeIds
    );

    setSelectedNodeIds((currentIds) => stabilizeSelectedIds(currentIds, nextSelectedNodeIds));
    setSelectedEdgeIds((currentIds) =>
      stabilizeSelectedIds(currentIds, nextSelectedNodeIds.length > 0 ? [] : nextSelectedEdgeIds)
    );
    setActiveAreaDropTargetNodeId(
      getValidInitialAreaDropTargetNodeId(nextDiagram.nodes, initialReferenceDropTargetNodeId)
    );

    if (initialAutoFitFrameRef.current !== null) {
      window.cancelAnimationFrame(initialAutoFitFrameRef.current);
      initialAutoFitFrameRef.current = null;
    }
  }, [
    cancelSnapAnimation,
    initialDiagram,
    initialPreviewAnnotations,
    initialPreviewDiagram,
    initialReferenceDropTargetNodeId,
    initialSelectedEdgeIds,
    initialSelectedNodeIds,
    normalizedInitialBoardZoom,
    replaceDiagram,
    setPreviewDiagram
  ]);

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

  const handleLeftPanelResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      isLeftPanelResizingRef.current = true;
      updateLeftPanelWidth(getLeftPanelWidthFromPointer(event.clientX, leftRailRef.current));
    },
    [updateLeftPanelWidth]
  );

  const handleLeftPanelResizeMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!isLeftPanelResizingRef.current) {
        return;
      }

      updateLeftPanelWidth(getLeftPanelWidthFromPointer(event.clientX, leftRailRef.current));
    },
    [updateLeftPanelWidth]
  );

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
      if (
        event.key !== "ArrowLeft" &&
        event.key !== "ArrowRight" &&
        event.key !== "Home" &&
        event.key !== "End"
      ) {
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

  const handleRightPanelResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      isRightPanelResizingRef.current = true;
      updateRightPanelWidth(window.innerWidth - event.clientX);
    },
    [updateRightPanelWidth]
  );

  const handleRightPanelResizeMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!isRightPanelResizingRef.current) {
        return;
      }

      updateRightPanelWidth(window.innerWidth - event.clientX);
    },
    [updateRightPanelWidth]
  );

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
      if (
        event.key !== "ArrowLeft" &&
        event.key !== "ArrowRight" &&
        event.key !== "Home" &&
        event.key !== "End"
      ) {
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

  const updateActiveAreaDropTargetNodeId = useCallback((nodeId: string | null) => {
    setActiveAreaDropTargetNodeId((currentNodeId) =>
      currentNodeId === nodeId ? currentNodeId : nodeId
    );
  }, []);

  const toggleAutoExpandAreas = useCallback(() => {
    setAutoExpandAreasEnabled((currentEnabled) => {
      const nextEnabled = !currentEnabled;

      writeAutoExpandAreasEnabled(
        typeof window === "undefined" ? null : window.localStorage,
        nextEnabled
      );
      return nextEnabled;
    });
  }, []);

  const getAreaDropTargetNodeId = useCallback(
    (childNode: DiagramNode, nodes: readonly DiagramNode[]) => {
      return findInnermostAreaDropTarget(childNode, nodes)?.id ?? null;
    },
    []
  );

  const cancelQueuedNodeDragPreview = useCallback(() => {
    if (nodeDragPreviewFrameRef.current !== null) {
      window.cancelAnimationFrame(nodeDragPreviewFrameRef.current);
      nodeDragPreviewFrameRef.current = null;
    }

    pendingNodeDragPreviewRef.current = null;
  }, []);

  const commitNodeDragPreview = useCallback(
    (draggedNodeId: string, nodes: DiagramFlowNode[]) => {
      const positionByNodeId = new Map(nodes.map((node) => [node.id, node.position]));
      const snapshotNodes = dragSnapshotRef.current?.nodes ?? diagramRef.current.nodes;
      const directlyMovedNodeIds =
        directNodeDragIdsRef.current ?? createDirectNodeDragIdSet(draggedNodeId, selectedNodeIds);
      const previewNodes = getDraggedPreviewNodes({
        currentNodes: diagramRef.current.nodes,
        directlyMovedNodeIds,
        positionByNodeId,
        snapshotNodes
      });
      const draggedNode = previewNodes.find((node) => node.id === draggedNodeId);

      setDragPreviewNodesForState(previewNodes);
      updateActiveAreaDropTargetNodeId(
        draggedNode ? getAreaDropTargetNodeId(draggedNode, previewNodes) : null
      );

      return previewNodes;
    },
    [
      getAreaDropTargetNodeId,
      selectedNodeIds,
      setDragPreviewNodesForState,
      updateActiveAreaDropTargetNodeId
    ]
  );

  const queueNodeDragPreview = useCallback(
    (draggedNodeId: string, nodes: DiagramFlowNode[]) => {
      pendingNodeDragPreviewRef.current = { draggedNodeId, nodes };

      if (nodeDragPreviewFrameRef.current !== null) {
        return;
      }

      nodeDragPreviewFrameRef.current = window.requestAnimationFrame(() => {
        nodeDragPreviewFrameRef.current = null;
        const pendingNodeDragPreview = pendingNodeDragPreviewRef.current;
        pendingNodeDragPreviewRef.current = null;

        if (!pendingNodeDragPreview) {
          return;
        }

        commitNodeDragPreview(pendingNodeDragPreview.draggedNodeId, pendingNodeDragPreview.nodes);
      });
    },
    [commitNodeDragPreview]
  );

  const flushNodeDragPreview = useCallback(
    (draggedNodeId: string, nodes: DiagramFlowNode[]) => {
      cancelQueuedNodeDragPreview();
      return commitNodeDragPreview(draggedNodeId, nodes);
    },
    [cancelQueuedNodeDragPreview, commitNodeDragPreview]
  );

  const flushQueuedNodeDragPreview = useCallback(() => {
    const pendingNodeDragPreview = pendingNodeDragPreviewRef.current;

    cancelQueuedNodeDragPreview();

    if (!pendingNodeDragPreview) {
      return null;
    }

    return commitNodeDragPreview(
      pendingNodeDragPreview.draggedNodeId,
      pendingNodeDragPreview.nodes
    );
  }, [cancelQueuedNodeDragPreview, commitNodeDragPreview]);

  useEffect(() => () => cancelQueuedNodeDragPreview(), [cancelQueuedNodeDragPreview]);

  const undo = useCallback(() => {
    cancelSnapAnimation();
    const previous = history.past.at(-1);

    if (!previous) {
      return;
    }

    const currentDiagram = diagramRef.current;
    setHistory({
      past: history.past.slice(0, -1),
      future: [cloneDiagram(currentDiagram), ...history.future]
    });
    replaceDiagram(clearTerraformSourceAuthority(cloneDiagram(previous)));
    setInspectedNodeId(null);
    setSelectedNodeIds([]);
    setSelectedEdgeIds([]);
  }, [cancelSnapAnimation, history, replaceDiagram]);

  const redo = useCallback(() => {
    cancelSnapAnimation();
    const next = history.future[0];

    if (!next) {
      return;
    }

    const currentDiagram = diagramRef.current;
    setHistory({
      past: [...history.past, cloneDiagram(currentDiagram)].slice(-MAX_HISTORY_ITEMS),
      future: history.future.slice(1)
    });
    replaceDiagram(clearTerraformSourceAuthority(cloneDiagram(next)));
    setInspectedNodeId(null);
    setSelectedNodeIds([]);
    setSelectedEdgeIds([]);
  }, [cancelSnapAnimation, history, replaceDiagram]);

  const addCuratedModule = useCallback(
    (moduleId: string) => {
      commitDiagramUpdate((currentDiagram) =>
        expandCuratedModuleIntoDiagram({
          diagram: currentDiagram,
          moduleId
        })
      );
    },
    [commitDiagramUpdate]
  );

  const updateNodeMetadata = useCallback(
    (
      nodeId: string,
      update: DiagramNodeMetadataUpdate | ((node: DiagramNode) => DiagramNodeMetadataUpdate)
    ) => {
      commitDiagramUpdate((currentDiagram) => {
        const nextDiagram = {
          ...currentDiagram,
          nodes: updateNodeById(currentDiagram.nodes, nodeId, (node) =>
            applyNodeMetadataUpdate(node, typeof update === "function" ? update(node) : update)
          )
        };

        return clearAuthoredRoutesForNodeGeometryChanges(currentDiagram.nodes, nextDiagram);
      });
    },
    [commitDiagramUpdate]
  );

  /** attachment parameter 변경 시 양쪽 SG visual scope까지 같은 history 항목으로 갱신합니다. */
  const updateNodeParameters = useCallback<DiagramEditorPanelContext["updateNodeParameters"]>(
    (nodeId, update) => {
      commitDiagramUpdate((currentDiagram) => {
        const nextNodes = updateNodeById(currentDiagram.nodes, nodeId, (node) =>
          applyNodeParametersUpdateWithAutoTagSync(node, update)
        );

        const nextDiagram = {
          ...currentDiagram,
          nodes: refitSecurityGroupScopesForTargetChanges({
            changedNodeIds: new Set([nodeId]),
            currentNodes: nextNodes,
            previousNodes: currentDiagram.nodes
          })
        };

        return clearAuthoredRoutesForNodeGeometryChanges(currentDiagram.nodes, nextDiagram);
      });
    },
    [commitDiagramUpdate]
  );

  const applyDiagramJson = useCallback<DiagramEditorPanelContext["applyDiagramJson"]>(
    (nextDiagram) => {
      shouldApplySourceViewportRef.current = true;
      commitDiagramUpdate(() => normalizeDiagramResourceNodeGeometry(cloneDiagram(nextDiagram)));
      setPreviewDiagram(null);
      setInspectedNodeId(null);
      setSelectedNodeIds([]);
      setSelectedEdgeIds([]);
    },
    [commitDiagramUpdate]
  );

  const previewAutomaticOrganization = useCallback(() => {
    onWorkspacePanelOpen?.();
    const currentDiagram = diagramRef.current;
    const proposal = createBoardAutoOrganizeProposal(currentDiagram);

    setPreviewDiagram(proposal.diagram);
    setCompilerPreview(proposal);
  }, [onWorkspacePanelOpen, setPreviewDiagram]);

  const applyAutomaticOrganization = useCallback(() => {
    if (compilerPreview === null) return;
    applyDiagramJson(compilerPreview.diagram);
    setCompilerPreview(null);
  }, [applyDiagramJson, compilerPreview]);

  const cancelAutomaticOrganization = useCallback(() => {
    setPreviewDiagram(null);
    setCompilerPreview(null);
  }, [setPreviewDiagram]);

  const commitTerraformSourceAuthority = useCallback<
    DiagramEditorPanelContext["commitTerraformSourceAuthority"]
  >(() => {
    const authoritativeDiagram = markTerraformSourceAuthoritative(diagramRef.current);

    if (
      authoritativeDiagram.presentation?.terraformSourceFingerprint ===
      diagramRef.current.presentation?.terraformSourceFingerprint
    ) {
      return diagramRef.current;
    }

    replaceDiagram(authoritativeDiagram);
    return authoritativeDiagram;
  }, [replaceDiagram]);

  // 템플릿 적용은 현재 보드를 백업한 뒤 전체 보드를 템플릿 구조로 교체합니다.
  const applyBoardTemplate = useCallback(
    (template: AvailableBoardTemplate): void => {
      if (typeof window === "undefined") return;

      const nextDiagram = applyTemplateToDiagramWithBackup({
        currentDiagram: diagramRef.current,
        nowIso: new Date().toISOString(),
        storage: window.localStorage,
        template
      });
      const authoritativeDiagram =
        template.terraformFiles.length > 0
          ? markTerraformSourceAuthoritative(nextDiagram)
          : nextDiagram;

      onTemplateWorkspaceApply?.({
        diagramJson: cloneDiagram(authoritativeDiagram),
        terraformFiles: template.terraformFiles.map((file) => ({ ...file }))
      });
      applyDiagramJson(authoritativeDiagram);
      // Workspace seed 교체는 Diagram과 Terraform을 함께 바꾸므로 이전 Diagram-only undo를 끊습니다.
      setHistory({ past: [], future: [] });
    },
    [applyDiagramJson, onTemplateWorkspaceApply]
  );

  const requestTerraformRefresh = useCallback(() => {
    setTerraformRefreshRequestId((requestId) => requestId + 1);
  }, []);

  const focusResourceNode = useCallback<DiagramEditorPanelContext["focusResourceNode"]>(
    (nodeId) => {
      const targetNode = diagramRef.current.nodes.find((node) => node.id === nodeId);

      if (!targetNode) {
        return;
      }

      setSelectedNodeIds([nodeId]);
      setSelectedEdgeIds([]);
      setInspectedNodeId(nodeId);
      updateRightPanelOpen(true);

      window.requestAnimationFrame(() => {
        const flowInstance = getFlowInstance();
        const frame = getCurrentBoardViewportFrame();

        if (!frame) {
          void flowInstance.fitView({
            duration: getBoardMotionDuration(180),
            maxZoom: 1.5,
            minZoom: 0.35,
            nodes: [{ id: nodeId }],
            padding: 0.6
          });
          return;
        }

        const viewport = offsetBoardViewportToFrame(
          getViewportForBounds(
            getDiagramVisualBounds([targetNode]),
            frame.width,
            frame.height,
            0.35,
            1.5,
            0.6
          ),
          frame
        );

        void flowInstance.setViewport(viewport, { duration: getBoardMotionDuration(180) });
        applyLiveDiagramUpdate((currentDiagram) => updateDiagramViewport(currentDiagram, viewport));
        focusEditorShell();
      });
    },
    [
      applyLiveDiagramUpdate,
      focusEditorShell,
      getCurrentBoardViewportFrame,
      getFlowInstance,
      updateRightPanelOpen
    ]
  );

  const selectResourceNode = useCallback<DiagramEditorPanelContext["selectResourceNode"]>(
    (nodeId) => {
      const targetNode = diagramRef.current.nodes.find((node) => node.id === nodeId);

      if (!targetNode) {
        return;
      }

      setSelectedNodeIds([nodeId]);
      setSelectedEdgeIds([]);
      setInspectedNodeId(nodeId);
      updateRightPanelOpen(true);
    },
    [updateRightPanelOpen]
  );

  const panelContext = useMemo<DiagramEditorPanelContext>(
    () => ({
      diagram,
      inspectedNodeId,
      isPreviewActive,
      isRightPanelOpen: hasRightRail && isRightPanelOpen,
      previewAnnotations,
      previewDiagram,
      selectedNodeId,
      terraformRefreshRequestId,
      nodes: diagram.nodes,
      edges: diagram.edges,
      applyDiagramJson,
      closeInspectedNode: () => setInspectedNodeId(null),
      commitTerraformSourceAuthority,
      focusResourceNode,
      getDiagramRevision,
      requestTerraformRefresh,
      selectResourceNode,
      saveDiagramNow: onDiagramSaveRequest,
      setPreviewDiagram,
      setRightPanelOpen: updateRightPanelOpen,
      updateNodeParameters,
      updateNodeMetadata
    }),
    [
      applyDiagramJson,
      commitTerraformSourceAuthority,
      diagram,
      focusResourceNode,
      getDiagramRevision,
      hasRightRail,
      inspectedNodeId,
      isPreviewActive,
      isRightPanelOpen,
      onDiagramSaveRequest,
      previewAnnotations,
      previewDiagram,
      requestTerraformRefresh,
      setPreviewDiagram,
      selectResourceNode,
      selectedNodeId,
      terraformRefreshRequestId,
      updateRightPanelOpen,
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

  /** resize 확정 시 parent와 연결된 SG visual scope를 같은 history 항목으로 정리합니다. */
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
      const nodesWithReconciledAreas = autoExpandAreasEnabled
        ? reconcileAreaNodeGeometry(
            before?.nodes ?? diagramRef.current.nodes,
            resizedDiagram.nodes,
            new Set([nodeId])
          )
        : clearOutOfBoundsAreaParentAssignments(resizedDiagram.nodes, new Set([nodeId]));
      const resizedAndRefittedDiagram = {
        ...resizedDiagram,
        nodes: refitSecurityGroupScopesForTargetChanges({
          changedNodeIds: new Set([nodeId]),
          currentNodes: nodesWithReconciledAreas,
          previousNodes: before?.nodes ?? resizedDiagram.nodes
        })
      };
      const after = before
        ? clearAuthoredRoutesForNodeGeometryChanges(before.nodes, resizedAndRefittedDiagram)
        : clearAuthoredRoutesForNodeIds(
            resizedAndRefittedDiagram,
            new Set([
              nodeId,
              ...getNodeGeometryChangedIds(resizedDiagram.nodes, resizedAndRefittedDiagram.nodes)
            ])
          );

      replaceDiagram(after);

      if (before) {
        pushHistory(before, after);
      }

      resizeSnapshotRef.current = null;
    },
    [autoExpandAreasEnabled, pushHistory, replaceDiagram]
  );

  const flowNodeHandlers = useMemo<DiagramFlowNodeHandlers>(
    () => ({
      onBringForward: handleBringForward,
      onSendBackward: handleSendBackward,
      onTextColorChange: handleTextColorChange,
      onBorderColorChange: handleBorderColorChange,
      onToggleLock: handleToggleLock,
      onResizeStart: handleResizeStart,
      onResize: handleResize,
      onResizeEnd: handleResizeEnd
    }),
    [
      handleBorderColorChange,
      handleBringForward,
      handleResize,
      handleResizeEnd,
      handleResizeStart,
      handleSendBackward,
      handleTextColorChange,
      handleToggleLock
    ]
  );

  const displayNodes = isPreviewActive ? visibleDiagram.nodes : (dragPreviewNodes ?? diagram.nodes);
  const staleAuthoredRouteNodeIds = useMemo(() => {
    if (isPreviewActive) {
      return new Set<string>();
    }

    const previousNodes = dragPreviewNodes ? diagram.nodes : resizeSnapshotRef.current?.nodes;
    const currentNodes = dragPreviewNodes ?? diagram.nodes;

    return previousNodes
      ? getNodeGeometryChangedIds(previousNodes, currentNodes)
      : new Set<string>();
  }, [diagram.nodes, dragPreviewNodes, isPreviewActive]);
  const flowNodes = useMemo(() => {
    const nextFlowNodes = toFlowNodes(
      displayNodes,
      isPreviewActive ? [] : selectedNodeIds,
      isPreviewActive ? null : activeAreaDropTargetNodeId,
      isConnectionActive,
      flowNodeHandlers,
      {
        activeConnectionSourceNodeId: isPreviewActive ? null : connectStartNodeIdRef.current,
        cachedNodesById: flowNodeCacheRef.current,
        edges: visibleDiagram.edges,
        geometryPolicy: visibleDiagram.presentation?.geometryPolicy,
        isPreview: isPreviewActive,
        previewAnnotations: isPreviewActive ? (previewAnnotations ?? undefined) : undefined
      }
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
  }, [
    activeAreaDropTargetNodeId,
    displayNodes,
    flowNodeHandlers,
    isConnectionActive,
    interactionMode,
    isPreviewActive,
    previewAnnotations,
    selectedNodeIds,
    visibleDiagram.edges,
    visibleDiagram.presentation?.geometryPolicy
  ]);

  useEffect(() => {
    flowNodeCacheRef.current = new Map(flowNodes.map((node) => [node.id, node]));
  }, [flowNodes]);

  const flowEdges = useMemo(
    () =>
      toFlowEdges(visibleDiagram.edges, isPreviewActive ? [] : selectedEdgeIds, displayNodes, {
        geometryPolicy: visibleDiagram.presentation?.geometryPolicy,
        isPreview: isPreviewActive,
        previewAnnotations: isPreviewActive ? (previewAnnotations ?? undefined) : undefined,
        staleAuthoredRouteNodeIds
      }),
    [
      displayNodes,
      isPreviewActive,
      previewAnnotations,
      selectedEdgeIds,
      staleAuthoredRouteNodeIds,
      visibleDiagram.edges,
      visibleDiagram.presentation?.geometryPolicy
    ]
  );

  const handleInit = useCallback<OnInit<DiagramFlowNode, DiagramFlowEdge>>(
    (instance) => {
      flowInstanceRef.current = instance;
      setFlowReady(true);
      const captureElement = canvasPanelRef.current?.querySelector<HTMLElement>(
        BOARD_THUMBNAIL_CAPTURE_CONTRACT.sourceSelector
      );

      if (captureElement) {
        onBoardReady?.(captureElement);
      }
    },
    [onBoardReady]
  );

  const handleNodesChange = useCallback<OnNodesChange<DiagramFlowNode>>(
    (changes) => {
      const nextSelectedNodeIds = applySelectionChanges(selectedNodeIds, changes);
      const positionChanges = changes.filter(isNodePositionChangeWithPosition);

      if (nextSelectedNodeIds) {
        const normalizedSelectedNodeIds = normalizeSelectedNodeIds(
          diagramRef.current.nodes,
          nextSelectedNodeIds
        );

        setSelectedNodeIds((currentIds) =>
          stabilizeSelectedIds(currentIds, normalizedSelectedNodeIds)
        );
      }

      if (positionChanges.length === 0 || interactionMode !== "select") {
        return;
      }

      const positionByNodeId = new Map(
        positionChanges.map((change) => [change.id, change.position])
      );
      const dragSnapshot = dragSnapshotRef.current;
      const directNodeDragIds = directNodeDragIdsRef.current;

      if (dragSnapshot && directNodeDragIds) {
        return;
      }

      applyLiveDiagramUpdate((currentDiagram) => {
        const directlyMovedNodeIds = new Set(positionByNodeId.keys());
        const nextDiagram = {
          ...currentDiagram,
          nodes: getDraggedPreviewNodes({
            currentNodes: currentDiagram.nodes,
            directlyMovedNodeIds,
            positionByNodeId,
            snapshotNodes: currentDiagram.nodes
          })
        };

        return clearAuthoredRoutesForNodeGeometryChanges(currentDiagram.nodes, nextDiagram);
      });
    },
    [applyLiveDiagramUpdate, interactionMode, selectedNodeIds, setDragPreviewNodesForState]
  );

  const handleEdgesChange = useCallback<OnEdgesChange<DiagramFlowEdge>>(
    (changes) => {
      const nextSelectedEdgeIds = applySelectionChanges(selectedEdgeIds, changes);

      if (nextSelectedEdgeIds) {
        setSelectedEdgeIds((currentIds) => stabilizeSelectedIds(currentIds, nextSelectedEdgeIds));
      }
    },
    [selectedEdgeIds]
  );

  const handleSelectionChange = useCallback<
    OnSelectionChangeFunc<DiagramFlowNode, DiagramFlowEdge>
  >(
    ({ edges, nodes }) => {
      const nextSelectedNodeIds = normalizeSelectedNodeIds(
        diagramRef.current.nodes,
        nodes.map((node) => node.id)
      );
      const nextSelectedEdgeIds =
        nextSelectedNodeIds.length > 0 ? [] : edges.map((edge) => edge.id);

      setSelectedNodeIds((currentIds) => stabilizeSelectedIds(currentIds, nextSelectedNodeIds));
      setSelectedEdgeIds((currentIds) => stabilizeSelectedIds(currentIds, nextSelectedEdgeIds));

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
      updateRightPanelOpen(true);
      focusEditorShell();
    },
    [focusEditorShell, updateRightPanelOpen]
  );

  const getAreaNodeFromPointerEvent = useCallback(
    (clientX: number, clientY: number) => {
      const position = getFlowInstance().screenToFlowPosition({
        x: clientX,
        y: clientY
      });

      return findAreaBlankInteractionNodeAtPoint(diagramRef.current.nodes, position);
    },
    [getFlowInstance]
  );

  const handleAreaBlankDragMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const dragState = areaBlankDragRef.current;

      if (!dragState || dragState.pointerId !== event.pointerId) {
        return false;
      }

      event.preventDefault();
      event.stopPropagation();

      const zoom = getFlowInstance().getZoom() || 1;
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
      updateActiveAreaDropTargetNodeId(
        draggedNode ? getAreaDropTargetNodeId(draggedNode, previewNodes) : null
      );

      return true;
    },
    [
      getAreaDropTargetNodeId,
      getFlowInstance,
      setDragPreviewNodesForState,
      updateActiveAreaDropTargetNodeId
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
        const previewNodes =
          dragPreviewNodesRef.current ??
          getDraggedPreviewNodes({
            currentNodes: diagramRef.current.nodes,
            directlyMovedNodeIds,
            positionByNodeId,
            snapshotNodes: dragState.snapshotNodes
          });
        const finalizedNodes = finalizeDraggedNodes({
          anchorNodeId: dragState.nodeId,
          autoExpandAreasEnabled,
          catalog: terraformParameterCatalog,
          currentNodes: diagramRef.current.nodes,
          directlyMovedNodeIds,
          positionByNodeId,
          snapGridSize: DIAGRAM_SNAP_GRID_SIZE,
          snapshotNodes: dragState.snapshotNodes
        });
        const finalizedDiagram = {
          ...diagramRef.current,
          nodes: finalizedNodes.nodes
        };
        const after = clearAuthoredRoutesForNodeGeometryChanges(
          dragState.before.nodes,
          finalizedDiagram
        );

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
      updateActiveAreaDropTargetNodeId(null);

      return true;
    },
    [
      autoExpandAreasEnabled,
      pushHistory,
      replaceDiagram,
      setDragPreviewNodesForState,
      startSnapAnimation,
      updateActiveAreaDropTargetNodeId
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
      updateActiveAreaDropTargetNodeId(null);
    },
    [
      cancelSnapAnimation,
      getAreaNodeFromPointerEvent,
      interactionMode,
      selectAreaBlankNode,
      selectedNodeIds,
      updateActiveAreaDropTargetNodeId
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

  const handleNodeDragStart = useCallback(
    (_event: MouseEvent | TouchEvent, draggedFlowNode: DiagramFlowNode) => {
      if (interactionMode !== "select") {
        return;
      }

      cancelSnapAnimation();
      cancelQueuedNodeDragPreview();
      dragSnapshotRef.current = cloneDiagram(diagramRef.current);
      dragAnchorNodeIdRef.current = draggedFlowNode.id;
      directNodeDragIdsRef.current = createDirectNodeDragIdSet(draggedFlowNode.id, selectedNodeIds);
      updateActiveAreaDropTargetNodeId(null);
    },
    [
      cancelQueuedNodeDragPreview,
      cancelSnapAnimation,
      interactionMode,
      selectedNodeIds,
      updateActiveAreaDropTargetNodeId
    ]
  );

  const handleNodeDrag = useCallback(
    (
      _event: MouseEvent | TouchEvent,
      draggedFlowNode: DiagramFlowNode,
      nodes: DiagramFlowNode[]
    ) => {
      if (interactionMode !== "select") {
        return;
      }

      queueNodeDragPreview(draggedFlowNode.id, nodes);
    },
    [interactionMode, queueNodeDragPreview]
  );

  const handleNodeDragStop = useCallback(
    (_event: MouseEvent | TouchEvent, node: DiagramFlowNode, nodes: DiagramFlowNode[]) => {
      if (interactionMode !== "select") {
        cancelQueuedNodeDragPreview();
        clearNodeDragState();
        setDragPreviewNodesForState(null);
        updateActiveAreaDropTargetNodeId(null);
        return;
      }

      const previewNodes = flushNodeDragPreview(node.id, nodes);
      const before = dragSnapshotRef.current;
      const positionByNodeId = new Map(nodes.map((node) => [node.id, node.position]));
      const snapshotNodes = before?.nodes ?? diagramRef.current.nodes;
      const directlyMovedNodeIds =
        directNodeDragIdsRef.current ?? createDirectNodeDragIdSet(node.id, selectedNodeIds);
      const finalizedNodes = finalizeDraggedNodes({
        anchorNodeId: dragAnchorNodeIdRef.current ?? node.id,
        autoExpandAreasEnabled,
        catalog: terraformParameterCatalog,
        currentNodes: diagramRef.current.nodes,
        directlyMovedNodeIds,
        positionByNodeId,
        snapGridSize: DIAGRAM_SNAP_GRID_SIZE,
        snapshotNodes
      });
      const finalizedDiagram = {
        ...diagramRef.current,
        nodes: finalizedNodes.nodes
      };
      const after = before
        ? clearAuthoredRoutesForNodeGeometryChanges(before.nodes, finalizedDiagram)
        : finalizedDiagram;

      if (before && !areDiagramsEqual(before, after)) {
        replaceDiagram(after);
        pushHistory(before, after);
        startSnapAnimation(previewNodes, finalizedNodes.nodes);
      } else {
        setDragPreviewNodesForState(null);
      }

      clearNodeDragState();
      updateActiveAreaDropTargetNodeId(null);
    },
    [
      autoExpandAreasEnabled,
      cancelQueuedNodeDragPreview,
      clearNodeDragState,
      flushNodeDragPreview,
      interactionMode,
      pushHistory,
      replaceDiagram,
      selectedNodeIds,
      setDragPreviewNodesForState,
      startSnapAnimation,
      updateActiveAreaDropTargetNodeId
    ]
  );

  const clearConnectionActivityOnRelease = useCallback(() => {
    setConnectionActive(false);
  }, []);

  const resetConnectionStateOnCancel = useCallback(() => {
    connectStartNodeIdRef.current = null;
    setConnectionActive(false);
  }, []);

  const handleConnectStart = useCallback<OnConnectStart>((_event, params) => {
    connectStartNodeIdRef.current = params.nodeId;
    setConnectionActive(true);
  }, []);

  const handleConnectEnd = useCallback<OnConnectEnd>(() => {
    resetConnectionStateOnCancel();
  }, [resetConnectionStateOnCancel]);

  const handleConnect = useCallback<OnConnect>(
    (connection) => {
      const connectStartNodeId = connectStartNodeIdRef.current;
      connectStartNodeIdRef.current = null;
      setConnectionActive(false);
      const directedConnection = getUserDirectedConnection(connection, connectStartNodeId);

      if (!directedConnection) {
        return;
      }

      const currentDiagram = diagramRef.current;
      const sourceNode = currentDiagram.nodes.find(
        (node) => node.id === directedConnection.sourceNodeId
      );
      const targetNode = currentDiagram.nodes.find(
        (node) => node.id === directedConnection.targetNodeId
      );

      if (
        !isAwsDiagramConnectionAllowed({
          sourceNode,
          targetNode,
          edges: currentDiagram.edges
        })
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

  useEffect(() => {
    if (!isConnectionActive) {
      return undefined;
    }

    window.addEventListener("pointerup", clearConnectionActivityOnRelease);
    window.addEventListener("mouseup", clearConnectionActivityOnRelease);
    window.addEventListener("pointercancel", resetConnectionStateOnCancel);
    window.addEventListener("blur", resetConnectionStateOnCancel);

    return () => {
      window.removeEventListener("pointerup", clearConnectionActivityOnRelease);
      window.removeEventListener("mouseup", clearConnectionActivityOnRelease);
      window.removeEventListener("pointercancel", resetConnectionStateOnCancel);
      window.removeEventListener("blur", resetConnectionStateOnCancel);
    };
  }, [clearConnectionActivityOnRelease, isConnectionActive, resetConnectionStateOnCancel]);

  const finalizeAreaBlankDragWithoutAnimation = useCallback(() => {
    const dragState = areaBlankDragRef.current;

    if (!dragState || !dragState.hasMoved) {
      return false;
    }

    const directlyMovedNodeIds = new Set([dragState.nodeId]);
    const finalizedNodes = finalizeDraggedNodes({
      anchorNodeId: dragState.nodeId,
      autoExpandAreasEnabled,
      catalog: terraformParameterCatalog,
      currentNodes: diagramRef.current.nodes,
      directlyMovedNodeIds,
      positionByNodeId: new Map([[dragState.nodeId, dragState.latestNodePosition]]),
      snapGridSize: DIAGRAM_SNAP_GRID_SIZE,
      snapshotNodes: dragState.snapshotNodes
    });
    const finalizedDiagram = {
      ...diagramRef.current,
      nodes: finalizedNodes.nodes
    };
    const after = clearAuthoredRoutesForNodeGeometryChanges(
      dragState.before.nodes,
      finalizedDiagram
    );

    if (!areDiagramsEqual(dragState.before, after)) {
      replaceDiagram(after);
      pushHistory(dragState.before, after);
    }

    areaBlankDragRef.current = null;
    setAreaBlankDragging(false);
    setDragPreviewNodesForState(null);
    updateActiveAreaDropTargetNodeId(null);

    return true;
  }, [
    autoExpandAreasEnabled,
    pushHistory,
    replaceDiagram,
    setDragPreviewNodesForState,
    updateActiveAreaDropTargetNodeId
  ]);

  const finalizeNodeDragWithoutAnimation = useCallback(() => {
    const before = dragSnapshotRef.current;
    const directlyMovedNodeIds = directNodeDragIdsRef.current;
    const anchorNodeId = dragAnchorNodeIdRef.current;
    const previewNodes = flushQueuedNodeDragPreview() ?? dragPreviewNodesRef.current;

    if (!before || !directlyMovedNodeIds || !anchorNodeId || !previewNodes) {
      return false;
    }

    const finalizedNodes = finalizeDraggedNodes({
      anchorNodeId,
      autoExpandAreasEnabled,
      catalog: terraformParameterCatalog,
      currentNodes: diagramRef.current.nodes,
      directlyMovedNodeIds,
      positionByNodeId: new Map(
        previewNodes.map((previewNode) => [previewNode.id, previewNode.position])
      ),
      snapGridSize: DIAGRAM_SNAP_GRID_SIZE,
      snapshotNodes: before.nodes
    });
    const finalizedDiagram = {
      ...diagramRef.current,
      nodes: finalizedNodes.nodes
    };
    const after = clearAuthoredRoutesForNodeGeometryChanges(before.nodes, finalizedDiagram);

    if (!areDiagramsEqual(before, after)) {
      replaceDiagram(after);
      pushHistory(before, after);
    }

    clearNodeDragState();
    setDragPreviewNodesForState(null);
    updateActiveAreaDropTargetNodeId(null);

    return true;
  }, [
    autoExpandAreasEnabled,
    clearNodeDragState,
    flushQueuedNodeDragPreview,
    pushHistory,
    replaceDiagram,
    setDragPreviewNodesForState,
    updateActiveAreaDropTargetNodeId
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
        updateActiveAreaDropTargetNodeId(null);
        clearActiveResourceDragPayload();
        return;
      }

      const position = snapPositionToDiagramGrid(
        getFlowInstance().screenToFlowPosition({
          x: event.clientX,
          y: event.clientY
        }),
        DIAGRAM_SNAP_GRID_SIZE
      );

      const nextNode = placeDroppedNodeInsideArea(
        diagramRef.current.nodes,
        scalePaletteAreaNodeSize(
          createDiagramNodeFromPayload(
            payload,
            position,
            getNextZIndex(diagramRef.current.nodes),
            diagramRef.current.nodes
          )
        ),
        position
      );

      commitDiagramUpdate((currentDiagram) => {
        const nodesWithNextNode = [...currentDiagram.nodes, nextNode];
        const nodesWithAssignedParents = applyAreaNodeParentAssignments(
          nodesWithNextNode,
          new Set([nextNode.id])
        );
        const nodesWithReconciledAreas = autoExpandAreasEnabled
          ? reconcileAreaNodeGeometry(
              currentDiagram.nodes,
              nodesWithAssignedParents,
              new Set([nextNode.id])
            )
          : nodesWithAssignedParents;

        const nextDiagram = {
          ...currentDiagram,
          nodes: applyContainingReferenceDropTargets(
            nodesWithReconciledAreas,
            new Set([nextNode.id]),
            terraformParameterCatalog
          )
        };

        return clearAuthoredRoutesForNodeGeometryChanges(currentDiagram.nodes, nextDiagram);
      });
      setSelectedNodeIds([nextNode.id]);
      setSelectedEdgeIds([]);
      updateActiveAreaDropTargetNodeId(null);
      clearActiveResourceDragPayload();
      focusEditorShell();
    },
    [
      autoExpandAreasEnabled,
      cancelSnapAnimation,
      commitDiagramUpdate,
      focusEditorShell,
      getFlowInstance,
      updateActiveAreaDropTargetNodeId
    ]
  );

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();

      const payload = getActiveResourceDragPayload(event.dataTransfer);

      if (!payload) {
        event.dataTransfer.dropEffect = "none";
        updateActiveAreaDropTargetNodeId(null);
        return;
      }

      event.dataTransfer.dropEffect = "copy";

      const position = getFlowInstance().screenToFlowPosition({
        x: event.clientX,
        y: event.clientY
      });
      const previewNode = scalePaletteAreaNodeSize(
        createDiagramNodeFromPayload(payload, position, 0)
      );
      const nodesWithPreviewNode = [...diagramRef.current.nodes, previewNode];

      updateActiveAreaDropTargetNodeId(getAreaDropTargetNodeId(previewNode, nodesWithPreviewNode));
    },
    [getAreaDropTargetNodeId, getFlowInstance, updateActiveAreaDropTargetNodeId]
  );

  const handleDragLeave = useCallback(() => {
    updateActiveAreaDropTargetNodeId(null);
  }, [updateActiveAreaDropTargetNodeId]);

  const handlePaneClick = useCallback(
    (event: ReactMouseEvent) => {
      cancelSnapAnimation();
      const position = getFlowInstance().screenToFlowPosition({
        x: event.clientX,
        y: event.clientY
      });
      const areaNode = findAreaBlankInteractionNodeAtPoint(diagramRef.current.nodes, position);

      setSelectedNodeIds(areaNode ? [areaNode.id] : []);
      setSelectedEdgeIds([]);
      setInspectedNodeId(null);
      focusEditorShell();
    },
    [cancelSnapAnimation, focusEditorShell, getFlowInstance]
  );

  const handleFlowNodeClick = useCallback(
    (_event: ReactMouseEvent, node: DiagramFlowNode) => {
      setSelectedNodeIds([node.id]);
      setSelectedEdgeIds([]);
      setInspectedNodeId(node.id);
      updateRightPanelOpen(true);
      focusEditorShell();
    },
    [focusEditorShell, updateRightPanelOpen]
  );

  const handleFlowNodeDoubleClick = useCallback(
    (_event: ReactMouseEvent, node: DiagramFlowNode) => {
      setSelectedNodeIds([node.id]);
      setSelectedEdgeIds([]);
      setInspectedNodeId(node.id);
      updateRightPanelOpen(true);
      focusEditorShell();
    },
    [focusEditorShell, updateRightPanelOpen]
  );

  /** target 삭제 뒤 남은 attachment 기준으로 SG visual scope를 축소하거나 다시 맞춥니다. */
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
      const nodesWithoutDeletedParents = clearDeletedAreaParentAssignments(
        diagramWithoutSelection.nodes,
        deletedNodeIds
      );
      const nodesWithReconciledAreas = autoExpandAreasEnabled
        ? reconcileAreaNodeGeometry(
            currentDiagram.nodes,
            nodesWithoutDeletedParents,
            deletedNodeIds
          )
        : nodesWithoutDeletedParents;

      const nextDiagram = {
        ...diagramWithoutSelection,
        nodes: refitSecurityGroupScopesForTargetChanges({
          changedNodeIds: deletedNodeIds,
          currentNodes: nodesWithReconciledAreas,
          previousNodes: currentDiagram.nodes
        })
      };

      return clearAuthoredRoutesForNodeGeometryChanges(currentDiagram.nodes, nextDiagram);
    });
    setSelectedNodeIds([]);
    setSelectedEdgeIds([]);
  }, [
    autoExpandAreasEnabled,
    cancelSnapAnimation,
    commitDiagramUpdate,
    selectedEdgeIds,
    selectedNodeIds
  ]);

  const copySelectedNodes = useCallback(() => {
    if (selectedNodeIds.length === 0) {
      return;
    }

    const selectedNodeIdSet = new Set(selectedNodeIds);
    clipboardRef.current = diagramRef.current.nodes
      .filter((node) => selectedNodeIdSet.has(node.id))
      .map(
        (node) =>
          cloneDiagram({ nodes: [node], edges: [], viewport: getDefaultViewport() }).nodes[0]
      )
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
      const pastedNodeIds = new Set(pastedNodes.map((node) => node.id));
      const nodesWithAssignedParents = applyAreaNodeParentAssignments(
        nodesWithPastedNodes,
        pastedNodeIds
      );

      return {
        ...currentDiagram,
        nodes: autoExpandAreasEnabled
          ? reconcileAreaNodeGeometry(
              currentDiagram.nodes,
              nodesWithAssignedParents,
              pastedNodeIds
            )
          : nodesWithAssignedParents
      };
    });
    setSelectedNodeIds(pastedNodes.map((node) => node.id));
    setSelectedEdgeIds([]);
  }, [autoExpandAreasEnabled, cancelSnapAnimation, commitDiagramUpdate]);

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
        edges: currentDiagram.edges.map((edge) => {
          if (edge.id !== edgeId) {
            return edge;
          }

          const { route: _route, ...edgeWithoutRoute } = edge;
          return { ...edgeWithoutRoute, type };
        })
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

  /** 자동 시점 이동이 사용자 팬·줌으로 기록되지 않도록 이동이 끝날 때까지 저장을 막습니다. */
  const runViewportMoveWithoutPersistence = useCallback((move: () => Promise<boolean>): void => {
    const requestId = automaticViewportMoveRequestIdRef.current + 1;
    automaticViewportMoveRequestIdRef.current = requestId;

    if (automaticViewportReleaseFrameRef.current !== null) {
      window.cancelAnimationFrame(automaticViewportReleaseFrameRef.current);
      automaticViewportReleaseFrameRef.current = null;
    }

    /** 가장 최근 자동 이동이 끝난 경우에만 사용자 시점 저장을 다시 켭니다. */
    const releaseViewportPersistence = (): void => {
      if (automaticViewportMoveRequestIdRef.current !== requestId) {
        return;
      }

      automaticViewportReleaseFrameRef.current = window.requestAnimationFrame(() => {
        automaticViewportReleaseFrameRef.current = null;
        if (automaticViewportMoveRequestIdRef.current === requestId) {
          automaticViewportMoveRequestIdRef.current = 0;
        }
      });
    };

    void move().then(releaseViewportPersistence, releaseViewportPersistence);
  }, []);

  useEffect(
    () => () => {
      automaticViewportMoveRequestIdRef.current += 1;
      if (automaticViewportReleaseFrameRef.current !== null) {
        window.cancelAnimationFrame(automaticViewportReleaseFrameRef.current);
      }
    },
    []
  );

  const applyRequestedInitialViewport = useCallback(() => {
    if (!isFlowReady || !shouldApplySourceViewportRef.current) {
      return;
    }

    const presentation = visibleDiagram.presentation;
    shouldApplySourceViewportRef.current = false;

    if (
      presentation?.geometryPolicy !== "source-exact" ||
      presentation.sourceViewBox === undefined
    ) {
      const shouldRestoreLegacyViewport = wasSourceViewBoxViewportRef.current;
      wasSourceViewBoxViewportRef.current = false;
      setFlowMinimumZoom(0.25);
      setBoardMinimumZoom(0.25);

      if (shouldRestoreLegacyViewport) {
        runViewportMoveWithoutPersistence(() =>
          getFlowInstance().setViewport(visibleDiagram.viewport, { duration: 0 })
        );
      }

      return;
    }

    wasSourceViewBoxViewportRef.current = true;
    const frame = getCurrentBoardViewportFrame() ?? { x: 0, y: 0, width: 1, height: 1 };
    const nextDiagram = applyInitialSourceViewBoxViewport(visibleDiagram, frame);
    const viewport = nextDiagram.viewport;

    const sourceMinimumZoom = getSourceViewBoxMinimumZoom(presentation.sourceViewBox, frame);
    setFlowMinimumZoom(sourceMinimumZoom);
    setBoardMinimumZoom(sourceMinimumZoom);

    if (nextDiagram !== visibleDiagram) {
      if (previewDiagram !== null) {
        setPreviewDiagramState(nextDiagram);
      } else {
        replaceDiagram(nextDiagram);
      }
    }

    runViewportMoveWithoutPersistence(() =>
      getFlowInstance().setViewport(viewport, { duration: 0 })
    );
  }, [
    getCurrentBoardViewportFrame,
    getFlowInstance,
    isFlowReady,
    previewDiagram,
    replaceDiagram,
    runViewportMoveWithoutPersistence,
    setFlowMinimumZoom,
    visibleDiagram
  ]);

  useEffect(() => {
    if (
      !isFlowReady ||
      !shouldApplySourceViewportRef.current ||
      initialSourceViewportFrameRef.current !== null
    ) {
      return;
    }

    initialSourceViewportFrameRef.current = window.requestAnimationFrame(() => {
      initialSourceViewportFrameRef.current = null;
      applyRequestedInitialViewport();
    });

    return () => {
      if (initialSourceViewportFrameRef.current !== null) {
        window.cancelAnimationFrame(initialSourceViewportFrameRef.current);
        initialSourceViewportFrameRef.current = null;
      }
    };
  }, [applyRequestedInitialViewport, isFlowReady]);

  const handleMoveEnd = useCallback<OnMoveEnd>(
    (_event, viewport) => {
      persistViewportAfterMove(
        automaticViewportMoveRequestIdRef.current,
        viewport,
        (nextViewport) => {
          applyLiveDiagramUpdate((currentDiagram) =>
            updateDiagramViewport(currentDiagram, toDiagramViewport(nextViewport))
          );
        }
      );
    },
    [applyLiveDiagramUpdate]
  );

  const handleZoomIn = useCallback(() => {
    void getFlowInstance().zoomIn({ duration: getBoardMotionDuration(140) });
  }, [getFlowInstance]);

  const handleZoomOut = useCallback(() => {
    void getFlowInstance().zoomOut({ duration: getBoardMotionDuration(140) });
  }, [getFlowInstance]);

  /** 현재 보드를 화면 크기에 맞추고, 사용자 요청일 때만 시점 변경을 저장합니다. */
  const fitVisibleDiagram = useCallback(
    (shouldPersistViewport: boolean) => {
      const flowInstance = getFlowInstance();
      const currentNodes = previewDiagram?.nodes ?? diagramRef.current.nodes;

      if (currentNodes.length === 0) {
        setFlowMinimumZoom(0.25);
        setBoardMinimumZoom(0.25);
        const moveToDefaultViewport = () =>
          flowInstance.setViewport(DEFAULT_DIAGRAM_VIEWPORT, {
            duration: getBoardMotionDuration(180)
          });

        if (shouldPersistViewport) {
          void moveToDefaultViewport();
        } else {
          runViewportMoveWithoutPersistence(moveToDefaultViewport);
        }
        if (shouldPersistViewport) {
          applyLiveDiagramUpdate((currentDiagram) =>
            updateDiagramViewport(currentDiagram, DEFAULT_DIAGRAM_VIEWPORT)
          );
        }
        return;
      }

      const frame = getCurrentBoardViewportFrame();

      if (!frame) {
        return;
      }

      const visualBounds = getDiagramVisualBounds(currentNodes, flowEdges);
      const fitMinimumZoom = getFitViewMinimumZoom(visualBounds, frame, FIT_VIEW_PADDING);
      const viewport = offsetBoardViewportToFrame(
        getViewportForBounds(
          visualBounds,
          frame.width,
          frame.height,
          fitMinimumZoom,
          1.35,
          FIT_VIEW_PADDING
        ),
        frame
      );

      setFlowMinimumZoom(fitMinimumZoom);
      setBoardMinimumZoom(fitMinimumZoom);

      const moveToViewport = () =>
        flowInstance.setViewport(viewport, { duration: getBoardMotionDuration(180) });

      if (shouldPersistViewport) {
        void moveToViewport();
      } else {
        runViewportMoveWithoutPersistence(moveToViewport);
      }
      if (shouldPersistViewport) {
        applyLiveDiagramUpdate((currentDiagram) => updateDiagramViewport(currentDiagram, viewport));
      }
    },
    [
      applyLiveDiagramUpdate,
      flowEdges,
      getCurrentBoardViewportFrame,
      getFlowInstance,
      previewDiagram,
      runViewportMoveWithoutPersistence,
      setFlowMinimumZoom
    ]
  );

  const handleFitView = useCallback(() => {
    fitVisibleDiagram(previewDiagram === null);
  }, [fitVisibleDiagram, previewDiagram]);

  useEffect(() => {
    if (
      !isFlowReady ||
      !shouldApplyInitialBoardZoomRef.current ||
      hasSourceViewBoxViewport ||
      normalizedInitialBoardZoom === undefined ||
      diagram.nodes.length === 0
    ) {
      return;
    }

    if (initialAutoFitFrameRef.current !== null) {
      return;
    }

    initialAutoFitFrameRef.current = window.requestAnimationFrame(() => {
      initialAutoFitFrameRef.current = window.requestAnimationFrame(() => {
        initialAutoFitFrameRef.current = null;
        shouldApplyInitialBoardZoomRef.current = false;

        const frame = getCurrentBoardViewportFrame() ?? { x: 0, y: 0, width: 1, height: 1 };
        const viewport = getCenteredBoardViewport(
          getDiagramVisualBounds(previewDiagram?.nodes ?? diagramRef.current.nodes),
          frame,
          normalizedInitialBoardZoom
        );

        void reactFlow.setViewport(viewport, { duration: 0 });
      });
    });

    return () => {
      if (initialAutoFitFrameRef.current !== null) {
        window.cancelAnimationFrame(initialAutoFitFrameRef.current);
        initialAutoFitFrameRef.current = null;
      }
    };
  }, [
    diagram.nodes.length,
    getCurrentBoardViewportFrame,
    hasSourceViewBoxViewport,
    isFlowReady,
    normalizedInitialBoardZoom,
    previewDiagram,
    reactFlow
  ]);

  useLayoutEffect(() => {
    const nextFrame = getCurrentBoardViewportFrame();

    if (!nextFrame) {
      return;
    }

    const previousFrame = boardViewportFrameRef.current;
    boardViewportFrameRef.current = nextFrame;

    if (!isFlowReady || !previousFrame || areBoardViewportFramesEqual(previousFrame, nextFrame)) {
      return;
    }

    const viewport = rebaseBoardViewport(reactFlow.getViewport(), previousFrame, nextFrame);

    void reactFlow.setViewport(viewport, { duration: 0 });
    applyLiveDiagramUpdate((currentDiagram) => updateDiagramViewport(currentDiagram, viewport));
  }, [
    applyLiveDiagramUpdate,
    getCurrentBoardViewportFrame,
    isFlowReady,
    isLeftPanelOpen,
    isRightPanelOpen,
    leftPanelWidth,
    reactFlow,
    rightPanelWidth
  ]);

  useEffect(() => {
    if (
      !isFlowReady ||
      !shouldAutoFitInitialDiagramRef.current ||
      hasSourceViewBoxViewport ||
      diagram.nodes.length === 0
    ) {
      return;
    }

    if (initialAutoFitFrameRef.current !== null) {
      return;
    }

    initialAutoFitFrameRef.current = window.requestAnimationFrame(() => {
      initialAutoFitFrameRef.current = window.requestAnimationFrame(() => {
        initialAutoFitFrameRef.current = null;
        shouldAutoFitInitialDiagramRef.current = false;
        fitVisibleDiagram(false);
      });
    });

    return () => {
      if (initialAutoFitFrameRef.current !== null) {
        window.cancelAnimationFrame(initialAutoFitFrameRef.current);
        initialAutoFitFrameRef.current = null;
      }
    };
  }, [diagram.nodes.length, fitVisibleDiagram, hasSourceViewBoxViewport, isFlowReady]);

  useEffect(() => {
    if (
      !isFlowReady ||
      normalizedInitialBoardZoom !== undefined ||
      previewDiagram === null ||
      hasSourceViewBoxViewport ||
      previewDiagram.nodes.length === 0
    ) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      fitVisibleDiagram(false);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [
    fitVisibleDiagram,
    hasSourceViewBoxViewport,
    isFlowReady,
    normalizedInitialBoardZoom,
    previewDiagram
  ]);

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

      if (isProjectDraftSaveShortcut(event) && onDiagramSaveRequest) {
        event.preventDefault();
        void onDiagramSaveRequest();
        return;
      }

      const isModifierPressed = event.metaKey || event.ctrlKey;
      const key = event.key.toLocaleLowerCase();

      if ((event.key === "Backspace" || event.key === "Delete") && !isModifierPressed) {
        event.preventDefault();
        deleteSelection();
        return;
      }

      const copyShortcutResolution = resolveDiagramCopyShortcut({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        selectedNodeCount: selectedNodeIds.length,
        selectedText: window.getSelection()?.toString() ?? ""
      });

      if (copyShortcutResolution === "copy_nodes") {
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
    [
      copySelectedNodes,
      deleteSelection,
      isPreviewActive,
      onDiagramSaveRequest,
      pasteNodes,
      redo,
      selectedNodeIds,
      undo
    ]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    function restoreTemporaryPanMode(event: MouseEvent | PointerEvent): void {
      const previousMode = temporaryPanPreviousModeRef.current;
      const releaseMode = getTemporaryPanReleaseMode({
        button: event.button,
        buttons: event.buttons,
        previousMode
      });

      if (releaseMode) {
        temporaryPanPreviousModeRef.current = null;
        setInteractionMode(releaseMode);
      }
    }

    window.addEventListener("mouseup", restoreTemporaryPanMode);
    window.addEventListener("pointerup", restoreTemporaryPanMode);
    window.addEventListener("pointercancel", restoreTemporaryPanMode);

    return () => {
      window.removeEventListener("mouseup", restoreTemporaryPanMode);
      window.removeEventListener("pointerup", restoreTemporaryPanMode);
      window.removeEventListener("pointercancel", restoreTemporaryPanMode);
    };
  }, []);

  useEffect(() => {
    const compactViewport = window.matchMedia("(max-width: 1120px)");

    /** 좁은 화면에서는 Board가 먼저 보이도록 양쪽 패널을 접습니다. */
    function collapsePanelsForCompactViewport(event: MediaQueryListEvent | MediaQueryList): void {
      if (!event.matches) {
        return;
      }

      setLeftPanelOpen(false);
      setRightPanelOpen(false);
    }

    collapsePanelsForCompactViewport(compactViewport);
    compactViewport.addEventListener("change", collapsePanelsForCompactViewport);

    return () => compactViewport.removeEventListener("change", collapsePanelsForCompactViewport);
  }, []);

  useEffect(() => {
    const canvasPanel = canvasPanelRef.current;

    if (!isFlowReady || !canvasPanel || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    let fitFrame: number | null = null;

    /** 패널이 접힌 뒤 확정된 Board 크기를 기준으로 노드가 모두 보이게 맞춥니다. */
    function refitCompactBoard(): void {
      if (hasSourceViewBoxViewport || window.innerWidth > 1120) {
        return;
      }

      if (fitFrame !== null) {
        window.cancelAnimationFrame(fitFrame);
      }

      fitFrame = window.requestAnimationFrame(() => {
        fitFrame = null;
        fitVisibleDiagram(false);
      });
    }

    const canvasResizeObserver = new ResizeObserver(refitCompactBoard);
    canvasResizeObserver.observe(canvasPanel);

    return () => {
      canvasResizeObserver.disconnect();
      if (fitFrame !== null) {
        window.cancelAnimationFrame(fitFrame);
      }
    };
  }, [fitVisibleDiagram, hasSourceViewBoxViewport, isFlowReady]);

  useEffect(() => {
    let resizeFrame: number | null = null;
    let settledLayoutFrame: number | null = null;

    /** 패널 폭을 보정하고, 좁은 화면은 레이아웃이 확정된 뒤 Board를 다시 맞춥니다. */
    function handleWindowResize(): void {
      updateLeftPanelWidth(leftPanelWidth);
      updateRightPanelWidth(rightPanelWidth);

      if (!isFlowReady || hasSourceViewBoxViewport || window.innerWidth > 1120) {
        return;
      }

      if (resizeFrame !== null) {
        window.cancelAnimationFrame(resizeFrame);
      }
      if (settledLayoutFrame !== null) {
        window.cancelAnimationFrame(settledLayoutFrame);
      }

      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null;
        settledLayoutFrame = window.requestAnimationFrame(() => {
          settledLayoutFrame = null;
          fitVisibleDiagram(false);
        });
      });
    }

    window.addEventListener("resize", handleWindowResize);

    return () => {
      window.removeEventListener("resize", handleWindowResize);
      if (resizeFrame !== null) {
        window.cancelAnimationFrame(resizeFrame);
      }
      if (settledLayoutFrame !== null) {
        window.cancelAnimationFrame(settledLayoutFrame);
      }
    };
  }, [
    fitVisibleDiagram,
    hasSourceViewBoxViewport,
    isFlowReady,
    leftPanelWidth,
    rightPanelWidth,
    updateLeftPanelWidth,
    updateRightPanelWidth
  ]);

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
  const editorShellClassName = [
    styles.editorShell,
    !isLeftPanelOpen ? styles.editorShellLeftCollapsed : undefined,
    !hasRightRail ? styles.editorShellRightHidden : undefined,
    hasRightRail && !isRightPanelOpen ? styles.editorShellRightCollapsed : undefined
  ]
    .filter(Boolean)
    .join(" ");
  const canvasPanelClassName = [
    styles.canvasPanel,
    showAllEdgeLabels ? styles.canvasPanelEdgeLabelsVisible : styles.canvasPanelEdgeLabelsCompact,
    isPreviewActive ? styles.canvasPanelPreviewing : undefined,
    isAreaBlankDragging ? styles.canvasPanelAreaBlankDragging : undefined,
    isSnapAnimating ? styles.canvasPanelSnapAnimating : undefined,
    shouldShowAreaBlankMoveCursor ? styles.canvasPanelAreaBlankMoveTarget : undefined,
    shouldShowAreaBlankBlockedCursor ? styles.canvasPanelAreaBlankBlockedTarget : undefined
  ]
    .filter(Boolean)
    .join(" ");
  const canvasPanelStyle = {
    "--board-control-scale": boardZoomPresentationScale.controlScale,
    "--board-lod-label-scale": boardZoomPresentationScale.compactLabelScale
  } as CSSProperties;

  return (
    <section
      className={editorShellClassName}
      onKeyDown={handleShellKeyDown}
      ref={editorShellRef}
      style={editorShellStyle}
      tabIndex={0}
    >
      <WorkspaceProjectBar
        actions={{
          onSave: onDiagramSaveRequest,
          onSaveAndDeploy: onSaveAndDeployRequest,
          onToggleLeftPanel: toggleLeftPanel,
          onToggleRightPanel: toggleRightPanel
        }}
        panels={{
          hasRightPanel: hasRightRail,
          isLeftPanelOpen,
          isRightPanelOpen: hasRightRail && isRightPanelOpen
        }}
        workspace={{
          dashboardHref,
          isDeploymentConsoleOpen,
          projectName,
          saveStatus,
          showSaveAction,
          userName: workspaceUserName
        }}
      />

      {isLeftPanelOpen ? (
        <div className={styles.leftRail} ref={leftRailRef}>
          {leftPanel === undefined ? (
            <ResourceSettingsPanel
              onCollapse={() => setLeftPanelOpen(false)}
              onModuleAdd={addCuratedModule}
              onTemplateApply={applyBoardTemplate}
            />
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
      ) : null}

      <div className={styles.workspace}>
        <header className={styles.canvasToolbar}>
          <div className={styles.toolbarGroup} aria-label="편집 도구">
            <button
              aria-label="선택 모드"
              aria-pressed={interactionMode === "select"}
              className={
                interactionMode === "select" ? styles.iconButtonSelected : styles.iconButton
              }
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
            <button
              aria-label="영역 자동 확장"
              aria-pressed={autoExpandAreasEnabled}
              className={autoExpandAreasEnabled ? styles.iconButtonSelected : styles.iconButton}
              onClick={toggleAutoExpandAreas}
              title={autoExpandAreasEnabled ? "영역 자동 확장 켜짐" : "영역 자동 확장 꺼짐"}
              type="button"
            >
              <Expand aria-hidden="true" size={16} />
            </button>
          </div>

          <div className={styles.toolbarGroup} aria-label="History">
            <button
              aria-label="Architecture Board 자동 정리 미리보기"
              className={styles.iconButton}
              disabled={isPreviewActive || diagram.nodes.length === 0}
              onClick={previewAutomaticOrganization}
              title="자동 정리"
              type="button"
            >
              <Sparkles aria-hidden="true" size={16} />
            </button>
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
            <button
              aria-label="Zoom in"
              className={styles.iconButton}
              onClick={handleZoomIn}
              title="Zoom in"
              type="button"
            >
              <ZoomIn aria-hidden="true" size={16} />
            </button>
            <button
              aria-label="Zoom out"
              className={styles.iconButton}
              onClick={handleZoomOut}
              title="Zoom out"
              type="button"
            >
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
        </header>

        {draftStatusPanel ? (
          <div className={styles.draftStatusPanelSlot}>{draftStatusPanel}</div>
        ) : null}

        {compilerPreviewSummary ? (
          <section
            aria-label="자동 정리 미리보기"
            className={`${styles.previewNotice} ${styles.compilerPreviewNotice}`}
          >
            <div className={styles.compilerPreviewHeader}>
              <div>
                <strong>자동 정리 미리보기</strong>
                <span>
                  점수 {formatCompilerScore(compilerPreviewSummary.quality.beforeScore)} →{" "}
                  {formatCompilerScore(compilerPreviewSummary.quality.afterScore)} · 거리{" "}
                  {formatCompilerScore(compilerPreviewSummary.quality.compilationDistance)}
                </span>
              </div>
              <div className={styles.compilerPreviewActions}>
                <button onClick={cancelAutomaticOrganization} type="button">
                  취소
                </button>
                <button onClick={applyAutomaticOrganization} type="button">
                  적용
                </button>
              </div>
            </div>

            <div className={styles.compilerPreviewDetails}>
              <CompilerPreviewDetail
                emptyLabel="변경 없음"
                items={compilerPreviewSummary.changeGroups.map(({ count, label }) => `${label} ${count}`)}
                label="변경"
              />
              <CompilerPreviewDetail
                emptyLabel="진단 없음"
                items={compilerPreviewSummary.diagnosticGroups.map(({ count, label }) => `${label} ${count}`)}
                label="진단"
              />
              <CompilerPreviewDetail
                emptyLabel="일반 규칙"
                items={compilerPreviewSummary.referenceTemplateIds}
                label="근거"
                title={[
                  `후보 ${compilerPreviewSummary.candidateId}`,
                  `Compiler ${compilerPreviewSummary.compilerVersion}`
                ].join(" · ")}
              />
            </div>

            {compilerPreviewSummary.diagnosticSummaries.length > 0 ? (
              <p className={styles.compilerPreviewDiagnostic}>
                {compilerPreviewSummary.diagnosticSummaries.slice(0, 2).join(" · ")}
                {compilerPreviewSummary.diagnosticSummaries.length > 2
                  ? ` 외 ${compilerPreviewSummary.diagnosticSummaries.length - 2}`
                  : ""}
              </p>
            ) : null}
          </section>
        ) : isPreviewActive ? (
          <div className={styles.previewNotice} role="status">
            미리보기입니다. 전용 시작 패널에서 적용 또는 취소를 선택하세요.
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
          style={canvasPanelStyle}
        >
          {selectedEdge ? (
            <DiagramEdgeToolbar
              edge={selectedEdge}
              key={selectedEdge.id}
              onDelete={deleteEdge}
              onStyleChange={updateEdgeStyle}
              onTypeChange={updateEdgeType}
            />
          ) : null}

          {visibleDiagram.nodes.length === 0 ? (
            <div className={styles.emptyState} aria-hidden="true">
              <strong>빈 보드</strong>
              <span>{emptyBoardDescription}</span>
            </div>
          ) : null}

          <ReactFlow<DiagramFlowNode, DiagramFlowEdge>
            data-architecture-board-capture-source="true"
            connectOnClick={true}
            connectionMode={ConnectionMode.Loose}
            connectionRadius={28 * boardZoomPresentationScale.controlScale}
            defaultViewport={DEFAULT_DIAGRAM_VIEWPORT}
            deleteKeyCode={null}
            edgeTypes={EDGE_TYPES}
            edges={flowEdges}
            elementsSelectable={!isPreviewActive || allowPreviewInspection}
            elevateNodesOnSelect={visibleDiagram.presentation?.geometryPolicy !== "source-exact"}
            maxZoom={2}
            minZoom={boardMinimumZoom}
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
            {...(!isPreviewActive || allowPreviewInspection
              ? { onNodeClick: handleFlowNodeClick }
              : {})}
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
            <Background
              id="board-grid-major"
              color="rgba(101, 116, 139, 0.18)"
              gap={80}
              size={1.15}
              variant={BackgroundVariant.Dots}
            />
            <Background
              id="board-grid-minor"
              color="rgba(101, 116, 139, 0.1)"
              gap={16}
              size={0.8}
              variant={BackgroundVariant.Dots}
            />
          </ReactFlow>
        </div>
      </div>

      {hasRightRail ? (
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
            <ParameterInputPanel
              key={panelContext.selectedNodeId ?? "no-selection"}
              {...panelContext}
            />
          ) : (
            rightPanel(panelContext)
          )}
        </div>
      ) : null}

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

  return Number.isFinite(storedWidth)
    ? clampRightPanelWidth(storedWidth)
    : DEFAULT_RIGHT_PANEL_WIDTH;
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

  const viewportLimitedMaxWidth = Math.max(
    MIN_LEFT_PANEL_WIDTH,
    window.innerWidth - MIN_WORKSPACE_WIDTH
  );
  return clamp(
    width,
    MIN_LEFT_PANEL_WIDTH,
    Math.min(MAX_LEFT_PANEL_WIDTH, viewportLimitedMaxWidth)
  );
}

function clampRightPanelWidth(width: number): number {
  if (typeof window === "undefined") {
    return clamp(width, MIN_RIGHT_PANEL_WIDTH, MAX_RIGHT_PANEL_WIDTH);
  }

  const viewportLimitedMaxWidth = Math.max(
    MIN_RIGHT_PANEL_WIDTH,
    window.innerWidth - MIN_WORKSPACE_WIDTH
  );
  return clamp(
    width,
    MIN_RIGHT_PANEL_WIDTH,
    Math.min(MAX_RIGHT_PANEL_WIDTH, viewportLimitedMaxWidth)
  );
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

function getValidInitialSelectedEdgeIds(
  edges: readonly DiagramEdge[],
  initialSelectedEdgeIds: readonly string[] | undefined
): string[] {
  const edgeIds = new Set(edges.map((edge) => edge.id));

  return (initialSelectedEdgeIds ?? []).filter((edgeId) => edgeIds.has(edgeId));
}

function getValidInitialAreaDropTargetNodeId(
  nodes: readonly DiagramNode[],
  initialReferenceDropTargetNodeId: string | undefined
): string | null {
  return initialReferenceDropTargetNodeId &&
    nodes.some((node) => node.id === initialReferenceDropTargetNodeId && isAreaNode(node))
    ? initialReferenceDropTargetNodeId
    : null;
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

function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLocaleLowerCase();

  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  );
}

function toDiagramViewport(viewport: Viewport): DiagramJson["viewport"] {
  return {
    x: viewport.x,
    y: viewport.y,
    zoom: viewport.zoom
  };
}
