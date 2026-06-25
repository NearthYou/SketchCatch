import { test } from "node:test";
import assert from "node:assert/strict";
import { getRevokedRefreshTokenRetentionCutoff, shouldDeleteRefreshToken } from "./cleanup.js";

test("revoked refresh token retention cutoff is seven days before now", () => {
  const now = new Date("2026-06-24T12:00:00.000Z");

  assert.equal(
    getRevokedRefreshTokenRetentionCutoff(now).toISOString(),
    "2026-06-17T12:00:00.000Z"
  );
});

test("expired refresh token should be deleted", () => {
  const now = new Date("2026-06-24T12:00:00.000Z");

  assert.equal(
    shouldDeleteRefreshToken(
      {
        expiresAt: new Date("2026-06-24T11:59:59.000Z"),
        revokedAt: null
      },
      now
    ),
    true
  );
});

test("recently revoked refresh token is retained", () => {
  const now = new Date("2026-06-24T12:00:00.000Z");

  assert.equal(
    shouldDeleteRefreshToken(
      {
        expiresAt: new Date("2026-07-24T12:00:00.000Z"),
        revokedAt: new Date("2026-06-20T12:00:00.000Z")
      },
      now
    ),
    false
  );
});

test("old revoked refresh token should be deleted", () => {
  const now = new Date("2026-06-24T12:00:00.000Z");

  assert.equal(
    shouldDeleteRefreshToken(
      {
        expiresAt: new Date("2026-07-24T12:00:00.000Z"),
        revokedAt: new Date("2026-06-17T11:59:59.000Z")
      },
      now
    ),
    true
  );
});
