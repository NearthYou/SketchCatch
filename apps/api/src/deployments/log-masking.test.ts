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
