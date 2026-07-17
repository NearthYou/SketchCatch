import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldShowAuthenticatedShellFallback } from "../auth/auth-gate-state";

test("authenticated shells only show a fallback before any user is available", () => {
  assert.equal(shouldShowAuthenticatedShellFallback("loading", false), true);
  assert.equal(shouldShowAuthenticatedShellFallback("unauthenticated", false), true);
  assert.equal(shouldShowAuthenticatedShellFallback("authenticated", true), false);
  assert.equal(shouldShowAuthenticatedShellFallback("loading", true), false);
});
