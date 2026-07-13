import assert from "node:assert/strict";
import { test } from "node:test";
import { getGitHubCallbackAuthDecision } from "./github-callback-auth";

test("callback waits while auth is loading and loads only when authenticated", () => {
  assert.deepEqual(getGitHubCallbackAuthDecision(validInput("loading")), {
    kind: "wait"
  });
  assert.deepEqual(getGitHubCallbackAuthDecision(validInput("authenticated")), {
    kind: "load"
  });
});

test("callback redirects unauthenticated users to login with the full internal callback", () => {
  assert.deepEqual(getGitHubCallbackAuthDecision(validInput("unauthenticated")), {
    href: "/login?returnTo=%2Fintegrations%2Fgithub%2Fcallback%3Finstallation_id%3D123%26state%3Dsigned-state",
    kind: "redirect"
  });
});

test("callback reports missing GitHub parameters before auth redirect", () => {
  assert.deepEqual(
    getGitHubCallbackAuthDecision({
      authStatus: "unauthenticated",
      installationId: null,
      returnPath: "/integrations/github/callback",
      state: null
    }),
    { kind: "invalid" }
  );
});

function validInput(authStatus: "loading" | "authenticated" | "unauthenticated") {
  return {
    authStatus,
    installationId: "123",
    returnPath: "/integrations/github/callback?installation_id=123&state=signed-state",
    state: "signed-state"
  } as const;
}
