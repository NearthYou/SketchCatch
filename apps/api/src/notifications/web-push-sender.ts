import { createHash } from "node:crypto";
import { lookup } from "node:dns";
import { Agent } from "node:https";
import type { LookupFunction } from "node:net";
import webPush from "web-push";
import type { WebPushSubscriptionInput } from "@sketchcatch/types";
import { isPublicAddress } from "../network/public-address.js";
import {
  WebPushDeliveryError,
  type WebPushSender
} from "./deployment-notification-service.js";

export function createWebPushSender(config: {
  subject: string;
  publicKey: string;
  privateKey: string;
}): WebPushSender {
  validateVapidConfig(config);
  const agent = createPublicEndpointAgent();
  return {
    async send(subscription: WebPushSubscriptionInput, payload: string) {
      try {
        const response = await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            expirationTime: subscription.expirationTime,
            keys: subscription.keys
          },
          payload,
          {
            TTL: 300,
            agent,
            timeout: 10_000,
            urgency: "high",
            topic: createHash("sha256").update(payload).digest("base64url").slice(0, 32),
            vapidDetails: {
              subject: config.subject,
              publicKey: config.publicKey,
              privateKey: config.privateKey
            }
          }
        );
        return { statusCode: response.statusCode };
      } catch (error) {
        throw new WebPushDeliveryError(readStatusCode(error), error);
      }
    }
  };
}

function createPublicEndpointAgent(): Agent {
  const publicLookup: LookupFunction = (hostname, options, callback) => {
    lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
      if (error) {
        callback(error, "", 0);
        return;
      }
      if (
        !Array.isArray(addresses) ||
        addresses.length === 0 ||
        addresses.some(
          ({ address, family }) =>
            (family !== 4 && family !== 6) || !isPublicAddress(address, family)
        )
      ) {
        const blocked = Object.assign(new Error("Web Push endpoint did not resolve publicly"), {
          code: "EHOSTUNREACH"
        });
        callback(blocked, "", 0);
        return;
      }
      if (options.all) {
        callback(null, addresses);
        return;
      }
      const selected = addresses[0]!;
      callback(null, selected.address, selected.family);
    });
  };
  return new Agent({ keepAlive: true, lookup: publicLookup });
}

function validateVapidConfig(config: { subject: string; publicKey: string; privateKey: string }): void {
  if (!/^(?:mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/.test(config.subject)) {
    throw new Error("WEB_PUSH_VAPID_SUBJECT must be a mailto or HTTPS URL");
  }
  if (!/^[A-Za-z0-9_-]{80,120}$/.test(config.publicKey)) {
    throw new Error("WEB_PUSH_VAPID_PUBLIC_KEY is invalid");
  }
  if (!/^[A-Za-z0-9_-]{40,80}$/.test(config.privateKey)) {
    throw new Error("WEB_PUSH_VAPID_PRIVATE_KEY is invalid");
  }
}

function readStatusCode(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("statusCode" in error)) return null;
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return typeof statusCode === "number" && Number.isInteger(statusCode) ? statusCode : null;
}
