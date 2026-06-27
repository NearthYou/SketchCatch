import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AwsConnectionTestError,
  testAwsConnection,
  type AwsConnectionStsGateway
} from "./aws-connection-test-service.js";

const roleArn = "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole";
const externalId = "sc_conn_33333333-3333-4333-8333-333333333333_random";
const region = "ap-northeast-2";

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

  constructor(private readonly options: { allowAssumeWithoutExternalId?: boolean } = {}) {}

  async assumeRole(input: {
    roleArn: string;
    externalId?: string;
    region: string;
    roleSessionName: string;
  }) {
    this.assumeRoleCalls.push(input);

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
      accountId: "123456789012",
      callerArn:
        "arn:aws:sts::123456789012:assumed-role/SketchCatchTerraformExecutionRole/sketchcatch-connection-test"
    };
  }
}

class TransientProbeFailureGateway extends FakeAwsConnectionStsGateway {
  override async assumeRole(input: {
    roleArn: string;
    externalId?: string;
    region: string;
    roleSessionName: string;
  }) {
    if (!input.externalId) {
      throw new Error("ThrottlingException: retry later");
    }

    return super.assumeRole(input);
  }
}

test("testAwsConnection assumes the target role and returns caller identity without credentials", async () => {
  const gateway = new FakeAwsConnectionStsGateway();

  const result = await testAwsConnection(
    {
      roleArn,
      externalId,
      region
    },
    gateway,
    {
      createRoleSessionName: () => "sketchcatch-connection-test"
    }
  );

  assert.deepEqual(result, {
    ok: true,
    accountId: "123456789012",
    callerArn:
      "arn:aws:sts::123456789012:assumed-role/SketchCatchTerraformExecutionRole/sketchcatch-connection-test",
    region
  });
  assert.deepEqual(gateway.assumeRoleCalls, [
    {
      roleArn,
      externalId,
      region,
      roleSessionName: "sketchcatch-connection-test"
    },
    {
      roleArn,
      region,
      roleSessionName: "sketchcatch-connection-test"
    }
  ]);
  assert.deepEqual(gateway.getCallerIdentityCalls, [
    {
      region,
      credentials: {
        accessKeyId: "temporary-access-key-id",
        secretAccessKey: "temporary-secret-access-key",
        sessionToken: "temporary-session-token"
      }
    }
  ]);
  assert.equal("credentials" in result, false);
  assert.equal("accessKeyId" in result, false);
  assert.equal("secretAccessKey" in result, false);
  assert.equal("sessionToken" in result, false);
});

test("testAwsConnection rejects a role that can be assumed without externalId", async () => {
  const gateway = new FakeAwsConnectionStsGateway({
    allowAssumeWithoutExternalId: true
  });

  await assert.rejects(
    () =>
      testAwsConnection(
        {
          roleArn,
          externalId,
          region
        },
        gateway,
        {
          createRoleSessionName: () => "sketchcatch-connection-test"
        }
      ),
    (error) => {
      assert.equal(error instanceof AwsConnectionTestError, true);
      assert.equal((error as Error).message, "AWS Role trust policy must require external ID");

      return true;
    }
  );
});

test("testAwsConnection maps STS failures to a sanitized error", async () => {
  const gateway: AwsConnectionStsGateway = {
    async assumeRole() {
      throw new Error("AccessDenied: temporary-secret-access-key should not leak");
    },
    async getCallerIdentity() {
      throw new Error("should not call GetCallerIdentity after AssumeRole failure");
    }
  };

  await assert.rejects(
    () =>
      testAwsConnection(
        {
          roleArn,
          externalId,
          region
        },
        gateway,
        {
          createRoleSessionName: () => "sketchcatch-connection-test"
        }
      ),
    (error) => {
      assert.equal(error instanceof AwsConnectionTestError, true);
      assert.equal((error as Error).message, "AWS Role connection test failed");
      assert.equal((error as Error).message.includes("temporary-secret-access-key"), false);

      return true;
    }
  );
});

test("testAwsConnection fails closed when externalId requirement probe cannot be verified", async () => {
  const gateway = new TransientProbeFailureGateway();

  await assert.rejects(
    () =>
      testAwsConnection(
        {
          roleArn,
          externalId,
          region
        },
        gateway,
        {
          createRoleSessionName: () => "sketchcatch-connection-test"
        }
      ),
    (error) => {
      assert.equal(error instanceof AwsConnectionTestError, true);
      assert.equal(
        (error as Error).message,
        "AWS Role external ID requirement could not be verified"
      );

      return true;
    }
  );
});
