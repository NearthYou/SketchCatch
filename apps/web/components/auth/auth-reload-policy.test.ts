import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiClientError } from "../../lib/api-client";
import {
  getAuthReloadPhase,
  shouldClearAuthAfterReloadError
} from "./auth-reload-policy";

test("only the first session lookup uses the initial loading phase", () => {
  assert.equal(getAuthReloadPhase(false), "initial");
  assert.equal(getAuthReloadPhase(true), "background");
});

test("background connection failures preserve the authenticated session", () => {
  assert.equal(
    shouldClearAuthAfterReloadError({
      error: new Error("connection unavailable"),
      phase: "background"
    }),
    false
  );
});

test("initial failures and explicit unauthorized responses clear the session", () => {
  const unauthorized = new ApiClientError(401, {
    error: "unauthorized",
    message: "Authentication required"
  });

  assert.equal(
    shouldClearAuthAfterReloadError({
      error: new Error("connection unavailable"),
      phase: "initial"
    }),
    true
  );
  assert.equal(
    shouldClearAuthAfterReloadError({
      error: unauthorized,
      phase: "background"
    }),
    true
  );
});
