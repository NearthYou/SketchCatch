import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getGitHubCallbackAuthDecision,
  getOrCreateGitHubCallbackRepositoryRequest
} from "./github-callback-auth";

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

test("callback effect replays share the active repository request", async () => {
  let loadCount = 0;
  const load = async () => {
    loadCount += 1;
    return ["repository"];
  };
  const firstRequest = getOrCreateGitHubCallbackRepositoryRequest(null, "123:signed-state", load);
  const replayedRequest = getOrCreateGitHubCallbackRepositoryRequest(
    firstRequest,
    "123:signed-state",
    load
  );

  assert.strictEqual(replayedRequest, firstRequest);
  assert.equal(loadCount, 1);
  assert.deepEqual(await replayedRequest.promise, ["repository"]);
});

function validInput(authStatus: "loading" | "authenticated" | "unauthenticated") {
  return {
    authStatus,
    installationId: "123",
    returnPath: "/integrations/github/callback?installation_id=123&state=signed-state",
    state: "signed-state"
  } as const;
}
