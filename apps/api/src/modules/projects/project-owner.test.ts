import { test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyRequest } from "fastify";
import { resolveProjectOwner } from "./project-owner.js";

const request = {} as FastifyRequest;

test("resolveProjectOwner uses client workspace for anonymous projects", async () => {
  const owner = await resolveProjectOwner(request, undefined, "workspace-1");

  assert.deepEqual(owner, {
    workspaceId: "workspace-1",
    userId: undefined
  });
});

test("resolveProjectOwner prefers authenticated owner over client workspace", async () => {
  const owner = await resolveProjectOwner(
    request,
    () => ({
      workspaceId: "session-workspace",
      userId: "22222222-2222-4222-8222-222222222222"
    }),
    "client-workspace"
  );

  assert.deepEqual(owner, {
    workspaceId: "session-workspace",
    userId: "22222222-2222-4222-8222-222222222222"
  });
});

test("resolveProjectOwner derives a compatibility workspace from authenticated user id", async () => {
  const owner = await resolveProjectOwner(request, () => ({ userId: "22222222-2222-4222-8222-222222222222" }));

  assert.deepEqual(owner, {
    workspaceId: "user:22222222-2222-4222-8222-222222222222",
    userId: "22222222-2222-4222-8222-222222222222"
  });
});
