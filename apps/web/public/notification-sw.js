"use strict";
/* global self, URL */

self.addEventListener("push", (event) => {
  event.waitUntil(showPushNotification(event));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const actionUrl = safeActionUrl(event.notification.data?.actionUrl);
  event.waitUntil(focusOrOpen(actionUrl));
});

async function showPushNotification(event) {
  let payload;
  try {
    payload = event.data?.json();
  } catch {
    return;
  }
  if (!isSafePayload(payload)) return;
  await self.registration.showNotification(payload.title, {
    body: payload.body,
    tag: payload.notificationId,
    icon: "/favicon.png",
    data: { actionUrl: payload.actionUrl }
  });
}

async function focusOrOpen(actionUrl) {
  const target = new URL(actionUrl, self.location.origin).href;
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of windows) {
    if ("navigate" in client) await client.navigate(target);
    if ("focus" in client) return client.focus();
  }
  return self.clients.openWindow(target);
}

function isSafePayload(value) {
  return Boolean(
    value &&
    /^ntf_[a-f\d]{32}$/.test(value.notificationId) &&
    typeof value.title === "string" && value.title.length <= 120 &&
    typeof value.body === "string" && value.body.length <= 500 &&
    safeActionUrl(value.actionUrl) === value.actionUrl
  );
}

function safeActionUrl(value) {
  return typeof value === "string" && /^\/dashboard\/projects\/[0-9a-f-]{36}$/.test(value)
    ? value
    : "/dashboard";
}
