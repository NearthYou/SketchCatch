import { createHash, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import type {
  DeploymentNotification,
  DeploymentNotificationListResponse,
  WebPushSubscriptionInput
} from "@sketchcatch/types";
import type { WebPushSubscriptionCipher } from "./web-push-subscription-cipher.js";
import { isPublicAddress } from "../network/public-address.js";

const MAX_DELIVERY_ATTEMPTS = 5;
const RETENTION_DAYS = 90;
const RETRY_DELAYS_MS = [30_000, 120_000, 600_000, 1_800_000] as const;

export type DeploymentNotificationRecord = Omit<
  DeploymentNotification,
  "createdAt" | "readAt"
> & {
  createdAt: Date;
  readAt: Date | null;
};

export type StoredWebPushSubscription = {
  id: string;
  userId: string;
  endpointHash: string;
  encryptedPayload: string;
  keyVersion: string;
  expiresAt: Date | null;
  failureCount: number;
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ClaimedNotificationDelivery = {
  outboxId: string;
  userId: string;
  attemptCount: number;
  notification: DeploymentNotificationRecord;
};

export type NotificationRepository = {
  listInbox(userId: string, limit: number): Promise<{
    notifications: DeploymentNotificationRecord[];
    unreadCount: number;
  }>;
  listAfter(userId: string, afterNotificationId: string | undefined, limit: number): Promise<DeploymentNotificationRecord[]>;
  markRead(userId: string, notificationId: string, readAt: Date): Promise<DeploymentNotificationRecord | undefined>;
  markAllRead(userId: string, readAt: Date): Promise<number>;
  upsertSubscription(input: StoredWebPushSubscription): Promise<StoredWebPushSubscription>;
  deleteSubscription(userId: string, endpointHash: string): Promise<boolean>;
  listActiveSubscriptions(userId: string): Promise<StoredWebPushSubscription[]>;
  disableSubscription(subscriptionId: string, disabledAt: Date, errorCode: string): Promise<void>;
  claimPending(now: Date, limit: number): Promise<ClaimedNotificationDelivery[]>;
  markDelivered(outboxId: string, deliveredAt: Date): Promise<void>;
  markRetry(outboxId: string, nextAttemptAt: Date, errorCode: string): Promise<void>;
  markDead(outboxId: string, errorCode: string, failedAt: Date): Promise<void>;
  cleanupExpired(cutoff: Date): Promise<{ notifications: number; subscriptions: number }>;
};

export type WebPushSender = {
  send(subscription: WebPushSubscriptionInput, payload: string): Promise<void>;
};

export class WebPushDeliveryError extends Error {
  readonly statusCode: number | null;

  constructor(statusCode: number | null, cause?: unknown) {
    super("Web Push delivery failed", { cause });
    this.name = "WebPushDeliveryError";
    this.statusCode = statusCode;
  }
}

export class DeploymentNotificationServiceError extends Error {
  readonly code: "not_found" | "bad_request" | "service_unavailable";

  constructor(code: DeploymentNotificationServiceError["code"], message: string) {
    super(message);
    this.name = "DeploymentNotificationServiceError";
    this.code = code;
  }
}

export function createDeploymentNotificationService(options: {
  repository: NotificationRepository;
  cipher?: WebPushSubscriptionCipher | undefined;
  pushSender?: WebPushSender | undefined;
  createId?: () => string;
  now?: () => Date;
  onDispatchError?: ((event: { outboxId: string; code: string }) => void) | undefined;
}) {
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? randomUUID;

  return {
    async listInbox(userId: string, limit = 50): Promise<DeploymentNotificationListResponse> {
      const result = await options.repository.listInbox(userId, limit);
      return {
        notifications: result.notifications.map(toNotification),
        unreadCount: result.unreadCount
      };
    },

    async listAfter(userId: string, afterNotificationId?: string): Promise<DeploymentNotification[]> {
      return (await options.repository.listAfter(userId, afterNotificationId, 50)).map(toNotification);
    },

    async markRead(userId: string, notificationId: string): Promise<DeploymentNotification> {
      const notification = await options.repository.markRead(userId, notificationId, now());
      if (!notification) {
        throw new DeploymentNotificationServiceError("not_found", "Notification not found");
      }
      return toNotification(notification);
    },

    markAllRead(userId: string): Promise<number> {
      return options.repository.markAllRead(userId, now());
    },

    async saveSubscription(
      userId: string,
      subscription: WebPushSubscriptionInput,
      testOptions: { allowExpiredForTest?: boolean } = {}
    ): Promise<StoredWebPushSubscription> {
      if (!options.cipher) {
        throw new DeploymentNotificationServiceError(
          "service_unavailable",
          "Web Push is not configured"
        );
      }
      validateSubscription(subscription);
      const currentTime = now();
      if (
        subscription.expirationTime !== null &&
        (!Number.isSafeInteger(subscription.expirationTime) ||
          subscription.expirationTime > 8_640_000_000_000_000)
      ) {
        throw new DeploymentNotificationServiceError("bad_request", "Invalid Push expiration");
      }
      const expiresAt = subscription.expirationTime === null
        ? null
        : new Date(subscription.expirationTime);
      if (
        expiresAt &&
        expiresAt.getTime() <= currentTime.getTime() &&
        !testOptions.allowExpiredForTest
      ) {
        throw new DeploymentNotificationServiceError("bad_request", "Push subscription is expired");
      }
      const encrypted = options.cipher.encrypt(subscription);
      return options.repository.upsertSubscription({
        id: createId(),
        userId,
        endpointHash: hashEndpoint(subscription.endpoint),
        encryptedPayload: encrypted.payload,
        keyVersion: encrypted.keyVersion,
        expiresAt,
        failureCount: 0,
        disabledAt: null,
        createdAt: currentTime,
        updatedAt: currentTime
      });
    },

    deleteSubscription(userId: string, endpoint: string): Promise<boolean> {
      validateEndpoint(endpoint);
      return options.repository.deleteSubscription(userId, hashEndpoint(endpoint));
    },

    async dispatchPending(limit = 20): Promise<{
      claimed: number;
      delivered: number;
      retried: number;
      dead: number;
    }> {
      if (!options.cipher || !options.pushSender) {
        return { claimed: 0, delivered: 0, retried: 0, dead: 0 };
      }
      const currentTime = now();
      const deliveries = await options.repository.claimPending(currentTime, limit);
      const result = { claimed: deliveries.length, delivered: 0, retried: 0, dead: 0 };

      for (const delivery of deliveries) {
        const subscriptions = (
          await options.repository.listActiveSubscriptions(delivery.userId)
        ).filter(
          (subscription) => subscription.createdAt.getTime() <= delivery.notification.createdAt.getTime()
        );
        let retryCode: string | null = null;

        for (const stored of subscriptions) {
          if (stored.expiresAt && stored.expiresAt.getTime() <= currentTime.getTime()) {
            await options.repository.disableSubscription(stored.id, currentTime, "expired");
            continue;
          }
          let subscription: WebPushSubscriptionInput;
          try {
            subscription = options.cipher.decrypt({
              keyVersion: stored.keyVersion,
              payload: stored.encryptedPayload
            });
          } catch {
            await options.repository.disableSubscription(stored.id, currentTime, "decrypt_failed");
            continue;
          }
          try {
            await options.pushSender.send(
              subscription,
              JSON.stringify({
                notificationId: delivery.notification.id,
                title: delivery.notification.title,
                body: delivery.notification.body,
                actionUrl: delivery.notification.actionUrl
              })
            );
          } catch (error) {
            const statusCode = error instanceof WebPushDeliveryError ? error.statusCode : null;
            const code = statusCode === null ? "push_unknown" : `push_${statusCode}`;
            if (statusCode === 400 || statusCode === 404 || statusCode === 410) {
              await options.repository.disableSubscription(stored.id, currentTime, code);
            } else {
              retryCode ??= code;
              options.onDispatchError?.({ outboxId: delivery.outboxId, code });
            }
          }
        }

        if (retryCode) {
          const nextAttempt = delivery.attemptCount + 1;
          if (nextAttempt >= MAX_DELIVERY_ATTEMPTS) {
            await options.repository.markDead(delivery.outboxId, retryCode, currentTime);
            result.dead += 1;
          } else {
            const delay = RETRY_DELAYS_MS[Math.min(delivery.attemptCount, RETRY_DELAYS_MS.length - 1)]!;
            await options.repository.markRetry(
              delivery.outboxId,
              new Date(currentTime.getTime() + delay),
              retryCode
            );
            result.retried += 1;
          }
        } else {
          await options.repository.markDelivered(delivery.outboxId, currentTime);
          result.delivered += 1;
        }
      }

      return result;
    },

    cleanupRetention(): Promise<{ notifications: number; subscriptions: number }> {
      return options.repository.cleanupExpired(
        new Date(now().getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
      );
    }
  };
}

function hashEndpoint(endpoint: string): string {
  return createHash("sha256").update(endpoint, "utf8").digest("hex");
}

function validateSubscription(subscription: WebPushSubscriptionInput): void {
  validateEndpoint(subscription.endpoint);
  if (
    !Number.isFinite(subscription.expirationTime) &&
    subscription.expirationTime !== null
  ) {
    throw new DeploymentNotificationServiceError("bad_request", "Invalid Push expiration");
  }
  for (const value of [subscription.keys.auth, subscription.keys.p256dh]) {
    if (!/^[A-Za-z0-9_-]{8,512}$/.test(value)) {
      throw new DeploymentNotificationServiceError("bad_request", "Invalid Push subscription key");
    }
  }
}

function validateEndpoint(endpoint: string): void {
  if (endpoint.length > 2_048 || !URL.canParse(endpoint)) {
    throw new DeploymentNotificationServiceError("bad_request", "Invalid Push endpoint");
  }
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new DeploymentNotificationServiceError("bad_request", "Invalid Push endpoint");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const family = isIP(hostname);
  if ((family === 4 || family === 6) && !isPublicAddress(hostname, family)) {
    throw new DeploymentNotificationServiceError("bad_request", "Invalid Push endpoint");
  }
}

function toNotification(record: DeploymentNotificationRecord): DeploymentNotification {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    readAt: record.readAt?.toISOString() ?? null
  };
}
