import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertNoStaticAwsCredentialsForApiServer,
  requireSketchCatchAwsCallerPrincipalArn
} from "./env.js";

process.env.NODE_ENV = "test";

test("requireSketchCatchAwsCallerPrincipalArn returns a trimmed IAM Role ARN", () => {
  const originalValue = process.env.SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARN;
  process.env.SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARN =
    " arn:aws:iam::123456789012:role/SketchCatchRuntimeRole ";

  try {
    assert.equal(
      requireSketchCatchAwsCallerPrincipalArn(),
      "arn:aws:iam::123456789012:role/SketchCatchRuntimeRole"
    );
  } finally {
    restoreEnvValue("SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARN", originalValue);
  }
});

test("requireSketchCatchAwsCallerPrincipalArn rejects non-IAM role ARNs", () => {
  const originalValue = process.env.SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARN;
  process.env.SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARN =
    "arn:aws:sts::123456789012:assumed-role/SketchCatchRuntimeRole/session";

  try {
    assert.throws(
      () => requireSketchCatchAwsCallerPrincipalArn(),
      /SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARN must be an IAM Role ARN/
    );
  } finally {
    restoreEnvValue("SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARN", originalValue);
  }
});

test("assertNoStaticAwsCredentialsForApiServer allows AWS_PROFILE without static keys", () => {
  assert.doesNotThrow(() =>
    assertNoStaticAwsCredentialsForApiServer({
      AWS_PROFILE: "sketchcatch-dev"
    })
  );
});

test("assertNoStaticAwsCredentialsForApiServer rejects static AWS credential environment variables", () => {
  assert.throws(
    () =>
      assertNoStaticAwsCredentialsForApiServer({
        AWS_ACCESS_KEY_ID: "access-key-id",
        AWS_SECRET_ACCESS_KEY: "secret-access-key",
        AWS_SESSION_TOKEN: "session-token",
        AWS_PROFILE: "sketchcatch-dev"
      }),
    /Remove AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN/
  );
});

function restoreEnvValue(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
