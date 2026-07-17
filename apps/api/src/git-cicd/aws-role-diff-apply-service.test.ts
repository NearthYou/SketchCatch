import assert from "node:assert/strict";
import test from "node:test";
import type { AwsConnection } from "@sketchcatch/types";
import {
  createConnectedIamAwsRoleDiffGateway,
  type AwsRoleDiffGateway
} from "./aws-role-diff-apply-service.js";

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
