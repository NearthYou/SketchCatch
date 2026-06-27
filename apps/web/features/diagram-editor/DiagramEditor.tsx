"use client";

import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  ReactFlow,
  ReactFlowProvider,
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
  Maximize2,
  MousePointer2,
  Move,
  Redo2,
  Save,
  Undo2,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import type { DiagramEdge, DiagramJson, DiagramNode } from "../../../../packages/types/src";

import { ParameterInputPanel } from "../parameter-input";
import { ResourceSettingsPanel } from "../resource-settings";
import { DEFAULT_DIAGRAM_VIEWPORT, EMPTY_DIAGRAM } from "./constants";
import { DiagramEdgeToolbar } from "./DiagramEdgeToolbar";
import { DiagramNodeView } from "./DiagramNodeView";
import {
  applyNodeMetadataUpdate,
  applyNodeParametersUpdate,
  areDiagramsEqual,
  cloneDiagram,
  createDiagramEdge,
  createDiagramNodeFromPayload,
  createPastedNodes,
  getDefaultViewport,
  getNextZIndex,
  parseResourceDragPayload,
  removeEdgesFromDiagram,
  removeNodesFromDiagram,
  updateDiagramViewport,
  updateNodeById
} from "./diagram-utils";
import { toFlowEdges, toFlowNodes } from "./flow-mappers";
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

export function DiagramEditor(props: DiagramEditorProps) {
  return (
    <ReactFlowProvider>
      <DiagramEditorInner {...props} />
    </ReactFlowProvider>
  );
}

function DiagramEditorInner({
  initialDiagram,
  leftPanel,
  onDiagramChange,
  onSave,
  rightPanel,
  saveDisabled = false,
  saveStatus = "로컬 편집 중"
}: DiagramEditorProps) {
  const reactFlow = useReactFlow<DiagramFlowNode, DiagramFlowEdge>();
  const [diagram, setDiagram] = useState<DiagramJson>(() => cloneDiagram(initialDiagram ?? EMPTY_DIAGRAM));
  const diagramRef = useRef(diagram);
  const [history, setHistory] = useState<DiagramHistoryState>({ past: [], future: [] });
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
  const [interactionMode, setInteractionMode] = useState<"select" | "pan">("select");
  const clipboardRef = useRef<DiagramNode[]>([]);
  const canvasPanelRef = useRef<HTMLDivElement | null>(null);
  const dragSnapshotRef = useRef<DiagramJson | null>(null);
  const editorShellRef = useRef<HTMLElement | null>(null);
  const resizeSnapshotRef = useRef<DiagramJson | null>(null);
  const flowInstanceRef = useRef<ReactFlowInstance<DiagramFlowNode, DiagramFlowEdge> | null>(null);
  const connectStartNodeIdRef = useRef<string | null>(null);

  const selectedNodeId = selectedNodeIds.length === 1 ? selectedNodeIds[0] ?? null : null;
  const selectedEdge = selectedEdgeIds.length === 1
    ? diagram.edges.find((edge) => edge.id === selectedEdgeIds[0]) ?? null
    : null;

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

  useEffect(() => {
    const nextDiagram = cloneDiagram(initialDiagram ?? EMPTY_DIAGRAM);
    replaceDiagram(nextDiagram, false);
    setHistory({ past: [], future: [] });
    setSelectedNodeIds([]);
    setSelectedEdgeIds([]);
  }, [initialDiagram, replaceDiagram]);

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

  const undo = useCallback(() => {
    setHistory((currentHistory) => {
      const previous = currentHistory.past.at(-1);

      if (!previous) {
        return currentHistory;
      }

      const currentDiagram = diagramRef.current;
      replaceDiagram(cloneDiagram(previous));
      setSelectedNodeIds([]);
      setSelectedEdgeIds([]);

      return {
        past: currentHistory.past.slice(0, -1),
        future: [cloneDiagram(currentDiagram), ...currentHistory.future]
      };
    });
  }, [replaceDiagram]);

  const redo = useCallback(() => {
    setHistory((currentHistory) => {
      const next = currentHistory.future[0];

      if (!next) {
        return currentHistory;
      }

      const currentDiagram = diagramRef.current;
      replaceDiagram(cloneDiagram(next));
      setSelectedNodeIds([]);
      setSelectedEdgeIds([]);

      return {
        past: [...currentHistory.past, cloneDiagram(currentDiagram)].slice(-MAX_HISTORY_ITEMS),
        future: currentHistory.future.slice(1)
      };
    });
  }, [replaceDiagram]);

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
        nodes: updateNodeById(currentDiagram.nodes, nodeId, (node) => {
          const nextNode = applyNodeParametersUpdate(node, update);
          const nextResourceName = nextNode.parameters?.resourceName.trim();

          if (!nextResourceName || nextResourceName === node.parameters?.resourceName) {
            return nextNode;
          }

          return {
            ...nextNode,
            label: nextResourceName
          };
        })
      }));
    },
    [commitDiagramUpdate]
  );

  const applyDiagramJson = useCallback<DiagramEditorPanelContext["applyDiagramJson"]>(
    (nextDiagram) => {
      commitDiagramUpdate(() => cloneDiagram(nextDiagram));
      setSelectedNodeIds([]);
      setSelectedEdgeIds([]);
    },
    [commitDiagramUpdate]
  );

  const panelContext = useMemo<DiagramEditorPanelContext>(
    () => ({
      diagram,
      selectedNodeId,
      nodes: diagram.nodes,
      edges: diagram.edges,
      applyDiagramJson,
      updateNodeParameters,
      updateNodeMetadata
    }),
    [applyDiagramJson, diagram, selectedNodeId, updateNodeMetadata, updateNodeParameters]
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
    resizeSnapshotRef.current = cloneDiagram(diagramRef.current);
  }, []);

  const handleResize = useCallback(
    (nodeId: string, size: DiagramNode["size"]) => {
      applyLiveDiagramUpdate((currentDiagram) => ({
        ...currentDiagram,
        nodes: updateNodeById(currentDiagram.nodes, nodeId, (node) => ({
          ...node,
          size
        }))
      }));
    },
    [applyLiveDiagramUpdate]
  );

  const handleResizeEnd = useCallback(
    (nodeId: string, size: DiagramNode["size"]) => {
      const before = resizeSnapshotRef.current;
      const after = {
        ...diagramRef.current,
        nodes: updateNodeById(diagramRef.current.nodes, nodeId, (node) => ({
          ...node,
          size
        }))
      };

      replaceDiagram(after);

      if (before) {
        pushHistory(before, after);
      }

      resizeSnapshotRef.current = null;
    },
    [pushHistory, replaceDiagram]
  );

  const flowNodes = useMemo(
    () =>
      toFlowNodes(diagram.nodes, selectedNodeIds, {
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
      diagram.nodes,
      handleBorderColorChange,
      handleBringForward,
      handleResizeEnd,
      handleResize,
      handleResizeStart,
      handleSendBackward,
      handleTextColorChange,
      handleToggleLock,
      selectedNodeIds
    ]
  );

  const flowEdges = useMemo(() => toFlowEdges(diagram.edges, selectedEdgeIds), [diagram.edges, selectedEdgeIds]);

  const handleInit = useCallback<OnInit<DiagramFlowNode, DiagramFlowEdge>>((instance) => {
    flowInstanceRef.current = instance;
  }, []);

  const handleNodesChange = useCallback<OnNodesChange<DiagramFlowNode>>(
    (changes) => {
      const nextSelectedNodeIds = applySelectionChanges(selectedNodeIds, changes);
      const positionChanges = changes.filter(isNodePositionChangeWithPosition);

      if (nextSelectedNodeIds) {
        setSelectedNodeIds(nextSelectedNodeIds);
      }

      if (positionChanges.length === 0) {
        return;
      }

      applyLiveDiagramUpdate((currentDiagram) => ({
        ...currentDiagram,
        nodes: currentDiagram.nodes.map((node) => {
          const positionChange = positionChanges.find((change) => change.id === node.id);

          return {
            ...node,
            ...(positionChange
              ? {
                  position: {
                    x: positionChange.position.x,
                    y: positionChange.position.y
                  }
                }
              : {})
          };
        })
      }));
    },
    [applyLiveDiagramUpdate, selectedNodeIds]
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
      setSelectedNodeIds(nodes.map((node) => node.id));
      setSelectedEdgeIds(edges.map((edge) => edge.id));

      if (nodes.length > 0 || edges.length > 0) {
        focusEditorShell();
      }
    },
    [focusEditorShell]
  );

  const handleNodeDragStart = useCallback(() => {
    dragSnapshotRef.current = cloneDiagram(diagramRef.current);
  }, []);

  const handleNodeDragStop = useCallback(
    (_event: MouseEvent | TouchEvent, _node: DiagramFlowNode, nodes: DiagramFlowNode[]) => {
      const before = dragSnapshotRef.current;
      const positionByNodeId = new Map(nodes.map((node) => [node.id, node.position]));
      const after = {
        ...diagramRef.current,
        nodes: diagramRef.current.nodes.map((node) => {
          const position = positionByNodeId.get(node.id);

          return position ? { ...node, position: { ...position } } : node;
        })
      };

      replaceDiagram(after);

      if (before) {
        pushHistory(before, after);
      }

      dragSnapshotRef.current = null;
    },
    [pushHistory, replaceDiagram]
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

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();

      const payload = parseResourceDragPayload(event.dataTransfer);

      if (!payload) {
        return;
      }

      const position = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY
      });

      const nextNode = createDiagramNodeFromPayload(payload, position, getNextZIndex(diagramRef.current.nodes));

      commitDiagramUpdate((currentDiagram) => ({
        ...currentDiagram,
        nodes: [...currentDiagram.nodes, nextNode]
      }));
      setSelectedNodeIds([nextNode.id]);
      setSelectedEdgeIds([]);
      focusEditorShell();
    },
    [commitDiagramUpdate, focusEditorShell, reactFlow]
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const deleteSelection = useCallback(() => {
    const nodeIds = selectedNodeIds;
    const edgeIds = selectedEdgeIds;

    if (nodeIds.length === 0 && edgeIds.length === 0) {
      return;
    }

    commitDiagramUpdate((currentDiagram) =>
      removeEdgesFromDiagram(removeNodesFromDiagram(currentDiagram, nodeIds), edgeIds)
    );
    setSelectedNodeIds([]);
    setSelectedEdgeIds([]);
  }, [commitDiagramUpdate, selectedEdgeIds, selectedNodeIds]);

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

    const pastedNodes = createPastedNodes(clipboardRef.current, diagramRef.current.nodes);

    commitDiagramUpdate((currentDiagram) => ({
      ...currentDiagram,
      nodes: [...currentDiagram.nodes, ...pastedNodes]
    }));
    setSelectedNodeIds(pastedNodes.map((node) => node.id));
    setSelectedEdgeIds([]);
  }, [commitDiagramUpdate]);

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
    const currentNodes = diagramRef.current.nodes;

    if (currentNodes.length === 0) {
      void reactFlow.setViewport(DEFAULT_DIAGRAM_VIEWPORT, { duration: 180 });
      applyLiveDiagramUpdate((currentDiagram) => updateDiagramViewport(currentDiagram, DEFAULT_DIAGRAM_VIEWPORT));
      return;
    }

    const canvasBounds = canvasPanelRef.current?.getBoundingClientRect();

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

    const viewport = getViewportForBounds(
      getDiagramBounds(currentNodes),
      canvasBounds.width,
      canvasBounds.height,
      0.25,
      1.35,
      0.24
    );

    void reactFlow.setViewport(viewport, { duration: 180 });
    applyLiveDiagramUpdate((currentDiagram) => updateDiagramViewport(currentDiagram, viewport));
  }, [applyLiveDiagramUpdate, reactFlow]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
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
    [copySelectedNodes, deleteSelection, pasteNodes, redo, undo]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  function handleShellKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      setSelectedNodeIds([]);
      setSelectedEdgeIds([]);
    }
  }

  return (
    <section
      className={styles.editorShell}
      onKeyDown={handleShellKeyDown}
      ref={editorShellRef}
      tabIndex={0}
    >
      <div className={styles.leftRail}>{leftPanel === undefined ? <ResourceSettingsPanel /> : leftPanel}</div>

      <div className={styles.workspace}>
        <header className={styles.canvasToolbar}>
          <div className={styles.toolbarBrand}>
            <span className={styles.toolbarTitle}>Architecture board</span>
            <span className={styles.toolbarMeta}>Terraform draft</span>
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

          <div className={styles.toolbarGroup} aria-label="히스토리">
            <button
              aria-label="뒤로가기"
              className={styles.iconButton}
              disabled={history.past.length === 0}
              onClick={undo}
              title="뒤로가기"
              type="button"
            >
              <Undo2 aria-hidden="true" size={16} />
            </button>
            <button
              aria-label="앞으로가기"
              className={styles.iconButton}
              disabled={history.future.length === 0}
              onClick={redo}
              title="앞으로가기"
              type="button"
            >
              <Redo2 aria-hidden="true" size={16} />
            </button>
          </div>

          <div className={styles.toolbarGroup} aria-label="뷰포트">
            <button aria-label="줌인" className={styles.iconButton} onClick={handleZoomIn} title="줌인" type="button">
              <ZoomIn aria-hidden="true" size={16} />
            </button>
            <button aria-label="줌아웃" className={styles.iconButton} onClick={handleZoomOut} title="줌아웃" type="button">
              <ZoomOut aria-hidden="true" size={16} />
            </button>
            <button
              aria-label="화면에 맞추기"
              className={styles.iconButton}
              onClick={handleFitView}
              title="화면에 맞추기"
              type="button"
            >
              <Maximize2 aria-hidden="true" size={16} />
            </button>
          </div>

          <div className={styles.toolbarStatus}>
            <span>{diagram.nodes.length} nodes</span>
            <span>{diagram.edges.length} edges</span>
            <span>{saveStatus}</span>
          </div>
          {onSave ? (
            <button
              aria-label="저장"
              className={styles.iconButton}
              disabled={saveDisabled}
              onClick={onSave}
              title="저장"
              type="button"
            >
              <Save aria-hidden="true" size={16} />
            </button>
          ) : null}
        </header>

        <div className={styles.canvasPanel} ref={canvasPanelRef}>
          {selectedEdge ? (
            <DiagramEdgeToolbar
              edge={selectedEdge}
              onDelete={deleteEdge}
              onStyleChange={updateEdgeStyle}
              onTypeChange={updateEdgeType}
            />
          ) : null}

          {diagram.nodes.length === 0 ? (
            <div className={styles.emptyState} aria-hidden="true">
              <strong>빈 다이어그램</strong>
              <span>왼쪽 항목을 캔버스로 드롭하세요.</span>
            </div>
          ) : null}

          <ReactFlow
            connectionMode={ConnectionMode.Loose}
            defaultViewport={DEFAULT_DIAGRAM_VIEWPORT}
            deleteKeyCode={null}
            edges={flowEdges}
            maxZoom={2}
            minZoom={0.25}
            multiSelectionKeyCode={["Shift", "Meta", "Control"]}
            nodeTypes={NODE_TYPES}
            nodes={flowNodes}
            onClickConnectEnd={handleConnectEnd}
            onClickConnectStart={handleConnectStart}
            onConnect={handleConnect}
            onConnectEnd={handleConnectEnd}
            onConnectStart={handleConnectStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onEdgesChange={handleEdgesChange}
            onInit={handleInit}
            onMoveEnd={handleMoveEnd}
            onNodeClick={() => focusEditorShell()}
            onNodeDragStart={handleNodeDragStart}
            onNodeDragStop={handleNodeDragStop}
            onNodesChange={handleNodesChange}
            onPaneClick={focusEditorShell}
            onSelectionChange={handleSelectionChange}
            panOnDrag={interactionMode === "pan"}
            selectionKeyCode={["Shift", "Meta", "Control"]}
            selectionOnDrag={interactionMode === "select"}
            snapGrid={[12, 12]}
            snapToGrid
          >
            <Background color="#d8e0ef" gap={24} size={1} variant={BackgroundVariant.Lines} />
          </ReactFlow>
        </div>
      </div>

      <div className={styles.rightRail}>
        {rightPanel === undefined ? <ParameterInputPanel {...panelContext} /> : rightPanel(panelContext)}
      </div>
    </section>
  );
}

function isNodePositionChangeWithPosition(
  change: NodeChange<DiagramFlowNode>
): change is NodePositionChange & { position: NonNullable<NodePositionChange["position"]> } {
  return change.type === "position" && Boolean(change.position);
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
