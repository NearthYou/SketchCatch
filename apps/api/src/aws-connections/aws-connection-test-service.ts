import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
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
    policy?: string;
    abortSignal?: AbortSignal;
    durationSeconds?: number;
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
  maxAssumeRoleAttempts?: number;
  reportFailure?: AwsConnectionFailureReporter;
  retryDelayMs?: number;
};

export type AwsConnectionFailureReporter = (
  stage: AwsConnectionFailureStage,
  error: unknown
) => void;

export class AwsConnectionTestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AwsConnectionTestError";
  }
}

export type AwsConnectionFailureStage =
  | "assume_role"
  | "external_id_check"
  | "get_caller_identity";

export type AwsConnectionFailureDiagnostic = {
  readonly errorName: string;
  readonly httpStatusCode?: number | undefined;
  readonly requestId?: string | undefined;
  readonly stage: AwsConnectionFailureStage;
};

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
  const reportFailure = options.reportFailure ?? reportAwsConnectionFailure;

  try {
    if (input.region !== supportedAwsConnectionRegion) {
      throw new AwsConnectionTestError("AWS connection region must be ap-northeast-2");
    }

    if (input.externalId.trim().length === 0) {
      throw new AwsConnectionTestError("AWS connection external ID is missing");
    }

    const credentials = await assumeRoleWithRetry(
      {
        roleArn: input.roleArn,
        externalId: input.externalId,
        region: input.region,
        roleSessionName
      },
      gateway,
      {
        maxAttempts: options.maxAssumeRoleAttempts ?? 4,
        reportFailure,
        retryDelayMs: options.retryDelayMs ?? 1_000
      }
    );
    let identity: AwsCallerIdentity;
    try {
      identity = await gateway.getCallerIdentity({
        region: input.region,
        credentials
      });
    } catch (error) {
      reportFailure("get_caller_identity", error);
      throw error;
    }
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
      gateway,
      reportFailure
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

    throw toAwsConnectionTestError(error);
  }
}

async function assumeRoleWithRetry(
  input: {
    roleArn: string;
    externalId: string;
    region: string;
    roleSessionName: string;
  },
  gateway: AwsConnectionStsGateway,
  options: {
    maxAttempts: number;
    reportFailure: AwsConnectionFailureReporter;
    retryDelayMs: number;
  }
): Promise<AwsTemporaryCredentials> {
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts));
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await gateway.assumeRole(input);
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts || error instanceof AwsConnectionTestError) {
        options.reportFailure("assume_role", error);
        throw error;
      }

      if (options.retryDelayMs > 0) {
        await delay(options.retryDelayMs);
      }
    }
  }

  throw lastError;
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
          DurationSeconds: input.durationSeconds ?? assumeRoleDurationSeconds,
          ...(input.policy ? { Policy: input.policy } : {})
        }),
        input.abortSignal ? { abortSignal: input.abortSignal } : undefined
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
  gateway: AwsConnectionStsGateway,
  reportFailure: AwsConnectionFailureReporter = reportAwsConnectionFailure
): Promise<void> {
  try {
    await gateway.assumeRole(input);
    throw new AwsConnectionTestError("AWS Role trust policy must require external ID");
  } catch (error) {
    if (error instanceof AwsConnectionTestError) {
      reportFailure("external_id_check", error);
      throw error;
    }

    if (isExpectedAssumeRoleDeniedError(error)) {
      return;
    }

    reportFailure("external_id_check", error);
    throw new AwsConnectionTestError("AWS Role external ID requirement could not be verified");
  }
}

function isExpectedAssumeRoleDeniedError(error: unknown): boolean {
  return isAwsAccessDeniedError(error);
}

export function toAwsConnectionTestError(error: unknown): AwsConnectionTestError {
  if (isAwsAccessDeniedError(error)) {
    return new AwsConnectionTestError("AWS Role assume permission denied");
  }

  if (isAwsCredentialError(error)) {
    return new AwsConnectionTestError("AWS caller credentials are invalid or expired");
  }

  if (isAwsSsoCredentialProviderError(error)) {
    return new AwsConnectionTestError("AWS SSO credentials are unavailable or expired");
  }

  if (isAwsStsTimeoutError(error)) {
    return new AwsConnectionTestError("AWS STS request timed out");
  }

  if (isAwsStsThrottlingError(error)) {
    return new AwsConnectionTestError("AWS STS request was throttled");
  }

  if (getErrorName(error) === "ValidationError") {
    return new AwsConnectionTestError("AWS STS request validation failed");
  }

  return new AwsConnectionTestError("AWS Role connection test failed");
}

export function createAwsConnectionFailureDiagnostic(
  stage: AwsConnectionFailureStage,
  error: unknown
): AwsConnectionFailureDiagnostic {
  const metadata = getAwsErrorMetadata(error);

  return {
    errorName: getErrorName(error) || "UnknownError",
    ...(metadata.httpStatusCode !== undefined ? { httpStatusCode: metadata.httpStatusCode } : {}),
    ...(metadata.requestId ? { requestId: metadata.requestId } : {}),
    stage
  };
}

export function reportAwsConnectionFailure(
  stage: AwsConnectionFailureStage,
  error: unknown,
  write: (message: string) => void = console.error
): void {
  write(
    JSON.stringify({
      event: "aws_connection_failure",
      ...createAwsConnectionFailureDiagnostic(stage, error)
    })
  );
}

function isAwsAccessDeniedError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const errorName = "name" in error && typeof error.name === "string" ? error.name : "";
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  const normalizedMessage = message.toLowerCase();

  return (
    errorName === "AccessDenied" ||
    errorName === "AccessDeniedException" ||
    normalizedMessage.includes("accessdenied") ||
    normalizedMessage.includes("not authorized to perform: sts:assumerole")
  );
}

function isAwsCredentialError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const errorName = "name" in error && typeof error.name === "string" ? error.name : "";

  return (
    errorName === "ExpiredToken" ||
    errorName === "ExpiredTokenException" ||
    errorName === "InvalidClientTokenId" ||
    errorName === "UnrecognizedClientException"
  );
}

function isAwsSsoCredentialProviderError(error: unknown): boolean {
  const errorName = getErrorName(error);

  return (
    errorName === "CredentialsProviderError" ||
    errorName === "TokenProviderError" ||
    errorName === "SSOProviderInvalidToken"
  );
}

function isAwsStsTimeoutError(error: unknown): boolean {
  const errorName = getErrorName(error);
  const errorCode = getErrorCode(error);

  return (
    errorName === "TimeoutError" ||
    errorName === "NetworkingError" ||
    errorCode === "ETIMEDOUT" ||
    errorCode === "ECONNRESET" ||
    errorCode === "ENOTFOUND"
  );
}

function isAwsStsThrottlingError(error: unknown): boolean {
  const errorName = getErrorName(error);

  return (
    errorName === "Throttling" ||
    errorName === "ThrottlingException" ||
    errorName === "TooManyRequestsException"
  );
}

function getErrorName(error: unknown): string {
  return typeof error === "object" && error !== null && "name" in error ? String(error.name) : "";
}

function getErrorCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
}

function getAwsErrorMetadata(error: unknown): {
  readonly httpStatusCode?: number | undefined;
  readonly requestId?: string | undefined;
} {
  if (typeof error !== "object" || error === null || !("$metadata" in error)) {
    return {};
  }

  const metadata = error.$metadata;

  if (typeof metadata !== "object" || metadata === null) {
    return {};
  }

  const httpStatusCode =
    "httpStatusCode" in metadata && typeof metadata.httpStatusCode === "number"
      ? metadata.httpStatusCode
      : undefined;
  const requestId =
    "requestId" in metadata && typeof metadata.requestId === "string"
      ? metadata.requestId.slice(0, 256)
      : undefined;

  return {
    ...(httpStatusCode !== undefined ? { httpStatusCode } : {}),
    ...(requestId ? { requestId } : {})
  };
}
