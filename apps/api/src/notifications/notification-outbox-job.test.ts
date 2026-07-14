import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import type { createDeploymentNotificationService } from "./deployment-notification-service.js";
import { startNotificationOutboxJob } from "./notification-outbox-job.js";

type NotificationService = ReturnType<typeof createDeploymentNotificationService>;

test("outbox startup dispatches pending events without running retention cleanup immediately", async () => {
  let dispatchCount = 0;
  let cleanupCount = 0;
  const service = {
    async dispatchPending() {
      dispatchCount += 1;
      return { claimed: 0, delivered: 0, retried: 0, dead: 0 };
    },
    async cleanupRetention() {
      cleanupCount += 1;
      return { notifications: 0, subscriptions: 0 };
    }
  } as NotificationService;

  const stop = startNotificationOutboxJob(() => service, {
    intervalMs: 60_000,
    cleanupIntervalMs: 60_000
  });
  await setImmediate();
  stop();

  assert.equal(dispatchCount, 1);
  assert.equal(cleanupCount, 0);
});
