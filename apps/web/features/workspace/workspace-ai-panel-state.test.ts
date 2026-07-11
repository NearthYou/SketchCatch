import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramJson } from "@sketchcatch/types";
import {
  applyWorkspaceAiBoardPreview,
  createWorkspaceAiBoardSnapshot,
  isWorkspaceAiResultStale
} from "./workspace-ai-panel-state";

const diagramJson: DiagramJson = {
  edges: [],
  nodes: [
    {
      id: "vpc-main",
      kind: "resource",
      label: "Main VPC",
      locked: false,
      parameters: {
        fileName: "main",
        resourceName: "main",
        resourceType: "aws_vpc",
        terraformBlockType: "resource",
        values: {
          cidrBlock: "10.0.0.0/16"
        }
      },
      position: { x: 20, y: 40 },
      size: { width: 180, height: 96 },
      type: "aws_vpc",
      zIndex: 1
    }
  ],
  viewport: { x: 0, y: 0, zoom: 1 }
};

test("createWorkspaceAiBoardSnapshot returns analysis input and board fingerprint together", () => {
  const snapshot = createWorkspaceAiBoardSnapshot(diagramJson);

  assert.equal(snapshot.architectureJson.nodes.length, 1);
  assert.equal(snapshot.hasResources, true);
  assert.equal(snapshot.fingerprint, JSON.stringify(snapshot.architectureJson));
});

test("createWorkspaceAiBoardSnapshot keeps the fingerprint stable when only viewport changes", () => {
  const snapshot = createWorkspaceAiBoardSnapshot(diagramJson);
  const viewportOnlyChangeSnapshot = createWorkspaceAiBoardSnapshot({
    ...diagramJson,
    viewport: { x: 80, y: 120, zoom: 0.7 }
  });

  assert.equal(viewportOnlyChangeSnapshot.fingerprint, snapshot.fingerprint);
});

test("createWorkspaceAiBoardSnapshot treats diagram resources without parameter values as resources", () => {
  const snapshot = createWorkspaceAiBoardSnapshot({
    edges: [],
    nodes: [
      {
        id: "bucket-unconfigured",
        kind: "resource",
        label: "Uploads Bucket",
        locked: false,
        position: { x: 20, y: 40 },
        size: { width: 180, height: 96 },
        type: "aws_s3_bucket",
        zIndex: 1
      }
    ],
    viewport: { x: 0, y: 0, zoom: 1 }
  });

  assert.equal(snapshot.hasResources, true);
  assert.equal(snapshot.architectureJson.nodes.length, 1);
  assert.equal(snapshot.architectureJson.nodes[0]?.type, "S3");
});

test("isWorkspaceAiResultStale only marks existing results stale after board changes", () => {
  const snapshot = createWorkspaceAiBoardSnapshot(diagramJson);

  assert.equal(isWorkspaceAiResultStale(null, snapshot.fingerprint), false);
  assert.equal(isWorkspaceAiResultStale(snapshot.fingerprint, snapshot.fingerprint), false);
  assert.equal(isWorkspaceAiResultStale("previous-board", snapshot.fingerprint), true);
});

test("isWorkspaceAiResultStale rejects an AI result when a resource changes during the request", () => {
  const requestSnapshot = createWorkspaceAiBoardSnapshot(diagramJson);
  const changedBoardSnapshot = createWorkspaceAiBoardSnapshot({
    ...diagramJson,
    nodes: diagramJson.nodes.map((node) => ({
      ...node,
      label: "Changed VPC"
    }))
  });

  assert.equal(
    isWorkspaceAiResultStale(requestSnapshot.fingerprint, changedBoardSnapshot.fingerprint),
    true
  );
});

test("applyWorkspaceAiBoardPreview does not call apply after the board changes during an AI request", async () => {
  const requestSnapshot = createWorkspaceAiBoardSnapshot(diagramJson);
  let resolveResponse: (() => void) | undefined;
  const pendingResponse = new Promise<void>((resolve) => {
    resolveResponse = resolve;
  });
  let currentDiagram = diagramJson;
  let appliedDiagram: DiagramJson | null = null;
  const applyAfterResponse = async (): Promise<string> => {
    await pendingResponse;

    return applyWorkspaceAiBoardPreview({
      applyDiagram: (diagram) => {
        appliedDiagram = diagram;
      },
      baseFingerprint: requestSnapshot.fingerprint,
      currentDiagram,
      previewDiagram: diagramJson
    });
  };
  const resultPromise = applyAfterResponse();

  currentDiagram = {
    ...diagramJson,
    nodes: diagramJson.nodes.map((node) => ({ ...node, label: "Changed during request" }))
  };
  assert.ok(resolveResponse);
  resolveResponse();

  assert.equal(await resultPromise, "stale");
  assert.equal(appliedDiagram, null);
});

test("applyWorkspaceAiBoardPreview applies a preview when the board is unchanged", () => {
  const requestSnapshot = createWorkspaceAiBoardSnapshot(diagramJson);
  let appliedDiagram: DiagramJson | null = null;

  const result = applyWorkspaceAiBoardPreview({
    applyDiagram: (diagram) => {
      appliedDiagram = diagram;
    },
    baseFingerprint: requestSnapshot.fingerprint,
    currentDiagram: diagramJson,
    previewDiagram: diagramJson
  });

  assert.equal(result, "applied");
  assert.deepEqual(appliedDiagram, diagramJson);
});
