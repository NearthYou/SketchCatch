import assert from "node:assert/strict";
import { test } from "node:test";
import type { ProjectAccessContext } from "../deployments/deployment-service.js";
import {
  listAwsConnections,
  type AwsConnectionRecord,
  type AwsConnectionRepository
} from "./aws-connection-service.js";

const accessContext: ProjectAccessContext = {
  kind: "user",
  userId: "22222222-2222-4222-8222-222222222222"
};

test("listAwsConnections hides pending and failed connection attempts", async () => {
  const result = await listAwsConnections(
    { accessContext },
    createRepository([
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

function createRepository(rows: AwsConnectionRecord[]): AwsConnectionRepository {
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
