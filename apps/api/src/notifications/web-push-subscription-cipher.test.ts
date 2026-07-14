import assert from "node:assert/strict";
import { test } from "node:test";
import { createWebPushSubscriptionCipher } from "./web-push-subscription-cipher.js";

const subscription = {
  endpoint: "https://push.example.test/subscriptions/secret-endpoint",
  expirationTime: 1_900_000_000_000,
  keys: {
    auth: "secret-auth-key",
    p256dh: "secret-p256dh-key"
  }
};

test("web push subscription cipher round-trips without storing plaintext", () => {
  const cipher = createWebPushSubscriptionCipher({
    current: { id: "v1", secret: Buffer.alloc(32, 0x41).toString("base64url") }
  });
  const encrypted = cipher.encrypt(subscription);

  assert.equal(encrypted.keyVersion, "v1");
  assert.doesNotMatch(encrypted.payload, /secret-endpoint|secret-auth-key|secret-p256dh-key/);
  assert.deepEqual(cipher.decrypt(encrypted), subscription);
});

test("web push subscription cipher rejects tampering and unknown key versions", () => {
  const cipher = createWebPushSubscriptionCipher({
    current: { id: "v2", secret: Buffer.alloc(32, 0x42).toString("base64url") }
  });
  const encrypted = cipher.encrypt(subscription);

  assert.throws(
    () => cipher.decrypt({ ...encrypted, payload: `${encrypted.payload.slice(0, -1)}A` }),
    /decrypt/i
  );
  assert.throws(
    () => cipher.decrypt({ ...encrypted, keyVersion: "retired" }),
    /key version/i
  );
});
