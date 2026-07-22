import assert from "node:assert/strict";
import test from "node:test";
import * as awsConnectionTestService from "./aws-connection-test-service.js";

test("classifies unavailable SSO credentials separately from an unknown Role failure", () => {
  assert.equal(
    awsConnectionTestService.toAwsConnectionTestError({
      name: "CredentialsProviderError",
      message: "The SSO session associated with this profile has expired"
    }).message,
    "AWS SSO credentials are unavailable or expired"
  );
  assert.equal(
    awsConnectionTestService.toAwsConnectionTestError({
      name: "TokenProviderError",
      message: "Token is expired"
    }).message,
    "AWS SSO credentials are unavailable or expired"
  );
});

test("classifies STS transport, throttling, and validation failures", () => {
  assert.equal(
    awsConnectionTestService.toAwsConnectionTestError({ name: "TimeoutError" }).message,
    "AWS STS request timed out"
  );
  assert.equal(
    awsConnectionTestService.toAwsConnectionTestError({ name: "ThrottlingException" }).message,
    "AWS STS request was throttled"
  );
  assert.equal(
    awsConnectionTestService.toAwsConnectionTestError({ name: "ValidationError" }).message,
    "AWS STS request validation failed"
  );
});

test("creates a safe AWS diagnostic without retaining the raw error message", () => {
  assert.deepEqual(
    awsConnectionTestService.createAwsConnectionFailureDiagnostic("assume_role", {
      name: "AccessDenied",
      message: "secret-role-arn and secret-external-id",
      $metadata: {
        httpStatusCode: 403,
        requestId: "safe-request-id"
      }
    }),
    {
      errorName: "AccessDenied",
      httpStatusCode: 403,
      requestId: "safe-request-id",
      stage: "assume_role"
    }
  );
});

test("reports only the safe AWS diagnostic fields", () => {
  const messages: string[] = [];

  awsConnectionTestService.reportAwsConnectionFailure(
    "get_caller_identity",
    {
      name: "TimeoutError",
      message: "secret-role-arn and secret-external-id",
      $metadata: { requestId: "safe-request-id" }
    },
    (message) => messages.push(message)
  );

  assert.equal(messages.length, 1);
  assert.match(messages[0] ?? "", /safe-request-id/);
  assert.doesNotMatch(messages[0] ?? "", /secret-role-arn|secret-external-id/);
});

test("reports the final AssumeRole failure with its stage before returning a safe category", async () => {
  const reported: Array<{ error: unknown; stage: string }> = [];
  const accessDenied = {
    name: "AccessDenied",
    message: "not authorized",
    $metadata: { requestId: "assume-role-request-id" }
  };

  await assert.rejects(
    () =>
      awsConnectionTestService.testAwsConnection(
        {
          externalId: "external-id",
          region: awsConnectionTestService.supportedAwsConnectionRegion,
          roleArn: "arn:aws:iam::123456789012:role/SketchCatchDeploymentRole"
        },
        {
          assumeRole: async () => Promise.reject(accessDenied),
          getCallerIdentity: async () => Promise.reject(new Error("not reached"))
        },
        {
          maxAssumeRoleAttempts: 1,
          reportFailure: (stage, error) => reported.push({ error, stage }),
          retryDelayMs: 0
        }
      ),
    (error: unknown) =>
      error instanceof awsConnectionTestService.AwsConnectionTestError &&
      error.message === "AWS Role assume permission denied"
  );

  assert.deepEqual(reported, [{ error: accessDenied, stage: "assume_role" }]);
});
