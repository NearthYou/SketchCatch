import { test } from "node:test";
import assert from "node:assert/strict";
import type { DiagramJson } from "../../../../packages/types/src";
import { createProjectDraftRepository } from "./project-draft-repository";
import type {
  LoadedProjectDiagramDraft,
  SavedLocalProjectDiagramDraft,
  SavedProjectDiagramDraft,
  SavedServerProjectDiagramDraft
} from "./project-draft-sync";

const diagramJson: DiagramJson = {
  nodes: [],
  edges: [],
  viewport: {
    x: 0,
    y: 0,
    zoom: 1
  }
};

test("project draft repository delegates load, local save, server save, and legacy save through one seam", async () => {
  const calls: string[] = [];
  const loaded: LoadedProjectDiagramDraft = {
    diagramJson,
    localDraft: null,
    serverDraft: null,
    source: "empty"
  };
  const saved: SavedProjectDiagramDraft = {
    localDraft: {
      key: "workspace-1:project-1",
      workspaceId: "workspace-1",
      projectId: "project-1",
      diagramJson,
      revision: 1,
      draftSavedAt: "2026-06-24T01:00:00.000Z",
      dirty: true
    },
    serverDraft: null
  };
  const savedLocal: SavedLocalProjectDiagramDraft = {
    localDraft: saved.localDraft
  };
  const savedServer: SavedServerProjectDiagramDraft = {
    ok: true,
    localDraft: {
      ...saved.localDraft,
      dirty: false,
      serverSavedAt: "2026-06-24T01:00:01.000Z"
    },
    serverDraft: {
      id: "draft-1",
      projectId: "project-1",
      diagramJson,
      revision: 1,
      serverSavedAt: "2026-06-24T01:00:01.000Z",
      createdAt: "2026-06-24T01:00:01.000Z",
      updatedAt: "2026-06-24T01:00:01.000Z"
    }
  };
  const repository = createProjectDraftRepository({
    loadProjectDiagramDraft: async (input) => {
      calls.push(`load:${input.projectId}`);
      return loaded;
    },
    saveLocalProjectDiagramDraft: async (input) => {
      calls.push(`saveLocal:${input.projectId}`);
      return savedLocal;
    },
    saveProjectDiagramDraft: async (input) => {
      calls.push(`save:${input.projectId}`);
      return saved;
    },
    saveServerProjectDiagramDraft: async (input) => {
      calls.push(`saveServer:${input.projectId}`);
      return savedServer;
    }
  });

  assert.equal((await repository.load({ fallbackDiagram: diagramJson, projectId: "project-1" })), loaded);
  assert.equal((await repository.saveLocal({ diagramJson, projectId: "project-1" })), savedLocal);
  assert.equal((await repository.saveServer({ diagramJson, projectId: "project-1" })), savedServer);
  assert.equal((await repository.save({ diagramJson, projectId: "project-1" })), saved);
  assert.deepEqual(calls, [
    "load:project-1",
    "saveLocal:project-1",
    "saveServer:project-1",
    "save:project-1"
  ]);
});
