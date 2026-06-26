import { test } from "node:test";
import assert from "node:assert/strict";
import { listProjects, saveProjectDraft } from "./api";
import { clearStoredAuthSession, writeStoredAuthSession } from "../../lib/auth-storage";
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
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit | undefined }> = [];

  context.after(() => {
    globalThis.fetch = originalFetch;
    clearStoredAuthSession();
    restoreWindow(originalWindowDescriptor);
  });

  installAuthSession();

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
  assert.equal(new Headers(requests[0]?.init?.headers).get("authorization"), "Bearer access-token");
  assert.deepEqual(projects, [project]);
});

test("saveProjectDraft sends authenticated PUT request with diagram json", async (context) => {
  const originalFetch = globalThis.fetch;
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit | undefined }> = [];

  context.after(() => {
    globalThis.fetch = originalFetch;
    clearStoredAuthSession();
    restoreWindow(originalWindowDescriptor);
  });

  installAuthSession();

  globalThis.fetch = async (input, init) => {
    requests.push({ input, init });

    return new Response(JSON.stringify({ draft: null }), {
      headers: {
        "Content-Type": "application/json"
      },
      status: 200
    });
  };

  await saveProjectDraft({
    projectId: project.id,
    diagramJson: {
      nodes: [],
      edges: [],
      viewport: {
        x: 0,
        y: 0,
        zoom: 1
      }
    }
  });

  assert.equal(String(requests[0]?.input), `/api/projects/${project.id}/draft`);
  assert.equal(requests[0]?.init?.method, "PUT");
  assert.equal(new Headers(requests[0]?.init?.headers).get("authorization"), "Bearer access-token");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    diagramJson: {
      nodes: [],
      edges: [],
      viewport: {
        x: 0,
        y: 0,
        zoom: 1
      }
    }
  });
});

function installAuthSession(): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {}
  });

  writeStoredAuthSession({
    accessToken: "access-token",
    expiresInSeconds: 3600
  });
}

function restoreWindow(descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) {
    Object.defineProperty(globalThis, "window", descriptor);
    return;
  }

  Reflect.deleteProperty(globalThis, "window");
}
