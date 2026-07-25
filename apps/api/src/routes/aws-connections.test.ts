import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import { createAccessToken } from "../auth/tokens.js";
import type { DatabaseClient } from "../db/client.js";
import type {
  AwsConnectionRecord,
  AwsConnectionRepository
} from "../aws-connections/aws-connection-service.js";
import type {
  AwsCodeConnectionRecord,
  AwsCodeConnectionRepository
} from "../aws-connections/aws-codeconnection-service.js";
import { registerAwsConnectionRoutes } from "./aws-connections.js";

process.env.NODE_ENV = "test";
process.env.AUTH_TOKEN_SECRET = "test-auth-token-secret-with-at-least-32-characters";

const userId = "11111111-1111-4111-8111-111111111111";
const connectionId = "22222222-2222-4222-8222-222222222222";

test("AWS connection DELETE performs no managed cleanup without preview confirmation", async () => {
  let claimCalls = 0;
  let cleanupCalls = 0;
  let record: AwsConnectionRecord | undefined = createConnectionRecord();
  const repository = createRepository({
    getRecord: () => record,
    onClaim: () => {
      claimCalls += 1;
      if (!record) return undefined;
      record = { ...record, deletionStartedAt: new Date() };
      return { connection: record, claimed: true, blocked: false };
    },
    onDelete: () => {
      const deleted = record;
      record = undefined;
      return deleted;
    }
  });
  const app = Fastify();
  await registerAwsConnectionRoutes(app, {
    getDatabaseClient: () => createAuthDatabaseClient(),
    createAwsConnectionRepository: () => repository,
    cleanupManagedAwsResources: async ({ resources }) => {
      cleanupCalls += 1;
      assert.equal(resources.codeConnectionArn, null);
    }
  });
  const headers = { authorization: `Bearer ${await createAccessToken(userId)}` };

  const unconfirmed = await app.inject({
    method: "DELETE",
    url: `/aws/connections/${connectionId}`,
    headers
  });
  assert.equal(unconfirmed.statusCode, 400);
  assert.equal(claimCalls, 0);
  assert.equal(cleanupCalls, 0);

  const previewResponse = await app.inject({
    method: "GET",
    url: `/aws/connections/${connectionId}/deletion-preview`,
    headers
  });
  assert.equal(previewResponse.statusCode, 200);
  const preview = previewResponse.json<{
    canDelete: boolean;
    confirmationToken: string;
    managedResources: { codeBuildProjects: unknown[] };
    preservedRecords: { reverseEngineeringScans: number };
  }>();
  assert.equal(preview.canDelete, true);
  assert.equal(preview.managedResources.codeBuildProjects.length, 1);
  assert.equal("codeConnection" in preview.managedResources, false);
  assert.deepEqual(preview.preservedRecords, { reverseEngineeringScans: 2 });

  const confirmed = await app.inject({
    method: "DELETE",
    url: `/aws/connections/${connectionId}`,
    headers,
    payload: {
      confirmedManagedCleanup: true,
      confirmationToken: preview.confirmationToken
    }
  });
  assert.equal(confirmed.statusCode, 204);
  assert.equal(claimCalls, 1);
  assert.equal(cleanupCalls, 1);

  await app.close();
});

test("GitHub build disconnect returns 204 when remote AWS cleanup fails", async () => {
  const now = new Date("2026-07-18T00:00:00.000Z");
  let record: AwsCodeConnectionRecord | undefined = {
    id: "33333333-3333-4333-8333-333333333333",
    awsConnectionId: connectionId,
    connectionArn:
      "arn:aws:codeconnections:ap-northeast-2:123456789012:connection/demo",
    providerType: "GitHub",
    status: "AVAILABLE",
    statusReason: null,
    createdAt: now,
    updatedAt: now
  };
  const repository = {
    async findVerifiedConnection() {
      return createConnectionRecord();
    },
    async findByAwsConnectionId() {
      return record;
    },
    async findManagedResources() {
      return {
        codeBuildProjects: [],
        codeConnectionArn: record?.connectionArn ?? null
      };
    },
    async claimDeletion() {
      if (!record) return "not_found" as const;
      record = { ...record, status: "DELETING", updatedAt: now };
      return "claimed" as const;
    },
    async completeDeletion() {
      record = undefined;
      return true;
    },
    async markDeletionFailed() {
      throw new Error("local deletion must not be rolled back for an AWS cleanup failure");
    }
  } as unknown as AwsCodeConnectionRepository;
  const app = Fastify();
  await registerAwsConnectionRoutes(app, {
    getDatabaseClient: () => createAuthDatabaseClient(),
    createAwsCodeConnectionRepository: () => repository,
    cleanupManagedAwsResources: async () => {
      throw new Error("remote AWS cleanup failed");
    },
    now: () => now
  });

  const response = await app.inject({
    method: "DELETE",
    url: `/aws/connections/${connectionId}/codeconnection`,
    headers: { authorization: `Bearer ${await createAccessToken(userId)}` },
    payload: { confirmedManagedCleanup: true }
  });

  assert.equal(response.statusCode, 204);
  assert.equal(record, undefined);

  await app.close();
});

test("AWS connection verification returns 409 when a previous connection needs cleanup retry", async () => {
  const pendingConnection = createConnectionRecord({
    accountId: null,
    roleArn: null,
    status: "pending",
    lastVerifiedAt: null
  });
  const cleanupRetryConnection = createConnectionRecord({
    id: "33333333-3333-4333-8333-333333333333",
    deletionStartedAt: new Date("2026-07-16T01:00:00.000Z"),
    deletionErrorSummary: "cleanup failed"
  });
  const repository = createRepository({
    getRecord: () => pendingConnection,
    onClaim: () => undefined,
    onDelete: () => undefined
  });
  repository.findVerifiedAwsConnectionByAccountId = async () => cleanupRetryConnection;
  repository.updateAwsConnectionVerification = async (input) => ({
    ...pendingConnection,
    accountId: input.accountId,
    roleArn: input.roleArn,
    status: input.status,
    lastVerifiedAt: input.lastVerifiedAt
  });
  const app = Fastify();
  await registerAwsConnectionRoutes(app, {
    getDatabaseClient: () => createAuthDatabaseClient(),
    createAwsConnectionRepository: () => repository,
    awsConnectionTester: {
      async testConnection() {
        return {
          ok: true,
          accountId: "123456789012",
          callerArn:
            "arn:aws:sts::123456789012:assumed-role/SketchCatchTerraformExecutionRole/session",
          region: "ap-northeast-2"
        };
      }
    }
  });

  const response = await app.inject({
    method: "POST",
    url: `/aws/connections/${connectionId}/verify-created-role`,
    headers: { authorization: `Bearer ${await createAccessToken(userId)}` },
    payload: { accountId: "123456789012" }
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), {
    error: "conflict",
    message:
      "같은 AWS 계정의 이전 연결 정리가 완료되지 않았습니다. 이전 연결 정리를 재시도해 주세요."
  });

  await app.close();
});

test("AWS connection list route preserves the canonical response envelope", async () => {
  const repository = createRepository({
    getRecord: () => createConnectionRecord(),
    onClaim: () => undefined,
    onDelete: () => undefined
  });
  const app = Fastify();
  await registerAwsConnectionRoutes(app, {
    getDatabaseClient: () => createAuthDatabaseClient(),
    createAwsConnectionRepository: () => repository
  });

  const response = await app.inject({
    method: "GET",
    url: "/aws/connections",
    headers: { authorization: `Bearer ${await createAccessToken(userId)}` }
  });
  const body = response.json<{
    awsConnections?: Array<{ id: string }>;
    cleanupRetries?: unknown[];
  }>();

  assert.equal(response.statusCode, 200);
  assert.equal(Array.isArray(body), false);
  assert.deepEqual(body.awsConnections?.map((connection) => connection.id), [connectionId]);
  assert.deepEqual(body.cleanupRetries, []);

  await app.close();
});

test("AWS connection routes do not expose unexpected database query details", async () => {
  const repository = createRepository({
    getRecord: () => undefined,
    onClaim: () => undefined,
    onDelete: () => undefined
  });
  repository.listAccessibleAwsConnections = async () => {
    throw new Error(
      'Failed query: update "aws_connections" params: secret-account-and-role-details'
    );
  };
  const app = Fastify();
  await registerAwsConnectionRoutes(app, {
    getDatabaseClient: () => createAuthDatabaseClient(),
    createAwsConnectionRepository: () => repository
  });

  const response = await app.inject({
    method: "GET",
    url: "/aws/connections",
    headers: { authorization: `Bearer ${await createAccessToken(userId)}` }
  });

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.json(), {
    error: "internal_server_error",
    message: "AWS 연결 요청을 처리하지 못했습니다."
  });
  assert.doesNotMatch(response.body, /Failed query|secret-account|aws_connections/u);

  await app.close();
});

test("AWS connection routes sanitize database setup errors before repository creation", async () => {
  const app = Fastify();
  app.register(registerAwsConnectionRoutes, {
    getDatabaseClient: () => {
      throw new Error(
        'Failed query: select "users" params: secret-auth-database-details'
      );
    }
  });

  const response = await app.inject({
    method: "GET",
    url: "/aws/connections",
    headers: { authorization: `Bearer ${await createAccessToken(userId)}` }
  });

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.json(), {
    error: "internal_server_error",
    message: "AWS 연결 요청을 처리하지 못했습니다."
  });
  assert.doesNotMatch(response.body, /Failed query|secret-auth|select.*users/u);

  await app.close();
});

test("AWS connection routes do not trust arbitrary 4xx status codes on database errors", async () => {
  const app = Fastify();
  app.register(registerAwsConnectionRoutes, {
    getDatabaseClient: () => {
      throw Object.assign(
        new Error('Failed query: select "users" params: raw-database-details'),
        { statusCode: 400 }
      );
    }
  });

  const response = await app.inject({
    method: "GET",
    url: "/aws/connections",
    headers: { authorization: `Bearer ${await createAccessToken(userId)}` }
  });

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.json(), {
    error: "internal_server_error",
    message: "AWS 연결 요청을 처리하지 못했습니다."
  });
  assert.doesNotMatch(response.body, /Failed query|raw-database|select.*users/u);

  await app.close();
});

test("AWS connection plugin error boundary preserves authentication errors", async () => {
  const app = Fastify();
  app.register(registerAwsConnectionRoutes, {
    getDatabaseClient: () => createAuthDatabaseClient()
  });

  const response = await app.inject({
    method: "GET",
    url: "/aws/connections"
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), {
    error: "unauthorized",
    message: "인증이 필요합니다."
  });

  await app.close();
});

test("AWS connection plugin error boundary stays encapsulated", async () => {
  const app = Fastify();
  app.setErrorHandler((_error, _request, reply) =>
    reply.status(418).send({ error: "parent_error_handler" })
  );
  app.register(registerAwsConnectionRoutes, {
    getDatabaseClient: () => createAuthDatabaseClient()
  });
  app.get("/outside-aws-connections", async () => {
    throw new Error("outside error");
  });

  const response = await app.inject({
    method: "GET",
    url: "/outside-aws-connections"
  });

  assert.equal(response.statusCode, 418);
  assert.deepEqual(response.json(), { error: "parent_error_handler" });

  await app.close();
});

function createRepository(input: {
  getRecord: () => AwsConnectionRecord | undefined;
  onClaim: () =>
    | { connection: AwsConnectionRecord; claimed: boolean; blocked: boolean }
    | undefined;
  onDelete: () => AwsConnectionRecord | undefined;
}): AwsConnectionRepository {
  return {
    async findAccessibleAwsConnection() {
      return input.getRecord();
    },
    async listAccessibleAwsConnections() {
      return input.getRecord() ? [input.getRecord()!] : [];
    },
    async findVerifiedAwsConnectionByAccountId() {
      return undefined;
    },
    async findAwsConnectionById() {
      return input.getRecord();
    },
    async hasDeploymentUsingAwsConnection() {
      return false;
    },
    async countReverseEngineeringScans() {
      return 2;
    },
    async findAwsImportAccessCleanupStatus() {
      return undefined;
    },
    async claimAccessibleAwsConnectionDeletion() {
      return input.onClaim();
    },
    async releaseAwsConnectionDeletionClaim() {},
    async deleteClaimedAwsConnection() {
      return input.onDelete();
    },
    async findManagedResources() {
      return {
        codeBuildProjects: [
          {
            projectId: "33333333-3333-4333-8333-333333333333",
            projectName: "sketchcatch-demo-build",
            serviceRoleArn:
              "arn:aws:iam::123456789012:role/SketchCatchCodeBuild-demo"
          }
        ],
        codeConnectionArn:
          "arn:aws:codeconnections:ap-northeast-2:123456789012:connection/demo"
      };
    },
    async createAwsConnection() {
      throw new Error("Not used");
    },
    async deleteAccessibleAwsConnection() {
      return undefined;
    },
    async updateAwsConnectionVerification() {
      return undefined;
    }
  };
}

function createConnectionRecord(
  overrides: Partial<AwsConnectionRecord> = {}
): AwsConnectionRecord {
  const now = new Date("2026-07-16T00:00:00.000Z");
  return {
    id: connectionId,
    userId,
    accountId: "123456789012",
    roleArn:
      "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole-demo",
    externalId: "external-id",
    region: "ap-northeast-2",
    status: "verified",
    lastVerifiedAt: now,
    deletionStartedAt: null,
    deletionErrorSummary: null,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function createAuthDatabaseClient(): DatabaseClient {
  return {
    db: {
      select: () => ({
        from: () => ({
          where: async () => [{ id: userId, deletedAt: null }]
        })
      })
    } as unknown as DatabaseClient["db"],
    pool: {} as DatabaseClient["pool"]
  };
}
