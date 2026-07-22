import assert from "node:assert/strict";
import test from "node:test";
import type { AwsConnection } from "@sketchcatch/types";
import {
  applyGitCicdAwsRoleDiff,
  AwsRoleDiffApplyError,
  createConnectedIamAwsRoleDiffGateway,
  type AwsRoleDiffGateway
} from "./aws-role-diff-apply-service.js";
import type {
  GitCicdHandoffRecord,
  GitCicdHandoffRepository
} from "./git-cicd-handoff-service.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const roleArn =
  "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole-11111111";

test("AWS role diff uses the verified project connection credentials", async () => {
  const connection = createVerifiedConnection();
  const expectedGateway: AwsRoleDiffGateway = {
    async getAssumeRolePolicy() {
      return {};
    },
    async updateAssumeRolePolicy() {}
  };
  let receivedCredentials:
    | { accessKeyId: string; secretAccessKey: string; sessionToken: string }
    | undefined;

  const gateway = await createConnectedIamAwsRoleDiffGateway({
    projectId,
    accessContext: { kind: "user", userId },
    roleArn,
    connectionRepository: {
      async findVerifiedProjectAwsConnection(candidateProjectId, accessContext) {
        assert.equal(candidateProjectId, projectId);
        assert.equal(accessContext.userId, userId);
        return connection;
      }
    },
    stsGateway: {
      async assumeRole(input) {
        if (!input.externalId) {
          const error = new Error("expected denial without external ID");
          error.name = "AccessDenied";
          throw error;
        }

        assert.equal(input.roleArn, roleArn);
        assert.equal(input.externalId, connection.externalId);
        assert.ok(input.roleSessionName.length <= 64);
        return {
          accessKeyId: "temporary-access-key",
          secretAccessKey: "temporary-secret-key",
          sessionToken: "temporary-session-token"
        };
      },
      async getCallerIdentity() {
        return {
          accountId: "123456789012",
          callerArn: `arn:aws:sts::123456789012:assumed-role/${roleArn.split("/").at(-1)}/test`
        };
      }
    },
    createGateway(options) {
      receivedCredentials = options.credentials;
      return expectedGateway;
    }
  });

  assert.equal(gateway, expectedGateway);
  assert.deepEqual(receivedCredentials, {
    accessKeyId: "temporary-access-key",
    secretAccessKey: "temporary-secret-key",
    sessionToken: "temporary-session-token"
  });
});

test("AWS role diff replaces only the matching legacy trust and preserves other statements", async () => {
  const handoff = createHandoff();
  const otherRepositorySub = "repo:sketchcatch/other:environment:sketchcatch-production";
  const unrelatedStatement = {
    Sid: "UnrelatedTrust",
    Effect: "Allow",
    Principal: { Service: "ecs-tasks.amazonaws.com" },
    Action: "sts:AssumeRole"
  };
  const matchingLegacyStatement = createLegacyStatement(
    handoff.awsRoleDiff?.requiredTrustConditions["token.actions.githubusercontent.com:sub"] ?? ""
  );
  const otherRepositoryLegacyStatement = createLegacyStatement(otherRepositorySub);
  let storedPolicy: Record<string, unknown> = {
    Version: "2012-10-17",
    Statement: [unrelatedStatement, matchingLegacyStatement, otherRepositoryLegacyStatement]
  };
  const writtenPolicies: Record<string, unknown>[] = [];
  const persistedDiffs: unknown[] = [];

  const result = await applyGitCicdAwsRoleDiff(
    {
      handoffId: handoff.id,
      accessContext: { kind: "user", userId }
    },
    createRepository(handoff, (awsRoleDiff) => {
      persistedDiffs.push(awsRoleDiff);
      return { ...handoff, awsRoleDiff } as GitCicdHandoffRecord;
    }),
    {
      async getAssumeRolePolicy() {
        return storedPolicy;
      },
      async updateAssumeRolePolicy(_candidateRoleArn, policy) {
        writtenPolicies.push(policy);
        storedPolicy = policy;
      }
    }
  );

  assert.equal(result.verified, true);
  assert.equal(writtenPolicies.length, 1);
  assert.equal(persistedDiffs.length, 1);

  const statements = writtenPolicies[0]?.Statement;
  assert.ok(Array.isArray(statements));
  assert.ok(statements.some((statement) => statement === unrelatedStatement));
  assert.ok(statements.some((statement) => statement === otherRepositoryLegacyStatement));
  assert.ok(!statements.some((statement) => statement === matchingLegacyStatement));

  const scopedStatement = statements.find(
    (statement) =>
      typeof statement === "object" &&
      statement !== null &&
      "Sid" in statement &&
      statement.Sid !== "SketchCatchGitHubActionsOidc" &&
      String(statement.Sid).startsWith("SketchCatchGitHubActionsOidc")
  );
  assert.ok(scopedStatement && "Sid" in scopedStatement);
  assert.match(String(scopedStatement.Sid), /^[A-Za-z0-9]+$/u);
});

test("AWS role diff skips the IAM write when the scoped trust is already exact", async () => {
  const handoff = createHandoff();
  let storedPolicy: Record<string, unknown> = { Version: "2012-10-17", Statement: [] };
  let writeCount = 0;
  let persistCount = 0;
  const repository = createRepository(handoff, (awsRoleDiff) => {
    persistCount += 1;
    return { ...handoff, awsRoleDiff } as GitCicdHandoffRecord;
  });
  const gateway: AwsRoleDiffGateway = {
    async getAssumeRolePolicy() {
      return storedPolicy;
    },
    async updateAssumeRolePolicy(_candidateRoleArn, policy) {
      writeCount += 1;
      storedPolicy = policy;
    }
  };

  await applyGitCicdAwsRoleDiff(
    { handoffId: handoff.id, accessContext: { kind: "user", userId } },
    repository,
    gateway
  );
  const firstPolicy = structuredClone(storedPolicy);

  await applyGitCicdAwsRoleDiff(
    { handoffId: handoff.id, accessContext: { kind: "user", userId } },
    repository,
    gateway
  );

  assert.equal(writeCount, 1);
  assert.equal(persistCount, 2);
  assert.deepEqual(storedPolicy, firstPolicy);
});

test("AWS role diff refuses to mutate IAM when verified evidence cannot be persisted", async () => {
  const handoff = createHandoff();
  let writeCount = 0;
  const repository = {
    async findAccessibleProject() {
      return { id: projectId };
    },
    async findHandoffById() {
      return handoff;
    }
  } as unknown as GitCicdHandoffRepository;

  await assert.rejects(
    applyGitCicdAwsRoleDiff(
      { handoffId: handoff.id, accessContext: { kind: "user", userId } },
      repository,
      {
        async getAssumeRolePolicy() {
          return { Version: "2012-10-17", Statement: [] };
        },
        async updateAssumeRolePolicy() {
          writeCount += 1;
        }
      }
    ),
    (error: unknown) =>
      error instanceof AwsRoleDiffApplyError && /persist/iu.test(error.message)
  );

  assert.equal(writeCount, 0);
});

test("AWS role diff does not report success unless persisted evidence is verified", async () => {
  const handoff = createHandoff();
  let storedPolicy: Record<string, unknown> = { Version: "2012-10-17", Statement: [] };

  await assert.rejects(
    applyGitCicdAwsRoleDiff(
      { handoffId: handoff.id, accessContext: { kind: "user", userId } },
      createRepository(handoff, () => handoff),
      {
        async getAssumeRolePolicy() {
          return storedPolicy;
        },
        async updateAssumeRolePolicy(_candidateRoleArn, policy) {
          storedPolicy = policy;
        }
      }
    ),
    (error: unknown) =>
      error instanceof AwsRoleDiffApplyError && /persist|evidence/iu.test(error.message)
  );
});

function createVerifiedConnection(): AwsConnection {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    userId,
    accountId: "123456789012",
    roleArn,
    externalId: "sketchcatch-external-id",
    region: "ap-northeast-2",
    status: "verified",
    lastVerifiedAt: "2026-07-17T00:00:00.000Z",
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z"
  };
}

function createHandoff(): GitCicdHandoffRecord {
  return {
    id: "handoff-1",
    projectId,
    awsRoleDiff: {
      roleArn,
      repository: "sketchcatch/example",
      targetBranch: "main",
      environmentName: "sketchcatch-production",
      requiredTrustConditions: {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub":
          "repo:sketchcatch/example:environment:sketchcatch-production"
      },
      approved: false,
      approvedByUserId: null,
      approvedAt: null
    }
  } as unknown as GitCicdHandoffRecord;
}

function createRepository(
  handoff: GitCicdHandoffRecord,
  persist: (awsRoleDiff: NonNullable<GitCicdHandoffRecord["awsRoleDiff"]>) => GitCicdHandoffRecord
): GitCicdHandoffRepository {
  return {
    async findAccessibleProject() {
      return { id: projectId };
    },
    async findHandoffById() {
      return handoff;
    },
    async updateHandoffAutomationMetadata(
      _handoffId: string,
      input: { awsRoleDiff?: GitCicdHandoffRecord["awsRoleDiff"] }
    ) {
      assert.ok(input.awsRoleDiff);
      return persist(input.awsRoleDiff);
    }
  } as unknown as GitCicdHandoffRepository;
}

function createLegacyStatement(subject: string): Record<string, unknown> {
  return {
    Sid: "SketchCatchGitHubActionsOidc",
    Effect: "Allow",
    Principal: {
      Federated:
        "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
    },
    Action: "sts:AssumeRoleWithWebIdentity",
    Condition: {
      StringEquals: {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": subject
      }
    }
  };
}
