import assert from "node:assert/strict";
import { test } from "node:test";
import { openDeploymentNotification } from "./notification-open";

test("notification navigation starts without waiting for the read request", async () => {
  let finishRead: (() => void) | undefined;
  const readRequest = new Promise<void>((resolve) => {
    finishRead = resolve;
  });
  const events: string[] = [];

  const completion = openDeploymentNotification({
    actionUrl: "/dashboard/projects/project-1",
    close: () => {
      events.push("close");
    },
    markRead: () => {
      events.push("read");
      return readRequest;
    },
    navigate: (href) => {
      events.push(`navigate:${href}`);
    }
  });

  assert.deepEqual(events, [
    "read",
    "close",
    "navigate:/dashboard/projects/project-1"
  ]);

  finishRead?.();
  await completion;
});
