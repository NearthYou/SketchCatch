import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { createAccessToken } from "../auth/tokens.js";
import { users } from "../db/schema.js";
import type { DatabaseClient } from "../db/client.js";
import type {
  AwsConnectionRecord,
  AwsConnectionRepository
} from "../aws-connections/aws-connection-service.js";
import type { ProjectAccessContext, ProjectRecord } from "../deployments/deployment-service.js";
import { registerAwsConnectionRoutes } from "./aws-connections.js";

process.env.NODE_ENV = "test";
process.env.AUTH_TOKEN_SECRET = "test-auth-token-secret-with-at-least-32-characters";

const projectId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const awsConnectionId = "33333333-3333-4333-8333-333333333333";
const callerPrincipalArn = "arn:aws:iam::123456789012:role/SketchCatchRuntimeRole";
const externalId = "sc_conn_33333333-3333-4333-8333-333333333333_random";
const fixedNow = new Date("2026-06-26T00:00:00.000Z");

type UserRecord = typeof users.$inferSelect;

type AwsConnectionSetupResponse = {
  awsConnection: {
    id: string;
    projectId: string;
    userId: string;
    accountId: string | null;
    roleArn: string | null;
    externalId: string;
    region: string;
    status: "pending";
    lastVerifiedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  callerPrincipalArn: string;
  recommendedRoleName: string;
  roleSetup: {
    roleName: string;
    trustedPrincipalArn: string;
    externalId: string;
    trustPolicy: Record<string, unknown>;
  };
  trustPolicyTemplate: Record<string, unknown>;
};

class FakeAwsConnectionRepository implements AwsConnectionRepository {
  readonly calls: Array<{ name: string; [key: string]: unknown }> = [];
  project: ProjectRecord | undefined = createProjectRecord();
  awsConnection: AwsConnectionRecord | undefined;

  async findAccessibleProject(candidateProjectId: string, accessContext: ProjectAccessContext) {
    this.calls.push({
      name: "findAccessibleProject",
      projectId: candidateProjectId,
      accessContext
    });

    if (
      !this.project ||
      this.project.id !== candidateProjectId ||
      this.project.userId !== accessContext.userId
    ) {
      return undefined;
    }

    return this.project;
  }

  async createAwsConnection(input: {
    id: string;
    projectId: string;
    userId: string;
    externalId: string;
    region: string;
    status: "pending";
  }) {
    this.calls.push({
      name: "createAwsConnection",
      input
    });

    this.awsConnection = {
      id: input.id,
      projectId: input.projectId,
      userId: input.userId,
      accountId: null,
      roleArn: null,
      externalId: input.externalId,
      region: input.region,
      status: input.status,
      lastVerifiedAt: null,
      createdAt: fixedNow,
      updatedAt: fixedNow
    };

    return this.awsConnection;
  }
}

test("POST /api/projects/:projectId/aws-connections returns caller principal ARN and generated externalId", async () => {
  const repository = new FakeAwsConnectionRepository();
  const app = await buildAwsConnectionTestApp(repository);

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/aws-connections`,
    headers: authHeaders(),
    payload: {
      region: "ap-northeast-2"
    }
  });

  assert.equal(response.statusCode, 201);
  const body = response.json() as AwsConnectionSetupResponse;
  assert.equal(body.awsConnection.id, awsConnectionId);
  assert.equal(body.awsConnection.externalId, externalId);
  assert.equal(body.awsConnection.status, "pending");
  assert.equal(body.callerPrincipalArn, callerPrincipalArn);
  assert.deepEqual(body.roleSetup, {
    roleName: "SketchCatchTerraformExecutionRole",
    trustedPrincipalArn: callerPrincipalArn,
    externalId,
    trustPolicy: {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: {
            AWS: callerPrincipalArn
          },
          Action: "sts:AssumeRole",
          Condition: {
            StringEquals: {
              "sts:ExternalId": externalId
            }
          }
        }
      ]
    }
  });
  assert.deepEqual(body.trustPolicyTemplate, {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: {
          AWS: callerPrincipalArn
        },
        Action: "sts:AssumeRole",
        Condition: {
          StringEquals: {
            "sts:ExternalId": externalId
          }
        }
      }
    ]
  });

  await app.close();
});

test("POST /api/projects/:projectId/aws-connections maps inaccessible projects to not_found", async () => {
  const repository = new FakeAwsConnectionRepository();
  repository.project = undefined;
  const app = await buildAwsConnectionTestApp(repository);

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/aws-connections`,
    headers: authHeaders(),
    payload: {
      region: "ap-northeast-2"
    }
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), {
    error: "not_found",
    message: "Project not found"
  });

  await app.close();
});

async function buildAwsConnectionTestApp(repository: AwsConnectionRepository) {
  const app = Fastify({ logger: false });
  const fakeAuthDb = new AwsConnectionRouteFakeAuthDb([createUserRecord()]);

  await app.register(registerAwsConnectionRoutes, {
    prefix: "/api",
    getDatabaseClient: () => fakeAuthDb.client,
    createAwsConnectionRepository: () => repository,
    awsConnectionConfig: {
      callerPrincipalArn
    },
    generateAwsConnectionId: () => awsConnectionId,
    generateAwsExternalId: () => externalId
  });

  return app;
}

function createProjectRecord(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: projectId,
    userId,
    name: "AWS setup project",
    description: null,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    ...overrides
  };
}

function createUserRecord(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: userId,
    username: "aws-user",
    email: "aws@example.com",
    nickname: "AWS User",
    passwordHash: "unused",
    createdAt: fixedNow,
    updatedAt: fixedNow,
    deletedAt: null,
    ...overrides
  };
}

function authHeaders(activeUserId = userId): Record<string, string> {
  return {
    authorization: `Bearer ${createAccessToken(activeUserId)}`
  };
}

class AwsConnectionRouteFakeAuthDb {
  client: DatabaseClient;

  constructor(private readonly userRows: UserRecord[]) {
    this.client = {
      db: this.createDb() as DatabaseClient["db"],
      pool: {
        end: async () => undefined
      } as DatabaseClient["pool"]
    };
  }

  private createDb(): unknown {
    return {
      select: () => ({
        from: (table: unknown) => new SelectQuery(() => (table === users ? this.userRows : []))
      })
    };
  }
}

class SelectQuery {
  constructor(private readonly resolveRows: () => unknown[]) {}

  where(): this {
    return this;
  }

  then<TResult1 = unknown[], TResult2 = never>(
    onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.resolveRows()).then(onfulfilled, onrejected);
  }
}
