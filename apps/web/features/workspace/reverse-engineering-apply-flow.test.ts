import assert from "node:assert/strict";
import test from "node:test";
import type { DiagramJson } from "@sketchcatch/types";

import {
  applyExistingReverseEngineeringPreview,
  attachReverseEngineeringSourceToDiagram,
  createReverseEngineeringApplyPreview,
  getSavedReverseEngineeringSourceScanIds,
  selectReverseEngineeringOrganizationCandidate
} from "./reverse-engineering-apply-flow";

test("Reverse provenance is added only to nodes owned by this scan", () => {
  const diagram = createDiagram();
  diagram.nodes.push({
    ...structuredClone(diagram.nodes[0]!),
    id: "existing-vpc",
    parameters: {
      ...structuredClone(diagram.nodes[0]!.parameters!),
      values: {
        reverseEngineeringSourceScanId: "previous-scan",
        reverseEngineeringDraftId: "previous-draft"
      }
    }
  });

  const sourced = attachReverseEngineeringSourceToDiagram({
    diagram,
    sourceScanId: "new-scan",
    draftId: "new-draft",
    sourceNodeIds: ["vpc-1"],
    sourceKind: "preview_scan"
  });

  assert.equal(
    sourced.nodes[0]?.parameters?.values["reverseEngineeringSourceScanId"],
    "new-scan"
  );
  assert.equal(
    sourced.nodes[1]?.parameters?.values["reverseEngineeringSourceScanId"],
    "previous-scan"
  );
  assert.equal(
    sourced.nodes[0]?.parameters?.values["reverseEngineeringSourceKind"],
    "preview_scan"
  );
  assert.equal(
    diagram.nodes[0]?.parameters?.values["reverseEngineeringSourceScanId"],
    undefined
  );
});

test("deleted-source tracking ignores ephemeral preview provenance", () => {
  const diagram = createDiagram();
  diagram.nodes.push({
    ...structuredClone(diagram.nodes[0]!),
    id: "saved-vpc",
    parameters: {
      ...structuredClone(diagram.nodes[0]!.parameters!),
      values: {
        reverseEngineeringSourceScanId: "saved-scan",
        reverseEngineeringSourceKind: "saved_scan"
      }
    }
  });
  const sourced = attachReverseEngineeringSourceToDiagram({
    diagram,
    sourceScanId: "preview-scan",
    draftId: "preview-draft",
    sourceNodeIds: ["vpc-1"],
    sourceKind: "preview_scan"
  });

  assert.deepEqual(getSavedReverseEngineeringSourceScanIds(sourced), ["saved-scan"]);
});

test("mode-specific organization selection never applies an independently ranked replace candidate", () => {
  const replaceCandidate = createOrganizationCandidate("arrangement-2", 100);
  const appendCandidate = createOrganizationCandidate("arrangement-1", 400);

  const selected = selectReverseEngineeringOrganizationCandidate({
    candidates: {
      replace: [replaceCandidate],
      append: [appendCandidate]
    },
    mode: "append",
    selectedCandidateId: replaceCandidate.id
  });

  assert.equal(selected, appendCandidate);
  assert.equal(selected?.diagram.nodes[0]?.position.x, 400);
});

test("Reverse preview keeps the exact persisted revision and Board fingerprint", () => {
  const diagram = createDiagram();
  const preview = createReverseEngineeringApplyPreview({
    diagram,
    draftRevision: 7
  });

  diagram.nodes[0]!.position = { x: 999, y: 999 };

  assert.equal(preview.sourceDraftRevision, 7);
  assert.notDeepEqual(preview.sourceDiagram, diagram);
  assert.notEqual(preview.sourceFingerprint, "");
});

test("a newer draft revision blocks an old Reverse preview with zero writes", async () => {
  const source = createDiagram();
  const writes = createWriteTracker();

  const outcome = await applyExistingReverseEngineeringPreview({
    currentDiagram: source,
    currentDraftRevision: 8,
    diagramToApply: moveDiagram(source),
    persistAndApply: writes.persistAndApply,
    preview: createReverseEngineeringApplyPreview({ diagram: source, draftRevision: 7 }),
    saveSnapshot: writes.saveSnapshot
  });

  assert.equal(outcome.status, "stale");
  assert.deepEqual(writes.counts(), {
    board: 0,
    history: 0,
    localSave: 0,
    server: 0,
    snapshot: 0
  });
});

test("a Board edit at the same revision blocks an old Reverse preview with zero writes", async () => {
  const source = createDiagram();
  const edited = moveDiagram(source);
  const writes = createWriteTracker();

  const outcome = await applyExistingReverseEngineeringPreview({
    currentDiagram: edited,
    currentDraftRevision: 7,
    diagramToApply: moveDiagram(source, 300),
    persistAndApply: writes.persistAndApply,
    preview: createReverseEngineeringApplyPreview({ diagram: source, draftRevision: 7 }),
    saveSnapshot: writes.saveSnapshot
  });

  assert.equal(outcome.status, "stale");
  assert.deepEqual(writes.counts(), {
    board: 0,
    history: 0,
    localSave: 0,
    server: 0,
    snapshot: 0
  });
});

test("a server 409 after Reverse preflight produces zero local and snapshot writes", async () => {
  const source = createDiagram();
  const writes = createWriteTracker({ conflict: true });

  await assert.rejects(
    applyExistingReverseEngineeringPreview({
      currentDiagram: source,
      currentDraftRevision: 7,
      diagramToApply: moveDiagram(source),
      persistAndApply: writes.persistAndApply,
      preview: createReverseEngineeringApplyPreview({ diagram: source, draftRevision: 7 }),
      saveSnapshot: writes.saveSnapshot
    }),
    /409 conflict/u
  );

  assert.deepEqual(writes.expectedRevisions, [7]);
  assert.deepEqual(writes.counts(), {
    board: 0,
    history: 0,
    localSave: 0,
    server: 0,
    snapshot: 0
  });
});

test("a Snapshot failure after Board CAS reports partial success without rolling back local writes", async () => {
  const source = createDiagram();
  const writes = createWriteTracker({ snapshotFailure: true });

  const outcome = await applyExistingReverseEngineeringPreview({
    currentDiagram: source,
    currentDraftRevision: 7,
    diagramToApply: moveDiagram(source),
    persistAndApply: writes.persistAndApply,
    preview: createReverseEngineeringApplyPreview({ diagram: source, draftRevision: 7 }),
    saveSnapshot: writes.saveSnapshot
  });

  assert.equal(outcome.status, "saved_without_snapshot");
  assert.deepEqual(writes.expectedRevisions, [7]);
  assert.deepEqual(writes.counts(), {
    board: 1,
    history: 1,
    localSave: 1,
    server: 1,
    snapshot: 0,
    snapshotAttempt: 1
  });
});

function createWriteTracker(
  options: { readonly conflict?: boolean; readonly snapshotFailure?: boolean } = {}
) {
  let boardWrites = 0;
  let historyWrites = 0;
  let localSaveWrites = 0;
  let serverWrites = 0;
  let snapshotWrites = 0;
  let snapshotAttempts = 0;
  const expectedRevisions: number[] = [];

  return {
    expectedRevisions,
    persistAndApply: async (_diagram: DiagramJson, expectedRevision: number) => {
      expectedRevisions.push(expectedRevision);

      if (options.conflict) {
        throw new Error("409 conflict");
      }

      serverWrites += 1;
      boardWrites += 1;
      historyWrites += 1;
      localSaveWrites += 1;
    },
    saveSnapshot: async () => {
      snapshotAttempts += 1;

      if (options.snapshotFailure) {
        throw new Error("snapshot unavailable");
      }

      snapshotWrites += 1;
    },
    counts: () => ({
      board: boardWrites,
      history: historyWrites,
      localSave: localSaveWrites,
      server: serverWrites,
      snapshot: snapshotWrites,
      ...(options.snapshotFailure ? { snapshotAttempt: snapshotAttempts } : {})
    })
  };
}

function createDiagram(): DiagramJson {
  return {
    nodes: [
      {
        id: "vpc-1",
        type: "aws_vpc",
        kind: "resource",
        position: { x: 20, y: 20 },
        size: { width: 168, height: 96 },
        label: "Main VPC",
        locked: false,
        zIndex: 1,
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_vpc",
          resourceName: "main",
          fileName: "main",
          values: { cidrBlock: "10.0.0.0/16" }
        }
      }
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}

function moveDiagram(diagram: DiagramJson, x = 180): DiagramJson {
  const moved = structuredClone(diagram);
  moved.nodes[0]!.position = { x, y: 80 };
  return moved;
}

function createOrganizationCandidate(id: string, x: number) {
  const diagram = moveDiagram(createDiagram(), x);

  return {
    id,
    diagram,
    visualDiff: {
      movedNodeIds: ["vpc-1"],
      resizedNodeIds: [],
      reroutedEdgeIds: [],
      addedFrameIds: [],
      changedFrameIds: [],
      removedFrameIds: []
    },
    explanations: [],
    visualFingerprint: `${id}-fingerprint`
  };
}
