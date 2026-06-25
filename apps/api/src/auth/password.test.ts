import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "./password.js";

test("password hash verifies the original password only", async () => {
  const hash = await hashPassword("correct-password");

  assert.equal(await verifyPassword("correct-password", hash), true);
  assert.equal(await verifyPassword("wrong-password", hash), false);
});
