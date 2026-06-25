import { test } from "node:test";
import assert from "node:assert/strict";
import type { DiagramJson, ProjectDraft, ProjectDraftResponse } from "../../../../packages/types/src";
import type { LocalProjectDraft } from "./project-draft-persistence";
import { loadProjectDiagramDraft, saveProjectDiagramDraft } from "./project-draft-sync";

const emptyDiagram: DiagramJson = {
  nodes: [],
  edges: [],
  viewport: {
    x: 0,
    y: 0,
    zoom: 1
  }
};

const localDiagram: DiagramJson = {
  nodes: [
    {
      id: "local-node",
      type: "aws_vpc",
      kind: "resource",
      position: { x: 12, y: 24 },
      size: { width: 112, height: 108 },
      label: "Local VPC",
      locked: false,
      zIndex: 1
    }
  ],
  edges: [],
  viewport: {
    x: 5,
    y: 10,
    zoom: 0.9
  }
};

const serverDiagram: DiagramJson = {
  nodes: [
    {
      id: "server-node",
      type: "aws_s3_bucket",
      kind: "resource",
      position: { x: 72, y: 96 },
      size: { width: 112, height: 108 },
      label: "Server S3",
      locked: false,
      zIndex: 1
    }
  ],
  edges: [],
  viewport: {
    x: 20,
    y: 30,
    zoom: 1.1
  }
};

const localDraft: LocalProjectDraft = {
  key: "workspace-1:11111111-1111-4111-8111-111111111111",
  workspaceId: "workspace-1",
  projectId: "11111111-1111-4111-8111-111111111111",
  diagramJson: localDiagram,
  revision: 3,
  draftSavedAt: "2026-06-24T01:00:00.000Z",
  dirty: true
};

const serverDraft: ProjectDraft = {
  projectId: "11111111-1111-4111-8111-111111111111",
  diagramJson: serverDiagram,
  revision: 7,
  serverSavedAt: "2026-06-24T02:00:00.000Z",
  createdAt: "2026-06-24T01:30:00.000Z",
  updatedAt: "2026-06-24T02:00:00.000Z"
};

test("loadProjectDiagramDraft loads server draft for a project before local fallback", async () => {
  const calls: string[] = [];
  const result = await loadProjectDiagramDraft(
    {
      fallbackDiagram: emptyDiagram,
      projectId: serverDraft.projectId,
      workspaceId: "workspace-1"
    },
    {
      getProjectDraft: async (projectId, workspaceId): Promise<ProjectDraftResponse> => {
        calls.push(`server:${projectId}:${workspaceId}`);
        return { draft: serverDraft };
      },
      readLocalProjectDraft: async (workspaceId, projectId) => {
        calls.push(`local:${workspaceId}:${projectId}`);
        return localDraft;
      }
    }
  );

  assert.deepEqual(calls, [
    `local:workspace-1:${serverDraft.projectId}`,
    `server:${serverDraft.projectId}:workspace-1`
  ]);
  assert.equal(result.source, "server");
  assert.deepEqual(result.diagramJson, serverDiagram);
  assert.deepEqual(result.serverDraft, serverDraft);
  assert.deepEqual(result.localDraft, localDraft);
});

test("loadProjectDiagramDraft can use authenticated server ownership without a workspace query", async () => {
  const calls: string[] = [];
  const result = await loadProjectDiagramDraft(
    {
      fallbackDiagram: emptyDiagram,
      localCacheWorkspaceId: "user-cache-1",
      projectId: serverDraft.projectId
    },
    {
      getProjectDraft: async (projectId, workspaceId): Promise<ProjectDraftResponse> => {
        calls.push(`server:${projectId}:${workspaceId ?? "session"}`);
        return { draft: serverDraft };
      },
      readLocalProjectDraft: async (workspaceId, projectId) => {
        calls.push(`local:${workspaceId}:${projectId}`);
        return null;
      }
    }
  );

  assert.deepEqual(calls, [
    `local:user-cache-1:${serverDraft.projectId}`,
    `server:${serverDraft.projectId}:session`
  ]);
  assert.equal(result.source, "server");
  assert.deepEqual(result.diagramJson, serverDiagram);
});

test("saveProjectDiagramDraft can use authenticated server ownership without a workspace query", async () => {
  const localWrites: LocalProjectDraft[] = [];
  const saveCalls: Array<{ workspaceId: string | undefined }> = [];
  const result = await saveProjectDiagramDraft(
    {
      diagramJson: serverDiagram,
      localCacheWorkspaceId: "user-cache-1",
      projectId: serverDraft.projectId
    },
    {
      now: () => "2026-06-24T03:00:00.000Z",
      saveProjectDraft: async ({ clientGeneratedWorkspaceId }) => {
        saveCalls.push({ workspaceId: clientGeneratedWorkspaceId });
        return { draft: serverDraft };
      },
      writeLocalProjectDraft: async (draft) => {
        localWrites.push(draft);
      }
    }
  );

  assert.deepEqual(saveCalls, [{ workspaceId: undefined }]);
  assert.equal(localWrites[0]?.workspaceId, "user-cache-1");
  assert.equal(result.localDraft.dirty, false);
});

test("saveProjectDiagramDraft writes local cache and server draft for the same project", async () => {
  const writes: LocalProjectDraft[] = [];
  const saveCalls: Array<{
    projectId: string;
    workspaceId: string | undefined;
    diagramJson: DiagramJson;
  }> = [];
  const result = await saveProjectDiagramDraft(
    {
      diagramJson: serverDiagram,
      previousLocalDraft: localDraft,
      projectId: serverDraft.projectId,
      workspaceId: "workspace-1"
    },
    {
      now: () => "2026-06-24T03:00:00.000Z",
      saveProjectDraft: async ({ projectId, clientGeneratedWorkspaceId, diagramJson }) => {
        saveCalls.push({
          projectId,
          workspaceId: clientGeneratedWorkspaceId,
          diagramJson
        });
        return {
          draft: {
            ...serverDraft,
            diagramJson,
            revision: 8,
            serverSavedAt: "2026-06-24T03:00:01.000Z",
            updatedAt: "2026-06-24T03:00:01.000Z"
          }
        };
      },
      writeLocalProjectDraft: async (draft) => {
        writes.push(draft);
      }
    }
  );

  assert.deepEqual(saveCalls, [
    {
      projectId: serverDraft.projectId,
      workspaceId: "workspace-1",
      diagramJson: serverDiagram
    }
  ]);
  assert.equal(writes.length, 2);
  assert.equal(writes[0]?.dirty, true);
  assert.equal(writes[1]?.dirty, false);
  assert.equal(result.localDraft.dirty, false);
  assert.equal(result.serverDraft?.revision, 8);
});
