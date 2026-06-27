import { test } from "node:test";
import assert from "node:assert/strict";
import { requireSketchCatchAwsCallerPrincipalArn } from "./env.js";

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

function restoreEnvValue(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
