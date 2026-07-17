import assert from "node:assert/strict";
import { test } from "node:test";
import type { ProjectAccessContext } from "../deployments/deployment-service.js";
import {
  createAwsConnection,
  getAwsConnectionCloudFormationTemplate,
  listAwsConnections,
  type AwsConnectionRecord,
  type AwsConnectionRepository
} from "./aws-connection-service.js";

const accessContext: ProjectAccessContext = {
  kind: "user",
  userId: "user-1"
};
const apiCallerPrincipalArn = "arn:aws:iam::555980271919:role/sketchcatch-production-ecs-task";
const workerCallerPrincipalArn =
  "arn:aws:iam::555980271919:role/sketchcatch-production-ecs-worker-task";

test("listAwsConnections hides pending and failed connection attempts", async () => {
  const result = await listAwsConnections(
    { accessContext },
    createListRepository([
      createAwsConnectionRecord({ id: "pending", status: "pending" }),
      createAwsConnectionRecord({ id: "failed", status: "failed" }),
      createAwsConnectionRecord({
        id: "verified",
        accountId: "123456789012",
        roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole",
        status: "verified"
      })
    ])
  );

  assert.deepEqual(result.map((connection) => connection.id), ["verified"]);
});

test("listAwsConnections returns pending and failed attempts only when explicitly requested", async () => {
  const result = await listAwsConnections(
    { accessContext },
    createListRepository([
      createAwsConnectionRecord({ id: "pending", status: "pending" }),
      createAwsConnectionRecord({ id: "failed", status: "failed" }),
      createAwsConnectionRecord({
        id: "verified",
        accountId: "123456789012",
        roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole",
        status: "verified"
      })
    ]),
    { includeUnverified: true }
  );

  assert.deepEqual(result.map((connection) => connection.id), ["pending", "failed", "verified"]);
});

test("AWS connection templates trust every configured runtime caller role", async () => {
  const repository = createInMemoryAwsConnectionRepository();
  const result = await createAwsConnection(
    {
      accessContext,
      region: "ap-northeast-2",
      callerPrincipalArns: [apiCallerPrincipalArn, workerCallerPrincipalArn]
    },
    repository,
    {
      generateId: () => "c0ccf1a1-1111-4222-8333-444444444444",
      generateExternalId: () => "test-external-id"
    }
  );

  assert.deepEqual(
    (result.trustPolicyTemplate.Statement as Array<Record<string, unknown>>)[0]?.Principal,
    {
      AWS: [apiCallerPrincipalArn, workerCallerPrincipalArn]
    }
  );
  assert.equal(result.callerPrincipalArn, apiCallerPrincipalArn);
  assert.equal(result.roleSetup.trustedPrincipalArn, apiCallerPrincipalArn);

  const template = await getAwsConnectionCloudFormationTemplate(
    {
      connectionId: result.awsConnection.id,
      accessContext,
      callerPrincipalArns: [apiCallerPrincipalArn, workerCallerPrincipalArn]
    },
    repository
  );

  assert.match(template.templateBody, /AWS:\n\s+- "arn:aws:iam::555980271919:role\/sketchcatch-production-ecs-task"/);
  assert.match(
    template.templateBody,
    /- "arn:aws:iam::555980271919:role\/sketchcatch-production-ecs-worker-task"/
  );
});

test("AWS connection Terraform permissions scope PassRole to runtime services", async () => {
  const repository = createInMemoryAwsConnectionRepository();
  const result = await createAwsConnection(
    {
      accessContext,
      region: "ap-northeast-2",
      callerPrincipalArns: [apiCallerPrincipalArn, workerCallerPrincipalArn]
    },
    repository,
    {
      generateId: () => "c0ccf1a1-1111-4222-8333-444444444444",
      generateExternalId: () => "test-external-id"
    }
  );
  const policy = result.roleSetup.permissionSetup.terraformPolicyDocument as {
    Statement: Array<Record<string, unknown>>;
  };
  const passRoleStatement = policy.Statement.find(
    (statement) => statement["Action"] === "iam:PassRole"
  );

  assert.deepEqual(passRoleStatement, {
    Effect: "Allow",
    Action: "iam:PassRole",
    Resource: "arn:aws:iam::*:role/*",
    Condition: {
      StringEquals: {
        "iam:PassedToService": [
          "autoscaling.amazonaws.com",
          "codebuild.amazonaws.com",
          "codedeploy.amazonaws.com",
          "codepipeline.amazonaws.com",
          "ec2.amazonaws.com",
          "ecs-tasks.amazonaws.com",
          "eks.amazonaws.com",
          "lambda.amazonaws.com"
        ]
      }
    }
  });
  assert.equal(
    policy.Statement.some(
      (statement) =>
        statement["Resource"] === "*" &&
        Array.isArray(statement["Action"]) &&
        statement["Action"].includes("iam:PassRole")
    ),
    false
  );

  const template = await getAwsConnectionCloudFormationTemplate(
    {
      connectionId: result.awsConnection.id,
      accessContext,
      callerPrincipalArns: [apiCallerPrincipalArn, workerCallerPrincipalArn]
    },
    repository
  );
  assert.match(
    template.templateBody,
    /Action: iam:PassRole\n\s+Resource: !Sub "arn:\$\{AWS::Partition\}:iam::\$\{AWS::AccountId\}:role\/\*"\n\s+Condition:\n\s+StringEquals:\n\s+iam:PassedToService:/
  );
});

function createInMemoryAwsConnectionRepository(): AwsConnectionRepository {
  const records = new Map<string, AwsConnectionRecord>();

  return {
    async findAccessibleAwsConnection(connectionId) {
      return records.get(connectionId);
    },
    async listAccessibleAwsConnections() {
      return [...records.values()];
    },
    async findVerifiedAwsConnectionByAccountId() {
      return undefined;
    },
    async findAwsConnectionById(connectionId) {
      return records.get(connectionId);
    },
    async hasDeploymentUsingAwsConnection() {
      return false;
    },
    async createAwsConnection(input) {
      const now = new Date("2026-07-15T00:00:00.000Z");
      const record: AwsConnectionRecord = {
        id: input.id,
        userId: input.userId,
        accountId: null,
        roleArn: null,
        externalId: input.externalId,
        region: input.region,
        status: input.status,
        lastVerifiedAt: null,
        createdAt: now,
        updatedAt: now
      };
      records.set(record.id, record);
      return record;
    },
    async deleteAccessibleAwsConnection(connectionId) {
      const record = records.get(connectionId);
      records.delete(connectionId);
      return record;
    },
    async updateAwsConnectionVerification() {
      return undefined;
    }
  };
}

// 목록 API의 표시 정책만 분리해 검증합니다.
function createListRepository(rows: AwsConnectionRecord[]): AwsConnectionRepository {
  return {
    async createAwsConnection() {
      throw new Error("Not used in this test");
    },
    async deleteAccessibleAwsConnection() {
      return undefined;
    },
    async findAccessibleAwsConnection() {
      return undefined;
    },
    async findAwsConnectionById() {
      return undefined;
    },
    async findVerifiedAwsConnectionByAccountId() {
      return undefined;
    },
    async hasDeploymentUsingAwsConnection() {
      return false;
    },
    async listAccessibleAwsConnections() {
      return rows;
    },
    async updateAwsConnectionVerification() {
      return undefined;
    }
  };
}

// 확인 완료 상태만 목록에 노출되는지를 위한 고정 연결 레코드를 만듭니다.
function createAwsConnectionRecord(
  overrides: Partial<AwsConnectionRecord>
): AwsConnectionRecord {
  const now = new Date("2026-07-15T00:00:00.000Z");

  return {
    id: "connection",
    userId: accessContext.userId,
    accountId: null,
    roleArn: null,
    externalId: "sc_conn_connection_example",
    region: "ap-northeast-2",
    status: "pending",
    lastVerifiedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}
