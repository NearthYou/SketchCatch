import type {
  ArchitectureDraftCandidateExclusion,
  ArchitectureDraftProgressSnapshot
} from "@sketchcatch/types";

export type DraftProgressStatus = "idle" | "streaming" | "awaiting_input" | "interrupted";

export type DraftProgressState = {
  readonly requestSnapshot: ArchitectureDraftProgressSnapshot | null;
  readonly serverSnapshot: ArchitectureDraftProgressSnapshot | null;
  readonly visibleSnapshot: ArchitectureDraftProgressSnapshot | null;
  readonly status: DraftProgressStatus;
};

export function createDraftProgressState(): DraftProgressState {
  return {
    requestSnapshot: null,
    serverSnapshot: null,
    visibleSnapshot: null,
    status: "idle"
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

  return {
    requestSnapshot,
    serverSnapshot: requestSnapshot,
    visibleSnapshot: applyProgressCandidateExclusions(requestSnapshot, exclusions),
    status: "streaming"
  };
}

export function projectDraftProgressExclusions(
  current: DraftProgressState,
  exclusions: readonly ArchitectureDraftCandidateExclusion[]
): DraftProgressState {
  if (current.serverSnapshot === null) {
    return current;
  }

  return {
    ...current,
    visibleSnapshot: applyProgressCandidateExclusions(current.serverSnapshot, exclusions)
  };
}

export function interruptDraftProgress(current: DraftProgressState): DraftProgressState {
  return { ...current, status: "interrupted" };
}

export function awaitDraftProgressInput(current: DraftProgressState): DraftProgressState {
  return { ...current, status: "awaiting_input" };
}

export function completeDraftProgress(): DraftProgressState {
  return createDraftProgressState();
}

export function acceptProgressSnapshot(
  current: ArchitectureDraftProgressSnapshot | null,
  incoming: ArchitectureDraftProgressSnapshot
): ArchitectureDraftProgressSnapshot {
  return current !== null && incoming.sequence <= current.sequence ? current : incoming;
}

export function applyProgressCandidateExclusions(
  snapshot: ArchitectureDraftProgressSnapshot,
  exclusions: readonly ArchitectureDraftCandidateExclusion[]
): ArchitectureDraftProgressSnapshot {
  if (exclusions.length === 0) {
    return snapshot;
  }

  const excludedIds = new Set(exclusions.map(({ candidateId }) => candidateId));
  const excludedTypes = new Set(exclusions.map(({ resourceType }) => resourceType));
  const nodes = snapshot.provisionalArchitectureJson.nodes.filter(
    (node) => !excludedIds.has(node.id) && !excludedTypes.has(node.type)
  );
  const nodeIds = new Set(nodes.map(({ id }) => id));
  const edges = snapshot.provisionalArchitectureJson.edges.filter(
    ({ sourceId, targetId }) => nodeIds.has(sourceId) && nodeIds.has(targetId)
  );

  return {
    ...snapshot,
    provisionalArchitectureJson: { nodes, edges },
    excludableCandidateIds: snapshot.excludableCandidateIds.filter((id) => nodeIds.has(id))
  };
}
