import { randomUUID } from "node:crypto";
import type { AwsConnection } from "@sketchcatch/types";
import {
  assertAwsRoleRequiresExternalId,
  getAwsAccountIdFromRoleArn,
  supportedAwsConnectionRegion,
  reportAwsConnectionFailure,
  toAwsConnectionTestError,
  type AwsCallerIdentity,
  type AwsConnectionFailureReporter,
  type AwsConnectionStsGateway,
  type AwsTemporaryCredentials
} from "./aws-connection-test-service.js";

export type TerraformAwsCredentialEnv = {
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_SESSION_TOKEN?: string;
  AWS_REGION: string;
};

export type PreparedTerraformAwsCredentialEnv = {
  env: TerraformAwsCredentialEnv;
  accountId: string;
  callerArn: string;
  region: string;
};

export type PrepareTerraformAwsCredentialEnvOptions = {
  createRoleSessionName?: () => string;
  reportFailure?: AwsConnectionFailureReporter;
};

export type AwsApplyPreconditions = {
  approvedAccountId: string;
  currentAccountId: string;
  approvedRegion: string;
  currentRegion: string;
  approvedTfplanHash: string;
  currentTfplanHash: string;
};

export class AwsConnectionRuntimeCredentialsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AwsConnectionRuntimeCredentialsError";
  }
}

export async function prepareTerraformAwsCredentialEnv(
  awsConnection: AwsConnection,
  gateway: AwsConnectionStsGateway,
  options: PrepareTerraformAwsCredentialEnvOptions = {}
): Promise<PreparedTerraformAwsCredentialEnv> {
  assertVerifiedAwsConnection(awsConnection);
  const roleArn = awsConnection.roleArn;
  const accountId = awsConnection.accountId;
  const roleAccountId = getAwsAccountIdFromRoleArn(roleArn);

  if (roleAccountId !== accountId) {
    throw new AwsConnectionRuntimeCredentialsError("AWS Role account mismatch");
  }

  const roleSessionName = options.createRoleSessionName?.() ?? createTerraformRoleSessionName();
  const reportFailure = options.reportFailure ?? reportAwsConnectionFailure;
  const credentials = await assumeRoleForTerraform(awsConnection, gateway, {
    reportFailure,
    roleArn,
    roleSessionName
  });
  const identity = await getCallerIdentityForTerraform(
    awsConnection,
    gateway,
    credentials,
    reportFailure
  );

  if (identity.accountId !== accountId) {
    throw new AwsConnectionRuntimeCredentialsError("AWS Role account mismatch");
  }

  await assertRoleRequiresExternalIdForTerraform(
    {
      roleArn,
      region: awsConnection.region,
      roleSessionName,
      reportFailure
    },
    gateway
  );

  return {
    env: createTerraformAwsCredentialEnv(credentials, awsConnection.region),
    accountId: identity.accountId,
    callerArn: identity.callerArn,
    region: awsConnection.region
  };
}

export function createTerraformAwsCredentialEnv(
  credentials: AwsTemporaryCredentials,
  region: string
): TerraformAwsCredentialEnv {
  return {
    AWS_ACCESS_KEY_ID: credentials.accessKeyId,
    AWS_SECRET_ACCESS_KEY: credentials.secretAccessKey,
    AWS_SESSION_TOKEN: credentials.sessionToken,
    AWS_REGION: region
  };
}

export function assertAwsApplyPreconditions(input: AwsApplyPreconditions): void {
  if (input.approvedAccountId !== input.currentAccountId) {
    throw new AwsConnectionRuntimeCredentialsError("AWS account changed before apply");
  }

  if (input.approvedRegion !== input.currentRegion) {
    throw new AwsConnectionRuntimeCredentialsError("AWS region changed before apply");
  }

  if (input.approvedTfplanHash !== input.currentTfplanHash) {
    throw new AwsConnectionRuntimeCredentialsError("Terraform plan changed before apply");
  }
}

async function assumeRoleForTerraform(
  awsConnection: AwsConnection & {
    accountId: string;
    roleArn: string;
  },
  gateway: AwsConnectionStsGateway,
  input: {
    reportFailure: AwsConnectionFailureReporter;
    roleArn: string;
    roleSessionName: string;
  }
): Promise<AwsTemporaryCredentials> {
  try {
    return await gateway.assumeRole({
      roleArn: input.roleArn,
      externalId: awsConnection.externalId,
      region: awsConnection.region,
      roleSessionName: input.roleSessionName
    });
  } catch (error) {
    if (error instanceof AwsConnectionRuntimeCredentialsError) {
      throw error;
    }

    input.reportFailure("assume_role", error);
    throw new AwsConnectionRuntimeCredentialsError(toAwsConnectionTestError(error).message);
  }
}

async function getCallerIdentityForTerraform(
  awsConnection: AwsConnection & {
    accountId: string;
    roleArn: string;
  },
  gateway: AwsConnectionStsGateway,
  credentials: AwsTemporaryCredentials,
  reportFailure: AwsConnectionFailureReporter
): Promise<AwsCallerIdentity> {
  try {
    return await gateway.getCallerIdentity({
      region: awsConnection.region,
      credentials
    });
  } catch (error) {
    if (error instanceof AwsConnectionRuntimeCredentialsError) {
      throw error;
    }

    reportFailure("get_caller_identity", error);
    throw new AwsConnectionRuntimeCredentialsError(toAwsConnectionTestError(error).message);
  }
}

function assertVerifiedAwsConnection(
  awsConnection: AwsConnection
): asserts awsConnection is AwsConnection & {
  accountId: string;
  roleArn: string;
} {
  if (awsConnection.status !== "verified" || !awsConnection.accountId || !awsConnection.roleArn) {
    throw new AwsConnectionRuntimeCredentialsError("AWS connection must be verified");
  }

  if (awsConnection.region !== supportedAwsConnectionRegion) {
    throw new AwsConnectionRuntimeCredentialsError("AWS connection region must be ap-northeast-2");
  }

  if (awsConnection.externalId.trim().length === 0) {
    throw new AwsConnectionRuntimeCredentialsError("AWS connection external ID is missing");
  }
}

async function assertRoleRequiresExternalIdForTerraform(
  input: {
    roleArn: string;
    region: string;
    roleSessionName: string;
    reportFailure: AwsConnectionFailureReporter;
  },
  gateway: AwsConnectionStsGateway
): Promise<void> {
  try {
    await assertAwsRoleRequiresExternalId(input, gateway, input.reportFailure);
  } catch (error) {
    if (error instanceof Error) {
      throw new AwsConnectionRuntimeCredentialsError(error.message);
    }

    throw new AwsConnectionRuntimeCredentialsError(
      "AWS Role external ID requirement could not be verified"
    );
  }
}

function createTerraformRoleSessionName(): string {
  return `sketchcatch-terraform-${randomUUID()}`;
}
