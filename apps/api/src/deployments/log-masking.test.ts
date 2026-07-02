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
