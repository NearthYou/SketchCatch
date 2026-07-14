import assert from "node:assert/strict";
import { test } from "node:test";

type ProjectThumbnailLoadResult =
  | { readonly state: "cancelled" | "empty" | "error" }
  | { readonly blob: Blob; readonly state: "ready" };

type ProjectThumbnailLoader = (input: {
  readonly fetchThumbnail: (projectId: string) => Promise<Blob | null>;
  readonly isCancelled?: (() => boolean) | undefined;
  readonly maxAttempts?: number | undefined;
  readonly projectId: string;
  readonly retryDelayMs?: number | undefined;
  readonly wait?: ((delayMs: number) => Promise<void>) | undefined;
}) => Promise<ProjectThumbnailLoadResult>;

async function getProjectThumbnailLoader(): Promise<ProjectThumbnailLoader> {
  try {
    const module = await import("./project-thumbnail-loader");
    return module.loadProjectThumbnail;
  } catch (error) {
    assert.fail(`Dashboard thumbnail loader must be available: ${String(error)}`);
  }
}

test("loads a thumbnail that appears during the bounded retry window", async () => {
  const loadProjectThumbnail = await getProjectThumbnailLoader();
  const expectedBlob = new Blob(["board"], { type: "image/webp" });
  const projectIds: string[] = [];
  const retryDelays: number[] = [];

  const result = await loadProjectThumbnail({
    fetchThumbnail: async (projectId) => {
      projectIds.push(projectId);
      return projectIds.length === 3 ? expectedBlob : null;
    },
    projectId: "project-1",
    retryDelayMs: 25,
    wait: async (delayMs) => {
      retryDelays.push(delayMs);
    }
  });

  assert.deepEqual(projectIds, ["project-1", "project-1", "project-1"]);
  assert.deepEqual(retryDelays, [25, 25]);
  assert.deepEqual(result, { blob: expectedBlob, state: "ready" });
});

test("returns the final empty state after bounded missing-thumbnail retries", async () => {
  const loadProjectThumbnail = await getProjectThumbnailLoader();
  let attempts = 0;
  const retryDelays: number[] = [];

  const result = await loadProjectThumbnail({
    fetchThumbnail: async () => {
      attempts += 1;
      return null;
    },
    maxAttempts: 2,
    projectId: "project-2",
    retryDelayMs: 12,
    wait: async (delayMs) => {
      retryDelays.push(delayMs);
    }
  });

  assert.equal(attempts, 2);
  assert.deepEqual(retryDelays, [12]);
  assert.deepEqual(result, { state: "empty" });
});

test("returns the final error state after bounded transient failures", async () => {
  const loadProjectThumbnail = await getProjectThumbnailLoader();
  let attempts = 0;
  const retryDelays: number[] = [];

  const result = await loadProjectThumbnail({
    fetchThumbnail: async () => {
      attempts += 1;
      throw new Error("temporary response failure");
    },
    maxAttempts: 2,
    projectId: "project-3",
    retryDelayMs: 9,
    wait: async (delayMs) => {
      retryDelays.push(delayMs);
    }
  });

  assert.equal(attempts, 2);
  assert.deepEqual(retryDelays, [9]);
  assert.deepEqual(result, { state: "error" });
});

test("does not retry a permanent thumbnail response error", async () => {
  const loadProjectThumbnail = await getProjectThumbnailLoader();
  let attempts = 0;
  const retryDelays: number[] = [];

  const result = await loadProjectThumbnail({
    fetchThumbnail: async () => {
      attempts += 1;
      throw Object.assign(new Error("forbidden"), { status: 403 });
    },
    projectId: "project-403",
    wait: async (delayMs) => {
      retryDelays.push(delayMs);
    }
  });

  assert.equal(attempts, 1);
  assert.deepEqual(retryDelays, []);
  assert.deepEqual(result, { state: "error" });
});

test("stops before a scheduled retry after the Dashboard card unmounts", async () => {
  const loadProjectThumbnail = await getProjectThumbnailLoader();
  let attempts = 0;
  let cancelled = false;

  const result = await loadProjectThumbnail({
    fetchThumbnail: async () => {
      attempts += 1;
      return null;
    },
    isCancelled: () => cancelled,
    projectId: "project-4",
    wait: async () => {
      cancelled = true;
    }
  });

  assert.equal(attempts, 1);
  assert.deepEqual(result, { state: "cancelled" });
});
