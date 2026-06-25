import { test } from "node:test";
import assert from "node:assert/strict";
import type { DiagramJson } from "@sketchcatch/types";
import { buildApp } from "../app.js";
import { createAccessToken } from "../auth/tokens.js";
import type { Database, DatabaseClient } from "../db/client.js";
import { projectDrafts, projects, users } from "../db/schema.js";

process.env.NODE_ENV = "test";
process.env.AUTH_TOKEN_SECRET = "test-auth-token-secret-with-at-least-32-characters";

const ACTIVE_USER_ID = "11111111-1111-4111-8111-111111111111";
const ACTIVE_PROJECT_ID = "33333333-3333-4333-8333-333333333333";

type UserRow = typeof users.$inferSelect;
type ProjectRow = typeof projects.$inferSelect;
type ProjectDraftRow = typeof projectDrafts.$inferSelect;

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

test("GET /api/projects/:id/draft restores the active user's diagramJson", async () => {
  const fakeDb = new ProjectDraftRouteFakeDb({
    users: [makeUser()],
    projects: [makeProject()],
    drafts: [makeProjectDraft({ revision: 4 })]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "GET",
    url: `/api/projects/${ACTIVE_PROJECT_ID}/draft`,
    headers: authHeaders(ACTIVE_USER_ID)
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().draft.projectId, ACTIVE_PROJECT_ID);
  assert.equal(response.json().draft.diagramJson.nodes[0].parameters.values.cidrBlock, "10.0.0.0/16");

  await app.close();
});

test("PUT /api/projects/:id/draft upserts the active user's latest diagramJson", async () => {
  const fakeDb = new ProjectDraftRouteFakeDb({
    users: [makeUser()],
    projects: [makeProject()],
    drafts: [makeProjectDraft({ revision: 4 })]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "PUT",
    url: `/api/projects/${ACTIVE_PROJECT_ID}/draft`,
    headers: authHeaders(ACTIVE_USER_ID),
    payload: {
      diagramJson: draftDiagram
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().draft.revision, 5);
  assert.equal(fakeDb.draftRows[0]?.revision, 5);
  assert.equal(fakeDb.projectUpdated, true);

  await app.close();
});

function authHeaders(userId: string): Record<string, string> {
  return {
    authorization: `Bearer ${createAccessToken(userId)}`
  };
}

function makeUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: ACTIVE_USER_ID,
    username: "demo",
    email: "demo@example.com",
    nickname: "Demo",
    passwordHash: "unused",
    createdAt: new Date("2026-06-24T00:00:00.000Z"),
    updatedAt: new Date("2026-06-24T00:00:00.000Z"),
    deletedAt: null,
    ...overrides
  };
}

function makeProject(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: ACTIVE_PROJECT_ID,
    userId: ACTIVE_USER_ID,
    name: "Project",
    description: null,
    createdAt: new Date("2026-06-24T00:00:00.000Z"),
    updatedAt: new Date("2026-06-24T00:00:00.000Z"),
    ...overrides
  };
}

function makeProjectDraft(overrides: Partial<ProjectDraftRow> = {}): ProjectDraftRow {
  return {
    projectId: ACTIVE_PROJECT_ID,
    diagramJson: draftDiagram,
    revision: 1,
    serverSavedAt: new Date("2026-06-24T00:00:00.000Z"),
    createdAt: new Date("2026-06-24T00:00:00.000Z"),
    updatedAt: new Date("2026-06-24T00:00:00.000Z"),
    ...overrides
  };
}

class ProjectDraftRouteFakeDb {
  userRows: UserRow[];
  projectRows: ProjectRow[];
  draftRows: ProjectDraftRow[];
  projectUpdated = false;
  client: DatabaseClient;

  constructor(data: {
    users?: UserRow[];
    projects?: ProjectRow[];
    drafts?: ProjectDraftRow[];
  }) {
    this.userRows = data.users ?? [];
    this.projectRows = data.projects ?? [];
    this.draftRows = data.drafts ?? [];
    this.client = {
      db: this.createDb() as Database,
      pool: {
        end: async () => undefined
      } as DatabaseClient["pool"]
    };
  }

  private createDb(): unknown {
    return {
      select: (selection?: Record<string, unknown>) => ({
        from: (table: unknown) => new SelectQuery(() => this.selectRows(table, selection))
      }),
      insert: (table: unknown) => ({
        values: (values: Partial<ProjectDraftRow>) => ({
          onConflictDoUpdate: ({ set }: { set: Partial<ProjectDraftRow> }) => ({
            returning: async () => {
              if (table !== projectDrafts) {
                return [];
              }

              const draft = makeProjectDraft({
                ...values,
                ...set
              });
              this.draftRows[0] = draft;
              return [draft];
            }
          })
        })
      }),
      update: (table: unknown) => ({
        set: () => ({
          where: async () => {
            if (table === projects) {
              this.projectUpdated = true;
            }

            return [];
          }
        })
      })
    };
  }

  private selectRows(table: unknown, selection?: Record<string, unknown>): unknown[] {
    if (table === users) {
      return this.userRows;
    }

    if (table === projects) {
      return this.projectRows.filter((project) => project.userId === ACTIVE_USER_ID);
    }

    if (table === projectDrafts) {
      if (selection && "revision" in selection) {
        return this.draftRows.map((draft) => ({ revision: draft.revision }));
      }

      return this.draftRows;
    }

    return [];
  }
}

class SelectQuery {
  constructor(private readonly resolveRows: () => unknown[]) {}

  where(): this {
    return this;
  }

  orderBy(): Promise<unknown[]> {
    return Promise.resolve(this.resolveRows());
  }

  then<TResult1 = unknown[], TResult2 = never>(
    onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.resolveRows()).then(onfulfilled, onrejected);
  }
}
