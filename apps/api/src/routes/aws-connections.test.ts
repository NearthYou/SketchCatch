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
import { AwsConnectionTestError } from "../aws-connections/aws-connection-test-service.js";
import type { ProjectAccessContext } from "../deployments/deployment-service.js";
import { registerAwsConnectionRoutes, type AwsConnectionRouteOptions } from "./aws-connections.js";

process.env.NODE_ENV = "test";
process.env.AUTH_TOKEN_SECRET = "test-auth-token-secret-with-at-least-32-characters";

const userId = "22222222-2222-4222-8222-222222222222";
const awsConnectionId = "33333333-3333-4333-8333-333333333333";
const callerPrincipalArn = "arn:aws:iam::123456789012:role/SketchCatchRuntimeRole";
const testRoleArn = "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole";
const generatedRoleName = "SketchCatchTerraformExecutionRole-33333333";
const generatedRoleArn = `arn:aws:iam::123456789012:role/${generatedRoleName}`;
const externalId = "sc_conn_33333333-3333-4333-8333-333333333333_random";
const fixedNow = new Date("2026-06-26T00:00:00.000Z");

type UserRecord = typeof users.$inferSelect;

type AwsConnectionSetupResponse = {
  awsConnection: {
    id: string;
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
    permissionSetup: {
      verificationActions: string[];
      initialPolicyDocument: Record<string, unknown> | null;
      terraformPolicyDocument: Record<string, unknown> | null;
    };
  };
  callerRoleSetup: {
    policyName: string;
    assumableRoleArnPattern: string;
    policyDocument: Record<string, unknown>;
  };
  trustPolicyTemplate: Record<string, unknown>;
};

type AwsConnectionTestResponse = {
  ok: true;
  accountId: string;
  callerArn: string;
  region: string;
};

type AwsConnectionVerifyResponse = AwsConnectionTestResponse & {
  awsConnection: {
    id: string;
    userId: string;
    accountId: string | null;
    roleArn: string | null;
    externalId: string;
    region: string;
    status: "pending" | "verified" | "failed";
    lastVerifiedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
};

type AwsConnectionCloudFormationTemplateResponse = {
  roleName: string;
  stackName: string;
  region: string;
  capabilities: ["CAPABILITY_NAMED_IAM"];
  templateBody: string;
  templateUrl: string | null;
  templateUrlExpiresAt: string | null;
  launchStackUrl: string | null;
  manualTemplateFallbackAvailable: boolean;
};

class FakeAwsConnectionRepository implements AwsConnectionRepository {
  readonly calls: Array<{ name: string; [key: string]: unknown }> = [];
  awsConnection: AwsConnectionRecord | undefined;
  deploymentUsesConnection = false;

  async createAwsConnection(input: {
    id: string;
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

  async findAccessibleAwsConnection(
    candidateConnectionId: string,
    accessContext: ProjectAccessContext
  ) {
    this.calls.push({
      name: "findAccessibleAwsConnection",
      connectionId: candidateConnectionId,
      accessContext
    });

    if (
      !this.awsConnection ||
      this.awsConnection.id !== candidateConnectionId ||
      this.awsConnection.userId !== accessContext.userId
    ) {
      return undefined;
    }

    return this.awsConnection;
  }

  async listAccessibleAwsConnections(accessContext: ProjectAccessContext) {
    this.calls.push({
      name: "listAccessibleAwsConnections",
      accessContext
    });

    if (!this.awsConnection || this.awsConnection.userId !== accessContext.userId) {
      return [];
    }

    return [this.awsConnection];
  }

  async findVerifiedAwsConnectionByAccountId(
    accountId: string,
    accessContext: ProjectAccessContext
  ) {
    this.calls.push({
      name: "findVerifiedAwsConnectionByAccountId",
      accountId,
      accessContext
    });

    if (
      !this.awsConnection ||
      this.awsConnection.userId !== accessContext.userId ||
      this.awsConnection.accountId !== accountId ||
      this.awsConnection.status !== "verified"
    ) {
      return undefined;
    }

    return this.awsConnection;
  }

  async findAwsConnectionById(candidateConnectionId: string) {
    if (!this.awsConnection || this.awsConnection.id !== candidateConnectionId) {
      return undefined;
    }

    return this.awsConnection;
  }

  async hasDeploymentUsingAwsConnection(candidateConnectionId: string) {
    this.calls.push({
      name: "hasDeploymentUsingAwsConnection",
      connectionId: candidateConnectionId
    });

    return this.deploymentUsesConnection && candidateConnectionId === this.awsConnection?.id;
  }

  async deleteAccessibleAwsConnection(
    candidateConnectionId: string,
    accessContext: ProjectAccessContext
  ) {
    this.calls.push({
      name: "deleteAccessibleAwsConnection",
      connectionId: candidateConnectionId,
      accessContext
    });

    if (
      !this.awsConnection ||
      this.awsConnection.id !== candidateConnectionId ||
      this.awsConnection.userId !== accessContext.userId
    ) {
      return undefined;
    }

    const deletedConnection = this.awsConnection;
    this.awsConnection = undefined;

    return deletedConnection;
  }

  async updateAwsConnectionVerification(input: {
    connectionId: string;
    userId: string;
    accountId: string | null;
    roleArn: string;
    status: "verified" | "failed";
    lastVerifiedAt: Date | null;
  }) {
    this.calls.push({
      name: "updateAwsConnectionVerification",
      input
    });

    if (!this.awsConnection || this.awsConnection.id !== input.connectionId) {
      return undefined;
    }

    this.awsConnection = {
      ...this.awsConnection,
      accountId: input.accountId,
      roleArn: input.roleArn,
      status: input.status,
      lastVerifiedAt: input.lastVerifiedAt,
      updatedAt: input.lastVerifiedAt ?? this.awsConnection.updatedAt
    };

    return this.awsConnection;
  }
}

class FakeAwsConnectionTester {
  readonly calls: Array<{ roleArn: string; externalId: string; region: string }> = [];

  constructor(private readonly error?: Error) {}

  async testConnection(input: { roleArn: string; externalId: string; region: string }) {
    this.calls.push(input);

    if (this.error) {
      throw this.error;
    }

    return {
      ok: true as const,
      accountId: "123456789012",
      callerArn:
        "arn:aws:sts::123456789012:assumed-role/SketchCatchTerraformExecutionRole/sketchcatch-connection-test",
      region: input.region
    };
  }
}

test("GET /api/aws/connections returns user connection metadata", async () => {
  const repository = new FakeAwsConnectionRepository();
  repository.awsConnection = createAwsConnectionRecord({
    accountId: "123456789012",
    roleArn: testRoleArn,
    status: "verified",
    lastVerifiedAt: fixedNow
  });
  const app = await buildAwsConnectionTestApp(repository);

  const response = await app.inject({
    method: "GET",
    url: "/api/aws/connections",
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().awsConnections, [
    {
      id: awsConnectionId,
      userId,
      accountId: "123456789012",
      roleArn: testRoleArn,
      externalId,
      region: "ap-northeast-2",
      status: "verified",
      lastVerifiedAt: fixedNow.toISOString(),
      createdAt: fixedNow.toISOString(),
      updatedAt: fixedNow.toISOString()
    }
  ]);

  await app.close();
});

test("POST /api/aws/connections returns caller principal ARN and generated externalId", async () => {
  const repository = new FakeAwsConnectionRepository();
  const app = await buildAwsConnectionTestApp(repository);

  const response = await app.inject({
    method: "POST",
    url: "/api/aws/connections",
    headers: await authHeaders(),
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
    roleName: generatedRoleName,
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
    },
    permissionSetup: {
      verificationActions: ["sts:GetCallerIdentity"],
      initialPolicyDocument: null,
      terraformPolicyDocument: body.roleSetup.permissionSetup.terraformPolicyDocument
    }
  });
  assert.notEqual(body.roleSetup.permissionSetup.terraformPolicyDocument, null);
  assert.deepEqual(body.callerRoleSetup, {
    policyName: "SketchCatchAssumeTerraformExecutionRole",
    assumableRoleArnPattern: "arn:aws:iam::*:role/SketchCatchTerraformExecutionRole*",
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: "sts:AssumeRole",
          Resource: [
            "arn:aws:iam::*:role/SketchCatchTerraformExecutionRole",
            "arn:aws:iam::*:role/SketchCatchTerraformExecutionRole-*"
          ]
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

test("POST /api/aws/connections prunes stale AWS connections after creation", async () => {
  const repository = new FakeAwsConnectionRepository();
  const pruneCalls: Array<{
    accessContext: ProjectAccessContext;
    protectedConnectionIds: string[] | undefined;
    sameRepository: boolean;
  }> = [];
  const app = await buildAwsConnectionTestApp(repository, {
    pruneStaleAwsConnections: async (input, candidateRepository) => {
      pruneCalls.push({
        accessContext: input.accessContext,
        protectedConnectionIds: input.protectedConnectionIds,
        sameRepository: candidateRepository === repository
      });

      return {
        awsConnectionIdsDeleted: ["old-connection-id"]
      };
    }
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/aws/connections",
    headers: await authHeaders(),
    payload: {
      region: "ap-northeast-2"
    }
  });

  assert.equal(response.statusCode, 201);
  assert.deepEqual(pruneCalls, [
    {
      accessContext: {
        kind: "user",
        userId
      },
      protectedConnectionIds: [awsConnectionId],
      sameRepository: true
    }
  ]);

  await app.close();
});

test("POST /api/aws/connections/:connectionId/test returns caller identity without raw credentials", async () => {
  const repository = new FakeAwsConnectionRepository();
  repository.awsConnection = createAwsConnectionRecord();
  const tester = new FakeAwsConnectionTester();
  const app = await buildAwsConnectionTestApp(repository, {
    awsConnectionTester: tester
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/aws/connections/${awsConnectionId}/test`,
    headers: await authHeaders(),
    payload: {
      roleArn: testRoleArn
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as AwsConnectionTestResponse & {
    credentials?: unknown;
    accessKeyId?: unknown;
    secretAccessKey?: unknown;
    sessionToken?: unknown;
  };
  assert.deepEqual(body, {
    ok: true,
    accountId: "123456789012",
    callerArn:
      "arn:aws:sts::123456789012:assumed-role/SketchCatchTerraformExecutionRole/sketchcatch-connection-test",
    region: "ap-northeast-2"
  });
  assert.equal(body.credentials, undefined);
  assert.equal(body.accessKeyId, undefined);
  assert.equal(body.secretAccessKey, undefined);
  assert.equal(body.sessionToken, undefined);
  assert.deepEqual(tester.calls, [
    {
      roleArn: testRoleArn,
      externalId,
      region: "ap-northeast-2"
    }
  ]);

  await app.close();
});

test("POST /api/aws/connections/:connectionId/test maps STS failures to bad_request", async () => {
  const repository = new FakeAwsConnectionRepository();
  repository.awsConnection = createAwsConnectionRecord();
  const tester = new FakeAwsConnectionTester(
    new AwsConnectionTestError("AWS Role connection test failed")
  );
  const app = await buildAwsConnectionTestApp(repository, {
    awsConnectionTester: tester
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/aws/connections/${awsConnectionId}/test`,
    headers: await authHeaders(),
    payload: {
      roleArn: testRoleArn
    }
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), {
    error: "bad_request",
    message: "AWS Role connection test failed"
  });
  assert.deepEqual(tester.calls, [
    {
      roleArn: testRoleArn,
      externalId,
      region: "ap-northeast-2"
    }
  ]);

  await app.close();
});

test("POST /api/aws/connections/:connectionId/verify stores verified metadata", async () => {
  const repository = new FakeAwsConnectionRepository();
  repository.awsConnection = createAwsConnectionRecord();
  const tester = new FakeAwsConnectionTester();
  const app = await buildAwsConnectionTestApp(repository, {
    awsConnectionTester: tester,
    now: () => fixedNow
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/aws/connections/${awsConnectionId}/verify`,
    headers: await authHeaders(),
    payload: {
      roleArn: testRoleArn
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as AwsConnectionVerifyResponse & {
    credentials?: unknown;
    accessKeyId?: unknown;
    secretAccessKey?: unknown;
    sessionToken?: unknown;
  };
  assert.equal(body.ok, true);
  assert.equal(body.accountId, "123456789012");
  assert.equal(body.awsConnection.status, "verified");
  assert.equal(body.awsConnection.accountId, "123456789012");
  assert.equal(body.awsConnection.roleArn, testRoleArn);
  assert.equal(body.awsConnection.lastVerifiedAt, fixedNow.toISOString());
  assert.equal(body.credentials, undefined);
  assert.equal(body.accessKeyId, undefined);
  assert.equal(body.secretAccessKey, undefined);
  assert.equal(body.sessionToken, undefined);
  assert.deepEqual(tester.calls, [
    {
      roleArn: testRoleArn,
      externalId,
      region: "ap-northeast-2"
    }
  ]);

  await app.close();
});

test("POST /api/aws/connections/:connectionId/verify-created-role verifies the CloudFormation role from account id", async () => {
  const repository = new FakeAwsConnectionRepository();
  repository.awsConnection = createAwsConnectionRecord();
  const tester = new FakeAwsConnectionTester();
  const app = await buildAwsConnectionTestApp(repository, {
    awsConnectionTester: tester,
    now: () => fixedNow
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/aws/connections/${awsConnectionId}/verify-created-role`,
    headers: await authHeaders(),
    payload: {
      accountId: "123456789012"
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as AwsConnectionVerifyResponse;
  assert.equal(body.ok, true);
  assert.equal(body.awsConnection.status, "verified");
  assert.equal(body.awsConnection.roleArn, generatedRoleArn);
  assert.deepEqual(tester.calls, [
    {
      roleArn: generatedRoleArn,
      externalId,
      region: "ap-northeast-2"
    }
  ]);

  await app.close();
});

test("DELETE /api/aws/connections/:connectionId deletes user connection metadata", async () => {
  const repository = new FakeAwsConnectionRepository();
  repository.awsConnection = createAwsConnectionRecord({
    accountId: "123456789012",
    roleArn: testRoleArn,
    status: "verified",
    lastVerifiedAt: fixedNow
  });
  const app = await buildAwsConnectionTestApp(repository);

  const response = await app.inject({
    method: "DELETE",
    url: `/api/aws/connections/${awsConnectionId}`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 204);
  assert.equal(response.body, "");
  assert.equal(repository.awsConnection, undefined);

  await app.close();
});

test("DELETE /api/aws/connections/:connectionId returns conflict when a deployment uses it", async () => {
  const repository = new FakeAwsConnectionRepository();
  repository.awsConnection = createAwsConnectionRecord({
    accountId: "123456789012",
    roleArn: testRoleArn,
    status: "verified",
    lastVerifiedAt: fixedNow
  });
  repository.deploymentUsesConnection = true;
  const app = await buildAwsConnectionTestApp(repository);

  const response = await app.inject({
    method: "DELETE",
    url: `/api/aws/connections/${awsConnectionId}`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), {
    error: "conflict",
    message: "AWS connection is used by a deployment"
  });
  assert.equal(repository.awsConnection?.id, awsConnectionId);

  await app.close();
});

test("GET /api/aws/connections/:connectionId/cloudformation-template returns launch stack setup", async () => {
  const repository = new FakeAwsConnectionRepository();
  repository.awsConnection = createAwsConnectionRecord();
  const publishedTemplateUrl =
    "https://sketchcatch-test-bucket.s3.ap-northeast-2.amazonaws.com/aws-connections/33333333-3333-4333-8333-333333333333/cloudformation-template.yaml?X-Amz-Signature=signed";
  const publisherCalls: Array<{
    connectionId: string;
    stackName: string;
    templateBody: string;
    expiresInSeconds: number;
  }> = [];
  const app = await buildAwsConnectionTestApp(repository, {
    cloudFormationTemplatePublisher: async (input) => {
      publisherCalls.push(input);

      return {
        templateUrl: publishedTemplateUrl
      };
    }
  });

  const response = await app.inject({
    method: "GET",
    url: `/api/aws/connections/${awsConnectionId}/cloudformation-template`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as AwsConnectionCloudFormationTemplateResponse;
  assert.equal(body.roleName, generatedRoleName);
  assert.equal(body.stackName, "sketchcatch-aws-connection-33333333");
  assert.equal(body.region, "ap-northeast-2");
  assert.deepEqual(body.capabilities, ["CAPABILITY_NAMED_IAM"]);
  assert.match(body.templateBody, /Type: AWS::IAM::Role/);
  assert.match(body.templateBody, /RoleName: "SketchCatchTerraformExecutionRole-33333333"/);
  assert.doesNotMatch(body.templateBody, /RoleName: "SketchCatchTerraformExecutionRole"\n/);
  assert.doesNotMatch(body.templateBody, /Policies:\n\s+- PolicyName: SketchCatchMvpTerraformApply/);
  assert.match(body.templateBody, /SketchCatchTerraformApplyPolicy:/);
  assert.match(body.templateBody, /Type: AWS::IAM::Policy/);
  assert.match(body.templateBody, /Roles:\n\s+- !Ref SketchCatchTerraformExecutionRole/);
  assert.match(body.templateBody, /Action: ec2:\*/);
  assert.match(body.templateBody, /Action: s3:\*/);
  assert.match(
    body.templateBody,
    new RegExp(callerPrincipalArn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  );
  assert.match(body.templateBody, new RegExp(externalId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(body.templateUrl, publishedTemplateUrl);
  assert.equal(body.templateUrlExpiresAt, "2026-06-26T01:00:00.000Z");
  assert.equal(body.manualTemplateFallbackAvailable, false);
  assert.match(
    body.launchStackUrl ?? "",
    /^https:\/\/console\.aws\.amazon\.com\/cloudformation\/home\?region=ap-northeast-2#/
  );
  assert.match(body.launchStackUrl ?? "", /templateURL=/);
  assert.match(body.launchStackUrl ?? "", /s3\.ap-northeast-2\.amazonaws\.com/);
  assert.doesNotMatch(body.launchStackUrl ?? "", /api\/aws\/connections\/cloudformation-template/);
  assert.match(body.launchStackUrl ?? "", /stackName=sketchcatch-aws-connection-33333333/);
  assert.match(body.launchStackUrl ?? "", /capabilities=CAPABILITY_NAMED_IAM/);
  assert.deepEqual(publisherCalls, [
    {
      connectionId: awsConnectionId,
      stackName: "sketchcatch-aws-connection-33333333",
      templateBody: body.templateBody,
      expiresInSeconds: 3600
    }
  ]);

  await app.close();
});

test("GET /api/aws/connections/:connectionId/cloudformation-template returns an inline template without S3 publishing", async () => {
  const repository = new FakeAwsConnectionRepository();
  repository.awsConnection = createAwsConnectionRecord();

  const app = await buildAwsConnectionTestApp(repository, {
    cloudFormationTemplatePublisher: null
  });

  const response = await app.inject({
    method: "GET",
    url: `/api/aws/connections/${awsConnectionId}/cloudformation-template`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as AwsConnectionCloudFormationTemplateResponse;
  assert.equal(body.templateUrl, null);
  assert.equal(body.templateUrlExpiresAt, null);
  assert.equal(body.launchStackUrl, null);
  assert.equal(body.manualTemplateFallbackAvailable, true);
  assert.match(body.templateBody, /Type: AWS::IAM::Role/);

  await app.close();
});

async function buildAwsConnectionTestApp(
  repository: AwsConnectionRepository,
  routeOverrides: Partial<AwsConnectionRouteOptions> = {}
) {
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
    generateAwsExternalId: () => externalId,
    now: () => fixedNow,
    ...routeOverrides
  });

  return app;
}

function createAwsConnectionRecord(
  overrides: Partial<AwsConnectionRecord> = {}
): AwsConnectionRecord {
  return {
    id: awsConnectionId,
    userId,
    accountId: null,
    roleArn: null,
    externalId,
    region: "ap-northeast-2",
    status: "pending",
    lastVerifiedAt: null,
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

async function authHeaders(activeUserId = userId): Promise<Record<string, string>> {
  return {
    authorization: `Bearer ${await createAccessToken(activeUserId)}`
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
