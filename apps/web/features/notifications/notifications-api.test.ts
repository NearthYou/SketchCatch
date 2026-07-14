import assert from "node:assert/strict";
import { test } from "node:test";
import { clearStoredAuthSession, writeStoredAuthSession } from "../../lib/auth-storage";
import { streamDeploymentNotifications } from "../../lib/notifications-api";

test("notification stream sends authentication and parses one SSE notification", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  t.after(() => {
    globalThis.fetch = originalFetch;
    clearStoredAuthSession();
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  writeStoredAuthSession({ accessToken: "access-token", expiresInSeconds: 3600 });
  const received: unknown[] = [];
  let authorization: string | null = null;
  globalThis.fetch = async (_input, init) => {
    authorization = new Headers(init?.headers).get("authorization");
    const payload = {
      id: "ntf_11111111111111111111111111111111",
      projectId: "11111111-1111-4111-8111-111111111111",
      source: "gitops_pipeline",
      sourceId: "22222222-2222-4222-8222-222222222222",
      status: "failed",
      title: "배포 실패",
      body: "GitOps · failed",
      actionUrl: "/dashboard/projects/11111111-1111-4111-8111-111111111111",
      readAt: null,
      createdAt: "2026-07-14T00:00:00.000Z"
    };
    return new Response(
      `id: ${payload.id}\nevent: notification\ndata: ${JSON.stringify(payload)}\n\n`,
      { status: 200, headers: { "Content-Type": "text/event-stream" } }
    );
  };

  await streamDeploymentNotifications({
    signal: new AbortController().signal,
    onNotification: (value) => received.push(value)
  });

  assert.equal(authorization, "Bearer access-token");
  assert.equal(received.length, 1);
  assert.equal((received[0] as { status: string }).status, "failed");
});
