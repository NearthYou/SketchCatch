import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import { ZodError } from "zod";
import { createAccessToken } from "../auth/tokens.js";
import type { DatabaseClient } from "../db/client.js";
import type {
  AwsConnectionRecord,
  AwsConnectionRepository
} from "../aws-connections/aws-connection-service.js";
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
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({ error: "bad_request", message: "Invalid request" });
    }
    throw error;
  });
  await registerAwsConnectionRoutes(app, {
    getDatabaseClient: () => createAuthDatabaseClient(),
    createAwsConnectionRepository: () => repository,
    cleanupManagedAwsResources: async () => {
      cleanupCalls += 1;
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
    managedResources: { codeBuildProjects: unknown[]; codeConnection: boolean };
  }>();
  assert.equal(preview.canDelete, true);
  assert.equal(preview.managedResources.codeBuildProjects.length, 1);
  assert.equal(preview.managedResources.codeConnection, true);

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

function createConnectionRecord(): AwsConnectionRecord {
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
    updatedAt: now
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
