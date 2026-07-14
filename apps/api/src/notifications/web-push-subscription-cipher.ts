import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { WebPushSubscriptionInput } from "@sketchcatch/types";

const ALGORITHM = "aes-256-gcm";
const AUTH_TAG_BYTES = 16;
const IV_BYTES = 12;
const AAD_PREFIX = "sketchcatch:web-push-subscription:v1";

export type EncryptedWebPushSubscription = {
  keyVersion: string;
  payload: string;
};

export type WebPushSubscriptionCipher = {
  encrypt(value: WebPushSubscriptionInput): EncryptedWebPushSubscription;
  decrypt(value: EncryptedWebPushSubscription): WebPushSubscriptionInput;
};

export function createWebPushSubscriptionCipher(input: {
  current: { id: string; secret: string };
  previous?: readonly { id: string; secret: string }[];
}): WebPushSubscriptionCipher {
  const entries = [input.current, ...(input.previous ?? [])];
  const keys = new Map(entries.map((entry) => [entry.id, decodeKey(entry.secret)] as const));
  if (!input.current.id.trim() || keys.size !== entries.length) {
    throw new Error("Web Push subscription key versions must be unique and non-empty");
  }

  return {
    encrypt(value) {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, keys.get(input.current.id)!, iv, {
        authTagLength: AUTH_TAG_BYTES
      });
      cipher.setAAD(Buffer.from(`${AAD_PREFIX}:${input.current.id}`, "utf8"));
      const ciphertext = Buffer.concat([
        cipher.update(JSON.stringify(value), "utf8"),
        cipher.final()
      ]);
      const authTag = cipher.getAuthTag();
      return {
        keyVersion: input.current.id,
        payload: [iv, authTag, ciphertext].map((part) => part.toString("base64url")).join(".")
      };
    },
    decrypt(value) {
      const key = keys.get(value.keyVersion);
      if (!key) throw new Error("Unknown Web Push subscription key version");
      const parts = value.payload.split(".");
      if (parts.length !== 3) throw new Error("Web Push subscription decrypt failed");
      try {
        const [ivPart, tagPart, ciphertextPart] = parts as [string, string, string];
        const iv = Buffer.from(ivPart, "base64url");
        const authTag = Buffer.from(tagPart, "base64url");
        const ciphertext = Buffer.from(ciphertextPart, "base64url");
        if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES || ciphertext.length === 0) {
          throw new Error("invalid encrypted payload");
        }
        const decipher = createDecipheriv(ALGORITHM, key, iv, {
          authTagLength: AUTH_TAG_BYTES
        });
        decipher.setAAD(Buffer.from(`${AAD_PREFIX}:${value.keyVersion}`, "utf8"));
        decipher.setAuthTag(authTag);
        const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
          "utf8"
        );
        const parsed: unknown = JSON.parse(plaintext);
        if (!isSubscription(parsed)) throw new Error("invalid subscription payload");
        return parsed;
      } catch (error) {
        throw new Error("Web Push subscription decrypt failed", { cause: error });
      }
    }
  };
}

function decodeKey(secret: string): Buffer {
  const key = Buffer.from(secret, "base64url");
  if (key.length !== 32) {
    throw new Error("Web Push subscription encryption keys must decode to exactly 32 bytes");
  }
  return key;
}

function isSubscription(value: unknown): value is WebPushSubscriptionInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const keys = item.keys;
  return (
    typeof item.endpoint === "string" &&
    (item.expirationTime === null || typeof item.expirationTime === "number") &&
    Boolean(keys) &&
    typeof keys === "object" &&
    !Array.isArray(keys) &&
    typeof (keys as Record<string, unknown>).auth === "string" &&
    typeof (keys as Record<string, unknown>).p256dh === "string"
  );
}
