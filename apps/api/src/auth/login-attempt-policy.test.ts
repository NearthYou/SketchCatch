import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getLoginAttemptWindowStart,
  getLoginLockExpiresAt,
  isLoginLocked,
  shouldLockLogin
} from "./login-attempt-policy.js";

test("login attempt window starts ten minutes before now", () => {
  const now = new Date("2026-06-24T12:00:00.000Z");

  assert.equal(getLoginAttemptWindowStart(now).toISOString(), "2026-06-24T11:50:00.000Z");
});

test("login lock expires ten minutes after now", () => {
  const now = new Date("2026-06-24T12:00:00.000Z");

  assert.equal(getLoginLockExpiresAt(now).toISOString(), "2026-06-24T12:10:00.000Z");
});

test("login locks after five failed attempts in the window", () => {
  assert.equal(shouldLockLogin(4), false);
  assert.equal(shouldLockLogin(5), true);
});

test("login locked state only applies before lockedUntil passes", () => {
  const now = new Date("2026-06-24T12:00:00.000Z");

  assert.equal(isLoginLocked(new Date("2026-06-24T12:01:00.000Z"), now), true);
  assert.equal(isLoginLocked(new Date("2026-06-24T11:59:59.000Z"), now), false);
  assert.equal(isLoginLocked(null, now), false);
});
