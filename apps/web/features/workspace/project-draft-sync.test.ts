import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  DiagramJson,
  ProjectDraft,
  ProjectDraftConflictResponse,
  ProjectDraftResponse
} from "../../../../packages/types/src";
import { ApiClientError } from "../../lib/api-client";
import type { LocalProjectDraft } from "./project-draft-persistence";
import {
  loadProjectDiagramDraft,
  saveLocalProjectDiagramDraft,
  saveProjectDiagramDraft,
  saveServerProjectDiagramDraft
} from "./project-draft-sync";

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
  baseServerRevision: 2,
  revision: 3,
  draftSavedAt: "2026-06-24T01:00:00.000Z",
  dirty: true
};

const serverDraft: ProjectDraft = {
  id: "22222222-2222-4222-8222-222222222222",
  projectId: "11111111-1111-4111-8111-111111111111",
  diagramJson: serverDiagram,
  revision: 7,
  serverSavedAt: "2026-06-24T02:00:00.000Z",
  createdAt: "2026-06-24T01:30:00.000Z",
  updatedAt: "2026-06-24T02:00:00.000Z"
};

test("loadProjectDiagramDraft loads the server draft when it is newer than local cache", async () => {
  const calls: string[] = [];
  const result = await loadProjectDiagramDraft(
    {
      fallbackDiagram: emptyDiagram,
      projectId: serverDraft.projectId,
      workspaceId: "workspace-1"
    },
    {
      getProjectDraft: async (projectId: string): Promise<ProjectDraftResponse> => {
        calls.push(`server:${projectId}`);
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
    `server:${serverDraft.projectId}`
  ]);
  assert.equal(result.source, "server");
  assert.deepEqual(result.diagramJson, serverDiagram);
  assert.deepEqual(result.serverDraft, serverDraft);
  assert.equal(result.localDraft?.baseServerRevision, serverDraft.revision);
  assert.equal(result.localDraft?.dirty, false);
  assert.deepEqual(result.localDraft?.diagramJson, serverDiagram);
});

test("loadProjectDiagramDraft restores the server draft over a newer empty local draft", async () => {
  const deletedLocalDraft: LocalProjectDraft = {
    ...localDraft,
    diagramJson: emptyDiagram,
    revision: 4,
    draftSavedAt: "2026-06-24T02:01:00.000Z",
    dirty: true
  };
  const staleServerDraft: ProjectDraft = {
    ...serverDraft,
    serverSavedAt: "2026-06-24T02:00:00.000Z",
    updatedAt: "2026-06-24T02:00:00.000Z"
  };

  const result = await loadProjectDiagramDraft(
    {
      fallbackDiagram: serverDiagram,
      projectId: serverDraft.projectId,
      workspaceId: "workspace-1"
    },
    {
      getProjectDraft: async () => ({ draft: staleServerDraft }),
      readLocalProjectDraft: async () => deletedLocalDraft
    }
  );

  assert.equal(result.source, "server");
  assert.deepEqual(result.diagramJson, serverDiagram);
  assert.equal(result.localDraft?.baseServerRevision, staleServerDraft.revision);
  assert.equal(result.localDraft?.dirty, false);
  assert.deepEqual(result.localDraft?.diagramJson, serverDiagram);
  assert.deepEqual(result.serverDraft, staleServerDraft);
});

test("loadProjectDiagramDraft restores newer server draft instead of stale empty local cache", async () => {
  const staleDeletedLocalDraft: LocalProjectDraft = {
    ...localDraft,
    diagramJson: emptyDiagram,
    revision: 4,
    draftSavedAt: "2026-06-24T02:00:00.000Z",
    dirty: true
  };
  const newerServerDraft: ProjectDraft = {
    ...serverDraft,
    serverSavedAt: "2026-06-24T02:01:00.000Z",
    updatedAt: "2026-06-24T02:01:00.000Z"
  };

  const result = await loadProjectDiagramDraft(
    {
      fallbackDiagram: emptyDiagram,
      projectId: serverDraft.projectId,
      workspaceId: "workspace-1"
    },
    {
      getProjectDraft: async () => ({ draft: newerServerDraft }),
      readLocalProjectDraft: async () => staleDeletedLocalDraft
    }
  );

  assert.equal(result.source, "server");
  assert.deepEqual(result.diagramJson, serverDiagram);
  assert.equal(result.localDraft?.baseServerRevision, newerServerDraft.revision);
  assert.equal(result.localDraft?.dirty, false);
  assert.deepEqual(result.localDraft?.diagramJson, serverDiagram);
  assert.deepEqual(result.serverDraft, newerServerDraft);
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
      getProjectDraft: async (projectId: string): Promise<ProjectDraftResponse> => {
        calls.push(`server:${projectId}:session`);
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

test("loadProjectDiagramDraft rejects stale local fallback when the latest server draft cannot be loaded", async () => {
  await assert.rejects(
    loadProjectDiagramDraft(
      {
        fallbackDiagram: emptyDiagram,
        projectId: serverDraft.projectId,
        workspaceId: "workspace-1"
      },
      {
        getProjectDraft: async () => {
          throw new Error("server unavailable");
        },
        readLocalProjectDraft: async () => localDraft
      }
    ),
    /server unavailable/
  );
});

test("loadProjectDiagramDraft rejects empty fallback when the latest server draft cannot be loaded", async () => {
  await assert.rejects(
    loadProjectDiagramDraft(
      {
        fallbackDiagram: emptyDiagram,
        projectId: serverDraft.projectId,
        workspaceId: "workspace-1"
      },
      {
        getProjectDraft: async () => {
          throw new Error("server unavailable");
        },
        readLocalProjectDraft: async () => null
      }
    ),
    /server unavailable/
  );
});

test("saveProjectDiagramDraft can use authenticated server ownership without a workspace query", async () => {
  const localWrites: LocalProjectDraft[] = [];
  let saveCallCount = 0;
  const result = await saveProjectDiagramDraft(
    {
      diagramJson: serverDiagram,
      localCacheWorkspaceId: "user-cache-1",
      projectId: serverDraft.projectId
    },
    {
      now: () => "2026-06-24T03:00:00.000Z",
      saveProjectDraft: async () => {
        saveCallCount += 1;
        return { draft: serverDraft };
      },
      writeLocalProjectDraft: async (draft) => {
        localWrites.push(draft);
      }
    }
  );

  assert.equal(saveCallCount, 1);
  assert.equal(localWrites[0]?.workspaceId, "user-cache-1");
  assert.equal(result.localDraft.dirty, false);
});

test("saveLocalProjectDiagramDraft writes IndexedDB draft without calling server save", async () => {
  const writes: LocalProjectDraft[] = [];
  const result = await saveLocalProjectDiagramDraft(
    {
      diagramJson: serverDiagram,
      previousLocalDraft: localDraft,
      projectId: serverDraft.projectId,
      workspaceId: "workspace-1"
    },
    {
      now: () => "2026-06-24T03:00:00.000Z",
      writeLocalProjectDraft: async (draft) => {
        writes.push(draft);
      }
    }
  );

  assert.equal(writes.length, 1);
  assert.equal(result.localDraft.dirty, true);
  assert.equal(result.localDraft.revision, 4);
  assert.deepEqual(result.localDraft.diagramJson, serverDiagram);
});

test("saveServerProjectDiagramDraft saves PostgreSQL draft and syncs the local cache", async () => {
  const writes: LocalProjectDraft[] = [];
  const saveCalls: Array<{
    projectId: string;
    diagramJson: DiagramJson;
    expectedRevision: number | null;
  }> = [];
  const result = await saveServerProjectDiagramDraft(
    {
      diagramJson: serverDiagram,
      previousLocalDraft: localDraft,
      projectId: serverDraft.projectId,
      workspaceId: "workspace-1"
    },
    {
      saveProjectDraft: async ({ projectId, diagramJson, expectedRevision }) => {
        saveCalls.push({
          projectId,
          diagramJson,
          expectedRevision
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
      diagramJson: serverDiagram,
      expectedRevision: 2
    }
  ]);
  if (!result.ok) {
    assert.fail("server draft save should succeed");
  }

  assert.equal(result.localDraft.dirty, false);
  assert.equal(result.localDraft.revision, 8);
  assert.equal(result.serverDraft.revision, 8);
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.dirty, false);
});

test("saveServerProjectDiagramDraft returns failure without discarding local recovery draft", async () => {
  const writes: LocalProjectDraft[] = [];
  const result = await saveServerProjectDiagramDraft(
    {
      diagramJson: serverDiagram,
      previousLocalDraft: localDraft,
      projectId: serverDraft.projectId,
      workspaceId: "workspace-1"
    },
    {
      saveProjectDraft: async () => {
        throw new Error("server unavailable");
      },
      writeLocalProjectDraft: async (draft) => {
        writes.push(draft);
      }
    }
  );

  if (result.ok) {
    assert.fail("server draft save should fail");
  }

  assert.equal(result.localDraft, localDraft);
  assert.equal(result.serverDraft, null);
  assert.equal(writes.length, 0);
});

test("saveServerProjectDiagramDraft preserves server conflict details for reload UI", async () => {
  const conflict: ProjectDraftConflictResponse = {
    error: "conflict",
    message: "다른 탭에서 이 프로젝트가 변경되었습니다.",
    currentRevision: 9,
    currentServerSavedAt: "2026-06-24T03:00:00.000Z"
  };
  const result = await saveServerProjectDiagramDraft(
    {
      diagramJson: serverDiagram,
      previousLocalDraft: localDraft,
      projectId: serverDraft.projectId,
      workspaceId: "workspace-1"
    },
    {
      saveProjectDraft: async () => {
        throw new ApiClientError(409, conflict);
      },
      writeLocalProjectDraft: async () => undefined
    }
  );

  if (result.ok) {
    assert.fail("stale server draft save should report a conflict");
  }

  assert.deepEqual(result.conflict, conflict);
  assert.equal(result.localDraft, localDraft);
});

test("saveServerProjectDiagramDraft can skip local sync when the caller detects a stale save", async () => {
  const writes: LocalProjectDraft[] = [];
  const result = await saveServerProjectDiagramDraft(
    {
      diagramJson: serverDiagram,
      previousLocalDraft: localDraft,
      projectId: serverDraft.projectId,
      shouldSyncLocalDraft: () => false,
      workspaceId: "workspace-1"
    },
    {
      saveProjectDraft: async () => ({ draft: serverDraft }),
      writeLocalProjectDraft: async (draft) => {
        writes.push(draft);
      }
    }
  );

  if (!result.ok) {
    assert.fail("server draft save should succeed");
  }

  assert.equal(result.localDraft.dirty, false);
  assert.equal(result.serverDraft, serverDraft);
  assert.equal(writes.length, 0);
});

test("saveProjectDiagramDraft writes local cache and server draft for the same project", async () => {
  const writes: LocalProjectDraft[] = [];
  const saveCalls: Array<{
    projectId: string;
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
      saveProjectDraft: async ({ projectId, diagramJson }) => {
        saveCalls.push({
          projectId,
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
      diagramJson: serverDiagram
    }
  ]);
  assert.equal(writes.length, 2);
  assert.equal(writes[0]?.dirty, true);
  assert.equal(writes[1]?.dirty, false);
  assert.equal(result.localDraft.dirty, false);
  assert.equal(result.serverDraft?.revision, 8);
});

test("saveProjectDiagramDraft returns local draft when server save fails", async () => {
  const writes: LocalProjectDraft[] = [];
  const result = await saveProjectDiagramDraft(
    {
      diagramJson: serverDiagram,
      previousLocalDraft: localDraft,
      projectId: serverDraft.projectId,
      workspaceId: "workspace-1"
    },
    {
      now: () => "2026-06-24T03:00:00.000Z",
      saveProjectDraft: async () => {
        throw new Error("server unavailable");
      },
      writeLocalProjectDraft: async (draft) => {
        writes.push(draft);
      }
    }
  );

  assert.equal(writes.length, 1);
  assert.equal(result.localDraft.dirty, true);
  assert.equal(result.localDraft.revision, 4);
  assert.equal(result.serverDraft, null);
});

test("saveProjectDiagramDraft keeps an empty local recovery draft when server save fails", async () => {
  const writes: LocalProjectDraft[] = [];
  const result = await saveProjectDiagramDraft(
    {
      diagramJson: emptyDiagram,
      previousLocalDraft: localDraft,
      projectId: serverDraft.projectId,
      workspaceId: "workspace-1"
    },
    {
      now: () => "2026-06-24T03:00:00.000Z",
      saveProjectDraft: async () => {
        throw new Error("server unavailable");
      },
      writeLocalProjectDraft: async (draft) => {
        writes.push(draft);
      }
    }
  );

  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0]?.diagramJson, emptyDiagram);
  assert.equal(result.localDraft.dirty, true);
  assert.deepEqual(result.localDraft.diagramJson, emptyDiagram);
  assert.equal(result.serverDraft, null);
});
