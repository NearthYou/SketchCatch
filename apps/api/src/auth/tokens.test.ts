import { test } from "node:test";
import assert from "node:assert/strict";
import { createAccessToken, createRefreshToken, hashToken, verifyAccessToken } from "./tokens.js";

process.env.AUTH_TOKEN_SECRET = "test-auth-token-secret-with-at-least-32-characters";

test("access token round trip exposes the signed user id", () => {
  const token = createAccessToken("user-1");

  assert.deepEqual(verifyAccessToken(token), {
    userId: "user-1"
  });
});

test("access token rejects tampered payloads", () => {
  const token = createAccessToken("user-1");
  const [, signature] = token.split(".");
  const tamperedPayload = Buffer.from(
    JSON.stringify({
      sub: "user-2",
      typ: "access",
      iat: 1,
      exp: 9999999999
    })
  ).toString("base64url");

  assert.equal(verifyAccessToken(`${tamperedPayload}.${signature}`), null);
});

test("refresh token hashes are deterministic and do not equal the raw token", () => {
  const refreshToken = createRefreshToken();
  const tokenHash = hashToken(refreshToken);

  assert.equal(hashToken(refreshToken), tokenHash);
  assert.notEqual(tokenHash, refreshToken);
});
