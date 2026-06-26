import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AwsConnectionVerificationError,
  createAwsConnection,
  verifyAwsConnection,
  type AwsConnectionRecord,
  type AwsConnectionRepository
} from "./aws-connection-service.js";
import type { AwsConnectionTester } from "./aws-connection-test-service.js";
import type { ProjectAccessContext, ProjectRecord } from "../deployments/deployment-service.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const awsConnectionId = "33333333-3333-4333-8333-333333333333";
const callerPrincipalArn = "arn:aws:iam::123456789012:role/SketchCatchRuntimeRole";
const externalId = "sc_conn_33333333-3333-4333-8333-333333333333_random";
const fixedNow = new Date("2026-06-26T00:00:00.000Z");
const verifiedAt = new Date("2026-06-26T01:23:45.000Z");
const roleArn = "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole";

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

  async findAccessibleAwsConnection(
    candidateProjectId: string,
    candidateConnectionId: string,
    accessContext: ProjectAccessContext
  ) {
    this.calls.push({
      name: "findAccessibleAwsConnection",
      projectId: candidateProjectId,
      connectionId: candidateConnectionId,
      accessContext
    });

    if (
      !this.awsConnection ||
      this.awsConnection.id !== candidateConnectionId ||
      this.awsConnection.projectId !== candidateProjectId ||
      this.awsConnection.userId !== accessContext.userId
    ) {
      return undefined;
    }

    return this.awsConnection;
  }

  async updateAwsConnectionVerification(input: {
    connectionId: string;
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

class FakeAwsConnectionTester implements AwsConnectionTester {
  readonly calls: Array<{ roleArn: string; externalId: string; region: string }> = [];

  constructor(
    private readonly accountId = "123456789012",
    private readonly error?: Error
  ) {}

  async testConnection(input: { roleArn: string; externalId: string; region: string }) {
    this.calls.push(input);

    if (this.error) {
      throw this.error;
    }

    return {
      ok: true as const,
      accountId: this.accountId,
      callerArn:
        "arn:aws:sts::123456789012:assumed-role/SketchCatchTerraformExecutionRole/sketchcatch-connection-test",
      region: input.region
    };
  }
}

test("createAwsConnection creates a pending connection with server-generated externalId and setup values", async () => {
  const repository = new FakeAwsConnectionRepository();

  const result = await createAwsConnection(
    {
      projectId,
      accessContext: {
        kind: "user",
        userId
      },
      region: "ap-northeast-2",
      callerPrincipalArn
    },
    repository,
    {
      generateId: () => awsConnectionId,
      generateExternalId: () => externalId
    }
  );

  assert.equal(result.awsConnection.id, awsConnectionId);
  assert.equal(result.awsConnection.projectId, projectId);
  assert.equal(result.awsConnection.userId, userId);
  assert.equal(result.awsConnection.externalId, externalId);
  assert.equal(result.awsConnection.status, "pending");
  assert.equal(result.awsConnection.accountId, null);
  assert.equal(result.awsConnection.roleArn, null);
  assert.equal(result.callerPrincipalArn, callerPrincipalArn);
  assert.equal(result.recommendedRoleName, "SketchCatchTerraformExecutionRole");
  assert.deepEqual(result.roleSetup, {
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
    },
    permissionSetup: {
      verificationActions: ["sts:GetCallerIdentity"],
      initialPolicyDocument: null,
      terraformPolicyDocument: null
    }
  });
  assert.deepEqual(result.callerRoleSetup, {
    policyName: "SketchCatchAssumeTerraformExecutionRole",
    assumableRoleArnPattern: "arn:aws:iam::*:role/SketchCatchTerraformExecutionRole",
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: "sts:AssumeRole",
          Resource: "arn:aws:iam::*:role/SketchCatchTerraformExecutionRole"
        }
      ]
    }
  });
  assert.deepEqual(result.trustPolicyTemplate, {
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
  assert.deepEqual(repository.calls, [
    {
      name: "findAccessibleProject",
      projectId,
      accessContext: {
        kind: "user",
        userId
      }
    },
    {
      name: "createAwsConnection",
      input: {
        id: awsConnectionId,
        projectId,
        userId,
        externalId,
        region: "ap-northeast-2",
        status: "pending"
      }
    }
  ]);
});

test("verifyAwsConnection stores only verified role metadata after STS caller identity succeeds", async () => {
  const repository = new FakeAwsConnectionRepository();
  repository.awsConnection = createAwsConnectionRecord();
  const tester = new FakeAwsConnectionTester();

  const result = await verifyAwsConnection(
    {
      projectId,
      connectionId: awsConnectionId,
      accessContext: {
        kind: "user",
        userId
      },
      roleArn
    },
    repository,
    tester,
    {
      now: () => verifiedAt
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.accountId, "123456789012");
  assert.equal(result.callerArn.includes("SketchCatchTerraformExecutionRole"), true);
  assert.equal(result.region, "ap-northeast-2");
  assert.equal(result.awsConnection.status, "verified");
  assert.equal(result.awsConnection.accountId, "123456789012");
  assert.equal(result.awsConnection.roleArn, roleArn);
  assert.equal(result.awsConnection.lastVerifiedAt, verifiedAt.toISOString());
  assert.equal("credentials" in result, false);
  assert.deepEqual(tester.calls, [
    {
      roleArn,
      externalId,
      region: "ap-northeast-2"
    }
  ]);
});

test("verifyAwsConnection rejects storing verified metadata when role ARN account and caller account differ", async () => {
  const repository = new FakeAwsConnectionRepository();
  repository.awsConnection = createAwsConnectionRecord();
  const tester = new FakeAwsConnectionTester("999999999999");

  await assert.rejects(
    () =>
      verifyAwsConnection(
        {
          projectId,
          connectionId: awsConnectionId,
          accessContext: {
            kind: "user",
            userId
          },
          roleArn
        },
        repository,
        tester,
        {
          now: () => verifiedAt
        }
      ),
    (error) => {
      assert.equal(error instanceof AwsConnectionVerificationError, true);
      assert.equal((error as Error).message, "AWS Role account mismatch");

      return true;
    }
  );

  assert.equal(repository.awsConnection.status, "failed");
  assert.equal(repository.awsConnection.accountId, "999999999999");
  assert.equal(repository.awsConnection.roleArn, roleArn);
});

test("verifyAwsConnection rejects verification when the stored region is not ap-northeast-2", async () => {
  const repository = new FakeAwsConnectionRepository();
  repository.awsConnection = createAwsConnectionRecord({
    region: "us-east-1"
  });
  const tester = new FakeAwsConnectionTester();

  await assert.rejects(
    () =>
      verifyAwsConnection(
        {
          projectId,
          connectionId: awsConnectionId,
          accessContext: {
            kind: "user",
            userId
          },
          roleArn
        },
        repository,
        tester,
        {
          now: () => verifiedAt
        }
      ),
    (error) => {
      assert.equal(error instanceof AwsConnectionVerificationError, true);
      assert.equal((error as Error).message, "AWS connection region must be ap-northeast-2");

      return true;
    }
  );

  assert.deepEqual(tester.calls, []);
  assert.equal(repository.awsConnection.status, "failed");
});

test("verifyAwsConnection refuses to verify when the stored externalId is missing", async () => {
  const repository = new FakeAwsConnectionRepository();
  repository.awsConnection = createAwsConnectionRecord({
    externalId: ""
  });
  const tester = new FakeAwsConnectionTester();

  await assert.rejects(
    () =>
      verifyAwsConnection(
        {
          projectId,
          connectionId: awsConnectionId,
          accessContext: {
            kind: "user",
            userId
          },
          roleArn
        },
        repository,
        tester,
        {
          now: () => verifiedAt
        }
      ),
    (error) => {
      assert.equal(error instanceof AwsConnectionVerificationError, true);
      assert.equal((error as Error).message, "AWS connection external ID is missing");

      return true;
    }
  );

  assert.deepEqual(tester.calls, []);
  assert.equal(repository.awsConnection.status, "failed");
});

test("verifyAwsConnection masks raw STS failures and stores failed metadata", async () => {
  const repository = new FakeAwsConnectionRepository();
  repository.awsConnection = createAwsConnectionRecord();
  const tester = new FakeAwsConnectionTester(
    "123456789012",
    new Error("AccessDenied: temporary-secret-access-key should not leak")
  );

  await assert.rejects(
    () =>
      verifyAwsConnection(
        {
          projectId,
          connectionId: awsConnectionId,
          accessContext: {
            kind: "user",
            userId
          },
          roleArn
        },
        repository,
        tester,
        {
          now: () => verifiedAt
        }
      ),
    (error) => {
      assert.equal((error as Error).message, "AWS Role connection test failed");
      assert.equal((error as Error).message.includes("temporary-secret-access-key"), false);

      return true;
    }
  );

  assert.equal(repository.awsConnection.status, "failed");
  assert.equal(repository.awsConnection.accountId, null);
  assert.equal(repository.awsConnection.roleArn, roleArn);
});

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

function createAwsConnectionRecord(
  overrides: Partial<AwsConnectionRecord> = {}
): AwsConnectionRecord {
  return {
    id: awsConnectionId,
    projectId,
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
