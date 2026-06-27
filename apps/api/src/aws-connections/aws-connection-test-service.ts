import { randomUUID } from "node:crypto";
import { AssumeRoleCommand, GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import type { TestAwsConnectionResponse } from "@sketchcatch/types";

export const supportedAwsConnectionRegion = "ap-northeast-2";
const assumeRoleDurationSeconds = 900;

export type AwsConnectionTestInput = {
  roleArn: string;
  externalId: string;
  region: string;
};

export type AwsTemporaryCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
};

export type AwsCallerIdentity = {
  accountId: string;
  callerArn: string;
};

export type AwsConnectionStsGateway = {
  assumeRole(input: {
    roleArn: string;
    externalId?: string;
    region: string;
    roleSessionName: string;
  }): Promise<AwsTemporaryCredentials>;
  getCallerIdentity(input: {
    region: string;
    credentials: AwsTemporaryCredentials;
  }): Promise<AwsCallerIdentity>;
};

export type AwsConnectionTester = {
  testConnection(input: AwsConnectionTestInput): Promise<TestAwsConnectionResponse>;
};

export type TestAwsConnectionOptions = {
  createRoleSessionName?: () => string;
};

export class AwsConnectionTestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AwsConnectionTestError";
  }
}

export function createAwsConnectionTester(
  gateway: AwsConnectionStsGateway = createAwsSdkStsGateway()
): AwsConnectionTester {
  return {
    testConnection(input) {
      return testAwsConnection(input, gateway);
    }
  };
}

export async function testAwsConnection(
  input: AwsConnectionTestInput,
  gateway: AwsConnectionStsGateway,
  options: TestAwsConnectionOptions = {}
): Promise<TestAwsConnectionResponse> {
  const roleSessionName = options.createRoleSessionName?.() ?? createDefaultRoleSessionName();

  try {
    if (input.region !== supportedAwsConnectionRegion) {
      throw new AwsConnectionTestError("AWS connection region must be ap-northeast-2");
    }

    if (input.externalId.trim().length === 0) {
      throw new AwsConnectionTestError("AWS connection external ID is missing");
    }

    const credentials = await gateway.assumeRole({
      roleArn: input.roleArn,
      externalId: input.externalId,
      region: input.region,
      roleSessionName
    });
    const identity = await gateway.getCallerIdentity({
      region: input.region,
      credentials
    });
    const expectedAccountId = getAwsAccountIdFromRoleArn(input.roleArn);

    if (identity.accountId !== expectedAccountId) {
      throw new AwsConnectionTestError("AWS Role account mismatch");
    }

    await assertAwsRoleRequiresExternalId(
      {
        roleArn: input.roleArn,
        region: input.region,
        roleSessionName
      },
      gateway
    );

    return {
      ok: true,
      accountId: identity.accountId,
      callerArn: identity.callerArn,
      region: input.region
    };
  } catch (error) {
    if (error instanceof AwsConnectionTestError) {
      throw error;
    }

    throw new AwsConnectionTestError("AWS Role connection test failed");
  }
}

export function createAwsSdkStsGateway(): AwsConnectionStsGateway {
  return {
    async assumeRole(input) {
      const client = new STSClient({
        region: input.region
      });
      const result = await client.send(
        new AssumeRoleCommand({
          RoleArn: input.roleArn,
          ExternalId: input.externalId,
          RoleSessionName: input.roleSessionName,
          DurationSeconds: assumeRoleDurationSeconds
        })
      );
      const credentials = result.Credentials;

      if (!credentials?.AccessKeyId || !credentials.SecretAccessKey || !credentials.SessionToken) {
        throw new AwsConnectionTestError("STS AssumeRole did not return temporary credentials");
      }

      return {
        accessKeyId: credentials.AccessKeyId,
        secretAccessKey: credentials.SecretAccessKey,
        sessionToken: credentials.SessionToken
      };
    },

    async getCallerIdentity(input) {
      const client = new STSClient({
        region: input.region,
        credentials: input.credentials
      });
      const result = await client.send(new GetCallerIdentityCommand({}));

      if (!result.Account || !result.Arn) {
        throw new AwsConnectionTestError("STS GetCallerIdentity did not return caller identity");
      }

      return {
        accountId: result.Account,
        callerArn: result.Arn
      };
    }
  };
}

function createDefaultRoleSessionName(): string {
  return `sketchcatch-conn-test-${randomUUID()}`;
}

export function getAwsAccountIdFromRoleArn(roleArn: string): string {
  const match = /^arn:aws(?:-[a-z]+)?:iam::(\d{12}):role\/[\w+=,.@/-]+$/.exec(roleArn);
  const accountId = match?.[1];

  if (!accountId) {
    throw new AwsConnectionTestError("AWS Role ARN is invalid");
  }

  return accountId;
}

export async function assertAwsRoleRequiresExternalId(
  input: {
    roleArn: string;
    region: string;
    roleSessionName: string;
  },
  gateway: AwsConnectionStsGateway
): Promise<void> {
  try {
    await gateway.assumeRole(input);
    throw new AwsConnectionTestError("AWS Role trust policy must require external ID");
  } catch (error) {
    if (error instanceof AwsConnectionTestError) {
      throw error;
    }

    if (isExpectedAssumeRoleDeniedError(error)) {
      return;
    }

    throw new AwsConnectionTestError("AWS Role external ID requirement could not be verified");
  }
}

function isExpectedAssumeRoleDeniedError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const errorName = "name" in error && typeof error.name === "string" ? error.name : "";
  const message = "message" in error && typeof error.message === "string" ? error.message : "";

  return (
    errorName === "AccessDenied" ||
    errorName === "AccessDeniedException" ||
    message.toLowerCase().includes("accessdenied")
  );
}
