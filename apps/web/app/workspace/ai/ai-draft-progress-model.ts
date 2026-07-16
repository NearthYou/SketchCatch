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

export function acceptProgressSnapshot(
  current: ArchitectureDraftProgressSnapshot | null,
  incoming: ArchitectureDraftProgressSnapshot
): ArchitectureDraftProgressSnapshot {
  return current !== null && incoming.sequence <= current.sequence ? current : incoming;
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
