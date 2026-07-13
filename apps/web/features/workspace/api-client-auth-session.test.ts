import { test } from "node:test";
import assert from "node:assert/strict";
import {
  apiFetch,
  ApiClientError,
  hasRefreshSessionCookieHint,
  refreshAuthSession
} from "../../lib/api-client";
import { clearStoredAuthSession } from "../../lib/auth-storage";

test("hasRefreshSessionCookieHint is false without a browser document", (context) => {
  const originalDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document");

  context.after(() => {
    restoreDocument(originalDocumentDescriptor);
  });

  Reflect.deleteProperty(globalThis, "document");

  assert.equal(hasRefreshSessionCookieHint(), false);
});

test("hasRefreshSessionCookieHint only depends on the readable CSRF cookie", (context) => {
  const originalDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document");

  context.after(() => {
    restoreDocument(originalDocumentDescriptor);
  });

  setDocumentCookie("unrelated=value; sketchcatch_csrf_token=csrf-token");
  assert.equal(hasRefreshSessionCookieHint(), true);

  setDocumentCookie("unrelated=value");
  assert.equal(hasRefreshSessionCookieHint(), false);
});

test("authenticated requests expose the refresh failure instead of the original 401", async (context) => {
  const restoreBrowserGlobals = installBrowserGlobals(
    "sketchcatch_csrf_token=csrf-token"
  );
  const requests: string[] = [];

  context.after(() => {
    clearStoredAuthSession();
    restoreBrowserGlobals();
  });

  globalThis.fetch = async (input) => {
    requests.push(String(input));

    if (String(input).endsWith("/auth/refresh")) {
      return Response.json(
        {
          error: "unauthorized",
          message: "로그인 세션이 만료되었습니다. 다시 로그인해주세요."
        },
        { status: 401 }
      );
    }

    return Response.json(
      { error: "unauthorized", message: "Authentication required" },
      { status: 401 }
    );
  };

  await assert.rejects(
    () => apiFetch("/projects", { auth: true }),
    (error: unknown) =>
      error instanceof ApiClientError &&
      error.message === "로그인 세션이 만료되었습니다. 다시 로그인해주세요."
  );
  assert.deepEqual(requests, ["/api/projects", "/api/auth/refresh"]);
});

test("concurrent authenticated requests share one refresh request", async (context) => {
  const restoreBrowserGlobals = installBrowserGlobals(
    "sketchcatch_csrf_token=csrf-token"
  );
  let refreshRequestCount = 0;

  context.after(() => {
    clearStoredAuthSession();
    restoreBrowserGlobals();
  });

  globalThis.fetch = async (input, init) => {
    const url = String(input);

    if (url.endsWith("/auth/refresh")) {
      refreshRequestCount += 1;

      return Response.json({
        session: {
          accessToken: "refreshed-access-token",
          expiresInSeconds: 900
        },
        user: {
          createdAt: "2026-07-13T00:00:00.000Z",
          email: "user@example.com",
          id: "user-1",
          nickname: "User",
          username: "user"
        }
      });
    }

    const authorization = new Headers(init?.headers).get("authorization");

    if (!authorization) {
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    return Response.json({ projects: [] });
  };

  const results = await Promise.all([
    apiFetch<{ projects: unknown[] }>("/projects", { auth: true }),
    apiFetch<{ projects: unknown[] }>("/projects", { auth: true })
  ]);

  assert.equal(refreshRequestCount, 1);
  assert.deepEqual(results, [{ projects: [] }, { projects: [] }]);
});

test("auth bootstrap and an authenticated retry share one refresh request", async (context) => {
  const restoreBrowserGlobals = installBrowserGlobals(
    "sketchcatch_csrf_token=csrf-token"
  );
  let refreshRequestCount = 0;
  const refreshResponse = createDeferred<Response>();
  let markInitialProtectedRequest: (() => void) | null = null;
  const initialProtectedRequest = new Promise<void>((resolve) => {
    markInitialProtectedRequest = resolve;
  });

  context.after(() => {
    clearStoredAuthSession();
    restoreBrowserGlobals();
  });

  globalThis.fetch = async (input, init) => {
    const url = String(input);

    if (url.endsWith("/auth/refresh")) {
      refreshRequestCount += 1;
      return refreshResponse.promise;
    }

    const authorization = new Headers(init?.headers).get("authorization");

    if (!authorization) {
      markInitialProtectedRequest?.();

      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    return Response.json({ projects: [] });
  };

  const authBootstrap = refreshAuthSession();
  const authenticatedRequest = apiFetch<{ projects: unknown[] }>("/projects", {
    auth: true
  });

  await initialProtectedRequest;
  await Promise.resolve();
  assert.equal(refreshRequestCount, 1);
  refreshResponse.resolve(
    Response.json({
      session: {
        accessToken: "refreshed-access-token",
        expiresInSeconds: 900
      },
      user: {
        createdAt: "2026-07-13T00:00:00.000Z",
        email: "user@example.com",
        id: "user-1",
        nickname: "User",
        username: "user"
      }
    })
  );

  const [session, projects] = await Promise.all([authBootstrap, authenticatedRequest]);

  assert.equal(session?.accessToken, "refreshed-access-token");
  assert.deepEqual(projects, { projects: [] });
  assert.equal(refreshRequestCount, 1);
});

function setDocumentCookie(cookie: string): void {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      cookie
    }
  });
}

function restoreDocument(descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) {
    Object.defineProperty(globalThis, "document", descriptor);
    return;
  }

  Reflect.deleteProperty(globalThis, "document");
}

function installBrowserGlobals(cookie: string): () => void {
  const originalFetch = globalThis.fetch;
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document");

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {}
  });
  setDocumentCookie(cookie);
  clearStoredAuthSession();

  return () => {
    globalThis.fetch = originalFetch;
    restoreGlobal("window", originalWindowDescriptor);
    restoreGlobal("document", originalDocumentDescriptor);
  };
}

function restoreGlobal(
  name: "window" | "document",
  descriptor: PropertyDescriptor | undefined
): void {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor);
    return;
  }

  Reflect.deleteProperty(globalThis, name);
}

function createDeferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolvePromise!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return { promise, resolve: resolvePromise };
}
