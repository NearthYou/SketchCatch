import { test } from "node:test";
import assert from "node:assert/strict";
import { listProjects } from "./api";
import type { Project } from "../../../../packages/types/src";

const project: Project = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  name: "Learning VPC",
  description: "VPC practice",
  createdAt: "2026-06-24T01:00:00.000Z",
  updatedAt: "2026-06-24T02:00:00.000Z"
};

test("listProjects fetches projects for the authenticated user", async (context) => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit | undefined }> = [];

  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (input, init) => {
    requests.push({ input, init });

    return new Response(JSON.stringify({ projects: [project] }), {
      headers: {
        "Content-Type": "application/json"
      },
      status: 200
    });
  };

  const projects = await listProjects();

  assert.equal(String(requests[0]?.input), "/api/projects");
  assert.equal(requests[0]?.init?.method, undefined);
  assert.deepEqual(projects, [project]);
});
