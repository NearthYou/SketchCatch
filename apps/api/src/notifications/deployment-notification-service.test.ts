import assert from "node:assert/strict";
import { test } from "node:test";
import type { WebPushSubscriptionInput } from "@sketchcatch/types";
import {
  createDeploymentNotificationService,
  WebPushDeliveryError,
  type ClaimedNotificationDelivery,
  type NotificationRepository,
  type StoredWebPushSubscription
} from "./deployment-notification-service.js";
import { createWebPushSubscriptionCipher } from "./web-push-subscription-cipher.js";

const now = new Date("2026-07-14T00:00:00.000Z");
const notification = {
  id: "ntf_11111111111111111111111111111111",
  projectId: "11111111-1111-4111-8111-111111111111",
  source: "direct_deployment" as const,
  sourceId: "22222222-2222-4222-8222-222222222222",
  status: "succeeded" as const,
  title: "배포 완료",
  body: "Direct · 22222222 · succeeded",
  actionUrl: "/dashboard/projects/11111111-1111-4111-8111-111111111111",
  readAt: null,
  createdAt: now
};
const subscriptionInput: WebPushSubscriptionInput = {
  endpoint: "https://push.example.test/subscriptions/opaque-value",
  expirationTime: null,
  keys: { auth: "auth-value", p256dh: "p256dh-value" }
};

test("subscription persistence receives only a hash and encrypted payload", async () => {
  const repository = new FakeNotificationRepository();
  const service = createService(repository);

  await service.saveSubscription("user-1", subscriptionInput);

  const stored = repository.subscriptions[0]!;
  assert.match(stored.endpointHash, /^[a-f\d]{64}$/);
  assert.doesNotMatch(stored.encryptedPayload, /opaque-value|auth-value|p256dh-value/);
  assert.equal(stored.userId, "user-1");
});

test("subscription validation rejects direct private and metadata endpoints", async () => {
  for (const endpoint of ["https://127.0.0.1/push", "https://169.254.169.254/latest/meta-data"]) {
    const service = createService(new FakeNotificationRepository());
    await assert.rejects(
      service.saveSubscription("user-1", { ...subscriptionInput, endpoint }),
      (error: unknown) => Boolean(
        error && typeof error === "object" && "code" in error && error.code === "bad_request"
      )
    );
  }
});

test("dispatcher sends one safe payload and marks the outbox delivered", async () => {
  const repository = new FakeNotificationRepository();
  const sent: Array<{ endpoint: string; payload: string }> = [];
  const service = createService(repository, {
    async send(subscription, payload) {
      sent.push({ endpoint: subscription.endpoint, payload });
      return { statusCode: 201 };
    }
  });
  await service.saveSubscription("user-1", subscriptionInput);
  repository.claimed.push(createDelivery());

  const result = await service.dispatchPending();

  assert.deepEqual(result, { claimed: 1, delivered: 1, retried: 0, dead: 0 });
  assert.equal(sent[0]?.endpoint, subscriptionInput.endpoint);
  assert.match(sent[0]?.payload ?? "", /"notificationId":"ntf_/);
  assert.doesNotMatch(sent[0]?.payload ?? "", /opaque-value|auth-value|p256dh-value/);
  assert.deepEqual(repository.outboxUpdates, [
    { kind: "delivered", id: "outbox-1", providerStatusCode: 201 }
  ]);
});

test("dispatcher ignores provider status codes outside the persisted HTTP range", async () => {
  for (const statusCode of [99, 600, 200.5]) {
    const repository = new FakeNotificationRepository();
    const service = createService(repository, {
      async send() {
        return { statusCode };
      }
    });
    await service.saveSubscription("user-1", subscriptionInput);
    repository.claimed.push(createDelivery());

    await service.dispatchPending();

    assert.deepEqual(repository.outboxUpdates, [
      { kind: "delivered", id: "outbox-1", providerStatusCode: null }
    ]);
  }
});

test("a new subscription does not receive terminal events created before it existed", async () => {
  const repository = new FakeNotificationRepository();
  let sendCount = 0;
  const service = createService(repository, {
    async send() { sendCount += 1; }
  });
  await service.saveSubscription("user-1", subscriptionInput);
  repository.claimed.push({
    ...createDelivery(),
    notification: { ...notification, createdAt: new Date(now.getTime() - 1) }
  });

  await service.dispatchPending();

  assert.equal(sendCount, 0);
  assert.deepEqual(repository.outboxUpdates, [
    { kind: "delivered", id: "outbox-1", providerStatusCode: null }
  ]);
});

test("expired and gone subscriptions are disabled without retrying the event", async () => {
  for (const mode of ["expired", "gone"] as const) {
    const repository = new FakeNotificationRepository();
    const service = createService(repository, {
      async send() {
        if (mode === "gone") throw new WebPushDeliveryError(410);
      }
    });
    await service.saveSubscription("user-1", {
      ...subscriptionInput,
      expirationTime: mode === "expired" ? now.getTime() - 1 : null
    }, { allowExpiredForTest: true });
    repository.claimed.push(createDelivery());

    await service.dispatchPending();

    assert.equal(repository.disabledSubscriptionIds.length, 1);
    assert.deepEqual(repository.outboxUpdates, [
      { kind: "delivered", id: "outbox-1", providerStatusCode: null }
    ]);
  }
});

test("transient push failures retry with bounded backoff and become dead after five attempts", async () => {
  for (const attemptCount of [0, 4]) {
    const repository = new FakeNotificationRepository();
    const service = createService(repository, {
      async send() {
        throw new WebPushDeliveryError(503);
      }
    });
    await service.saveSubscription("user-1", subscriptionInput);
    repository.claimed.push(createDelivery(attemptCount));

    await service.dispatchPending();

    assert.deepEqual(
      repository.outboxUpdates,
      attemptCount === 4
        ? [{ kind: "dead", id: "outbox-1", code: "push_503" }]
        : [{
            kind: "retry",
            id: "outbox-1",
            code: "push_503",
            nextAttemptAt: new Date("2026-07-14T00:00:30.000Z")
          }]
    );
  }
});

test("retention cleanup uses a strict 90-day notification cutoff", async () => {
  const repository = new FakeNotificationRepository();
  const service = createService(repository);

  await service.cleanupRetention();

  assert.equal(repository.cleanupCutoff?.toISOString(), "2026-04-15T00:00:00.000Z");
});

test("read state cannot be changed through another user's notification id", async () => {
  const repository = new FakeNotificationRepository();
  repository.readOwnerId = "user-1";
  const service = createService(repository);

  await assert.rejects(
    service.markRead("user-2", notification.id),
    (error: unknown) => Boolean(
      error && typeof error === "object" && "code" in error && error.code === "not_found"
    )
  );
});

function createService(
  repository: FakeNotificationRepository,
  pushSender?: {
    send(
      subscription: WebPushSubscriptionInput,
      payload: string
    ): Promise<{ statusCode: number } | void>
  }
) {
  return createDeploymentNotificationService({
    repository,
    cipher: createWebPushSubscriptionCipher({
      current: { id: "v1", secret: Buffer.alloc(32, 0x43).toString("base64url") }
    }),
    createId: () => "subscription-1",
    now: () => now,
    ...(pushSender ? { pushSender } : {})
  });
}

function createDelivery(attemptCount = 0): ClaimedNotificationDelivery {
  return {
    outboxId: "outbox-1",
    userId: "user-1",
    attemptCount,
    notification
  };
}

class FakeNotificationRepository implements NotificationRepository {
  readonly claimed: ClaimedNotificationDelivery[] = [];
  readonly subscriptions: StoredWebPushSubscription[] = [];
  readonly disabledSubscriptionIds: string[] = [];
  readonly outboxUpdates: Array<
    | { kind: "delivered"; id: string; providerStatusCode: number | null }
    | { kind: "retry"; id: string; code: string; nextAttemptAt: Date }
    | { kind: "dead"; id: string; code: string }
  > = [];
  cleanupCutoff: Date | null = null;
  readOwnerId: string | null = null;

  async listInbox() { return { notifications: [notification], unreadCount: 1 }; }
  async listAfter() { return []; }
  async markRead(userId: string) {
    return this.readOwnerId === null || this.readOwnerId === userId ? notification : undefined;
  }
  async markAllRead() { return 1; }
  async upsertSubscription(input: StoredWebPushSubscription) {
    const index = this.subscriptions.findIndex((item) => item.endpointHash === input.endpointHash);
    if (index >= 0) this.subscriptions[index] = input;
    else this.subscriptions.push(input);
    return input;
  }
  async deleteSubscription() { return true; }
  async listActiveSubscriptions(userId: string) {
    return this.subscriptions.filter((item) => item.userId === userId && item.disabledAt === null);
  }
  async disableSubscription(id: string) { this.disabledSubscriptionIds.push(id); }
  async claimPending() { return this.claimed.splice(0); }
  async markDelivered(id: string, _deliveredAt: Date, providerStatusCode: number | null) {
    this.outboxUpdates.push({ kind: "delivered", id, providerStatusCode });
  }
  async markRetry(id: string, nextAttemptAt: Date, code: string) {
    this.outboxUpdates.push({ kind: "retry", id, nextAttemptAt, code });
  }
  async markDead(id: string, code: string) {
    this.outboxUpdates.push({ kind: "dead", id, code });
  }
  async cleanupExpired(cutoff: Date) {
    this.cleanupCutoff = cutoff;
    return { notifications: 0, subscriptions: 0 };
  }
}
