import { test } from "node:test";
import assert from "node:assert/strict";
import type { DiagramJson, ProjectDraft } from "../../../../packages/types/src";
import {
  chooseInitialDiagram,
  createDraftStorageKey,
  createLocalProjectDraft,
  markDraftServerSaved
} from "./project-draft-persistence";

const emptyDiagram: DiagramJson = {
  nodes: [],
  edges: [],
  viewport: {
    x: 0,
    y: 0,
    zoom: 1
  }
};

const editedDiagram: DiagramJson = {
  nodes: [
    {
      id: "node-1",
      type: "aws_s3_bucket",
      kind: "resource",
      position: { x: 24, y: 48 },
      size: { width: 168, height: 96 },
      label: "S3 Bucket",
      locked: false,
      zIndex: 1
    }
  ],
  edges: [],
  viewport: {
    x: 10,
    y: 20,
    zoom: 0.8
  }
};

test("createDraftStorageKey scopes drafts by workspace and project", () => {
  assert.equal(createDraftStorageKey("workspace-1", "project-1"), "workspace-1:project-1");
});

test("createLocalProjectDraft marks edits dirty and increments local revision", () => {
  const draft = createLocalProjectDraft({
    workspaceId: "workspace-1",
    projectId: "project-1",
    diagramJson: editedDiagram,
    previousDraft: {
      key: "workspace-1:project-1",
      workspaceId: "workspace-1",
      projectId: "project-1",
      diagramJson: emptyDiagram,
      dirty: false,
      revision: 4,
      draftSavedAt: "2026-06-24T00:00:00.000Z",
      serverSavedAt: "2026-06-24T00:00:00.000Z"
    },
    savedAt: "2026-06-24T01:00:00.000Z"
  });

  assert.equal(draft.key, "workspace-1:project-1");
  assert.equal(draft.dirty, true);
  assert.equal(draft.revision, 5);
  assert.equal(draft.draftSavedAt, "2026-06-24T01:00:00.000Z");
  assert.deepEqual(draft.diagramJson, editedDiagram);
});

test("markDraftServerSaved clears dirty state and mirrors server revision", () => {
  const localDraft = createLocalProjectDraft({
    workspaceId: "workspace-1",
    projectId: "project-1",
    diagramJson: editedDiagram,
    savedAt: "2026-06-24T01:00:00.000Z"
  });
  const serverDraft: ProjectDraft = {
    projectId: "project-1",
    diagramJson: editedDiagram,
    revision: 9,
    serverSavedAt: "2026-06-24T01:01:00.000Z",
    createdAt: "2026-06-24T01:01:00.000Z",
    updatedAt: "2026-06-24T01:01:00.000Z"
  };

  const syncedDraft = markDraftServerSaved(localDraft, serverDraft);

  assert.equal(syncedDraft.dirty, false);
  assert.equal(syncedDraft.revision, 9);
  assert.equal(syncedDraft.serverSavedAt, "2026-06-24T01:01:00.000Z");
});

test("chooseInitialDiagram prefers server draft over local draft", () => {
  const serverDraft: ProjectDraft = {
    projectId: "project-1",
    diagramJson: emptyDiagram,
    revision: 2,
    serverSavedAt: "2026-06-24T01:01:00.000Z",
    createdAt: "2026-06-24T01:01:00.000Z",
    updatedAt: "2026-06-24T01:01:00.000Z"
  };
  const localDraft = createLocalProjectDraft({
    workspaceId: "workspace-1",
    projectId: "project-1",
    diagramJson: editedDiagram,
    savedAt: "2026-06-24T01:00:00.000Z"
  });

  assert.deepEqual(
    chooseInitialDiagram({
      serverDraft,
      localDraft,
      fallbackDiagram: editedDiagram
    }),
    {
      diagramJson: emptyDiagram,
      source: "server"
    }
  );
});
