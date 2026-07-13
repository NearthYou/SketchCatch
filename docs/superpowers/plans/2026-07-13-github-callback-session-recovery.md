# GitHub Callback Session Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GitHub App callback이 인증 복구를 기다리고, 복구 실패 시 로그인 후 같은 callback으로 안전하게 돌아오게 한다.

**Architecture:** `AuthProvider`의 상태를 callback 요청 gate로 사용하고, callback 전용 순수 decision helper가 대기·조회·로그인 이동을 결정한다. API client는 refresh 400/401을 `null`로 지우지 않고 원래 `ApiClientError`로 전달하며 기존 single-flight promise는 유지한다.

**Tech Stack:** Next.js App Router, React, TypeScript, Node.js test runner, Fastify API error contract

## Global Constraints

- access token은 런타임 메모리에만 저장하고 refresh token은 기존 `HttpOnly`, `SameSite=Lax` cookie 계약을 유지한다.
- refresh token, callback URL, GitHub state를 Web Storage나 DB에 새로 저장하지 않는다.
- `returnTo`는 기존 `getSafeReturnPath`가 허용하는 SketchCatch 내부 경로만 사용한다.
- DB schema, shared DTO, GitHub App 권한 모델은 변경하지 않는다.
- 현재 브랜치에서 작업하고 기존 Terraform 및 Live Observation 변경은 수정하거나 커밋하지 않는다.

---

## File Map

- Create `apps/web/features/auth/github-callback-auth.ts`: callback의 인증 상태와 query를 대기·조회·로그인 이동 결정으로 변환한다.
- Create `apps/web/features/auth/github-callback-auth.test.ts`: callback decision helper의 실제 동작을 검증한다.
- Modify `apps/web/app/integrations/github/callback/page.tsx`: `AuthProvider` 상태를 기다리고 helper 결정에 따라 API 호출 또는 로그인 이동을 수행한다.
- Modify `apps/web/features/workspace/github-callback-route.test.ts`: callback page가 인증 gate와 안전한 login return flow를 사용하는지 회귀 검증한다.
- Modify `apps/web/lib/api-client.ts`: refresh 400/401 응답의 `ApiClientError`를 보존한다.
- Modify `apps/web/features/workspace/api-client-auth-session.test.ts`: refresh 오류 전달과 single-flight 동시성 회귀를 검증한다.
- Modify `docs/data-models.md`: 외부 redirect 후 인증 복구와 callback `returnTo` 계약을 기록한다.
- Modify `agent-progress.md`: 구현 결과와 실제 검증 명령을 기록한다.

### Task 1: Preserve Refresh Failures

**Files:**
- Modify: `apps/web/features/workspace/api-client-auth-session.test.ts`
- Modify: `apps/web/lib/api-client.ts`

**Interfaces:**
- Consumes: `apiFetch<T>(path, { auth: true })`, `ApiClientError`, module-level `refreshSessionPromise`.
- Produces: refresh 400/401가 원래 status, error code, message를 가진 `ApiClientError` rejection으로 전달되는 계약.

- [ ] **Step 1: Write the failing refresh-error test**

```ts
test("authenticated requests expose the refresh failure instead of the original 401", async (context) => {
  const restore = installBrowserGlobals("sketchcatch_csrf_token=csrf-token");
  const requests: string[] = [];

  context.after(() => {
    clearStoredAuthSession();
    restore();
  });

  globalThis.fetch = async (input) => {
    requests.push(String(input));
    if (String(input).endsWith("/auth/refresh")) {
      return Response.json(
        { error: "unauthorized", message: "로그인 세션이 만료되었습니다. 다시 로그인해주세요." },
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

function installBrowserGlobals(cookie: string): () => void {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");

  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { cookie }
  });
  clearStoredAuthSession();

  return () => {
    globalThis.fetch = originalFetch;
    restoreGlobal("window", originalWindow);
    restoreGlobal("document", originalDocument);
  };
}

function restoreGlobal(name: "window" | "document", descriptor: PropertyDescriptor | undefined) {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else Reflect.deleteProperty(globalThis, name);
}
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm --dir apps/web exec tsx --test features/workspace/api-client-auth-session.test.ts`

Expected: FAIL because the request rejects with the original `Authentication required` response.

- [ ] **Step 3: Preserve the refresh response error**

Replace the 400/401 branch in `refreshStoredSession()` with:

```ts
if (response.status === 400 || response.status === 401) {
  clearStoredAuthSession();
  throw await toApiClientError(response);
}
```

- [ ] **Step 4: Add and verify the single-flight regression**

```ts
test("concurrent authenticated requests share one refresh request", async (context) => {
  const restore = installBrowserGlobals("sketchcatch_csrf_token=csrf-token");
  let refreshRequestCount = 0;

  context.after(() => {
    clearStoredAuthSession();
    restore();
  });

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/auth/refresh")) {
      refreshRequestCount += 1;
      return Response.json({
        user: { id: "user-1" },
        session: { accessToken: "refreshed-access-token", expiresInSeconds: 900 }
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
```

Run: `pnpm --dir apps/web exec tsx --test features/workspace/api-client-auth-session.test.ts`

Expected: PASS with all tests in the file passing and refresh request count equal to 1.

- [ ] **Step 5: Commit Task 1**

```bash
git add apps/web/lib/api-client.ts apps/web/features/workspace/api-client-auth-session.test.ts
git commit -m "Fix: refresh 인증 오류 보존"
```

### Task 2: Gate the GitHub Callback on Authentication

**Files:**
- Create: `apps/web/features/auth/github-callback-auth.ts`
- Create: `apps/web/features/auth/github-callback-auth.test.ts`
- Modify: `apps/web/app/integrations/github/callback/page.tsx`
- Modify: `apps/web/features/workspace/github-callback-route.test.ts`

**Interfaces:**
- Consumes: `AuthContextValue.status`, callback `installation_id`, callback `state`, and the current internal path including query.
- Produces: `getGitHubCallbackAuthDecision(input): GitHubCallbackAuthDecision` with `invalid`, `wait`, `load`, or `redirect` decisions.

- [ ] **Step 1: Write failing decision tests**

```ts
test("callback waits while auth is loading and loads only when authenticated", () => {
  assert.deepEqual(getGitHubCallbackAuthDecision(validInput("loading")), { kind: "wait" });
  assert.deepEqual(getGitHubCallbackAuthDecision(validInput("authenticated")), { kind: "load" });
});

test("callback redirects unauthenticated users to login with the full internal callback", () => {
  assert.deepEqual(getGitHubCallbackAuthDecision(validInput("unauthenticated")), {
    kind: "redirect",
    href: "/login?returnTo=%2Fintegrations%2Fgithub%2Fcallback%3Finstallation_id%3D123%26state%3Dsigned-state"
  });
});

test("callback reports missing GitHub parameters before auth redirect", () => {
  assert.deepEqual(
    getGitHubCallbackAuthDecision({
      authStatus: "unauthenticated",
      installationId: null,
      state: null,
      returnPath: "/integrations/github/callback"
    }),
    { kind: "invalid" }
  );
});

function validInput(authStatus: "loading" | "authenticated" | "unauthenticated") {
  return {
    authStatus,
    installationId: "123",
    state: "signed-state",
    returnPath:
      "/integrations/github/callback?installation_id=123&state=signed-state"
  } as const;
}
```

- [ ] **Step 2: Run helper tests and verify RED**

Run: `pnpm --dir apps/web exec tsx --test features/auth/github-callback-auth.test.ts`

Expected: FAIL because `github-callback-auth.ts` and its exported function do not exist.

- [ ] **Step 3: Implement the minimal decision helper**

```ts
export type GitHubCallbackAuthDecision =
  | { readonly kind: "invalid" }
  | { readonly kind: "wait" }
  | { readonly kind: "load" }
  | { readonly href: string; readonly kind: "redirect" };

export function getGitHubCallbackAuthDecision(input: {
  readonly authStatus: "loading" | "authenticated" | "unauthenticated";
  readonly installationId: string | null;
  readonly state: string | null;
  readonly returnPath: string;
}): GitHubCallbackAuthDecision {
  if (!input.installationId?.trim() || !input.state?.trim()) return { kind: "invalid" };
  if (input.authStatus === "loading") return { kind: "wait" };
  if (input.authStatus === "unauthenticated") {
    return {
      kind: "redirect",
      href: `/login?${new URLSearchParams({ returnTo: input.returnPath }).toString()}`
    };
  }
  return { kind: "load" };
}
```

- [ ] **Step 4: Integrate the decision with the callback page**

```ts
const { status: authStatus } = useAuth();

useEffect(() => {
  let cancelled = false;

  async function loadRepositories(): Promise<void> {
    const searchParams = new URLSearchParams(window.location.search);
    const installationId = searchParams.get("installation_id")?.trim() ?? null;
    const state = searchParams.get("state")?.trim() ?? null;
    const decision = getGitHubCallbackAuthDecision({
      authStatus,
      installationId,
      state,
      returnPath: `${window.location.pathname}${window.location.search}`
    });

    if (decision.kind === "invalid") {
      setCallbackState({
        status: "error",
        message: "GitHub 연결 정보가 없습니다. Repository 시작 화면에서 다시 연결해주세요."
      });
      return;
    }
    if (decision.kind === "wait") return;
    if (decision.kind === "redirect") {
      router.replace(decision.href);
      return;
    }

    try {
      const result = await listGitHubInstallationRepositories({ installationId, state });
      if (cancelled) return;
      setCallbackState({
        installationId,
        projectId: result.projectId,
        repositories: result.repositories,
        state,
        status: "ready"
      });
    } catch (error) {
      if (cancelled) return;
      setCallbackState({
        status: "error",
        message: getApiErrorMessage(error, "Repository 목록을 불러오지 못했습니다.")
      });
    }
  }

  void loadRepositories();
  return () => {
    cancelled = true;
  };
}, [authStatus, router]);
```

- [ ] **Step 5: Strengthen callback source-contract coverage**

```ts
assert.match(source, /useAuth/);
assert.match(source, /getGitHubCallbackAuthDecision/);
assert.match(source, /router\.replace\(decision\.href\)/);
assert.match(source, /decision\.kind === "wait"/);
assert.match(source, /listGitHubInstallationRepositories/);
```

Run: `pnpm --dir apps/web exec tsx --test features/auth/github-callback-auth.test.ts features/workspace/github-callback-route.test.ts features/auth/return-path.test.ts features/auth/login-page.test.ts`

Expected: PASS for helper behavior, callback integration, and existing safe `returnTo` handling.

- [ ] **Step 6: Commit Task 2**

```bash
git add apps/web/features/auth/github-callback-auth.ts apps/web/features/auth/github-callback-auth.test.ts apps/web/app/integrations/github/callback/page.tsx apps/web/features/workspace/github-callback-route.test.ts
git commit -m "Fix: GitHub callback 인증 복구 대기"
```

### Task 3: Document and Verify the Complete Flow

**Files:**
- Modify: `docs/data-models.md`
- Modify: `agent-progress.md`

**Interfaces:**
- Consumes: the implemented refresh error and callback decision contracts.
- Produces: canonical documentation and reproducible verification evidence.

- [ ] **Step 1: Update the auth contract documentation**

Append to the existing auth-session paragraph in `docs/data-models.md`:

```md
GitHub App처럼 외부 origin을 왕복하는 callback 화면은 `AuthProvider`의 refresh 복구가 끝나기 전에 보호 API를 호출하지 않는다. 복구할 수 없으면 현재 내부 callback path와 query를 안전한 `returnTo`로 로그인에 전달하고, 로그인 성공 후 같은 callback을 다시 처리한다. refresh API의 인증 오류는 최초 보호 API 401로 덮어쓰지 않는다.
```

- [ ] **Step 2: Run focused verification**

Run:

```bash
pnpm --dir apps/web exec tsx --test features/workspace/api-client-auth-session.test.ts features/auth/github-callback-auth.test.ts features/workspace/github-callback-route.test.ts features/auth/return-path.test.ts features/auth/login-page.test.ts
pnpm --dir apps/api exec tsx --test src/routes/auth.scenarios.test.ts src/routes/source-repositories.test.ts
```

Expected: all selected Web and API tests pass.

- [ ] **Step 3: Run repository-required verification**

Run:

```bash
pnpm harness:check
pnpm lint
pnpm typecheck
pnpm build
git diff --check
```

Expected: commands exit 0. Any pre-existing unrelated warning or baseline failure must be recorded without claiming it was fixed.

- [ ] **Step 4: Update progress evidence**

Add an English-only session entry to `agent-progress.md` naming the GitHub callback session recovery behavior, the focused tests, and the required checks actually run. Do not change the unrelated `LIVE-OBSERVATION-V2-001` tracker state.

- [ ] **Step 5: Commit Task 3 documentation**

```bash
git add docs/data-models.md
git commit -m "Docs: GitHub callback 복구 검증 기록"
```

Leave `agent-progress.md` unstaged because it already contains unrelated worktree changes; report that preservation explicitly in the handoff.
