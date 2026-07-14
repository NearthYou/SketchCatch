import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const component = readFileSync(
  new URL("../../components/notifications/DeploymentNotificationCenter.tsx", import.meta.url),
  "utf8"
);
const serviceWorker = readFileSync(
  new URL("../../public/notification-sw.js", import.meta.url),
  "utf8"
);

test("Web Push permission and service worker registration require an explicit click", () => {
  assert.match(component, /onClick=\{\(\) => void enablePush\(\)\}/);
  assert.match(component, /window\.Notification\.requestPermission\(\)/);
  assert.match(component, /navigator\.serviceWorker\.register\("\/notification-sw\.js"/);
  assert.doesNotMatch(component, /useEffect\(\(\) => \{\s*void enablePush\(\)/);
});

test("durable Inbox never uses browser storage as the notification source of truth", () => {
  assert.doesNotMatch(component, /localStorage|sessionStorage/);
  assert.match(component, /listDeploymentNotifications\(\)/);
  assert.match(component, /streamDeploymentNotifications/);
  assert.match(component, /markDeploymentNotificationRead/);
});

test("service worker accepts only bounded same-product notification actions", () => {
  assert.match(serviceWorker, /\^\\\/dashboard\\\/projects/);
  assert.match(serviceWorker, /showNotification/);
  assert.match(serviceWorker, /tag: payload\.notificationId/);
  assert.doesNotMatch(serviceWorker, /console\.|localStorage|sessionStorage/);
});
