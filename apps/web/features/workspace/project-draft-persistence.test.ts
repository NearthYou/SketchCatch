import { test } from "node:test";
import assert from "node:assert/strict";
import type { DiagramJson, ProjectDraft } from "../../../../packages/types/src";
import type { LocalProjectDraft } from "./project-draft-persistence";
import {
  chooseInitialDiagram,
  createDraftStorageKey,
  createLocalProjectDraft,
  isWorkspaceCloudPlatform,
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

test("isWorkspaceCloudPlatform accepts supported start form choices", () => {
  assert.equal(isWorkspaceCloudPlatform("aws"), true);
  assert.equal(isWorkspaceCloudPlatform("gcp"), true);
  assert.equal(isWorkspaceCloudPlatform("azure"), false);
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
    id: "draft-1",
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

test("chooseInitialDiagram prefers the local draft when it is newer than the server draft", () => {
  const serverDraft = makeProjectDraft({
    diagramJson: emptyDiagram,
    serverSavedAt: "2026-06-24T01:00:00.000Z"
  });
  const localDraft = makeLocalProjectDraft({
    diagramJson: editedDiagram,
    dirty: true,
    draftSavedAt: "2026-06-24T01:01:00.000Z"
  });

  assert.deepEqual(
    chooseInitialDiagram({
      serverDraft,
      localDraft,
      fallbackDiagram: emptyDiagram
    }),
    {
      diagramJson: editedDiagram,
      source: "local"
    }
  );
});

test("chooseInitialDiagram prefers the server draft when it is newer than a dirty local draft", () => {
  const serverDraft = makeProjectDraft({
    diagramJson: editedDiagram,
    serverSavedAt: "2026-06-24T01:01:00.000Z"
  });
  const localDraft = makeLocalProjectDraft({
    diagramJson: emptyDiagram,
    dirty: true,
    draftSavedAt: "2026-06-24T01:00:00.000Z"
  });

  assert.deepEqual(
    chooseInitialDiagram({
      serverDraft,
      localDraft,
      fallbackDiagram: editedDiagram
    }),
    {
      diagramJson: editedDiagram,
      source: "server"
    }
  );
});

test("chooseInitialDiagram uses the server draft when save times are equal", () => {
  const savedAt = "2026-06-24T01:00:00.000Z";
  const serverDraft = makeProjectDraft({
    diagramJson: editedDiagram,
    serverSavedAt: savedAt
  });
  const localDraft = makeLocalProjectDraft({
    diagramJson: emptyDiagram,
    dirty: true,
    draftSavedAt: savedAt
  });

  assert.deepEqual(
    chooseInitialDiagram({
      serverDraft,
      localDraft,
      fallbackDiagram: emptyDiagram
    }),
    {
      diagramJson: editedDiagram,
      source: "server"
    }
  );
});

test("chooseInitialDiagram treats a newer empty local board as a valid draft", () => {
  const serverDraft = makeProjectDraft({
    diagramJson: editedDiagram,
    serverSavedAt: "2026-06-24T01:00:00.000Z"
  });
  const localDraft = makeLocalProjectDraft({
    diagramJson: emptyDiagram,
    dirty: true,
    draftSavedAt: "2026-06-24T01:01:00.000Z"
  });

  assert.deepEqual(
    chooseInitialDiagram({
      serverDraft,
      localDraft,
      fallbackDiagram: editedDiagram
    }),
    {
      diagramJson: emptyDiagram,
      source: "local"
    }
  );
});

function makeProjectDraft(overrides: Partial<ProjectDraft> = {}): ProjectDraft {
  const savedAt = overrides.serverSavedAt ?? "2026-06-24T01:00:00.000Z";

  return {
    id: "draft-2",
    projectId: "project-1",
    diagramJson: emptyDiagram,
    revision: 2,
    serverSavedAt: savedAt,
    createdAt: savedAt,
    updatedAt: savedAt,
    ...overrides
  };
}

function makeLocalProjectDraft(overrides: Partial<LocalProjectDraft> = {}): LocalProjectDraft {
  return {
    key: "workspace-1:project-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    diagramJson: editedDiagram,
    revision: 1,
    draftSavedAt: "2026-06-24T01:00:00.000Z",
    dirty: true,
    ...overrides
  };
}
