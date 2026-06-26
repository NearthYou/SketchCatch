import { test } from "node:test";
import assert from "node:assert/strict";
import type { AwsConnection } from "@sketchcatch/types";
import {
  AwsConnectionRuntimeCredentialsError,
  assertAwsApplyPreconditions,
  prepareTerraformAwsCredentialEnv
} from "./aws-connection-runtime-credentials.js";
import type { AwsConnectionStsGateway } from "./aws-connection-test-service.js";

const roleArn = "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole";
const externalId = "sc_conn_33333333-3333-4333-8333-333333333333_random";

class FakeAwsConnectionStsGateway implements AwsConnectionStsGateway {
  readonly assumeRoleCalls: Array<{
    roleArn: string;
    externalId?: string;
    region: string;
    roleSessionName: string;
  }> = [];
  readonly getCallerIdentityCalls: Array<{
    region: string;
    credentials: {
      accessKeyId: string;
      secretAccessKey: string;
      sessionToken: string;
    };
  }> = [];

  constructor(
    private readonly accountId = "123456789012",
    private readonly assumeRoleError?: Error,
    private readonly options: { allowAssumeWithoutExternalId?: boolean } = {}
  ) {}

  async assumeRole(input: {
    roleArn: string;
    externalId?: string;
    region: string;
    roleSessionName: string;
  }) {
    this.assumeRoleCalls.push(input);

    if (this.assumeRoleError) {
      throw this.assumeRoleError;
    }

    if (!input.externalId && !this.options.allowAssumeWithoutExternalId) {
      throw new Error("AccessDenied: external ID is required");
    }

    return {
      accessKeyId: "temporary-access-key-id",
      secretAccessKey: "temporary-secret-access-key",
      sessionToken: "temporary-session-token"
    };
  }

  async getCallerIdentity(input: {
    region: string;
    credentials: {
      accessKeyId: string;
      secretAccessKey: string;
      sessionToken: string;
    };
  }) {
    this.getCallerIdentityCalls.push(input);

    return {
      accountId: this.accountId,
      callerArn:
        "arn:aws:sts::123456789012:assumed-role/SketchCatchTerraformExecutionRole/sketchcatch-terraform"
    };
  }
}

test("prepareTerraformAwsCredentialEnv assumes the verified role and returns temporary AWS env only", async () => {
  const gateway = new FakeAwsConnectionStsGateway();

  const result = await prepareTerraformAwsCredentialEnv(
    createVerifiedAwsConnection(),
    gateway,
    {
      createRoleSessionName: () => "sketchcatch-terraform"
    }
  );

  assert.deepEqual(gateway.assumeRoleCalls, [
    {
      roleArn,
      externalId,
      region: "ap-northeast-2",
      roleSessionName: "sketchcatch-terraform"
    },
    {
      roleArn,
      region: "ap-northeast-2",
      roleSessionName: "sketchcatch-terraform"
    }
  ]);
  assert.deepEqual(result.env, {
    AWS_ACCESS_KEY_ID: "temporary-access-key-id",
    AWS_SECRET_ACCESS_KEY: "temporary-secret-access-key",
    AWS_SESSION_TOKEN: "temporary-session-token",
    AWS_REGION: "ap-northeast-2"
  });
  assert.equal(result.accountId, "123456789012");
  assert.equal(result.region, "ap-northeast-2");
});

test("prepareTerraformAwsCredentialEnv rejects a role that can be assumed without externalId", async () => {
  const gateway = new FakeAwsConnectionStsGateway("123456789012", undefined, {
    allowAssumeWithoutExternalId: true
  });

  await assert.rejects(
    () =>
      prepareTerraformAwsCredentialEnv(createVerifiedAwsConnection(), gateway, {
        createRoleSessionName: () => "sketchcatch-terraform"
      }),
    (error) => {
      assert.equal(error instanceof AwsConnectionRuntimeCredentialsError, true);
      assert.equal((error as Error).message, "AWS Role trust policy must require external ID");

      return true;
    }
  );
});

test("prepareTerraformAwsCredentialEnv masks raw STS failures before returning Terraform env", async () => {
  const gateway = new FakeAwsConnectionStsGateway(
    "123456789012",
    new Error("AccessDenied: temporary-secret-access-key should not leak")
  );

  await assert.rejects(
    () =>
      prepareTerraformAwsCredentialEnv(createVerifiedAwsConnection(), gateway, {
        createRoleSessionName: () => "sketchcatch-terraform"
      }),
    (error) => {
      assert.equal(error instanceof AwsConnectionRuntimeCredentialsError, true);
      assert.equal((error as Error).message, "AWS Role connection test failed");
      assert.equal((error as Error).message.includes("temporary-secret-access-key"), false);

      return true;
    }
  );
});

test("prepareTerraformAwsCredentialEnv blocks when rechecked account does not match the approved connection", async () => {
  const gateway = new FakeAwsConnectionStsGateway("999999999999");

  await assert.rejects(
    () =>
      prepareTerraformAwsCredentialEnv(createVerifiedAwsConnection(), gateway, {
        createRoleSessionName: () => "sketchcatch-terraform"
      }),
    /AWS Role account mismatch/
  );
});

test("assertAwsApplyPreconditions blocks account region and tfplan hash drift before apply", () => {
  assert.throws(
    () =>
      assertAwsApplyPreconditions({
        approvedAccountId: "123456789012",
        currentAccountId: "999999999999",
        approvedRegion: "ap-northeast-2",
        currentRegion: "ap-northeast-2",
        approvedTfplanHash: "hash-a",
        currentTfplanHash: "hash-a"
      }),
    /AWS account changed before apply/
  );

  assert.throws(
    () =>
      assertAwsApplyPreconditions({
        approvedAccountId: "123456789012",
        currentAccountId: "123456789012",
        approvedRegion: "ap-northeast-2",
        currentRegion: "us-east-1",
        approvedTfplanHash: "hash-a",
        currentTfplanHash: "hash-a"
      }),
    /AWS region changed before apply/
  );

  assert.throws(
    () =>
      assertAwsApplyPreconditions({
        approvedAccountId: "123456789012",
        currentAccountId: "123456789012",
        approvedRegion: "ap-northeast-2",
        currentRegion: "ap-northeast-2",
        approvedTfplanHash: "hash-a",
        currentTfplanHash: "hash-b"
      }),
    /Terraform plan changed before apply/
  );
});

function createVerifiedAwsConnection(overrides: Partial<AwsConnection> = {}): AwsConnection {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    projectId: "11111111-1111-4111-8111-111111111111",
    userId: "22222222-2222-4222-8222-222222222222",
    accountId: "123456789012",
    roleArn,
    externalId,
    region: "ap-northeast-2",
    status: "verified",
    lastVerifiedAt: "2026-06-26T00:00:00.000Z",
    createdAt: "2026-06-26T00:00:00.000Z",
    updatedAt: "2026-06-26T00:00:00.000Z",
    ...overrides
  };
}
