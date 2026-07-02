import assert from "node:assert/strict";
import { test } from "node:test";
import { createNormalizedAiCacheKey, maskSecretsForAi, sanitizeTerraformErrorForAi } from "./aiProviderSafety.js";

test("maskSecretsForAi masks credentials, account identifiers, and private keys before provider calls", () => {
  const masked = maskSecretsForAi({
    roleArn: "arn:aws:iam::123456789012:role/RuntimeRole",
    password: "super-secret-password",
    nested: {
      databaseUrl: "postgresql://user:password@example.com:5432/app",
      token: "plain-token",
      note: "AWS key AKIA1234567890ABCDEF and account 123456789012"
    },
    privateKey: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----"
  });

  const serialized = JSON.stringify(masked);

  assert.doesNotMatch(serialized, /123456789012/);
  assert.doesNotMatch(serialized, /super-secret-password/);
  assert.doesNotMatch(serialized, /plain-token/);
  assert.doesNotMatch(serialized, /postgresql:\/\/user/);
  assert.doesNotMatch(serialized, /AKIA1234567890ABCDEF/);
  assert.doesNotMatch(serialized, /BEGIN PRIVATE KEY/);
  assert.match(serialized, /\[MASKED_AWS_ACCOUNT_ID\]/);
  assert.match(serialized, /\[MASKED_SECRET\]/);
});

test("sanitizeTerraformErrorForAi keeps only stage, sanitized message, and related resource id", () => {
  const sanitized = sanitizeTerraformErrorForAi({
    stage: "plan",
    rawMessage:
      "AccessDenied for arn:aws:iam::123456789012:role/Admin with token=abc123 while creating aws_instance.web",
    relatedResourceId: "ec2-web"
  });

  assert.equal(sanitized.stage, "plan");
  assert.equal(sanitized.relatedResourceId, "ec2-web");
  assert.match(sanitized.sanitizedMessage, /AccessDenied/);
  assert.match(sanitized.sanitizedMessage, /aws_instance\.web/);
  assert.doesNotMatch(sanitized.sanitizedMessage, /123456789012/);
  assert.doesNotMatch(sanitized.sanitizedMessage, /abc123/);
});

test("createNormalizedAiCacheKey is stable for equivalent input ordering", () => {
  const first = createNormalizedAiCacheKey({
    provider: "bedrock",
    model: "model-a",
    routeTarget: "architecture_draft",
    payload: {
      b: 2,
      a: ["same", { z: true, c: "value" }]
    }
  });
  const second = createNormalizedAiCacheKey({
    provider: "bedrock",
    model: "model-a",
    routeTarget: "architecture_draft",
    payload: {
      a: ["same", { c: "value", z: true }],
      b: 2
    }
  });

  assert.equal(first, second);
});
