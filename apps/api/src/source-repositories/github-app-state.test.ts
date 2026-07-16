import assert from "node:assert/strict";
import test from "node:test";
import { createGitHubAppState, verifyGitHubAppState } from "./github-app-state.js";

const stateSecret = "github-app-state-secret-at-least-thirty-two-characters";
const issuedAt = new Date("2026-07-15T00:00:00.000Z");
const now = () => issuedAt;

test("GitHub App state round-trips account scope without a project", async () => {
  const { state } = await createGitHubAppState({
    scope: "account",
    userId: "user-1",
    secret: stateSecret,
    now,
    generateNonce: () => "nonce-1"
  });

  assert.deepEqual(await verifyGitHubAppState({ state, secret: stateSecret, now }), {
    scope: "account",
    userId: "user-1",
    nonce: "nonce-1",
    expiresAt: new Date("2026-07-15T00:10:00.000Z")
  });
});

test("GitHub App state keeps the project id only for project scope", async () => {
  const { state } = await createGitHubAppState({
    scope: "project",
    projectId: "project-1",
    userId: "user-1",
    secret: stateSecret,
    now,
    generateNonce: () => "nonce-2"
  });

  assert.deepEqual(await verifyGitHubAppState({ state, secret: stateSecret, now }), {
    scope: "project",
    projectId: "project-1",
    userId: "user-1",
    nonce: "nonce-2",
    expiresAt: new Date("2026-07-15T00:10:00.000Z")
  });
});

test("GitHub App project state binds the analyzed Repository and resume key", async () => {
  const { state } = await createGitHubAppState({
    scope: "project",
    projectId: "project-1",
    userId: "user-1",
    targetRepository: { owner: "NearthYou", name: "SketchCatch" },
    resumeKey: "resume-12345678",
    secret: stateSecret,
    now,
    generateNonce: () => "nonce-target"
  });

  const payload = await verifyGitHubAppState({ state, secret: stateSecret, now });
  assert.equal(payload.scope, "project");

  if (payload.scope !== "project") {
    assert.fail("project scope expected");
  }

  assert.deepEqual(payload.targetRepository, { owner: "nearthyou", name: "sketchcatch" });
  assert.equal(payload.resumeKey, "resume-12345678");
});
