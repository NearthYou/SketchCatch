import assert from "node:assert/strict";
import { test } from "node:test";
import type { ArchitectureJson } from "@sketchcatch/types";
import { buildApp } from "../app.js";
import { createAccessToken } from "../auth/tokens.js";
import type { Database, DatabaseClient } from "../db/client.js";
import { architectures, projects, users } from "../db/schema.js";

process.env.NODE_ENV = "test";
process.env.AUTH_TOKEN_SECRET = "test-auth-token-secret-with-at-least-32-characters";

const ACTIVE_USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_WITH_ARCHITECTURE_ID = "33333333-3333-4333-8333-333333333333";
const PROJECT_WITHOUT_ARCHITECTURE_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_PROJECT_ID = "55555555-5555-4555-8555-555555555555";

type UserRow = typeof users.$inferSelect;
type ProjectRow = typeof projects.$inferSelect;
type ArchitectureRow = typeof architectures.$inferSelect;

test("GET /api/costs/projects returns every owned project and estimates the latest architecture", async () => {
  const fakeDb = new CostRouteFakeDb({
    users: [makeUser()],
    projects: [
      makeProject({
        id: PROJECT_WITH_ARCHITECTURE_ID,
        name: "API Server",
        updatedAt: new Date("2026-06-26T00:00:00.000Z")
      }),
      makeProject({
        id: PROJECT_WITHOUT_ARCHITECTURE_ID,
        name: "Empty Board",
        updatedAt: new Date("2026-06-27T00:00:00.000Z")
      }),
      makeProject({
        id: OTHER_PROJECT_ID,
        userId: OTHER_USER_ID,
        name: "Other User Project",
        updatedAt: new Date("2026-06-28T00:00:00.000Z")
      })
    ],
    architectures: [
      makeArchitecture({
        id: "66666666-6666-4666-8666-666666666666",
        projectId: PROJECT_WITH_ARCHITECTURE_ID,
        architectureJson: createRdsArchitecture(),
        createdAt: new Date("2026-06-25T00:00:00.000Z")
      }),
      makeArchitecture({
        id: "77777777-7777-4777-8777-777777777777",
        projectId: PROJECT_WITH_ARCHITECTURE_ID,
        architectureJson: createEc2Architecture(),
        createdAt: new Date("2026-06-26T00:00:00.000Z")
      })
    ]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client,
    pricingRateProvider: async () => null
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/costs/projects?period=month&expectedUserCount=1000",
    headers: await authHeaders(ACTIVE_USER_ID)
  });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.deepEqual(
    body.projects.map((item: { project: { id: string } }) => item.project.id),
    [PROJECT_WITHOUT_ARCHITECTURE_ID, PROJECT_WITH_ARCHITECTURE_ID]
  );
  assert.equal(body.projects[0].costEstimate, null);
  assert.equal(body.projects[1].costEstimate.totalEstimate.amount, 8.5);
  assert.equal(body.totalEstimate.amount, 8.5);

  await app.close();
});

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
    id: PROJECT_WITH_ARCHITECTURE_ID,
    userId: ACTIVE_USER_ID,
    name: "Project",
    description: null,
    createdAt: new Date("2026-06-24T00:00:00.000Z"),
    updatedAt: new Date("2026-06-24T00:00:00.000Z"),
    ...overrides
  };
}

function makeArchitecture(overrides: Partial<ArchitectureRow> = {}): ArchitectureRow {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    projectId: PROJECT_WITH_ARCHITECTURE_ID,
    version: 1,
    source: "manual",
    architectureJson: createEc2Architecture(),
    createdAt: new Date("2026-06-24T00:00:00.000Z"),
    ...overrides
  };
}

function createEc2Architecture(): ArchitectureJson {
  return createArchitectureJson([
    {
      id: "backend",
      type: "EC2",
      label: "Backend",
      config: {
        instanceType: "t3.micro",
        terraformResourceName: "backend",
        terraformResourceType: "aws_instance"
      }
    }
  ]);
}

function createRdsArchitecture(): ArchitectureJson {
  return createArchitectureJson([
    {
      id: "database",
      type: "RDS",
      label: "Database",
      config: {
        instanceClass: "db.t4g.micro",
        terraformResourceName: "database",
        terraformResourceType: "aws_db_instance"
      }
    }
  ]);
}

function createArchitectureJson(
  nodes: readonly {
    readonly config: Record<string, unknown>;
    readonly id: string;
    readonly label: string;
    readonly type: ArchitectureJson["nodes"][number]["type"];
  }[]
): ArchitectureJson {
  return {
    edges: [],
    nodes: nodes.map((node, index) => ({
      id: node.id,
      type: node.type,
      label: node.label,
      positionX: index,
      positionY: 0,
      config: node.config
    }))
  };
}

class CostRouteFakeDb {
  userRows: UserRow[];
  projectRows: ProjectRow[];
  architectureRows: ArchitectureRow[];
  client: DatabaseClient;

  constructor(data: {
    users?: UserRow[];
    projects?: ProjectRow[];
    architectures?: ArchitectureRow[];
  }) {
    this.userRows = data.users ?? [];
    this.projectRows = data.projects ?? [];
    this.architectureRows = data.architectures ?? [];
    this.client = {
      db: this.createDb() as Database,
      pool: {
        end: async () => undefined
      } as DatabaseClient["pool"]
    };
  }

  private createDb(): unknown {
    return {
      select: () => ({
        from: (table: unknown) => new SelectQuery(() => this.selectRows(table))
      })
    };
  }

  private selectRows(table: unknown): unknown[] {
    if (table === users) {
      return this.userRows;
    }

    if (table === projects) {
      return this.projectRows
        .filter((project) => project.userId === ACTIVE_USER_ID)
        .sort(compareProjectRows);
    }

    if (table === architectures) {
      const ownedProjectIds = new Set(
        this.projectRows
          .filter((project) => project.userId === ACTIVE_USER_ID)
          .map((project) => project.id)
      );

      return this.architectureRows
        .filter((architecture) => ownedProjectIds.has(architecture.projectId))
        .sort(compareArchitectureRows);
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

function compareProjectRows(left: ProjectRow, right: ProjectRow): number {
  return (
    right.updatedAt.getTime() - left.updatedAt.getTime() ||
    right.createdAt.getTime() - left.createdAt.getTime()
  );
}

function compareArchitectureRows(left: ArchitectureRow, right: ArchitectureRow): number {
  return right.createdAt.getTime() - left.createdAt.getTime();
}
