import assert from "node:assert/strict";
import { test } from "node:test";
import type { ProjectAccessContext } from "../deployments/deployment-service.js";
import {
  createAwsConnection,
  getAwsConnectionCloudFormationTemplate,
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
