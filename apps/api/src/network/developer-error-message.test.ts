import assert from "node:assert/strict";
import test from "node:test";
import { getDeveloperErrorMessage } from "./developer-error-message.js";

test("development diagnostics preserve the cause chain and mask secrets", () => {
  const cause = new Error(
    "S3 object sketchcatch/plans/demo.tfplan was not found; token=do-not-expose"
  );
  const error = new Error("Apply Plan artifact download failed", { cause });

  const message = getDeveloperErrorMessage(error, "readiness refresh failed", "development");

  assert.match(message, /Apply Plan artifact download failed/u);
  assert.match(message, /S3 object sketchcatch\/plans\/demo\.tfplan was not found/u);
  assert.match(message, /\[REDACTED\]/u);
  assert.doesNotMatch(message, /do-not-expose/u);
});

test("non-development diagnostics retain the stable public message", () => {
  const message = getDeveloperErrorMessage(
    new Error("internal database query details"),
    "request failed",
    "production"
  );

  assert.equal(message, "request failed");
});
