import { test } from "node:test";
import assert from "node:assert/strict";
import type { DiagramJson } from "@sketchcatch/types";
import { buildApp } from "../app.js";
import type { DatabaseClient } from "../db/client.js";

process.env.NODE_ENV = "test";

const projectRow = {
  id: "11111111-1111-4111-8111-111111111111",
  workspaceId: "workspace-1",
  name: "Learning VPC",
  description: "VPC practice",
  createdAt: new Date("2026-06-24T01:00:00.000Z"),
  updatedAt: new Date("2026-06-24T02:00:00.000Z")
};

const authenticatedOwner = {
  workspaceId: "user-workspace-1",
  userId: "22222222-2222-4222-8222-222222222222"
};

const draftDiagram: DiagramJson = {
  nodes: [
    {
      id: "node-vpc",
      type: "aws_vpc",
      kind: "resource",
      position: { x: 0, y: 0 },
      size: { width: 112, height: 108 },
      label: "VPC",
      locked: false,
      zIndex: 1,
      parameters: {
        terraformBlockType: "resource",
        resourceType: "aws_vpc",
        resourceName: "vpc",
        fileName: "main",
        values: {
          cidrBlock: "10.0.0.0/16"
        }
      }
    }
  ],
  edges: [],
  viewport: {
    x: 0,
    y: 0,
    zoom: 1
  }
};

const draftRow = {
  projectId: projectRow.id,
  diagramJson: draftDiagram,
  revision: 4,
  serverSavedAt: new Date("2026-06-24T03:00:00.000Z"),
  createdAt: new Date("2026-06-24T01:30:00.000Z"),
  updatedAt: new Date("2026-06-24T03:00:00.000Z")
};

test("GET /api/projects lists projects for a workspace", async () => {
  let whereCalled = false;
  let orderByCalled = false;
  const app = buildApp({
    getDatabaseClient: () =>
      ({
        db: {
          select: () => ({
            from: () => ({
              where: () => {
                whereCalled = true;
                return {
                  orderBy: async () => {
                    orderByCalled = true;
                    return [projectRow];
                  }
                };
              }
            })
          })
        }
      }) as unknown as DatabaseClient
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/projects?clientGeneratedWorkspaceId=workspace-1"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(whereCalled, true);
  assert.equal(orderByCalled, true);
  assert.deepEqual(response.json(), {
    projects: [
      {
        ...projectRow,
        createdAt: "2026-06-24T01:00:00.000Z",
        updatedAt: "2026-06-24T02:00:00.000Z"
      }
    ]
  });

  await app.close();
});

test("POST /api/projects stores the authenticated user owner on the project", async () => {
  const insertedValues: Record<string, unknown>[] = [];
  const app = buildApp({
    resolveProjectOwner: () => authenticatedOwner,
    getDatabaseClient: () =>
      ({
        db: {
          insert: () => ({
            values: (values: Record<string, unknown>) => {
              insertedValues.push(values);

              if (insertedValues.length === 1) {
                return {
                  onConflictDoUpdate: async () => undefined
                };
              }

              return {
                returning: async () => [
                  {
                    id: String(values.id),
                    workspaceId: String(values.workspaceId),
                    userId: values.userId ? String(values.userId) : null,
                    name: String(values.name),
                    description:
                      typeof values.description === "string" ? values.description : null,
                    createdAt: new Date("2026-06-24T01:00:00.000Z"),
                    updatedAt: new Date("2026-06-24T01:00:00.000Z")
                  }
                ]
              };
            }
          })
        }
      }) as unknown as DatabaseClient
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/projects",
    payload: {
      name: "Authenticated Project",
      description: "Created from a session owner"
    }
  });

  assert.equal(response.statusCode, 201);
  assert.deepEqual(insertedValues[0], {
    id: authenticatedOwner.workspaceId
  });
  assert.equal(insertedValues[1]?.workspaceId, authenticatedOwner.workspaceId);
  assert.equal(insertedValues[1]?.userId, authenticatedOwner.userId);
  assert.equal(response.json().project.userId, authenticatedOwner.userId);

  await app.close();
});

test("POST /api/projects derives a workspace when authenticated owner only has userId", async () => {
  const derivedWorkspaceId = `user:${authenticatedOwner.userId}`;
  const insertedValues: Record<string, unknown>[] = [];
  const app = buildApp({
    resolveProjectOwner: () => ({
      userId: authenticatedOwner.userId
    }),
    getDatabaseClient: () =>
      ({
        db: {
          insert: () => ({
            values: (values: Record<string, unknown>) => {
              insertedValues.push(values);

              if (insertedValues.length === 1) {
                return {
                  onConflictDoUpdate: async () => undefined
                };
              }

              return {
                returning: async () => [
                  {
                    id: String(values.id),
                    workspaceId: String(values.workspaceId),
                    userId: values.userId ? String(values.userId) : null,
                    name: String(values.name),
                    description:
                      typeof values.description === "string" ? values.description : null,
                    createdAt: new Date("2026-06-24T01:00:00.000Z"),
                    updatedAt: new Date("2026-06-24T01:00:00.000Z")
                  }
                ]
              };
            }
          })
        }
      }) as unknown as DatabaseClient
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/projects",
    payload: {
      name: "Authenticated Project",
      description: "Created from a session user id"
    }
  });

  assert.equal(response.statusCode, 201);
  assert.deepEqual(insertedValues[0], {
    id: derivedWorkspaceId
  });
  assert.equal(insertedValues[1]?.workspaceId, derivedWorkspaceId);
  assert.equal(insertedValues[1]?.userId, authenticatedOwner.userId);
  assert.equal(response.json().project.workspaceId, derivedWorkspaceId);
  assert.equal(response.json().project.userId, authenticatedOwner.userId);

  await app.close();
});

test("GET /api/projects/:id/draft returns not found for a different authenticated owner", async () => {
  let selectCount = 0;
  const app = buildApp({
    resolveProjectOwner: () => ({
      workspaceId: "workspace-b",
      userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    }),
    getDatabaseClient: () =>
      ({
        db: {
          select: () => ({
            from: () => ({
              where: async () => {
                selectCount += 1;
                return [];
              }
            })
          })
        }
      }) as unknown as DatabaseClient
  });

  const response = await app.inject({
    method: "GET",
    url: `/api/projects/${projectRow.id}/draft`
  });

  assert.equal(response.statusCode, 404);
  assert.equal(selectCount, 1);

  await app.close();
});

test("GET /api/projects/:id/draft restores the same authenticated owner's diagramJson", async () => {
  let selectCount = 0;
  const authenticatedProjectRow = {
    ...projectRow,
    workspaceId: authenticatedOwner.workspaceId,
    userId: authenticatedOwner.userId
  };
  const app = buildApp({
    resolveProjectOwner: () => authenticatedOwner,
    getDatabaseClient: () =>
      ({
        db: {
          select: () => ({
            from: () => ({
              where: async () => {
                selectCount += 1;
                return selectCount === 1 ? [authenticatedProjectRow] : [draftRow];
              }
            })
          })
        }
      }) as unknown as DatabaseClient
  });

  const response = await app.inject({
    method: "GET",
    url: `/api/projects/${projectRow.id}/draft`
  });

  assert.equal(response.statusCode, 200);
  assert.equal(selectCount, 2);
  assert.equal(response.json().draft.projectId, projectRow.id);
  assert.equal(response.json().draft.diagramJson.nodes[0].parameters.values.cidrBlock, "10.0.0.0/16");

  await app.close();
});

test("PUT /api/projects/:id/draft returns not found for a different authenticated owner", async () => {
  let insertCalled = false;
  let updateCalled = false;
  const app = buildApp({
    resolveProjectOwner: () => ({
      workspaceId: "workspace-b",
      userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    }),
    getDatabaseClient: () =>
      ({
        db: {
          select: () => ({
            from: () => ({
              where: async () => []
            })
          }),
          insert: () => {
            insertCalled = true;
            throw new Error("draft insert must not run for another owner");
          },
          update: () => {
            updateCalled = true;
            throw new Error("project update must not run for another owner");
          }
        }
      }) as unknown as DatabaseClient
  });

  const response = await app.inject({
    method: "PUT",
    url: `/api/projects/${projectRow.id}/draft`,
    payload: {
      diagramJson: draftDiagram
    }
  });

  assert.equal(response.statusCode, 404);
  assert.equal(insertCalled, false);
  assert.equal(updateCalled, false);

  await app.close();
});

test("GET /api/projects lists projects for an authenticated user owner", async () => {
  let whereCalled = false;
  const authenticatedProjectRow = {
    ...projectRow,
    workspaceId: "user-workspace-1",
    userId: "22222222-2222-4222-8222-222222222222"
  };
  const app = buildApp({
    resolveProjectOwner: () => ({
      workspaceId: "user-workspace-1",
      userId: "22222222-2222-4222-8222-222222222222"
    }),
    getDatabaseClient: () =>
      ({
        db: {
          select: () => ({
            from: () => ({
              where: () => {
                whereCalled = true;
                return {
                  orderBy: async () => [authenticatedProjectRow]
                };
              }
            })
          })
        }
      }) as unknown as DatabaseClient
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/projects"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(whereCalled, true);
  assert.deepEqual(response.json(), {
    projects: [
      {
        ...authenticatedProjectRow,
        createdAt: "2026-06-24T01:00:00.000Z",
        updatedAt: "2026-06-24T02:00:00.000Z"
      }
    ]
  });

  await app.close();
});
