import assert from "node:assert/strict";
import { test } from "node:test";
import type { DeploymentNotification } from "@sketchcatch/types";
import {
  createNotificationCenterState,
  markAllNotificationsReadLocally,
  markNotificationReadLocally,
  mergeNotification,
  replaceNotificationCenterState
} from "../../components/notifications/notification-center-state";

test("persistent Inbox state deduplicates SSE events and preserves server unread count", () => {
  const first = createNotification("ntf_11111111111111111111111111111111", null);
  const loaded = replaceNotificationCenterState({ notifications: [first], unreadCount: 4 });
  const duplicate = mergeNotification(loaded, first);
  const second = createNotification("ntf_22222222222222222222222222222222", null);
  const next = mergeNotification(duplicate, second);

  assert.equal(duplicate.unreadCount, 4);
  assert.equal(next.unreadCount, 5);
  assert.deepEqual(next.notifications.map((item) => item.id), [second.id, first.id]);
});

test("local read updates are idempotent while the server request is in flight", () => {
  const item = createNotification("ntf_11111111111111111111111111111111", null);
  const state = { notifications: [item], unreadCount: 1 };
  const readAt = "2026-07-14T00:01:00.000Z";
  const read = markNotificationReadLocally(state, item.id, readAt);

  assert.equal(read.unreadCount, 0);
  assert.equal(markNotificationReadLocally(read, item.id, readAt), read);
  assert.equal(markAllNotificationsReadLocally(read, readAt).unreadCount, 0);
  assert.deepEqual(createNotificationCenterState(), { notifications: [], unreadCount: 0 });
});

function createNotification(id: string, readAt: string | null): DeploymentNotification {
  return {
    id,
    projectId: "11111111-1111-4111-8111-111111111111",
    source: "direct_deployment",
    sourceId: "22222222-2222-4222-8222-222222222222",
    status: "succeeded",
    title: "배포 완료",
    body: "Direct · succeeded",
    actionUrl: "/dashboard/projects/11111111-1111-4111-8111-111111111111",
    readAt,
    createdAt: id.includes("2222")
      ? "2026-07-14T00:02:00.000Z"
      : "2026-07-14T00:01:00.000Z"
  };
}
