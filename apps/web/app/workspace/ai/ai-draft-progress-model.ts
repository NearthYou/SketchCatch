import type {
  ArchitectureDraftCandidateExclusion,
  ArchitectureDraftProgressSnapshot,
  ArchitectureJson,
  DiagramJson,
  ResourceType
} from "@sketchcatch/types";
import { convertArchitectureJsonToDiagramJson } from "../../../features/workspace/workspace-ai-diagram-adapter";

type ArchitectureNode = ArchitectureJson["nodes"][number];

export type DraftProgressHistoryEntry = {
  readonly kind: "added" | "removed";
  readonly candidateId: string;
  readonly resourceType: ResourceType;
  readonly label: string;
};

export type DraftProgressDifference = {
  readonly added: number;
  readonly removed: number;
};

export type DraftProgressStatus = "idle" | "streaming" | "awaiting_input" | "interrupted";
export type DraftProgressMobilePane = "conversation" | "progress";
export type DraftProgressMobileEvent = "snapshot_received" | "awaiting_input";

export type DraftProgressState = {
  readonly requestSnapshot: ArchitectureDraftProgressSnapshot | null;
  readonly serverSnapshot: ArchitectureDraftProgressSnapshot | null;
  readonly visibleSnapshot: ArchitectureDraftProgressSnapshot | null;
  readonly status: DraftProgressStatus;
  readonly history: readonly DraftProgressHistoryEntry[];
};

export function createDraftProgressState(): DraftProgressState {
  return {
    requestSnapshot: null,
    serverSnapshot: null,
    visibleSnapshot: null,
    status: "idle",
    history: []
  };
}

export function startDraftProgressRequest(current: DraftProgressState): DraftProgressState {
  return {
    ...current,
    requestSnapshot: null,
    status: "streaming"
  };
}

export function receiveDraftProgressSnapshot(
  current: DraftProgressState,
  incoming: ArchitectureDraftProgressSnapshot,
  exclusions: readonly ArchitectureDraftCandidateExclusion[]
): DraftProgressState {
  const requestSnapshot = acceptProgressSnapshot(current.requestSnapshot, incoming);
  if (requestSnapshot === current.requestSnapshot) {
    return current;
  }

  const serverSnapshot = preserveDraftProgressProjection(
    current.serverSnapshot,
    requestSnapshot
  );
  const visibleSnapshot = applyProgressCandidateExclusions(serverSnapshot, exclusions);

  return {
    requestSnapshot,
    serverSnapshot,
    visibleSnapshot,
    status: "streaming",
    history: appendDraftProgressHistory(current, visibleSnapshot)
  };
}

export function projectDraftProgressExclusions(
  current: DraftProgressState,
  exclusions: readonly ArchitectureDraftCandidateExclusion[]
): DraftProgressState {
  if (current.serverSnapshot === null) {
    return current;
  }

  const visibleSnapshot = applyProgressCandidateExclusions(current.serverSnapshot, exclusions);
  return {
    ...current,
    visibleSnapshot,
    history: appendDraftProgressHistory(current, visibleSnapshot)
  };
}

export function interruptDraftProgress(current: DraftProgressState): DraftProgressState {
  return { ...current, status: "interrupted" };
}

export function awaitDraftProgressInput(current: DraftProgressState): DraftProgressState {
  return { ...current, status: "awaiting_input" };
}

export function resolveDraftProgressMobilePane(
  current: DraftProgressMobilePane,
  event: DraftProgressMobileEvent,
  hasUserSelection: boolean
): DraftProgressMobilePane {
  if (hasUserSelection) {
    return current;
  }

  return event === "awaiting_input" ? "conversation" : "progress";
}

export function getDraftProgressPlaceholder(status: DraftProgressStatus): {
  readonly busy: boolean;
  readonly message: string;
} {
  if (status === "streaming") {
    return { busy: true, message: "Resource 후보를 구조화하고 있습니다." };
  }
  if (status === "awaiting_input") {
    return { busy: false, message: "대화에서 추가 답변을 기다리고 있습니다." };
  }
  if (status === "interrupted") {
    return { busy: false, message: "업데이트가 중단됐습니다. 다시 시도할 수 있습니다." };
  }
  return { busy: false, message: "초안 생성을 시작할 준비가 됐습니다." };
}

export function completeDraftProgress(
  current: DraftProgressState,
  finalArchitectureJson: ArchitectureJson
): {
  readonly difference: DraftProgressDifference | null;
  readonly state: DraftProgressState;
} {
  return {
    difference:
      current.visibleSnapshot === null
        ? null
        : computeDraftProgressDifference(current.visibleSnapshot, finalArchitectureJson),
    state: createDraftProgressState()
  };
}

export function acceptProgressSnapshot(
  current: ArchitectureDraftProgressSnapshot | null,
  incoming: ArchitectureDraftProgressSnapshot
): ArchitectureDraftProgressSnapshot {
  return current !== null && incoming.sequence <= current.sequence ? current : incoming;
}

export function preserveDraftProgressProjection(
  previous: ArchitectureDraftProgressSnapshot | null,
  incoming: ArchitectureDraftProgressSnapshot
): ArchitectureDraftProgressSnapshot {
  if (
    previous === null ||
    previous.provisionalArchitectureJson === null ||
    incoming.stage !== "preparing_requirements" ||
    incoming.provisionalArchitectureJson !== null
  ) {
    return incoming;
  }

  return {
    ...incoming,
    provisionalArchitectureJson: previous.provisionalArchitectureJson,
    excludableCandidateIds: previous.excludableCandidateIds
  };
}

export function excludeProgressCandidate(
  snapshot: ArchitectureDraftProgressSnapshot,
  exclusion: ArchitectureDraftCandidateExclusion
): ArchitectureDraftProgressSnapshot {
  return applyProgressCandidateExclusions(snapshot, [exclusion]);
}

export function undoProgressCandidate(
  serverSnapshot: ArchitectureDraftProgressSnapshot,
  remainingExclusions: readonly ArchitectureDraftCandidateExclusion[]
): ArchitectureDraftProgressSnapshot {
  return applyProgressCandidateExclusions(serverSnapshot, remainingExclusions);
}

export function applyProgressCandidateExclusions(
  snapshot: ArchitectureDraftProgressSnapshot,
  exclusions: readonly ArchitectureDraftCandidateExclusion[]
): ArchitectureDraftProgressSnapshot {
  const architectureJson = snapshot.provisionalArchitectureJson;
  if (architectureJson === null || exclusions.length === 0) {
    return snapshot;
  }

  const excludedIds = new Set(exclusions.map(({ candidateId }) => candidateId));
  const excludedTypes = new Set(exclusions.map(({ resourceType }) => resourceType));
  const nodes = architectureJson.nodes.filter(
    (node) => !excludedIds.has(node.id) && !excludedTypes.has(node.type)
  );
  const nodeIds = new Set(nodes.map(({ id }) => id));
  const edges = architectureJson.edges.filter(
    ({ sourceId, targetId }) => nodeIds.has(sourceId) && nodeIds.has(targetId)
  );

  return {
    ...snapshot,
    provisionalArchitectureJson: { nodes, edges },
    excludableCandidateIds: snapshot.excludableCandidateIds.filter((id) => nodeIds.has(id))
  };
}

export function createDraftProgressHistory(
  previous: ArchitectureDraftProgressSnapshot | null,
  current: ArchitectureDraftProgressSnapshot
): DraftProgressHistoryEntry[] {
  const previousNodes = previous?.provisionalArchitectureJson?.nodes ?? [];
  const currentNodes = current.provisionalArchitectureJson?.nodes ?? [];
  const previousIdentities = new Set(previousNodes.map(createNodeIdentity));
  const currentIdentities = new Set(currentNodes.map(createNodeIdentity));

  return [
    ...previousNodes
      .filter((node) => !currentIdentities.has(createNodeIdentity(node)))
      .map((node) => createHistoryEntry("removed", node)),
    ...currentNodes
      .filter((node) => !previousIdentities.has(createNodeIdentity(node)))
      .map((node) => createHistoryEntry("added", node))
  ];
}

export function computeDraftProgressDifference(
  progress: ArchitectureDraftProgressSnapshot | null,
  finalArchitectureJson: ArchitectureJson
): DraftProgressDifference {
  const progressCounts = countNodeIdentities(progress?.provisionalArchitectureJson?.nodes ?? []);
  const finalCounts = countNodeIdentities(finalArchitectureJson.nodes);
  const identities = new Set([...progressCounts.keys(), ...finalCounts.keys()]);
  let added = 0;
  let removed = 0;

  for (const identity of identities) {
    const progressCount = progressCounts.get(identity) ?? 0;
    const finalCount = finalCounts.get(identity) ?? 0;
    added += Math.max(0, finalCount - progressCount);
    removed += Math.max(0, progressCount - finalCount);
  }

  return { added, removed };
}

export function createProgressDiagram(
  snapshot: ArchitectureDraftProgressSnapshot | null
): DiagramJson | null {
  return snapshot?.provisionalArchitectureJson
    ? convertArchitectureJsonToDiagramJson(snapshot.provisionalArchitectureJson)
    : null;
}

function createHistoryEntry(
  kind: DraftProgressHistoryEntry["kind"],
  node: ArchitectureNode
): DraftProgressHistoryEntry {
  return {
    kind,
    candidateId: node.id,
    resourceType: node.type,
    label: readNodeLabel(node)
  };
}

function createNodeIdentity(node: ArchitectureNode): string {
  return `${node.type}\u0000${readNodeLabel(node)}`;
}

function readNodeLabel(node: ArchitectureNode): string {
  return node.label?.trim() || node.type;
}

function countNodeIdentities(nodes: readonly ArchitectureNode[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const node of nodes) {
    const identity = createNodeIdentity(node);
    counts.set(identity, (counts.get(identity) ?? 0) + 1);
  }
  return counts;
}

function appendDraftProgressHistory(
  current: DraftProgressState,
  visibleSnapshot: ArchitectureDraftProgressSnapshot
): DraftProgressHistoryEntry[] {
  return [
    ...current.history,
    ...createDraftProgressHistory(current.visibleSnapshot, visibleSnapshot)
  ].slice(-8);
}
