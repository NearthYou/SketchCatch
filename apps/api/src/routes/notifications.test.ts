import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import Fastify from "fastify";
import type { DeploymentNotification, WebPushSubscriptionInput } from "@sketchcatch/types";
import type { createDeploymentNotificationService } from "../notifications/deployment-notification-service.js";
import { registerNotificationRoutes } from "./notifications.js";

const notification: DeploymentNotification = {
  id: "ntf_11111111111111111111111111111111",
  projectId: "11111111-1111-4111-8111-111111111111",
  source: "direct_deployment",
  sourceId: "22222222-2222-4222-8222-222222222222",
  status: "succeeded",
  title: "배포 완료",
  body: "Direct · 22222222 · succeeded",
  actionUrl: "/dashboard/projects/11111111-1111-4111-8111-111111111111",
  readAt: null,
  createdAt: "2026-07-14T00:00:00.000Z"
};

test("notification routes expose a persistent Inbox and read state", async (t) => {
  const service = createFakeService();
  const app = await buildApp(service.value);
  t.after(() => app.close());

  const listed = await app.inject({ method: "GET", url: "/api/notifications?limit=20" });
  assert.equal(listed.statusCode, 200);
  assert.deepEqual(listed.json(), { notifications: [notification], unreadCount: 1 });

  const read = await app.inject({
    method: "PATCH",
    url: `/api/notifications/${notification.id}/read`
  });
  assert.equal(read.statusCode, 200);
  assert.equal(read.json().notification.id, notification.id);
  assert.deepEqual(service.readIds, [notification.id]);

  const all = await app.inject({ method: "POST", url: "/api/notifications/read-all" });
  assert.equal(all.statusCode, 200);
  assert.deepEqual(all.json(), { updatedCount: 3 });
});

test("notification SSE sends authenticated events with no-store headers", async (t) => {
  const service = createFakeService();
  const app = await buildApp(service.value);
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/api/notifications/stream?once=true"
  });

  assert.equal(response.statusCode, 200);
  assert.match(String(response.headers["content-type"]), /text\/event-stream/);
  assert.match(String(response.headers["cache-control"]), /no-store/);
  assert.match(response.body, new RegExp(`id: ${notification.id}`));
  assert.match(response.body, /event: notification/);
  assert.match(response.body, /"status":"succeeded"/);
});

test("notification SSE stays open when there are no immediate events", async (t) => {
  const service = createFakeService();
  service.afterNotifications = [];
  const app = await buildApp(service.value);
  const controller = new AbortController();
  t.after(() => controller.abort());
  t.after(() => app.close());
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address() as AddressInfo;

  const response = await fetch(`http://127.0.0.1:${address.port}/api/notifications/stream`, {
    signal: controller.signal
  });
  assert.equal(response.status, 200);
  assert.ok(response.body);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const connected = await reader.read();
  assert.equal(connected.done, false);
  assert.match(decoder.decode(connected.value), /: connected/);

  const result = await Promise.race([
    reader.read().then((chunk) => (chunk.done ? "closed" : "chunk")),
    new Promise<"open">((resolve) => setTimeout(() => resolve("open"), 250))
  ]);
  assert.equal(result, "open");
  controller.abort();
  reader.releaseLock();
});

test("notification SSE closes cleanly when its first post-hijack database read fails", async (t) => {
  const service = createFakeService();
  const failingService = {
    ...service.value,
    async listAfter() { throw new Error("database unavailable"); }
  } as ReturnType<typeof createDeploymentNotificationService>;
  const app = await buildApp(failingService);
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/api/notifications/stream?once=true"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, ": connected\n\n");
});

test("Web Push routes expose only the public VAPID key and reject unsafe subscriptions", async (t) => {
  const service = createFakeService();
  const app = await buildApp(service.value);
  t.after(() => app.close());

  const config = await app.inject({ method: "GET", url: "/api/notifications/push-config" });
  assert.deepEqual(config.json(), { enabled: true, vapidPublicKey: "public-vapid-key" });

  const unsafe = await app.inject({
    method: "PUT",
    url: "/api/notifications/push-subscription",
    payload: {
      endpoint: "http://push.example.test/secret",
      expirationTime: null,
      keys: { auth: "auth-value", p256dh: "p256dh-value" }
    }
  });
  assert.equal(unsafe.statusCode, 400);

  const invalidExpiration = await app.inject({
    method: "PUT",
    url: "/api/notifications/push-subscription",
    payload: {
      endpoint: "https://push.example.test/secret",
      expirationTime: Number.MAX_SAFE_INTEGER,
      keys: { auth: "auth-value", p256dh: "p256dh-value" }
    }
  });
  assert.equal(invalidExpiration.statusCode, 400);

  const valid: WebPushSubscriptionInput = {
    endpoint: "https://push.example.test/secret",
    expirationTime: null,
    keys: { auth: "auth-value", p256dh: "p256dh-value" }
  };
  const saved = await app.inject({
    method: "PUT",
    url: "/api/notifications/push-subscription",
    payload: valid
  });
  assert.equal(saved.statusCode, 200);
  assert.deepEqual(saved.json(), { subscriptionId: "subscription-1", expiresAt: null });
  assert.deepEqual(service.savedSubscriptions, [valid]);
});

async function buildApp(
  service: ReturnType<typeof createDeploymentNotificationService>
) {
  const app = Fastify();
  await app.register(registerNotificationRoutes, {
    prefix: "/api",
    createService: () => service,
    pushConfig: { enabled: true, vapidPublicKey: "public-vapid-key" },
    requireUserId: async () => "user-1"
  });
  return app;
}

function createFakeService() {
  const readIds: string[] = [];
  const savedSubscriptions: WebPushSubscriptionInput[] = [];
  let afterNotifications = [notification];
  const value = {
    async listInbox() { return { notifications: [notification], unreadCount: 1 }; },
    async listAfter() { return afterNotifications; },
    async markRead(_userId: string, notificationId: string) {
      readIds.push(notificationId);
      return notification;
    },
    async markAllRead() { return 3; },
    async saveSubscription(_userId: string, input: WebPushSubscriptionInput) {
      savedSubscriptions.push(input);
      return {
        id: "subscription-1",
        userId: "user-1",
        endpointHash: "a".repeat(64),
        encryptedPayload: "encrypted",
        keyVersion: "v1",
        expiresAt: null,
        failureCount: 0,
        disabledAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    },
    async deleteSubscription() { return true; },
    async dispatchPending() { return { claimed: 0, delivered: 0, retried: 0, dead: 0 }; },
    async cleanupRetention() { return { notifications: 0, subscriptions: 0 }; }
  } as ReturnType<typeof createDeploymentNotificationService>;
  return {
    value,
    readIds,
    savedSubscriptions,
    get afterNotifications() {
      return afterNotifications;
    },
    set afterNotifications(value: DeploymentNotification[]) {
      afterNotifications = value;
    }
  };
}
