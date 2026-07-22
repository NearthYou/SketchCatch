import assert from "node:assert/strict";
import test from "node:test";
import type { GitCicdHandoff } from "@sketchcatch/types";
import * as workspaceApi from "./api";

test("continues a persisted CI/CD handoff through the setup endpoint", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  let requestedUrl = "";
  let requestedMethod = "";
  let requestedBody = "";
  const expected = { id: "handoff/one", status: "draft" } as GitCicdHandoff;
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedMethod = init?.method ?? "GET";
    requestedBody = String(init?.body ?? "");
    return new Response(JSON.stringify({ handoff: expected }), {
      headers: { "Content-Type": "application/json" },
      status: 200
    });
  };

  const setup = (
    workspaceApi as typeof workspaceApi & {
      readonly setupGitCicdHandoff?: (handoffId: string) => Promise<GitCicdHandoff>;
    }
  ).setupGitCicdHandoff;
  assert.equal(typeof setup, "function", "CI/CD setup client must exist");

  const handoff = await setup("handoff/one");

  assert.match(requestedUrl, /\/git-cicd-handoffs\/handoff%2Fone\/setup$/u);
  assert.equal(requestedMethod, "POST");
  assert.equal(requestedBody, "{}");
  assert.equal(handoff.id, expected.id);
});
