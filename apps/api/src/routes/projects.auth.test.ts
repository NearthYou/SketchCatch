import { test } from "node:test";
import assert from "node:assert/strict";
import type { ApiErrorResponse } from "@sketchcatch/types";
import { buildApp } from "../app.js";
import { createAccessToken } from "../auth/tokens.js";
import type { Database, DatabaseClient } from "../db/client.js";
import { architectures, projectAssets, projects, users } from "../db/schema.js";
import { defaultTerraformArtifactMaxBytes } from "../deployments/terraform-workspace.js";

process.env.NODE_ENV = "test";
process.env.AUTH_TOKEN_SECRET = "test-auth-token-secret-with-at-least-32-characters";

const ACTIVE_USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const ACTIVE_PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_PROJECT_ID = "44444444-4444-4444-8444-444444444444";

type UserRow = typeof users.$inferSelect;
type ProjectRow = typeof projects.$inferSelect;
type ArchitectureRow = typeof architectures.$inferSelect;
type ProjectAssetRow = typeof projectAssets.$inferSelect;

test("GET /api/projects returns 401 for a deleted user", async () => {
  const fakeDb = new ProjectRouteFakeDb({
    activeUserId: ACTIVE_USER_ID,
    users: [makeUser({ id: ACTIVE_USER_ID, deletedAt: new Date() })]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/projects",
    headers: await authHeaders(ACTIVE_USER_ID)
  });

  assert.equal(response.statusCode, 401);
  assertErrorResponse(response.json() as ApiErrorResponse, "unauthorized");

  await app.close();
});

test("GET /api/projects only returns projects owned by the active user", async () => {
  const fakeDb = new ProjectRouteFakeDb({
    activeUserId: ACTIVE_USER_ID,
    users: [makeUser({ id: ACTIVE_USER_ID })],
    projects: [
      makeProject({ id: ACTIVE_PROJECT_ID, userId: ACTIVE_USER_ID }),
      makeProject({ id: OTHER_PROJECT_ID, userId: OTHER_USER_ID })
    ]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/projects",
    headers: await authHeaders(ACTIVE_USER_ID)
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(
    response.json().projects.map((project: ProjectRow) => project.id),
    [ACTIVE_PROJECT_ID]
  );

  await app.close();
});

test("POST /api/projects creates a project for the active user", async () => {
  const fakeDb = new ProjectRouteFakeDb({
    activeUserId: ACTIVE_USER_ID,
    users: [makeUser({ id: ACTIVE_USER_ID })]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/projects",
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      name: "Owner project",
      description: "Created by active user"
    }
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.json().project.userId, ACTIVE_USER_ID);
  assert.equal(fakeDb.projectRows[0]?.userId, ACTIVE_USER_ID);

  await app.close();
});

test("GET /api/projects/:id returns 404 for another user's project", async () => {
  const fakeDb = new ProjectRouteFakeDb({
    activeUserId: ACTIVE_USER_ID,
    requestedProjectId: OTHER_PROJECT_ID,
    users: [makeUser({ id: ACTIVE_USER_ID })],
    projects: [makeProject({ id: OTHER_PROJECT_ID, userId: OTHER_USER_ID })]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "GET",
    url: `/api/projects/${OTHER_PROJECT_ID}`,
    headers: await authHeaders(ACTIVE_USER_ID)
  });

  assert.equal(response.statusCode, 404);
  assertErrorResponse(response.json() as ApiErrorResponse, "not_found");

  await app.close();
});

test("POST /api/projects/:id/architectures returns 404 for another user's project", async () => {
  const fakeDb = new ProjectRouteFakeDb({
    activeUserId: ACTIVE_USER_ID,
    requestedProjectId: OTHER_PROJECT_ID,
    users: [makeUser({ id: ACTIVE_USER_ID })],
    projects: [makeProject({ id: OTHER_PROJECT_ID, userId: OTHER_USER_ID })]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${OTHER_PROJECT_ID}/architectures`,
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      architectureJson: {
        nodes: [],
        edges: []
      }
    }
  });

  assert.equal(response.statusCode, 404);
  assertErrorResponse(response.json() as ApiErrorResponse, "not_found");

  await app.close();
});

test("POST /api/projects/:id/assets/presigned-upload returns 404 for another user's project", async () => {
  const fakeDb = new ProjectRouteFakeDb({
    activeUserId: ACTIVE_USER_ID,
    requestedProjectId: OTHER_PROJECT_ID,
    users: [makeUser({ id: ACTIVE_USER_ID })],
    projects: [makeProject({ id: OTHER_PROJECT_ID, userId: OTHER_USER_ID })]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${OTHER_PROJECT_ID}/assets/presigned-upload`,
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      assetType: "diagram_png",
      fileName: "diagram.png",
      contentType: "image/png"
    }
  });

  assert.equal(response.statusCode, 404);
  assertErrorResponse(response.json() as ApiErrorResponse, "not_found");

  await app.close();
});

test("POST /api/projects/:id/assets/presigned-upload rejects oversized Terraform uploads", async () => {
  const fakeDb = new ProjectRouteFakeDb({
    activeUserId: ACTIVE_USER_ID,
    users: [makeUser({ id: ACTIVE_USER_ID })]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${ACTIVE_PROJECT_ID}/assets/presigned-upload`,
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      assetType: "terraform_file",
      fileName: "main.tf",
      contentType: "application/x-terraform",
      byteSize: defaultTerraformArtifactMaxBytes + 1
    }
  });

  assert.equal(response.statusCode, 400);
  assert.match(response.json().message, /Terraform file must be/);

  await app.close();
});

function assertErrorResponse(
  body: ApiErrorResponse,
  expectedError: ApiErrorResponse["error"]
): void {
  assert.deepEqual(Object.keys(body).sort(), ["error", "message"]);
  assert.equal(body.error, expectedError);
  assert.equal(typeof body.message, "string");
}

async function authHeaders(userId: string): Promise<Record<string, string>> {
  return {
    authorization: `Bearer ${await createAccessToken(userId)}`
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

class ProjectRouteFakeDb {
  activeUserId: string;
  requestedProjectId: string | undefined;
  userRows: UserRow[];
  projectRows: ProjectRow[];
  architectureRows: ArchitectureRow[];
  projectAssetRows: ProjectAssetRow[];
  client: DatabaseClient;

  constructor(data: {
    activeUserId: string;
    requestedProjectId?: string;
    users?: UserRow[];
    projects?: ProjectRow[];
    architectures?: ArchitectureRow[];
    projectAssets?: ProjectAssetRow[];
  }) {
    this.activeUserId = data.activeUserId;
    this.requestedProjectId = data.requestedProjectId;
    this.userRows = data.users ?? [];
    this.projectRows = data.projects ?? [];
    this.architectureRows = data.architectures ?? [];
    this.projectAssetRows = data.projectAssets ?? [];
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
        values: (values: Partial<ProjectRow>) => ({
          returning: async () => {
            if (table === projects) {
              const project = makeProject(values);
              this.projectRows.push(project);

              return [project];
            }

            return [values];
          }
        })
      }),
      update: () => ({
        set: () => ({
          where: async () => []
        })
      })
    };
  }

  private selectRows(table: unknown, selection?: Record<string, unknown>): unknown[] {
    if (table === users) {
      return this.userRows.filter((user) => user.id === this.activeUserId);
    }

    if (table === projects) {
      return this.projectRows.filter(
        (project) =>
          project.userId === this.activeUserId &&
          (!this.requestedProjectId || project.id === this.requestedProjectId)
      );
    }

    if (table === architectures) {
      if (selection && "nextVersion" in selection) {
        return [{ nextVersion: 1 }];
      }

      return this.architectureRows.filter(
        (architecture) =>
          !this.requestedProjectId || architecture.projectId === this.requestedProjectId
      );
    }

    if (table === projectAssets) {
      return this.projectAssetRows.filter(
        (asset) => !this.requestedProjectId || asset.projectId === this.requestedProjectId
      );
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
