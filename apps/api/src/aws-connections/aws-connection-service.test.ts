import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AwsConnectionDeleteConflictError,
  AwsConnectionVerificationError,
  createRecommendedAwsConnectionRoleArn,
  createAwsConnection,
  deleteAwsConnection,
  listAwsConnections,
  pruneStaleAwsConnections,
  selectPrunableAwsConnections,
  verifyAwsConnection,
  verifyAwsConnectionCreatedRole,
  type AwsConnectionRecord,
  type AwsConnectionRepository
} from "./aws-connection-service.js";
import type { AwsConnectionTester } from "./aws-connection-test-service.js";
import type { ProjectAccessContext } from "../deployments/deployment-service.js";

const userId = "22222222-2222-4222-8222-222222222222";
const awsConnectionId = "33333333-3333-4333-8333-333333333333";
const callerPrincipalArn = "arn:aws:iam::123456789012:role/SketchCatchRuntimeRole";
const externalId = "sc_conn_33333333-3333-4333-8333-333333333333_random";
const fixedNow = new Date("2026-06-26T00:00:00.000Z");
const verifiedAt = new Date("2026-06-26T01:23:45.000Z");
const roleArn = "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole";
const generatedRoleName = "SketchCatchTerraformExecutionRole-33333333";
const generatedRoleArn = `arn:aws:iam::123456789012:role/${generatedRoleName}`;

class FakeAwsConnectionRepository implements AwsConnectionRepository {
  readonly calls: Array<{ name: string; [key: string]: unknown }> = [];
  awsConnections: AwsConnectionRecord[] = [];
  duplicateAwsConnection: AwsConnectionRecord | undefined;
  deploymentUsesConnection = false;
  deploymentUsedConnectionIds = new Set<string>();

  get awsConnection(): AwsConnectionRecord | undefined {
    return this.awsConnections[0];
  }

  set awsConnection(value: AwsConnectionRecord | undefined) {
    this.awsConnections = value ? [value] : [];
  }

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

    const awsConnection = {
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
    this.awsConnections = [
      awsConnection,
      ...this.awsConnections.filter((connection) => connection.id !== input.id)
    ];

    return awsConnection;
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

    return this.awsConnections.find(
      (awsConnection) =>
        awsConnection.id === candidateConnectionId && awsConnection.userId === accessContext.userId
    );
  }

  async listAccessibleAwsConnections(accessContext: ProjectAccessContext) {
    this.calls.push({
      name: "listAccessibleAwsConnections",
      accessContext
    });

    return this.awsConnections.filter((awsConnection) => awsConnection.userId === accessContext.userId);
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

    return [...this.awsConnections, this.duplicateAwsConnection].find(
      (awsConnection) =>
        awsConnection?.userId === accessContext.userId &&
        awsConnection.accountId === accountId &&
        awsConnection.status === "verified"
    );
  }

  async findAwsConnectionById(candidateConnectionId: string) {
    return this.awsConnections.find((awsConnection) => awsConnection.id === candidateConnectionId);
  }

  async hasDeploymentUsingAwsConnection(candidateConnectionId: string) {
    this.calls.push({
      name: "hasDeploymentUsingAwsConnection",
      connectionId: candidateConnectionId
    });

    return (
      this.deploymentUsedConnectionIds.has(candidateConnectionId) ||
      (this.deploymentUsesConnection && candidateConnectionId === this.awsConnection?.id)
    );
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

    const deletedConnection = this.awsConnections.find(
      (awsConnection) =>
        awsConnection.id === candidateConnectionId && awsConnection.userId === accessContext.userId
    );

    if (!deletedConnection) {
      return undefined;
    }

    this.awsConnections = this.awsConnections.filter(
      (awsConnection) => awsConnection.id !== candidateConnectionId
    );

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

    const awsConnection = this.awsConnections.find(
      (candidateConnection) => candidateConnection.id === input.connectionId
    );

    if (!awsConnection) {
      return undefined;
    }

    const updatedConnection = {
      ...awsConnection,
      accountId: input.accountId,
      roleArn: input.roleArn,
      status: input.status,
      lastVerifiedAt: input.lastVerifiedAt,
      updatedAt: input.lastVerifiedAt ?? awsConnection.updatedAt
    };
    this.awsConnections = this.awsConnections.map((candidateConnection) =>
      candidateConnection.id === input.connectionId ? updatedConnection : candidateConnection
    );

    return updatedConnection;
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
  assert.equal(result.awsConnection.userId, userId);
  assert.equal(result.awsConnection.externalId, externalId);
  assert.equal(result.awsConnection.status, "pending");
  assert.equal(result.awsConnection.accountId, null);
  assert.equal(result.awsConnection.roleArn, null);
  assert.equal(result.callerPrincipalArn, callerPrincipalArn);
  assert.equal(result.recommendedRoleName, generatedRoleName);
  assert.deepEqual(result.roleSetup, {
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
      terraformPolicyDocument: result.roleSetup.permissionSetup.terraformPolicyDocument
    }
  });
  assert.notEqual(result.roleSetup.permissionSetup.terraformPolicyDocument, null);
  assert.deepEqual(result.roleSetup.permissionSetup.terraformPolicyDocument, {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: "ec2:*",
        Resource: "*"
      },
      {
        Effect: "Allow",
        Action: "s3:*",
        Resource: "*"
      },
      {
        Effect: "Allow",
        Action: [
          "ce:GetCostAndUsage",
          "ce:GetDimensionValues",
          "autoscaling:DescribeAutoScalingGroups",
          "autoscaling:DescribeScalingActivities",
          "ec2:DescribeInstances",
          "elasticloadbalancing:DescribeLoadBalancers",
          "elasticloadbalancing:DescribeTargetGroups",
          "elasticloadbalancing:DescribeTargetHealth",
          "cloudwatch:GetMetricData",
          "cloudwatch:GetMetricStatistics",
          "ecs:DescribeServices",
          "logs:FilterLogEvents"
        ],
        Resource: "*"
      }
    ]
  });
  assert.deepEqual(result.callerRoleSetup, {
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
      name: "createAwsConnection",
      input: {
        id: awsConnectionId,
        userId,
        externalId,
        region: "ap-northeast-2",
        status: "pending"
      }
    }
  ]);
});

test("listAwsConnections returns user-owned connection metadata", async () => {
  const repository = new FakeAwsConnectionRepository();
  repository.awsConnection = createAwsConnectionRecord({
    accountId: "123456789012",
    roleArn,
    status: "verified",
    lastVerifiedAt: verifiedAt
  });

  const result = await listAwsConnections(
    {
      accessContext: {
        kind: "user",
        userId
      }
    },
    repository
  );

  assert.equal(result.length, 1);
  assert.equal(result[0]?.id, awsConnectionId);
  assert.equal(result[0]?.status, "verified");
  assert.equal(result[0]?.roleArn, roleArn);
  assert.equal(result[0]?.lastVerifiedAt, verifiedAt.toISOString());
});

test("deleteAwsConnection removes an accessible connection that is not used by deployments", async () => {
  const repository = new FakeAwsConnectionRepository();
  repository.awsConnection = createAwsConnectionRecord({
    accountId: "123456789012",
    roleArn,
    status: "verified",
    lastVerifiedAt: verifiedAt
  });

  await deleteAwsConnection(
    {
      connectionId: awsConnectionId,
      accessContext: {
        kind: "user",
        userId
      }
    },
    repository
  );

  assert.equal(repository.awsConnection, undefined);
});

test("deleteAwsConnection rejects deleting a connection that is used by a deployment", async () => {
  const repository = new FakeAwsConnectionRepository();
  repository.awsConnection = createAwsConnectionRecord({
    accountId: "123456789012",
    roleArn,
    status: "verified",
    lastVerifiedAt: verifiedAt
  });
  repository.deploymentUsesConnection = true;

  await assert.rejects(
    () =>
      deleteAwsConnection(
        {
          connectionId: awsConnectionId,
          accessContext: {
            kind: "user",
            userId
          }
        },
        repository
      ),
    (error) => {
      assert.equal(error instanceof AwsConnectionDeleteConflictError, true);
      assert.equal((error as Error).message, "AWS connection is used by a deployment");

      return true;
    }
  );

  assert.equal(repository.awsConnection?.id, awsConnectionId);
});

test("selectPrunableAwsConnections keeps verified and newest unverified connections", () => {
  const verifiedConnection = createAwsConnectionRecord({
    id: "10000000-0000-4000-8000-000000000001",
    status: "verified",
    updatedAt: date("2026-06-20")
  });
  const recentPendingConnection = createAwsConnectionRecord({
    id: "10000000-0000-4000-8000-000000000002",
    status: "pending",
    updatedAt: date("2026-06-19")
  });
  const protectedFailedConnection = createAwsConnectionRecord({
    id: "10000000-0000-4000-8000-000000000003",
    status: "failed",
    updatedAt: date("2026-06-18")
  });
  const stalePendingConnection = createAwsConnectionRecord({
    id: "10000000-0000-4000-8000-000000000004",
    status: "pending",
    updatedAt: date("2026-06-17")
  });

  const result = selectPrunableAwsConnections({
    awsConnections: [
      stalePendingConnection,
      protectedFailedConnection,
      recentPendingConnection,
      verifiedConnection
    ],
    policy: {
      maxUnverifiedConnectionsPerUser: 1
    },
    protectedConnectionIds: new Set([protectedFailedConnection.id])
  });

  assert.deepEqual(
    result.map((awsConnection) => awsConnection.id),
    [stalePendingConnection.id]
  );
});

test("pruneStaleAwsConnections deletes only old unverified connections that deployments do not use", async () => {
  const repository = new FakeAwsConnectionRepository();
  const verifiedConnection = createAwsConnectionRecord({
    id: "10000000-0000-4000-8000-000000000001",
    status: "verified",
    updatedAt: date("2026-06-20")
  });
  const recentPendingConnection = createAwsConnectionRecord({
    id: "10000000-0000-4000-8000-000000000002",
    status: "pending",
    updatedAt: date("2026-06-19")
  });
  const deploymentUsedPendingConnection = createAwsConnectionRecord({
    id: "10000000-0000-4000-8000-000000000003",
    status: "pending",
    updatedAt: date("2026-06-18")
  });
  const protectedFailedConnection = createAwsConnectionRecord({
    id: "10000000-0000-4000-8000-000000000004",
    status: "failed",
    updatedAt: date("2026-06-17")
  });
  const staleFailedConnection = createAwsConnectionRecord({
    id: "10000000-0000-4000-8000-000000000005",
    status: "failed",
    updatedAt: date("2026-06-16")
  });
  repository.awsConnections = [
    verifiedConnection,
    recentPendingConnection,
    deploymentUsedPendingConnection,
    protectedFailedConnection,
    staleFailedConnection
  ];
  repository.deploymentUsedConnectionIds.add(deploymentUsedPendingConnection.id);

  const result = await pruneStaleAwsConnections(
    {
      accessContext: {
        kind: "user",
        userId
      },
      protectedConnectionIds: [protectedFailedConnection.id]
    },
    repository,
    {
      maxUnverifiedConnectionsPerUser: 1
    }
  );

  assert.deepEqual(result.awsConnectionIdsDeleted, [staleFailedConnection.id]);
  assert.deepEqual(
    repository.awsConnections.map((awsConnection) => awsConnection.id),
    [
      verifiedConnection.id,
      recentPendingConnection.id,
      deploymentUsedPendingConnection.id,
      protectedFailedConnection.id
    ]
  );
});

test("verifyAwsConnection stores only verified role metadata after STS caller identity succeeds", async () => {
  const repository = new FakeAwsConnectionRepository();
  repository.awsConnection = createAwsConnectionRecord();
  const tester = new FakeAwsConnectionTester();

  const result = await verifyAwsConnection(
    {
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

test("verifyAwsConnectionCreatedRole verifies the connection-scoped CloudFormation role from account id", async () => {
  const repository = new FakeAwsConnectionRepository();
  repository.awsConnection = createAwsConnectionRecord();
  const tester = new FakeAwsConnectionTester();

  const result = await verifyAwsConnectionCreatedRole(
    {
      connectionId: awsConnectionId,
      accessContext: {
        kind: "user",
        userId
      },
      accountId: "123456789012"
    },
    repository,
    tester,
    {
      now: () => verifiedAt
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.awsConnection.roleArn, generatedRoleArn);
  assert.deepEqual(tester.calls, [
    {
      roleArn: generatedRoleArn,
      externalId,
      region: "ap-northeast-2"
    }
  ]);
});

test("createRecommendedAwsConnectionRoleArn rejects malformed account ids", () => {
  assert.equal(
    createRecommendedAwsConnectionRoleArn("123456789012", awsConnectionId),
    generatedRoleArn
  );
  assert.throws(
    () => createRecommendedAwsConnectionRoleArn("1234"),
    /AWS account ID must be 12 digits/
  );
});

test("verifyAwsConnection rejects storing verified metadata when role ARN account and caller account differ", async () => {
  const repository = new FakeAwsConnectionRepository();
  repository.awsConnection = createAwsConnectionRecord();
  const tester = new FakeAwsConnectionTester("999999999999");

  await assert.rejects(
    () =>
      verifyAwsConnection(
        {
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

test("verifyAwsConnection rejects duplicate verified AWS account for the same user", async () => {
  const repository = new FakeAwsConnectionRepository();
  repository.awsConnection = createAwsConnectionRecord();
  repository.duplicateAwsConnection = createAwsConnectionRecord({
    id: "44444444-4444-4444-8444-444444444444",
    accountId: "123456789012",
    roleArn,
    status: "verified",
    lastVerifiedAt: verifiedAt
  });
  const tester = new FakeAwsConnectionTester();

  await assert.rejects(
    () =>
      verifyAwsConnection(
        {
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
      assert.equal((error as Error).message, "AWS account is already connected");

      return true;
    }
  );

  assert.equal(repository.awsConnection.status, "failed");
  assert.equal(repository.awsConnection.accountId, "123456789012");
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

function date(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
