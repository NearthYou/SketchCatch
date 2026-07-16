import { test } from "node:test";
import assert from "node:assert/strict";
import { maskDeploymentMessage } from "./log-masking.js";

test("maskDeploymentMessage masks JSON-style secret assignments", () => {
  const message = '{"aws_access_key_id": "AKIAEXAMPLE", "password": "not-real"}';

  const maskedMessage = maskDeploymentMessage(message);

  assert.equal(maskedMessage, "{[REDACTED], [REDACTED]}");
});

test("maskDeploymentMessage does not mask partial key matches", () => {
  const message = "non_secret = harmless secret = hidden";

  const maskedMessage = maskDeploymentMessage(message);

  assert.equal(maskedMessage, "non_secret = harmless [REDACTED]");
});

test("maskDeploymentMessage masks common runtime secret env keys and AWS key ids", () => {
  const temporaryAccessKeyId = ["ASIA", "ABCDEFGHIJKLMNOP"].join("");
  const message = [
    "AWS_SESSION_TOKEN=temporary-session-token",
    "AUTH_TOKEN_SECRET=server-secret",
    "DATABASE_URL=postgresql://user:password@db/sketchcatch",
    `export AWS_ACCESS_KEY_ID=${temporaryAccessKeyId}`
  ].join("\n");

  const maskedMessage = maskDeploymentMessage(message);

  assert.equal(maskedMessage.includes("temporary-session-token"), false);
  assert.equal(maskedMessage.includes("server-secret"), false);
  assert.equal(maskedMessage.includes("postgresql://user:password@db/sketchcatch"), false);
  assert.equal(maskedMessage.includes(temporaryAccessKeyId), false);
});

test("maskDeploymentMessage masks deployment credential key variants", () => {
  const message = [
    'externalId = "sc_conn_external_id"',
    '"secretAccessKey": "temporary-secret-access-key"',
    "sessionToken=temporary-session-token",
    'client_secret = "oauth-client-secret"',
    'private_key = "-----BEGIN PRIVATE KEY-----not-real"'
  ].join("\n");

  const maskedMessage = maskDeploymentMessage(message);

  assert.equal(maskedMessage.includes("sc_conn_external_id"), false);
  assert.equal(maskedMessage.includes("temporary-secret-access-key"), false);
  assert.equal(maskedMessage.includes("temporary-session-token"), false);
  assert.equal(maskedMessage.includes("oauth-client-secret"), false);
  assert.equal(maskedMessage.includes("-----BEGIN PRIVATE KEY-----not-real"), false);
});

test("maskDeploymentMessage masks Authorization Bearer and Basic credentials", () => {
  const message = [
    "request started path=/api/deployments",
    "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature",
    "authorization=Basic dXNlcjpwYXNzd29yZA==",
    '{"Authorization":"Bearer opaque-json-credential"}'
  ].join("\n");

  const maskedMessage = maskDeploymentMessage(message);

  assert.match(maskedMessage, /request started path=\/api\/deployments/);
  assert.equal(maskedMessage.includes("eyJhbGciOiJIUzI1NiJ9"), false);
  assert.equal(maskedMessage.includes("dXNlcjpwYXNzd29yZA=="), false);
  assert.equal(maskedMessage.includes("opaque-json-credential"), false);
});

test("maskDeploymentMessage masks standalone JWTs and GitHub token families", () => {
  const message = [
    "jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature",
    `classic ghp_${"a".repeat(36)}`,
    `fine-grained github_pat_${"b".repeat(82)}`
  ].join("\n");

  const maskedMessage = maskDeploymentMessage(message);

  assert.equal(maskedMessage.includes("eyJhbGciOiJIUzI1NiJ9"), false);
  assert.equal(maskedMessage.includes("ghp_"), false);
  assert.equal(maskedMessage.includes("github_pat_"), false);
});

test("maskDeploymentMessage masks multiline PEM blocks and preserves normal developer logs", () => {
  const message = [
    "deploying api commit=abc123 status=running",
    "-----BEGIN PRIVATE KEY-----",
    "cHJpdmF0ZS1rZXktYm9keQ==",
    "-----END PRIVATE KEY-----",
    "request completed status=200 durationMs=42"
  ].join("\n");

  const maskedMessage = maskDeploymentMessage(message);

  assert.equal(maskedMessage.includes("cHJpdmF0ZS1rZXktYm9keQ=="), false);
  assert.match(maskedMessage, /deploying api commit=abc123 status=running/);
  assert.match(maskedMessage, /request completed status=200 durationMs=42/);
});

test("maskDeploymentMessage leaves ordinary developer diagnostics unchanged", () => {
  const message = "GET /api/projects status=200 token bucket remaining=19";

  assert.equal(maskDeploymentMessage(message), message);
});
